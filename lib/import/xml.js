/* Малки помощници за XML и HTML — достатъчни за таблиците от Excel,
 * LibreOffice и уеб програмите. Не е пълен XML парсер. */

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Декодира &amp; &#1040; &#x410; и т.н. */
export function decodeEntities(s) {
  if (!s || s.indexOf('&') < 0) return s || '';
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    const v = NAMED[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

/** Атрибутите на таг като обект; представката (ss:, table:) се запазва и в двата вида. */
export function attrs(tagText) {
  const out = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(tagText))) {
    const value = decodeEntities(m[3] !== undefined ? m[3] : m[4]);
    out[m[1]] = value;
    const bare = m[1].includes(':') ? m[1].slice(m[1].indexOf(':') + 1) : null;
    if (bare && out[bare] === undefined) out[bare] = value;
  }
  return out;
}

/** Текстът между таговете, без самите тагове. */
export function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ''));
}

/** Код от OOXML като _x000D_ → знакът. */
export function decodeOoxmlEscapes(s) {
  return s.indexOf('_x') < 0 ? s : s.replace(/_x([0-9a-fA-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Шаблон, който приема таг с или без представка (x:row, row), но не и по-дълго име (row-group). */
export const tag = (name) => `(?:[\\w-]+:)?${name}(?=[\\s/>])`;
