// Jira mode: open the Jira tab, wait for the bookmark, find the ticked people's
// accounts and Jira's fields, let the person check the columns, then let the
// extension's export run through the bridge. Everything Jira answers is kept,
// so the preview, the Summary toggle and the download replay it. A new period,
// people, project group or site asks for Start again. What goes on is shown in
// the card over the Jira tab too.
import { openBridge } from './bridge-client.js';
import { jiraBridge } from '../config/jira-bridge.js';
import { createFetchCache } from '../core/fetch-cache.js';
import { scopedFetch } from '../core/jql-scope.js';
import { resolveAccounts } from '../core/accounts.js';
import { buildJiraExportConfig, jiraModel, jiraBindings } from '../core/export-config.js';
import { resolveTemplate } from '../core/template.js';
import { problemsOf, settled } from '../core/column-choice.js';
import { fieldCoverage } from '../core/coverage.js';
import { projectsFromSearch } from '../core/project-groups.js';
import { withSettings } from '../core/settings.js';
import { cleanSite } from '../core/format.js';
import { downloadFile } from '../ui/dom.js';

const DONE_TEXT = 'All done — you can close this tab and check the report on the export page.';
const browserConnect = (site) => openBridge({ site, open: (url, name) => window.open(url, name), events: window });
// "worklogs_2026-10.xlsx" + ["Team B", "Group X"] → "worklogs_2026-10 - Team B - Group X.xlsx"
const tagged = (tags) => {
  const clean = tags.filter(Boolean).map((t) => String(t).replace(/[\\/:*?"<>|]+/g, '-'));
  return clean.length ? (name) => name.replace(/(\.xlsx)?$/i, ` - ${clean.join(' - ')}.xlsx`) : null;
};

export function createJiraRun(app) {
  const { state, catalog } = app;
  let connect = browserConnect;
  let bridge = null;
  let bridgeSite = '';
  let cacheKey = '';
  let fields = null;
  let found = null;
  let sample = [];
  const cache = createFetchCache((input, init) => bridge.fetch(input, init));

  const site = () => cleanSite(state.site || state.settings.site);
  const projectKeys = () => (state.projectGroup && state.settings.projectGroups?.[state.projectGroup]) || [];
  const runFetch = () => scopedFetch(cache, projectKeys());
  const runKey = () => JSON.stringify([site(), state.from, state.to, app.pickedEmails(), state.projectGroup || '']);
  const signature = () => JSON.stringify(['jira', runKey(), app.withSummary(), state.settingsRev]);
  const set = (patch) => { Object.assign(state.jira, patch); app.render(); };
  const tell = (payload) => { if (bridge && !bridge.closed) bridge.status?.(payload); };

  // The columns pages read this: Jira's fields as the "file", the sample
  // issues for how full each one is, and the report's columns against them.
  function columnsContext() {
    if (!fields) return null;
    const ds = { site: site(), model: jiraModel(fields), issues: sample };
    const rows = resolveTemplate(app.template, ds, state.bindings);
    const problems = problemsOf(rows);
    const memo = new Map();
    const cov = (id) => {
      if (!memo.has(id)) memo.set(id, fieldCoverage(sample, id));
      return memo.get(id);
    };
    return { ds, rows, problems, blocked: !settled(problems, state.skipped), empties: app.emptyNow(), cov };
  }

  // Columns attached by hand were made on a CSV ("csv:<name>"): here they
  // stand for the Jira field of that name. What doesn't match stays as it is.
  const loadColumns = () => {
    app.reloadSiteChoices();
    state.bindings = { ...state.bindings, ...jiraBindings(state.bindings, fields) };
  };

  // Up to 100 of the people's issues with every field: no worklogs yet, just
  // enough to show what each field holds.
  async function loadSample(got) {
    const ids = Object.values(got.accounts).slice(0, 80).map((id) => `"${id}"`).join(', ');
    const jql = `worklogDate >= "${state.from}" AND worklogDate <= "${state.to}" AND worklogAuthor IN (${ids})`;
    const res = await runFetch()('/rest/api/3/search/jql', { method: 'POST', body: JSON.stringify({ jql, maxResults: 100, fields: ['*all'] }) });
    sample = res.ok ? ((await res.json()).issues || []) : [];
  }

  // The Jira tab and its bookmark: reused while it is open, opened otherwise.
  async function ensureBridge() {
    // A bridge to another site is no use: open the new one.
    if (bridge && !bridge.closed && bridgeSite === site()) return true;
    if (bridge && !bridge.closed) bridge.close();
    bridgeSite = site();
    try { bridge = connect(site()); } catch (e) { set({ phase: 'error', message: e.message }); return false; }
    set({ phase: 'waiting', message: '', slow: false });
    const slow = setTimeout(() => { if (state.jira.phase === 'waiting') set({ slow: true }); }, jiraBridge.slowAfterMs);
    try { await bridge.ready; return true; } catch (e) {
      if (e.code === 'old-bridge') state.bridgeOpen = true;
      set({ phase: 'error', message: e.message });
      return false;
    } finally { clearTimeout(slow); }
  }

  async function loadFields() {
    if (fields) return fields;
    const res = await cache('/rest/api/3/field');
    if (!res.ok) throw new Error(`Jira didn’t list its fields (${res.status}).`);
    fields = await res.json();
    return fields;
  }

  const findPeople = async (emails) => {
    // Accounts found before, and the people an older settings file names with one.
    const fromPeople = Object.values(state.settings.people || {})
      .filter((p) => p.email && p.accountId && p.accountId !== 'unknown')
      .map((p) => [p.email, p.accountId]);
    const got = await resolveAccounts(cache, emails, { ...Object.fromEntries(fromPeople), ...state.settings.accounts });
    app.rememberAccounts(got.accounts);
    return got;
  };

  const exportConfig = (emails, got) => buildJiraExportConfig({
    scriptsJson: withSettings(catalog, state.settings), site: site(), fields, bindings: state.bindings,
    dateFrom: state.from, dateTo: state.to, withSummary: app.withSummary(), meta: got.meta, teamEmails: emails,
    users: emails.map((e) => got.accounts[e]).filter(Boolean)
  });
  const onProgress = (message, pct) => tell({ text: message, pct: typeof pct === 'number' ? pct : undefined });

  // Start: connect, find the people and Jira's fields, then stop at the
  // columns — the worklogs are read once the person says Build Excel.
  async function start() {
    const people = app.pickedEmails();
    if (!site() || !people.length || state.jira.phase === 'waiting' || state.jira.phase === 'running') return;
    if (cacheKey !== runKey()) { cache.clear(); cacheKey = runKey(); }
    Object.assign(state, { preview: null, previewing: null, result: null, savedSig: '', savedAs: '', progress: '', progressPct: 0 });
    state.jira.missing = [];
    state.jira.guessed = [];
    state.jira.done = false;
    if (!(await ensureBridge())) return;
    set({ phase: 'running', message: 'Finding people in Jira…', slow: false });
    tell({ text: 'Finding people in Jira…', pct: 3 });
    try {
      found = await findPeople(people);
      await loadFields();
      tell({ text: 'Looking at a few issues to check the columns…', pct: 4 });
      await loadSample(found);
      loadColumns();
    } catch (e) {
      set({ phase: 'error', message: e.message });
      tell({ error: true, text: e.message });
      return;
    }
    if (!Object.keys(found.accounts).length) {
      const message = 'None of the ticked people were found in this Jira.';
      set({ phase: 'error', message, missing: found.missing, guessed: found.guessed });
      tell({ error: true, text: message });
      return;
    }
    set({ phase: 'mapping', message: '', missing: found.missing, guessed: found.guessed });
    tell({ text: 'Check the columns on the export page, then press Build Excel.', pct: 5 });
  }

  // Build Excel: the columns are settled — read the worklogs and make the file.
  function build() {
    if (state.jira.phase !== 'mapping') return;
    set({ phase: 'ready' });
  }

  function ensurePreview() {
    const { phase } = state.jira;
    if ((phase !== 'ready' && phase !== 'mapping') || state.busy) return;
    if (runKey() !== cacheKey) {
      Object.assign(state, { preview: null, result: null });
      state.jira.phase = 'idle';
      app.render();
      return;
    }
    if (phase !== 'ready') return;
    const sig = signature();
    if (state.preview?.signature === sig || state.previewing) return;
    app.previewWith(sig, () => app.runOnce(config(), runFetch(), `https://${site()}`, false, { progress: true, onProgress, rename: tagged([state.projectGroup]) })
      .then((made) => {
        state.jira.done = Boolean(made.ok);
        tell(made.ok ? { done: true, text: DONE_TEXT } : { error: true, text: made.message });
        return made;
      }));
  }
  const config = () => exportConfig(app.pickedEmails(), found);

  // A separate Excel for one group of people, downloaded right away. The main
  // selection and the main Excel stay as they are; the project group applies.
  async function groupReport(emails, label) {
    if (!site() || !emails.length || state.jira.report || state.jira.phase === 'running') return;
    const before = state.jira.phase === 'waiting' ? 'idle' : state.jira.phase;
    set({ report: label, reportNote: null });
    try {
      if (!(await ensureBridge())) return;
      set({ phase: before });
      tell({ text: `Finding ${label} in Jira…`, pct: 3 });
      const got = await findPeople(emails);
      set({ missing: [...new Set([...state.jira.missing, ...got.missing])], guessed: [...new Set([...state.jira.guessed, ...got.guessed])] });
      if (!Object.keys(got.accounts).length) throw new Error(`Nobody in ${label} was found in this Jira.`);
      await loadFields();
      if (!Object.keys(state.bindings).length) loadColumns();
      const made = await app.runOnce(exportConfig(emails, got), runFetch(), `https://${site()}`, true,
        { progress: true, onProgress, rename: tagged([label, state.projectGroup]) });
      if (!made.ok) throw new Error(made.message);
      set({ reportNote: { ok: true, text: `Saved ${made.filename} to your Downloads folder.` } });
      tell({ done: true, text: DONE_TEXT });
    } catch (e) {
      set({ reportNote: { ok: false, text: e.message } });
      tell({ error: true, text: e.message });
    } finally {
      state.progress = '';
      set({ report: '' });
    }
  }

  function download() {
    const ready = state.preview;
    if (!(ready && ready.ok && ready.blob && ready.signature === signature())) return;
    downloadFile(ready.filename, ready.blob);
    state.savedSig = ready.signature;
    state.savedAs = ready.filename;
    state.result = { ok: true, message: ready.message };
    app.render();
  }

  const projects = () => projectsFromSearch(cache.entries());
  const setConnect = (fn) => { connect = fn; bridge = null; bridgeSite = ''; };

  return { start, build, groupReport, ensurePreview, download, signature, projects, site, setConnect, columnsContext };
}
