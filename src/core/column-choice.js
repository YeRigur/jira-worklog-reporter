// Choosing where a report column comes from: what it would be on its own,
// which fields are free to pick, and what is chosen now.
import { resolveTemplate } from './template.js';

export const isProblem = (row) => row.status === 'missing' || row.status === 'taken';
export const problemsOf = (rows) => rows.filter(isProblem);

// A problem is settled once someone attached a column or chose to go without.
export const settled = (problems, skipped) => problems.every((p) => skipped.includes(p.key));

// A report column's own behaviour, without what was attached to it by hand.
export function defaultOf(template, dataset, bindings, row) {
  const rest = { ...bindings };
  delete rest[row.key];
  return resolveTemplate(template, dataset, rest).find((r) => r.key === row.key) || row;
}

// Fields other report columns already read — a field can't be picked twice.
export const usedFieldIds = (rows, except) => rows
  .filter((r) => r.key !== except && (r.status === 'auto' || r.status === 'bound') && r.fieldId)
  .map((r) => r.fieldId);

// The worklogs themselves are not a column — every issue has them, so they
// would top every list.
export const pickable = (dataset, used) => dataset.model.fields.filter((f) => !used.includes(f.id) && f.name !== 'Log Work');

// What a column reads now: a field id, '#skip' (gone without) or '#auto' (its
// own source); '' while undecided.
export function currentChoice({ bindings, skipped }, defaultRow, row) {
  if (Object.hasOwn(bindings, row.key)) return bindings[row.key] === '' ? '#skip' : bindings[row.key];
  if (skipped.includes(row.key)) return '#skip';
  return isProblem(defaultRow) ? '' : '#auto';
}

// Going without a column does what the extension does, and says which.
export const leaveText = (defaultRow) => (defaultRow.fieldId
  ? { title: 'Leave it empty', sub: 'the Excel keeps the column, with nothing in it' }
  : { title: 'Leave it out', sub: 'the Excel won’t have it — as with the extension' });
