// ?demo: every state the tool can be in, on synthetic data, one pick away — to
// judge a design on all of them. Settings live in memory here, so the demo
// never touches what this browser keeps for real use.
import { h } from '../ui/dom.js';
import { emptySettings } from '../core/settings.js';
import { resolveTemplate } from '../core/template.js';
import { problemsOf } from '../core/column-choice.js';
import { openSearch } from '../ui/pages/search.js';
import { HEADERS, ROWS, PEOPLE } from '../../tests/fixtures/synthetic.js';
import { toCsv } from '../../tests/support/helpers.js';

export function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
}

const AUGUST = { from: '2026-08-01', to: '2026-08-31' };
const FILTER = `worklogDate >= startOfMonth(-1) AND worklogDate < startOfMonth()\nAND worklogAuthor in ("${PEOPLE.A.email}", "${PEOPLE.B.email}", "${PEOPLE.C.email}")`;
const SETTINGS = { roster: [PEOPLE.A.email, PEOPLE.B.email, PEOPLE.C.email], jql: FILTER, projectGroups: { 'Group A': ['AC'] } };
const SETTINGS_DONE = {
  ...SETTINGS,
  projectGroups: { 'Group A': ['AC', 'ZZZ'], 'Group B': ['VC'] },
  people: { [PEOPLE.B.key]: { name: PEOPLE.B.name, email: PEOPLE.B.email, accountId: PEOPLE.B.accountId } }
};

// The synthetic export, plus one issue whose worklog can't be read.
const broken = [...ROWS[0]];
broken[1] = 'AC-50'; broken[2] = '10050'; broken[0] = 'Imported task';
broken[HEADERS.indexOf('Log Work')] = `;04/Aug/26 10:00 AM;${PEOPLE.A.key};not-a-number`;
const CSV = toCsv(HEADERS, ROWS);
const CSV_NOTES = toCsv(HEADERS, [...ROWS, broken]);
const CSV_DATES = toCsv(['Summary', 'Issue key', 'Issue id', 'Issue Type', 'Status', 'Project key', 'Project name', 'Created', 'Updated', 'Log Work'],
  [['Odd dates', 'AB-1', '1', 'Task', 'Done', 'AB', 'Alpha', '2026|08|03 at 9', '2026|08|04 at 10', `;2026|08|04 at 10;${PEOPLE.A.key};3600`]]);

const file = (name, text, type) => new File([text], name, { type });
const idle = async (app) => {
  for (let i = 0; i < 400 && app.state.previewing; i++) await new Promise((r) => setTimeout(r, 25));
};

export function startDemo(app, storage) {
  const { state, inputs } = app;

  const reset = async ({ settings = null, period = AUGUST } = {}) => {
    storage.clear();
    Object.assign(state, {
      settings: emptySettings(), settingsNote: null, bindings: {}, skipped: [], error: null, datePattern: '',
      site: '', withSummary: null, lookupText: '', copiedMonths: [], monthPick: '', busy: false, progress: '', from: period.from, to: period.to
    });
    state.settingsRev++;
    inputs.fromInput.value = period.from;
    inputs.toInput.value = period.to;
    app.startOver();
    if (settings) await app.load([file('worklogs-settings.json', JSON.stringify(settings), 'application/json')]);
  };
  const withCsv = async (opts = {}, csv = CSV) => {
    await reset(opts);
    await app.load([file('jira-export-august.csv', csv, 'text/csv')]);
    state.settingsNote = null;
    await idle(app);
    app.render();
  };
  const problems = () => problemsOf(resolveTemplate(app.template, state.dataset, state.bindings));
  const allSet = async () => {
    await withCsv({ settings: SETTINGS_DONE });
    app.skip(problems().map((r) => r.key));
    state.emptyOk = true;
    await idle(app);
    app.render();
    await idle(app);
  };
  const open = (page, extra) => async () => { await withCsv({ settings: SETTINGS }); app.go(page, extra); };

  const SCENARIOS = [
    ['Start', 'No file, no settings', () => reset()],
    ['Start', 'Settings just loaded', async () => { await reset({ settings: SETTINGS }); app.render(); }],
    ['Start', 'Three months — JQL per month', async () => { await reset({ settings: SETTINGS, period: { from: '2026-06-01', to: '2026-08-31' } }); state.settingsNote = null; app.render(); }],
    ['Start', 'Not a CSV file', async () => { await reset({ settings: SETTINGS }); state.settingsNote = null; await app.load([file('notes.txt', 'hello', 'text/plain')]); }],
    ['Start', 'Unknown date format', async () => { await reset({ settings: SETTINGS }); state.settingsNote = null; await app.load([file('odd-dates.csv', CSV_DATES, 'text/csv')]); }],
    ['Start', 'Settings page, no file yet', async () => { await reset({ settings: SETTINGS }); state.settingsNote = null; app.go('settings'); }],
    ['Overview', 'Columns missing — download blocked', () => withCsv({ settings: SETTINGS })],
    ['Overview', 'No settings — no roster', () => withCsv()],
    ['Overview', 'Jira site unknown', async () => { await withCsv({ settings: SETTINGS }); state.dataset.site = ''; app.render(); }],
    ['Overview', 'No worklogs in the period', () => withCsv({ settings: SETTINGS, period: { from: '2026-10-01', to: '2026-10-31' } })],
    ['Overview', 'File notes (unreadable worklog)', () => withCsv({ settings: SETTINGS }, CSV_NOTES)],
    ['Overview', 'Everything settled — ready', allSet],
    ['Overview', 'Building…', async () => { await allSet(); state.busy = true; app.render(); }],
    ['Overview', 'Downloaded', async () => { await allSet(); state.savedSig = app.signature(); state.savedAs = state.preview?.filename || ''; app.render(); }],
    ['Columns', 'Resolve missing columns', async () => { await withCsv({ settings: SETTINGS }); app.go('pick', { pickKeys: problems().map((r) => r.key) }); }],
    ['Columns', 'Missing columns — some decided', async () => {
      await withCsv({ settings: SETTINGS });
      const keys = problems().map((r) => r.key);
      state.bindings[keys[0]] = 'csv:Market';
      app.skip([keys[1]]);
      app.go('pick', { pickKeys: keys });
    }],
    ['Columns', 'Pick a column (search)', async () => { await withCsv({ settings: SETTINGS }); openSearch(app, state.dataset, problems()[0], 'pick'); }],
    ['Columns', 'Search with a query', async () => {
      await withCsv({ settings: SETTINGS });
      openSearch(app, state.dataset, problems()[0], 'pick');
      inputs.searchInput.value = state.searchQuery = 'sum';
      app.paintSearch();
    }],
    ['Columns', 'Columns that came out empty', open('empty')],
    ['Columns', 'All columns', open('all')],
    ['Preview', 'Excel preview', async () => { await allSet(); app.go('preview'); }],
    ['People', 'Unknown authors — lookup', open('authors')],
    ['People', 'Authors left out by the filter', open('outside')],
    ['Settings', 'Project groups', open('groups')],
    ['Settings', 'Settings', open('settings')],
    ['Settings', 'Reporting period', open('period')],
    ['Settings', 'About this file', async () => { await withCsv({ settings: SETTINGS }, CSV_NOTES); app.go('notes'); }]
  ];

  let at = 0;
  const select = h('select', { class: 'tdev__select', 'aria-label': 'Scenario', onchange: (e) => run(Number(e.target.value)) });
  for (const group of [...new Set(SCENARIOS.map((s) => s[0]))]) {
    select.append(h('optgroup', { label: group }, ...SCENARIOS.map((s, i) => [s, i]).filter(([s]) => s[0] === group)
      .map(([s, i]) => h('option', { value: String(i), text: s[1] }))));
  }
  const run = async (i) => {
    at = (i + SCENARIOS.length) % SCENARIOS.length;
    select.value = String(at);
    try { await SCENARIOS[at][2](); } catch (e) { console.error(e); }
    window.scrollTo(0, 0);
  };
  document.body.append(h('div', { class: 'tdev', role: 'toolbar', 'aria-label': 'Demo scenarios' },
    h('span', { class: 'tdev__label', text: 'Scenario' }),
    h('button', { class: 'tdev__nav', 'aria-label': 'Previous scenario', onclick: () => run(at - 1) }, '‹'),
    select,
    h('button', { class: 'tdev__nav', 'aria-label': 'Next scenario', onclick: () => run(at + 1) }, '›'),
    h('span', { class: 'tdev__count', text: `${SCENARIOS.length} scenarios` })));
  run(0);
}
