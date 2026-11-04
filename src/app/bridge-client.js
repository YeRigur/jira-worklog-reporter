// The page's end of the Worklogs bridge: opens the Jira tab, waits for the
// bookmark to answer, and offers a fetch() whose requests run in that tab.
// Nothing here connects anywhere — it only posts messages to the tab it opened.
import { BRIDGE_VERSION, allowRequest } from '../core/bridge.js';
import { jiraBridge } from '../config/jira-bridge.js';

const MESSAGES = {
  'popup-blocked': 'Your browser blocked the Jira tab. Allow pop-ups for this page, then press Start again.',
  closed: 'The Jira tab was closed. Press Start again — what was already fetched is kept.',
  'old-bridge': 'Your Worklogs bridge bookmark is from an older version. Drag the new one below to your bookmarks bar (replace the old one), then click it in the Jira tab. This one stays valid when the page changes.',
  timeout: 'Jira didn’t answer within a minute. Check the Jira tab, then press Start again.'
};

export class BridgeError extends Error {
  constructor(code) {
    super(MESSAGES[code] || code);
    this.code = code;
  }
}

export const bridgeMessage = (code) => MESSAGES[code] || code;

// The bookmark only reads: the export's POST search is sent as the same
// search by GET (/rest/api/3/search/jql takes the same fields as a query).
export function asGet(method, url, body) {
  const path = url.pathname + url.search;
  if (method !== 'POST' || url.pathname !== '/rest/api/3/search/jql') return { method, path };
  let fields = {};
  try { fields = body ? JSON.parse(body) : {}; } catch { /* sent as it is, and refused */ return { method, path }; }
  const q = new URLSearchParams(url.search);
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined || v === '') continue;
    q.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return { method: 'GET', path: `${url.pathname}?${q}` };
}

export function openBridge({ site, open, events, timers = globalThis, config = jiraBridge, sleep = (ms) => new Promise((r) => timers.setTimeout(r, ms)) }) {
  const origin = `https://${site}`;
  const win = open(`${origin}${config.jiraTabPath}`, config.windowName);
  if (!win) throw new BridgeError('popup-blocked');

  const pending = new Map();
  let nextId = 1;
  let closed = false;
  let isReady = false;
  let settle;
  const ready = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  ready.catch(() => {}); // nobody may be waiting when the tab closes

  const onMessage = (event) => {
    if (event.origin !== origin || event.source !== win) return;
    const d = event.data || {};
    if (d.type === 'wl-bridge:ready') {
      if (isReady) return;
      if (!(Number(d.v) >= BRIDGE_VERSION)) { settle.reject(new BridgeError('old-bridge')); return; }
      isReady = true;
      settle.resolve({ site: d.site });
    } else if (d.type === 'wl-bridge:response' && pending.has(d.id)) {
      const p = pending.get(d.id);
      pending.delete(d.id);
      timers.clearTimeout(p.timer);
      p.resolve(d);
    }
  };
  events.addEventListener('message', onMessage);
  const poll = timers.setInterval(() => { if (win.closed) shutDown(); }, config.tabCheckMs);

  function shutDown() {
    if (closed) return;
    closed = true;
    timers.clearInterval(poll);
    events.removeEventListener('message', onMessage);
    for (const p of pending.values()) { timers.clearTimeout(p.timer); p.reject(new BridgeError('closed')); }
    pending.clear();
    if (!isReady) settle.reject(new BridgeError('closed'));
  }

  const ask = (method, path) => new Promise((resolve, reject) => {
    if (closed) { reject(new BridgeError('closed')); return; }
    const id = nextId++;
    const timer = timers.setTimeout(() => { pending.delete(id); reject(new BridgeError('timeout')); }, config.requestTimeoutMs);
    pending.set(id, { resolve, reject, timer });
    win.postMessage({ type: 'wl-bridge:fetch', id, method, path }, origin);
  });

  async function fetch(input, init = {}) {
    const url = new URL(String(input), origin);
    if (url.origin !== origin) throw new TypeError(`The bridge only talks to ${origin}, not ${url.origin}.`);
    const call = asGet(String(init.method || 'GET').toUpperCase(), url, init.body == null ? '' : String(init.body));
    if (!allowRequest(call.method, call.path, config)) throw new TypeError(`The bridge isn’t set up for ${call.method} ${url.pathname} (src/config/jira-bridge.js).`);
    for (let attempt = 0; ; attempt++) {
      const reply = await ask(call.method, call.path);
      if (reply.status === 429 && attempt < config.retries429) {
        const secs = Number(reply.retryAfter);
        await sleep(Number.isFinite(secs) && secs > 0 ? secs * 1000 : config.retryBaseMs * 2 ** attempt);
        continue;
      }
      if (!reply.status) throw new TypeError(reply.body || 'Network error in the Jira tab.');
      const empty = reply.status === 204 || reply.status === 304;
      return new Response(empty ? null : reply.body, { status: reply.status, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // What the export is doing, shown in the card over the Jira tab.
  const status = (payload) => {
    if (closed || !isReady) return;
    win.postMessage({ type: 'wl-bridge:status', ...payload }, origin);
  };

  return { ready, fetch, status, close: shutDown, get closed() { return closed; } };
}
