/* Проверка на растежните изчисления срещу публикуваните стойности на СЗО.
 * Числата в очакванията са взети от официалните таблици на СЗО
 * (Child Growth Standards 0–5 г. и Growth Reference 2007 за 5–19 г.). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assess, bmi, lmsAt, percentileCurves, percentileFromZ, valueAtZ, zScore,
} from '../public/js/shared/growth.js';

/** Стойността при даден z-скор, закръглена — сравнява се с публикуваните таблици. */
function atZ(indicator, sex, ageMonths, z) {
  return valueAtZ(lmsAt(indicator, sex, ageMonths), z);
}

test('медианите съвпадат с таблиците на СЗО', () => {
  const cases = [
    ['weight', 'm', 0, 3.3464], ['weight', 'f', 0, 3.2322],
    ['weight', 'm', 12, 9.6479], ['weight', 'f', 12, 8.9481],
    ['weight', 'm', 60, 18.3352],
    ['height', 'm', 0, 49.8842], ['height', 'f', 0, 49.1477],
    // На 24 месеца СЗО минава на изправен ръст: 85.7 см (а не 86.4 см дължина).
    ['height', 'f', 24, 85.7], ['height', 'm', 24, 87.1],
    ['height', 'm', 60, 110.0], ['height', 'f', 60, 109.4],
    ['height', 'm', 228, 176.5432], ['height', 'f', 228, 163.1548],
    ['head', 'm', 0, 34.4618], ['head', 'f', 0, 33.8787],
    ['bmi', 'm', 60, 15.1917],
  ];
  for (const [ind, sex, age, expected] of cases) {
    const m = lmsAt(ind, sex, age).M;
    assert.ok(Math.abs(m - expected) < 0.06,
      `${ind}/${sex} на ${age} мес.: получено ${m.toFixed(4)}, очаквано ${expected}`);
  }
});

test('границите ±2 SD съвпадат с публикуваните от СЗО', () => {
  // Публикувани стойности от таблиците „weight-for-age“ и „length-for-age“.
  const cases = [
    ['weight', 'm', 0, -2, 2.5], ['weight', 'm', 0, 2, 4.4],
    ['weight', 'f', 0, -2, 2.4], ['weight', 'f', 0, 2, 4.2],
    ['weight', 'm', 12, -2, 7.7], ['weight', 'm', 12, 2, 12.0],
    ['height', 'm', 0, -2, 46.1], ['height', 'm', 0, 2, 53.7],
    ['head', 'm', 0, -2, 31.9], ['head', 'm', 0, 2, 37.0],
  ];
  for (const [ind, sex, age, z, expected] of cases) {
    const v = atZ(ind, sex, age, z);
    assert.ok(Math.abs(v - expected) < 0.06,
      `${ind}/${sex} ${age} мес. при z=${z}: получено ${v.toFixed(2)}, очаквано ${expected}`);
  }
});

test('z-скорът и стойността са взаимно обратни', () => {
  for (const [ind, sex, age] of [['weight', 'm', 6], ['height', 'f', 30], ['bmi', 'm', 120], ['head', 'f', 3]]) {
    for (const z of [-2.5, -1, 0, 1.5, 2.8]) {
      const v = atZ(ind, sex, age, z);
      const back = zScore(ind, sex, age, v);
      assert.ok(Math.abs(back - z) < 1e-6, `${ind}/${sex}/${age}: z=${z} -> ${back}`);
    }
  }
});

test('медианата отговаря на 50-и перцентил', () => {
  const a = assess('weight', 'm', 9, lmsAt('weight', 'm', 9).M);
  assert.ok(Math.abs(a.z) < 1e-9);
  assert.ok(Math.abs(a.percentile - 50) < 0.01);
});

test('перцентилите отговарят на стандартното нормално разпределение', () => {
  assert.ok(Math.abs(percentileFromZ(-1.8807936) - 3) < 0.01);
  assert.ok(Math.abs(percentileFromZ(-1.0364334) - 15) < 0.01);
  assert.ok(Math.abs(percentileFromZ(1.0364334) - 85) < 0.01);
  assert.ok(Math.abs(percentileFromZ(1.8807936) - 97) < 0.01);
  assert.ok(Math.abs(percentileFromZ(-2) - 2.275) < 0.01);
});

test('корекцията на СЗО важи само за индикаторите, базирани на тегло', () => {
  // Извън ±3 SD теглото се преизчислява линейно, затова z расте по-бавно.
  const lms = lmsAt('weight', 'm', 12);
  const sd3 = valueAtZ(lms, 3);
  const sd2 = valueAtZ(lms, 2);
  const beyond = sd3 + (sd3 - sd2); // точно едно „SD3-стъпало“ над +3 SD
  assert.ok(Math.abs(zScore('weight', 'm', 12, beyond) - 4) < 1e-6);

  // При ръста се ползва чистата LMS формула.
  const hLms = lmsAt('height', 'm', 12);
  const h4 = valueAtZ(hLms, 4);
  assert.ok(Math.abs(zScore('height', 'm', 12, h4) - 4) < 1e-9);
});

test('тълкуването отразява праговете на СЗО', () => {
  const lms = lmsAt('weight', 'm', 6);
  assert.equal(assess('weight', 'm', 6, valueAtZ(lms, -2.5)).label, 'поднормено тегло');
  assert.equal(assess('weight', 'm', 6, valueAtZ(lms, -3.5)).label, 'тежко поднормено тегло');
  assert.equal(assess('weight', 'm', 6, lms.M).label, 'в норма');

  // Над 5 години: наднормено тегло от +1 SD, затлъстяване от +2 SD.
  const school = lmsAt('bmi', 'm', 100);
  assert.equal(assess('bmi', 'm', 100, valueAtZ(school, 2.5)).label, 'затлъстяване');
  assert.equal(assess('bmi', 'm', 100, valueAtZ(school, 1.5)).label, 'наднормено тегло');
  assert.equal(assess('bmi', 'm', 100, school.M).label, 'в норма');

  // До 5 години праговете са с едно SD по-високи.
  const toddler = lmsAt('bmi', 'm', 30);
  assert.equal(assess('bmi', 'm', 30, valueAtZ(toddler, 2.5)).label, 'наднормено тегло');
  assert.equal(assess('bmi', 'm', 30, valueAtZ(toddler, 3.5)).label, 'затлъстяване');
  assert.equal(assess('bmi', 'm', 30, valueAtZ(toddler, 1.5)).label, 'риск от наднормено тегло');
  assert.equal(assess('bmi', 'm', 30, valueAtZ(toddler, -2.5)).label, 'изтощение');
});

test('ИТМ се смята правилно', () => {
  assert.ok(Math.abs(bmi(16, 100) - 16) < 1e-9);
  assert.ok(Math.abs(bmi(70, 175) - 22.857) < 0.001);
  assert.equal(bmi(0, 100), null);
});

test('извън възрастовия обхват няма оценка', () => {
  assert.equal(zScore('weight', 'm', 70, 20), null, 'тегло за възраст е до 5 г.');
  assert.equal(zScore('head', 'm', 70, 50), null, 'обиколка на глава е до 5 г.');
  assert.ok(zScore('height', 'm', 70, 115) !== null, 'ръстът продължава до 19 г.');
  assert.ok(zScore('bmi', 'm', 200, 21) !== null, 'ИТМ продължава до 19 г.');
});

test('преходът между таблиците 0–5 и 5–19 г. е гладък', () => {
  // На границата (60 и 61 месеца) двата стандарта на СЗО трябва да се стиковат.
  const a = lmsAt('height', 'm', 60).M;
  const b = lmsAt('height', 'm', 61).M;
  assert.ok(Math.abs(b - a) < 1, `${a} -> ${b}`);
  const c = lmsAt('bmi', 'm', 60).M;
  const d = lmsAt('bmi', 'm', 61).M;
  assert.ok(Math.abs(d - c) < 0.3, `${c} -> ${d}`);
});

test('перцентилните криви са монотонни и подредени', () => {
  const curves = percentileCurves('weight', 'm', 0, 24, 24);
  assert.equal(curves.length, 5);
  for (let i = 1; i < curves.length; i++) {
    for (let j = 0; j < curves[i].points.length; j++) {
      assert.ok(curves[i].points[j][1] > curves[i - 1].points[j][1],
        'по-високият перцентил трябва да е над по-ниския');
    }
  }
  // Теглото расте с възрастта.
  const p50 = curves.find(c => c.p === 50).points;
  for (let i = 1; i < p50.length; i++) assert.ok(p50[i][1] > p50[i - 1][1]);
});
