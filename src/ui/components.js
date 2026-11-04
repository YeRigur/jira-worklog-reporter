// The small parts every page of the card is built from.
import { h, icon } from './dom.js';
import { plural } from '../core/format.js';

export function createComponents(app) {
  const { state } = app;

  const go = (page, extra = {}) => { Object.assign(state, extra, { page }); app.render(); };
  const link = (text, onclick) => h('button', { class: 'tlinkbtn', onclick }, text);
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
    ? `${plural(state.settings.roster.length, 'person', 'people')} · ${plural(Object.values(state.settings.projectGroups || {}).flat().length, 'mapped project')} · ${plural(Object.keys(state.settings.teams).length, 'team assignment')}`
    : 'none on this computer yet');

  return { go, link, pageHead, hint, actions, doneButton, step, settingsNote, settingsSummary };
}
