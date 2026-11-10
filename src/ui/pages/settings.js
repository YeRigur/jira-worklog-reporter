// The settings file as a plain form: the Jira site, the people (group, ticked
// at first), groups by email domain and project groups. Every change is kept
// at once on this computer; Save settings file hands it on.
import { h, icon } from '../dom.js';
import { plural } from '../../core/format.js';
import { defaultPeopleOf } from '../../core/settings.js';
import { groupOfEmail } from '../../core/teams.js';
import { groupNames } from '../../core/project-groups.js';
import { hints } from '../../config/texts.js';

const section = (title, help, ...body) => h('section', { class: 'tset' },
  h('div', { class: 'tset__head' }, h('b', { text: title }), h('span', { class: 'thelp', text: help })),
  ...body);

const removeButton = (label, onclick) => h('button', { class: 'tset__remove', 'aria-label': label, title: label, onclick }, icon('minus', 14));

export function settingsPage(app) {
  const { state, go, pageHead, hint, actions, settingsNote } = app;
  const s = state.settings;
  const defaults = defaultPeopleOf(s);
  const groupList = 'tset-groups';
  const knownGroups = [...new Set([...Object.values(s.teams).map((t) => t.group), ...Object.values(s.groupByDomain || {})].filter(Boolean))].sort();

  // Jira site
  const site = h('input', {
    type: 'text', value: s.site, placeholder: 'your-site.atlassian.net', 'aria-label': 'Jira site',
    onchange: (e) => { app.rememberSite(e.target.value); state.site = ''; app.inputs.siteInput.value = s.site; app.render(); }
  });

  // People
  const personRow = (email) => {
    const own = s.teams[email]?.group || '';
    const fallback = own ? '' : groupOfEmail({ ...s, teams: {} }, email);
    return h('div', { class: 'tset__row tset__row--person' },
      h('input', {
        type: 'checkbox', checked: defaults.includes(email), 'aria-label': `${email} in the report at first`,
        onchange: (e) => app.setDefaultPerson(email, e.target.checked)
      }),
      h('span', { class: 'tset__email', text: email }),
      h('input', {
        type: 'text', value: own, list: groupList, placeholder: fallback || 'Group', 'aria-label': `Group of ${email}`,
        onchange: (e) => app.setPersonGroup(email, e.target.value)
      }),
      removeButton(`Remove ${email}`, () => app.removePerson(email)));
  };
  const add = app.inputs.emailInput;
  const addPerson = () => { if (app.addRosterEmail(add.value)) add.value = ''; app.render(); };
  add.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } };

  // Groups by email domain
  const domainRow = ([domain, group], i) => h('div', { class: 'tset__row tset__row--pair' },
    h('input', { type: 'text', value: domain, 'aria-label': 'Email domain', onchange: (e) => app.setDomain(i, e.target.value, group) }),
    h('span', { class: 'tset__arrow', 'aria-hidden': 'true', text: '→' }),
    h('input', { type: 'text', value: group, list: groupList, placeholder: 'Group', 'aria-label': `Group for ${domain}`, onchange: (e) => app.setDomain(i, domain, e.target.value) }),
    removeButton(`Remove ${domain}`, () => app.removeDomain(i)));

  // Project groups
  const projectRow = ([name, keys], i) => h('div', { class: 'tset__row tset__row--pair' },
    h('input', { type: 'text', value: name, 'aria-label': 'Project group', onchange: (e) => app.setProjectGroup(i, e.target.value, keys) }),
    h('span', { class: 'tset__arrow', 'aria-hidden': 'true', text: '→' }),
    h('input', { type: 'text', value: keys.join(', '), placeholder: 'AC, TU, …', 'aria-label': `Projects of ${name}`, onchange: (e) => app.setProjectGroup(i, name, e.target.value) }),
    removeButton(`Remove ${name}`, () => app.removeProjectGroup(i)));

  const sites = Object.keys(s.sites);
  return [pageHead('Settings'),
    hint(hints.settings),
    h('datalist', { id: groupList }, ...[...knownGroups, ...groupNames(s.projectGroups || {})].filter((g, i, a) => a.indexOf(g) === i).map((g) => h('option', { value: g }))),
    h('div', { class: 'tset__grid' },
      h('div', { class: 'tset__col' },
        section('Jira site', hints.settingsSite, site),
        section(`People · ${s.roster.length}`, hints.settingsPeople,
          s.roster.length
            ? h('div', { class: 'tset__list' }, ...s.roster.map(personRow))
            : h('div', { class: 'thelp', text: hints.settingsNoPeople }),
          h('div', { class: 'tset__add' }, add, h('button', { class: 'tbtn tbtn--sm', onclick: addPerson }, icon('plus', 14), 'Add')))),
      h('div', { class: 'tset__col' },
        section('Groups by email domain', hints.settingsDomains,
          h('div', { class: 'tset__list' }, ...Object.entries(s.groupByDomain || {}).map(domainRow)),
          h('button', { class: 'tlinkbtn', onclick: app.addDomain }, '+ Add a domain')),
        section('Project groups', hints.settingsProjects,
          h('div', { class: 'tset__list' }, ...Object.entries(s.projectGroups || {}).map(projectRow)),
          h('button', { class: 'tlinkbtn', onclick: app.addProjectGroup }, '+ Add a group')))),
    h('div', { class: 'thelp', text: hints.settingsKept(plural(Object.keys(s.accounts).length, 'Jira account'), sites.length ? sites.join(', ') : 'no site yet') }),
    settingsNote(),
    actions(
      h('button', { class: 'tdl', onclick: app.saveSettingsFile }, icon('download', 16), 'Save settings file'),
      h('button', { class: 'tbtn', title: hints.switchFile, onclick: app.switchSettings }, icon('upload', 14), 'Switch file'),
      h('button', { class: 'tbtn', onclick: () => go('main') }, 'Back'))];
}
