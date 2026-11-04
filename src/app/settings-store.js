// The settings file: the Jira site, roster, Teams assignments, the team's
// filter, the accounts found in Jira, project groups, and per site the columns
// attached by hand and the ones gone without. Kept on this computer once
// loaded; saved back as a file to pass on.
import { emptySettings, parseSettings, mergeSettings, emailsIn, settingsFileName } from '../core/settings.js';
import { withProjectGroup } from '../core/project-groups.js';
import { plural, cleanSite } from '../core/format.js';
import { downloadFile } from '../ui/dom.js';
import { freshJira } from './state.js';

const SETTINGS_KEY = 'simplelife-worklogs-settings';
const PICKED_KEY = 'simplelife-worklogs-picked';
const NAME_KEY = 'simplelife-worklogs-settings-name';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createSettingsStore(app) {
  const { state } = app;
  const siteKey = () => app.siteOf() || 'unknown';

  const read = () => {
    try { return parseSettings(app.storage.getItem(SETTINGS_KEY) || '{}'); } catch { return emptySettings(); }
  };
  // Every change bumps the revision: the workbook depends on the settings.
  const keepSettings = () => {
    state.settingsRev++;
    try { app.storage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch { /* not kept */ }
  };

  const siteSettings = () => state.settings.sites[siteKey()] || { bindings: {}, skipped: [] };
  const writeSite = (patch) => {
    state.settings.sites[siteKey()] = { ...siteSettings(), ...patch };
    keepSettings();
  };
  const loadBindings = () => { state.bindings = { ...siteSettings().bindings }; };
  const saveBindings = () => writeSite({ bindings: { ...state.bindings } });

  // Columns gone without, one by one, so next month asks only about a column
  // nobody has decided on yet.
  const loadSkipped = () => { state.skipped = [...siteSettings().skipped]; };
  const saveSkipped = () => writeSite({ skipped: [...state.skipped] });
  const skip = (keys) => { state.skipped = [...new Set([...state.skipped, ...keys])]; saveSkipped(); };
  const unskip = (key) => { state.skipped = state.skipped.filter((k) => k !== key); saveSkipped(); };
  // Per-site choices follow the site: read again when the site becomes known.
  const reloadSiteChoices = () => { loadBindings(); loadSkipped(); };

  // A settings file adds to what this computer already keeps.
  const applySettings = (incoming, note) => {
    state.settings = mergeSettings(state.settings, incoming);
    keepSettings();
    reloadSiteChoices();
    state.settingsNote = { ok: true, text: note };
    state.result = null;
  };

  const keepName = (name) => {
    state.settingsName = String(name || '');
    try { app.storage.setItem(NAME_KEY, state.settingsName); } catch { /* not kept */ }
  };

  // Another team's file on the start screen: it takes the place of the one
  // kept here — people, site and ticks start over from it.
  const replaceSettingsText = (name, text) => {
    try {
      const s = parseSettings(text);
      state.settings = s;
      keepSettings();
      keepName(name);
      state.picked = null;
      savePicked();
      state.site = '';
      if (app.inputs) app.inputs.siteInput.value = '';
      Object.assign(state, { preview: null, previewing: null, result: null, savedSig: '', savedAs: '' });
      state.jira = freshJira();
      state.projectGroup = '';
      reloadSiteChoices();
      state.settingsNote = { ok: true, text: `Switched to “${name}”: ${plural(s.roster.length, 'person', 'people')}${s.site ? ` on ${s.site}` : ''}.` };
    } catch (e) {
      state.settingsNote = { ok: false, text: `“${name}”: ${e.message}` };
    }
  };

  const loadSettingsText = (name, text) => {
    try {
      const s = parseSettings(text);
      keepName(name);
      applySettings(s, `Loaded “${name}”: ${plural(Object.values(s.projectGroups || {}).flat().length, 'mapped project')}, ${plural(s.roster.length, 'roster email')}, ${plural(Object.keys(s.teams).length, 'team assignment')}.`);
    } catch (e) {
      state.settingsNote = { ok: false, text: `“${name}”: ${e.message}` };
    }
  };

  const saveSettingsFile = () => {
    const blob = new Blob([`${JSON.stringify(state.settings, null, 2)}\n`], { type: 'application/json' });
    const name = settingsFileName(state.settings.site || cleanSite(state.site));
    downloadFile(name, blob);
    state.settingsNote = { ok: true, text: `Saved ${name} to your Downloads folder. Keep it out of shared folders — it holds people’s emails.` };
    app.render();
  };

  // The team's filter: the people it names are the team — ticked at first,
  // and on the roster.
  const saveJql = (text) => {
    const added = emailsIn(text).filter((e) => !state.settings.roster.includes(e));
    state.settings.jql = text;
    state.settings.roster = [...state.settings.roster, ...added];
    keepSettings();
    state.result = null;
    state.settingsNote = { ok: true, text: text ? `Filter saved${added.length ? `; ${plural(added.length, 'new email')} joined the roster` : ''}.` : 'Filter cleared — everyone on the roster is ticked at first.' };
    app.render();
  };

  const setGroup = (key, group) => {
    state.settings.projectGroups = withProjectGroup(state.settings.projectGroups, key, group);
    keepSettings();
    state.result = null;
  };

  const hasSettings = () => Boolean(state.settings.roster.length || Object.keys(state.settings.teams).length
    || Object.keys(state.settings.projectGroups || {}).length);

  // Jira mode: who is ticked. Until someone ticks by hand, the people the
  // team's filter names — or, without a filter, the whole roster.
  const defaultPicked = () => {
    const named = emailsIn(state.settings.jql);
    const inRoster = state.settings.roster.filter((e) => named.includes(e));
    return inRoster.length ? inRoster : [...state.settings.roster];
  };
  const pickedEmails = () => (state.picked === null ? defaultPicked() : state.settings.roster.filter((e) => state.picked.includes(e)));
  const savePicked = () => { try { app.storage.setItem(PICKED_KEY, JSON.stringify(state.picked)); } catch { /* not kept */ } };
  const pickPeople = (emails) => { state.picked = [...new Set(emails)]; savePicked(); state.result = null; app.render(); };
  const addRosterEmail = (raw) => {
    const email = String(raw || '').trim().toLowerCase();
    if (!EMAIL.test(email)) return false;
    if (!state.settings.roster.includes(email)) {
      state.settings.roster = [...state.settings.roster, email];
      keepSettings();
      state.settingsNote = { ok: true, text: `Added ${email}. Save the settings file to pass it on.` };
    }
    if (state.picked !== null && !state.picked.includes(email)) { state.picked = [...state.picked, email]; savePicked(); }
    return true;
  };
  // The Jira site typed on the page goes into the settings file too.
  const rememberSite = (raw) => {
    const site = cleanSite(raw);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(site) || state.settings.site === site) return;
    state.settings.site = site;
    keepSettings();
  };
  // Accounts found through the bridge, kept so the next run doesn't ask again.
  const rememberAccounts = (map) => {
    const fresh = Object.entries(map).filter(([email, id]) => state.settings.accounts[email] !== id);
    if (!fresh.length) return;
    state.settings.accounts = { ...state.settings.accounts, ...Object.fromEntries(fresh) };
    keepSettings();
  };

  state.settings = read();
  reloadSiteChoices();
  try { state.settingsName = app.storage.getItem(NAME_KEY) || ''; } catch { state.settingsName = ''; }
  try {
    const kept = JSON.parse(app.storage.getItem(PICKED_KEY) || 'null');
    state.picked = Array.isArray(kept) ? kept : null;
  } catch { state.picked = null; }

  return {
    keepSettings, loadBindings, saveBindings, loadSkipped, skip, unskip, reloadSiteChoices,
    applySettings, loadSettingsText, replaceSettingsText, saveSettingsFile, saveJql, setGroup, hasSettings,
    pickedEmails, savePicked, pickPeople, addRosterEmail, rememberAccounts, rememberSite
  };
}
