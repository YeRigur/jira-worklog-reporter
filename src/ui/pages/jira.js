// Jira mode on the start screen: one narrow column of numbered steps, in the
// order they are done — settings, people, site, period — then Start, with the
// reason when it can't start yet, then the Excel.
import { h, icon, xlsxIcon } from '../dom.js';
import { plural } from '../../core/format.js';
import { previousMonth, periodLabel } from '../../core/period.js';
import { bookmarkletUrl, bookmarkletSource } from '../../core/bridge.js';
import { groupOf, projectsInFile } from '../../core/project-groups.js';

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
    startBlock(app, working),
    statusOf(app),
    resultOf(app),
    h('div', { class: 'tjv__foot' }, bookmarkPanel(app),
      h('button', { class: 'tlinkbtn', onclick: () => { state.source = 'csv'; app.render(); } }, 'Or upload a CSV instead')));
}

function settingsStep(app) {
  const { state, link, go } = app;
  const loaded = state.settings.roster.length > 0;
  return step(1, 'Team settings',
    loaded ? link('Change', () => go('settings')) : null,
    loaded
      ? h('div', { class: 'tjv__ok' }, icon('check', 14), h('span', { text: `${plural(state.settings.roster.length, 'person', 'people')} on the roster` }))
      : h('div', { class: 'tjv__row' },
        h('span', { class: 'thelp', text: 'Your team lead has worklogs-settings.json. Load it once — the browser keeps it.' }),
        h('button', { class: 'tbtn tbtn--sm', onclick: app.chooseSettings }, icon('upload', 14), 'Load file')));
}

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
  const aside = roster.length
    ? h('span', { class: 'tjv__aside' }, h('span', { class: 'tperiodbox__sum', text: `${picked.length} of ${roster.length}` }),
      link(picked.length === roster.length ? 'None' : 'All', () => app.pickPeople(picked.length === roster.length ? [] : roster)))
    : null;
  return step(2, 'People', aside,
    roster.length
      ? h('div', { class: 'tchecks' }, ...roster.map((email) => h('label', { class: 'tcheck' },
        h('input', {
          type: 'checkbox', checked: picked.includes(email),
          onchange: (e) => app.pickPeople(e.target.checked ? [...picked, email] : picked.filter((x) => x !== email))
        }),
        h('span', { class: 'x', text: email }), note(email))))
      : null,
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
  const again = state.jira.phase === 'ready' || state.jira.phase === 'error';
  // Once the Excel is there, Download is the main button; Start steps back.
  const done = Boolean(state.preview?.ok && state.preview.signature === app.signature());
  const reason = working ? (state.progress || state.jira.message || 'Working…') : (done ? '' : reasonOf(app));
  return h('div', { class: 'tjv__start' },
    h('button', { class: `${done ? 'tbtn' : 'tdl'} tjv__go`, disabled: !canStart, onclick: app.jira.start },
      icon(again ? 'refresh' : 'right', 16), working ? 'Working…' : (again ? 'Start again' : 'Start')),
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
