#!/usr/bin/env node
/* Създава примерен регистър — деца и възрастни, — за да може платформата да
 * се разгледа веднага.
 *
 * Употреба:  node scripts/demo-data.js [--force]
 * Записва в DATA_DIR (по подразбиране ./data). Отказва да пише върху
 * съществуващи данни, освен ако не е подадено --force.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, hashPin } from '../lib/store.js';
import { addDays, addMonths, today } from '../public/js/shared/dates.js';
import { computePlan } from '../public/js/shared/schedule.js';
import { CHECKPOINTS, checkpointFor } from '../public/js/shared/development.js';
import { correctionMonths, lmsAt, valueAtZ } from '../public/js/shared/growth.js';
import { evaluate } from '../public/js/shared/mental.js';
import { LABS } from '../public/js/shared/labs.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const force = process.argv.includes('--force');

const FIRST_M = ['Иван', 'Георги', 'Николай', 'Мартин', 'Александър', 'Виктор', 'Борис', 'Даниел',
  'Кристиян', 'Стефан', 'Калоян', 'Симеон', 'Тодор', 'Явор', 'Радослав'];
const FIRST_F = ['Мария', 'Виктория', 'Никол', 'Александра', 'Габриела', 'Дария', 'Ема', 'Йоана',
  'Рая', 'София', 'Теодора', 'Елена', 'Магдалена', 'Симона', 'Ралица'];
const MIDDLE = ['Иванов', 'Петров', 'Георгиев', 'Димитров', 'Стоянов', 'Николов', 'Тодоров', 'Ангелов'];
const LAST = ['Иванов', 'Петров', 'Георгиев', 'Димитров', 'Стоянов', 'Николов', 'Тодоров', 'Ангелов',
  'Колев', 'Маринов', 'Василев', 'Христов'];

let seed = 20260903;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + rnd() * (b - a);

function femaleForm(surname) {
  return surname.endsWith('ов') || surname.endsWith('ев') ? surname + 'а' : surname;
}

/** Генерира ЕГН с вярна контролна цифра за дадена дата и пол. */
function makeEgn(birthISO, sex, serial) {
  const [y, m, d] = birthISO.split('-').map(Number);
  let mm = m;
  if (y >= 2000) mm = m + 40;
  else if (y < 1900) mm = m + 20;
  const yy = String(y % 100).padStart(2, '0');
  // Деветата цифра е четна за момче и нечетна за момиче.
  let order = (serial % 500) * 2 + (sex === 'f' ? 1 : 0);
  const base = yy + String(mm).padStart(2, '0') + String(d).padStart(2, '0') + String(order).padStart(3, '0');
  const weights = [2, 4, 8, 5, 10, 9, 7, 3, 6];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(base[i]), 0);
  return base + String((sum % 11) % 10);
}

/** Данни при раждане; около 8% от децата са недоносени. */
function birthData() {
  const preterm = rnd() < 0.08;
  const gestWeeks = preterm ? Math.floor(between(29, 37)) : Math.floor(between(37, 41));
  const scale = preterm ? (gestWeeks - 24) / 16 : 1;
  return {
    weight: +(between(2.6, 4.1) * (preterm ? 0.45 + scale * 0.5 : 1)).toFixed(2),
    height: +(between(47, 54) * (preterm ? 0.78 + scale * 0.2 : 1)).toFixed(0),
    head: +(between(33, 36) * (preterm ? 0.82 + scale * 0.16 : 1)).toFixed(0),
    gestWeeks,
    apgar: preterm ? '7/9' : '9/10',
    delivery: preterm || rnd() < 0.3 ? 'секцио' : 'нормално',
  };
}

function measurementFor(sex, ageMonths, zShift) {
  const w = lmsAt('weight', sex, ageMonths);
  const hKey = ageMonths <= 60 ? 'height' : 'height';
  const hLms = lmsAt(hKey, sex, ageMonths);
  const head = ageMonths <= 60 ? lmsAt('head', sex, ageMonths) : null;
  return {
    weight: w ? +valueAtZ(w, zShift + between(-0.25, 0.25)).toFixed(2) : null,
    height: hLms ? +valueAtZ(hLms, zShift + between(-0.25, 0.25)).toFixed(1) : null,
    head: head ? +valueAtZ(head, zShift * 0.6 + between(-0.2, 0.2)).toFixed(1) : null,
  };
}

/* -------------------------------- възрастни -------------------------------- */

const ADULT_M = ['Стоян', 'Петър', 'Димитър', 'Христо', 'Васил', 'Любомир', 'Красимир', 'Емил', 'Пламен', 'Валентин', 'Атанас', 'Росен'];
const ADULT_F = ['Росица', 'Весела', 'Даниела', 'Цветелина', 'Надежда', 'Галина', 'Катя', 'Снежана', 'Милена', 'Антония', 'Йорданка', 'Светла'];

/* Профили: заболявания, лекарства и колко добре е контролиран пациентът.
 * [профил, брой, възраст от–до, пол (m/f/null)] */
const PROFILES = [
  ['healthy', 7, 22, 62, null],
  ['htn', 5, 45, 76, null],
  ['metabolic', 6, 48, 74, null],
  ['af', 3, 70, 86, null],
  ['ckd', 2, 60, 78, null],
  ['copd', 2, 55, 72, 'm'],
  ['asthma', 1, 28, 45, 'f'],
  ['thyroid', 2, 35, 62, 'f'],
  ['mental', 3, 26, 55, null],
  ['elderly', 2, 81, 89, 'f'],
  ['gout', 1, 50, 65, 'm'],
  ['masld', 1, 42, 58, 'm'],
  ['young', 2, 19, 21, null],
];

const MEDS = {
  htn: [['perindopril+amlodipine', '5/5 мг', { m: '1' }], ['bisoprolol', '5 мг', { m: '1' }]],
  htn2: [['telmisartan+hydrochlorothiazide', '80/12,5 мг', { m: '1' }]],
  dm: [['metformin', '1000 мг', { m: '1', e: '1' }], ['empagliflozin', '10 мг', { m: '1' }, { protocol: true }]],
  dmNoSglt: [['metformin', '850 мг', { m: '1', e: '1' }], ['gliclazide', '60 мг', { m: '1' }]],
  statin: [['rosuvastatin', '20 мг', { e: '1' }]],
  statinLow: [['atorvastatin', '20 мг', { e: '1' }]],
  afOac: [['apixaban', '5 мг', { m: '1', e: '1' }, { protocol: true }], ['bisoprolol', '5 мг', { m: '1' }]],
  afNoOac: [['bisoprolol', '2,5 мг', { m: '1' }], ['acetylsalicylic_acid', '100 мг', { n: '1' }]],
  hf: [['sacubitril+valsartan', '49/51 мг', { m: '1', e: '1' }, { protocol: true }], ['furosemide', '40 мг', { m: '1' }], ['spironolactone', '25 мг', { m: '1' }], ['dapagliflozin', '10 мг', { m: '1' }, { protocol: true }]],
  copd: [['tiotropium', '2,5 мкг', { m: '2' }, { protocol: true }], ['salbutamol', '100 мкг', {}, { prn: true }]],
  asthma: [['budesonide+formoterol', '160/4,5 мкг', { m: '1', e: '1' }]],
  thyroid: [['levothyroxine', '75 мкг', { m: '1' }, { note: 'на гладно, 30 мин преди закуска' }]],
  depression: [['sertraline', '50 мг', { m: '1' }]],
  anxiety: [['escitalopram', '10 мг', { m: '1' }]],
  dementia: [['donepezil', '10 мг', { e: '1' }], ['alprazolam', '0,5 мг', { b: '1' }], ['alendronate', '70 мг', {}, { note: 'веднъж седмично, в неделя' }], ['cholecalciferol', '1000 IU', { m: '1' }], ['pantoprazole', '40 мг', { m: '1' }]],
  gout: [['allopurinol', '300 мг', { m: '1' }], ['amlodipine', '5 мг', { m: '1' }]],
  nsaid: [['diclofenac', '75 мг', { m: '1', e: '1' }]],
};

function adultName(sex) {
  const middle = pick(MIDDLE);
  const surname = pick(LAST);
  return [sex === 'm' ? pick(ADULT_M) : pick(ADULT_F),
    sex === 'f' ? femaleForm(middle) : middle, sex === 'f' ? femaleForm(surname) : surname].join(' ');
}

const r1 = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

function makeAdults(store, t) {
  let n = 0;
  for (const [profile, count, ageFrom, ageTo, fixedSex] of PROFILES) {
    for (let k = 0; k < count; k++) {
      n++;
      const sex = fixedSex || (rnd() < 0.5 ? 'm' : 'f');
      const age = Math.floor(between(ageFrom, ageTo + 1));
      const birthDate = addDays(addMonths(t, -12 * age), -Math.floor(rnd() * 330));
      // Колко добре е контролиран и колко редовно идва: 0 — лошо, 1 — отлично.
      const control = rnd();
      const diligent = rnd() < 0.75;
      // Възрастните са регистрирани като възрастни; „young“ — като деца, преди години.
      const registeredMonthsAgo = profile === 'young' ? 12 * (age - 8) : Math.floor(between(4, 36));
      const createdAt = addMonths(t, -registeredMonthsAgo) + 'T09:00:00.000Z';
      const name = adultName(sex);
      const p = {
        id: 'demo-a-' + String(n).padStart(3, '0'),
        name, egn: makeEgn(birthDate, sex, 300 + n), sex, birthDate,
        phone: '08' + Math.floor(between(70000000, 99999999)),
        address: 'гр. София',
        doctorId: rnd() < 0.6 ? 'demo-doc-1' : 'demo-doc-2',
        contacts: rnd() < 0.5 ? [{ name: pick(ADULT_F) + ' ' + femaleForm(pick(LAST)), relation: 'близък', phone: '08' + Math.floor(between(70000000, 99999999)) }] : [],
        allergies: rnd() < 0.12 ? [pick(['пеницилин', 'сулфонамиди', 'йодни контрастни средства', 'аспирин'])] : [],
        conditions: [], notes: '',
        records: {}, optIn: [], measurements: [], visits: [], reminders: [], development: [],
        chronic: [], meds: [], results: [], assessments: [], nutritionPlans: [], lifestyle: {},
        createdAt,
      };
      const reg = createdAt.slice(0, 10);
      // Кога заболяванията и лекарствата са въведени в програмата — около 3 години назад.
      const enteredAt = (reg > addMonths(t, -40) ? reg : addMonths(t, -40)) + 'T09:00:00.000Z';
      const since = (yearsAgo) => {
        const d = addMonths(t, -Math.round(yearsAgo * 12));
        return d < addMonths(birthDate, 12 * 18) ? addMonths(birthDate, 12 * 18) : d;
      };
      const cond = (code, yearsAgo, extra = {}) => p.chronic.push({
        id: `demo-c-${n}-${code}`, code, since: since(yearsAgo), note: '', targets: {}, status: 'active', addedAt: enteredAt, ...extra,
      });
      const med = (drug, dose, schedule, opts = {}) => {
        const rx = diligent ? Math.floor(between(2, 38)) : Math.floor(between(20, 60));
        p.meds.push({
          id: `demo-rx-${n}-${p.meds.length}`, drug, name: '', dose, schedule, prn: !!opts.prn,
          start: addMonths(t, -Math.floor(between(6, 60))), end: '', indication: opts.indication || '',
          chronic: true, prescribedOn: opts.prn ? '' : addDays(t, -rx), supplyDays: opts.prn ? null : 30,
          protocolUntil: opts.protocol ? addDays(t, Math.floor(between(-15, 170))) : '', note: opts.note || '',
          addedAt: enteredAt,
        });
      };
      const addMeds = (key, indication) => { for (const [d, dose, sch, opts] of MEDS[key]) med(d, dose, sch, { ...(opts || {}), indication }); };

      /* --- заболявания и лечение по профил --- */
      const smoker = profile === 'copd' ? (rnd() < 0.6 ? 'current' : 'former') : rnd() < 0.24 ? 'current' : rnd() < 0.3 ? 'former' : 'never';
      let bpBase = 122 + between(-6, 8);
      let hba1c = null, egfrTarget = sex === 'm' ? between(80, 100) : between(78, 98);
      let ldl = between(2.6, 4.2), weightBmi = between(21, 29);
      if (profile === 'htn') {
        cond('htn', between(3, 15));
        addMeds(rnd() < 0.5 ? 'htn' : 'htn2', 'htn');
        if (rnd() < 0.6) { cond('dyslip', between(2, 8)); addMeds('statinLow', 'dyslip'); ldl = control > 0.5 ? between(1.3, 1.9) : between(2.2, 3.4); }
        bpBase = control > 0.55 ? between(124, 132) : control > 0.25 ? between(136, 146) : between(150, 166);
        weightBmi = between(25, 31);
      }
      if (profile === 'metabolic') {
        cond('dm2', between(3, 14)); cond('htn', between(4, 16)); cond('dyslip', between(2, 10));
        if (rnd() < 0.5) cond('obesity', between(2, 8));
        addMeds(rnd() < 0.55 ? 'dm' : 'dmNoSglt', 'dm2'); addMeds('htn', 'htn'); addMeds(rnd() < 0.5 ? 'statin' : 'statinLow', 'dyslip');
        hba1c = control > 0.6 ? between(6.4, 6.9) : control > 0.3 ? between(7.1, 7.8) : between(8.1, 9.4);
        bpBase = control > 0.5 ? between(126, 134) : between(138, 154);
        ldl = control > 0.5 ? between(1.1, 1.6) : between(2.0, 3.3);
        weightBmi = between(28, 36);
        if (rnd() < 0.4) egfrTarget = between(48, 70);
      }
      if (profile === 'af') {
        cond('af', between(1, 8)); cond('htn', between(5, 20));
        const noOac = k === 1;
        addMeds(noOac ? 'afNoOac' : 'afOac', 'af');
        if (k === 2) { cond('hf', between(1, 4)); addMeds('hf', 'hf'); cond('dm2', between(4, 12)); med('metformin', '1000 мг', { m: '1', e: '1' }, { indication: 'dm2' }); hba1c = between(6.8, 7.6); }
        if (k === 0) { med('diclofenac', '50 мг', { m: '1', e: '1' }, { note: 'за болки в коляното' }); med('telmisartan+hydrochlorothiazide', '80/12,5 мг', { m: '1' }, { indication: 'htn' }); }
        egfrTarget = between(45, 68);
        bpBase = between(128, 146);
        weightBmi = between(24, 30);
      }
      if (profile === 'ckd') {
        cond('ckd', between(2, 7)); cond(k === 0 ? 'dm2' : 'htn', between(6, 15));
        if (k === 0) { cond('htn', between(5, 12)); med('metformin', '1000 мг', { m: '1', e: '1' }, { indication: 'dm2' }); hba1c = between(7.0, 7.9); }
        med('ramipril', '5 мг', { m: '1' }, { indication: 'ckd' });
        med('atorvastatin', '40 мг', { e: '1' }, { indication: 'ckd' });
        egfrTarget = k === 0 ? between(26, 34) : between(38, 50);
        bpBase = between(132, 148);
      }
      if (profile === 'copd') { cond('copd', between(3, 12)); addMeds('copd', 'copd'); if (rnd() < 0.5) { cond('htn', between(2, 10)); addMeds('htn2', 'htn'); } }
      if (profile === 'asthma') { cond('asthma', between(5, 20)); addMeds('asthma', 'asthma'); }
      if (profile === 'thyroid') { cond('hypothyroid', between(2, 12)); addMeds('thyroid', 'hypothyroid'); }
      if (profile === 'mental') {
        if (k === 1) { cond('anxiety', between(0.5, 3)); addMeds('anxiety', 'anxiety'); } else { cond('depression', between(0.3, 2)); addMeds('depression', 'depression'); }
      }
      if (profile === 'elderly') {
        cond('dementia', between(1, 4)); cond('osteoporosis', between(2, 8)); cond('htn', between(10, 25));
        addMeds('dementia', 'dementia'); med('amlodipine', '5 мг', { m: '1' }, { indication: 'htn' });
        egfrTarget = between(42, 58); bpBase = between(132, 150); weightBmi = between(20, 24);
      }
      if (profile === 'gout') { cond('gout', between(2, 8)); cond('htn', between(3, 10)); addMeds('gout', 'gout'); bpBase = between(130, 142); weightBmi = between(28, 33); }
      if (profile === 'masld') { cond('obesity', between(3, 8)); cond('masld', between(1, 4)); cond('prediabetes', between(1, 3)); weightBmi = between(31, 36); hba1c = between(5.8, 6.3); }

      p.lifestyle = {
        smoking: smoker, alcohol: profile === 'masld' || rnd() < 0.15 ? 'high' : rnd() < 0.6 ? 'low' : 'none',
        activity: rnd() < 0.5 ? 'sedentary' : rnd() < 0.7 ? 'light' : 'moderate',
        diet: [], bleedingHistory: false, notes: '', updatedOn: addMonths(t, -Math.floor(between(1, 18))),
      };

      /* --- измервания: на 4–8 месеца в последните 3 години --- */
      const height = sex === 'm' ? Math.round(between(166, 188)) : Math.round(between(154, 172));
      const weight0 = r1(weightBmi * (height / 100) ** 2, 1);
      const trend = profile === 'metabolic' && control > 0.6 ? -between(2, 6) : between(-2, 3);
      const firstMeas = reg > addMonths(t, -36) ? reg : addMonths(t, -36);
      const lastGap = diligent ? Math.floor(between(10, 120)) : Math.floor(between(200, 400));
      let d = addDays(firstMeas, Math.floor(between(0, 60)));
      const measDates = [];
      while (d <= addDays(t, -lastGap)) { measDates.push(d); d = addDays(d, Math.floor(between(120, 240))); }
      if (!measDates.length) measDates.push(addDays(t, -lastGap));
      measDates.forEach((date, i) => {
        const progress = measDates.length > 1 ? i / (measDates.length - 1) : 1;
        const sys = Math.round(bpBase + between(-6, 6) + (control > 0.6 ? (1 - progress) * 8 : 0));
        p.measurements.push({
          id: `demo-am-${n}-${i}`, date,
          weight: r1(weight0 + trend * progress + between(-0.8, 0.8), 1),
          height: i === 0 ? height : null, head: null,
          waist: i % 2 === 0 ? Math.round((weightBmi * 3.2) + (sex === 'm' ? 8 : 0) + between(-4, 4)) : null,
          systolic: sys, diastolic: Math.round(sys * 0.6 + between(-4, 6)), pulse: Math.round(between(58, 86)),
          note: '', doctorId: p.doctorId,
        });
      });

      /* --- изследвания --- */
      const res = (date, code, value, text) => p.results.push({
        id: `demo-r-${n}-${p.results.length}`, date, code, value: value === null ? null : r1(value, LABS[code]?.decimals ?? 1), text: text || '', note: '',
      });
      const labYears = [];
      const lastLab = diligent ? Math.floor(between(20, 300)) : Math.floor(between(380, 620));
      for (let y = 0; y < 3; y++) {
        const date = addDays(t, -(lastLab + y * Math.floor(between(330, 400))));
        if (date >= reg && date > addMonths(t, -40)) labYears.push(date);
      }
      // Всеки пациент има поне едни изследвания след регистрацията.
      if (!labYears.length) labYears.push(addDays(reg, Math.floor(between(7, 40))));
      const ageAt = (date) => (Date.parse(date) - Date.parse(birthDate)) / (365.25 * 86400000);
      const creatFor = (egfr, date) => {
        // Обратно на CKD-EPI 2021 — креатинин, който дава желаната eGFR.
        const a = ageAt(date);
        const [kappa, alpha, fem] = sex === 'f' ? [0.7, -0.241, 1.012] : [0.9, -0.302, 1];
        for (let scr = 0.4; scr < 8; scr += 0.01) {
          const ratio = scr / kappa;
          const e = 142 * Math.min(ratio, 1) ** alpha * Math.max(ratio, 1) ** -1.2 * 0.9938 ** a * fem;
          if (e <= egfr) return scr * 88.4;
        }
        return 600;
      };
      for (const [i, date] of labYears.entries()) {
        const drift = i * 0.08;
        if (p.chronic.length || age >= 40 || rnd() < 0.5) {
          const l = ldl + drift * (control > 0.5 ? 1 : 0.4) + between(-0.2, 0.2);
          const hdl = sex === 'f' ? between(1.2, 1.8) : between(0.9, 1.4);
          const tg = between(0.9, profile === 'metabolic' || profile === 'masld' ? 3.2 : 1.9);
          res(date, 'ldl', l); res(date, 'hdl', hdl); res(date, 'tg', tg); res(date, 'tchol', l + hdl + tg / 2.2);
          res(date, 'glucose', hba1c ? between(6.8, 9.5) : between(4.4, 5.6));
        }
        if (p.chronic.length || age >= 50) {
          res(date, 'creat', creatFor(egfrTarget + i * 2 + between(-2, 2), date));
          res(date, 'k', profile === 'ckd' && k === 0 && i === 0 ? 5.6 : between(3.9, 5.0));
          if (p.chronic.some(c => c.code === 'hf')) res(date, 'na', between(134, 142));
        }
        if (hba1c || profile === 'ckd') res(date, 'uacr', profile === 'ckd' ? between(8, 45) : control > 0.5 ? between(0.5, 2.8) : between(3, 15));
        if (['af', 'hf', 'ckd', 'elderly'].includes(profile)) { res(date, 'hb', sex === 'm' ? between(128, 152) : between(115, 138)); res(date, 'plt', between(170, 320)); res(date, 'wbc', between(4.8, 8.5)); }
        if (profile === 'thyroid' || profile === 'af') res(date, 'tsh', control > 0.35 ? between(0.9, 3.6) : between(5.2, 8.5));
        if (profile === 'masld' || profile === 'metabolic') { res(date, 'alt', between(28, 78)); res(date, 'ast', between(24, 58)); if (profile === 'masld') res(date, 'plt', between(150, 230)); }
        if (profile === 'gout') res(date, 'urate', control > 0.5 ? between(290, 350) : between(390, 470));
        if (['af', 'htn', 'metabolic', 'ckd'].includes(profile)) res(date, 'ecg', null, pick(['синусов ритъм, без промени', 'синусов ритъм, ЛВХ', profile === 'af' ? 'предсърдно мъждене, КЧ 78/мин' : 'синусов ритъм']));
        if (hba1c && profile !== 'masld' && i === 0 && diligent) { res(date, 'eye', null, 'без диабетна ретинопатия'); res(date, 'foot', null, 'запазена чувствителност, пулсации налични'); }
        if (profile === 'copd' && i === 0) res(date, 'spiro', null, 'FEV1/FVC 0,62; FEV1 58% — GOLD 2');
      }
      // HbA1c на 3–6 месеца.
      if (hba1c) {
        const every = control > 0.5 ? 6 : 4;
        let date = addDays(t, -(diligent ? Math.floor(between(15, 150)) : Math.floor(between(220, 330))));
        for (let i = 0; i < 6 && date >= reg; i++) {
          res(date, 'hba1c', hba1c + i * (control > 0.6 ? 0.15 : -0.05) + between(-0.15, 0.15));
          date = addMonths(date, -every);
        }
      }

      /* --- скали --- */
      const assess = (date, tool, answers, number = null) => {
        const result = evaluate(tool, answers, { sex, number });
        p.assessments.push({ id: `demo-as-${n}-${p.assessments.length}`, date, tool, answers, extra: null, number, score: result.score, result, note: '', doctorId: p.doctorId, recordedAt: date + 'T10:00:00.000Z' });
      };
      if (profile === 'mental' && k !== 1) {
        const series = k === 0
          ? [[2, 2, 2, 2, 1, 2, 1, 1, 0], [2, 1, 2, 1, 1, 1, 1, 0, 0], [1, 1, 1, 1, 0, 1, 0, 0, 0], [0, 1, 1, 0, 0, 0, 0, 0, 0]]
          : [[2, 3, 2, 3, 2, 2, 2, 1, 1], [3, 3, 2, 2, 2, 3, 2, 1, 1]];
        series.forEach((a, i) => assess(addDays(t, -((series.length - 1 - i) * 42 + (k === 0 ? 20 : 6))), 'phq9', a));
      }
      if (profile === 'mental' && k === 1) {
        [[2, 2, 3, 2, 1, 2, 2], [1, 2, 2, 1, 1, 1, 1], [1, 1, 1, 1, 0, 1, 0]].forEach((a, i) => assess(addDays(t, -((2 - i) * 50 + 15)), 'gad7', a));
      }
      if (profile === 'healthy' && rnd() < 0.5) assess(addDays(t, -Math.floor(between(30, 300))), 'phq4', [0, pick([0, 1]), 0, pick([0, 1])]);
      if (rnd() < 0.3) assess(addDays(t, -Math.floor(between(30, 500))), 'auditc', [pick([0, 1, 2, 3]), pick([0, 1]), pick([0, 1])]);
      if (profile === 'elderly') {
        assess(addDays(t, -Math.floor(between(60, 200))), 'minicog', [pick([0, 1]), 0]);
        assess(addDays(t, -Math.floor(between(30, 200))), 'falls', [1, 1, 1], r1(between(14, 22), 0));
      }
      if (profile === 'af' && age >= 70 && rnd() < 0.5) assess(addDays(t, -Math.floor(between(30, 300))), 'falls', [0, pick([0, 1]), 0], r1(between(9, 13), 0));

      /* --- диспансерни прегледи --- */
      if (p.chronic.length) {
        const every = profile === 'hf' || profile === 'mental' ? 3 : 6;
        let date = addDays(t, -(diligent ? Math.floor(between(10, every * 28)) : Math.floor(between(every * 35, every * 60))));
        for (let i = 0; i < 5 && date >= reg; i++) {
          p.visits.push({
            id: `demo-av-${n}-${i}`, date, type: 'Диспансерен преглед', complaint: '', findings: '',
            diagnosis: p.chronic.map(c => c.code).includes('dm2') ? 'Захарен диабет тип 2' : '', icd: '',
            treatment: 'Продължава терапията', note: '', doctorId: p.doctorId,
          });
          date = addMonths(date, -every);
        }
      }
      if (rnd() < 0.5) {
        p.visits.push({
          id: `demo-av-${n}-acute`, date: addDays(t, -Math.floor(between(20, 500))), type: 'Амбулаторен преглед',
          complaint: pick(['кашлица и температура', 'болки в кръста', 'главоболие', 'болки в гърлото']),
          findings: '', diagnosis: pick(['Остър бронхит', 'Лумбаго', 'Остър фарингит', 'Тензионно главоболие']),
          icd: pick(['J20.9', 'M54.5', 'J02.9', 'G44.2']), treatment: 'симптоматично', note: '', doctorId: p.doctorId,
        });
      }

      /* --- профилактика по календара --- */
      if (age >= 50 && rnd() < 0.4) p.optIn.push('ad-zoster-1', 'ad-zoster-2');
      const plan = computePlan(p, store.schedule, { asOf: t });
      for (const e of plan) {
        if (e.due > t || e.status === 'done') continue;
        if (e.item.track !== 'adult' && profile !== 'young') continue;
        // Детските имунизации на регистрираните като деца са почти всички поставени.
        const chance = e.item.track !== 'adult' ? (e.group === 'vaccine' ? 0.98 : 0.7) : diligent ? 0.8 : 0.35;
        if (rnd() > chance) continue;
        const doneDate = addDays(e.due, Math.floor(between(0, 60)));
        if (doneDate > t) continue;
        p.records[e.id] = {
          status: 'done', date: doneDate, batch: e.group === 'vaccine' ? 'L' + Math.floor(between(10000, 99999)) : '',
          product: '', note: '', doctorId: p.doctorId, recordedAt: doneDate + 'T10:00:00.000Z',
        };
      }

      // Втората доза срещу херпес зостер — поне 2 месеца след първата.
      const z1 = p.records['ad-zoster-1'], z2 = p.records['ad-zoster-2'];
      if (z2 && (!z1 || z2.date < addMonths(z1.date, 2))) {
        if (z1 && addMonths(z1.date, 2) <= t) z2.date = addMonths(z1.date, 2);
        else delete p.records['ad-zoster-2'];
      }

      /* --- изследвания на специалистите (модули „Кардиология“ и „Ендокринология“) --- */
      p.studies = [];
      p.nodules = [];
      const study = (date, kind, values, text = '') => p.studies.push({
        id: `demo-st-${n}-${p.studies.length}`, date, kind, values, text, doctorId: p.doctorId, recordedAt: date + 'T10:00:00.000Z',
      });
      if (profile === 'af') {
        const hr = Math.round(between(72, 96));
        study(addDays(t, -Math.floor(between(20, 120))), 'ecg', { rhythm: 'af', hr, qrs: Math.round(between(88, 112)), qt: Math.round(between(360, 410)), lbbb: false }, 'Предсърдно мъждене с умерена камерна честота.');
        if (k === 2) {
          study(addMonths(t, -14), 'echo', { ef: 30, lvedd: 64, lavi: 44, ee: 15.5, trv: 2.9, tapse: 16 }, 'Дилатативна кардиомиопатия, глобална хипокинезия.');
          study(addMonths(t, -3), 'echo', { ef: 34, lvedd: 62, lavi: 41, ee: 14.2, trv: 2.7, tapse: 17 }, 'Леко подобрение на систолната функция.');
          study(addMonths(t, -3), 'nyha', { nyha: 2 });
          res(addMonths(t, -3), 'ntprobnp', 1850);
          res(addMonths(t, -9), 'ntprobnp', 2900);
        }
      }
      if (profile === 'htn' && k < 2) {
        const day = Math.round(bpBase + between(-4, 4));
        study(addDays(t, -Math.floor(between(30, 200))), 'abpm', {
          sys24: day - 4, dia24: Math.round((day - 4) * 0.6), sysDay: day, diaDay: Math.round(day * 0.62),
          sysNight: Math.round(day * (k === 0 ? 0.97 : 0.86)), diaNight: Math.round(day * 0.52), valid: 88,
        });
      }
      if (profile === 'metabolic' && k < 3) {
        study(addDays(t, -Math.floor(between(20, 90))), 'smbg', { days: 30, fasting: r1(hba1c > 7.5 ? between(8.2, 9.6) : between(6.2, 7.1), 1), post: r1(hba1c > 7.5 ? between(10.5, 12.8) : between(8.2, 9.8), 1), hypo: k === 1 ? 2 : 0, hypo2: 0, severe: 0 });
        study(addDays(t, -Math.floor(between(60, 300))), 'foot', { lops: k === 0, pad: false, deformity: k === 0, ulcerHistory: false, amputation: false, esrd: false, ulcer: false }, k === 0 ? 'Намалена вибрационна и тактилна чувствителност, Hallux valgus.' : 'Без находка.');
        if (k === 0) {
          med('insulin_glargine', 'ед.', { b: String(Math.round(weight0 * 0.55)) }, { indication: 'dm2', protocol: true });
          study(addDays(t, -14), 'cgm', { days: 14, active: 94, tir: 54, low: 2.6, veryLow: 0.6, high: 31, veryHigh: 11.8, mean: 9.8, cv: 34.5 });
        }
      }
      if (profile === 'thyroid') {
        const last = p.results.filter(r => r.code === 'tsh').sort((a, b) => (a.date < b.date ? 1 : -1))[0];
        if (last) res(last.date, 'ft4', last.value > 4 ? between(10.8, 12.5) : between(13.5, 17.5));
        res(addMonths(t, -30), 'atpo', between(180, 620));
        if (k === 0) {
          p.nodules.push({
            id: `demo-nd-${n}-1`, lobe: 'right', location: 'среден сегмент', status: 'active', createdAt: addMonths(t, -26) + 'T10:00:00.000Z',
            exams: [
              { id: `demo-ue-${n}-1`, date: addMonths(t, -26), dims: [11, 9, 8], composition: 'solid', echogenicity: 'mild', shape: 'oval', margins: 'smooth', microcalc: false, note: '', category: 4 },
              { id: `demo-ue-${n}-2`, date: addMonths(t, -13), dims: [13, 10, 9], composition: 'solid', echogenicity: 'mild', shape: 'oval', margins: 'smooth', microcalc: false, note: '', category: 4 },
            ],
            fna: [],
          }, {
            id: `demo-nd-${n}-2`, lobe: 'left', location: 'долна трета', status: 'active', createdAt: addMonths(t, -13) + 'T10:00:00.000Z',
            exams: [{ id: `demo-ue-${n}-3`, date: addMonths(t, -13), dims: [24, 18, 15], composition: 'mixed', echogenicity: 'iso', shape: 'oval', margins: 'smooth', microcalc: false, note: '', category: 3 }],
            fna: [{ id: `demo-fn-${n}-1`, date: addMonths(t, -12), bethesda: 2, note: 'колоиден възел' }],
          });
        }
      }

      if (rnd() < 0.15) {
        p.reminders.push({
          id: 'demo-ar-' + n, date: addDays(t, Math.floor(between(-15, 30))),
          text: pick(['Резултат от кардиолог', 'Контрол на налягането след смяна на терапията', 'Направление за ехография', 'ТЕЛК — документи']),
          done: false, doneDate: '', doctorId: p.doctorId,
        });
      }
      store.data.patients.push(p);
    }
  }
}

function main() {
  if (fs.existsSync(path.join(DATA_DIR, 'practice.json')) && !force) {
    const store = new Store(DATA_DIR);
    if (store.patients.length) {
      console.error(
        `\nВ ${DATA_DIR} вече има ${store.patients.length} досиета.\n` +
        'Скриптът няма да ги презапише. За отделна демонстрация ползвайте:\n\n' +
        '  DATA_DIR=./demo-data node scripts/demo-data.js\n' +
        '  DATA_DIR=./demo-data node server.js\n');
      process.exit(1);
    }
  }

  const store = new Store(DATA_DIR);
  store.data.practice = {
    name: 'АИППМП „Здраве“',
    address: 'гр. София, ул. Здраве 1',
    phone: '02 900 00 00',
  };
  store.data.doctors = [
    { id: 'demo-doc-1', name: 'д-р Мария Иванова', role: 'Общопрактикуващ лекар', pin: null, active: true },
    { id: 'demo-doc-2', name: 'д-р Петър Стоянов', role: 'Общопрактикуващ лекар', pin: hashPin('1234'), active: true },
  ];
  store.data.settings = {
    horizonDays: 30, requireLogin: false, autoLogoutMinutes: 0, extraBackupDir: '', cvRegion: 'very_high',
    modules: { cardio: true, endo: true },
  };
  // Примерните данни са „нови“ — без прозорец „Какво е новото“ при първото отваряне.
  store.data.appVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  store.data.patients = [];

  const t = today();
  const COUNT = 42;

  for (let i = 0; i < COUNT; i++) {
    const sex = rnd() < 0.5 ? 'm' : 'f';
    // Възраст от няколко седмици до 17 години, с тежест към малките деца.
    const ageMonths = Math.floor(Math.pow(rnd(), 1.9) * 205) + 1;
    const birthDate = addDays(addMonths(t, -ageMonths), -Math.floor(rnd() * 28));
    const surname = pick(LAST);
    const middle = pick(MIDDLE);
    const name = [
      sex === 'm' ? pick(FIRST_M) : pick(FIRST_F),
      sex === 'f' ? femaleForm(middle) : middle,
      sex === 'f' ? femaleForm(surname) : surname,
    ].join(' ');

    const patient = {
      id: 'demo-p-' + String(i + 1).padStart(3, '0'),
      name,
      egn: makeEgn(birthDate, sex, i + 7),
      sex,
      birthDate,
      phone: '08' + Math.floor(between(70000000, 99999999)),
      address: 'гр. София',
      doctorId: rnd() < 0.6 ? 'demo-doc-1' : 'demo-doc-2',
      parentHeights: rnd() < 0.7
        ? { mother: Math.round(between(155, 178)), father: Math.round(between(168, 192)) }
        : { mother: null, father: null },
      contacts: [{ name: 'майка на ' + name.split(' ')[0], relation: 'майка', phone: '08' + Math.floor(between(70000000, 99999999)) }],
      allergies: rnd() < 0.12 ? [pick(['пеницилин', 'краве мляко', 'яйчен белтък', 'полени'])] : [],
      conditions: rnd() < 0.1 ? [pick(['бронхиална астма', 'атопичен дерматит', 'желязодефицитна анемия'])] : [],
      notes: '',
      birth: birthData(),
      records: {},
      optIn: [
        ...(rnd() < 0.3 ? ['rota-1', 'rota-2'] : []),
        ...(rnd() < 0.15 ? ['menb-1', 'menb-2'] : []),
      ],
      measurements: [],
      visits: [],
      reminders: [],
      development: [],
      createdAt: new Date().toISOString(),
    };

    // Част от децата са родени преди срок — растежът им се оценява по
    // коригирана възраст, а имунизациите по хронологична.
    // Изпълнение на календара: повечето деца са редовни, някои изостават.
    const diligence = rnd();
    const plan = computePlan(patient, store.schedule, { asOf: t });
    for (const entry of plan) {
      if (entry.due > t) continue;
      if (entry.group === 'checkup' && rnd() < 0.25) continue;

      if (diligence < 0.08) continue;                       // не се води на лекар
      if (diligence < 0.22 && rnd() < 0.45) continue;        // изостава
      if (rnd() < 0.03) {                                   // отказ на родител
        patient.records[entry.id] = { status: 'refused', date: entry.due, note: 'писмен отказ' };
        continue;
      }
      const delay = Math.floor(between(0, diligence < 0.4 ? 40 : 12));
      const doneDate = addDays(entry.due, delay);
      if (doneDate > t) continue;
      patient.records[entry.id] = {
        status: 'done',
        date: doneDate,
        batch: entry.group === 'vaccine' ? 'L' + Math.floor(between(10000, 99999)) : '',
        product: '',
        doctorId: patient.doctorId,
        recordedAt: new Date().toISOString(),
      };
    }

    // Активен отвод при малка част от децата.
    if (rnd() < 0.07) {
      const pending = computePlan(patient, store.schedule, { asOf: t })
        .find(e => e.group === 'vaccine' && e.status !== 'done');
      if (pending) {
        patient.records[pending.id] = {
          status: 'deferred',
          deferUntil: addDays(t, Math.floor(between(5, 40))),
          reason: 'Остро фебрилно заболяване',
        };
      }
    }

    // Измервания — на профилактичните прегледи.
    // При част от децата се задава отклонение в динамиката, за да личи как
    // изглеждат изоставане в растежа и покачване на ИТМ в реален регистър.
    const zShift = between(-1.4, 1.4);
    const drift = rnd() < 0.10 ? -between(0.9, 2.2) : rnd() < 0.08 ? between(0.9, 1.8) : 0;
    const stops = ageMonths <= 12
      ? [1, 2, 3, 4, 6, 9, 12]
      : ageMonths <= 60
        ? [1, 3, 6, 12, 18, 24, 36, 48, 60]
        : [1, 6, 12, 24, 48, 72, 96, 120, 144, 168, 192];
    for (const m of stops) {
      if (m > ageMonths) break;
      const progress = stops.length > 1 ? stops.indexOf(m) / (stops.length - 1) : 0;
      // При недоносено дете реалният размер отговаря на коригираната възраст,
      // затова примерните стойности се генерират по нея.
      const growthMonths = m <= 24
        ? Math.max(0, m - correctionMonths(patient.birth.gestWeeks)) : m;
      const meas = measurementFor(sex, growthMonths, zShift + drift * progress);
      // Артериално налягане се измерва от 3-годишна възраст.
      const bp = m >= 36
        ? {
          systolic: Math.round(90 + m * 0.14 + between(-6, 9) + (drift > 0 ? 8 : 0)),
          diastolic: Math.round(52 + m * 0.09 + between(-5, 7) + (drift > 0 ? 5 : 0)),
        }
        : { systolic: null, diastolic: null };
      patient.measurements.push({
        id: `demo-m-${i}-${m}`,
        date: addDays(addMonths(birthDate, m), Math.floor(between(0, 9))),
        weight: meas.weight, height: meas.height, head: meas.head,
        systolic: bp.systolic, diastolic: bp.diastolic,
        note: '', doctorId: patient.doctorId,
      });
    }
    patient.measurements = patient.measurements.filter(m => m.date <= t);

    // Няколко амбулаторни прегледа.
    const visitCount = Math.floor(between(0, Math.min(6, ageMonths / 6 + 1)));
    const DIAGS = [
      ['Остър назофарингит', 'J00'], ['Остър фарингит', 'J02.9'], ['Остър бронхит', 'J20.9'],
      ['Остър среден отит', 'H66.9'], ['Варицела', 'B01.9'], ['Атопичен дерматит', 'L20.9'],
      ['Ротавирусен гастроентерит', 'A08.0'], ['Профилактичен преглед', 'Z00.1'],
    ];
    for (let v = 0; v < visitCount; v++) {
      const [dx, icd] = pick(DIAGS);
      patient.visits.push({
        id: `demo-v-${i}-${v}`,
        date: addDays(t, -Math.floor(between(1, Math.min(700, ageMonths * 30)))),
        type: 'Амбулаторен преглед',
        complaint: pick(['температура от 2 дни', 'кашлица', 'хрема и отпадналост', 'обрив', 'болки в ухото']),
        findings: '', diagnosis: dx, icd,
        treatment: pick(['симптоматично лечение', 'антипиретик при нужда', 'антибиотик по схема', 'обилни течности']),
        note: '', doctorId: patient.doctorId,
      });
    }

    // Оценки на нервно-психическото развитие по контролните листове.
    const devMonths = correctionMonths(patient.birth.gestWeeks);
    const devConcern = rnd() < 0.12;
    // Отклонението е в една област за цялото дете, а не различна всеки път.
    const weakDomain = devConcern ? pick(['language', 'social', 'motor']) : null;
    for (const cp of CHECKPOINTS) {
      const corrected = cp.ageMonths <= 24 ? cp.ageMonths + devMonths : cp.ageMonths;
      if (corrected > ageMonths) break;
      if (diligence < 0.15 || rnd() < 0.2) continue;   // не всяко посещение е документирано
      const answers = {};
      for (const item of cp.items) {
        if (weakDomain && item.domain === weakDomain && cp.ageMonths >= 12 && rnd() < 0.5) {
          answers[item.id] = rnd() < 0.7 ? 'not_yet' : 'unsure';
        } else {
          answers[item.id] = rnd() < 0.04 ? 'unsure' : 'yes';
        }
      }
      const rec = {
        id: `demo-dev-${i}-${cp.ageMonths}`,
        date: addDays(addMonths(birthDate, Math.round(corrected)), Math.floor(between(0, 10))),
        checkpoint: cp.ageMonths,
        answers,
        screening: cp.screening.length && rnd() < 0.7
          ? {
            tool: cp.screening.includes('autism') && rnd() < 0.5 ? 'mchat' : 'asq3',
            result: weakDomain && rnd() < 0.4 ? 'positive' : rnd() < 0.1 ? 'borderline' : 'negative',
            score: '', note: '',
          }
          : null,
        lostSkills: false,
        parentConcern: weakDomain ? rnd() < 0.5 : rnd() < 0.05,
        action: '', note: '',
        doctorId: patient.doctorId,
      };
      if (rec.date <= t) patient.development.push(rec);
    }

    if (rnd() < 0.18) {
      patient.reminders.push({
        id: 'demo-r-' + i,
        date: addDays(t, Math.floor(between(-20, 25))),
        text: pick(['Контролен преглед след отит', 'Резултат от хемоглобин', 'Насочване към офталмолог',
          'Медицинска бележка за детска градина']),
        done: false, doneDate: '', doctorId: patient.doctorId,
      });
    }

    store.data.patients.push(patient);
  }

  makeAdults(store, t);

  store.persistSync();
  const counts = store.patients.reduce((acc, p) => {
    acc.measurements += p.measurements.length;
    acc.visits += p.visits.length;
    acc.development += (p.development || []).length;
    acc.records += Object.keys(p.records).length;
    acc.results += (p.results || []).length;
    acc.meds += (p.meds || []).length;
    if (p.id.startsWith('demo-a-')) acc.adults++;
    return acc;
  }, { measurements: 0, visits: 0, records: 0, development: 0, results: 0, meds: 0, adults: 0 });

  console.log(`
Готово. Създаден е примерен регистър в ${DATA_DIR}:

  ${store.patients.length - counts.adults} деца и ${counts.adults} възрастни
  ${counts.records} отбелязани дейности
  ${counts.meds} лекарства, ${counts.results} резултата от изследвания
  ${counts.measurements} измервания
  ${counts.visits} прегледа
  ${counts.development} оценки на развитието
  2 потребителя (д-р Иванова — без ПИН, д-р Стоянов — ПИН 1234)

Стартирайте с:  npm start
`);
}

main();
