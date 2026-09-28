/* Версия 3.3: модули за специалисти — кардиология и ендокринология.
 * Прагове и формули от насоките, проверка на въведеното и приложният интерфейс. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store, normalizeData } from '../lib/store.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import { addMonths, today } from '../public/js/shared/dates.js';
import { dailyDose, parseCount, parseDose } from '../public/js/shared/meds.js';
import { adultSummary } from '../public/js/shared/adult.js';
import {
  assessAbpm, assessHome, cardioSummary, dipping, efPhenotype, hfTherapy, ldlPath, ldlReduction, lpaAssess, noacDose, qtc, qtcAssess,
} from '../public/js/shared/cardio.js';
import {
  assessCgm, basalAdvice, euTirads, gmiFromMean, insulinRegimen, iwgdfCategory, noduleAssessment, noduleGrowth, thyroidPattern,
} from '../public/js/shared/endo.js';
import { STUDY_KINDS, validateStudy } from '../public/js/shared/studies.js';

const T = today();
const born = (years) => addMonths(T, -12 * years);
const med = (drug, dose, schedule) => ({ id: 'm-' + drug, drug, dose, schedule });
const adult = (extra = {}) => ({
  id: 'p1', name: 'Тест', sex: 'm', birthDate: born(66), createdAt: born(1),
  chronic: [], meds: [], results: [], measurements: [], assessments: [], visits: [], studies: [], nodules: [], ...extra,
});

/* --------------------------------- дози --------------------------------- */

test('числова доза: мерни единици, дроби в приема и дневно количество', () => {
  assert.deepEqual(parseDose('2,5 мг'), { amount: 2.5, unit: 'mg' });
  assert.deepEqual(parseDose('49/51 мг'), { amount: 49, unit: 'mg' });
  assert.deepEqual(parseDose('75 мкг'), { amount: 75, unit: 'µg' });
  assert.deepEqual(parseDose('18 ед.'), { amount: 18, unit: 'U' });
  assert.deepEqual(parseDose('1 г'), { amount: 1000, unit: 'mg' });
  assert.equal(parseDose('табл.'), null);
  assert.equal(parseCount('½'), 0.5);
  assert.equal(parseCount('1/2'), 0.5);
  assert.equal(parseCount('1½'), 1.5);
  assert.equal(parseCount('0,5'), 0.5);
  assert.equal(parseCount('x'), null);
  assert.equal(dailyDose(med('bisoprolol', '5 мг', { m: '1', e: '½' })).daily, 7.5);
  assert.equal(dailyDose(med('bisoprolol', '5 мг', {})), null, 'без разписание няма дневна доза');
  // Инсулин: единиците са в полетата на приема.
  const ins = dailyDose(med('insulin_aspart', 'ед.', { m: '6', n: '8', e: '6' }));
  assert.deepEqual([ins.daily, ins.unit, ins.intakes], [20, 'U', 3]);
  assert.equal(dailyDose({ ...med('bisoprolol', '5 мг', { m: '1' }), prn: true }), null);
});

/* ------------------------- сърдечна недостатъчност ------------------------- */

test('фенотип по ФИ: намалена, леко намалена, запазена и подобрена', () => {
  const s = (ef, date = '2026-01-01') => ({ date, values: { ef } });
  assert.equal(efPhenotype([s(40)]).id, 'hfref');
  assert.equal(efPhenotype([s(41)]).id, 'hfmref');
  assert.equal(efPhenotype([s(49)]).id, 'hfmref');
  assert.equal(efPhenotype([s(50)]).id, 'hfpef');
  assert.equal(efPhenotype([s(30, '2024-01-01'), s(45, '2026-01-01')]).id, 'hfimpef');
  assert.equal(efPhenotype([s(35, '2024-01-01'), s(42, '2026-01-01')]).id, 'hfmref', 'под 10 пункта подобрение не е HFimpEF');
  assert.equal(efPhenotype([]), null);
});

test('СН с намалена ФИ: процент от целевата доза по ESC 2021 и ограничения', () => {
  const p = adult({
    meds: [
      med('sacubitril+valsartan', '49/51 мг', { m: '1', e: '1' }),
      med('bisoprolol', '10 мг', { m: '1' }),
      med('spironolactone', '25 мг', { m: '1' }),
      med('perindopril', '5 мг', { m: '1' }),
    ],
  });
  const t = hfTherapy(p, { k: 4.6, egfr: 55, sbp: 118, hr: 64 });
  const row = (id) => t.rows.find(r => r.pillar === id);
  assert.equal(row('raas').name, 'Сакубитрил/валсартан', 'ARNI има предимство пред ACEi в реда');
  assert.equal(row('raas').pct, 51);
  assert.equal(row('bb').status, 'target');
  assert.equal(row('mra').pct, 50);
  assert.equal(row('sglt2').status, 'missing');
  assert.match(row('sglt2').next, /дапаглифлозин или емпаглифлозин 10 мг/);
  assert.equal(t.onTarget, 1);

  const limited = hfTherapy(p, { k: 5.7, egfr: 24, sbp: 86, hr: 48 });
  assert.ok(limited.rows.find(r => r.pillar === 'mra').barriers.some(b => /калий 5,7/.test(b)));
  assert.ok(limited.rows.find(r => r.pillar === 'mra').barriers.some(b => /eGFR 24/.test(b)));
  assert.ok(limited.rows.find(r => r.pillar === 'bb').barriers.some(b => /намалете/.test(b)));
  assert.ok(limited.rows.find(r => r.pillar === 'raas').barriers.some(b => /систолно налягане 86/.test(b)));
  assert.ok(limited.rows.find(r => r.pillar === 'sglt2').barriers.some(b => /само емпаглифлозин/.test(b)));

  const other = hfTherapy(adult({ meds: [med('atenolol', '50 мг', { m: '1' })] }), {});
  assert.equal(other.rows.find(r => r.pillar === 'bb').status, 'no_target');
});

/* ---------------------------- предсърдно мъждене ---------------------------- */

test('НОАК: правилна, ниска и висока доза по възраст, тегло и CrCl', () => {
  const apix = (dose, per) => med('apixaban', dose, per === 2 ? { m: '1', e: '1' } : { m: '1' });
  assert.equal(noacDose(apix('5 мг', 2), { age: 70, weight: 80, creat: 90, crcl: 70 }).verdict, 'ok');
  assert.equal(noacDose(apix('2,5 мг', 2), { age: 82, weight: 58, creat: 90, crcl: 45 }).verdict, 'ok', '2 от 3 критерия — 2,5 мг');
  assert.equal(noacDose(apix('2,5 мг', 2), { age: 82, weight: 75, creat: 90, crcl: 55 }).verdict, 'low', 'само 1 критерий — ниска доза');
  assert.equal(noacDose(apix('5 мг', 2), { age: 70, weight: 80, creat: 150, crcl: 25 }).verdict, 'high', 'CrCl 15–29 — 2,5 мг');
  assert.equal(noacDose(apix('5 мг', 1), { age: 70, weight: 80, creat: 90, crcl: 70 }).verdict, 'wrong', 'апиксабан е 2 пъти дневно');
  assert.equal(noacDose(apix('5 мг', 2), { age: 70, weight: 80, creat: 400, crcl: 12 }).verdict, 'contra');

  const riva = (mg) => med('rivaroxaban', mg + ' мг', { e: '1' });
  assert.equal(noacDose(riva(15), { crcl: 40 }).verdict, 'ok');
  assert.equal(noacDose(riva(20), { crcl: 40 }).verdict, 'high');
  assert.equal(noacDose(riva(15), { crcl: 80 }).verdict, 'low');

  const edo = (mg) => med('edoxaban', mg + ' мг', { m: '1' });
  assert.equal(noacDose(edo(30), { crcl: 80, weight: 58 }).verdict, 'ok', 'тегло ≤60 кг — 30 мг');
  assert.equal(noacDose(edo(60), { crcl: 50, weight: 80 }).verdict, 'high', 'CrCl 15–50 — 30 мг');

  const dabi = (mg) => med('dabigatran', mg + ' мг', { m: '1', e: '1' });
  assert.equal(noacDose(dabi(110), { age: 82, crcl: 60 }).verdict, 'ok');
  assert.equal(noacDose(dabi(150), { age: 82, crcl: 60 }).verdict, 'high');
  const either = noacDose(dabi(150), { age: 77, crcl: 60 });
  assert.equal(either.verdict, 'ok', '75–79 г. — и двете дози са допустими');
  assert.match(either.expected, /150 мг .* или 110 мг/);
  assert.equal(noacDose(dabi(110), { age: 70, crcl: 25 }).verdict, 'contra');
});

/* ---------------------------------- LDL ---------------------------------- */

test('LDL: средните понижения от ESC/EAS 2025 и пътят до целта', () => {
  const pct = (x) => Math.round(ldlReduction(x) * 100);
  assert.equal(pct({ statin: 'moderate' }), 30);
  assert.equal(pct({ statin: 'high' }), 50);
  assert.equal(pct({ statin: 'high', e: true }), 60);
  assert.equal(pct({ statin: 'high', b: true }), 58);
  assert.equal(pct({ statin: 'high', e: true, b: true }), 68);
  assert.equal(pct({ statin: 'high', k: true }), 75);
  assert.equal(pct({ statin: 'high', e: true, k: true }), 80);
  assert.equal(pct({ statin: 'high', e: true, b: true, k: true }), 86);
  assert.equal(pct({ e: true }), 23);
  assert.equal(pct({ k: true }), 60);
  assert.equal(pct({ e: true, k: true }), 70);

  // Умерен статин, LDL 2,6 → цел 1,4: изходният ≈3,7; висок статин ≈1,9; + езетимиб ≈1,5; + PCSK9 ≈0,7.
  const therapy = { statin: { id: 'atorvastatin', daily: 20, intensity: 'moderate' }, ezetimibe: false, bempedoic: false, pcsk9: null };
  const path = ldlPath({ ldl: 2.6, target: 1.4, therapy });
  assert.equal(path.baseline, 3.7);
  assert.deepEqual(path.steps.map(s => s.projected).slice(0, 3), [1.9, 1.5, 0.7]);
  assert.equal(path.recommended, 2, 'първият етап, който достига целта — PCSK9');
  assert.equal(path.needPct, 46);
  // При висок риск и понижение ≥50% от изходното: без лечение и LDL 2,4 → цел 1,2, високият статин точно я достига.
  const halve = ldlPath({ ldl: 2.4, target: 1.8, therapy: { statin: null, ezetimibe: false, bempedoic: false, pcsk9: null }, halve: true });
  assert.equal(halve.target, 1.2);
  assert.equal(halve.recommended, 0);
  assert.equal(ldlPath({ ldl: 1.2, target: 1.4, therapy }).atTarget, true);
});

test('Lp(a): прагове в mg/dL и в nmol/L', () => {
  assert.equal(lpaAssess(20).level, 'ok');
  assert.equal(lpaAssess(40).level, 'border');
  assert.equal(lpaAssess(51).level, 'high');
  assert.equal(lpaAssess(181).level, 'very_high');
  assert.equal(lpaAssess(null, 100).level, 'border');
  assert.equal(lpaAssess(null, 110).level, 'high');
  assert.equal(lpaAssess(null, 431).level, 'very_high');
  assert.equal(lpaAssess().level, 'unknown');
});

/* ------------------------------ налягане и ЕКГ ------------------------------ */

test('амбулаторно налягане: прагове на ESC 2024, нощен спад, бяла престилка и маскирана хипертония', () => {
  const normal = { sys24: 124, dia24: 76, sysDay: 130, diaDay: 80, sysNight: 112, diaNight: 66 };
  const a = assessAbpm(normal, { office: { systolic: 152, diastolic: 94 } });
  assert.equal(a.high, false);
  assert.match(a.phenotype, /бяла престилка/);
  assert.equal(a.dip.id, 'dipper');
  const masked = assessAbpm({ sys24: 132, dia24: 80, sysDay: 138, diaDay: 86, sysNight: 124, diaNight: 72 }, { office: { systolic: 128, diastolic: 80 }, treated: true });
  assert.equal(masked.high, true);
  assert.match(masked.phenotype, /Маскирана неконтролирана/);
  assert.equal(masked.parts.filter(x => x.high).length, 3);
  // Точно на прага (135/85 ден) е хипертония.
  assert.equal(assessAbpm({ sys24: 120, dia24: 70, sysDay: 135, diaDay: 70 }).parts.find(x => x.key === 'day').high, true);
  const nocturnal = assessAbpm({ sys24: 126, dia24: 76, sysDay: 128, diaDay: 78, sysNight: 124, diaNight: 72 });
  assert.equal(nocturnal.nocturnal, true, 'изолирана нощна хипертония');
  assert.equal(dipping(130, 132).id, 'riser');
  assert.equal(dipping(130, 125).id, 'nondipper');
  assert.equal(dipping(130, 100).id, 'extreme');
  assert.equal(assessHome({ sys: 136, dia: 80 }).high, true);
  assert.match(assessHome({ sys: 128, dia: 80, days: 2 }).warn, /3 дни/);
});

test('QTc: Fridericia и Bazett, граници по пол', () => {
  assert.deepEqual(qtc(400, 60), { fridericia: 400, bazett: 400, rr: 1 });
  const fast = qtc(360, 100);
  assert.equal(fast.fridericia, 427);
  assert.equal(fast.bazett, 465);
  assert.equal(qtcAssess(455, 'm').level, 'long');
  assert.equal(qtcAssess(455, 'f').level, 'ok');
  assert.equal(qtcAssess(505, 'f').level, 'high');
  assert.equal(qtcAssess(340, 'm').level, 'short');
});

test('кардиологичното обобщение събира сигналите за справките', () => {
  const p = adult({
    chronic: [{ id: 'c1', code: 'af', status: 'active' }, { id: 'c2', code: 'hf', status: 'active' }, { id: 'c3', code: 'htn', status: 'active' }],
    meds: [med('apixaban', '2,5 мг', { m: '1', e: '1' }), med('amiodarone', '200 мг', { m: '1' }), med('citalopram', '20 мг', { m: '1' })],
    results: [{ code: 'creat', value: 90, date: T }, { code: 'k', value: 4.4, date: T }],
    measurements: [{ date: T, systolic: 128, diastolic: 78, pulse: 72, weight: 82, height: 176 }],
    studies: [
      { id: 's1', kind: 'echo', date: T, values: { ef: 30 } },
      { id: 's2', kind: 'ecg', date: T, values: { rhythm: 'sinus', hr: 60, qt: 520, qrs: 100 } },
    ],
  });
  const s = cardioSummary(p, adultSummary(p, { asOf: T }), T);
  const ids = s.alerts.map(a => a.id);
  assert.ok(ids.includes('noac_dose'), 'апиксабан 2,5 мг без критерии');
  assert.ok(ids.includes('hf_missing'));
  assert.ok(ids.includes('qtc'));
  assert.equal(s.ecg.qtMeds.length, 2);
  assert.equal(s.alerts[0].severity, 3, 'най-сериозното е първо');
});

/* ------------------------------- ендокринология ------------------------------- */

test('CGM: цели по международния консенсус и GMI', () => {
  assert.equal(gmiFromMean(8.6), 7.0);
  const good = assessCgm({ days: 14, active: 95, tir: 76, low: 2, veryLow: 0.5, high: 18, veryHigh: 3.5, cv: 32 });
  assert.ok(good.items.every(i => i.ok));
  assert.equal(good.sufficient, true);
  const hypo = assessCgm({ days: 14, tir: 72, low: 4, veryLow: 1.2, high: 20, veryHigh: 2.8, cv: 40 });
  assert.match(hypo.focus, /хипогликемиите/);
  assert.equal(hypo.items.find(i => i.id === 'cv').ok, false);
  assert.equal(hypo.sufficient, true, 'без въведен активен процент се приемат само дните');
  const short = assessCgm({ days: 10, active: 60, tir: 80 });
  assert.equal(short.sufficient, false);
  const older = assessCgm({ days: 14, tir: 55, low: 0.5, veryLow: 0, high: 35, veryHigh: 9.5 }, { older: true });
  assert.ok(older.items.every(i => i.ok), 'за по-възрастни: TIR >50%, под 3,9 <1%, над 13,9 <10%');
});

test('инсулин: обща доза, правила 500 и 100, свръхбазализация и титриране по ADA', () => {
  const p = adult({
    meds: [med('insulin_glargine', 'ед.', { b: '24' }), med('insulin_aspart', '', { m: '6', n: '8', e: '12' })],
    measurements: [{ date: T, weight: 80 }],
  });
  const r = insulinRegimen(p, { weight: 80 });
  assert.equal(r.tdd, 50);
  assert.equal(r.basalPct, 48);
  assert.equal(r.icr, 10, '500 / 50');
  assert.equal(r.isf, 2, '100 / 50');
  assert.equal(r.overbasal, false);
  const smbg = (values) => ({ values });
  assert.equal(basalAdvice(r, smbg({ fasting: 8.4, hypo: 0 })).kind, 'up');
  assert.equal(basalAdvice(r, smbg({ fasting: 6.1, hypo: 0 })).kind, 'ok');
  assert.equal(basalAdvice(r, smbg({ fasting: 8.4, hypo: 2 })).kind, 'down');
  const over = insulinRegimen(adult({ meds: [med('insulin_degludec', '48 ед.', { b: '1' })] }), { weight: 80 });
  assert.equal(over.overbasal, true);
  assert.equal(basalAdvice(over, smbg({ fasting: 9 })).kind, 'stop');
});

test('стъпало: категории на риска по IWGDF 2023', () => {
  assert.equal(iwgdfCategory({}).cat, 0);
  assert.equal(iwgdfCategory({ lops: true }).cat, 1);
  assert.equal(iwgdfCategory({ lops: true, deformity: true }).cat, 2);
  assert.equal(iwgdfCategory({ pad: true, lops: true }).cat, 2);
  assert.equal(iwgdfCategory({ deformity: true }).cat, 0, 'деформация без LOPS/ПАБ не повишава риска');
  assert.equal(iwgdfCategory({ pad: true, ulcerHistory: true }).cat, 3);
  assert.equal(iwgdfCategory({ lops: true, esrd: true }).months, 1);
  assert.equal(iwgdfCategory({ ulcer: true }).urgent, true);
});

test('тиреоидни хормони: тълкуване с и без лечение', () => {
  const t = (tsh, ft4 = null, ft3 = null, extra = {}) => thyroidPattern({ tsh, ft4, ft3, ...extra }).id;
  assert.equal(t(2.1, 15), 'euthyroid');
  assert.equal(t(12, 8), 'hypo');
  assert.equal(t(6.5, 14), 'subhypo');
  assert.equal(t(11, 14), 'subhypo10');
  assert.equal(t(0.01, 35), 'hyper');
  assert.equal(t(0.02, 18, 9), 't3tox');
  assert.equal(t(0.05, 18, 5), 'subhyper2');
  assert.equal(t(0.25, 18, 5), 'subhyper1');
  assert.equal(t(1.2, 9), 'central');
  assert.equal(t(2.5, 30), 'discordant');
  assert.equal(t(6.5, 13, null, { onLt4: true }), 'lt4_under_mild');
  assert.equal(t(15, 9, null, { onLt4: true }), 'lt4_under');
  assert.equal(t(0.05, 25, null, { onLt4: true }), 'lt4_over');
  assert.equal(t(2, 24, null, { onLt4: true }), 'lt4_timing');
  assert.equal(t(0.1, 30, null, { onAtd: true }), 'atd_under');
  assert.equal(t(8, 9, null, { onAtd: true }), 'atd_over');
  assert.equal(thyroidPattern({}), null);
});

test('възли: EU-TIRADS, прагове за биопсия, растеж и цитология', () => {
  const e = (extra) => ({ id: 'e', date: '2026-01-10', dims: [12, 10, 8], composition: 'solid', echogenicity: 'iso', shape: 'oval', margins: 'smooth', microcalc: false, ...extra });
  assert.equal(euTirads(e({ composition: 'spongiform' })), 2);
  assert.equal(euTirads(e({ composition: 'cystic', echogenicity: '' })), 2);
  assert.equal(euTirads(e({})), 3);
  assert.equal(euTirads(e({ echogenicity: 'mild' })), 4);
  for (const hr of [{ echogenicity: 'marked' }, { shape: 'taller' }, { margins: 'irregular' }, { microcalc: true }]) assert.equal(euTirads(e(hr)), 5);

  const n = (exams, fna = []) => noduleAssessment({ id: 'n', lobe: 'right', status: 'active', exams, fna }, T);
  assert.equal(n([e({ dims: [21, 15, 12] })]).action, 'fna', 'EU-TIRADS 3 над 20 мм');
  assert.equal(n([e({ dims: [20, 15, 12] })]).action, 'follow', 'точно 20 мм — наблюдение');
  assert.equal(n([e({ dims: [20, 15, 12] })]).next, addMonths('2026-01-10', 36));
  assert.equal(n([e({ echogenicity: 'mild', dims: [16, 10, 9] })]).action, 'fna', 'EU-TIRADS 4 над 15 мм');
  assert.equal(n([e({ echogenicity: 'mild', dims: [12, 10, 9] })]).next, addMonths('2026-01-10', 12));
  assert.equal(n([e({ microcalc: true, dims: [11, 8, 7] })]).action, 'fna', 'EU-TIRADS 5 над 10 мм');
  assert.equal(n([e({ microcalc: true, dims: [8, 7, 6] })]).next, addMonths('2026-01-10', 6));
  assert.equal(n([e({ dims: [8, 7, 6] })]).action, 'none', 'нисък риск под 10 мм — без проследяване');

  const grown = noduleGrowth(e({ date: '2024-01-01', dims: [10, 10, 10] }), e({ dims: [12, 12, 10] }));
  assert.equal(grown.significant, true, '+20% и +2 мм в два размера');
  assert.equal(noduleGrowth(e({ date: '2024-01-01', dims: [10, 10, 10] }), e({ dims: [11, 11, 11] })).significant, false);
  assert.equal(noduleGrowth(e({ date: '2024-01-01', dims: [5, 5, 5] }), e({ dims: [6, 6, 6] })).significant, true, 'обем +73%');

  const benign = [{ id: 'f', date: '2026-02-01', bethesda: 2 }];
  assert.equal(n([e({ dims: [24, 18, 15] })], benign).action, 'follow');
  assert.equal(n([e({ microcalc: true, dims: [14, 10, 9] })], benign).action, 'fna', 'доброкачествена при EU-TIRADS 5 — повторна биопсия');
  assert.equal(n([e({})], [{ id: 'f', date: '2026-02-01', bethesda: 6 }]).action, 'surgery');
  assert.equal(n([e({})], [{ id: 'f', date: '2026-02-01', bethesda: 3 }]).action, 'refer');
  assert.equal(n([e({})], [{ id: 'f', date: '2026-02-01', bethesda: 1 }]).action, 'fna');
});

/* ----------------------------- проверка на въведеното ----------------------------- */

test('изследванията на специалиста се проверяват по описанието', () => {
  assert.equal(validateStudy('echo', {}).error, 'Полето „Фракция на изтласкване“ е задължително.');
  assert.match(validateStudy('echo', { ef: 95 }).error, /извън допустимите граници/);
  assert.deepEqual(validateStudy('echo', { ef: '35', ee: '14,26' }).values, { ef: 35, ee: 14.3 });
  assert.match(validateStudy('abpm', { sys24: 80, dia24: 90 }).error, /по-високо/);
  assert.match(validateStudy('abpm', { sys24: 130, dia24: 80, sysDay: 135 }).error, /и систолното, и диастолното/);
  assert.match(validateStudy('cgm', { days: 14, tir: 80, high: 30 }).error, /100%/);
  assert.match(validateStudy('smbg', { hypo: 1, hypo2: 3 }).error, /не може да са повече/);
  assert.equal(validateStudy('ecg', { rhythm: 'sinus', hr: 70, lbbb: 'on' }).values.lbbb, true);
  assert.match(validateStudy('ecg', { rhythm: 'weird', hr: 70 }).error, /Непозната стойност/);
  assert.equal(validateStudy('nyha', { nyha: '3' }).values.nyha, 3);
  assert.match(validateStudy('echo', { ef: { $gt: 1 } }).error, /неправилен вид/);
  assert.match(validateStudy('xyz', {}).error, /Непознат вид/);
  for (const [id, def] of Object.entries(STUDY_KINDS)) assert.ok(['cardio', 'endo'].includes(def.module), id);
});

test('проверката при зареждане поправя модулите и възлите', () => {
  const d = {
    settings: { modules: { cardio: 'yes', endo: true, evil: true } },
    patients: [{ id: 'p', name: 'X', nodules: [{ id: 'n', exams: [{ dims: ['12', -3, 'x', 5, 7] }, 'junk'], fna: 'oops' }], studies: [{ id: 's', kind: 'echo' }] }],
  };
  normalizeData(d);
  assert.deepEqual(d.settings.modules, { cardio: false, endo: true });
  assert.deepEqual(d.patients[0].nodules[0].exams[0].dims, [12, 5, 7]);
  assert.equal(d.patients[0].nodules[0].exams.length, 1);
  assert.deepEqual(d.patients[0].nodules[0].fna, []);
  assert.deepEqual(d.patients[0].studies[0].values, {});
});

/* ----------------------------- приложен интерфейс ----------------------------- */

test('API: модулите се включват от настройките; изследвания, възли и списък за действие', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-spec-'));
  const store = new Store(dir);
  store.data.settings.requireLogin = false;
  store.data.patients.push(
    {
      id: 'a1', name: 'Мария Иванова', sex: 'f', birthDate: born(58), createdAt: born(1),
      chronic: [{ id: 'c1', code: 'hypothyroid', status: 'active', since: '2020-01-01' }],
      meds: [{ id: 'm1', drug: 'levothyroxine', dose: '75 мкг', schedule: { m: '1' } }],
      results: [{ id: 'r1', code: 'tsh', value: 6.8, date: T }, { id: 'r2', code: 'ft4', value: 13, date: T }],
    },
    { id: 'k1', name: 'Дете', sex: 'm', birthDate: born(8), createdAt: born(1) },
  );
  store.migrate();
  const server = createAppServer({ store, serveStatic: memoryStatic({ 'index.html': 'x' }), requireActivation: false });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, body: body && JSON.stringify(body), headers: body ? { 'Content-Type': 'application/json' } : {} });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  try {
    const off = await call('POST', '/api/patients/a1/studies', { kind: 'echo', values: { ef: 35 } });
    assert.equal(off.status, 400);
    assert.match(off.data.error, /не е включен/);
    assert.equal((await call('GET', '/api/specialty/endo')).status, 400);
    assert.equal((await call('GET', '/api/patients/a1')).data.specialty.endo, undefined);

    const set = await call('PATCH', '/api/settings', { modules: { cardio: true, endo: true } });
    assert.deepEqual(set.data.settings.modules, { cardio: true, endo: true });
    assert.equal((await call('PATCH', '/api/settings', { modules: 'x' })).status, 400);

    // Досие, създадено след стартиране на програмата (не е минало през проверката при зареждане).
    const fresh = await call('POST', '/api/patients', { name: 'Нов Пациент', sex: 'm', birthDate: born(60) });
    const fid = fresh.data.patient.id;
    assert.equal((await call('POST', `/api/patients/${fid}/studies`, { kind: 'ecg', values: { rhythm: 'sinus', hr: 70 } })).status, 200);
    assert.equal((await call('POST', `/api/patients/${fid}/nodules`, { lobe: 'left', exam: { dims: [9], composition: 'cystic' } })).status, 200);
    delete store.patient(fid).studies;
    assert.equal((await call('POST', `/api/patients/${fid}/studies`, { kind: 'nyha', values: { nyha: 2 } })).status, 200, 'и досие без списъка');

    const echo = await call('POST', '/api/patients/a1/studies', { kind: 'echo', date: T, values: { ef: '38', lvedd: '55' }, text: 'хипокинезия' });
    assert.equal(echo.status, 200);
    assert.equal(echo.data.study.values.ef, 38);
    assert.equal((await call('POST', '/api/patients/a1/studies', { kind: 'echo', values: { ef: 38 }, date: '2999-01-01' })).status, 400);
    assert.equal((await call('POST', '/api/patients/a1/studies', { kind: 'ecg', values: { hr: 70 } })).status, 400, 'ритъмът е задължителен');
    assert.equal((await call('POST', '/api/patients/k1/studies', { kind: 'echo', values: { ef: 60 } })).status, 400, 'само за пълнолетни');

    const nod = await call('POST', '/api/patients/a1/nodules', {
      lobe: 'right', location: 'горна трета',
      exam: { date: addMonths(T, -14), dims: [12, 10, '9'], composition: 'solid', echogenicity: 'mild', shape: 'oval', margins: 'smooth' },
    });
    assert.equal(nod.status, 200);
    assert.equal(nod.data.nodule.exams[0].category, 4);
    const nid = nod.data.nodule.id;
    assert.equal((await call('POST', `/api/patients/a1/nodules/${nid}/exams`, { dims: [], composition: 'solid' })).status, 400);
    assert.equal((await call('POST', `/api/patients/a1/nodules/${nid}/exams`, { dims: [12], composition: 'lava' })).status, 400);
    assert.equal((await call('POST', `/api/patients/a1/nodules/${nid}/fna`, { bethesda: 7 })).status, 400);
    const fna = await call('POST', `/api/patients/a1/nodules/${nid}/fna`, { date: T, bethesda: '2' });
    assert.equal(fna.data.fna.bethesda, 2);

    const view = await call('GET', '/api/patients/a1');
    const endo = view.data.specialty.endo;
    assert.equal(endo.thyroid.pattern.id, 'lt4_under_mild');
    assert.equal(endo.nodules[0].action, 'follow');
    assert.ok(view.data.specialty.cardio, 'и двата модула са в изгледа');
    assert.equal(view.data.adult.monitoring.find(t => t.req === 'tsh').last, T);

    const list = await call('GET', '/api/specialty/endo');
    assert.equal(list.data.considered, 2, 'детето не се преглежда');
    assert.ok(list.data.groups.some(g => g.id === 'thyroid' || g.id === 'nodule_follow') || list.data.groups.length === 0);
    assert.equal((await call('GET', '/api/specialty/nope')).status, 404);

    // Контролната ехография идва в задачите, когато наближи.
    store.patient('a1').nodules[0].fna = [];
    store.patient('a1').updatedAt = new Date().toISOString();
    const tasks = await call('GET', '/api/tasks?horizon=365');
    const all = Object.values(tasks.data.buckets).flat();
    assert.ok(all.some(t => t.itemId === 'nodule:' + nid), 'ехографията на възела е в задачите');

    assert.equal((await call('PATCH', `/api/patients/a1/nodules/${nid}`, { status: 'removed' })).data.nodule.status, 'removed');
    assert.equal((await call('DELETE', `/api/patients/a1/nodules/${nid}/fna/nothing`)).status, 404);
    assert.equal((await call('DELETE', `/api/patients/a1/nodules/${nid}/other/x`)).status, 404);
    assert.equal((await call('DELETE', `/api/patients/a1/studies/${echo.data.study.id}`)).status, 200);
    assert.equal((await call('DELETE', `/api/patients/a1/nodules/${nid}`)).status, 200);
    assert.equal(store.patient('a1').nodules.length, 0);
    const log = store.readAudit(50).map(e => e.action);
    for (const a of ['study_add', 'nodule_add', 'nodule_fna', 'nodule_update', 'study_delete', 'nodule_delete']) assert.ok(log.includes(a), a);
  } finally {
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
    await store.writePromise.catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
