// The Jira filter the page hands out, fitted to the chosen period.
import { previousMonth, periodLabel } from './period.js';

// The team's own filter, or the public one with the roster as authors.
export function baseJql(settings, publicJql) {
  if (settings.jql) return settings.jql;
  if (!settings.roster.length) return publicJql;
  return `${publicJql}\nAND worklogAuthor in (${settings.roster.map((e) => `"${e}"`).join(', ')})`;
}

export function nextDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// The filter follows the period: last month stays relative (startOfMonth) so a
// saved Jira filter keeps working; any other period is written as dates. Only
// worklogDate / resolved bounds are touched.
export function periodJql(text, from, to, lastMonth = previousMonth()) {
  const relative = from === lastMonth.from && to === lastMonth.to;
  const lo = relative ? 'startOfMonth(-1)' : (from ? `"${from}"` : '');
  const hi = relative ? 'startOfMonth()' : (to ? `"${nextDay(to)}"` : '');
  const bound = String.raw`(startOfMonth\(\s*-?\d*\s*\)|"\d{4}-\d{2}-\d{2}")`;
  let out = String(text);
  if (lo) out = out.replace(new RegExp(String.raw`\b(worklogDate|resolved)\s*>=\s*` + bound, 'gi'), `$1 >= ${lo}`);
  if (hi) {
    out = out.replace(new RegExp(String.raw`\b(worklogDate|resolved)\s*<\s*` + bound, 'gi'), `$1 < ${hi}`);
    out = out.replace(new RegExp(String.raw`\b(worklogDate|resolved)\s*<=\s*` + bound, 'gi'), `$1 < ${hi}`);
  }
  return out;
}

// The period cut into calendar months, the first and last clipped to it — one
// CSV export each, since Jira caps an export at 1000 issues.
export function monthsOf(from, to) {
  if (!from || !to || from > to) return [];
  const out = [];
  let [y, m] = from.split('-').map(Number);
  for (let guard = 0; guard < 120; guard++) {
    const first = `${y}-${String(m).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    if (first > to) break;
    const a = first < from ? from : first;
    const b = last > to ? to : last;
    out.push({ from: a, to: b, label: periodLabel(a, b) });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}
