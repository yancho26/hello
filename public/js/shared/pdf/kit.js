/* Оформление върху PDF писателя: текст с пренасяне и смесени шрифтове, поток от блокове
 * с нови страници, заглавия, плочки, етикети, списъци, колони и таблици. */

export const C = {
  ink: '#1b1b2f', ink2: '#5d5f78', ink3: '#8a8ca3', line: '#e2e2ec', bg: '#f6f6fb', white: '#ffffff',
  brand: '#6159c4', brandDark: '#4b4aa6', brandSoft: '#efeefb',
  teal: '#0f8f7e', tealSoft: '#e0f4f0',
  green: '#2f8a5b', greenSoft: '#e3f3ea',
  amber: '#b7791f', amberSoft: '#fdf0d9',
  red: '#c62828', redSoft: '#fdeceb',
  sky: '#2f80c9', skySoft: '#e6f0fb',
  coral: '#e2622b', coralSoft: '#fdebe2',
  rose: '#c94a5b', roseSoft: '#fbe6e9',
  slate: '#5d6b85', slateSoft: '#e9edf3',
};

/* ------------------------------------ текст ------------------------------------ */

/** Части текст → редове до ширина width. runs: низ или [{ text, font, color, url }]. */
export function wrap(doc, runs, width, size, { font = 'regular', color = C.ink } = {}) {
  const parts = (typeof runs === 'string' ? [{ text: runs }] : runs).filter(r => r && r.text);
  const lines = [];
  let segs = [];
  let w = 0;
  let space = null;
  const flush = () => { lines.push({ segs, w }); segs = []; w = 0; space = null; };
  const push = (text, style, tw) => {
    const last = segs[segs.length - 1];
    if (last && last.font === style.font && last.color === style.color && last.url === style.url) { last.text += text; last.w += tw; } else segs.push({ ...style, text, x: w, w: tw });
    w += tw;
  };
  for (const r of parts) {
    const style = { font: r.font || font, color: r.color || color, url: r.url || null };
    for (const tok of String(r.text).replace(/\s+/g, ' ').split(/( )/)) {
      if (!tok) continue;
      if (tok === ' ') { if (segs.length) space = style; continue; }
      const tw = doc.width(tok, style.font, size);
      const sw = space ? doc.width(' ', space.font, size) : 0;
      if (segs.length && w + sw + tw > width) flush();
      if (space && segs.length) push(' ', space, sw);
      space = null;
      if (tw <= width) { push(tok, style, tw); continue; }
      // Дума, по-дълга от реда, се разделя по знаци.
      let chunk = '';
      for (const ch of tok) {
        const cw = doc.width(chunk + ch, style.font, size);
        if (chunk && w + cw > width) { push(chunk, style, doc.width(chunk, style.font, size)); flush(); chunk = ''; }
        chunk += ch;
      }
      if (chunk) push(chunk, style, doc.width(chunk, style.font, size));
    }
  }
  if (segs.length) flush();
  return lines;
}

/** Рисува редовете; y — горният край. Връща височината. */
export function drawLines(page, lines, x, y, size, { lh = 1.38, align = 'left', width = 0 } = {}) {
  lines.forEach((ln, i) => {
    const base = y + i * size * lh + size * 1.02;
    const dx = align === 'center' ? (width - ln.w) / 2 : align === 'right' ? width - ln.w : 0;
    for (const s of ln.segs) {
      const text = s.text.replace(/ +$/, '');
      page.text(text, x + dx + s.x, base, { font: s.font, size, color: s.color });
      if (s.url) page.link(x + dx + s.x, base - size, s.w, size * 1.3, s.url);
    }
  });
  return lines.length * size * lh;
}

/** Блок текст: { h, draw(page, x, y) }. */
export function textBlock(doc, runs, width, { size = 9, font, color, lh = 1.38, align = 'left', after = 0 } = {}) {
  const lines = wrap(doc, runs, width, size, { font, color });
  return { h: lines.length * size * lh + after, draw: (page, x, y) => drawLines(page, lines, x, y, size, { lh, align, width }) };
}

/* ----------------------------------- поток ----------------------------------- */

/** Поток от блокове отгоре надолу; при нужда — нова страница с горен колонтитул. */
export class Flow {
  constructor(doc, { margin = 40, top = 58, bottom = 52, header = null } = {}) {
    this.doc = doc;
    this.margin = margin;
    this.top = top;
    this.bottom = bottom;
    this.header = header;
    this.section = '';
    this.page = null;
    this.y = 0;
  }

  get x() { return this.margin; }
  get width() { return this.page.w - 2 * this.margin; }
  get limit() { return this.page.h - this.bottom; }
  get room() { return this.limit - this.y; }

  newPage({ first = false } = {}) {
    this.page = this.doc.addPage();
    this.y = first ? this.margin : this.top;
    if (!first && this.header) this.header(this.page, this.section);
    return this.page;
  }

  /** Достатъчно място за h точки; иначе нова страница. */
  need(h) {
    if (this.y + h > this.limit && this.y > this.top + 1) this.newPage();
    return this;
  }

  space(h) { this.y += h; return this; }

  /** Добавя блок (с нова страница, ако не се побира). */
  add(block, { gap = 0, x = this.x } = {}) {
    if (!block) return this;
    this.need(block.h);
    block.draw(this.page, x, this.y);
    this.y += block.h + gap;
    return this;
  }

  /** Текст, който може да се разделя на страници ред по ред. */
  text(runs, { size = 9, font, color, lh = 1.38, x = this.x, width = this.width, after = 4 } = {}) {
    const lines = wrap(this.doc, runs, width, size, { font, color });
    for (const ln of lines) {
      this.need(size * lh);
      drawLines(this.page, [ln], x, this.y, size, { lh });
      this.y += size * lh;
    }
    this.y += after;
    return this;
  }
}

/* ---------------------------------- елементи ---------------------------------- */

/** Етикет със заоблени краища. Връща ширината. */
export function chip(page, doc, text, x, y, { fg = C.brand, bg = C.brandSoft, size = 7.5, font = 'semibold', padX = 6, h = null } = {}) {
  const w = doc.width(text, font, size) + padX * 2;
  const hh = h || size * 1.9;
  page.rect(x, y, w, hh, { fill: bg, radius: hh / 2 });
  page.text(text, x + padX, y + hh / 2 + size * 0.36, { font, size, color: fg });
  return w;
}
export const chipWidth = (doc, text, { size = 7.5, font = 'semibold', padX = 6 } = {}) => doc.width(text, font, size) + padX * 2;

/** Етикети на редове в ширина width. Връща { h, draw }. */
export function chipRow(doc, items, width, { size = 7.5, gap = 5, rowGap = 5 } = {}) {
  const hh = size * 1.9;
  const placed = [];
  let x = 0;
  let row = 0;
  for (const it of items) {
    const w = chipWidth(doc, it.text, { size });
    if (x && x + w > width) { x = 0; row++; }
    placed.push({ ...it, x, row });
    x += w + gap;
  }
  const rows = placed.length ? row + 1 : 0;
  return {
    h: rows ? rows * hh + (rows - 1) * rowGap : 0,
    draw: (page, x0, y0) => placed.forEach(it => chip(page, doc, it.text, x0 + it.x, y0 + it.row * (hh + rowGap), { size, fg: it.fg, bg: it.bg })),
  };
}

/** Списък с точки. color — цветът на точката. */
export function bullets(doc, items, width, { size = 8.5, color = C.brand, gap = 3, lh = 1.36 } = {}) {
  const blocks = (items || []).filter(Boolean).map(it => textBlock(doc, it, width - 11, { size, lh }));
  return {
    h: blocks.reduce((s, b) => s + b.h + gap, 0),
    blocks,
    draw: (page, x, y) => {
      let yy = y;
      for (const b of blocks) {
        page.circle(x + 3, yy + size * 0.68, 1.7, { fill: color });
        b.draw(page, x + 11, yy);
        yy += b.h + gap;
      }
    },
  };
}

/** Колони от блокове с еднаква ширина. Връща { h, draw }. */
export function columns(blocks, width, gap = 14) {
  const list = blocks.filter(Boolean);
  const w = (width - gap * (list.length - 1)) / list.length;
  return { w, h: Math.max(0, ...list.map(b => b.h)), draw: (page, x, y) => list.forEach((b, i) => b.draw(page, x + i * (w + gap), y)) };
}

/** Карта с цветна лента отгоре и заглавие; content — функция (ширина) → блок. */
export function card(doc, title, width, content, { color = C.brand, soft = C.brandSoft, pad = 10, icon = null } = {}) {
  const inner = content(width - 2 * pad);
  const head = 22;
  return {
    h: head + pad + inner.h + pad - 4,
    draw: (page, x, y) => {
      const h = head + pad + inner.h + pad - 4;
      page.rect(x, y, width, h, { fill: C.white, stroke: C.line, lineWidth: 0.6, radius: 8 });
      page.rect(x, y, width, head, { fill: soft, radius: [8, 8, 0, 0] });
      page.rect(x, y + head - 2, width, 2, { fill: color });
      let tx = x + pad;
      if (icon) {
        page.text(icon, tx, y + 15, { font: 'bold', size: 9, color });
        tx += doc.width(icon, 'bold', 9) + 5;
      }
      page.text(title, tx, y + 15, { font: 'bold', size: 9, color });
      inner.draw(page, x + pad, y + head + pad);
    },
  };
}

/** Квадратче за отметка. */
export function checkbox(page, x, y, s = 7, color = C.ink3) {
  page.rect(x, y, s, s, { stroke: color, lineWidth: 0.7, radius: 1.5 });
}
