/* Версия 4.15: по-голяма база данни — 233 храни със състава по USDA FoodData Central, витамини и
 * минерали в менюто спрямо EFSA, каталог на храните с етикетите по критериите на ЕС, 66 нови
 * рецепти, библиотека с над 100 упражнения според уредите у дома и 15 нови вида тренировки. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FOODS, LIQUIDS, RECIPES, servingOf, totals } from '../public/js/shared/recipes.js';
import { MICRO } from '../public/js/shared/food-micro.js';
import { nutritionPlan, richIn } from '../public/js/shared/nutrition.js';
import { NRV, claimsOf } from '../public/js/shared/food-claims.js';
import { ACTIVITIES, EXERCISES, HOME_EQUIPMENT, trainingPlan, trainingSafety } from '../public/js/shared/training.js';
import { allowedExercise, equipmentFor, pickExercises } from '../public/js/shared/exercises.js';
import { GUIDELINES } from '../public/js/shared/guidelines.js';
import { dietProfiles } from '../public/js/shared/diet-icd.js';
import { EN_FOODS } from '../public/js/shared/i18n/en-foods.js';
import { EN_RECIPES } from '../public/js/shared/i18n/en-recipes.js';
import { translatePlan } from '../public/js/shared/i18n/plan-en.js';
import { readTraining } from '../lib/api-nutrition.js';
import { Store } from '../lib/store.js';
import { Workspaces } from '../lib/workspaces.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';

const CYR = /[А-Яа-яЁё]/;
const base = { sex: 'f', age: 40, weight: 70, height: 165, activity: 'light', asOf: '2026-10-16' };
const options = (plan) => [...plan.meals.flatMap(m => m.options), ...(plan.week || []).flatMap(d => d.meals.map(m => m.option))].filter(Boolean);
const row = (plan, key) => plan.micro.rows.find(r => r.key === key);
const tp = (extra = {}) => trainingPlan({
  start: '2026-10-19', sex: 'f', age: 45, weight: 75, bmi: 26, level: 'intermediate', daysPerWeek: 4, minutes: 45,
  focus: 'health', activities: ['gym', 'bodyweight'], ...extra,
});
const moves = (t) => t.days.flatMap(d => [...d.sessions.flatMap(s => s.blocks.flatMap(b => b.moves || [])), ...d.addOns.flatMap(a => a.moves || [])]);

/* ------------------------------------ храни ------------------------------------ */

test('храните: 233 със състава по USDA, новите вещества и английско име', () => {
  const ids = Object.keys(FOODS);
  assert.equal(ids.length, 233);
  for (const id of ids) {
    const f = FOODS[id];
    assert.ok(EN_FOODS[id], `${id}: английско име`);
    assert.ok(id in MICRO, `${id}: ред в food-micro.js`);
    if (f.fdc === null) { assert.ok(['oatmilk', 'oatyogurt'].includes(id), id); continue; }
    assert.ok(Number.isInteger(f.fdc) && f.fdc > 160000 && f.fdc < 180000, `${id}: FDC ID`);
    for (const k of ['sfa', 'sug', 'mg', 'vc', 'vd', 'b12', 'fol', 'n3', 'ala']) assert.ok(Number.isFinite(f[k]) && f[k] >= 0, `${id}.${k}`);
    assert.ok(f.sfa <= f.f + 0.05, `${id}: наситените са част от мазнините`);
  }
  // Стойности, които се проверяват лесно с таблиците на USDA.
  assert.ok(FOODS.mackerel.n3 > 1000 && FOODS.mackerel.vd > 10 && FOODS.mackerel.b12 > 10, 'скумрия');
  assert.ok(FOODS.salmon.n3 > 1500 && FOODS.cannedsalmon.ca > 200, 'сьомга');
  assert.equal(FOODS.oats.mg, 138);
  assert.ok(FOODS.pepper.vc > 100 && FOODS.kiwi.vc > 80, 'витамин C');
  assert.ok(FOODS.lentils.fol > 150 && FOODS.chickenliver.fol > 400, 'фолат');
  // Фолатът е от самата храна — без добавената в САЩ фолиева киселина; витамин D — без добавения в млякото.
  assert.ok(FOODS.cereal.fol < 50 && FOODS.cereal.vd === 0 && FOODS.cereal.b12 === 0);
  assert.equal(FOODS.evapmilk.vd, 0);
  // Новите флагове, течности и порции.
  assert.ok(FOODS.chickenliver.flags.has('liver') && FOODS.beefliver.flags.has('liver'));
  assert.ok(FOODS.grapefruit.flags.has('grapefruit'));
  for (const id of ['wholemilk', 'skimmilk', 'buttermilk', 'soymilk', 'tomatojuice']) assert.ok(LIQUIDS.has(id), id);
  assert.equal(servingOf('apricot'), 35);
  assert.equal(servingOf('walnuts'), 30);
  assert.equal(servingOf('wholemilk'), 200);
});

test('етикетите по критериите на ЕС (Регламент 1924/2006, 1169/2011)', () => {
  assert.deepEqual(NRV, { vd: 5, vc: 80, fol: 200, b12: 2.5, k: 2000, ca: 800, mg: 375, fe: 14 });
  const has = (id, key, level) => claimsOf(id).some(c => c.key === key && c.level === level);
  assert.ok(has('mackerel', 'n3', 'high') && has('mackerel', 'vd', 'high') && has('mackerel', 'b12', 'high'));
  assert.ok(has('oats', 'fiber', 'high'));
  assert.ok(has('pepper', 'vc', 'high'));
  assert.ok(has('skimmilk', 'fat', 'low'), 'обезмаслено мляко');
  assert.ok(has('whitecheese', 'ca', 'high'));
  assert.ok(!claimsOf('whitecheese').some(c => c.key === 'sodium'), 'саламуреното сирене не е с малко натрий');
  assert.ok(!claimsOf('spinach').some(c => c.key === 'protein'), 'белтък — само при белтъчните храни');
  // Напитките: 7,5% от референтната стойност в 100 мл.
  assert.ok(has('milk', 'ca', 'high'));
  assert.ok(claimsOf('kiwi').every(c => c.text.length > 5));
});

/* ------------------------------- витамини и минерали ------------------------------- */

test('витамини и минерали в менюто спрямо EFSA 2017', () => {
  const f = nutritionPlan({ ...base, days: 7 });
  const keys = f.micro.rows.map(r => r.key);
  assert.deepEqual(keys, ['fiber', 'sfa', 'k', 'ca', 'mg', 'fe', 'vc', 'fol', 'b12', 'vd', 'n3', 'ala']);
  assert.equal(f.micro.basis, 'week');
  assert.deepEqual([row(f, 'vc').ref, row(f, 'mg').ref, row(f, 'fol').ref, row(f, 'b12').ref, row(f, 'k').ref, row(f, 'vd').ref, row(f, 'n3').ref], [95, 300, 330, 4, 3500, 15, 250]);
  const m = nutritionPlan({ ...base, sex: 'm', weight: 85, height: 180 });
  assert.equal(m.micro.basis, 'day');
  assert.deepEqual([row(m, 'vc').ref, row(m, 'mg').ref], [110, 350]);
  const preg = nutritionPlan({ ...base, diagnoses: [{ code: 'Z34' }], pregnancyWeek: 20 });
  assert.deepEqual([row(preg, 'vc').ref, row(preg, 'fol').ref, row(preg, 'b12').ref], [105, 600, 4.5]);
  const lact = nutritionPlan({ ...base, diagnoses: [{ code: 'Z39.1' }] });
  assert.deepEqual([row(lact, 'vc').ref, row(lact, 'fol').ref, row(lact, 'b12').ref, row(lact, 'k').ref], [155, 500, 5, 4000]);
  // При ограничение на калия (ХБЗ) калият не се сравнява с препоръката за здрави.
  assert.equal(row(nutritionPlan({ ...base, diagnoses: [{ code: 'N18.4' }], egfr: 25 }), 'k'), undefined);
  // Стойностите съвпадат със сборовете на менюто; ALA е 0,5% от енергията; наситените — горна граница.
  const day = totals(options(m).slice(0, 0));
  assert.equal(day.kcal, 0);
  assert.equal(row(f, 'ala').ref, Math.round((f.targets.kcal * 0.005 / 9) * 10) / 10);
  assert.equal(row(f, 'sfa').max, true);
  assert.equal(row(f, 'sfa').ref, f.targets.satFat);
  for (const r of f.micro.rows) assert.ok(['ok', 'near', 'low', 'high'].includes(r.status) && r.pct >= 0, r.key);
});

test('подсказки за недостига: храни според ограниченията, без EPA и DHA при вегани', () => {
  const vegan = nutritionPlan({ ...base, days: 7, preferences: ['vegan'] });
  const n3 = vegan.micro.notes.find(n => n.key === 'n3');
  assert.equal(n3.kind, 'nofish');
  assert.match(n3.text, /масло от водорасли/);
  assert.ok(!vegan.micro.notes.some(n => n.key === 'b12'), 'при вегани — общата бележка за добавка с B12');
  const vd = vegan.micro.notes.find(n => n.key === 'vd');
  assert.ok(vd.foods.every(id => !['fish', 'egg', 'dairy', 'meat'].some(fl => FOODS[id].flags.has(fl))), 'вегански източници');
  assert.match(vd.text, /минимално слънце/);
  // richIn спазва ограниченията и „не яде“.
  const ctx = { prefs: new Set(['noFish']), cond: new Set(), dislikes: new Set(['beefliver']) };
  const b12 = richIn('b12', ctx, 6);
  assert.ok(b12.length >= 3 && b12.every(id => !FOODS[id].flags.has('fish') && !FOODS[id].flags.has('seafood') && id !== 'beefliver'), b12.join());
  assert.ok(richIn('n3', { prefs: new Set(), cond: new Set() }, 3).every(id => FOODS[id].flags.has('fish')));
  // На английски — с английските имена на храните.
  const en = translatePlan(nutritionPlan({ ...base, days: 7, preferences: ['noFish'] }));
  assert.ok(en.micro.rows.every(r => !CYR.test(r.label + r.unit)));
  assert.ok(en.micro.notes.length && en.micro.notes.every(n => !CYR.test(n.text)), en.micro.notes.map(n => n.text).join(' | '));
});

test('безопасност: черен дроб — не при бременност; грейпфрут — не при трансплантация и при някои лекарства', () => {
  const liver = (p) => options(p).some(o => o.items.some(it => FOODS[it.food].flags.has('liver')));
  for (let v = 0; v < 6; v++) {
    assert.ok(!liver(nutritionPlan({ ...base, days: 28, variant: v, diagnoses: [{ code: 'Z34' }], pregnancyWeek: 20 })), `вариант ${v}`);
  }
  const dx = dietProfiles([{ code: 'Z34' }], { pregnancyWeek: 20 });
  assert.ok(dx.exclude.has('chickenliver') && dx.exclude.has('beefliver'));
  // Без бременност дробчетата са сред източниците на желязо; при бременност — не.
  assert.ok(richIn('fe', { prefs: new Set(), cond: new Set() }, 8).includes('chickenliver'));
  assert.ok(!richIn('fe', { prefs: new Set(), cond: new Set(), exclude: dx.exclude }, 8).includes('chickenliver'));
  const preg = nutritionPlan({ ...base, diagnoses: [{ code: 'Z34' }], pregnancyWeek: 20 });
  assert.ok(preg.diagnoses.some(d => d.effects.some(e => /черен дроб/.test(e))));
  // Грейпфрутът не е в рецептите, но е изключен от каталога за менюто — и „Богати на витамин C“ не го предлага.
  const tx = nutritionPlan({ ...base, diagnoses: [{ code: 'Z94.0' }] });
  assert.ok(tx.diagnoses.some(d => d.effects.some(e => /грейпфрут/.test(e))));
  const simva = { prefs: new Set(), cond: new Set(), exclude: new Set(['grapefruit']) };
  assert.ok(!richIn('vc', simva, 40).includes('grapefruit'));
  assert.ok(richIn('vc', { prefs: new Set(), cond: new Set() }, 40).includes('grapefruit'));
});

/* ----------------------------------- рецепти ----------------------------------- */

test('рецептите: 325, от тях 66 нови с новите храни, всяка с превод със същите маркери', () => {
  assert.equal(RECIPES.length, 325);
  const fresh = RECIPES.slice(-66);
  const used = new Set(fresh.flatMap(r => r.items.map(([food]) => food)));
  for (const id of ['millet', 'skyr', 'chia', 'okra', 'nettle', 'sorrel', 'anchovy', 'mussels', 'squid', 'carp', 'herring', 'rabbit', 'favabeans', 'splitpeas', 'tempeh']) {
    assert.ok(used.has(id), id);
  }
  const marks = (t) => [...t.matchAll(/\{([a-z0-9,]+)\}/g)].map(m => m[1]).sort().join('|');
  for (const r of fresh) {
    assert.ok(EN_RECIPES[r.name], r.name);
    assert.equal(marks(EN_RECIPES[r.name][1]), marks(r.method), r.name);
    for (const [food] of r.items) assert.ok(FOODS[food], `${r.name}: ${food}`);
  }
  // Новите ястия влизат в менютата.
  const keys = new Set();
  for (let v = 0; v < 4; v++) for (const o of options(nutritionPlan({ ...base, days: 28, variant: v }))) keys.add(o.key);
  assert.ok(fresh.filter(r => keys.has(r.name)).length >= 20);
});

/* ---------------------------------- упражнения ---------------------------------- */

test('библиотеката: над 100 упражнения с движение, ниво и описание', () => {
  const list = Object.entries(EXERCISES);
  assert.ok(list.length >= 100, String(list.length));
  for (const [id, ex] of list) {
    assert.ok(ex.name && ex.how.length > 40, id);
    assert.ok([1, 2, 3].includes(ex.level) && Array.isArray(ex.need) && ex.pattern, id);
  }
  assert.ok(list.filter(([, ex]) => ex.src === 'NHS').length >= 24, 'описания по NHS');
  assert.ok(GUIDELINES.nhs_strength_flex && GUIDELINES.usda_fdc && GUIDELINES.eu_claims_2006 && GUIDELINES.eu_fic_2011);
  // Безопасност на отделното упражнение.
  assert.equal(allowedExercise(EXERCISES.deadBug, { noSupine: true }), false);
  assert.equal(allowedExercise(EXERCISES.backExt, { noSupine: true }), false, 'по корем — не при бременност');
  assert.equal(allowedExercise(EXERCISES.jumpSquat, { noJumps: true }), false);
  assert.equal(allowedExercise(EXERCISES.catCow, { spineSparing: true }), false);
  assert.equal(allowedExercise(EXERCISES.plank, { noSupine: true }), true);
});

test('упражненията се подбират според уредите, нивото и безопасността', () => {
  const none = equipmentFor('bodyweight', []);
  assert.ok(!none.has('band') && none.has('chair'));
  assert.ok(equipmentFor('bodyweight', undefined).has('band'), 'без избор — ластик, както досега');
  assert.ok(equipmentFor('gym').has('machine'));
  const pick = (have, extra = {}) => pickExercises(['squat', 'pullH', 'pushH', 'hinge', 'core'], { have, level: 'intermediate', ...extra });
  const bare = pick(none);
  assert.equal(bare.length, 5);
  assert.ok(bare.every(id => EXERCISES[id].need.every(n => none.has(n))), bare.join());
  assert.ok(bare.includes('backExt'), 'без ластик — гръб по корем вместо гребане');
  const db = pick(equipmentFor('bodyweight', ['dumbbells']));
  assert.ok(db.some(id => EXERCISES[id].need.includes('dumbbells')), db.join());
  const gym = pick(equipmentFor('gym'));
  assert.ok(gym.filter(id => EXERCISES[id].need.some(n => ['machine', 'dumbbells', 'kettlebell', 'barbell', 'band'].includes(n))).length >= 4, gym.join());
  assert.ok(pick(equipmentFor('gym'), { level: 'beginner' }).every(id => EXERCISES[id].level === 1));
  assert.notDeepEqual(pick(equipmentFor('gym'), { week: 0 }), pick(equipmentFor('gym'), { week: 1 }), 'седмиците се редуват');

  // В плана: бременност — без лежане по гръб и по корем и без подскоци; уредите у дома.
  const preg = tp({ activities: ['bodyweight', 'hiit'], pregnancy: true, pregnancyWeek: 24, level: 'advanced', equipment: [] });
  for (const id of moves(preg)) assert.ok(!EXERCISES[id].supine && !EXERCISES[id].prone && !EXERCISES[id].jump, id);
  assert.ok(moves(preg).every(id => !EXERCISES[id].need.includes('band')), 'без ластик, щом не е избран');
  const home = tp({ activities: ['bodyweight'], equipment: ['kettlebell', 'trx'] });
  assert.deepEqual(home.input.equipment, ['kettlebell', 'trx']);
  assert.ok(moves(home).some(id => EXERCISES[id].need.includes('kettlebell') || EXERCISES[id].need.includes('trx')));
  // Остеопороза: без сгъване и завъртане на гръбнака.
  for (const id of moves(tp({ activities: ['bodyweight', 'stretching'], codes: ['M81.0'], cond: new Set(['osteoporosis']) }))) {
    assert.ok(!EXERCISES[id].spineFlex && !EXERCISES[id].spineRot, id);
  }
  // Балансът се сменя по седмици.
  const old = tp({ age: 70, activities: ['walking'] });
  const bal = (w) => old.days.filter(d => d.week === w).flatMap(d => d.addOns).find(a => a.kind === 'balance').moves.join();
  assert.notEqual(bal(0), bal(1));
});

test('новите тренировки: MET по Compendium 2024, съдържание и рисковете', () => {
  assert.equal(Object.keys(ACTIVITIES).length, 31);
  const fresh = ['chair', 'stretching', 'stairs', 'waterwalk', 'ebike', 'folk', 'gardening', 'xcski', 'alpineski', 'skating', 'paddling', 'climbing', 'combat', 'tabletennis', 'golf'];
  for (const a of fresh) {
    const { met } = ACTIVITIES[a];
    assert.ok(met.light <= met.moderate && met.moderate <= met.vigorous, a);
    const t = tp({ activities: [a], level: 'advanced', daysPerWeek: 3 });
    const s = t.days.flatMap(d => d.sessions).find(x => x.activity === a);
    assert.ok(s && s.blocks.length && s.kcal > 0, a);
    for (const b of s.blocks) for (const m of b.moves || []) assert.ok(b.text.includes(EXERCISES[m].name), `${a}: ${m}`);
  }
  assert.deepEqual(ACTIVITIES.stairs.met, { light: 4.5, moderate: 6.8, vigorous: 9.3 });
  assert.deepEqual(ACTIVITIES.folk.met, { light: 4.5, moderate: 5.0, vigorous: 9.8 });
  // Падане и удар: антикоагулант, бременност, остеопоротична фрактура; епилепсия — без катерене.
  for (const s of [trainingSafety({ age: 60, classes: new Set(['DOAC']) }), trainingSafety({ age: 30, pregnancy: true, pregnancyWeek: 20 }), trainingSafety({ age: 70, codes: ['M80.0'] })]) {
    for (const a of ['team', 'combat', 'alpineski', 'skating', 'climbing']) assert.ok(s.exclude.has(a), a);
    assert.ok(!s.exclude.has('xcski') && !s.exclude.has('folk'));
  }
  assert.ok(trainingSafety({ age: 30, codes: ['G40.9'] }).exclude.has('climbing'));
  const chair = tp({ activities: ['chair'], age: 82, level: 'beginner' });
  assert.ok(moves(chair).includes('sitToStand') && moves(chair).includes('hipMarch'));
  assert.ok(chair.days.flatMap(d => d.sessions).filter(s => s.activity === 'chair').every(s => s.counted === 'light'));
  // Английски — без кирилица в новите тренировки и упражнения.
  const plan = nutritionPlan({ ...base, days: 7, training: { activities: fresh, level: 'intermediate', daysPerWeek: 6, minutes: 45, equipment: ['band', 'dumbbells'] } });
  const en = translatePlan(plan);
  const texts = [...en.training.days.flatMap(d => [...d.sessions.flatMap(s => [s.label, ...s.blocks.flatMap(b => [b.name, b.text])]), ...d.addOns.map(a => a.text)]),
    ...en.training.exercises.flatMap(x => [x.name, x.how]), ...en.training.notes];
  const bad = texts.filter(t => CYR.test(t));
  assert.deepEqual(bad, []);
});

/* ------------------------------------- API ------------------------------------- */

test('API: уредите у дома в тренировките', async () => {
  assert.deepEqual(readTraining({ activities: ['bodyweight'], equipment: ['band', 'ball', 'band'] }).equipment, ['band', 'ball']);
  assert.equal(readTraining({ activities: ['bodyweight'] }).equipment, undefined, 'без поле — по подразбиране');
  assert.deepEqual(readTraining({ activities: ['bodyweight'], equipment: [] }).equipment, []);
  assert.throws(() => readTraining({ activities: ['bodyweight'], equipment: ['laser'] }), /уред/);
  assert.ok(Object.keys(HOME_EQUIPMENT).length === 5);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-415-'));
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
    const person = { name: 'И. П.', sex: 'm', age: 66, weight: 82, height: 174, meds: ['simvastatin'] };
    const body = { person, days: 7, training: { activities: ['chair', 'folk', 'bodyweight'], daysPerWeek: 4, minutes: 30, equipment: ['dumbbells'] } };
    const res = await call('POST', '/api/nutrition/plan', body);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const plan = res.data.plan;
    assert.deepEqual(plan.training.input.equipment, ['dumbbells']);
    assert.ok(plan.micro.rows.length >= 11);
    assert.ok(plan.medNotes.some(n => /грейпфрут/.test(n.text)), 'симвастатин');
    assert.ok(options(plan).every(o => o.items.every(it => it.food !== 'grapefruit')));
    assert.equal((await call('POST', '/api/nutrition/plan', { ...body, training: { ...body.training, equipment: ['laser'] } })).status, 400);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------- 4.15.1: PDF на английски с едно щракване ------------------------- */

test('4.15.1: запазен режим на български дава PDF на английски без кирилица', async () => {
  const { nutritionReport } = await import('../public/js/shared/pdf/nutrition-report.js');
  const zlib = await import('node:zlib');
  const read = (f) => new Uint8Array(fs.readFileSync(new URL(`../public/fonts/${f}`, import.meta.url)));
  const fonts = { regular: read('NotoSans-Regular.ttf'), semibold: read('NotoSans-SemiBold.ttf'), bold: read('NotoSans-Bold.ttf'), symbols: read('DejaVuSans-Symbols.ttf') };
  // Както бутонът „📄 EN“: режимът е запазен като JSON на български и се превежда при изтеглянето.
  const saved = JSON.parse(JSON.stringify(nutritionPlan({ ...base, days: 7, goal: 'lose', diagnoses: [{ code: 'E11.9' }],
    training: { activities: ['bodyweight', 'folk', 'chair'], level: 'beginner', daysPerWeek: 3, minutes: 30, equipment: ['band'] } })));
  assert.equal(saved.lang, undefined);
  const plan = translatePlan(saved);
  assert.equal(plan.lang, 'en');
  const bytes = await nutritionReport({ plan, person: { name: 'Mary Smith', age: 40, sex: 'f' }, practice: { name: 'Practice' }, doctor: { name: 'Dr Smith' },
    fonts, version: '4.15.1', date: '2026-10-22' });
  const s = Buffer.from(bytes).toString('latin1');
  const codes = [];
  for (const m of s.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    let txt = '';
    try { txt = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { continue; }
    if (txt.includes('beginbfchar')) codes.push(...[...txt.matchAll(/<[0-9a-fA-F]{4}> <([0-9a-fA-F]{4,})>/g)].map(x => parseInt(x[1].slice(0, 4), 16)));
  }
  assert.ok(codes.length > 50);
  assert.deepEqual(codes.filter(c => c >= 0x400 && c <= 0x4ff).map(c => String.fromCodePoint(c)), []);
  assert.match(s, /\/Lang \(en-GB\)/);
  // Българският оригинал не се променя.
  assert.ok(CYR.test(saved.meals[0].options[0].name));
});

test('4.15.1: режим, запазен преди 4.11 без ключ на ястието, също излиза изцяло на английски', () => {
  const saved = JSON.parse(JSON.stringify(nutritionPlan({ ...base, days: 7 })));
  const options = [...saved.meals.flatMap(m => m.options), ...saved.week.flatMap(d => d.meals.map(m => m.option))];
  for (const o of options) { delete o.key; delete o.template; delete o.swaps; }
  // Ястие, преименувано по-късно: намира се по линка към източника.
  const renamed = options.find(o => o.source?.length);
  assert.ok(renamed);
  const enName = EN_RECIPES[renamed.name][0];
  renamed.name = 'Старо име на ястието';
  const plan = translatePlan(saved);
  const outOpts = [...plan.meals.flatMap(m => m.options), ...plan.week.flatMap(d => d.meals.map(m => m.option))];
  assert.deepEqual(outOpts.filter(o => CYR.test(o.name) || CYR.test(o.method)).map(o => o.name), []);
  assert.ok(outOpts.some(o => o.name.toLowerCase() === enName.toLowerCase()));
});
