// The private part of the page lives in a settings file the team keeps, not in
// the page: the roster and Teams assignments (emails), the saved filter's JQL
// (emails again), the people behind old Jira keys, and the columns attached by
// hand. The page is built from the public part only and reads the rest from
// the file the person loads.

const JIRA = 'jira-worklogs-export';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const lower = (s) => String(s || '').trim().toLowerCase();
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

export const emptySettings = () => ({ version: 1, jql: '', projectGroups: {}, groupByDomain: {}, roster: [], teams: {}, people: {}, sites: {} });

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
    // A team's project map is one piece: the newer file's replaces the older.
    projectGroups: Object.keys(b.projectGroups || {}).length ? b.projectGroups : (a.projectGroups || {}),
    groupByDomain: { ...(a.groupByDomain || {}), ...(b.groupByDomain || {}) },
    roster: [...new Set([...a.roster, ...b.roster])],
    teams: { ...a.teams, ...b.teams },
    people: { ...a.people, ...b.people },
    sites: { ...a.sites, ...b.sites }
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

// Run in the browser console on a Jira page: Jira turns old user keys into
// today's accounts and names them. A key the migration call doesn't know is
// found the long way: the worklog the CSV has for it — same issue, same day,
// same length — is read through the API, and its author is the person.
// `samples` are { key: [{ issue, date, seconds }] } from the dataset.
export function lookupScript(keys, samples = {}) {
  return `(async () => {
  const keys = ${JSON.stringify(keys)};
  const samples = ${JSON.stringify(samples)};
  const get = (url) => fetch(url, { headers: { Accept: 'application/json' } });
  const people = {};
  const missed = {};
  const take = (key, u, how) => {
    if (!u || (!u.displayName && !u.emailAddress)) return false;
    people[key] = { accountId: u.accountId || '', name: u.displayName || '', email: u.emailAddress || '' };
    if (u.active === false) console.log(key + ' is ' + u.displayName + ' — deactivated, but the name is known.');
    if (how) console.log(key + ' → ' + u.displayName + ' (' + how + ')');
    return true;
  };
  const user = async (accountId) => {
    const r = await get('/rest/api/3/user?accountId=' + encodeURIComponent(accountId));
    return r.ok ? r.json() : null;
  };
  // 1. Jira's own translation of old keys.
  const viaMigration = {};
  for (let i = 0; i < keys.length; i += 40) {
    const query = keys.slice(i, i + 40).map((k) => 'key=' + encodeURIComponent(k)).join('&');
    const res = await get('/rest/api/3/user/bulk/migration?' + query);
    if (res.status === 401 || res.status === 403) { console.error('Jira answered ' + res.status + ' — are you signed in on this Jira?'); return; }
    if (res.ok) for (const { key, accountId } of await res.json()) if (accountId) viaMigration[key] = accountId;
  }
  for (const key of keys) {
    if (viaMigration[key] && take(key, { accountId: viaMigration[key], ...(await user(viaMigration[key])) })) continue;
    // 2. Some keys are account ids already.
    if (take(key, await user(key), 'the key is the account id')) continue;
    // 3. The worklog itself: same issue, same day, same length.
    let found = false;
    for (const s of samples[key] || []) {
      const r = await get('/rest/api/3/issue/' + encodeURIComponent(s.issue) + '/worklog?maxResults=5000');
      if (!r.ok) continue;
      const { worklogs = [] } = await r.json();
      const near = (d) => Math.abs(Date.parse(d.slice(0, 10)) - Date.parse(s.date)) <= 86400000;
      const hits = worklogs.filter((w) => w.timeSpentSeconds === s.seconds && near(w.started));
      const authors = [...new Map(hits.map((w) => [w.author && w.author.accountId, w.author])).values()].filter(Boolean);
      if (authors.length === 1) {
        const full = (await user(authors[0].accountId)) || authors[0];
        if (take(key, full, 'found by its worklog on ' + s.issue)) { found = true; break; }
      }
    }
    if (!found) missed[key] = (samples[key] || []).length ? 'no single matching worklog on ' + samples[key].map((s) => s.issue).join(', ') : 'Jira doesn’t know this key';
  }
  const text = JSON.stringify({ people }, null, 2);
  if (typeof copy === 'function') copy(text);
  console.log('Found ' + Object.keys(people).length + ' of ' + keys.length + ' people. The result is copied — paste it into the page.');
  if (Object.keys(missed).length) { console.log('Not found:'); console.table(missed); }
  console.log(text);
})();`;
}

