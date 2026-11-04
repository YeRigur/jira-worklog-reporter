import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeSearch, scopedFetch } from '../src/core/jql-scope.js';

const body = (init) => JSON.parse(init.body);

test('a search gets the projects added to its JQL; the rest of the body stays', () => {
  const init = { method: 'POST', body: JSON.stringify({ jql: 'worklogDate >= "2026-08-01" AND worklogAuthor IN ("a")', maxResults: 50, fields: ['summary'] }) };
  const out = scopeSearch(init, ['AC', 'TU']);
  assert.deepEqual(body(out), { jql: 'worklogDate >= "2026-08-01" AND worklogAuthor IN ("a") AND project IN ("AC", "TU")', maxResults: 50, fields: ['summary'] });
  assert.equal(out.method, 'POST');
});

test('ORDER BY stays last, OR is kept together, and a bare probe is left alone', () => {
  assert.equal(body(scopeSearch({ body: JSON.stringify({ jql: 'resolved >= "2026-08-01" ORDER BY key' }) }, ['AC'])).jql,
    'resolved >= "2026-08-01" AND project IN ("AC") ORDER BY key');
  assert.equal(body(scopeSearch({ body: JSON.stringify({ jql: 'a = 1 OR b = 2' }) }, ['AC'])).jql, '(a = 1 OR b = 2) AND project IN ("AC")');
  const probe = { body: JSON.stringify({ jql: 'order by created DESC' }) };
  assert.equal(scopeSearch(probe, ['AC']), probe);
});

test('no projects, no change', () => {
  const init = { body: JSON.stringify({ jql: 'x = 1' }) };
  assert.equal(scopeSearch(init, []), init);
});

test('only searches are narrowed, so each scope is its own request', async () => {
  const seen = [];
  const fetch = scopedFetch(async (input, init = {}) => { seen.push([String(input), init.body || '']); return new Response('{}'); }, ['AC']);
  await fetch('/rest/api/3/search/jql', { method: 'POST', body: JSON.stringify({ jql: 'x = 1' }) });
  await fetch('https://acme.atlassian.net/rest/api/3/issue/AC-1/worklog');
  assert.equal(JSON.parse(seen[0][1]).jql, 'x = 1 AND project IN ("AC")');
  assert.deepEqual(seen[1], ['https://acme.atlassian.net/rest/api/3/issue/AC-1/worklog', '']);
});
