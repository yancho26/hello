/* Excel 2007 и по-нови (.xlsx) — Office Open XML.
 *
 * Работната книга е ZIP архив с XML файлове: списък на листовете, общите
 * текстове (sharedStrings), стиловете (от тях се разбира кои числа са дати)
 * и по един файл за всеки лист. */

import { attrs, decodeEntities, decodeOoxmlEscapes, tag } from './xml.js';
import { excelSerialToISO, isDateFormat, numberText } from './cells.js';

const T = tag;

export function readXlsx(zip) {
  const wbXml = zip.text('xl/workbook.xml');
  if (!wbXml) throw new Error('Липсва описанието на работната книга (xl/workbook.xml).');
  const date1904 = new RegExp(`<${T('workbookPr')}\\b[^>]*date1904\\s*=\\s*["'](1|true)["']`, 'i').test(wbXml);

  // Връзките: rId → път до листа.
  const rels = new Map();
  const relsXml = zip.text('xl/_rels/workbook.xml.rels') || '';
  for (const m of relsXml.matchAll(new RegExp(`<${T('Relationship')}\\b([^>]*)>`, 'g'))) {
    const a = attrs(m[1]);
    if (a.Id && a.Target) rels.set(a.Id, a.Target);
  }

  const shared = readSharedStrings(zip.text('xl/sharedStrings.xml') || '');
  const dateStyles = readDateStyles(zip.text('xl/styles.xml') || '');

  const sheets = [];
  for (const m of wbXml.matchAll(new RegExp(`<${T('sheet')}\\b([^>]*?)\\/?>`, 'g'))) {
    const a = attrs(m[1]);
    const rid = a['r:id'] || a.id || Object.entries(a).find(([k]) => /:id$/.test(k))?.[1];
    let target = rels.get(rid) || '';
    if (!target) continue;
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    target = target.replace(/[^/]+\/\.\.\//g, '');
    const xml = zip.text(target);
    if (xml === null) continue;
    sheets.push({ name: a.name || `Лист ${sheets.length + 1}`, hidden: a.state === 'hidden' || a.state === 'veryHidden', rows: readSheet(xml, shared, dateStyles, date1904) });
  }
  if (!sheets.length) throw new Error('В работната книга няма листове с данни.');
  return sheets;
}

function readSharedStrings(xml) {
  const out = [];
  for (const m of xml.matchAll(new RegExp(`<${T('si')}\\b[^>]*>([\\s\\S]*?)<\\/${T('si')}>|<${T('si')}\\s*\\/>`, 'g'))) {
    out.push(m[1] === undefined ? '' : richText(m[1]));
  }
  return out;
}

/** Текстът на <si> или <is>: всички <t>, без фонетичните <rPh>. */
function richText(inner) {
  const body = inner.replace(new RegExp(`<${T('rPh')}\\b[\\s\\S]*?<\\/${T('rPh')}>`, 'g'), '');
  let text = '';
  for (const t of body.matchAll(new RegExp(`<${T('t')}\\b[^>]*>([\\s\\S]*?)<\\/${T('t')}>`, 'g'))) text += t[1];
  return decodeOoxmlEscapes(decodeEntities(text));
}

/** Кои стилове (индекси в cellXfs) са формат за дата. */
function readDateStyles(xml) {
  const custom = new Map();
  for (const m of xml.matchAll(new RegExp(`<${T('numFmt')}\\b([^>]*?)\\/?>`, 'g'))) {
    const a = attrs(m[1]);
    custom.set(Number(a.numFmtId), a.formatCode || '');
  }
  const out = new Set();
  const xfs = new RegExp(`<${T('cellXfs')}\\b[^>]*>([\\s\\S]*?)<\\/${T('cellXfs')}>`).exec(xml);
  if (!xfs) return out;
  let i = 0;
  for (const m of xfs[1].matchAll(new RegExp(`<${T('xf')}\\b([^>]*?)(?:\\/>|>)`, 'g'))) {
    const id = Number(attrs(m[1]).numFmtId || 0);
    if (isDateFormat(id, custom.get(id))) out.add(i);
    i++;
  }
  return out;
}

/** „AB12“ → 27 (номер на колоната, от 0). */
function colIndex(ref) {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function readSheet(xml, shared, dateStyles, date1904) {
  const rows = [];
  let nextRow = 0;
  const rowRe = new RegExp(`<${T('row')}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${T('row')}>)`, 'g');
  const cellRe = new RegExp(`<${T('c')}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${T('c')}>)`, 'g');
  const vRe = new RegExp(`<${T('v')}\\b[^>]*>([\\s\\S]*?)<\\/${T('v')}>`);
  const isRe = new RegExp(`<${T('is')}\\b[^>]*>([\\s\\S]*?)<\\/${T('is')}>`);

  for (const rm of xml.matchAll(rowRe)) {
    const ra = attrs(rm[1]);
    const r = ra.r ? Number(ra.r) - 1 : nextRow;
    nextRow = r + 1;
    if (!rm[2]) continue;
    const cells = [];
    let nextCol = 0;
    for (const cm of rm[2].matchAll(cellRe)) {
      const ca = attrs(cm[1]);
      const c = ca.r ? colIndex(ca.r.replace(/[^A-Z]/gi, '').toUpperCase()) : nextCol;
      nextCol = c + 1;
      const inner = cm[2] || '';
      const v = vRe.exec(inner);
      const raw = v ? decodeEntities(v[1]) : '';
      let value = '';
      switch (ca.t) {
        case 's': value = shared[Number(raw)] ?? ''; break;
        case 'inlineStr': { const is = isRe.exec(inner); value = is ? richText(is[1]) : ''; break; }
        case 'str': case 'e': value = decodeOoxmlEscapes(raw); break;
        case 'b': value = raw === '1' ? 'да' : raw === '0' ? 'не' : raw; break;
        case 'd': value = raw.slice(0, 10); break;
        default: {
          if (raw === '') break;
          const n = Number(raw);
          if (!Number.isFinite(n)) { value = raw; break; }
          value = dateStyles.has(Number(ca.s || 0)) ? (excelSerialToISO(n, date1904) || numberText(n)) : numberText(n);
        }
      }
      if (value !== '') cells[c] = value.trim();
    }
    if (cells.length) rows[r] = cells;
  }
  return normalizeRows(rows);
}

/** Плътен масив от редове с празни низове вместо дупки; без празните редове в края. */
export function normalizeRows(sparse) {
  const out = [];
  for (let i = 0; i < sparse.length; i++) {
    const row = sparse[i] || [];
    const dense = [];
    for (let j = 0; j < row.length; j++) dense.push(row[j] === undefined || row[j] === null ? '' : String(row[j]));
    out.push(dense);
  }
  while (out.length && out[out.length - 1].every(v => v === '')) out.pop();
  return out;
}
