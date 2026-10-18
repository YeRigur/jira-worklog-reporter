import { parseExportJql, matchesJql } from './jql.js';
import { shapeFields } from './columns.js';

// Answers the two Jira REST calls worklogs-export.js makes, from the CSV
// dataset. authors maps a CSV worklog author key to the { accountId,
// displayName, emailAddress } the real API would return.

const json = (body) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
});

export function createJiraEmulator({ dataset, authors = {}, projects = [], origin = '' }) {
  const authorOf = (key) => authors[key] || { accountId: key, displayName: '', emailAddress: '' };

  const allKeys = new Set(dataset.projects.map((p) => p.key));
  const picked = projects.filter((k) => allKeys.has(k));
  const narrow = picked.length > 0 && picked.length < allKeys.size;
  const projectIndex = dataset.headers.indexOf('Project key');
  const universe = narrow
    ? dataset.issues.filter((i) => picked.includes((i.row[projectIndex] || '').trim()))
    : dataset.issues;
  const byKey = new Map(dataset.issues.map((i) => [i.key, i]));

  const search = (body) => {
    const query = parseExportJql(body.jql);
    const matches = universe.filter((issue) => matchesJql(query,
      issue.worklogs.map((w) => ({ authorId: authorOf(w.authorKey).accountId, localDate: w.localDate })), issue));
    const start = body.nextPageToken ? Number(String(body.nextPageToken).slice(2)) : 0;
    const size = Math.max(1, Number(body.maxResults) || 50);
    const page = matches.slice(start, start + size);
    const fields = Array.isArray(body.fields) ? body.fields : [];
    const out = {
      issues: page.map((i) => ({ id: i.id, key: i.key, fields: shapeFields(dataset.model, i.row, fields) })),
      isLast: start + size >= matches.length
    };
    if (!out.isLast) out.nextPageToken = `p:${start + size}`;
    return json(out);
  };

  const worklogs = (key, params) => {
    const issue = byKey.get(key);
    const after = params.has('startedAfter') ? Number(params.get('startedAfter')) : null;
    const list = (issue ? issue.worklogs : [])
      .filter((w) => after === null || Date.parse(w.started) >= after)
      .map((w, n) => ({
        id: `${key}-${n + 1}`,
        author: authorOf(w.authorKey),
        started: w.started,
        timeSpentSeconds: w.seconds,
        comment: w.comment
      }));
    const startAt = Number(params.get('startAt')) || 0;
    const maxResults = Number(params.get('maxResults')) || 5000;
    return json({ startAt, maxResults, total: list.length, worklogs: list.slice(startAt, startAt + maxResults) });
  };

  return async function fetch(input, init = {}) {
    const url = new URL(String(input), origin || 'https://jira.invalid');
    const method = String(init.method || 'GET').toUpperCase();
    if (method === 'POST' && url.pathname === '/rest/api/3/search/jql') {
      return search(JSON.parse(init.body || '{}'));
    }
    const wl = /^\/rest\/api\/3\/issue\/([^/]+)\/worklog$/.exec(url.pathname);
    if (method === 'GET' && wl) return worklogs(decodeURIComponent(wl[1]), url.searchParams);
    throw new Error(`Emulator: unsupported request ${method} ${url.pathname}`);
  };
}

