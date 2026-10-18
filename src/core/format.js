// How numbers and names read on the page.

// 1.25 h → "1.3", 2 h → "2".
export const hours = (seconds) => {
  const x = Math.round((seconds / 3600) * 10) / 10;
  return `${Number.isInteger(x) ? x : x.toFixed(1)}`;
};

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// "https://Site.atlassian.net/browse/X" → "site.atlassian.net".
export const cleanSite = (value) => String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

export const rawText = (value) => (value === null || value === undefined ? '' : String(value));

// Excel shows 0.666666667 where the cell holds 2/3; the page does the same,
// and keeps the full value for the hover.
export const cellText = (value) => (typeof value === 'number' && !Number.isInteger(value)
  ? String(Math.round(value * 1e6) / 1e6)
  : rawText(value));
