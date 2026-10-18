// The column template: every column the report has, in the order the extension
// writes them, and where each one comes from in this CSV. What the CSV doesn't
// have is flagged so it can be attached to another column by hand.

const JIRA = 'jira-worklogs-export';

const exportFieldsSetting = (scriptsJson) => {
  const script = (scriptsJson.scripts || []).find((s) => s.id === JIRA) || {};
  return (script.settings || []).find((f) => f.id === 'exportFields') || {};
};

// Columns the export computes instead of reading a Jira field; `needs` are the
// CSV-backed fields they read.
const COMPUTED = {
  _issueKey: { needs: [], from: 'the issue key' },
  _developer: { needs: [], from: 'the worklog author' },
  _authorEmail: { needs: [], from: 'the roster, matched by name' },
  _developerGroup: { needs: [], from: 'Teams assignments, or the country in the name' },
  _developerProject: { needs: [], from: 'Teams assignments' },
  _developerDepartment: { needs: [], from: 'the display name' },
  _developerLocation: { needs: [], from: 'the display name' },
  _developerJobTitle: { needs: [], from: 'nothing — a CSV has no job titles' },
  _developerHours: { needs: [], from: 'the worklog' },
  _worklogDate: { needs: [], from: 'the worklog date' },
  _worklogMonth: { needs: [], from: 'the worklog date' },
  _originalEstimateHours: { needs: ['timetracking'], from: '“Original estimate”' },
  _timeSpentHours: { needs: ['timetracking'], from: '“Time Spent”' },
  _estimationDeviation: { needs: ['timetracking'], from: '“Time Spent” minus “Original estimate”' },
  _projectKey: { needs: ['project'], from: '“Project key”' },
  _projectName: { needs: ['project'], from: '“Project name”' },
  _projectGroup: { needs: ['project'], from: '“Project key” and the project groups' },
  _projectUrl: { needs: ['project'], from: '“Project key” and the Jira site' },
  _parentSummary: { needs: ['parent'], from: '“Parent summary”' }
};

export function buildColumnTemplate(scriptsJson) {
  const setting = exportFieldsSetting(scriptsJson);
  const labels = new Map((setting.options || []).filter((o) => o && o.value).map((o) => [o.value, o.label || o.value]));
  return [
    ...(setting.default || []).map((id) => ({ key: id, id, label: labels.get(id) || id })),
    ...(setting.defaultByLabel || []).map((label) => ({ key: `label:${label}`, label }))
  ];
}

export function resolveTemplate(template, dataset, bindings = {}) {
  const { specs, fields } = dataset.model;
  const nameOf = (id) => fields.find((f) => f.id === id)?.name || id;
  const taken = new Set();

  return template.map((entry) => {
    const row = { key: entry.key, label: entry.label };
    const bound = Object.hasOwn(bindings, entry.key) ? bindings[entry.key] : undefined;

    if (bound === '') return { ...row, status: 'empty', fieldId: '', source: 'left empty' };
    if (bound && Object.hasOwn(specs, bound) && !taken.has(bound)) {
      taken.add(bound);
      return { ...row, status: 'bound', fieldId: bound, source: nameOf(bound) };
    }

    if (entry.id && entry.id.startsWith('_')) {
      const computed = COMPUTED[entry.id] || { needs: [], from: 'the export' };
      const missing = computed.needs.filter((need) => !Object.hasOwn(specs, need));
      return missing.length
        ? { ...row, status: 'missing', fieldId: entry.id, source: `${computed.from} — not in this CSV` }
        : { ...row, status: 'computed', fieldId: entry.id, source: computed.from };
    }

    const fieldId = entry.id
      ? (Object.hasOwn(specs, entry.id) ? entry.id : '')
      : (fields.find((f) => String(f.name).toLowerCase() === String(entry.label).toLowerCase())?.id || '');
    if (!fieldId) return { ...row, status: 'missing', fieldId: entry.id || '', source: '' };
    if (taken.has(fieldId)) return { ...row, status: 'taken', fieldId: '', source: nameOf(fieldId) };
    taken.add(fieldId);
    return { ...row, status: 'auto', fieldId, source: nameOf(fieldId) };
  });
}

// The columns and headers the export receives: template order, no duplicates.
export function applyTemplate(resolved) {
  const exportFields = [];
  const labels = {};
  for (const row of resolved) {
    if (!row.fieldId || exportFields.includes(row.fieldId)) continue;
    exportFields.push(row.fieldId);
    labels[row.fieldId] = row.label;
  }
  return { exportFields, labels };
}

