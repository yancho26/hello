/* Приготвянето на ястието с грамовете на конкретната порция (версия 4.11).
 *
 * В текста на рецептата след първото споменаване на всяка съставка стои маркер {храна}
 * (или {храна1,храна2} — за „зеленчуците“, „всичко“). Маркерът става количеството от плана:
 * „Сварете ориза (45 г сухо тегло, около 130 г след готвене)“. Съставките, които текстът не
 * споменава, и добавените към порцията храни са в последното изречение. Общо за сървъра и
 * интерфейса; работи на български и на английски. */

import { FOODS, LIQUIDS, baseName, rawOf } from './recipes.js';

const WORDS = {
  bg: {
    g: 'г', ml: 'мл', pcs: 'бр.', tbsp: 'с.л.', comma: ',',
    dry: (raw, cooked) => `${raw} г сухо тегло, около ${cooked} г след готвене`,
    raw: (raw, cooked) => `${raw} г сурово тегло, около ${cooked} г след готвене`,
    fat: 'Мазнина за готвене', more: 'Към порцията', swaps: 'Замени', instead: 'вместо',
  },
  en: {
    g: 'g', ml: 'ml', pc: 'pc', pcs: 'pcs', tbsp: 'tbsp', comma: '.',
    dry: (raw, cooked) => `${raw} g dry, about ${cooked} g cooked`,
    raw: (raw, cooked) => `${raw} g raw, about ${cooked} g cooked`,
    fat: 'Cooking fat', more: 'Also for this portion', swaps: 'Swaps', instead: 'instead of',
  },
};

const FATS = new Set(['oil', 'butter', 'sunoil', 'canola', 'flaxoil']);
const MARKER = /\{([a-z0-9]+(?:,[a-z0-9]+)*)\}/g;

/** Количеството на съставка в порцията: „150 г“, „2 бр.“, „10 г, ≈1 с.л.“, „45 г сухо тегло, …“. */
export function quantityText(it, lang = 'bg') {
  const W = WORDS[lang] || WORDS.bg;
  const f = FOODS[it.food];
  const dec = (v) => String(Math.round(v * 10) / 10).replace('.', W.comma);
  if (!it.loose && f.unit?.name === 'бр.' && it.grams >= f.unit.grams * 0.5) {
    const n = Math.max(1, Math.round(it.grams / f.unit.grams));
    return `${n} ${n === 1 && W.pc ? W.pc : W.pcs}`;
  }
  const raw = rawOf(it.food, it.grams);
  if (raw) return raw.kind === 'dry' ? W.dry(raw.grams, it.grams) : W.raw(raw.grams, it.grams);
  if (f.unit?.name === 'с.л.') return `${it.grams} ${W.g}, ≈${dec(it.grams / f.unit.grams)} ${W.tbsp}`;
  return `${it.grams} ${LIQUIDS.has(it.food) ? W.ml : W.g}`;
}

/**
 * Приготвянето с количествата на порцията.
 * template — текстът с маркери; items — съставките ({ food, grams, orig, extra });
 * swaps — [[от, към]]; name(food) — името на храната на езика на плана.
 */
export function renderMethod(template, items, { swaps = [], lang = 'bg', name = baseName } = {}) {
  const W = WORDS[lang] || WORDS.bg;
  const used = new Set();
  const pool = items.filter(it => !it.extra);
  const withName = (it) => `${name(it.food)} ${quantityText(it, lang)}`;
  let text = String(template || '').replace(MARKER, (m, list, at, all) => {
    const its = list.split(',').map(f => pool.find(it => !used.has(it) && (it.orig || it.food) === f)).filter(Boolean);
    if (!its.length) return '';
    its.forEach(it => used.add(it));
    const it = its[0];
    const swapped = it.orig && it.orig !== it.food;
    const q = its.length > 1 ? its.map(withName).join(', ') : swapped ? withName(it) : quantityText(it, lang);
    // Вътре в скоби количеството се добавя със запетая: „(или орехи, 10 г)“.
    return all[at + m.length] === ')' ? `, ${q}` : ` (${q})`;
  }).trim();
  const rest = items.filter(it => !used.has(it));
  const fats = rest.filter(it => FATS.has(it.food) && !it.extra);
  const more = rest.filter(it => !fats.includes(it));
  const end = (s) => (/[.!?…]$/.test(s) ? s : `${s}.`);
  if (text) text = end(text);
  if (fats.length) text += ` ${W.fat}: ${fats.map(withName).join(', ')}.`;
  if (more.length) text += ` ${W.more}: ${more.map(withName).join(', ')}.`;
  if (swaps.length) text += ` ${W.swaps}: ${swaps.map(([from, to]) => `${name(to)} ${W.instead} ${name(from)}`).join(', ')}.`;
  return text.trim();
}

/** Текстът на рецептата без маркерите — за търсене и проверки. */
export const plainMethod = (template) => String(template || '').replace(MARKER, '');
