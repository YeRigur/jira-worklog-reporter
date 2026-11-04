// The report's columns: the ones this Jira has no field for, the ones that
// came out empty, and all of them with where each comes from.
import { h, icon } from '../dom.js';
import { suggestFields } from '../../core/suggest.js';
import { periodLabel } from '../../core/period.js';
import { plural } from '../../core/format.js';
import { isProblem, defaultOf, usedFieldIds, pickable } from '../../core/column-choice.js';
import { applyChoice, openSearch } from './search.js';
import { hints } from '../../config/texts.js';

export function pickPage(app, { ds, rows, cov }) {
  const { state, go, link, pageHead, hint, actions, doneButton } = app;
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const items = state.pickKeys.map((k) => byKey.get(k)).filter(Boolean);
  const undecided = items.filter((r) => isProblem(r) && !state.skipped.includes(r.key));
  const free = pickable(ds, usedFieldIds(rows));
  const item = (r) => {
    if (undecided.includes(r)) {
      const [best] = suggestFields(r.label, free, { limit: 1 });
      const c = best ? cov(best.id) : null;
      return h('div', { class: 'tpick' },
        h('div', { class: 'tpick__name', text: r.label }),
        h('button', { class: 'tpill', onclick: () => openSearch(app, ds, r, 'pick') }, h('span', { text: 'Select a Jira field…' }), icon('down', 15)),
        best
          ? h('div', { class: 'tsugg' }, 'Suggested:',
            h('button', { class: 'tchip', onclick: () => { applyChoice(app, r, best.id); app.render(); } }, best.name),
            h('span', { text: `${c.filled} of ${c.total} issues` }))
          : h('div', { class: 'tsugg', text: hints.noSimilar }));
    }
    const bound = r.status === 'bound';
    const c = bound ? cov(r.fieldId) : null;
    return h('div', { class: `tres${bound ? ' is-ok' : ''}` },
      icon(bound ? 'link' : 'minus', 16),
      h('span', { class: 'x' }, h('b', { text: r.label }),
        h('small', { text: bound ? `← ${r.source} · ${c.filled} of ${c.total} issues` : (defaultOf(app.template, ds, state.bindings, r).fieldId ? 'left empty in the Excel' : 'left out of the Excel') })),
      link('Change', () => openSearch(app, ds, r, 'pick')));
  };
  const decided = items.length - undecided.length;
  return [pageHead('Resolve missing columns'),
    undecided.length ? hint(hints.pick) : null,
    h('div', { class: 'tgrid' }, ...items.map(item)),
    decided ? h('div', { class: 'tnote', text: hints.pickSaved(app.siteOf()) }) : null,
    undecided.length
      ? actions(
        h('button', { class: 'tdl', onclick: () => go('main') }, 'Done'),
        h('button', { class: 'tbtn', onclick: () => { app.skip(undecided.map((r) => r.key)); state.result = null; app.render(); } }, 'Leave the rest out'))
      : actions(doneButton())];
}

export function emptyPage(app, { ds, rows, empties, cov }) {
  const { state, go, link, pageHead, hint, actions } = app;
  const emptyRows = rows.filter((r) => empties.includes(r.label));
  const filled = rows
    .filter((r) => r.status === 'auto' && !empties.includes(r.label) && r.fieldId.startsWith('csv:'))
    .map((r) => ({ r, c: cov(r.fieldId) }))
    .filter((x) => x.c.filled)
    .sort((a, b) => b.c.filled - a.c.filled)
    .slice(0, 3);
  return [pageHead(`${plural(empties.length, 'column')} came out empty`),
    hint(hints.empty(periodLabel(state.from, state.to))),
    h('div', { class: 'tgrid' }, ...emptyRows.map((r) => {
      const c = r.fieldId ? cov(r.fieldId) : { filled: 0, total: 0 };
      return h('div', { class: 'tres is-warn' }, icon('alert', 16),
        h('span', { class: 'x' }, h('b', { text: r.label }),
          h('small', { text: hints.emptyRow(c.filled, c.total) }),
          h('span', { class: 'tbar' }, h('i', { style: `width:${c.total ? Math.round((100 * c.filled) / c.total) : 0}%` }))),
        link('Replace', () => openSearch(app, ds, r, 'empty')));
    })),
    filled.length ? h('div', { class: 'tnote' }, hints.emptyCompare,
      ...filled.flatMap(({ r, c }, i) => [i ? ' · ' : '', h('b', { text: r.label }), ` ${c.filled} of ${c.total}`])) : null,
    actions(h('button', { class: 'tdl', onclick: () => go('main', { emptyOk: true }) }, 'Keep them empty'))];
}

export function allPage(app, { ds, rows, empties }) {
  const { pageHead, hint, actions, doneButton } = app;
  return [pageHead(`Columns (${rows.length})`),
    hint(hints.all),
    h('div', { class: 'tcols' }, ...rows.map((r) => {
      const blank = !isProblem(r) && empties.includes(r.label);
      const tone = isProblem(r) ? 'bad' : (blank ? 'warn' : (r.status === 'empty' ? 'skip' : 'ok'));
      const src = r.status === 'computed' ? `computed from ${r.source}` : (r.status === 'empty' ? 'left out' : (isProblem(r) ? 'no field in this Jira' : r.source));
      return h('button', { class: `tcol tcol--${tone}`, onclick: () => openSearch(app, ds, r, 'all') },
        icon(tone === 'ok' ? 'check' : (tone === 'skip' ? 'minus' : 'alert'), 15),
        h('span', { class: 'x' }, h('b', { text: r.label }), h('small', { text: blank ? `${src} · empty in this export` : src })),
        icon('right', 15));
    })),
    actions(doneButton())];
}
