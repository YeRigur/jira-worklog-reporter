// The Worklogs bridge: a bookmarklet the person clicks in their Jira tab. It is
// a plain relay and meant never to change: the export page sends it a request,
// it checks it (the page's own origin, GET only, Jira's REST API only), runs it
// same-origin with the person's session, and posts the answer back to that
// page only. While the export runs it shows the page's progress in a card over
// the Jira tab. Everything else — which calls, how often, what to say — lives
// on the page and in src/config/jira-bridge.js, which the bookmark is built from.
import { jiraBridge } from '../config/jira-bridge.js';

export const BRIDGE_VERSION = jiraBridge.protocol;

// A path the bookmark may be asked for at all: one leading slash, no tricks.
const looksSafe = (p) => p.startsWith('/') && !p.includes('//') && !p.includes('..') && !p.includes('#')
  && !p.includes('\\') && !/%2e/i.test(p);

const escape = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const patternOf = (path) => new RegExp(`^${path.split('*').map(escape).join('[A-Za-z0-9_-]+')}(\\?[^#]*)?$`);

// The page's own check, from the config: GET, and one of the allowed calls.
export function allowRequest(method, path, config = jiraBridge) {
  const p = String(path || '');
  if (String(method || 'GET').toUpperCase() !== 'GET' || !looksSafe(p) || !p.startsWith(config.apiPrefix)) return false;
  return config.allowedPaths.map(patternOf).some((re) => re.test(p));
}

// Runs in the Jira tab. Uses only window, document, location, fetch and alert.
// `C` is { origin, protocol, prefix, text } — fixed when the bookmark is made.
const relay = (C, looksSafe) => {
  const T = C.text;
  const opener = window.opener;
  if (!opener) { alert(T.noOpener); return; }
  const announce = () => opener.postMessage({ type: 'wl-bridge:ready', v: C.protocol, site: location.host }, C.origin);
  if (window.__wlBridge) { window.__wlBridge.show(); announce(); return; }

  const el = (tag, css, text) => {
    const n = document.createElement(tag);
    n.style.cssText = css;
    if (text) n.textContent = text;
    return n;
  };
  const shade = el('div', 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.35);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif');
  const card = el('div', 'width:min(420px,calc(100vw - 32px));padding:22px 24px;border-radius:12px;background:#fff;color:#1f2937;box-shadow:0 20px 50px rgba(0,0,0,.25);text-align:center');
  const title = el('div', 'font-weight:700;font-size:16px;margin-bottom:6px', T.title);
  const text = el('div', 'color:#4b5563;min-height:20px', T.connected);
  const track = el('div', 'height:6px;margin:14px 0 8px;border-radius:3px;background:#e5e7eb;overflow:hidden');
  const bar = el('div', 'height:100%;width:0;background:#107c10;transition:width .3s');
  const meta = el('div', 'font-size:12px;color:#6b7280');
  const actions = el('div', 'display:none;gap:8px;justify-content:center;margin-top:16px');
  const button = (label, primary, onclick) => {
    const b = el('button', 'padding:8px 14px;border-radius:6px;font:inherit;font-weight:600;cursor:pointer;border:1px solid ' + (primary ? '#107c10;background:#107c10;color:#fff' : '#d1d5db;background:#fff;color:#1f2937'), label);
    b.addEventListener('click', onclick);
    return b;
  };
  const show = () => { if (!shade.parentNode) document.body.appendChild(shade); };
  const hide = () => { if (shade.parentNode) shade.parentNode.removeChild(shade); };
  actions.appendChild(button(T.closeTab, true, () => window.close()));
  actions.appendChild(button(T.backToJira, false, hide));
  track.appendChild(bar);
  [title, text, track, meta, actions].forEach((n) => card.appendChild(n));
  shade.appendChild(card);
  let count = 0;
  let over = false;
  const paintMeta = () => { meta.textContent = count + ' ' + T.requests + (over ? '' : ' · ' + T.keepOpen); };
  paintMeta();
  show();
  window.__wlBridge = { show };

  // What the page says: { title?, text?, pct?, done?, error? }.
  const status = (d) => {
    show();
    over = Boolean(d.done || d.error);
    title.textContent = d.done ? T.done : (d.error ? T.failed : String(d.title || T.title));
    if (d.text) text.textContent = String(d.text);
    if (typeof d.pct === 'number') bar.style.width = Math.max(0, Math.min(100, d.pct)) + '%';
    if (d.done) bar.style.width = '100%';
    bar.style.background = d.error ? '#c50f1f' : '#107c10';
    actions.style.display = over ? 'flex' : 'none';
    paintMeta();
  };

  window.addEventListener('message', async (event) => {
    const d = event.data;
    if (event.origin !== C.origin || event.source !== opener || !d) return;
    if (d.type === 'wl-bridge:status') { status(d); return; }
    if (d.type !== 'wl-bridge:fetch') return;
    const reply = (code, body, retryAfter) => opener.postMessage({ type: 'wl-bridge:response', id: d.id, status: code, body, retryAfter: retryAfter || '' }, C.origin);
    const path = String(d.path || '');
    // Read-only, and Jira's REST API only — whatever the page asks.
    if (String(d.method || 'GET').toUpperCase() !== 'GET' || !looksSafe(path) || path.indexOf(C.prefix) !== 0) { reply(403, 'Refused by the bridge'); return; }
    count++;
    paintMeta();
    try {
      const res = await fetch(path, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
      reply(res.status, await res.text(), res.headers.get('Retry-After'));
    } catch (e) {
      reply(0, String((e && e.message) || e));
    }
  });
  announce();
};

export function bookmarkletSource(pageOrigin, config = jiraBridge) {
  const C = { origin: pageOrigin, protocol: config.protocol, prefix: config.apiPrefix, text: config.text };
  return `(() => {\n(${relay.toString()})(${JSON.stringify(C)}, ${looksSafe.toString()});\n})();`;
}

export const bookmarkletUrl = (pageOrigin, config = jiraBridge) => `javascript:${encodeURIComponent(bookmarkletSource(pageOrigin, config))}`;
