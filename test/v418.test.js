/* Версия 4.18: поправките от проверката за бъгове (менюто спрямо целите, солта, границата за
 * белтъка) и новите неща в хранителния режим — показателите на пациента, дневникът,
 * контролът и менюто с по-малко готвене. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nutritionPlan } from '../public/js/shared/nutrition.js';
import { FOODS } from '../public/js/shared/recipes.js';
import { translatePlan } from '../public/js/shared/i18n/plan-en.js';
import { defaultGoalFor } from '../public/js/shared/diet-icd.js';

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
