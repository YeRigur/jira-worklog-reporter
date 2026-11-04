// Which team group each roster email is in, the way the export decides it:
// Teams assignments first, then the email's domain (groupByDomain). The start
// screen lists people by these groups, and each can get a report of its own.

const lower = (s) => String(s || '').trim().toLowerCase();

export function groupOfEmail(settings, email) {
  const e = lower(email);
  const own = settings.teams?.[e]?.group;
  if (own) return String(own);
  const domain = e.split('@')[1] || '';
  return String(settings.groupByDomain?.[domain] || '');
}

// [{ name, emails }] in roster order inside each group. The group with the
// most ticked people comes first, then the others by name; no group is last.
export function rosterGroups(settings, picked = []) {
  const byName = new Map();
  for (const email of settings.roster || []) {
    const name = groupOfEmail(settings, email);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(email);
  }
  const ticked = (g) => g.emails.filter((e) => picked.includes(e)).length;
  return [...byName].map(([name, emails]) => ({ name, emails }))
    .sort((a, b) => (!a.name - !b.name) || (ticked(b) - ticked(a)) || a.name.localeCompare(b.name));
}
