/* Версия 4.2: правилата по най-новите европейски и американски насоки
 * (ESC 2026, ESC/ERA 2026, ESC/EAS 2025, ESC 2024, ADA 2026, AHA/ACC 2025,
 * ACC/AHA 2026, Endocrine Society 2025, USPSTF, GINA 2026, AAP 2023),
 * регистърът на насоките и обновяването на календара. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addDays, addMonths, today } from '../public/js/shared/dates.js';
import { assistantFindings } from '../public/js/shared/assistant.js';
import { adultSummary } from '../public/js/shared/adult.js';
import { GUIDELINES, REGIONS, TOPICS, cite, guidelinesByTopic } from '../public/js/shared/guidelines.js';
import { ADULT_ITEMS, CALENDAR_UPDATES, applyCalendarUpdates, defaultAdultSchedule } from '../public/js/shared/calendar.js';
import { normalizeData } from '../lib/store.js';

const T = today();
const born = (years) => addMonths(T, -12 * years);
const cond = (code) => ({ id: 'c-' + code, code, since: addMonths(T, -24), status: 'active' });
const med = (id, drug, extra = {}) => ({ id, drug, start: addMonths(T, -12), ...extra });
const res = (code, value, date = addDays(T, -10), id = code + date) => ({ id, code, value, date });
const check = (code, date = addDays(T, -10)) => ({ id: code + date, code, value: null, text: 'извършено', date });
const person = (extra = {}) => ({
  id: 'p', name: 'Тест', birthDate: born(60), sex: 'm', lifestyle: {},
  chronic: [], meds: [], results: [], measurements: [], assessments: [], visits: [], studies: [], ...extra,
});
/** Подсказките с обобщението за възрастен — както ги смята сървърът. */
const find = (p, ctx = {}) => {
  const adult = adultSummary(p, { asOf: T });
  return assistantFindings(p, { asOf: T, adult, practice: 'gp', ...ctx });
};
const rule = (p, id, ctx) => find(p, ctx).find(f => f.rule === id);

/* ------------------------------ регистър ------------------------------ */

test('регистър: всяка насока е попълнена, всички цитирания в правилата съществуват', () => {
  for (const [id, g] of Object.entries(GUIDELINES)) {
    assert.ok(g.org && g.year >= 2005 && g.title && g.short && g.uses, id);
    assert.ok(REGIONS[g.region], `${id}: регион`);
    assert.ok(TOPICS[g.topic], `${id}: тема`);
    if (g.url) assert.match(g.url, /^https:\/\//, id);
  }
  const src = fs.readFileSync(new URL('../public/js/shared/assistant.js', import.meta.url), 'utf8');
  const used = [...src.matchAll(/cite\(([^)]*)\)/g)].flatMap(m => [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map(x => x[1]));
  assert.ok(used.length > 20);
  for (const id of used) assert.ok(GUIDELINES[id], `цитирането „${id}“ няма запис в регистъра`);
  assert.equal(cite('esc_hf_2026', 'aha_htn_2025'), 'ESC 2026 СН; AHA/ACC 2025');
  const topics = guidelinesByTopic();
  assert.ok(topics.every(t => t.items.every((g, i, a) => i === 0 || a[i - 1].year >= g.year)), 'най-новите отгоре');
  assert.ok(Object.values(GUIDELINES).some(g => g.region === 'eu') && Object.values(GUIDELINES).some(g => g.region === 'us'));
});

/* --------------------------- хипертония, липиди --------------------------- */

test('първичен алдостеронизъм: веднъж при хипертония, по-спешно при нисък калий или резистентност', () => {
  const p = person({ chronic: [cond('htn')] });
  const f = rule(p, 'pa_screen');
  assert.equal(f.severity, 1);
  assert.match(f.source, /ESC 2024 хипертония; Endocrine Society 2025; AHA\/ACC 2025/);
  assert.equal(rule(person({ chronic: [cond('htn')], results: [res('k', 3.2)] }), 'pa_screen').severity, 2);
  const resistant = person({ chronic: [cond('htn')], meds: [med('a', 'ramipril'), med('b', 'amlodipine'), med('c', 'hydrochlorothiazide')] });
  assert.equal(rule(resistant, 'pa_screen').severity, 2);
  assert.ok(!rule(person({ chronic: [cond('htn')], results: [check('arr')] }), 'pa_screen'), 'вече изследван');
  assert.ok(!rule(person(), 'pa_screen'), 'без хипертония');
});

test('Lp(a): веднъж в живота при повишен риск; повишен Lp(a) е сигнал', () => {
  assert.ok(rule(person({ chronic: [cond('dm2')] }), 'lpa_once'));
  assert.ok(rule(person({ results: [res('ldl', 3.4)] }), 'lpa_once'));
  assert.ok(!rule(person({ results: [res('ldl', 2.4)] }), 'lpa_once'), 'нисък риск — не се натрапва');
  assert.ok(!rule(person({ chronic: [cond('dm2')], results: [res('lpa', 20, addMonths(T, -60))] }), 'lpa_once'));
  const high = rule(person({ results: [res('lpa', 80)] }), 'lpa_high');
  assert.match(high.title, /80 mg\/dL/);
  assert.ok(rule(person({ results: [res('lpan', 180)] }), 'lpa_high'), 'и в nmol/L');
  assert.ok(!rule(person({ results: [res('lpan', 90)] }), 'lpa_high'));
});

test('статин: ССЗ, диабет 40–75 г., ХБЗ от 40 г.', () => {
  const dm = rule(person({ birthDate: born(55), chronic: [cond('dm2')] }), 'statin');
  assert.equal(dm.severity, 1);
  assert.match(dm.source, /ADA 2026/);
  assert.equal(rule(person({ chronic: [cond('chd')] }), 'statin').severity, 2);
  assert.ok(!rule(person({ birthDate: born(30), chronic: [cond('dm1')] }), 'statin'));
  assert.ok(!rule(person({ chronic: [cond('dm2')], meds: [med('s', 'atorvastatin')] }), 'statin'));
  assert.ok(rule(person({ chronic: [cond('ckd')] }), 'statin'));
});

/* --------------------------------- бъбреци --------------------------------- */

test('ХБЗ: SGLT2-инхибитор от eGFR 20, ACEi/ARB при албуминурия, финеренон и семаглутид при диабет', () => {
  const ckd = person({ chronic: [cond('ckd')], results: [res('egfr', 40)] });
  const f = rule(ckd, 'sglt2_ckd');
  assert.equal(f.severity, 2);
  assert.match(f.source, /ESC 2026 ССЗ и ХБЗ/);
  const mild = rule(person({ chronic: [cond('ckd')], results: [res('egfr', 55)] }), 'sglt2_ckd');
  assert.equal(mild.severity, 1, 'eGFR над 45 без албуминурия, диабет и СН — планово');
  assert.match(mild.action, /Първо UACR/);
  assert.equal(rule(person({ chronic: [cond('ckd')], results: [res('egfr', 55), res('uacr', 40)] }), 'sglt2_ckd').severity, 2);
  assert.ok(!rule(person({ chronic: [cond('ckd')], results: [res('egfr', 15)] }), 'sglt2_ckd'), 'под 20 не се започва');
  assert.ok(!rule(person({ chronic: [cond('ckd')], results: [res('egfr', 45)], meds: [med('d', 'dapagliflozin')] }), 'sglt2_ckd'));
  assert.ok(!rule(person({ chronic: [cond('ckd'), cond('dm1')], results: [res('egfr', 45)] }), 'sglt2_ckd'), 'не при диабет тип 1');
  // Невписана ХБЗ: eGFR под 60 два пъти поне 3 месеца един след друг.
  const unregistered = person({ results: [res('egfr', 52, addMonths(T, -6)), res('egfr', 50, addDays(T, -5))] });
  assert.ok(rule(unregistered, 'sglt2_ckd'));
  assert.ok(!rule(person({ results: [res('egfr', 52, addDays(T, -20)), res('egfr', 50, addDays(T, -5))] }), 'sglt2_ckd'), 'под 3 месеца');

  const alb = person({ chronic: [cond('dm2')], results: [res('uacr', 10), res('egfr', 70)] });
  assert.ok(rule(alb, 'raas_alb'));
  assert.ok(!rule({ ...alb, meds: [med('r', 'ramipril')] }, 'raas_alb'));

  const t2d = person({ chronic: [cond('dm2'), cond('ckd')], results: [res('uacr', 10), res('egfr', 40), res('k', 4.6)] });
  const extra = rule(t2d, 't2d_ckd');
  assert.match(extra.action, /финеренон/);
  assert.match(extra.action, /семаглутид/);
  const hyperK = rule({ ...t2d, results: [res('uacr', 10), res('egfr', 40), res('k', 5.3)] }, 't2d_ckd');
  assert.doesNotMatch(hyperK.action, /финеренон/, 'при калий над 5,0 без финеренон');
});

/* ------------------------------- черен дроб ------------------------------- */

test('FIB-4 при диабет: неопределен или висок риск води до еластография или хепатолог', () => {
  const p = person({ chronic: [cond('dm2')], results: [res('ast', 40), res('alt', 30), res('plt', 150)] });
  const f = rule(p, 'fib4');
  assert.equal(f.severity, 2, 'FIB-4 ≈2,9 — висок риск');
  assert.match(f.action, /хепатолог/);
  const mid = rule(person({ chronic: [cond('dm2')], results: [res('ast', 30), res('alt', 35), res('plt', 220)] }), 'fib4');
  assert.equal(mid.severity, 1);
  assert.match(mid.action, /Еластография/);
  assert.ok(!rule({ ...p, results: [...p.results, check('elasto', addDays(T, -1))] }, 'fib4'), 'еластография след изследванията');
  assert.ok(!rule(person({ results: [res('ast', 40), res('alt', 30), res('plt', 150)] }), 'fib4'), 'без метаболитен риск');
  assert.ok(!rule(person({ chronic: [cond('dm2')], results: [res('ast', 20), res('alt', 25), res('plt', 250)] }), 'fib4'), 'нисък риск');
});

/* ------------------------------ сърдечна недостатъчност ------------------------------ */

test('СН (ESC 2026): основно лечение по фракцията, ехокардиография при липса', () => {
  const echo = (ef) => ({ id: 'e' + ef, kind: 'echo', date: addDays(T, -30), values: { ef } });
  const pef = rule(person({ chronic: [cond('hf')], studies: [echo(58)], results: [res('egfr', 60), res('k', 4.4)] }), 'hf_foundation');
  assert.match(pef.title, /MRA, SGLT2-инхибитор/);
  assert.doesNotMatch(pef.title, /бета-блокер/, 'при запазена ФИ основното лечение е MRA и SGLT2i');
  const ref = rule(person({ chronic: [cond('hf')], studies: [echo(45)], results: [res('egfr', 60), res('k', 4.4)] }), 'hf_foundation');
  assert.match(ref.title, /ARNI\/ACEi\/ARB, бета-блокер, MRA, SGLT2-инхибитор/, 'ФИ 45% вече е намалена');
  const blocked = rule(person({ chronic: [cond('hf')], studies: [echo(58)], results: [res('egfr', 60), res('k', 5.4)] }), 'hf_foundation');
  assert.doesNotMatch(blocked.title, /MRA/, 'калий над 5,0 — без MRA');
  assert.ok(!rule(person({ chronic: [cond('hf')], studies: [echo(58)], results: [res('egfr', 60)] }), 'hf_foundation', { modules: { cardio: true } }), 'в СИМП с модула е в раздела му');
  assert.ok(rule(person({ chronic: [cond('hf')] }), 'hf_echo'));
  assert.ok(!rule(person({ chronic: [cond('hf')], studies: [echo(58)] }), 'hf_echo'));
});

/* --------------------------------- астма --------------------------------- */

test('астма само с бързодействащ бета-агонист (GINA 2026)', () => {
  const p = person({ chronic: [cond('asthma')], meds: [med('a', 'salbutamol')] });
  assert.match(rule(p, 'asthma_saba').source, /GINA 2026/);
  assert.ok(!rule({ ...p, meds: [...p.meds, med('b', 'budesonide+formoterol')] }, 'asthma_saba'));
  assert.ok(!rule({ ...p, meds: [...p.meds, { id: 'c', name: 'Пулмикорт 200', start: addMonths(T, -2) }] }, 'asthma_saba'), 'въведен като текст');
});

/* -------------------------------- скрининг -------------------------------- */

test('диабет (ADA 2026): от 35 г. и при наднормено тегло с рисков фактор', () => {
  const m = (w) => [{ id: 'm1', date: addDays(T, -20), weight: w, height: 175 }];
  assert.ok(rule(person({ birthDate: born(36) }), 'dm_screen'));
  assert.ok(!rule(person({ birthDate: born(45) }), 'dm_screen'), 'в ОПЛ от 40 г. го покрива календарът');
  assert.ok(rule(person({ birthDate: born(45) }), 'dm_screen', { practice: 'simp' }));
  assert.ok(rule(person({ birthDate: born(25), chronic: [cond('htn')], measurements: m(85) }), 'dm_screen'), 'ИТМ 27,8 и хипертония');
  assert.ok(!rule(person({ birthDate: born(25), measurements: m(85) }), 'dm_screen'), 'без рисков фактор');
  assert.ok(!rule(person({ birthDate: born(36), results: [res('hba1c', 5.4, addMonths(T, -12))] }), 'dm_screen'));
});

test('аневризма на коремната аорта (ESC 2024)', () => {
  assert.ok(rule(person({ birthDate: born(66), lifestyle: { smoking: 'former' } }), 'aaa_screen'));
  assert.ok(rule(person({ birthDate: born(77), lifestyle: { smoking: 'never' } }), 'aaa_screen'), 'всички мъже от 75 г.');
  assert.ok(rule(person({ birthDate: born(76), sex: 'f', chronic: [cond('htn')] }), 'aaa_screen'), 'жена от 75 г. с хипертония');
  assert.ok(!rule(person({ birthDate: born(70), sex: 'f', lifestyle: { smoking: 'current' } }), 'aaa_screen'));
  assert.ok(!rule(person({ birthDate: born(66), lifestyle: { smoking: 'never' } }), 'aaa_screen'));
  assert.ok(!rule(person({ birthDate: born(66), lifestyle: { smoking: 'former' }, results: [check('aaa_us', addMonths(T, -30))] }), 'aaa_screen'));
});

test('остеопороза при жени (USPSTF 2025) и рак на белия дроб (USPSTF 2021)', () => {
  assert.ok(rule(person({ sex: 'f', birthDate: born(66) }), 'osteo_screen'));
  assert.ok(rule(person({ sex: 'f', birthDate: born(56), lifestyle: { smoking: 'current' } }), 'osteo_screen'));
  assert.ok(!rule(person({ sex: 'f', birthDate: born(56) }), 'osteo_screen'), 'под 65 без рисков фактор');
  assert.ok(!rule(person({ sex: 'f', birthDate: born(70), results: [check('dxa', addMonths(T, -24))] }), 'osteo_screen'));
  assert.ok(!rule(person({ sex: 'f', birthDate: born(70), meds: [med('b', 'alendronate')] }), 'osteo_screen'));

  assert.ok(rule(person({ birthDate: born(55), lifestyle: { smoking: 'current' } }), 'lung_screen'));
  assert.ok(!rule(person({ birthDate: born(55), lifestyle: { smoking: 'never' } }), 'lung_screen'));
  assert.ok(!rule(person({ birthDate: born(45), lifestyle: { smoking: 'current' } }), 'lung_screen'));
  assert.ok(!rule(person({ birthDate: born(55), lifestyle: { smoking: 'current' }, results: [check('ldct', addMonths(T, -3))] }), 'lung_screen'));
});

test('дете със затлъстяване от 10 г.: липиди, глюкоза и АЛАТ (AAP 2023)', () => {
  const kid = person({ birthDate: born(12) });
  const ctx = (z) => ({ child: { growth: [], development: [], bmi: { value: 27.1, z, date: addDays(T, -20) } } });
  const f = assistantFindings(kid, { asOf: T, ...ctx(2.4) }).find(x => x.rule === 'child_obesity');
  assert.match(f.action, /^Липиден профил, глюкоза на гладно или HbA1c, АЛАТ/);
  assert.ok(!assistantFindings(kid, { asOf: T, ...ctx(1.5) }).some(x => x.rule === 'child_obesity'));
  const tested = { ...kid, results: [res('ldl', 2.5), res('glucose', 5.0), res('alt', 20)] };
  assert.ok(!assistantFindings(tested, { asOf: T, ...ctx(2.4) }).some(x => x.rule === 'child_obesity'));
  const young = person({ birthDate: born(8) });
  assert.ok(!assistantFindings(young, { asOf: T, ...ctx(2.4) }).some(x => x.rule === 'child_obesity'));
});

/* -------------------------------- календар -------------------------------- */

test('календар: новите бележки влизат само в непроменените дейности', () => {
  // Календар, какъвто е бил преди 4.2.
  const old = defaultAdultSchedule().map(i => {
    const u = CALENDAR_UPDATES.find(x => x.id === i.id);
    return u ? { ...i, ...u.from } : i;
  });
  const edited = old.find(i => i.id === 'ad-mammo');
  edited.note = 'Нашата бележка';
  const changed = applyCalendarUpdates(old);
  assert.ok(changed.includes('ad-rsv'));
  assert.ok(!changed.includes('ad-mammo'), 'редактираната от лекаря се запазва');
  assert.equal(old.find(i => i.id === 'ad-mammo').note, 'Нашата бележка');
  const rsv = old.find(i => i.id === 'ad-rsv');
  assert.equal(rsv.riskFromMonths, 600, 'РСВ от 50 г. при повишен риск (ACIP 2025)');
  assert.deepEqual(applyCalendarUpdates(old), [], 'втори път нищо не се променя');
  // Новият календар по подразбиране вече е обновен.
  assert.equal(ADULT_ITEMS.find(i => i.id === 'ad-rsv').riskFromMonths, 600);
  assert.deepEqual(applyCalendarUpdates(defaultAdultSchedule()), []);

  // При зареждане на данните — без предупреждение за поправка.
  const d = { patients: [], doctors: [], schedule: [...old.map(i => ({ ...i })), { id: 'x', track: 'child', name: 'X' }] };
  const back = d.schedule.find(i => i.id === 'ad-pcv');
  Object.assign(back, CALENDAR_UPDATES.find(u => u.id === 'ad-pcv').from);
  const repairs = normalizeData(d);
  assert.match(d.schedule.find(i => i.id === 'ad-pcv').note, /ACIP/);
  assert.ok(!repairs.some(r => /календар/.test(r)));
});
