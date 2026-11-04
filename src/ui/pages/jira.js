// Jira mode on the start screen: who, which site, Start, the bookmark that
// connects the Jira tab, and the Excel once Jira has answered.
import { h, icon, xlsxIcon } from '../dom.js';
import { plural } from '../../core/format.js';
import { bookmarkletUrl, bookmarkletSource } from '../../core/bridge.js';
import { groupOf, projectsInFile } from '../../core/project-groups.js';

// The bookmark answers only the page it was dragged from.
const pageOrigin = () => globalThis.location?.origin || '';

export function jiraPanel(app) {
  const { state, link, go } = app;
  const roster = state.settings.roster;
  const picked = app.pickedEmails();
  const j = state.jira;
  const working = j.phase === 'waiting' || j.phase === 'running' || Boolean(state.previewing);
  const toCsv = () => { state.source = 'csv'; app.render(); };

  const note = (email) => {
    if (j.missing.includes(email)) return h('small', { class: 'tcheck__bad', text: 'not found in Jira' });
    if (j.guessed.includes(email)) return h('small', { class: 'tcheck__note', text: 'found by search' });
    return null;
  };
  const addEmail = () => {
    if (app.addRosterEmail(app.inputs.emailInput.value)) app.inputs.emailInput.value = '';
    app.render();
  };
  const people = h('section', { class: 'tpanel' },
    h('div', { class: 'tpanel__title' }, icon('users', 16), h('b', { text: 'People' }),
      h('span', { class: 'tperiodbox__sum', text: `${picked.length} of ${roster.length}` }),
      h('span', { class: 'tjira__pick' }, link('All', () => app.pickPeople(roster)), link('None', () => app.pickPeople([])))),
    roster.length
      ? h('div', { class: 'tchecks' }, ...roster.map((email) => h('label', { class: 'tcheck' },
        h('input', {
          type: 'checkbox', checked: picked.includes(email),
          onchange: (e) => app.pickPeople(e.target.checked ? [...picked, email] : picked.filter((x) => x !== email))
        }),
        h('span', { class: 'x', text: email }), note(email))))
      : h('div', { class: 'thelp', text: 'No people yet — load your team’s settings file, or add an email below.' }),
    h('div', { class: 'tjira__add' }, app.inputs.emailInput,
      h('button', { class: 'tbtn tbtn--sm', onclick: addEmail }, icon('plus', 14), 'Add')));

  if (!app.inputs.siteInput.value && state.settings.site) app.inputs.siteInput.value = state.settings.site;
  const siteRow = h('label', { class: 'tfield' }, 'Jira site', app.inputs.siteInput);

  const canStart = Boolean(app.jira.site()) && picked.length > 0 && !working;
  const status = {
    idle: null,
    waiting: h('div', { class: 'tcallout tcallout--compact tcallout--info' }, icon('info', 16),
      h('div', { class: 'tcallout__body' },
        h('span', {}, 'In the Jira tab that just opened, click the ', h('b', { text: 'Worklogs bridge' }), ' bookmark.'),
        j.slow ? h('span', {}, ' Nothing yet? Make sure you are signed in there, or ', link('upload a CSV instead', toCsv), '.') : null)),
    running: h('div', { class: 'thelp', text: state.progress || j.message || 'Working…' }),
    ready: state.previewing ? h('div', { class: 'thelp', text: state.progress || 'Building the Excel…' }) : null,
    error: h('div', { class: 'terr', text: j.message })
  }[j.phase];

  const bookmark = h('details', { class: 'tbridge' },
    h('summary', { text: 'First time? Add the Worklogs bridge bookmark' }),
    h('div', { class: 'thelp', text: 'Drag this button to your bookmarks bar. It only reads from Jira, and only answers this page.' }),
    h('a', { class: 'tbtn tbtn--sm', href: bookmarkletUrl(pageOrigin()), draggable: 'true', onclick: (e) => e.preventDefault() }, icon('link', 14), 'Worklogs bridge'),
    h('details', {}, h('summary', { text: 'Show code' }), h('pre', { class: 'jql', text: bookmarkletSource(pageOrigin()) })));

  const p = state.preview;
  const fresh = Boolean(p && p.ok && p.signature === app.signature());
  const unmapped = fresh ? projectsInFile(app.jira.projects()).filter((x) => !groupOf(state.settings.projectGroups, x.key)) : [];
  const result = fresh
    ? h('div', { class: 'tjira__result' },
      h('div', { class: 'ttile' }, xlsxIcon(48), h('div', { class: 'ttile__name', text: p.filename }),
        h('div', { class: 'ttile__meta', text: plural(p.sheets.length, 'sheet') })),
      h('button', { class: 'tdl', onclick: app.download }, icon('download', 17), state.savedSig === app.signature() ? 'Download again' : 'Download Excel'),
      unmapped.length ? h('div', { class: 'trow trow--bad' }, icon('alert', 16),
        h('span', { class: 'x', text: `${plural(unmapped.length, 'project')} without a group: ${unmapped.map((x) => x.key).join(', ')}` }),
        link('Assign groups', () => go('groups'))) : null,
      h('div', { class: 'tlinks' }, link('Preview', () => go('preview'))))
    : (p && !p.ok && p.signature === app.signature() ? h('div', { class: 'terr', text: p.message }) : null);

  return h('div', { class: 'tjira' },
    people, siteRow,
    h('button', { class: 'tdl tjira__start', disabled: !canStart, onclick: app.jira.start }, icon('right', 16), working ? 'Working…' : 'Start'),
    picked.length ? null : h('div', { class: 'thelp', text: 'Pick at least one person.' }),
    status, result, bookmark,
    h('div', { class: 'tlinks' }, link('Or upload a CSV', toCsv)));
}
