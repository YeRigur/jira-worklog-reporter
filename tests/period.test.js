import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previousMonth, worklogsInPeriod, issuesInPeriod, periodLabel } from '../src/core/period.js';

test('previous month, including year change and leap February', () => {
  assert.deepEqual(previousMonth(new Date(2026, 8, 21)), { from: '2026-08-01', to: '2026-08-31' });
  assert.deepEqual(previousMonth(new Date(2026, 0, 5)), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(previousMonth(new Date(2024, 2, 10)), { from: '2024-02-01', to: '2024-02-29' });
});

const dataset = { issues: [
  { worklogs: [
    { authorKey: 'a', started: '2026-08-01T01:00:00.000+0300', localDate: '2026-08-01', seconds: 60 },  // 31 Jul in UTC, 1 Aug where it was logged: inside
    { authorKey: 'a', started: '2026-08-04T10:00:00.000+0300', localDate: '2026-08-04', seconds: 3600 },
    { authorKey: 'b', started: '2026-08-31T23:59:00.000+0300', localDate: '2026-08-31', seconds: 1800 }
  ] },
  { worklogs: [{ authorKey: 'c', started: '2026-09-02T09:00:00.000+0300', localDate: '2026-09-02', seconds: 7200 }] }
] };

test('worklogs in the period are whole calendar days on the worklog\'s own date, like the extension', () => {
  assert.deepEqual(worklogsInPeriod(dataset, '2026-08-01', '2026-08-31'), { count: 3, seconds: 5460, people: 2 });
});

test('an empty "to" means no upper bound', () => {
  assert.deepEqual(worklogsInPeriod(dataset, '2026-08-01', ''), { count: 4, seconds: 12660, people: 3 });
});

test('the period reads as a month when it is one, and as plain dates otherwise', () => {
  assert.equal(periodLabel('2026-08-01', '2026-08-31'), 'August 2026');
  assert.equal(periodLabel('2024-02-01', '2024-02-29'), 'February 2024');
  assert.equal(periodLabel('2026-08-01', '2026-08-15'), '1 – 15 Aug 2026');
  assert.equal(periodLabel('2026-07-25', '2026-08-15'), '25 Jul – 15 Aug 2026');
  assert.equal(periodLabel('2025-12-25', '2026-01-15'), '25 Dec 2025 – 15 Jan 2026');
});

test('an open end reads as one', () => {
  assert.equal(periodLabel('2026-08-01', ''), 'from 1 Aug 2026');
  assert.equal(periodLabel('', '2026-08-15'), 'until 15 Aug 2026');
  assert.equal(periodLabel('', ''), 'every worklog in the file');
});

test('the issues of the period are the ones with a worklog inside it', () => {
  assert.equal(issuesInPeriod(dataset, '2026-08-01', '2026-08-31').length, 1);
  assert.equal(issuesInPeriod(dataset, '2026-08-01', '').length, 2);
  assert.equal(issuesInPeriod(dataset, '2026-10-01', '2026-10-31').length, 0);
});

test('counting can keep to some authors only', () => {
  assert.deepEqual(worklogsInPeriod(dataset, '2026-08-01', '2026-08-31', new Set(['a'])), { count: 2, seconds: 3660, people: 1 });
  assert.equal(issuesInPeriod(dataset, '2026-08-01', '', new Set(['c'])).length, 1);
});
