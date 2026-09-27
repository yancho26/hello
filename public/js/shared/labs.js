/* Изследвания: каталог, мерни единици, референтни граници и изчислени стойности.
 *
 * Стойностите се пазят в една (основна) единица — тази, която ползват
 * българските лаборатории (SI). При въвеждане може да се избере и друга
 * единица — тя се преобразува в основната.
 *
 * Референтните граници са ориентировъчни за възрастни. Границите на
 * конкретната лаборатория имат предимство — затова отклонението се
 * отбелязва само като подсказка, а не като диагноза.
 */

import { ageInMonthsExact } from './dates.js';
import { egfrCkdEpi2021 } from './clinical.js';

const conv = (unit, toBase, fromBase) => ({ unit, toBase, fromBase });
const factor = (unit, f) => conv(unit, v => v * f, v => v / f);

/**
 * Полета: name, short, unit (основна), decimals, range [долна, горна] или
 * rangeBySex { m: [..], f: [..] }, min/max (допустими при въвеждане),
 * alt — други единици, group — за подреждане.
 */
export const LABS = {
  hba1c: {
    name: 'HbA1c (гликиран хемоглобин)', short: 'HbA1c', unit: '%', decimals: 1,
    range: [4.0, 5.6], min: 3, max: 20, group: 'glucose',
    alt: [conv('mmol/mol', v => v / 10.929 + 2.15, v => (v - 2.15) * 10.929)],
    note: '5,7–6,4% — предиабет; ≥6,5% — диабет (при потвърждение).',
  },
  glucose: {
    name: 'Глюкоза на гладно', short: 'Глюкоза', unit: 'mmol/L', decimals: 1,
    range: [3.9, 5.5], min: 1, max: 40, group: 'glucose',
    alt: [factor('mg/dL', 1 / 18.016)],
    note: '5,6–6,9 mmol/L — нарушена гликемия на гладно; ≥7,0 — диабет (при потвърждение).',
  },
  tchol: {
    name: 'Общ холестерол', short: 'Общ хол.', unit: 'mmol/L', decimals: 2,
    range: [0, 5.2], min: 1, max: 20, group: 'lipids', alt: [factor('mg/dL', 1 / 38.67)],
  },
  ldl: {
    name: 'LDL-холестерол', short: 'LDL', unit: 'mmol/L', decimals: 2,
    range: [0, 3.0], min: 0.1, max: 15, group: 'lipids', alt: [factor('mg/dL', 1 / 38.67)],
    note: 'Целевата стойност зависи от сърдечно-съдовия риск (ESC/EAS).',
  },
  hdl: {
    name: 'HDL-холестерол', short: 'HDL', unit: 'mmol/L', decimals: 2,
    rangeBySex: { m: [1.0, 99], f: [1.2, 99] }, min: 0.1, max: 5, group: 'lipids',
    alt: [factor('mg/dL', 1 / 38.67)],
  },
  tg: {
    name: 'Триглицериди', short: 'ТГ', unit: 'mmol/L', decimals: 2,
    range: [0, 1.7], min: 0.1, max: 50, group: 'lipids', alt: [factor('mg/dL', 1 / 88.57)],
  },
  creat: {
    name: 'Креатинин', short: 'Креатинин', unit: 'µmol/L', decimals: 0,
    rangeBySex: { m: [62, 106], f: [44, 80] }, min: 20, max: 2000, group: 'renal',
    alt: [factor('mg/dL', 88.4)],
    note: 'От креатинина се изчислява eGFR по CKD-EPI 2021.',
  },
  egfr: {
    name: 'eGFR (изчислена гломерулна филтрация)', short: 'eGFR', unit: 'mL/min/1,73 m²', decimals: 0,
    range: [60, 200], min: 1, max: 200, group: 'renal',
    note: 'Изчислява се автоматично от креатинина, ако не е въведена отделно.',
  },
  uacr: {
    name: 'Албумин/креатинин в урина (UACR)', short: 'UACR', unit: 'mg/mmol', decimals: 1,
    range: [0, 3], min: 0, max: 1000, group: 'renal', alt: [factor('mg/g', 0.113)],
    note: 'A1 <3; A2 3–30; A3 >30 mg/mmol (KDIGO).',
  },
  k: {
    name: 'Калий', short: 'K⁺', unit: 'mmol/L', decimals: 1,
    range: [3.5, 5.1], min: 1, max: 10, group: 'renal',
  },
  na: {
    name: 'Натрий', short: 'Na⁺', unit: 'mmol/L', decimals: 0,
    range: [135, 145], min: 100, max: 180, group: 'renal',
  },
  alt: {
    name: 'АЛАТ', short: 'АЛАТ', unit: 'U/L', decimals: 0,
    rangeBySex: { m: [0, 41], f: [0, 33] }, min: 1, max: 5000, group: 'liver',
  },
  ast: {
    name: 'АСАТ', short: 'АСАТ', unit: 'U/L', decimals: 0,
    rangeBySex: { m: [0, 40], f: [0, 32] }, min: 1, max: 5000, group: 'liver',
  },
  tsh: {
    name: 'TSH', short: 'TSH', unit: 'mIU/L', decimals: 2,
    range: [0.4, 4.0], min: 0.001, max: 200, group: 'thyroid',
  },
  ft4: {
    name: 'fT4', short: 'fT4', unit: 'pmol/L', decimals: 1,
    range: [12, 22], min: 1, max: 150, group: 'thyroid',
  },
  hb: {
    name: 'Хемоглобин', short: 'Hb', unit: 'g/L', decimals: 0,
    rangeBySex: { m: [130, 170], f: [120, 150] }, min: 30, max: 250, group: 'blood',
    alt: [factor('g/dL', 10)],
  },
  plt: {
    name: 'Тромбоцити', short: 'Тромб.', unit: '×10⁹/L', decimals: 0,
    range: [150, 400], min: 1, max: 2000, group: 'blood',
  },
  wbc: {
    name: 'Левкоцити', short: 'Левк.', unit: '×10⁹/L', decimals: 1,
    range: [4.0, 10.0], min: 0.1, max: 300, group: 'blood',
  },
  ferritin: {
    name: 'Феритин', short: 'Феритин', unit: 'µg/L', decimals: 0,
    rangeBySex: { m: [30, 400], f: [15, 150] }, min: 1, max: 20000, group: 'blood',
  },
  b12: {
    name: 'Витамин B12', short: 'B12', unit: 'pmol/L', decimals: 0,
    range: [150, 700], min: 10, max: 5000, group: 'blood', alt: [factor('pg/mL', 0.738)],
  },
  vitd: {
    name: '25-OH витамин D', short: 'Вит. D', unit: 'nmol/L', decimals: 0,
    range: [50, 125], min: 1, max: 500, group: 'other', alt: [factor('ng/mL', 2.496)],
  },
  urate: {
    name: 'Пикочна киселина', short: 'Пик. к-на', unit: 'µmol/L', decimals: 0,
    rangeBySex: { m: [200, 420], f: [140, 360] }, min: 30, max: 1500, group: 'other',
    alt: [factor('mg/dL', 59.48)],
    note: 'Цел при подагра <360 µmol/L, при тофи <300 (EULAR).',
  },
  inr: {
    name: 'INR', short: 'INR', unit: '', decimals: 1,
    range: [0.8, 1.2], min: 0.5, max: 15, group: 'blood',
    note: 'При варфарин/аценокумарол целта обикновено е 2,0–3,0.',
  },
  lithium: {
    name: 'Литий (серумно ниво)', short: 'Литий', unit: 'mmol/L', decimals: 2,
    range: [0.4, 1.0], min: 0.05, max: 5, group: 'other',
  },
  psa: {
    name: 'PSA', short: 'PSA', unit: 'ng/mL', decimals: 2,
    range: [0, 4], min: 0, max: 5000, group: 'other',
  },
  ntprobnp: {
    name: 'NT-proBNP', short: 'NT-proBNP', unit: 'pg/mL', decimals: 0,
    range: [0, 125], min: 0, max: 100000, group: 'other',
  },
  crp: {
    name: 'C-реактивен протеин', short: 'CRP', unit: 'mg/L', decimals: 1,
    range: [0, 5], min: 0, max: 600, group: 'other',
  },
};

/** Качествени изследвания и прегледи — отбелязват се с дата и заключение. */
export const CHECKS = {
  eye: { name: 'Преглед на очни дъна', short: 'Очни дъна', note: 'Скрининг за диабетна ретинопатия.' },
  foot: { name: 'Преглед на стъпалата', short: 'Стъпала', note: 'Чувствителност (монофиламент), пулсации, кожа.' },
  ecg: { name: 'ЕКГ', short: 'ЕКГ' },
  spiro: { name: 'Спирометрия', short: 'Спирометрия' },
  echo: { name: 'Ехокардиография', short: 'Ехо КГ' },
  dxa: { name: 'Костна плътност (DXA)', short: 'DXA' },
  fit: { name: 'Имунохимичен тест за окултно кървене (FIT)', short: 'FIT' },
  mammo: { name: 'Мамография', short: 'Мамография' },
  cervical: { name: 'Цитонамазка / HPV тест', short: 'Цитонамазка' },
  inhaler: { name: 'Проверка на инхалаторната техника', short: 'Инхалатор' },
};

export const LAB_GROUPS = {
  glucose: 'Въглехидратна обмяна',
  lipids: 'Липиди',
  renal: 'Бъбреци и електролити',
  liver: 'Черен дроб',
  thyroid: 'Щитовидна жлеза',
  blood: 'Кръвна картина и съсирване',
  other: 'Други',
};

export const isCheck = (code) => Object.prototype.hasOwnProperty.call(CHECKS, code);
export const labName = (code) => (LABS[code] || CHECKS[code] || { name: code }).name;
export const labShort = (code) => (LABS[code] || CHECKS[code] || { short: code }).short;

/** Всички единици, в които може да се въведе изследването (основната — първа). */
export function unitsFor(code) {
  const lab = LABS[code];
  if (!lab) return [];
  return [lab.unit, ...(lab.alt || []).map(a => a.unit)];
}

/** Преобразува въведена стойност в основната единица. */
export function toBaseUnit(code, value, unit) {
  const lab = LABS[code];
  if (!lab || !unit || unit === lab.unit) return value;
  const alt = (lab.alt || []).find(a => a.unit === unit);
  if (!alt) throw new Error(`Непозната мерна единица „${unit}“ за ${lab.name}.`);
  return alt.toBase(value);
}

export function fromBaseUnit(code, value, unit) {
  const lab = LABS[code];
  if (!lab || !unit || unit === lab.unit) return value;
  const alt = (lab.alt || []).find(a => a.unit === unit);
  return alt ? alt.fromBase(value) : value;
}

export function round(value, decimals = 1) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function formatLab(code, value) {
  const lab = LABS[code];
  if (value === null || value === undefined || !lab) return '—';
  const text = round(value, lab.decimals ?? 1).toFixed(lab.decimals ?? 1).replace('.', ',');
  return lab.unit ? `${text} ${lab.unit}` : text;
}

export function rangeFor(code, sex) {
  const lab = LABS[code];
  if (!lab) return null;
  if (lab.rangeBySex) return lab.rangeBySex[sex] || lab.rangeBySex.m;
  return lab.range || null;
}

/** 'H' — над границата, 'L' — под нея, null — в граници или без граници. */
export function flagFor(code, value, sex) {
  const r = rangeFor(code, sex);
  if (!r || value === null || value === undefined) return null;
  if (value > r[1]) return 'H';
  if (value < r[0]) return 'L';
  return null;
}

/** Всички резултати за едно изследване, от най-стария към най-новия. */
export function resultSeries(results, code) {
  return (results || [])
    .filter(r => r.code === code && (isCheck(code) || Number.isFinite(r.value)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function latestResult(results, code) {
  const s = resultSeries(results, code);
  return s.length ? s[s.length - 1] : null;
}

/**
 * eGFR от креатинина (CKD-EPI 2021) за всеки резултат, за който няма
 * отделно въведена eGFR. Възрастта е към датата на изследването.
 */
export function egfrSeries(patient) {
  const results = patient.results || [];
  const byDate = new Map();
  for (const r of resultSeries(results, 'egfr')) byDate.set(r.date, { date: r.date, value: r.value, source: 'lab' });
  for (const r of resultSeries(results, 'creat')) {
    if (byDate.has(r.date) || !patient.birthDate || !patient.sex) continue;
    const age = ageInMonthsExact(patient.birthDate, r.date) / 12;
    if (age < 18) continue;
    const value = egfrCkdEpi2021(r.value, age, patient.sex);
    if (value) byDate.set(r.date, { date: r.date, value: Math.round(value), source: 'calc', creat: r.value });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function latestEgfr(patient) {
  const s = egfrSeries(patient);
  return s.length ? s[s.length - 1] : null;
}

/** Не-HDL холестерол = общ − HDL, когато двете са от една и съща дата. */
export function nonHdl(results) {
  const tc = latestResult(results, 'tchol');
  const hdl = latestResult(results, 'hdl');
  if (!tc || !hdl || tc.date !== hdl.date) return null;
  return { date: tc.date, value: round(tc.value - hdl.value, 2) };
}
