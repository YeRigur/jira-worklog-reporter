// The Worklogs bridge, in one place: everything the page and the bookmark
// agree on. The page builds the bookmark from this, so nothing about the
// bridge is written into the code by hand.
//
// What goes into the bookmark — `protocol`, `apiPrefix` and `text` — is meant
// to stay put: a bookmark keeps the code it was dragged with. Change
// `protocol` only when the messages between page and bookmark change; that is
// the one thing that asks people to drag the bookmark again. Everything else
// here is the page's own and can change freely.

export const jiraBridge = {
  // The messages between the page and the bookmark (ready, fetch, response, status).
  protocol: 3,

  // The bookmark answers the export page only, and only with GET requests
  // under this prefix: Jira's REST API, read-only. It works on any Jira site —
  // the site comes from the settings file (`site`).
  apiPrefix: '/rest/api/3/',

  // The calls the page itself may send through the bookmark; `*` is one path
  // part (an issue key or id). A query string is allowed on each.
  allowedPaths: [
    '/rest/api/3/search/jql',
    '/rest/api/3/issue/*/worklog',
    '/rest/api/3/user/search',
    '/rest/api/3/user',
    '/rest/api/3/myself',
    '/rest/api/3/field'
  ],

  // The Jira tab Start opens, and its window name (so Start reuses one tab).
  jiraTabPath: '/jira/your-work',
  windowName: 'jira-worklogs-bridge',

  // How long one request may take, when to suggest the CSV way while waiting
  // for the bookmark, how often to check the tab is still open, and how often
  // to retry when Jira says "too many requests" (429).
  requestTimeoutMs: 60000,
  slowAfterMs: 120000,
  tabCheckMs: 1000,
  retries429: 3,
  retryBaseMs: 2000,

  // The words in the bookmark's card over the Jira tab. The rest of what the
  // card says comes from the page while it runs.
  text: {
    noOpener: 'Open Jira with Start on the export page, then click this bookmark there.',
    title: 'Worklogs export',
    connected: 'Connected. Follow the export page.',
    done: '✓ All done',
    failed: 'Something went wrong',
    keepOpen: 'keep this tab open',
    requests: 'requests',
    closeTab: 'Close tab',
    backToJira: 'Back to Jira'
  }
};
