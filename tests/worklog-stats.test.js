import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worklogsByAuthor, outsiders } from '../src/core/worklog-stats.js';

const dataset = {
  names: { a: 'Person A', b: 'Person B' },
  issues: [
    { key: 'AB-1', worklogs: [
      { authorKey: 'a', localDate: '2026-08-31', seconds: 60 },
      { authorKey: 'a', localDate: '2026-09-01', seconds: 3600 },
      { authorKey: 'b', localDate: '2026-09-02', seconds: 7200 }
    ] },
    { key: 'AB-2', worklogs: [{ authorKey: 'a', localDate: '2026-09-30', seconds: 1800 }, { authorKey: 'ug:1', localDate: '2026-09-03', seconds: 900 }] }
  ]
};

test('per author: worklogs, seconds and issues inside the period only', () => {
  const by = worklogsByAuthor(dataset, '2026-09-01', '2026-09-30');
  assert.equal(by.a.count, 2);
  assert.equal(by.a.seconds, 5400);
  assert.deepEqual([...by.a.issues], ['AB-1', 'AB-2']);
  assert.equal(by.b.seconds, 7200);
});

test('outsiders: everyone not kept, biggest first, and whether anyone knows who they are', () => {
  const meta = { b: { displayName: 'Person B' } };
  const out = outsiders(dataset, new Set(['a']), { meta, from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(out.map((o) => [o.key, o.name, o.seconds, o.known]), [['b', 'Person B', 7200, true], ['ug:1', 'ug:1', 900, false]]);
  const found = outsiders(dataset, new Set(['a']), { meta, people: { 'ug:1': { name: 'Found' } }, from: '2026-09-01', to: '2026-09-30' });
  assert.equal(found[1].known, true);
});
