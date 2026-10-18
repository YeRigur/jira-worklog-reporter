// After a file: the Excel it will make on the left, the facts on the right.
import { h, icon, xlsxIcon } from '../dom.js';
import { periodLabel } from '../../core/period.js';
import { hours, plural } from '../../core/format.js';
import { isProblem } from '../../core/column-choice.js';
import { groupOf, projectsInFile } from '../../core/project-groups.js';
import { outsiders } from '../../core/worklog-stats.js';

export function mainPage(app, { ds, rows, problems, blocked, period, empties, keep }) {
  const { state, go, link, factRow } = app;
  const p = state.preview;
  const fresh = Boolean(p && p.ok && p.signature === app.signature());
  const savedNow = Boolean(state.savedSig && state.savedSig === app.signature());
  const columns = fresh && p.sheets.length ? Math.max(...p.sheets.map((s) => s.header.length)) : 0;
  const byHand = rows.filter((r) => r.status === 'bound' || r.status === 'empty' || (isProblem(r) && state.skipped.includes(r.key)));
  const attached = byHand.filter((r) => r.status === 'bound').length;
  const open = problems.filter((r) => !state.skipped.includes(r.key));
  const pickProblems = () => go('pick', { pickKeys: problems.map((r) => r.key) });

  const failed = (state.result && !state.result.ok && state.result.message) || (p && !p.ok && p.signature === app.signature() && p.message);
  const facts = [];
  if (!app.siteOf()) facts.push(h('div', { class: 'trow trow--bad trow--site' }, icon('alert', 16), h('span', { class: 'x' }, 'Enter your Jira site — it’s needed for the “Project url” column.', app.inputs.siteInput)));
  if (!period.count) facts.push(factRow('bad', 'alert', `No worklogs in ${periodLabel(state.from, state.to)}`));
  facts.push(factRow('ok', 'calendar', `Period: ${periodLabel(state.from, state.to)}`, link('Change', () => go('period'))));
  if (blocked) {
    facts.push(factRow('bad', 'alert', h('b', { text: `${plural(open.length, 'column')} ${open.length === 1 ? 'isn’t' : 'aren’t'} in this CSV` }), link('Resolve', pickProblems)));
  } else if (byHand.length) {
    const said = [attached ? `${plural(attached, 'column')} attached` : '', byHand.length - attached ? `${byHand.length - attached} left out` : ''].filter(Boolean);
    facts.push(factRow('ok', 'check', said.join(', '), link('Change', () => go('pick', { pickKeys: byHand.map((r) => r.key) }))));
  }
  if (empties.length) {
    facts.push(state.emptyOk
      ? factRow('ok', 'check', `${plural(empties.length, 'column')} empty, as in Jira`, link('Review', () => go('empty')))
      : factRow('warn', 'alert', `${plural(empties.length, 'column')} came out empty`, link('Review', () => go('empty'))));
  }
  if (!blocked && !byHand.length && !empties.length && fresh) {
    facts.push(factRow('ok', 'check', `All ${rows.length} columns filled`, link('View all', () => go('all'))));
  }
  const { meta, unnamed } = app.people(ds);
  const projects = projectsInFile(ds);
  const unmapped = projects.filter((x) => !groupOf(state.settings.projectGroups, x.key));
  facts.push(unmapped.length
    ? factRow('bad', 'alert', h('b', { text: `${plural(unmapped.length, 'project')} without a group — “Project group” will be empty for ${unmapped.map((x) => x.key).join(', ')}` }), link('Assign groups', () => go('groups')))
    : factRow('ok', 'check', `Project groups: ${plural(projects.length, 'project')} mapped`, link('Edit', () => go('groups'))));
  if (!state.settings.roster.length) facts.push(factRow('bad', 'alert', h('b', { text: 'No roster loaded — “Person email” will be empty' }), link('Load settings', app.chooseSettings)));
  if (keep) {
    const out = outsiders(ds, keep, { meta, people: state.settings.people, from: state.from, to: state.to });
    facts.push(factRow('ok', 'check', `Only the ${plural(app.filterEmails().length, 'person', 'people')} in your filter${out.length ? ` — left out ${plural(out.reduce((n, o) => n + o.count, 0), 'worklog')} by ${plural(out.length, 'other')}` : ''}`,
      out.length ? link('View', () => go('outside')) : null));
  }
  if (unnamed.length) facts.push(factRow('warn', 'alert', `${plural(unnamed.length, 'author')} ${unnamed.length === 1 ? 'shows' : 'show'} as “Unknown”${keep ? ' — left out until found' : ''}`, link('Identify', () => go('authors'))));
  if (ds.warnings.length) facts.push(factRow('warn', 'alert', `${plural(ds.warnings.length, 'thing')} to know about this file`, link('Details', () => go('notes'))));

  const stat = (value, label) => h('div', { class: 'tstat' }, h('b', { text: String(value) }), h('span', { text: label }));
  return h('div', { class: 'tmain' },
    h('div', { class: 'tmain__file' },
      h('div', { class: 'ttile' }, xlsxIcon(64),
        h('div', { class: 'ttile__name', text: fresh ? p.filename : (app.siteOf() && !failed ? 'Building your Excel…' : app.fileNames()) }),
        h('div', { class: 'ttile__meta', text: fresh ? `${plural(p.sheets.length, 'sheet')} · ${plural(columns, 'column')}` : `${plural(ds.issues.length, 'issue')} in ${app.fileNames()}` })),
      failed ? h('div', { class: 'terr', text: failed }) : null,
      blocked
        ? h('div', { class: 'ttwo' },
          h('button', { class: 'is-primary', onclick: pickProblems }, 'Resolve columns'),
          h('button', { class: 'is-dark', onclick: () => { app.skip(problems.map((r) => r.key)); app.download(); } }, 'Skip them and download'))
        : h('button', { class: 'tdl', disabled: !fresh || state.busy || !app.siteOf(), onclick: app.download },
          icon('download', 17), state.busy ? 'Building…' : (savedNow ? 'Download again' : 'Download Excel')),
      savedNow ? h('div', { class: 'tsaved' }, icon('check', 14), 'Saved to your Downloads folder') : null,
      h('div', { class: 'tlinks' },
        link('Preview', () => go('preview')),
        link('Columns', () => go('all')),
        link('Settings', () => go('settings')),
        link('Start over', app.startOver))),
    h('div', { class: 'tmain__facts' },
      h('div', { class: 'tstats' },
        stat(period.count, period.count === 1 ? 'worklog' : 'worklogs'),
        stat(hours(period.seconds), 'hours'),
        stat(period.people, period.people === 1 ? 'person' : 'people')),
      h('div', { class: 'tlist' }, ...facts)));
}
