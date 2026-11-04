import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valueText, fieldCoverage } from '../src/core/coverage.js';

test('a Jira field value as a person reads it', () => {
  assert.equal(valueText('Low'), 'Low');
  assert.equal(valueText(3), '3');
  assert.equal(valueText(0), '0');
  assert.equal(valueText({ value: 'Level 2' }), 'Level 2');
  assert.equal(valueText({ displayName: 'Testenko,Olena' }), 'Testenko,Olena');
  assert.equal(valueText([{ name: 'web' }, { name: 'ux' }]), 'web, ux');
  assert.equal(valueText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Root' }, { type: 'text', text: ' cause' }] }] }), 'Root cause');
  for (const empty of [null, undefined, '', [], {}]) assert.equal(valueText(empty), '');
});

test('how many of the sample issues fill a field, and one example', () => {
  const issues = [{ fields: { customfield_1: { value: 'Low' } } }, { fields: { customfield_1: null } }, { fields: {} }];
  assert.deepEqual(fieldCoverage(issues, 'customfield_1'), { filled: 1, total: 3, sample: 'Low' });
  assert.deepEqual(fieldCoverage([], 'customfield_1'), { filled: 0, total: 0, sample: '' });
});
