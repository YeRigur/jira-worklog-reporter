// "Project group" isn't a Jira field: it is the team's map of project key →
// group, kept in the settings file as { "Group": ["KEY", …] }.

export function groupOf(groups, key) {
  const k = String(key || '').toUpperCase();
  return Object.entries(groups || {}).find(([, keys]) => keys.includes(k))?.[0] || '';
}

export const groupNames = (groups) => Object.keys(groups || {}).sort((a, b) => a.localeCompare(b));

// The map with `key` moved to `group` (or out of every group when empty).
export function withProjectGroup(groups, key, group) {
  const k = String(key || '').trim().toUpperCase();
  const g = String(group || '').trim();
  if (!k) return groups || {};
  const next = {};
  for (const [name, keys] of Object.entries(groups || {})) {
    const rest = keys.filter((x) => x !== k);
    if (rest.length) next[name] = rest;
  }
  if (g) next[g] = [...(next[g] || []), k];
  return next;
}

// The projects of a dataset with how many issues each has, biggest first.
export function projectsInFile(dataset) {
  const count = new Map();
  for (const issue of dataset.issues) count.set(issue.projectKey, (count.get(issue.projectKey) || 0) + 1);
  return dataset.projects.map((p) => ({ key: p.key.toUpperCase(), name: p.name, issues: count.get(p.key.toUpperCase()) || 0 }))
    .sort((a, b) => b.issues - a.issues || a.key.localeCompare(b.key));
}

// Jira mode: the projects of the issues Jira's search returned, in the shape
// projectsInFile reads, so the groups page lists them.
export function projectsFromSearch(entries) {
  const projects = new Map();
  const issues = new Map();
  for (const e of entries) {
    if (new URL(e.url, 'https://jira.invalid').pathname !== '/rest/api/3/search/jql') continue;
    let body;
    try { body = JSON.parse(e.text); } catch { continue; }
    for (const issue of body.issues || []) {
      const p = issue.fields?.project;
      if (!p?.key) continue;
      const key = String(p.key).toUpperCase();
      if (!projects.has(key)) projects.set(key, { key, name: p.name || '' });
      issues.set(String(issue.key).toUpperCase(), { projectKey: key });
    }
  }
  return { projects: [...projects.values()], issues: [...issues.values()] };
}
