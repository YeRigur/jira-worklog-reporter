// What the team's settings file holds, the filter's JQL, and the file itself.
import { h, icon } from '../dom.js';
import { plural } from '../../core/format.js';

export function settingsPage(app) {
  const { state, go, pageHead, hint, actions, settingsNote } = app;
  const { jqlInput } = app.inputs;
  const s = state.settings;
  if (document.activeElement !== jqlInput) jqlInput.value = s.jql;
  const sites = Object.keys(s.sites);
  const line = (ok, title, text) => h('div', { class: `tres${ok ? ' is-ok' : ' is-warn'}` }, icon(ok ? 'check' : 'alert', 16),
    h('span', { class: 'x' }, h('b', { text: title }), h('small', { text })));
  return [pageHead('Settings'),
    hint('Everything private lives here, not in the page: the team’s emails, Teams groups, the filter’s people, who is behind old Jira keys, and the columns attached by hand. This computer keeps what you load; save it as a file to pass to a colleague.'),
    h('div', { class: 'tgrid' },
      line(s.roster.length > 0, 'Roster', s.roster.length ? `${plural(s.roster.length, 'email')} — matched to authors by name` : 'no emails — “Person email” stays empty'),
      line(Object.keys(s.teams).length > 0, 'Teams', Object.keys(s.teams).length ? `${plural(Object.keys(s.teams).length, 'person', 'people')} with a group and projects` : 'none — groups come from the location in the name'),
      line(Object.keys(s.people).length > 0, 'People identified in Jira', Object.keys(s.people).length ? `${plural(Object.keys(s.people).length, 'old key')} with a name` : 'none yet — use “Identify” on the overview'),
      line(Object.keys(s.projectGroups || {}).length > 0, 'Project groups', Object.keys(s.projectGroups || {}).length ? `${plural(Object.values(s.projectGroups).flat().length, 'project')} in ${plural(Object.keys(s.projectGroups).length, 'group')}` : 'none — assign them after uploading a CSV'),
      line(Boolean(s.jql), 'Filter', s.jql ? 'the team’s own JQL, with its people' : 'the public one — projects and month only'),
      line(true, 'Columns', sites.length ? `choices for ${sites.join(', ')}` : 'nothing attached by hand yet')),
    h('label', { class: 'tfield' }, 'Team filter (JQL) — “Copy JQL” copies exactly this; emails in it are added to the roster', jqlInput),
    h('div', { class: 'row' },
      h('button', { class: 'tbtn', onclick: () => app.saveJql(jqlInput.value.trim()) }, 'Save JQL'),
      h('span', { class: 'muted small', text: 'Then save the settings file to keep it.' })),
    settingsNote(),
    actions(
      h('button', { class: 'tdl', onclick: app.saveSettingsFile }, icon('download', 16), 'Save settings file'),
      h('button', { class: 'tbtn', onclick: app.chooseSettings }, 'Load settings file'),
      h('button', { class: 'tbtn', onclick: () => go('main') }, 'Back'))];
}
