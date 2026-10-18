// scripts/worklogs-export.js — the export itself.
// Taken unmodified from the SimpleLife extension; only wrapped as an ES module
// so the page can call it. Do not edit by hand — update it from the extension.

export function runWorklogsExport(fetch, location) {
const xlsx = window.__SIMPLELIFE_XLSX__;
const createWorkbookBlob = xlsx?.createWorkbookBlob;
const downloadBlob = xlsx?.downloadBlob;

(async () => {
  const CONFIG_KEY = 'jira-worklogs-export';
  const config = (window.__SIMPLELIFE__?.config?.[CONFIG_KEY]) || {};
  const notifyProgress = (msg, pct) => window.__SIMPLELIFE__?.notifyProgress?.(CONFIG_KEY, msg, pct);
  const notifyProgressDone = () => window.__SIMPLELIFE__?.notifyProgressDone?.(CONFIG_KEY);

  if (!createWorkbookBlob || !downloadBlob) {
    window.__SIMPLELIFE__?.notifyError?.(CONFIG_KEY, 'XLSX writer not loaded.');
    return;
  }

  const CF = {
    complexity: 'customfield_10084',
    pickUpTime: 'customfield_10186'
  };

  const getFieldValue = (field) => {
    if (field === null || field === undefined) return '';
    if (typeof field === 'string' || typeof field === 'number') return String(field);
    if (field && field.value) return field.value;
    if (Array.isArray(field)) return field.map(f => f?.value ?? String(f)).join(', ');
    return '';
  };

  // Rich-text custom fields come back as Atlassian Document Format on API v3:
  // a nested {type:'doc', content:[...]} tree with no name/value anywhere, so
  // they need flattening or they export blank.
  const adfToText = (node) => {
    if (!node || typeof node !== 'object') return '';
    if (node.type === 'text') return String(node.text || '');
    const parts = Array.isArray(node.content) ? node.content.map(adfToText).filter(Boolean) : [];
    return node.type === 'doc' ? parts.join(' ').trim() : parts.join('');
  };

  // One warning per field id, so an unmapped shape is visible in the console
  // instead of silently exporting an empty column.
  const unrenderedFields = new Set();

  const toCellValue = (value, colId) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value)) {
      return value.map((v) => toCellValue(v, colId)).filter((v) => v !== '' && v !== null && v !== undefined).join(', ');
    }
    if (typeof value === 'object') {
      // `!= null` rather than truthiness throughout: a rating or option value
      // of 0 is real data and must not fall through to a blank cell.
      if (value.type === 'doc') return adfToText(value);
      if (value.displayName != null) return value.displayName;
      if (value.name != null) return value.name;
      if (value.value != null) return toCellValue(value.value, colId);
      // JSM satisfaction/CSAT: {rating, comment} — carries neither name nor value.
      if (value.rating != null) return value.comment ? `${value.rating} - ${value.comment}` : value.rating;
      if (value.key != null) return value.key;
      if (value.accountId != null) return value.accountId;
      if (value.emailAddress != null) return value.emailAddress;
      if (value.text != null) return String(value.text);
      if (colId && !unrenderedFields.has(colId)) {
        unrenderedFields.add(colId);
        console.warn(`[Worklogs Export] ${colId}: unrecognised value shape, exporting blank. Sample:`, value);
      }
      return '';
    }
    return String(value);
  };

  const isoDate = (raw, end = false) => {
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return end ? `${trimmed}T23:59:59.999Z` : `${trimmed}T00:00:00.000Z`;
    }
    return trimmed;
  };

  const dateFrom = isoDate(config.dateFrom, false) || '2025-08-14T00:00:00.000Z';
  const dateTo = isoDate(config.dateTo, true);
  const dateFromDay = dateFrom.slice(0, 10);
  const dateToDay = dateTo ? dateTo.slice(0, 10) : '';

  const users = Array.isArray(config.users) ? config.users.filter(Boolean) : [];
  // accountIds of the developers we attribute work to. Worklogs are matched
  // against this set by author, NOT by the issue assignee.
  const userSet = new Set(users.map((v) => String(v)));

  if (!users.length) {
    window.__SIMPLELIFE__?.notifyError?.(CONFIG_KEY, 'Pick at least one developer.');
    return;
  }

  // Always wrap values in double quotes — Jira's JQL parser treats some
  // bare identifiers as functions/keywords (e.g. project key "CF" matches
  // the customField cf() function and triggers a 400). Quoting them as
  // string literals is always safe.
  const formatList = (values) => values
    .map((v) => `"${String(v).replace(/"/g, '\\"')}"`)
    .join(', ');
  // Base query: any issue with a worklog in range, across every project the
  // user can see. There is no project filter, so `worklogAuthor` is the only
  // thing keeping the search bounded — see `authorJqls` below.
  const baseParts = [`worklogDate >= "${dateFromDay}"`];
  if (dateToDay) baseParts.push(`worklogDate <= "${dateToDay}"`);
  const jqlBase = baseParts.join(' AND ');
  // Preferred queries: narrow to issues the selected developers logged on.
  // The author list is chunked so a large selection can't blow the JQL length
  // limit; results are unioned by issue key, so overlapping chunks are free.
  const AUTHORS_PER_JQL = 80;
  const authorJqls = [];
  for (let i = 0; i < users.length; i += AUTHORS_PER_JQL) {
    authorJqls.push(`${jqlBase} AND worklogAuthor IN (${formatList(users.slice(i, i + AUTHORS_PER_JQL))})`);
  }

  console.log('[Worklogs Export] JQL (author):', authorJqls);
  console.log('[Worklogs Export] JQL (base):', jqlBase);

  const DEFAULT_FIELD_IDS = [
    'issuetype', '_issueKey', 'summary', 'assignee', '_authorEmail',
    'status', 'created', 'updated', 'resolutiondate',
    'customfield_10084', 'customfield_10186',
    '_originalEstimateHours', '_timeSpentHours', '_estimationDeviation',
    'priority', '_projectGroup', '_projectKey', '_projectName', '_projectUrl', '_parentSummary'
  ];
  const enabledFields = (Array.isArray(config.exportFields) && config.exportFields.length)
    ? config.exportFields
    : DEFAULT_FIELD_IDS;
  const ALWAYS_NEEDED = ['assignee', 'worklog', 'project', 'timetracking', 'parent'];
  const userJiraFields = enabledFields.filter((id) => !id.startsWith('_'));
  const FIELDS = [...new Set([...ALWAYS_NEEDED, ...userJiraFields])];

  const pageSize = 50;
  const details = [];
  const issuesMap = {};

  async function searchJql({ jql, maxResults = 50, fields = FIELDS, nextPageToken }) {
    const body = { jql, maxResults, fields };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const res = await fetch('/rest/api/3/search/jql', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Search API error ${res.status}: ${txt}`);
    }
    return res.json();
  }

  async function fetchAllWorklogs(issueKey, startedAfterISO) {
    const startedAfter = startedAfterISO ? Date.parse(startedAfterISO) : undefined;
    let startAt = 0;
    const perPage = 100;
    let all = [];
    while (true) {
      const url = new URL(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`, location.origin);
      url.searchParams.set('startAt', String(startAt));
      url.searchParams.set('maxResults', String(perPage));
      if (startedAfter) url.searchParams.set('startedAfter', String(startedAfter));
      const r = await fetch(url.toString(), { credentials: 'include' });
      if (!r.ok) {
        console.warn(`Worklog fetch error for ${issueKey}: ${r.status} ${await r.text()}`);
        break;
      }
      const js = await r.json();
      const page = Array.isArray(js.worklogs) ? js.worklogs : [];
      all = all.concat(page);
      if (startAt + page.length >= (js.total ?? startAt + page.length)) break;
      startAt += page.length;
      if (page.length === 0) break;
    }
    return all;
  }

  // Keep only worklogs that fall in range AND were authored by one of the
  // selected developers. The embedded/paged worklog lists contain entries
  // from every author on the issue, so the author filter is mandatory.
  // The period is whole calendar days, compared on the worklog's own date
  // (the same YYYY-MM-DD written to "Worklog Date"), so a worklog never lands
  // in a month its date doesn't belong to.
  // Worklogs in the period by people outside the developer list: left out of
  // the file, but counted so the Meta sheet shows whose time is missing.
  const excludedAuthors = new Map();
  const filterWorklogRange = (worklogs, fromDay, toDay) => {
    return worklogs.filter((w) => {
      const day = String(w.started || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
      if (fromDay && day < fromDay) return false;
      if (toDay && day > toDay) return false;
      if (!userSet.has(String(w.author?.accountId))) {
        const id = String(w.author?.accountId || '?');
        const e = excludedAuthors.get(id) || { name: w.author?.displayName || w.author?.emailAddress || id, seconds: 0, count: 0 };
        e.seconds += w.timeSpentSeconds || 0;
        e.count++;
        excludedAuthors.set(id, e);
        return false;
      }
      return true;
    });
  };

  // Paginate a JQL into issuesMap. Returns the running total of unique issues.
  async function collectIssues(jql) {
    let token = undefined;
    while (true) {
      const data = await searchJql({ jql, maxResults: pageSize, fields: FIELDS, nextPageToken: token });
      const pageIssues = data.issues || [];
      for (const issue of pageIssues) issuesMap[issue.key] = issue;
      const total = Object.keys(issuesMap).length;
      notifyProgress(`Issues fetched: ${total}…`, Math.min(35, 5 + total));
      if (!data.nextPageToken) break;
      token = data.nextPageToken;
    }
    return Object.keys(issuesMap).length;
  }

  try {
    notifyProgress('Searching issues…', 5);

    // Phase 1 — find matching issues, one author chunk at a time.
    let matched = 0;
    for (const jql of authorJqls) matched = await collectIssues(jql);
    console.log(`[Worklogs Export] Issues matched (author query): ${matched}`);
    if (!matched) {
      // Some Jira instances return 0 for `worklogAuthor IN (accountId)` even
      // when matches exist, so fall back to date-only and filter by author
      // client-side. Without a project clause this scans every project you can
      // see, which is slow — hence only as a last resort.
      console.warn('[Worklogs Export] worklogAuthor query returned 0 — retrying without author filter (all projects).');
      notifyProgress('Retrying without author filter (all projects)…', 30);
      matched = await collectIssues(jqlBase);
      console.log(`[Worklogs Export] Issues matched (base query): ${matched}`);
    }

    const issueKeys = Object.keys(issuesMap);
    if (!issueKeys.length) {
      // Pinpoint which layer is empty by probing one clause at a time.
      const probe = async (jql) => {
        try {
          const d = await searchJql({ jql, maxResults: 1, fields: ['summary'] });
          return (d.issues || []).length; // 0 = nothing, >0 = works
        } catch (e) {
          console.warn('[Worklogs Export] probe failed:', jql, e?.message);
          return -1; // query/endpoint errored
        }
      };
      const anyIssue = await probe('order by created DESC');
      const anyWorklog = await probe(jqlBase);
      console.log(`[Worklogs Export] probes — anyIssue:${anyIssue} anyWorklog:${anyWorklog}`);

      let msg;
      if (anyIssue < 0) {
        msg = 'Jira search API returned an error even for a basic query — make sure this tab is logged into the right Jira site (details in the console).';
      } else if (anyIssue === 0) {
        msg = 'Search returns no issues at all — you may not be logged into Jira or have no project access here.';
      } else if (anyWorklog <= 0) {
        msg = `No worklogs found on/after ${dateFromDay} anywhere you can see — the From date is probably too recent. Try an earlier date.`;
      } else {
        msg = `Worklogs exist after ${dateFromDay}, but none were logged by the ${users.length} selected developers. Check the developer selection (↻ reloads the list from Jira).`;
      }
      notifyProgressDone();
      window.__SIMPLELIFE__?.notifyError?.(CONFIG_KEY, msg);
      return;
    }

    // Phase 1b — issues RESOLVED in the period on the mapped projects, even
    // without a worklog in it. Without them the Summary misses every ticket
    // closed this month whose work was logged earlier, and Completed /
    // Timeliness / FTR by resolution month come out low.
    const worklogIssueKeys = new Set(Object.keys(issuesMap));
    const resolvedOnlyKeys = new Set();
    const lifetimeWorklogs = new Map();
    const scopeProjects = Object.keys(config._projectsGroups || {}).filter((k) => k && !k.startsWith('_'));
    if (scopeProjects.length && (dateFromDay || dateToDay)) {
      const parts = [`project IN (${formatList(scopeProjects)})`];
      if (dateFromDay) parts.push(`resolved >= "${dateFromDay}"`);
      if (dateToDay) parts.push(`resolved <= "${dateToDay}"`);
      try {
        notifyProgress('Searching issues resolved in the period…', 33);
        await collectIssues(parts.join(' AND '));
        for (const key of Object.keys(issuesMap)) if (!worklogIssueKeys.has(key)) resolvedOnlyKeys.add(key);
        console.log(`[Worklogs Export] Resolved in period without a worklog in it: ${resolvedOnlyKeys.size}`);
      } catch (e) {
        console.warn('[Worklogs Export] resolved-in-period search failed, Summary has worklog issues only:', e?.message);
      }
    }

    // Phase 2 — pull worklogs per issue from the worklog endpoint. We do NOT
    // rely on the worklog field embedded in search results: the new
    // /rest/api/3/search/jql endpoint doesn't return it reliably, which yields
    // an empty export. Every matched issue has at least one relevant worklog
    // (the JQL matched on worklogAuthor + worklogDate), so we fetch directly.
    // Parallel batches keep it fast.
    const WL_CONC = 8;
    let wlProcessed = 0;
    // Every issue found, the resolved-only ones too: their earlier worklogs
    // decide whether the team worked on them and who owns them.
    const fetchKeys = Object.keys(issuesMap);
    for (let i = 0; i < fetchKeys.length; i += WL_CONC) {
      const batch = fetchKeys.slice(i, i + WL_CONC);
      const results = await Promise.all(batch.map(async (key) => {
        // One day of slack on the server-side filter; the exact cut is by date below.
        // Every worklog of the issue: the period's go to Details, the whole
        // history picks the issue's main contributor for the Summary.
        const all = await fetchAllWorklogs(key);
        lifetimeWorklogs.set(key, all);
        return { key, worklogs: filterWorklogRange(all, dateFromDay, dateToDay) };
      }));
      for (const { key, worklogs } of results) {
        const fields = issuesMap[key].fields;
        for (const wl of worklogs) details.push({ issue: key, fields, worklog: wl });
      }
      wlProcessed += batch.length;
      notifyProgress(`Worklogs: ${wlProcessed}/${fetchKeys.length} issues…`, 35 + Math.round((wlProcessed / fetchKeys.length) * 30));
    }
    console.log(`[Worklogs Export] Worklogs collected: ${details.length}`);

    // Stable worklog id: the same worklog gets the same id in every export, so
    // monthly files can be appended and de-duplicated on it. Two entries with
    // the same issue, author, start and duration are one worklog entered twice.
    const worklogId = (issue, wl) => {
      const src = `${issue}|${wl.author?.accountId || ''}|${wl.started || ''}|${wl.timeSpentSeconds || 0}`;
      let h = 0x811c9dc5;
      for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return `${issue}-${h.toString(16).padStart(8, '0')}`;
    };
    const seenWorklogs = new Set();
    let duplicateWorklogs = 0;
    for (let i = details.length - 1; i >= 0; i--) details[i]._id = worklogId(details[i].issue, details[i].worklog);
    const uniqueDetails = details.filter((d) => {
      if (seenWorklogs.has(d._id)) { duplicateWorklogs++; return false; }
      seenWorklogs.add(d._id);
      return true;
    });
    details.length = 0;
    details.push(...uniqueDetails);
    if (duplicateWorklogs) console.warn(`[Worklogs Export] Dropped ${duplicateWorklogs} duplicate worklog(s).`);
    const exportedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');

    if (!details.length) {
      notifyProgressDone();
      window.__SIMPLELIFE__?.notifyError?.(CONFIG_KEY,
        `Found ${issueKeys.length} issues with worklogs in range, but none were logged by the selected developers. Check the developer selection.`);
      return;
    }

    notifyProgress('Resolving developers…', 80);
    const cachedUsers = (config._userMetadata && typeof config._userMetadata === 'object') ? config._userMetadata : {};

    // Resolve the developers (worklog authors) for display name/email. Prefer
    // the configurator's synced metadata; fall back to the worklog author
    // object — no extra API roundtrip needed.
    const developerData = {};
    for (const { worklog: wl } of details) {
      const a = wl.author || {};
      const id = a.accountId;
      if (!id || developerData[id]) continue;
      const cached = cachedUsers[id];
      const email = (cached?.email || a.emailAddress || '').trim().toLowerCase();
      developerData[id] = {
        displayName: cached?.displayName || a.displayName || 'Unknown',
        email: email || 'Not accessible',
        jobTitle: cached?.jobTitle || '',
        department: cached?.department || '',
        location: cached?.location || '',
        teamGroup: cached?.teamGroup || '',
        teamProjects: Array.isArray(cached?.teamProjects) ? cached.teamProjects : []
      };
    }

    notifyProgress('Building workbook…', 95);

    // Project→group map from the catalog's `projectGroups` block. Projects not
    // listed there export a blank group rather than being dropped.
    const projectGroups = (config._projectsGroups && typeof config._projectsGroups === 'object')
      ? config._projectsGroups
      : {};
    const exportFieldLabels = (config._exportFieldLabels && typeof config._exportFieldLabels === 'object')
      ? config._exportFieldLabels
      : {};
    const resolveProjectGroup = (projectKey) => {
      const key = String(projectKey || '').trim();
      if (!key) return '';
      return projectGroups[key]
        || projectGroups[key.toUpperCase()]
        || projectGroups[key.toLowerCase()]
        || '';
    };

    // Single sheet: keep core worklog columns first, then append selected
    // export fields from settings so user-picked Jira/custom fields are filled.
    // Developer project/department/location/job title are deliberately NOT here
    // — they stay opt-in from the Fields tab.
    const baseColumns = [
      { id: '_issueKey', label: 'Issue key' },
      { id: '_developer', label: 'Person' },
      { id: '_authorEmail', label: 'Person email' },
      { id: '_developerGroup', label: 'Person group' },
      { id: '_developerHours', label: 'Worklog Hours' },
      { id: '_worklogDate', label: 'Worklog Date' },
      { id: '_worklogMonth', label: 'Worklog Month' },
      { id: '_projectKey', label: 'Project key' },
      { id: '_projectGroup', label: 'Project group' },
      { id: '_worklogId', label: 'Worklog ID' },
      { id: '_exportedAt', label: 'Exported At' }
    ];
    const baseIds = new Set(baseColumns.map((c) => c.id));

    const fieldLabels = {
      _issueKey: 'Issue key',
      issuetype: 'Work type',
      summary: 'Summary',
      _developer: 'Person',
      _authorEmail: 'Person email',
      _developerGroup: 'Person group',
      _developerProject: 'Developer project',
      _developerDepartment: 'Developer department',
      _developerJobTitle: 'Developer job title',
      _developerLocation: 'Developer location',
      _developerHours: 'Worklog hours',
      assignee: 'Assignee',
      status: 'Status',
      created: 'Created',
      updated: 'Updated',
      resolutiondate: 'Resolved',
      customfield_10084: 'Complexity Levels',
      customfield_10186: 'Pick Up Time',
      _originalEstimateHours: 'Original estimate (hours)',
      _timeSpentHours: 'Time Spent (hours)',
      _estimationDeviation: 'Estimation deviation',
      priority: 'Priority',
      _projectGroup: 'Project group',
      _projectKey: 'Project key',
      _projectName: 'Project name',
      _projectUrl: 'Project url',
      _parentSummary: 'Parent Summary'
    };

    // Which sheets to emit is a per-instance setting, so each Jira site can
    // have its own report shape.
    const wanted = (Array.isArray(config.sheets) && config.sheets.length) ? config.sheets : ['details'];
    const withSummary = wanted.includes('summary');

    // With a Summary sheet the picked fields belong there, so Details stays a
    // clean per-worklog log. Without one they're appended to Details, which is
    // the only place they could otherwise appear.
    const selectedColumns = withSummary ? [] : enabledFields
      .filter((id) => !baseIds.has(id))
      .map((id) => ({ id, label: exportFieldLabels[id] || fieldLabels[id] || id }));
    const allColumns = [...baseColumns, ...selectedColumns];

    const resolveColumnValue = (colId, issue, fields, wl, authorInfo) => {
      wl = wl || {};
      authorInfo = authorInfo || {};
      const a = wl.author || {};
      const started = String(wl.started || '');
      const projectKey = fields?.project?.key || '';
      const originalEstimateHours = (fields?.timetracking?.originalEstimateSeconds || 0) / 3600;
      const timeSpentHours = (fields?.timetracking?.timeSpentSeconds || 0) / 3600;
      const email = (authorInfo.email && authorInfo.email !== 'Not accessible'
        ? authorInfo.email
        : ((a.emailAddress || '').trim().toLowerCase()));
      const domain = String(authorInfo.domain || (email.includes('@') ? email.split('@')[1] : '') || '').toLowerCase();
      // Pinned assignment wins; the email domain (settings.groupByDomain) is only the fallback guess.
      const assigned = Object.entries(config._assignments || {}).find(([e]) => String(e).trim().toLowerCase() === email)?.[1];
      const developerGroup = assigned?.group || authorInfo.teamGroup || (config._groupByDomain || {})[domain] || '';
      const developerProject = (Array.isArray(authorInfo.teamProjects) ? authorInfo.teamProjects : []).join(', ');

      const special = {
        _issueKey: issue,
        _developer: authorInfo.displayName || a.displayName || 'Unknown',
        _authorEmail: email,
        _developerGroup: developerGroup,
        _developerProject: developerProject,
        _developerDepartment: authorInfo.department || '',
        _developerJobTitle: authorInfo.jobTitle || '',
        _developerLocation: authorInfo.location || '',
        _developerHours: (wl.timeSpentSeconds || 0) / 3600,
        _worklogId: wl._id || '',
        _exportedAt: exportedAt,
        _worklogDate: started.slice(0, 10),
        _worklogMonth: started.slice(0, 7),
        _projectGroup: resolveProjectGroup(projectKey),
        _projectKey: projectKey,
        _projectName: fields?.project?.name || '',
        _projectUrl: projectKey ? `${location.origin}/browse/${projectKey}` : '',
        _parentSummary: fields?.parent?.fields?.summary || '',
        _originalEstimateHours: originalEstimateHours,
        _timeSpentHours: timeSpentHours,
        _estimationDeviation: timeSpentHours - originalEstimateHours,
        assignee: fields?.assignee?.displayName || '',
        issuetype: fields?.issuetype?.name || '',
        status: fields?.status?.name || '',
        priority: fields?.priority?.name || ''
      };

      if (Object.prototype.hasOwnProperty.call(special, colId)) return special[colId];
      return toCellValue(fields?.[colId], colId);
    };

    const detailHeader = allColumns.map((c) => c.label);
    const detailRows = details.map(({ issue, fields, worklog: wl, _id }) => {
      const a = wl.author || {};
      const info = developerData[a.accountId] || {};
      return allColumns.map((c) => resolveColumnValue(c.id, issue, fields, { ...wl, _id }, info));
    });

    // ---- Who is in the team: the developers the export was given (the JQL's people) ----
    const usable = (e) => (e && e !== 'Not accessible' ? String(e).trim().toLowerCase() : '');
    // The JQL's own emails when the page passes them, plus the developers' emails.
    const teamEmails = new Set([
      ...(config._teamEmails || []).map(usable),
      ...users.map((id) => usable(cachedUsers[id]?.email) || usable(developerData[id]?.email))
    ].filter(Boolean));
    const inTeam = (email) => Boolean(email) && (teamEmails.size === 0 || teamEmails.has(email));
    // Display name → email: the known people first, then the roster by name
    // (every word of the email's name part must appear in the display name).
    const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const rosterEmails = [...new Set((config._roster || []).map(usable).filter((e) => e.includes('@')))];
    const emailByName = (name) => {
      const n = String(name || '').trim().toLowerCase();
      if (!n) return '';
      const known = [...Object.values(cachedUsers), ...Object.values(developerData)]
        .find((u) => String(u?.displayName || '').trim().toLowerCase() === n && usable(u.email));
      if (known) return usable(known.email);
      const hay = fold(name);
      const squeezed = hay.replace(/[^a-z]/g, '');
      const hits = rosterEmails.filter((e) => {
        const tokens = fold(e.split('@')[0]).split(/[._-]+/).map((t) => t.replace(/\d+/g, '')).filter((t) => t.length > 1);
        return tokens.length > 0 && tokens.every((t) => hay.includes(t) || squeezed.includes(t));
      });
      return hits.length === 1 ? hits[0] : '';
    };
    // Hours each of the JQL's people logged on an issue over its whole life.
    const teamHoursOn = (key) => {
      const hours = new Map();
      for (const wl of lifetimeWorklogs.get(key) || []) {
        const id = String(wl.author?.accountId || '');
        if (!userSet.has(id)) continue;
        hours.set(id, (hours.get(id) || 0) + (wl.timeSpentSeconds || 0));
      }
      return hours;
    };
    const emailOfAuthor = (id) => {
      const wl = [...lifetimeWorklogs.values()].flat().find((w) => String(w.author?.accountId) === id);
      return usable(cachedUsers[id]?.email) || usable(developerData[id]?.email) || usable(wl?.author?.emailAddress);
    };
    // The issue's owner for the dashboard: whoever of the JQL's people logged
    // the most hours on it over its life (ties go to the assignee, then by
    // name). No team hours at all: the assignee, if one of the JQL's people.
    const assignments = Object.fromEntries(Object.entries(config._assignments || {}).map(([e, a]) => [usable(e), a || {}]));
    const personGroup = (email, id) => (assignments[email]?.group)
      || (id && (cachedUsers[id]?.teamGroup || developerData[id]?.teamGroup))
      || (config._groupByDomain || {})[String(email).split('@')[1] || '']
      || '';
    const ownerOf = (key, fields) => {
      const assignee = emailByName(fields?.assignee?.displayName);
      const ranked = [...teamHoursOn(key).entries()]
        .map(([id, sec]) => ({ id, email: emailOfAuthor(id), sec }))
        .filter((x) => x.email)
        .sort((a, b) => b.sec - a.sec || (b.email === assignee) - (a.email === assignee) || a.email.localeCompare(b.email));
      if (ranked.length) {
        const { id, email } = ranked[0];
        return { email, name: cachedUsers[id]?.displayName || developerData[id]?.displayName || '', group: personGroup(email, id) };
      }
      return inTeam(assignee) ? { email: assignee, name: String(fields?.assignee?.displayName || ''), group: personGroup(assignee) } : { email: '', name: '', group: '' };
    };
    const ownerEmail = (key, fields) => {
      const assignee = emailByName(fields?.assignee?.displayName);
      const ranked = [...teamHoursOn(key).entries()]
        .map(([id, sec]) => ({ email: emailOfAuthor(id), sec }))
        .filter((x) => x.email)
        .sort((a, b) => b.sec - a.sec || (b.email === assignee) - (a.email === assignee) || a.email.localeCompare(b.email));
      if (ranked.length) return ranked[0].email;
      return inTeam(assignee) ? assignee : '';
    };
    // Tickets resolved in the period with no worklog in it belong to the team
    // when the team worked on them earlier, or one of its people is assignee.
    const keptResolvedKeys = [...resolvedOnlyKeys].filter((k) => Boolean(ownerEmail(k, issuesMap[k]?.fields)));
    if (resolvedOnlyKeys.size !== keptResolvedKeys.length) {
      console.log(`[Worklogs Export] Resolved without a worklog: kept ${keptResolvedKeys.length}, left out ${resolvedOnlyKeys.size - keptResolvedKeys.length} the team never worked on.`);
    }

    // Project keys with no group: their rows export a blank "Project group".
    const unmappedProjects = [...new Set([...details.map((d) => d.fields?.project?.key || ''),
      ...keptResolvedKeys.map((k) => issuesMap[k]?.fields?.project?.key || '')])]
      .filter((k) => k && !resolveProjectGroup(k));
    if (unmappedProjects.length) console.warn('[Worklogs Export] Projects without a group (blank "Project group"):', unmappedProjects.join(', '));

    // ---- Jira Summary: one row per issue, columns from the Fields tab ----
    // Worklog-level values are aggregated: hours sum, everyone who logged time
    // is listed distinctly. Issue-level fields resolve off any one worklog.
    const AGGREGATED = new Set([
      '_developer', '_authorEmail', '_developerGroup', '_developerProject',
      '_developerDepartment', '_developerLocation', '_worklogDate', '_worklogMonth'
    ]);
    const buildSummary = () => {
      const byIssue = new Map();
      for (const d of details) {
        if (!byIssue.has(d.issue)) byIssue.set(d.issue, { fields: d.fields, worklogs: [] });
        byIssue.get(d.issue).worklogs.push(d.worklog);
      }
      for (const key of keptResolvedKeys) {
        if (!byIssue.has(key) && issuesMap[key]) byIssue.set(key, { fields: issuesMap[key].fields, worklogs: [] });
      }
      const columns = enabledFields.map((id) => ({
        id,
        label: exportFieldLabels[id] || fieldLabels[id] || id
      }));
      if (!enabledFields.includes('_worklogAuthors')) columns.push({ id: '_worklogAuthors', label: 'Worklog authors' });
      if (!enabledFields.includes('_exportedAt')) columns.push({ id: '_exportedAt', label: 'Exported At' });
      const infoOf = (wl) => developerData[wl?.author?.accountId] || {};
      const rows = [...byIssue.entries()].map(([issue, { fields, worklogs }]) => columns.map((c) => {
        if (c.id === '_developerHours') {
          return worklogs.reduce((sum, wl) => sum + (wl.timeSpentSeconds || 0) / 3600, 0);
        }
        if (c.id === '_authorEmail') return ownerOf(issue, fields).email;
        if (c.id === '_developer') return ownerOf(issue, fields).name;
        if (c.id === '_developerGroup') return ownerOf(issue, fields).group;
        if (c.id === '_worklogAuthors') {
          const seen = [];
          for (const wl of worklogs) {
            const e = usable(infoOf(wl).email) || usable(wl.author?.emailAddress);
            if (e && !seen.includes(e)) seen.push(e);
          }
          return seen.join(', ');
        }
        if (AGGREGATED.has(c.id) && !worklogs.length) {
          // Resolved in the period with no worklog in it: attribute to the
          // assignee, looked up by display name among the known people.
          const assigneeName = String(fields?.assignee?.displayName || '').trim().toLowerCase();
          const person = assigneeName && Object.values(cachedUsers).find((u) => String(u?.displayName || '').trim().toLowerCase() === assigneeName);
          if (!person) return '';
          if (c.id === '_authorEmail') return String(person.email || '').toLowerCase();
          if (c.id === '_developer') return person.displayName || '';
          if (c.id === '_developerGroup') return person.teamGroup || '';
          return '';
        }
        if (AGGREGATED.has(c.id)) {
          const seen = [];
          for (const wl of worklogs) {
            const v = resolveColumnValue(c.id, issue, fields, wl, infoOf(wl));
            const s = v === '' || v === undefined || v === null ? '' : String(v);
            if (s && !seen.includes(s)) seen.push(s);
          }
          return seen.join(', ');
        }
        return resolveColumnValue(c.id, issue, fields, worklogs[0] || {}, worklogs[0] ? infoOf(worklogs[0]) : {});
      }));
      return { name: 'Jira Summary', rows: [columns.map((c) => c.label), ...rows] };
    };

    const sheetSpecs = [];
    const summarySheet = withSummary ? buildSummary() : null;
    if (summarySheet) sheetSpecs.push(summarySheet);
    if (wanted.includes('details') || !sheetSpecs.length) {
      sheetSpecs.push({ name: 'Jira Details', rows: [detailHeader, ...detailRows] });
    }
    const issueCount = summarySheet ? summarySheet.rows.length - 1 : new Set(details.map((d) => d.issue)).size;

    const round2 = (x) => Math.round(x * 100) / 100;
    const excluded = [...excludedAuthors.values()].sort((a, b) => b.seconds - a.seconds);
    if (excluded.length) console.warn('[Worklogs Export] Authors outside the developer list, left out:', excluded.map((e) => `${e.name} ${round2(e.seconds / 3600)} h`).join('; '));

    const workbookBlob = createWorkbookBlob(sheetSpecs);

    const todayDay = new Date().toISOString().slice(0, 10);
    const lastOfMonth = (day) => {
      const [y, m] = day.split('-').map(Number);
      return `${day.slice(0, 8)}${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
    };
    const wholeMonth = dateFromDay && dateToDay && dateFromDay.endsWith('-01')
      && dateFromDay.slice(0, 7) === dateToDay.slice(0, 7) && dateToDay === lastOfMonth(dateToDay);
    const period = wholeMonth ? dateFromDay.slice(0, 7) : `${dateFromDay || todayDay}_${dateToDay || todayDay}`;
    const filename = `worklogs_${period}.xlsx`
      .replace(/[\\\/:*?"<>|]/g, '_');

    downloadBlob(filename, workbookBlob);

    notifyProgressDone();
    const notes = [];
    if (keptResolvedKeys.length) notes.push(`${keptResolvedKeys.length} resolved without a worklog in the period`);
    if (resolvedOnlyKeys.size > keptResolvedKeys.length) notes.push(`${resolvedOnlyKeys.size - keptResolvedKeys.length} resolved tickets the JQL's people never worked on left out`);
    if (duplicateWorklogs) notes.push(`${duplicateWorklogs} duplicate worklogs dropped`);
    if (unmappedProjects.length) notes.push(`no project group for ${unmappedProjects.join(', ')}`);
    if (excluded.length) notes.push(`${excluded.length} authors outside the team left out (${round2(excluded.reduce((sum, e) => sum + e.seconds, 0) / 3600)} h)`);
    if (!Object.keys(projectGroups).length) notes.push('no project groups in settings');
    console.log(`Complete: ${filename} generated. Issues=${issueCount}, worklogs=${details.length}`);
    window.__SIMPLELIFE__?.notifySuccess?.(CONFIG_KEY, `${filename}: ${issueCount} issues, ${details.length} worklogs.${notes.length ? ` (${notes.join('; ')})` : ''}`);
  } catch (err) {
    console.error(err);
    notifyProgressDone();
    window.__SIMPLELIFE__?.notifyError?.(CONFIG_KEY, err?.message || 'Failed to export worklogs.');
  }
})();

}
