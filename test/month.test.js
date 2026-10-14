/* Версия 4.6: месечно меню от 4 седмици с пазаруване за всяка седмица. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FOODS, RECIPES, recipeTags } from '../public/js/shared/recipes.js';
import { MENU_DAYS, WEEKDAYS, nutritionPlan, weekChunks } from '../public/js/shared/nutrition.js';
import { Store } from '../lib/store.js';
import { Workspaces } from '../lib/workspaces.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import { addDays, addMonths, today } from '../public/js/shared/dates.js';

const base = { sex: 'f', age: 41, weight: 78, height: 166, activity: 'light', asOf: '2026-10-14' };
const MAIN = new Set(['lunch', 'dinner']);
const tagsOf = new Map(RECIPES.map(r => [r.name, recipeTags(r)]));

test('месец: 28 поредни дни, денят от седмицата следва датата', () => {
  assert.deepEqual(MENU_DAYS, [1, 7, 28]);
  const plan = nutritionPlan({ ...base, goal: 'lose', days: 28 });
  assert.equal(plan.input.days, 28);
  assert.equal(plan.week.length, 28);
  plan.week.forEach((d, i) => {
    assert.equal(d.date, addDays('2026-10-14', i));
    const [y, m, dd] = d.date.split('-').map(Number);
    assert.equal(d.label, WEEKDAYS[(new Date(y, m - 1, dd).getDay() + 6) % 7]);
    assert.ok(d.meals.every(x => x.option), `${d.date}: всяко хранене има ястие`);
    assert.ok(Math.abs(d.totals.kcal - d.kcal) <= d.kcal * 0.08, `${d.date}: ${d.totals.kcal} / ${d.kcal}`);
  });
  assert.equal(plan.shopping, null, 'при месеца пазаруването е по седмици');
});

test('месец: всяка седмица без повторения и с ритъм за риба, бобови и месо', () => {
  const plan = nutritionPlan({ ...base, goal: 'maintain', days: 28 });
  const weeks = weekChunks(plan.week);
  assert.equal(weeks.length, 4);
  const all = [];
  for (const [w, days] of weeks.entries()) {
    const mains = days.flatMap(d => d.meals.filter(m => MAIN.has(m.meal)).map(m => m.option.name));
    all.push(...mains);
    assert.equal(new Set(mains).size, mains.length, `седмица ${w + 1}: обядите и вечерите не се повтарят`);
    const tags = mains.map(n => tagsOf.get(n)).filter(Boolean);
    assert.ok(tags.filter(t => t.has('fish')).length >= 2, `седмица ${w + 1}: риба поне 2 пъти`);
    assert.ok(tags.filter(t => t.has('legume')).length >= 3, `седмица ${w + 1}: бобови поне 3 пъти`);
    assert.ok(tags.filter(t => t.has('redmeat')).length <= 2, `седмица ${w + 1}: червено месо до 2 пъти`);
  }
  // Без ограничения рецептите стигат за целия месец почти без повторение.
  assert.ok(new Set(all).size >= 50, `различни основни ястия: ${new Set(all).size} от ${all.length}`);
});

test('месец: пазаруване за всяка седмица — точно продуктите от нейните дни', () => {
  const plan = nutritionPlan({ ...base, days: 28, mealsPerDay: 4 });
  assert.equal(plan.shoppingWeeks.length, 4);
  weekChunks(plan.week).forEach((days, w) => {
    const sh = plan.shoppingWeeks[w];
    assert.equal(sh.week, w + 1);
    assert.equal(sh.from, days[0].date);
    assert.equal(sh.to, days[6].date);
    const grams = new Map();
    for (const d of days) for (const m of d.meals) for (const it of m.option.items) grams.set(it.food, (grams.get(it.food) || 0) + it.grams);
    const listed = new Map(sh.groups.flatMap(g => g.items.map(it => [it.food, it.grams])));
    assert.deepEqual([...listed.keys()].sort(), [...grams.keys()].sort(), `седмица ${w + 1}: същите продукти`);
    for (const [food, g] of grams) assert.equal(listed.get(food), Math.round(g), `${food}`);
    assert.ok(sh.groups.every(g => g.items.every(it => it.amount)), 'всеки продукт има количество');
  });
  // Седмичното меню е както досега — един списък.
  const week = nutritionPlan({ ...base, days: 7 });
  assert.ok(week.shopping && week.shoppingWeeks === null);
});

test('месец: строги ограничения — всичко е спазено, повторения само между седмиците', () => {
  for (const preferences of [['vegan', 'glutenFree'], ['vegetarian', 'noNuts', 'lactoseFree'], ['noFish', 'noPork']]) {
    const plan = nutritionPlan({ ...base, days: 28, mealsPerDay: 3, preferences });
    for (const days of weekChunks(plan.week)) {
      const mains = days.flatMap(d => d.meals.filter(m => MAIN.has(m.meal)).map(m => m.option?.name)).filter(Boolean);
      assert.equal(new Set(mains).size, mains.length, `${preferences}: без повторение в седмицата`);
    }
    const foods = new Set(plan.week.flatMap(d => d.meals.flatMap(m => m.option?.items.map(it => it.food) || [])));
    const has = (flag) => [...foods].some(f => FOODS[f].flags.has(flag));
    if (preferences.includes('vegan')) assert.ok(!has('meat') && !has('dairy') && !has('egg') && !has('gluten'));
    if (preferences.includes('noNuts')) assert.ok(!has('nuts'));
    if (preferences.includes('noFish')) assert.ok(!has('fish') && !has('seafood') && !has('pork'));
  }
});

test('месец и цикъл: всички фази, енергията средно същата', () => {
  const plan = nutritionPlan({ ...base, goal: 'maintain', days: 28, cycleSync: true, cycle: { periods: [{ start: '2026-10-10' }], length: 28 } });
  assert.ok(plan.cycle.applied);
  assert.deepEqual([...new Set(plan.week.map(d => d.cycle.phase))].sort(), ['follicular', 'luteal', 'menstrual', 'ovulation', 'premenstrual']);
  const avg = plan.week.reduce((s, d) => s + d.cycle.kcalAdd, 0) / 28;
  assert.ok(Math.abs(avg) <= 10, `средно ${avg}`);
  assert.equal(plan.cycle.prefer.length, 2, 'съвети за менструацията и предменструалните дни');
});

test('API: месечно меню, запис и проверка на броя дни', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-month-'));
  const server = createAppServer({ workspaces: new Workspaces(new Store(dir)), serveStatic: memoryStatic({ 'index.html': 'x' }), requireActivation: false });
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
    const pt = await call('POST', '/api/patients', { name: 'Петър Иванов', birthDate: addMonths(today(), -12 * 52), sex: 'm' });
    const id = pt.data.patient.id;
    await call('POST', `/api/patients/${id}/measurements`, { weight: 96, height: 180 });
    const res = await call('POST', `/api/patients/${id}/nutrition`, { days: 28, save: true });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.plan.week.length, 28);
    assert.equal(res.data.plan.shoppingWeeks.length, 4);
    assert.equal(res.data.plan.week[0].date, today());
    const saved = (await call('GET', `/api/patients/${id}`)).data.patient.nutritionPlans;
    assert.equal(saved[0].plan.week.length, 28);
    for (const days of [30, 14, 2, 'месец']) {
      assert.equal((await call('POST', `/api/patients/${id}/nutrition`, { days })).status, 400, String(days));
    }
    const ext = await call('POST', '/api/nutrition/plan', { person: { sex: 'f', age: 35, weight: 70, height: 168 }, days: 28 });
    assert.equal(ext.status, 200);
    assert.equal(ext.data.plan.shoppingWeeks.length, 4);
  } finally {
    server.close();
  }
});
