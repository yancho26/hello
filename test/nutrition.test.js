/* Версия 4.3: хранителен режим — цел и темпо, целево тегло, хранителни
 * модели, брой хранения, ограничения и алергии, рецепти, седмично меню и
 * списък за пазаруване. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FOODS, RECIPES, recipeTags } from '../public/js/shared/recipes.js';
import { MEAL_PLANS, PACES, allergyPreferences, mifflinStJeor, nutritionPlan } from '../public/js/shared/nutrition.js';
import { Store } from '../lib/store.js';
import { Workspaces } from '../lib/workspaces.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import { addDays, addMonths, today } from '../public/js/shared/dates.js';

const base = { sex: 'm', age: 50, weight: 95, height: 178, activity: 'light', asOf: '2026-10-01' };
const allOptions = (plan) => [
  ...plan.meals.flatMap(m => m.options),
  ...(plan.week || []).flatMap(d => d.meals.map(m => m.option)),
].filter(Boolean);
const foodsIn = (plan) => allOptions(plan).flatMap(o => o.items.map(it => it.food));
const hasFlag = (plan, flag) => foodsIn(plan).some(f => FOODS[f].flags.has(flag));

/* -------------------------------- каталог -------------------------------- */

test('рецепти: всяка има съставки от каталога, приготвяне, подправки и време', () => {
  assert.ok(RECIPES.length >= 120, `рецепти: ${RECIPES.length}`);
  const names = new Set();
  for (const r of RECIPES) {
    assert.ok(!names.has(r.name), `повтаря се „${r.name}“`);
    names.add(r.name);
    for (const [food, g] of r.items) {
      assert.ok(FOODS[food], `${r.name}: няма храна ${food}`);
      assert.ok(g > 0 && g <= 400, `${r.name}: ${food} ${g} г`);
    }
    assert.ok(r.method.length >= 20, `${r.name}: приготвяне`);
    assert.ok(Array.isArray(r.flavor), r.name);
    assert.ok(r.time > 0 && r.time <= 120, r.name);
  }
  const count = (meal) => RECIPES.filter(r => r.meal === meal).length;
  for (const meal of ['breakfast', 'snack', 'lunch', 'dinner']) assert.ok(count(meal) >= 18, `${meal}: ${count(meal)}`);
  const vegan = RECIPES.filter(r => ['lunch', 'dinner'].includes(r.meal) && recipeTags(r).has('vegan'));
  assert.ok(vegan.length >= 7, `веганските основни ястия са ${vegan.length}`);
  for (const f of Object.values(FOODS)) assert.ok(f.kcal >= 0 && f.p >= 0 && f.c >= 0 && f.f >= 0 && f.cat, f.name);
});

/* ------------------------------ цел и темпо ------------------------------ */

test('цел и темпо: дефицит 300/500/750, покачване, прагове за безопасност', () => {
  const bmr = mifflinStJeor(base);
  const tdee = bmr * 1.375;
  const lose = (pace) => nutritionPlan({ ...base, goal: 'lose', pace, weight: 110 });
  assert.ok(Math.abs(lose('slow').targets.kcal - lose('standard').targets.kcal - 200) <= 60);
  assert.ok(lose('fast').targets.kcal < lose('standard').targets.kcal, 'ИТМ 34,7 — по-бързо е разрешено');
  const fastLowBmi = nutritionPlan({ ...base, goal: 'lose', pace: 'fast', weight: 85 });
  assert.equal(fastLowBmi.input.pace, 'standard', 'при ИТМ под 30 — умерено');
  assert.ok(fastLowBmi.warnings.some(w => /умерено/.test(w)));
  const keep = nutritionPlan({ ...base, goal: 'maintain' });
  assert.ok(Math.abs(keep.targets.kcal - tdee) <= 30, `поддържане ≈ разхода: ${keep.targets.kcal} / ${Math.round(tdee)}`);
  assert.equal(keep.projection.weeklyKg, 0);
  const gain = nutritionPlan({ ...base, goal: 'gain', weight: 56, pace: 'fast' });
  assert.equal(gain.input.pace, 'fast', 'поднормено тегло — по-бързо е разрешено');
  assert.ok(gain.projection.weeklyKg > 0.5);
  assert.equal(nutritionPlan({ ...base, goal: 'gain', pace: 'fast', weight: 70 }).input.pace, 'standard');
  // Жена с малък разход — не под 1200 kcal.
  const small = nutritionPlan({ sex: 'f', age: 60, weight: 68, height: 152, activity: 'sedentary', goal: 'lose', pace: 'fast' });
  assert.ok(small.targets.kcal >= 1200);
  // При ИТМ под 22 отслабване не се предлага.
  assert.equal(nutritionPlan({ ...base, weight: 65, goal: 'lose' }).input.goal, 'maintain');
  assert.equal(PACES.standard.lose, -500);
});

test('целево тегло: срок и дата; обратна посока — предупреждение', () => {
  const p = nutritionPlan({ ...base, goal: 'lose', targetWeight: 88 });
  assert.equal(p.projection.targetWeight, 88);
  assert.ok(p.projection.weeks >= 12 && p.projection.weeks <= 20, `седмици: ${p.projection.weeks}`);
  assert.equal(p.projection.eta, addDays('2026-10-01', p.projection.weeks * 7));
  assert.deepEqual(p.projection.suggestions, [90, 86]);
  const wrong = nutritionPlan({ ...base, goal: 'lose', targetWeight: 100 });
  assert.equal(wrong.projection.targetWeight, null);
  assert.ok(wrong.warnings.some(w => /не съответства/.test(w)));
  const far = nutritionPlan({ ...base, goal: 'lose', targetWeight: 75 });
  assert.match(far.projection.note, /междинна цел/);
});

test('белтък: по-висок при отслабване, покачване, тренировки и възраст; 0,8 г/кг при ХБЗ', () => {
  assert.equal(nutritionPlan({ ...base, goal: 'maintain' }).targets.proteinPerKg, 0.9);
  assert.equal(nutritionPlan({ ...base, goal: 'lose' }).targets.proteinPerKg, 1.1);
  assert.equal(nutritionPlan({ ...base, goal: 'gain', weight: 58 }).targets.proteinPerKg, 1.2);
  assert.equal(nutritionPlan({ ...base, goal: 'lose', strength: true }).targets.proteinPerKg, 1.6);
  assert.equal(nutritionPlan({ ...base, age: 70, goal: 'maintain' }).targets.proteinPerKg, 1.1);
  assert.equal(nutritionPlan({ ...base, goal: 'lose', strength: true, conditions: new Set(['ckd']), egfr: 40 }).targets.proteinPerKg, 0.8);
  // Възрастни хора: поне 27 kcal/кг.
  const old = nutritionPlan({ sex: 'f', age: 80, weight: 52, height: 160, activity: 'sedentary', goal: 'maintain' });
  assert.ok(old.targets.kcal >= 1400);
});

/* ----------------------------- модели и хранения ----------------------------- */

test('хранителни модели и брой хранения', () => {
  const low = nutritionPlan({ ...base, pattern: 'lowcarb', goal: 'lose', conditions: new Set(['dm2']) });
  assert.ok(low.targets.carbPct >= 30 && low.targets.carbPct <= 36, `въглехидрати ${low.targets.carbPct}%`);
  assert.equal(low.pattern.id, 'lowcarb');
  const dash = nutritionPlan({ ...base, conditions: new Set(['htn']) });
  assert.equal(dash.pattern.id, 'dash', 'при хипертония по подразбиране DASH');
  const sglt = nutritionPlan({ ...base, pattern: 'lowcarb', goal: 'lose', sex: 'f', weight: 80, height: 160, classes: new Set(['SGLT2']) });
  assert.ok(sglt.targets.carbs < 130 ? sglt.warnings.some(w => /кетоацидоза/.test(w)) : true);
  for (const n of [3, 4, 5]) {
    const plan = nutritionPlan({ ...base, mealsPerDay: n });
    assert.equal(plan.meals.length, n);
    assert.ok(Math.abs(MEAL_PLANS[n].reduce((s, m) => s + m.share, 0) - 1) < 1e-9);
    assert.ok(Math.abs(plan.day.kcal - plan.targets.kcal) / plan.targets.kcal < 0.1, `${n} хранения: ${plan.day.kcal} / ${plan.targets.kcal}`);
  }
  const quick = nutritionPlan({ ...base, quick: true, days: 7 });
  assert.ok(allOptions(quick).every(o => o.time <= 20), 'бързите рецепти са до 20 минути');
  assert.ok(allOptions(quick).every(o => o.method && o.flavor), 'рецептите носят приготвянето и подправките');
});

/* ------------------------------ ограничения ------------------------------ */

test('ограничения и алергии се спазват в целия план', () => {
  const check = (prefs, bad, extra = {}) => {
    const plan = nutritionPlan({ ...base, preferences: prefs, days: 7, ...extra });
    for (const flag of bad) assert.ok(!hasFlag(plan, flag), `${prefs.join(',') || 'алергии'}: има ${flag}`);
    for (const m of plan.meals) assert.ok(m.options.length >= 1, `${prefs}: няма ястие за ${m.label}`);
    return plan;
  };
  check(['vegetarian'], ['meat', 'fish', 'seafood']);
  const vegan = check(['vegan'], ['meat', 'fish', 'seafood', 'egg', 'dairy', 'honey']);
  assert.ok(vegan.notes.some(n => /B12/.test(n)));
  check(['noNuts'], ['nuts']);
  check(['glutenFree'], ['gluten']);
  check(['lactoseFree'], ['lactose']);
  check(['noPork', 'noRedMeat'], ['pork', 'redmeat']);
  check(['noEgg', 'noSoy'], ['egg', 'soy']);
  check(['noDairy'], ['dairy']);
  // От алергиите в досието.
  assert.deepEqual(allergyPreferences(['Орехи', 'риба', 'пеницилин']).prefs.sort(), ['noFish', 'noNuts']);
  const allergic = check([], ['nuts', 'fish', 'seafood'], { allergies: ['лешници', 'морски дарове'] });
  assert.ok(allergic.notes.some(n => /алергиите в досието/.test(n)));
  // Заболявания.
  const dm = nutritionPlan({ ...base, conditions: new Set(['dm2']), days: 7 });
  assert.ok(!hasFlag(dm, 'sweet'), 'при диабет — без сладки храни');
  const gout = nutritionPlan({ ...base, conditions: new Set(['gout']), days: 7 });
  assert.ok(!hasFlag(gout, 'purine'));
  const ckd = nutritionPlan({ ...base, conditions: new Set(['ckd']), egfr: 35, potassium: 5.6, days: 7 });
  assert.ok(!allOptions(ckd).some(o => o.items.some(it => FOODS[it.food].flags.has('highK') && it.grams >= 80)), 'висок калий');
  for (const d of ckd.week) assert.ok(d.totals.protein <= ckd.targets.proteinMax * 1.05, `ХБЗ, ${d.label}: белтък ${d.totals.protein} / ${ckd.targets.proteinMax}`);
});

/* --------------------------------- седмица --------------------------------- */

test('седмично меню: без повторения, ритъм на рибата, бобовите и месото, пазаруване', () => {
  const plan = nutritionPlan({ ...base, goal: 'lose', days: 7 });
  assert.equal(plan.week.length, 7);
  assert.equal(plan.week[0].label, 'Понеделник');
  const mains = plan.week.flatMap(d => d.meals.filter(m => ['lunch', 'dinner'].includes(m.meal)).map(m => m.option.name));
  assert.equal(new Set(mains).size, mains.length, 'обядите и вечерите не се повтарят');
  const byName = new Map(RECIPES.map(r => [r.name, recipeTags(r)]));
  const mainTags = mains.map(n => byName.get(n));
  assert.ok(mainTags.filter(t => t.has('fish')).length >= 2, 'риба поне 2 пъти');
  assert.ok(mainTags.filter(t => t.has('legume')).length >= 3, 'бобови поне 3 пъти');
  assert.ok(mainTags.filter(t => t.has('redmeat')).length <= 2, 'червено месо до 2 пъти');
  for (const d of plan.week) {
    assert.ok(Math.abs(d.totals.kcal - plan.targets.kcal) / plan.targets.kcal < 0.08, `${d.label}: ${d.totals.kcal} / ${plan.targets.kcal}`);
  }
  // Пазаруването събира всичко от седмицата.
  const oilWeek = plan.week.flatMap(d => d.meals.flatMap(m => m.option.items)).filter(it => it.food === 'oil').reduce((s, it) => s + it.grams, 0);
  const fat = plan.shopping.groups.find(g => g.cat === 'fat');
  assert.equal(fat.items.find(it => it.food === 'oil').grams, oilWeek);
  assert.ok(plan.shopping.spices.length >= 5);
  assert.ok(plan.shopping.groups.every(g => g.items.every(it => /\d/.test(it.amount))));
  // Друг вариант — друго меню.
  const other = nutritionPlan({ ...base, goal: 'lose', days: 7, variant: 3 });
  const otherMains = other.week.flatMap(d => d.meals.filter(m => m.meal === 'lunch').map(m => m.option.name));
  assert.notDeepEqual(otherMains, plan.week.flatMap(d => d.meals.filter(m => m.meal === 'lunch').map(m => m.option.name)));
  // Порциите по групи и съветите.
  assert.ok(plan.portions.length >= 6);
  assert.ok(plan.habits.length >= 3 && plan.flavor.length >= 4 && plan.monitoring.length >= 2);
});

/* ------------------------------ реалистично меню ------------------------------ */

test('меню: реалистични порции, енергия и белтък в целите при много комбинации', () => {
  const people = [
    { sex: 'f', age: 34, weight: 92, height: 165, activity: 'light' },
    { sex: 'm', age: 25, weight: 58, height: 182, activity: 'active', strength: true },
    { sex: 'f', age: 80, weight: 48, height: 152, activity: 'sedentary' },
    { sex: 'm', age: 45, weight: 130, height: 185, activity: 'moderate', conditions: new Set(['dm2']) },
  ];
  const prefsets = [[], ['vegan'], ['vegetarian', 'glutenFree'], ['noNuts', 'noEgg', 'noDairy', 'noSoy']];
  let days = 0;
  let energyMiss = 0;
  let proteinMiss = 0;
  for (const p of people) {
    for (const goal of ['lose', 'maintain', 'gain']) {
      for (const pattern of ['mediterranean', 'lowcarb', 'highprotein']) {
        for (const preferences of prefsets) {
          for (const mealsPerDay of [3, 5]) {
            const plan = nutritionPlan({ ...p, goal, pattern, preferences, mealsPerDay, days: 7, asOf: '2026-10-01' });
            for (const o of allOptions(plan)) {
              for (const it of o.items) {
                const f = FOODS[it.food];
                const max = { veg: 350, nuts: 40, fat: 100, protein: 250, grain: 350 }[f.cat];
                if (max) assert.ok(it.grams <= max, `${o.name}: ${f.name} ${it.grams} г`);
              }
              // Добавките следват ограниченията, а зехтинът не отива в сладко ястие.
              if (!preferences.includes('glutenFree')) assert.ok(!o.items.some(it => it.food === 'gfbread' && it.extra), `${o.name}: безглутенов хляб без нужда`);
              if (o.items.some(it => !it.extra && (it.food === 'honey' || FOODS[it.food].cat === 'fruit'))) {
                assert.ok(!o.items.some(it => it.food === 'oil' && it.extra), `${o.name}: зехтин в сладко ястие`);
              }
              assert.ok(o.items.filter(it => ['bread', 'ryebread', 'gfbread', 'pita'].includes(it.food)).length <= 1, `${o.name}: два вида хляб`);
            }
            for (const d of plan.week) {
              days++;
              if (Math.abs(d.totals.kcal / plan.targets.kcal - 1) > 0.08) energyMiss++;
              if (d.totals.protein < plan.targets.protein * 0.9 || d.totals.protein > plan.targets.proteinMax * 1.05) proteinMiss++;
            }
          }
        }
      }
    }
  }
  assert.ok(energyMiss / days < 0.03, `енергия извън ±8%: ${energyMiss} от ${days} дни`);
  assert.ok(proteinMiss / days < 0.05, `белтък извън целите: ${proteinMiss} от ${days} дни`);
});

test('много ограничения заедно и ХБЗ: всяко хранене има ястие, замените са описани', () => {
  const strict = nutritionPlan({
    ...base, preferences: ['vegan', 'glutenFree', 'noSoy'], conditions: new Set(['ckd', 'dm2', 'htn']),
    egfr: 38, potassium: 5.4, days: 7,
  });
  for (const m of strict.meals) assert.ok(m.options.length >= 1, `няма ${m.label}`);
  for (const d of strict.week) for (const m of d.meals) assert.ok(m.option, `${d.label}: няма ${m.label}`);
  assert.ok(!hasFlag(strict, 'gluten') && !hasFlag(strict, 'soy') && !hasFlag(strict, 'dairy'));
  // Без мляко: растително кисело мляко и тофу вместо сирене, с отбелязана замяна.
  const noDairy = nutritionPlan({ ...base, preferences: ['noDairy'], days: 7, variant: 2 });
  const swapped = allOptions(noDairy).filter(o => /Замени:/.test(o.method));
  assert.ok(swapped.length > 0);
  assert.ok(swapped.every(o => /вместо/.test(o.method)));
  assert.ok(!allOptions(noDairy).some(o => /[Сс]ирене|[Ии]звара/.test(o.name) && !o.items.some(it => FOODS[it.food].cat === 'dairy')), 'името следва замяната');
  // ХБЗ: белтъкът в менюто под 1,0 г/кг и далеч под 1,3 г/кг.
  const ckd = nutritionPlan({ ...base, conditions: new Set(['ckd']), egfr: 35, potassium: 5.6, days: 7 });
  assert.equal(ckd.targets.proteinMax, Math.round(ckd.refWeight * 1.0));
  for (const d of ckd.week) assert.ok(d.totals.protein <= ckd.refWeight * 1.1, `${d.label}: ${d.totals.protein} г`);
});

/* ------------------------------------ API ------------------------------------ */

test('API: новите възможности се проверяват и запазват', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-nut-'));
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
    const pt = await call('POST', '/api/patients', { name: 'Иван Петров', birthDate: addMonths(today(), -12 * 45), sex: 'm', allergies: ['орехи'] });
    const id = pt.data.patient.id;
    await call('POST', `/api/patients/${id}/measurements`, { weight: 102, height: 180 });

    const ok = await call('POST', `/api/patients/${id}/nutrition`, {
      goal: 'lose', pace: 'slow', targetWeight: 95, pattern: 'lowcarb', mealsPerDay: 4, days: 7, quick: true, strength: true,
      preferences: ['noPork'], save: true,
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const plan = ok.data.plan;
    assert.equal(plan.input.pace, 'slow');
    assert.equal(plan.input.mealsPerDay, 4);
    assert.equal(plan.week.length, 7);
    assert.equal(plan.projection.targetWeight, 95);
    assert.ok(plan.input.preferences.includes('noNuts'), 'от алергията в досието');
    assert.ok(!hasFlag(plan, 'nuts'));
    assert.ok(ok.data.saved.id);

    for (const bad of [{ pace: 'turbo' }, { pattern: 'keto' }, { mealsPerDay: 6 }, { days: 3 }, { targetWeight: 5 }, { goal: 'x' }]) {
      assert.equal((await call('POST', `/api/patients/${id}/nutrition`, bad)).status, 400, JSON.stringify(bad));
    }
    // Лесен режим само с подразбиращите се стойности.
    const simple = await call('POST', `/api/patients/${id}/nutrition`, {});
    assert.equal(simple.status, 200);
    assert.equal(simple.data.plan.meals.length, 5);
    assert.equal(simple.data.plan.week, null);
  } finally {
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
    for (const s of spaces.all()) await s.writePromise.catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
