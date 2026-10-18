// Which CSV column could fill a report column the file doesn't have: names
// that look alike, how many issues carry a value, and one example. That is
// what a person needs to pick the right field out of a few hundred.

const FILLER = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'to', 'in', 'for', 'on', 'by', 'with']);

const words = (text) => String(text).toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/)
  .filter((w) => w && !FILLER.has(w))
  .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));

// "categ" and "category" are the same word to a person typing or naming.
const sameWord = (x, y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x)));

// Shared words over the longer name: 1 is the same name, 0 nothing in common.
export function similarity(a, b) {
  const A = words(a);
  const B = words(b);
  if (!A.length || !B.length) return 0;
  const shared = A.filter((x) => B.some((y) => sameWord(x, y))).length;
  return shared / Math.max(A.length, B.length);
}

export function suggestFields(label, fields, { exclude = [], limit = 3, min = 0.34 } = {}) {
  return fields
    .filter((f) => !exclude.includes(f.id))
    .map((field) => ({ field, score: similarity(label, field.name) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score || String(a.field.name).localeCompare(String(b.field.name)))
    .slice(0, limit)
    .map((x) => x.field);
}

// Any part of the name: "rate" finds "Return rate", "cause cat" finds
// "Root Cause Category".
export function searchFields(query, fields) {
  const q = String(query).trim().toLowerCase();
  if (!q) return fields;
  const parts = q.split(/\s+/);
  return fields.filter((f) => {
    const name = String(f.name).toLowerCase();
    if (name.includes(q)) return true;
    const own = name.split(/[^a-z0-9]+/).filter(Boolean);
    return parts.every((p) => own.some((w) => w.startsWith(p)));
  });
}

export function fieldCoverage(dataset, fieldId) {
  const spec = Object.hasOwn(dataset.model.specs, fieldId) ? dataset.model.specs[fieldId] : null;
  const indices = spec ? (spec.indices || Object.values(spec.parts || {})) : [];
  let filled = 0;
  let sample = '';
  for (const issue of dataset.issues) {
    const value = indices.map((i) => String(issue.row[i] ?? '').trim()).find(Boolean);
    if (!value) continue;
    filled++;
    if (!sample) sample = value;
  }
  return { filled, total: dataset.issues.length, sample };
}

