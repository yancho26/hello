/* LibreOffice / OpenOffice (.ods) — OpenDocument Spreadsheet.
 * Архив с content.xml, в който е всяка таблица с редовете и клетките. */

import { attrs, decodeEntities, tag } from './xml.js';
import { normalizeRows } from './xlsx.js';

const T = tag;
const MAX_REPEAT = 5000; // празни повторени редове/колони в края могат да са милион

export function readOds(zip) {
  const xml = zip.text('content.xml');
  if (!xml) throw new Error('Липсва съдържанието на документа (content.xml).');
  const sheets = [];
  const tableRe = new RegExp(`<${T('table')}\\b([^>]*)>([\\s\\S]*?)<\\/${T('table')}>`, 'g');
  for (const tm of xml.matchAll(tableRe)) {
    const a = attrs(tm[1]);
    sheets.push({ name: a['table:name'] || a.name || `Лист ${sheets.length + 1}`, hidden: false, rows: readTable(tm[2]) });
  }
  if (!sheets.length) throw new Error('В документа няма таблици.');
  return sheets;
}

function cellText(inner) {
  let s = '';
  const pRe = new RegExp(`<${T('p')}\\b[^>]*>([\\s\\S]*?)<\\/${T('p')}>|<${T('p')}\\b[^>]*\\/>`, 'g');
  for (const pm of inner.matchAll(pRe)) {
    const body = (pm[1] || '')
      .replace(new RegExp(`<${T('s')}\\b([^>]*)\\/>`, 'g'), (_, at) => ' '.repeat(Number(attrs(at).c || 1)))
      .replace(new RegExp(`<${T('tab')}\\b[^>]*\\/>`, 'g'), '\t')
      .replace(new RegExp(`<${T('line-break')}\\b[^>]*\\/>`, 'g'), ' ')
      .replace(/<[^>]*>/g, '');
    s += (s ? ' ' : '') + decodeEntities(body);
  }
  return s;
}

function readTable(xml) {
  const rows = [];
  const rowRe = new RegExp(`<${T('table-row')}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${T('table-row')}>)`, 'g');
  const cellRe = new RegExp(`<${T('(?:covered-)?table-cell')}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${T('(?:covered-)?table-cell')}>)`, 'g');
  for (const rm of xml.matchAll(rowRe)) {
    const ra = attrs(rm[1]);
    const cells = [];
    for (const cm of (rm[2] || '').matchAll(cellRe)) {
      const ca = attrs(cm[1]);
      const repeat = Math.min(Number(ca['number-columns-repeated'] || 1), MAX_REPEAT);
      let value;
      const type = ca['office:value-type'] || ca['value-type'];
      if (type === 'date') value = (ca['office:date-value'] || ca['date-value'] || '').slice(0, 10);
      else if (type === 'float' || type === 'percentage' || type === 'currency') {
        const text = cellText(cm[2] || '');
        // Числото без форматирането (ЕГН с водеща нула се пази като текст — тогава типът е string).
        value = ca['office:value'] ?? ca.value ?? text;
      } else if (type === 'boolean') value = (ca['office:boolean-value'] || ca['boolean-value']) === 'true' ? 'да' : 'не';
      else value = cellText(cm[2] || '');
      for (let k = 0; k < repeat; k++) cells.push(String(value).trim());
    }
    while (cells.length && cells[cells.length - 1] === '') cells.pop();
    const repeatRows = Math.min(Number(ra['number-rows-repeated'] || 1), cells.length ? MAX_REPEAT : 1);
    for (let k = 0; k < repeatRows; k++) rows.push(cells);
  }
  return normalizeRows(rows);
}
