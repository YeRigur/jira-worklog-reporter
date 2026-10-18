// Starts the real page (index.html's src/main.js) on a stand-in DOM, feeds it
// the synthetic CSV and a settings file, and opens every screen — a page that
// fails to start, or a screen that throws, fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakeDom } from './support/fake-dom.js';
import { PEOPLE } from './fixtures/synthetic.js';
import { PAGES } from '../src/ui/render.js';

const { app: root } = installFakeDom(globalThis);
const quiet = console.log;
console.log = () => {};
await import('../src/main.js');
console.log = quiet;
const hook = globalThis.__SL_TEST__;

const card = () => root.find((n) => String(n.className).startsWith('tcard'));
const settle = async () => {
  for (let i = 0; i < 400 && hook.state.previewing; i++) await new Promise((r) => setTimeout(r, 25));
  await new Promise((r) => setTimeout(r, 25));
};
const file = (name, text, type) => new File([text], name, { type });

test('the page starts, with nothing of anyone in it', () => {
  const text = root.textContent;
  assert.match(text, /Jira Worklogs Export/);
  assert.doesNotMatch(text, /@/);
});

test('a settings file and a CSV give the main card, with the Excel ready', async () => {
  hook.state.from = '2026-08-01';
  hook.state.to = '2026-08-31';
  const settings = { roster: [PEOPLE.A.email, PEOPLE.C.email], jql: '' };
  await hook.load([file('worklogs-settings.json', JSON.stringify(settings), 'application/json')]);
  await hook.load([file('export.csv', readFileSync(new URL('./fixtures/synthetic.csv', import.meta.url)), 'text/csv')]);
  await settle();
  assert.ok(hook.state.dataset, 'the CSV was read');
  assert.equal(hook.state.page, 'main');
  assert.ok(hook.state.preview?.ok, 'the workbook was built');
  assert.match(card().textContent, /August 2026/);
});

test('every screen renders', async () => {
  const pages = Object.keys(PAGES);
  assert.ok(pages.length >= 10);
  for (const page of pages) {
    hook.state.page = page;
    assert.doesNotThrow(() => hook.render(), page);
    await settle();
    assert.ok(card().textContent.length > 0, page);
  }
  hook.state.page = 'main';
  hook.render();
});

test('Excel only has the people the settings name', async () => {
  const preview = hook.state.preview;
  const text = JSON.stringify(preview.sheets ?? preview);
  assert.ok(text.includes(PEOPLE.A.email), 'a roster person is in');
  assert.ok(!text.includes(PEOPLE.D.email), 'someone outside the roster is not');
});
