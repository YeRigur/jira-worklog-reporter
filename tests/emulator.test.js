import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset } from '../src/core/dataset.js';
import { createJiraEmulator } from '../src/core/emulator.js';
import { csvFile } from './support/helpers.js';

process.env.TZ = 'Europe/Kyiv';

const HEADERS = ['Issue key', 'Issue id', 'Summary', 'Project key', 'Project name', 'Created', 'Log Work', 'Log Work'];
const dataset = buildDataset([csvFile('x.csv', HEADERS, [
  ['AC-1', '1', 'One', 'AC', 'Adopt', '01/Aug/26 9:00 AM', ';04/Aug/26 10:00 AM;712020:a;3600', ';05/Aug/26 10:00 AM;ug:b;1800'],
  ['AC-2', '2', 'Two', 'AC', 'Adopt', '01/Aug/26 9:00 AM', ';06/Aug/26 10:00 AM;712020:x;60', ''],
  ['VC-1', '3', 'Three', 'VC', 'Vet', '01/Aug/26 9:00 AM', ';07/Aug/26 10:00 AM;712020:a;120', ''],
  ['VC-2', '4', 'Four', 'VC', 'Vet', '01/Aug/26 9:00 AM', ';02/Sep/26 10:00 AM;712020:a;120', '']
])]);

const authors = {
  '712020:a': { accountId: '712020:a', displayName: 'Testenko,Olena', emailAddress: 'olena@ua.example.com' },
  'ug:b': { accountId: '5b10-acc', displayName: 'Probenko,Ivan', emailAddress: 'ivan@ua.example.com' }
};

const search = async (fetch, body) => {
  const res = await fetch('/rest/api/3/search/jql', { method: 'POST', body: JSON.stringify(body) });
  assert.equal(res.ok, true);
  return res.json();
};

test('search returns matching issues with only the requested fields, page by page', async () => {
  const fetch = createJiraEmulator({ dataset, authors, origin: 'https://acme.atlassian.net' });
  const jql = 'worklogDate >= "2026-08-01" AND worklogDate <= "2026-08-31" AND worklogAuthor IN ("712020:a", "5b10-acc")';
  const first = await search(fetch, { jql, maxResults: 1, fields: ['summary', 'project'] });
  assert.deepEqual(first.issues, [{ id: '1', key: 'AC-1', fields: { summary: 'One', project: { key: 'AC', name: 'Adopt' } } }]);
  assert.ok(first.nextPageToken);
  const second = await search(fetch, { jql, maxResults: 1, fields: ['summary'], nextPageToken: first.nextPageToken });
  assert.deepEqual(second.issues.map((i) => i.key), ['VC-1']);
  assert.equal(second.nextPageToken, undefined);
});

test('the author clause uses resolved account ids, not CSV keys', async () => {
  const fetch = createJiraEmulator({ dataset, authors, origin: 'https://acme.atlassian.net' });
  const res = await search(fetch, { jql: 'worklogAuthor IN ("5b10-acc")', maxResults: 50, fields: [] });
  assert.deepEqual(res.issues.map((i) => i.key), ['AC-1']);
});

test('the project filter narrows every query; picking all projects is no filter', async () => {
  const narrowed = createJiraEmulator({ dataset, authors, projects: ['VC'], origin: 'https://x' });
  const probe = await search(narrowed, { jql: 'order by created DESC', maxResults: 50, fields: ['summary'] });
  assert.deepEqual(probe.issues.map((i) => i.key), ['VC-1', 'VC-2']);
  const all = createJiraEmulator({ dataset, authors, projects: ['AC', 'VC'], origin: 'https://x' });
  const everything = await search(all, { jql: 'order by created DESC', maxResults: 50, fields: [] });
  assert.equal(everything.issues.length, 4);
});

test('worklogs page, honour startedAfter, and carry resolved authors', async () => {
  const fetch = createJiraEmulator({ dataset, authors, origin: 'https://acme.atlassian.net' });
  const after = Date.parse('2026-08-05T00:00:00.000Z');
  const res = await fetch(`https://acme.atlassian.net/rest/api/3/issue/AC-1/worklog?startAt=0&maxResults=100&startedAfter=${after}`);
  const body = await res.json();
  assert.equal(body.total, 1);
  assert.deepEqual(body.worklogs.map((w) => [w.author.accountId, w.author.displayName, w.started, w.timeSpentSeconds]),
    [['5b10-acc', 'Probenko,Ivan', '2026-08-05T10:00:00.000+0300', 1800]]);
  const paged = await (await fetch('https://acme.atlassian.net/rest/api/3/issue/AC-1/worklog?startAt=1&maxResults=1')).json();
  assert.deepEqual([paged.startAt, paged.total, paged.worklogs.length], [1, 2, 1]);
});

test('an author missing from the map keeps the CSV key', async () => {
  const fetch = createJiraEmulator({ dataset, authors, origin: 'https://x' });
  const body = await (await fetch('https://x/rest/api/3/issue/AC-2/worklog?startAt=0&maxResults=100')).json();
  assert.deepEqual(body.worklogs[0].author, { accountId: '712020:x', displayName: '', emailAddress: '' });
});

test('anything else is refused loudly', async () => {
  const fetch = createJiraEmulator({ dataset, authors, origin: 'https://x' });
  await assert.rejects(fetch('/rest/api/3/myself'), /Emulator: unsupported request GET \/rest\/api\/3\/myself/);
  await assert.rejects(search(fetch, { jql: 'project = AC', maxResults: 1, fields: [] }), /Unsupported JQL/);
});
