// Runs the extension's own export code and keeps what it made: the workbook
// for the preview, handed over on download. Also the settings file in and out
// of the page. Jira mode (jira-run.js) decides what to run and when.
import { exportDefaults } from '../core/export-config.js';
import { rewriteExportMessage } from '../core/messages.js';
import { buildPreview, emptyColumns } from '../core/preview.js';
import { hoursAsText } from '../core/hour-cells.js';
import { cleanSite } from '../core/format.js';
import { downloadFile, pickFiles } from '../ui/dom.js';
import { messages } from '../config/texts.js';

export function createConverter(app) {
  const { state, catalog, installXlsx, runExport } = app;

  // The Jira site: typed on the page, else the settings file's.
  const siteOf = () => cleanSite(state.site || state.settings.site);
  const summaryDefault = () => exportDefaults(catalog, { site: siteOf(), fields: [] }).sheets.includes('summary');
  const withSummary = () => (state.withSummary === null ? summaryDefault() : state.withSummary);

  // ---------- one run of the extension's export ----------

  let xlsxOriginal = null;
  // The preview and the download are the same run: the extension's code builds
  // the workbook and the page keeps the sheets it hands the writer, so what the
  // table shows is the file itself. `save` decides whether it lands on disk.
  // The extension's code talks through window globals, so two runs at once would
  // write into each other. Every run waits for the one before it.
  let queue = Promise.resolve();
  const runOnce = (config, fetch, origin, save, { progress = save, rename = null, onProgress = null } = {}) => {
    const run = () => startRun(config, fetch, origin, save, progress, rename, onProgress);
    queue = queue.then(run, run);
    return queue;
  };

  const startRun = (config, fetch, origin, save, progress, rename, onProgress) => {
    installXlsx();
    if (!xlsxOriginal) xlsxOriginal = window.__SIMPLELIFE_XLSX__;
    const made = { sheets: [], filename: '', blob: null };
    window.__SIMPLELIFE_XLSX__ = {
      createWorkbookBlob: (specs) => { made.sheets = hoursAsText(specs); return xlsxOriginal.createWorkbookBlob(made.sheets); },
      downloadBlob: (filename, blob) => {
        made.filename = rename ? rename(filename) : filename;
        made.blob = blob;
        if (save) downloadFile(made.filename, blob);
      }
    };
    return new Promise((resolve) => {
      window.__SIMPLELIFE__ = {
        config: { 'jira-worklogs-export': config },
        notifyProgress: (id, message, pct) => {
          onProgress?.(message, pct);
          if (progress) { state.progress = message; state.progressPct = typeof pct === 'number' ? pct : state.progressPct; app.render(); }
        },
        notifyProgressDone: () => {},
        notifySuccess: (id, message) => resolve({ ...made, ok: true, message }),
        notifyError: (id, message) => resolve({ ...made, ok: false, message: rewriteExportMessage(message) })
      };
      runExport(fetch, { origin });
    });
  };

  // Runs one preview build and keeps what it made under its signature.
  function previewWith(sig, run) {
    state.previewing = sig;
    const keep = (made) => {
      state.previewing = null;
      state.preview = { signature: sig, ...made, sheets: buildPreview(made.sheets || []) };
      if (state.previewSheet >= state.preview.sheets.length) state.previewSheet = 0;
      app.render();
    };
    run().then(keep, (e) => keep({ ok: false, message: e.message }));
  }

  // ---------- the settings file ----------

  // Dropped or picked: on the start screen a settings file takes the place of
  // the one kept; the Settings page adds to it (a second team's groups).
  async function load(files) {
    const json = files.filter((f) => /\.json$/i.test(f.name) || f.type === 'application/json');
    const apply = state.page === 'settings' ? app.loadSettingsText : app.replaceSettingsText;
    for (const f of json) apply(f.name, await f.text());
    if (!json.length && files.length) state.settingsNote = { ok: false, text: messages.dropSettings };
    app.render();
  }

  const chooseSettings = async () => load(await pickFiles('.json,application/json'));
  // The start screen's button: always a replacement, one file.
  const switchSettings = async () => {
    const [f] = await pickFiles('.json,application/json');
    if (!f) return;
    app.replaceSettingsText(f.name, await f.text());
    app.render();
  };

  // Columns that reached the file with nothing in them.
  const emptyNow = () => (state.preview?.ok ? emptyColumns(state.preview.sheets) : []);

  return { siteOf, withSummary, runOnce, previewWith, load, chooseSettings, switchSettings, emptyNow };
}
