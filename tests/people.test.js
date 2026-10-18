import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorsIn,
  parseDisplayName, matchEmailByName, candidateEmails, authorMetadata
} from '../src/core/people.js';

const SCRIPTS_JSON = {
  rosters: { team: ['Olena.Testenko@ua.example.com', 'joao.silva@br.example.com'] },
  teams: { assignments: { 'olena.testenko@ua.example.com': { group: 'Team UA', projects: ['Brand B2C'] }, 'new.person@py.example.com': { group: 'Team LatAm', projects: [] } } }
};

test('corporate display names give location and department', () => {
  assert.deepEqual(parseDisplayName('Zrazok,Hanna,UA-Kyiv,Website Services'), { location: 'UA-Kyiv', department: 'Website Services' });
  assert.deepEqual(parseDisplayName('Zrazok, Hanna, UA-Kyiv, Web, Team 2'), { location: 'UA-Kyiv', department: 'Web, Team 2' });
  assert.deepEqual(parseDisplayName('Hanna Zrazok'), { location: '', department: '' });
});

test('an email matches the one name holding all its tokens', () => {
  const emails = ['olena.testenko@ua.example.com', 'carlos.exemplo2@br.example.com', 'jose.silva@br.example.com'];
  assert.equal(matchEmailByName('Testenko,Olena,UA-Kyiv,Web', emails), 'olena.testenko@ua.example.com');
  assert.equal(matchEmailByName('Exemplo,Carlos,BR-Sao Paulo,Digital', emails), 'carlos.exemplo2@br.example.com');
  assert.equal(matchEmailByName('Silva,José,BR-Sao Paulo,Digital', emails), 'jose.silva@br.example.com');
  assert.equal(matchEmailByName('Kovalenko,Olena,UA-Kyiv,Web', emails), '');
  assert.equal(matchEmailByName('Silva,Jose,BR,Digital', ['jose.silva@br.example.com', 'jose.silva@py.example.com']), '');
});

test('candidate emails: roster plus team assignments, lower-cased, once', () => {
  assert.deepEqual(candidateEmails(SCRIPTS_JSON).sort(),
    ['joao.silva@br.example.com', 'new.person@py.example.com', 'olena.testenko@ua.example.com']);
});

const dataset = {
  authors: {
    '712020:a': { count: 2, seconds: 9000, samples: [{ issue: 'AC-1', date: '2026-08-04', seconds: 7200 }] },
    '712020:c': { count: 1, seconds: 1800, samples: [] },
    '712020:k': { count: 1, seconds: 60, samples: [] },
    '712020:x': { count: 1, seconds: 60, samples: [] },
    'ug:bbbbbbbb-0000-4000': { count: 3, seconds: 10800, samples: [{ issue: 'VC-2', date: '2026-08-08', seconds: 3600 }] }
  },
  names: {
    '712020:a': 'Testenko,Olena,UA-Kyiv,Website Services',
    '712020:c': 'Silva,Joao,BR-Sao Paulo,Digital',
    '712020:k': 'Prykladna,Kateryna,UA-Kyiv,Website Services',
    '712020:x': 'Other,Person,CH-Bern,Marketing'
  }
};

test('roster people get their email, and their Teams group and projects', () => {
  const { meta } = authorMetadata(dataset, SCRIPTS_JSON);
  assert.deepEqual(meta['712020:a'], {
    displayName: 'Testenko,Olena,UA-Kyiv,Website Services', email: 'olena.testenko@ua.example.com', domain: 'ua.example.com',
    jobTitle: '', department: 'Website Services', location: 'UA-Kyiv', teamGroup: 'Team UA', teamProjects: ['Brand B2C']
  });
  // In the roster, no Teams assignment: the export derives the group from the email domain.
  assert.equal(meta['712020:c'].email, 'joao.silva@br.example.com');
  assert.equal(meta['712020:c'].teamGroup, '');
});

test('without an email, the group comes from the location in the name, through the settings\' groupByDomain', () => {
  const withDomains = { ...SCRIPTS_JSON, groupByDomain: { 'ua.example.com': 'Team UA', 'br.example.com': 'Team LatAm' } };
  const { meta } = authorMetadata(dataset, withDomains);
  assert.equal(meta['712020:k'].email, '');
  assert.equal(meta['712020:k'].teamGroup, 'Team UA');
  assert.equal(meta['712020:x'].teamGroup, '');
});

test('without groupByDomain in the settings, the code knows no group of its own', () => {
  const { meta } = authorMetadata(dataset, SCRIPTS_JSON);
  assert.equal(meta['712020:k'].teamGroup, '');
});

test('authors with no name are labelled by their key and listed', () => {
  const { meta, unnamed } = authorMetadata(dataset, SCRIPTS_JSON);
  assert.equal(meta['ug:bbbbbbbb-0000-4000'].displayName, 'Unknown · ug:bbbbbbbb…');
  assert.deepEqual(unnamed.map((u) => [u.key, u.count, u.seconds]), [['ug:bbbbbbbb-0000-4000', 3, 10800]]);
});

test('people found through Jira get their name, email and team, and are no longer unknown', () => {
  const known = {
    'ug:bbbbbbbb-0000-4000': { name: 'Testenko,Olena,UA-Kyiv,Website Services', email: '', accountId: '712020:z' },
    '712020:k': { name: '', email: 'kateryna.prykladna@ua.example.com', accountId: '' }
  };
  const { meta, unnamed } = authorMetadata(dataset, SCRIPTS_JSON, known);
  // The same person as 712020:a — old worklogs under the old key, new ones under the new: both get her email.
  assert.equal(meta['ug:bbbbbbbb-0000-4000'].displayName, 'Testenko,Olena,UA-Kyiv,Website Services');
  assert.equal(meta['ug:bbbbbbbb-0000-4000'].email, 'olena.testenko@ua.example.com');
  assert.equal(meta['712020:a'].email, 'olena.testenko@ua.example.com');
  assert.deepEqual(unnamed, []);
  // An email Jira gave is taken as is; with an email, the export derives the group from its domain.
  assert.equal(meta['712020:k'].email, 'kateryna.prykladna@ua.example.com');
  assert.equal(meta['712020:k'].domain, 'ua.example.com');
});

test('an email Jira gave wins over the roster guess', () => {
  const known = { 'ug:bbbbbbbb-0000-4000': { name: 'New,Person,UA-Kyiv', email: 'new.person@ua.example.com', accountId: 'x' } };
  const { meta } = authorMetadata(dataset, SCRIPTS_JSON, known);
  assert.equal(meta['ug:bbbbbbbb-0000-4000'].email, 'new.person@ua.example.com');
  assert.equal(meta['ug:bbbbbbbb-0000-4000'].displayName, 'New,Person,UA-Kyiv');
});

test('the filter keeps the authors whose email it names, and only them', () => {
  const meta = { a: { email: 'Olena.T@x.com' }, b: { email: 'other@x.com' }, c: { email: '' } };
  assert.deepEqual(authorsIn(meta, ['olena.t@x.com', 'nobody@x.com']), ['a']);
  assert.deepEqual(authorsIn(meta, []), ['a', 'b', 'c']);
});
