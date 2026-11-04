// Hours go to the Excel as text — "14.17", not the number 14.1666… Excel
// shows a number with the reader's own decimal separator, so the same file
// read "14,17" on one desk and "14.17" on another. Text reads the same
// everywhere; the price is that SUM skips these cells.

const HOUR_COLUMNS = new Set([
  'original estimate (hours)',
  'time spent (hours)',
  'estimation deviation',
  'worklog hours'
]);

// 14.1666… → "14.17", 6 → "6", 0.5 → "0.5". Anything else stays as it is.
export const hoursText = (value) => (typeof value === 'number' && Number.isFinite(value)
  ? String(Number(value.toFixed(2)) || 0)
  : value);

// The sheets as the extension hands them to the writer — { name, rows } with
// the header first — with the hour columns turned into text. Labels are
// matched without case: Details says "Worklog Hours", Summary "Worklog hours".
export function hoursAsText(sheets) {
  return (sheets || []).map((sheet) => {
    const [header = [], ...body] = sheet.rows || [];
    const at = header.flatMap((label, i) => (HOUR_COLUMNS.has(String(label).trim().toLowerCase()) ? [i] : []));
    if (!at.length) return sheet;
    const rows = body.map((row) => {
      const out = row.slice();
      for (const i of at) out[i] = hoursText(out[i]);
      return out;
    });
    return { ...sheet, rows: [header, ...rows] };
  });
}
