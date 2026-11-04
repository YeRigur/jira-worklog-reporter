// How much a Jira field holds for the issues at hand: how many fill it, and
// one value to recognise it by. Read from a sample search made before the
// export, so the column pages can say "filled in 37 of 100 issues".

// A field value as it would read in a cell.
export function valueText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if (value.type === 'doc' || Array.isArray(value.content)) {
      const walk = (n) => (n && typeof n === 'object' ? (n.type === 'text' ? String(n.text || '') : (n.content || []).map(walk).join('')) : '');
      return walk(value).trim();
    }
    for (const key of ['displayName', 'name', 'value', 'key', 'text']) {
      if (value[key] !== null && value[key] !== undefined && value[key] !== '') return valueText(value[key]);
    }
  }
  return '';
}

export function fieldCoverage(issues, fieldId) {
  let filled = 0;
  let sample = '';
  for (const issue of issues) {
    const text = valueText(issue.fields?.[fieldId]);
    if (!text) continue;
    filled++;
    if (!sample) sample = text.length > 60 ? `${text.slice(0, 57)}…` : text;
  }
  return { filled, total: issues.length, sample };
}
