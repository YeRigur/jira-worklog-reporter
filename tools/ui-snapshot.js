#!/usr/bin/env node
// Walks a page through its screens the way a person would — start page, then
// the CSV and settings, then every link off the main card — and prints the text
// of each screen. Two builds with the same output show the same page.
//
//   node tools/ui-snapshot.js <index.html | page.html> <from> <to> <export.csv> [settings.json …] > screens.txt

import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { installFakeDom, FakeNode } from '../tests/support/fake-dom.js';

const [page, from, to, csv, ...settings] = process.argv.slice(2);
if (!csv) { console.error('Usage: node tools/ui-snapshot.js <index.html | page.html> <from> <to> <export.csv> [settings.json …]'); process.exit(1); }

let hook;
let app;
const quiet = { ...console, log() {} };
if (basename(page) === 'index.html') {
  ({ app } = installFakeDom(globalThis));
  globalThis.console = quiet;
  await import(pathToFileURL(resolve(dirname(page), 'src/main.js')).href);
  hook = globalThis.__SL_TEST__;
} else {
  const script = /<script>\n([\s\S]*)\n<\/script>/.exec(readFileSync(page, 'utf8'))[1];
  const ctx = { console: quiet, setTimeout, clearTimeout, URL, Blob, File, TextEncoder, TextDecoder, Response, Headers, URLSearchParams };
  ({ app } = installFakeDom(ctx));
  ctx.Node = FakeNode;
  vm.runInContext(script, vm.createContext(ctx));
  hook = ctx.__SL_TEST__;
}

const card = () => app.find((n) => String(n.className).startsWith('tcard'));
// The build date differs between builds and isn't the page's behaviour.
// The time of the run ("Exported At") is in the preview, too.
const text = () => card().textContent.replace(/[Bb]uilt \d{4}-\d{2}-\d{2} \d{2}:\d{2}/, 'built …').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?!:)/g, '<time>');
const settle = async () => {
  for (let i = 0; i < 1200 && hook.state.previewing; i++) await new Promise((r) => setTimeout(r, 25));
  await new Promise((r) => setTimeout(r, 25));
};
const shot = (name) => process.stdout.write(`\n===== ${name} [${hook.state.page}]\n${text()}\n`);
const clickText = async (label, scope = card()) => {
  const b = scope.find((n) => n.tagName === 'button' && n.textContent.trim() === label);
  if (!b) return false;
  b.click();
  await settle();
  return true;
};
const back = async () => { const b = card().find((n) => n.className === 'tback'); if (b) { b.click(); await settle(); } };

const file = (path, type) => new File([readFileSync(path)], basename(path), { type });
hook.state.from = from;
hook.state.to = to;
shot('start, no file');
for (const s of settings) await hook.load([file(s, 'application/json')]);
shot('start, settings loaded');
await hook.load([file(csv, 'text/csv')]);
await settle();
shot('main');
for (const label of ['Change', 'Preview', 'Columns', 'Settings', 'View', 'Identify', 'Assign groups', 'Edit', 'Review', 'Resolve', 'Details']) {
  if (await clickText(label)) { shot(label); await back(); }
}
// Into a column: the search page and its result list.
if (await clickText('Columns')) {
  const first = card().find((n) => n.tagName === 'button' && String(n.className).startsWith('tcol'));
  if (first) { first.click(); await settle(); shot('search'); }
  await back(); await back();
}
shot('main again');
process.exit(0);
