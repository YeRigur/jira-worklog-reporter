// The private part of the page lives in a settings file the team keeps, not in
// the page: the roster and Teams assignments (emails), the saved filter's JQL
// (emails again), the people behind old Jira keys, and the columns attached by
// hand. The page is built from the public part only and reads the rest from
// the file the person loads.

const JIRA = 'jira-worklogs-export';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const lower = (s) => String(s || '').trim().toLowerCase();
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

export const emptySettings = () => ({ version: 1, jql: '', site: '', projectGroups: {}, groupByDomain: {}, roster: [], teams: {}, people: {}, sites: {}, accounts: {} });

// What the export needs from scripts.json, and not one address.
export function publicScriptsJson(scriptsJson) {
  const teams = { ...(scriptsJson.teams || {}) };
  delete teams.assignments;
  return {
    projectGroups: scriptsJson.projectGroups || {},
    teams,
    scripts: (scriptsJson.scripts || []).filter((s) => s.id === JIRA)
  };
}

// The maintainer's starting file, from the extension's own data.
export function settingsFromExtension(scriptsJson, jql = '') {
  return normalize({
    jql,
    roster: scriptsJson.rosters?.team || [],
    teams: scriptsJson.teams?.assignments || {}
  });
}

function normalize(raw) {
  const s = emptySettings();
  if (typeof raw.jql === 'string') s.jql = raw.jql.trim();
  // The Jira site Start opens: a bare host, whatever form it was typed in.
  const site = lower(raw.site).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(site)) s.site = site;
  // Jira project key → group, per team: { "Group": ["KEY", …] }.
  for (const [group, keys] of Object.entries(isObject(raw.projectGroups) ? raw.projectGroups : {})) {
    if (!group || group.startsWith('_') || !Array.isArray(keys)) continue;
    const list = [...new Set(keys.map((k) => String(k || '').trim().toUpperCase()).filter(Boolean))];
    if (list.length) s.projectGroups[String(group).trim()] = list;
  }
  // Fallback "Developer group" by email domain: { "ua.example.com": "Group" }.
  for (const [domain, group] of Object.entries(isObject(raw.groupByDomain) ? raw.groupByDomain : {})) {
    const d = lower(domain).replace(/^@/, '');
    if (d && !d.startsWith('_') && group) s.groupByDomain[d] = String(group).trim();
  }
  s.roster = [...new Set((Array.isArray(raw.roster) ? raw.roster : []).map(lower).filter((e) => EMAIL.test(e)))];
  for (const [email, a] of Object.entries(isObject(raw.teams) ? raw.teams : {})) {
    if (!EMAIL.test(lower(email)) || !isObject(a)) continue;
    s.teams[lower(email)] = { group: String(a.group || ''), projects: Array.isArray(a.projects) ? a.projects.map(String) : [] };
  }
  for (const [key, p] of Object.entries(isObject(raw.people) ? raw.people : {})) {
    if (!key || !isObject(p)) continue;
    s.people[key] = { name: String(p.name || ''), email: EMAIL.test(lower(p.email)) ? lower(p.email) : '', accountId: String(p.accountId || '') };
  }
  for (const [site, v] of Object.entries(isObject(raw.sites) ? raw.sites : {})) {
    if (!isObject(v)) continue;
    s.sites[lower(site)] = {
      bindings: isObject(v.bindings) ? Object.fromEntries(Object.entries(v.bindings).map(([k, f]) => [k, String(f)])) : {},
      skipped: Array.isArray(v.skipped) ? v.skipped.map(String) : []
    };
  }
  // Email → Jira accountId, found by the page through the bridge.
  for (const [email, id] of Object.entries(isObject(raw.accounts) ? raw.accounts : {})) {
    if (EMAIL.test(lower(email)) && typeof id === 'string' && id.trim()) s.accounts[lower(email)] = id.trim();
  }
  return s;
}

export function parseSettings(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('This isn’t a settings file — it isn’t JSON.'); }
  if (!isObject(raw)) throw new Error('This isn’t a settings file — expected { … }.');
  return normalize(raw);
}

// A second file adds to the first; where both say something, the newer wins.
export function mergeSettings(a, b) {
  return {
    version: 1,
    jql: b.jql || a.jql,
    site: b.site || a.site || '',
    // A team's project map is one piece: the newer file's replaces the older.
    projectGroups: Object.keys(b.projectGroups || {}).length ? b.projectGroups : (a.projectGroups || {}),
    groupByDomain: { ...(a.groupByDomain || {}), ...(b.groupByDomain || {}) },
    roster: [...new Set([...a.roster, ...b.roster])],
    teams: { ...a.teams, ...b.teams },
    people: { ...a.people, ...b.people },
    sites: { ...a.sites, ...b.sites },
    accounts: { ...(a.accounts || {}), ...(b.accounts || {}) }
  };
}

// The people a filter names — they belong on the roster too.
export const emailsIn = (jql) => [...new Set((String(jql).match(/[^\s"'(),]+@[^\s"'(),]+\.[^\s"'(),]+/g) || []).map(lower))];

// Back into the shape the people code reads.
export function withSettings(publicJson, settings) {
  return {
    ...publicJson,
    // Project groups and domain groups live only in the team's settings file;
    // the page itself carries no organisation data.
    projectGroups: { ...(settings.projectGroups || {}) },
    groupByDomain: { ...(settings.groupByDomain || {}) },
    rosters: { team: settings.roster },
    teams: { ...(publicJson.teams || {}), assignments: settings.teams }
  };
}

// The file is named after its Jira instance: worklogs-settings-<site>.json,
// without ".atlassian.net" — still matched by .gitignore's worklogs-settings*.json.
export function settingsFileName(site) {
  const name = String(site || '').trim().toLowerCase().replace(/\.atlassian\.net$/, '').replace(/[^a-z0-9.-]+/g, '-');
  return name ? `worklogs-settings-${name}.json` : 'worklogs-settings.json';
}
