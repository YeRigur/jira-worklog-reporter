// The page starts here: the public catalog, the default filter and the
// extension's own export code go into the converter.
import { catalog } from './config/catalog.js';
import { defaultJql } from './config/defaults.js';
import { installXlsxWriter } from './vendor/xlsx-writer.js';
import { runWorklogsExport } from './vendor/worklogs-export.js';
import { startConverter } from './ui/app.js';

// ?demo walks through every state on synthetic data, with settings kept in memory.
const demo = new URLSearchParams(location.search).has('demo') ? await import('./dev/demo.js') : null;
const storage = demo ? demo.memoryStorage() : undefined;

const app = startConverter({ scriptsJson: catalog, jql: defaultJql, installXlsx: installXlsxWriter, runExport: runWorklogsExport, storage });
if (demo) demo.startDemo(app, storage);
