// What is worth knowing about the dropped file itself.
import { h, icon } from '../dom.js';

export function notesPage(app, { ds }) {
  const { pageHead, actions, doneButton, warningText } = app;
  return [pageHead('About this file'),
    h('div', { class: 'tgrid tgrid--wide' }, ...ds.warnings.map((w) => h('div', { class: 'tres is-warn' }, icon('alert', 16), h('span', { class: 'x', text: warningText(w) })))),
    actions(doneButton('Got it'))];
}
