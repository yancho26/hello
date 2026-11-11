/* Версия 4.19: български рецепти — 12 нови храни по USDA, 75 нови ястия с превод, списъкът с
 * българските ястия сред по-старите и изборът „българска кухня“ за менюто. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FOODS, RECIPES, YIELDS, isBulgarian, mealsOf, rawOf, recipeTags, servingOf, totals, unknownBulgarian } from '../public/js/shared/recipes.js';
import { MICRO } from '../public/js/shared/food-micro.js';
import { PROTEIN_FOODS, STARCH, keepsWell, nutritionPlan } from '../public/js/shared/nutrition.js';
import { childFoodRules } from '../public/js/shared/child-nutrition.js';
import { EN_FOODS, EN_FLAVOR } from '../public/js/shared/i18n/en-foods.js';
import { EN_RECIPES } from '../public/js/shared/i18n/en-recipes.js';
import { translatePlan } from '../public/js/shared/i18n/plan-en.js';
import { nutritionReport } from '../public/js/shared/pdf/nutrition-report.js';
import { Store } from '../lib/store.js';
import { Workspaces } from '../lib/workspaces.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';

const CYR = /[А-Яа-я]/;
const NEW_FOODS = ['vineleaves', 'cornmeal', 'dock', 'semolina', 'wheat', 'chestnuts', 'mullet', 'turbot', 'bluefish', 'porkleg', 'noodles', 'vermicelli'];
const fresh = RECIPES.filter(r => r.bg);
const byName = new Map(RECIPES.map(r => [r.name, r]));
const marks = (t) => [...t.matchAll(/\{([a-z0-9,]+)\}/g)].map(m => m[1]);
const base = { sex: 'f', age: 52, weight: 78, height: 164, activity: 'light', asOf: '2026-11-11', goal: 'lose', days: 7, mealsPerDay: 5 };
const plan = (extra = {}) => nutritionPlan({ ...base, ...extra });
const options = (p) => (p.week ? p.week.flatMap(d => d.meals.map(m => m.option)) : p.meals.flatMap(m => m.options)).filter(o => o && !o.fixed);
const bulgarianShare = (p) => { const all = options(p); return all.filter(o => isBulgarian(byName.get(o.key) || {})).length / all.length; };
const dayKcal = (d) => d.meals.reduce((a, m) => a + m.option.kcal, 0);
const dayProtein = (d) => d.meals.reduce((a, m) => a + m.option.protein, 0);

/* ------------------------------------ храни ------------------------------------ */

test('4.19: 12 нови храни по USDA — с FDC ID, витамини и минерали, английско име и употреба', () => {
  assert.equal(Object.keys(FOODS).length, 245);
  for (const id of NEW_FOODS) {
    const f = FOODS[id];
    assert.ok(f && f.kcal > 0 && f.name, id);
    assert.ok(Number.isInteger(f.fdc) && f.fdc > 160000 && f.fdc < 180000, `${id}: FDC ID`);
    assert.equal(MICRO[id][0], f.fdc);
    assert.ok(EN_FOODS[id] && !CYR.test(EN_FOODS[id].join(' ')), `${id}: английско име`);
    assert.ok(f.fe > 0 && f.ca > 0, `${id}: желязо и калций`);
    assert.ok(fresh.some(r => r.items.some(([food]) => food === id)), `${id} се използва в нова рецепта`);
    assert.ok(servingOf(id) > 0);
  }
  // Стойности, които се проверяват с таблиците на USDA (SR Legacy).
  assert.deepEqual([FOODS.cornmeal.kcal, FOODS.cornmeal.fdc], [362, 169697]);
  assert.deepEqual([FOODS.porkleg.kcal, FOODS.porkleg.p, FOODS.porkleg.fdc], [211, 29.4, 168225]);
  assert.ok(FOODS.bluefish.n3 > 900 && FOODS.bluefish.b12 > 5, 'лефер: омега-3 и B12');
  assert.ok(FOODS.mullet.n3 > 300 && FOODS.mullet.vd > 1, 'кефал: омега-3 и витамин D от суровия запис');
  assert.ok(FOODS.vineleaves.ca > 300 && FOODS.vineleaves.na < 20, 'лозови листа: пресни, не от саламура');
  assert.ok(FOODS.chestnuts.vc > 20 && FOODS.chestnuts.f < 3);
  // Флагове: глутен, риба, свинско, ядки; високият гликемичен индекс на качамака.
  for (const id of ['semolina', 'wheat', 'noodles', 'vermicelli']) assert.ok(FOODS[id].flags.has('gluten'), id);
  for (const id of ['mullet', 'turbot', 'bluefish']) assert.ok(FOODS[id].flags.has('fish') && FOODS[id].cat === 'protein', id);
  assert.ok(FOODS.porkleg.flags.has('pork') && FOODS.porkleg.flags.has('redmeat'));
  assert.ok(FOODS.noodles.flags.has('egg') && FOODS.chestnuts.flags.has('nuts') && FOODS.cornmeal.flags.has('highgi'));
  assert.ok(!FOODS.cornmeal.flags.has('gluten') && !FOODS.vineleaves.flags.has('salt'));
  // Сурово и сухо тегло: риба 78%, свинско бутче 64% от суровото, юфка и фиде — по сухото.
  assert.deepEqual(rawOf('mullet', 150), { grams: 190, kind: 'raw' });
  assert.deepEqual(rawOf('porkleg', 90), { grams: 140, kind: 'raw' });
  assert.equal(rawOf('vermicelli', 110).kind, 'dry');
  assert.equal(YIELDS.noodles.dry, 2.78);
  // Двигателят знае кои от новите са белтъчни и кои нишестени — иначе порциите им не се нагласяват.
  for (const id of Object.keys(FOODS)) if (['protein', 'legume'].includes(FOODS[id].cat)) assert.ok(PROTEIN_FOODS.has(id), `${id} липсва в PROTEIN_FOODS`);
  for (const id of ['cornmeal', 'semolina', 'wheat', 'noodles', 'vermicelli', 'chestnuts']) assert.ok(STARCH.has(id), `${id} липсва в STARCH`);
  // До 4 г. — без цели кестени.
  assert.ok(childFoodRules(3).exclude.has('chestnuts') && !childFoodRules(5).exclude.has('chestnuts'));
});

/* ----------------------------------- рецепти ----------------------------------- */

test('4.19: 400 рецепти, от тях 75 нови български — с приготвяне по грамовете и превод със същите маркери', () => {
  assert.equal(RECIPES.length, 400);
  assert.equal(fresh.length, 75);
  assert.equal(new Set(RECIPES.map(r => r.name)).size, 400, 'имената не се повтарят');
  const meals = { breakfast: 0, snack: 0, lunch: 0, dinner: 0 };
  for (const r of fresh) {
    for (const m of mealsOf(r)) meals[m]++;
    assert.equal(r.source, null, `${r.name}: без чужд източник`);
    const foods = new Set(r.items.map(([f]) => f));
    for (const [food, grams] of r.items) assert.ok(FOODS[food] && grams > 0, `${r.name}: ${food}`);
    // Всяка съставка е в приготвянето точно веднъж, всеки маркер сочи съставка.
    const used = marks(r.method).flatMap(m => m.split(','));
    assert.deepEqual([...used].sort(), [...foods].sort(), r.name);
    // Превод: име и приготвяне без кирилица, със същите маркери; подправките — с превод.
    const en = EN_RECIPES[r.name];
    assert.ok(en && en[0] && en[1], `${r.name}: превод`);
    assert.ok(!CYR.test(en[0] + en[1]), `${r.name}: кирилица в превода`);
    assert.deepEqual(marks(en[1]).sort(), marks(r.method).sort(), `${r.name}: маркери в превода`);
    for (const f of r.flavor) assert.ok(EN_FLAVOR[f], `${r.name}: подправка „${f}“`);
    // Порцията: основно хранене 380–560 kcal, междинно 150–260; без добавена захар освен меда в едно ястие.
    const t = totals(r.items.map(([food, g]) => ({ food, grams: g })));
    const snack = mealsOf(r).every(m => m === 'snack');
    if (snack) assert.ok(t.kcal >= 150 && t.kcal <= 260, `${r.name}: ${Math.round(t.kcal)} kcal`);
    else assert.ok(t.kcal >= 330 && t.kcal <= 560, `${r.name}: ${Math.round(t.kcal)} kcal`);
    assert.ok(!foods.has('sugar') && !foods.has('jam'), `${r.name}: без захар`);
    assert.ok(r.time >= 2 && r.time <= 150);
  }
  assert.deepEqual(meals, { breakfast: 13, snack: 12, lunch: 44, dinner: 53 });
  assert.equal(fresh.filter(r => r.items.some(([f]) => f === 'honey')).length, 1);
  // Сиренето е до 35 г на порция — така ястието остава и при режим с малко сол; „Сирене по шопски“ е изключението.
  const cheesy = fresh.filter(r => r.items.some(([f, g]) => f === 'whitecheese' && g > 35)).map(r => r.name);
  assert.deepEqual(cheesy, ['Сирене по шопски']);
  // Месото и рибата са с гарнитура: белтъкът е под 32% от енергията, за да не расте с порцията.
  for (const r of fresh.filter(x => mealsOf(x).some(m => m === 'lunch' || m === 'dinner'))) {
    const t = totals(r.items.map(([food, g]) => ({ food, grams: g })));
    assert.ok((t.protein * 4) / t.kcal < 0.32, `${r.name}: белтък ${Math.round(t.protein * 400 / t.kcal)}% от енергията`);
  }
  // Има риба, бобови и постни ястия; новите храни са в тях.
  assert.ok(fresh.filter(r => recipeTags(r).has('fish')).length >= 7);
  assert.ok(fresh.filter(r => recipeTags(r).has('vegan')).length >= 8);
  assert.ok(fresh.filter(r => recipeTags(r).has('vegetarian')).length >= 45);
});

test('4.19: списъкът с български ястия — 175, всяко име е на съществуваща рецепта', () => {
  assert.deepEqual(unknownBulgarian(), []);
  assert.equal(RECIPES.filter(isBulgarian).length, 175);
  assert.ok(isBulgarian(byName.get('Боб чорба по манастирски')) && isBulgarian(byName.get('Таратор и хляб с яйце')));
  assert.ok(isBulgarian(byName.get('Пататник')) && isBulgarian(byName.get('Лозови сарми с кайма и ориз')));
  assert.ok(!isBulgarian(byName.get('Тофу „бъркани яйца“ с чушки и спанак')) && !isBulgarian(byName.get('Черен боб с ориз, авокадо и царевица')));
  // Рецептите на NHLBI не са български.
  assert.ok(RECIPES.filter(r => r.source).every(r => !isBulgarian(r)));
  // За всяко хранене има достатъчно за месец без еднообразие.
  const count = (meal) => RECIPES.filter(r => isBulgarian(r) && mealsOf(r).includes(meal)).length;
  assert.ok(count('breakfast') >= 20 && count('snack') >= 30 && count('lunch') >= 70 && count('dinner') >= 70);
});

/* ------------------------------- българска кухня ------------------------------- */

test('4.19: „българска кухня“ — менюто е само от български ястия и пази целите', () => {
  const p = plan({ bulgarian: true });
  assert.equal(p.input.bulgarian, true);
  assert.equal(bulgarianShare(p), 1);
  assert.ok(options(p).filter(o => byName.get(o.key)?.bg).length >= 4, 'новите ястия влизат в менюто');
  assert.ok(options(plan({ bulgarian: true, days: 28 })).filter(o => byName.get(o.key)?.bg).length >= 35, 'за месец — поне 35 от новите');
  assert.ok(!p.clinician.some(c => /българските ястия не стигат/.test(c)));
  for (const d of p.week) {
    assert.ok(Math.abs(dayKcal(d) - d.kcal) / d.kcal < 0.08, `ден ${d.day}: ${Math.round(dayKcal(d))} при цел ${d.kcal}`);
    assert.ok(dayProtein(d) >= p.targets.protein * 0.8 && dayProtein(d) <= p.targets.proteinMax * 1.12, `ден ${d.day}: белтък ${Math.round(dayProtein(d))}`);
  }
  // Седмичният ритъм остава: риба поне 2 пъти, бобови поне 2 пъти, червено месо до 2 пъти; без повторение на обяд и вечеря.
  const mains = p.week.flatMap(d => d.meals.filter(m => m.meal === 'lunch' || m.meal === 'dinner').map(m => m.option.key));
  const tagged = (tag) => mains.filter(k => recipeTags(byName.get(k)).has(tag)).length;
  assert.ok(tagged('fish') >= 2 && tagged('legume') >= 2 && tagged('redmeat') <= 2, `риба ${tagged('fish')}, бобови ${tagged('legume')}, червено месо ${tagged('redmeat')}`);
  assert.equal(new Set(mains).size, mains.length);
  // Без отметката менюто е както досега и не е само българско.
  const usual = plan();
  assert.equal(usual.input.bulgarian, false);
  assert.ok(bulgarianShare(usual) < 0.6);
  // И при заболявания, и при ограничения менюто остава българско.
  for (const extra of [{ diagnoses: [{ code: 'I10' }, { code: 'E11.9' }] }, { preferences: ['vegetarian'] }, { preferences: ['glutenFree', 'lactoseFree'] },
    { preferences: ['noFish', 'noPork'] }, { diagnoses: [{ code: 'M10.0' }, { code: 'E78.0' }] }, { mealsPerDay: 3, days: 28 }, { goal: 'gain', weight: 50 }]) {
    const q = plan({ bulgarian: true, ...extra });
    assert.equal(bulgarianShare(q), 1, JSON.stringify(extra));
    for (const d of q.week) assert.ok(Math.abs(dayKcal(d) - d.kcal) / d.kcal < 0.1, `${JSON.stringify(extra)} ден ${d.day}`);
  }
  // Еднодневното меню с по два варианта също.
  const day = plan({ bulgarian: true, days: 1 });
  assert.equal(bulgarianShare(day), 1);
  // „Само рецепти с източник“ не важи заедно с „българска кухня“ — рецептите с източник са на NHLBI.
  const both = plan({ bulgarian: true, sourcedOnly: true });
  assert.equal(both.input.sourcedOnly, false);
  assert.equal(bulgarianShare(both), 1);
  assert.ok(plan({ sourcedOnly: true }).input.sourcedOnly);
});

test('4.19: седмичният ритъм на българската кухня — във всяка седмица на месеца', () => {
  const cases = [{}, { mealsPerDay: 3 }, { sex: 'm', weight: 85, height: 178, goal: 'maintain' }, { diagnoses: [{ code: 'I10' }, { code: 'E11.9' }] },
    { pattern: 'balanced' }, { age: 70 }, { batch: true, mealsPerDay: 3 }];
  const seen = new Set();
  for (const extra of cases) for (const variant of [0, 1, 2]) {
    const p = plan({ bulgarian: true, days: 28, variant, ...extra });
    for (let w = 0; w < 4; w++) {
      const mains = p.week.slice(w * 7, w * 7 + 7).flatMap(d => d.meals.filter(m => m.meal === 'lunch' || m.meal === 'dinner').map(m => byName.get(m.option.key)));
      for (const r of mains) seen.add(r.name);
      const n = (tag) => mains.filter(r => recipeTags(r).has(tag)).length;
      const where = `${JSON.stringify(extra)} вариант ${variant}, седмица ${w + 1}`;
      // Риба 2–4 пъти (а не всеки ден), бобови поне 3 пъти, червено месо до 2 пъти.
      assert.ok(n('fish') >= 2 && n('fish') <= (extra.batch ? 6 : 4), `${where}: риба ${n('fish')}`);
      assert.ok(n('legume') >= 3, `${where}: бобови ${n('legume')}`);
      assert.ok(n('redmeat') <= 2, `${where}: червено месо ${n('redmeat')}`);
    }
    // За месеца има и ястия с червено месо — мусака, кюфтета, сарми — и поне 6 с птиче.
    const all = p.week.flatMap(d => d.meals.filter(m => m.meal === 'lunch' || m.meal === 'dinner').map(m => byName.get(m.option.key)));
    assert.ok(all.filter(r => recipeTags(r).has('redmeat')).length >= 2, JSON.stringify(extra));
  }
  // Класическите ястия с месо влизат в менютата (преди ритъма подборът взимаше риба почти всеки ден).
  const classics = ['Мусака с патладжан и телешка кайма', 'Кюфтета по чирпански', 'Лозови сарми с кайма и ориз', 'Свинско с праз', 'Свинска кавърма с гъби и чушки'];
  assert.ok(classics.filter(n => seen.has(n)).length >= 4, classics.filter(n => !seen.has(n)).join(', '));
  // Обикновеното меню не се променя от ритъма: то няма горна граница за рибата.
  const usual = plan({ days: 28 });
  assert.equal(usual.input.bulgarian, false);
});

test('4.19: големите порции не вдигат белтъка — новите риби и свинското се нагласяват като другите', () => {
  // Преди поправката кефалът и леферът растяха с порцията: 220 г риба и 140 г белтък за деня при граница 110.
  const athlete = nutritionPlan({ sex: 'm', age: 25, weight: 55, height: 153, activity: 'moderate', goal: 'gain', mealsPerDay: 5, days: 28,
    diagnoses: [{ code: 'K59.0' }], variant: 2, asOf: '2026-11-10', bulgarian: true });
  const over = athlete.week.filter(d => dayProtein(d) > athlete.targets.proteinMax * 1.12);
  assert.equal(over.length, 0, over.map(d => `${d.day}: ${Math.round(dayProtein(d))}`).join(', '));
  for (const o of options(athlete)) for (const it of o.items) {
    if (['mullet', 'turbot', 'bluefish', 'porkleg'].includes(it.food)) assert.ok(it.grams <= 200, `${o.name}: ${it.food} ${it.grams} г`);
  }
});

test('4.19: копривата е до 150 г на порция — ястията с нея не вдигат калция над горната граница', () => {
  // Копривата е с 481 мг калций на 100 г. Преди ограничението голямата порция копривена каша беше с 400 г
  // коприва и над 2000 мг калций, а денят стигаше 4200 мг при горна граница 2500 мг (EFSA).
  const nettle = RECIPES.filter(r => r.items.some(([food]) => food === 'nettle'));
  assert.ok(nettle.length >= 2 && nettle.some(r => r.bg), 'има ястия с коприва, едното е ново');
  for (const r of nettle) assert.ok(r.items.find(([food]) => food === 'nettle')[1] <= 150, r.name);
  let seen = 0;
  for (const variant of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    const big = nutritionPlan({ sex: 'm', age: 30, weight: 105, height: 192, activity: 'active', goal: 'gain', mealsPerDay: 3, days: 28, variant, asOf: '2026-11-10', bulgarian: true });
    for (const o of options(big)) {
      const it = o.items.find(x => x.food === 'nettle');
      if (!it) continue;
      seen++;
      assert.ok(it.grams <= 150, `${o.name}: коприва ${it.grams} г`);
      assert.ok(o.ca < 1500, `${o.name}: калций ${Math.round(o.ca)} мг в едно ястие`);
    }
  }
  assert.ok(seen > 0, 'ястията с коприва влизат в менюто');
});

test('4.19: когато българските ястия не стигат, менюто се допълва и лекарят го вижда', () => {
  // Веган без глутен, соя и ядки: за закуска и междинно българските са малко.
  const strict = plan({ bulgarian: true, preferences: ['vegan', 'glutenFree', 'noSoy', 'noNuts'], days: 28 });
  assert.ok(options(strict).length > 0 && strict.week.every(d => d.meals.every(m => m.option)));
  const share = bulgarianShare(strict);
  const note = strict.clinician.some(c => /^При тези ограничения българските ястия не стигат за всички хранения/.test(c));
  assert.equal(note, share < 1, `дял ${share}`);
  assert.ok(share >= 0.5, `българските са отпред: ${share}`);
  // Бележката е само за лекаря и има превод.
  assert.ok(![...strict.notes, ...strict.warnings].some(t => /българските ястия/.test(t)));
  if (note) assert.ok(translatePlan(strict).clinician.some(c => /^With these restrictions there are not enough Bulgarian dishes/.test(c)));
});

test('4.19: сиренето в българските ястия не става тофу; останалите замени важат', () => {
  // Без млечни: баницата и „Сирене по шопски“ отпадат, вместо да станат „с тофу“.
  for (const preferences of [['noDairy'], ['vegan']]) {
    for (const variant of [0, 1, 2]) {
      const p = plan({ bulgarian: true, preferences, days: 28, variant });
      for (const o of options(p)) {
        assert.ok(!/^(Баница|Зелник|Качамак|Яйца по панагюрски|Принцеса|Юфка|Сирене по шопски|Катък|Айрян|Пататник)/.test(o.name), `${preferences}: ${o.name}`);
        assert.ok(!/тофу по шопски/i.test(o.name));
      }
    }
  }
  // Без лактоза и без глутен: името следва замяната и на двата езика.
  const names = new Map();
  for (const variant of [0, 1, 2, 3]) {
    const p = plan({ bulgarian: true, preferences: ['glutenFree'], days: 28, variant });
    const en = translatePlan(p);
    p.week.forEach((d, i) => d.meals.forEach((m, j) => names.set(m.option.key, [m.option.name, en.week[i].meals[j].option.name])));
  }
  if (names.has('Булгур с чушки, домати и сирене')) assert.deepEqual(names.get('Булгур с чушки, домати и сирене'), ['Елда с чушки, домати и сирене', 'Buckwheat with peppers, tomatoes and white cheese']);
  if (names.has('Кьопоолу с ръжен хляб')) assert.equal(names.get('Кьопоолу с ръжен хляб')[0], 'Кьопоолу с безглутенов хляб');
  assert.ok([...names.values()].every(([bg]) => !/^Булгур/.test(bg)), 'при „без глутен“ няма ястие с име „Булгур…“');
  // До 2 г. млякото и киселото мляко са пълномаслени и в новите ястия.
  const toddler = nutritionPlan({ sex: 'f', age: 20 / 12, ageMonths: 20, weight: 11, height: 84, days: 28, asOf: '2026-11-11', bulgarian: true });
  const foods = new Set(options(toddler).flatMap(o => o.items.map(it => it.food)));
  assert.ok(!foods.has('milk') && !foods.has('yogurt') && !foods.has('chestnuts') && !foods.has('walnuts') && !foods.has('honey'));
  assert.equal(bulgarianShare(toddler), 1);
});

test('4.19: българската кухня на английски, с „готвене веднъж на ден“ и в PDF', async () => {
  const p = plan({ bulgarian: true, batch: true, mealsPerDay: 3 });
  assert.equal(bulgarianShare(p), 1);
  const left = p.week.flatMap(d => d.meals).filter(m => m.batch === 'left');
  assert.ok(left.length >= 4, `обяди от снощи: ${left.length}`);
  // Риба на скара, яйца по панагюрски и салати не се оставят за другия ден.
  assert.equal(keepsWell({ name: 'Кефал на скара с печени зеленчуци', time: 35 }), false);
  assert.equal(keepsWell({ name: 'Яйца по панагюрски', time: 25 }), false);
  assert.equal(keepsWell({ name: 'Свинско с праз', time: 60 }), true);
  assert.equal(keepsWell({ name: 'Боб на фурна с чушки и джоджен', time: 60 }), true);
  const en = translatePlan(plan({ bulgarian: true, days: 28 }));
  for (const o of options(en)) {
    assert.ok(!CYR.test(o.name) && !CYR.test(o.method), o.name);
    assert.ok(o.items.every(it => !CYR.test(it.text)) && (o.flavor || []).every(f => !CYR.test(f)), o.name);
  }
  assert.ok(options(en).some(o => /^(Banitsa|Kachamak|Tarator|Patatnik|Kyopoolu|Zelnik|Sutlyash)/.test(o.name)));
  // Отчетът се изготвя на двата езика.
  const read = (f) => new Uint8Array(fs.readFileSync(new URL(`../public/fonts/${f}`, import.meta.url)));
  const args = { person: { name: 'И. П.', age: 52, sex: 'f' }, practice: { name: 'Практика' }, doctor: { name: 'д-р Тест' }, version: '4.19.0', date: '2026-11-11',
    fonts: { regular: read('NotoSans-Regular.ttf'), semibold: read('NotoSans-SemiBold.ttf'), bold: read('NotoSans-Bold.ttf'), symbols: read('DejaVuSans-Symbols.ttf') } };
  assert.ok((await nutritionReport({ ...args, plan: p })).length > 50000);
  assert.ok((await nutritionReport({ ...args, plan: translatePlan(p) })).length > 50000);
});

/* ------------------------------------ API ------------------------------------ */

test('4.19 API: „българска кухня“ за пациент, за дете и за човек извън листата', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-419-'));
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
  const ok = async (r) => { const x = await r; assert.ok(x.status < 300, JSON.stringify(x.data)); return x.data; };
  try {
    await call('POST', '/api/setup', { workspace: 'gp', practiceName: 'П', doctorName: 'д-р Т' });
    const adult = (await ok(call('POST', '/api/patients', { name: 'Иван Петров', sex: 'm', birthDate: '1962-05-05' }))).patient.id;
    const on = (await ok(call('POST', `/api/patients/${adult}/nutrition`, { weight: 92, height: 178, days: 7, bulgarian: true, diagnoses: [{ code: 'I10' }] }))).plan;
    assert.equal(on.input.bulgarian, true);
    assert.equal(bulgarianShare(on), 1);
    const off = (await ok(call('POST', `/api/patients/${adult}/nutrition`, { weight: 92, height: 178, days: 7 }))).plan;
    assert.equal(off.input.bulgarian, false);
    // Само true включва избора — низ или число не.
    assert.equal((await ok(call('POST', `/api/patients/${adult}/nutrition`, { weight: 92, height: 178, days: 7, bulgarian: 'yes' }))).plan.input.bulgarian, false);
    // На английски: ястията са български, имената — на английски.
    const en = (await ok(call('POST', `/api/patients/${adult}/nutrition`, { weight: 92, height: 178, days: 7, bulgarian: true, lang: 'en' }))).plan;
    assert.ok(options(en).every(o => !CYR.test(o.name)) && bulgarianShare(en) === 1);
    // Дете на 6 години.
    const kid = (await ok(call('POST', '/api/patients', { name: 'Мария Петрова', sex: 'f', birthDate: '2020-06-01' }))).patient.id;
    const kp = (await ok(call('POST', `/api/patients/${kid}/nutrition`, { weight: 21, height: 117, days: 7, bulgarian: true }))).plan;
    assert.ok(kp.child && kp.input.bulgarian === true);
    assert.equal(bulgarianShare(kp), 1);
    // Човек извън листата.
    const person = { name: 'Г. К.', sex: 'f', age: 47, weight: 70, height: 165 };
    const out = (await ok(call('POST', '/api/nutrition/plan', { person, days: 7, bulgarian: true, save: true }))).plan;
    assert.equal(bulgarianShare(out), 1);
  } finally {
    await new Promise(r => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
