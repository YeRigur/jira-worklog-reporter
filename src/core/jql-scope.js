// One project group only: every search the export sends Jira gets
// "AND project IN (…)" added, so Jira returns — and the bridge fetches
// worklogs for — that group's issues alone. Applied in front of the cache,
// so each scope is a request of its own.

const SEARCH = '/rest/api/3/search/jql';

export function scopeSearch(init, keys) {
  if (!keys?.length || !init?.body) return init;
  let body;
  try { body = JSON.parse(init.body); } catch { return init; }
  const jql = String(body.jql || '');
  const order = /\border\s+by\b/i.exec(jql);
  const where = (order ? jql.slice(0, order.index) : jql).trim();
  // A query with no condition is the export's own sign-in probe: leave it.
  if (!where) return init;
  const list = keys.map((k) => `"${String(k).replace(/"/g, '\\"')}"`).join(', ');
  const kept = /\bor\b/i.test(where) ? `(${where})` : where;
  const tail = order ? ` ${jql.slice(order.index).trim()}` : '';
  return { ...init, body: JSON.stringify({ ...body, jql: `${kept} AND project IN (${list})${tail}` }) };
}

export const scopedFetch = (fetch, keys) => (input, init = {}) => {
  const isSearch = new URL(String(input), 'https://jira.invalid').pathname === SEARCH;
  return fetch(input, isSearch ? scopeSearch(init, keys) : init);
};
