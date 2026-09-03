/* Проверки на добавената клинична логика: коригирана възраст при недоносеност,
 * разпознаване на изоставане в растежа по NICE NG75 и оценка на артериалното
 * налягане по скрининговата таблица на AAP. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AAP_SCREENING_BP, assessBloodPressure, screeningThreshold,
} from '../public/js/shared/bp.js';
import {
  analyseMeasurements, correctionMonths, growthAge, growthConcerns, isPreterm,
  lmsAt, midParentalHeight, valueAtZ,
} from '../public/js/shared/growth.js';
import { addMonths } from '../public/js/shared/dates.js';

/* --------------------------- коригирана възраст --------------------------- */

test('коригирана възраст се прилага само при недоносеност', () => {
  assert.equal(isPreterm(40), false);
  assert.equal(isPreterm(37), false, '37 седмици вече е доносено');
  assert.equal(isPreterm(32), true);
  assert.equal(isPreterm(null), false);

  // Родено на 32 г.с. — изостава с 8 седмици, тоест около 1.84 месеца.
  assert.ok(Math.abs(correctionMonths(32) - 8 * 7 / 30.4375) < 1e-9);
  assert.equal(correctionMonths(39), 0);
});

test('корекцията спира на 24 месеца', () => {
  const preterm = 30; // изостава с 10 седмици
  const at6 = growthAge(6, preterm);
  assert.ok(at6.corrected);
  assert.ok(Math.abs(at6.months - (6 - correctionMonths(30))) < 1e-9);

  const at30 = growthAge(30, preterm);
  assert.equal(at30.corrected, false, 'след 24 месеца се ползва хронологичната възраст');
  assert.equal(at30.months, 30);

  const term = growthAge(6, 40);
  assert.equal(term.corrected, false);
  assert.equal(term.months, 6);
});

test('преди достигане на термин стандартите на СЗО не се прилагат', () => {
  // Родено на 28 г.с., на 3 седмици живот — още не е достигнало 40 г.с.
  const age = growthAge(0.7, 28);
  assert.equal(age.beforeTerm, true);

  const patient = { sex: 'm', birthDate: '2026-08-01', birth: { gestWeeks: 28 } };
  const rows = analyseMeasurements(patient, [{ date: '2026-08-22', weight: 1.4, height: 40 }]);
  assert.equal(rows[0].beforeTerm, true);
  assert.deepEqual(rows[0].assessments, {},
    'няма персентили преди термин — там важат карти като Fenton/INTERGROWTH');
});

test('недоносено дете се оценява по коригирана възраст', () => {
  // Родено на 32 г.с. Хронологично на 6 месеца, коригирано ~4.2 месеца.
  const patient = { sex: 'm', birthDate: '2026-03-03', birth: { gestWeeks: 32 } };
  const rows = analyseMeasurements(patient, [{ date: '2026-09-03', weight: 6.8, height: 63 }]);
  const row = rows[0];
  assert.ok(row.ageCorrected);
  assert.ok(Math.abs(row.chronologicalMonths - 6.05) < 0.1);
  assert.ok(row.ageMonths < row.chronologicalMonths - 1.5);

  // Същото тегло, оценено по хронологична възраст, би дало по-нисък персентил.
  const term = { sex: 'm', birthDate: '2026-03-03', birth: { gestWeeks: 40 } };
  const termRow = analyseMeasurements(term, [{ date: '2026-09-03', weight: 6.8, height: 63 }])[0];
  assert.ok(row.assessments.weight.z > termRow.assessments.weight.z,
    'корекцията вдига оценката — иначе недоносените изглеждат изкуствено изоставащи');
});

/* ------------------------- изоставане в растежа --------------------------- */

/** Съставя измерване с точно зададен z-скор за теглото. */
function weightAtZ(sex, ageMonths, z) {
  return +valueAtZ(lmsAt('weight', sex, ageMonths), z).toFixed(3);
}

function child(birthWeightZ, points, sex = 'm') {
  const birthDate = '2025-09-03';
  const patient = {
    sex, birthDate,
    birth: { weight: birthWeightZ === null ? null : weightAtZ(sex, 0, birthWeightZ), gestWeeks: 40 },
  };
  const measurements = points.map(([months, z]) => ({
    id: 'm' + months,
    date: addMonths(birthDate, months),
    weight: weightAtZ(sex, months, z),
  }));
  return { patient, analysed: analyseMeasurements(patient, measurements) };
}

test('спад с два персентилни интервала при нормално тегло при раждане се отчита', () => {
  const { patient, analysed } = child(0, [[2, 0], [4, -0.4], [6, -1.5]]);
  const concerns = growthConcerns(patient, analysed);
  const f = concerns.find(c => c.type === 'weight_faltering');
  assert.ok(f, 'спад от 1.5 z = 2.2 интервала трябва да се хване');
  assert.ok(f.spaces > 2);
  assert.equal(f.severity, 2);
});

test('лек спад при нормално тегло при раждане не вдига тревога', () => {
  const { patient, analysed } = child(0, [[2, 0], [4, -0.3], [6, -0.6]]);
  const concerns = growthConcerns(patient, analysed);
  assert.ok(!concerns.some(c => c.type === 'weight_faltering'),
    'под един интервал спад е в рамките на нормалната вариация');
});

test('прагът е по-нисък при ниско тегло при раждане', () => {
  // Тегло при раждане под 9-и персентил: тревога вече при един интервал.
  const low = child(-1.6, [[2, -1.6], [4, -1.9], [6, -2.35]]);
  assert.ok(growthConcerns(low.patient, low.analysed).some(c => c.type === 'weight_faltering'));

  // Същият спад при високо тегло при раждане не достига прага от три интервала.
  const high = child(1.6, [[2, 1.6], [4, 1.3], [6, 0.85]]);
  assert.ok(!growthConcerns(high.patient, high.analysed).some(c => c.type === 'weight_faltering'));
});

test('тегло под 2-ри персентил се отчита отделно', () => {
  const { patient, analysed } = child(-1.9, [[2, -2.1], [4, -2.2]]);
  const concerns = growthConcerns(patient, analysed);
  assert.ok(concerns.some(c => c.type === 'weight_below_2nd'));
});

test('пресичане на персентили при обиколката на главата се отчита', () => {
  const birthDate = '2025-09-03';
  const patient = { sex: 'm', birthDate, birth: { gestWeeks: 40 } };
  const mk = (months, z) => ({
    id: 'h' + months, date: addMonths(birthDate, months),
    head: +valueAtZ(lmsAt('head', 'm', months), z).toFixed(2),
  });
  const analysed = analyseMeasurements(patient, [mk(1, 0), mk(6, 1.6)]);
  const concerns = growthConcerns(patient, analysed);
  const f = concerns.find(c => c.type === 'head_crossing');
  assert.ok(f);
  assert.match(f.title, /Ускорен растеж/);
});

test('изоставането не се засича преди да има поне две измервания', () => {
  const { patient, analysed } = child(0, [[2, -3]]);
  assert.ok(!growthConcerns(patient, analysed).some(c => c.type === 'weight_faltering'));
});

/* --------------------------- артериално налягане -------------------------- */

test('скрининговата таблица на AAP е пълна и подредена', () => {
  assert.equal(AAP_SCREENING_BP.length, 13, 'възрасти от 1 до 13 години');
  for (let i = 1; i < AAP_SCREENING_BP.length; i++) {
    assert.ok(AAP_SCREENING_BP[i][1] >= AAP_SCREENING_BP[i - 1][1], 'систолното расте с възрастта');
    assert.ok(AAP_SCREENING_BP[i][3] >= AAP_SCREENING_BP[i - 1][3]);
  }
  // Няколко публикувани стойности от Таблица 6 на указанието от 2017 г.
  assert.deepEqual(screeningThreshold('m', 3), { systolic: 101, diastolic: 58 });
  assert.deepEqual(screeningThreshold('f', 3), { systolic: 102, diastolic: 60 });
  assert.deepEqual(screeningThreshold('m', 6), { systolic: 105, diastolic: 66 });
  assert.deepEqual(screeningThreshold('f', 11), { systolic: 111, diastolic: 74 });
  assert.deepEqual(screeningThreshold('m', 13), { systolic: 120, diastolic: 80 });
  assert.deepEqual(screeningThreshold('m', 17), { systolic: 120, diastolic: 80 }, 'над 13 г. — фиксиран праг');
});

test('налягането под прага е в норма, на прага — за доуточняване', () => {
  const under = assessBloodPressure('m', 6, 100, 60);
  assert.equal(under.category, 'normal');
  assert.equal(under.severity, 0);

  const over = assessBloodPressure('m', 6, 105, 60);
  assert.equal(over.category, 'above_screening');
  assert.equal(over.severity, 1);

  // Достатъчно е само едната стойност да е над прага.
  assert.equal(assessBloodPressure('m', 6, 100, 66).category, 'above_screening');
});

test('от 13 години се ползват праговете за възрастни', () => {
  assert.equal(assessBloodPressure('m', 14, 118, 76).category, 'normal');
  assert.equal(assessBloodPressure('m', 14, 122, 76).category, 'elevated');
  assert.equal(assessBloodPressure('m', 14, 132, 78).category, 'stage1');
  assert.equal(assessBloodPressure('f', 15, 128, 84).category, 'stage1', 'диастолното също решава');
  assert.equal(assessBloodPressure('m', 16, 142, 70).category, 'stage2');
  assert.equal(assessBloodPressure('m', 16, 120, 92).category, 'stage2');
});

test('налягането се оценява по хронологична възраст и влиза в находките', () => {
  const patient = { sex: 'm', birthDate: '2018-09-03', birth: { gestWeeks: 40 } };
  const rows = analyseMeasurements(patient, [
    { id: 'a', date: '2026-09-03', weight: 26, height: 128, systolic: 118, diastolic: 74 },
  ]);
  assert.equal(rows[0].assessments.bp.category, 'above_screening');
  const concerns = growthConcerns(patient, rows);
  assert.ok(concerns.some(c => c.type === 'blood_pressure'));
});

test('липсващо налягане не се оценява', () => {
  assert.equal(assessBloodPressure('m', 6, 0, 0), null);
  assert.equal(assessBloodPressure('m', 0.5, 90, 50), null, 'под 1 година таблицата не важи');
});

/* ----------------------------- целеви ръст -------------------------------- */

test('целевият ръст се смята по формулата на Tanner', () => {
  const boy = midParentalHeight('m', 165, 180);
  assert.ok(Math.abs(boy.target - 179) < 1e-9);
  assert.ok(Math.abs(boy.low - 170.5) < 1e-9);
  assert.ok(Math.abs(boy.high - 187.5) < 1e-9);

  const girl = midParentalHeight('f', 165, 180);
  assert.ok(Math.abs(girl.target - 166) < 1e-9);

  assert.equal(midParentalHeight('m', null, 180), null);
  assert.equal(midParentalHeight('m', 165, 0), null);
});

test('съобщението посочва коя стойност е над прага', () => {
  // Праг за 3-годишно момче: 101/58.
  const onlyDiastolic = assessBloodPressure('m', 3, 91, 58);
  assert.equal(onlyDiastolic.which, 'диастолното');
  const onlySystolic = assessBloodPressure('m', 3, 105, 50);
  assert.equal(onlySystolic.which, 'систолното');
  const both = assessBloodPressure('m', 3, 105, 60);
  assert.equal(both.which, 'систолното и диастолното');
  assert.equal(assessBloodPressure('m', 3, 90, 50).which, '');
});
