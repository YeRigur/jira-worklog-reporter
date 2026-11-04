import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previousMonth, periodLabel } from '../src/core/period.js';

test('previous month, including year change and leap February', () => {
  assert.deepEqual(previousMonth(new Date(2026, 8, 21)), { from: '2026-08-01', to: '2026-08-31' });
  assert.deepEqual(previousMonth(new Date(2026, 0, 5)), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(previousMonth(new Date(2024, 2, 10)), { from: '2024-02-01', to: '2024-02-29' });
});


test('the period reads as a month when it is one, and as plain dates otherwise', () => {
  assert.equal(periodLabel('2026-08-01', '2026-08-31'), 'August 2026');
  assert.equal(periodLabel('2024-02-01', '2024-02-29'), 'February 2024');
  assert.equal(periodLabel('2026-08-01', '2026-08-15'), '1 – 15 Aug 2026');
  assert.equal(periodLabel('2026-07-25', '2026-08-15'), '25 Jul – 15 Aug 2026');
  assert.equal(periodLabel('2025-12-25', '2026-01-15'), '25 Dec 2025 – 15 Jan 2026');
});

test('an open end reads as one', () => {
  assert.equal(periodLabel('2026-08-01', ''), 'from 1 Aug 2026');
  assert.equal(periodLabel('', '2026-08-15'), 'until 15 Aug 2026');
  assert.equal(periodLabel('', ''), 'every worklog');
});
