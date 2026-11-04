// Jira mode on the start screen, laid out in the order it is used: the
// settings, then who and which Jira and when, then Start — with the reason
// when it can't start yet — then what came of it.
import { h, icon, xlsxIcon } from '../dom.js';
import { plural } from '../../core/format.js';
import { bookmarkletUrl, bookmarkletSource } from '../../core/bridge.js';
import { groupOf, projectsInFile } from '../../core/project-groups.js';

// The bookmark answers only the page it was dragged from.
const pageOrigin = () => globalThis.location?.origin || '';

// `period`, `settings` and `note` are the start page's own parts.
export function jiraStart(app, { period, settings, note }) {
  const { state } = app;
  const j = state.jira;
  const working = j.phase === 'waiting' || j.phase === 'running' || Boolean(state.previewing);
  return h('div', { class: 'tjira' },
    settings, note,
    h('div', { class: 'tjira__cols' },
      peoplePanel(app),
      h('div', { class: 'tjira__side' }, sitePanel(app), period)),
    actionBar(app, working),
    statusOf(app),
    resultOf(app),
    bookmarkPanel(app));
}

function peoplePanel(app) {
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
  const list = roster.length
    ? h('div', { class: 'tchecks' }, ...roster.map((email) => h('label', { class: `tcheck${picked.includes(email) ? ' is-on' : ''}` },
      h('input', {
        type: 'checkbox', checked: picked.includes(email),
        onchange: (e) => app.pickPeople(e.target.checked ? [...picked, email] : picked.filter((x) => x !== email))
      }),
      h('span', { class: 'x', text: email }), note(email))))
    : h('div', { class: 'tjira__empty' }, icon('users', 22),
      h('span', { text: 'No people yet. Load your team’s settings file, or add an email below.' }),
      link('Load settings file', app.chooseSettings));
  return h('section', { class: 'tpanel tjira__people' },
    h('div', { class: 'tpanel__title' }, icon('users', 16), h('b', { text: 'People' }),
      h('span', { class: 'tperiodbox__sum', text: `${picked.length} of ${roster.length}` }),
      roster.length ? h('span', { class: 'tjira__pick' }, link('All', () => app.pickPeople(roster)), link('None', () => app.pickPeople([]))) : null),
    list,
    h('div', { class: 'tjira__add' }, input,
      h('button', { class: 'tbtn', onclick: addEmail }, icon('plus', 14), 'Add')));
}

function sitePanel(app) {
  const { state } = app;
  const input = app.inputs.siteInput;
  if (!input.value && state.settings.site) input.value = state.settings.site;
  return h('section', { class: 'tpanel' },
    h('div', { class: 'tpanel__title' }, icon('link', 16), h('b', { text: 'Jira site' })),
    input,
    h('div', { class: 'thelp', text: 'Start opens it in a new tab. Sign in there if Jira asks.' }));
}

// Why Start is off, or what it will do.
function reasonOf(app) {
  const { state } = app;
  if (!state.settings.roster.length) return 'Load your team’s settings file, or add an email.';
  if (!app.pickedEmails().length) return 'Pick at least one person.';
  if (!app.jira.site()) return 'Enter your Jira site.';
  return 'Jira opens in a new tab; click the Worklogs bridge bookmark there.';
}

function actionBar(app, working) {
  const { state } = app;
  const canStart = Boolean(app.jira.site()) && app.pickedEmails().length > 0 && !working;
  const again = state.jira.phase === 'ready' || state.jira.phase === 'error';
  // Once the Excel is there, Download is the main button; Start steps back.
  const done = Boolean(state.preview?.ok && state.preview.signature === app.signature());
  const reason = working ? (state.progress || state.jira.message || 'Working…')
    : (done ? 'The Excel is ready below. Start again to read Jira anew.' : reasonOf(app));
  return h('div', { class: 'tjira__bar' },
    h('button', { class: `${done ? 'tbtn' : 'tdl'} tjira__start`, disabled: !canStart, onclick: app.jira.start },
      icon(again ? 'refresh' : 'right', 16), working ? 'Working…' : (again ? 'Start again' : 'Start')),
    h('span', { class: 'tjira__reason', text: reason }),
    h('button', { class: 'tlinkbtn tjira__csv', onclick: () => { state.source = 'csv'; app.render(); } }, 'Or upload a CSV'));
}

function statusOf(app) {
  const { state, link } = app;
  const j = state.jira;
  if (j.phase === 'error') return h('div', { class: 'terr', text: j.message });
  if (j.phase !== 'waiting') return null;
  return h('div', { class: 'tcallout tcallout--info' }, icon('info', 16),
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
  return h('section', { class: 'tpanel tjira__result' },
    h('div', { class: 'tjira__file' }, xlsxIcon(44),
      h('div', { class: 'x' }, h('div', { class: 'ttile__name', text: p.filename }),
        h('div', { class: 'ttile__meta', text: `${plural(p.sheets.length, 'sheet')} · ready` })),
      link('Preview', () => go('preview')),
      h('button', { class: 'tdl', onclick: app.download }, icon('download', 17), saved ? 'Download again' : 'Download Excel')),
    saved ? h('div', { class: 'tsaved' }, icon('check', 14), 'Saved to your Downloads folder') : null,
    unmapped.length ? h('div', { class: 'tcallout tcallout--compact tcallout--warn' }, icon('alert', 16),
      h('div', { class: 'tcallout__body' },
        h('span', { text: `${plural(unmapped.length, 'project')} without a group — “Project group” will be empty for ${unmapped.map((x) => x.key).join(', ')}.` }),
        link('Assign groups', () => go('groups')))) : null);
}

// Open while the page waits for it — that is when it is needed.
function bookmarkPanel(app) {
  const { state } = app;
  const open = state.jira.phase === 'waiting' || state.bridgeOpen;
  return h('details', { class: 'tbridge', open, ontoggle: (e) => { state.bridgeOpen = e.target.open; } },
    h('summary', {}, icon('lock', 14), 'First time? Add the Worklogs bridge bookmark'),
    h('div', { class: 'tbridge__body' },
      h('a', { class: 'tbtn', href: bookmarkletUrl(pageOrigin()), draggable: 'true', title: 'Drag me to your bookmarks bar', onclick: (e) => e.preventDefault() }, icon('link', 14), 'Worklogs bridge'),
      h('div', { class: 'thelp', text: 'Drag this button to your bookmarks bar once. It only reads from Jira — searches, worklogs, users — and only answers this page.' })),
    h('details', { class: 'tbridge__code' }, h('summary', { text: 'Show the bookmark’s code' }), h('pre', { class: 'jql', text: bookmarkletSource(pageOrigin()) })));
}
