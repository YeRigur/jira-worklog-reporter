// Parses exactly the JQL worklogs-export.js sends. Anything else is refused,
// so a change in the extension's queries fails loudly instead of silently
// returning the wrong issues.

const PROBE = /^\s*order\s+by\s+created\s+desc\s*$/i;
const DATE_CLAUSE = /^worklogDate\s*(>=|<=)\s*"(\d{4}-\d{2}-\d{2})"/;
const AUTHOR_CLAUSE = /^worklogAuthor\s+IN\s*\(\s*((?:"(?:[^"\\]|\\.)*"\s*,\s*)*"(?:[^"\\]|\\.)*")\s*\)/;
const PROJECT_CLAUSE = /^project\s+IN\s*\(\s*((?:"(?:[^"\\]|\\.)*"\s*,\s*)*"(?:[^"\\]|\\.)*")\s*\)/i;
const RESOLVED_CLAUSE = /^resolved\s*(>=|<=)\s*"(\d{4}-\d{2}-\d{2})"/i;
const QUOTED = /"((?:[^"\\]|\\.)*)"/g;

const unsupported = (jql) => new Error(`Unsupported JQL: ${jql}`);

export function parseExportJql(jql) {
  if (PROBE.test(jql)) return { kind: 'all' };
  const query = { kind: 'filter' };
  let rest = String(jql || '').trim();
  if (!rest) throw unsupported(jql);
  while (rest) {
    let m = DATE_CLAUSE.exec(rest);
    if (m) {
      query[m[1] === '>=' ? 'from' : 'to'] = m[2];
    } else if ((m = AUTHOR_CLAUSE.exec(rest))) {
      query.authors = [...m[1].matchAll(QUOTED)].map((q) => q[1].replace(/\\(.)/g, '$1'));
    } else if ((m = PROJECT_CLAUSE.exec(rest))) {
      query.projects = [...m[1].matchAll(QUOTED)].map((q) => q[1].replace(/\\(.)/g, '$1').toUpperCase());
    } else if ((m = RESOLVED_CLAUSE.exec(rest))) {
      query[m[1] === '>=' ? 'resolvedFrom' : 'resolvedTo'] = m[2];
    } else {
      throw unsupported(jql);
    }
    rest = rest.slice(m[0].length).trim();
    if (!rest) break;
    const and = /^AND\s+/.exec(rest);
    if (!and) throw unsupported(jql);
    rest = rest.slice(and[0].length);
  }
  return query;
}

// Like Jira, each clause is checked on its own: one worklog may satisfy the
// date clause and another the author clause. worklogs: [{ authorId, localDate }].
export function matchesJql(query, worklogs, issue = {}) {
  if (query.kind === 'all') return true;
  if (query.from && !worklogs.some((w) => w.localDate >= query.from)) return false;
  if (query.to && !worklogs.some((w) => w.localDate <= query.to)) return false;
  if (query.authors && !worklogs.some((w) => query.authors.includes(w.authorId))) return false;
  if (query.projects && !query.projects.includes(String(issue.projectKey || '').toUpperCase())) return false;
  if ((query.resolvedFrom || query.resolvedTo) && !issue.resolvedDay) return false;
  if (query.resolvedFrom && issue.resolvedDay < query.resolvedFrom) return false;
  if (query.resolvedTo && issue.resolvedDay > query.resolvedTo) return false;
  return Boolean(query.from || query.to || query.authors || query.projects || query.resolvedFrom || query.resolvedTo);
}

