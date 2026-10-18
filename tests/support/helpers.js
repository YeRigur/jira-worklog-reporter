// Test-only helpers.

const quote = (v) => (/[",\n\r;]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export const toCsv = (headers, rows) =>
  [headers, ...rows].map((r) => r.map((v) => quote(v ?? '')).join(',')).join('\n') + '\n';

export const csvFile = (name, headers, rows) => ({ name, text: toCsv(headers, rows), encoding: 'utf-8' });
