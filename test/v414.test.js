/* Версия 4.14: тренировки по диагнозите, пулс по резерва, крачки, упражненията, GLP-1 агонист,
 * храни, които човекът не яде, „Друго ястие“, прогноза на теглото и напредък по режима. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXERCISES, stepsFor, trainingPlan, trainingSafety } from '../public/js/shared/training.js';
import { FOODS, cleanSwaps, expectedWeight, nutritionPlan, planProgress } from '../public/js/shared/nutrition.js';
import { GUIDELINES } from '../public/js/shared/guidelines.js';
import { translatePlan } from '../public/js/shared/i18n/plan-en.js';
import { Store } from '../lib/store.js';
import { Workspaces } from '../lib/workspaces.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';

const CYR = /[А-Яа-яЁё]/;
const base = { sex: 'f', age: 52, weight: 92, height: 166, activity: 'light', asOf: '2026-10-16' };
const tp = (extra = {}) => trainingPlan({
  start: '2026-10-19', sex: 'f', age: 52, weight: 92, bmi: 33, level: 'intermediate', daysPerWeek: 3, minutes: 45,
  focus: 'health', activities: ['gym', 'yoga'], ...extra,
});
const week = (plan, w) => plan.days.filter(d => d.week === w);
const options = (plan) => [...plan.meals.flatMap(m => m.options), ...(plan.week || []).flatMap(d => d.meals.map(m => m.option))].filter(Boolean);
const shorts = new Set(Object.values(GUIDELINES).map(g => g.short));

/* --------------------------------- тренировки --------------------------------- */

test('тренировки по диагнозите: клаудикация, ретинопатия, GLP-1, тазово дъно', () => {
  // Периферна артериална болест: ходене поне 3 пъти седмично, на интервали до болка.
  const pad = tp({ codes: ['I73.9'], cond: new Set(['pad']) });
  for (let w = 0; w < 4; w++) {
    const walks = week(pad, w).flatMap(d => d.sessions).filter(s => s.activity === 'walking');
    assert.ok(walks.length >= 3, `седмица ${w + 1}: ${walks.length}`);
    assert.ok(walks.every(s => s.blocks.some(b => /болката в прасеца/.test(b.text))));
  }
  assert.ok(pad.notes.some(n => /ACC\/AHA 2024 ПАБ/.test(n)));

  // Ретинопатия: без интензивни тренировки и без тежки повдигания при напреднали.
  const eye = tp({ codes: ['E11.3'], cond: new Set(['dm2']), level: 'advanced', activities: ['gym', 'running'] });
  assert.ok(eye.days.every(d => d.sessions.every(s => s.intensity !== 'vigorous')));
  assert.ok(eye.warnings.some(w => /ретинопатия/.test(w)));
  const gym = eye.days.flatMap(d => d.sessions).find(s => s.activity === 'gym');
  assert.match(gym.blocks[1].text, /RPE 7 — остават 2–3/, 'като средно напреднал');

  // GLP-1 агонист: силови поне 3 пъти седмично.
  const glp = tp({ classes: new Set(['GLP1']), activities: ['walking'] });
  assert.equal(glp.targets.strengthDays, 3);
  assert.ok(glp.weeks.every(w => w.strength >= 3), JSON.stringify(glp.weeks.map(w => w.strength)));

  // Инконтиненция при жена — упражнения за тазовото дъно всеки ден; при мъж — не.
  const pf = tp({ codes: ['N39.3'] });
  assert.ok(pf.targets.pelvicFloor && pf.days.every(d => d.addOns.some(a => a.kind === 'pelvic')));
  assert.ok(pf.exercises.some(x => x.id === 'pelvic'));
  assert.equal(tp({ sex: 'm', codes: ['N39.3'] }).targets.pelvicFloor, false);
  assert.ok(trainingSafety({ age: 30, sex: 'f', postpartum: true }).pelvicFloor, 'след раждане');
  // Упражненията за тазовото дъно не се броят в разхода на енергия.
  assert.deepEqual(pf.days.map(d => d.kcal), tp().days.map(d => d.kcal));

  // Паркинсон — баланс 3 дни; поликистозни яйчници при отслабване — цел 250 мин.
  assert.equal(tp({ codes: ['G20'] }).targets.balanceDays, 3);
  assert.equal(tp({ codes: ['E28.2'], goal: 'lose' }).targets.aerobic, 250);
  assert.equal(tp({ codes: ['E28.2'], goal: 'lose', focus: 'weight' }).targets.aerobic, 300);
});

test('всяка нова бележка цитира насока от регистъра', () => {
  const codes = ['I73.9', 'I50', 'I69', 'E11.3', 'E11.4', 'C50.9', 'M05', 'M62.5', 'G35', 'G20', 'E28.2', 'N39.3'];
  const s = trainingSafety({ age: 50, sex: 'f', goal: 'lose', codes, cond: new Set(['hf', 'stroke', 'pad', 'dm2']), classes: new Set(['GLP1']) });
  const cited = [...s.notes, ...s.warnings].map(t => /\(([^()]+)\)\.?$/.exec(t)?.[1]).filter(Boolean);
  assert.ok(cited.length >= 14);
  for (const c of cited) for (const one of c.split(/, (?=[A-ZА-Я])/)) assert.ok(shorts.has(one) || one === 'ADA' || one === 'GINA', `„${one}“ няма запис в регистъра`);
  for (const id of ['acc_aha_pad_2024', 'cochrane_hf_2024', 'aha_stroke_2014', 'acsm_cancer_2019', 'eular_pa_2018', 'icfsr_2018', 'kalb_2020',
    'cochrane_pd_2024', 'pcos_2023', 'nice_ng123', 'nice_ng210', 'glp1_nutrition_2025', 'hall_2011', 'paluch_2022', 'ding_2025', 'acsm_2011', 'scharhag_2015']) {
    assert.equal(GUIDELINES[id]?.since, '4.14.0', id);
    assert.match(GUIDELINES[id].url, /^https:\/\//);
  }
});

test('пулс по резерва, крачки и как се правят упражненията', () => {
  const t = tp({ restingHr: 60 });
  assert.equal(t.hr.method, 'reserve');
  const max = 208 - Math.round(0.7 * 52);
  assert.deepEqual(t.hr.moderate, [Math.round(60 + 0.4 * (t.hr.max - 60)), Math.round(60 + 0.59 * (t.hr.max - 60))]);
  assert.ok(Math.abs(t.hr.max - max) <= 1);
  assert.ok(t.notes.some(n => /Karvonen/.test(n)));
  assert.equal(tp().hr.method, 'max');
  assert.equal(tp({ restingHr: 60, classes: new Set(['BB']) }).hr, null, 'бета-блокер — без пулс');
  assert.equal(tp({ restingHr: 60, codes: ['C18'] }).hr.method, 'max', 'онкологично — по максималния');

  assert.deepEqual([stepsFor(45).from, stepsFor(45).to], [7000, 10000]);
  assert.deepEqual([stepsFor(70).from, stepsFor(70).to], [6000, 8000]);
  assert.equal(t.steps.from, 7000);

  // Всяко упражнение от плана е в текста на тренировката и има описание.
  for (const d of t.days) {
    for (const s of d.sessions) for (const b of s.blocks) for (const m of b.moves || []) assert.ok(b.text.includes(EXERCISES[m].name), m);
  }
  const ids = new Set(t.days.flatMap(d => d.sessions.flatMap(s => s.blocks.flatMap(b => b.moves || []))));
  assert.ok(ids.size >= 5);
  for (const id of ids) assert.ok(t.exercises.some(x => x.id === id && x.how.length > 40), id);
});

/* ---------------------------------- хранене ---------------------------------- */

test('GLP-1 агонист: белтък поне 1,2 г/кг при отслабване и съвети за храненето', () => {
  const p = nutritionPlan({ ...base, goal: 'lose', classes: new Set(['GLP1']), mealsPerDay: 3 });
  assert.ok(p.targets.proteinPerKg >= 1.2);
  assert.match(p.targets.proteinNote, /ACLM\/ASN\/OMA\/TOS 2025/);
  assert.ok(p.prefer.some(t => /по-малки и по-чести хранения/.test(t)));
  assert.ok(p.notes.some(t => /4 или 5 по-малки хранения/.test(t)));
  assert.equal(p.flags.glp1, true);
  const no = nutritionPlan({ ...base, goal: 'lose' });
  assert.ok(!no.flags.glp1 && !no.notes.some(t => /GLP-1/.test(t)));
});

test('храни, които не яде: не влизат в менюто, нито като добавка', () => {
  const dislikes = ['oats', 'chicken', 'walnuts', 'yogurt'];
  const p = nutritionPlan({ ...base, days: 7, goal: 'lose', dislikes: [...dislikes, 'няма-такава'] });
  assert.deepEqual(p.input.dislikes, dislikes);
  for (const o of options(p)) for (const it of o.items) assert.ok(!dislikes.includes(it.food) && !dislikes.includes(it.orig), `${o.name}: ${it.food}`);
  assert.ok(options(p).length >= 30);
});

test('„Друго ястие“: сменя само избраното място в менюто', () => {
  const a = nutritionPlan({ ...base, days: 7 });
  const b = nutritionPlan({ ...base, days: 7, swaps: { '3.2.0': 1 } });
  a.week.forEach((d, i) => d.meals.forEach((m, j) => {
    if (i === 3 && j === 2) assert.notEqual(m.option.key, b.week[i].meals[j].option.key);
    else assert.equal(m.option.key, b.week[i].meals[j].option.key, `ден ${i + 1}, хранене ${j + 1}`);
  }));
  // Сменено ястие не се повтаря в същата седмица.
  const names = b.week.flatMap(d => d.meals.filter(m => m.meal === 'lunch' || m.meal === 'dinner').map(m => m.option.key));
  assert.equal(new Set(names).size, names.length);
  // Ден с два варианта: новото ястие е различно от останалите в деня.
  const d1 = nutritionPlan({ ...base, swaps: { '0.2.1': 1 } });
  const d0 = nutritionPlan({ ...base });
  assert.equal(d1.meals[2].options[0].key, d0.meals[2].options[0].key);
  assert.notEqual(d1.meals[2].options[1].key, d0.meals[2].options[1].key);
  assert.equal(new Set(d1.meals.flatMap(m => m.options.map(o => o.key))).size, d1.meals.flatMap(m => m.options).length);
  // Входът се почиства.
  assert.deepEqual(cleanSwaps({ '1.2.0': 2, '30.1.0': 1, 'x': 3, '2.1.0': 0, '0.1.1': '4' }), { '0.1.1': 4, '1.2.0': 2 });
});

test('прогноза на теглото: забавя се с времето (Hall 2011); недостижима цел — бележка', () => {
  const m = { sex: 'm', age: 45, weight: 95, height: 178, activity: 'light', asOf: '2026-10-01' };
  const p = nutritionPlan({ ...m, goal: 'lose', targetWeight: 88 });
  const c = p.projection.curve;
  assert.equal(c[0].weight, 95);
  assert.equal(c.length, p.projection.weeks + 1);
  const first = c[0].weight - c[4].weight;
  const later = c[c.length - 5].weight - c[c.length - 1].weight;
  assert.ok(first > later, `първите 4 седмици ${first} > последните ${later}`);
  // По-бавно от правилото 7700 kcal/кг с постоянен дефицит.
  const linear = Math.ceil(7 / Math.abs(p.projection.weeklyKg));
  assert.ok(p.projection.weeks > linear, `${p.projection.weeks} > ${linear}`);
  assert.ok(c[c.length - 1].weight <= 88.05);
  // Цел, която не се достига за 2 години.
  const far = nutritionPlan({ ...m, goal: 'lose', targetWeight: 70 });
  assert.equal(far.projection.weeks, null);
  assert.ok(far.projection.plateau > 70);
  assert.ok(far.notes.some(n => /установява около/.test(n)));
  assert.match(far.projection.note, /междинна цел/);
  // Поддържане — без крива.
  assert.equal(nutritionPlan({ ...m, goal: 'maintain' }).projection.curve, null);
  // Очакваното тегло между седмиците.
  assert.ok(Math.abs(expectedWeight(p, 10) - (c[1].weight + (c[2].weight - c[1].weight) * (10 / 7 - 1))) < 0.06);
});

test('напредък по режима: правилата за контрол на теглото и корекция на енергията', () => {
  const m = { sex: 'm', age: 45, weight: 95, height: 178, activity: 'light', asOf: '2026-10-01' };
  const p = nutritionPlan({ ...m, goal: 'lose', targetWeight: 88 });
  const saved = { date: '2026-10-01', plan: p };
  const at = (ws) => planProgress(saved, ws.map(([date, weight]) => ({ date, weight })), '2026-11-01');
  assert.equal(at([]).status, 'none');
  assert.equal(at([['2026-09-20', 97]]).status, 'none', 'измерване преди режима не се брои');
  assert.equal(at([['2026-10-10', 94.4]]).status, 'early');
  const slow = at([['2026-10-15', 94.8], ['2026-10-29', 94.6]]);
  assert.equal(slow.status, 'slow');
  assert.equal(slow.kcalNew, p.targets.kcal - 150);
  assert.equal(slow.adjust, -150);
  const ok = at([['2026-10-15', 94], ['2026-10-29', 93.2]]);
  assert.equal(ok.status, 'ok');
  assert.ok(Math.abs(ok.expected - (expectedWeight(p, 28) - 95)) < 0.06);
  const fast = at([['2026-10-15', 92.5], ['2026-10-29', 90.2]]);
  assert.equal(fast.status, 'fast');
  assert.equal(fast.adjust, 200);
  assert.equal(at([['2026-10-29', 87.9]]).status, 'done');
  // Покачване и поддържане.
  const g = { date: '2026-10-01', plan: nutritionPlan({ ...m, weight: 58, goal: 'gain' }) };
  assert.equal(planProgress(g, [{ date: '2026-10-29', weight: 58.1 }], '2026-11-01').status, 'slow');
  const k = { date: '2026-10-01', plan: nutritionPlan({ ...m, goal: 'maintain' }) };
  assert.equal(planProgress(k, [{ date: '2026-10-29', weight: 97.4 }], '2026-11-01').status, 'up');

  // Корекцията на енергията в новия режим — по правилата; с бележка в режима.
  const next = nutritionPlan({ ...m, weight: 94.6, goal: 'lose', kcalAdjust: slow.adjust });
  assert.equal(next.input.kcalAdjust, -150);
  assert.ok(next.targets.kcal < p.targets.kcal - 100);
  assert.ok(next.notes.some(n => /коригирана с −150 kcal/.test(n)));
  // Не под долната граница.
  const low = nutritionPlan({ sex: 'f', age: 60, weight: 68, height: 152, activity: 'sedentary', goal: 'lose', kcalAdjust: -600 });
  assert.ok(low.targets.kcal >= 1200);
});

test('английски: новостите на 4.14 са преведени', () => {
  const p = nutritionPlan({
    ...base, days: 7, goal: 'lose', targetWeight: 60, kcalAdjust: -150, classes: new Set(['GLP1']), mealsPerDay: 3,
    diagnoses: ['I73.9', 'E11.3', 'E11.4', 'N39.3', 'C50.9', 'M05', 'M62.5', 'G35', 'G20', 'E28.2'].map(code => ({ code })),
    dislikes: ['salmon'], swaps: { '1.1.0': 1 },
    training: { activities: ['gym', 'bodyweight', 'hiit', 'walking'], level: 'intermediate', daysPerWeek: 4, minutes: 45, focus: 'weight', restingHr: 66 },
  });
  const en = translatePlan(p);
  const bad = [];
  const walk = (x, at) => {
    if (typeof x === 'string') { if (CYR.test(x)) bad.push(`${at}: ${x.slice(0, 80)}`); return; }
    if (Array.isArray(x)) x.forEach((v, i) => walk(v, `${at}[${i}]`));
    else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) if (k !== 'key') walk(v, `${at}.${k}`);
  };
  walk(en, 'plan');
  assert.deepEqual(bad, []);
  assert.ok(en.training.exercises.length >= 10);
  assert.ok(en.training.steps.text.startsWith('Steps:'));
});

/* ------------------------------------ API ------------------------------------ */

test('API: проверка на новите полета и теглата между режимите', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-414-'));
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
    const person = { name: 'Е. С.', sex: 'f', age: 50, weight: 90, height: 165, meds: ['semaglutide'] };
    const body = {
      person, days: 7, goal: 'lose', dislikes: ['beef', 'нещо'], swaps: { '2.1.0': 1, 'бла': 2 }, kcalAdjust: -150,
      training: { activities: ['walking'], daysPerWeek: 3, minutes: 45, restingHr: 70 }, save: true,
    };
    const res = await call('POST', '/api/nutrition/plan', body);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const plan = res.data.plan;
    assert.deepEqual(plan.input.dislikes, ['beef']);
    assert.deepEqual(plan.input.swaps, { '2.1.0': 1 });
    assert.equal(plan.input.kcalAdjust, -150);
    assert.equal(plan.flags.glp1, true, 'семаглутид от лекарствата');
    assert.equal(plan.training.hr.method, 'reserve');
    assert.equal(plan.training.targets.strengthDays, 3);
    const id = res.data.client.id;

    assert.equal((await call('POST', '/api/nutrition/plan', { ...body, kcalAdjust: 900 })).status, 400);
    assert.equal((await call('POST', '/api/nutrition/plan', { ...body, training: { ...body.training, restingHr: 20 } })).status, 400);

    // Теглата между режимите — по едно на ден; бъдеща дата не се приема.
    const w1 = await call('POST', `/api/nutrition/clients/${id}/weights`, { date: '2026-01-10', weight: 89.4 });
    assert.equal(w1.status, 200, JSON.stringify(w1.data));
    await call('POST', `/api/nutrition/clients/${id}/weights`, { date: '2026-01-10', weight: '89,1' });
    const got = await call('GET', `/api/nutrition/clients/${id}`);
    assert.deepEqual(got.data.client.weights, [{ date: '2026-01-10', weight: 89.1 }]);
    assert.equal((await call('POST', `/api/nutrition/clients/${id}/weights`, { date: '2099-01-01', weight: 80 })).status, 400);
    assert.equal((await call('POST', `/api/nutrition/clients/${id}/weights`, { weight: 10 })).status, 400);
    assert.equal((await call('DELETE', `/api/nutrition/clients/${id}/weights/2026-01-10`)).status, 200);
    assert.equal((await call('DELETE', `/api/nutrition/clients/${id}/weights/2026-01-10`)).status, 404);
    // Данните на човека не изтриват теглата.
    await call('POST', `/api/nutrition/clients/${id}/weights`, { date: '2026-02-01', weight: 88 });
    await call('PUT', `/api/nutrition/clients/${id}`, { ...person, name: 'Е. С. Т.' });
    assert.equal((await call('GET', `/api/nutrition/clients/${id}`)).data.client.weights.length, 1);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('каталогът: всяка храна, която може да се изключи, има име', () => {
  for (const [id, f] of Object.entries(FOODS)) assert.ok(f.name && !/undefined/.test(f.name), id);
});
