// Runs the extension's own xlsx-writer.js and worklogs-export.js (src/vendor/)
// against a fetch implementation, and keeps what they hand the writer.
import { installXlsxWriter } from '../../src/vendor/xlsx-writer.js';
import { runWorklogsExport } from '../../src/vendor/worklogs-export.js';

const quiet = { log() {}, warn() {}, info() {}, error: (...a) => console.error(...a) };

export function runExtensionExport({ config, fetch, origin }) {
  globalThis.window ??= globalThis;
  const sheets = [];
  const downloads = [];
  delete window.__SIMPLELIFE_XLSX__;
  installXlsxWriter();
  const real = window.__SIMPLELIFE_XLSX__;
  window.__SIMPLELIFE_XLSX__ = {
    createWorkbookBlob: (specs) => { sheets.push(...specs); return real.createWorkbookBlob(specs); },
    downloadBlob: (name, blob) => downloads.push({ name, blob })
  };
  const console0 = globalThis.console;
  globalThis.console = { ...console0, ...quiet };
  return new Promise((resolve) => {
    const done = (ok) => (id, message) => { globalThis.console = console0; resolve({ ok, message, sheets, downloads }); };
    window.__SIMPLELIFE__ = {
      config: { 'jira-worklogs-export': config },
      notifyProgress() {},
      notifyProgressDone() {},
      notifySuccess: done(true),
      notifyError: done(false)
    };
    runWorklogsExport(fetch, { origin });
  });
}
