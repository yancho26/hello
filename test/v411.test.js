/* Версия 4.11: приготвянето с грамовете на порцията, сухо и сурово тегло, плана на английски. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { FOODS, RECIPES, YIELDS, baseName, rawOf, shopName } from '../public/js/shared/recipes.js';
import { plainMethod, quantityText, renderMethod } from '../public/js/shared/recipe-method.js';
import { nutritionPlan } from '../public/js/shared/nutrition.js';
import { DX } from '../public/js/shared/diet-icd.js';
import { DRUGS } from '../public/js/shared/drugs.js';
import { foodNotes } from '../public/js/shared/meds.js';
import { EN_FOODS, EN_FLAVOR } from '../public/js/shared/i18n/en-foods.js';
import { EN_RECIPES } from '../public/js/shared/i18n/en-recipes.js';
import { EN_DX } from '../public/js/shared/i18n/en-dx.js';
import { dxNameEn, quantityEn, tr, translatePlan, ui, withPlanLang } from '../public/js/shared/i18n/plan-en.js';
import { nutritionReport } from '../public/js/shared/pdf/nutrition-report.js';
import { Store } from '../lib/store.js';
import { Workspaces } from '../lib/workspaces.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';

const CYR = /[А-Яа-яЁё]/;
const MARK = /\{([a-z0-9,]+)\}/g;
const marks = (s) => [...String(s).matchAll(MARK)].map(m => m[1]);
const base = { sex: 'f', age: 44, weight: 76, height: 165, activity: 'light', asOf: '2026-10-15' };
const options = (plan) => [...plan.meals.flatMap(m => m.options), ...(plan.week || []).flatMap(d => d.meals.map(m => m.option))].filter(Boolean);

/** Пътищата в обекта с текст на кирилица (без вътрешния ключ на рецептата). */
function cyrillic(obj, at = '', out = []) {
  if (typeof obj === 'string') { if (CYR.test(obj) && !/\.key$/.test(at)) out.push(`${at}: ${obj.slice(0, 120)}`); return out; }
  if (Array.isArray(obj)) obj.forEach((v, i) => cyrillic(v, `${at}[${i}]`, out));
  else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) cyrillic(v, at ? `${at}.${k}` : k, out);
  return out;
}

/* --------------------------- приготвяне по грамовете --------------------------- */

test('рецепти: всеки маркер сочи съставка на рецептата, всяка съставка с готвене е в текста', () => {
  for (const r of RECIPES) {
    const foods = new Set(r.items.map(([f]) => f));
    for (const m of marks(r.method)) for (const f of m.split(',')) assert.ok(foods.has(f), `${r.name}: {${f}}`);
    assert.ok(!/[{}]/.test(plainMethod(r.method)), r.name);
  }
  // Ориз, бобови, месо и риба се споменават в приготвянето — там е сухото или суровото им тегло.
  const cooked = RECIPES.filter(r => r.items.some(([f]) => YIELDS[f]));
  const missing = cooked.filter(r => r.items.some(([f]) => YIELDS[f] && !marks(r.method).some(m => m.split(',').includes(f))));
  assert.ok(missing.length <= cooked.length * 0.05, missing.map(r => r.name).join('; '));
});

test('рецепти: приготвянето е за една порция, без количества за цялата тава', () => {
  const batch = /(?:четири|пет|шест|осем|[4-9]) (?:купи|чинии|порции|филии|парчета)|(?:всяка|всяко|всеки) (?:порция|филе|парче|купа|чиния)|за \d+ порции/;
  for (const r of RECIPES) assert.ok(!batch.test(r.method), `${r.name}: ${r.method.match(batch)?.[0]}`);
});

test('сухо и сурово тегло: по добива на USDA, закръглено', () => {
  assert.deepEqual(rawOf('rice', 150), { grams: 50, kind: 'dry' });
  assert.deepEqual(rawOf('chicken', 120), { grams: 160, kind: 'raw' });
  assert.equal(rawOf('tomato', 100), null);
  // Пилешкото: 72–73% от суровото тегло след печене (USDA Table of Cooking Yields, 2012).
  assert.ok(YIELDS.chicken.raw > 0.7 && YIELDS.chicken.raw < 0.76);
  for (const [food, y] of Object.entries(YIELDS)) {
    assert.ok(FOODS[food], food);
    const k = y.dry || y.raw;
    assert.ok(y.dry ? k > 2 && k < 4.5 : k > 0.6 && k < 0.9, `${food}: ${k}`);
  }
  assert.equal(quantityText({ food: 'rice', grams: 150 }), '50 г сухо тегло, около 150 г след готвене');
  assert.equal(quantityText({ food: 'rice', grams: 150 }, 'en'), '50 g dry, about 150 g cooked');
  assert.equal(quantityText({ food: 'oil', grams: 10 }), '10 г, ≈1 с.л.');
  assert.equal(quantityText({ food: 'milk', grams: 200 }), '200 мл');
  assert.equal(shopName('rice'), baseName('rice'));
  assert.ok(!/сварен|печен/.test(shopName('chicken')));
});

test('приготвянето: количествата на порцията, замените и добавките в текста', () => {
  const tpl = 'Сварете ориза{rice}. Запечете пилето{chicken} в зехтина{oil}, добавете зеленчуците{pepper,onion}.';
  const items = [{ food: 'rice', grams: 180, orig: 'rice' }, { food: 'chicken', grams: 130, orig: 'chicken' },
    { food: 'oil', grams: 10, orig: 'oil' }, { food: 'pepper', grams: 100, orig: 'pepper' }, { food: 'onion', grams: 40, orig: 'onion' },
    { food: 'bread', grams: 40, extra: true }];
  const text = renderMethod(tpl, items);
  assert.match(text, /ориза \(60 г сухо тегло, около 180 г след готвене\)/);
  assert.match(text, /пилето \(180 г сурово тегло, около 130 г след готвене\)/);
  assert.match(text, /зехтина \(10 г, ≈1 с\.л\.\)/);
  assert.match(text, /зеленчуците \(.*чушки.* 100 г, .*лук.* 40 г\)/i);
  assert.match(text, /Към порцията: .*хляб.* 40 г\.$/);
  const swapped = renderMethod('Сварете пастата{pasta}.', [{ food: 'rice', grams: 150, orig: 'pasta' }], { swaps: [['pasta', 'rice']] });
  assert.match(swapped, /пастата \(кафяв ориз 50 г сухо тегло/);
  assert.match(swapped, /Замени: кафяв ориз вместо пълнозърнести макарони\.$/);
});

test('режимът: всяко ястие с приготвяне по грамовете и пазаруване по сухо и сурово тегло', () => {
  const plan = nutritionPlan({ ...base, days: 7, mealsPerDay: 5, goal: 'lose' });
  for (const o of options(plan)) {
    assert.ok(o.method && !/[{}]/.test(o.method), o.name);
    assert.ok(!('template' in o), 'шаблонът не остава в режима');
    for (const it of o.items) {
      if (it.extra) continue;
      // Количеството на всяка съставка е в приготвянето (в текста или в последното изречение).
      const g = String(it.grams);
      assert.ok(o.method.includes(g) || o.method.includes(`${Math.round(it.grams / (FOODS[it.food].unit?.grams || 1))} бр.`), `${o.name}: ${it.food} ${g}`);
    }
  }
  const grains = plan.shopping.groups.find(g => g.cat === 'grain');
  const rice = grains?.items.find(it => YIELDS[it.food]?.dry);
  if (rice) assert.match(rice.amount, /сухо тегло/);
  const meat = plan.shopping.groups.find(g => g.cat === 'protein')?.items.find(it => YIELDS[it.food]?.raw);
  if (meat) assert.match(meat.amount, /сурово тегло/);
});

/* ------------------------------- на английски ------------------------------- */

test('английски: всяка храна, подправка, рецепта и диагноза има превод със същите маркери', () => {
  for (const id of Object.keys(FOODS)) assert.ok(EN_FOODS[id] && !CYR.test(EN_FOODS[id].join()), id);
  for (const r of RECIPES) {
    const en = EN_RECIPES[r.name];
    assert.ok(en, r.name);
    assert.deepEqual(marks(en[1]).sort(), marks(r.method).sort(), r.name);
    assert.ok(!CYR.test(en.join(' ')), r.name);
    for (const f of r.flavor || []) assert.ok(EN_FLAVOR[f], `${r.name}: ${f}`);
  }
  for (const d of DX) assert.ok(EN_DX[d.code], d.code);
  assert.equal(dxNameEn('L40.0'), 'Psoriasis');
  assert.equal(dxNameEn('Z00.0', 'Профилактичен преглед'), 'ICD-10 Z00.0');
  assert.equal(quantityEn('2 бр. (≈120 г)'), '2 pcs (≈120 g)');
  assert.equal(quantityEn('1,2 кг (сухо тегло)'), '1.2 kg (dry weight)');
  assert.equal(tr('Целевото тегло 80 кг не съответства на целта „отслабване“.'), 'The target weight of 80 kg does not match the goal “weight loss”.');
  assert.equal(tr('Менструацията се очакваше на 15.10.2026 — ако е започнала, въведете датата.'), 'Menstruation was expected on 15.10.2026; if it has started, enter the date.');
  assert.equal(tr('изготвен 15.10.2026 г.'), 'prepared 15.10.2026');
  assert.equal(tr('44 г. 7 мес.'), '44 y 7 mo');
});

test('английски: режимът при всяка диагноза, цикъл, тренировки и лекарства е без кирилица', () => {
  const acts = ['gym', 'bodyweight', 'reformer', 'matpilates', 'yoga', 'taichi', 'running', 'walking', 'cycling', 'swimming', 'rowing', 'hiit', 'dance', 'team', 'racket', 'hiking'];
  const drugs = Object.keys(DRUGS);
  const prefs = [[], ['vegetarian'], ['vegan'], ['glutenFree', 'lactoseFree'], ['noDairy', 'noFish'], ['noNuts', 'noEgg', 'noSoy'], ['noPork', 'noRedMeat']];
  DX.forEach((dx, k) => {
    const sex = /^[NO]|^Z3|^E28/.test(dx.code) ? 'f' : (k % 2 ? 'm' : 'f');
    const input = {
      ...base, sex, age: 30 + (k % 50), weight: 60 + (k % 40), goal: ['lose', 'maintain', 'gain'][k % 3],
      pattern: ['mediterranean', 'dash', 'lowcarb', 'highprotein', 'balanced'][k % 5], preferences: prefs[k % prefs.length],
      diagnoses: [dx], days: [1, 7, 28][k % 3], mealsPerDay: [3, 4, 5][k % 3], quick: k % 4 === 0, sourcedOnly: k % 5 === 0,
      strength: k % 3 === 0, egfr: k % 7 === 0 ? 35 : undefined, potassium: k % 11 === 0 ? 5.3 : undefined,
      classes: new Set(k % 6 === 0 ? ['SGLT2', 'INSULIN'] : k % 6 === 1 ? ['ACEI', 'METFORMIN'] : []),
      allergies: k % 9 === 0 ? ['ядки', 'риба'] : [],
      medNotes: foodNotes({ meds: drugs.filter((_, i) => i % 40 === k % 40).map(drug => ({ drug })) }),
      cycleSync: sex === 'f' && k % 2 === 0, cycle: sex === 'f' ? { periods: [{ start: '2026-10-01' }], length: 28 } : undefined,
      training: k % 2 ? { activities: [acts[k % 16], acts[(k + 5) % 16], acts[(k + 11) % 16]], daysPerWeek: 2 + (k % 6), minutes: [20, 30, 45, 60, 75, 90][k % 6],
        level: ['beginner', 'intermediate', 'advanced'][k % 3], focus: ['health', 'weight', 'muscle', 'endurance', 'mobility', 'bone'][k % 6], time: ['any', 'morning', 'midday', 'afternoon', 'evening'][k % 5] } : undefined,
      bp: k % 10 === 3 ? { sys: 165, dia: 100 } : null,
      pregnancyWeek: /^Z3[3-6]|^O/.test(dx.code) ? 20 : undefined,
    };
    const plan = nutritionPlan(input);
    const before = JSON.stringify(plan);
    const en = translatePlan(plan);
    assert.equal(JSON.stringify(plan), before, 'българският режим не се променя');
    assert.deepEqual(cyrillic(en), [], dx.code);
    assert.equal(en.lang, 'en');
    assert.equal(en.targets.kcal, plan.targets.kcal);
    for (const o of options(en)) assert.ok(!/[{}]/.test(o.method), o.name);
  });
});

test('английски: ястието — име, съставки, приготвяне със същите количества и замените', () => {
  const plan = nutritionPlan({ ...base, days: 7, preferences: ['glutenFree', 'lactoseFree'] });
  const en = translatePlan(plan);
  const bg = options(plan);
  options(en).forEach((o, i) => {
    assert.equal(o.key, bg[i].key);
    assert.equal(o.items.length, bg[i].items.length);
    o.items.forEach((it, j) => assert.equal(it.grams, bg[i].items[j].grams));
    // Числата в приготвянето са същите като в българския текст.
    const nums = (s) => (s.match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(',', '.')).sort().join(' ');
    assert.equal(nums(o.method.replace(/\b\d+ °C\b/g, '')), nums(bg[i].method.replace(/\b\d+ °C\b/g, '')), o.name);
    if (bg[i].swaps?.length) assert.match(o.method, /Swaps: /);
  });
  assert.ok(options(en).some(o => /gluten-free bread|buckwheat|brown rice/.test(o.name)), 'имената следват замените');
  assert.ok(en.shopping.groups.every(g => !CYR.test(g.label)));
});

test('английски: надписите в екрана и в PDF — само докато се показва английски режим', () => {
  assert.equal(ui('Приготвяне'), 'Приготвяне');
  assert.equal(withPlanLang({ lang: 'en' }, () => ui('Приготвяне')), 'Preparation');
  assert.equal(withPlanLang({ lang: 'en' }, () => ui('Седмица 3')), 'Week 3');
  assert.equal(ui('Приготвяне'), 'Приготвяне', 'след това отново на български');
});

const F = new URL('../public/fonts/', import.meta.url);
const read = (f) => new Uint8Array(fs.readFileSync(new URL(f, F)));

test('английски PDF: без нито една буква на кирилица', async () => {
  const fonts = { regular: read('NotoSans-Regular.ttf'), semibold: read('NotoSans-SemiBold.ttf'), bold: read('NotoSans-Bold.ttf'), symbols: read('DejaVuSans-Symbols.ttf') };
  const plan = translatePlan(nutritionPlan({ ...base, days: 7, mealsPerDay: 4, goal: 'lose', diagnoses: [{ code: 'L40.0' }, { code: 'E11' }],
    cycleSync: true, cycle: { periods: [{ start: '2026-10-05' }], length: 28 },
    training: { activities: ['gym', 'running', 'reformer'], level: 'intermediate', daysPerWeek: 4, minutes: 45, time: 'evening', focus: 'weight' } }));
  const bytes = await nutritionReport({ plan, person: { name: 'Maria Ivanova', birthDate: '1982-03-08', sex: 'f' }, practice: { name: 'Health Practice', phone: '0888 123 456' },
    doctor: { name: 'Dr Petar Petrov' }, fonts, version: '4.11.0', date: '2026-10-15' });
  const s = Buffer.from(bytes).toString('latin1');
  // Знаците в документа — от картите ToUnicode на шрифтовете.
  const maps = [];
  for (const m of s.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    let txt = '';
    try { txt = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { continue; }
    if (txt.includes('beginbfchar')) maps.push(txt);
  }
  assert.ok(maps.length >= 3);
  const codes = maps.flatMap(t => [...t.matchAll(/<[0-9a-fA-F]{4}> <([0-9a-fA-F]{4,})>/g)].map(x => parseInt(x[1].slice(0, 4), 16)));
  assert.ok(codes.length > 50);
  const cyr = codes.filter(c => c >= 0x400 && c <= 0x4ff).map(c => String.fromCodePoint(c));
  assert.deepEqual(cyr, []);
  assert.match(s, /\/Lang \(en-GB\)/);
});

/* ------------------------------------ API ------------------------------------ */

test('API: режимът на английски за човек извън листата и за пациент', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-411-'));
  const spaces = new Workspaces(new Store(dir));
  const server = createAppServer({ workspaces: spaces, serveStatic: memoryStatic({ 'index.html': 'x' }), requireActivation: false });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const jar = new Map();
  const call = async (method, url, body) => {
    const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(baseUrl + url, {
      method, body: body && JSON.stringify(body),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  try {
    await call('POST', '/api/setup', { workspace: 'gp', practiceName: 'П', doctorName: 'д-р Т' });
    const person = { name: 'Г. К.', sex: 'f', age: 52, weight: 80, height: 164, allergies: 'ядки', diagnoses: [{ code: 'L40.0' }, { code: 'M17' }], meds: ['methotrexate', 'metformin'] };
    const en = await call('POST', '/api/nutrition/plan', { person, days: 7, goal: 'lose', lang: 'en', save: true });
    assert.equal(en.status, 200, JSON.stringify(en.data));
    assert.equal(en.data.plan.lang, 'en');
    assert.equal(en.data.plan.input.lang, 'en');
    assert.deepEqual(cyrillic({ ...en.data.plan, input: { ...en.data.plan.input, allergies: null } }), []);
    assert.ok(en.data.plan.diagnoses.some(d => d.name === 'Psoriasis'));
    assert.ok(en.data.plan.prefer.some(t => /Psoriasis: if overweight/.test(t)));
    assert.equal(en.data.saved.plan.lang, 'en', 'записва се английският режим');
    const bg = await call('POST', '/api/nutrition/plan', { person, days: 1 });
    assert.ok(!bg.data.plan.lang && CYR.test(bg.data.plan.meals[0].label));
    assert.equal((await call('POST', '/api/nutrition/plan', { person, lang: 'de' })).status, 400);

    const pt = await call('POST', '/api/patients', { name: 'Иван Петров', sex: 'm', birthDate: '1970-05-05' });
    const id = pt.data.patient.id;
    const pen = await call('POST', `/api/patients/${id}/nutrition`, { weight: 92, height: 180, diagnoses: [{ code: 'G47.3' }], lang: 'en' });
    assert.equal(pen.status, 200, JSON.stringify(pen.data));
    assert.deepEqual(cyrillic(pen.data.plan), []);
    assert.ok(pen.data.plan.diagnoses.some(d => d.name === 'Sleep apnea'));
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
