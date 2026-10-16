/* Етикети на храните по критериите на ЕС за хранителни претенции (версия 4.15).
 *
 * Регламент (ЕО) № 1924/2006, приложение: „източник на“ и „с високо съдържание на“ фибри,
 * белтък, омега-3, витамини и минерали; „с ниско съдържание на“ натрий, наситени мазнини,
 * захари, мазнини. Значително количество витамин или минерал —
 * 15% от референтната стойност в 100 г (7,5% в 100 мл за напитки), Регламент (ЕС) № 1169/2011,
 * приложение XIII. Тук критериите се прилагат към храната в каталога за ориентация, а не като
 * етикет на продукт. Общо за сървъра и интерфейса. */

import { FOODS, LIQUIDS } from './recipes.js';

/** Референтни стойности за прием (Регламент 1169/2011, приложение XIII, част А). */
export const NRV = { vd: 5, vc: 80, fol: 200, b12: 2.5, k: 2000, ca: 800, mg: 375, fe: 14 };

const NAMES = {
  fiber: 'фибри', protein: 'белтък', n3: 'омега-3', vd: 'витамин D', vc: 'витамин C', fol: 'фолат', b12: 'витамин B12',
  k: 'калий', ca: 'калций', mg: 'магнезий', fe: 'желязо',
};

/** Етикетите на храна: [{ key, level: 'high' | 'source' | 'low' | 'verylow', text }]. */
export function claimsOf(id) {
  const f = FOODS[id];
  const out = [];
  const liquid = LIQUIDS.has(id);
  const per100kcal = (v) => (f.kcal ? (v / f.kcal) * 100 : 0);
  const add = (key, level) => out.push({ key, level, text: claimText(key, level) });
  // Фибри: 6 г / 3 г в 100 г или 3 / 1,5 г в 100 kcal.
  if (f.fib >= 6 || per100kcal(f.fib) >= 3) add('fiber', 'high');
  else if (f.fib >= 3 || per100kcal(f.fib) >= 1.5) add('fiber', 'source');
  // Белтък: 20% / 12% от енергията — само при храните, които са източник на белтък в менюто
  // (листните зеленчуци имат малко енергия и затова висок дял, но не и много белтък).
  const protE = f.kcal ? (f.p * 4) / f.kcal : 0;
  const proteinGroup = ['protein', 'dairy', 'legume', 'grain', 'nuts'].includes(f.cat);
  if (proteinGroup && protE >= 0.2) add('protein', 'high');
  else if (proteinGroup && protE >= 0.12) add('protein', 'source');
  // Омега-3: ALA 0,6 / 0,3 г или EPA+DHA 80 / 40 мг — в 100 г и в 100 kcal.
  const both = (v, min) => v >= min && per100kcal(v) >= min;
  if (both(f.ala || 0, 0.6) || both(f.n3 || 0, 80)) add('n3', 'high');
  else if (both(f.ala || 0, 0.3) || both(f.n3 || 0, 40)) add('n3', 'source');
  // Витамини и минерали: 30% / 15% от референтната стойност в 100 г (напитки — 15% / 7,5% в 100 мл).
  const base = liquid ? 0.075 : 0.15;
  for (const key of ['vd', 'vc', 'fol', 'b12', 'k', 'ca', 'mg', 'fe']) {
    const v = f[key] || 0;
    if (v >= NRV[key] * base * 2) add(key, 'high');
    else if (v >= NRV[key] * base) add(key, 'source');
  }
  // Ниско съдържание — само в групите, където различава храните (зеленчуците и плодовете почти
  // винаги отговарят на критериите и етикетът не помага).
  if (!['dairy', 'protein', 'grain', 'legume', 'other'].includes(f.cat)) return out;
  if (f.na <= 40) add('sodium', 'verylow');
  else if (f.na <= 120) add('sodium', 'low');
  if (f.sfa !== null && f.sfa <= (liquid ? 0.75 : 1.5) && (!f.kcal || (f.sfa * 9) / f.kcal <= 0.1) && f.f > 0.5) add('sfa', 'low');
  if (f.sug !== null && f.sug <= (liquid ? 2.5 : 5) && f.c > 5) add('sugars', 'low');
  if (f.f <= (liquid ? 1.5 : 3) && f.kcal > 0) add('fat', 'low');
  return out;
}

export function claimText(key, level) {
  if (level === 'high') return `богато на ${NAMES[key]}`;
  if (level === 'source') return `източник на ${NAMES[key]}`;
  const what = { sodium: 'натрий', sfa: 'наситени мазнини', sugars: 'захари', fat: 'мазнини' }[key];
  return level === 'verylow' ? `много малко ${what}` : `малко ${what}`;
}

/** Филтрите „богато на …“ в каталога: ключ → етикет. */
export const RICH_FILTERS = ['fiber', 'protein', 'n3', 'k', 'ca', 'mg', 'fe', 'vc', 'fol', 'b12', 'vd'];
