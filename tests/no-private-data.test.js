// The page carries no team's data: people, Jira sites and project groups come
// from the settings file only. This keeps real addresses out of the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const filesIn = (dir) => readdirSync(join(ROOT, dir)).flatMap((name) => {
  const rel = join(dir, name);
  return statSync(join(ROOT, rel)).isDirectory() ? filesIn(rel) : [rel];
});
const SHIPPED = ['index.html', ...filesIn('src'), ...filesIn('styles')].filter((f) => /\.(js|html|css)$/.test(f));

// Placeholders the page and its examples may use.
const EXAMPLE_MAIL = /@(example\.com|x\.com|company\.com|[a-z]{2}\.example\.com)$/i;
const EXAMPLE_SITE = /^(your-site|site|acme|jira|other|\*)\.atlassian\.net$/i;

test('no real email address in the page’s code', () => {
  for (const file of SHIPPED) {
    const found = readFileSync(join(ROOT, file), 'utf8').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
    const real = found.filter((m) => !EXAMPLE_MAIL.test(m));
    assert.deepEqual(real, [], file);
  }
});

test('no real Jira site in the page’s code', () => {
  for (const file of SHIPPED) {
    const found = readFileSync(join(ROOT, file), 'utf8').match(/[a-z0-9*-]+\.atlassian\.net/gi) || [];
    assert.deepEqual(found.filter((m) => !EXAMPLE_SITE.test(m)), [], file);
  }
});
