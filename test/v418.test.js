/* Версия 4.18: поправките от проверката за бъгове (менюто спрямо целите, солта, границата за
 * белтъка) и новите неща в хранителния режим — показателите на пациента, дневникът,
 * контролът и менюто с по-малко готвене. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BATCH_NOTES, keepsWell, nutritionPlan } from '../public/js/shared/nutrition.js';
import { FOODS } from '../public/js/shared/recipes.js';
import { translatePlan } from '../public/js/shared/i18n/plan-en.js';
import { defaultGoalFor } from '../public/js/shared/diet-icd.js';
import { patientIndicators } from '../public/js/shared/diet-indicators.js';
import { FOLLOW_CHECKS } from '../public/js/shared/diet-advice.js';
import { nutritionReport } from '../public/js/shared/pdf/nutrition-report.js';
import { addDays, today } from '../public/js/shared/dates.js';
import { Store } from '../lib/store.js';
import { Workspaces } from '../lib/workspaces.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';

const CYR = /[А-Яа-я]/;
const base = { sex: 'f', age: 50, weight: 72, height: 166, activity: 'light', asOf: '2026-11-10' };
const plan = (extra = {}) => nutritionPlan({ ...base, ...extra });
const dayKcal = (d) => d.meals.reduce((a, m) => a + m.option.kcal, 0);
const saltyNa = (o) => o.items.filter(it => FOODS[it.food].flags.has('salt') && FOODS[it.food].cat !== 'grain')
  .reduce((a, it) => a + FOODS[it.food].na * it.grams / 100, 0);

test('4.18: солените подправки не растат с порцията и не спират добавките — денят стига енергията си', () => {
  // Преди: обяд „пиле със соев сос“ оставаше на 226 kcal при цел 650, защото соевият сос растеше
  // с порцията, минаваше границата за сол и така спираше хляба и зехтина.
  const p = plan({ age: 90.9, weight: 41.2, height: 159, activity: 'moderate', pattern: 'mediterranean', mealsPerDay: 5, days: 28,
    diagnoses: [{ code: 'I11' }, { code: 'K80' }, { code: 'N91' }], classes: new Set(['ARB', 'FINERENONE']), sourcedOnly: true, kcalAdjust: 244, variant: 21 });
  for (const d of p.week) assert.ok(Math.abs(dayKcal(d) - d.kcal) / d.kcal < 0.1, `ден ${d.day}: ${Math.round(dayKcal(d))} при цел ${d.kcal}`);
  // При режим с малко сол солените съставки на едно ястие заедно са до 400 мг натрий и след мащабирането.
  for (const variant of [1, 2, 3]) {
    const h = plan({ diagnoses: [{ code: 'I10' }], days: 7, mealsPerDay: 3, weight: 95, activity: 'active', variant });
    for (const d of h.week) for (const m of d.meals) assert.ok(saltyNa(m.option) <= 420, `${m.option.name}: ${Math.round(saltyNa(m.option))} мг натрий`);
  }
});

test('4.18: горната граница за белтъка не е под целта при бременност и кърмене с ХБЗ', () => {
  for (const diagnoses of [[{ code: 'Z34.0' }, { code: 'N18.4' }], [{ code: 'Z39.1' }, { code: 'N18.3' }]]) {
    const t = plan({ age: 34, diagnoses, pregnancyWeek: 30, egfr: 25 }).targets;
    assert.ok(t.proteinMax >= t.protein, `${diagnoses.map(d => d.code)}: цел ${t.protein}, граница ${t.proteinMax}`);
  }
});

test('4.18: когато менюто не стига целта за белтъка или я надхвърля, режимът го казва', () => {
  // Веган със силови тренировки: целта е висока, а ястията не стигат — на човека се казва с какво да го допълни.
  const vegan = plan({ sex: 'm', age: 56, weight: 83.5, height: 178, goal: 'lose', pattern: 'lowcarb', preferences: ['vegan', 'noNuts'], strength: true, days: 7 });
  const avg = vegan.week.reduce((a, d) => a + d.meals.reduce((x, m) => x + m.option.protein, 0), 0) / 7;
  if (avg < vegan.targets.protein * 0.9) {
    const note = vegan.notes.find(n => /^Белтъкът в менюто е средно около \d+ г на ден при цел/.test(n));
    assert.ok(note, vegan.notes.join(' | '));
    assert.match(note, /добавяйте всеки ден по (едно|две) от тези: .*(тофу|леща|нахут)/);
    assert.ok(!/извара|яйца|пилешко/.test(note), 'предложенията спазват веганското хранене');
    assert.ok(vegan.clinician.some(c => /Менюто дава средно около \d+ г белтък/.test(c)));
    const en = translatePlan(vegan);
    assert.ok(en.notes.every(n => !CYR.test(n)) && en.notes.some(n => /^Protein in your menu averages/.test(n)));
  }
  // ХБЗ с малко тегло и голяма нужда от енергия: под границата не може с обикновени храни — казва се и на двамата.
  const ckd = plan({ sex: 'm', age: 32, weight: 52.5, height: 178, activity: 'moderate', goal: 'maintain', mealsPerDay: 3, days: 7, diagnoses: [{ code: 'N18.4' }, { code: 'E78.1' }] });
  const got = ckd.week.reduce((a, d) => a + d.meals.reduce((x, m) => x + m.option.protein, 0), 0) / 7;
  assert.equal(got > ckd.targets.proteinMax * 1.05, ckd.clinician.some(c => /Менюто дава средно около \d+ г белтък на ден при цел \d+ г \(горна граница/.test(c)));
  assert.equal(got > ckd.targets.proteinMax * 1.05, ckd.notes.some(n => /^Белтъкът в менюто е средно около \d+ г на ден, над целта/.test(n)));
  // Обикновен човек: менюто е в целта и такива бележки няма.
  const usual = plan({ days: 7 });
  assert.ok(![...usual.notes, ...usual.clinician].some(n => /в менюто е средно|Менюто дава средно/.test(n)));
});

test('4.18: дребни поправки — детето, целта по подразбиране, течностите, покачване при ИТМ 30+', () => {
  // Детският режим не казва едно и също два пъти (писмото и „Контрол на теглото“).
  const kid = nutritionPlan({ sex: 'f', age: 7, ageMonths: 84, weight: 23, height: 121, asOf: '2026-11-10' });
  const said = [...kid.summary, ...kid.why.map(w => w.text), ...kid.prefer, ...kid.limit, ...kid.avoid, ...kid.notes, ...kid.warnings, ...kid.weekly, ...kid.habits, ...kid.monitoring]
    .flatMap(t => String(t).split(/(?<=[.!?])\s+/)).map(s => s.trim().toLowerCase()).filter(s => s.length > 12);
  assert.equal(new Set(said).size, said.length, said.filter((x, i) => said.indexOf(x) !== i).join(' | '));
  // Формата не предлага „отслабване“ след 75 г. при ИТМ под 30 и при заболяване, при което не се отслабва.
  assert.equal(defaultGoalFor(27, 60, []), 'lose');
  assert.equal(defaultGoalFor(27, 78, []), 'maintain');
  assert.equal(defaultGoalFor(33, 78, []), 'lose');
  assert.equal(defaultGoalFor(28, 30, [{ code: 'Z34.0' }]), 'maintain');
  assert.equal(defaultGoalFor(28, 60, [{ code: 'K74.6' }]), 'maintain');
  assert.equal(defaultGoalFor(17, 40, []), 'gain');
  assert.equal(defaultGoalFor(22, 40, []), 'maintain');
  // Течностите са само ориентир при нисък натрий и при диализа — пише кой ги определя.
  assert.equal(plan({ diagnoses: [{ code: 'E87.1' }] }).targets.fluidsBy, 'tests');
  assert.equal(plan({ diagnoses: [{ code: 'Z99.2' }] }).targets.fluidsBy, 'nephrologist');
  assert.equal(plan().targets.fluidsBy, undefined);
  // Цел „покачване“ при ИТМ 30 и повече — бележка за лекаря.
  assert.ok(plan({ weight: 100, goal: 'gain' }).clinician.some(c => /покачване“ при ИТМ 30/.test(c)));
});

/* ------------------------- показателите на пациента ------------------------- */

const DOSSIER = {
  sex: 'm', birthDate: '1960-03-01', chronic: [],
  results: [
    { date: '2026-09-12', code: 'hba1c', value: 7.8 }, { date: '2026-03-10', code: 'hba1c', value: 8.4 },
    { date: '2026-10-01', code: 'ldl', value: 2.9 }, { date: '2026-10-01', code: 'urate', value: 455 },
    { date: '2025-09-01', code: 'tg', value: 2.4 },
  ],
  measurements: [
    { date: '2026-10-20', systolic: 148, diastolic: 92, weight: 96 }, { date: '2026-04-02', weight: 99.5 },
    { date: '2025-10-01', systolic: 150, diastolic: 95, weight: 101 },
  ],
};
const DX4 = [{ code: 'E11.9' }, { code: 'I10' }, { code: 'E78.0' }, { code: 'M10.0' }];
const man = (extra = {}) => nutritionPlan({ sex: 'm', age: 66, weight: 96, height: 176, activity: 'light', asOf: '2026-11-10', goal: 'lose', days: 7, diagnoses: DX4, ...extra });

test('4.18: показателите от досието — само скорошните, с целта на човека', () => {
  const ind = patientIndicators(DOSSIER, { asOf: '2026-11-10', ldlTarget: { value: 1.8 } });
  assert.deepEqual(ind.hba1c, { value: 7.8, date: '2026-09-12', prev: { value: 8.4, date: '2026-03-10' }, target: 7, ok: false });
  assert.deepEqual(ind.bp, { sys: 148, dia: 92, date: '2026-10-20', target: { sys: 130, dia: 80 }, ok: false });
  assert.equal(ind.ldl.target, 1.8);
  assert.equal(ind.urate.ok, false);
  assert.equal(ind.tg, undefined, 'резултат отпреди повече от 12 месеца не се цитира');
  assert.deepEqual(ind.weight, { change: -3.5, pct: -3.5, from: '2026-04-02', to: '2026-10-20' });
  assert.deepEqual(ind.targets, { bp: { sys: 130, dia: 80 }, hba1c: 7 });
  // Налягане отпреди повече от 6 месеца не се цитира, но целта остава (за дневника).
  const old = patientIndicators({ ...DOSSIER, results: [], measurements: [{ date: '2026-03-01', systolic: 150, diastolic: 95 }] }, { asOf: '2026-11-10' });
  assert.equal(old.bp, undefined);
  assert.deepEqual(old.targets.bp, { sys: 130, dia: 80 });
  // Индивидуалната цел от досието е с предимство; след 85 г. — 140/90.
  const own = patientIndicators({ ...DOSSIER, chronic: [{ code: 'htn', status: 'active', targets: { bp: '140/90' } }] }, { asOf: '2026-11-10' });
  assert.deepEqual(own.bp.target, { sys: 140, dia: 90 });
  assert.deepEqual(patientIndicators({ ...DOSSIER, birthDate: '1938-01-01' }, { asOf: '2026-11-10' }).targets.bp, { sys: 140, dia: 90 });
  assert.deepEqual(patientIndicators(null), {});
});

test('4.18: режимът цитира показателите на пациента — всеки веднъж, на двата езика', () => {
  const ind = patientIndicators(DOSSIER, { asOf: '2026-11-10', ldlTarget: { value: 1.8 } });
  const p = man({ indicators: ind });
  const card = (k) => p.why.find(w => w.key === k).text;
  assert.match(card('dm2'), /^Последният Ви гликиран хемоглобин е 7,8% \(12\.09\.2026 г\.\), по-нисък от предишните 8,4%, при цел под 7,0%\./);
  assert.match(card('htn'), /^Последното Ви измерено налягане е 148\/92 \(20\.10\.2026 г\.\) при цел под 130\/80\./);
  assert.match(card('dyslip'), /^LDL холестеролът Ви е 2,9 mmol\/L \(01\.10\.2026 г\.\) при цел под 1,8\./);
  assert.match(card('gout'), /^Пикочната Ви киселина е 455 µmol\/L \(01\.10\.2026 г\.\) при цел под 360\./);
  const all = [...p.summary, ...p.why.map(w => w.text), ...p.prefer, ...p.limit, ...p.avoid, ...p.notes, ...p.warnings];
  for (const value of ['7,8%', '148/92', '2,9 mmol/L', '455 µmol/L']) assert.equal(all.filter(t => t.includes(value)).length, 1, value);
  assert.match(p.summary[0], /движението, последните Ви изследвания и заболяванията Ви/);
  assert.match(p.summary[0], /От 02\.04\.2026 г\. досега сте свалили 3,5 кг\./);
  // На английски — без кирилица и със същите числа.
  const en = translatePlan(p);
  assert.match(en.why.find(w => w.key === 'dm2').text, /^Your last HbA1c was 7\.8% \(12\.09\.2026\), down from 8\.4%; the target is under 7\.0%\./);
  assert.ok([...en.summary, ...en.why.map(w => w.text)].every(t => !CYR.test(t)));
  // Без досие режимът не цитира нищо и не се оплаква, че липсват резултати.
  const none = man();
  assert.ok(![...none.summary, ...none.why.map(w => w.text)].some(t => /Последн|последните Ви изследвания|досега/.test(t)));
  assert.ok(!none.clinician.some(c => /В досието няма скорошни резултати/.test(c)));
  // С досие, но без скорошни резултати — лекарят вижда кои липсват.
  const empty = man({ indicators: patientIndicators({ ...DOSSIER, results: [], measurements: [] }, { asOf: '2026-11-10' }) });
  assert.ok(empty.clinician.some(c => /^В досието няма скорошни резултати за: налягане, HbA1c, LDL и пикочна киселина\./.test(c)), empty.clinician.join(' | '));
  // При дете показателите не се ползват.
  const kid = nutritionPlan({ sex: 'f', age: 7, ageMonths: 84, weight: 23, height: 121, asOf: '2026-11-10', indicators: ind });
  assert.ok(!kid.why.some(w => /Последн/.test(w.text)));
});

/* ------------------------------ дневникът ------------------------------ */

const keysOf = (p) => p.diary.rows.map(r => r.key);
const pdfArgs = () => {
  const read = (f) => new Uint8Array(fs.readFileSync(new URL(`../public/fonts/${f}`, import.meta.url)));
  return { person: { name: 'И. П.', age: 50, sex: 'f' }, practice: { name: 'Практика' }, doctor: { name: 'д-р Тест' }, version: '4.18.0', date: '2026-11-10',
    fonts: { regular: read('NotoSans-Regular.ttf'), semibold: read('NotoSans-SemiBold.ttf'), bold: read('NotoSans-Bold.ttf'), symbols: read('DejaVuSans-Symbols.ttf') } };
};
const pdfTitles = (bytes) => [...Buffer.from(bytes).toString('latin1').matchAll(/\/Title <FEFF([0-9A-F]+)>/g)].map(m => Buffer.from(m[1], 'hex').swap16().toString('utf16le'));
const pdfPages = (bytes) => (Buffer.from(bytes).toString('latin1').match(/\/Type \/Page\b(?!s)/g) || []).length;

test('4.18: дневникът на пациента — редовете са според заболяванията, лекарствата и целта', () => {
  // Сърдечна недостатъчност, хипертония и инсулин: тегло всеки ден, налягане с целта у дома, кръвна захар, течности.
  const hf = plan({ sex: 'm', age: 68, weight: 92, height: 174, goal: 'lose', diagnoses: [{ code: 'I50.0' }, { code: 'I10' }, { code: 'E11.9' }, { code: 'M10.0' }],
    classes: new Set(['INSULIN']), days: 7, indicators: { targets: { bp: { sys: 140, dia: 90 }, hba1c: 7.5 } } });
  assert.deepEqual(keysOf(hf), ['weight', 'bp', 'glucose', 'fluids', 'meals', 'salt', 'veg', 'sugar', 'alcohol', 'activity', 'breath', 'hypo']);
  const row = (p, k) => p.diary.rows.find(r => r.key === k);
  assert.equal(row(hf, 'weight').hint, 'всяка сутрин преди закуска');
  assert.equal(row(hf, 'bp').label, 'Кръвно налягане (цел под 135/85)', '140/90 в кабинета е 135/85 у дома (ESC 2024)');
  assert.equal(row(hf, 'bp').kind, 'two');
  assert.match(row(hf, 'fluids').hint, /^около \d(,\d)? л на ден$/);
  assert.deepEqual(hf.diary.rows.filter(r => r.kind === 'mark').map(r => r.key), ['breath', 'hypo'], 'до два реда за оплаквания');
  assert.deepEqual(hf.diary.fields.map(f => f.key), ['waist'], 'теглото е всеки ден — няма го под таблицата');
  assert.equal(hf.diary.weeks, 4);
  // Цел 130/80 е същата у дома; без досие ред за налягането има, но без число.
  assert.equal(row(plan({ diagnoses: [{ code: 'I10' }], indicators: { targets: { bp: { sys: 130, dia: 80 } } } }), 'bp').label, 'Кръвно налягане (цел под 130/80)');
  assert.equal(row(plan({ diagnoses: [{ code: 'I10' }] }), 'bp').label, 'Кръвно налягане');
  // Диабет тип 2 само на метформин — без самоконтрол на кръвната захар; при сулфонилурейни и гестационен диабет — има.
  assert.ok(!keysOf(plan({ diagnoses: [{ code: 'E11.9' }], classes: new Set(['METFORMIN']) })).includes('glucose'));
  assert.ok(keysOf(plan({ diagnoses: [{ code: 'E11.9' }], classes: new Set(['SU']) })).includes('glucose'));
  assert.equal(row(plan({ age: 31, diagnoses: [{ code: 'O24.4' }], pregnancyWeek: 28 }), 'glucose').hint, 'на гладно и 1 час след хранене');
  // Здрав човек: три реда и теглото веднъж седмично.
  const usual = plan({ goal: 'maintain' });
  assert.deepEqual(keysOf(usual), ['meals', 'veg', 'activity']);
  assert.deepEqual(usual.diary.fields, [{ key: 'weight', label: 'Тегло, кг', weeks: 'all' }]);
  // Покачване на тегло: без „зеленчуци“, а „без пропуснато хранене“. Диализа: без „зеленчуци“, течностите — по нефролога.
  const gain = plan({ weight: 48, goal: 'gain' });
  assert.ok(!keysOf(gain).includes('veg'));
  assert.equal(row(gain, 'meals').label, 'Всички хранения, без пропуснато');
  const dial = plan({ diagnoses: [{ code: 'Z99.2' }] });
  assert.ok(!keysOf(dial).includes('veg'));
  assert.equal(row(dial, 'fluids').hint, 'колкото е определил нефрологът');
  // Навсякъде: без повторени редове и без празни надписи; на английски — без кирилица.
  for (const p of [hf, usual, gain, dial]) {
    assert.equal(new Set(keysOf(p)).size, p.diary.rows.length);
    assert.ok(p.diary.rows.every(r => r.label && ['value', 'two', 'check', 'mark'].includes(r.kind)));
    const en = translatePlan(p);
    assert.equal(en.diary.rows.length, p.diary.rows.length);
    assert.ok(!CYR.test(JSON.stringify(en.diary)), JSON.stringify(en.diary));
  }
  assert.equal(translatePlan(hf).diary.rows[1].label, 'Blood pressure (target below 135/85)');
  // Детето няма дневник.
  const kid = nutritionPlan({ sex: 'f', age: 7, ageMonths: 84, weight: 23, height: 121, asOf: '2026-11-10' });
  assert.equal(kid.diary, null);
  assert.equal(kid.followUp, null);
});

test('4.18: дневникът в PDF — отделно и в отчета; стар запазен режим е без него', async () => {
  const args = pdfArgs();
  const hf = plan({ sex: 'm', age: 68, weight: 92, height: 174, goal: 'lose', diagnoses: [{ code: 'I50.0' }, { code: 'I10' }, { code: 'E11.9' }, { code: 'M10.0' }], classes: new Set(['INSULIN']), days: 7 });
  const only = await nutritionReport({ ...args, plan: hf, only: 'diary' });
  assert.ok(pdfTitles(only).includes('Дневник за 4 седмици'), pdfTitles(only).join(' | '));
  assert.equal(pdfPages(only), 2, 'и при най-много редове четирите седмици са на два листа');
  assert.equal(pdfPages(await nutritionReport({ ...args, plan: plan({ goal: 'maintain' }), only: 'diary' })), 1);
  const full = await nutritionReport({ ...args, plan: hf });
  assert.ok(pdfTitles(full).includes('Дневник за 4 седмици'));
  const en = await nutritionReport({ ...args, plan: translatePlan(hf), only: 'diary' });
  assert.ok(pdfTitles(en).includes('Diary for 4 weeks'));
  // Режим, запазен преди 4.18: няма дневник — отчетът се изготвя както досега.
  const old = { ...hf, diary: undefined, followUp: undefined };
  assert.ok(!pdfTitles(await nutritionReport({ ...args, plan: old })).includes('Дневник за 4 седмици'));
  assert.ok((await nutritionReport({ ...args, plan: old, only: 'diary' })).length > 1000);
});

/* --------------------------- контролният преглед --------------------------- */

test('4.18: контролният преглед — след колко седмици и какво да се провери', () => {
  assert.equal(plan({ goal: 'lose', weight: 85 }).followUp.weeks, 4);
  assert.equal(plan({ goal: 'gain', weight: 48 }).followUp.weeks, 4);
  assert.equal(plan({ goal: 'maintain' }).followUp.weeks, 12);
  assert.equal(plan({ age: 31, goal: 'maintain', diagnoses: [{ code: 'Z34.0' }], pregnancyWeek: 20 }).followUp.weeks, 4);
  assert.deepEqual(plan({ goal: 'maintain' }).followUp.keys, ['weight', 'diary']);
  // Без досие — без изследвания; с досие — които липсват или дотогава ще са по-стари от срока си.
  assert.deepEqual(man().followUp.keys, ['weight', 'waist', 'bp', 'diary']);
  const T = { targets: { bp: { sys: 130, dia: 80 }, hba1c: 7 } };
  assert.deepEqual(man({ indicators: T }).followUp.keys, ['weight', 'waist', 'bp', 'diary', 'hba1c', 'lipids', 'urate']);
  const fresh = { ...T, hba1c: { value: 6.6, date: '2026-10-01', ok: true }, ldl: { value: 1.6, date: '2026-10-01', ok: true }, urate: { value: 330, date: '2026-10-01', ok: true } };
  assert.deepEqual(man({ indicators: fresh }).followUp.keys, ['weight', 'waist', 'bp', 'diary']);
  // HbA1c над целта отпреди 5 месеца — за повторение (на 3 месеца); в целта — на 6 месеца.
  assert.ok(man({ indicators: { ...fresh, hba1c: { value: 8.1, date: '2026-06-10', ok: false } } }).followUp.keys.includes('hba1c'));
  assert.ok(!man({ indicators: { ...fresh, hba1c: { value: 6.6, date: '2026-06-10', ok: true } } }).followUp.keys.includes('hba1c'));
  // ХБЗ и лекарство, което задържа калий: калий и креатинин.
  const ckd = plan({ age: 70, egfr: 40, diagnoses: [{ code: 'N18.3' }], classes: new Set(['MRA']), indicators: T });
  assert.ok(ckd.followUp.keys.includes('kidney'));
  // Надписите са по ключовете, на двата езика.
  const p = man({ indicators: T });
  assert.deepEqual(p.followUp.checks, p.followUp.keys.map(k => FOLLOW_CHECKS[k][0]));
  assert.deepEqual(translatePlan(p).followUp.checks, p.followUp.keys.map(k => FOLLOW_CHECKS[k][1]));
});

/* -------------------------- готвене веднъж на ден -------------------------- */

test('4.18: готвене веднъж на ден — вечерята се готви двойно и е обяд на другия ден', () => {
  const p = plan({ days: 7, mealsPerDay: 3, batch: true, goal: 'lose', weight: 80 });
  assert.equal(p.input.batch, true);
  const lunch = (d) => p.week[d].meals.find(m => m.meal === 'lunch');
  const dinner = (d) => p.week[d].meals.find(m => m.meal === 'dinner');
  let left = 0;
  for (let d = 1; d < 7; d++) {
    if (lunch(d).batch !== 'left') { assert.ok(dinner(d - 1).batch !== 'cook'); continue; }
    left++;
    assert.equal(lunch(d).option.key, dinner(d - 1).option.key, `ден ${d + 1}: обядът е снощната вечеря`);
    assert.equal(dinner(d - 1).batch, 'cook');
    assert.ok(keepsWell({ name: dinner(d - 1).option.key, time: 30 }), dinner(d - 1).option.key);
    assert.equal(lunch(d).option.method, BATCH_NOTES.left[0]);
    assert.equal(lunch(d).option.time, 5);
    assert.ok(dinner(d - 1).option.method.endsWith(BATCH_NOTES.cook[0]));
    assert.ok(lunch(d).option.items.length > 1, 'порцията за обяд е с количествата си');
  }
  assert.ok(left >= 5, `обяди от снощи: ${left}`);
  assert.equal(lunch(0).batch, undefined);
  assert.equal(dinner(6).batch, undefined, 'последната вечеря не се готви двойно');
  for (const d of p.week) assert.ok(Math.abs(dayKcal(d) - d.kcal) / d.kcal < 0.1, `ден ${d.day}: ${Math.round(dayKcal(d))} при цел ${d.kcal}`);
  assert.ok(p.notes.some(n => /^Втората порция охладете и приберете в хладилника до 2 часа/.test(n)));
  // Салати, яйца на тиган и морски дарове не се оставят за другия ден.
  assert.equal(keepsWell({ name: 'Салата от леща с печени зеленчуци', time: 30 }), false);
  assert.equal(keepsWell({ name: 'Омлет с тиквички и копър', time: 25 }), false);
  assert.equal(keepsWell({ name: 'Таратор и хляб с яйце', time: 10 }), false);
  assert.equal(keepsWell({ name: 'Пилешко в гъбен сос с броколи', time: 30 }), true);
  // Без отметката менюто е както досега; за един ден тя няма смисъл.
  const usual = plan({ days: 7, mealsPerDay: 3, goal: 'lose', weight: 80 });
  assert.ok(usual.week.every(d => d.meals.every(m => !m.batch && !m.option.batch)));
  assert.ok(!usual.notes.some(n => /хладилника/.test(n)));
  assert.equal(usual.input.batch, false);
  assert.equal(plan({ days: 1, batch: true }).input.batch, false);
  // Месец: в първия ден на всяка седмица обядът се готви — така пазаруването за седмицата е вярно.
  const month = plan({ days: 28, mealsPerDay: 3, batch: true });
  for (const d of [0, 7, 14, 21]) assert.equal(month.week[d].meals[1].batch, undefined);
  for (const d of [6, 13, 20, 27]) assert.equal(month.week[d].meals[2].batch, undefined);
  assert.ok(month.week.filter(d => d.meals[1].batch === 'left').length >= 18);
  // „Друго“ за обяда от снощи: остава избраното, вечерята вече не се готви двойно.
  const swapLunch = plan({ days: 7, mealsPerDay: 3, batch: true, goal: 'lose', weight: 80, swaps: { '2.1.0': 1 } });
  assert.equal(swapLunch.week[2].meals[1].batch, undefined);
  assert.equal(swapLunch.week[1].meals[2].batch, undefined);
  assert.notEqual(swapLunch.week[2].meals[1].option.key, swapLunch.week[1].meals[2].option.key);
  // „Друго“ за вечерята: утрешният обяд следва новата вечеря, ако тя издържа до другия ден.
  const swapDinner = plan({ days: 7, mealsPerDay: 3, batch: true, goal: 'lose', weight: 80, swaps: { '1.2.0': 1 } });
  const nd = swapDinner.week[1].meals[2];
  assert.notEqual(nd.option.key, p.week[1].meals[2].option.key);
  if (keepsWell({ name: nd.option.key, time: 30 }) && nd.batch === 'cook') assert.equal(swapDinner.week[2].meals[1].option.key, nd.option.key);
  // На английски.
  const en = translatePlan(p);
  const enLeft = en.week.flatMap(d => d.meals).filter(m => m.batch === 'left');
  assert.ok(enLeft.length === left && enLeft.every(m => m.option.method === BATCH_NOTES.left[1]));
  assert.ok(en.week.flatMap(d => d.meals).filter(m => m.batch === 'cook').every(m => m.option.method.endsWith(BATCH_NOTES.cook[1])));
  assert.ok(en.week.flatMap(d => d.meals).every(m => !CYR.test(m.option.method) && !CYR.test(m.option.name)));
  assert.ok(en.notes.some(n => /^Cool the second portion/.test(n)));
});

/* ------------------------------------ API ------------------------------------ */

test('4.18 API: показателите идват от досието; дневникът, контролът и готвенето веднъж на ден', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-418-'));
  const server = createAppServer({ workspaces: new Workspaces(new Store(dir)), serveStatic: memoryStatic({ 'index.html': 'x' }), requireActivation: false });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const jar = new Map();
  const call = async (method, url, body) => {
    const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(baseUrl + url, { method, body: body && JSON.stringify(body), headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) } });
    for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const i = pair.indexOf('='); jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); }
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  try {
    await call('POST', '/api/setup', { workspace: 'gp', practiceName: 'П', doctorName: 'д-р Т' });
    const pt = await call('POST', '/api/patients', { name: 'Иван Петров', sex: 'm', birthDate: '1962-05-05' });
    const id = pt.data.patient.id;
    const ok = async (r) => { const x = await r; assert.ok(x.status < 300, JSON.stringify(x.data)); return x; };
    await ok(call('POST', `/api/patients/${id}/results`, { date: addDays(today(), -40), items: [{ code: 'hba1c', value: 8.2 }] }));
    await ok(call('POST', `/api/patients/${id}/measurements`, { date: addDays(today(), -20), systolic: 152, diastolic: 94, weight: 95, height: 178 }));
    const body = { diagnoses: [{ code: 'I10' }, { code: 'E11.9' }], goal: 'lose', days: 7, mealsPerDay: 3, batch: true };
    const res = await ok(call('POST', `/api/patients/${id}/nutrition`, body));
    const plan1 = res.data.plan;
    assert.match(plan1.why.find(w => w.key === 'htn').text, /^Последното Ви измерено налягане е 152\/94 \(/);
    assert.match(plan1.why.find(w => w.key === 'dm2').text, /^Последният Ви гликиран хемоглобин е 8,2% \(/);
    assert.equal(plan1.diary.rows.find(r => r.key === 'bp').label, 'Кръвно налягане (цел под 130/80)');
    assert.deepEqual(plan1.followUp.keys.slice(0, 4), ['weight', 'waist', 'bp', 'diary']);
    assert.equal(plan1.input.batch, true);
    assert.ok(plan1.week.some(d => d.meals.some(m => m.batch === 'left')));
    // На английски — и дневникът, и контролът.
    const en = await ok(call('POST', `/api/patients/${id}/nutrition`, { ...body, lang: 'en' }));
    assert.ok(!CYR.test(JSON.stringify([en.data.plan.diary, en.data.plan.followUp, en.data.plan.why])));
    // Напомнянето за контролния преглед се записва в досието и е в задачите.
    const text = `Контролен преглед по хранителния режим: ${plan1.followUp.checks.join(', ')}`;
    const rem = await ok(call('POST', `/api/patients/${id}/reminders`, { date: addDays(today(), plan1.followUp.weeks * 7), text }));
    assert.equal(rem.data.reminder.text, text);
    // Човек извън листата: няма досие — няма цитирани показатели; дневникът е без число за целта.
    const person = { name: 'Г. К.', sex: 'f', age: 52, weight: 80, height: 164, diagnoses: [{ code: 'I10' }] };
    const out = await ok(call('POST', '/api/nutrition/plan', { person, days: 7, batch: true }));
    assert.ok(!out.data.plan.why.some(w => /Последн/.test(w.text)));
    assert.equal(out.data.plan.diary.rows.find(r => r.key === 'bp').label, 'Кръвно налягане');
    assert.equal(out.data.plan.input.batch, true);
  } finally {
    await new Promise(r => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
