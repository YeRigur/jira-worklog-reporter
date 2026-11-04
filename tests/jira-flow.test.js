// Jira mode end to end, against a fake Jira holding the synthetic data: the
// page's way (accounts, field list, cache) must make the same Details rows as
// the extension's code fed straight from the same data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/config/catalog.js';
import { buildDataset } from './support/fake-jira/dataset.js';
import { createJiraEmulator } from './support/fake-jira/emulator.js';
import { fieldIdsFromCatalog, buildExportConfig, buildJiraExportConfig } from '../src/core/export-config.js';
import { withSettings, emptySettings } from '../src/core/settings.js';
import { createFetchCache } from '../src/core/fetch-cache.js';
import { resolveAccounts } from '../src/core/accounts.js';
import { createFakeJira } from './support/fake-jira/fake-jira.js';
import { csvFile } from './support/helpers.js';
import { HEADERS, ROWS, PEOPLE } from './fixtures/synthetic.js';
import { runExtensionExport } from './support/export-harness.js';

process.env.TZ = 'Europe/Kyiv';
const { A, B, C, D } = PEOPLE;
const dateFrom = '2026-08-01';
const dateTo = '2026-08-31';
const roster = [A.email, B.email, C.email];
const dataset = buildDataset([csvFile('synthetic.csv', HEADERS, ROWS)], { fieldIds: fieldIdsFromCatalog(catalog) });
const scriptsJson = withSettings(catalog, { ...emptySettings(), roster, projectGroups: { 'Group A': ['AC'] } });

const detailRows = (result) => {
  const sheet = result.sheets.find((s) => s.name === 'Jira Details');
  const [head, ...rows] = sheet.rows;
  const key = head.indexOf('Issue key');
  const hours = head.indexOf('Worklog Hours');
  assert.ok(key >= 0 && hours >= 0, 'Issue key and Worklog Hours are columns');
  return rows.map((r) => `${r[key]} ${r[hours]}`).sort();
};

test('the page’s way makes the same Details rows as the data itself, and replays from the cache', async () => {
  // The same data served straight by the fake Jira to the extension's code —
  // no bridge, no cache, no account lookup — kept to the three roster people.
  const meta = Object.fromEntries([A, B, C, D].map((p) => [p.key, { displayName: p.name, email: p.email }]));
  const csvAuthors = Object.fromEntries(Object.entries(meta).map(([key, m]) => [key, { accountId: key, displayName: m.displayName, emailAddress: m.email }]));
  const csvConfig = buildExportConfig({ scriptsJson, dataset, meta, dateFrom, dateTo, withSummary: true, users: [A.key, B.key, C.key] });
  const viaCsv = await runExtensionExport({ config: csvConfig, origin: dataset.origin, fetch: createJiraEmulator({ dataset, authors: csvAuthors, origin: dataset.origin }) });
  assert.equal(viaCsv.ok, true, viaCsv.message);

  // The Jira path, through the cache, as jira-run.js runs it.
  const person = (p) => ({ accountId: p.accountId, displayName: p.name, emailAddress: p.email });
  const jira = createFakeJira({ dataset, authors: Object.fromEntries([A, B, C, D].map((p) => [p.key, person(p)])), people: [A, B, C, D].map(person) });
  const fetch = createFetchCache(jira.fetch);
  const found = await resolveAccounts(fetch, roster, {});
  assert.deepEqual(found.missing, []);
  const fields = await (await fetch('/rest/api/3/field')).json();
  const config = buildJiraExportConfig({
    scriptsJson, site: jira.site, fields, dateFrom, dateTo, withSummary: true,
    users: roster.map((e) => found.accounts[e]), meta: found.meta, teamEmails: roster
  });
  const viaJira = await runExtensionExport({ config, origin: `https://${jira.site}`, fetch });
  assert.equal(viaJira.ok, true, viaJira.message);
  assert.ok(detailRows(viaCsv).length >= 3, 'there are rows to compare');
  assert.deepEqual(detailRows(viaJira), detailRows(viaCsv));

  const asked = fetch.entries().length;
  const again = await runExtensionExport({ config, origin: `https://${jira.site}`, fetch });
  assert.deepEqual(detailRows(again), detailRows(viaJira));
  assert.equal(fetch.entries().length, asked, 'the second run asked Jira nothing new');
});
