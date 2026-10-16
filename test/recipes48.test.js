/* Версия 4.8: още рецепти на NHLBI — книгите за афроамериканската и латиноамериканската
 * кухня, ръководството за DASH и останалите подходящи рецепти от Keep the Beat™. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOODS, RECIPES, mealsOf, recipeTags, totals } from '../public/js/shared/recipes.js';
import { nutritionPlan, weekChunks } from '../public/js/shared/nutrition.js';
import { GUIDELINES } from '../public/js/shared/guidelines.js';

const sourced = RECIPES.filter(r => r.source);
const fromBook = (part) => sourced.filter(r => r.source.some(s => s.url.includes(part)));
const base = { sex: 'f', age: 41, weight: 78, height: 166, activity: 'light', asOf: '2026-10-14' };

test('4.8 и 4.11: 259 рецепти (325 от версия 4.15), 132 с източник, от трите нови издания', () => {
  assert.equal(RECIPES.length, 325);
  assert.equal(sourced.length, 132);
  assert.ok(fromBook('WEHL-RecipeBook_508.pdf').length >= 7, 'African American Style');
  assert.ok(fromBook('Your_Heart_Your_Life_Recipe_Book.pdf').length >= 7, 'Latino Recipes');
  assert.ok(fromBook('new_dash.pdf').length >= 6, 'DASH');
  // Всеки източник от книга има страница; имената на ястията не се повтарят.
  for (const r of sourced) for (const s of r.source) if (s.book) assert.ok(Number.isInteger(s.page) && s.page > 0, `${r.name}: ${s.title}`);
  assert.equal(new Set(RECIPES.map(r => r.name)).size, RECIPES.length);
  // Има ястия за всяко хранене и за вегани.
  for (const meal of ['breakfast', 'snack', 'lunch', 'dinner']) assert.ok(fromBook('nhlbi').some(r => mealsOf(r).includes(meal)), meal);
  assert.ok(sourced.filter(r => recipeTags(r).has('vegan')).length >= 20);
});

test('4.8: менюто DASH дава и гарнитурите от седмичното меню', () => {
  const dashMenus = sourced.filter(r => r.source.some(s => /DASH Eating Plan, Day [1-7]$/.test(s.title)));
  assert.ok(dashMenus.length >= 6, `ястия с меню: ${dashMenus.length}`);
  for (const r of dashMenus) {
    assert.match(r.method, /По менюто DASH на NHLBI|Гарнитура по менюто DASH на NHLBI/, r.name);
    const t = totals(r.items.map(([food, grams]) => ({ food, grams })));
    assert.ok(t.kcal >= 150 && t.kcal <= 900, `${r.name}: ${t.kcal}`);
  }
});

test('4.8: новите продукти — по USDA, с желязо и калций', () => {
  for (const id of ['cheddar', 'turkeysausage', 'phyllo', 'corntortilla', 'edamame']) {
    const f = FOODS[id];
    assert.ok(f && f.kcal > 0 && f.name, id);
    assert.ok(f.fe > 0 && f.ca > 0, `${id}: желязо и калций`);
    assert.ok(RECIPES.some(r => r.items.some(([food]) => food === id)), `${id} се използва`);
  }
  assert.ok(FOODS.edamame.flags.has('soy') && FOODS.edamame.flags.has('legume'));
  assert.ok(FOODS.phyllo.flags.has('gluten') && !FOODS.corntortilla.flags.has('gluten'));
});

test('4.8: каймата в рецептите на NHLBI е в сурово тегло', () => {
  // „12 oz постна пуешка кайма“ за 4 порции = 85 г на порция (досега 64 г).
  const meatloaf = RECIPES.find(r => r.name === 'Пуешко руло със зеленчуци');
  assert.deepEqual(meatloaf.items.find(([food]) => food === 'turkeymince'), ['turkeymince', 85]);
});

test('4.8: месечно меню само с източник — без повторение в седмицата', () => {
  for (const preferences of [[], ['vegetarian'], ['vegan'], ['noFish']]) {
    const plan = nutritionPlan({ ...base, goal: 'maintain', days: 28, sourcedOnly: true, preferences });
    for (const days of weekChunks(plan.week)) {
      const mains = days.flatMap(d => d.meals.filter(m => m.meal === 'lunch' || m.meal === 'dinner').map(m => m.option.name));
      assert.equal(new Set(mains).size, mains.length, `${preferences}: ${mains.length - new Set(mains).size} повторения`);
    }
    assert.ok(plan.week.every(d => d.meals.every(m => m.option?.source?.length)), `${preferences}: всички с източник`);
  }
});

test('4.8: източниците са в списъка с насоки', () => {
  const ids = new Set(Object.keys(GUIDELINES));
  for (const id of ['nhlbi_recipes', 'nhlbi_aa_2021', 'nhlbi_latino_2024', 'nhlbi_dash_guide']) assert.ok(ids.has(id), id);
});
