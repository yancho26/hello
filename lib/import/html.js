/* HTML таблици — много уеб програми „изнасят в Excel“ като HTML файл с
 * разширение .xls. Всяка <table> става отделен лист. */

import { stripTags } from './xml.js';

export const looksLikeHtml = (text) => /<\s*(table|html|!doctype html)\b/i.test(text.slice(0, 4096));

export function readHtml(text) {
  const sheets = [];
  const clean = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  for (const tm of clean.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [];
    for (const rm of tm[1].matchAll(/<tr\b[^>]*>([\s\S]*?)(?=<tr\b|<\/table>|$)/gi)) {
      const cells = [];
      for (const cm of rm[1].matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)(?=<t[dh]\b|<\/tr>|$)/gi)) {
        const inner = cm[3].replace(/<\/t[dh]>[\s\S]*$/i, '').replace(/<br\s*\/?>/gi, ' ');
        const value = stripTags(inner).replace(/\s+/g, ' ').trim();
        cells.push(value);
        const span = Number((/colspan\s*=\s*["']?(\d+)/i.exec(cm[2]) || [])[1] || 1);
        for (let k = 1; k < Math.min(span, 50); k++) cells.push('');
      }
      rows.push(cells);
    }
    while (rows.length && rows[rows.length - 1].every(v => v === '')) rows.pop();
    if (rows.length) sheets.push({ name: `Таблица ${sheets.length + 1}`, hidden: false, rows });
  }
  if (!sheets.length) throw new Error('В HTML файла няма таблица.');
  return sheets;
}

/** Кодировката, обявена в <meta charset> или http-equiv. */
export function htmlCharset(head) {
  const m = /charset\s*=\s*["']?([\w-]+)/i.exec(head);
  return m ? m[1].toLowerCase() : null;
}
