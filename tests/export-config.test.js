import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/config/catalog.js';
import { fieldIdsFromCatalog, exportDefaults, buildExportConfig } from '../src/core/export-config.js';

const SCRIPTS_JSON = catalog;

// CSV field catalog as dataset.model.fields gives it.
const FIELDS = [
  { id: 'summary', name: 'Summary', custom: false },
  { id: 'issuetype', name: 'Issue Type', custom: false },
  { id: 'customfield_10084', name: 'Complexity Levels', custom: true },
  { id: 'csv:Difficulty', name: 'Difficulty', custom: true },
  { id: 'csv:Volume', name: 'Volume', custom: true },
  { id: 'csv:Market', name: 'Market', custom: true }
];

const DEFAULT_22 = [
  'issuetype', '_issueKey', 'summary', 'assignee', '_developer', '_authorEmail', '_developerGroup', 'status', 'created', 'updated', 'resolutiondate',
  'customfield_10084', 'customfield_10186', '_originalEstimateHours', '_timeSpentHours', '_estimationDeviation',
  'priority', '_projectGroup', '_projectKey', '_projectName', '_projectUrl', '_parentSummary'
];

test('custom field ids the catalog knows by label', () => {
  assert.deepEqual(fieldIdsFromCatalog(SCRIPTS_JSON), { 'Complexity Levels': 'customfield_10084', 'Pick Up Time': 'customfield_10186' });
});

test('default columns: the extension\'s list, then its by-name fields found in the CSV', () => {
  const d = exportDefaults(SCRIPTS_JSON, { site: 'your-site.atlassian.net', fields: FIELDS });
  assert.deepEqual(d.exportFields, [...DEFAULT_22, 'csv:Difficulty', 'csv:Volume']);
});

test('sheets: Summary and Details on every site, as the extension now defaults', () => {
  assert.deepEqual(exportDefaults(SCRIPTS_JSON, { site: 'your-site.atlassian.net', fields: [] }).sheets, ['summary', 'details']);
  assert.deepEqual(exportDefaults(SCRIPTS_JSON, { site: '', fields: [] }).sheets, ['summary', 'details']);
});

test('headers: the catalog\'s friendly labels win, CSV names fill the rest', () => {
  const { labels } = exportDefaults(SCRIPTS_JSON, { site: '', fields: FIELDS });
  assert.equal(labels.issuetype, 'Work type');
  assert.equal(labels.customfield_10084, 'Complexity Levels');
  assert.equal(labels['csv:Difficulty'], 'Difficulty');
  assert.equal(labels._authorEmail, 'Person email');
});

test('project groups come from the settings, keys upper-cased', () => {
  const { projectGroups } = exportDefaults({ ...SCRIPTS_JSON, projectGroups: { 'Group A': ['ac', 'AB'], 'Group B': ['XY', ''] } }, { site: '', fields: [] });
  assert.deepEqual(projectGroups, { AC: 'Group A', AB: 'Group A', XY: 'Group B' });
  assert.deepEqual(exportDefaults(SCRIPTS_JSON, { site: '', fields: [] }).projectGroups, {});
});

test('the run config takes every author, the chosen dates and the Summary choice', () => {
  const dataset = {
    site: 'your-site.atlassian.net',
    model: { fields: FIELDS, specs: Object.fromEntries(FIELDS.map((f) => [f.id, {}])) },
    authors: { 'ug:1': {}, '712020:a': {} }
  };
  const meta = { 'ug:1': { displayName: 'Unknown · ug:1' }, '712020:a': { displayName: 'A' } };
  const withGroups = { ...SCRIPTS_JSON, projectGroups: { 'Group A': ['AC'] } };
  const cfg = buildExportConfig({ scriptsJson: withGroups, dataset, meta, dateFrom: '2026-08-01', dateTo: '2026-08-31', withSummary: false });
  assert.deepEqual(cfg.users, ['ug:1', '712020:a']);
  assert.deepEqual(cfg.sheets, ['details']);
  assert.equal(cfg.dateFrom, '2026-08-01');
  assert.equal(cfg.dateTo, '2026-08-31');
  assert.equal(cfg._userMetadata, meta);
  assert.equal(cfg._projectsGroups.AC, 'Group A');
  assert.equal(cfg._exportFieldLabels.issuetype, 'Work type');
  assert.deepEqual(buildExportConfig({ scriptsJson: SCRIPTS_JSON, dataset, meta, dateFrom: '2026-08-01', dateTo: '', withSummary: true }).sheets, ['summary', 'details']);
});

test('the run can be limited to some authors', () => {
  const dataset = { site: '', model: { fields: FIELDS, specs: Object.fromEntries(FIELDS.map((f) => [f.id, {}])) }, authors: { k1: {}, k2: {} } };
  const cfg = buildExportConfig({ scriptsJson: SCRIPTS_JSON, dataset, meta: {}, dateFrom: '2026-08-01', dateTo: '2026-08-31', withSummary: false, users: ['k2'] });
  assert.deepEqual(cfg.users, ['k2']);
});
