/* Версия 4.5: менструален цикъл — дневник, фази, оценка по FIGO и ASRM, и менюто
 * по фазите (cycle sync) с желязо и калций. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FOODS, RECIPES, totals } from '../public/js/shared/recipes.js';
import { CYCLE_KCAL, nutritionPlan } from '../public/js/shared/nutrition.js';
import { cleanCycle, cycleStats, mergeCycle, phaseOn, phasesFrom, variationLimit } from '../public/js/shared/cycle.js';
import { dietProfiles } from '../public/js/shared/diet-icd.js';
import { Store, normalizeData } from '../lib/store.js';
import { Workspaces } from '../lib/workspaces.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import { addDays, addMonths, today } from '../public/js/shared/dates.js';

const T = '2026-10-14';
const starts = (...ds) => ds.map(start => ({ start }));
const woman = { sex: 'f', age: 30, weight: 66, height: 166, activity: 'light', goal: 'maintain', asOf: T };

/* ------------------------------- цикъл ------------------------------- */

test('цикъл: фази по дни при 28-дневен цикъл', () => {
  const s = { lastStart: '2026-10-01', length: 28, bleed: 5 };
  const at = (day) => phaseOn(addDays('2026-10-01', day - 1), s).phase;
  assert.deepEqual([1, 5].map(at), ['menstrual', 'menstrual']);
  assert.deepEqual([6, 12].map(at), ['follicular', 'follicular']);
  assert.deepEqual([13, 14, 15].map(at), ['ovulation', 'ovulation', 'ovulation']);
  assert.deepEqual([16, 23].map(at), ['luteal', 'luteal']);
  assert.deepEqual([24, 28].map(at), ['premenstrual', 'premenstrual']);
  assert.equal(at(29), 'menstrual', 'следващият цикъл — прогноза');
  assert.ok(phaseOn('2026-10-29', s).predicted);
  assert.equal(phaseOn('2026-09-30', s), null, 'преди началото');
  // Дълъг цикъл: овулацията е 14 дни преди следващата менструация.
  assert.equal(phaseOn(addDays('2026-10-01', 34 - 1), { lastStart: '2026-10-01', length: 48, bleed: 5 }).phase, 'ovulation');
});

test('цикъл: дължина от дневника, прогноза и днешната фаза', () => {
  const s = cycleStats({ periods: [
    { start: '2026-07-01', days: 5 }, { start: '2026-07-29', days: 5 }, { start: '2026-08-27', days: 6 }, { start: '2026-09-24', days: 5 },
  ] }, { age: 32, asOf: T });
  assert.deepEqual(s.lengths, [28, 29, 28]);
  assert.equal(s.length, 28);
  assert.equal(s.lengthSource, 'records');
  assert.equal(s.bleed, 5);
  assert.equal(s.regular, true);
  assert.equal(s.variation, 1);
  assert.equal(s.today.day, 21);
  assert.equal(s.today.phase, 'luteal');
  assert.equal(s.nextStart, '2026-10-22');
  assert.ok(s.ovulation > T);
  assert.equal(s.flags.length, 0);
  // Без дневник: въведената дължина, иначе 28.
  assert.equal(cycleStats({ lastPeriod: '2026-10-01', length: 33 }, { asOf: T }).length, 33);
  const d = cycleStats({ lastPeriod: '2026-10-01' }, { asOf: T });
  assert.equal(d.length, 28);
  assert.equal(d.lengthSource, 'default');
  // Очаквана, но още невъведена менструация (до 6 дни) — прогнозата продължава.
  const pend = cycleStats({ periods: starts('2026-09-14'), length: 28 }, { asOf: T });
  assert.equal(pend.pending, 3);
  assert.equal(pend.today.phase, 'menstrual');
});

test('цикъл: оценка по FIGO 2018 и ASRM 2024', () => {
  const flags = (cycle, age = 30, asOf = T) => cycleStats(cycle, { age, asOf }).flags.map(f => f.code);
  // Нередовен: разлика над 7 дни на 26–41 г., над 9 на 18–25 г.
  assert.equal(variationLimit(30), 7);
  assert.equal(variationLimit(20), 9);
  assert.equal(variationLimit(43), 9);
  const irr = starts('2026-01-01', '2026-01-25', '2026-03-05', '2026-03-30', '2026-05-10', '2026-06-01');
  assert.ok(flags({ periods: irr }, 30, '2026-06-10').includes('irregular'));
  // Един различен цикъл не прави цикъла нередовен.
  const one = starts('2026-03-01', '2026-03-29', '2026-04-26', '2026-06-06', '2026-07-04', '2026-08-01');
  const f1 = flags({ periods: one }, 30, '2026-08-10');
  assert.ok(f1.includes('outlier') && !f1.includes('irregular'), f1.join());
  // Чести и редки.
  assert.ok(flags({ periods: starts('2026-08-01', '2026-08-21', '2026-09-10', '2026-09-30') }).includes('frequent'));
  assert.ok(flags({ periods: starts('2026-04-01', '2026-05-15', '2026-06-28', '2026-08-12') }, 30, '2026-08-20').includes('infrequent'));
  // Продължително и обилно кървене.
  assert.ok(flags({ periods: [{ start: '2026-09-01', days: 10 }, { start: '2026-09-29', days: 9 }] }).includes('prolonged'));
  assert.ok(flags({ periods: [{ start: '2026-09-29', days: 5, heavy: true }] }).includes('heavy'));
  // Закъснение от 7 дни и вторична аменорея над 3 месеца (6 при нередовен цикъл).
  const late = cycleStats({ periods: starts('2026-09-01'), length: 28 }, { asOf: T });
  assert.ok(late.flags.some(f => f.code === 'late') && late.late === 15 && late.today === null);
  assert.ok(flags({ periods: starts('2026-06-01'), length: 28 }).includes('amenorrhea'));
  assert.ok(!flags({ periods: [...irr] }, 30, '2026-10-14').includes('amenorrhea'), 'при нередовен цикъл — след 6 месеца');
  assert.ok(flags({ periods: [...irr] }, 30, '2026-12-14').includes('amenorrhea'));
  // Хормонална контрацепция и менопауза — без фази.
  const h = cycleStats({ lastPeriod: '2026-10-01', contraception: 'combined' }, { asOf: T });
  assert.ok(!h.natural && h.today === null && h.flags.some(f => f.code === 'hormonal'));
  assert.equal(phasesFrom(h, T, 7).length, 0);
  assert.ok(cycleStats({ lastPeriod: '2026-10-01', menopause: true }, { asOf: T }).flags.some(f => f.code === 'menopause'));
  assert.ok(flags({ periods: starts('2026-09-20') }, 47).includes('perimenopause'));
});

test('цикъл: почистване и сливане на данните', () => {
  const c = cleanCycle({ periods: [{ start: '2026-09-01', days: 99 }, { start: 'x' }, { start: '2026-08-01' }, { start: '2026-09-01' }], length: 7, contraception: 'nope', note: 5 });
  assert.deepEqual(c.periods.map(x => x.start), ['2026-08-01', '2026-09-01']);
  assert.equal(c.periods[1].days, null);
  assert.equal(c.length, null);
  assert.equal(c.contraception, 'none');
  const m = mergeCycle(c, cleanCycle({ periods: starts('2026-09-29'), length: 29, contraception: 'cuiud' }));
  assert.deepEqual(m.periods.map(x => x.start), ['2026-08-01', '2026-09-01', '2026-09-29']);
  assert.equal(m.length, 29);
  assert.equal(m.contraception, 'cuiud');
  assert.equal(mergeCycle(null, null), null);
});

/* ------------------------- желязо и калций в храните ------------------------- */

test('храни: желязо и калций за всяка храна и в сборовете', () => {
  for (const [id, f] of Object.entries(FOODS)) {
    assert.ok(f.fe >= 0 && f.fe < 15 && f.ca >= 0 && f.ca < 1300, id);
    // Рафинираните олиа (слънчогледово, рапично) нямат нито желязо, нито калций.
    assert.ok(f.fe > 0 || f.ca > 0 || f.flags.has('oil'), `${id}: има стойност`);
  }
  assert.ok(FOODS.lentils.fe > FOODS.rice.fe && FOODS.kashkaval.ca > FOODS.milk.ca);
  const t = totals([{ food: 'lentils', grams: 150 }, { food: 'yogurt', grams: 200 }]);
  assert.equal(t.fe, 5.1);
  assert.equal(t.ca, 269);
  // Рецептите покриват и двата акцента.
  const dens = RECIPES.map(r => totals(r.items.map(([food, grams]) => ({ food, grams })))).map(x => ({ fe: x.fe / x.kcal * 1000, ca: x.ca / x.kcal * 1000 }));
  assert.ok(dens.filter(d => d.fe >= 10).length >= 40 && dens.filter(d => d.ca >= 500).length >= 40);
});

/* ----------------------------- менюто по фазите ----------------------------- */

test('cycle sync: енергия по фазите, средно за цикъла същата', () => {
  const cycle = { periods: starts('2026-08-17', '2026-09-14'), length: 28 }; // 14.10 е 3-ти ден
  const plan = nutritionPlan({ ...woman, days: 7, cycle, cycleSync: true });
  assert.ok(plan.cycle.applied);
  assert.ok(plan.flags.cycleSync);
  assert.equal(plan.cycle.kcalUp, CYCLE_KCAL);
  assert.deepEqual(plan.week.map(d => d.cycle.phase), ['menstrual', 'menstrual', 'menstrual', 'follicular', 'follicular', 'follicular', 'follicular']);
  assert.ok(plan.week.every(d => d.kcal === plan.targets.kcal - plan.cycle.kcalDown));
  for (const d of plan.week) assert.ok(Math.abs(d.totals.kcal - d.kcal) <= d.kcal * 0.08, `${d.label}: ${d.totals.kcal} / ${d.kcal}`);
  // Средно за целия цикъл енергията е почти същата.
  const s = cycleStats(cycle, { asOf: T });
  const all = Array.from({ length: 28 }, (_, i) => phaseOn(addDays(s.lastStart, i), s).phase);
  const sum = all.reduce((acc, ph) => acc + (ph === 'luteal' || ph === 'premenstrual' ? plan.cycle.kcalUp : -plan.cycle.kcalDown), 0);
  assert.ok(Math.abs(sum / 28) <= 10, `средно ${sum / 28}`);
  // Седмицата от друга дата: лутеалната фаза е с повече енергия.
  const later = nutritionPlan({ ...woman, days: 7, cycle, cycleSync: true, startDate: '2026-10-28' });
  assert.equal(later.week[0].date, '2026-10-28');
  assert.equal(later.week[0].label, 'Сряда');
  assert.equal(later.week[0].cycle.phase, 'luteal');
  assert.equal(later.week[0].kcal, plan.targets.kcal + CYCLE_KCAL);
  assert.equal(later.input.startDate, '2026-10-28');
  // Без поискване — нищо не се променя.
  const plain = nutritionPlan({ ...woman, days: 7, cycle });
  assert.equal(plain.cycle, null);
  assert.ok(plain.week.every(d => d.kcal === plain.targets.kcal && d.cycle === null));
});

test('cycle sync: повече желязо при менструация и калций в предменструалните дни', () => {
  let fe = [0, 0];
  let ca = [0, 0];
  for (let off = 0; off < 28; off += 4) {
    for (const prefs of [[], ['vegetarian'], ['noFish']]) {
      const cycle = { periods: [{ start: addDays(T, -off) }], length: 28 };
      const a = nutritionPlan({ ...woman, days: 7, preferences: prefs, cycle, cycleSync: true });
      const b = nutritionPlan({ ...woman, days: 7, preferences: prefs, cycle });
      a.week.forEach((d, i) => {
        const x = d.totals;
        const y = b.week[i].totals;
        if (d.cycle.phase === 'menstrual') fe = [fe[0] + x.fe / x.kcal, fe[1] + y.fe / y.kcal];
        if (d.cycle.phase === 'premenstrual') ca = [ca[0] + x.ca / x.kcal, ca[1] + y.ca / y.kcal];
      });
    }
  }
  assert.ok(fe[0] > fe[1] * 1.1, `желязо ${fe[0]} / ${fe[1]}`);
  assert.ok(ca[0] > ca[1] * 1.2, `калций ${ca[0]} / ${ca[1]}`);
});

test('cycle sync: кога не се прилага и какво се казва', () => {
  const cycle = { periods: starts('2026-10-01') };
  const reason = (extra) => nutritionPlan({ ...woman, cycle, cycleSync: true, ...extra }).cycle;
  assert.match(reason({ diagnoses: [{ code: 'Z33' }] }).reason, /Бременност/);
  assert.match(reason({ diagnoses: [{ code: 'Z39.1' }] }).reason, /Кърмене/);
  assert.match(reason({ diagnoses: [{ code: 'N95.1' }] }).reason, /Менопауза/);
  assert.match(reason({ cycle: { ...cycle, contraception: 'combined' } }).reason, /потисната/);
  assert.match(reason({ cycle: {} }).reason, /Няма дата/);
  assert.match(reason({ cycle: { periods: starts('2026-08-20'), length: 28 } }).reason, /закъснява/);
  const r = reason({});
  assert.ok(r.applied && r.evidence.length >= 4 && /seed cycling/.test(r.notIncluded));
  assert.ok(r.notes.some(n => /приета е 28 дни/.test(n)));
  assert.equal(nutritionPlan({ ...woman, sex: 'm', cycle, cycleSync: true }).cycle, null, 'само за жени');
  // Хормонална спирала и медна спирала — естествен цикъл.
  assert.ok(reason({ cycle: { ...cycle, contraception: 'lngiud' } }).applied);
  // Силови тренировки — бележка по ISSN.
  assert.ok(reason({ strength: true }).evidence.some(t => /ISSN 2023/.test(t)));
});

test('желязо и калций: цели по EFSA, бележка при недостиг, аменорея', () => {
  const t = (extra) => nutritionPlan({ ...woman, ...extra }).targets;
  assert.equal(t({}).iron, 16);
  assert.equal(t({ sex: 'm' }).iron, 11);
  assert.equal(t({ age: 58 }).iron, 11);
  assert.equal(t({ cycle: { menopause: true } }).iron, 11);
  assert.equal(t({ age: 52, cycle: { periods: starts('2026-09-20') } }).iron, 16, 'още има цикъл');
  assert.equal(t({ age: 22 }).calcium, 1000);
  assert.equal(t({}).calcium, 950);
  // Веганско меню с 3 хранения — бележки за желязото или калция, ако не стигат.
  const vegan = nutritionPlan({ ...woman, weight: 52, height: 160, preferences: ['vegan', 'noSoy'], mealsPerDay: 3, days: 7 });
  const avgCa = vegan.week.reduce((s, d) => s + d.totals.ca, 0) / 7;
  assert.equal(vegan.notes.some(n => /^Калций в менюто/.test(n)), avgCa < 950 * 0.75);
  // Липса на менструация при ИТМ под 25 — без отслабване.
  const am = nutritionPlan({ ...woman, goal: 'lose', weight: 64, cycle: { periods: starts('2026-05-01') } });
  assert.equal(am.input.goal, 'maintain');
  assert.ok(am.warnings.some(w => /Endocrine Society 2017/.test(w)));
  const amDx = nutritionPlan({ ...woman, goal: 'lose', weight: 64, diagnoses: [{ code: 'N91.1' }] });
  assert.equal(amDx.input.goal, 'maintain');
  // При затлъстяване отслабването остава.
  assert.equal(nutritionPlan({ ...woman, goal: 'lose', weight: 92, diagnoses: [{ code: 'N91.1' }] }).input.goal, 'lose');
});

test('МКБ-10: обилна менструация, ПМС, дисменорея, менопауза', () => {
  const dx = dietProfiles([{ code: 'N92.0' }, { code: 'N94.3' }, { code: 'N94.6' }, { code: 'N95.1' }, { code: 'N91.2' }]);
  assert.ok(dx.focus.has('iron') && dx.focus.has('calcium'));
  assert.ok(dx.menopause && dx.amenorrhea);
  assert.ok(dx.notes.some(n => /Cochrane 2016/.test(n)));
  assert.ok(dx.considered.every(c => c.label), 'всички кодове имат профил');
  assert.ok(dietProfiles([{ code: 'D50.9' }]).focus.has('iron'));
  // Акцентът на желязото важи всеки ден.
  const base = { ...woman, days: 7 };
  const fe = (p) => p.week.reduce((s, d) => s + d.totals.fe / d.totals.kcal, 0);
  assert.ok(fe(nutritionPlan({ ...base, diagnoses: [{ code: 'N92.0' }] })) > fe(nutritionPlan(base)));
});

test('седмично меню: денят от седмицата следва датата', () => {
  const plan = nutritionPlan({ ...woman, days: 7, asOf: '2026-10-18' });
  assert.deepEqual(plan.week.map(d => d.label).slice(0, 2), ['Неделя', 'Понеделник']);
});

/* ------------------------------------ API ------------------------------------ */

test('API: дневник на цикъла, режим по фазите, външна жена', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-cycle-'));
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
  const d = (n) => addDays(today(), -n);
  try {
    await call('POST', '/api/setup', { workspace: 'gp', practiceName: 'П', doctorName: 'д-р Т' });
    const pt = await call('POST', '/api/patients', { name: 'Ана Петрова', birthDate: addMonths(today(), -12 * 31), sex: 'f' });
    const id = pt.data.patient.id;
    await call('POST', `/api/patients/${id}/measurements`, { weight: 64, height: 168 });

    // Дневник: запис и проверка на данните.
    const put = await call('PUT', `/api/patients/${id}/cycle`, {
      periods: [{ start: d(60), days: 5 }, { start: d(31), days: 5, heavy: true }, { start: d(2), days: 5 }], contraception: 'none',
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    assert.equal(put.data.cycle.periods.length, 3);
    for (const bad of [
      { periods: [{ start: addDays(today(), 3) }] },
      { periods: [{ start: '1980-01-01' }] },
      { periods: [{ start: 'вчера' }] },
      { periods: [{ start: d(5), days: 40 }] },
      { contraception: 'нещо' },
      { length: 200 },
    ]) assert.equal((await call('PUT', `/api/patients/${id}/cycle`, bad)).status, 400, JSON.stringify(bad));
    const man = await call('POST', '/api/patients', { name: 'Иван', birthDate: addMonths(today(), -12 * 40), sex: 'm' });
    assert.equal((await call('PUT', `/api/patients/${man.data.patient.id}/cycle`, { periods: [] })).status, 400);

    // Режим по фазите от досието; нова дата от формата влиза в дневника при запазване.
    const plan = await call('POST', `/api/patients/${id}/nutrition`, { days: 7, cycleSync: true });
    assert.equal(plan.status, 200, JSON.stringify(plan.data));
    assert.ok(plan.data.plan.cycle.applied);
    assert.equal(plan.data.plan.week[0].cycle.day, 3);
    const formCycle = { lastPeriod: d(0), length: 29, contraception: 'none' };
    const saved = await call('POST', `/api/patients/${id}/nutrition`, { cycleSync: true, cycle: formCycle, save: true });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.plan.cycle.days[0].day, 1);
    const p = (await call('GET', `/api/patients/${id}`)).data.patient;
    assert.deepEqual(p.cycle.periods.map(x => x.start), [d(60), d(31), d(2), d(0)]);
    assert.equal(p.cycle.length, 29);
    for (const bad of [{ cycle: { lastPeriod: addDays(today(), 1) } }, { startDate: addDays(today(), 90) }, { startDate: d(3) }]) {
      assert.equal((await call('POST', `/api/patients/${id}/nutrition`, { cycleSync: true, ...bad })).status, 400, JSON.stringify(bad));
    }

    // Външна жена: цикълът от формата се пази при запазване на режима.
    const person = { name: 'М.', sex: 'f', age: 27, weight: 60, height: 165 };
    const ext = await call('POST', '/api/nutrition/plan', { person, cycleSync: true, cycle: { lastPeriod: d(20), length: 30 }, save: true });
    assert.equal(ext.status, 200, JSON.stringify(ext.data));
    assert.equal(ext.data.plan.cycle.days[0].phase, 'luteal');
    assert.deepEqual(ext.data.client.cycle.periods.map(x => x.start), [d(20)]);
    // Мъж — цикълът не се пази и не се прилага.
    const extM = await call('POST', '/api/nutrition/plan', { person: { ...person, sex: 'm' }, cycleSync: true, cycle: { lastPeriod: d(20) }, save: true });
    assert.equal(extM.data.plan.cycle, null);
    assert.equal(extM.data.client.cycle, null);

    // След повторно зареждане данните са същите; повреден цикъл се поправя.
    const store2 = new Store(dir);
    assert.equal(store2.patient(id).cycle.periods.length, 4);
    const data = { patients: [{ id: 'x', name: 'А', sex: 'f', birthDate: '1990-01-01', cycle: { periods: [{ start: 'зле' }, { start: '2026-01-01' }] } },
      { id: 'y', name: 'Б', sex: 'm', birthDate: '1990-01-01', cycle: { periods: [] } }] };
    normalizeData(data);
    assert.deepEqual(data.patients[0].cycle.periods.map(x => x.start), ['2026-01-01']);
    assert.equal(data.patients[1].cycle, null);
  } finally {
    server.close();
  }
});
