import { compileDatePattern, toIsoDate, toIsoDateTime } from './jira-dates.js';

// Maps "CSV (all fields)" headers to the Jira REST field ids and value shapes
// the export reads, so worklogs-export.js sees what /rest/api/3/search/jql
// would have returned. The model is plain data: it crosses postMessage.

const SYSTEM_FIELDS = {
  'Summary': { id: 'summary', kind: 'string' },
  'Issue Type': { id: 'issuetype', kind: 'named' },
  'Status': { id: 'status', kind: 'named' },
  'Priority': { id: 'priority', kind: 'named' },
  'Resolution': { id: 'resolution', kind: 'named' },
  'Security Level': { id: 'security', kind: 'named' },
  'Status Category': { id: 'statusCategory', kind: 'named' },
  'Assignee': { id: 'assignee', kind: 'user' },
  'Reporter': { id: 'reporter', kind: 'user' },
  'Creator': { id: 'creator', kind: 'user' },
  'Created': { id: 'created', kind: 'datetime' },
  'Updated': { id: 'updated', kind: 'datetime' },
  'Last Viewed': { id: 'lastViewed', kind: 'datetime' },
  'Resolved': { id: 'resolutiondate', kind: 'datetime' },
  'Status Category Changed': { id: 'statuscategorychangedate', kind: 'datetime' },
  'Due date': { id: 'duedate', kind: 'date' },
  'Due Date': { id: 'duedate', kind: 'date' },
  'Fix versions': { id: 'fixVersions', kind: 'namedList' },
  'Fix Version/s': { id: 'fixVersions', kind: 'namedList' },
  'Affects versions': { id: 'versions', kind: 'namedList' },
  'Affects Version/s': { id: 'versions', kind: 'namedList' },
  'Components': { id: 'components', kind: 'namedList' },
  'Component/s': { id: 'components', kind: 'namedList' },
  'Labels': { id: 'labels', kind: 'stringList' },
  'Description': { id: 'description', kind: 'string' },
  'Environment': { id: 'environment', kind: 'string' },
  'Original estimate': { id: 'timeoriginalestimate', kind: 'number' },
  'Original Estimate': { id: 'timeoriginalestimate', kind: 'number' },
  'Remaining Estimate': { id: 'timeestimate', kind: 'number' },
  'Time Spent': { id: 'timespent', kind: 'number' },
  'Work Ratio': { id: 'workratio', kind: 'number' },
  'Σ Original Estimate': { id: 'aggregatetimeoriginalestimate', kind: 'number' },
  'Σ Remaining Estimate': { id: 'aggregatetimeestimate', kind: 'number' },
  'Σ Time Spent': { id: 'aggregatetimespent', kind: 'number' },
  'Votes': { id: 'votes', kind: 'blank' },
  'Watchers': { id: 'watches', kind: 'blank' },
  'Log Work': { id: 'worklog', kind: 'blank' },
  'Comment': { id: 'comment', kind: 'blank' },
  'Attachment': { id: 'attachment', kind: 'blankList' }
};

// Custom fields Jira exports without the "Custom field (…)" wrapper.
const BARE_CUSTOM = { 'Sprint': 'namedList' };

// Parts of composite fields, and other columns that aren't fields of their own.
const PROJECT_PARTS = { 'Project key': 'key', 'Project name': 'name' };
const PARENT_PARTS = { 'Parent': 'id', 'Parent key': 'key', 'Parent summary': 'summary' };
const TIME_PARTS = { 'Original estimate': 'originalEstimateSeconds', 'Original Estimate': 'originalEstimateSeconds', 'Remaining Estimate': 'remainingEstimateSeconds', 'Time Spent': 'timeSpentSeconds' };
const NOT_FIELDS = new Set(['Issue key', 'Issue id', 'Project type', 'Project lead', 'Project description', 'Project url', 'Project lead id']);

const COMPOSITES = [
  { id: 'project', name: 'Project', kind: 'project', parts: PROJECT_PARTS },
  { id: 'parent', name: 'Parent', kind: 'parent', parts: PARENT_PARTS },
  { id: 'timetracking', name: 'Time tracking', kind: 'timetracking', parts: TIME_PARTS }
];

const own = (obj, key) => Object.hasOwn(obj, key);
const isIdCompanion = (h) => / Id$| id$|\)Id$/.test(h);
const isIssueLink = (h) => /^(Inward|Outward) issue link \(/.test(h);
const NUMERIC = /^-?\d+(?:\.\d+)?$/;

export function buildColumnModel(headers, rows, { fieldIds = {}, datePattern } = {}) {
  const specs = {};
  const fields = [];
  const add = (id, name, custom, kind, index) => {
    if (!specs[id]) {
      specs[id] = { kind, indices: [] };
      fields.push({ id, name, custom });
    }
    specs[id].indices.push(index);
  };

  headers.forEach((header, index) => {
    for (const c of COMPOSITES) {
      if (!own(c.parts, header)) continue;
      if (!specs[c.id]) {
        specs[c.id] = { kind: c.kind, parts: {} };
        fields.push({ id: c.id, name: c.name, custom: false });
      }
      specs[c.id].parts[c.parts[header]] ??= index;
    }
    if (NOT_FIELDS.has(header) || own(PROJECT_PARTS, header) || own(PARENT_PARTS, header) || isIdCompanion(header)) return;
    const custom = /^Custom field \((.*)\)$/.exec(header);
    if (custom) {
      const name = custom[1];
      add((own(fieldIds, name) && fieldIds[name]) || `csv:${name}`, name, true, 'auto', index);
    } else if (own(SYSTEM_FIELDS, header)) {
      const { id, kind } = SYSTEM_FIELDS[header];
      add(id, header, false, kind, index);
    } else if (own(BARE_CUSTOM, header)) {
      add((own(fieldIds, header) && fieldIds[header]) || `csv:${header}`, header, true, BARE_CUSTOM[header], index);
    } else if (isIssueLink(header)) {
      add('issuelinks', 'Linked Issues', false, 'blankList', index);
    } else {
      add(`csv:${header}`, header, false, 'auto', index);
    }
  });

  const parse = datePattern ? compileDatePattern(datePattern).parse : () => null;
  for (const spec of Object.values(specs)) {
    if (spec.kind !== 'auto') continue;
    const values = rows.flatMap((r) => spec.indices.map((i) => (r[i] ?? '').trim())).filter(Boolean);
    let kind = 'string';
    if (values.length && values.every((v) => NUMERIC.test(v))) kind = 'number';
    else if (values.length && values.every((v) => parse(v))) {
      kind = values.every((v) => { const p = parse(v); return p.hour === 0 && p.minute === 0; }) ? 'date' : 'datetime';
    }
    spec.kind = kind;
    spec.list = spec.indices.length > 1;
  }

  return { fields, specs, datePattern: datePattern || '' };
}

const parsers = new Map();
const parserFor = (pattern) => {
  if (!parsers.has(pattern)) parsers.set(pattern, compileDatePattern(pattern).parse);
  return parsers.get(pattern);
};

const convert = (kind, raw, parse) => {
  if (kind === 'number') return Number(raw);
  if (kind === 'datetime' || kind === 'date') {
    const p = parse(raw);
    if (!p) return raw;
    return kind === 'date' ? toIsoDate(p) : toIsoDateTime(p);
  }
  return raw;
};

function shapeOne(spec, row, parse) {
  const cells = (spec.indices || []).map((i) => (row[i] ?? '').trim());
  const filled = cells.filter(Boolean);
  switch (spec.kind) {
    case 'named': return filled.length ? { name: filled[0] } : null;
    case 'user': return filled.length ? { displayName: filled[0] } : null;
    case 'namedList': return filled.map((name) => ({ name }));
    case 'stringList': return filled;
    case 'blank': return { total: filled.length };
    case 'blankList': return filled.map((_, i) => ({ id: String(i + 1) }));
    case 'project': {
      const at = (part) => (spec.parts[part] === undefined ? '' : (row[spec.parts[part]] ?? '').trim());
      return { key: at('key'), name: at('name') };
    }
    case 'parent': {
      const at = (part) => (spec.parts[part] === undefined ? '' : (row[spec.parts[part]] ?? '').trim());
      const key = at('key') || (/^[A-Z][A-Z0-9_]*-\d+$/.test(at('id')) ? at('id') : '');
      if (!key) return undefined;
      return { id: at('id'), key, fields: { summary: at('summary') } };
    }
    case 'timetracking': {
      const out = {};
      for (const [part, index] of Object.entries(spec.parts)) {
        const v = (row[index] ?? '').trim();
        if (NUMERIC.test(v)) out[part] = Number(v);
      }
      return out;
    }
    default: {
      if (spec.list) {
        const values = filled.map((v) => convert(spec.kind, v, parse));
        return values.length ? values : null;
      }
      return filled.length ? convert(spec.kind, filled[0], parse) : null;
    }
  }
}

export function shapeFields(model, row, ids) {
  const parse = model.datePattern ? parserFor(model.datePattern) : () => null;
  const out = {};
  for (const id of ids) {
    const spec = own(model.specs, id) ? model.specs[id] : null;
    if (!spec) continue;
    const value = shapeOne(spec, row, parse);
    if (value !== undefined) out[id] = value;
  }
  return out;
}

