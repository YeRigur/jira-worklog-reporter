// The Export page, step by step: Team → People → Jira & period → Columns →
// Excel. A strip of steps on top (the ones reached can be gone back to), one
// card for the step at hand, Back and Next under it. Starting Jira, the
// columns and the Excel move the page on by themselves.
import { h, icon, xlsxIcon } from '../dom.js';
import { plural } from '../../core/format.js';
import { previousMonth, thisMonth, periodLabel } from '../../core/period.js';
import { bookmarkletUrl, bookmarkletSource } from '../../core/bridge.js';
import { groupOf, projectsInFile } from '../../core/project-groups.js';
import { rosterGroups } from '../../core/teams.js';
import { hints } from '../../config/texts.js';

// The bookmark answers only the page it was dragged from.
const pageOrigin = () => globalThis.location?.origin || '';

const STEPS = [
  { n: 1, key: 'team', label: 'Team' },
  { n: 2, key: 'people', label: 'People' },
  { n: 3, key: 'where', label: 'Jira & period' },
  { n: 4, key: 'columns', label: 'Columns' },
  { n: 5, key: 'excel', label: 'Excel' }
];

// How far the person can go now.
function reachable(app) {
  const { state } = app;
  const { phase } = state.jira;
  if (!state.settings.roster.length) return 1;
  if (!app.pickedEmails().length) return 2;
  if (phase === 'ready') return 5;
  if (phase === 'mapping') return 4;
  return 3;
}

// The step on screen: the one chosen, never past what is reachable.
function currentStep(app) {
  const { state } = app;
  const chosen = state.wizStep || (state.settings.roster.length ? 2 : 1);
  return Math.max(1, Math.min(chosen, reachable(app)));
}

const goStep = (app, n) => { app.state.wizStep = n; app.render(); };

export function jiraStart(app, { note } = {}) {
  const n = currentStep(app);
  const top = reachable(app);
  const { key } = STEPS[n - 1];
  const body = { team: teamStep, people: peopleStep, where: whereStep, columns: columnsStep, excel: excelStep }[key](app);
  return h('div', { class: 'twz' },
    stepper(app, n, top),
    h('section', { class: 'twz__card' },
      h('div', { class: 'twz__head' },
        h('div', { class: 'x' },
          h('h1', { class: 'twz__title', text: hints.steps[key].title }),
          h('p', { class: 'twz__sub', text: hints.steps[key].sub })),
        body.aside || null),
      h('div', { class: 'twz__body' }, note || null, ...body.parts),
      footer(app, n, body.next)),
    n <= 3 ? bookmarkPanel(app) : null);
}

function stepper(app, n, top) {
  const item = (s) => {
    // Behind: done, with a tick. Ahead but reachable: open to go to. Further: not yet.
    const tone = s.n === n ? 'is-now' : (s.n < n ? 'is-done' : (s.n <= top ? 'is-reach' : 'is-later'));
    const dot = h('span', { class: 'twz__dot' }, s.n < n ? icon('check', 13) : String(s.n));
    const label = h('span', { class: 'twz__label', text: s.label });
    return h('li', { class: `twz__step ${tone}` },
      s.n <= top && s.n !== n
        ? h('button', { class: 'twz__go', onclick: () => goStep(app, s.n) }, dot, label)
        : h('span', { class: 'twz__go', 'aria-current': s.n === n ? 'step' : null }, dot, label));
  };
  const parts = [];
  STEPS.forEach((s, i) => {
    if (i) parts.push(h('li', { class: `twz__line${s.n <= Math.max(n, 1) ? ' is-done' : ''}`, 'aria-hidden': 'true' }));
    parts.push(item(s));
  });
  return h('ol', { class: 'twz__steps', 'aria-label': 'Steps' }, ...parts);
}

// Back, where we are, and the step's own Next.
function footer(app, n, next) {
  return h('div', { class: 'twz__foot' },
    n > 1 ? h('button', { class: 'tbtn', onclick: () => goStep(app, n - 1) }, icon('back', 14), 'Back') : null,
    h('span', { class: 'twz__count', text: hints.stepOf(n, STEPS.length) }),
    next ? h('span', { class: 'twz__next' }, ...[next].flat().filter(Boolean)) : null);
}

// 1 · The settings file in use, and a way to switch to another team's.
function teamStep(app) {
  const { state, link, go } = app;
  const s = state.settings;
  const loaded = s.roster.length > 0;
  const facts = [plural(s.roster.length, 'person', 'people'), s.site, plural(Object.keys(s.projectGroups || {}).length, 'project group')].filter(Boolean).join(' · ');
  return {
    parts: [
      loaded
        ? h('div', { class: 'twz__file' }, icon('check', 18),
          h('span', { class: 'x' }, h('b', { text: state.settingsName || 'Settings loaded' }), h('small', { text: facts })),
          h('button', { class: 'tbtn', title: hints.switchFile, onclick: app.switchSettings }, icon('upload', 14), 'Switch file'))
        : h('div', { class: 'twz__file is-empty' }, icon('upload', 18),
          h('span', { class: 'x', text: hints.noSettings }),
          h('button', { class: 'tdl', onclick: app.switchSettings }, icon('upload', 14), 'Load file')),
      loaded ? link('Edit settings', () => go('settings')) : null
    ],
    next: h('button', { class: 'tdl', disabled: !loaded, onclick: () => goStep(app, 2) }, 'Next: People', icon('right', 14))
  };
}

// 2 · People by team group, as tiles; one group opens for the names.
function peopleStep(app) {
  const { state, link } = app;
  const roster = state.settings.roster;
  const picked = app.pickedEmails();
  const j = state.jira;
  const busy = Boolean(j.report) || j.phase === 'running' || j.phase === 'waiting';
  const groups = rosterGroups(state.settings, picked);
  const opened = state.openGroups[0] || '';
  const short = (email) => email.split('@')[0].split(/[._-]/).filter(Boolean).map((w, i) => (i ? `${w[0].toUpperCase()}.` : w[0].toUpperCase() + w.slice(1))).join(' ');
  const tile = ({ name, emails }) => {
    const label = name || 'No group';
    const on = emails.filter((e) => picked.includes(e));
    const all = on.length === emails.length;
    const toggle = () => app.pickPeople(all ? picked.filter((e) => !emails.includes(e)) : [...new Set([...picked, ...emails])]);
    const absent = emails.filter((e) => j.missing.includes(e)).length;
    const isOpen = opened === label;
    const names = on.length ? `${on.slice(0, 3).map(short).join(', ')}${on.length > 3 ? ` +${on.length - 3}` : ''}` : 'Nobody ticked';
    return h('div', { class: `twz__tile${on.length ? ' is-on' : ''}${isOpen ? ' is-open' : ''}` },
      h('div', { class: 'twz__tilehead' }, h('b', { class: 'x', text: label }), h('span', { class: 'twz__n', text: `${on.length} / ${emails.length}` })),
      h('div', { class: 'twz__names', text: names }),
      absent ? h('small', { class: 'tcheck__bad', text: `${absent} ${hints.notInJira}` }) : null,
      h('div', { class: 'twz__acts' },
        link(isOpen ? 'Close' : 'Change', () => { state.openGroups = isOpen ? [] : [label]; app.render(); }),
        link(all ? 'None' : 'Tick all', toggle),
        h('button', {
          class: 'tlinkbtn', disabled: busy || !app.jira.site(), title: hints.separateReport(label),
          onclick: () => app.jira.groupReport(emails, label)
        }, j.report === label ? 'Building…' : 'Separate Excel')));
  };
  const openGroup = groups.find((g) => (g.name || 'No group') === opened);
  const note = (email) => {
    if (j.missing.includes(email)) return h('small', { class: 'tcheck__bad', text: hints.notInJira });
    if (j.guessed.includes(email)) return h('small', { class: 'tcheck__note', text: hints.foundBySearch });
    return null;
  };
  const list = openGroup ? h('div', { class: 'twz__list' },
    ...openGroup.emails.map((email) => h('label', { class: 'tcheck' },
      h('input', {
        type: 'checkbox', checked: picked.includes(email),
        onchange: (e) => app.pickPeople(e.target.checked ? [...picked, email] : picked.filter((x) => x !== email))
      }),
      h('span', { class: 'x', text: email }), note(email)))) : null;
  const input = app.inputs.emailInput;
  const addEmail = () => {
    if (app.addRosterEmail(input.value)) input.value = '';
    app.render();
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } };
  const reportNote = j.report ? h('div', { class: 'thelp', text: state.progress || hints.buildingReport(j.report) })
    : (j.reportNote ? h('div', { class: j.reportNote.ok ? 'tok' : 'terr', text: j.reportNote.text }) : null);
  return {
    aside: roster.length ? h('span', { class: 'twz__pill', text: `${picked.length} of ${roster.length} ticked` }) : null,
    parts: [
      h('div', { class: 'twz__tiles' }, ...groups.map(tile)),
      list,
      reportNote,
      h('div', { class: 'twz__add' }, input, h('button', { class: 'tbtn', onclick: addEmail }, icon('plus', 14), 'Add a person'))
    ],
    next: h('button', { class: 'tdl', disabled: !picked.length, onclick: () => goStep(app, 3) }, 'Next: Jira & period', icon('right', 14))
  };
}

// 3 · The Jira site, the period, and — with project groups — one group only.
// Next is Start: it opens Jira and moves on once the columns are known.
function whereStep(app) {
  const { state } = app;
  const { fromInput, toInput, siteInput } = app.inputs;
  if (!siteInput.value && state.settings.site) siteInput.value = state.settings.site;
  const j = state.jira;
  const setPeriod = (p) => {
    state.from = fromInput.value = p.from;
    state.to = toInput.value = p.to;
    state.result = null;
    app.render();
  };
  const chip = (label, p) => {
    const on = state.from === p.from && state.to === p.to;
    return h('button', { class: `twz__chip${on ? ' is-on' : ''}`, 'aria-pressed': on ? 'true' : 'false', onclick: () => setPeriod(p) }, label);
  };
  const groups = state.settings.projectGroups || {};
  const names = Object.keys(groups);
  const keys = state.projectGroup ? groups[state.projectGroup] || [] : [];
  const working = j.phase === 'waiting' || j.phase === 'running';
  const status = j.phase === 'error' ? h('div', { class: 'terr', text: j.message })
    : (j.phase === 'waiting' ? h('div', { class: 'tcallout tcallout--compact tcallout--info' }, icon('info', 16),
      h('div', { class: 'tcallout__body' }, h('span', { text: hints.waiting }), j.slow ? h('span', { text: hints.slow }) : null))
      : (j.phase === 'running' ? h('div', { class: 'thelp', text: j.message || hints.working }) : null));
  const canStart = Boolean(app.jira.site()) && app.pickedEmails().length > 0 && !working;
  return {
    aside: h('span', { class: 'twz__pill', text: periodLabel(state.from, state.to) }),
    parts: [
      h('div', { class: 'twz__fields' },
        h('label', { class: 'tjv__field' }, h('span', { text: 'Jira site' }), siteInput),
        names.length ? h('label', { class: 'tjv__field' }, h('span', { text: 'Projects' }),
          h('select', { 'aria-label': 'Project group', onchange: (e) => { state.projectGroup = e.target.value; state.result = null; app.render(); } },
            h('option', { value: '', text: 'All projects', selected: !state.projectGroup }),
            ...names.map((g) => h('option', { value: g, text: `${g} · ${plural(groups[g].length, 'project')}`, selected: state.projectGroup === g })))) : null,
        h('div', { class: 'tjv__field twz__wide' }, h('span', { text: 'Period' }),
          h('div', { class: 'twz__period' },
            chip('Last month', previousMonth()), chip('This month', thisMonth()),
            h('div', { class: 'tjv__dates' }, fromInput, h('span', { class: 'tjv__dash', text: '–' }), toInput)))),
      keys.length ? h('div', { class: 'thelp', text: hints.onlyProjects(keys) }) : null,
      status
    ],
    next: [
      !canStart && !working ? h('span', { class: 'twz__why', text: reasonOf(app) }) : null,
      h('button', { class: 'tdl', disabled: !canStart, onclick: app.jira.start },
        icon(working ? 'refresh' : 'right', 14), working ? hints.working : (j.phase === 'mapping' || j.phase === 'ready' ? 'Start again' : 'Start'))
    ]
  };
}

// Why Start is off.
function reasonOf(app) {
  const { state } = app;
  if (!state.settings.roster.length) return hints.reason.noPeople;
  if (!app.pickedEmails().length) return hints.reason.nobodyTicked;
  if (!app.jira.site()) return hints.reason.noSite;
  return '';
}

// 4 · The report's columns against this Jira, the way to the column pages,
// and Build Excel — the worklogs are read only then.
function columnsStep(app) {
  const { state, go } = app;
  const ctx = app.jira.columnsContext();
  const rows = ctx ? ctx.rows : [];
  const open = ctx ? ctx.problems.filter((r) => !state.skipped.includes(r.key)) : [];
  const found = ctx ? rows.length - ctx.problems.length : 0;
  return {
    aside: h('span', { class: `twz__pill${open.length ? ' is-warn' : ''}`, text: `${found} of ${rows.length} found in Jira` }),
    parts: [
      h('div', { class: `twz__state${open.length ? ' is-warn' : ''}` }, icon(open.length ? 'alert' : 'check', 18),
        h('span', { class: 'x', text: open.length ? hints.columnsOpen(open.length) : hints.columnsAll }),
        open.length
          ? h('button', { class: 'tbtn', onclick: () => go('pick', { pickKeys: open.map((r) => r.key) }) }, icon('columns', 14), 'Check columns')
          : h('button', { class: 'tbtn', onclick: () => go('all') }, icon('columns', 14), 'Review columns'))
    ],
    next: h('button', { class: 'tdl', disabled: state.jira.phase !== 'mapping', onclick: app.jira.build }, icon('sheet', 14), 'Build Excel')
  };
}

// 5 · Reading the worklogs, then the Excel.
function excelStep(app) {
  const { state, link, go } = app;
  const p = state.preview;
  const fresh = Boolean(p && p.signature === app.signature());
  if (!fresh || state.previewing) {
    return {
      parts: [
        h('div', { class: 'twz__bar' }, h('i', { style: `width:${Math.max(4, Math.min(100, state.progressPct || 0))}%` })),
        h('div', { class: 'thelp', text: state.progress || hints.working })
      ]
    };
  }
  if (!p.ok) return { parts: [h('div', { class: 'terr', text: p.message })] };
  const unmapped = projectsInFile(app.jira.projects()).filter((x) => !groupOf(state.settings.projectGroups, x.key));
  const saved = state.savedSig === app.signature();
  return {
    parts: [
      h('div', { class: 'twz__file is-excel' }, xlsxIcon(40),
        h('span', { class: 'x' }, h('b', { text: p.filename }), h('small', {}, `${plural(p.sheets.length, 'sheet')} · `, link('Preview', () => go('preview'))))),
      state.jira.done ? h('div', { class: 'tjv__done' }, icon('check', 14), hints.done) : null,
      saved ? h('div', { class: 'tsaved' }, icon('check', 14), 'Saved to your Downloads folder') : null,
      unmapped.length ? h('div', { class: 'tcallout tcallout--compact tcallout--warn' }, icon('alert', 16),
        h('div', { class: 'tcallout__body' },
          h('span', { text: hints.noGroup(unmapped.map((x) => x.key)) }),
          link('Assign groups', () => go('groups')))) : null
    ],
    next: h('button', { class: 'tdl', onclick: app.download }, icon('download', 15), saved ? 'Download again' : 'Download Excel')
  };
}

// Open while the page waits for it — that is when it is needed.
function bookmarkPanel(app) {
  const { state } = app;
  const open = state.jira.phase === 'waiting' || state.bridgeOpen;
  return h('details', { class: 'tbridge twz__bridge', open, ontoggle: (e) => { state.bridgeOpen = e.target.open; } },
    h('summary', { text: hints.bookmarkSummary }),
    h('div', { class: 'tbridge__body' },
      h('a', { class: 'tbtn tbtn--sm', href: bookmarkletUrl(pageOrigin()), draggable: 'true', title: hints.bookmarkTitle, onclick: (e) => e.preventDefault() }, icon('link', 14), 'Worklogs bridge'),
      h('div', { class: 'thelp', text: hints.bookmark })),
    h('details', { class: 'tbridge__code' }, h('summary', { text: hints.bookmarkCode }), h('pre', { class: 'jql', text: bookmarkletSource(pageOrigin()) })));
}
