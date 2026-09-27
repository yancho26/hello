/* Excel 97–2003 (.xls) — двоичен формат BIFF8 (и по-старият BIFF5).
 *
 * Файлът е „съставен документ“ (OLE/CFB) — малка файлова система с
 * таблица на секторите. В нея потокът „Workbook“ (или „Book“ при BIFF5)
 * съдържа записи: общите текстове (SST), форматите и клетките на всеки лист.
 * Чете се само това, което е нужно за таблица от текст и числа. */

import { excelSerialToISO, isDateFormat, numberText } from './cells.js';
import { normalizeRows } from './xlsx.js';

const CFB_SIG = 'd0cf11e0a1b11ae1';
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

export const isCfb = (buf) => buf.length >= 512 && buf.subarray(0, 8).toString('hex') === CFB_SIG;

/* ------------------------------ съставен документ ------------------------------ */

function readCfb(buf) {
  const sectorSize = 1 << buf.readUInt16LE(0x1e);
  const miniSize = 1 << buf.readUInt16LE(0x20);
  const numFat = buf.readUInt32LE(0x2c);
  const firstDir = buf.readUInt32LE(0x30);
  const miniCutoff = buf.readUInt32LE(0x38);
  const firstMiniFat = buf.readUInt32LE(0x3c);
  const firstDifat = buf.readUInt32LE(0x44);
  const numDifat = buf.readUInt32LE(0x48);
  const sector = (n) => {
    const off = (n + 1) * sectorSize;
    if (off + sectorSize > buf.length + sectorSize) throw new Error('Повреден файл .xls (сектор извън файла).');
    return buf.subarray(off, Math.min(off + sectorSize, buf.length));
  };

  // Секторите на таблицата (FAT) — първите 109 са в заглавката, останалите в DIFAT.
  const fatSectors = [];
  for (let i = 0; i < 109 && fatSectors.length < numFat; i++) {
    const s = buf.readUInt32LE(0x4c + i * 4);
    if (s !== FREESECT) fatSectors.push(s);
  }
  let difat = firstDifat;
  for (let d = 0; d < numDifat && difat !== ENDOFCHAIN && difat !== FREESECT; d++) {
    const sec = sector(difat);
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per && fatSectors.length < numFat; i++) {
      const s = sec.readUInt32LE(i * 4);
      if (s !== FREESECT) fatSectors.push(s);
    }
    difat = sec.readUInt32LE(per * 4);
  }
  const fat = [];
  for (const s of fatSectors) {
    const sec = sector(s);
    for (let i = 0; i + 4 <= sec.length; i += 4) fat.push(sec.readUInt32LE(i));
  }

  const chain = (start, table) => {
    const out = [];
    const seen = new Set();
    for (let s = start; s !== ENDOFCHAIN && s !== FREESECT && s < table.length; s = table[s]) {
      if (seen.has(s)) throw new Error('Повреден файл .xls (зациклена верига).');
      seen.add(s);
      out.push(s);
    }
    return out;
  };
  const readStream = (start, size) => {
    const parts = chain(start, fat).map(sector);
    return Buffer.concat(parts).subarray(0, size);
  };

  // Директорията.
  const dirBuf = readStream(firstDir, Infinity);
  const entries = [];
  for (let off = 0; off + 128 <= dirBuf.length; off += 128) {
    const nameLen = dirBuf.readUInt16LE(off + 0x40);
    const type = dirBuf[off + 0x42];
    if (!type) continue;
    const name = dirBuf.subarray(off, off + Math.max(0, nameLen - 2)).toString('utf16le');
    entries.push({ name, type, start: dirBuf.readUInt32LE(off + 0x74), size: dirBuf.readUInt32LE(off + 0x78) });
  }
  const root = entries.find(e => e.type === 5);

  let miniStream = null;
  let miniFat = null;
  const openMini = () => {
    if (miniStream) return;
    miniStream = readStream(root.start, root.size);
    miniFat = [];
    for (const s of chain(firstMiniFat, fat)) {
      const sec = sector(s);
      for (let i = 0; i + 4 <= sec.length; i += 4) miniFat.push(sec.readUInt32LE(i));
    }
  };

  return {
    stream(names) {
      const e = entries.find(x => x.type === 2 && names.includes(x.name));
      if (!e) return null;
      if (e.size < miniCutoff) {
        openMini();
        const parts = chain(e.start, miniFat).map(s => miniStream.subarray(s * miniSize, (s + 1) * miniSize));
        return Buffer.concat(parts).subarray(0, e.size);
      }
      return readStream(e.start, e.size);
    },
    has: (name) => entries.some(x => x.name === name),
  };
}

/* ------------------------------------ BIFF ------------------------------------ */

/** Четец за текстове, които могат да продължат в следващ CONTINUE запис. */
class Segments {
  constructor(parts) {
    this.parts = parts;   // масив от Buffer — SST и CONTINUE след него
    this.i = 0;
    this.pos = 0;
  }
  get atBoundary() { return this.pos >= this.parts[this.i].length && this.i + 1 < this.parts.length; }
  next() { if (this.pos >= this.parts[this.i].length && this.i + 1 < this.parts.length) { this.i++; this.pos = 0; } }
  u8() { this.next(); return this.parts[this.i][this.pos++]; }
  u16() { return this.u8() | (this.u8() << 8); }
  u32() { return (this.u16() | (this.u16() << 16)) >>> 0; }
  skip(n) { for (let k = 0; k < n; k++) this.u8(); }
  /** Знаци на текст: при прехода в нов запис идва нов байт с флаговете. */
  chars(count, high) {
    let s = '';
    for (let k = 0; k < count; k++) {
      if (this.pos >= this.parts[this.i].length && this.i + 1 < this.parts.length) {
        this.i++; this.pos = 0;
        high = (this.parts[this.i][this.pos++] & 1) === 1;
      }
      s += String.fromCharCode(high ? this.u16() : this.u8());
    }
    return s;
  }
}

function readSst(parts) {
  const r = new Segments(parts);
  r.u32();
  const unique = r.u32();
  const out = [];
  for (let n = 0; n < unique; n++) {
    if (r.i === parts.length - 1 && r.pos >= parts[r.i].length) break;
    const cch = r.u16();
    const flags = r.u8();
    const runs = flags & 0x08 ? r.u16() : 0;
    const ext = flags & 0x04 ? r.u32() : 0;
    out.push(r.chars(cch, (flags & 1) === 1));
    r.skip(runs * 4 + ext);
  }
  return out;
}

/** Низ във формат XLUnicodeString (BIFF8) или с 8-битови знаци (BIFF5). */
function biffString(data, off, biff8, decode8, lenBytes = 2) {
  const cch = lenBytes === 2 ? data.readUInt16LE(off) : data[off];
  off += lenBytes;
  if (!biff8) return decode8(data.subarray(off, off + cch));
  const flags = data[off++];
  if (flags & 0x08) off += 2;
  if (flags & 0x04) off += 4;
  return flags & 1
    ? data.subarray(off, off + cch * 2).toString('utf16le')
    : data.subarray(off, off + cch).toString('latin1');
}

function rkValue(rk) {
  let v;
  if (rk & 2) {
    v = rk >> 2;
  } else {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(0, 0);
    b.writeUInt32LE(rk & 0xfffffffc, 4);
    v = b.readDoubleLE(0);
  }
  return rk & 1 ? v / 100 : v;
}

export function readXls(buf) {
  const cfb = readCfb(buf);
  const wb = cfb.stream(['Workbook', 'Book', 'WORKBOOK', 'BOOK']);
  if (!wb) throw new Error('Във файла .xls няма работна книга.');

  // Първо преминаване: общите данни и описанието на листовете.
  let biff8 = true;
  let codepage = 1252;
  let date1904 = false;
  const formats = new Map();
  const xfFormat = [];
  const sheetsMeta = [];
  let sst = [];
  let decoder = null;
  const decode8 = (b) => {
    if (!decoder) decoder = new TextDecoder(codepage === 1251 ? 'windows-1251' : codepage === 1200 ? 'utf-16le' : 'windows-1252');
    return decoder.decode(b);
  };

  const records = [];
  for (let pos = 0; pos + 4 <= wb.length;) {
    const type = wb.readUInt16LE(pos);
    const len = wb.readUInt16LE(pos + 2);
    records.push({ type, pos, data: wb.subarray(pos + 4, pos + 4 + len) });
    pos += 4 + len;
  }

  let inGlobals = true;
  for (let k = 0; k < records.length && inGlobals; k++) {
    const { type, data } = records[k];
    switch (type) {
      case 0x0809: if (k === 0) biff8 = data.readUInt16LE(0) === 0x0600; break;
      case 0x0042: codepage = data.readUInt16LE(0); decoder = null; break;
      case 0x0022: date1904 = data.readUInt16LE(0) === 1; break;
      case 0x041e: formats.set(data.readUInt16LE(0), biffString(data, 2, biff8, decode8, biff8 ? 2 : 1)); break;
      case 0x00e0: xfFormat.push(data.readUInt16LE(2)); break;
      case 0x0085: {
        const offset = data.readUInt32LE(0);
        const kind = data[5];
        const name = biffString(data, 6, biff8, decode8, 1);
        sheetsMeta.push({ offset, kind, hidden: data[4] !== 0, name });
        break;
      }
      case 0x00fc: {
        const parts = [data];
        for (let j = k + 1; j < records.length && records[j].type === 0x003c; j++) parts.push(records[j].data);
        sst = readSst(parts);
        break;
      }
      case 0x000a: inGlobals = false; break;
      default:
    }
  }
  const isDateXf = (ixfe) => {
    const f = xfFormat[ixfe];
    return f !== undefined && isDateFormat(f, formats.get(f));
  };
  const num = (n, ixfe) => (isDateXf(ixfe) ? excelSerialToISO(n, date1904) || numberText(n) : numberText(n));

  const byOffset = new Map(records.map((r, idx) => [r.pos, idx]));
  const sheets = [];
  for (const meta of sheetsMeta) {
    if (meta.kind !== 0) continue; // само обикновени листове
    let k = byOffset.get(meta.offset);
    if (k === undefined) continue;
    const rows = [];
    const put = (r, c, v) => {
      if (v === '' || v === null || v === undefined) return;
      (rows[r] ||= [])[c] = String(v).trim();
    };
    let pendingString = null;
    for (k++; k < records.length; k++) {
      const { type, data } = records[k];
      if (type === 0x000a) break;
      if (type === 0x0809) { // вложен поток (диаграма) — прескача се до неговия EOF
        let depth = 1;
        while (depth && ++k < records.length) {
          if (records[k].type === 0x0809) depth++;
          else if (records[k].type === 0x000a) depth--;
        }
        continue;
      }
      if (data.length < 6 && type !== 0x0207) continue;
      switch (type) {
        case 0x00fd: put(data.readUInt16LE(0), data.readUInt16LE(2), sst[data.readUInt32LE(6)] ?? ''); break;
        case 0x0204: put(data.readUInt16LE(0), data.readUInt16LE(2), biffString(data, 6, biff8, decode8)); break;
        case 0x00d6: put(data.readUInt16LE(0), data.readUInt16LE(2), biffString(data, 6, false, decode8)); break;
        case 0x0203: put(data.readUInt16LE(0), data.readUInt16LE(2), num(data.readDoubleLE(6), data.readUInt16LE(4))); break;
        case 0x027e: put(data.readUInt16LE(0), data.readUInt16LE(2), num(rkValue(data.readUInt32LE(6)), data.readUInt16LE(4))); break;
        case 0x00bd: {
          const r = data.readUInt16LE(0);
          let c = data.readUInt16LE(2);
          for (let off = 4; off + 6 <= data.length - 2; off += 6, c++) {
            put(r, c, num(rkValue(data.readUInt32LE(off + 2)), data.readUInt16LE(off)));
          }
          break;
        }
        case 0x0006: {
          const r = data.readUInt16LE(0), c = data.readUInt16LE(2);
          if (data.readUInt16LE(12) === 0xffff) {
            const kind = data[6];
            if (kind === 0) pendingString = { r, c };
            else if (kind === 1) put(r, c, data[8] ? 'да' : 'не');
          } else {
            put(r, c, num(data.readDoubleLE(6), data.readUInt16LE(4)));
          }
          break;
        }
        case 0x0207:
          if (pendingString) put(pendingString.r, pendingString.c, biffString(data, 0, biff8, decode8));
          pendingString = null;
          break;
        case 0x0205: if (data[7] === 0) put(data.readUInt16LE(0), data.readUInt16LE(2), data[6] ? 'да' : 'не'); break;
        default:
      }
    }
    sheets.push({ name: meta.name, hidden: meta.hidden, rows: normalizeRows(rows) });
  }
  if (!sheets.length) throw new Error('Във файла .xls няма листове с данни.');
  return sheets;
}
