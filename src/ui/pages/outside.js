// Authors the filter leaves out of the Excel — and which of them may still be
// one of the team.
import { h, icon } from '../dom.js';
import { hours, plural } from '../../core/format.js';
import { outsiders } from '../../core/worklog-stats.js';

export function outsidePage(app, ctx) {
  const { ds, keep } = ctx;
  if (!keep) return app.pages.main(app, ctx);
  const { state, go, pageHead, hint, actions, doneButton } = app;
  const out = outsiders(ds, keep, { meta: app.people(ds).meta, people: state.settings.people, from: state.from, to: state.to });
  const unknown = out.filter((o) => !o.known);
  return [pageHead(`${plural(out.length, 'author')} left out`),
    hint('They logged time on issues your filter found, but they aren’t among its people, so their worklogs stay out of the Excel — as with the extension.'),
    unknown.length ? h('div', { class: 'terr', text: `${plural(unknown.length, 'of them is', 'of them are')} still unknown and could be one of your people — find them first.` }) : null,
    h('div', { class: 'tgrid tgrid--wide' }, ...out.map((o) => h('div', { class: `tres${o.known ? '' : ' is-warn'}` }, icon(o.known ? 'minus' : 'alert', 16),
      h('span', { class: 'x' }, h('b', { class: o.known ? '' : 'tkey', text: o.name }),
        h('small', { text: `${plural(o.count, 'worklog')}, ${hours(o.seconds)} h · e.g. ${[...o.issues].slice(0, 3).join(', ')}` }))))),
    actions(unknown.length ? h('button', { class: 'tdl', onclick: () => go('authors') }, 'Identify unknown authors') : doneButton(), unknown.length ? doneButton('Back') : null)];
}
