import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowRequest, bookmarkletSource, bookmarkletUrl, BRIDGE_VERSION } from '../src/core/bridge.js';

const PAGE = 'https://me.github.io';

test('the six read calls are allowed', () => {
  assert.ok(allowRequest('POST', '/rest/api/3/search/jql'));
  assert.ok(allowRequest('GET', '/rest/api/3/issue/AC-1/worklog?startAt=0&maxResults=5000'));
  assert.ok(allowRequest('get', '/rest/api/3/issue/10001/worklog'));
  assert.ok(allowRequest('GET', '/rest/api/3/user/search?query=a.b%40x.com&maxResults=10'));
  assert.ok(allowRequest('GET', '/rest/api/3/user?accountId=712020%3Aabc'));
  assert.ok(allowRequest('GET', '/rest/api/3/myself'));
  assert.ok(allowRequest('GET', '/rest/api/3/field'));
});

test('everything else is refused', () => {
  const refused = [
    ['GET', '/rest/api/3/search/jql'], ['DELETE', '/rest/api/3/issue/AC-1/worklog'], ['PUT', '/rest/api/3/myself'],
    ['POST', '/rest/api/3/issue/AC-1/worklog'], ['GET', '//evil.com/rest/api/3/myself'], ['GET', 'https://evil.com/rest/api/3/myself'],
    ['GET', '/rest/api/3/../../secure/x'], ['GET', '/rest/api/3/issue/%2e%2e/worklog'], ['GET', '/rest/api/3/user/bulk/migration?key=a'],
    ['GET', '/rest/api/3/myself#x'], ['GET', 'rest/api/3/myself'], ['GET', '/rest/api/2/myself'], ['GET', '/rest/api/3/myself\\x'], ['GET', '']
  ];
  for (const [method, path] of refused) assert.equal(allowRequest(method, path), false, `${method} ${path}`);
});

// A Jira tab the bookmarklet can run in.
function jiraTab({ opener = makeOpener(), fetch = async () => new Response('{}') } = {}) {
  const listeners = [];
  const alerts = [];
  const body = { children: [], appendChild(n) { this.children.push(n); } };
  const win = { opener, addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); } };
  const document = { body, createElement: () => ({ style: {}, textContent: '' }) };
  const location = { host: 'acme.atlassian.net' };
  const run = () => new Function('window', 'document', 'location', 'fetch', 'alert', bookmarkletSource(PAGE))(win, document, location, fetch, (m) => alerts.push(m));
  const send = (data, { from = PAGE, source = opener } = {}) => Promise.all(listeners.map((fn) => fn({ origin: from, source, data })));
  return { opener, body, alerts, run, send, listeners };
}
function makeOpener() {
  const sent = [];
  return { sent, postMessage: (data, target) => sent.push({ data, target }) };
}

test('without the export page as opener it only says how to use it', () => {
  const tab = jiraTab({ opener: null });
  tab.run();
  assert.equal(tab.alerts.length, 1);
  assert.equal(tab.listeners.length, 0);
});

test('it tells the export page it is ready, and only that page', () => {
  const tab = jiraTab();
  tab.run();
  assert.deepEqual(tab.opener.sent, [{ data: { type: 'wl-bridge:ready', v: BRIDGE_VERSION, site: 'acme.atlassian.net' }, target: PAGE }]);
  assert.equal(tab.body.children.length, 1, 'the badge is shown');
});

test('an allowed request runs same-origin with the session, and the answer goes back', async () => {
  const calls = [];
  const tab = jiraTab({ fetch: async (path, init) => { calls.push([path, init]); return new Response('{"ok":1}', { status: 200 }); } });
  tab.run();
  await tab.send({ type: 'wl-bridge:fetch', id: 7, method: 'POST', path: '/rest/api/3/search/jql', body: '{"jql":"x"}' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/rest/api/3/search/jql');
  assert.equal(calls[0][1].credentials, 'include');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].headers['Content-Type'], 'application/json');
  assert.deepEqual(tab.opener.sent.at(-1), { data: { type: 'wl-bridge:response', id: 7, status: 200, body: '{"ok":1}', retryAfter: '' }, target: PAGE });
});

test('messages from another origin or another window are ignored', async () => {
  let called = 0;
  const tab = jiraTab({ fetch: async () => { called++; return new Response('{}'); } });
  tab.run();
  const msg = { type: 'wl-bridge:fetch', id: 1, method: 'GET', path: '/rest/api/3/myself' };
  await tab.send(msg, { from: 'https://evil.com' });
  await tab.send(msg, { source: {} });
  assert.equal(called, 0);
  assert.equal(tab.opener.sent.length, 1, 'only the ready message');
});

test('a request off the allow-list is refused without touching Jira', async () => {
  let called = 0;
  const tab = jiraTab({ fetch: async () => { called++; return new Response('{}'); } });
  tab.run();
  await tab.send({ type: 'wl-bridge:fetch', id: 2, method: 'DELETE', path: '/rest/api/3/issue/AC-1/worklog' });
  assert.equal(called, 0);
  assert.equal(tab.opener.sent.at(-1).data.status, 403);
});

test('a network error comes back as status 0 with the message', async () => {
  const tab = jiraTab({ fetch: async () => { throw new Error('offline'); } });
  tab.run();
  await tab.send({ type: 'wl-bridge:fetch', id: 3, method: 'GET', path: '/rest/api/3/myself' });
  assert.deepEqual(tab.opener.sent.at(-1).data, { type: 'wl-bridge:response', id: 3, status: 0, body: 'offline', retryAfter: '' });
});

test('clicking it twice announces again without a second listener', () => {
  const tab = jiraTab();
  tab.run();
  tab.run();
  assert.equal(tab.listeners.length, 1);
  assert.equal(tab.opener.sent.filter((m) => m.data.type === 'wl-bridge:ready').length, 2);
});

test('the bookmark is the source as a javascript: URL', () => {
  const url = bookmarkletUrl(PAGE);
  assert.ok(url.startsWith('javascript:'));
  assert.equal(decodeURIComponent(url.slice('javascript:'.length)), bookmarkletSource(PAGE));
  assert.ok(bookmarkletSource(PAGE).includes(JSON.stringify(PAGE)));
});
