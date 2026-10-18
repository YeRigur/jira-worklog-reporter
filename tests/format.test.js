import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hours, plural, cleanSite, rawText, cellText } from '../src/core/format.js';

test('hours: one decimal, none when whole', () => {
  assert.equal(hours(7200), '2');
  assert.equal(hours(4500), '1.3');
  assert.equal(hours(0), '0');
  assert.equal(hours(60), '0');
});

test('plural', () => {
  assert.equal(plural(1, 'issue'), '1 issue');
  assert.equal(plural(2, 'issue'), '2 issues');
  assert.equal(plural(0, 'person', 'people'), '0 people');
});

test('a site from whatever was pasted', () => {
  assert.equal(cleanSite(' https://Your-Site.atlassian.net/browse/AB-1 '), 'your-site.atlassian.net');
  assert.equal(cleanSite('your-site.atlassian.net'), 'your-site.atlassian.net');
  assert.equal(cleanSite(null), '');
});

test('cells read as Excel shows them', () => {
  assert.equal(rawText(null), '');
  assert.equal(rawText(0), '0');
  assert.equal(cellText(2 / 3), '0.666667');
  assert.equal(cellText(3), '3');
  assert.equal(cellText('x'), 'x');
  assert.equal(cellText(undefined), '');
});
