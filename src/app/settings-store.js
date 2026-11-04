// The settings file: roster, Teams assignments, the filter, people behind old
// Jira keys, project groups, and per site the columns attached by hand and the
// ones gone without. Kept on this computer once loaded; saved back as a file
// to pass on.
import { emptySettings, parseSettings, mergeSettings, emailsIn } from '../core/settings.js';
import { withProjectGroup } from '../core/project-groups.js';
import { plural } from '../core/format.js';
import { downloadFile } from '../ui/dom.js';

const SETTINGS_KEY = 'simplelife-worklogs-settings';
const PICKED_KEY = 'simplelife-worklogs-picked';
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
  // Builds before the settings file kept these under their own keys.
  const legacy = (key, fallback) => {
    try { return app.storage.getItem(`${key}:${siteKey()}`) || fallback; } catch { return fallback; }
  };

  const loadBindings = () => {
    const own = state.settings.sites[siteKey()];
    try { state.bindings = own ? { ...own.bindings } : JSON.parse(legacy('simplelife-worklogs-columns', '{}')); } catch { state.bindings = {}; }
  };
  const saveBindings = () => writeSite({ bindings: { ...state.bindings } });

  // Columns gone without, one by one, so next month's file asks only about a
  // column nobody has decided on yet.
  const loadSkipped = () => {
    const own = state.settings.sites[siteKey()];
    if (own) { state.skipped = [...own.skipped]; return; }
    const raw = legacy('simplelife-worklogs-ack', '');
    try { state.skipped = raw.startsWith('[') ? JSON.parse(raw) : raw.split('|').filter(Boolean); } catch { state.skipped = []; }
  };
  const saveSkipped = () => writeSite({ skipped: [...state.skipped] });
  const skip = (keys) => { state.skipped = [...new Set([...state.skipped, ...keys])]; saveSkipped(); };
  const unskip = (key) => { state.skipped = state.skipped.filter((k) => k !== key); saveSkipped(); };
  // Per-site choices follow the site: read again when the site becomes known.
  const reloadSiteChoices = () => { loadBindings(); loadSkipped(); };

  // A settings file adds to what this computer already keeps.
  const applySettings = (incoming, note) => {
    state.settings = mergeSettings(state.settings, incoming);
    keepSettings();
    if (state.dataset) reloadSiteChoices();
    state.settingsNote = { ok: true, text: note };
    state.result = null;
  };

  const loadSettingsText = (name, text) => {
    try {
      const s = parseSettings(text);
      applySettings(s, `Loaded “${name}”: ${plural(Object.values(s.projectGroups || {}).flat().length, 'mapped project')}, ${plural(s.roster.length, 'roster email')}, ${plural(Object.keys(s.teams).length, 'team assignment')}, ${plural(Object.keys(s.people).length, 'person', 'people')}.`);
    } catch (e) {
      state.settingsNote = { ok: false, text: `“${name}”: ${e.message}` };
    }
  };

  const saveSettingsFile = () => {
    const blob = new Blob([`${JSON.stringify(state.settings, null, 2)}\n`], { type: 'application/json' });
    downloadFile('worklogs-settings.json', blob);
    state.settingsNote = { ok: true, text: 'Saved worklogs-settings.json to your Downloads folder. Keep it out of shared folders — it holds people’s emails.' };
    app.render();
  };

  // What the console lookup script printed, pasted back.
  const pasteLookup = () => {
    try {
      const s = parseSettings(state.lookupText);
      const found = Object.values(s.people).filter((p) => p.name || p.email).length;
      if (!found) throw new Error('No people in it — run the script on a Jira page you are signed in to.');
      applySettings({ ...emptySettings(), people: s.people }, `Added ${plural(found, 'person', 'people')} found by Jira. Save the settings file to keep them for others.`);
      state.lookupText = '';
    } catch (e) {
      state.settingsNote = { ok: false, text: e.message };
    }
    app.render();
  };

  // The team's filter: Copy JQL hands out exactly this, and the people it
  // names are the team, so they join the roster for author emails.
  const saveJql = (text) => {
    const added = emailsIn(text).filter((e) => !state.settings.roster.includes(e));
    state.settings.jql = text;
    state.settings.roster = [...state.settings.roster, ...added];
    keepSettings();
    state.result = null;
    state.settingsNote = { ok: true, text: text ? `Filter saved${added.length ? `; ${plural(added.length, 'new email')} joined the roster` : ''}.` : 'Filter cleared — Copy JQL gives the public one.' };
    app.render();
  };

  const setGroup = (key, group) => {
    state.settings.projectGroups = withProjectGroup(state.settings.projectGroups, key, group);
    keepSettings();
    state.result = null;
  };

  const hasSettings = () => Boolean(state.settings.roster.length || Object.keys(state.settings.teams).length
    || Object.keys(state.settings.people).length || Object.keys(state.settings.projectGroups || {}).length);

  // Jira mode: who is ticked. Nobody ticked yet means the whole roster.
  const pickedEmails = () => (state.picked === null ? [...state.settings.roster] : state.settings.roster.filter((e) => state.picked.includes(e)));
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
  // Accounts found through the bridge, kept so the next run doesn't ask again.
  const rememberAccounts = (map) => {
    const fresh = Object.entries(map).filter(([email, id]) => state.settings.accounts[email] !== id);
    if (!fresh.length) return;
    state.settings.accounts = { ...state.settings.accounts, ...Object.fromEntries(fresh) };
    keepSettings();
  };

  state.settings = read();
  try {
    const kept = JSON.parse(app.storage.getItem(PICKED_KEY) || 'null');
    state.picked = Array.isArray(kept) ? kept : null;
  } catch { state.picked = null; }

  return {
    keepSettings, loadBindings, saveBindings, loadSkipped, skip, unskip, reloadSiteChoices,
    applySettings, loadSettingsText, saveSettingsFile, pasteLookup, saveJql, setGroup, hasSettings,
    pickedEmails, savePicked, pickPeople, addRosterEmail, rememberAccounts
  };
}
