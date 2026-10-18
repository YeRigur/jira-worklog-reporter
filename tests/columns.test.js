import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildColumnModel, shapeFields } from '../src/core/columns.js';

process.env.TZ = 'Europe/Kyiv';

const PATTERN = 'dd/MMM/yy h:mm a';
const RENDERABLE = ['displayName', 'name', 'value', 'rating', 'key', 'accountId', 'emailAddress', 'text', 'type'];

// Builds a one-row model from [header, value] pairs.
const oneRow = (pairs, opts = {}) => {
  const headers = pairs.map(([h]) => h);
  const row = pairs.map(([, v]) => v);
  const model = buildColumnModel(headers, [row], { datePattern: PATTERN, ...opts });
  return { model, row };
};

test('system headers become Jira field ids; id companions and the key are not fields', () => {
  const { model } = oneRow([
    ['Issue key', 'AC-1'], ['Summary', 's'], ['Issue Type', 'Story'], ['Assignee', 'A'],
    ['Assignee Id', '712020:x'], ['Created', '20/Feb/25 1:43 PM'], ['Custom field (Assignee for QA)Id', 'q']
  ]);
  const ids = model.fields.map((f) => f.id);
  assert.deepEqual(ids, ['summary', 'issuetype', 'assignee', 'created']);
  assert.equal(model.fields.find((f) => f.id === 'issuetype').name, 'Issue Type');
});

test('custom fields use the known id, otherwise a csv: id', () => {
  const { model } = oneRow(
    [['Custom field (Complexity Levels)', 'Level 1'], ['Custom field (Difficulty)', 'Easy']],
    { fieldIds: { 'Complexity Levels': 'customfield_10084' } }
  );
  assert.deepEqual(model.fields, [
    { id: 'customfield_10084', name: 'Complexity Levels', custom: true },
    { id: 'csv:Difficulty', name: 'Difficulty', custom: true }
  ]);
});

test('project, parent and time tracking are offered as composite fields', () => {
  const { model } = oneRow([
    ['Project key', 'AC'], ['Project name', 'Adopt'], ['Parent key', 'AC-9'], ['Parent summary', 'Epic'],
    ['Original estimate', '3600'], ['Time Spent', '7200']
  ]);
  const ids = model.fields.map((f) => f.id);
  assert.ok(ids.includes('project'));
  assert.ok(ids.includes('parent'));
  assert.ok(ids.includes('timetracking'));
  assert.ok(!ids.includes('csv:Project key'));
});

test('named, user, text and date columns take the API shapes', () => {
  const { model, row } = oneRow([
    ['Summary', 'Fix login'], ['Issue Type', 'Bug'], ['Status', 'Done'], ['Priority', 'High'],
    ['Assignee', 'Zrazok,Hanna,UA-Kyiv,Web'], ['Reporter', ''],
    ['Created', '20/Feb/25 1:43 PM'], ['Resolved', ''], ['Due date', '06/Feb/25 12:00 AM']
  ]);
  const f = shapeFields(model, row, ['summary', 'issuetype', 'status', 'priority', 'assignee', 'reporter', 'created', 'resolutiondate', 'duedate']);
  assert.deepEqual(f, {
    summary: 'Fix login',
    issuetype: { name: 'Bug' },
    status: { name: 'Done' },
    priority: { name: 'High' },
    assignee: { displayName: 'Zrazok,Hanna,UA-Kyiv,Web' },
    reporter: null,
    created: '2025-02-20T13:43:00.000+0200',
    resolutiondate: null,
    duedate: '2025-02-06'
  });
});

test('repeated headers become lists', () => {
  const { model, row } = oneRow([
    ['Labels', 'a'], ['Labels', ''], ['Labels', 'b'],
    ['Sprint', 'AC Sprint 1'], ['Sprint', 'AC Sprint 2'],
    ['Components', 'Web']
  ]);
  const f = shapeFields(model, row, ['labels', 'csv:Sprint', 'components']);
  assert.deepEqual(f, {
    labels: ['a', 'b'],
    'csv:Sprint': [{ name: 'AC Sprint 1' }, { name: 'AC Sprint 2' }],
    components: [{ name: 'Web' }]
  });
});

test('composites carry what the export reads', () => {
  const { model, row } = oneRow([
    ['Project key', 'AC'], ['Project name', 'Alpha Care'], ['Parent', '10042'], ['Parent key', 'AC-9'],
    ['Parent summary', 'Epic one'], ['Original estimate', '14400'], ['Time Spent', '21600']
  ]);
  const f = shapeFields(model, row, ['project', 'parent', 'timetracking']);
  assert.deepEqual(f.project, { key: 'AC', name: 'Alpha Care' });
  assert.deepEqual(f.parent, { id: '10042', key: 'AC-9', fields: { summary: 'Epic one' } });
  assert.deepEqual(f.timetracking, { originalEstimateSeconds: 14400, timeSpentSeconds: 21600 });
});

test('no parent key means no parent; empty time tracking is an empty object', () => {
  const { model, row } = oneRow([['Parent key', ''], ['Parent summary', ''], ['Time Spent', '']]);
  const f = shapeFields(model, row, ['parent', 'timetracking']);
  assert.equal(f.parent, undefined);
  assert.deepEqual(f.timetracking, {});
});

test('custom columns are typed from all their values', () => {
  const headers = ['Custom field (Pick Up Time)', 'Custom field (Go live)', 'Custom field (Launch Date)', 'Custom field (Code)'];
  const rows = [
    ['5.0', '20/Feb/25 1:43 PM', '06/Feb/25 12:00 AM', '0012'],
    ['0.0', '21/Feb/25 9:00 AM', '', 'A-1'],
    ['', '', '07/Feb/25 12:00 AM', '']
  ];
  const model = buildColumnModel(headers, rows, { datePattern: PATTERN });
  const ids = ['csv:Pick Up Time', 'csv:Go live', 'csv:Launch Date', 'csv:Code'];
  assert.deepEqual(shapeFields(model, rows[0], ids), {
    'csv:Pick Up Time': 5,
    'csv:Go live': '2025-02-20T13:43:00.000+0200',
    'csv:Launch Date': '2025-02-06',
    'csv:Code': '0012'
  });
  assert.deepEqual(shapeFields(model, rows[2], ids), {
    'csv:Pick Up Time': null,
    'csv:Go live': null,
    'csv:Launch Date': '2025-02-07',
    'csv:Code': null
  });
});

test('same-named custom columns merge into one list value', () => {
  const headers = ['Custom field (Market)', 'Custom field (Market)'];
  const model = buildColumnModel(headers, [['UA', 'PL']], { datePattern: PATTERN });
  assert.equal(model.fields.length, 1);
  assert.deepEqual(shapeFields(model, ['UA', 'PL'], ['csv:Market']), { 'csv:Market': ['UA', 'PL'] });
});

test('fields the export cannot render stay unrenderable, like the API objects', () => {
  const { model, row } = oneRow([
    ['Watchers', 'X'], ['Votes', '2'], ['Comment', 'c'], ['Attachment', 'a'], ['Log Work', 'w'],
    ['Inward issue link (Blocks)', 'AC-2'], ['Outward issue link (Relates)', 'AC-3']
  ]);
  const f = shapeFields(model, row, ['watches', 'votes', 'comment', 'attachment', 'worklog', 'issuelinks']);
  for (const [id, value] of Object.entries(f)) {
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      assert.equal(typeof item, 'object', id);
      assert.deepEqual(Object.keys(item).filter((k) => RENDERABLE.includes(k)), [], id);
    }
  }
  assert.equal(f.issuelinks.length, 2);
});

test('ids missing from the CSV are left out', () => {
  const { model, row } = oneRow([['Summary', 's']]);
  assert.deepEqual(shapeFields(model, row, ['summary', 'customfield_99999']), { summary: 's' });
});
