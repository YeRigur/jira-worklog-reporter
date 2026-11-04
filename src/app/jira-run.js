// Jira mode: open the Jira tab, wait for the bookmark, find the ticked people's
// accounts, then let the extension's export run through the bridge. Everything
// Jira answers is kept, so the preview, the Summary toggle and the download
// replay it. A new period, people or site asks for Start again.
import { openBridge } from './bridge-client.js';
import { createFetchCache } from '../core/fetch-cache.js';
import { resolveAccounts } from '../core/accounts.js';
import { buildJiraExportConfig } from '../core/export-config.js';
import { projectsFromSearch } from '../core/project-groups.js';
import { withSettings } from '../core/settings.js';
import { cleanSite } from '../core/format.js';
import { downloadFile } from '../ui/dom.js';

const SLOW_MS = 120000;
const browserConnect = (site) => openBridge({ site, open: (url, name) => window.open(url, name), events: window });

export function createJiraRun(app) {
  const { state, catalog } = app;
  let connect = browserConnect;
  let bridge = null;
  let cacheKey = '';
  let fields = null;
  let found = null;
  const cache = createFetchCache((input, init) => bridge.fetch(input, init));

  const site = () => cleanSite(state.site || state.settings.site);
  const runKey = () => JSON.stringify([site(), state.from, state.to, app.pickedEmails()]);
  const signature = () => JSON.stringify(['jira', runKey(), app.withSummary(), state.settingsRev]);
  const set = (patch) => { Object.assign(state.jira, patch); app.render(); };

  const config = () => exportConfig(app.pickedEmails(), found);

  // The Jira tab and its bookmark: reused while it is open, opened otherwise.
  async function ensureBridge() {
    if (bridge && !bridge.closed) return true;
    try { bridge = connect(site()); } catch (e) { set({ phase: 'error', message: e.message }); return false; }
    set({ phase: 'waiting', message: '', slow: false });
    const slow = setTimeout(() => { if (state.jira.phase === 'waiting') set({ slow: true }); }, SLOW_MS);
    try { await bridge.ready; return true; } catch (e) { set({ phase: 'error', message: e.message }); return false; } finally { clearTimeout(slow); }
  }

  async function loadFields() {
    if (fields) return fields;
    const res = await cache('/rest/api/3/field');
    if (!res.ok) throw new Error(`Jira didn’t list its fields (${res.status}).`);
    fields = await res.json();
    return fields;
  }

  const findPeople = async (emails) => {
    const got = await resolveAccounts(cache, emails, state.settings.accounts);
    app.rememberAccounts(got.accounts);
    return got;
  };

  const exportConfig = (emails, got) => buildJiraExportConfig({
    scriptsJson: withSettings(catalog, state.settings), site: site(), fields, dateFrom: state.from, dateTo: state.to,
    withSummary: app.withSummary(), meta: got.meta, teamEmails: emails,
    users: emails.map((e) => got.accounts[e]).filter(Boolean)
  });

  async function start() {
    const people = app.pickedEmails();
    if (!site() || !people.length || state.jira.phase === 'waiting' || state.jira.phase === 'running') return;
    if (cacheKey !== runKey()) { cache.clear(); cacheKey = runKey(); fields = null; }
    Object.assign(state, { preview: null, previewing: null, result: null, savedSig: '', savedAs: '' });
    state.jira.missing = [];
    state.jira.guessed = [];
    if (!(await ensureBridge())) return;
    set({ phase: 'running', message: 'Finding people in Jira…', slow: false });
    try {
      found = await findPeople(people);
      await loadFields();
    } catch (e) { set({ phase: 'error', message: e.message }); return; }
    if (!Object.keys(found.accounts).length) {
      set({ phase: 'error', message: 'None of the ticked people were found in this Jira.', missing: found.missing, guessed: found.guessed });
      return;
    }
    set({ phase: 'ready', message: '', missing: found.missing, guessed: found.guessed });
  }

  // A separate Excel for one group, downloaded right away. The main selection
  // and the main Excel stay as they are.
  async function groupReport(emails, label) {
    if (!site() || !emails.length || state.jira.report || state.jira.phase === 'running') return;
    const before = state.jira.phase === 'waiting' ? 'idle' : state.jira.phase;
    set({ report: label, reportNote: null });
    try {
      if (!(await ensureBridge())) return;
      set({ phase: before });
      const got = await findPeople(emails);
      set({ missing: [...new Set([...state.jira.missing, ...got.missing])], guessed: [...new Set([...state.jira.guessed, ...got.guessed])] });
      if (!Object.keys(got.accounts).length) throw new Error(`Nobody in ${label} was found in this Jira.`);
      await loadFields();
      const tag = String(label).replace(/[\\/:*?"<>|]+/g, '-');
      const made = await app.runOnce(exportConfig(emails, got), cache, `https://${site()}`, true,
        { progress: true, rename: (name) => name.replace(/(\.xlsx)?$/i, ` - ${tag}.xlsx`) });
      set({ reportNote: made.ok ? { ok: true, text: `Saved ${made.filename} to your Downloads folder.` } : { ok: false, text: made.message } });
    } catch (e) {
      set({ reportNote: { ok: false, text: e.message } });
    } finally {
      state.progress = '';
      set({ report: '' });
    }
  }

  function ensurePreview() {
    if (state.jira.phase !== 'ready' || state.busy) return;
    if (runKey() !== cacheKey) {
      Object.assign(state, { preview: null, result: null });
      state.jira.phase = 'idle';
      app.render();
      return;
    }
    const sig = signature();
    if (state.preview?.signature === sig || state.previewing) return;
    app.previewWith(sig, () => app.runOnce(config(), cache, `https://${site()}`, false, { progress: true }));
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
  const setConnect = (fn) => { connect = fn; bridge = null; };

  return { start, groupReport, ensurePreview, download, signature, projects, site, setConnect };
}
