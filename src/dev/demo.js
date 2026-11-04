// ?demo: every state the tool can be in, on synthetic data, one pick away — to
// judge a design on all of them. Jira is a fake holding the synthetic data
// (tests/support/fake-jira), and settings live in memory, so the demo never
// touches Jira or what this browser keeps for real use.
import { h } from '../ui/dom.js';
import { emptySettings } from '../core/settings.js';
import { openSearch } from '../ui/pages/search.js';
import { freshJira } from '../app/state.js';
import { fieldIdsFromCatalog } from '../core/export-config.js';
import { HEADERS, ROWS, PEOPLE } from '../../tests/fixtures/synthetic.js';
import { toCsv } from '../../tests/support/helpers.js';
import { createFakeJira } from '../../tests/support/fake-jira/fake-jira.js';
import { buildDataset } from '../../tests/support/fake-jira/dataset.js';

export function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
}

const AUGUST = { from: '2026-08-01', to: '2026-08-31' };
const FILTER = `worklogDate >= startOfMonth(-1) AND worklogDate < startOfMonth()\nAND worklogAuthor in ("${PEOPLE.A.email}", "${PEOPLE.B.email}", "${PEOPLE.C.email}")`;
const SETTINGS = {
  site: 'acme.atlassian.net', roster: [PEOPLE.A.email, PEOPLE.B.email, PEOPLE.C.email], jql: FILTER,
  projectGroups: { 'Group A': ['AC'] }, groupByDomain: { 'ua.example.com': 'Team UA', 'br.example.com': 'Team BR' }
};
const SETTINGS_DONE = { ...SETTINGS, projectGroups: { 'Group A': ['AC', 'ZZZ'], 'Group B': ['VC'] } };

const file = (name, text, type) => new File([text], name, { type });
const idle = async (app) => {
  for (let i = 0; i < 400 && app.state.previewing; i++) await new Promise((r) => setTimeout(r, 25));
};

export function startDemo(app, storage) {
  const { state, inputs } = app;

  // The fake Jira holds the synthetic issues; PEOPLE.C isn't in it, to show
  // someone not found.
  const person = (p) => ({ accountId: p.accountId, displayName: p.name, emailAddress: p.email });
  const everyone = [PEOPLE.A, PEOPLE.B, PEOPLE.C, PEOPLE.D];
  const dataset = buildDataset([{ name: 'demo.csv', text: toCsv(HEADERS, ROWS), encoding: 'utf-8' }], { fieldIds: fieldIdsFromCatalog(app.catalog) });
  const fakeJira = () => createFakeJira({
    dataset,
    authors: Object.fromEntries(everyone.map((p) => [p.key, person(p)])),
    people: [PEOPLE.A, PEOPLE.B].map(person)
  });

  const reset = async ({ settings = null, period = AUGUST } = {}) => {
    storage.clear();
    Object.assign(state, {
      settings: emptySettings(), settingsNote: null, settingsName: '', bindings: {}, skipped: [],
      site: '', withSummary: null, busy: false, progress: '', progressPct: 0, from: period.from, to: period.to,
      picked: null, jira: freshJira(), projectGroup: '', preview: null, previewing: null, result: null,
      savedSig: '', savedAs: '', page: 'main', pickKeys: [], emptyOk: false
    });
    inputs.siteInput.value = '';
    inputs.fromInput.value = period.from;
    inputs.toInput.value = period.to;
    app.jira.setConnect(fakeJira);
    state.settingsRev++;
    if (settings) await app.load([file('worklogs-settings-acme.json', JSON.stringify(settings), 'application/json')]);
    state.settingsNote = null;
    app.render();
  };
  // Start pressed and the bookmark clicked: the columns are up.
  const started = async (opts = { settings: SETTINGS }) => { await reset(opts); await app.jira.start(); };
  const built = async (opts) => { await started(opts); app.jira.build(); await idle(app); app.render(); };
  const problems = () => app.jira.columnsContext()?.problems || [];

  const SCENARIOS = [
    ['Start', 'No settings yet', () => reset()],
    ['Start', 'Settings loaded — ready to Start', () => reset({ settings: SETTINGS })],
    ['Start', 'One project group', async () => { await reset({ settings: SETTINGS }); state.projectGroup = 'Group A'; app.render(); }],
    ['Start', 'Waiting for the bookmark', async () => {
      await reset({ settings: SETTINGS });
      app.jira.setConnect(() => ({ ready: new Promise(() => {}), fetch: () => new Promise(() => {}), status() {}, close() {}, closed: false }));
      app.jira.start();
    }],
    ['Start', 'Bridge error', async () => {
      await reset({ settings: SETTINGS });
      app.jira.setConnect(() => { throw new Error('Your browser blocked the Jira tab. Allow pop-ups for this page, then press Start again.'); });
      await app.jira.start();
    }],
    ['Columns', 'Columns to check', () => started()],
    ['Columns', 'Resolve missing columns', async () => { await started(); app.go('pick', { pickKeys: problems().map((r) => r.key) }); }],
    ['Columns', 'Pick a Jira field (search)', async () => { await started(); const ctx = app.jira.columnsContext(); openSearch(app, ctx.ds, ctx.problems[0], 'pick'); }],
    ['Columns', 'All columns', async () => { await started(); app.go('all'); }],
    ['Excel', 'Excel ready', () => built()],
    ['Excel', 'Excel ready — one project group', async () => { await started(); state.projectGroup = 'Group A'; await app.jira.start(); app.jira.build(); await idle(app); app.render(); }],
    ['Excel', 'Preview', async () => { await built(); app.go('preview'); }],
    ['Excel', 'Columns that came out empty', async () => { await built(); app.go('empty'); }],
    ['Settings', 'Project groups', async () => { await built({ settings: SETTINGS_DONE }); app.go('groups'); }],
    ['Settings', 'Settings', async () => { await reset({ settings: SETTINGS }); app.go('settings'); }]
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
  run(1);
}
