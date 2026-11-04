import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupOf, groupNames, withProjectGroup, projectsInFile, projectsFromSearch } from '../src/core/project-groups.js';

const GROUPS = { 'Group B': ['XY'], 'Group A': ['AB', 'CD'] };

test('a project\'s group, by key in any case', () => {
  assert.equal(groupOf(GROUPS, 'cd'), 'Group A');
  assert.equal(groupOf(GROUPS, 'ZZ'), '');
  assert.equal(groupOf(undefined, 'AB'), '');
  assert.deepEqual(groupNames(GROUPS), ['Group A', 'Group B']);
});

test('moving a project between groups leaves no empty group and no duplicate', () => {
  assert.deepEqual(withProjectGroup(GROUPS, 'xy', 'Group A'), { 'Group A': ['AB', 'CD', 'XY'] });
  assert.deepEqual(withProjectGroup(GROUPS, 'AB', 'New'), { 'Group B': ['XY'], 'Group A': ['CD'], New: ['AB'] });
  assert.deepEqual(withProjectGroup(GROUPS, 'AB', ''), { 'Group B': ['XY'], 'Group A': ['CD'] });
  assert.equal(withProjectGroup(GROUPS, ' ', 'Group A'), GROUPS);
  assert.deepEqual(GROUPS, { 'Group B': ['XY'], 'Group A': ['AB', 'CD'] }, 'input untouched');
});

test('the file\'s projects, biggest first', () => {
  const ds = {
    projects: [{ key: 'ab', name: 'Alpha' }, { key: 'XY', name: 'Xylo' }, { key: 'CD', name: 'Code' }],
    issues: [{ projectKey: 'XY' }, { projectKey: 'AB' }, { projectKey: 'XY' }]
  };
  assert.deepEqual(projectsInFile(ds), [
    { key: 'XY', name: 'Xylo', issues: 2 }, { key: 'AB', name: 'Alpha', issues: 1 }, { key: 'CD', name: 'Code', issues: 0 }
  ]);
});

test('projects come from the issues Jira’s search returned', () => {
  const entries = [
    { method: 'POST', url: '/rest/api/3/search/jql', text: JSON.stringify({ issues: [
      { key: 'AC-1', fields: { project: { key: 'AC', name: 'Alpha Care' } } },
      { key: 'vc-2', fields: { project: { key: 'vc', name: 'Vet' } } },
      { key: 'AC-3', fields: { summary: 'no project field' } }] }) },
    { method: 'POST', url: '/rest/api/3/search/jql', text: JSON.stringify({ issues: [{ key: 'AC-1', fields: { project: { key: 'AC', name: 'Alpha Care' } } }] }) },
    { method: 'GET', url: 'https://acme.atlassian.net/rest/api/3/issue/AC-1/worklog', text: '{"worklogs":[]}' },
    { method: 'POST', url: '/rest/api/3/search/jql', text: 'not json' }
  ];
  const seen = projectsFromSearch(entries);
  assert.deepEqual(seen.projects, [{ key: 'AC', name: 'Alpha Care' }, { key: 'VC', name: 'Vet' }]);
  assert.deepEqual(projectsInFile(seen).map((p) => [p.key, p.issues]), [['AC', 1], ['VC', 1]]);
});
