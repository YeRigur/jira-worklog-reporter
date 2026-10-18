#!/usr/bin/env node
// Compares two worklogs.xlsx files cell by cell — e.g. one from the SimpleLife
// extension and one from the CSV tool for the same period:
//
//   node standalone/tools/compare.mjs extension.xlsx tool.xlsx
//
// Datetime values are compared to the minute (a CSV has no seconds); use
// --exact to compare them fully. Same rows in another order count as a match.

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function unzip(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('Not an .xlsx file (no zip directory).');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const unescapeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');

const columnIndex = (ref) => {
  const letters = /^[A-Z]+/.exec(ref)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export function readXlsx(buffer) {
  const files = unzip(Buffer.from(buffer));
  const read = (path) => files.get(path)?.toString('utf8') || '';
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rels = Object.fromEntries([...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
    const id = /Id="([^"]+)"/.exec(m[0])[1];
    const target = /Target="([^"]+)"/.exec(m[0])[1];
    return [id, target.startsWith('/') ? target.slice(1) : `xl/${target}`];
  }));
  const sheets = [...read('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const name = unescapeXml(/name="([^"]*)"/.exec(m[0])[1]);
    const rid = /r:id="([^"]+)"/.exec(m[0])[1];
    const rows = [];
    for (const r of read(rels[rid]).matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs)[1];
        const type = (/\bt="([^"]+)"/.exec(attrs) || [])[1] || 'n';
        const inner = c[2] || '';
        const v = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1];
        let value;
        if (type === 's') value = shared[Number(v)];
        else if (type === 'b') value = v === '1';
        else if (type === 'inlineStr') value = textOf(inner);
        else if (type === 'str' || type === 'e') value = unescapeXml(v ?? '');
        else value = v === undefined ? '' : Number(v);
        row[columnIndex(ref)] = value;
      }
      rows[Number(r[1]) - 1] = Array.from(row, (x) => (x === undefined ? '' : x));
    }
    return { name, rows: Array.from(rows, (x) => x || []) };
  });
  return { sheets };
}

const DATETIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):\d{2}(?:\.\d+)?([+-]\d{4}|Z)$/;
const normalize = (v, ignoreSeconds) => {
  if (ignoreSeconds && typeof v === 'string') {
    const m = DATETIME.exec(v);
    if (m) return `${m[1]}${m[2]}`;
  }
  return v;
};
const letter = (i) => { let s = ''; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

// `ignoreColumns`: headers whose values are left out — a timestamp of the run
// differs every time and isn't a difference in the data.
export function compareWorkbooks(a, b, { ignoreSeconds = true, ignoreColumns = [] } = {}) {
  const diffs = [];
  const notes = [];
  const names = [...new Set([...a.sheets.map((s) => s.name), ...b.sheets.map((s) => s.name)])];
  for (const name of names) {
    const sa = a.sheets.find((s) => s.name === name);
    const sb = b.sheets.find((s) => s.name === name);
    if (!sa || !sb) {
      diffs.push({ sheet: name, row: 0, column: '(sheet)', a: sa ? 'present' : 'missing', b: sb ? 'present' : 'missing' });
      continue;
    }
    const blank = (rows) => {
      const skip = new Set((rows[0] || []).map((h, i) => (ignoreColumns.includes(h) ? i : -1)).filter((i) => i >= 0));
      return rows.map((row, r) => (r === 0 ? row : row.map((v, i) => (skip.has(i) ? '' : v))));
    };
    const norm = (row) => row.map((v) => normalize(v, ignoreSeconds));
    const [ha = [], ...ra] = blank(sa.rows).map(norm);
    const [hb = [], ...rb] = blank(sb.rows).map(norm);
    const width = Math.max(ha.length, hb.length);
    for (let c = 0; c < width; c++) {
      if ((ha[c] ?? '') !== (hb[c] ?? '')) diffs.push({ sheet: name, row: 1, column: letter(c), a: ha[c] ?? '', b: hb[c] ?? '' });
    }
    const key = (row) => JSON.stringify(row.map((v) => (v === undefined ? '' : v)));
    const sameInOrder = ra.length === rb.length && ra.every((row, i) => key(row) === key(rb[i]));
    if (sameInOrder) continue;
    const sorted = (rows) => rows.map(key).sort().join('\n');
    if (ra.length === rb.length && sorted(ra) === sorted(rb)) {
      notes.push(`${name}: same rows, different order`);
      continue;
    }
    const rows = Math.max(ra.length, rb.length);
    for (let r = 0; r < rows; r++) {
      const x = ra[r];
      const y = rb[r];
      if (!x || !y) {
        diffs.push({ sheet: name, row: r + 2, column: '(row)', a: x ? key(x) : '(none)', b: y ? key(y) : '(none)' });
        continue;
      }
      const w = Math.max(x.length, y.length);
      for (let c = 0; c < w; c++) {
        if ((x[c] ?? '') !== (y[c] ?? '')) {
          diffs.push({ sheet: name, row: r + 2, column: String(ha[c] ?? letter(c)), a: x[c] ?? '', b: y[c] ?? '' });
        }
      }
    }
  }
  return { diffs, notes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const ignoreColumns = argv.flatMap((a, i) => (a === '--ignore' ? [argv[i + 1]] : []));
  const args = argv.filter((a, i) => a !== '--exact' && a !== '--ignore' && argv[i - 1] !== '--ignore');
  if (args.length !== 2) {
    console.error('Usage: node tools/compare.js a.xlsx b.xlsx [--exact] [--ignore "Column header" …]');
    process.exit(2);
  }
  const [a, b] = args.map((p) => readXlsx(readFileSync(p)));
  const { diffs, notes } = compareWorkbooks(a, b, { ignoreSeconds: !argv.includes('--exact'), ignoreColumns });
  for (const s of a.sheets) console.log(`${s.name}: ${Math.max(0, s.rows.length - 1)} rows vs ${Math.max(0, (b.sheets.find((x) => x.name === s.name)?.rows.length || 1) - 1)}`);
  for (const n of notes) console.log(`note: ${n}`);
  if (!diffs.length) {
    console.log('Match.');
  } else {
    console.log(`${diffs.length} difference(s):`);
    for (const d of diffs.slice(0, 50)) console.log(`  ${d.sheet} row ${d.row} [${d.column}]: ${JSON.stringify(d.a)} ≠ ${JSON.stringify(d.b)}`);
    if (diffs.length > 50) console.log(`  … and ${diffs.length - 50} more`);
    process.exit(1);
  }
}
