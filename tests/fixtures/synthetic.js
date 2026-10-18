// Synthetic Jira "CSV (all fields)" export — no real people or ids.
// Dates are wall-clock times of an exporter in Europe/Kyiv (+0300 in summer).

export const PEOPLE = {
  A: { key: '712020:aaaaaaaa-0000-4000-8000-000000000001', accountId: '712020:aaaaaaaa-0000-4000-8000-000000000001', name: 'Testenko,Olena,UA-Kyiv,Website Services', email: 'olena.testenko@ua.example.com' },
  B: { key: 'ug:bbbbbbbb-0000-4000-8000-000000000002', accountId: '5b10ac8d0000000000000002', name: 'Probenko,Ivan,UA-Kyiv,Website Services', email: 'ivan.probenko@ua.example.com' },
  C: { key: '712020:cccccccc-0000-4000-8000-000000000003', accountId: '712020:cccccccc-0000-4000-8000-000000000003', name: 'Silva,Joao,BR-Sao Paulo,Digital', email: 'joao.silva@br.example.com' },
  D: { key: '712020:dddddddd-0000-4000-8000-000000000004', accountId: '712020:dddddddd-0000-4000-8000-000000000004', name: 'Other,Person,CH-Bern,Marketing', email: 'person.other@example.com' }
};
const { A, B, C, D } = PEOPLE;

export const HEADERS = [
  'Summary', 'Issue key', 'Issue id', 'Issue Type', 'Status', 'Project key', 'Project name', 'Priority',
  'Resolution', 'Assignee', 'Assignee Id', 'Reporter', 'Reporter Id', 'Created', 'Updated', 'Resolved',
  'Due date', 'Labels', 'Labels', 'Watchers', 'Watchers Id', 'Log Work', 'Log Work', 'Log Work',
  'Original estimate', 'Remaining Estimate', 'Time Spent', 'Attachment',
  'Custom field (Complexity Levels)', 'Custom field (Pick Up Time)', 'Custom field (Difficulty)',
  'Custom field (Market)', 'Custom field (Market)', 'Sprint', 'Sprint', 'Parent', 'Parent key', 'Parent summary'
];

const issue = (o) => [
  o.summary, o.key, o.id, o.type, o.status, o.project, o.projectName, o.priority,
  o.resolution || '', o.assignee?.name || '', o.assignee?.accountId || '', o.reporter?.name || '', o.reporter?.accountId || '',
  o.created, o.updated, o.resolved || '', o.due || '', ...(o.labels || ['', '']), o.watcher?.name || '', o.watcher?.accountId || '',
  ...(o.logWork.concat(['', '', '']).slice(0, 3)),
  o.oe ?? '', o.re ?? '', o.ts ?? '', o.attachment || '',
  o.complexity || '', o.pickUp ?? '', o.difficulty || '', ...(o.market || ['', '']), ...(o.sprint || ['', '']),
  o.parentId || '', o.parentKey || '', o.parentSummary || ''
];

export const ROWS = [
  issue({
    summary: 'Checkout redesign', key: 'AC-1', id: '10001', type: 'Story', status: 'Done', project: 'AC',
    projectName: 'Alpha Care', priority: 'High', resolution: 'Done', assignee: A, reporter: D,
    created: '03/Aug/26 9:15 AM', updated: '20/Aug/26 5:00 PM', resolved: '20/Aug/26 5:00 PM',
    labels: ['web', 'ux'], watcher: A,
    logWork: [`fix; retest;04/Aug/26 10:00 AM;${A.key};7200`, `;05/Aug/26 11:30 AM;${B.key};10800`, `;06/Aug/26 9:00 AM;${D.key};3600`],
    oe: '14400', re: '0', ts: '21600',
    attachment: `04/Aug/26 10:00 AM;${B.key};shot.png;https://acme.atlassian.net/rest/api/3/attachment/content/10001`,
    complexity: 'Level 2 = 1 - 4h', pickUp: '2.0', difficulty: '1 — Simple', market: ['UA', 'PL'],
    sprint: ['AC Sprint 1', 'AC Sprint 2'], parentId: '10000', parentKey: 'AC-100', parentSummary: 'Q3 epic'
  }),
  issue({
    summary: 'Booking bug', key: 'VC-7', id: '20007', type: 'Bug', status: 'In Progress', project: 'VC',
    projectName: 'Vet Desk', priority: 'Medium', assignee: C, reporter: C,
    created: '01/Jul/26 8:00 AM', updated: '15/Aug/26 2:05 PM', due: '10/Sep/26 12:00 AM',
    logWork: [`;31/Jul/26 11:00 PM;${C.key};5400`, `;01/Aug/26 1:00 AM;${C.key};7200`, `retest;15/Aug/26 2:00 PM;${C.key};14400`],
    oe: '28800', re: '3600', ts: '27000',
    complexity: 'Level 3 = 4 - 8h', pickUp: '0.0', market: ['BR', ''], sprint: ['VC Sprint 9', '']
  }),
  issue({
    summary: 'Sandbox cleanup', key: 'ZZZ-3', id: '30003', type: 'Task', status: 'To Do', project: 'ZZZ',
    projectName: 'Sandbox', priority: 'Low', reporter: A,
    created: '30/Aug/26 4:00 PM', updated: '31/Aug/26 11:59 PM',
    logWork: [`;31/Aug/26 11:59 PM;${A.key};1800`, `;31/Aug/26 10:00 AM;${D.key};3600`],
    ts: '5400'
  }),
  issue({
    summary: 'Outsider task', key: 'AC-2', id: '10002', type: 'Task', status: 'Done', project: 'AC',
    projectName: 'Alpha Care', priority: 'Low', resolution: 'Done', assignee: D, reporter: D,
    created: '09/Aug/26 9:00 AM', updated: '10/Aug/26 11:00 AM', resolved: '10/Aug/26 11:00 AM',
    logWork: [`;10/Aug/26 10:00 AM;${D.key};3600`], ts: '3600'
  }),
  issue({
    summary: 'Next month', key: 'VC-8', id: '20008', type: 'Bug', status: 'Done', project: 'VC',
    projectName: 'Vet Desk', priority: 'Medium', resolution: 'Done', assignee: A, reporter: A,
    created: '01/Sep/26 9:00 AM', updated: '02/Sep/26 9:30 AM', resolved: '02/Sep/26 9:30 AM',
    logWork: [`;02/Sep/26 9:00 AM;${A.key};3600`], ts: '3600'
  })
];
