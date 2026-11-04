// Inputs that outlive a redraw: the card is rebuilt on every change, but a
// field someone is typing in must keep its value and focus.
import { h } from './dom.js';

export function createInputs(app) {
  const { state } = app;
  return {
    fromInput: h('input', { type: 'date', value: state.from, onchange: (e) => { state.from = e.target.value; state.result = null; app.render(); } }),
    toInput: h('input', { type: 'date', value: state.to, onchange: (e) => { state.to = e.target.value; state.result = null; app.render(); } }),
    siteInput: h('input', {
      type: 'text', value: state.site, placeholder: 'your-site.atlassian.net',
      oninput: (e) => { state.site = e.target.value; },
      // The site goes into the settings file, and its columns come with it.
      onchange: () => {
        app.rememberSite(state.site);
        app.reloadSiteChoices();
        state.result = null;
        app.render();
      }
    }),
    // type=text with an email keyboard: password managers leave it alone.
    emailInput: h('input', { type: 'text', inputmode: 'email', placeholder: 'name@company.com', autocomplete: 'off', 'data-1p-ignore': 'true', 'data-lpignore': 'true', 'aria-label': 'Email to add' }),
    jqlInput: h('textarea', { class: 'tpaste tjql', rows: '6', placeholder: 'worklogDate >= startOfMonth(-1) AND worklogDate < startOfMonth() AND worklogAuthor in ("…")' }),
    searchInput: h('input', {
      type: 'search', class: 'tsearch__input', placeholder: 'Search Jira fields', autocomplete: 'off',
      oninput: (e) => { state.searchQuery = e.target.value; app.paintSearch(); }
    }),
    searchBody: h('div', { class: 'tsearch__body' })
  };
}
