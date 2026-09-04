#!/usr/bin/env node
/* Създава примерен регистър, за да може платформата да се разгледа веднага.
 *
 * Употреба:  node scripts/demo-data.js [--force]
 * Записва в DATA_DIR (по подразбиране ./data). Отказва да пише върху
 * съществуващи данни, освен ако не е подадено --force.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, hashPin } from '../lib/store.js';
import { addDays, addMonths, today } from '../public/js/shared/dates.js';
import { computePlan } from '../public/js/shared/schedule.js';
import { CHECKPOINTS, checkpointFor } from '../public/js/shared/development.js';
import { correctionMonths, lmsAt, valueAtZ } from '../public/js/shared/growth.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const force = process.argv.includes('--force');

const FIRST_M = ['Иван', 'Георги', 'Николай', 'Мартин', 'Александър', 'Виктор', 'Борис', 'Даниел',
  'Кристиян', 'Стефан', 'Калоян', 'Симеон', 'Тодор', 'Явор', 'Радослав'];
const FIRST_F = ['Мария', 'Виктория', 'Никол', 'Александра', 'Габриела', 'Дария', 'Ема', 'Йоана',
  'Рая', 'София', 'Теодора', 'Елена', 'Магдалена', 'Симона', 'Ралица'];
const MIDDLE = ['Иванов', 'Петров', 'Георгиев', 'Димитров', 'Стоянов', 'Николов', 'Тодоров', 'Ангелов'];
const LAST = ['Иванов', 'Петров', 'Георгиев', 'Димитров', 'Стоянов', 'Николов', 'Тодоров', 'Ангелов',
  'Колев', 'Маринов', 'Василев', 'Христов'];

let seed = 20260903;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + rnd() * (b - a);

function femaleForm(surname) {
  return surname.endsWith('ов') || surname.endsWith('ев') ? surname + 'а' : surname;
}

/** Генерира ЕГН с вярна контролна цифра за дадена дата и пол. */
function makeEgn(birthISO, sex, serial) {
  const [y, m, d] = birthISO.split('-').map(Number);
  let mm = m;
  if (y >= 2000) mm = m + 40;
  else if (y < 1900) mm = m + 20;
  const yy = String(y % 100).padStart(2, '0');
  // Деветата цифра е четна за момче и нечетна за момиче.
  let order = (serial % 500) * 2 + (sex === 'f' ? 1 : 0);
  const base = yy + String(mm).padStart(2, '0') + String(d).padStart(2, '0') + String(order).padStart(3, '0');
  const weights = [2, 4, 8, 5, 10, 9, 7, 3, 6];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(base[i]), 0);
  return base + String((sum % 11) % 10);
}

/** Данни при раждане; около 8% от децата са недоносени. */
function birthData() {
  const preterm = rnd() < 0.08;
  const gestWeeks = preterm ? Math.floor(between(29, 37)) : Math.floor(between(37, 41));
  const scale = preterm ? (gestWeeks - 24) / 16 : 1;
  return {
    weight: +(between(2.6, 4.1) * (preterm ? 0.45 + scale * 0.5 : 1)).toFixed(2),
    height: +(between(47, 54) * (preterm ? 0.78 + scale * 0.2 : 1)).toFixed(0),
    head: +(between(33, 36) * (preterm ? 0.82 + scale * 0.16 : 1)).toFixed(0),
    gestWeeks,
    apgar: preterm ? '7/9' : '9/10',
    delivery: preterm || rnd() < 0.3 ? 'секцио' : 'нормално',
  };
}

function measurementFor(sex, ageMonths, zShift) {
  const w = lmsAt('weight', sex, ageMonths);
  const hKey = ageMonths <= 60 ? 'height' : 'height';
  const hLms = lmsAt(hKey, sex, ageMonths);
  const head = ageMonths <= 60 ? lmsAt('head', sex, ageMonths) : null;
  return {
    weight: w ? +valueAtZ(w, zShift + between(-0.25, 0.25)).toFixed(2) : null,
    height: hLms ? +valueAtZ(hLms, zShift + between(-0.25, 0.25)).toFixed(1) : null,
    head: head ? +valueAtZ(head, zShift * 0.6 + between(-0.2, 0.2)).toFixed(1) : null,
  };
}

function main() {
  if (fs.existsSync(path.join(DATA_DIR, 'practice.json')) && !force) {
    const store = new Store(DATA_DIR);
    if (store.patients.length) {
      console.error(
        `\nВ ${DATA_DIR} вече има ${store.patients.length} досиета.\n` +
        'Скриптът няма да ги презапише. За отделна демонстрация ползвайте:\n\n' +
        '  DATA_DIR=./demo-data node scripts/demo-data.js\n' +
        '  DATA_DIR=./demo-data node server.js\n');
      process.exit(1);
    }
  }

  const store = new Store(DATA_DIR);
  store.data.practice = {
    name: 'АИППМП „Детско здраве“',
    address: 'гр. София, ул. Здраве 1',
    phone: '02 900 00 00',
  };
  store.data.doctors = [
    { id: 'demo-doc-1', name: 'д-р Мария Иванова', role: 'Общопрактикуващ лекар', pin: null, active: true },
    { id: 'demo-doc-2', name: 'д-р Петър Стоянов', role: 'Общопрактикуващ лекар', pin: hashPin('1234'), active: true },
  ];
  store.data.settings = { horizonDays: 30, requireLogin: false };
  store.data.patients = [];

  const t = today();
  const COUNT = 42;

  for (let i = 0; i < COUNT; i++) {
    const sex = rnd() < 0.5 ? 'm' : 'f';
    // Възраст от няколко седмици до 17 години, с тежест към малките деца.
    const ageMonths = Math.floor(Math.pow(rnd(), 1.9) * 205) + 1;
    const birthDate = addDays(addMonths(t, -ageMonths), -Math.floor(rnd() * 28));
    const surname = pick(LAST);
    const middle = pick(MIDDLE);
    const name = [
      sex === 'm' ? pick(FIRST_M) : pick(FIRST_F),
      sex === 'f' ? femaleForm(middle) : middle,
      sex === 'f' ? femaleForm(surname) : surname,
    ].join(' ');

    const patient = {
      id: 'demo-p-' + String(i + 1).padStart(3, '0'),
      name,
      egn: makeEgn(birthDate, sex, i + 7),
      sex,
      birthDate,
      phone: '08' + Math.floor(between(70000000, 99999999)),
      address: 'гр. София',
      doctorId: rnd() < 0.6 ? 'demo-doc-1' : 'demo-doc-2',
      parentHeights: rnd() < 0.7
        ? { mother: Math.round(between(155, 178)), father: Math.round(between(168, 192)) }
        : { mother: null, father: null },
      contacts: [{ name: 'майка на ' + name.split(' ')[0], relation: 'майка', phone: '08' + Math.floor(between(70000000, 99999999)) }],
      allergies: rnd() < 0.12 ? [pick(['пеницилин', 'краве мляко', 'яйчен белтък', 'полени'])] : [],
      conditions: rnd() < 0.1 ? [pick(['бронхиална астма', 'атопичен дерматит', 'желязодефицитна анемия'])] : [],
      notes: '',
      birth: birthData(),
      records: {},
      optIn: [
        ...(rnd() < 0.3 ? ['rota-1', 'rota-2'] : []),
        ...(rnd() < 0.15 ? ['menb-1', 'menb-2'] : []),
      ],
      measurements: [],
      visits: [],
      reminders: [],
      development: [],
      createdAt: new Date().toISOString(),
    };

    // Част от децата са родени преди срок — растежът им се оценява по
    // коригирана възраст, а имунизациите по хронологична.
    // Изпълнение на календара: повечето деца са редовни, някои изостават.
    const diligence = rnd();
    const plan = computePlan(patient, store.schedule, { asOf: t });
    for (const entry of plan) {
      if (entry.due > t) continue;
      if (entry.group === 'checkup' && rnd() < 0.25) continue;

      if (diligence < 0.08) continue;                       // не се води на лекар
      if (diligence < 0.22 && rnd() < 0.45) continue;        // изостава
      if (rnd() < 0.03) {                                   // отказ на родител
        patient.records[entry.id] = { status: 'refused', date: entry.due, note: 'писмен отказ' };
        continue;
      }
      const delay = Math.floor(between(0, diligence < 0.4 ? 40 : 12));
      const doneDate = addDays(entry.due, delay);
      if (doneDate > t) continue;
      patient.records[entry.id] = {
        status: 'done',
        date: doneDate,
        batch: entry.group === 'vaccine' ? 'L' + Math.floor(between(10000, 99999)) : '',
        product: '',
        doctorId: patient.doctorId,
        recordedAt: new Date().toISOString(),
      };
    }

    // Активен отвод при малка част от децата.
    if (rnd() < 0.07) {
      const pending = computePlan(patient, store.schedule, { asOf: t })
        .find(e => e.group === 'vaccine' && e.status !== 'done');
      if (pending) {
        patient.records[pending.id] = {
          status: 'deferred',
          deferUntil: addDays(t, Math.floor(between(5, 40))),
          reason: 'Остро фебрилно заболяване',
        };
      }
    }

    // Измервания — на профилактичните прегледи.
    // При част от децата се задава отклонение в динамиката, за да личи как
    // изглеждат изоставане в растежа и покачване на ИТМ в реален регистър.
    const zShift = between(-1.4, 1.4);
    const drift = rnd() < 0.10 ? -between(0.9, 2.2) : rnd() < 0.08 ? between(0.9, 1.8) : 0;
    const stops = ageMonths <= 12
      ? [1, 2, 3, 4, 6, 9, 12]
      : ageMonths <= 60
        ? [1, 3, 6, 12, 18, 24, 36, 48, 60]
        : [1, 6, 12, 24, 48, 72, 96, 120, 144, 168, 192];
    for (const m of stops) {
      if (m > ageMonths) break;
      const progress = stops.length > 1 ? stops.indexOf(m) / (stops.length - 1) : 0;
      // При недоносено дете реалният размер отговаря на коригираната възраст,
      // затова примерните стойности се генерират по нея.
      const growthMonths = m <= 24
        ? Math.max(0, m - correctionMonths(patient.birth.gestWeeks)) : m;
      const meas = measurementFor(sex, growthMonths, zShift + drift * progress);
      // Артериално налягане се измерва от 3-годишна възраст.
      const bp = m >= 36
        ? {
          systolic: Math.round(90 + m * 0.14 + between(-6, 9) + (drift > 0 ? 8 : 0)),
          diastolic: Math.round(52 + m * 0.09 + between(-5, 7) + (drift > 0 ? 5 : 0)),
        }
        : { systolic: null, diastolic: null };
      patient.measurements.push({
        id: `demo-m-${i}-${m}`,
        date: addDays(addMonths(birthDate, m), Math.floor(between(0, 9))),
        weight: meas.weight, height: meas.height, head: meas.head,
        systolic: bp.systolic, diastolic: bp.diastolic,
        note: '', doctorId: patient.doctorId,
      });
    }
    patient.measurements = patient.measurements.filter(m => m.date <= t);

    // Няколко амбулаторни прегледа.
    const visitCount = Math.floor(between(0, Math.min(6, ageMonths / 6 + 1)));
    const DIAGS = [
      ['Остър назофарингит', 'J00'], ['Остър фарингит', 'J02.9'], ['Остър бронхит', 'J20.9'],
      ['Остър среден отит', 'H66.9'], ['Варицела', 'B01.9'], ['Атопичен дерматит', 'L20.9'],
      ['Ротавирусен гастроентерит', 'A08.0'], ['Профилактичен преглед', 'Z00.1'],
    ];
    for (let v = 0; v < visitCount; v++) {
      const [dx, icd] = pick(DIAGS);
      patient.visits.push({
        id: `demo-v-${i}-${v}`,
        date: addDays(t, -Math.floor(between(1, Math.min(700, ageMonths * 30)))),
        type: 'Амбулаторен преглед',
        complaint: pick(['температура от 2 дни', 'кашлица', 'хрема и отпадналост', 'обрив', 'болки в ухото']),
        findings: '', diagnosis: dx, icd,
        treatment: pick(['симптоматично лечение', 'антипиретик при нужда', 'антибиотик по схема', 'обилни течности']),
        note: '', doctorId: patient.doctorId,
      });
    }

    // Оценки на нервно-психическото развитие по контролните листове.
    const devMonths = correctionMonths(patient.birth.gestWeeks);
    const devConcern = rnd() < 0.12;
    // Отклонението е в една област за цялото дете, а не различна всеки път.
    const weakDomain = devConcern ? pick(['language', 'social', 'motor']) : null;
    for (const cp of CHECKPOINTS) {
      const corrected = cp.ageMonths <= 24 ? cp.ageMonths + devMonths : cp.ageMonths;
      if (corrected > ageMonths) break;
      if (diligence < 0.15 || rnd() < 0.2) continue;   // не всяко посещение е документирано
      const answers = {};
      for (const item of cp.items) {
        if (weakDomain && item.domain === weakDomain && cp.ageMonths >= 12 && rnd() < 0.5) {
          answers[item.id] = rnd() < 0.7 ? 'not_yet' : 'unsure';
        } else {
          answers[item.id] = rnd() < 0.04 ? 'unsure' : 'yes';
        }
      }
      const rec = {
        id: `demo-dev-${i}-${cp.ageMonths}`,
        date: addDays(addMonths(birthDate, Math.round(corrected)), Math.floor(between(0, 10))),
        checkpoint: cp.ageMonths,
        answers,
        screening: cp.screening.length && rnd() < 0.7
          ? {
            tool: cp.screening.includes('autism') && rnd() < 0.5 ? 'mchat' : 'asq3',
            result: weakDomain && rnd() < 0.4 ? 'positive' : rnd() < 0.1 ? 'borderline' : 'negative',
            score: '', note: '',
          }
          : null,
        lostSkills: false,
        parentConcern: weakDomain ? rnd() < 0.5 : rnd() < 0.05,
        action: '', note: '',
        doctorId: patient.doctorId,
      };
      if (rec.date <= t) patient.development.push(rec);
    }

    if (rnd() < 0.18) {
      patient.reminders.push({
        id: 'demo-r-' + i,
        date: addDays(t, Math.floor(between(-20, 25))),
        text: pick(['Контролен преглед след отит', 'Резултат от хемоглобин', 'Насочване към офталмолог',
          'Медицинска бележка за детска градина']),
        done: false, doneDate: '', doctorId: patient.doctorId,
      });
    }

    store.data.patients.push(patient);
  }

  store.persistSync();
  const counts = store.patients.reduce((acc, p) => {
    acc.measurements += p.measurements.length;
    acc.visits += p.visits.length;
    acc.development += p.development.length;
    acc.records += Object.keys(p.records).length;
    return acc;
  }, { measurements: 0, visits: 0, records: 0, development: 0 });

  console.log(`
Готово. Създаден е примерен регистър в ${DATA_DIR}:

  ${store.patients.length} деца
  ${counts.records} отбелязани дейности
  ${counts.measurements} измервания
  ${counts.visits} прегледа
  ${counts.development} оценки на развитието
  2 потребителя (д-р Иванова — без ПИН, д-р Стоянов — ПИН 1234)

Стартирайте с:  npm start
`);
}

main();
