// Jira mode on the start screen: one narrow column of numbered steps, in the
// order they are done — settings, people, site, period, projects — then Start,
// with the reason when it can't start yet; then the columns to check, Build
// Excel, and the Excel.
import { h, icon, xlsxIcon } from '../dom.js';
import { plural } from '../../core/format.js';
import { previousMonth, periodLabel } from '../../core/period.js';
import { bookmarkletUrl, bookmarkletSource } from '../../core/bridge.js';
import { groupOf, projectsInFile } from '../../core/project-groups.js';
import { rosterGroups } from '../../core/teams.js';

// The bookmark answers only the page it was dragged from.
const pageOrigin = () => globalThis.location?.origin || '';

const step = (n, title, aside, ...body) => h('section', { class: 'tjv__step' },
  h('span', { class: 'tjv__num', text: String(n) }),
  h('div', { class: 'tjv__head' }, h('b', { text: title }), aside || null),
  h('div', { class: 'tjv__body' }, ...body));

export function jiraStart(app, { note } = {}) {
  const { state } = app;
  const working = state.jira.phase === 'waiting' || state.jira.phase === 'running' || Boolean(state.previewing);
  return h('div', { class: 'tjv' },
    settingsStep(app), note || null,
    peopleStep(app),
    siteStep(app),
    periodStep(app),
    projectsStep(app),
    startBlock(app, working),
    statusOf(app),
    columnsBlock(app),
    resultOf(app),
    h('div', { class: 'tjv__foot' }, bookmarkPanel(app),
      h('button', { class: 'tlinkbtn', onclick: () => { state.source = 'csv'; app.render(); } }, 'Or upload a CSV instead')));
}

// Which settings file is in use, and a way to switch to another team's.
function settingsStep(app) {
  const { state, link, go } = app;
  const s = state.settings;
  const loaded = s.roster.length > 0;
  const facts = [plural(s.roster.length, 'person', 'people'), s.site].filter(Boolean).join(' · ');
  return step(1, 'Team settings',
    loaded ? link('Edit', () => go('settings')) : null,
    loaded
      ? h('div', { class: 'tjv__row tjv__file1' }, icon('check', 14),
        h('span', { class: 'x' }, h('b', { text: state.settingsName || 'Settings loaded' }), h('small', { text: facts })),
        h('button', { class: 'tbtn tbtn--sm', title: 'Load another team’s settings file instead of this one', onclick: app.switchSettings }, icon('upload', 14), 'Switch file'))
      : h('div', { class: 'tjv__row' },
        h('span', { class: 'thelp', text: 'Your team lead has the settings file (worklogs-settings-….json). Load it once — the browser keeps it.' }),
        h('button', { class: 'tbtn tbtn--sm', onclick: app.switchSettings }, icon('upload', 14), 'Load file')));
}

// People by team group: who is ticked for the main Excel, and per group a
// separate Excel of its own — for groups outside the main team, to see them.
function peopleStep(app) {
  const { state, link } = app;
  const roster = state.settings.roster;
  const picked = app.pickedEmails();
  const j = state.jira;
  const note = (email) => {
    if (j.missing.includes(email)) return h('small', { class: 'tcheck__bad', text: 'not found in Jira' });
    if (j.guessed.includes(email)) return h('small', { class: 'tcheck__note', text: 'found by search' });
    return null;
  };
  const input = app.inputs.emailInput;
  const addEmail = () => {
    if (app.addRosterEmail(input.value)) input.value = '';
    app.render();
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } };
  const busy = Boolean(j.report) || j.phase === 'running' || j.phase === 'waiting';
  const group = ({ name, emails }) => {
    const label = name || 'No group';
    const on = emails.filter((e) => picked.includes(e));
    const all = on.length === emails.length;
    const toggle = () => app.pickPeople(all ? picked.filter((e) => !emails.includes(e)) : [...new Set([...picked, ...emails])]);
    return h('div', { class: 'tgroup' },
      h('div', { class: 'tgroup__head' },
        h('b', { class: 'x', text: label }),
        h('span', { class: 'tgroup__count', text: `${on.length} of ${emails.length}` }),
        link(all ? 'None' : 'All', toggle),
        h('button', {
          class: 'tbtn tbtn--sm', disabled: busy || !app.jira.site(), title: `A separate Excel with only ${label}`,
          onclick: () => app.jira.groupReport(emails, label)
        }, icon('download', 13), j.report === label ? 'Building…' : 'Separate report')),
      ...emails.map((email) => h('label', { class: 'tcheck' },
        h('input', {
          type: 'checkbox', checked: picked.includes(email),
          onchange: (e) => app.pickPeople(e.target.checked ? [...picked, email] : picked.filter((x) => x !== email))
        }),
        h('span', { class: 'x', text: email }), note(email))));
  };
  const aside = roster.length
    ? h('span', { class: 'tjv__aside' }, h('span', { class: 'tperiodbox__sum', text: `${picked.length} of ${roster.length}` }),
      link(picked.length === roster.length ? 'None' : 'All', () => app.pickPeople(picked.length === roster.length ? [] : roster)))
    : null;
  const reportNote = j.reportNote ? h('div', { class: j.reportNote.ok ? 'tok' : 'terr', text: j.reportNote.text }) : null;
  return step(2, 'People', aside,
    roster.length ? h('div', { class: 'tgroups' }, ...rosterGroups(state.settings, picked).map(group)) : null,
    j.report ? h('div', { class: 'thelp', text: state.progress || `Building the ${j.report} report…` }) : reportNote,
    h('div', { class: 'tjv__row' }, input, h('button', { class: 'tbtn tbtn--sm', onclick: addEmail }, icon('plus', 14), 'Add')));
}

function siteStep(app) {
  const { state } = app;
  const input = app.inputs.siteInput;
  if (!input.value && state.settings.site) input.value = state.settings.site;
  return step(3, 'Jira site', null, input);
}

function periodStep(app) {
  const { state, link } = app;
  const { fromInput, toInput } = app.inputs;
  const last = previousMonth();
  const isLast = state.from === last.from && state.to === last.to;
  const setLast = () => {
    state.from = fromInput.value = last.from;
    state.to = toInput.value = last.to;
    state.result = null;
    app.render();
  };
  return step(4, 'Period',
    h('span', { class: 'tjv__aside' }, h('span', { class: 'tperiodbox__sum', text: periodLabel(state.from, state.to) }),
      isLast ? null : link('Last month', setLast)),
    h('div', { class: 'tjv__dates' }, fromInput, h('span', { class: 'tjv__dash', text: '–' }), toInput));
}

// One project group only, when the settings have groups: Jira is asked for
// those projects alone.
function projectsStep(app) {
  const { state } = app;
  const groups = state.settings.projectGroups || {};
  const names = Object.keys(groups);
  if (!names.length) return null;
  const select = h('select', {
    'aria-label': 'Project group',
    onchange: (e) => { state.projectGroup = e.target.value; state.result = null; app.render(); }
  },
  h('option', { value: '', text: 'All projects', selected: !state.projectGroup }),
  ...names.map((g) => h('option', { value: g, text: `${g} · ${plural(groups[g].length, 'project')}`, selected: state.projectGroup === g })));
  const keys = state.projectGroup ? groups[state.projectGroup] || [] : [];
  return step(5, 'Projects', null, select,
    h('div', { class: 'thelp', text: keys.length ? `Only ${keys.join(', ')} — Jira is asked for these alone, and the file is named after the group.` : 'Every project the people logged time in.' }));
}

// After Start: each column of the report and the Jira field it comes from.
// Columns attached in the settings are filled in; the rest can be picked or
// left empty. Nothing is read from Jira's worklogs until Build Excel.
function columnsBlock(app) {
  const { state, link } = app;
  if (state.jira.phase !== 'mapping') return null;
  const rows = app.jira.columns();
  const fields = app.jira.fieldList();
  const open = rows.filter((r) => r.status === 'missing' || r.status === 'taken');
  const byHand = rows.filter((r) => r.status === 'bound' || r.status === 'empty');
  const shown = state.columnsAll ? rows : [...open, ...byHand];
  // A field feeds one column: the ones taken show whose they are.
  const usedBy = new Map(rows.filter((r) => (r.status === 'auto' || r.status === 'bound') && r.fieldId).map((r) => [r.fieldId, r.label]));
  const picker = (r) => h('select', {
    class: 'tcol__pick', 'aria-label': `Jira field for ${r.label}`,
    onchange: (e) => app.jira.setBinding(r.key, e.target.value)
  },
  open.includes(r) ? h('option', { value: '', text: 'Pick a Jira field…', selected: true, disabled: true }) : null,
  h('option', { value: '', text: 'Leave empty', selected: r.status === 'empty' }),
  ...fields.map((f) => {
    const mine = (r.status === 'auto' || r.status === 'bound') && r.fieldId === f.id;
    const other = !mine && usedBy.get(f.id);
    return h('option', { value: f.id, text: other ? `${f.name} — used by ${other}` : f.name, selected: mine, disabled: Boolean(other) });
  }));
  const row = (r) => {
    const tone = open.includes(r) ? 'warn' : 'ok';
    return h('div', { class: `tcol tcol--${tone}` },
      icon(tone === 'ok' ? 'check' : 'alert', 14),
      h('span', { class: 'tcol__label', text: r.label }),
      r.status === 'computed' ? h('span', { class: 'tcol__from', text: r.source }) : picker(r));
  };
  const found = rows.length - open.length;
  return h('section', { class: 'tjv__cols' },
    h('div', { class: 'tjv__head' }, icon('columns', 16), h('b', { text: 'Columns' }),
      h('span', { class: 'tjv__aside' }, h('span', { class: `tperiodbox__sum${open.length ? ' is-warn' : ''}`, text: `${found} of ${rows.length} found` }))),
    h('div', { class: 'thelp', text: open.length
      ? `${plural(open.length, 'column')} ${open.length === 1 ? 'has' : 'have'} no field in this Jira — pick one or leave it empty. Your choice is kept for ${app.jira.site()}.`
      : 'Every column has its Jira field. Change any below, or build the Excel.' }),
    shown.length ? h('div', { class: 'tcols' }, ...shown.map(row)) : null,
    link(state.columnsAll ? 'Show only the ones to check' : `Show all ${rows.length} columns`, () => { state.columnsAll = !state.columnsAll; app.render(); }),
    h('button', { class: 'tdl tjv__go', onclick: app.jira.build }, icon('sheet', 16), 'Build Excel'));
}

// Why Start is off, or what it will do.
function reasonOf(app) {
  const { state } = app;
  if (!state.settings.roster.length) return 'Load the settings file or add an email first.';
  if (!app.pickedEmails().length) return 'Pick at least one person.';
  if (!app.jira.site()) return 'Enter your Jira site.';
  return 'Opens Jira in a new tab — click the Worklogs bridge bookmark there.';
}

function startBlock(app, working) {
  const { state } = app;
  const canStart = Boolean(app.jira.site()) && app.pickedEmails().length > 0 && !working;
  const { phase } = state.jira;
  const again = phase === 'ready' || phase === 'error' || phase === 'mapping';
  // Once the columns or the Excel are up, they hold the main button; Start steps back.
  const done = Boolean(state.preview?.ok && state.preview.signature === app.signature());
  const aside = done || phase === 'mapping';
  const reason = working ? (state.progress || state.jira.message || 'Working…')
    : (phase === 'mapping' ? 'Check the columns below, then build the Excel.' : (done ? '' : reasonOf(app)));
  const reading = working && state.previewing;
  return h('div', { class: 'tjv__start' },
    h('button', { class: `${aside ? 'tbtn' : 'tdl'} tjv__go`, disabled: !canStart, onclick: app.jira.start },
      icon(again ? 'refresh' : 'right', 16), working ? 'Working…' : (again ? 'Start again' : 'Start')),
    reading ? h('div', { class: 'tjv__bar' }, h('i', { style: `width:${Math.max(4, Math.min(100, state.progressPct || 0))}%` })) : null,
    reason ? h('div', { class: 'tjv__reason', text: reason }) : null);
}

function statusOf(app) {
  const { state, link } = app;
  const j = state.jira;
  if (j.phase === 'error') return h('div', { class: 'terr', text: j.message });
  if (j.phase !== 'waiting') return null;
  return h('div', { class: 'tcallout tcallout--compact tcallout--info' }, icon('info', 16),
    h('div', { class: 'tcallout__body' },
      h('span', {}, 'In the Jira tab that just opened, click the ', h('b', { text: 'Worklogs bridge' }), ' bookmark.'),
      j.slow ? h('span', {}, 'Nothing yet? Make sure you are signed in there, or ', link('upload a CSV instead', () => { state.source = 'csv'; app.render(); }), '.') : null));
}

function resultOf(app) {
  const { state, link, go } = app;
  const p = state.preview;
  if (!p || p.signature !== app.signature()) return null;
  if (!p.ok) return h('div', { class: 'terr', text: p.message });
  const unmapped = projectsInFile(app.jira.projects()).filter((x) => !groupOf(state.settings.projectGroups, x.key));
  const saved = state.savedSig === app.signature();
  return h('section', { class: 'tjv__result' },
    h('div', { class: 'tjv__file' }, xlsxIcon(40),
      h('div', { class: 'x' }, h('div', { class: 'ttile__name', text: p.filename }),
        h('div', { class: 'ttile__meta' }, `${plural(p.sheets.length, 'sheet')} · `, link('Preview', () => go('preview'))))),
    state.jira.done ? h('div', { class: 'tjv__done' }, icon('check', 14), 'All done — you can close the Jira tab.') : null,
    h('button', { class: 'tdl tjv__go', onclick: app.download }, icon('download', 17), saved ? 'Download again' : 'Download Excel'),
    saved ? h('div', { class: 'tsaved' }, icon('check', 14), 'Saved to your Downloads folder') : null,
    unmapped.length ? h('div', { class: 'tcallout tcallout--compact tcallout--warn' }, icon('alert', 16),
      h('div', { class: 'tcallout__body' },
        h('span', { text: `${plural(unmapped.length, 'project')} without a group: ${unmapped.map((x) => x.key).join(', ')}.` }),
        link('Assign groups', () => go('groups')))) : null);
}

// Open while the page waits for it — that is when it is needed.
function bookmarkPanel(app) {
  const { state } = app;
  const open = state.jira.phase === 'waiting' || state.bridgeOpen;
  return h('details', { class: 'tbridge', open, ontoggle: (e) => { state.bridgeOpen = e.target.open; } },
    h('summary', {}, 'First time? Get the Worklogs bridge bookmark'),
    h('div', { class: 'tbridge__body' },
      h('a', { class: 'tbtn tbtn--sm', href: bookmarkletUrl(pageOrigin()), draggable: 'true', title: 'Drag me to your bookmarks bar', onclick: (e) => e.preventDefault() }, icon('link', 14), 'Worklogs bridge'),
      h('div', { class: 'thelp', text: 'Drag it to your bookmarks bar once. It only reads from Jira and only answers this page.' })),
    h('details', { class: 'tbridge__code' }, h('summary', { text: 'Show the code' }), h('pre', { class: 'jql', text: bookmarkletSource(pageOrigin()) })));
}
