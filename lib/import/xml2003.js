/* Excel 2003 XML (SpreadsheetML) — „XML таблица“, която някои програми
 * записват с разширение .xml или .xls. */

import { attrs, stripTags, tag } from './xml.js';
import { normalizeRows } from './xlsx.js';

const T = tag;

export const looksLikeSpreadsheetMl = (text) =>
  /urn:schemas-microsoft-com:office:spreadsheet/.test(text.slice(0, 4096)) && /<(?:\w+:)?Workbook\b/.test(text);

export function readSpreadsheetMl(text) {
  const sheets = [];
  const wsRe = new RegExp(`<${T('Worksheet')}\\b([^>]*)>([\\s\\S]*?)<\\/${T('Worksheet')}>`, 'g');
  for (const wm of text.matchAll(wsRe)) {
    const a = attrs(wm[1]);
    const rows = [];
    let r = 0;
    const rowRe = new RegExp(`<${T('Row')}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${T('Row')}>)`, 'g');
    for (const rm of wm[2].matchAll(rowRe)) {
      const ra = attrs(rm[1]);
      if (ra['ss:Index'] || ra.Index) r = Number(ra['ss:Index'] || ra.Index) - 1;
      const cells = [];
      let c = 0;
      const cellRe = new RegExp(`<${T('Cell')}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${T('Cell')}>)`, 'g');
      for (const cm of (rm[2] || '').matchAll(cellRe)) {
        const ca = attrs(cm[1]);
        if (ca['ss:Index'] || ca.Index) c = Number(ca['ss:Index'] || ca.Index) - 1;
        const dm = new RegExp(`<${T('Data')}\\b([^>]*)>([\\s\\S]*?)<\\/${T('Data')}>`).exec(cm[2] || '');
        if (dm) {
          const type = attrs(dm[1])['ss:Type'] || attrs(dm[1]).Type;
          const raw = stripTags(dm[2]).trim();
          cells[c] = type === 'DateTime' ? raw.slice(0, 10) : raw;
        }
        c += 1 + Number(ca['ss:MergeAcross'] || ca.MergeAcross || 0);
      }
      rows[r++] = cells;
    }
    sheets.push({ name: a['ss:Name'] || a.Name || `Лист ${sheets.length + 1}`, hidden: false, rows: normalizeRows(rows) });
  }
  if (!sheets.length) throw new Error('В XML файла няма листове.');
  return sheets;
}
