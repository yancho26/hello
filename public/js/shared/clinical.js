/* Клинични калкулатори за възрастни.
 *
 * Всички формули са от публикуваните оригинали; където е възможно, са
 * проверени с числовите примери от самите публикации (виж test/adult-clinical.test.js).
 *
 *   eGFR             CKD-EPI 2021 без раса (Inker et al., NEJM 2021)
 *   CrCl             Cockcroft–Gault — нужна за дозиране на някои лекарства
 *   ХБЗ              KDIGO 2012/2024 — категории G и A, риск и честота на проследяване
 *   SCORE2           10-годишен риск от ССЗ, 40–69 г. (ESC 2021)
 *   SCORE2-OP        70–89 г. — само ръчно въвеждане (виж score2)
 *   SCORE2-Diabetes  при диабет тип 2 (ESC 2023)
 *   CHA2DS2-VA       риск от инсулт при предсърдно мъждене (ESC 2024)
 *   HAS-BLED         риск от кървене при антикоагулация
 *   FIB-4            фиброза при стеатозна чернодробна болест
 *   FINDRISC         риск от диабет тип 2 в следващите 10 години
 */

import { table } from './table.js';

/* ------------------------------ бъбреци ------------------------------ */

/** eGFR по CKD-EPI 2021 (mL/min/1,73 m²). Креатинин в µmol/L, възраст в години, пол 'm'|'f'. */
export function egfrCkdEpi2021(creatUmol, age, sex) {
  if (!(creatUmol > 0) || !(age >= 18) || (sex !== 'm' && sex !== 'f')) return null;
  const scr = creatUmol / 88.4;
  const female = sex === 'f';
  const k = female ? 0.7 : 0.9;
  const a = female ? -0.241 : -0.302;
  const ratio = scr / k;
  return 142 * Math.min(ratio, 1) ** a * Math.max(ratio, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1);
}

/** Креатининов клирънс по Cockcroft–Gault (mL/min). */
export function crclCockcroftGault(creatUmol, age, weightKg, sex) {
  if (!(creatUmol > 0) || !(age > 0) || !(weightKg > 0)) return null;
  const scr = creatUmol / 88.4;
  return ((140 - age) * weightKg * (sex === 'f' ? 0.85 : 1)) / (72 * scr);
}

export function gCategory(egfr) {
  if (egfr === null || egfr === undefined) return null;
  if (egfr >= 90) return 'G1';
  if (egfr >= 60) return 'G2';
  if (egfr >= 45) return 'G3a';
  if (egfr >= 30) return 'G3b';
  if (egfr >= 15) return 'G4';
  return 'G5';
}

export function aCategory(uacr) {
  if (uacr === null || uacr === undefined) return null;
  if (uacr < 3) return 'A1';
  if (uacr <= 30) return 'A2';
  return 'A3';
}

/* Прогностична таблица на KDIGO: риск и препоръчителен брой изследвания на
 * eGFR и UACR годишно. */
const KDIGO = {
  G1: { A1: ['low', 1], A2: ['moderate', 1], A3: ['high', 2] },
  G2: { A1: ['low', 1], A2: ['moderate', 1], A3: ['high', 2] },
  G3a: { A1: ['moderate', 1], A2: ['high', 2], A3: ['very_high', 3] },
  G3b: { A1: ['high', 2], A2: ['very_high', 3], A3: ['very_high', 3] },
  G4: { A1: ['very_high', 3], A2: ['very_high', 3], A3: ['very_high', 4] },
  G5: { A1: ['very_high', 4], A2: ['very_high', 4], A3: ['very_high', 4] },
};

export const KDIGO_RISK_LABELS = table({
  low: 'нисък', moderate: 'умерен', high: 'висок', very_high: 'много висок',
});

/**
 * Категория на ХБЗ. ХБЗ има при eGFR <60 или при албуминурия ≥3 mg/mmol
 * (трайно, над 3 месеца — програмата не може да го провери и само подсказва).
 */
export function ckdStage(egfr, uacr) {
  const g = gCategory(egfr);
  if (!g) return null;
  const a = aCategory(uacr);
  const [risk, perYear] = KDIGO[g][a || 'A1'];
  const ckd = egfr < 60 || (a && a !== 'A1');
  return {
    g, a, ckd: !!ckd, risk: ckd ? risk : null,
    perYear: ckd ? perYear : null,
    label: `${g}${a ? ' ' + a : ''}`,
  };
}

/* ---------------------------- антропометрия ---------------------------- */

export function bmi(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  return weightKg / (heightCm / 100) ** 2;
}

/** Категория по СЗО за възрастни. */
export function bmiClass(value) {
  if (value === null || value === undefined) return null;
  if (value < 18.5) return { id: 'under', label: 'поднормено тегло', severity: 1 };
  if (value < 25) return { id: 'normal', label: 'нормално тегло', severity: 0 };
  if (value < 30) return { id: 'over', label: 'наднормено тегло', severity: 1 };
  if (value < 35) return { id: 'ob1', label: 'затлъстяване I степен', severity: 2 };
  if (value < 40) return { id: 'ob2', label: 'затлъстяване II степен', severity: 2 };
  return { id: 'ob3', label: 'затлъстяване III степен', severity: 3 };
}

/** Абдоминално затлъстяване по обиколката на талията (СЗО/IDF, европейци). */
export function waistRisk(sex, waistCm) {
  if (!(waistCm > 0)) return null;
  const [inc, high] = sex === 'f' ? [80, 88] : [94, 102];
  if (waistCm >= high) return { id: 'high', label: 'значително повишен метаболитен риск', severity: 2 };
  if (waistCm >= inc) return { id: 'increased', label: 'повишен метаболитен риск', severity: 1 };
  return { id: 'normal', label: 'в норма', severity: 0 };
}

/* ---------------------------- кръвно налягане ---------------------------- */

/** Категории на кабинетното налягане по ESC 2024. */
export function bpClassAdult(sys, dia) {
  if (!(sys > 0) || !(dia > 0)) return null;
  if (sys >= 180 || dia >= 110) {
    return { id: 'severe', label: 'тежка хипертония — нужна е бърза оценка', severity: 3 };
  }
  if (sys >= 140 || dia >= 90) return { id: 'htn', label: 'хипертония', severity: 2 };
  if (sys >= 120 || dia >= 70) return { id: 'elevated', label: 'повишено налягане', severity: 1 };
  return { id: 'normal', label: 'неповишено налягане', severity: 0 };
}

/* -------------------------------- HbA1c -------------------------------- */

export const hba1cToMmolMol = (pct) => (pct - 2.15) * 10.929;
export const hba1cToPercent = (mmol) => mmol / 10.929 + 2.15;

/* ------------------------ сърдечно-съдов риск (ESC) ------------------------ */

/* Регионите на ESC по сърдечно-съдова смъртност. България е в региона с
 * много висок риск. */
export const CV_REGIONS = table({
  low: 'нисък риск', moderate: 'умерен риск', high: 'висок риск', very_high: 'много висок риск',
});

const SCALES = {
  // [scale1, scale2] за SCORE2, мъже/жени.
  score2: {
    low: { m: [-0.5699, 0.7476], f: [-0.7380, 0.7019] },
    moderate: { m: [-0.1565, 0.8009], f: [-0.3143, 0.7701] },
    high: { m: [0.3207, 0.9360], f: [0.5710, 0.9369] },
    very_high: { m: [0.5836, 0.8294], f: [0.9412, 0.8329] },
  },
};

const calibrate = (risk, [s1, s2]) => 1 - Math.exp(-Math.exp(s1 + s2 * Math.log(-Math.log(1 - risk))));

/**
 * SCORE2 — 10-годишен риск от фатални и нефатални ССЗ (в %), 40–69 г.
 * Вход: age, sex, smoker (bool), sbp (mmHg), tchol и hdl (mmol/L), diabetes (bool), region.
 *
 * За 70+ г. ESC препоръчва SCORE2-OP. Той не се изчислява автоматично:
 * коефициентите му не можаха да бъдат потвърдени с числовия пример от
 * публикацията, затова програмата насочва към официалния калкулатор на ESC
 * и позволява резултатът да се въведе ръчно.
 */
export function score2({ age, sex, smoker, sbp, tchol, hdl, diabetes = false, region = 'very_high' }) {
  if (!(age >= 40 && age < 70) || (sex !== 'm' && sex !== 'f')) return null;
  if (!(sbp > 0) || !(tchol > 0) || !(hdl > 0) || !SCALES.score2[region]) return null;
  const s = smoker ? 1 : 0;
  const d = diabetes ? 1 : 0;
  const cage = (age - 60) / 5, csbp = (sbp - 120) / 20, ctc = tchol - 6, chdl = (hdl - 1.3) / 0.5;
  const c = sex === 'm'
    ? [0.3742, 0.6012, 0.2777, 0.6457, 0.1458, -0.2698, -0.0755, -0.0255, -0.0281, 0.0426, -0.0983, 0.9605]
    : [0.4648, 0.7744, 0.3131, 0.8096, 0.1002, -0.2606, -0.1088, -0.0277, -0.0226, 0.0613, -0.1272, 0.9776];
  const lp = c[0] * cage + c[1] * s + c[2] * csbp + c[3] * d + c[4] * ctc + c[5] * chdl
    + c[6] * cage * s + c[7] * cage * csbp + c[8] * cage * ctc + c[9] * cage * chdl + c[10] * cage * d;
  const risk = calibrate(1 - c[11] ** Math.exp(lp), SCALES.score2[region][sex]);
  return { model: 'SCORE2', risk: Math.round(risk * 1000) / 10 };
}

export const SCORE2_OP_NOTE = 'За 70–89 г. се използва SCORE2-OP. Изчислете го в официалния калкулатор на ESC '
  + '(HeartScore / „ESC CVD Risk Calculation“) и въведете резултата ръчно.';

/**
 * SCORE2-Diabetes (ESC 2023) — при диабет тип 2 без атеросклеротично ССЗ и
 * без тежко увреждане на прицелни органи, 40–69 г.
 * hba1c в mmol/mol, egfr в mL/min/1,73 m², ageAtDiagnosis в години.
 */
export function score2Diabetes({ age, sex, smoker, sbp, tchol, hdl, ageAtDiagnosis, hba1c, egfr, region = 'very_high' }) {
  if (!(age >= 40 && age < 70) || (sex !== 'm' && sex !== 'f')) return null;
  if (!(sbp > 0) || !(tchol > 0) || !(hdl > 0) || !(hba1c > 0) || !(egfr > 0) || !(ageAtDiagnosis > 0)) return null;
  const s = smoker ? 1 : 0;
  const cage = (age - 60) / 5, csbp = (sbp - 120) / 20, ctc = tchol - 6, chdl = (hdl - 1.3) / 0.5;
  const cdx = (ageAtDiagnosis - 50) / 5, ca1c = (hba1c - 31) / 9.34, cgfr = (Math.log(egfr) - 4.5) / 0.15;
  const c = sex === 'm'
    ? [0.5368, 0.4774, 0.1322, 0.6457, 0.1102, -0.1087, -0.0672, -0.0268, -0.0983, -0.0181, 0.0095,
      -0.0998, 0.0955, -0.0591, 0.0058, -0.0134, 0.0115, 0.9605]
    : [0.6624, 0.6139, 0.1421, 0.8096, 0.1127, -0.1568, -0.1122, -0.0167, -0.1272, -0.0200, 0.0186,
      -0.118, 0.1173, -0.0640, 0.0062, -0.0196, 0.0169, 0.9776];
  const lp = c[0] * cage + c[1] * s + c[2] * csbp + c[3] + c[4] * ctc + c[5] * chdl
    + c[6] * cage * s + c[7] * cage * csbp + c[8] * cage + c[9] * cage * ctc + c[10] * cage * chdl
    + c[11] * cdx + c[12] * ca1c + c[13] * cgfr + c[14] * cgfr * cgfr + c[15] * ca1c * cage + c[16] * cgfr * cage;
  const risk = calibrate(1 - c[17] ** Math.exp(lp), SCALES.score2[region][sex]);
  return { model: 'SCORE2-Diabetes', risk: Math.round(risk * 1000) / 10 };
}

export const RISK_LABELS = table({
  low: 'нисък до умерен', moderate: 'умерен', high: 'висок', very_high: 'много висок',
});

/** Прагове по ESC 2021 за привидно здрави хора, според възрастта. */
export function score2Category(risk, age) {
  const [hi, vhi] = age < 50 ? [2.5, 7.5] : age < 70 ? [5, 10] : [7.5, 15];
  if (risk >= vhi) return 'very_high';
  if (risk >= hi) return 'high';
  return 'low';
}

/** Категории на SCORE2-Diabetes (ESC 2023). */
export function score2DiabetesCategory(risk) {
  if (risk >= 20) return 'very_high';
  if (risk >= 10) return 'high';
  if (risk >= 5) return 'moderate';
  return 'low';
}

/** Целеви LDL-холестерол (mmol/L) по категория на риска (ESC/EAS 2019, потвърдено 2023/2025). */
export const LDL_TARGETS = table({
  very_high: { value: 1.4, text: '<1,4 mmol/L и понижение ≥50% от изходното' },
  high: { value: 1.8, text: '<1,8 mmol/L и понижение ≥50% от изходното' },
  moderate: { value: 2.6, text: '<2,6 mmol/L' },
  low: { value: 3.0, text: '<3,0 mmol/L' },
});

/* -------------------------- предсърдно мъждене -------------------------- */

/** CHA2DS2-VA (ESC 2024) — полът вече не се включва. */
export function cha2ds2va({ hf, htn, age, diabetes, stroke, vascular }) {
  let score = 0;
  const parts = [];
  const add = (cond, pts, label) => { if (cond) { score += pts; parts.push(`${label} +${pts}`); } };
  add(hf, 1, 'сърдечна недостатъчност');
  add(htn, 1, 'хипертония');
  add(age >= 75, 2, 'възраст ≥75');
  add(diabetes, 1, 'диабет');
  add(stroke, 2, 'инсулт/ТИА/тромбоемболия');
  add(vascular, 1, 'съдова болест');
  add(age >= 65 && age < 75, 1, 'възраст 65–74');
  const advice = score >= 2
    ? 'Препоръчва се перорална антикоагулация (за предпочитане НОАК).'
    : score === 1
      ? 'Антикоагулация следва да се обмисли индивидуално.'
      : 'Антикоагулация не е показана само по този резултат.';
  return { score, parts, advice };
}

/** HAS-BLED — риск от голямо кървене при антикоагулация (≥3 — висок). */
export function hasBled({ uncontrolledHtn, abnormalRenal, abnormalLiver, stroke, bleeding, labileInr, age, drugs, alcohol }) {
  const items = [uncontrolledHtn, abnormalRenal, abnormalLiver, stroke, bleeding, labileInr, age > 65, drugs, alcohol];
  const score = items.filter(Boolean).length;
  return {
    score,
    high: score >= 3,
    advice: score >= 3
      ? 'Висок риск от кървене: коригирайте обратимите фактори и проследявайте по-често. Не е причина за отказ от антикоагулация.'
      : 'Нисък до умерен риск от кървене.',
  };
}

/* ---------------------------- черен дроб ---------------------------- */

/** FIB-4 = (възраст × АСАТ) / (тромбоцити × √АЛАТ). */
export function fib4(age, ast, alt, plt) {
  if (!(age > 0) || !(ast > 0) || !(alt > 0) || !(plt > 0)) return null;
  const value = (age * ast) / (plt * Math.sqrt(alt));
  // При 65+ г. долният праг е 2,0 (по-малко фалшиво положителни).
  const low = age >= 65 ? 2.0 : 1.3;
  const category = value < low ? 'low' : value > 2.67 ? 'high' : 'indeterminate';
  const advice = {
    low: 'Нисък риск от напреднала фиброза. Повторна оценка след 1–3 години.',
    indeterminate: 'Неопределен резултат — препоръчва се еластография (FibroScan).',
    high: 'Висок риск от напреднала фиброза — насочване към гастроентеролог/хепатолог.',
  }[category];
  return { value: Math.round(value * 100) / 100, category, advice };
}

/* -------------------------------- FINDRISC -------------------------------- */

export const FINDRISC_QUESTIONS = [
  { id: 'activity', text: 'Поне 30 минути физическа активност дневно (на работа или в свободното време)?', options: [['yes', 'да', 0], ['no', 'не', 2]] },
  { id: 'vegetables', text: 'Всеки ден ли яде зеленчуци, плодове или горски плодове?', options: [['yes', 'всеки ден', 0], ['no', 'не всеки ден', 1]] },
  { id: 'bpMeds', text: 'Приемал ли е някога редовно лекарства за високо кръвно налягане?', options: [['no', 'не', 0], ['yes', 'да', 2]] },
  { id: 'highGlucose', text: 'Установявана ли е някога висока кръвна захар (при преглед, болест, бременност)?', options: [['no', 'не', 0], ['yes', 'да', 5]] },
  { id: 'family', text: 'Има ли роднини с диабет (тип 1 или тип 2)?', options: [['no', 'не', 0], ['second', 'да — баба/дядо, леля/чичо, братовчед', 3], ['first', 'да — родител, брат/сестра, дете', 5]] },
];

/**
 * FINDRISC. Възрастта, ИТМ и обиколката на талията се подават като числа,
 * а останалите отговори — по id от FINDRISC_QUESTIONS.
 */
export function findrisc({ age, bmi: b, waist, sex, answers = {} }) {
  if (!(age > 0) || !(b > 0) || !(waist > 0)) return null;
  let score = age < 45 ? 0 : age < 55 ? 2 : age < 65 ? 3 : 4;
  score += b < 25 ? 0 : b <= 30 ? 1 : 3;
  const [w1, w2] = sex === 'f' ? [80, 88] : [94, 102];
  score += waist < w1 ? 0 : waist <= w2 ? 3 : 4;
  for (const q of FINDRISC_QUESTIONS) {
    const opt = q.options.find(o => o[0] === answers[q.id]);
    if (!opt) return null;
    score += opt[2];
  }
  const bands = [
    [7, 'low', 'нисък', '1 на 100'],
    [12, 'slightly', 'леко повишен', '1 на 25'],
    [15, 'moderate', 'умерен', '1 на 6'],
    [21, 'high', 'висок', '1 на 3'],
    [Infinity, 'very_high', 'много висок', '1 на 2'],
  ];
  const [, category, label, chance] = bands.find(([limit]) => score < limit);
  return {
    score, category, label, chance,
    advice: score >= 12
      ? 'Изследвайте HbA1c или глюкоза на гладно и обсъдете промени в начина на живот.'
      : 'Насърчете здравословно хранене и движение; повторна оценка след няколко години.',
  };
}
