// RFC 4180 reader for Jira CSV exports. Jira quotes any cell holding a
// delimiter, quote or newline; repeated headers (Log Work, Sprint, …) are
// kept as separate columns because each one carries a value.

export function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let rowHasContent = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    rowHasContent = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      rowHasContent = true;
    } else if (ch === delimiter) {
      endField();
      rowHasContent = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
      rowHasContent = true;
    }
  }
  // A final newline leaves nothing pending; only flush a row that has content.
  if (rowHasContent || field !== '' || row.length) endRow();
  return rows;
}

export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === ',') commas++;
    else if (!inQuotes && ch === ';') semicolons++;
  }
  return semicolons > commas ? ';' : ',';
}

export function readCsvTable(text) {
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const all = parseCsv(clean, detectDelimiter(clean));
  const [headers = [], ...rest] = all;
  const rows = rest.filter((r) => r.some((cell) => cell !== ''));
  return { headers, rows };
}

// Jira writes UTF-8. A file that isn't valid UTF-8 was almost always opened
// and re-saved by Excel, which uses the Windows code page.
export function decodeCsvBytes(bytes) {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}

