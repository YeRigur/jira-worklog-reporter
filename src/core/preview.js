// What the workbook will look like. The extension hands its sheets to the xlsx
// writer as { name, rows } with the header first; the page intercepts them, so
// the preview is the file itself, not a second rendering of the data.

const blank = (v) => v === '' || v === undefined || v === null;

export function buildPreview(sheets, { rows = 8 } = {}) {
  return (sheets || []).map((sheet) => {
    const [header = [], ...body] = sheet.rows || [];
    return {
      name: sheet.name,
      header,
      rows: body.slice(0, rows),
      total: body.length,
      // A column nobody filled — the Excel would ship it empty. With no rows
      // at all there is nothing to blame yet.
      empty: header.map((_, i) => body.length > 0 && body.every((row) => blank(row[i])))
    };
  });
}

// Columns that reached the file with nothing in them, by header. A column the
// CSV has but nobody filled in Jira looks exactly like a column the CSV hasn't
// got — except the page can only tell the difference here, after the run.
// A header that carries a value on any sheet doesn't count.
export function emptyColumns(preview) {
  const empty = new Map();
  for (const sheet of preview) {
    sheet.header.forEach((label, i) => {
      const name = String(label);
      const blank = Boolean(sheet.empty[i]);
      empty.set(name, empty.has(name) ? empty.get(name) && blank : blank);
    });
  }
  return [...empty].filter(([, blank]) => blank).map(([name]) => name);
}

