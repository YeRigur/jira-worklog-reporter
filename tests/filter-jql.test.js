import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseJql, nextDay, periodJql, monthsOf } from '../src/core/filter-jql.js';

const PUBLIC = 'worklogDate >= startOfMonth(-1) AND worklogDate < startOfMonth()';
const LAST = { from: '2026-09-01', to: '2026-09-30' };

test('the team\'s own filter wins; else the public one, with the roster as authors', () => {
  assert.equal(baseJql({ jql: 'project = AB', roster: ['a@example.com'] }, PUBLIC), 'project = AB');
  assert.equal(baseJql({ jql: '', roster: [] }, PUBLIC), PUBLIC);
  assert.equal(baseJql({ jql: '', roster: ['a@example.com', 'b@example.com'] }, PUBLIC),
    `${PUBLIC}\nAND worklogAuthor in ("a@example.com", "b@example.com")`);
});

test('next day crosses months and years', () => {
  assert.equal(nextDay('2026-09-30'), '2026-10-01');
  assert.equal(nextDay('2025-12-31'), '2026-01-01');
  assert.equal(nextDay('2024-02-28'), '2024-02-29');
});

test('last month stays relative, so a saved Jira filter keeps working', () => {
  assert.equal(periodJql(PUBLIC, LAST.from, LAST.to, LAST), PUBLIC);
});

test('any other period is written as dates, the end as the next day', () => {
  assert.equal(periodJql(PUBLIC, '2026-07-01', '2026-09-30', LAST),
    'worklogDate >= "2026-07-01" AND worklogDate < "2026-10-01"');
  assert.equal(periodJql('worklogDate >= "2025-01-01" AND worklogDate <= "2025-01-31" AND resolved >= startOfMonth(-2)', '2026-08-01', '2026-08-15', LAST),
    'worklogDate >= "2026-08-01" AND worklogDate < "2026-08-16" AND resolved >= "2026-08-01"');
});

test('only date bounds are touched, and an open end keeps its bound', () => {
  const jql = 'project in (AB) AND worklogAuthor in ("a@example.com") AND worklogDate >= startOfMonth(-1) AND worklogDate < startOfMonth()';
  assert.equal(periodJql(jql, '2026-08-01', '', LAST),
    'project in (AB) AND worklogAuthor in ("a@example.com") AND worklogDate >= "2026-08-01" AND worklogDate < startOfMonth()');
});

test('a period is cut into months, the ends clipped', () => {
  assert.deepEqual(monthsOf('2026-07-15', '2026-09-10'), [
    { from: '2026-07-15', to: '2026-07-31', label: '15 – 31 Jul 2026' },
    { from: '2026-08-01', to: '2026-08-31', label: 'August 2026' },
    { from: '2026-09-01', to: '2026-09-10', label: '1 – 10 Sep 2026' }
  ]);
  assert.equal(monthsOf('2025-12-01', '2026-01-31').length, 2);
  assert.deepEqual(monthsOf('2026-09-01', ''), []);
  assert.deepEqual(monthsOf('2026-09-02', '2026-09-01'), []);
});
