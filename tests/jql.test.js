import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExportJql, matchesJql } from '../src/core/jql.js';

test('the probe query matches every issue', () => {
  assert.deepEqual(parseExportJql('order by created DESC'), { kind: 'all' });
});

test('a date-only query', () => {
  assert.deepEqual(parseExportJql('worklogDate >= "2026-08-01"'), { kind: 'filter', from: '2026-08-01' });
});

test('the full query the export sends', () => {
  assert.deepEqual(
    parseExportJql('worklogDate >= "2026-08-01" AND worklogDate <= "2026-08-31" AND worklogAuthor IN ("712020:a-1", "ug:b-2")'),
    { kind: 'filter', from: '2026-08-01', to: '2026-08-31', authors: ['712020:a-1', 'ug:b-2'] }
  );
});

test('escaped quotes inside author ids are unescaped', () => {
  assert.deepEqual(parseExportJql('worklogAuthor IN ("a\\"b")').authors, ['a"b']);
});

test('anything the export does not send is rejected', () => {
  for (const jql of ['project = AC', 'worklogDate >= "2026-08-01" OR worklogDate <= "2026-08-31"',
    'worklogDate > "2026-08-01"', 'worklogAuthor IN (currentUser())', '']) {
    assert.throws(() => parseExportJql(jql), /Unsupported JQL/, jql);
  }
});

const wl = (authorId, localDate) => ({ authorId, localDate });

test('clauses are evaluated independently, as Jira does', () => {
  const q = parseExportJql('worklogDate >= "2026-06-01" AND worklogDate <= "2026-06-30" AND worklogAuthor IN ("x")');
  // Neither worklog is in June, but one is after June 1 and one before June 30.
  assert.equal(matchesJql(q, [wl('x', '2026-01-01'), wl('y', '2026-12-31')]), true);
  assert.equal(matchesJql(q, [wl('y', '2026-06-10')]), false);
  assert.equal(matchesJql(q, [wl('x', '2026-07-10')]), false);
});

test('issues without worklogs match only the probe', () => {
  assert.equal(matchesJql(parseExportJql('worklogDate >= "2026-06-01"'), []), false);
  assert.equal(matchesJql(parseExportJql('order by created DESC'), []), true);
});
