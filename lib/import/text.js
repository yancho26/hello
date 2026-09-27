/* Текстови таблици: CSV, TXT и поставено от Excel (разделено с табулации).
 * Кодировката се разпознава сама: UTF-8 (със или без BOM), UTF-16 или
 * Windows-1251 — стандартната кирилска кодировка на по-старите програми. */

/** Текст от байтове с разпознаване на кодировката. */
export function decodeText(buf, declared = null) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString('utf8'), encoding: 'UTF-8' };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: buf.subarray(2).toString('utf16le'), encoding: 'UTF-16' };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return { text: swapped.toString('utf16le'), encoding: 'UTF-16' };
  }
  // UTF-16 без BOM: всеки втори байт е нула при латиница.
  if (buf.length >= 4 && buf[1] === 0 && buf[3] === 0 && buf[0] !== 0) {
    return { text: buf.toString('utf16le'), encoding: 'UTF-16' };
  }
  if (declared && /1251|cp-?1251|windows-1251/i.test(declared)) {
    return { text: new TextDecoder('windows-1251').decode(buf), encoding: 'Windows-1251' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('windows-1251').decode(buf), encoding: 'Windows-1251' };
  }
}

const DELIMITERS = [';', ',', '\t', '|'];

/** Кой разделител е най-вероятен — този, който дава еднакъв брой колони. */
export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 30);
  if (!lines.length) return ';';
  let best = ';', bestScore = -1;
  for (const d of DELIMITERS) {
    const counts = lines.map(l => splitLine(l, d).length);
    const most = mode(counts);
    if (most < 2) continue;
    const consistent = counts.filter(c => c === most).length / counts.length;
    const score = consistent * 10 + Math.min(most, 20) / 20;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function mode(arr) {
  const m = new Map();
  for (const v of arr) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

function splitLine(line, d) {
  return parseCsv(line, d)[0] || [];
}

/** CSV по RFC 4180: полета в кавички, удвоени кавички, нови редове в кавички. */
export function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field.trim() === '') { quoted = true; field = ''; i++; continue; }
    if (ch === delimiter) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++; continue;
    }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Текстова таблица → лист. */
export function readText(text, name = 'Таблица') {
  let body = text.replace(/^﻿/, '');
  let delimiter = null;
  // Excel понякога пише първи ред „sep=;“.
  const sep = /^sep=(.)\r?\n/i.exec(body);
  if (sep) { delimiter = sep[1]; body = body.slice(sep[0].length); }
  delimiter ||= detectDelimiter(body);
  const rows = parseCsv(body, delimiter).map(r => r.map(v => v.trim()));
  while (rows.length && rows[rows.length - 1].every(v => v === '')) rows.pop();
  if (!rows.length) throw new Error('Файлът е празен.');
  return { sheets: [{ name, hidden: false, rows }], delimiter };
}
