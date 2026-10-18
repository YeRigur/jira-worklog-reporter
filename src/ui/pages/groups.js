// The "Project group" column isn't in Jira: it is this map, project key → the
// name the dashboard groups by. Kept in the settings file.
import { h, icon } from '../dom.js';
import { plural } from '../../core/format.js';
import { groupOf, groupNames, projectsInFile } from '../../core/project-groups.js';

export function groupsPage(app, { ds }) {
  const { state, link, pageHead, hint, actions, doneButton, settingsNote } = app;
  const groups = state.settings.projectGroups;
  const projects = projectsInFile(ds);
  const listId = 'tgroup-names';
  const row = (p) => {
    const current = groupOf(groups, p.key);
    const input = h('input', {
      type: 'text', value: current, list: listId, placeholder: 'Group name',
      onchange: (e) => { app.setGroup(p.key, e.target.value); app.render(); }
    });
    return h('div', { class: `tres${current ? ' is-ok' : ' is-warn'}` }, icon(current ? 'check' : 'alert', 16),
      h('span', { class: 'x' },
        h('b', { class: 'tkey', text: p.key }),
        h('small', { text: `${p.name || 'no name in the CSV'} · ${plural(p.issues, 'issue')} in this file` }),
        input),
      current ? null : (p.name ? link('Use project name', () => { app.setGroup(p.key, p.name); app.render(); }) : null));
  };
  const elsewhere = Object.entries(groups || {})
    .flatMap(([g, keys]) => keys.map((k) => ({ k, g })))
    .filter(({ k }) => !projects.some((p) => p.key === k));
  return [pageHead('Project groups'),
    hint('“Project group” isn’t a Jira field — each project key gets the name the dashboard groups by. Type a name or pick one already used; several projects can share a group. Kept on this computer; save the settings file to pass it on.'),
    h('datalist', { id: listId }, ...groupNames(groups).map((n) => h('option', { value: n }))),
    h('div', { class: 'tgrid tgrid--wide' }, ...projects.map(row)),
    elsewhere.length ? h('div', { class: 'tnote' }, `Also in the settings, not in this file: ${elsewhere.map(({ k, g }) => `${k} → ${g}`).join(', ')}`) : null,
    settingsNote(),
    actions(
      doneButton(),
      h('button', { class: 'tbtn', onclick: app.saveSettingsFile }, icon('download', 16), 'Save settings file'))];
}
