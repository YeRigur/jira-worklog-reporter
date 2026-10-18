import { buildColumnTemplate, resolveTemplate, applyTemplate } from './template.js';

// The config worklogs-export.js receives — what the extension's configurator
// and runner.js would build — computed from scripts.json and the CSV alone.
// People and projects are scoped by the JQL the CSV was exported with, so
// every worklog author in the file is exported.

const JIRA = 'jira-worklogs-export';

const settingOf = (scriptsJson, id) => {
  const script = (scriptsJson.scripts || []).find((s) => s.id === JIRA) || {};
  return (script.settings || []).find((f) => f.id === id) || {};
};

// runner.js hostMatches: `*` wildcards, whole hostname, case-insensitive.
const hostMatches = (host, pattern) => {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(host);
};

// Custom field ids scripts.json names by label (e.g. Complexity Levels).
export function fieldIdsFromCatalog(scriptsJson) {
  return Object.fromEntries((settingOf(scriptsJson, 'exportFields').options || [])
    .filter((o) => o && /^customfield_\d+$/.test(o.value) && o.label)
    .map((o) => [o.label, o.value]));
}

export function exportDefaults(scriptsJson, { site = '', fields = [] }) {
  const fieldsSetting = settingOf(scriptsJson, 'exportFields');
  const staticOptions = (fieldsSetting.options || []).filter((o) => o && o.value);
  const known = new Set(staticOptions.map((o) => o.value));
  // Same merge as the configurator: catalog labels win, CSV-only fields follow.
  const options = [
    ...staticOptions.map((o) => ({ value: o.value, label: o.label || o.value })),
    ...fields.filter((f) => !known.has(f.id)).map((f) => ({ value: f.id, label: f.name }))
  ];

  const exportFields = [...(fieldsSetting.default || [])];
  for (const wanted of fieldsSetting.defaultByLabel || []) {
    const match = options.find((o) => String(o.label).toLowerCase() === String(wanted).toLowerCase());
    if (match && !exportFields.includes(match.value)) exportFields.push(match.value);
  }

  const sheetsSetting = settingOf(scriptsJson, 'sheets');
  let sheets = [...(sheetsSetting.default || ['details'])];
  for (const [pattern, value] of Object.entries(sheetsSetting.defaultByHost || {})) {
    if (site && Array.isArray(value) && hostMatches(site, pattern)) { sheets = [...value]; break; }
  }

  const projectGroups = {};
  for (const [group, keys] of Object.entries(scriptsJson.projectGroups || {})) {
    if (!Array.isArray(keys)) continue;
    for (const key of keys) if (key) projectGroups[String(key).toUpperCase()] = group;
  }

  const labels = Object.fromEntries(options.map((o) => [o.value, o.label]));
  return { exportFields, sheets, projectGroups, labels };
}

export function buildExportConfig({ scriptsJson, dataset, meta, dateFrom, dateTo, withSummary, bindings = {}, users = null }) {
  const d = exportDefaults(scriptsJson, { site: dataset.site, fields: dataset.model.fields });
  // Columns come from the template, so a column attached by hand reaches the
  // export under the header the report expects.
  const resolved = resolveTemplate(buildColumnTemplate(scriptsJson), dataset, bindings);
  const { exportFields, labels } = applyTemplate(resolved);
  const sheets = typeof withSummary === 'boolean' ? (withSummary ? ['summary', 'details'] : ['details']) : d.sheets;
  return {
    dateFrom,
    dateTo,
    // Everyone in the file, unless the run is limited to some authors.
    users: users || Object.keys(dataset.authors),
    sheets,
    exportFields,
    _projectsGroups: d.projectGroups,
    _groupByDomain: scriptsJson.groupByDomain || {},
    _assignments: scriptsJson.teams?.assignments || {},
    _roster: [...new Set([...(scriptsJson.rosters?.team || []), ...Object.keys(scriptsJson.teams?.assignments || {})])],
    _userMetadata: meta,
    _exportFieldLabels: labels
  };
}

