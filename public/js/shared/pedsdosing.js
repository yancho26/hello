/* Детски дозировки по тегло: парацетамол, ибупрофен и най-честите
 * антибиотици в извънболничната практика.
 *
 * Изчислява единичната доза в mg и в милилитри за избраната концентрация,
 * колко пъти дневно, максимума за денонощие, количеството за целия курс и
 * подходяща супозитория или таблетка. Всички дози са ограничени от
 * максималната единична и дневна доза за възрастен. Предупрежденията вземат
 * предвид възрастта, теглото, алергиите и заболяванията от досието.
 *
 * Източници (проверени 09.2026):
 *   - Кратки характеристики на продуктите (SmPC): парацетамол 120 mg/5 ml
 *     (10–15 mg/kg на прием, до 4 пъти, макс. 60 mg/kg/ден); ибупрофен
 *     100 mg/5 ml (20–30 mg/kg/ден в 3–4 приема, от 3 месеца и 5 kg; да се
 *     избягва при варицела); амоксицилин/клавуланова к-на 7:1 400/57 mg/5 ml
 *     (25–45 mg/kg/ден в 2 приема, от 2 месеца); кларитромицин (7,5 mg/kg
 *     2 пъти дневно, до 500 mg); цефуроксим аксетил (10 mg/kg 2 пъти, до
 *     125 mg; при отит от 2 г. — 15 mg/kg, до 250 mg; от 3 месеца); цефиксим
 *     (8 mg/kg/ден, до 400 mg, от 6 месеца); ко-тримоксазол (≈6 mg/kg/ден
 *     триметоприм в 2 приема, не под 6 седмици); азитромицин (10 mg/kg 3 дни
 *     или 10 mg/kg + 5 mg/kg 4 дни).
 *   - AAP 2013 (остър среден отит): амоксицилин 80–90 mg/kg/ден в 2 приема.
 *   - IDSA 2012 (стрептококов фарингит): амоксицилин 50 mg/kg веднъж дневно,
 *     до 1000 mg, 10 дни.
 *   - CDC (коклюш): азитромицин под 6 месеца 10 mg/kg 5 дни; от 6 месеца
 *     10 mg/kg (до 500 mg) първия ден, после 5 mg/kg (до 250 mg).
 *   - NICE NG91, NG138, NG109 — продължителност на лечението.
 *
 * Дозите са за деца с нормална бъбречна и чернодробна функция. Програмата не
 * замества преценката на лекаря и кратката характеристика на продукта.
 */

import { table } from './table.js';

export const DOSING_VERIFIED = '2026-09';

/* ------------------------------ лекарства ------------------------------ */

const EVERY = { 1: 'веднъж дневно', 2: '2 пъти дневно, през 12 часа', 3: '3 пъти дневно, през 8 часа', 4: '4 пъти дневно, през 6 часа' };

export const DOSING_DRUGS = table({
  paracetamol: {
    name: 'Парацетамол',
    group: 'antipyretic',
    regimens: [{
      id: 'standard', label: 'При температура или болка', asNeeded: true,
      perKgDose: 15, rangePerKg: [10, 15], everyHours: '4–6', maxDosesPerDay: 4,
      maxPerKgDay: 60, maxDose: 1000, maxDay: 4000,
    }],
    forms: [
      { id: 's120', type: 'liquid', mgPer5ml: 120, label: 'суспензия 120 mg/5 ml', examples: 'Калпол, Панадол Бейби' },
      { id: 's250', type: 'liquid', mgPer5ml: 250, label: 'суспензия 250 mg/5 ml', examples: 'Калпол 6+' },
      { id: 'supp', type: 'suppository', strengths: [80, 125, 150, 250, 300, 500], rangePerKg: [10, 20], label: 'супозитории' },
      { id: 't500', type: 'tablet', mg: 500, label: 'таблетки 500 mg' },
    ],
    minAgeMonths: 3,
    notes: [
      'Дава се при нужда, не по часовник. Интервал поне 4 часа, до 4 пъти за 24 часа.',
      'Сметнете парацетамола и в други лекарства (комбинирани продукти за простуда).',
    ],
    parentNotes: [
      'Давайте само при нужда — при температура, от която детето страда, или при болка. Поне 4 часа между приемите.',
      'Не давайте едновременно други лекарства, които съдържат парацетамол.',
    ],
  },
  ibuprofen: {
    name: 'Ибупрофен',
    group: 'antipyretic',
    regimens: [{
      id: 'standard', label: 'При температура или болка', asNeeded: true,
      perKgDose: 10, rangePerKg: [5, 10], everyHours: '6–8', maxDosesPerDay: 3,
      maxPerKgDay: 30, maxDose: 400, maxDay: 1200,
    }],
    forms: [
      { id: 's100', type: 'liquid', mgPer5ml: 100, label: 'суспензия 100 mg/5 ml', examples: 'Нурофен за деца' },
      { id: 's200', type: 'liquid', mgPer5ml: 200, label: 'суспензия 200 mg/5 ml', examples: 'Нурофен за деца Форте' },
      { id: 'supp', type: 'suppository', strengths: [60, 125], rangePerKg: [5, 10], label: 'супозитории' },
      { id: 't200', type: 'tablet', mg: 200, label: 'таблетки 200 mg' },
      { id: 't400', type: 'tablet', mg: 400, label: 'таблетки 400 mg' },
    ],
    minAgeMonths: 3,
    minWeightKg: 5,
    notes: [
      'Да се избягва при варицела — риск от тежки кожни инфекции.',
      'Не при повръщане, диария или малко течности — риск за бъбреците. Дава се след храна.',
    ],
    parentNotes: [
      'Давайте след храна. Поне 6 часа между приемите.',
      'Не давайте при варицела, при повръщане или диария и ако детето пие малко течности.',
    ],
  },
  amoxicillin: {
    name: 'Амоксицилин',
    group: 'antibiotic',
    regimens: [
      { id: 'standard', label: 'Стандартна доза — 50 mg/kg дневно в 3 приема', perKgDay: 50, doses: 3, maxDose: 1000, maxDay: 3000, days: 7 },
      {
        id: 'high', label: 'Висока доза — 90 mg/kg дневно в 2 приема (остър отит, пневмония)', perKgDay: 90, doses: 2,
        maxDose: 1500, maxDay: 3000, days: 7,
        note: 'Остър отит: 10 дни под 2-годишна възраст, 5–7 дни над 2 години. Пневмония: обикновено 5 дни.',
      },
      {
        id: 'strep', label: 'Стрептококов тонзилофарингит — 50 mg/kg веднъж дневно, 10 дни', perKgDay: 50, doses: 1,
        maxDose: 1000, maxDay: 1000, days: 10,
      },
    ],
    forms: [
      { id: 's125', type: 'liquid', mgPer5ml: 125, label: 'суспензия 125 mg/5 ml' },
      { id: 's250', type: 'liquid', mgPer5ml: 250, label: 'суспензия 250 mg/5 ml', examples: 'Оспамокс' },
      { id: 's500', type: 'liquid', mgPer5ml: 500, label: 'суспензия 500 mg/5 ml' },
      { id: 't500', type: 'tablet', mg: 500, label: 'таблетки 500 mg' },
      { id: 't1000', type: 'tablet', mg: 1000, label: 'таблетки 1000 mg' },
    ],
    allergy: 'penicillin',
  },
  amoxiclav: {
    name: 'Амоксицилин/клавуланова киселина',
    group: 'antibiotic',
    doseOf: 'амоксицилин',
    regimens: [
      { id: 'standard', label: 'Стандартна доза — 45 mg/kg амоксицилин дневно в 2 приема', perKgDay: 45, doses: 2, maxDose: 875, maxDay: 1750, days: 7, forms: ['s400'], minAgeMonths: 2 },
      {
        id: 'high', label: 'Висока доза — 90 mg/kg дневно в 2 приема (отит при неуспех на амоксицилин)', perKgDay: 90, doses: 2,
        maxDose: 2000, maxDay: 4000, days: 10, forms: ['s600'], minAgeMonths: 3,
        note: 'С висока доза — само суспензия 14:1 (600/42,9 mg/5 ml), за да не се надвиши клавулановата киселина.',
      },
      { id: 'tid', label: 'Със суспензия 4:1 — 40 mg/kg дневно в 3 приема', perKgDay: 40, doses: 3, maxDose: 500, maxDay: 1500, days: 7, forms: ['s250'], minAgeMonths: 3 },
    ],
    forms: [
      { id: 's400', type: 'liquid', mgPer5ml: 400, clavPer5ml: 57, label: 'суспензия 400/57 mg/5 ml (7:1)', examples: 'Аугментин, Амоксиклав 2X' },
      { id: 's250', type: 'liquid', mgPer5ml: 250, clavPer5ml: 62.5, label: 'суспензия 250/62,5 mg/5 ml (4:1)', examples: 'Амоксиклав 312,5 mg/5 ml' },
      { id: 's600', type: 'liquid', mgPer5ml: 600, clavPer5ml: 42.9, label: 'суспензия 600/42,9 mg/5 ml (14:1, ES)' },
      { id: 't875', type: 'tablet', mg: 875, label: 'таблетки 875/125 mg' },
    ],
    allergy: 'penicillin',
    notes: ['Клавулановата киселина над 10 mg/kg дневно увеличава диарията. Внимание при прекарана жълтеница от този антибиотик.'],
    parentNotes: ['Давайте в началото на храненето — стомахът понася по-добре.'],
  },
  azithromycin: {
    name: 'Азитромицин',
    group: 'antibiotic',
    regimens: [
      { id: 'three', label: '10 mg/kg веднъж дневно, 3 дни', perKgDay: 10, doses: 1, maxDose: 500, maxDay: 500, days: 3, fixedDays: true, minAgeMonths: 6 },
      {
        id: 'five', label: '10 mg/kg първия ден, после 5 mg/kg веднъж дневно до 5-ия ден', perKgDay: 10, doses: 1,
        maxDose: 500, maxDay: 500, days: 5, fixedDays: true, then: { perKgDay: 5, maxDose: 250 }, minAgeMonths: 6,
      },
      {
        id: 'pertussis', label: 'Коклюш (лечение или профилактика на контактни)', perKgDay: 10, doses: 1,
        maxDose: 500, maxDay: 500, days: 5, fixedDays: true, then: { perKgDay: 5, maxDose: 250 }, infantAllDays: 6,
        note: 'Под 6 месеца: 10 mg/kg всеки ден, 5 дни. От 6 месеца: 10 mg/kg първия ден, после 5 mg/kg.',
      },
    ],
    forms: [
      { id: 's100', type: 'liquid', mgPer5ml: 100, label: 'суспензия 100 mg/5 ml', examples: 'Сумамед' },
      { id: 's200', type: 'liquid', mgPer5ml: 200, label: 'суспензия 200 mg/5 ml', examples: 'Сумамед, Азатрил' },
      { id: 't250', type: 'tablet', mg: 250, label: 'таблетки 250 mg' },
      { id: 't500', type: 'tablet', mg: 500, label: 'таблетки 500 mg' },
    ],
    allergy: 'macrolide',
    parentNotes: ['Веднъж дневно, по едно и също време.'],
    notes: [
      'При стрептококов тонзилофарингит — само при алергия към пеницилин.',
      'Внимание при удължен QT интервал или други лекарства, които го удължават.',
    ],
  },
  clarithromycin: {
    name: 'Кларитромицин',
    group: 'antibiotic',
    regimens: [
      { id: 'standard', label: '7,5 mg/kg два пъти дневно', perKgDay: 15, doses: 2, maxDose: 500, maxDay: 1000, days: 7, minAgeMonths: 6 },
    ],
    forms: [
      { id: 's125', type: 'liquid', mgPer5ml: 125, label: 'суспензия 125 mg/5 ml', examples: 'Клацид' },
      { id: 's250', type: 'liquid', mgPer5ml: 250, label: 'суспензия 250 mg/5 ml', examples: 'Клацид' },
      { id: 't250', type: 'tablet', mg: 250, label: 'таблетки 250 mg' },
      { id: 't500', type: 'tablet', mg: 500, label: 'таблетки 500 mg' },
    ],
    allergy: 'macrolide',
    notes: ['Много лекарствени взаимодействия (CYP3A4) и удължаване на QT — проверете текущите лекарства.'],
  },
  cefuroxime: {
    name: 'Цефуроксим аксетил',
    group: 'antibiotic',
    regimens: [
      { id: 'standard', label: '10 mg/kg два пъти дневно (тонзилофарингит, синузит)', perKgDay: 20, doses: 2, maxDose: 125, maxDay: 250, days: 7, minAgeMonths: 3 },
      {
        id: 'otitis', label: '15 mg/kg два пъти дневно (остър отит и по-тежки инфекции, от 2 години)', perKgDay: 30, doses: 2,
        maxDose: 250, maxDay: 500, days: 7, minAgeMonths: 24,
        note: 'Под 2-годишна възраст при отит — 10 mg/kg два пъти дневно.',
      },
    ],
    forms: [
      { id: 's125', type: 'liquid', mgPer5ml: 125, label: 'суспензия 125 mg/5 ml', examples: 'Зинат' },
      { id: 's250', type: 'liquid', mgPer5ml: 250, label: 'суспензия 250 mg/5 ml', examples: 'Зинат' },
      { id: 't125', type: 'tablet', mg: 125, label: 'таблетки 125 mg' },
      { id: 't250', type: 'tablet', mg: 250, label: 'таблетки 250 mg' },
    ],
    allergy: 'cephalosporin',
    notes: ['Дава се след храна — така се усвоява по-добре.'],
    parentNotes: ['Давайте след храна.'],
  },
  cefixime: {
    name: 'Цефиксим',
    group: 'antibiotic',
    regimens: [
      { id: 'once', label: '8 mg/kg веднъж дневно', perKgDay: 8, doses: 1, maxDose: 400, maxDay: 400, days: 7, minAgeMonths: 6 },
      { id: 'bid', label: '4 mg/kg два пъти дневно', perKgDay: 8, doses: 2, maxDose: 200, maxDay: 400, days: 7, minAgeMonths: 6 },
    ],
    forms: [
      { id: 's100', type: 'liquid', mgPer5ml: 100, label: 'суспензия 100 mg/5 ml', examples: 'Супракс' },
      { id: 't400', type: 'tablet', mg: 400, label: 'таблетки 400 mg' },
    ],
    allergy: 'cephalosporin',
    notes: ['Инфекция на пикочните пътища: 7–10 дни според тежестта; изберете според урокултурата, щом е готова.'],
  },
  cotrimoxazole: {
    name: 'Ко-тримоксазол',
    group: 'antibiotic',
    doseOf: 'триметоприм',
    regimens: [
      { id: 'standard', label: '3 mg/kg триметоприм два пъти дневно', perKgDay: 6, doses: 2, maxDose: 160, maxDay: 320, days: 5, minAgeMonths: 1.5 },
    ],
    forms: [
      { id: 's240', type: 'liquid', mgPer5ml: 40, totalPer5ml: 240, label: 'суспензия 240 mg/5 ml (40 mg триметоприм)', examples: 'Бисептол' },
      { id: 't480', type: 'tablet', mg: 80, totalMg: 480, label: 'таблетки 480 mg (80 mg триметоприм)' },
    ],
    allergy: 'sulfonamide',
    parentNotes: ['Детето да пие достатъчно течности.'],
    notes: [
      'Не под 6-седмична възраст. Не при G6PD дефицит.',
      'Резистентността на E. coli е висока — съобразете с урокултурата.',
    ],
  },
});

export const DRUG_ORDER = ['paracetamol', 'ibuprofen', 'amoxicillin', 'amoxiclav', 'azithromycin', 'clarithromycin', 'cefuroxime', 'cefixime', 'cotrimoxazole'];

/* ---------------------------- алергии и заболявания ---------------------------- */

const ALLERGY_TERMS = table({
  penicillin: /пеницил|амокси|ампицил|аугмент|амоксиклав|оспамокс|бета.?лакт|penicil|amoxi|ampicil|augment|beta.?lact/i,
  cephalosporin: /цефал|цефур|цефикс|цефпо|цефак|цефтр|зинат|супракс|cefa|cefu|cefi|cefp|cefo|cefta|cefti|cepha|ceph/i,
  macrolide: /макролид|азитро|кларитро|еритро|сумамед|клацид|macrolid|azithro|clarithro|erythro/i,
  sulfonamide: /сулфон|сулфа|бисептол|ко-?тримокс|котримокс|триметоприм|sulfa|cotrim|biseptol|bactrim|trimethoprim/i,
  nsaid: /ибупроф|нурофен|нспв|нестероид|аспирин|ацетилсалицил|диклофенак|напроксен|ibupro|nurofen|nsaid|aspirin|diclofenac|naproxen/i,
  paracetamol: /парацетамол|калпол|панадол|ефералган|paracet|acetaminophen|calpol|panadol|efferalgan/i,
});

const DRUG_ALLERGIES = table({
  paracetamol: ['paracetamol'],
  ibuprofen: ['nsaid'],
  amoxicillin: ['penicillin'],
  amoxiclav: ['penicillin'],
  azithromycin: ['macrolide'],
  clarithromycin: ['macrolide'],
  cefuroxime: ['cephalosporin'],
  cefixime: ['cephalosporin'],
  cotrimoxazole: ['sulfonamide'],
});

function hasTerm(patient, re, codes = []) {
  const texts = [...(patient.allergies || []), ...(patient.conditions || [])].map(String);
  if (texts.some(t => re.test(t))) return true;
  return (patient.chronic || []).some(c => c.status !== 'resolved' && codes.includes(c.code));
}

/** Предупреждения от досието за дадено лекарство. */
export function patientWarnings(drugId, patient = {}) {
  const out = [];
  const allergyText = (patient.allergies || []).map(String);
  for (const key of DRUG_ALLERGIES[drugId] || []) {
    const hit = allergyText.find(a => ALLERGY_TERMS[key].test(a));
    if (hit) out.push({ level: 'bad', text: `В досието е записана алергия: „${hit}“. Не давайте това лекарство.` });
  }
  if (drugId === 'cefuroxime' || drugId === 'cefixime') {
    const pen = allergyText.find(a => ALLERGY_TERMS.penicillin.test(a));
    if (pen) {
      out.push({ level: 'warn', text: `Алергия към пеницилин („${pen}“): кръстосана реакция с цефалоспорини е рядка, `
        + 'но не ги давайте при анафилаксия или тежка реакция към пеницилин.' });
    }
  }
  if (drugId === 'ibuprofen') {
    if (hasTerm(patient, /астм|asthma/i, ['asthma'])) {
      out.push({ level: 'warn', text: 'Астма: не давайте при известна чувствителност към ибупрофен или аспирин. При повечето деца с астма е безопасен.' });
    }
    if (hasTerm(patient, /бъбре|нефр|kidney|renal/i, ['ckd'])) {
      out.push({ level: 'bad', text: 'Бъбречно заболяване в досието: избягвайте ибупрофен.' });
    }
  }
  if (drugId === 'paracetamol' && hasTerm(patient, /черен дроб|чернодроб|хепат|liver|hepat/i)) {
    out.push({ level: 'warn', text: 'Чернодробно заболяване в досието: по-ниска дневна доза, по преценка.' });
  }
  if (drugId === 'cotrimoxazole') {
    if (hasTerm(patient, /g6pd|г6фд|фавизъм/i)) out.push({ level: 'bad', text: 'G6PD дефицит в досието: ко-тримоксазолът е противопоказан.' });
    if (hasTerm(patient, /бъбре|нефр|kidney|renal/i, ['ckd'])) out.push({ level: 'warn', text: 'Бъбречно заболяване: дозата може да трябва да се намали.' });
  }
  return out;
}

/* -------------------------------- изчисляване -------------------------------- */

const round1 = (x) => Math.round(x * 10) / 10;

/** Милилитри, закръглени за дозираща спринцовка, без да се надвиши максимумът. */
function roundMl(ml, maxMl = Infinity) {
  const step = ml < 10 ? 0.1 : 0.5;
  let r = Math.round(ml / step) * step;
  if (r > maxMl + 1e-9) r = Math.floor(maxMl / step) * step;
  return Math.round(r * 100) / 100;
}

/** „7,5“ — число с десетична запетая. */
export function fmt(x, digits = 1) {
  const v = Math.round(x * 10 ** digits) / 10 ** digits;
  return String(v).replace('.', ',');
}

function findRegimen(drug, regimenId) {
  return drug.regimens.find(r => r.id === regimenId) || drug.regimens[0];
}

function findForm(drug, formId, regimen) {
  const allowed = regimen.forms ? drug.forms.filter(f => regimen.forms.includes(f.id) || f.type !== 'liquid') : drug.forms;
  return drug.forms.find(f => f.id === formId) || allowed.find(f => f.type === 'liquid') || drug.forms[0];
}

/** Единична доза в mg и ml за течна форма. */
function liquid(form, mg, capMg) {
  const perMl = form.mgPer5ml / 5;
  const ml = roundMl(mg / perMl, capMg / perMl);
  return { ml, mg: round1(ml * perMl) };
}

/** Подходяща супозитория: в допустимите mg/kg, най-близо до целевата доза. */
function pickSuppository(form, weight, targetPerKg) {
  const [lo, hi] = form.rangePerKg;
  const fitting = form.strengths.filter(s => s / weight >= lo - 1e-9 && s / weight <= hi + 1e-9);
  if (!fitting.length) return null;
  return fitting.reduce((a, b) => (Math.abs(b / weight - targetPerKg) < Math.abs(a / weight - targetPerKg) ? b : a));
}

/* Таблетки — едва от 25 kg: по-малките деца пият суспензия, а половин
 * таблетка за възрастен е твърде неточна за тях. */
export const TABLET_MIN_KG = 25;

/**
 * Брой таблетки (на половинки), най-близо до изчислената доза, без да се
 * надвиши максимумът и — при зададен диапазон — извън допустимите mg/kg.
 */
function pickTablets(form, mg, weight, { cap = Infinity, rangePerKg = null } = {}) {
  if (weight < TABLET_MIN_KG) return null;
  let best = null;
  for (let count = 0.5; count <= 4; count += 0.5) {
    const dose = count * form.mg;
    if (dose > cap + 1e-9) break;
    if (rangePerKg && (dose / weight < rangePerKg[0] - 1e-9 || dose / weight > rangePerKg[1] + 1e-9)) continue;
    if (!best || Math.abs(dose - mg) < Math.abs(best.mg - mg)) best = { count, mg: dose };
  }
  return best;
}

const tabletText = (n) => (n === 0.5 ? '½ таблетка' : n === 1 ? '1 таблетка'
  : Number.isInteger(n) ? `${n} таблетки` : `${Math.floor(n)} и ½ таблетки`);

/**
 * @param {object} o
 * @param {string} o.drugId
 * @param {string} [o.regimenId]
 * @param {string} [o.formId]
 * @param {number} o.weightKg
 * @param {number} [o.ageMonths]
 * @param {number} [o.days]         продължителност (антибиотици)
 * @param {object} [o.patient]      за алергиите и заболяванията
 */
export function computeDose(o) {
  const drug = DOSING_DRUGS[o.drugId];
  if (!drug) throw new Error('Непознато лекарство.');
  const weight = Number(o.weightKg);
  if (!Number.isFinite(weight) || weight < 1 || weight > 150) throw new Error('Въведете тегло между 1 и 150 kg.');
  const regimen = findRegimen(drug, o.regimenId);
  const form = findForm(drug, o.formId, regimen);
  const age = Number.isFinite(o.ageMonths) ? o.ageMonths : null;
  const warnings = [...patientWarnings(o.drugId, o.patient)];
  const unit = drug.doseOf ? `mg ${drug.doseOf}` : 'mg';

  const minAge = regimen.minAgeMonths ?? drug.minAgeMonths;
  // При парацетамол под 3 месеца има отделно, по-конкретно предупреждение по-долу.
  if (age !== null && minAge && age < minAge && o.drugId !== 'paracetamol') {
    const when = minAge >= 12 ? `${minAge / 12} години` : minAge === 1.5 ? '6 седмици' : `${minAge} месеца`;
    warnings.push({ level: 'bad', text: `Под ${when}: този режим не е предназначен за тази възраст.` });
  }
  if (drug.minWeightKg && weight < drug.minWeightKg) {
    warnings.push({ level: 'bad', text: `Под ${drug.minWeightKg} kg: не се препоръчва.` });
  }
  if (o.drugId === 'paracetamol' && age !== null && age < 3) {
    warnings.push({ level: 'bad', text: 'Кърмаче под 3 месеца с температура — първо преглед. Парацетамол само по лекарско предписание, с по-дълъг интервал.' });
  }
  if (o.drugId === 'azithromycin' && age !== null && age < 1) {
    warnings.push({ level: 'warn', text: 'Под 1 месец: риск от хипертрофична пилорна стеноза — наблюдавайте за повръщане.' });
  }
  if (weight >= 50 || (age !== null && age >= 216)) {
    warnings.push({ level: 'info', text: 'Над 50 kg или над 18 години се дозира като възрастен; изчислението спира при дозата за възрастен.' });
  }
  if (regimen.forms && form.type === 'liquid' && !regimen.forms.includes(form.id)) {
    const right = drug.forms.filter(f => regimen.forms.includes(f.id)).map(f => f.label).join(', ');
    warnings.push({ level: 'warn', text: `За този режим е подходяща ${right}.` });
  }

  const res = {
    drugId: o.drugId, drug: drug.name, group: drug.group, regimen, form, weightKg: weight, ageMonths: age,
    unit, warnings, notes: [...(drug.notes || []), ...(regimen.note ? [regimen.note] : [])],
    parentNotes: drug.parentNotes || [],
  };

  if (drug.group === 'antipyretic') {
    const target = Math.min(weight * regimen.perKgDose, regimen.maxDose);
    const maxDay = Math.min(weight * regimen.maxPerKgDay, regimen.maxDay);
    res.asNeeded = true;
    res.everyHours = regimen.everyHours;
    res.maxDosesPerDay = regimen.maxDosesPerDay;
    res.cappedDose = weight * regimen.perKgDose > regimen.maxDose;
    res.maxDay = { mg: round1(maxDay), perKg: round1(maxDay / weight) };
    if (form.type === 'liquid') {
      const perDoseCap = Math.min(regimen.maxDose, maxDay / regimen.maxDosesPerDay);
      const d = liquid(form, target, perDoseCap);
      res.dose = { ...d, perKg: round1(d.mg / weight) };
      res.maxDay.ml = roundMl(maxDay / (form.mgPer5ml / 5), maxDay / (form.mgPer5ml / 5));
    } else if (form.type === 'suppository') {
      const s = pickSuppository(form, weight, regimen.perKgDose);
      res.suppository = s ? { mg: s, perKg: round1(s / weight), perDay: Math.min(regimen.maxDosesPerDay, Math.floor(maxDay / s + 1e-9)) } : null;
      if (!s) warnings.push({ level: 'warn', text: 'Няма супозитория в подходяща сила за това тегло — изберете суспензия.' });
      res.dose = s ? { mg: s, perKg: round1(s / weight) } : null;
    } else {
      const t = pickTablets(form, target, weight, { cap: Math.min(regimen.maxDose, maxDay / regimen.maxDosesPerDay), rangePerKg: regimen.rangePerKg });
      res.tablets = t ? { ...t, perKg: round1(t.mg / weight), text: tabletText(t.count) } : null;
      if (!t) warnings.push({ level: 'warn', text: weight < TABLET_MIN_KG ? `Таблетки — от ${TABLET_MIN_KG} kg; изберете суспензия.` : 'Таблетката не пасва на дозата за това тегло — изберете суспензия.' });
      res.dose = t ? { mg: t.mg, perKg: round1(t.mg / weight) } : null;
    }
    res.text = instruction(res);
    return res;
  }

  /* ------------------------------- антибиотици ------------------------------- */
  const infantAll = regimen.infantAllDays && age !== null && age < regimen.infantAllDays;
  const days = regimen.fixedDays ? regimen.days : Math.max(1, Math.min(30, Math.round(Number(o.days) || regimen.days)));
  const doses = regimen.doses;
  const perDose = Math.min((weight * regimen.perKgDay) / doses, regimen.maxDose, regimen.maxDay / doses);
  res.dosesPerDay = doses;
  res.days = days;
  res.everyText = EVERY[doses];
  res.cappedDose = (weight * regimen.perKgDay) / doses > Math.min(regimen.maxDose, regimen.maxDay / doses) + 1e-9;

  const later = regimen.then && !infantAll
    ? Math.min(weight * regimen.then.perKgDay, regimen.then.maxDose) : null;

  if (form.type === 'liquid') {
    const d = liquid(form, perDose, Math.min(regimen.maxDose, regimen.maxDay / doses));
    res.dose = { ...d, perKg: round1(d.mg / weight) };
    let course = d.ml * doses * (later === null ? days : 1);
    if (later !== null) {
      const l = liquid(form, later, regimen.then.maxDose);
      res.laterDose = { ...l, perKg: round1(l.mg / weight), fromDay: 2 };
      course += l.ml * (days - 1);
    }
    res.courseMl = Math.ceil(course);
    if (form.clavPer5ml) {
      const clavPerKgDay = (d.ml * (form.clavPer5ml / 5) * doses) / weight;
      res.clavPerKgDay = round1(clavPerKgDay);
      if (clavPerKgDay > 10 + 0.05) {
        warnings.push({ level: 'warn', text: `Клавуланова киселина ${fmt(clavPerKgDay)} mg/kg дневно (над 10) — повече диария; изберете суспензия с по-малко клавуланова киселина.` });
      }
    }
    if (form.totalPer5ml) res.dose.totalMg = round1(d.ml * (form.totalPer5ml / 5));
  } else {
    const t = pickTablets(form, perDose, weight, { cap: Math.min(regimen.maxDose, regimen.maxDay / doses) });
    res.tablets = t ? { ...t, perKg: round1(t.mg / weight), text: tabletText(t.count) } : null;
    if (!t) warnings.push({ level: 'warn', text: weight < TABLET_MIN_KG ? `Таблетки — от ${TABLET_MIN_KG} kg; изберете суспензия.` : 'Таблетката е твърде голяма за това тегло — изберете суспензия.' });
    else if (Math.abs(t.mg - perDose) > perDose * 0.15) warnings.push({ level: 'warn', text: `С таблетки дозата е ${fmt(t.mg / weight)} mg/kg на прием вместо ${fmt(perDose / weight)} — по-точно е със суспензия.` });
    res.dose = t ? { mg: t.mg, perKg: round1(t.mg / weight) } : null;
    if (later !== null) {
      const lt = pickTablets(form, later, weight, { cap: regimen.then.maxDose });
      res.laterDose = lt ? { mg: lt.mg, perKg: round1(lt.mg / weight), text: tabletText(lt.count), fromDay: 2 } : null;
    }
    if (res.dose && form.totalMg) res.dose.totalMg = round1((t.mg / form.mg) * form.totalMg);
  }
  res.dayMg = res.dose ? round1(res.dose.mg * doses) : null;
  res.text = instruction(res);
  return res;
}

/** Кратък текст за амбулаторния лист или за родителя. */
function instruction(r) {
  const f = r.form;
  const head = `${r.drug} ${f.label}`;
  if (r.group === 'antipyretic') {
    if (f.type === 'liquid' && r.dose) {
      return `${head}: ${fmt(r.dose.ml)} ml (${fmt(r.dose.mg, 0)} mg) при нужда, през ${r.everyHours} часа, `
        + `не повече от ${r.maxDosesPerDay} пъти за 24 часа (до ${fmt(r.maxDay.ml)} ml дневно).`;
    }
    if (r.suppository) {
      return `${r.drug} супозитория ${r.suppository.mg} mg: по 1 при нужда, през ${r.everyHours} часа, `
        + `не повече от ${r.suppository.perDay} за 24 часа.`;
    }
    if (r.tablets) {
      return `${head}: ${r.tablets.text} (${fmt(r.tablets.mg, 0)} mg) при нужда, през ${r.everyHours} часа, `
        + `не повече от ${r.maxDosesPerDay} пъти за 24 часа.`;
    }
    return '';
  }
  if (!r.dose) return '';
  const unit = r.unit;
  const amount = f.type === 'liquid' ? `${fmt(r.dose.ml)} ml (${fmt(r.dose.mg, 0)} ${unit})` : `${r.tablets.text} (${fmt(r.dose.mg, 0)} ${unit})`;
  let text = `${head}: ${amount} ${r.everyText}`;
  if (r.laterDose) {
    const lAmount = f.type === 'liquid' ? `${fmt(r.laterDose.ml)} ml (${fmt(r.laterDose.mg, 0)} ${unit})` : `${r.laterDose.text} (${fmt(r.laterDose.mg, 0)} ${unit})`;
    text += ` първия ден, от 2-ия ден ${lAmount} веднъж дневно`;
  }
  text += `, ${r.days} ${r.days === 1 ? 'ден' : 'дни'}`;
  if (f.type === 'liquid' && r.courseMl) text += ` (общо около ${r.courseMl} ml)`;
  return text + '.';
}
