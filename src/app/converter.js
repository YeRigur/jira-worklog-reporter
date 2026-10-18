// From the dropped CSV to the Excel: read the files, build the workbook with
// the extension's own export code, keep it for the preview, hand it over on
// download.
import { decodeCsvBytes } from '../core/csv.js';
import { buildDataset } from '../core/dataset.js';
import { createJiraEmulator } from '../core/emulator.js';
import { authorMetadata, authorsIn } from '../core/people.js';
import { fieldIdsFromCatalog, exportDefaults, buildExportConfig } from '../core/export-config.js';
import { resolveTemplate } from '../core/template.js';
import { rewriteExportMessage } from '../core/messages.js';
import { buildPreview, emptyColumns } from '../core/preview.js';
import { withSettings, emailsIn } from '../core/settings.js';
import { baseJql, periodJql } from '../core/filter-jql.js';
import { problemsOf, settled } from '../core/column-choice.js';
import { cleanSite } from '../core/format.js';
import { downloadFile, pickFiles } from '../ui/dom.js';

export function createConverter(app) {
  const { state, catalog, template, installXlsx, runExport } = app;

  const siteOf = () => state.dataset?.site || cleanSite(state.site);
  const summaryDefault = () => exportDefaults(catalog, { site: siteOf(), fields: state.dataset?.model.fields || [] }).sheets.includes('summary');
  const withSummary = () => (state.withSummary === null ? summaryDefault() : state.withSummary);

  // The extension's data with the team's private part put back in.
  const fullJson = () => withSettings(catalog, state.settings);
  const people = (dataset) => authorMetadata(dataset, fullJson(), state.settings.people);
  // The filter's people: only their worklogs go to the Excel, as the extension
  // keeps only the developers it was given. No people in the filter — everyone.
  const filterEmails = () => emailsIn(state.settings.jql);
  const keptAuthors = (dataset) => (filterEmails().length ? authorsIn(people(dataset).meta, filterEmails()) : null);
  const teamJql = (from = state.from, to = state.to) => periodJql(baseJql(state.settings, app.publicJql), from, to);

  // ---------- one run of the extension's export ----------

  let xlsxOriginal = null;
  // The preview and the download are the same run: the extension's code builds
  // the workbook and the page keeps the sheets it hands the writer, so what the
  // table shows is the file itself. `save` decides whether it lands on disk.
  // The extension's code talks through window globals, so two runs at once would
  // write into each other. Every run waits for the one before it.
  let queue = Promise.resolve();
  const runOnce = (config, fetch, origin, save) => {
    const run = () => startRun(config, fetch, origin, save);
    queue = queue.then(run, run);
    return queue;
  };

  const startRun = (config, fetch, origin, save) => {
    installXlsx();
    if (!xlsxOriginal) xlsxOriginal = window.__SIMPLELIFE_XLSX__;
    const made = { sheets: [], filename: '', blob: null };
    window.__SIMPLELIFE_XLSX__ = {
      createWorkbookBlob: (specs) => { made.sheets = specs; return xlsxOriginal.createWorkbookBlob(specs); },
      downloadBlob: (filename, blob) => {
        made.filename = filename;
        made.blob = blob;
        if (save) downloadFile(filename, blob);
      }
    };
    return new Promise((resolve) => {
      window.__SIMPLELIFE__ = {
        config: { 'jira-worklogs-export': config },
        notifyProgress: (id, message) => { if (save) { state.progress = message; app.render(); } },
        notifyProgressDone: () => {},
        notifySuccess: (id, message) => resolve({ ...made, ok: true, message }),
        notifyError: (id, message) => resolve({ ...made, ok: false, message: rewriteExportMessage(message) })
      };
      runExport(fetch, { origin });
    });
  };

  const buildWorkbook = (save) => {
    const dataset = { ...state.dataset, site: siteOf(), origin: `https://${siteOf()}` };
    const { meta } = people(dataset);
    const authors = Object.fromEntries(Object.entries(meta)
      .map(([key, m]) => [key, { accountId: key, displayName: m.displayName, emailAddress: m.email }]));
    const config = buildExportConfig({
      scriptsJson: fullJson(), dataset, meta, dateFrom: state.from, dateTo: state.to, withSummary: withSummary(), bindings: state.bindings,
      users: keptAuthors(dataset)
    });
    // The JQL's people, including those with no worklog in this CSV.
    config._teamEmails = filterEmails();
    return runOnce(config, createJiraEmulator({ dataset, authors, origin: dataset.origin }), dataset.origin, save);
  };

  // Everything that would change the file. The preview is rebuilt when it moves.
  const signature = () => JSON.stringify([
    state.files.map((f) => `${f.name}:${f.text.length}`), state.from, state.to, siteOf(), withSummary(), state.bindings, state.settingsRev
  ]);

  function ensurePreview() {
    const sig = signature();
    if (!state.dataset || !siteOf() || state.busy) return;
    // One run at a time; when it lands, render() calls back for the latest state.
    if (state.preview?.signature === sig || state.previewing) return;
    state.previewing = sig;
    const keep = (made) => {
      state.previewing = null;
      state.preview = { signature: sig, ...made, sheets: buildPreview(made.sheets || []) };
      if (state.previewSheet >= state.preview.sheets.length) state.previewSheet = 0;
      app.render();
    };
    buildWorkbook(false).then(keep, (e) => keep({ ok: false, message: e.message }));
  }

  async function download() {
    const ds = state.dataset;
    if (!ds || state.busy) return;
    if (!settled(problemsOf(resolveTemplate(template, ds, state.bindings)), state.skipped)) return;
    if (!siteOf()) {
      state.result = { ok: false, message: 'Enter the Jira site first — it’s used for the “Project url” column.' };
      app.render();
      return;
    }
    // The preview already built this exact file — hand over that blob.
    const ready = state.preview;
    if (ready && ready.ok && ready.blob && ready.signature === signature()) {
      downloadFile(ready.filename, ready.blob);
      state.savedSig = ready.signature;
      state.savedAs = ready.filename;
      state.result = { ok: true, message: ready.message };
      app.render();
      return;
    }
    state.busy = true;
    state.progress = 'Building the Excel…';
    state.result = null;
    app.render();
    try {
      state.result = await buildWorkbook(true);
      if (state.result.ok) {
        state.savedSig = signature();
        state.savedAs = state.result.filename;
      }
    } catch (e) {
      state.result = { ok: false, message: e.message };
    }
    state.busy = false;
    app.render();
  }

  // ---------- files in ----------

  function parse() {
    Object.assign(state, {
      error: null, result: null, withSummary: null, preview: null, previewing: null, previewSheet: 0,
      savedSig: '', savedAs: '', page: 'main', pickKeys: [], emptyOk: false
    });
    try {
      state.dataset = buildDataset(state.files, { fieldIds: fieldIdsFromCatalog(catalog), datePattern: state.datePattern });
    } catch (e) {
      state.dataset = null;
      state.error = { message: e.message, code: e.code, sample: e.sample };
    }
    if (state.dataset) app.reloadSiteChoices();
    app.render();
  }

  // Dropped or picked files: settings (.json) first, then the CSVs.
  async function load(files) {
    const json = files.filter((f) => /\.json$/i.test(f.name) || f.type === 'application/json');
    for (const f of json) app.loadSettingsText(f.name, await f.text());
    const csv = files.filter((f) => /\.csv$/i.test(f.name) || f.type === 'text/csv');
    if (!csv.length) {
      if (!json.length) {
        state.dataset = null;
        state.error = { message: 'Pick a .csv file exported from Jira.' };
      }
      app.render();
      return;
    }
    state.files = await Promise.all(csv.map(async (f) => ({ name: f.name, ...decodeCsvBytes(new Uint8Array(await f.arrayBuffer())) })));
    parse();
  }

  const choose = async () => load(await pickFiles());
  const chooseSettings = async () => load(await pickFiles('.json,application/json'));

  const startOver = () => {
    Object.assign(state, {
      files: [], dataset: null, error: null, preview: null, result: null,
      savedSig: '', savedAs: '', page: 'main', emptyOk: false, pickKeys: []
    });
    app.render();
  };

  // Columns that reached the file with nothing in them. The template can only
  // see whether a column has a source; this is what actually came out.
  const emptyNow = () => (state.preview?.ok ? emptyColumns(state.preview.sheets) : []);
  const fileNames = () => state.files.map((f) => f.name).join(', ');

  return {
    siteOf, withSummary, people, filterEmails, keptAuthors, teamJql, signature, ensurePreview,
    download, parse, load, choose, chooseSettings, startOver, emptyNow, fileNames
  };
}
