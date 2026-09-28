/* Четене на ZIP архив — основата на .xlsx и .ods.
 *
 * Чете се централната директория в края на файла, а съдържанието на всеки
 * запис се разархивира при поискване (метод 0 — без компресия, метод 8 —
 * deflate). Без външни библиотеки. */

import zlib from 'node:zlib';

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/* Граници срещу „ZIP бомба“ — малък файл, който се разархивира до гигабайти
 * и би изчерпал паметта. Истинска таблица с 20 000 реда е далеч под тях. */
export const MAX_ENTRY_BYTES = 150 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 300 * 1024 * 1024;
const MAX_ENTRIES = 10000;
const TOO_BIG = 'Файлът е твърде голям след разархивиране — изглежда повреден или не е обикновена таблица.';

export function isZip(buf) {
  return buf.length > 4 && buf.readUInt32LE(0) === SIG_LOCAL;
}

/**
 * @param {Buffer} buf
 * @returns {{ names: string[], has(name): boolean, read(name): Buffer|null, text(name): string|null }}
 */
export function openZip(buf) {
  // Краят на централната директория е в последните 64 KB (плюс коментар).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Файлът не е валиден ZIP архив.');
  const count = buf.readUInt16LE(eocd + 10);
  if (count > MAX_ENTRIES) throw new Error('Архивът съдържа твърде много файлове.');
  let pos = buf.readUInt32LE(eocd + 16);
  let total = 0;

  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== SIG_CENTRAL) {
      throw new Error('Повредена централна директория на ZIP архива.');
    }
    const flags = buf.readUInt16LE(pos + 8);
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const size = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const local = buf.readUInt32LE(pos + 42);
    const rawName = buf.subarray(pos + 46, pos + 46 + nameLen);
    const name = (flags & 0x800 ? rawName.toString('utf8') : rawName.toString('latin1')).replace(/\\/g, '/');
    entries.set(name.replace(/^\//, ''), { method, compSize, size, local, flags });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  const read = (name) => {
    const e = entries.get(name) || findCaseless(entries, name);
    if (!e) return null;
    if (e.flags & 0x1) throw new Error('Файлът е защитен с парола. Запишете го без парола и опитайте отново.');
    if (e.local + 30 > buf.length || buf.readUInt32LE(e.local) !== SIG_LOCAL) throw new Error('Повреден запис в ZIP архива.');
    const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
    const data = buf.subarray(start, start + e.compSize);
    let out;
    if (e.method === 0) {
      out = Buffer.from(data);
    } else if (e.method === 8) {
      const cap = Math.min(MAX_ENTRY_BYTES, MAX_TOTAL_BYTES - total);
      try {
        out = zlib.inflateRawSync(data, { maxOutputLength: Math.max(1, cap) });
      } catch (err) {
        if (err.code === 'ERR_BUFFER_TOO_LARGE') throw new Error(TOO_BIG);
        throw new Error('Повреден компресиран запис в архива.');
      }
    } else {
      throw new Error(`Неподдържан метод на компресия (${e.method}).`);
    }
    total += out.length;
    if (total > MAX_TOTAL_BYTES) throw new Error(TOO_BIG);
    return out;
  };

  return {
    names: [...entries.keys()],
    has: (name) => entries.has(name) || !!findCaseless(entries, name),
    read,
    text: (name) => {
      const b = read(name);
      return b ? b.toString('utf8').replace(/^﻿/, '') : null;
    },
  };
}

function findCaseless(entries, name) {
  const lower = name.toLowerCase();
  for (const [k, v] of entries) if (k.toLowerCase() === lower) return v;
  return null;
}
