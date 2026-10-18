// The period the Excel covers.
import { h } from '../dom.js';
import { previousMonth } from '../../core/period.js';

export function periodPage(app) {
  const { state, link, pageHead, hint, actions, doneButton } = app;
  const { fromInput, toInput } = app.inputs;
  return [pageHead('Reporting period'),
    hint('The filter already asked Jira for last month, but the CSV carries every worklog of those issues — older and newer ones too. This is the cut that goes to the Excel.'),
    h('div', { class: 'tdates' }, h('label', { class: 'tfield' }, 'Start date', fromInput), h('label', { class: 'tfield' }, 'End date', toInput)),
    h('div', {}, link('Reset to last month', () => {
      const last = previousMonth();
      state.from = fromInput.value = last.from;
      state.to = toInput.value = last.to;
      state.result = null;
      app.render();
    })),
    actions(doneButton())];
}
