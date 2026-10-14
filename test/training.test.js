/* Версия 4.7: тренировъчен план, синхронизиран с храненето и менструалния цикъл. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ACTIVITIES, INTENSITY, activityFromTraining, sessionContent, trainingNutrition, trainingPlan, trainingSafety } from '../public/js/shared/training.js';
import { nutritionPlan } from '../public/js/shared/nutrition.js';
import { Store } from '../lib/store.js';
import { Workspaces } from '../lib/workspaces.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import { addDays, addMonths, daysBetween, today } from '../public/js/shared/dates.js';

const START = '2026-10-14';
const person = { start: START, sex: 'f', age: 35, weight: 65, bmi: 23, cond: new Set(), codes: [], classes: new Set() };
const week = (p, w) => p.days.filter(d => d.week === w);
const allSessions = (p) => p.days.flatMap(d => d.sessions);

test('тренировки: каталог с MET по Compendium 2024 и интензивност по СЗО', () => {
  assert.ok(Object.keys(ACTIVITIES).length >= 15);
  for (const [id, a] of Object.entries(ACTIVITIES)) {
    assert.ok(a.label && a.icon && a.role, id);
    for (const k of Object.keys(INTENSITY)) assert.ok(a.met[k] >= 1.5 && a.met[k] <= 12, `${id} ${k}`);
    assert.ok(a.met.light <= a.met.moderate && a.met.moderate <= a.met.vigorous, `${id}: MET расте с интензивността`);
  }
  assert.equal(ACTIVITIES.running.met.moderate, 8.5);
  assert.equal(ACTIVITIES.reformer.met.moderate, 2.8);
  for (const id of ['gym', 'running', 'reformer', 'matpilates', 'yoga', 'swimming', 'cycling', 'walking', 'team', 'racket', 'dance', 'hiit', 'hiking', 'rowing', 'taichi']) {
    assert.ok(ACTIVITIES[id], id);
  }
});

test('тренировки: всяка седмица — аеробни поне 150 мин и силови поне 2 дни (СЗО)', () => {
  for (const activities of [['running'], ['reformer'], ['gym'], ['walking', 'yoga'], ['swimming', 'matpilates'], ['team', 'racket'], []]) {
    for (const daysPerWeek of [2, 3, 5]) {
      const p = trainingPlan({ ...person, activities, daysPerWeek, minutes: 45, level: 'intermediate' });
      assert.equal(p.days.length, 28);
      assert.equal(p.weeks.length, 4);
      for (const w of p.weeks) {
        assert.ok(w.aerobic >= 150, `${activities} × ${daysPerWeek}: аеробни ${w.aerobic}`);
        assert.ok(w.strength >= 2, `${activities} × ${daysPerWeek}: силови ${w.strength}`);
      }
      const trainDays = week(p, 1).filter(d => d.sessions.some(s => !s.extra)).length;
      assert.equal(trainDays, daysPerWeek, 'избраният брой дни');
    }
  }
  // При цел отслабване — към горната граница, 300 мин.
  const w = trainingPlan({ ...person, activities: ['gym', 'cycling'], daysPerWeek: 3, focus: 'weight' });
  assert.equal(w.targets.aerobic, 300);
  assert.ok(w.weeks.every(x => x.aerobic >= 300));
});

test('тренировки: силовите не са в поредни дни, натоварването расте постепенно', () => {
  const p = trainingPlan({ ...person, activities: ['gym', 'running'], daysPerWeek: 5, minutes: 60, level: 'intermediate', focus: 'muscle' });
  for (let w = 0; w < 4; w++) {
    const dates = week(p, w).filter(d => d.sessions.some(s => s.activity === 'gym')).map(d => d.date);
    assert.ok(dates.length >= 2);
    if (dates.length <= 3) for (let i = 1; i < dates.length; i++) assert.ok(daysBetween(dates[i - 1], dates[i]) >= 2, `седмица ${w + 1}: ${dates}`);
  }
  const mins = (pl, w) => week(pl, w).flatMap(d => d.sessions).filter(s => !s.extra).reduce((a, s) => a + s.minutes, 0);
  assert.ok(mins(p, 0) <= mins(p, 1) && mins(p, 1) <= mins(p, 2), 'расте');
  assert.ok(mins(p, 3) < mins(p, 2), '4-тата седмица е по-лека');
  const b = trainingPlan({ ...person, activities: ['running'], daysPerWeek: 3, minutes: 30, level: 'beginner' });
  assert.ok(allSessions(b).filter(s => s.week < 2 && !s.extra).every(s => s.intensity !== 'vigorous'), 'начинаещите — без интензивни първите 2 седмици');
  assert.match(b.days.find(d => d.sessions[0]?.activity === 'running').sessions[0].blocks[1].text, /бягане \+ 2 мин ходене/);
  // Съдържание за всеки вид тренировка.
  for (const id of Object.keys(ACTIVITIES)) {
    for (const intensity of Object.keys(INTENSITY)) {
      const blocks = sessionContent({ activity: id, intensity, minutes: 45, level: 'intermediate', week: 1, variant: 'A' });
      assert.ok(blocks.length && blocks.every(x => x.name && x.text && !x.text.includes('undefined')), `${id} ${intensity}`);
    }
  }
});

test('тренировки: безопасност при бременност, остеопороза, сърце, диабет и лекарства', () => {
  const preg = trainingPlan({ ...person, activities: ['running', 'team', 'reformer'], level: 'beginner', pregnancy: true, pregnancyWeek: 24 });
  assert.ok(preg.removed.some(r => r.activity === 'team' && !r.replacedBy));
  assert.ok(preg.removed.some(r => r.activity === 'running' && r.replacedBy === 'walking'));
  assert.ok(!allSessions(preg).some(s => s.activity === 'team' || s.activity === 'running'));
  assert.ok(allSessions(preg).every(s => s.intensity !== 'vigorous'));
  assert.match(allSessions(preg).find(s => s.activity === 'reformer').blocks[1].text, /седнал, на колене и настрани/);
  assert.ok(preg.warnings.some(w => /ACOG 2020/.test(w)));
  // Бягала преди бременността — продължава.
  assert.ok(allSessions(trainingPlan({ ...person, activities: ['running'], level: 'advanced', pregnancy: true, pregnancyWeek: 10 })).some(s => s.activity === 'running'));

  const ost = trainingPlan({ ...person, age: 70, activities: ['matpilates', 'running'], cond: new Set(['osteoporosis']), codes: ['M80.0'] });
  assert.ok(ost.removed.some(r => r.activity === 'running' && r.replacedBy === 'walking'));
  assert.equal(ost.targets.balanceDays, 7);
  assert.ok(ost.days.every(d => d.addOns.some(a => a.kind === 'balance')), 'баланс всеки ден');
  assert.match(allSessions(ost).find(s => s.activity === 'matpilates').blocks[1].text, /Без „hundred“/);

  const heart = trainingPlan({ ...person, age: 62, activities: ['cycling', 'hiit'], level: 'advanced', cond: new Set(['chd', 'dm2', 'htn']), classes: new Set(['BB', 'INSULIN']), inactive: true, bp: { sys: 168, dia: 96 } });
  assert.ok(allSessions(heart).every(s => s.intensity !== 'vigorous'));
  assert.equal(heart.hr, null, 'бета-блокер — без пулс');
  for (const re of [/ACSM 2015/, /ESC 2020/, /168\/96/, /15–30 г бързи въглехидрати/]) assert.ok(heart.warnings.some(w => re.test(w)), String(re));
  assert.ok(heart.timeAdvice.some(t => /Buffey 2022/.test(t)) && heart.timeAdvice.some(t => /нощна хипогликемия/.test(t)));

  const oac = trainingSafety({ age: 50, classes: new Set(['DOAC']) });
  assert.ok(oac.exclude.has('team'));
  const obese = trainingPlan({ ...person, bmi: 38, activities: ['running', 'hiit'], level: 'beginner' });
  assert.ok(obese.removed.some(r => r.activity === 'running'));
  assert.ok(!allSessions(obese).filter(s => s.activity === 'hiit').some(s => /подскок/.test(s.blocks[1].text)));
});

test('тренировки и цикъл: съвети по фази, по избор — интензивните във фоликуларната', () => {
  const phases = Array.from({ length: 28 }, (_, i) => {
    const day = i + 1;
    const phase = day <= 5 ? 'menstrual' : day <= 12 ? 'follicular' : day <= 15 ? 'ovulation' : day <= 23 ? 'luteal' : 'premenstrual';
    return { date: addDays(START, i), day, phase, label: phase, icon: '·' };
  });
  const p = trainingPlan({ ...person, activities: ['running', 'gym'], level: 'advanced', daysPerWeek: 5, phases });
  assert.ok(p.cycle.some(t => /McNulty 2020/.test(t)) && p.cycle.some(t => /Cochrane 2019/.test(t)));
  assert.match(p.days[0].cycle.text, /по самочувствие/);
  assert.match(p.days.find(d => d.cycle.phase === 'luteal').cycle.text, /течности/);
  const per = trainingPlan({ ...person, activities: ['running', 'gym'], level: 'advanced', daysPerWeek: 5, phases, cyclePeriodize: true });
  const vigInFoll = (pl) => pl.days.filter(d => d.sessions.some(s => s.intensity === 'vigorous') && ['follicular', 'ovulation'].includes(d.cycle.phase)).length;
  assert.ok(vigInFoll(per) >= vigInFoll(p), 'интензивните се местят към фоликуларната фаза');
  assert.equal(allSessions(per).filter(s => s.intensity === 'vigorous').length, allSessions(p).filter(s => s.intensity === 'vigorous').length, 'броят им е същият');
  assert.equal(trainingPlan({ ...person, activities: ['gym'] }).cycle, null, 'без цикъл — без съвети за фазите');
});

test('тренировки и хранене: енергия по дни, белтък, активност, съвети около тренировката', () => {
  const base = { sex: 'm', age: 38, weight: 82, height: 180, activity: 'sedentary', goal: 'maintain', asOf: START };
  const training = { activities: ['gym', 'running'], level: 'intermediate', daysPerWeek: 4, minutes: 60, time: 'afternoon', focus: 'muscle' };
  const p = nutritionPlan({ ...base, days: 7, training });
  assert.ok(p.flags.training && p.training.days.length === 28);
  assert.equal(p.energy.activity, 'moderate', 'активността — по плана');
  assert.ok(p.notes.some(n => /по тренировъчния план/.test(n)));
  assert.ok(p.targets.proteinPerKg >= 1.4, 'цел „сила“ — повече белтък');
  const train = p.week.filter(d => d.training.sessions.some(s => !s.extra));
  const rest = p.week.filter(d => !d.training.sessions.length);
  assert.ok(train.length && rest.length);
  assert.ok(Math.min(...train.map(d => d.kcal)) > Math.max(...rest.map(d => d.kcal)), 'в тренировъчните дни — повече енергия');
  const avgAdd = p.week.reduce((s, d) => s + d.training.kcalAdd, 0) / 7;
  assert.ok(Math.abs(avgAdd) <= 10, `средно ${avgAdd}`);
  for (const d of p.week) assert.ok(Math.abs(d.totals.kcal - d.kcal) <= d.kcal * 0.08, `${d.label}: ${d.totals.kcal}/${d.kcal}`);
  const gymDay = p.week.find(d => d.training.sessions.some(s => s.activity === 'gym'));
  assert.ok(gymDay.training.tips.some(t => /20–40 г белтък/.test(t)) && gymDay.training.tips.some(t => /Следобедна тренировка/.test(t)));
  // Дълго бягане — въглехидрати по време.
  assert.ok(trainingNutrition({ sessions: [{ activity: 'running', minutes: 90, counted: 'vigorous', time: null }] }).some(t => /30–60 г въглехидрати/.test(t)));
  // Меню за ден — тренировката днес; месец — всеки ден.
  const one = nutritionPlan({ ...base, days: 1, training });
  assert.ok(one.trainingToday);
  const month = nutritionPlan({ ...base, days: 28, training });
  assert.ok(month.week.every(d => d.training));
  assert.equal(activityFromTraining(trainingPlan({ ...person, activities: ['walking'], daysPerWeek: 2 })), 'light');
  // Без тренировъчен план всичко е както досега.
  const plain = nutritionPlan({ ...base, days: 7 });
  assert.equal(plain.training, null);
  assert.equal(plain.energy.activity, 'sedentary');
});

test('API: тренировъчен план — проверка, запис, налягането от досието', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-train-'));
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
    const pt = await call('POST', '/api/patients', { name: 'Елена Петрова', birthDate: addMonths(today(), -12 * 44), sex: 'f' });
    const id = pt.data.patient.id;
    await call('POST', `/api/patients/${id}/measurements`, { weight: 72, height: 166, systolic: 172, diastolic: 104 });
    const training = { activities: ['reformer', 'running', 'swimming'], level: 'intermediate', daysPerWeek: 4, minutes: 45, time: 'morning', focus: 'health' };
    const res = await call('POST', `/api/patients/${id}/nutrition`, { days: 7, training, save: true });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.ok(res.data.plan.training.warnings.some(w => /172\/104/.test(w)), 'налягането от досието');
    assert.deepEqual(res.data.plan.input.training.activities, training.activities);
    const saved = (await call('GET', `/api/patients/${id}`)).data.patient.nutritionPlans[0].plan;
    assert.equal(saved.training.days.length, 28);
    for (const bad of [
      { activities: ['парашут'] }, { daysPerWeek: 9 }, { daysPerWeek: 1 }, { minutes: 50 }, { level: 'pro' }, { time: 'нощ' }, { focus: 'x' }, 'да', [1],
    ]) {
      const body = typeof bad === 'object' && !Array.isArray(bad) ? { ...training, ...bad } : bad;
      assert.equal((await call('POST', `/api/patients/${id}/nutrition`, { training: body })).status, 400, JSON.stringify(bad));
    }
    const ext = await call('POST', '/api/nutrition/plan', { person: { sex: 'm', age: 29, weight: 78, height: 182 }, days: 28, training: { activities: ['gym', 'team'], daysPerWeek: 5 } });
    assert.equal(ext.status, 200);
    assert.ok(ext.data.plan.week.every(d => d.training));
  } finally {
    server.close();
  }
});
