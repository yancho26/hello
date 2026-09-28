/* Проверки на входните данни — общи за всички обработчици. */

import { isValidISO } from '../public/js/shared/dates.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = msg => { throw new HttpError(400, msg); };
export const notFound = msg => { throw new HttpError(404, msg); };

/* Обект или списък на място, където се чака текст или число, би се записал
 * като „[object Object]“ — отказваме го още тук. */
const scalar = (value, field) => {
  if (typeof value === 'object') bad(`Полето „${field}“ има неправилен вид.`);
  return value;
};

/* ------------------------------ проверки ------------------------------- */

export function str(value, field, { required = false, max = 500 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) bad(`Полето „${field}“ е задължително.`);
    return '';
  }
  const s = String(scalar(value, field)).trim();
  if (s.length > max) bad(`Полето „${field}“ е твърде дълго (до ${max} знака).`);
  return s;
}

export function date(value, field, { required = false } = {}) {
  if (!value) {
    if (required) bad(`Полето „${field}“ е задължително.`);
    return '';
  }
  const s = String(scalar(value, field)).trim();
  if (!isValidISO(s)) bad(`„${field}“ не е валидна дата.`);
  return s;
}

export function num(value, field, { min = -Infinity, max = Infinity, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) bad(`Полето „${field}“ е задължително.`);
    return null;
  }
  const n = Number(String(scalar(value, field)).replace(',', '.'));
  if (!Number.isFinite(n)) bad(`„${field}“ трябва да е число.`);
  if (n < min || n > max) bad(`„${field}“ е извън допустимите граници (${min}–${max}).`);
  return n;
}

export function list(value, field, max = 60) {
  if (!value) return [];
  if (!Array.isArray(value)) bad(`„${field}“ трябва да е списък.`);
  if (value.length > max) bad(`Твърде много елементи в „${field}“.`);
  return value.filter(v => typeof v === 'string' || typeof v === 'number')
    .map(v => String(v).trim().slice(0, 200)).filter(Boolean);
}

/** Списък от записи (обекти); празните и неправилните елементи се пропускат. */
export function entries(value) {
  return Array.isArray(value) ? value.filter(v => v && typeof v === 'object' && !Array.isArray(v)) : [];
}


