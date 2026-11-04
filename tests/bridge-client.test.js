import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBridge, BridgeError } from '../src/app/bridge-client.js';

const SITE = 'acme.atlassian.net';
const ORIGIN = `https://${SITE}`;

function fakeTimers() {
  let now = 0;
  let next = 0;
  const jobs = new Map();
  return {
    setTimeout: (fn, ms) => { jobs.set(++next, { fn, at: now + ms }); return next; },
    clearTimeout: (id) => jobs.delete(id),
    setInterval: (fn, ms) => { jobs.set(++next, { fn, at: now + ms, every: ms }); return next; },
    clearInterval: (id) => jobs.delete(id),
    advance(ms) {
      now += ms;
      for (const [id, job] of [...jobs]) {
        if (job.at > now) continue;
        if (job.every) job.at += job.every; else jobs.delete(id);
        job.fn();
      }
    }
  };
}
function fakeEvents() {
  const fns = new Set();
  return { addEventListener: (t, fn) => fns.add(fn), removeEventListener: (t, fn) => fns.delete(fn), emit: (ev) => [...fns].forEach((fn) => fn(ev)), count: () => fns.size };
}
function setup(opts = {}) {
  const win = { closed: false, sent: [], postMessage(data, target) { this.sent.push({ data, target }); } };
  const events = fakeEvents();
  const timers = fakeTimers();
  const opened = [];
  const delays = [];
  const bridge = openBridge({
    site: SITE, events, timers, sleep: async (ms) => { delays.push(ms); },
    open: (url, name) => { opened.push([url, name]); return opts.blocked ? null : win; }
  });
  const fromJira = (data, { origin = ORIGIN, source = win } = {}) => events.emit({ origin, source, data });
  const answer = (status, body = '{}', retryAfter = '') => fromJira({ type: 'wl-bridge:response', id: win.sent.at(-1).data.id, status, body, retryAfter });
  return { bridge, win, events, timers, opened, delays, fromJira, answer };
}
const tick = () => new Promise((r) => setImmediate(r));

test('a blocked pop-up is its own error', () => {
  assert.throws(() => setup({ blocked: true }), (e) => e instanceof BridgeError && e.code === 'popup-blocked');
});

test('it opens the Jira tab and is ready only when that tab says so', async () => {
  const { bridge, opened, fromJira } = setup();
  assert.deepEqual(opened, [[`${ORIGIN}/jira/your-work`, 'jira-worklogs-bridge']]);
  let ready = false;
  bridge.ready.then(() => { ready = true; });
  fromJira({ type: 'wl-bridge:ready', v: 1, site: SITE }, { origin: 'https://evil.com' });
  fromJira({ type: 'wl-bridge:ready', v: 1, site: SITE }, { source: {} });
  await tick();
  assert.equal(ready, false);
  fromJira({ type: 'wl-bridge:ready', v: 1, site: SITE });
  await tick();
  assert.equal(ready, true);
});

test('an old bookmark is told to update', async () => {
  const { bridge, fromJira } = setup();
  fromJira({ type: 'wl-bridge:ready', v: 0, site: SITE });
  await assert.rejects(bridge.ready, (e) => e.code === 'old-bridge');
});

test('fetch sends the path to the Jira tab and returns its answer as a Response', async () => {
  const { bridge, win, answer } = setup();
  const pending = bridge.fetch('/rest/api/3/search/jql', { method: 'POST', body: '{"jql":"x"}' });
  assert.deepEqual(win.sent[0], { data: { type: 'wl-bridge:fetch', id: 1, method: 'POST', path: '/rest/api/3/search/jql', body: '{"jql":"x"}' }, target: ORIGIN });
  answer(200, '{"issues":[]}');
  const res = await pending;
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { issues: [] });
  const abs = bridge.fetch(`${ORIGIN}/rest/api/3/issue/AC-1/worklog?startAt=0`);
  assert.equal(win.sent[1].data.path, '/rest/api/3/issue/AC-1/worklog?startAt=0');
  answer(404, 'nope');
  assert.equal((await abs).status, 404);
  await assert.rejects(bridge.fetch('https://evil.com/rest/api/3/myself'), TypeError);
});

test('429 is retried after Retry-After, then the backoff', async () => {
  const { bridge, delays, answer } = setup();
  const pending = bridge.fetch('/rest/api/3/myself');
  answer(429, '', '3');
  await tick();
  answer(429, '');
  await tick();
  answer(200, '{"me":1}');
  assert.equal((await pending).status, 200);
  assert.deepEqual(delays, [3000, 4000]);
});

test('status 0 is a network error', async () => {
  const { bridge, answer } = setup();
  const pending = bridge.fetch('/rest/api/3/myself');
  answer(0, 'offline');
  await assert.rejects(pending, (e) => e instanceof TypeError && /offline/.test(e.message));
});

test('a closed tab fails what is pending and everything after', async () => {
  const { bridge, win, timers, events } = setup();
  const pending = bridge.fetch('/rest/api/3/myself');
  win.closed = true;
  timers.advance(1000);
  await assert.rejects(pending, (e) => e.code === 'closed');
  await assert.rejects(bridge.fetch('/rest/api/3/myself'), (e) => e.code === 'closed');
  await assert.rejects(bridge.ready, (e) => e.code === 'closed');
  assert.equal(bridge.closed, true);
  assert.equal(events.count(), 0);
});

test('no answer in 60 seconds is a timeout', async () => {
  const { bridge, timers } = setup();
  const pending = bridge.fetch('/rest/api/3/myself');
  timers.advance(60000);
  await assert.rejects(pending, (e) => e.code === 'timeout');
});
