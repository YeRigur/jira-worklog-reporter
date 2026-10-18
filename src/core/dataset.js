import { readCsvTable } from './csv.js';
import { compileDatePattern, detectDatePattern, toIsoDate, toIsoDateTime } from './jira-dates.js';
import { buildColumnModel } from './columns.js';

// Turns one or more "CSV (all fields)" exports into the dataset the Jira API
// emulator serves: issues with their raw row and parsed worklogs, plus what the
// shell shows (site, authors, projects, span, warnings).

export class DatasetError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

// A single Jira export page; a file with exactly this many rows was likely cut off.
const EXPORT_CAP = 1000;
const SITE_RE = /https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)\/(?:rest\/api\/|secure\/attachment\/|browse\/)/gi;

// One header list for all files: each name appears as many times as in the
// file that repeats it most, in first-seen order.
function unify(tables) {
  const headers = [];
  for (const t of tables) {
    const seen = new Map();
    t.positions = t.headers.map((h) => {
      const n = seen.get(h) || 0;
      seen.set(h, n + 1);
      let found = -1;
      for (let i = 0, c = 0; i < headers.length; i++) {
        if (headers[i] === h && c++ === n) { found = i; break; }
      }
      if (found === -1) {
        headers.push(h);
        found = headers.length - 1;
      }
      return found;
    });
  }
  for (const t of tables) {
    t.unifiedRows = t.rows.map((r) => {
      const out = new Array(headers.length).fill('');
      t.positions.forEach((pos, i) => { out[pos] = r[i] ?? ''; });
      return out;
    });
  }
  return headers;
}

const indicesOf = (headers, name) => headers.reduce((acc, h, i) => (h === name ? [...acc, i] : acc), []);

function detectSite(headers, rows) {
  const count = (cells) => {
    const hosts = new Map();
    for (const cell of cells) {
      for (const m of String(cell).matchAll(SITE_RE)) {
        const host = m[1].toLowerCase();
        hosts.set(host, (hosts.get(host) || 0) + 1);
      }
    }
    return [...hosts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  };
  const attachment = indicesOf(headers, 'Attachment');
  return count(rows.flatMap((r) => attachment.map((i) => r[i] || '')))
    || count(rows.flatMap((r) => r));
}

// Pairs a user column with its "<name> Id" companion, occurrence by occurrence.
function learnNames(headers, rows) {
  const names = {};
  const counters = new Map();
  headers.forEach((h, i) => {
    const n = counters.get(h) || 0;
    counters.set(h, n + 1);
    for (const idName of [`${h} Id`, `${h} id`, `${h}Id`]) {
      const idIndex = indicesOf(headers, idName)[n];
      if (idIndex === undefined) continue;
      for (const r of rows) {
        const id = (r[idIndex] || '').trim();
        const name = (r[i] || '').trim();
        if (id && name && !names[id]) names[id] = name;
      }
      break;
    }
  });
  return names;
}

export function buildDataset(files, { fieldIds = {}, datePattern = '' } = {}) {
  const warnings = [];
  const tables = files.map((f) => ({ name: f.name, encoding: f.encoding, ...readCsvTable(f.text) }));

  for (const t of tables) {
    if (!t.headers.includes('Issue key')) {
      throw new DatasetError('not-jira',
        `“${t.name}” isn't a Jira CSV export — it has no “Issue key” column. If your Jira is in another language, switch it to English and export again.`);
    }
    if (!t.headers.includes('Log Work')) {
      throw new DatasetError('no-worklogs',
        `“${t.name}” has no worklogs. In Jira use ⋯ → Export → CSV (all fields) — the “current fields” export leaves worklogs out.`);
    }
    if (t.rows.length === EXPORT_CAP) warnings.push({ code: 'truncated', file: t.name, rows: t.rows.length });
    if (t.encoding === 'windows-1252') warnings.push({ code: 'encoding', file: t.name });
  }

  const headers = unify(tables);
  const col = (name) => headers.indexOf(name);
  const logWork = indicesOf(headers, 'Log Work');
  const allRows = tables.flatMap((t) => t.unifiedRows);

  let pattern = datePattern;
  if (!pattern) {
    const samples = [];
    for (const name of ['Created', 'Updated', 'Resolved']) {
      const i = col(name);
      if (i >= 0) for (const r of allRows) if (r[i]) samples.push(r[i]);
    }
    for (const r of allRows) for (const i of logWork) {
      const parts = (r[i] || '').split(';');
      if (parts.length >= 4) samples.push(parts[parts.length - 3]);
    }
    pattern = detectDatePattern(samples.slice(0, 500));
    if (!pattern) {
      const sample = samples.map((s) => s.trim()).find(Boolean) || '';
      throw new DatasetError('date-format',
        `Couldn't read the dates in this file (for example “${sample}”). Pick the date format your Jira uses.`, { sample });
    }
  }
  const parse = compileDatePattern(pattern).parse;
  const stamp = (value) => { const p = parse(value); return p ? Date.parse(toIsoDateTime(p)) : NaN; };

  // Merge by issue key; a duplicate keeps the row with the later "Updated".
  const byKey = new Map();
  const keyIndex = col('Issue key');
  const updatedIndex = col('Updated');
  for (const r of allRows) {
    const key = (r[keyIndex] || '').trim();
    if (!key) continue;
    const prev = byKey.get(key);
    if (prev && updatedIndex >= 0 && stamp(prev[updatedIndex]) > stamp(r[updatedIndex])) continue;
    byKey.set(key, r);
  }
  const rows = [...byKey.values()];

  let badWorklogs = 0;
  const authors = {};
  let spanFrom = '';
  let spanTo = '';
  const idIndex = col('Issue id');
  const resolvedIndex = col('Resolved');
  const projectKeyIndex = col('Project key');
  const issues = rows.map((r) => {
    const key = r[keyIndex].trim();
    const resolvedParsed = resolvedIndex >= 0 && r[resolvedIndex] ? parse(r[resolvedIndex]) : null;
    const worklogs = [];
    for (const i of logWork) {
      const cell = r[i] || '';
      if (!cell.trim()) continue;
      const parts = cell.split(';');
      const when = parts.length >= 4 ? parse(parts[parts.length - 3]) : null;
      const seconds = Number(parts[parts.length - 1]);
      if (!when || !Number.isFinite(seconds)) { badWorklogs++; continue; }
      const wl = {
        authorKey: parts[parts.length - 2].trim(),
        started: toIsoDateTime(when),
        localDate: toIsoDate(when),
        seconds,
        comment: parts.slice(0, -3).join(';')
      };
      worklogs.push(wl);
      const a = (authors[wl.authorKey] ||= { count: 0, seconds: 0, samples: [] });
      a.count++;
      a.seconds += seconds;
      if (a.samples.length < 3) a.samples.push({ issue: key, date: wl.localDate, seconds });
      if (!spanFrom || wl.localDate < spanFrom) spanFrom = wl.localDate;
      if (!spanTo || wl.localDate > spanTo) spanTo = wl.localDate;
    }
    return {
      key, id: idIndex >= 0 ? (r[idIndex] || '').trim() : '', row: r, worklogs,
      resolvedDay: resolvedParsed ? toIsoDate(resolvedParsed) : '',
      projectKey: projectKeyIndex >= 0 ? (r[projectKeyIndex] || '').trim().toUpperCase() : ''
    };
  });
  if (badWorklogs) warnings.push({ code: 'bad-worklog', count: badWorklogs });

  const projects = [];
  const projectKey = col('Project key');
  const projectName = col('Project name');
  if (projectKey >= 0) {
    const seen = new Set();
    for (const r of rows) {
      const key = (r[projectKey] || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      projects.push({ key, name: projectName >= 0 ? (r[projectName] || '').trim() : '' });
    }
  }

  const site = detectSite(headers, rows);
  return {
    site,
    origin: site ? `https://${site}` : '',
    datePattern: pattern,
    headers,
    model: buildColumnModel(headers, rows, { fieldIds, datePattern: pattern }),
    issues,
    projects,
    authors,
    names: learnNames(headers, rows),
    span: { from: spanFrom, to: spanTo },
    files: tables.map((t) => ({ name: t.name, rows: t.rows.length, encoding: t.encoding })),
    warnings
  };
}

