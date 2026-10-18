// The small parts every page of the card is built from.
import { h, icon, copyText } from './dom.js';
import { plural } from '../core/format.js';

export function createComponents(app) {
  const { state } = app;

  const go = (page, extra = {}) => { Object.assign(state, extra, { page }); app.render(); };
  const link = (text, onclick) => h('button', { class: 'tlinkbtn', onclick }, text);
  const factRow = (tone, iconName, text, action) => h('div', { class: `trow trow--${tone}` },
    icon(iconName, 16), h('span', { class: 'x' }, text), action || null);
  const pageHead = (title, back = 'main') => h('div', { class: 'thead' },
    h('button', { class: 'tback', 'aria-label': 'Back', onclick: () => go(back) }, icon('back', 16)),
    h('div', { class: 'ttitle', text: title }));
  const hint = (text) => h('div', { class: 'thint', text });
  const actions = (...buttons) => h('div', { class: 'tactions' }, ...buttons);
  const doneButton = (label = 'Done') => h('button', { class: 'tdl', onclick: () => go('main') }, label);
  const step = (n, ...text) => h('div', { class: 'tstep' },
    h('span', { class: 'tstep__n', text: String(n) }), h('div', { class: 'tstep__t' }, ...text));

  // The last thing the settings said (loaded, saved, failed).
  const settingsNote = () => (state.settingsNote
    ? h('div', { class: state.settingsNote.ok ? 'tok' : 'terr', text: state.settingsNote.text })
    : null);
  const settingsSummary = () => (app.hasSettings()
    ? `${plural(Object.values(state.settings.projectGroups || {}).flat().length, 'mapped project')} · ${plural(state.settings.roster.length, 'roster email')} · ${plural(Object.keys(state.settings.teams).length, 'team assignment')} · ${plural(Object.keys(state.settings.people).length, 'person', 'people')} identified in Jira`
    : 'none on this computer yet');

  const copyJql = () => {
    const b = h('button', { class: 'tchip', onclick: async () => {
      const ok = await copyText(app.teamJql());
      b.textContent = ok ? 'Copied to clipboard' : 'Copy failed — use “Show JQL”';
      setTimeout(() => { b.textContent = 'Copy JQL'; }, 2500);
    } }, 'Copy JQL');
    return b;
  };

  const warningText = (w) => ({
    truncated: `“${w.file}” has exactly ${w.rows} issues — Jira may have cut the export short. Export smaller date ranges and drop all the files together.`,
    encoding: `“${w.file}” looks re-saved by Excel. If names look wrong, export it from Jira again and drop it here without opening it.`,
    'bad-worklog': `${w.count} worklog entries couldn’t be read and were skipped.`
  })[w.code] || '';

  return { go, link, factRow, pageHead, hint, actions, doneButton, step, settingsNote, settingsSummary, copyJql, warningText };
}
