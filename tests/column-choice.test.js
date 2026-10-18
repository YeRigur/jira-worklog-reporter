import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/config/catalog.js';
import { buildColumnTemplate, resolveTemplate } from '../src/core/template.js';
import { isProblem, problemsOf, settled, defaultOf, usedFieldIds, pickable, currentChoice, leaveText } from '../src/core/column-choice.js';

const TEMPLATE = buildColumnTemplate(catalog);
const fields = [
  { id: 'summary', name: 'Summary' }, { id: 'csv:Volume', name: 'Volume' },
  { id: 'csv:Market', name: 'Market' }, { id: 'worklog', name: 'Log Work' }
];
const dataset = { model: { fields, specs: Object.fromEntries(fields.map((f) => [f.id, {}])) } };
const byKey = (rows) => Object.fromEntries(rows.map((r) => [r.key, r]));

test('missing and taken columns are the problems', () => {
  const rows = [{ key: 'a', status: 'missing' }, { key: 'b', status: 'taken' }, { key: 'c', status: 'auto' }, { key: 'd', status: 'empty' }];
  assert.deepEqual(problemsOf(rows).map((r) => r.key), ['a', 'b']);
  assert.equal(isProblem(rows[2]), false);
  assert.equal(settled(problemsOf(rows), ['a']), false);
  assert.equal(settled(problemsOf(rows), ['a', 'b']), true);
  assert.equal(settled([], []), true);
});

test('a column\'s own behaviour ignores what was attached to it, not to others', () => {
  const bindings = { 'label:Difficulty': 'csv:Market' };
  const rows = byKey(resolveTemplate(TEMPLATE, dataset, bindings));
  assert.equal(rows['label:Difficulty'].status, 'bound');
  assert.equal(defaultOf(TEMPLATE, dataset, bindings, rows['label:Difficulty']).status, 'missing');
  assert.equal(defaultOf(TEMPLATE, dataset, bindings, rows['label:Volume']).status, 'auto');
});

test('a field already read by another column can\'t be picked, nor the worklogs', () => {
  const rows = resolveTemplate(TEMPLATE, dataset, {});
  const used = usedFieldIds(rows, 'label:Difficulty');
  assert.ok(used.includes('summary') && used.includes('csv:Volume'));
  assert.deepEqual(usedFieldIds(rows, 'label:Volume').includes('csv:Volume'), false);
  assert.deepEqual(pickable(dataset, used).map((f) => f.id), ['csv:Market']);
});

test('what a column reads now', () => {
  const problem = { key: 'k', status: 'missing' };
  const fine = { key: 'k', status: 'auto' };
  assert.equal(currentChoice({ bindings: { k: 'csv:Market' }, skipped: [] }, problem, problem), 'csv:Market');
  assert.equal(currentChoice({ bindings: { k: '' }, skipped: [] }, problem, problem), '#skip');
  assert.equal(currentChoice({ bindings: {}, skipped: ['k'] }, problem, problem), '#skip');
  assert.equal(currentChoice({ bindings: {}, skipped: [] }, problem, problem), '');
  assert.equal(currentChoice({ bindings: {}, skipped: [] }, fine, fine), '#auto');
});

test('going without: a fixed column stays empty, a by-name one drops out', () => {
  assert.equal(leaveText({ fieldId: 'customfield_1' }).title, 'Leave it empty');
  assert.equal(leaveText({ fieldId: '' }).title, 'Leave it out');
});
