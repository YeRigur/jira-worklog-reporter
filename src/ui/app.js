// Puts the page together: the state, its actions, the UI parts and pages, all
// on one `app` object they share. Nothing here decides anything — see app/ for
// what happens and ui/pages/ for what is shown.
//
// installXlsx / runExport are the extension's own xlsx-writer.js and
// worklogs-export.js (src/vendor/).
import { buildColumnTemplate } from '../core/template.js';
import { createState } from '../app/state.js';
import { createSettingsStore } from '../app/settings-store.js';
import { createConverter } from '../app/converter.js';
import { createJiraRun } from '../app/jira-run.js';
import { createComponents } from './components.js';
import { createInputs } from './inputs.js';
import { paintSearch } from './pages/search.js';
import { PAGES, mountShell, render, listenForDrops } from './render.js';

// The browser's storage, when the browser lets the page have it.
const browserStorage = () => { try { return globalThis.localStorage; } catch { return undefined; } };

export function startConverter({ scriptsJson, jql, installXlsx, runExport, root = document.getElementById('app'), storage = browserStorage() }) {
  const app = {
    catalog: scriptsJson, publicJql: jql, installXlsx, runExport, storage,
    template: buildColumnTemplate(scriptsJson),
    state: createState(),
    pages: PAGES,
    searchCtx: null
  };
  Object.assign(app, createConverter(app));
  Object.assign(app, createSettingsStore(app));
  // Jira mode and the CSV path share the preview, the download and the
  // signature the pages read; which one answers depends on the source.
  const csv = { ensurePreview: app.ensurePreview, download: app.download, signature: app.signature };
  app.jira = createJiraRun(app);
  const viaJira = () => app.state.source === 'jira';
  app.ensurePreview = () => (viaJira() ? app.jira.ensurePreview() : csv.ensurePreview());
  app.download = () => (viaJira() ? app.jira.download() : csv.download());
  app.signature = () => (viaJira() ? app.jira.signature() : csv.signature());
  Object.assign(app, createComponents(app));
  app.inputs = createInputs(app);
  app.paintSearch = () => paintSearch(app);

  const shell = mountShell(app, root);
  app.render = () => render(app, shell);
  listenForDrops(app);

  // Hook for automated checks of the page (tools/, tests/).
  const { state, load, parse } = app;
  window.__SL_TEST__ = { loadText: (name, text) => { state.files = [{ name, text, encoding: 'utf-8' }]; parse(); }, load, download: app.download, state, render: app.render, jira: app.jira, app };

  app.render();
  return app;
}
