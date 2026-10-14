/* Малък PDF писател без зависимости: страници A4, вградени TrueType шрифтове с кирилица
 * (подмножество + ToUnicode, за да се търси и копира текстът), цветни форми, градиенти,
 * прозрачност, връзки и отметки. Работи в браузъра и в Node (компресия с CompressionStream).
 * Координатите са от горния ляв ъгъл, в точки (1 pt = 1/72"). */

import { concat, parseTTF, subsetTTF } from './ttf.js';

export const A4 = { w: 595.28, h: 841.89 };

const num = (n) => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};
const hex4 = (n) => n.toString(16).padStart(4, '0');
const ascii = (s) => new TextEncoder().encode(s);

/** Цвят: '#rrggbb' → [r, g, b] от 0 до 1. */
export function rgb(c) {
  if (Array.isArray(c)) return c;
  const h = c.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
}
const colorOps = (c, op) => rgb(c).map(num).join(' ') + ' ' + op;

/** Текст в PDF низ като UTF-16BE (за заглавия и отметки). */
function textString(s) {
  let out = 'FEFF';
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff) {
      const v = cp - 0x10000;
      out += hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 0x3ff));
    } else out += hex4(cp);
  }
  return `<${out.toUpperCase()}>`;
}
const literal = (s) => '(' + String(s).replace(/[\\()]/g, (m) => '\\' + m).replace(/[^\x20-\x7e]/g, '') + ')';

/** Компресия zlib (FlateDecode) с вградения в средата CompressionStream. */
export async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ----------------------------------- шрифт ----------------------------------- */

class Font {
  constructor(bytes, id) {
    this.ttf = parseTTF(bytes);
    this.id = id;
    this.used = new Map(); // глиф → знак(ци), за ToUnicode
    this.scale = 1000 / this.ttf.unitsPerEm;
  }

  has(ch) { const cp = ch.codePointAt(0); return !!(this.ttf.glyph(cp) || this.fallback?.ttf.glyph(cp)); }

  /** Ширина на текста в точки (знаците от резервния шрифт — по неговите ширини). */
  width(text, size) {
    let w = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      const g = this.ttf.glyph(cp);
      if (g) w += this.ttf.advance(g) / this.ttf.unitsPerEm;
      else if (this.fallback) {
        const fg = this.fallback.ttf.glyph(cp);
        if (fg) w += this.fallback.ttf.advance(fg) / this.fallback.ttf.unitsPerEm;
      }
    }
    return w * size;
  }

  /** Текстът на части по шрифта, който има знаците: [[шрифт, текст], …]. */
  runs(text) {
    const out = [];
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      const f = this.ttf.glyph(cp) ? this : this.fallback?.ttf.glyph(cp) ? this.fallback : null;
      if (!f) continue;
      const last = out[out.length - 1];
      if (last && last[0] === f) last[1] += ch;
      else out.push([f, ch]);
    }
    return out;
  }

  /** Глифовете като шестнадесетичен низ; знаците, които ги няма в шрифта, се пропускат. */
  encode(text) {
    let out = '';
    for (const ch of text) {
      const g = this.ttf.glyph(ch.codePointAt(0));
      if (!g) continue;
      if (!this.used.has(g)) this.used.set(g, ch);
      out += hex4(g);
    }
    return out;
  }
}

/* ---------------------------------- страница ---------------------------------- */

export class Page {
  constructor(doc, w, h) {
    this.doc = doc;
    this.w = w;
    this.h = h;
    this.ops = [];
    this.annots = [];
  }

  y(v) { return this.h - v; }

  save() { this.ops.push('q'); return this; }
  restore() { this.ops.push('Q'); return this; }

  opacity(alpha) {
    if (alpha < 1) this.ops.push(`/${this.doc.gstate(alpha)} gs`);
    return this;
  }

  /** Път на правоъгълник, по желание със заоблени ъгли (r — число или [горе-ляво, горе-дясно, долу-дясно, долу-ляво]). */
  pathRect(x, y, w, h, r = 0) {
    const [tl, tr, br, bl] = (Array.isArray(r) ? r : [r, r, r, r]).map(v => Math.max(0, Math.min(v, w / 2, h / 2)));
    if (!tl && !tr && !br && !bl) {
      this.ops.push(`${num(x)} ${num(this.y(y + h))} ${num(w)} ${num(h)} re`);
      return this;
    }
    const k = 0.5523;
    const Y = (v) => num(this.y(v));
    const X = num;
    this.ops.push(`${X(x + tl)} ${Y(y)} m`, `${X(x + w - tr)} ${Y(y)} l`);
    if (tr) this.ops.push(`${X(x + w - tr + tr * k)} ${Y(y)} ${X(x + w)} ${Y(y + tr - tr * k)} ${X(x + w)} ${Y(y + tr)} c`);
    this.ops.push(`${X(x + w)} ${Y(y + h - br)} l`);
    if (br) this.ops.push(`${X(x + w)} ${Y(y + h - br + br * k)} ${X(x + w - br + br * k)} ${Y(y + h)} ${X(x + w - br)} ${Y(y + h)} c`);
    this.ops.push(`${X(x + bl)} ${Y(y + h)} l`);
    if (bl) this.ops.push(`${X(x + bl - bl * k)} ${Y(y + h)} ${X(x)} ${Y(y + h - bl + bl * k)} ${X(x)} ${Y(y + h - bl)} c`);
    this.ops.push(`${X(x)} ${Y(y + tl)} l`);
    if (tl) this.ops.push(`${X(x)} ${Y(y + tl - tl * k)} ${X(x + tl - tl * k)} ${Y(y)} ${X(x + tl)} ${Y(y)} c`);
    this.ops.push('h');
    return this;
  }

  /** Правоъгълник: fill, stroke, lineWidth, radius, opacity, dash. */
  rect(x, y, w, h, { fill = null, stroke = null, lineWidth = 0.75, radius = 0, opacity = 1, dash = null } = {}) {
    if (!fill && !stroke) return this;
    this.save().opacity(opacity);
    if (fill) this.ops.push(colorOps(fill, 'rg'));
    if (stroke) this.ops.push(colorOps(stroke, 'RG'), `${num(lineWidth)} w`);
    if (dash) this.ops.push(`[${dash.map(num).join(' ')}] 0 d`);
    this.pathRect(x, y, w, h, radius);
    this.ops.push(fill && stroke ? 'B' : fill ? 'f' : 'S');
    return this.restore();
  }

  line(x1, y1, x2, y2, { color = '#000000', width = 0.75, dash = null, cap = 0, opacity = 1 } = {}) {
    this.save().opacity(opacity);
    this.ops.push(colorOps(color, 'RG'), `${num(width)} w`, `${cap} J`);
    if (dash) this.ops.push(`[${dash.map(num).join(' ')}] 0 d`);
    this.ops.push(`${num(x1)} ${num(this.y(y1))} m ${num(x2)} ${num(this.y(y2))} l S`);
    return this.restore();
  }

  /** Многоъгълник или начупена линия. */
  poly(points, { fill = null, stroke = null, width = 1, close = true, opacity = 1, join = 1 } = {}) {
    if (points.length < 2) return this;
    this.save().opacity(opacity);
    if (fill) this.ops.push(colorOps(fill, 'rg'));
    if (stroke) this.ops.push(colorOps(stroke, 'RG'), `${num(width)} w`, `${join} j 1 J`);
    this.ops.push(points.map(([x, y], i) => `${num(x)} ${num(this.y(y))} ${i ? 'l' : 'm'}`).join(' ') + (close ? ' h' : ''));
    this.ops.push(fill && stroke ? 'B' : fill ? 'f' : 'S');
    return this.restore();
  }

  circle(cx, cy, r, opts = {}) {
    return this.rect(cx - r, cy - r, 2 * r, 2 * r, { ...opts, radius: r });
  }

  /** Сектор от пръстен (за кръгова диаграма): ъглите са в градуси, 0 — горе, по часовника. */
  ring(cx, cy, rOut, rIn, a0, a1, { fill = '#000000', opacity = 1 } = {}) {
    if (a1 - a0 <= 0.01) return this;
    const pt = (r, a) => {
      const t = ((a - 90) * Math.PI) / 180;
      return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
    };
    const arc = (r, from, to) => {
      const out = [];
      const steps = Math.max(1, Math.ceil(Math.abs(to - from) / 90));
      const d = (to - from) / steps;
      for (let i = 0; i < steps; i++) {
        const s = from + d * i;
        const e = s + d;
        const k = (4 / 3) * Math.tan(((e - s) * Math.PI) / 720);
        const [x0, y0] = pt(r, s);
        const [x3, y3] = pt(r, e);
        const ts = ((s - 90) * Math.PI) / 180;
        const te = ((e - 90) * Math.PI) / 180;
        const c1 = [x0 - k * r * Math.sin(ts), y0 + k * r * Math.cos(ts)];
        const c2 = [x3 + k * r * Math.sin(te), y3 - k * r * Math.cos(te)];
        out.push(`${num(c1[0])} ${num(this.y(c1[1]))} ${num(c2[0])} ${num(this.y(c2[1]))} ${num(x3)} ${num(this.y(y3))} c`);
      }
      return out;
    };
    const [sx, sy] = pt(rOut, a0);
    const [ix, iy] = pt(rIn, a1);
    this.save().opacity(opacity);
    this.ops.push(colorOps(fill, 'rg'), `${num(sx)} ${num(this.y(sy))} m`, ...arc(rOut, a0, a1),
      `${num(ix)} ${num(this.y(iy))} l`, ...arc(rIn, a1, a0), 'h f');
    return this.restore();
  }

  /** Правоъгълник с преливащ се цвят (отляво надясно или отгоре надолу). */
  gradient(x, y, w, h, from, to, { vertical = false, radius = 0 } = {}) {
    const coords = vertical ? [x, this.y(y), x, this.y(y + h)] : [x, this.y(y), x + w, this.y(y)];
    const name = this.doc.shading(coords, rgb(from), rgb(to));
    this.save();
    this.pathRect(x, y, w, h, radius);
    this.ops.push('W n', `/${name} sh`);
    return this.restore();
  }

  /** Текст на един ред; y е базовата линия. align: left | center | right (спрямо x). */
  text(str, x, y, { font = 'regular', size = 10, color = '#000000', align = 'left', opacity = 1, spacing = 0 } = {}) {
    const f = this.doc.font(font);
    const s = String(str ?? '');
    if (!s) return 0;
    const width = f.width(s, size) + spacing * Math.max(0, [...s].length - 1);
    const x0 = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    const runs = f.runs(s);
    if (!runs.length) return width;
    this.save().opacity(opacity);
    this.ops.push('BT', colorOps(color, 'rg'), spacing ? `${num(spacing)} Tc` : '', `1 0 0 1 ${num(x0)} ${num(this.y(y))} Tm`);
    for (const [rf, part] of runs) this.ops.push(`/${rf.id} ${num(size)} Tf`, `<${rf.encode(part)}> Tj`);
    this.ops.push('ET');
    this.restore();
    return width;
  }

  /** Връзка към адрес в интернет. */
  link(x, y, w, h, url) {
    if (url) this.annots.push({ rect: [x, this.y(y + h), x + w, this.y(y)], url });
    return this;
  }

  /** Връзка към място в документа (страница и височина). */
  goto(x, y, w, h, page, top = 0) {
    this.annots.push({ rect: [x, this.y(y + h), x + w, this.y(y)], page, top });
    return this;
  }
}

/* ---------------------------------- документ ---------------------------------- */

export class PDFDocument {
  /** info: { title, author, subject, creator, lang } */
  constructor(info = {}) {
    this.info = info;
    this.pages = [];
    this.fonts = new Map();
    this.gstates = new Map();
    this.shadings = [];
    this.outlines = [];
  }

  addFont(key, bytes) {
    this.fonts.set(key, new Font(bytes, `F${this.fonts.size + 1}`));
    if (this.fallbackKey && key !== this.fallbackKey && this.fonts.has(this.fallbackKey)) this.fonts.get(key).fallback = this.fonts.get(this.fallbackKey);
    return this;
  }

  /** Резервен шрифт за знаците, които другите шрифтове нямат (символи). */
  setFallback(key) {
    this.fallbackKey = key;
    const fb = this.font(key);
    for (const [k, f] of this.fonts) if (k !== key) f.fallback = fb;
    return this;
  }

  font(key) {
    const f = this.fonts.get(key);
    if (!f) throw new Error(`Няма шрифт „${key}“`);
    return f;
  }

  /** Ширина на текст в точки. */
  width(text, font, size) { return this.font(font).width(String(text ?? ''), size); }

  addPage(w = A4.w, h = A4.h) {
    const p = new Page(this, w, h);
    this.pages.push(p);
    return p;
  }

  gstate(alpha) {
    const a = Math.round(alpha * 100) / 100;
    if (!this.gstates.has(a)) this.gstates.set(a, `GS${this.gstates.size + 1}`);
    return this.gstates.get(a);
  }

  shading(coords, c0, c1) {
    const name = `Sh${this.shadings.length + 1}`;
    this.shadings.push({ name, coords, c0, c1 });
    return name;
  }

  /** Отметка (съдържание отстрани в четеца). level 0 — раздел, 1 — подраздел. */
  bookmark(title, page, top = 0, level = 0) {
    this.outlines.push({ title, page, top, level });
    return this;
  }

  /** Целият файл. */
  async bytes() {
    const objs = [];
    const add = (body = null) => { objs.push(body); return objs.length; };
    const set = (id, body) => { objs[id - 1] = body; };
    const ref = (id) => `${id} 0 R`;
    const stream = async (dict, data, compress = true) => {
      const raw = typeof data === 'string' ? ascii(data) : data;
      const body = compress ? await deflate(raw) : raw;
      return { dict: `<< ${dict}${compress ? ' /Filter /FlateDecode' : ''} /Length ${body.length} >>`, data: body };
    };

    const catalog = add();
    const pagesId = add();
    const infoId = add();

    // Шрифтовете: само използваните, всеки като подмножество.
    const fontRefs = [];
    let tagN = 0;
    for (const f of this.fonts.values()) {
      if (!f.used.size) continue;
      const t = f.ttf;
      const tag = 'DOCUP' + String.fromCharCode(65 + tagN++);
      const base = `${tag}+${t.name}`;
      const sub = subsetTTF(t, new Set(f.used.keys()));
      const file = add(await stream(`/Length1 ${sub.length}`, sub));
      const s = f.scale;
      const desc = add(`<< /Type /FontDescriptor /FontName /${base} /Flags 32 /FontBBox [${t.bbox.map(v => num(v * s)).join(' ')}]`
        + ` /ItalicAngle ${num(t.italicAngle)} /Ascent ${num(t.ascent * s)} /Descent ${num(t.descent * s)} /CapHeight ${num(t.capHeight * s)}`
        + ` /StemV ${t.weight >= 600 ? 120 : 80} /FontFile2 ${ref(file)} >>`);
      const gids = [...f.used.keys()].sort((a, b) => a - b);
      const w = [];
      for (let i = 0; i < gids.length;) {
        let j = i;
        while (j + 1 < gids.length && gids[j + 1] === gids[j] + 1) j++;
        w.push(`${gids[i]} [${gids.slice(i, j + 1).map(g => num(t.advance(g) * s)).join(' ')}]`);
        i = j + 1;
      }
      const cid = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${base} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >>`
        + ` /FontDescriptor ${ref(desc)} /DW 1000 /W [${w.join(' ')}] /CIDToGIDMap /Identity >>`);
      const map = [];
      for (let i = 0; i < gids.length; i += 100) {
        const chunk = gids.slice(i, i + 100);
        map.push(`${chunk.length} beginbfchar`, ...chunk.map(g => `<${hex4(g)}> ${textString(f.used.get(g)).replace('FEFF', '')}`), 'endbfchar');
      }
      const toUnicode = add(await stream('', ['/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap',
        '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def', '/CMapName /Adobe-Identity-UCS def', '/CMapType 2 def',
        '1 begincodespacerange', '<0000> <FFFF>', 'endcodespacerange', ...map, 'endcmap',
        'CMapName currentdict /CMap defineresource pop', 'end', 'end'].join('\n')));
      const type0 = add(`<< /Type /Font /Subtype /Type0 /BaseFont /${base} /Encoding /Identity-H /DescendantFonts [${ref(cid)}] /ToUnicode ${ref(toUnicode)} >>`);
      fontRefs.push(`/${f.id} ${ref(type0)}`);
    }

    // Прозрачност и градиенти — общи ресурси за всички страници.
    const gs = [...this.gstates].map(([a, name]) => `/${name} << /ca ${num(a)} /CA ${num(a)} >>`);
    const sh = this.shadings.map(x => `/${x.name} << /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${x.coords.map(num).join(' ')}]`
      + ` /Function << /FunctionType 2 /Domain [0 1] /C0 [${x.c0.map(num).join(' ')}] /C1 [${x.c1.map(num).join(' ')}] /N 1 >> /Extend [true true] >>`);
    const resources = `<< /Font << ${fontRefs.join(' ')} >>${gs.length ? ` /ExtGState << ${gs.join(' ')} >>` : ''}`
      + `${sh.length ? ` /Shading << ${sh.join(' ')} >>` : ''} >>`;
    const resId = add(resources);

    const pageIds = this.pages.map(() => add());
    for (const [i, p] of this.pages.entries()) {
      const content = add(await stream('', p.ops.filter(Boolean).join('\n')));
      const annots = p.annots.map(a => add(`<< /Type /Annot /Subtype /Link /Rect [${a.rect.map(num).join(' ')}] /Border [0 0 0]`
        + (a.url ? ` /A << /S /URI /URI ${literal(a.url)} >>` : ` /Dest [${ref(pageIds[this.pages.indexOf(a.page)])} /XYZ 0 ${num(a.page.y(a.top))} null]`) + ' >>'));
      set(pageIds[i], `<< /Type /Page /Parent ${ref(pagesId)} /MediaBox [0 0 ${num(p.w)} ${num(p.h)}] /Resources ${ref(resId)}`
        + ` /Contents ${ref(content)}${annots.length ? ` /Annots [${annots.map(ref).join(' ')}]` : ''} >>`);
    }
    set(pagesId, `<< /Type /Pages /Kids [${pageIds.map(ref).join(' ')}] /Count ${pageIds.length} >>`);

    // Отметки: раздели и подраздели.
    let outlinesId = null;
    const tops = [];
    for (const o of this.outlines) {
      if (o.level === 0 || !tops.length) tops.push({ ...o, kids: [] });
      else tops[tops.length - 1].kids.push(o);
    }
    if (tops.length) {
      outlinesId = add();
      const dest = (o) => `[${ref(pageIds[this.pages.indexOf(o.page)])} /XYZ 0 ${num(o.page.y(o.top))} null]`;
      const ids = tops.map(() => add());
      tops.forEach((o, i) => {
        const kidIds = o.kids.map(() => add());
        o.kids.forEach((k, j) => set(kidIds[j], `<< /Title ${textString(k.title)} /Parent ${ref(ids[i])} /Dest ${dest(k)}`
          + `${j ? ` /Prev ${ref(kidIds[j - 1])}` : ''}${j < kidIds.length - 1 ? ` /Next ${ref(kidIds[j + 1])}` : ''} >>`));
        set(ids[i], `<< /Title ${textString(o.title)} /Parent ${ref(outlinesId)} /Dest ${dest(o)}`
          + `${i ? ` /Prev ${ref(ids[i - 1])}` : ''}${i < ids.length - 1 ? ` /Next ${ref(ids[i + 1])}` : ''}`
          + `${kidIds.length ? ` /First ${ref(kidIds[0])} /Last ${ref(kidIds[kidIds.length - 1])} /Count -${kidIds.length}` : ''} >>`);
      });
      set(outlinesId, `<< /Type /Outlines /First ${ref(ids[0])} /Last ${ref(ids[ids.length - 1])} /Count ${ids.length} >>`);
    }

    set(catalog, `<< /Type /Catalog /Pages ${ref(pagesId)}${this.info.lang ? ` /Lang ${literal(this.info.lang)}` : ''}`
      + ' /ViewerPreferences << /DisplayDocTitle true >>'
      + `${outlinesId ? ` /Outlines ${ref(outlinesId)} /PageMode /UseOutlines` : ''} >>`);
    const d = this.info.date || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    set(infoId, `<< ${['title', 'author', 'subject', 'creator'].filter(k => this.info[k]).map(k => `/${k[0].toUpperCase()}${k.slice(1)} ${textString(this.info[k])}`).join(' ')}`
      + ` /Producer ${textString(this.info.producer || 'DocUp')} /CreationDate (${stamp}) >>`);

    // Сглобяване и таблица с отместванията.
    const chunks = [ascii('%PDF-1.7\n'), new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
    let offset = chunks.reduce((s, c) => s + c.length, 0);
    const offsets = [];
    objs.forEach((body, i) => {
      offsets.push(offset);
      const parts = typeof body === 'string'
        ? [ascii(`${i + 1} 0 obj\n${body}\nendobj\n`)]
        : [ascii(`${i + 1} 0 obj\n${body.dict}\nstream\n`), body.data, ascii('\nendstream\nendobj\n')];
      for (const p of parts) { chunks.push(p); offset += p.length; }
    });
    const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
    const id = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
    chunks.push(ascii(xref + `trailer\n<< /Size ${objs.length + 1} /Root ${ref(catalog)} /Info ${ref(infoId)} /ID [<${id}> <${id}>] >>\nstartxref\n${offset}\n%%EOF\n`));
    return concat(chunks);
  }
}
