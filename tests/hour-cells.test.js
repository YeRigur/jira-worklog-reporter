import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoursText, hoursAsText } from '../src/core/hour-cells.js';

const sheet = (name, rows) => ({ name, rows });

test('hours: a dot and at most two decimals, whatever the reader’s locale', () => {
  assert.equal(hoursText(14.166666666666666), '14.17');
  assert.equal(hoursText(-1.8333333333333333), '-1.83');
  assert.equal(hoursText(-2.289999999999999), '-2.29');
  assert.equal(hoursText(0.25), '0.25');
  assert.equal(hoursText(0.5), '0.5');
  assert.equal(hoursText(6), '6');
  assert.equal(hoursText(-0.001), '0');
});

test('hours: what is not a number stays as it is', () => {
  assert.equal(hoursText(''), '');
  assert.equal(hoursText(null), null);
  assert.equal(hoursText('n/a'), 'n/a');
});

test('the hour columns of both sheets become text, the rest is left alone', () => {
  const summary = sheet('Jira Summary', [
    ['Issue key', 'Original estimate (hours)', 'Time Spent (hours)', 'Estimation deviation', 'Worklog hours', 'Votes'],
    ['AB-1', 16, 14.166666666666666, -1.8333333333333333, 2.5, 3],
    ['AB-2', '', 0.25, 0.25, '', 0]
  ]);
  const details = sheet('Jira Details', [
    ['Issue key', 'Worklog Hours', 'Worklog Date'],
    ['AB-1', 1.65, '2026-08-03']
  ]);
  const [s, d] = hoursAsText([summary, details]);
  assert.deepEqual(s.rows, [
    summary.rows[0],
    ['AB-1', '16', '14.17', '-1.83', '2.5', 3],
    ['AB-2', '', '0.25', '0.25', '', 0]
  ]);
  assert.deepEqual(d.rows, [details.rows[0], ['AB-1', '1.65', '2026-08-03']]);
});

test('the sheets handed in are not changed', () => {
  const rows = [['Worklog Hours'], [1.5]];
  const [out] = hoursAsText([sheet('Jira Details', rows)]);
  assert.equal(rows[1][0], 1.5);
  assert.equal(out.rows[1][0], '1.5');
});

test('a sheet without hour columns comes back as it was', () => {
  const plain = sheet('Other', [['A'], [1]]);
  assert.equal(hoursAsText([plain])[0], plain);
});
