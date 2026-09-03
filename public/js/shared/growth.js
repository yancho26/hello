/* Оценка на растежа по стандартите на СЗО (метод LMS).
 *
 * z = ((X/M)^L − 1) / (L·S),  а при L = 0:  z = ln(X/M) / S
 * Обратно:  X = M·(1 + L·S·z)^(1/L)
 *
 * За индикаторите, базирани на тегло, СЗО прилага корекция извън ±3 SD,
 * защото разпределението там е силно скосено — реализирана е в zScore(). */

import { WHO_LMS } from './who-data.js';
import { ageInMonthsExact } from './dates.js';

/** Дефиниция на показателите, които приложението следи. */
export const INDICATORS = {
  weight: {
    key: 'weight', label: 'Тегло за възраст', short: 'Тегло', unit: 'кг', decimals: 3,
    sets: [{ table: 'wfa', from: 0, to: 60 }],
    weightBased: true, maxAgeMonths: 60,
    hint: 'Стандартът на СЗО за тегло е до 5-годишна възраст. След това се следи ИТМ.',
  },
  height: {
    key: 'height', label: 'Дължина / ръст за възраст', short: 'Ръст', unit: 'см', decimals: 1,
    sets: [{ table: 'lhfa', from: 0, to: 60 }, { table: 'hfa5', from: 61, to: 228 }],
    weightBased: false, maxAgeMonths: 228,
  },
  bmi: {
    key: 'bmi', label: 'Индекс на телесна маса за възраст', short: 'ИТМ', unit: 'кг/м²', decimals: 2,
    sets: [{ table: 'bfa', from: 0, to: 60 }, { table: 'bfa5', from: 61, to: 228 }],
    weightBased: true, maxAgeMonths: 228, derived: true,
  },
  head: {
    key: 'head', label: 'Обиколка на главата за възраст', short: 'Глава', unit: 'см', decimals: 1,
    sets: [{ table: 'hcfa', from: 0, to: 60 }],
    weightBased: false, maxAgeMonths: 60,
    hint: 'Стандартът на СЗО за обиколка на главата е до 5-годишна възраст.',
  },
};

/** Връща таблицата (масив [месец, L, M, S]) за показател, пол и възраст. */
function tableFor(indicatorKey, sex, ageMonths) {
  const ind = INDICATORS[indicatorKey];
  if (!ind) return null;
  const s = sex === 'f' ? 'f' : 'm';
  for (const set of ind.sets) {
    if (ageMonths >= set.from - 0.5 && ageMonths <= set.to + 0.001) {
      const rows = WHO_LMS[set.table] && WHO_LMS[set.table][s];
      if (rows) return rows;
    }
  }
  return null;
}

/** L, M, S на точна възраст — линейна интерполация между съседните месеци. */
export function lmsAt(indicatorKey, sex, ageMonths) {
  const rows = tableFor(indicatorKey, sex, ageMonths);
  if (!rows || !rows.length) return null;
  const first = rows[0], last = rows[rows.length - 1];
  if (ageMonths <= first[0]) return { L: first[1], M: first[2], S: first[3] };
  if (ageMonths >= last[0]) return { L: last[1], M: last[2], S: last[3] };

  let lo = 0, hi = rows.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (rows[mid][0] <= ageMonths) lo = mid; else hi = mid;
  }
  const a = rows[lo], b = rows[hi];
  const span = b[0] - a[0];
  const t = span === 0 ? 0 : (ageMonths - a[0]) / span;
  return {
    L: a[1] + (b[1] - a[1]) * t,
    M: a[2] + (b[2] - a[2]) * t,
    S: a[3] + (b[3] - a[3]) * t,
  };
}

/** Стойността на измерването при даден z-скор. */
export function valueAtZ(lms, z) {
  const { L, M, S } = lms;
  if (Math.abs(L) < 1e-7) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/** z-скор на измерена стойност. Връща null при липса на стандарт за възрастта. */
export function zScore(indicatorKey, sex, ageMonths, value) {
  const lms = lmsAt(indicatorKey, sex, ageMonths);
  if (!lms || !(value > 0)) return null;
  const { L, M, S } = lms;

  let z = Math.abs(L) < 1e-7
    ? Math.log(value / M) / S
    : (Math.pow(value / M, L) - 1) / (L * S);

  // Корекция на СЗО за екстремни стойности при индикаторите, базирани на тегло.
  if (INDICATORS[indicatorKey].weightBased) {
    if (z > 3) {
      const sd3 = valueAtZ(lms, 3), sd2 = valueAtZ(lms, 2);
      z = 3 + (value - sd3) / (sd3 - sd2);
    } else if (z < -3) {
      const sd3 = valueAtZ(lms, -3), sd2 = valueAtZ(lms, -2);
      z = -3 + (value - sd3) / (sd2 - sd3);
    }
  }
  return z;
}

/** Функция на стандартното нормално разпределение — приближение на Abramowitz–Stegun. */
export function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  let p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

export function percentileFromZ(z) {
  return normalCdf(z) * 100;
}

/** Пълна оценка на едно измерване. */
export function assess(indicatorKey, sex, ageMonths, value) {
  const z = zScore(indicatorKey, sex, ageMonths, value);
  if (z === null) return null;
  return {
    z,
    percentile: percentileFromZ(z),
    label: interpret(indicatorKey, z, ageMonths),
    severity: severity(indicatorKey, z, ageMonths),
  };
}

/* Праговете на СЗО за ИТМ се различават по възраст: до 5 години наднорменото
 * тегло започва при +2 SD, а затлъстяването при +3 SD; от 5 години нагоре —
 * съответно при +1 SD и +2 SD. */

/** Клинично тълкуване по праговете на СЗО. */
export function interpret(indicatorKey, z, ageMonths = 0) {
  if (indicatorKey === 'weight') {
    if (z < -3) return 'тежко поднормено тегло';
    if (z < -2) return 'поднормено тегло';
    if (z > 2) return 'тегло над стандарта — оценете ИТМ';
    return 'в норма';
  }
  if (indicatorKey === 'height') {
    if (z < -3) return 'тежко изоставане в растежа';
    if (z < -2) return 'нисък ръст за възрастта';
    if (z > 3) return 'висок ръст за възрастта';
    return 'в норма';
  }
  if (indicatorKey === 'bmi') {
    const under5 = ageMonths <= 60;
    if (z < -3) return under5 ? 'тежко изтощение' : 'тежко поднормено хранене';
    if (z < -2) return under5 ? 'изтощение' : 'поднормено хранене';
    if (under5) {
      if (z > 3) return 'затлъстяване';
      if (z > 2) return 'наднормено тегло';
      if (z > 1) return 'риск от наднормено тегло';
    } else {
      if (z > 2) return 'затлъстяване';
      if (z > 1) return 'наднормено тегло';
    }
    return 'в норма';
  }
  if (indicatorKey === 'head') {
    if (z < -2) return 'микроцефалия — изисква оценка';
    if (z > 2) return 'макроцефалия — изисква оценка';
    return 'в норма';
  }
  return '';
}

/** 0 — норма, 1 — за наблюдение, 2 — изисква действие. */
export function severity(indicatorKey, z, ageMonths = 0) {
  const a = Math.abs(z);
  if (indicatorKey === 'bmi') {
    const overweightAt = ageMonths <= 60 ? 2 : 1;
    if (z > overweightAt + 1 || z < -3) return 2;
    if (z > overweightAt || z < -2) return 2;
    if (z > overweightAt - 1 || z < -1.5) return 1;
    return 0;
  }
  if (a > 2) return 2;
  if (a > 1.5) return 1;
  return 0;
}

/** ИТМ от тегло (кг) и ръст (см). */
export function bmi(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** Обработва списък с измервания и добавя възраст, ИТМ и оценки. */
export function analyseMeasurements(patient, measurements) {
  const sex = patient.sex === 'f' ? 'f' : 'm';
  return (measurements || [])
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(m => {
      const ageMonths = ageInMonthsExact(patient.birthDate, m.date);
      const row = { ...m, ageMonths, assessments: {} };
      if (m.weight > 0) row.assessments.weight = assess('weight', sex, ageMonths, m.weight);
      if (m.height > 0) row.assessments.height = assess('height', sex, ageMonths, m.height);
      if (m.head > 0) row.assessments.head = assess('head', sex, ageMonths, m.head);
      if (m.weight > 0 && m.height > 0) {
        row.bmi = bmi(m.weight, m.height);
        row.assessments.bmi = assess('bmi', sex, ageMonths, row.bmi);
      }
      return row;
    });
}

/** Перцентилни криви за графика: за всеки перцентил — точки по възраст. */
export const CHART_PERCENTILES = [
  { p: 3, z: -1.8807936081512509, major: false },
  { p: 15, z: -1.0364333894937898, major: false },
  { p: 50, z: 0, major: true },
  { p: 85, z: 1.0364333894937898, major: false },
  { p: 97, z: 1.8807936081512509, major: false },
];

/**
 * Точки за перцентилните криви на показател в даден възрастов диапазон.
 * @returns {Array<{p:number, z:number, points:Array<[ageMonths, value]>}>}
 */
export function percentileCurves(indicatorKey, sex, fromMonths, toMonths, steps = 60) {
  const ind = INDICATORS[indicatorKey];
  if (!ind) return [];
  const lo = Math.max(0, fromMonths);
  const hi = Math.min(ind.maxAgeMonths, toMonths);
  if (hi <= lo) return [];
  const step = (hi - lo) / steps;

  return CHART_PERCENTILES.map(({ p, z, major }) => {
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const age = lo + step * i;
      const lms = lmsAt(indicatorKey, sex, age);
      if (!lms) continue;
      points.push([age, valueAtZ(lms, z)]);
    }
    return { p, z, major, points };
  }).filter(c => c.points.length > 1);
}
