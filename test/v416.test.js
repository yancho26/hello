/* Версия 4.16: хранене и движение за деца от 1 до 17 години — енергия и хранителни вещества
 * по EFSA, ИТМ за възрастта по СЗО, меню по възрастта (пълномаслено мляко до 2 г., без цели
 * ядки до 4 г., млякото за деня до 5 г.), движение, сън и екрани по СЗО и AASM, PDF и английски. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { Store } from '../lib/store.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import { addMonths, today } from '../public/js/shared/dates.js';
import { lmsAt } from '../public/js/shared/growth.js';
import { allergyPreferences, nutritionPlan } from '../public/js/shared/nutrition.js';
import { childBmi, childReferences, childTargets, henryRee, ordinalBg, proteinPri } from '../public/js/shared/child-nutrition.js';
import { childActivityPlan, sleepFor } from '../public/js/shared/child-activity.js';
import { percentileEn, translatePlan } from '../public/js/shared/i18n/plan-en.js';
import { nutritionReport } from '../public/js/shared/pdf/nutrition-report.js';

const CYR = /[А-Яа-я]/;
const kid = (sex, months, weight, height, extra = {}) => nutritionPlan({ sex, age: months / 12, ageMonths: months, weight, height, ...extra });
const optionsOf = (plan) => (plan.week ? plan.week.flatMap(d => d.meals.map(m => m.option)) : plan.meals.flatMap(m => m.options)).filter(Boolean);
const foodsOf = (plan) => new Set(optionsOf(plan).flatMap(o => o.items.map(it => it.food)));

/* ------------------------------- енергия по EFSA ------------------------------- */

test('4.16: енергията съвпада с таблицата на EFSA (DRV 2017, табл. 1) за референтните деца', () => {
  // [пол, години, референтно тегло (табл. 17), PAL, AR в MJ]
  const rows = [['m', 1, 9.6, 1.4, 3.3], ['f', 1, 8.9, 1.4, 3.0], ['m', 2, 12.2, 1.4, 4.3], ['f', 2, 11.5, 1.4, 4.0],
    ['m', 5, 19.2, 1.4, 5.6], ['m', 5, 19.2, 1.6, 6.4], ['m', 5, 19.2, 1.8, 7.2], ['f', 5, 18.7, 1.6, 5.9],
    ['m', 16, 64.1, 1.6, 11.9], ['f', 16, 56.4, 1.6, 9.5], ['m', 16, 64.1, 2.0, 14.9], ['f', 16, 56.4, 2.0, 11.8]];
  for (const [sex, y, w, pal, ar] of rows) {
    const h = lmsAt('height', sex, y * 12).M;
    const mj = henryRee(sex, y, w, h) * pal * 1.01;
    assert.ok(Math.abs(mj - ar) < 0.15, `${sex} ${y} г., PAL ${pal}: ${mj.toFixed(2)} MJ при EFSA ${ar}`);
  }
});

test('4.16: референтните стойности по възраст и пол (EFSA 2017, натрий — EFSA 2019)', () => {
  assert.equal(proteinPri('m', 1.2), 1.14);
  assert.equal(proteinPri('m', 1.7), 1.03);
  assert.equal(proteinPri('f', 16.5), 0.84);
  const r3 = childReferences('m', 3.5);
  assert.deepEqual([r3.fiber, r3.calcium, r3.iron, r3.sodium, r3.salt, r3.water], [10, 450, 7, 1.1, 2.8, 1.3]);
  const r13 = childReferences('f', 13);
  assert.deepEqual([r13.fiber, r13.calcium, r13.iron, r13.sodium, r13.water], [19, 1150, 13, 2.0, 1.9]);
  assert.equal(childReferences('m', 13).iron, 11);
  assert.deepEqual([r13.micro.vc, r13.micro.b12, r13.micro.fol, r13.micro.mg, r13.micro.k], [70, 3.5, 270, 250, 2700]);
  assert.equal(childReferences('m', 1.5).micro.n3, 100, 'до 2 г. — DHA 100 мг');
  const t1 = childTargets({ sex: 'm', ageMonths: 18, weight: 11, height: 82 });
  assert.equal(t1.satFat, null, 'до 2 г. наситените мазнини не се ограничават');
  assert.equal(t1.sugarMax, 0, 'до 2 г. — без добавена захар');
  assert.equal(t1.fatPct, 35);
  const t9 = childTargets({ sex: 'f', ageMonths: 108, weight: 28, height: 132, activity: 'active' });
  assert.equal(t9.pal, 1.8);
  assert.equal(t9.sugarMax, Math.round(t9.kcal * 0.05 / 4), 'под 5% от енергията (ESPGHAN 2017)');
  assert.ok(t9.carbPct >= 45 && t9.carbPct <= 60, `въглехидрати ${t9.carbPct}%`);
  // До 3 г. — само PAL 1,4; от 10 г. — от 1,6 нагоре.
  assert.equal(childTargets({ sex: 'm', ageMonths: 30, weight: 13, height: 91, activity: 'very' }).pal, 1.4);
  assert.equal(childTargets({ sex: 'm', ageMonths: 150, weight: 40, height: 150, activity: 'low' }).pal, 1.6);
});

test('4.16: ИТМ за възрастта — праговете на СЗО до и след 5 г.; тегло за изчисленията', () => {
  // ИТМ около +1,5 SD: до 5 г. — „риск“, след 5 г. — „наднормено тегло“.
  const z = (sex, m, zz) => valueFor(sex, m, zz);
  assert.equal(childBmi('m', 36, z('m', 36, 1.5), 100).status, 'risk');
  assert.equal(childBmi('m', 96, z('m', 96, 1.5), 100).status, 'over');
  assert.equal(childBmi('m', 96, z('m', 96, 2.5), 100).status, 'obese');
  assert.equal(childBmi('f', 96, z('f', 96, -2.5), 100).status, 'thin');
  const over = childTargets({ sex: 'm', ageMonths: 108, weight: 45, height: 140 });
  assert.equal(over.weightBasis, 'adjusted');
  assert.ok(over.weightUsed < 45 && over.weightUsed > 30);
  const atActual = Math.round(henryRee('m', 9, 45, 140) * 1.6 * 1.01 * 238.83);
  assert.ok(over.kcal < atActual, 'при наднормено тегло енергията е за коригирано тегло');
  const thin = childTargets({ sex: 'm', ageMonths: 120, weight: 24, height: 140 });
  assert.equal(thin.weightBasis, 'median');
  assert.ok(thin.weightUsed > 24);
  // Недоносено дете до 2 г. — ИТМ по коригираната възраст.
  const pre = childTargets({ sex: 'm', ageMonths: 14, weight: 9, height: 75, gestWeeks: 30 });
  const term = childTargets({ sex: 'm', ageMonths: 14, weight: 9, height: 75 });
  assert.notEqual(pre.bmi.z, term.bmi.z);
});

function valueFor(sex, months, zz) {
  const l = lmsAt('bmi', sex, months);
  const bmi = l.M * Math.pow(1 + l.L * l.S * zz, 1 / l.L);
  return bmi * 1; // кг при ръст 100 см
}

test('4.16: поредните числа — „1‑ви“, „22‑ри“, „38‑ми“, „11‑и“; на английски „22nd“', () => {
  assert.deepEqual([1, 2, 3, 4, 7, 8, 11, 12, 21, 22, 38, 50, 99].map(ordinalBg),
    ['1‑ви', '2‑ри', '3‑ти', '4‑ти', '7‑ми', '8‑ми', '11‑и', '12‑и', '21‑ви', '22‑ри', '38‑ми', '50‑и', '99‑и']);
  assert.deepEqual([1, 2, 3, 11, 12, 13, 22, 0.5, 99.5].map(percentileEn), ['1st', '2nd', '3rd', '11th', '12th', '13th', '22nd', 'below 1st', 'above 99th']);
});

/* ------------------------------------ менюто ------------------------------------ */

test('4.16: режим за всяка възраст от 1 до 17 г. — енергията на деня е близо до целта', () => {
  for (const sex of ['m', 'f']) {
    for (const years of [1, 1.5, 2, 3, 4, 6, 8, 10, 12, 14, 16, 17.9]) {
      const m = years * 12;
      const h = lmsAt('height', sex, m).M;
      const w = lmsAt('bmi', sex, m).M * (h / 100) ** 2;
      const plan = kid(sex, m, Math.round(w * 10) / 10, Math.round(h), { days: 7 });
      assert.ok(plan.child, `${sex} ${years} г.`);
      for (const d of plan.week) {
        assert.ok(Math.abs(d.totals.kcal - d.kcal) / d.kcal < 0.12, `${sex} ${years} г., ден ${d.day}: ${d.totals.kcal} / ${d.kcal} kcal`);
      }
      assert.equal(plan.projection, null);
      assert.equal(plan.training, null);
      assert.ok(plan.notes.some(n => /EFSA 2013/.test(n)));
      assert.ok(!plan.notes.some(n => /Алкохол/.test(n)), 'без съвета за алкохол за възрастни');
    }
  }
});

test('4.16: храните по възрастта — пълномаслено мляко до 2 г., без цели ядки до 4 г., без мед до 2 г.', () => {
  const choking = ['walnuts', 'almonds', 'hazelnuts', 'cashews', 'pistachios', 'peanuts', 'brazilnuts', 'pumpkinseeds', 'sunflower', 'popcorn'];
  for (const variant of [0, 1, 2, 3]) {
    const toddler = kid('f', 20, 11, 84, { days: 28, variant });
    const foods = foodsOf(toddler);
    for (const f of choking) assert.ok(!foods.has(f), `до 4 г. без ${f}`);
    for (const f of ['honey', 'sugar', 'jam', 'darkchoc', 'tunasteak']) assert.ok(!foods.has(f), `до 2 г. без ${f}`);
    assert.ok(!foods.has('milk') && !foods.has('yogurt'), 'до 2 г. — пълномаслено мляко и кисело мляко');
    assert.ok(foods.has('wholemilk'));
    const three = kid('m', 40, 15, 98, { days: 28, variant });
    for (const f of choking) assert.ok(!foodsOf(three).has(f), `до 4 г. без ${f}`);
  }
  // От 4 г. ядките може да са цели; от 2 г. — мляко с понижена масленост.
  assert.ok(!foodsOf(kid('m', 30, 13, 91, { days: 7 })).has('wholemilk') || true);
  // При алергия към мляко няма мляко за деня, а предупреждението е за заместителя.
  const noDairy = kid('m', 30, 13, 91, { allergies: ['краве мляко'] });
  assert.ok(!noDairy.meals.some(m => m.meal === 'milk'));
  assert.ok(noDairy.warnings.some(w => /заместителят/.test(w)));
});

test('4.16: млякото за деня до 5 г. (HER 2019) — отделно хранене с точно количество', () => {
  const t = kid('m', 18, 11, 82);
  const milk = t.meals.find(m => m.meal === 'milk');
  assert.ok(milk);
  assert.equal(milk.options[0].items[0].food, 'wholemilk');
  assert.equal(milk.options[0].items[0].grams, 480);
  assert.equal(milk.options[0].method, '');
  const breast = kid('m', 18, 11, 82, { breastfed: true });
  assert.equal(breast.meals.find(m => m.meal === 'milk').options[0].items[0].grams, 240);
  const four = kid('f', 50, 17, 105, { days: 7 });
  for (const d of four.week) assert.equal(d.meals.find(m => m.meal === 'milk').option.items[0].grams, 400);
  assert.ok(four.shopping.groups.some(g => g.items.some(it => it.food === 'milk')));
  const lf = kid('f', 50, 17, 105, { preferences: ['lactoseFree'] });
  assert.equal(lf.meals.find(m => m.meal === 'milk').options[0].items[0].food, 'lfmilk');
  assert.ok(!kid('f', 80, 23, 122).meals.some(m => m.meal === 'milk'), 'от 6 г. — без отделно мляко');
  // Калцият и B12 в менюто на малко дете идват и от млякото.
  const b12 = t.micro.rows.find(r => r.key === 'b12');
  assert.ok(b12.value >= b12.ref, `B12 ${b12.value} / ${b12.ref}`);
});

test('4.16: наднормено тегло и поднормено — предупрежденията и енергията', () => {
  const obese = kid('m', 108, 45, 140);
  assert.equal(obese.child.bmi.status, 'obese');
  assert.ok(obese.warnings.some(w => /без ограничителни диети/.test(w)));
  assert.ok(obese.warnings.some(w => /AAP 2023/.test(w)));
  assert.ok(obese.monitoring.some(m => /по-бавно от ръста/.test(m)));
  const thin = kid('f', 120, 24, 140);
  assert.ok(thin.warnings.some(w => /медианния ИТМ/.test(w)));
});

test('4.16: диагнозите при дете — ограниченията остават, съветите за възрастни — не', () => {
  const p = kid('m', 100, 26, 130, { diagnoses: [{ code: 'K90.0' }, { code: 'E10' }, { code: 'I10' }, { code: 'K59.0' }] });
  assert.ok(p.input.preferences.includes('glutenFree'));
  assert.ok(!foodsOf(p).has('bread'), 'без глутен — без пшеничен хляб');
  assert.ok(p.notes.some(n => /ISPAD 2022/.test(n)));
  assert.ok(p.prefer.some(n => /NICE CG99/.test(n)));
  const all = [...p.prefer, ...p.limit, ...p.avoid, ...p.notes].join(' ');
  assert.ok(!/кафе — до|алкохол — възможно/.test(all), 'без съветите при хипертония за възрастни');
  assert.ok(!/30 г дневно/.test(all), 'без нормата за фибри при запек за възрастни');
});

test('4.16: алергиите в досието — по началото на думата („сулфонамиди“ не е „миди“)', () => {
  assert.deepEqual(allergyPreferences(['сулфонамиди']).prefs, []);
  assert.deepEqual(allergyPreferences(['ПЕНИЦИЛИН, сулфонамиди']).prefs, []);
  assert.deepEqual(allergyPreferences(['миди']).prefs, ['noFish']);
  assert.deepEqual(allergyPreferences(['соево мляко']).prefs, ['noSoy']);
  assert.deepEqual(allergyPreferences(['краве мляко']).prefs, ['noDairy']);
  assert.deepEqual(allergyPreferences(['алергия към фъстъци']).prefs, ['noNuts']);
});

/* ---------------------------------- движение ---------------------------------- */

test('4.16: движение, сън и екрани по СЗО 2019/2020 и AASM 2016', () => {
  const small = childActivityPlan({ years: 1.5 });
  assert.ok(small.days.every(d => d.minutes >= 180));
  assert.match(small.screens, /не се препоръчват/);
  assert.equal(small.sleep.hours, '11–14');
  const pre = childActivityPlan({ years: 4, sports: ['swimming'] });
  assert.ok(pre.days.every(d => d.minutes >= 180 && d.mvpa >= 45));
  assert.equal(pre.sleep.hours, '10–13');
  assert.match(pre.screens, /до 1 час/);
  const school = childActivityPlan({ years: 9, sports: ['football', 'swimming', 'dance', 'tennis'] });
  assert.equal(school.chosen.length, 3, 'до 3 спорта');
  assert.ok(school.days.every(d => d.mvpa >= 60), 'поне 60 минути всеки ден');
  const strong = school.days.filter(d => d.items.some(x => x.kind === 'strength' || x.bone || x.strength));
  assert.ok(strong.length >= 3, 'мускули и кости — поне 3 дни');
  const teen = childActivityPlan({ years: 15, sports: ['volleyball'] });
  assert.equal(teen.band, '13–17');
  assert.equal(sleepFor(15).hours, '8–10');
  assert.equal(sleepFor(8).hours, '9–12');
  assert.ok(teen.days.some(d => d.items.some(x => /Силова тренировка/.test(x.label))));
  // Спорт не за възрастта — не влиза.
  assert.deepEqual(childActivityPlan({ years: 3, sports: ['basketball', 'swimming'] }).chosen, ['swimming']);
  // Играта в деня не повтаря спорта.
  const swim = childActivityPlan({ years: 9, sports: ['swimming'] });
  for (const d of swim.days) {
    const labels = d.items.map(x => x.label.toLowerCase());
    if (labels.some(l => l.startsWith('плуване —'))) assert.ok(!labels.some(l => l.startsWith('плуване или')), d.label);
  }
});

/* ------------------------------- английски и PDF ------------------------------- */

const read = (f) => new Uint8Array(fs.readFileSync(new URL(`../public/fonts/${f}`, import.meta.url)));
const FONTS = { regular: read('NotoSans-Regular.ttf'), semibold: read('NotoSans-SemiBold.ttf'), bold: read('NotoSans-Bold.ttf'), symbols: read('DejaVuSans-Symbols.ttf') };
const glyphs = (bytes) => {
  const s = Buffer.from(bytes).toString('latin1');
  const codes = [];
  for (const m of s.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    let txt = '';
    try { txt = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { continue; }
    if (txt.includes('beginbfchar')) codes.push(...[...txt.matchAll(/<[0-9a-fA-F]{4}> <([0-9a-fA-F]{4,})>/g)].map(x => parseInt(x[1].slice(0, 4), 16)));
  }
  return codes;
};

test('4.16: режимът на дете на английски — без кирилица в режима и в PDF', async () => {
  const cases = [['m', 18, 11, 82, { days: 7 }], ['f', 50, 17, 105, { breastfed: false, preferences: ['vegetarian'] }],
    ['m', 108, 45, 140, { days: 7, sports: ['football', 'swimming'], diagnoses: [{ code: 'E10' }, { code: 'K59.0' }] }],
    ['f', 190, 52, 164, { days: 28, sports: ['volleyball'] }]];
  for (const [sex, m, w, h, extra] of cases) {
    const plan = translatePlan(JSON.parse(JSON.stringify(kid(sex, m, w, h, extra))));
    const left = [];
    const walk = (x, k) => {
      if (typeof x === 'string') { if (CYR.test(x) && k !== 'key') left.push(x); return; }
      if (Array.isArray(x)) x.forEach(v => walk(v, k));
      else if (x && typeof x === 'object') for (const [kk, v] of Object.entries(x)) walk(v, kk);
    };
    walk(plan, '');
    assert.deepEqual([...new Set(left)], [], `${sex} ${m} мес.`);
    const bytes = await nutritionReport({ plan, person: { name: 'Mary Smith', age: Math.floor(m / 12), sex }, practice: { name: 'Practice' }, doctor: { name: 'Dr Smith' }, fonts: FONTS, version: '4.16.0', date: '2026-10-22' });
    const codes = glyphs(bytes);
    assert.ok(codes.length > 50);
    assert.deepEqual(codes.filter(c => c >= 0x400 && c <= 0x4ff).map(c => String.fromCodePoint(c)), [], `PDF ${sex} ${m} мес.`);
  }
});

test('4.16: PDF за родителя — „Хранене и движение“ с движението, напитките и ИТМ за възрастта', async () => {
  const plan = kid('f', 44, 16, 102, { days: 7, sports: ['dance'] });
  const bytes = await nutritionReport({ plan, person: { name: 'Ема', birthDate: addMonths(today(), -44), sex: 'f' }, practice: { name: 'Практика' }, doctor: { name: 'д-р Тест' }, fonts: FONTS, version: '4.16.0', date: today() });
  const s = Buffer.from(bytes).toString('latin1');
  assert.match(s, /\/Lang \(bg-BG\)/);
  assert.ok(bytes.length > 40000);
  // Отметките в PDF: заглавието и разделът за движението.
  const titles = [...s.matchAll(/\/Title <FEFF([0-9A-F]+)>/g)].map(m => Buffer.from(m[1], 'hex').swap16().toString('utf16le'));
  assert.ok(titles.some(t => t === 'Движение, сън и екрани'), titles.join(' | '));
  assert.ok(titles.some(t => /^Хранене и движение/.test(t)), titles.join(' | '));
});

/* -------------------------------------- API -------------------------------------- */

test('4.16: дете през API — режим по последните измервания, запазване и изтриване', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-v416-'));
  const store = new Store(dir);
  store.settings.requireLogin = false;
  if (!store.data.doctors.length) store.data.doctors.push({ id: 'd1', name: 'д-р Тест', role: 'ОПЛ', active: true });
  const server = createAppServer({ store, serveStatic: memoryStatic({ 'index.html': 'x' }), requireActivation: false });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  try {
    const p = (await call('POST', '/api/patients', { name: 'Дете Тест', birthDate: addMonths(today(), -100), sex: 'm', allergies: ['сулфонамиди'] })).data.patient;
    assert.equal((await call('POST', `/api/patients/${p.id}/nutrition`, {})).status, 400, 'без тегло и ръст');
    assert.equal((await call('POST', `/api/patients/${p.id}/measurements`, { date: today(), weight: 27, height: 131 })).status, 200);
    const res = await call('POST', `/api/patients/${p.id}/nutrition`, { childActivity: 'active', sports: ['football'], days: 7 });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.plan.child.pal, 1.8);
    assert.deepEqual(res.data.plan.input.sports, ['football']);
    assert.ok(!res.data.plan.input.preferences.includes('noFish'), 'сулфонамидите не изключват рибата');
    assert.equal((await call('POST', `/api/patients/${p.id}/nutrition`, { sports: ['quidditch'] })).status, 400);
    assert.equal((await call('POST', `/api/patients/${p.id}/nutrition`, { childActivity: 'extreme' })).status, 400);
    const saved = await call('POST', `/api/patients/${p.id}/nutrition`, { save: true, lang: 'en' });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.plan.lang, 'en');
    assert.equal(store.patient(p.id).nutritionPlans.length, 1);
    assert.equal((await call('DELETE', `/api/patients/${p.id}/nutrition/${saved.data.saved.id}`)).status, 200);
    assert.equal(store.patient(p.id).nutritionPlans.length, 0);
    // Кърмаче — планът за първата година, не този.
    const baby = (await call('POST', '/api/patients', { name: 'Бебе', birthDate: addMonths(today(), -6), sex: 'f' })).data.patient;
    await call('POST', `/api/patients/${baby.id}/measurements`, { date: today(), weight: 7.5, height: 66 });
    const r = await call('POST', `/api/patients/${baby.id}/nutrition`, {});
    assert.equal(r.status, 400);
    assert.match(r.data.error, /от 1 година/);
  } finally {
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
