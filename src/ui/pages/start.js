// Before a file: the drop area, the period, how to get the CSV, the settings.
import { h, icon, copyText } from '../dom.js';
import { DATE_PATTERNS } from '../../core/jira-dates.js';
import { previousMonth, periodLabel } from '../../core/period.js';
import { monthsOf } from '../../core/filter-jql.js';

export function startPage(app) {
  const { state, link, step, copyJql, settingsNote, settingsSummary, go } = app;
  const { jqlBox } = app.inputs;

  // Left: the file — the drop area, and what went wrong with the last one.
  const upload = [h('div', {
    class: 'tdrop', role: 'button', tabindex: '0', onclick: app.choose,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); app.choose(); } }
  },
  h('span', { class: 'tplus' }, icon('upload', 30)),
  h('div', { class: 'tpt', text: 'Upload the Jira CSV export' }),
  h('div', { class: 'tpm', text: 'Drag and drop it anywhere on this page. Several files are merged into one report.' }),
  h('span', { class: 'tdrop__btn' }, 'Browse files'))];
  if (state.error) {
    upload.push(h('div', { class: 'terr', text: state.error.message }));
    if (state.error.code === 'date-format' || state.datePattern) {
      upload.push(h('label', { class: 'tfield' }, 'Date format used by your Jira',
        h('select', { onchange: (e) => { state.datePattern = e.target.value; app.parse(); } },
          h('option', { value: '', text: 'Detect automatically' }),
          ...DATE_PATTERNS.map((p) => h('option', { value: p, text: p, selected: p === state.datePattern })))));
    }
  }

  // Right: what the file should be — the period, how to export it, the settings.
  // Emails come from the roster alone — people found by Jira don't make up for it.
  const ready = state.settings.roster.length > 0;
  const guide = [
    periodPanel(app),
    h('section', { class: 'tpanel' },
      h('div', { class: 'tpanel__title' }, icon('info', 16), h('b', { text: 'How to get the CSV' })),
      h('div', { class: 'tsteps' },
        step(1, h('b', { text: 'Open the filter in Jira' }), h('span', { text: 'Use your team’s saved filter, or create one from this JQL.' }),
          h('div', { class: 'row' }, copyJql(), link('Show JQL', () => jqlBox.classList.toggle('hidden')))),
        step(2, h('b', { text: 'Export all fields' }), h('span', {}, 'Choose ', h('b', { text: '⋯ → Export → CSV (all fields)' }), '. “Current fields” leaves the worklogs out.')),
        step(3, h('b', { text: 'Upload it' }), h('span', { text: 'Drop it on the upload area. The Excel covers the reporting period above.' }))),
      jqlBox),
    h('div', { class: `tsetline${ready ? '' : ' is-missing'}` },
      icon(ready ? 'check' : 'alert', 15),
      h('span', { class: 'x' }, h('b', { text: 'Team settings: ' }), settingsSummary(),
        ready ? '' : '. Without a roster, emails, teams and the filter’s people are missing — load your team’s settings file.'),
      link(ready ? 'Open settings' : 'Load settings file', () => (ready ? go('settings') : app.chooseSettings()))),
    settingsNote()
  ];
  return h('div', { class: 'tstart' },
    h('div', { class: 'tstart__file' }, ...upload),
    h('div', { class: 'tstart__guide' }, ...guide.filter(Boolean)));
}

// The period: two dates, what they mean, and — when they span several months —
// one export per month (Jira caps a CSV at 1000 issues), each copied in turn.
function periodPanel(app) {
  const { state } = app;
  const { fromInput, toInput } = app.inputs;
  const days = state.from && state.to ? Math.round((Date.parse(state.to) - Date.parse(state.from)) / 86400000) + 1 : 0;
  const months = monthsOf(state.from, state.to);
  const resetButton = h('button', { class: 'tbtn tbtn--sm', onclick: () => {
    const last = previousMonth();
    state.from = fromInput.value = last.from;
    state.to = toInput.value = last.to;
    state.result = null;
    app.render();
  } }, icon('refresh', 14), 'Last month');
  const tooLong = days > 62;
  return h('section', { class: 'tperiodbox' },
    h('div', { class: 'tperiodbox__head' },
      h('div', { class: 'tperiodbox__title' }, icon('calendar', 16), h('b', { text: 'Reporting period' }),
        h('span', { class: 'tperiodbox__sum', text: `${periodLabel(state.from, state.to)}${days > 0 ? ` · ${days} days` : ''}` })),
      resetButton),
    h('div', { class: 'tdates' }, h('label', { class: 'tfield' }, 'Start date', fromInput), h('label', { class: 'tfield' }, 'End date', toInput)),
    h('div', { class: 'thelp', text: 'The JQL below and the Excel both use this period.' }),
    // One month needs no warning, but its JQL is copied the same way.
    months.length === 1 ? monthPicker(app, months) : null,
    months.length > 1 ? h('div', { class: `tcallout tcallout--compact tcallout--${tooLong ? 'warn' : 'info'}` },
      icon(tooLong ? 'alert' : 'info', 16),
      h('div', { class: 'tcallout__body' },
        h('span', {}, h('b', { text: `${months.length} months: ` }),
          `${tooLong ? 'Jira exports at most 1000 issues per CSV, so ' : ''}export each month separately, then upload all files together.`),
        monthPicker(app, months))) : null);
}

// Copying one month's JQL, ticked off once it worked.
const keyOf = (mo) => `${mo.from}|${mo.to}`;
const isCopied = (state, mo) => state.copiedMonths.includes(keyOf(mo));
const copiedCount = (state, months) => months.filter((mo) => isCopied(state, mo)).length;
async function copyMonth(app, mo, onFail) {
  const { state } = app;
  if (!(await copyText(app.teamJql(mo.from, mo.to)))) { onFail(); return false; }
  if (!isCopied(state, mo)) state.copiedMonths.push(keyOf(mo));
  return true;
}
const progress = (state, months) => h('span', { class: 'tprogress' },
  h('span', { class: 'tprogress__bar' }, h('i', { style: `width:${Math.round((100 * copiedCount(state, months)) / months.length)}%` })),
  `${copiedCount(state, months)}/${months.length} copied`);

// One select and one button; after a copy the select moves to the next month.
function monthPicker(app, months) {
  const { state } = app;
  const current = months.find((mo) => keyOf(mo) === state.monthPick) || months.find((mo) => !isCopied(state, mo)) || months[0];
  const select = h('select', { class: 'tmonthsel', 'aria-label': 'Month', onchange: (e) => { state.monthPick = e.target.value; app.render(); } },
    ...months.map((mo, i) => h('option', { value: keyOf(mo), selected: mo === current, text: `${i + 1}. ${mo.label}${isCopied(state, mo) ? '  ✓ copied' : ''}` })));
  const done = isCopied(state, current);
  const button = h('button', { class: `tbtn tbtn--sm${done ? ' is-done' : ''}`, onclick: async () => {
    if (!(await copyMonth(app, current, () => { button.lastChild.textContent = 'Copy failed'; }))) return;
    const next = months.find((mo) => !isCopied(state, mo));
    state.monthPick = next ? keyOf(next) : keyOf(current);
    app.render();
  } }, icon(done ? 'check' : 'copy', 14), h('span', { text: done ? 'Copy again' : 'Copy JQL' }));
  return h('div', { class: 'tmonthrow' }, select, button, progress(state, months));
}
