/* Иконките на интерфейса (версия 5.0).
 *
 * Един комплект с еднаква дебелина на линията, начертан за програмата: менюто, бутоните и
 * бързото търсене изглеждат еднакво на всеки компютър, независимо какви емоджита има системата.
 * Всяка иконка е списък от части в мрежа 24×24: низ — път (атрибутът d), масив — друг елемент
 * на SVG с атрибутите му. Цветът идва от текста (currentColor). */

const NS = 'http://www.w3.org/2000/svg';

export const ICONS = {
  /* меню */
  dashboard: [['rect', { x: 3.5, y: 3.5, width: 7, height: 9, rx: 2 }], ['rect', { x: 13.5, y: 3.5, width: 7, height: 5, rx: 2 }],
    ['rect', { x: 13.5, y: 11.5, width: 7, height: 9, rx: 2 }], ['rect', { x: 3.5, y: 15.5, width: 7, height: 5, rx: 2 }]],
  patients: [['circle', { cx: 9, cy: 8, r: 3.4 }], 'M2.8 19.5v-.8a5 5 0 0 1 5-5h2.4a5 5 0 0 1 5 5v.8', 'M15.6 4.9a3.4 3.4 0 0 1 0 6.2', 'M17.8 13.9a5 5 0 0 1 3.4 4.8v.8'],
  calendar: [['rect', { x: 3.5, y: 5, width: 17, height: 15.5, rx: 2.6 }], 'M3.5 10h17', 'M8 3v4', 'M16 3v4', 'M8 14h2.5', 'M13.5 14H16', 'M8 17h2.5'],
  agenda: [['circle', { cx: 12, cy: 12, r: 8.6 }], 'M12 7.2V12l3.2 2'],
  assistant: [['circle', { cx: 12, cy: 12, r: 8.6 }], 'M15.6 8.4l-1.9 5.3-5.3 1.9 1.9-5.3z'],
  nutrition: ['M12 7.6c-1.7-2-5.2-1.9-6.8 1-1.7 3.2.1 8.7 2.9 10.7 1.3.9 2.5.5 3.9-.1 1.4.6 2.6 1 3.9.1 2.8-2 4.6-7.5 2.9-10.7-1.6-2.9-5.1-3-6.8-1z', 'M12 7.6c-.1-1.9.7-3.5 2.4-4.4'],
  reports: ['M4 20h16', 'M7.5 20v-6.5', 'M12 20V5.5', 'M16.5 20v-10'],
  settings: [['circle', { cx: 12, cy: 12, r: 2.9 }],
    'M12 2.8l1.2 2.5 2.5-.9 1 2.5 2.7.3-.2 2.7 2.3 1.3-1.4 2.3 1.4 2.3-2.3 1.3.2 2.7-2.7.3-1 2.5-2.5-.9-1.2 2.5-1.2-2.5-2.5.9-1-2.5-2.7-.3.2-2.7-2.3-1.3 1.4-2.3-1.4-2.3 2.3-1.3-.2-2.7 2.7-.3 1-2.5 2.5.9z'],
  more: [['circle', { cx: 5.5, cy: 12, r: 1.3, fill: 'currentColor' }], ['circle', { cx: 12, cy: 12, r: 1.3, fill: 'currentColor' }], ['circle', { cx: 18.5, cy: 12, r: 1.3, fill: 'currentColor' }]],

  /* действия */
  search: [['circle', { cx: 10.8, cy: 10.8, r: 6.6 }], 'M20.2 20.2l-4.6-4.6'],
  plus: ['M12 5v14', 'M5 12h14'],
  check: ['M4.8 12.6l4.6 4.6L19.4 7'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  edit: ['M4 20h4.2L19.4 8.8a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8z', 'M13.6 6.2l4.2 4.2'],
  printer: ['M7 9V3.8h10V9', ['rect', { x: 3.5, y: 9, width: 17, height: 8.5, rx: 2.2 }], ['rect', { x: 7, y: 14, width: 10, height: 6.5, rx: 1 }], 'M16.6 12h.9'],
  download: ['M12 3.8v11', 'M7.4 10.6l4.6 4.6 4.6-4.6', 'M4.5 19.6h15'],
  upload: ['M12 15.2v-11', 'M7.4 8.6L12 4l4.6 4.6', 'M4.5 19.6h15'],
  up: ['M12 19V5.5', 'M6.5 11L12 5.5 17.5 11'],
  down: ['M12 5v13.5', 'M6.5 13l5.5 5.5 5.5-5.5'],
  refresh: ['M19.6 12a7.6 7.6 0 1 1-2.3-5.4', 'M19.8 3.6v4.2h-4.2'],
  back: ['M19 12H5.5', 'M11 6.5L5.5 12l5.5 5.5'],
  undo: ['M8.6 14.4L4 9.8l4.6-4.6', 'M4.4 9.8h9.4a6.2 6.2 0 0 1 0 12.4H11'],
  file: ['M13.6 3.5H7.2a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9.6a2 2 0 0 0 2-2V8.7z', 'M13.4 3.6v5.3h5.3', 'M8.6 13h6.8', 'M8.6 16.5h6.8'],
  clipboard: [['rect', { x: 5, y: 4.6, width: 14, height: 16, rx: 2.2 }], ['rect', { x: 9, y: 2.8, width: 6, height: 3.8, rx: 1.2 }], 'M8.6 11.5h6.8', 'M8.6 15.4h6.8'],
  save: ['M5.5 3.8h10.9l3.8 3.8v10.9a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V5.8a2 2 0 0 1 2-2z', 'M7.6 3.9v5.2h7.6V3.9', ['rect', { x: 7.4, y: 13, width: 9.2, height: 7.4, rx: 1 }]],
  bell: ['M6 16.6V11a6 6 0 0 1 12 0v5.6l1.6 2H4.4z', 'M10 20.6a2.2 2.2 0 0 0 4 0'],
  cart: ['M3 4.2h2.6l2.3 10.6h9.9l2-7.4H6.6', ['circle', { cx: 9.2, cy: 19, r: 1.4 }], ['circle', { cx: 16.8, cy: 19, r: 1.4 }]],
  utensils: ['M7.4 3.2v6.6a2.2 2.2 0 0 0 4.4 0V3.2', 'M9.6 3.2V21', 'M17.6 21v-7.4h-2.9c0-5.1 1-8.8 2.9-10.4z'],
  sparkle: ['M12 3.4l1.9 5.3 5.3 1.9-5.3 1.9-1.9 5.3-1.9-5.3-5.3-1.9 5.3-1.9z', 'M18.6 16.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z'],
  swap: ['M4 8.4h15', 'M15.2 4.6L19 8.4l-3.8 3.8', 'M20 15.6H5', 'M8.8 11.8L5 15.6l3.8 3.8'],
  power: ['M12 3.4v8', 'M6.6 6.6a7.8 7.8 0 1 0 10.8 0'],
  logout: ['M10 4.2H6.4a2 2 0 0 0-2 2v11.6a2 2 0 0 0 2 2H10', 'M15.4 7.6L19.8 12l-4.4 4.4', 'M19.6 12H9.4'],

  /* изглед */
  sun: [['circle', { cx: 12, cy: 12, r: 3.9 }], 'M12 2.8v2.2', 'M12 19v2.2', 'M2.8 12H5', 'M19 12h2.2', 'M5.5 5.5L7 7', 'M17 17l1.5 1.5', 'M5.5 18.5L7 17', 'M17 7l1.5-1.5'],
  moon: ['M20 14.4A8.4 8.4 0 1 1 9.6 4a6.6 6.6 0 0 0 10.4 10.4z'],
  monitor: [['rect', { x: 3, y: 4.4, width: 18, height: 12.2, rx: 2.2 }], 'M8.6 20.2h6.8', 'M12 16.8v3.2'],
  sidebar: [['rect', { x: 3.4, y: 4.4, width: 17.2, height: 15.2, rx: 2.6 }], 'M9.4 4.6v14.8'],
  keyboard: [['rect', { x: 2.8, y: 6, width: 18.4, height: 12, rx: 2.4 }], 'M6.6 10h.6', 'M10 10h.6', 'M13.4 10h.6', 'M16.8 10h.6', 'M7.6 14.2h8.8'],
  help: [['circle', { cx: 12, cy: 12, r: 8.6 }], 'M9.6 9.6a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.2 1-1.2 1.9', 'M12 16.7v.3'],
  user: [['circle', { cx: 12, cy: 8.2, r: 3.7 }], 'M4.8 20v-.6a5.6 5.6 0 0 1 5.6-5.6h3.2a5.6 5.6 0 0 1 5.6 5.6v.6'],
  phone: ['M5.2 3.8h3.2l1.6 4.2-2 1.4a12 12 0 0 0 6.6 6.6l1.4-2 4.2 1.6v3.2a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 3.2 6a2 2 0 0 1 2-2.2z'],
  alert: ['M12 3.6l9.2 16H2.8z', 'M12 10v4.6', 'M12 17.4v.2'],
  info: [['circle', { cx: 12, cy: 12, r: 8.6 }], 'M12 11v5.4', 'M12 7.8v.2'],
  chevronLeft: ['M14.6 5.6L8.2 12l6.4 6.4'],
  chevronRight: ['M9.4 5.6l6.4 6.4-6.4 6.4'],
  chevronDown: ['M5.6 9.2l6.4 6.4 6.4-6.4'],
  enter: ['M19 5.4v6.2a3 3 0 0 1-3 3H5.6', 'M9.6 10.6l-4 4 4 4'],
  clock: [['circle', { cx: 12, cy: 12, r: 8.6 }], 'M12 7.2V12l3.2 2'],
  home: ['M4 10.6L12 4l8 6.6V19a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 19z', 'M9.6 20.2v-6h4.8v6'],
};

/**
 * Иконка по име: icon('search'), icon('plus', { size: 16 }).
 * Връща елемент <svg class="ico">; непознато име дава празна иконка, не грешка.
 */
export function icon(name, { size = 20, stroke = 1.8, cls = '' } = {}) {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('width', size);
  el.setAttribute('height', size);
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', stroke);
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
  for (const part of ICONS[name] || []) {
    if (typeof part === 'string') {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', part);
      el.appendChild(p);
    } else {
      const [tag, attrs] = part;
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      el.appendChild(node);
    }
  }
  return el;
}

/* Знаците, с които започват надписите на бутоните („＋ Нов пациент“, „🖨 Печат“), и иконката за всеки.
 * Знакът остава в кода на изгледите; при показване се заменя с иконка от комплекта (ui/dom.js). */
export const GLYPH_ICONS = {
  '＋': 'plus', '+': 'plus', '✓': 'check', '✎': 'edit', '🖨': 'printer', '⭳': 'download', '⭱': 'upload',
  '⬇': 'down', '⬆': 'up', '↻': 'refresh', '←': 'back', '↩': 'undo', '📄': 'file', '📋': 'clipboard', '💾': 'save',
  '🔔': 'bell', '🛒': 'cart', '🍽': 'utensils', '✨': 'sparkle', '⇄': 'swap', '⏻': 'power', '⌕': 'search',
};

const GLYPH_RE = new RegExp('^(' + Object.keys(GLYPH_ICONS).map(g => g.replace(/[+]/g, '\\$&')).join('|') + ')\\uFE0F?(\\s+|$)');

/** Ако текстът започва с познат знак: { name, rest } — иконката и остатъкът от надписа; иначе null. */
export function splitGlyph(text) {
  const m = GLYPH_RE.exec(String(text));
  return m ? { name: GLYPH_ICONS[m[1]], rest: String(text).slice(m[0].length) } : null;
}
