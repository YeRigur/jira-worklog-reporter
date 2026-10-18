#!/usr/bin/env node
// Runs the page — the module site (index.html) or a one-file build — under
// Node, drops the given settings and CSV on it the way a person would, and
// writes the Excel it makes. Used to check that two builds give the same file.
//
//   node tools/run-page.js <index.html | page.html> <out.xlsx> <from> <to> <export.csv> [settings.json …]

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { installFakeDom } from '../tests/support/fake-dom.js';

const [page, out, from, to, csv, ...settings] = process.argv.slice(2);
if (!csv) {
  console.error('Usage: node tools/run-page.js <index.html | page.html> <out.xlsx> <from> <to> <export.csv> [settings.json …]');
  process.exit(1);
}

let hook;
const quiet = { ...console, log() {} };
if (basename(page) === 'index.html') {
  installFakeDom(globalThis);
  globalThis.console = quiet;
  await import(pathToFileURL(resolve(dirname(page), 'src/main.js')).href);
  hook = globalThis.__SL_TEST__;
} else {
  const html = readFileSync(page, 'utf8');
  const script = /<script>\n([\s\S]*)\n<\/script>/.exec(html)[1];
  const ctx = { console: quiet, setTimeout, clearTimeout, URL, Blob, File, TextEncoder, TextDecoder, Response, Headers, URLSearchParams };
  installFakeDom(ctx);
  vm.runInContext(script, vm.createContext(ctx));
  hook = ctx.__SL_TEST__;
}

const file = (path, type) => new File([readFileSync(path)], basename(path), { type });
hook.state.from = from;
hook.state.to = to;
for (const s of settings) await hook.load([file(s, 'application/json')]);
await hook.load([file(csv, 'text/csv')]);
// The page builds the workbook for its preview by itself; the download hands
// over that same file.
for (let i = 0; i < 1200 && (hook.state.previewing || !hook.state.preview); i++) await new Promise((r) => setTimeout(r, 50));
const p = hook.state.preview;
if (!p || !p.ok || !p.blob) { console.error('No workbook:', p?.message || hook.state.error?.message || hook.state.result?.message); process.exit(1); }
writeFileSync(out, Buffer.from(await p.blob.arrayBuffer()));
console.error(`${basename(page)} → ${out} (${p.filename})`);
process.exit(0);
