import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupOf, groupNames, withProjectGroup, projectsInFile } from '../src/core/project-groups.js';

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
