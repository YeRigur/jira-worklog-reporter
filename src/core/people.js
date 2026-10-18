// Who a CSV worklog author is. The CSV names authors by internal key only and
// never carries an email, so names come from other user columns of the same
// CSV, emails from the team roster in the settings file (matched by name), and the
// group from Teams assignments — or, without an email, from the location in
// the display name, the way the extension falls back on the email domain.

// "Surname,Name,UA-City,Department" — the extension's display-name split.
export function parseDisplayName(name) {
  const parts = String(name || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return { location: '', department: '' };
  return { location: parts[2], department: parts.slice(3).join(', ') };
}

const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tokensOf = (email) => normalize(email.split('@')[0]).split(/[._-]+/).map((t) => t.replace(/\d+/g, '')).filter((t) => t.length > 1);

// The email whose name tokens all appear in the display name; ambiguity means none.
export function matchEmailByName(name, emails) {
  const hay = normalize(name);
  const hits = emails.filter((e) => {
    const tokens = tokensOf(e);
    return tokens.length > 0 && tokens.every((t) => hay.includes(t));
  });
  return hits.length === 1 ? hits[0].toLowerCase() : '';
}

export function candidateEmails(scriptsJson) {
  const all = [...(scriptsJson?.rosters?.team || []), ...Object.keys(scriptsJson?.teams?.assignments || {})]
    .map((e) => String(e).trim().toLowerCase())
    .filter((e) => e.includes('@'));
  return [...new Set(all)];
}

// Without an email, the country in the display name picks the group from
// settings.groupByDomain: "UA-City" matches a domain that starts with "ua.".
const groupFromLocation = (location, groupByDomain = {}) => {
  const country = String(location || '').slice(0, 2).toLowerCase();
  if (!/^[a-z]{2}$/.test(country)) return '';
  const hit = Object.entries(groupByDomain).find(([domain]) => domain.split('.')[0] === country);
  return hit ? hit[1] : '';
};

const shortKey = (key) => (key.length > 12 ? `${key.slice(0, 11)}…` : key);

// `known` are the people Jira named for old keys (see settings.js): their
// name and email are taken as given.
export function authorMetadata(dataset, scriptsJson, known = {}) {
  const emails = candidateEmails(scriptsJson);
  const assignments = Object.fromEntries(Object.entries(scriptsJson?.teams?.assignments || {})
    .map(([email, a]) => [email.toLowerCase(), a || {}]));
  const nameOf = (key) => (Object.hasOwn(known, key) && known[key].name) || dataset.names[key] || '';

  // An email two different people could claim goes to neither. One person
  // under two keys (old worklogs under the old key) is still one person.
  const claims = new Map();
  for (const key of Object.keys(dataset.authors)) {
    if (Object.hasOwn(known, key) && known[key].email) continue;
    const name = nameOf(key);
    const email = name ? matchEmailByName(name, emails) : '';
    if (email) claims.set(email, [...(claims.get(email) || []), key]);
  }
  const emailOf = new Map();
  for (const [email, keys] of claims) {
    if (new Set(keys.map(nameOf)).size === 1) for (const key of keys) emailOf.set(key, email);
  }
  for (const [key, p] of Object.entries(known)) if (p.email) emailOf.set(key, p.email.toLowerCase());

  const meta = {};
  const unnamed = [];
  for (const [key, stats] of Object.entries(dataset.authors)) {
    const name = nameOf(key);
    const email = emailOf.get(key) || '';
    const { location, department } = parseDisplayName(name);
    const assignment = email ? assignments[email] : null;
    meta[key] = {
      displayName: name || `Unknown · ${shortKey(key)}`,
      email,
      domain: email ? email.split('@')[1] : '',
      jobTitle: '',
      department,
      location,
      teamGroup: assignment?.group || (email ? '' : groupFromLocation(location, scriptsJson?.groupByDomain || {})),
      teamProjects: Array.isArray(assignment?.projects) ? [...assignment.projects] : []
    };
    if (!name) unnamed.push({ key, ...stats });
  }
  unnamed.sort((a, b) => b.seconds - a.seconds);
  return { meta, unnamed };
}

// The authors a filter names by email — an empty list means everyone. An
// author without an email is never named, so stays out of a filtered report.
export function authorsIn(meta, emails) {
  if (!emails.length) return Object.keys(meta);
  const wanted = new Set(emails.map((e) => String(e).toLowerCase()));
  return Object.keys(meta).filter((key) => wanted.has(String(meta[key].email || '').toLowerCase()));
}

