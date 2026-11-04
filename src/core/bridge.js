// The Worklogs bridge: a bookmarklet the person clicks in their Jira tab. It
// runs the read-only REST calls the export page sends it, same-origin with the
// person's own session, and posts the answers back to that page only. The
// allow-list below is the single source: the bookmarklet carries its text.

// 2: the page sends wl-bridge:status, shown in a card over the Jira tab.
export const BRIDGE_VERSION = 2;

const ROUTES = [
  ['POST', /^\/rest\/api\/3\/search\/jql$/],
  ['GET', /^\/rest\/api\/3\/issue\/[A-Za-z0-9_-]+\/worklog(\?[^#]*)?$/],
  ['GET', /^\/rest\/api\/3\/user\/search(\?[^#]*)?$/],
  ['GET', /^\/rest\/api\/3\/user(\?[^#]*)?$/],
  ['GET', /^\/rest\/api\/3\/myself$/],
  ['GET', /^\/rest\/api\/3\/field$/]
];

export function allowRequest(method, path) {
  const m = String(method || 'GET').toUpperCase();
  const p = String(path || '');
  if (!p.startsWith('/') || p.includes('//') || p.includes('..') || p.includes('#') || p.includes('\\') || /%2e/i.test(p)) return false;
  return ROUTES.some(([rm, re]) => rm === m && re.test(p));
}

// Runs in the Jira tab. Uses only window, document, location, fetch and alert.
// While the export runs, the Jira page is blurred behind a card that shows
// what the export page reports; at the end it says the tab can be closed.
const relay = (PAGE_ORIGIN, V) => {
  const opener = window.opener;
  if (!opener) {
    alert('Open Jira with Start on the export page, then click this bookmark there.');
    return;
  }
  const announce = () => opener.postMessage({ type: 'wl-bridge:ready', v: V, site: location.host }, PAGE_ORIGIN);
  if (window.__wlBridge) { window.__wlBridge.show(); announce(); return; }

  const el = (tag, css, text) => {
    const n = document.createElement(tag);
    n.style.cssText = css;
    if (text) n.textContent = text;
    return n;
  };
  const shade = el('div', 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.35);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif');
  const card = el('div', 'width:min(420px,calc(100vw - 32px));padding:22px 24px;border-radius:12px;background:#fff;color:#1f2937;box-shadow:0 20px 50px rgba(0,0,0,.25);text-align:center');
  const title = el('div', 'font-weight:700;font-size:16px;margin-bottom:6px', 'Worklogs export');
  const text = el('div', 'color:#4b5563;min-height:20px', 'Connected. Follow the export page.');
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
  actions.appendChild(button('Close tab', true, () => window.close()));
  actions.appendChild(button('Back to Jira', false, hide));
  track.appendChild(bar);
  [title, text, track, meta, actions].forEach((n) => card.appendChild(n));
  shade.appendChild(card);
  let count = 0;
  const paintMeta = () => { meta.textContent = count + ' requests · keep this tab open'; };
  paintMeta();
  show();
  window.__wlBridge = { show };

  const status = (d) => {
    show();
    if (d.text) text.textContent = String(d.text);
    if (typeof d.pct === 'number') bar.style.width = Math.max(0, Math.min(100, d.pct)) + '%';
    const over = Boolean(d.done || d.error);
    title.textContent = d.done ? '✓ All done' : (d.error ? 'Something went wrong' : 'Worklogs export');
    if (d.done) bar.style.width = '100%';
    bar.style.background = d.error ? '#c50f1f' : '#107c10';
    meta.textContent = over ? count + ' requests' : count + ' requests · keep this tab open';
    actions.style.display = over ? 'flex' : 'none';
  };

  window.addEventListener('message', async (event) => {
    const d = event.data;
    if (event.origin !== PAGE_ORIGIN || event.source !== opener || !d) return;
    if (d.type === 'wl-bridge:status') { status(d); return; }
    if (d.type !== 'wl-bridge:fetch') return;
    const reply = (status, body, retryAfter) => opener.postMessage({ type: 'wl-bridge:response', id: d.id, status, body, retryAfter: retryAfter || '' }, PAGE_ORIGIN);
    const method = String(d.method || 'GET').toUpperCase();
    if (!allowRequest(method, d.path)) { reply(403, 'Refused by the bridge'); return; }
    count++;
    if (actions.style.display !== 'flex') paintMeta();
    try {
      const headers = { Accept: 'application/json' };
      if (d.body != null) headers['Content-Type'] = 'application/json';
      const res = await fetch(d.path, { method, body: d.body == null ? undefined : d.body, credentials: 'include', headers });
      reply(res.status, await res.text(), res.headers.get('Retry-After'));
    } catch (e) {
      reply(0, String((e && e.message) || e));
    }
  });
  announce();
};

export function bookmarkletSource(pageOrigin) {
  const routes = `const ROUTES = [${ROUTES.map(([m, re]) => `[${JSON.stringify(m)}, ${re}]`).join(', ')}];`;
  return `(() => {\n${routes}\nconst allowRequest = ${allowRequest.toString()};\n(${relay.toString()})(${JSON.stringify(pageOrigin)}, ${BRIDGE_VERSION});\n})();`;
}

export const bookmarkletUrl = (pageOrigin) => `javascript:${encodeURIComponent(bookmarkletSource(pageOrigin))}`;
