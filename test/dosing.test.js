/* Детски дозировки по тегло: стойности по кратките характеристики на
 * продуктите и препоръките (виж public/js/shared/pedsdosing.js). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOSING_DRUGS, DRUG_ORDER, computeDose, patientWarnings } from '../public/js/shared/pedsdosing.js';

const dose = (o) => computeDose({ ageMonths: 36, ...o });
const levels = (r) => r.warnings.map(w => w.level);

test('парацетамол: 15 mg/kg, до 4 пъти, макс. 60 mg/kg дневно и 1 g на прием', () => {
  const r = dose({ drugId: 'paracetamol', weightKg: 12 });
  assert.deepEqual([r.dose.mg, r.dose.ml, r.maxDay.mg, r.maxDay.ml], [180, 7.5, 720, 30]);
  assert.match(r.text, /7,5 ml \(180 mg\).*не повече от 4 пъти/);
  const big = dose({ drugId: 'paracetamol', weightKg: 80, ageMonths: 200, formId: 's250' });
  assert.equal(big.dose.mg, 1000, 'не повече от 1 g на прием');
  assert.equal(big.maxDay.mg, 4000);
  const supp = dose({ drugId: 'paracetamol', weightKg: 12, formId: 'supp' });
  assert.equal(supp.suppository.mg, 150);
  assert.ok(supp.suppository.perKg >= 10 && supp.suppository.perKg <= 20);
  const baby = dose({ drugId: 'paracetamol', weightKg: 5, ageMonths: 2 });
  assert.ok(baby.warnings.some(w => /под 3 месеца/i.test(w.text) && w.level === 'bad'));
});

test('ибупрофен: 10 mg/kg, до 3 пъти, макс. 30 mg/kg дневно; от 3 месеца и 5 kg', () => {
  const r = dose({ drugId: 'ibuprofen', weightKg: 12 });
  assert.deepEqual([r.dose.mg, r.dose.ml, r.maxDay.mg, r.maxDay.ml], [120, 6, 360, 18]);
  assert.equal(dose({ drugId: 'ibuprofen', weightKg: 60, ageMonths: 200 }).dose.mg, 400, 'до 400 mg на прием');
  assert.ok(levels(dose({ drugId: 'ibuprofen', weightKg: 4.5, ageMonths: 2 })).includes('bad'));
  assert.ok(DOSING_DRUGS.ibuprofen.notes.some(n => /варицела/.test(n)));
});

test('амоксицилин: висока доза за отит, стрептококов фарингит веднъж дневно до 1 g', () => {
  const high = dose({ drugId: 'amoxicillin', regimenId: 'high', formId: 's250', weightKg: 12 });
  assert.equal(high.dosesPerDay, 2);
  assert.ok(Math.abs(high.dose.mg - 540) <= 15, `${high.dose.mg} mg`);
  const strep = dose({ drugId: 'amoxicillin', regimenId: 'strep', formId: 's250', weightKg: 30 });
  assert.equal(strep.dose.mg, 1000, 'до 1000 mg веднъж дневно');
  assert.equal(strep.days, 10);
  assert.equal(strep.courseMl, 200);
  const adult = dose({ drugId: 'amoxicillin', regimenId: 'high', formId: 's500', weightKg: 70, ageMonths: 220 });
  assert.equal(adult.dayMg, 3000, 'не повече от 3 g дневно');
});

test('амоксицилин/клавуланова: 7:1 за стандартна доза, предупреждение при много клавуланова', () => {
  const std = dose({ drugId: 'amoxiclav', weightKg: 12 });
  assert.equal(std.form.id, 's400');
  assert.ok(std.clavPerKgDay <= 10);
  const wrong = dose({ drugId: 'amoxiclav', regimenId: 'high', formId: 's400', weightKg: 12 });
  assert.ok(wrong.warnings.some(w => /Клавуланова/.test(w.text)));
  const es = dose({ drugId: 'amoxiclav', regimenId: 'high', weightKg: 12 });
  assert.equal(es.form.id, 's600');
  assert.ok(!es.warnings.some(w => /Клавуланова/.test(w.text)));
  assert.ok(levels(dose({ drugId: 'amoxiclav', weightKg: 4, ageMonths: 1 })).includes('bad'), 'под 2 месеца');
});

test('азитромицин: 10 mg/kg първия ден, после 5 mg/kg; при коклюш под 6 месеца 10 mg/kg 5 дни', () => {
  const five = dose({ drugId: 'azithromycin', regimenId: 'five', formId: 's200', weightKg: 12 });
  assert.deepEqual([five.dose.mg, five.laterDose.mg, five.days, five.courseMl], [120, 60, 5, 9]);
  const baby = dose({ drugId: 'azithromycin', regimenId: 'pertussis', formId: 's100', weightKg: 5, ageMonths: 2 });
  assert.equal(baby.laterDose, undefined);
  assert.deepEqual([baby.dose.mg, baby.courseMl], [50, 13]);
  const older = dose({ drugId: 'azithromycin', regimenId: 'pertussis', formId: 's200', weightKg: 60, ageMonths: 150 });
  assert.equal(older.dose.mg, 500, 'до 500 mg първия ден');
  assert.ok(older.laterDose.mg <= 250 && older.laterDose.mg >= 245, `после до 250 mg: ${older.laterDose.mg}`);
  const newborn = dose({ drugId: 'azithromycin', regimenId: 'pertussis', weightKg: 3.5, ageMonths: 0.5 });
  assert.ok(newborn.warnings.some(w => /пилорна стеноза/.test(w.text)));
});

test('кларитромицин, цефуроксим, цефиксим и ко-тримоксазол', () => {
  assert.equal(dose({ drugId: 'clarithromycin', formId: 's250', weightKg: 20 }).dose.mg, 150);
  assert.equal(dose({ drugId: 'clarithromycin', formId: 's250', weightKg: 90, ageMonths: 200 }).dose.mg, 500);
  assert.equal(dose({ drugId: 'cefuroxime', weightKg: 20 }).dose.mg, 125, 'стандартно до 125 mg');
  const otitis = dose({ drugId: 'cefuroxime', regimenId: 'otitis', formId: 's250', weightKg: 20 });
  assert.equal(otitis.dose.mg, 250, 'при отит до 250 mg');
  assert.ok(levels(dose({ drugId: 'cefuroxime', regimenId: 'otitis', weightKg: 11, ageMonths: 18 })).includes('bad'), 'под 2 години');
  const cfx = dose({ drugId: 'cefixime', weightKg: 12 });
  assert.deepEqual([cfx.dose.mg, cfx.dose.ml], [96, 4.8]);
  assert.equal(dose({ drugId: 'cefixime', weightKg: 70, ageMonths: 200 }).dose.mg, 400);
  const ctx = dose({ drugId: 'cotrimoxazole', weightKg: 12 });
  assert.deepEqual([ctx.dose.mg, ctx.dose.ml, ctx.dose.totalMg], [36, 4.5, 216]);
  assert.match(ctx.text, /36 mg триметоприм/);
  assert.ok(levels(dose({ drugId: 'cotrimoxazole', weightKg: 4, ageMonths: 1 })).includes('bad'), 'под 6 седмици');
});

test('алергии и заболявания от досието', () => {
  const p = { allergies: ['Пеницилин — уртикария'], conditions: ['Бронхиална астма'], chronic: [] };
  assert.equal(patientWarnings('amoxicillin', p)[0].level, 'bad');
  assert.equal(patientWarnings('amoxiclav', p)[0].level, 'bad');
  assert.equal(patientWarnings('cefuroxime', p)[0].level, 'warn', 'кръстосана алергия — внимание');
  assert.equal(patientWarnings('azithromycin', p).length, 0);
  assert.ok(patientWarnings('ibuprofen', p).some(w => /Астма/.test(w.text)));
  assert.equal(patientWarnings('cotrimoxazole', { allergies: ['сулфонамиди'] })[0].level, 'bad');
  assert.equal(patientWarnings('ibuprofen', { allergies: ['Нурофен'] })[0].level, 'bad');
  assert.equal(patientWarnings('cefixime', { allergies: ['цефалоспорини'] })[0].level, 'bad');
});

test('всяка комбинация лекарство, режим и форма дава смислен резултат', () => {
  for (const id of DRUG_ORDER) {
    const drug = DOSING_DRUGS[id];
    for (const reg of drug.regimens) {
      for (const form of drug.forms) {
        for (const w of [3, 8, 15, 25, 40, 70]) {
          const r = computeDose({ drugId: id, regimenId: reg.id, formId: form.id, weightKg: w, ageMonths: 60 });
          if (!r.dose) continue; // таблетка или супозитория, които не пасват на теглото
          assert.ok(r.dose.mg > 0 && Number.isFinite(r.dose.mg), `${id}/${reg.id}/${form.id}/${w}`);
          const cap = reg.maxDose ?? Infinity;
          assert.ok(r.dose.mg <= cap + 1e-6, `${id}/${reg.id}/${form.id}/${w}: ${r.dose.mg} > ${cap}`);
          const perDay = r.suppository ? r.suppository.perDay : r.maxDosesPerDay;
          if (r.maxDay) assert.ok(r.dose.mg * perDay <= r.maxDay.mg + 1e-6, `${id}/${form.id}/${w}: над дневния максимум`);
          if (r.dayMg) assert.ok(r.dayMg <= (reg.maxDay ?? Infinity) + 1e-6);
          assert.ok(r.text.length > 20);
        }
      }
    }
  }
  assert.throws(() => computeDose({ drugId: 'paracetamol', weightKg: 0 }), /тегло/);
  assert.throws(() => computeDose({ drugId: 'toString', weightKg: 10 }), /Непознато/);
});
