/* Версия 4.4: хранителен режим с всички заболявания по МКБ-10, за човек извън
 * пациентската листа и с рецепти от публикуван източник (NHLBI). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FOODS, RECIPES, mealsOf, totals } from '../public/js/shared/recipes.js';
import { nutritionPlan } from '../public/js/shared/nutrition.js';
import { dietProfiles, dossierDiagnoses, dxName, icdInText, searchDx, validIcd } from '../public/js/shared/diet-icd.js';
import { Store } from '../lib/store.js';
import { Workspaces } from '../lib/workspaces.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import { addMonths, today } from '../public/js/shared/dates.js';

const base = { sex: 'm', age: 50, weight: 82, height: 178, activity: 'light', asOf: '2026-10-13' };
const options = (plan) => [...plan.meals.flatMap(m => m.options), ...(plan.week || []).flatMap(d => d.meals.map(m => m.option))].filter(Boolean);
const foods = (plan) => new Set(options(plan).flatMap(o => o.items.map(it => it.food)));
const hasFlag = (plan, flag) => [...foods(plan)].some(f => FOODS[f].flags.has(flag));

/* ------------------------------- МКБ-10 ------------------------------- */

test('МКБ-10: кодове, имена, търсене и текст', () => {
  assert.ok(validIcd('E11.9') && validIcd('е11') && validIcd('K90.0') && !validIcd('11.9') && !validIcd('EE1'));
  assert.equal(dxName('E11.65'), 'Захарен диабет тип 2');
  assert.ok(searchDx('цьолиак').some(d => d.code === 'K90.0'));
  assert.ok(searchDx('K21').some(d => d.code === 'K21'));
  assert.deepEqual(icdInText('К21.0 Рефлукс; E55 витамин D').map(d => d.code), ['K21.0', 'E55']);
  // От досието: хроничните заболявания, кодовете в текста и прегледите при специалист.
  const dx = dossierDiagnoses({
    chronic: [{ code: 'htn', status: 'active' }, { code: 'dm2', status: 'active' }, { code: 'copd', status: 'resolved' }],
    conditions: ['K21.0 Гастроезофагеален рефлукс'],
    visits: [{ simp: true, date: '2026-05-01', icd: 'E05.0', diagnosis: 'Тиреотоксикоза', extraDx: [{ icd: 'N20.0', text: 'Нефролитиаза' }] }],
  });
  assert.deepEqual(dx.map(d => d.code), ['I10', 'E11', 'K21.0', 'E05.0', 'N20.0']);
});

test('МКБ-10: всяка диагноза се отразява на режима — и непознатите се изброяват', () => {
  const r = dietProfiles([{ code: 'K90.0' }, { code: 'E73' }, { code: 'Q21.1', name: 'Междупредсърден дефект' }, { code: 'xx' }]);
  assert.deepEqual([...r.prefs].sort(), ['glutenFree', 'lactoseFree']);
  assert.equal(r.considered.length, 3, 'невалидният код не влиза');
  const q = r.considered.find(c => c.code === 'Q21.1');
  assert.equal(q.label, '');
  assert.equal(q.name, 'Междупредсърден дефект');

  // Цьолиакия: никакъв глутен в менюто, дори без отметка.
  const celiac = nutritionPlan({ ...base, days: 7, diagnoses: [{ code: 'K90.0' }] });
  assert.ok(!hasFlag(celiac, 'gluten'));
  assert.ok(celiac.diagnoses.some(c => c.code === 'K90.0' && c.effects.includes('без глутен')));

  // Хипертония по код: DASH по подразбиране и правилата за сол.
  const htn = nutritionPlan({ ...base, diagnoses: [{ code: 'I10' }] });
  assert.equal(htn.pattern.id, 'dash');
  assert.ok(htn.limit.some(t => /Хипертония/.test(t)));

  // ХБЗ стадий 4 без резултат: 0,8 г/кг, ограничен калий, бележка за eGFR.
  const ckd = nutritionPlan({ ...base, days: 7, diagnoses: [{ code: 'N18.4' }] });
  assert.equal(ckd.targets.proteinPerKg, 0.8);
  assert.ok(ckd.flags.limitK && ckd.flags.ckdAdvanced);
  assert.ok(ckd.notes.some(n => /eGFR/.test(n)));
  assert.ok(!options(ckd).some(o => o.items.some(it => FOODS[it.food].flags.has('highK') && it.grams > 75)));
  // Резултатът има предимство пред кода.
  assert.ok(!nutritionPlan({ ...base, egfr: 75, diagnoses: [{ code: 'N18.4' }] }).flags.ckd);

  // Хемодиализа: белтък 1,1 г/кг (KDOQI), калий, течности до 1,5 л.
  const hd = nutritionPlan({ ...base, diagnoses: [{ code: 'Z99.2' }] });
  assert.equal(hd.targets.proteinPerKg, 1.1);
  assert.ok(hd.flags.limitK && hd.flags.dialysis);
  assert.ok(hd.targets.fluids <= 1500);

  // Камъни в бъбреците: течности поне 2,5 л. Цироза: белтък поне 1,2 г/кг и без отслабване.
  assert.ok(nutritionPlan({ ...base, diagnoses: [{ code: 'N20.0' }] }).targets.fluids >= 2500);
  const liver = nutritionPlan({ ...base, weight: 95, goal: 'lose', diagnoses: [{ code: 'K74.6' }] });
  assert.equal(liver.input.goal, 'maintain');
  assert.ok(liver.targets.proteinPerKg >= 1.2);
  assert.ok(liver.warnings.some(w => /диетолог/.test(w)));

  // Онкологично заболяване и ХБЗ: спазва се KDIGO и има предупреждение.
  const onco = nutritionPlan({ ...base, egfr: 40, diagnoses: [{ code: 'C50.9' }] });
  assert.equal(onco.targets.proteinPerKg, 0.8);
  assert.ok(onco.warnings.some(w => /нефролог/.test(w)));

  // Хиперкалиемия по код ограничава калия; запекът вдига фибрите.
  assert.ok(nutritionPlan({ ...base, diagnoses: [{ code: 'E87.5' }] }).flags.limitK);
  assert.ok(nutritionPlan({ ...base, diagnoses: [{ code: 'K59.0' }] }).targets.fiber >= 30);
});

test('МКБ-10: бременност — без отслабване, енергия по тримесечие, без прясна риба тон', () => {
  const w = { ...base, sex: 'f', age: 30, weight: 70, height: 168, days: 7 };
  const plain = nutritionPlan({ ...w, goal: 'maintain' });
  const t1 = nutritionPlan({ ...w, goal: 'lose', diagnoses: [{ code: 'Z33' }], pregnancyWeek: 8 });
  const t3 = nutritionPlan({ ...w, goal: 'lose', diagnoses: [{ code: 'Z33' }], pregnancyWeek: 32 });
  assert.equal(t1.input.goal, 'maintain');
  assert.ok(t3.targets.kcal - plain.targets.kcal >= 450, `${t3.targets.kcal} / ${plain.targets.kcal}`);
  assert.ok(t1.targets.kcal - plain.targets.kcal <= 100);
  assert.ok(!foods(t3).has('tunasteak'));
  const low = nutritionPlan({ ...w, pattern: 'lowcarb', diagnoses: [{ code: 'O24.4' }], pregnancyWeek: 28 });
  assert.ok(low.targets.carbs >= 175, 'поне 175 г въглехидрати');
  assert.ok(low.flags.diabetes);
});

/* ------------------------------ рецепти с източник ------------------------------ */

test('рецепти на NHLBI: източник, съставки и предпочитане', () => {
  const sourced = RECIPES.filter(r => r.source);
  assert.ok(sourced.length >= 70, `с източник: ${sourced.length}`);
  for (const r of sourced) {
    assert.ok(r.source.length >= 1, r.name);
    for (const s of r.source) {
      assert.equal(s.org, 'NHLBI');
      assert.match(s.url, /^https:\/\/www\.nhlbi\.nih\.gov\//, r.name);
      assert.ok(s.title.length > 3);
    }
    for (const [food, g] of r.items) assert.ok(FOODS[food] && g > 0, `${r.name}: ${food}`);
    assert.ok(mealsOf(r).length >= 1);
    const t = totals(r.items.map(([food, grams]) => ({ food, grams })));
    assert.ok(t.kcal > 40 && t.kcal < 900, `${r.name}: ${t.kcal} kcal`);
  }
  for (const meal of ['breakfast', 'snack', 'lunch', 'dinner']) {
    assert.ok(sourced.some(r => mealsOf(r).includes(meal)), meal);
  }
  // Предпочитат се: в обичайния режим поне половината ястия са с източник.
  const plan = nutritionPlan({ ...base, days: 7 });
  const opts = options(plan);
  assert.ok(opts.filter(o => o.source).length / opts.length >= 0.5);
  // „Само с източник“: всички ястия са с източник.
  const only = nutritionPlan({ ...base, days: 7, sourcedOnly: true });
  assert.ok(options(only).every(o => o.source?.length));
  // При ограничения, за които няма рецепта с източник, има бележка и меню.
  const strict = nutritionPlan({ ...base, days: 7, sourcedOnly: true, preferences: ['vegan', 'glutenFree', 'noSoy'] });
  for (const d of strict.week) for (const m of d.meals) assert.ok(m.option);
  // Малки количества плод се мерят в грамове, не на брой.
  for (const o of options(plan)) {
    for (const it of o.items) if (/ бр\. /.test(it.text)) assert.ok(it.grams >= FOODS[it.food].unit.grams * 0.5, it.text);
  }
});

/* ------------------------------------ API ------------------------------------ */

test('API: човек извън листата — запис, режим, диагнози, изтриване', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-nutc-'));
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
    const person = { name: 'Г. К.', sex: 'f', age: 58, weight: 74, height: 162, activity: 'light', allergies: 'риба',
      diagnoses: [{ code: 'e11.9' }, { code: 'K21.0', name: 'Рефлукс' }, { code: 'M17' }], meds: ['metformin'] };

    // Изготвяне без запис.
    const draft = await call('POST', '/api/nutrition/plan', { person, days: 7, goal: 'lose' });
    assert.equal(draft.status, 200, JSON.stringify(draft.data));
    assert.ok(draft.data.plan.flags.diabetes, 'E11 по код');
    assert.deepEqual(draft.data.plan.diagnoses.map(c => c.code), ['E11.9', 'K21.0', 'M17']);
    assert.ok(draft.data.plan.input.preferences.includes('noFish'), 'от алергията');
    assert.ok(draft.data.plan.notes.some(n => /Метформин/.test(n)), 'лекарството от формата');
    assert.equal((await call('GET', '/api/nutrition/clients')).data.clients.length, 0);

    // Със запис — създава човека и пази режима.
    const saved = await call('POST', '/api/nutrition/plan', { person, days: 1, save: true });
    assert.equal(saved.status, 200);
    const cid = saved.data.client.id;
    assert.equal(saved.data.client.plans.length, 1);
    const clients = (await call('GET', '/api/nutrition/clients')).data.clients;
    assert.equal(clients.length, 1);
    assert.deepEqual(clients[0].diagnoses, ['E11.9', 'K21.0', 'M17']);
    // Не е пациент: не влиза в списъка с пациентите.
    assert.equal((await call('GET', '/api/patients')).data.patients.length, 0);

    // Нов режим за същия човек; промяна на данните.
    await call('POST', '/api/nutrition/plan', { person: { ...person, weight: 72 }, clientId: cid, save: true });
    const upd = await call('PUT', `/api/nutrition/clients/${cid}`, { ...person, name: 'Г. Костова', egfr: 50 });
    assert.equal(upd.status, 200);
    const one = (await call('GET', `/api/nutrition/clients/${cid}`)).data.client;
    assert.equal(one.name, 'Г. Костова');
    assert.equal(one.plans.length, 2);
    assert.equal(one.egfr, 50);

    // Проверки на данните.
    for (const bad of [
      { person: { ...person, sex: '' } },
      { person: { ...person, age: 15 } },
      { person: { ...person, diagnoses: [{ code: '123' }] } },
      { person: { ...person, weight: '' } },
      { person, pattern: 'keto' },
      { person, pregnancyWeek: 50 },
    ]) assert.equal((await call('POST', '/api/nutrition/plan', bad)).status, 400, JSON.stringify(bad).slice(0, 120));

    // Изтриване на режим и на човека.
    assert.equal((await call('DELETE', `/api/nutrition/clients/${cid}/plans/${one.plans[0].id}`)).status, 200);
    assert.equal((await call('GET', `/api/nutrition/clients/${cid}`)).data.client.plans.length, 1);
    assert.equal((await call('DELETE', `/api/nutrition/clients/${cid}`)).status, 200);
    assert.equal((await call('GET', `/api/nutrition/clients/${cid}`)).status, 404);

    // Пациент от листата: диагнозите от формата, иначе — от досието.
    const pt = await call('POST', '/api/patients', { name: 'Иван Петров', birthDate: addMonths(today(), -12 * 60), sex: 'm' });
    const id = pt.data.patient.id;
    await call('POST', `/api/patients/${id}/measurements`, { weight: 90, height: 176 });
    await call('POST', `/api/patients/${id}/chronic`, { code: 'gout' });
    const fromDossier = await call('POST', `/api/patients/${id}/nutrition`, {});
    assert.ok(fromDossier.data.plan.diagnoses.some(c => c.code === 'M10'));
    const withDx = await call('POST', `/api/patients/${id}/nutrition`, { diagnoses: [{ code: 'K90.0' }, { code: 'M10' }], sourcedOnly: true, days: 7 });
    assert.equal(withDx.status, 200, JSON.stringify(withDx.data));
    assert.ok(!hasFlag(withDx.data.plan, 'gluten') && !hasFlag(withDx.data.plan, 'purine'));
    assert.equal((await call('POST', `/api/patients/${id}/nutrition`, { diagnoses: [{ code: 'Z1' }] })).status, 400);

    // Записите оцеляват при повторно зареждане на данните.
    await call('POST', '/api/nutrition/plan', { person, save: true });
    const store2 = new Store(dir);
    assert.equal(store2.nutritionClients.length, 1);
  } finally {
    server.close();
  }
});
