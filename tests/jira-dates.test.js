import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compileDatePattern, detectDatePattern, toIsoDateTime, toIsoDate
} from '../src/core/jira-dates.js';

process.env.TZ = 'Europe/Kyiv';

test('parses the default Jira Cloud format', () => {
  const p = compileDatePattern('dd/MMM/yy h:mm a');
  assert.deepEqual(p.parse('20/Feb/25 1:43 PM'),
    { year: 2025, month: 2, day: 20, hour: 13, minute: 43, second: 0 });
});

test('12 AM is midnight and 12 PM is noon', () => {
  const p = compileDatePattern('dd/MMM/yy h:mm a');
  assert.equal(p.parse('05/Aug/26 12:05 AM').hour, 0);
  assert.equal(p.parse('05/Aug/26 12:30 PM').hour, 12);
});

test('single-digit day and lower-case month and meridiem are accepted', () => {
  const p = compileDatePattern('dd/MMM/yy h:mm a');
  assert.deepEqual(p.parse('5/feb/25 9:07 am'),
    { year: 2025, month: 2, day: 5, hour: 9, minute: 7, second: 0 });
});

test('values that do not fit the pattern or the calendar are rejected', () => {
  const p = compileDatePattern('dd/MMM/yy h:mm a');
  assert.equal(p.parse('2025-02-20 13:43'), null);
  assert.equal(p.parse('20/Foo/25 1:43 PM'), null);
  assert.equal(p.parse('31/Feb/25 1:43 PM'), null);
  assert.equal(p.parse('20/Feb/25 13:43 PM'), null);
});

test('24-hour ISO-like values', () => {
  const p = compileDatePattern('yyyy-MM-dd HH:mm');
  assert.deepEqual(p.parse('2025-02-20 13:43'),
    { year: 2025, month: 2, day: 20, hour: 13, minute: 43, second: 0 });
});

test('detects the Jira Cloud default pattern', () => {
  assert.equal(detectDatePattern(['20/Feb/25 1:43 PM', '03/Mar/25 10:05 AM']), 'dd/MMM/yy h:mm a');
});

test('detects an ISO-like pattern', () => {
  assert.equal(detectDatePattern(['2025-02-20 13:43', '2025-03-01 09:00']), 'yyyy-MM-dd HH:mm');
});

test('a day above 12 settles day-first numeric dates', () => {
  assert.equal(detectDatePattern(['20/02/2025 13:43', '03/03/2025 09:00']), 'dd/MM/yyyy HH:mm');
});

test('a day above 12 in second position settles month-first dates', () => {
  assert.equal(detectDatePattern(['02/20/2025 1:43 PM']), 'MM/dd/yyyy h:mm a');
});

test('no pattern is returned when a sample does not parse', () => {
  assert.equal(detectDatePattern(['20/Feb/25 1:43 PM', 'garbage']), null);
});

test('empty samples are ignored, but all-empty input detects nothing', () => {
  assert.equal(detectDatePattern(['', '20/Feb/25 1:43 PM', '  ']), 'dd/MMM/yy h:mm a');
  assert.equal(detectDatePattern(['', ' ']), null);
});

test('ISO datetime carries the local offset for that date, across DST', () => {
  assert.equal(toIsoDateTime({ year: 2025, month: 2, day: 20, hour: 13, minute: 43, second: 0 }),
    '2025-02-20T13:43:00.000+0200');
  assert.equal(toIsoDateTime({ year: 2026, month: 8, day: 4, hour: 10, minute: 0, second: 0 }),
    '2026-08-04T10:00:00.000+0300');
});

test('ISO date is zero-padded', () => {
  assert.equal(toIsoDate({ year: 2025, month: 2, day: 6, hour: 0, minute: 0, second: 0 }), '2025-02-06');
});
