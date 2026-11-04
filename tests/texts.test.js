// Hints and messages come from src/config/texts.js, not from the pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { hints, messages } from '../src/config/texts.js';

const PAGES = new URL('../src/ui/pages/', import.meta.url);

test('no page writes a hint or a note itself', () => {
  for (const name of readdirSync(PAGES)) {
    const code = readFileSync(new URL(name, PAGES), 'utf8');
    assert.doesNotMatch(code, /hint\(\s*['`]/, `${name}: hint(…) with a literal`);
    assert.doesNotMatch(code, /class: '(thelp|tnote|tjv__reason)', text: ['`]/, `${name}: a hint with a literal`);
  }
});

test('the words are short', () => {
  // One stand-in that reads as a word and joins as a list.
  const x = Object.assign(['XX'], { toString: () => 'XX' });
  const all = (o) => Object.values(o).flatMap((v) => (typeof v === 'object' ? all(v) : [typeof v === 'function' ? v(x, x, x) : v]));
  for (const text of [...all(hints), ...all(messages)]) assert.ok(String(text).length <= 100, text);
});
