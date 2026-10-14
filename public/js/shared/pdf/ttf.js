/* TrueType шрифт (glyf): четене, ширини на знаците и подмножество за вграждане в PDF.
 * Подмножеството пази номерата на глифовете (неизползваните остават празни), затова
 * в PDF връзката знак → глиф е „Identity“. Без зависимости — работи в браузъра и в Node. */

const tagAt = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/** Чете шрифта. Връща метрики, cmap (знак → глиф) и функции за ширина и подмножество. */
export function parseTTF(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tables = {};
  const count = v.getUint16(4);
  for (let i = 0; i < count; i++) {
    const o = 12 + i * 16;
    tables[tagAt(b, o)] = { offset: v.getUint32(o + 8), length: v.getUint32(o + 12) };
  }
  for (const t of ['head', 'hhea', 'hmtx', 'maxp', 'cmap', 'glyf', 'loca']) {
    if (!tables[t]) throw new Error(`Шрифтът няма таблица ${t} (нужен е TrueType)`);
  }
  const head = tables.head.offset;
  const unitsPerEm = v.getUint16(head + 18);
  const bbox = [v.getInt16(head + 36), v.getInt16(head + 38), v.getInt16(head + 40), v.getInt16(head + 42)];
  const longLoca = v.getInt16(head + 50) === 1;
  const numGlyphs = v.getUint16(tables.maxp.offset + 4);
  const hhea = tables.hhea.offset;
  const ascent = v.getInt16(hhea + 4);
  const descent = v.getInt16(hhea + 6);
  const lineGap = v.getInt16(hhea + 8);
  const numHMetrics = v.getUint16(hhea + 34);

  let capHeight = Math.round(ascent * 0.7);
  let weight = 400;
  if (tables['OS/2']) {
    const os = tables['OS/2'].offset;
    weight = v.getUint16(os + 4);
    if (v.getUint16(os) >= 2) capHeight = v.getInt16(os + 88);
  }
  const italicAngle = tables.post ? v.getInt32(tables.post.offset + 4) / 65536 : 0;

  // Ширини на глифовете.
  const hm = tables.hmtx.offset;
  const advances = new Uint16Array(numGlyphs);
  for (let g = 0; g < numGlyphs; g++) advances[g] = v.getUint16(hm + 4 * Math.min(g, numHMetrics - 1));

  // Местата на глифовете в glyf.
  const loca = new Uint32Array(numGlyphs + 1);
  for (let g = 0; g <= numGlyphs; g++) {
    loca[g] = longLoca ? v.getUint32(tables.loca.offset + 4 * g) : v.getUint16(tables.loca.offset + 2 * g) * 2;
  }

  const cmap = readCmap(v, tables.cmap.offset);
  return {
    bytes: b, tables, unitsPerEm, bbox, numGlyphs, ascent, descent, lineGap, capHeight, weight, italicAngle,
    advances, loca, cmap, name: postscriptName(v, b, tables.name),
    /** Глифът за знака (0 — няма го в шрифта). */
    glyph: (cp) => cmap.get(cp) || 0,
    /** Ширината на глифа в единици на шрифта. */
    advance: (g) => advances[g] || 0,
  };
}

function readCmap(v, base) {
  const n = v.getUint16(base + 2);
  let best = null;
  let rank = -1;
  for (let i = 0; i < n; i++) {
    const platform = v.getUint16(base + 4 + i * 8);
    const encoding = v.getUint16(base + 6 + i * 8);
    const offset = base + v.getUint32(base + 8 + i * 8);
    const format = v.getUint16(offset);
    const r = platform === 3 && encoding === 10 && format === 12 ? 3
      : platform === 0 && format === 12 ? 2
        : (platform === 3 && encoding === 1) || platform === 0 ? (format === 4 ? 1 : -1) : -1;
    if (r > rank) { rank = r; best = { offset, format }; }
  }
  const map = new Map();
  if (!best) return map;
  const o = best.offset;
  if (best.format === 12) {
    const groups = v.getUint32(o + 12);
    for (let i = 0; i < groups; i++) {
      const g = o + 16 + i * 12;
      const start = v.getUint32(g);
      const end = v.getUint32(g + 4);
      const gid = v.getUint32(g + 8);
      for (let cp = start; cp <= end && cp - start < 0x10000; cp++) map.set(cp, gid + cp - start);
    }
    return map;
  }
  const segs = v.getUint16(o + 6) / 2;
  const ends = o + 14;
  const starts = ends + segs * 2 + 2;
  const deltas = starts + segs * 2;
  const ranges = deltas + segs * 2;
  for (let s = 0; s < segs; s++) {
    const end = v.getUint16(ends + s * 2);
    const start = v.getUint16(starts + s * 2);
    const delta = v.getInt16(deltas + s * 2);
    const rangeAt = ranges + s * 2;
    const range = v.getUint16(rangeAt);
    for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
      let gid;
      if (!range) gid = (cp + delta) & 0xffff;
      else {
        const g = v.getUint16(rangeAt + range + (cp - start) * 2);
        gid = g ? (g + delta) & 0xffff : 0;
      }
      if (gid) map.set(cp, gid);
    }
  }
  return map;
}

function postscriptName(v, b, t) {
  if (!t) return 'Font';
  const count = v.getUint16(t.offset + 2);
  const strings = t.offset + v.getUint16(t.offset + 4);
  for (let i = 0; i < count; i++) {
    const r = t.offset + 6 + i * 12;
    if (v.getUint16(r + 6) !== 6) continue;
    const platform = v.getUint16(r);
    const len = v.getUint16(r + 8);
    const off = strings + v.getUint16(r + 10);
    let s = '';
    if (platform === 3 || platform === 0) for (let k = 0; k < len; k += 2) s += String.fromCharCode(v.getUint16(off + k));
    else for (let k = 0; k < len; k++) s += String.fromCharCode(b[off + k]);
    s = s.replace(/[^A-Za-z0-9-]/g, '');
    if (s) return s;
  }
  return 'Font';
}

/* ------------------------------- подмножество ------------------------------- */

/** Съставните глифове (буква с ударение и т.н.) сочат към други глифове — те също се пазят. */
function components(font, g) {
  const { bytes: b, tables, loca } = font;
  const start = tables.glyf.offset + loca[g];
  if (loca[g + 1] - loca[g] < 10) return [];
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getInt16(start) >= 0) return [];
  const out = [];
  let o = start + 10;
  for (;;) {
    const flags = v.getUint16(o);
    out.push(v.getUint16(o + 2));
    o += 4 + (flags & 1 ? 4 : 2);
    if (flags & 8) o += 2;
    else if (flags & 0x40) o += 4;
    else if (flags & 0x80) o += 8;
    if (!(flags & 0x20)) break;
  }
  return out;
}

/**
 * Нов TTF само с дадените глифове (и техните съставни части). Номерата остават същите.
 * chars — знаците, които да са в новата cmap (по подразбиране: тези, чиито глифове се пазят).
 */
export function subsetTTF(font, glyphs, chars = null) {
  const keep = new Set([0, ...glyphs]);
  for (const g of [...keep]) {
    const stack = [g];
    while (stack.length) for (const c of components(font, stack.pop())) if (!keep.has(c) && c < font.numGlyphs) { keep.add(c); stack.push(c); }
  }
  const { bytes: b, tables, loca, numGlyphs } = font;

  // glyf и loca (дълъг формат).
  const parts = [];
  const newLoca = new Uint8Array((numGlyphs + 1) * 4);
  const lv = new DataView(newLoca.buffer);
  let pos = 0;
  for (let g = 0; g < numGlyphs; g++) {
    lv.setUint32(g * 4, pos);
    if (!keep.has(g)) continue;
    const len = loca[g + 1] - loca[g];
    if (!len) continue;
    const padded = len + ((4 - (len % 4)) % 4);
    const chunk = new Uint8Array(padded);
    chunk.set(b.subarray(tables.glyf.offset + loca[g], tables.glyf.offset + loca[g] + len));
    parts.push(chunk);
    pos += padded;
  }
  lv.setUint32(numGlyphs * 4, pos);
  const glyf = concat(parts);

  const copy = (t) => b.slice(tables[t].offset, tables[t].offset + tables[t].length);
  const head = copy('head');
  const hv = new DataView(head.buffer);
  hv.setUint32(8, 0);
  hv.setInt16(50, 1);

  // post версия 3 — без имена на глифовете.
  const post = new Uint8Array(32);
  const pv = new DataView(post.buffer);
  pv.setUint32(0, 0x00030000);
  if (tables.post) post.set(b.subarray(tables.post.offset + 4, tables.post.offset + 16), 4);

  const pairs = [];
  for (const [cp, g] of font.cmap) if (cp <= 0xffff && keep.has(g) && (!chars || chars.has(cp))) pairs.push([cp, g]);
  const out = {
    cmap: cmap4(pairs), glyf, head, hhea: copy('hhea'), hmtx: copy('hmtx'), loca: newLoca, maxp: copy('maxp'), post,
  };
  for (const t of ['OS/2', 'name', 'cvt ', 'fpgm', 'prep']) if (tables[t]) out[t] = copy(t);
  const file = assemble(out);
  // Контролната сума на целия файл.
  const fv = new DataView(file.buffer);
  const headAt = tableOffset(file, 'head');
  fv.setUint32(headAt + 8, (0xb1b0afba - checksum(file)) >>> 0);
  return file;
}

/** cmap с една подтаблица (3,1) формат 4. */
function cmap4(pairs) {
  pairs.sort((x, y) => x[0] - y[0]);
  const segs = [];
  for (const [cp, g] of pairs) {
    const last = segs[segs.length - 1];
    if (last && cp === last.end + 1 && g - cp === last.delta) last.end = cp;
    else segs.push({ start: cp, end: cp, delta: g - cp });
  }
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const n = segs.length;
  const len = 16 + n * 8;
  const t = new Uint8Array(12 + len);
  const v = new DataView(t.buffer);
  v.setUint16(0, 0); v.setUint16(2, 1);
  v.setUint16(4, 3); v.setUint16(6, 1); v.setUint32(8, 12);
  const o = 12;
  let es = 0;
  while ((1 << (es + 1)) <= n) es++;
  v.setUint16(o, 4); v.setUint16(o + 2, len); v.setUint16(o + 4, 0);
  v.setUint16(o + 6, n * 2); v.setUint16(o + 8, 2 << es); v.setUint16(o + 10, es); v.setUint16(o + 12, n * 2 - (2 << es));
  segs.forEach((s, i) => {
    v.setUint16(o + 14 + i * 2, s.end);
    v.setUint16(o + 16 + n * 2 + i * 2, s.start);
    v.setUint16(o + 16 + n * 4 + i * 2, s.delta & 0xffff);
    v.setUint16(o + 16 + n * 6 + i * 2, 0);
  });
  return t;
}

function checksum(bytes) {
  const padded = bytes.length % 4 ? concat([bytes, new Uint8Array(4 - (bytes.length % 4))]) : bytes;
  const v = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  return sum;
}

function assemble(tables) {
  const tags = Object.keys(tables).sort();
  const n = tags.length;
  let es = 0;
  while ((1 << (es + 1)) <= n) es++;
  const dir = new Uint8Array(12 + n * 16);
  const v = new DataView(dir.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, n); v.setUint16(6, 16 << es); v.setUint16(8, es); v.setUint16(10, n * 16 - (16 << es));
  const parts = [dir];
  let offset = dir.length;
  tags.forEach((t, i) => {
    const data = tables[t];
    const r = 12 + i * 16;
    for (let k = 0; k < 4; k++) dir[r + k] = t.charCodeAt(k);
    v.setUint32(r + 4, checksum(data));
    v.setUint32(r + 8, offset);
    v.setUint32(r + 12, data.length);
    const pad = (4 - (data.length % 4)) % 4;
    parts.push(data, new Uint8Array(pad));
    offset += data.length + pad;
  });
  return concat(parts);
}

function tableOffset(file, tag) {
  const v = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const n = v.getUint16(4);
  for (let i = 0; i < n; i++) if (tagAt(file, 12 + i * 16) === tag) return v.getUint32(12 + i * 16 + 8);
  return -1;
}

export function concat(parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
