import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { parseSettings, mergeSettings, withSettings, settingsFromExtension, lookupScript, publicScriptsJson, emailsIn } from '../src/core/settings.js';

const EXT = {
  projectGroups: { 'Brand PGL': ['AC'] },
  rosters: { team: ['a.b@x.com', 'C.D@x.com'] },
  teams: { groups: ['Team UA'], projects: ['CX'], assignments: { 'a.b@x.com': { group: 'Team UA', projects: ['CX'] } } },
  scripts: [
    { id: 'jira-worklogs-export', settings: [{ id: 'exportFields', default: ['summary'] }] },
    { id: 'other', settings: [{ id: 'users', hint: 'mail me@x.com' }] }
  ]
};

test('the public part keeps what the export needs and no address at all', () => {
  const pub = publicScriptsJson(EXT);
  assert.deepEqual(pub.projectGroups, EXT.projectGroups);
  assert.deepEqual(pub.scripts.map((s) => s.id), ['jira-worklogs-export']);
  assert.deepEqual(pub.teams, { groups: ['Team UA'], projects: ['CX'] });
  assert.equal(pub.rosters, undefined);
  assert.doesNotMatch(JSON.stringify(pub), /@/);
});

test('the private part becomes a settings file', () => {
  const s = settingsFromExtension(EXT, 'project = AC');
  assert.equal(s.jql, 'project = AC');
  assert.deepEqual(s.roster, ['a.b@x.com', 'c.d@x.com']);
  assert.deepEqual(s.teams, { 'a.b@x.com': { group: 'Team UA', projects: ['CX'] } });
  assert.deepEqual(s.people, {});
});

test('a settings file is read leniently, and a lookup result alone counts as one', () => {
  const s = parseSettings(JSON.stringify({ roster: ['X@Y.com', 'bad'], people: { 'ug:1': { name: 'N', email: 'N@Y.com' } } }));
  assert.deepEqual(s.roster, ['x@y.com']);
  assert.deepEqual(s.people['ug:1'], { name: 'N', email: 'n@y.com', accountId: '' });
  assert.equal(s.jql, '');
  assert.deepEqual(parseSettings('{"people":{}}').sites, {});
  assert.throws(() => parseSettings('not json'), /settings/i);
  assert.throws(() => parseSettings('[1,2]'), /settings/i);
});

test('loading a second file adds to the first; the newer value wins', () => {
  const a = parseSettings(JSON.stringify({ jql: 'old', roster: ['a@x.com'], people: { k1: { name: 'A' } }, sites: { s: { bindings: { c: 'f' }, skipped: ['x'] } } }));
  const b = parseSettings(JSON.stringify({ roster: ['b@x.com'], people: { k1: { name: 'A2' }, k2: { name: 'B' } } }));
  const m = mergeSettings(a, b);
  assert.equal(m.jql, 'old');
  assert.deepEqual(m.roster, ['a@x.com', 'b@x.com']);
  assert.deepEqual(Object.keys(m.people), ['k1', 'k2']);
  assert.equal(m.people.k1.name, 'A2');
  assert.deepEqual(m.sites.s.bindings, { c: 'f' });
});

test('settings put the roster and teams back where the people code reads them', () => {
  const s = settingsFromExtension(EXT, '');
  const full = withSettings(publicScriptsJson(EXT), s);
  assert.deepEqual(full.rosters.team, ['a.b@x.com', 'c.d@x.com']);
  assert.deepEqual(full.teams.assignments, s.teams);
  assert.deepEqual(full.teams.groups, ['Team UA']);
});

test('the lookup script is valid JavaScript asking Jira for exactly these keys', () => {
  const code = lookupScript(['ug:1', 'rk:2']);
  assert.doesNotThrow(() => new vm.Script(code));
  assert.match(code, /\/rest\/api\/3\/user\/bulk\/migration/);
  assert.match(code, /"ug:1"/);
  assert.match(code, /"rk:2"/);
});

test('the lookup script turns old keys into named people and hands them over', async () => {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    const body = url.includes('bulk/migration')
      ? [{ key: 'ug:1', accountId: 'acc-1' }, { key: 'rk:2', accountId: 'acc-2' }]
      : { displayName: url.includes('acc-1') ? 'Zrazok,Taras' : 'Other,Person', emailAddress: url.includes('acc-1') ? 'taras.zrazok@x.com' : undefined };
    return { ok: true, json: async () => body };
  };
  let copied = '';
  const ctx = vm.createContext({ fetch, encodeURIComponent, JSON, Object, Set, Map, Date, Math, console: { log() {}, error() {}, table() {} }, copy: (t) => { copied = t; } });
  await vm.runInContext(lookupScript(['ug:1', 'rk:2']).replace(/;\s*$/, ''), ctx);
  assert.match(calls[0], /bulk\/migration\?key=ug%3A1&key=rk%3A2/);
  const s = parseSettings(copied);
  assert.deepEqual(s.people['ug:1'], { name: 'Zrazok,Taras', email: 'taras.zrazok@x.com', accountId: 'acc-1' });
  assert.equal(s.people['rk:2'].email, '');
});

test('the people of a filter are read out of its JQL', () => {
  assert.deepEqual(emailsIn('worklogAuthor in (\n"A.B@x.com",\n"c.d@x.com", "a.b@x.com"\n)'), ['a.b@x.com', 'c.d@x.com']);
  assert.deepEqual(emailsIn('project = AC'), []);
});

test('a key Jira can’t translate is found by its worklog: same issue, day and length', async () => {
  const fetch = async (url) => {
    if (url.includes('bulk/migration')) return { ok: true, json: async () => [] };
    if (url.includes('/user?accountId=acc-9')) return { ok: true, json: async () => ({ accountId: 'acc-9', displayName: 'Prykladnyi,Petro', emailAddress: 'petro.s@x.com' }) };
    if (url.includes('/user?')) return { ok: false, json: async () => ({}) };
    if (url.includes('/issue/AB-2782/worklog')) {
      return { ok: true, json: async () => ({ worklogs: [
        { started: '2025-10-17T07:35:00.000+0300', timeSpentSeconds: 900, author: { accountId: 'acc-9', displayName: 'Prykladnyi,Petro' } },
        { started: '2025-10-17T09:00:00.000+0300', timeSpentSeconds: 7200, author: { accountId: 'acc-1', displayName: 'Other' } }
      ] }) };
    }
    return { ok: false, json: async () => ({}) };
  };
  let copied = '';
  const ctx = vm.createContext({ fetch, encodeURIComponent, JSON, Object, Set, Map, Date, Math, console: { log() {}, error() {}, table() {} }, copy: (t) => { copied = t; } });
  await vm.runInContext(lookupScript(['bbe642be-1'], { 'bbe642be-1': [{ issue: 'AB-2782', date: '2025-10-17', seconds: 900 }] }).replace(/;\s*$/, ''), ctx);
  assert.deepEqual(parseSettings(copied).people['bbe642be-1'], { name: 'Prykladnyi,Petro', email: 'petro.s@x.com', accountId: 'acc-9' });
});
