// Worklog authors the CSV names only by an old Jira key, and the console
// script that asks Jira who they are.
import { h, icon, copyText } from '../dom.js';
import { lookupScript } from '../../core/settings.js';
import { hours, plural } from '../../core/format.js';

export function authorsPage(app, { ds }) {
  const { state, pageHead, hint, actions, doneButton, settingsNote } = app;
  const { unnamed } = app.people(ds);
  const site = app.siteOf() || 'your Jira';
  const copyScript = () => {
    const b = h('button', { class: 'tdl', onclick: async () => {
      const ok = await copyText(lookupScript(unnamed.map((u) => u.key), Object.fromEntries(unnamed.map((u) => [u.key, u.samples]))));
      b.lastChild.textContent = ok ? 'Copied — now run it in Jira' : 'Copy failed';
      setTimeout(() => { b.lastChild.textContent = 'Copy the lookup script'; }, 3000);
    } }, icon('copy', 16), h('span', { text: 'Copy the lookup script' }));
    return b;
  };
  const area = h('textarea', {
    class: 'tpaste', rows: '4', placeholder: '{ "people": { "ug:…": { "name": "…", "email": "…" } } }',
    oninput: (e) => { state.lookupText = e.target.value; }
  });
  area.value = state.lookupText;
  return [pageHead(unnamed.length ? `${plural(unnamed.length, 'author')} ${unnamed.length === 1 ? 'shows' : 'show'} as “Unknown”` : 'Every author has a name'),
    unnamed.length ? hint('Older Jira accounts: the CSV names their worklogs by an old internal key, not by the account the other columns use, so the file can’t tell who they are. Jira can — ask it once:') : null,
    unnamed.length ? h('ol', { class: 'tlookup' },
      h('li', {}, copyScript()),
      h('li', {}, 'Open ', h('b', { text: site }), ' in this browser, signed in. Press ', h('b', { text: 'F12' }), ' → ', h('b', { text: 'Console' }), ', paste, press Enter. Chrome may ask you to type “allow pasting” first.'),
      h('li', {}, 'The script copies its answer. Paste it here:', area,
        h('div', { class: 'row' }, h('button', { class: 'tbtn', onclick: app.pasteLookup }, 'Add people')))) : null,
    settingsNote(),
    unnamed.length ? h('div', { class: 'tgrid tgrid--wide' }, ...unnamed.map((u) => h('div', { class: 'tres is-warn' }, icon('alert', 16),
      h('span', { class: 'x' }, h('b', { class: 'tkey', text: u.key }),
        h('small', { text: `${plural(u.count, 'worklog')}, ${hours(u.seconds)} h · e.g. ${[...new Set(u.samples.map((s) => s.issue))].join(', ')}` }))))) : null,
    actions(doneButton(unnamed.length ? 'Later' : 'Done'))];
}
