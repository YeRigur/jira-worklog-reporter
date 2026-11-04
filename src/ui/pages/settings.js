// What the team's settings file holds, the team's filter, and the file itself.
import { h, icon } from '../dom.js';
import { plural } from '../../core/format.js';
import { hints } from '../../config/texts.js';

export function settingsPage(app) {
  const { state, go, pageHead, hint, actions, settingsNote } = app;
  const { jqlInput } = app.inputs;
  const s = state.settings;
  if (document.activeElement !== jqlInput) jqlInput.value = s.jql;
  const sites = Object.keys(s.sites);
  const groups = Object.keys(s.projectGroups || {});
  const line = (ok, title, text) => h('div', { class: `tres${ok ? ' is-ok' : ' is-warn'}` }, icon(ok ? 'check' : 'alert', 16),
    h('span', { class: 'x' }, h('b', { text: title }), h('small', { text })));
  return [pageHead('Settings'),
    hint(hints.settings),
    h('div', { class: 'tgrid' },
      line(Boolean(s.site), 'Jira site', s.site || 'none — type it on the export page'),
      line(s.roster.length > 0, 'People', s.roster.length ? `${plural(s.roster.length, 'email')} on the roster · ${plural(Object.keys(s.accounts).length, 'Jira account')} known` : 'nobody yet — add emails on the export page'),
      line(Object.keys(s.teams).length > 0, 'Teams', Object.keys(s.teams).length ? `${plural(Object.keys(s.teams).length, 'person', 'people')} with a group and projects` : 'none — groups come from the email’s domain'),
      line(groups.length > 0, 'Project groups', groups.length ? `${plural(Object.values(s.projectGroups).flat().length, 'project')} in ${plural(groups.length, 'group')}` : 'none — assign them after a first export'),
      line(true, 'Columns', sites.length ? `picked by hand for ${sites.join(', ')}` : 'nothing picked by hand yet')),
    h('label', { class: 'tfield' }, 'Team filter (JQL) — the people it names are ticked at first, and join the roster', jqlInput),
    h('div', { class: 'row' },
      h('button', { class: 'tbtn', onclick: () => app.saveJql(jqlInput.value.trim()) }, 'Save filter'),
      h('span', { class: 'muted small', text: hints.settingsKeep })),
    settingsNote(),
    actions(
      h('button', { class: 'tdl', onclick: app.saveSettingsFile }, icon('download', 16), 'Save settings file'),
      h('button', { class: 'tbtn', title: hints.settingsAdd, onclick: app.chooseSettings }, 'Add a settings file'),
      h('button', { class: 'tbtn', onclick: () => go('main') }, 'Back'))];
}
