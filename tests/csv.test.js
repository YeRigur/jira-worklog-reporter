import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, detectDelimiter, decodeCsvBytes, readCsvTable } from '../src/core/csv.js';

test('quoted cells keep commas and doubled quotes', () => {
  assert.deepEqual(
    parseCsv('a,"b,c","d ""q"""\n1,2,3', ','),
    [['a', 'b,c', 'd "q"'], ['1', '2', '3']]
  );
});

test('a newline inside quotes stays in the cell', () => {
  assert.deepEqual(
    parseCsv('h1,h2\n"line1\nline2",x', ','),
    [['h1', 'h2'], ['line1\nline2', 'x']]
  );
});

test('CRLF endings and a trailing newline do not add rows', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n', ','), [['a', 'b'], ['1', '2']]);
});

test('empty cells are preserved, including trailing ones', () => {
  assert.deepEqual(parseCsv('a,,c,\n', ','), [['a', '', 'c', '']]);
});

test('readCsvTable strips the BOM and keeps repeated headers in order', () => {
  const table = readCsvTable('﻿Issue key,Log Work,Log Work\nAC-1,x,y\n');
  assert.deepEqual(table.headers, ['Issue key', 'Log Work', 'Log Work']);
  assert.deepEqual(table.rows, [['AC-1', 'x', 'y']]);
});

test('readCsvTable drops blank lines', () => {
  const table = readCsvTable('Issue key,Summary\nAC-1,One\n\nAC-2,Two\n\n');
  assert.deepEqual(table.rows, [['AC-1', 'One'], ['AC-2', 'Two']]);
});

test('delimiter is read from the header line only', () => {
  // Log Work cells are ';'-separated inside, which must not fool the detector.
  assert.equal(detectDelimiter('Issue key,Summary,Log Work\nA-1,x,";a;b;c"'), ',');
  assert.equal(detectDelimiter('Issue key;Summary;Log Work\nA-1;x;y'), ';');
});

test('readCsvTable parses a semicolon-separated file', () => {
  const table = readCsvTable('Issue key;Summary\nAC-1;"One; two"\n');
  assert.deepEqual(table.rows, [['AC-1', 'One; two']]);
});

test('UTF-8 bytes decode as UTF-8', () => {
  const bytes = new TextEncoder().encode('Summary,São Paulo – Zürich\n');
  assert.deepEqual(decodeCsvBytes(bytes), { text: 'Summary,São Paulo – Zürich\n', encoding: 'utf-8' });
});

test('bytes that are not valid UTF-8 fall back to windows-1252', () => {
  // 0xE9 is "é" in windows-1252 and an invalid lone byte in UTF-8 (Excel re-save).
  const bytes = new Uint8Array([0x43, 0x61, 0x66, 0xE9, 0x0A]);
  assert.deepEqual(decodeCsvBytes(bytes), { text: 'Café\n', encoding: 'windows-1252' });
});
