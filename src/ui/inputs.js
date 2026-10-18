// Inputs that outlive a redraw: the card is rebuilt on every change, but a
// field someone is typing in must keep its value and focus.
import { h } from './dom.js';

export function createInputs(app) {
  const { state } = app;
  return {
    jqlBox: h('pre', { class: 'jql hidden', text: app.publicJql }),
    fromInput: h('input', { type: 'date', value: state.from, onchange: (e) => { state.from = e.target.value; state.result = null; app.render(); } }),
    toInput: h('input', { type: 'date', value: state.to, onchange: (e) => { state.to = e.target.value; state.result = null; app.render(); } }),
    siteInput: h('input', {
      type: 'text', value: state.site, placeholder: 'your-site.atlassian.net',
      oninput: (e) => { state.site = e.target.value; },
      // Attachments are kept per site, and the site is known only now.
      onchange: () => {
        if (!Object.keys(state.bindings).length) app.loadBindings();
        if (!state.skipped.length) app.loadSkipped();
        state.result = null;
        app.render();
      }
    }),
    jqlInput: h('textarea', { class: 'tpaste tjql', rows: '8', placeholder: 'worklogDate >= startOfMonth(-1) AND worklogDate < startOfMonth() AND worklogAuthor in ("…")' }),
    searchInput: h('input', {
      type: 'search', class: 'tsearch__input', placeholder: 'Search columns in this file', autocomplete: 'off',
      oninput: (e) => { state.searchQuery = e.target.value; app.paintSearch(); }
    }),
    searchBody: h('div', { class: 'tsearch__body' })
  };
}
