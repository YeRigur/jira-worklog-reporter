// The settings file: the Jira site, roster, Teams assignments, the team's
// filter, the accounts found in Jira, project groups, and per site the columns
// attached by hand and the ones gone without. Kept on this computer once
// loaded; saved back as a file to pass on.
import { emptySettings, parseSettings, settingsFileName, defaultPeopleOf } from '../core/settings.js';
import { withProjectGroup } from '../core/project-groups.js';
import { plural, cleanSite } from '../core/format.js';
import { downloadFile } from '../ui/dom.js';
import { freshJira } from './state.js';
import { messages } from '../config/texts.js';

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

  const keepName = (name) => {
    state.settingsName = String(name || '');
    try { app.storage.setItem(NAME_KEY, state.settingsName); } catch { /* not kept */ }
  };

  // A settings file takes the place of the one kept here — always: people,
  // site, ticks, columns and whatever the last run read from Jira start over.
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
      Object.assign(state, { wizStep: 0, openGroups: [], progress: '', progressPct: 0, page: state.page === 'settings' ? 'settings' : 'main' });
      app.jira?.reset();
      reloadSiteChoices();
      state.settingsNote = { ok: true, text: messages.switched(name, plural(s.roster.length, 'person', 'people'), s.site) };
    } catch (e) {
      state.settingsNote = { ok: false, text: messages.unreadable(name, e.message) };
    }
  };


  const saveSettingsFile = () => {
    const blob = new Blob([`${JSON.stringify(state.settings, null, 2)}\n`], { type: 'application/json' });
    const name = settingsFileName(state.settings.site || cleanSite(state.site));
    downloadFile(name, blob);
    state.settingsNote = { ok: true, text: messages.savedSettings(name) };
    app.render();
  };

  // ---------- the Settings form: plain edits, each kept at once ----------

  const lowerTrim = (v) => String(v || '').trim().toLowerCase();
  const changed = () => { keepSettings(); state.result = null; app.render(); };

  // Ticked at first on the export page. Saving it this way drops an older
  // file's JQL, which only ever served for this.
  const setDefaultPerson = (email, on) => {
    const now = defaultPeopleOf(state.settings).filter((e) => state.settings.roster.includes(e));
    state.settings.defaultPeople = on ? [...new Set([...now, email])] : now.filter((e) => e !== email);
    state.settings.jql = '';
    changed();
  };

  // A person's group, by hand (Teams); empty falls back to the email's domain.
  const setPersonGroup = (email, raw) => {
    const group = String(raw || '').trim();
    const own = state.settings.teams[email] || { group: '', projects: [] };
    if (!group && !own.projects.length) delete state.settings.teams[email];
    else state.settings.teams[email] = { ...own, group };
    changed();
  };

  const removePerson = (email) => {
    const s = state.settings;
    s.roster = s.roster.filter((e) => e !== email);
    s.defaultPeople = (s.defaultPeople || []).filter((e) => e !== email);
    delete s.teams[email];
    delete s.accounts[email];
    if (state.picked) { state.picked = state.picked.filter((e) => e !== email); savePicked(); }
    changed();
  };

  // Email domain → group: [domain, group] pairs, edited in place.
  const domainRows = () => Object.entries(state.settings.groupByDomain || {});
  const setDomains = (rows) => {
    state.settings.groupByDomain = Object.fromEntries(rows
      .map(([d, g]) => [lowerTrim(d).replace(/^@/, ''), String(g || '').trim()])
      .filter(([d]) => d));
    changed();
  };
  const setDomain = (i, domain, group) => { const rows = domainRows(); rows[i] = [domain, group]; setDomains(rows); };
  const addDomain = () => { setDomains([...domainRows(), ['new-domain.com', '']]); };
  const removeDomain = (i) => { setDomains(domainRows().filter((_, k) => k !== i)); };

  // Project group → project keys: [name, keys] pairs; keys typed with commas.
  const projectRows = () => Object.entries(state.settings.projectGroups || {});
  const setProjectRows = (rows) => {
    const out = {};
    for (const [name, keys] of rows) {
      const n = String(name || '').trim();
      if (!n) continue;
      const list = (Array.isArray(keys) ? keys : String(keys || '').split(/[\s,;]+/))
        .map((k) => String(k).trim().toUpperCase()).filter(Boolean);
      out[n] = [...new Set([...(out[n] || []), ...list])];
    }
    state.settings.projectGroups = out;
    if (state.projectGroup && !out[state.projectGroup]) state.projectGroup = '';
    changed();
  };
  const setProjectGroup = (i, name, keys) => { const rows = projectRows(); rows[i] = [name, keys]; setProjectRows(rows); };
  const addProjectGroup = () => { const n = projectRows().length + 1; setProjectRows([...projectRows(), [`Group ${n}`, []]]); };
  const removeProjectGroup = (i) => { setProjectRows(projectRows().filter((_, k) => k !== i)); };

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
    const named = defaultPeopleOf(state.settings);
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
      state.settingsNote = { ok: true, text: messages.emailAdded(email) };
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
    replaceSettingsText, saveSettingsFile, setGroup, hasSettings,
    setDefaultPerson, setPersonGroup, removePerson, setDomain, addDomain, removeDomain, setProjectGroup, addProjectGroup, removeProjectGroup,
    pickedEmails, savePicked, pickPeople, addRosterEmail, rememberAccounts, rememberSite
  };
}
