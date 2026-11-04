// The page around the card, and the card drawn for the current state: the
// export steps, or the page it turned to — the columns, the preview, the
// project groups, the settings.
import { h, icon } from './dom.js';
import { groupOf, projectsInFile } from '../core/project-groups.js';
import { jiraStart } from './pages/jira.js';
import { pickPage, emptyPage, allPage } from './pages/columns.js';
import { searchPage } from './pages/search.js';
import { previewPage } from './pages/preview.js';
import { settingsPage } from './pages/settings.js';
import { groupsPage } from './pages/groups.js';

export const PAGES = {
  main: (app) => jiraStart(app, { note: app.settingsNote() }),
  all: allPage, pick: pickPage, search: searchPage, empty: emptyPage,
  preview: previewPage, groups: groupsPage, settings: settingsPage
};

// The header, the section navigation and the card. Returns the
// parts that redraw: the card the pages draw into and the navigation.
export function mountShell(app, root) {
  const card = h('main', { class: 'tcard' });
  const nav = h('nav', { class: 'tnav', 'aria-label': 'Sections' });
  root.replaceChildren(h('div', { class: 'tpage' },
    h('header', { class: 'tbrand' },
      h('span', { class: 'tbrand__logo' }, icon('sheet', 18)),
      h('div', { class: 'tbrand__title', text: 'Jira Worklogs Export' })),
    nav,
    card));
  return { card, nav };
}

// Which section a page belongs to.
const SECTION = { pick: 'all', empty: 'all', search: 'all' };
const COLUMN_PAGES = ['all', 'pick', 'search', 'empty'];

// What each page can open on now: the columns once Jira's fields are in,
// the preview once there is a workbook, the groups once Jira named projects.
function available(app) {
  const { state } = app;
  const columns = app.jira.columnsContext();
  const projects = app.jira.projects();
  return { columns, projects, preview: Boolean(state.preview), groups: projects.projects.length > 0 };
}

// The sections, each with a count of what still needs a look.
function renderNav(app, nav, open) {
  const { state } = app;
  const here = SECTION[state.page] || (PAGES[state.page] ? state.page : 'main');
  const item = (page, iconName, label, { badge = 0, tone = 'warn', on = true } = {}) => h('button', {
    class: `tnav__item${here === page ? ' is-on' : ''}`, disabled: !on, 'aria-current': here === page ? 'page' : null,
    onclick: () => app.go(page)
  }, icon(iconName, 16), h('span', { class: 'tnav__label', text: label }),
  badge ? h('span', { class: `tnav__badge tnav__badge--${tone}`, text: String(badge) }) : null);
  const toCheck = open.columns ? open.columns.problems.filter((r) => !state.skipped.includes(r.key)).length : 0;
  const unmapped = open.groups ? projectsInFile(open.projects).filter((p) => !groupOf(state.settings.projectGroups, p.key)).length : 0;
  nav.replaceChildren(
    item('main', 'home', 'Export'),
    item('all', 'columns', 'Columns', { on: Boolean(open.columns), badge: toCheck, tone: 'bad' }),
    item('preview', 'eye', 'Preview', { on: open.preview }),
    item('groups', 'folder', 'Project groups', { on: open.groups, badge: unmapped, tone: 'bad' }),
    item('settings', 'settings', 'Settings'));
}

export function render(app, { card, nav }) {
  const { state } = app;
  const open = available(app);
  // A page that can't open yet falls back to the export steps.
  let page = PAGES[state.page] ? state.page : 'main';
  if ((COLUMN_PAGES.includes(page) && !open.columns) || (page === 'preview' && !open.preview) || (page === 'groups' && !open.groups)) page = 'main';
  const ctx = COLUMN_PAGES.includes(page) ? open.columns : (page === 'groups' ? { ds: open.projects } : {});
  const content = PAGES[page](app, ctx);
  renderNav(app, nav, open);
  card.className = `tcard tcard--${page === 'main' ? 'start' : 'page'}`;
  // Pages list their parts with gaps (null) where a part doesn't apply.
  card.replaceChildren(...[content].flat().filter(Boolean));
  app.ensurePreview();
}

// A settings file dropped anywhere on the page is loaded; the card lights up meanwhile.
export function listenForDrops(app) {
  let depth = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; document.body.classList.add('is-dragging'); });
  window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('is-dragging'); } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('is-dragging');
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) app.load(files);
  });
}
