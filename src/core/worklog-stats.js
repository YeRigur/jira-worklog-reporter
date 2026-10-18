// Who logged what in a period — for the people a filter leaves out.
import { issuesInPeriod } from './period.js';

// Worklogs, seconds and issues per author key, over the same calendar-day
// period the export uses.
export function worklogsByAuthor(dataset, from, to) {
  const by = {};
  for (const issue of issuesInPeriod(dataset, from, to)) {
    for (const w of issue.worklogs) {
      if ((from && w.localDate < from) || (to && w.localDate > to)) continue;
      const a = (by[w.authorKey] ||= { count: 0, seconds: 0, issues: new Set() });
      a.count++;
      a.seconds += w.seconds;
      a.issues.add(issue.key);
    }
  }
  return by;
}

// Authors of the period outside `keep`, biggest first. `known` tells whether
// anyone knows who an author is — the unknown may still be one of the team.
export function outsiders(dataset, keep, { meta, people = {}, from, to }) {
  return Object.entries(worklogsByAuthor(dataset, from, to))
    .filter(([key]) => !keep.has(key))
    .map(([key, v]) => ({ key, ...v, name: meta[key]?.displayName || key, known: Boolean(dataset.names[key] || people[key]?.name) }))
    .sort((a, b) => b.seconds - a.seconds);
}
