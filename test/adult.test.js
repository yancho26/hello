/* Версия 2.0: възрастни пациенти — калкулатори, скали, лекарства, хранене,
 * календар, диспансерно наблюдение и приложният интерфейс. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../lib/store.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import { addDays, addMonths, today } from '../public/js/shared/dates.js';
import {
  ckdStage, cha2ds2va, crclCockcroftGault, egfrCkdEpi2021, fib4, score2, score2Diabetes,
} from '../public/js/shared/clinical.js';
import { evaluate } from '../public/js/shared/mental.js';
import { checkMedications, renewals } from '../public/js/shared/meds.js';
import { nutritionPlan } from '../public/js/shared/nutrition.js';
import { computePlan, findScheduleItem } from '../public/js/shared/schedule.js';
import { defaultSchedule } from '../public/js/shared/calendar.js';
import { monitoringTasks } from '../public/js/shared/chronic.js';
import { adultSummary } from '../public/js/shared/adult.js';

const T = today();
const born = (years) => addMonths(T, -12 * years);
const r1 = (v) => Math.round(v * 10) / 10;

/* ------------------------------ калкулатори ------------------------------ */

test('SCORE2 съвпада с примера от ESC 2021 за всички региони', () => {
  const base = { age: 50, smoker: true, sbp: 140, tchol: 6.3, hdl: 1.4 };
  const m = ['low', 'moderate', 'high'].map(region => score2({ ...base, sex: 'm', region }).risk);
  const f = ['low', 'moderate', 'high'].map(region => score2({ ...base, sex: 'f', region }).risk);
  assert.deepEqual(m, [6.3, 8.1, 8.8]);
  assert.deepEqual(f, [4.3, 5.2, 7.1]);
  assert.equal(score2({ ...base, sex: 'm', age: 72 }), null, 'над 69 г. — SCORE2-OP, не SCORE2');
  assert.equal(score2({ ...base, sex: 'm', hdl: undefined }), null);
});

test('SCORE2-Diabetes съвпада с референтните стойности', () => {
  const d1 = { age: 60, smoker: false, sbp: 140, tchol: 5.5, hdl: 1.3, ageAtDiagnosis: 60, hba1c: 50, egfr: 90 };
  const d2 = { age: 60, smoker: false, sbp: 140, tchol: 5.5, hdl: 1.3, ageAtDiagnosis: 50, hba1c: 70, egfr: 60 };
  const regions = ['low', 'moderate', 'high', 'very_high'];
  const run = (d) => regions.flatMap(region => ['m', 'f'].map(sex => score2Diabetes({ ...d, sex, region }).risk));
  assert.deepEqual(run(d1), [8.4, 6.1, 11.0, 7.6, 12.5, 11.1, 20.3, 20.6]);
  assert.deepEqual(run(d2), [12.9, 9.8, 17.2, 12.7, 21.0, 20.4, 31.2, 34.0]);
});

test('бъбречна функция: CKD-EPI 2021, Cockcroft–Gault и KDIGO', () => {
  // Креатинин 88,4 µmol/L = 1,0 mg/dL; 60-годишен мъж — около 86 по CKD-EPI 2021.
  const e = egfrCkdEpi2021(88.4, 60, 'm');
  assert.ok(e >= 85 && e <= 87, `eGFR ${e}`);
  assert.ok(egfrCkdEpi2021(88.4, 60, 'f') < e, 'при жена със същия креатинин eGFR е по-ниска');
  const crcl = crclCockcroftGault(120, 80, 60, 'f');
  assert.ok(crcl > 30 && crcl < 36, `CrCl ${crcl}`);
  const st = ckdStage(40, 35);
  assert.equal(st.g, 'G3b');
  assert.equal(st.a, 'A3');
  assert.equal(st.risk, 'very_high');
});

test('CHA2DS2-VA и FIB-4', () => {
  assert.equal(cha2ds2va({ hf: false, htn: true, age: 76, diabetes: true, stroke: false, vascular: false }).score, 4);
  assert.equal(cha2ds2va({ hf: false, htn: false, age: 50, diabetes: false, stroke: false, vascular: false }).score, 0);
  const f = fib4(55, 40, 30, 180);
  assert.ok(Math.abs(f.value - r1((55 * 40) / (180 * Math.sqrt(30)))) < 0.11);
});

/* --------------------------------- скали --------------------------------- */

test('PHQ-9: степен и задължителен сигнал при въпрос 9', () => {
  const calm = evaluate('phq9', [1, 1, 1, 1, 0, 0, 0, 0, 0]);
  assert.equal(calm.score, 4);
  assert.equal(calm.alerts.length, 0);
  const risk = evaluate('phq9', [2, 2, 2, 2, 1, 1, 1, 0, 1]);
  assert.equal(risk.score, 12);
  assert.equal(risk.label, 'умерена депресия');
  assert.equal(risk.severity, 3, 'положителен въпрос 9 вдига тежестта');
  assert.equal(risk.alerts.length, 1);
  assert.throws(() => evaluate('phq9', [1, 1, 1]), /отговор/);
});

test('AUDIT-C: прагът е различен за мъже и жени', () => {
  assert.equal(evaluate('auditc', [1, 1, 1], { sex: 'f' }).severity, 2);
  assert.equal(evaluate('auditc', [1, 1, 1], { sex: 'm' }).severity, 0);
  assert.equal(evaluate('auditc', [4, 2, 2], { sex: 'm' }).severity, 3);
});

/* ------------------------------- лекарства ------------------------------- */

const med = (id, drug, extra = {}) => ({ id, drug, start: addMonths(T, -12), ...extra });

test('лекарства: „троен удар“, противопоказана комбинация и бъбречна доза', () => {
  const p = {
    birthDate: born(70), sex: 'm',
    meds: [med('a', 'ramipril'), med('b', 'hydrochlorothiazide'), med('c', 'ibuprofen'), med('d', 'sacubitril+valsartan'), med('e', 'metformin')],
  };
  const alerts = checkMedications(p, { age: 70, egfr: 25, crcl: 24, conditions: new Set(['htn', 'dm2']) });
  const titles = alerts.map(a => a.title);
  assert.ok(titles.includes('ACEi/сартан + диуретик + НСПВС'));
  assert.ok(alerts.some(a => a.severity === 'contra' && a.meds.includes('a') && a.meds.includes('d')), 'ACEi + ARNI');
  assert.ok(alerts.some(a => a.type === 'renal' && a.meds.includes('e')), 'метформин при eGFR 25');
  assert.ok(alerts.some(a => a.type === 'elderly' && a.meds.includes('c')), 'НСПВС при 65+');
  assert.equal(alerts[0].severity, 'contra', 'най-тежките са първи');
});

test('лекарства: липсващ антикоагулант и изтичащи рецепти и протоколи', () => {
  const p = {
    birthDate: born(75), sex: 'f',
    meds: [
      med('a', 'bisoprolol', { prescribedOn: addDays(T, -28), supplyDays: 30 }),
      med('b', 'rosuvastatin', { protocolUntil: addDays(T, -2) }),
      med('c', 'amlodipine', { end: addDays(T, -1) }),
    ],
  };
  const alerts = checkMedications(p, { age: 75, conditions: new Set(['af', 'htn']), cha2ds2va: 3 });
  assert.ok(alerts.some(a => a.type === 'missing' && /антикоагулант/.test(a.title)));
  const rn = renewals(p);
  assert.deepEqual(rn.map(r => [r.kind, r.medId, r.status]), [['protocol', 'b', 'overdue'], ['rx', 'a', 'due']]);
});

/* -------------------------------- хранене -------------------------------- */

test('хранителен режим: дефицит при отслабване и ограничен белтък при ХБЗ', () => {
  const base = { sex: 'm', age: 60, weight: 100, height: 175, activity: 'sedentary' };
  const lose = nutritionPlan({ ...base, goal: 'lose' });
  const keep = nutritionPlan({ ...base, goal: 'maintain' });
  assert.ok(keep.targets.kcal - lose.targets.kcal >= 400, 'дефицит около 500 kcal');
  assert.ok(lose.targets.kcal >= 1500, 'не под безопасния минимум за мъж');

  const ckd = nutritionPlan({ ...base, conditions: new Set(['ckd']), egfr: 35, potassium: 5.6 });
  assert.equal(ckd.targets.proteinPerKg, 0.8);
  assert.ok(ckd.warnings.length || ckd.notes.some(n => /калий/i.test(n)), 'високият калий се отбелязва');
  for (const meal of ckd.meals) assert.ok(meal.options.length >= 1);
  const day = ckd.day;
  assert.ok(Math.abs(day.kcal - ckd.targets.kcal) / ckd.targets.kcal < 0.15, `денят е близо до целта: ${day.kcal} / ${ckd.targets.kcal}`);

  assert.throws(() => nutritionPlan({ ...base, age: 15 }), /възрастни/);
});

/* ---------------------------- календар и наблюдение ---------------------------- */

const schedule = defaultSchedule();

test('календар за възрастни: наваксване от регистрацията, пол и рискови ваксини', () => {
  const reg = addMonths(T, -2);
  const woman = { birthDate: born(55), sex: 'f', createdAt: reg + 'T09:00:00Z', records: {}, chronic: [] };
  const plan = computePlan(woman, schedule, { asOf: T });
  const ids = plan.map(e => e.id);
  assert.ok(ids.some(id => id.startsWith('ad-mammo@')), 'мамография при жена на 55 г.');
  assert.ok(!ids.some(id => id.startsWith('hexa-')), 'детският календар не важи за регистрирана като възрастна');
  const check = plan.find(e => e.id.startsWith('ad-checkup@') && e.status !== 'future');
  assert.ok(check, 'текущ профилактичен преглед');
  assert.ok(check.due >= reg, 'пропуснатото преди регистрацията започва от датата на регистрация');

  const man = { ...woman, sex: 'm' };
  assert.ok(!computePlan(man, schedule, { asOf: T }).some(e => e.id.startsWith('ad-mammo@')));

  // Грипна ваксина преди 65 г. — само при хронично заболяване с повишен риск.
  const flu = (p) => computePlan(p, schedule, { asOf: T }).some(e => e.id.startsWith('ad-flu@'));
  assert.equal(flu(man), false);
  assert.equal(flu({ ...man, chronic: [{ id: 'c1', code: 'dm2', since: addMonths(T, -24), status: 'active' }] }), true);

  const found = findScheduleItem(schedule, check.id);
  assert.equal(found.base.id, 'ad-checkup');
  assert.equal(findScheduleItem(schedule, 'ad-checkup'), null, 'повтарящата се дейност се записва по повторение');
  assert.equal(findScheduleItem(schedule, 'ad-checkup@229'), null, 'несъществуващо повторение');
});

test('диспансерно наблюдение: изследванията се водят по последния резултат', () => {
  const reg = addMonths(T, -30);
  const p = {
    birthDate: born(62), sex: 'm', createdAt: reg + 'T09:00:00Z',
    chronic: [{ id: 'c1', code: 'dm2', since: addMonths(T, -60), status: 'active' }],
    results: [{ id: 'r1', date: addMonths(T, -2), code: 'hba1c', value: 7.4 }],
    meds: [], assessments: [], measurements: [], visits: [],
  };
  const tasks = monitoringTasks(p, { asOf: T });
  const a1c = tasks.find(t => t.req === 'hba1c');
  assert.equal(a1c.status, 'future');
  assert.equal(a1c.due, addMonths(addMonths(T, -2), 6));
  const eye = tasks.find(t => t.req === 'eye');
  assert.equal(eye.status, 'overdue', 'без запис — дължимо от регистрацията');
  assert.ok(tasks.some(t => t.id === 'mon:review'));
});

test('обобщение: SCORE2-Diabetes, CHA2DS2-VA и сигнал от PHQ-9', () => {
  const p = {
    birthDate: born(64), sex: 'm', createdAt: addMonths(T, -12) + 'T09:00:00Z',
    lifestyle: { smoking: 'current' },
    chronic: ['dm2', 'htn', 'af'].map((code, i) => ({ id: 'c' + i, code, since: addMonths(T, -120), status: 'active' })),
    measurements: [{ id: 'm1', date: T, weight: 92, height: 176, systolic: 152, diastolic: 88 }],
    results: [
      ['tchol', 6.1], ['hdl', 1.0], ['ldl', 4.0], ['hba1c', 8.2], ['creat', 95],
    ].map(([code, value], i) => ({ id: 'r' + i, date: T, code, value })),
    meds: [med('x', 'metformin')],
    assessments: [{ id: 'a1', date: T, tool: 'phq9', score: 12, result: evaluate('phq9', [2, 2, 2, 2, 1, 1, 1, 0, 1]) }],
    visits: [],
  };
  const s = adultSummary(p, { asOf: T });
  assert.equal(s.cv.model, 'SCORE2-Diabetes');
  assert.equal(s.cv.category, 'very_high');
  assert.equal(s.calculators.cha2ds2va.score, 2, 'хипертония + диабет; 64 г. още не носи точка');
  assert.ok(s.medAlerts.some(a => a.type === 'missing' && /антикоагулант/.test(a.title)));
  assert.ok(s.mental.alerts.some(a => a.severity === 3));
  assert.ok(s.control.find(c => c.id === 'hba1c').status !== 'ok');
});

/* --------------------------- приложен интерфейс --------------------------- */

async function withApp(fn, seed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-adult-'));
  if (seed) fs.writeFileSync(path.join(dir, 'practice.json'), JSON.stringify(seed));
  const store = new Store(dir);
  store.settings.requireLogin = false;
  if (!store.data.doctors.length) store.data.doctors.push({ id: 'd1', name: 'д-р Тест', role: 'ОПЛ', active: true });
  const server = createAppServer({ store, serveStatic: memoryStatic({ 'index.html': 'x' }) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  };
  try {
    await fn(call, store);
  } finally {
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('обновяване от 1.x: календарът за възрастни и новите полета се добавят веднъж', async () => {
  const old = {
    version: 1, appVersion: '1.1.0',
    practice: { name: 'Стара практика' },
    doctors: [{ id: 'd1', name: 'д-р Стар', active: true }],
    patients: [{ id: 'p1', name: 'Дете', birthDate: born(5), sex: 'm', records: {} }],
    schedule: defaultSchedule().filter(i => i.track !== 'adult'),
    settings: { horizonDays: 30, requireLogin: false },
  };
  await withApp(async (call, store) => {
    const adultCount = store.schedule.filter(i => i.track === 'adult').length;
    assert.ok(adultCount > 10);
    store.migrate();
    assert.equal(store.schedule.filter(i => i.track === 'adult').length, adultCount, 'не се дублира');
    assert.equal(store.settings.cvRegion, 'very_high');
    const p = store.patient('p1');
    for (const k of ['chronic', 'meds', 'results', 'assessments', 'nutritionPlans']) assert.ok(Array.isArray(p[k]), k);
    const res = await call('GET', '/api/patients/p1');
    assert.equal(res.status, 200);
    assert.equal(res.data.adult, null, 'дете — без обобщение за възрастни');
  }, old);
});

test('възрастен пациент през API: заболяване, лекарства, резултати, скали, хранене, задачи и справки', async () => {
  await withApp(async (call, store) => {
    const created = await call('POST', '/api/patients', { name: 'Иван Петров', birthDate: born(66), sex: 'm' });
    assert.equal(created.status, 200);
    const id = created.data.patient.id;

    // Заболявания.
    const dm = await call('POST', `/api/patients/${id}/chronic`, { code: 'dm2', since: addMonths(T, -60), targets: { hba1c: 7.5 } });
    assert.equal(dm.status, 200);
    assert.equal((await call('POST', `/api/patients/${id}/chronic`, { code: 'dm2' })).status, 400, 'без повторение');
    assert.equal((await call('POST', `/api/patients/${id}/chronic`, { code: 'xyz' })).status, 400);
    await call('POST', `/api/patients/${id}/chronic`, { code: 'htn', since: addMonths(T, -96), targets: { bp: '140/90' } });
    assert.equal((await call('POST', `/api/patients/${id}/chronic`, { code: 'ckd', targets: { bp: '140' } })).status, 400);

    // Измерване с талия и пулс.
    const m = await call('POST', `/api/patients/${id}/measurements`, { weight: 95, height: 178, waist: 108, systolic: 150, diastolic: 92, pulse: 78 });
    assert.equal(m.status, 200);
    assert.equal(m.data.measurement.waist, 108);

    // Лекарства и сигнали.
    const r1 = await call('POST', `/api/patients/${id}/meds`, { drug: 'ramipril', dose: '5 мг', schedule: { m: '1' } });
    assert.equal(r1.status, 200);
    await call('POST', `/api/patients/${id}/meds`, { drug: 'hydrochlorothiazide', dose: '12,5 мг', schedule: { m: '1' } });
    const nsaid = await call('POST', `/api/patients/${id}/meds`, { drug: 'ibuprofen', dose: '400 мг', prn: true });
    assert.ok(nsaid.data.alerts.some(a => a.title === 'ACEi/сартан + диуретик + НСПВС'), 'сигналът се връща веднага');
    assert.equal((await call('POST', `/api/patients/${id}/meds`, { drug: 'ramipril' })).status, 400, 'вече е в списъка');
    assert.equal((await call('POST', `/api/patients/${id}/meds`, { drug: 'няма-такова' })).status, 400);
    const custom = await call('POST', `/api/patients/${id}/meds`, { name: 'Билков чай', chronic: false });
    assert.equal(custom.status, 200);
    const stop = await call('PATCH', `/api/patients/${id}/meds/${nsaid.data.med.id}`, { end: T, stopReason: 'троен удар' });
    assert.equal(stop.status, 200);

    // Резултати: мерните единици се превръщат; липидите затварят скрининга в календара.
    const res = await call('POST', `/api/patients/${id}/results`, {
      date: T,
      items: [
        { code: 'hba1c', value: 64, unit: 'mmol/mol' },
        { code: 'tchol', value: 5.8 }, { code: 'hdl', value: 1.1 }, { code: 'ldl', value: 3.6 },
        { code: 'creat', value: 1.2, unit: 'mg/dL' },
        { code: 'eye', text: 'без ретинопатия' },
      ],
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const a1c = res.data.results.find(x => x.code === 'hba1c');
    assert.ok(Math.abs(a1c.value - 8.0) < 0.05, `HbA1c ${a1c.value}%`);
    const creat = res.data.results.find(x => x.code === 'creat');
    assert.ok(Math.abs(creat.value - 106.1) < 0.5, `креатинин ${creat.value} µmol/L`);
    assert.ok(res.data.closed.some(n => /Липиден профил|Кръвна захар/.test(n)), `затворени: ${res.data.closed}`);
    assert.equal((await call('POST', `/api/patients/${id}/results`, { items: [{ code: 'hba1c', value: 99 }] })).status, 400);
    assert.equal((await call('POST', `/api/patients/${id}/results`, { date: addDays(T, 3), items: [{ code: 'k', value: 4 }] })).status, 400);

    // Скали: PHQ-4 затваря скрининга; въпрос 9 дава сигнал.
    const phq4 = await call('POST', `/api/patients/${id}/assessments`, { tool: 'phq4', answers: [1, 1, 2, 2] });
    assert.equal(phq4.status, 200);
    assert.ok(phq4.data.closed.length >= 1);
    const phq9 = await call('POST', `/api/patients/${id}/assessments`, { tool: 'phq9', answers: [2, 2, 1, 1, 1, 1, 1, 0, 1] });
    assert.equal(phq9.data.assessment.result.alerts.length, 1);
    assert.equal((await call('POST', `/api/patients/${id}/assessments`, { tool: 'phq9', answers: [1] })).status, 400);
    assert.equal((await call('POST', `/api/patients/${id}/assessments`, { tool: 'score2op' })).status, 400, 'стойността е задължителна');

    // Начин на живот.
    const ls = await call('PUT', `/api/patients/${id}/lifestyle`, { smoking: 'current', alcohol: 'low', activity: 'light' });
    assert.equal(ls.status, 200);
    assert.equal((await call('PUT', `/api/patients/${id}/lifestyle`, { smoking: 'понякога' })).status, 400);

    // Досие: обобщението за възрастни.
    const full = (await call('GET', `/api/patients/${id}`)).data;
    assert.equal(full.isAdult, true);
    assert.equal(full.adult.cv.model, 'SCORE2-Diabetes');
    assert.ok(full.adult.mental.alerts.some(a => a.severity === 3));
    assert.ok(full.adult.control.some(c => c.id === 'bp' && c.target.includes('индивидуална')));
    assert.ok(full.plan.some(e => e.track === 'adult' && e.closesWith));

    // Запис на повтаряща се дейност по повторение.
    const chk = full.plan.find(e => e.baseId === 'ad-checkup' && ['due', 'overdue', 'soon'].includes(e.status));
    const put = await call('PUT', `/api/patients/${id}/records/${encodeURIComponent(chk.id)}`, { status: 'done', date: T });
    assert.equal(put.status, 200);
    assert.equal((await call('PUT', `/api/patients/${id}/records/ad-checkup`, { status: 'done' })).status, 404);

    // Хранителен режим.
    const plan = await call('POST', `/api/patients/${id}/nutrition`, { goal: 'lose', save: true });
    assert.equal(plan.status, 200, JSON.stringify(plan.data));
    assert.ok(plan.data.saved.id);
    assert.ok(plan.data.plan.medNotes.length >= 1, 'бележки за храни от лекарствата');
    const kid = await call('POST', '/api/patients', { name: 'Дете', birthDate: born(8), sex: 'f' });
    assert.equal((await call('POST', `/api/patients/${kid.data.patient.id}/nutrition`, {})).status, 400);

    // Списък: филтри и флагове.
    const adults = (await call('GET', '/api/patients?group=adult')).data.patients;
    assert.deepEqual(adults.map(x => x.id), [id]);
    assert.equal(adults[0].ageGroup, 'adult');
    assert.ok(adults[0].adult.mentalUrgent >= 1);
    assert.equal((await call('GET', '/api/patients?group=child')).data.patients.length, 1);
    assert.equal((await call('GET', '/api/patients?condition=htn')).data.patients.length, 1);

    // Задачи: диспансерното наблюдение е в общия списък.
    const tasks = (await call('GET', '/api/tasks')).data.buckets;
    const all = [...tasks.overdue, ...tasks.today, ...tasks.soon];
    assert.ok(all.some(t => t.group === 'monitoring' && t.patientId === id));

    // Справки: регистър на хроничните заболявания.
    const rep = (await call('GET', '/api/reports')).data;
    assert.equal(rep.adults.total, 1);
    assert.equal(rep.totals.children, 1);
    const dmRow = rep.chronic.find(c => c.code === 'dm2');
    assert.equal(dmRow.count, 1);
    assert.equal(dmRow.uncontrolled, 1, 'HbA1c 8,0% над индивидуалната цел 7,5%');
    assert.ok(rep.prevention.length > 0);

    // Настройки: регион за SCORE2.
    assert.equal((await call('PATCH', '/api/settings', { cvRegion: 'moderate' })).status, 200);
    assert.equal((await call('PATCH', '/api/settings', { cvRegion: 'mars' })).status, 400);
    const again = (await call('GET', `/api/patients/${id}`)).data;
    assert.ok(again.adult.cv.score < full.adult.cv.score, 'по-нисък риск в регион с умерен риск');

    // Изтриване.
    assert.equal((await call('DELETE', `/api/patients/${id}/meds/${custom.data.med.id}`)).status, 200);
    assert.equal((await call('DELETE', `/api/patients/${id}/results/${a1c.id}`)).status, 200);
    assert.equal((await call('DELETE', `/api/patients/${id}/assessments/${phq9.data.assessment.id}`)).status, 200);
    assert.equal((await call('DELETE', `/api/patients/${id}/chronic/${dm.data.condition.id}`)).status, 200);
    assert.equal((await call('DELETE', `/api/patients/${id}/nutrition/${plan.data.saved.id}`)).status, 200);
    const audit = store.readAudit(100).map(e => e.action);
    for (const a of ['chronic_add', 'med_add', 'med_stop', 'results_add', 'assessment_add', 'lifestyle_update', 'nutrition_save', 'med_delete']) {
      assert.ok(audit.includes(a), a);
    }
  });
});
