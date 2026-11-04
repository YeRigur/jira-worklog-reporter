import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFetchCache } from '../src/core/fetch-cache.js';

const backendOf = (answers) => {
  const calls = [];
  const fn = async (input, init = {}) => {
    calls.push([String(input), init.method || 'GET', init.body || '']);
    const [status, text] = answers.shift();
    return new Response(text, { status });
  };
  return { fn, calls };
};

test('the same request is answered from memory the second time', async () => {
  const { fn, calls } = backendOf([[200, '{"a":1}']]);
  const cached = createFetchCache(fn);
  const first = await cached('/rest/api/3/myself');
  const second = await cached('/rest/api/3/myself');
  assert.deepEqual(await first.json(), { a: 1 });
  assert.deepEqual(await second.json(), { a: 1 });
  assert.equal(calls.length, 1);
  assert.deepEqual(cached.entries(), [{ method: 'GET', url: '/rest/api/3/myself', body: '', status: 200, text: '{"a":1}' }]);
});

test('method and body are part of the key', async () => {
  const { fn, calls } = backendOf([[200, '1'], [200, '2']]);
  const cached = createFetchCache(fn);
  await cached('/rest/api/3/search/jql', { method: 'POST', body: '{"jql":"a"}' });
  await cached('/rest/api/3/search/jql', { method: 'POST', body: '{"jql":"b"}' });
  assert.equal(calls.length, 2);
});

test('failures are passed through and not kept', async () => {
  const { fn, calls } = backendOf([[500, 'boom'], [200, '{}']]);
  const cached = createFetchCache(fn);
  assert.equal((await cached('/x')).status, 500);
  assert.equal((await cached('/x')).status, 200);
  assert.equal(calls.length, 2);
});

test('clear forgets everything', async () => {
  const { fn, calls } = backendOf([[200, '1'], [200, '1']]);
  const cached = createFetchCache(fn);
  await cached('/x');
  cached.clear();
  await cached('/x');
  assert.equal(calls.length, 2);
  assert.equal(cached.entries().length, 1);
});
