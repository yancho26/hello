/* ЕГН — извличане на дата на раждане и пол, проверка на контролната цифра. */

import { daysInMonth } from './dates.js';

const WEIGHTS = [2, 4, 8, 5, 10, 9, 7, 3, 6];

/** Контролната цифра по официалния алгоритъм. */
export function checksumValid(egn) {
  if (!/^\d{10}$/.test(egn)) return false;
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(egn[i]), 0);
  return (sum % 11) % 10 === Number(egn[9]);
}

/** Дата на раждане като ISO низ, или null при невалидно ЕГН.
 *  Месецът носи века: +20 за 1800-1899, +40 за 2000-2099. */
export function birthDate(egn) {
  if (!/^\d{10}$/.test(egn)) return null;
  let year = Number(egn.slice(0, 2));
  let month = Number(egn.slice(2, 4));
  const day = Number(egn.slice(4, 6));
  if (month >= 41 && month <= 52) { year += 2000; month -= 40; }
  else if (month >= 21 && month <= 32) { year += 1800; month -= 20; }
  else if (month >= 1 && month <= 12) { year += 1900; }
  else return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 'm' | 'f' — деветата цифра е четна за момче, нечетна за момиче. */
export function sex(egn) {
  if (!/^\d{10}$/.test(egn)) return null;
  return Number(egn[8]) % 2 === 0 ? 'm' : 'f';
}

/** Пълен разбор: { birthDate, sex, valid }. */
export function parse(egn) {
  const clean = String(egn || '').replace(/\D/g, '');
  if (clean.length !== 10) return null;
  const bd = birthDate(clean);
  if (!bd) return null;
  return { egn: clean, birthDate: bd, sex: sex(clean), valid: checksumValid(clean) };
}
