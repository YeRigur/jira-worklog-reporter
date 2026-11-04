import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupOfEmail, rosterGroups } from '../src/core/teams.js';

const SETTINGS = {
  roster: ['a@ua.x.com', 'b@br.x.com', 'c@ua.x.com', 'd@py.x.com', 'e@other.com', 'f@ua.x.com'],
  teams: { 'f@ua.x.com': { group: 'Team Special', projects: [] }, 'a@ua.x.com': { group: '', projects: [] } },
  groupByDomain: { 'ua.x.com': 'NBS Lviv', 'br.x.com': 'NBS Latam', 'py.x.com': 'NBS Latam' }
};

test('a person’s group: Teams first, then the email’s domain, else none', () => {
  assert.equal(groupOfEmail(SETTINGS, 'f@ua.x.com'), 'Team Special');
  assert.equal(groupOfEmail(SETTINGS, 'a@ua.x.com'), 'NBS Lviv', 'an empty Teams group falls back to the domain');
  assert.equal(groupOfEmail(SETTINGS, 'D@PY.x.com'), 'NBS Latam');
  assert.equal(groupOfEmail(SETTINGS, 'e@other.com'), '');
});

test('the roster in groups: the ticked people’s group first, the rest by name, no group last', () => {
  const groups = rosterGroups(SETTINGS, ['c@ua.x.com']);
  assert.deepEqual(groups, [
    { name: 'NBS Lviv', emails: ['a@ua.x.com', 'c@ua.x.com'] },
    { name: 'NBS Latam', emails: ['b@br.x.com', 'd@py.x.com'] },
    { name: 'Team Special', emails: ['f@ua.x.com'] },
    { name: '', emails: ['e@other.com'] }
  ]);
  assert.equal(rosterGroups(SETTINGS, ['b@br.x.com'])[0].name, 'NBS Latam');
});
