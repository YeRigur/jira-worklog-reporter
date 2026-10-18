import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset } from '../src/core/dataset.js';
import { csvFile } from './support/helpers.js';

process.env.TZ = 'Europe/Kyiv';

const HEADERS = ['Summary', 'Issue key', 'Issue id', 'Project key', 'Project name', 'Assignee', 'Assignee Id',
  'Created', 'Updated', 'Watchers', 'Watchers Id', 'Watchers', 'Watchers Id', 'Log Work', 'Log Work', 'Attachment'];

const row = (o) => HEADERS.map((h, i) => {
  if (h === 'Log Work') return (o.logWork || [])[HEADERS.slice(0, i).filter((x) => x === 'Log Work').length] || '';
  if (h === 'Watchers' || h === 'Watchers Id') {
    const n = HEADERS.slice(0, i).filter((x) => x === h).length;
    return ((h === 'Watchers' ? o.watchers : o.watcherIds) || [])[n] || '';
  }
  return o[h] ?? '';
});

const base = {
  Summary: 'One', 'Issue key': 'AC-1', 'Issue id': '101', 'Project key': 'AC', 'Project name': 'Alpha Care',
  Assignee: 'Testenko,Olena,UA-Kyiv,Web', 'Assignee Id': '712020:aaa',
  Created: '03/Aug/26 9:15 AM', Updated: '20/Aug/26 5:00 PM'
};

test('a file without "Issue key" is not a Jira export', () => {
  assert.throws(() => buildDataset([csvFile('x.csv', ['Resumen', 'Clave'], [['a', 'b']])]),
    (e) => e.code === 'not-jira');
});

test('a file without "Log Work" columns has no worklogs to export', () => {
  assert.throws(() => buildDataset([csvFile('x.csv', ['Issue key', 'Created'], [['AC-1', '03/Aug/26 9:15 AM']])]),
    (e) => e.code === 'no-worklogs');
});

test('unknown date formats are reported with a sample value', () => {
  const file = csvFile('x.csv', ['Issue key', 'Created', 'Log Work'], [['AC-1', 'Tuesday 3rd', '']]);
  assert.throws(() => buildDataset([file]), (e) => e.code === 'date-format' && e.sample === 'Tuesday 3rd');
});

test('an explicit date pattern overrides detection', () => {
  const file = csvFile('x.csv', ['Issue key', 'Created', 'Log Work'],
    [['AC-1', '2026.08.03 09:15', ';2026.08.04 10:00;712020:aaa;3600']]);
  const ds = buildDataset([file], { datePattern: 'yyyy.MM.dd HH:mm' });
  assert.equal(ds.issues[0].worklogs[0].started, '2026-08-04T10:00:00.000+0300');
});

test('Log Work cells become worklogs, even with ";" in the comment', () => {
  const ds = buildDataset([csvFile('x.csv', HEADERS, [row({
    ...base, logWork: ['fix; retest;04/Aug/26 10:00 AM;712020:aaa;7200', ';05/Aug/26 11:30 AM;ug:bbb;10800']
  })])]);
  assert.deepEqual(ds.issues[0].worklogs, [
    { authorKey: '712020:aaa', started: '2026-08-04T10:00:00.000+0300', localDate: '2026-08-04', seconds: 7200, comment: 'fix; retest' },
    { authorKey: 'ug:bbb', started: '2026-08-05T11:30:00.000+0300', localDate: '2026-08-05', seconds: 10800, comment: '' }
  ]);
});

test('malformed Log Work cells are skipped and counted', () => {
  const ds = buildDataset([csvFile('x.csv', HEADERS, [row({ ...base, logWork: ['garbage', ';05/Aug/26 11:30 AM;ug:bbb;10800'] })])]);
  assert.equal(ds.issues[0].worklogs.length, 1);
  assert.deepEqual(ds.warnings.find((w) => w.code === 'bad-worklog'), { code: 'bad-worklog', count: 1 });
});

test('the Jira site comes from attachment links', () => {
  const ds = buildDataset([csvFile('x.csv', HEADERS, [row({
    ...base, Attachment: '04/Aug/26 10:00 AM;ug:bbb;shot.png;https://acme.atlassian.net/rest/api/3/attachment/content/555'
  })])]);
  assert.equal(ds.site, 'acme.atlassian.net');
  assert.equal(ds.origin, 'https://acme.atlassian.net');
});

test('no links means no site', () => {
  const ds = buildDataset([csvFile('x.csv', HEADERS, [row(base)])]);
  assert.equal(ds.site, '');
  assert.equal(ds.origin, '');
});

test('author stats and names learned from user columns', () => {
  const ds = buildDataset([csvFile('x.csv', HEADERS, [
    row({ ...base, watchers: ['Probenko,Ivan,UA-Kyiv,Web'], watcherIds: ['712020:ccc'],
      logWork: [';04/Aug/26 10:00 AM;712020:aaa;7200', ';06/Aug/26 9:00 AM;712020:aaa;1800'] }),
    row({ ...base, 'Issue key': 'AC-2', 'Issue id': '102', logWork: [';07/Aug/26 9:00 AM;ug:bbb;3600'] })
  ])]);
  assert.deepEqual(ds.authors['712020:aaa'], {
    count: 2, seconds: 9000,
    samples: [{ issue: 'AC-1', date: '2026-08-04', seconds: 7200 }, { issue: 'AC-1', date: '2026-08-06', seconds: 1800 }]
  });
  assert.equal(ds.authors['ug:bbb'].count, 1);
  assert.equal(ds.names['712020:aaa'], 'Testenko,Olena,UA-Kyiv,Web');
  assert.equal(ds.names['712020:ccc'], 'Probenko,Ivan,UA-Kyiv,Web');
  assert.equal(ds.names['ug:bbb'], undefined);
});

test('projects are listed once, in order; the span covers all worklogs', () => {
  const ds = buildDataset([csvFile('x.csv', HEADERS, [
    row({ ...base, logWork: [';04/Aug/26 10:00 AM;712020:aaa;60'] }),
    row({ ...base, 'Issue key': 'VC-1', 'Project key': 'VC', 'Project name': 'Vet Desk', logWork: [';31/Jul/26 11:00 PM;712020:aaa;60'] }),
    row({ ...base, 'Issue key': 'AC-2', logWork: [';02/Sep/26 9:00 AM;712020:aaa;60'] })
  ])]);
  assert.deepEqual(ds.projects, [{ key: 'AC', name: 'Alpha Care' }, { key: 'VC', name: 'Vet Desk' }]);
  assert.deepEqual(ds.span, { from: '2026-07-31', to: '2026-09-02' });
});

test('files with different columns merge; a duplicate issue keeps the later update', () => {
  const a = csvFile('a.csv', ['Issue key', 'Summary', 'Updated', 'Log Work'], [
    ['AC-1', 'old title', '10/Aug/26 9:00 AM', ';04/Aug/26 10:00 AM;712020:aaa;60'],
    ['AC-2', 'two', '10/Aug/26 9:00 AM', '']
  ]);
  const b = csvFile('b.csv', ['Issue key', 'Updated', 'Summary', 'Log Work', 'Log Work'], [
    ['AC-1', '12/Aug/26 9:00 AM', 'new title', ';04/Aug/26 10:00 AM;712020:aaa;60', ';11/Aug/26 10:00 AM;712020:aaa;120'],
    ['AC-3', '12/Aug/26 9:00 AM', 'three', '', '']
  ]);
  const ds = buildDataset([a, b]);
  assert.deepEqual(ds.issues.map((i) => i.key), ['AC-1', 'AC-2', 'AC-3']);
  const summaryIndex = ds.headers.indexOf('Summary');
  assert.equal(ds.issues[0].row[summaryIndex], 'new title');
  assert.equal(ds.issues[0].worklogs.length, 2);
});

test('a file with exactly 1000 issues is flagged as possibly truncated', () => {
  const rows = Array.from({ length: 1000 }, (_, i) => row({ ...base, 'Issue key': `AC-${i + 1}` }));
  const ds = buildDataset([csvFile('big.csv', HEADERS, rows)]);
  assert.deepEqual(ds.warnings.find((w) => w.code === 'truncated'), { code: 'truncated', file: 'big.csv', rows: 1000 });
});

test('a windows-1252 file is flagged', () => {
  const file = { ...csvFile('x.csv', HEADERS, [row(base)]), encoding: 'windows-1252' };
  const ds = buildDataset([file]);
  assert.deepEqual(ds.warnings.find((w) => w.code === 'encoding'), { code: 'encoding', file: 'x.csv' });
});
