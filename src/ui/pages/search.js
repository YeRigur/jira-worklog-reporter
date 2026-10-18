// Picking the CSV column a report column reads: suggestions, search over all
// the file's columns, and how many issues each one actually fills.
import { h, icon } from '../dom.js';
import { suggestFields, searchFields } from '../../core/suggest.js';
import { plural } from '../../core/format.js';
import { isProblem, defaultOf, usedFieldIds, pickable, currentChoice, leaveText } from '../../core/column-choice.js';

// Attach a field ('fieldId'), go without ('#skip') or go back to the column's
// own source ('#auto').
export function applyChoice(app, row, value) {
  const { state } = app;
  if (value === '#skip') { delete state.bindings[row.key]; app.skip([row.key]); }
  else if (value === '#auto') { delete state.bindings[row.key]; app.unskip(row.key); }
  else if (value) { state.bindings[row.key] = value; app.unskip(row.key); }
  app.saveBindings();
  state.result = null;
}

export function openSearch(app, ds, row, back) {
  const { state, inputs } = app;
  inputs.searchInput.value = '';
  const pick = currentChoice(state, defaultOf(app.template, ds, state.bindings, row), row);
  app.go('search', { searchFor: row.key, searchQuery: '', searchPick: pick, searchBack: back });
  requestAnimationFrame(() => inputs.searchInput.focus());
}

export function searchPage(app, ctx) {
  const { state, pageHead } = app;
  const row = ctx.rows.find((r) => r.key === state.searchFor);
  if (!row) return app.pages.main(app, ctx);
  app.searchCtx = { ...ctx, row };
  paintSearch(app);
  return [pageHead(row.label, state.searchBack),
    h('label', { class: 'tsearch' }, icon('search', 15), app.inputs.searchInput,
      h('span', { class: 'tsearch__count', text: plural(pickable(ctx.ds, []).length, 'column') })),
    app.inputs.searchBody];
}

// Only the list repaints while typing — the input keeps its focus.
export function paintSearch(app) {
  if (!app.searchCtx) return;
  const { state, actions } = app;
  const { ds, rows, row, cov } = app.searchCtx;
  const fields = pickable(ds, usedFieldIds(rows, row.key));
  const q = state.searchQuery.trim();
  const suggested = q ? [] : suggestFields(row.label, fields);
  const found = (q ? searchFields(q, fields) : fields)
    .filter((f) => !suggested.includes(f))
    .map((f) => ({ f, c: cov(f.id) }))
    .sort((a, b) => b.c.filled - a.c.filled || String(a.f.name).localeCompare(String(b.f.name)));
  const shown = found.slice(0, 60);
  const option = (value, title, sub, count, dim) => h('button', {
    class: `topt${state.searchPick === value ? ' is-sel' : ''}${dim ? ' is-dim' : ''}`,
    onclick: () => { state.searchPick = value; paintSearch(app); }
  }, h('span', { class: 'tradio' }),
  h('span', { class: 'topt__txt' }, h('span', { class: 'ton', text: title }), sub ? h('span', { class: 'tex', text: sub }) : null),
  h('span', { class: 'tcov', text: count || '' }));
  const fieldOption = ({ f, c }) => option(f.id, f.name, c.sample ? `e.g. “${c.sample}”` : 'no values for these issues', `${c.filled} of ${c.total}`, !c.filled);
  const def = defaultOf(app.template, ds, state.bindings, row);
  const escape = isProblem(def)
    ? { value: '#skip', ...leaveText(def) }
    : { value: '#auto', title: def.status === 'computed' ? 'Keep it computed' : `Keep “${def.source}”`, sub: def.status === 'computed' ? `from ${def.source}` : 'the column the CSV already has' };
  const picked = state.searchPick;
  const pickedName = picked && !picked.startsWith('#') ? (ds.model.fields.find((f) => f.id === picked)?.name || picked) : '';
  app.inputs.searchBody.replaceChildren(...[
    suggested.length ? h('div', { class: 'tgrp', text: 'Suggested' }) : null,
    suggested.length ? h('div', { class: 'tresults tresults--few' }, ...suggested.map((f) => fieldOption({ f, c: cov(f.id) }))) : null,
    h('div', { class: 'tgrp', text: q ? (shown.length ? `Matching “${q}”` : `Nothing matches “${q}”`) : 'All columns · most filled first' }),
    h('div', { class: 'tresults' }, ...shown.map(fieldOption)),
    found.length > shown.length ? h('div', { class: 'tmore', text: `${found.length - shown.length} more — type to narrow down` }) : null,
    h('div', { class: 'tgrp', text: 'Or' }),
    h('div', { class: 'tresults tresults--few' }, option(escape.value, escape.title, escape.sub, '', false)),
    actions(h('button', { class: 'tdl', disabled: !picked, onclick: () => { applyChoice(app, row, picked); app.go(state.searchBack); } },
      picked.startsWith('#') ? escape.title : (pickedName ? `Use “${pickedName}”` : 'Select a column')))
  ].filter(Boolean));
}
