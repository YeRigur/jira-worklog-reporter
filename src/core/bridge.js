// The Worklogs bridge: a bookmarklet the person clicks in their Jira tab. It
// runs the read-only REST calls the export page sends it, same-origin with the
// person's own session, and posts the answers back to that page only. The
// allow-list below is the single source: the bookmarklet carries its text.

export const BRIDGE_VERSION = 1;

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
const relay = (PAGE_ORIGIN, V) => {
  const opener = window.opener;
  if (!opener) {
    alert('Open Jira with Start on the export page, then click this bookmark there.');
    return;
  }
  const announce = () => opener.postMessage({ type: 'wl-bridge:ready', v: V, site: location.host }, PAGE_ORIGIN);
  if (window.__wlBridge) { announce(); return; }
  window.__wlBridge = true;
  let count = 0;
  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:6px 10px;border-radius:6px;background:#1f2937;color:#fff;font:12px/1.4 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)';
  const paint = () => { badge.textContent = 'Worklogs bridge · connected · ' + count + ' requests'; };
  paint();
  document.body.appendChild(badge);
  window.addEventListener('message', async (event) => {
    const d = event.data;
    if (event.origin !== PAGE_ORIGIN || event.source !== opener || !d || d.type !== 'wl-bridge:fetch') return;
    const reply = (status, body, retryAfter) => opener.postMessage({ type: 'wl-bridge:response', id: d.id, status, body, retryAfter: retryAfter || '' }, PAGE_ORIGIN);
    const method = String(d.method || 'GET').toUpperCase();
    if (!allowRequest(method, d.path)) { reply(403, 'Refused by the bridge'); return; }
    count++;
    paint();
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
