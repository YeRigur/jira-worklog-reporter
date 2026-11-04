// The real page in Jira mode, with a fake Jira behind the bridge: Start finds
// the people, the export runs, and the Excel is ready to download.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './support/fake-dom.js';
import { buildDataset } from '../src/core/dataset.js';
import { fieldIdsFromCatalog } from '../src/core/export-config.js';
import { catalog } from '../src/config/catalog.js';
import { createFakeJira } from '../src/dev/fake-jira.js';
import { csvFile } from './support/helpers.js';
import { HEADERS, ROWS, PEOPLE } from './fixtures/synthetic.js';

process.env.TZ = 'Europe/Kyiv';
const { app: root } = installFakeDom(globalThis);
const quiet = console.log;
console.log = () => {};
await import('../src/main.js');
console.log = quiet;
const hook = globalThis.__SL_TEST__;
const { A, B, C, D } = PEOPLE;

const settle = async () => {
  for (let i = 0; i < 400 && (hook.state.previewing || hook.state.jira.phase === 'running'); i++) await new Promise((r) => setTimeout(r, 25));
  await new Promise((r) => setTimeout(r, 25));
};
const file = (name, text, type) => new File([text], name, { type });
const person = (p) => ({ accountId: p.accountId, displayName: p.name, emailAddress: p.email });
const dataset = buildDataset([csvFile('synthetic.csv', HEADERS, ROWS)], { fieldIds: fieldIdsFromCatalog(catalog) });
let opened = 0;
hook.jira.setConnect(() => {
  opened++;
  return createFakeJira({ dataset, authors: Object.fromEntries([A, B, C, D].map((p) => [p.key, person(p)])), people: [A, B].map(person) });
});

test('the page starts in Jira mode', () => {
  assert.equal(hook.state.source, 'jira');
});

test('Start finds the people, runs the export through the bridge, and the Excel is ready', async () => {
  hook.state.from = '2026-08-01';
  hook.state.to = '2026-08-31';
  const settings = { site: 'acme.atlassian.net', roster: [A.email, B.email, C.email] };
  await hook.load([file('worklogs-settings.json', JSON.stringify(settings), 'application/json')]);
  assert.deepEqual(hook.app.pickedEmails(), [A.email, B.email, C.email]);
  await hook.jira.start();
  await settle();
  assert.equal(opened, 1);
  assert.deepEqual(hook.state.jira.missing, [C.email], 'C is not in this Jira');
  assert.equal(hook.state.settings.accounts[A.email], A.accountId, 'found accounts are kept');
  assert.ok(hook.state.preview?.ok, hook.state.preview?.message);
  assert.match(hook.state.preview.filename, /\.xlsx$/);
  assert.ok(hook.jira.projects().projects.some((p) => p.key === 'AC'));
});

test('a new period asks for Start again, on the same bridge', async () => {
  hook.state.to = '2026-08-15';
  hook.render();
  await settle();
  assert.equal(hook.state.jira.phase, 'idle');
  await hook.jira.start();
  await settle();
  assert.equal(opened, 1, 'the open bridge was reused');
  assert.ok(hook.state.preview?.ok);
});

test('picking nobody keeps Start from running', async () => {
  hook.app.pickPeople([]);
  await hook.jira.start();
  assert.equal(opened, 1);
  hook.app.pickPeople([A.email, B.email]);
});

test('the start screen shows the people, the site, Start and the bookmark; preview and groups open', async () => {
  hook.app.pickPeople([A.email, B.email]);
  await hook.jira.start();
  await settle();
  hook.state.page = 'main';
  hook.render();
  const text = root.textContent;
  for (const s of ['People', A.email, 'Jira site', 'Start', 'Worklogs bridge', 'Download Excel', 'Or upload a CSV']) assert.ok(text.includes(s), s);
  for (const page of ['preview', 'groups']) {
    hook.state.page = page;
    assert.doesNotThrow(() => hook.render(), page);
  }
  hook.state.page = 'main';
  hook.render();
});

test('with a team filter, only the people it names are ticked at first', async () => {
  hook.state.picked = null;
  const jql = `worklogDate >= startOfMonth(-1) AND worklogAuthor in ("${B.email}", "${A.email}")`;
  await hook.load([file('worklogs-settings.json', JSON.stringify({ roster: [A.email, B.email, C.email], jql }), 'application/json')]);
  assert.deepEqual(hook.app.pickedEmails(), [A.email, B.email]);
  hook.app.pickPeople([C.email]);
  assert.deepEqual(hook.app.pickedEmails(), [C.email], 'a choice of their own wins');
});

test('people are listed by team group, and a group gets a separate Excel of its own', async () => {
  const groupByDomain = { 'ua.example.com': 'Team UA', 'br.example.com': 'Team BR' };
  await hook.load([file('worklogs-settings.json', JSON.stringify({ site: 'acme.atlassian.net', roster: [A.email, B.email, C.email], groupByDomain }), 'application/json')]);
  hook.app.pickPeople([C.email]);
  hook.render();
  const text = root.textContent;
  for (const s of ['Team UA', 'Team BR', 'Separate report']) assert.ok(text.includes(s), s);
  await hook.jira.groupReport([A.email, B.email], 'Team UA');
  assert.equal(hook.state.jira.reportNote?.ok, true, hook.state.jira.reportNote?.text);
  assert.match(hook.state.jira.reportNote.text, / - Team UA\.xlsx/);
  assert.deepEqual(hook.app.pickedEmails(), [C.email], 'the main selection is untouched');
  assert.equal(hook.state.jira.report, '');
});

test('the Jira site typed on the page goes into the settings file', () => {
  hook.app.rememberSite('https://Other-Site.atlassian.net/jira/your-work');
  assert.equal(hook.state.settings.site, 'other-site.atlassian.net');
  hook.app.rememberSite('not a site');
  assert.equal(hook.state.settings.site, 'other-site.atlassian.net');
});

test('loading another settings file on the start screen replaces the first, it doesn’t add to it', async () => {
  await hook.load([file('worklogs-settings-acme.json', JSON.stringify({ site: 'acme.atlassian.net', roster: [A.email, B.email, C.email] }), 'application/json')]);
  hook.app.pickPeople([C.email]);
  await hook.load([file('worklogs-settings-other.json', JSON.stringify({ site: 'other.atlassian.net', roster: [A.email], jql: `worklogAuthor in ("${A.email}")` }), 'application/json')]);
  assert.deepEqual(hook.state.settings.roster, [A.email], 'only the new file’s people');
  assert.equal(hook.state.settings.site, 'other.atlassian.net');
  assert.equal(hook.jira.site(), 'other.atlassian.net', 'the new site is used, not the one typed before');
  assert.deepEqual(hook.app.pickedEmails(), [A.email], 'ticks start over from the new file');
  assert.equal(hook.state.settingsName, 'worklogs-settings-other.json');
  hook.state.page = 'main';
  hook.render();
  assert.ok(root.textContent.includes('worklogs-settings-other.json'), 'step 1 names the file');
});
