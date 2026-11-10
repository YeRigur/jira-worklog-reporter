import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSettings, mergeSettings, withSettings, settingsFromExtension, publicScriptsJson, emailsIn, settingsFileName, defaultPeopleOf } from '../src/core/settings.js';

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

test('the people of a filter are read out of its JQL', () => {
  assert.deepEqual(emailsIn('worklogAuthor in (\n"A.B@x.com",\n"c.d@x.com", "a.b@x.com"\n)'), ['a.b@x.com', 'c.d@x.com']);
  assert.deepEqual(emailsIn('project = AC'), []);
});

test('the Jira site and the accounts found for emails are read, cleaned and merged', () => {
  const s = parseSettings(JSON.stringify({
    site: 'https://Acme.atlassian.net/jira/your-work',
    accounts: { 'A.B@x.com': '712020:abc', bad: 'x', 'c@x.com': '', 'd@x.com': 5 }
  }));
  assert.equal(s.site, 'acme.atlassian.net');
  assert.deepEqual(s.accounts, { 'a.b@x.com': '712020:abc' });
  const merged = mergeSettings(s, parseSettings(JSON.stringify({ accounts: { 'c@x.com': '712020:c', 'a.b@x.com': '712020:new' } })));
  assert.equal(merged.site, 'acme.atlassian.net');
  assert.deepEqual(merged.accounts, { 'a.b@x.com': '712020:new', 'c@x.com': '712020:c' });
  assert.equal(mergeSettings(s, parseSettings('{"site":"other.atlassian.net"}')).site, 'other.atlassian.net');
});

test('a settings file without a site or accounts still loads', () => {
  const s = parseSettings('{}');
  assert.equal(s.site, '');
  assert.deepEqual(s.accounts, {});
  assert.equal(parseSettings('{"site":"not a host"}').site, '');
});

test('the settings file is named after the Jira instance, without atlassian.net', () => {
  assert.equal(settingsFileName('acme.atlassian.net'), 'worklogs-settings-acme.json');
  assert.equal(settingsFileName('jira.acme.com'), 'worklogs-settings-jira.acme.com.json');
  assert.equal(settingsFileName(''), 'worklogs-settings.json');
});

test('the people ticked at first: defaultPeople, else the ones an older file’s JQL names', () => {
  const fresh = parseSettings(JSON.stringify({ roster: ['a@x.com', 'b@x.com'], defaultPeople: ['B@x.com', 'bad', 'b@x.com'] }));
  assert.deepEqual(fresh.defaultPeople, ['b@x.com']);
  assert.deepEqual(defaultPeopleOf(fresh), ['b@x.com']);
  const old = parseSettings(JSON.stringify({ roster: ['a@x.com', 'b@x.com'], jql: 'worklogAuthor in ("a@x.com")' }));
  assert.deepEqual(old.defaultPeople, []);
  assert.deepEqual(defaultPeopleOf(old), ['a@x.com']);
  assert.deepEqual(defaultPeopleOf(parseSettings('{}')), []);
});
