/* Версия 4.17: защо е избран режимът — по всяко заболяване от списъка и според възрастта;
 * писмото на лекаря към пациента; правилата веднъж и с причините на човека; бележките за
 * лекаря — само в екрана, не и в отчета за пациента. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { Store } from '../lib/store.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import { nutritionPlan } from '../public/js/shared/nutrition.js';
import { DX, dietProfiles } from '../public/js/shared/diet-icd.js';
import { choosePattern } from '../public/js/shared/diet-advice.js';
import { foodNotes } from '../public/js/shared/meds.js';
import { translatePlan } from '../public/js/shared/i18n/plan-en.js';
import { nutritionReport } from '../public/js/shared/pdf/nutrition-report.js';

const CYR = /[А-Яа-я]/;
const base = { sex: 'f', age: 50, weight: 72, height: 166, activity: 'light' };
const plan = (extra = {}) => nutritionPlan({ ...base, ...extra });
const all = (p) => [...p.prefer, ...p.limit, ...p.avoid, ...p.notes];

test('4.17: всяко заболяване от списъка има профил и обяснение на двата езика', () => {
  for (const d of DX) {
    const considered = dietProfiles([d]).considered[0];
    assert.ok(considered.keys.length, `${d.code}: няма профил`);
    const sex = /^[NO]|^Z3|^E28/.test(d.code) ? 'f' : 'm';
    const p = plan({ sex, diagnoses: [d], pregnancyWeek: /^Z3[3-6]|^O/.test(d.code) ? 20 : undefined });
    const items = p.why.filter(w => w.codes.includes(d.code));
    assert.ok(items.length, `${d.code}: няма обяснение`);
    for (const w of items) assert.ok(w.text.length > 60 && CYR.test(w.text), `${d.code}: ${w.text}`);
    const en = translatePlan(p);
    assert.equal(en.why.length, p.why.length);
    for (const w of en.why) assert.ok(!CYR.test(w.text) && !CYR.test(w.title), `${d.code} EN: ${w.title} — ${w.text}`);
    assert.ok(!CYR.test(en.summary.join(' ')), `${d.code} EN резюме`);
  }
});

test('4.17: моделът по заболяванията и обяснението защо', () => {
  const htn = plan({ diagnoses: [{ code: 'I10' }] });
  assert.equal(htn.pattern.id, 'dash');
  assert.ok(htn.pattern.auto);
  assert.match(htn.why[0].text, /^При високо кръвно налягане моделът DASH има най-силните доказателства.*11 mmHg/);
  // Диабет и налягане — средиземноморски (ESC/EASD 2023), солта остава малко.
  const dm = plan({ diagnoses: [{ code: 'I10' }, { code: 'E11.9' }] });
  assert.equal(dm.pattern.id, 'mediterranean');
  assert.match(dm.why[0].text, /кръвната захар/);
  // ХБЗ с калий под ограничение — не DASH, и защо.
  const ckd = plan({ egfr: 38, classes: new Set(['ACEI']), diagnoses: [{ code: 'I10' }, { code: 'N18.3' }] });
  assert.equal(ckd.pattern.id, 'mediterranean');
  assert.match(ckd.why[0].text, /DASH.*не е избран.*калий/);
  assert.equal(plan({ diagnoses: [{ code: 'K58.9' }] }).pattern.id, 'balanced');
  assert.equal(plan({ diagnoses: [{ code: 'M62.5' }] }).pattern.id, 'highprotein');
  assert.equal(plan({ egfr: 40, diagnoses: [{ code: 'M62.5' }] }).pattern.id, 'mediterranean', 'при ХБЗ — не „с повече белтък“');
  // Изборът на лекаря се спазва; при несъответствие — бележка за лекаря.
  const manual = plan({ pattern: 'dash', egfr: 38, classes: new Set(['ACEI']), diagnoses: [{ code: 'N18.3' }] });
  assert.equal(manual.pattern.id, 'dash');
  assert.ok(!manual.pattern.auto);
  assert.ok(manual.clinician.some(t => /DASH е богат на калий/.test(t)));
  assert.equal(choosePattern({ keys: new Set(), cond: new Set(), goal: 'maintain', age: 40 }).reason, 'default');
});

test('4.17: възрастта променя режима', () => {
  // След 75 г. при ИТМ под 30 — без отслабване (ESPEN 2022), с обяснение.
  const old = plan({ age: 80, weight: 70, height: 160, goal: 'lose' });
  assert.equal(old.input.goal, 'maintain');
  assert.ok(old.warnings.some(w => /На Вашата възраст отслабване при това тегло не се препоръчва/.test(w)));
  const age = old.why.find(w => w.kind === 'age');
  assert.equal(age.title, 'Възраст: 80 г.');
  assert.match(age.text, /Отслабване не е предвидено/);
  assert.equal(plan({ age: 80, weight: 100, height: 160, goal: 'lose' }).input.goal, 'lose', 'при затлъстяване отслабването остава');
  // След 65 г. — напитки поне 1,6 л при жените и 2,0 л при мъжете.
  assert.ok(plan({ age: 70, weight: 48, height: 155 }).targets.fluids >= 1600);
  assert.ok(plan({ sex: 'm', age: 70, weight: 58, height: 170 }).targets.fluids >= 2000);
  // ХБЗ: 0,8 г/кг, а след 75 г. — 1,0 г/кг (KDIGO 2024).
  assert.equal(plan({ age: 60, egfr: 40, diagnoses: [{ code: 'N18.3' }] }).targets.proteinPerKg, 0.8);
  const frail = plan({ age: 78, egfr: 40, diagnoses: [{ code: 'N18.3' }] });
  assert.equal(frail.targets.proteinPerKg, 1.0);
  assert.match(frail.why.find(w => w.key === 'kidney').text, /На Вашата възраст белтъкът е малко повече/);
  // Млада жена — желязо и фолиева киселина; мъж на 40 — без карта за възрастта.
  assert.match(plan({ age: 30 }).why.find(w => w.kind === 'age').text, /фолиева киселина 400 мкг/);
  assert.ok(!plan({ sex: 'm', age: 40, weight: 80, height: 178 }).why.some(w => w.kind === 'age'));
  // Възрастта от досието е дробна — в текста е в цели години.
  const frac = plan({ age: 72.4599589322382 });
  assert.match(frac.summary[0], /възрастта \(72 г\.\)/);
  assert.ok(!/72,45/.test(JSON.stringify(frac.why)));
  // След 75 г. при диабет: най-важното е да се храните редовно, без ниска кръвна захар.
  assert.match(plan({ age: 82, diagnoses: [{ code: 'E11.9' }] }).summary[1], /редовни хранения без ниска кръвна захар/);
});

test('4.17: писмото и правилата са към пациента — всяко правило веднъж, с причините', () => {
  const p = plan({ egfr: 40, diagnoses: [{ code: 'I10' }, { code: 'N18.3' }, { code: 'E11.9' }, { code: 'M10.9' }], days: 7 });
  assert.equal(p.summary.length, 2);
  assert.match(p.summary[0], /^Съставих този режим специално за Вас според теглото \(72 кг\)/);
  assert.match(p.summary[0], /Препоръчвам Ви средиземноморски тип хранене, защото/);
  assert.match(p.summary[1], /Най-важното за Вас: /);
  const en = translatePlan(p);
  assert.match(en.summary[0], /^I have put this plan together for you/);
  // Солта — едно правило с всички причини.
  const salt = p.limit.filter(t => /^Сол до/.test(t));
  assert.equal(salt.length, 1);
  assert.match(salt[0], /заради налягането и бъбреците/);
  // Без старите бележки „Хипертония: …“ и без тирета като в справочник в писмото и обясненията.
  assert.ok(!all(p).some(t => /^(Хипертония|Диабет|ХБЗ|Подагра|Анемия|Стеатоза|Рефлукс|Цироза):/.test(t)), all(p).join(' | '));
  assert.ok(!/ — /.test(p.summary.join(' ')), p.summary.join(' '));
  assert.ok(p.why.every(w => !/ — /.test(w.text)), p.why.map(w => w.text).join(' | '));
  // Подаграта: бира и карантия, течности с причината.
  assert.ok(p.avoid.some(t => /^Бира и спиртни напитки/.test(t)));
  assert.ok(p.prefer.some(t => /^Течности: .*подаграта/.test(t)));
  // Английският е изцяло от двойките — без кирилица в правилата.
  for (const k of ['prefer', 'limit', 'avoid', 'notes', 'warnings', 'clinician', 'weekly', 'habits', 'flavor', 'monitoring']) {
    assert.ok(en[k].every(t => !CYR.test(t)), `${k}: ${en[k].filter(t => CYR.test(t)).join(' | ')}`);
  }
});

test('4.17: бележките за лекаря са отделно и не влизат в отчета за пациента', async () => {
  const ed = plan({ diagnoses: [{ code: 'F50.0' }, { code: 'T78.1' }] });
  assert.ok(ed.clinician.some(t => /не давайте на пациента отчета/.test(t)));
  assert.ok(ed.clinician.some(t => /впишете конкретния алерген/.test(t)));
  assert.ok(![...ed.warnings, ...ed.notes].some(t => /не давайте|впишете/.test(t)), 'не са в текста за пациента');
  const target = plan({ goal: 'lose', targetWeight: 90 });
  assert.ok(target.clinician.some(t => /не съответства/.test(t)));
  // В PDF: писмото и „Защо този режим“ са, бележките за лекаря — не.
  const read = (f) => new Uint8Array(fs.readFileSync(new URL(`../public/fonts/${f}`, import.meta.url)));
  const fonts = { regular: read('NotoSans-Regular.ttf'), semibold: read('NotoSans-SemiBold.ttf'), bold: read('NotoSans-Bold.ttf'), symbols: read('DejaVuSans-Symbols.ttf') };
  const glyphs = (bytes) => {
    const s = Buffer.from(bytes).toString('latin1');
    const codes = new Set();
    for (const m of s.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
      let txt = '';
      try { txt = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { continue; }
      if (txt.includes('beginbfchar')) for (const x of txt.matchAll(/<[0-9a-fA-F]{4}> <([0-9a-fA-F]{4,})>/g)) codes.add(parseInt(x[1].slice(0, 4), 16));
    }
    return codes;
  };
  const args = { person: { name: 'И. П.', age: 50, sex: 'f' }, practice: { name: 'Практика' }, doctor: { name: 'д-р Тест' }, fonts, version: '4.17.0', date: '2026-11-05' };
  // Знакът ¤ е само в бележката за лекаря: не бива да е в PDF; в писмото — трябва (проверката работи).
  const marked = { ...ed, clinician: ['¤ само за лекаря'] };
  assert.ok(!glyphs(await nutritionReport({ ...args, plan: marked })).has(0xA4), 'бележката за лекаря е в PDF');
  assert.ok(glyphs(await nutritionReport({ ...args, plan: { ...marked, summary: [...marked.summary, '¤'] } })).has(0xA4));
  const bytes = await nutritionReport({ ...args, plan: ed });
  const titles = [...Buffer.from(bytes).toString('latin1').matchAll(/\/Title <FEFF([0-9A-F]+)>/g)].map(m => Buffer.from(m[1], 'hex').swap16().toString('utf16le'));
  assert.ok(titles.includes('Защо този режим'), titles.join(' | '));
});

test('4.17: заболяванията променят и менюто, не само текста', () => {
  // Гломерулна болест — белтък до 1,0 г/кг; камъни — повече калций в менюто.
  const gn = plan({ goal: 'lose', weight: 90, diagnoses: [{ code: 'N04.9' }] });
  assert.ok(gn.targets.proteinPerKg <= 1.0, `GN ${gn.targets.proteinPerKg}`);
  assert.ok(dietProfiles([{ code: 'N20.0' }]).focus.has('calcium'));
  assert.ok(dietProfiles([{ code: 'M81.0' }]).focus.has('calcium'));
  // Бременност: белтък с 9 г повече във 2. тримесечие (EFSA 2012).
  const preg = plan({ age: 30, goal: 'maintain', diagnoses: [{ code: 'Z34.0' }], pregnancyWeek: 20 });
  const not = plan({ age: 30, goal: 'maintain' });
  assert.equal(preg.targets.protein - not.targets.protein, 9);
  // Симвастатин — грейпфрутът не влиза в менюто (бележките за лекарствата са обекти).
  const statin = plan({ days: 28, medNotes: foodNotes({ meds: [{ drug: 'simvastatin' }] }) });
  const foods = [...statin.week.flatMap(d => d.meals.flatMap(m => (m.option?.items || []).map(it => it.food)))];
  assert.ok(!foods.includes('grapefruit'));
  // I11.0 — и налягане, и сърдечна недостатъчност.
  const hhd = plan({ diagnoses: [{ code: 'I11.0' }] });
  assert.deepEqual(hhd.why.filter(w => w.kind === 'dx').map(w => w.key), ['hf', 'htn']);
  assert.ok(hhd.targets.fluids <= 2000);
});

test('4.17: дете — писмо и обяснения за родителя, числата за ИТМ — за лекаря', () => {
  const kid = nutritionPlan({ sex: 'm', age: 9.5, ageMonths: 114, weight: 42, height: 138, diagnoses: [{ code: 'K90.0', name: 'Цьолиакия' }] });
  assert.match(kid.summary[0], /^Съставих този режим за детето/);
  assert.ok(kid.why.some(w => w.key === 'celiac'));
  assert.ok(kid.why.some(w => w.key === 'childWeight'));
  assert.ok(kid.clinician.some(t => /SD/.test(t)));
  assert.ok(!kid.warnings.some(t => /SD/.test(t)));
  assert.ok(kid.habits.some(t => /^Вие решавате какво, кога и къде се яде/.test(t)));
  const en = translatePlan(kid);
  assert.match(en.summary[0], /^I have put this plan together for your child/);
  assert.ok([...en.prefer, ...en.habits, ...en.weekly].every(t => !CYR.test(t)));
});

test('4.17: API — моделът „по заболяванията“ (auto)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-v417-'));
  const store = new Store(dir);
  store.settings.requireLogin = false;
  if (!store.data.doctors.length) store.data.doctors.push({ id: 'd1', name: 'д-р Тест', role: 'ОПЛ', active: true });
  const server = createAppServer({ store, serveStatic: memoryStatic({ 'index.html': 'x' }), requireActivation: false });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const person = { name: 'И. П.', sex: 'm', age: 64, weight: 88, height: 176, diagnoses: [{ code: 'I10' }, { code: 'K58.9' }] };
    const res = await fetch(url + '/api/nutrition/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ person, pattern: 'auto', days: 1 }) });
    const data = await res.json();
    assert.equal(res.status, 200, JSON.stringify(data));
    assert.equal(data.plan.pattern.id, 'balanced', 'раздразнено черво — без много бобови');
    assert.ok(data.plan.pattern.auto);
    assert.ok(data.plan.why.length >= 3 && data.plan.summary.length === 2);
    assert.ok(data.plan.advice.en.why.length === data.plan.why.length);
  } finally {
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
