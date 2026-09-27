/* Разпознаване на вида на файла и прочитане на таблиците му.
 *
 * Видът се определя по съдържанието, а не само по разширението: програмите
 * често записват HTML или CSV с разширение .xls. */

import { isZip, openZip } from './zip.js';
import { readXlsx } from './xlsx.js';
import { readOds } from './ods.js';
import { isCfb, readXls } from './xls.js';
import { htmlCharset, looksLikeHtml, readHtml } from './html.js';
import { looksLikeSpreadsheetMl, readSpreadsheetMl } from './xml2003.js';
import { decodeText, readText } from './text.js';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 20000;
export const MAX_COLS = 80;

export const FORMAT_LABELS = {
  xlsx: 'Excel (.xlsx)',
  xls: 'Excel 97–2003 (.xls)',
  ods: 'LibreOffice (.ods)',
  html: 'HTML таблица',
  xml: 'Excel 2003 XML',
  csv: 'CSV / текст',
  paste: 'поставено от Excel',
};

/**
 * @param {Buffer} buf  съдържанието на файла
 * @param {string} filename
 * @returns {{ format, encoding?, delimiter?, sheets: [{ name, hidden, rows: string[][] }] }}
 */
export function readSpreadsheet(buf, filename = '') {
  if (!buf || !buf.length) throw new Error('Файлът е празен.');
  if (buf.length > MAX_FILE_BYTES) throw new Error('Файлът е по-голям от 20 MB.');
  let result;

  if (isZip(buf)) {
    const zip = openZip(buf);
    if (zip.has('xl/workbook.xml')) result = { format: 'xlsx', sheets: readXlsx(zip) };
    else if (zip.has('content.xml')) result = { format: 'ods', sheets: readOds(zip) };
    else if (zip.has('word/document.xml')) throw new Error('Това е документ на Word. Нужна е таблица — Excel, LibreOffice или CSV.');
    else throw new Error('Архивът не съдържа таблица на Excel или LibreOffice.');
  } else if (isCfb(buf)) {
    try {
      result = { format: 'xls', sheets: readXls(buf) };
    } catch (err) {
      if (/EncryptionInfo|парола/i.test(err.message)) throw new Error('Файлът е защитен с парола. Запишете го без парола и опитайте отново.');
      throw err;
    }
  } else {
    // Текстови видове: HTML, XML 2003 или CSV.
    const head = buf.subarray(0, 4096).toString('latin1');
    const { text, encoding } = decodeText(buf, htmlCharset(head));
    if (looksLikeSpreadsheetMl(text)) result = { format: 'xml', encoding, sheets: readSpreadsheetMl(text) };
    else if (looksLikeHtml(text)) result = { format: 'html', encoding, sheets: readHtml(text) };
    else {
      if (/\u0000/.test(text.slice(0, 2000))) throw new Error(`Файлът „${filename}“ не е таблица, която програмата може да прочете.`);
      const t = readText(text, baseName(filename));
      result = { format: 'csv', encoding, delimiter: t.delimiter, sheets: t.sheets };
    }
  }
  return limit(result);
}

/** Текст, поставен направо от Excel (колоните са разделени с табулации). */
export function readPasted(text) {
  if (!String(text || '').trim()) throw new Error('Няма поставен текст.');
  const t = readText(String(text), 'Поставено');
  return limit({ format: 'paste', delimiter: t.delimiter, sheets: t.sheets });
}

function baseName(filename) {
  return String(filename || 'Таблица').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'Таблица';
}

function limit(result) {
  const sheets = result.sheets
    .map(s => ({ ...s, rows: s.rows.slice(0, MAX_ROWS + 50).map(r => r.slice(0, MAX_COLS)) }))
    .filter(s => s.rows.some(r => r.some(v => v !== '')));
  if (!sheets.length) throw new Error('В таблицата няма данни.');
  // Редът на листовете се запазва; скритите отиват накрая.
  sheets.sort((a, b) => Number(a.hidden) - Number(b.hidden));
  return { ...result, sheets };
}
