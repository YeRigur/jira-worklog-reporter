import { test } from 'node:test';
import assert from 'node:assert/strict';
import { similarity, suggestFields, searchFields, fieldCoverage } from '../src/core/suggest.js';

const F = (name, id = `csv:${name}`) => ({ id, name, custom: true });
const FIELDS = [F('Root Cause Category'), F('RCA notes'), F('Time Spent', 'timespent'), F('Return rate'), F('Exception type'), F('Summary', 'summary')];

test('names that share words look alike; unrelated ones do not', () => {
  assert.ok(similarity('Root cause', 'Root Cause Category') >= 0.6);
  assert.ok(similarity('Return Rate counter', 'Return rate') >= 0.6);
  assert.ok(similarity('Exception Reason', 'Exception type') >= 0.5);
  assert.ok(similarity('Pick Up Time', 'Time Spent') < 0.34, 'one shared word out of three is not a match');
  assert.equal(similarity('Root cause', 'Summary'), 0);
});

test('word endings and case don’t matter, filler words don’t count', () => {
  assert.ok(similarity('Exception Reasons', 'exception reason') === 1);
  assert.ok(similarity('Number of the pages', 'Pages number') === 1);
});

test('suggestions come best first, leave out fields already in use, and stop at the limit', () => {
  assert.deepEqual(suggestFields('Root cause', FIELDS).map((f) => f.name), ['Root Cause Category']);
  assert.deepEqual(suggestFields('Return Rate counter', FIELDS).map((f) => f.name), ['Return rate']);
  assert.deepEqual(suggestFields('Root cause', FIELDS, { exclude: ['csv:Root Cause Category'] }), []);
  assert.deepEqual(suggestFields('Pick Up Time', FIELDS), []);
});

test('search finds a column by any part of its name', () => {
  assert.deepEqual(searchFields('root', FIELDS).map((f) => f.name), ['Root Cause Category']);
  assert.deepEqual(searchFields('RATE', FIELDS).map((f) => f.name), ['Return rate']);
  assert.deepEqual(searchFields('cause cat', FIELDS).map((f) => f.name), ['Root Cause Category']);
  assert.equal(searchFields('', FIELDS).length, FIELDS.length);
});

test('coverage counts the issues that carry a value, across repeated columns, with an example', () => {
  const dataset = {
    model: { specs: {
      'csv:Labels': { indices: [1, 2] },
      'csv:Empty': { indices: [3] },
      parent: { parts: { key: 4, summary: 5 } }
    } },
    issues: [
      { row: ['A-1', '', 'web', '', 'EP-1', 'Q3 epic'] },
      { row: ['A-2', 'ui', '', '', '', ''] },
      { row: ['A-3', '', '', ' ', '', ''] }
    ]
  };
  assert.deepEqual(fieldCoverage(dataset, 'csv:Labels'), { filled: 2, total: 3, sample: 'web' });
  assert.deepEqual(fieldCoverage(dataset, 'csv:Empty'), { filled: 0, total: 3, sample: '' });
  assert.deepEqual(fieldCoverage(dataset, 'parent'), { filled: 1, total: 3, sample: 'EP-1' });
  assert.deepEqual(fieldCoverage(dataset, 'nope'), { filled: 0, total: 3, sample: '' });
});
