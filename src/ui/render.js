// The page around the card, and the card drawn for the current state: the
// start page before a file, otherwise the main page or the page it turned to.
import { h, icon } from './dom.js';
import { resolveTemplate } from '../core/template.js';
import { worklogsInPeriod, issuesInPeriod } from '../core/period.js';
import { fieldCoverage } from '../core/suggest.js';
import { problemsOf, settled } from '../core/column-choice.js';
import { groupOf, projectsInFile } from '../core/project-groups.js';
import { startPage } from './pages/start.js';
import { mainPage } from './pages/main.js';
import { pickPage, emptyPage, allPage } from './pages/columns.js';
import { searchPage } from './pages/search.js';
import { periodPage } from './pages/period.js';
import { previewPage } from './pages/preview.js';
import { authorsPage } from './pages/authors.js';
import { settingsPage } from './pages/settings.js';
import { groupsPage } from './pages/groups.js';
import { notesPage } from './pages/notes.js';
import { outsidePage } from './pages/outside.js';

export const PAGES = {
  main: mainPage, pick: pickPage, search: searchPage, empty: emptyPage, all: allPage, period: periodPage,
  preview: previewPage, authors: authorsPage, notes: notesPage, settings: settingsPage, outside: outsidePage, groups: groupsPage
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
const SECTION = { pick: 'all', empty: 'all', search: 'all', period: 'main', notes: 'main', outside: 'authors' };

// The sections, each with a count of what still needs a look. Without a file
// only the upload and the settings are open.
function renderNav(app, nav, ctx) {
  const { state } = app;
  const ds = state.dataset;
  const here = ds ? (SECTION[state.page] || (PAGES[state.page] ? state.page : 'main')) : (state.page === 'settings' ? 'settings' : 'main');
  const item = (page, iconName, label, { badge = 0, tone = 'warn', open = true } = {}) => h('button', {
    class: `tnav__item${here === page ? ' is-on' : ''}`, disabled: !open, 'aria-current': here === page ? 'page' : null,
    onclick: () => app.go(page)
  }, icon(iconName, 16), h('span', { class: 'tnav__label', text: label }),
  badge ? h('span', { class: `tnav__badge tnav__badge--${tone}`, text: String(badge) }) : null);
  if (!ds) {
    nav.replaceChildren(item('main', 'upload', 'Upload'), item('all', 'columns', 'Columns', { open: false }),
      item('preview', 'eye', 'Preview', { open: false }), item('groups', 'folder', 'Project groups', { open: false }),
      item('authors', 'users', 'Authors', { open: false }), item('settings', 'settings', 'Settings'));
    return;
  }
  const open = ctx.problems.filter((r) => !state.skipped.includes(r.key)).length;
  const unmapped = projectsInFile(ds).filter((p) => !groupOf(state.settings.projectGroups, p.key)).length;
  const unnamed = app.people(ds).unnamed.length;
  nav.replaceChildren(
    item('main', 'home', 'Overview'),
    item('all', 'columns', 'Columns', open ? { badge: open, tone: 'bad' } : { badge: state.emptyOk ? 0 : ctx.empties.length }),
    item('preview', 'eye', 'Preview'),
    item('groups', 'folder', 'Project groups', { badge: unmapped, tone: 'bad' }),
    item('authors', 'users', 'Authors', { badge: unnamed }),
    item('settings', 'settings', 'Settings'));
}

// What every page with a file needs, computed once per draw.
function pageContext(app, ds) {
  const { state } = app;
  const rows = resolveTemplate(app.template, ds, state.bindings);
  const problems = problemsOf(rows);
  const kept = app.keptAuthors(ds);
  const keep = kept ? new Set(kept) : null;
  // Coverage counts the issues the report will list, not the whole file.
  const inPeriod = { model: ds.model, issues: issuesInPeriod(ds, state.from, state.to, keep) };
  const memo = new Map();
  const cov = (id) => {
    if (!memo.has(id)) memo.set(id, fieldCoverage(inPeriod, id));
    return memo.get(id);
  };
  return {
    ds, rows, problems, blocked: !settled(problems, state.skipped),
    period: worklogsInPeriod(ds, state.from, state.to, keep), empties: app.emptyNow(), cov, keep
  };
}

export function render(app, { card, nav }) {
  const { state } = app;
  const ds = state.dataset;
  let content;
  let mode = 'start';
  let ctx = null;
  app.inputs.jqlBox.textContent = app.teamJql();
  if (!ds && state.page === 'settings') {
    content = settingsPage(app);
    mode = 'page';
  } else if (!ds) {
    content = startPage(app);
  } else {
    const page = PAGES[state.page] || mainPage;
    ctx = pageContext(app, ds);
    content = page(app, ctx);
    mode = state.page === 'main' || !PAGES[state.page] ? 'main' : 'page';
  }
  renderNav(app, nav, ctx);
  card.className = `tcard tcard--${mode}`;
  // Pages list their parts with gaps (null) where a part doesn't apply.
  card.replaceChildren(...[content].flat().filter(Boolean));
  app.ensurePreview();
}

// A file dropped anywhere on the page is loaded; the card lights up meanwhile.
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
