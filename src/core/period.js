// The report period: previous calendar month by default, matching the filter's
// startOfMonth(-1) … startOfMonth(), and counted the way the extension filters
// worklogs: whole calendar days on the worklog's own date.

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function previousMonth(today = new Date()) {
  return {
    from: isoDay(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
    to: isoDay(new Date(today.getFullYear(), today.getMonth(), 0))
  };
}

const bounds = (from, to) => [
  from ? Date.parse(`${from}T00:00:00.000Z`) : -Infinity,
  to ? Date.parse(`${to}T23:59:59.999Z`) : Infinity
];

// The issues the report will list: those with at least one worklog in the period.
// `keep`, when given, is the set of authors the report is limited to.
const inDays = (day, from, to) => (!from || day >= from) && (!to || day <= to);

export function issuesInPeriod(dataset, from, to, keep = null) {
  return dataset.issues.filter((issue) => issue.worklogs.some((w) =>
    inDays(w.localDate, from, to) && (!keep || keep.has(w.authorKey))));
}

export function worklogsInPeriod(dataset, from, to, keep = null) {
  let count = 0;
  let seconds = 0;
  const people = new Set();
  for (const issue of dataset.issues) {
    for (const w of issue.worklogs) {
      if (!inDays(w.localDate, from, to) || (keep && !keep.has(w.authorKey))) continue;
      count++;
      seconds += w.seconds;
      people.add(w.authorKey);
    }
  }
  return { count, seconds, people: people.size };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const parts = (day) => day.split('-').map(Number);
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const short = (y, m, d, withYear) => `${d} ${MONTHS[m - 1].slice(0, 3)}${withYear ? ` ${y}` : ''}`;

// The period as a person would say it — the page shows it instead of two date
// boxes, and only opens them when someone wants another month.
export function periodLabel(from, to) {
  if (!from && !to) return 'every worklog in the file';
  if (!to) { const [y, m, d] = parts(from); return `from ${short(y, m, d, true)}`; }
  if (!from) { const [y, m, d] = parts(to); return `until ${short(y, m, d, true)}`; }
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  if (y1 === y2 && m1 === m2 && d1 === 1 && d2 === lastDay(y2, m2)) return `${MONTHS[m1 - 1]} ${y1}`;
  const sameYear = y1 === y2;
  const left = sameYear && m1 === m2 ? String(d1) : short(y1, m1, d1, !sameYear);
  return `${left} \u2013 ${short(y2, m2, d2, true)}`;
}

