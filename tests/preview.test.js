import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/config/catalog.js';
import { buildPreview, emptyColumns } from '../src/core/preview.js';
import { buildDataset } from '../src/core/dataset.js';
import { createJiraEmulator } from '../src/core/emulator.js';
import { authorMetadata } from '../src/core/people.js';
import { fieldIdsFromCatalog, buildExportConfig } from '../src/core/export-config.js';
import { csvFile } from './support/helpers.js';
import { HEADERS, ROWS } from './fixtures/synthetic.js';
import { runExtensionExport } from './support/export-harness.js';

process.env.TZ = 'Europe/Kyiv';
const SCRIPTS_JSON = catalog;

const sheet = (name, rows) => ({ name, rows });

test('a sheet becomes its header, the first rows and the row count', () => {
  const [p] = buildPreview([sheet('Jira Details', [['A', 'B'], [1, 'x'], [2, 'y'], [3, 'z']])], { rows: 2 });
  assert.equal(p.name, 'Jira Details');
  assert.deepEqual(p.header, ['A', 'B']);
  assert.deepEqual(p.rows, [[1, 'x'], [2, 'y']]);
  assert.equal(p.total, 3);
});

test('cells keep the values the writer receives — numbers stay numbers', () => {
  const [p] = buildPreview([sheet('S', [['Hours'], [2], [0.5]])]);
  assert.deepEqual(p.rows, [[2], [0.5]]);
});

test('a column empty in every row is flagged, even when the value is below the preview', () => {
  const [p] = buildPreview([sheet('S', [['Filled', 'Late', 'Empty'], ['a', '', ''], ['b', '', ''], ['c', 'here', '']])], { rows: 2 });
  assert.deepEqual(p.empty, [false, false, true]);
});

test('a sheet without rows flags nothing — there is no column to blame yet', () => {
  const [p] = buildPreview([sheet('S', [['A', 'B']])]);
  assert.deepEqual(p.rows, []);
  assert.equal(p.total, 0);
  assert.deepEqual(p.empty, [false, false]);
});

test('every sheet of the workbook is previewed, in the writer’s order', async () => {
  const dataset = buildDataset([csvFile('synthetic.csv', HEADERS, ROWS)], { fieldIds: fieldIdsFromCatalog(SCRIPTS_JSON) });
  const { meta } = authorMetadata(dataset, SCRIPTS_JSON);
  const authors = Object.fromEntries(Object.entries(meta).map(([key, m]) => [key, { accountId: key, displayName: m.displayName, emailAddress: m.email }]));
  const config = buildExportConfig({ scriptsJson: SCRIPTS_JSON, dataset, meta, dateFrom: '2026-08-01', dateTo: '2026-08-31', withSummary: true });
  const result = await runExtensionExport({ config, origin: dataset.origin, fetch: createJiraEmulator({ dataset, authors, origin: dataset.origin }) });

  const preview = buildPreview(result.sheets, { rows: 2 });
  assert.deepEqual(preview.map((p) => p.name), ['Jira Summary', 'Jira Details']);
  const details = preview[1];
  const written = result.sheets.find((s) => s.name === 'Jira Details');
  assert.deepEqual(details.header, written.rows[0]);
  assert.deepEqual(details.rows, written.rows.slice(1, 3));
  assert.equal(details.total, written.rows.length - 1);
  assert.equal(details.empty.length, details.header.length);
});

test('columns that came out empty are reported by their header', () => {
  const preview = buildPreview([
    sheet('Jira Summary', [['Issue key', 'Root cause', 'Difficulty'], ['A-1', '', 'Low'], ['A-2', '', '']]),
    sheet('Jira Details', [['Issue key', 'Root cause', 'Worklog Hours'], ['A-1', '', 2]])
  ]);
  assert.deepEqual(emptyColumns(preview), ['Root cause']);
});

test('a column empty on one sheet but filled on another is not reported', () => {
  const preview = buildPreview([
    sheet('Jira Summary', [['Parent Summary'], [''], ['Q3 epic']]),
    sheet('Jira Details', [['Parent Summary'], ['']])
  ]);
  assert.deepEqual(emptyColumns(preview), []);
});

test('with no rows at all nothing is called empty', () => {
  assert.deepEqual(emptyColumns(buildPreview([sheet('Jira Details', [['Issue key', 'Root cause']])])), []);
});
