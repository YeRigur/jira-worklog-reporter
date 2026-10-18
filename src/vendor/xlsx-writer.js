// lib/xlsx-writer.js — the workbook writer.
// Taken unmodified from the SimpleLife extension; only wrapped as an ES module
// so the page can call it. Do not edit by hand — update it from the extension.

export function installXlsxWriter() {
(() => {
  if (window.__SIMPLELIFE_XLSX__) return;

  const TEXT_ENCODER = new TextEncoder();
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  const toUint8 = (input) => (typeof input === 'string' ? TEXT_ENCODER.encode(input) : input);

  const crc32 = (bytes) => {
    let crc = 0 ^ -1;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  };

  const columnName = (index) => {
    let name = '';
    let n = index + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  };

  const escapeXml = (value) => {
    return String(value)
      .replace(/[&]/g, '&amp;')
      .replace(/[<]/g, '&lt;')
      .replace(/[>]/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/[']/g, '&#39;')
      .replace(/\r\n|\r/g, '\n');
  };

  const sanitizeSheetName = (name, fallback) => {
    const cleaned = (name || fallback || 'Sheet').replace(/[\\\/?*\[\]:]/g, ' ').trim();
    if (!cleaned) return fallback || 'Sheet';
    return cleaned.slice(0, 31);
  };

  const buildZip = (files) => {
    const entries = [];
    let offset = 0;

    for (const [name, content] of files) {
      const data = toUint8(content);
      const crc = crc32(data);
      const fileNameBytes = TEXT_ENCODER.encode(name);
      const localHeader = new Uint8Array(30 + fileNameBytes.length);
      const view = new DataView(localHeader.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, fileNameBytes.length, true);
      view.setUint16(28, 0, true);
      localHeader.set(fileNameBytes, 30);

      entries.push({ name, fileNameBytes, data, crc, localHeader, offset });
      offset += localHeader.length + data.length;
    }

    const centralParts = [];
    let centralSize = 0;

    for (const entry of entries) {
      const { fileNameBytes, data, crc, offset: localOffset } = entry;
      const centralHeader = new Uint8Array(46 + fileNameBytes.length);
      const view = new DataView(centralHeader.buffer);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint16(14, 0, true);
      view.setUint32(16, crc, true);
      view.setUint32(20, data.length, true);
      view.setUint32(24, data.length, true);
      view.setUint16(28, fileNameBytes.length, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, localOffset, true);
      centralHeader.set(fileNameBytes, 46);
      centralParts.push(centralHeader);
      centralSize += centralHeader.length;
    }

    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);

    const totalSize = offset + centralSize + endRecord.length;
    const out = new Uint8Array(totalSize);
    let pointer = 0;

    for (const entry of entries) {
      out.set(entry.localHeader, pointer);
      pointer += entry.localHeader.length;
      out.set(entry.data, pointer);
      pointer += entry.data.length;
    }
    for (const part of centralParts) {
      out.set(part, pointer);
      pointer += part.length;
    }
    out.set(endRecord, pointer);
    return out;
  };

  const createWorkbookBlob = (sheetSpecs) => {
    const sheets = sheetSpecs.map((sheet, idx) => ({
      name: sanitizeSheetName(sheet.name, `Sheet${idx + 1}`),
      rows: Array.isArray(sheet.rows) ? sheet.rows : []
    }));

    const sharedStrings = [];
    const sharedMap = new Map();
    const getSharedIndex = (value) => {
      if (sharedMap.has(value)) return sharedMap.get(value);
      const index = sharedStrings.length;
      sharedStrings.push(value);
      sharedMap.set(value, index);
      return index;
    };

    const sheetXmlEntries = sheets.map((sheet, sheetIdx) => {
      const rowsXml = [];
      sheet.rows.forEach((row, rowIndex) => {
        if (!Array.isArray(row)) row = [row];
        const cells = [];
        row.forEach((value, colIndex) => {
          if (value === null || value === undefined || value === '') return;
          const ref = `${columnName(colIndex)}${rowIndex + 1}`;
          if (typeof value === 'number' && Number.isFinite(value)) {
            cells.push(`<c r="${ref}"><v>${value}</v></c>`);
          } else if (typeof value === 'boolean') {
            cells.push(`<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`);
          } else {
            const idx = getSharedIndex(String(value));
            cells.push(`<c r="${ref}" t="s"><v>${idx}</v></c>`);
          }
        });
        if (cells.length === 0) return;
        rowsXml.push(`<row r="${rowIndex + 1}">${cells.join('')}</row>`);
      });

      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<sheetData>${rowsXml.join('')}</sheetData>` +
        `</worksheet>`;

      return { index: sheetIdx + 1, name: sheet.name, xml };
    });

    const sharedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xml="http://www.w3.org/XML/1998/namespace" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">` +
      sharedStrings.map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`).join('') +
      `</sst>`;

    const sheetsXml = sheetXmlEntries.map((sheet) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${sheet.index}" r:id="rId${sheet.index}"/>`).join('');

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>${sheetsXml}</sheets>` +
      `</workbook>`;

    const relationships = sheetXmlEntries.map((sheet) => `<Relationship Id="rId${sheet.index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheet.index}.xml"/>`).join('') +
      `<Relationship Id="rId${sheetXmlEntries.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
      `<Relationship Id="rId${sheetXmlEntries.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;

    const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`;

    const contentTypesOverrides = sheetXmlEntries.map((sheet) => `<Override PartName="/xl/worksheets/sheet${sheet.index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
      contentTypesOverrides +
      `</Types>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`;

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font></fonts>` +
      `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`;

    const files = new Map();
    files.set('[Content_Types].xml', contentTypesXml);
    files.set('_rels/.rels', relsXml);
    files.set('xl/workbook.xml', workbookXml);
    files.set('xl/_rels/workbook.xml.rels', workbookRelsXml);
    sheetXmlEntries.forEach((sheet) => files.set(`xl/worksheets/sheet${sheet.index}.xml`, sheet.xml));
    files.set('xl/sharedStrings.xml', sharedXml);
    files.set('xl/styles.xml', stylesXml);

    const zipBytes = buildZip(files);
    return new Blob([zipBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  const downloadBlob = (filename, blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  window.__SIMPLELIFE_XLSX__ = { createWorkbookBlob, downloadBlob };
})();

}
