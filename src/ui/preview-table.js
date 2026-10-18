// The first rows of each sheet, under the headers the Excel will carry. It is
// the workbook the export built, not a second rendering of the data.
import { h } from './dom.js';
import { rawText, cellText } from '../core/format.js';

export function previewTable(app) {
  const { state } = app;
  const p = state.preview;
  const summaryToggle = h('label', { class: 'row small prev__opt' },
    h('input', { type: 'checkbox', checked: app.withSummary(), onchange: (e) => { state.withSummary = e.target.checked; state.result = null; app.render(); } }),
    'Include the “Jira Summary” sheet (one row per issue)');
  if (!p || !p.sheets.length) {
    const waiting = !app.siteOf()
      ? 'The preview needs the Jira site — fill it in on the first page.'
      : (p && !p.ok ? p.message : 'Building the preview…');
    return h('div', { class: 'prev' },
      h('div', { class: 'prev__tabs' }, h('span', { class: 'muted small', text: waiting }), summaryToggle));
  }
  const idx = Math.min(state.previewSheet, p.sheets.length - 1);
  const sheet = p.sheets[idx];
  const stale = p.signature !== app.signature();
  const emptyCount = sheet.empty.filter(Boolean).length;
  return h('div', { class: `prev${stale ? ' prev--stale' : ''}` },
    h('div', { class: 'prev__tabs' },
      ...p.sheets.map((s, i) => h('button', {
        class: `prev__tab${i === idx ? ' is-on' : ''}`,
        onclick: () => { state.previewSheet = i; app.render(); }
      }, `${s.name} · ${s.total} rows`)),
      summaryToggle),
    h('div', { class: 'prev__scroll' },
      h('table', { class: 'prev__table' },
        h('thead', {}, h('tr', {}, ...sheet.header.map((label, i) =>
          h('th', { class: sheet.empty[i] ? 'is-empty' : '' },
            h('span', { class: 'cell', title: cellText(label), text: cellText(label) }))))),
        h('tbody', {}, ...sheet.rows.map((row) => h('tr', {}, ...sheet.header.map((_, i) =>
          h('td', { class: sheet.empty[i] ? 'is-empty' : '' },
            h('span', { class: 'cell', title: rawText(row[i]), text: cellText(row[i]) })))))))),
    h('div', { class: 'prev__foot' },
      h('span', { text: `${sheet.header.length} columns · showing ${sheet.rows.length} of ${sheet.total} rows` }),
      emptyCount ? h('span', { class: 'prev__warn', text: `${emptyCount} column${emptyCount === 1 ? ' stays' : 's stay'} empty in this file` }) : null,
      stale ? h('span', { text: 'updating…' }) : null));
}
