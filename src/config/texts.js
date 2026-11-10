// Every hint, status and message the page shows, in one place: short, and
// about no team in particular. Code takes its words from here only. Labels
// on buttons and fields stay next to the button or field.

export const hints = {
  // Export: the steps, a title and one line each
  steps: {
    team: { title: 'Which team?', sub: 'The settings file holds the people, the Jira site and the groups.' },
    people: { title: 'Who goes in the report?', sub: 'The team filter’s people are ticked. Open a group to change it.' },
    where: { title: 'Which Jira and which period?', sub: 'Start opens Jira in a new tab — click the bookmark there.' },
    columns: { title: 'Check the columns', sub: 'Each report column and the Jira field it comes from.' },
    excel: { title: 'Your Excel', sub: 'Download it, or look at the preview first.' }
  },
  stepOf: (n, total) => `Step ${n} of ${total}`,
  // Export: settings and people
  noSettings: 'Load the settings file once — the browser keeps it.',
  switchFile: 'Use another settings file instead of this one',
  notInJira: 'not in Jira',
  foundBySearch: 'found by search',
  separateReport: (group) => `A separate Excel for ${group} only`,
  buildingReport: (group) => `Building the ${group} Excel…`,

  // Export: Jira & period
  onlyProjects: (keys) => `Only ${keys.join(', ')}.`,

  // Export: Start and what follows
  reason: {
    noPeople: 'Load the settings file or add an email.',
    nobodyTicked: 'Tick at least one person.',
    noSite: 'Enter the Jira site.',
    ready: 'Opens Jira in a new tab — click the bookmark there.',
    columns: 'Check the columns, then build the Excel.'
  },
  working: 'Working…',
  waiting: 'In the Jira tab, click the Worklogs bridge bookmark.',
  slow: 'Nothing yet? Sign in to Jira there, and use the latest bookmark.',
  columnsOpen: (n) => `${n === 1 ? '1 column has' : `${n} columns have`} no Jira field — pick one or leave it empty.`,
  columnsAll: 'Every column has a Jira field.',
  done: 'Done — the Jira tab can be closed.',
  noGroup: (keys) => `No project group: ${keys.join(', ')}.`,

  // The bookmark
  bookmarkSummary: 'First time? Get the Worklogs bridge bookmark',
  bookmark: 'Drag it to the bookmarks bar once. It only reads from Jira, for this page.',
  bookmarkTitle: 'Drag to the bookmarks bar',
  bookmarkCode: 'Show the code',

  // Columns
  pick: 'No Jira field for these columns. Pick one, or leave it out.',
  pickSaved: (site) => `Saved for ${site}.`,
  noSimilar: 'No similar field',
  empty: (period) => `Nothing in ${period} fills these fields. The Excel keeps them empty.`,
  emptyRow: (filled, total) => `filled in ${filled} of ${total} sample issues`,
  emptyCompare: 'Filled, for comparison: ',
  all: 'Where each column gets its data. Select one to change it.',
  more: (n) => `${n} more — type to narrow down`,

  // Other pages
  preview: 'The first rows of each sheet, as in the Excel.',
  groups: 'A name for each project to group by; projects can share one. Kept in the settings file.',
  groupsElsewhere: (list) => `In the settings, not in this export: ${list}`,
  settings: 'Team data lives here, not in the page. Save the file to share it.',
  settingsKeep: 'Save the settings file to keep it.'
};

export const messages = {
  // The bridge
  popupBlocked: 'The browser blocked the Jira tab. Allow pop-ups, then Start again.',
  tabClosed: 'The Jira tab was closed. Start again — what was read is kept.',
  oldBookmark: 'The bookmark is out of date. Drag the new one below, then click it in Jira.',
  timeout: 'Jira didn’t answer in time. Check the Jira tab, then Start again.',
  signedOut: 'Not signed in to Jira. Sign in there, then click the bookmark again.',
  noFields: (status) => `Jira didn’t list its fields (${status}).`,

  // The run, also shown over the Jira tab
  findingPeople: 'Finding people in Jira…',
  findingGroup: (group) => `Finding ${group} in Jira…`,
  sampling: 'Reading a few issues for the columns…',
  checkColumns: 'Check the columns on the export page.',
  nobodyFound: 'None of the ticked people are in this Jira.',
  nobodyInGroup: (group) => `Nobody in ${group} is in this Jira.`,
  bridgeDone: 'All done — you can close this tab.',
  savedTo: (name) => `Saved ${name} to Downloads.`,

  // The settings file
  dropSettings: 'Drop a settings file (.json) here.',
  switched: (name, people, site) => `Switched to “${name}”: ${people}${site ? ` on ${site}` : ''}.`,
  unreadable: (name, why) => `“${name}”: ${why}`,
  savedSettings: (name) => `Saved ${name} to Downloads. Share it with your team only.`,
  filterSaved: (added) => (added ? `Filter saved; ${added} joined the roster.` : 'Filter saved.'),
  filterCleared: 'Filter cleared — the whole roster is ticked at first.',
  emailAdded: (email) => `Added ${email}. Save the settings file to keep it.`,

  // The export's own errors, reworded
  noWorklogs: 'No time logged by the ticked people in this period.',
  noWorklogsAfter: (day) => `No worklogs on/after ${day} that you can see in Jira.`,
  noIssues: 'Jira returned no issues — signed in to it?',
  searchFailed: 'Jira’s search failed — sign in there and Start again.',
  nobodyPicked: 'None of the ticked people are in this Jira.'
};
