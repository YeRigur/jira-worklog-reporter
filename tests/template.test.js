import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/config/catalog.js';
import { buildColumnTemplate, resolveTemplate, applyTemplate } from '../src/core/template.js';
import { exportDefaults } from '../src/core/export-config.js';

const SCRIPTS_JSON = catalog;
const TEMPLATE = buildColumnTemplate(SCRIPTS_JSON);

// CSV header names for the Jira field ids, as buildColumnModel reports them.
const NAMES = {
  summary: 'Summary', issuetype: 'Issue Type', assignee: 'Assignee', status: 'Status', created: 'Created',
  updated: 'Updated', resolutiondate: 'Resolved', priority: 'Priority', customfield_10084: 'Complexity Levels',
  customfield_10186: 'Pick Up Time', project: 'Project', parent: 'Parent', timetracking: 'Time tracking'
};
const dataset = (ids) => ({
  model: {
    specs: Object.fromEntries(ids.map((id) => [id, {}])),
    fields: ids.map((id) => ({ id, name: id.startsWith('csv:') ? id.slice(4) : (NAMES[id] || id), custom: id.startsWith('csv:') }))
  }
});
const FULL = dataset(['summary', 'issuetype', 'assignee', 'status', 'created', 'updated', 'resolutiondate', 'priority',
  'customfield_10084', 'customfield_10186', 'project', 'parent', 'timetracking',
  'csv:Difficulty', 'csv:Exception Reason', 'csv:Root cause', 'csv:Unknown', 'csv:Volume', 'csv:Client Complexity', 'csv:Return Rate counter']);
const byKey = (rows) => Object.fromEntries(rows.map((r) => [r.key, r]));

test('the template is the extension\'s column list, with the headers it writes', () => {
  assert.equal(TEMPLATE[0].label, 'Work type');
  assert.equal(TEMPLATE[1].label, 'Issue key');
  // 22 fixed columns, then the 8 the export finds by name.
  assert.deepEqual(TEMPLATE.map((c) => c.label).slice(-8),
    ['Difficulty', 'Exception Reason', 'Root cause', 'Unknown', 'Volume', 'Client Complexity', 'Return Rate counter', 'Satisfaction']);
  assert.equal(TEMPLATE.length, 30);
});

test('columns taken straight from a CSV column name it', () => {
  const rows = byKey(resolveTemplate(TEMPLATE, FULL, {}));
  assert.deepEqual(rows.issuetype, { key: 'issuetype', label: 'Work type', status: 'auto', fieldId: 'issuetype', source: 'Issue Type' });
  assert.equal(rows['label:Difficulty'].status, 'auto');
  assert.equal(rows['label:Difficulty'].fieldId, 'csv:Difficulty');
  assert.equal(rows['label:Difficulty'].source, 'Difficulty');
});

test('computed columns say what they are computed from', () => {
  const rows = byKey(resolveTemplate(TEMPLATE, FULL, {}));
  assert.equal(rows._issueKey.status, 'computed');
  assert.equal(rows._timeSpentHours.status, 'computed');
  assert.match(rows._timeSpentHours.source, /Time Spent/);
  assert.match(rows._projectUrl.source, /Project key/);
});

test('columns the CSV lacks are flagged, including computed ones missing their source', () => {
  const rows = byKey(resolveTemplate(TEMPLATE, dataset(['summary', 'project']), {}));
  assert.equal(rows.customfield_10084.status, 'missing');
  assert.equal(rows['label:Difficulty'].status, 'missing');
  assert.equal(rows._timeSpentHours.status, 'missing');
  assert.match(rows._timeSpentHours.source, /Time Spent|Original estimate/);
  assert.equal(rows._projectKey.status, 'computed');
  assert.equal(rows.summary.status, 'auto');
});

test('a column can be attached to any CSV field by hand, or left empty', () => {
  const rows = byKey(resolveTemplate(TEMPLATE, FULL, { 'label:Root cause': 'csv:Client Complexity', customfield_10084: '' }));
  assert.deepEqual(rows['label:Root cause'],
    { key: 'label:Root cause', label: 'Root cause', status: 'bound', fieldId: 'csv:Client Complexity', source: 'Client Complexity' });
  assert.equal(rows.customfield_10084.status, 'empty');
  assert.equal(rows.customfield_10084.fieldId, '');
});

test('a binding to a field the CSV no longer has falls back to the automatic answer', () => {
  const rows = byKey(resolveTemplate(TEMPLATE, FULL, { 'label:Root cause': 'csv:Gone' }));
  assert.equal(rows['label:Root cause'].status, 'auto');
  assert.equal(rows['label:Root cause'].fieldId, 'csv:Root cause');
});

test('applying the template gives the export its columns and headers', () => {
  const resolved = resolveTemplate(TEMPLATE, FULL, { 'label:Root cause': 'csv:Client Complexity' });
  const { exportFields, labels } = applyTemplate(resolved);
  assert.equal(labels['csv:Client Complexity'], 'Root cause');
  assert.equal(exportFields.indexOf('csv:Client Complexity'), exportFields.indexOf('csv:Difficulty') + 2);
  assert.ok(!exportFields.includes('csv:Root cause'));
});

test('with nothing bound, the columns are exactly the extension\'s defaults', () => {
  const resolved = resolveTemplate(TEMPLATE, FULL, {});
  assert.deepEqual(applyTemplate(resolved).exportFields,
    exportDefaults(SCRIPTS_JSON, { site: '', fields: FULL.model.fields }).exportFields);
});

test('missing by-name columns drop out, missing fixed ones stay and export empty — like the extension', () => {
  const poor = dataset(['summary', 'project', 'timetracking']);
  const { exportFields } = applyTemplate(resolveTemplate(TEMPLATE, poor, {}));
  assert.ok(exportFields.includes('customfield_10084'));
  assert.ok(!exportFields.some((id) => id.startsWith('csv:')));
  assert.deepEqual(exportFields, exportDefaults(SCRIPTS_JSON, { site: '', fields: poor.model.fields }).exportFields);
});

test('a column left empty is dropped from the export', () => {
  const { exportFields } = applyTemplate(resolveTemplate(TEMPLATE, FULL, { customfield_10084: '' }));
  assert.ok(!exportFields.includes('customfield_10084'));
});

test('attaching a column another one already uses marks the duplicate instead of doubling it', () => {
  const bindings = { 'label:Root cause': 'csv:Client Complexity' };
  const rows = byKey(resolveTemplate(TEMPLATE, FULL, bindings));
  assert.equal(rows['label:Client Complexity'].status, 'taken');
  assert.equal(rows['label:Client Complexity'].fieldId, '');
  const { exportFields } = applyTemplate(resolveTemplate(TEMPLATE, FULL, bindings));
  assert.equal(exportFields.filter((id) => id === 'csv:Client Complexity').length, 1);
});
