/* Приложен интерфейс за възрастни пациенти: хронични заболявания, лекарства,
 * изследвания, скали, начин на живот и хранителен режим. */

import { HttpError, bad, date, entries, list, notFound, num, str } from './validate.js';
import { ageInMonthsExact, today } from '../public/js/shared/dates.js';
import { CONDITIONS, activeConditions, latestMeasure } from '../public/js/shared/chronic.js';
import { CHECKS, LABS, isCheck, latestEgfr, latestResult, round, toBaseUnit, unitsFor } from '../public/js/shared/labs.js';
import { DRUGS, classesOf } from '../public/js/shared/drugs.js';
import { TOOLS, answerValues, evaluate } from '../public/js/shared/mental.js';
import { ACTIVITY, GOALS, PREFERENCES, nutritionPlan } from '../public/js/shared/nutrition.js';
import { computePlan } from '../public/js/shared/schedule.js';
import { adultSummary } from '../public/js/shared/adult.js';
import { activeMeds, foodNotes } from '../public/js/shared/meds.js';

const patientOr404 = (store, id) => store.patient(id) || notFound('Досието не е намерено.');

const touch = (store, p) => {
  p.updatedAt = new Date().toISOString();
  store.persist();
};

const notFuture = (d, field) => {
  if (d > today()) bad(`${field}: датата не може да е в бъдещето.`);
  return d;
};

/* ------------------------- кеш на обобщенията ------------------------- */

/* Обобщението се преизчислява само ако досието или датата са се променили.
 * Към времето на промяна се добавят и размерите на списъците — за две
 * промени в една и съща милисекунда. */
const summaryCache = new WeakMap();
const sizes = (p) => ['chronic', 'meds', 'results', 'assessments', 'measurements', 'visits', 'studies', 'nodules']
  .map(k => (p[k] || []).length).join(',');

export function cachedAdultSummary(store, p, { asOf = today(), horizonDays } = {}) {
  const region = store.settings.cvRegion || 'very_high';
  const hd = horizonDays ?? store.settings.horizonDays;
  const key = `${p.updatedAt || p.createdAt}|${sizes(p)}|${asOf}|${region}|${hd}`;
  const hit = summaryCache.get(p);
  if (hit && hit.key === key) return hit.value;
  const value = adultSummary(p, { asOf, region, horizonDays: hd });
  summaryCache.set(p, { key, value });
  return value;
}

/* ------------------ автоматично отбелязване в календара ------------------ */

/**
 * Кои дейности от календара се водят изпълнени благодарение на току-що
 * въведения резултат (мамография, FIT, липиден профил, PHQ-4…). Самото
 * отбелязване става при изчисляването на плана (schedule.js), затова тук
 * само се съобщава на лекаря.
 */
export function autoClosed(store, p, codes, when) {
  const plan = computePlan(p, store.schedule, { asOf: today(), horizonDays: 183 });
  return plan
    .filter(e => e.record && e.record.auto && e.record.date === when
      && e.item.closesWith.some(c => codes.includes(c)))
    .map(e => e.name);
}

/* ------------------------------- помощни ------------------------------- */

function readTargets(value) {
  const t = entries([value])[0] || {};
  const out = {};
  if (t.bp) {
    const m = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(String(t.bp));
    if (!m) bad('Целта за налягане се въвежда като „систолно/диастолно“, напр. 140/90.');
    out.bp = `${m[1]}/${m[2]}`;
  }
  if (t.hba1c !== undefined && t.hba1c !== '' && t.hba1c !== null) {
    out.hba1c = num(t.hba1c, 'Цел за HbA1c', { min: 5.5, max: 10 });
  }
  return out;
}

function readSchedule(value) {
  const s = entries([value])[0] || {};
  const out = {};
  for (const k of ['m', 'n', 'e', 'b']) {
    const v = s[k];
    if (v === undefined || v === null || v === '' || v === 0 || v === '0') continue;
    out[k] = str(v, 'Разписание', { max: 10 });
  }
  return out;
}

function readMed(body, isNew) {
  const out = {};
  const has = k => body[k] !== undefined;
  if (isNew || has('drug')) {
    const drug = str(body.drug, 'Лекарство', { max: 80 });
    if (drug && !DRUGS[drug]) bad('Лекарството не е намерено в каталога.');
    out.drug = drug;
  }
  if (isNew || has('name')) out.name = str(body.name, 'Наименование', { max: 160 });
  if (isNew && !out.drug && !out.name) bad('Изберете лекарство от списъка или въведете наименование.');
  if (isNew || has('dose')) out.dose = str(body.dose, 'Доза', { max: 60 });
  if (isNew || has('schedule')) out.schedule = readSchedule(body.schedule);
  if (isNew || has('prn')) out.prn = !!body.prn;
  if (isNew || has('start')) out.start = body.start ? notFuture(date(body.start, 'Начало'), 'Начало') : (isNew ? today() : '');
  if (has('end')) out.end = date(body.end, 'Край');
  if (has('stopReason')) out.stopReason = str(body.stopReason, 'Причина за спиране', { max: 300 });
  if (isNew || has('indication')) {
    const ind = str(body.indication, 'Показание', { max: 40 });
    if (ind && !CONDITIONS[ind]) bad('Непознато показание.');
    out.indication = ind;
  }
  if (isNew || has('chronic')) out.chronic = body.chronic === undefined ? true : !!body.chronic;
  if (isNew || has('prescribedOn')) out.prescribedOn = body.prescribedOn ? notFuture(date(body.prescribedOn, 'Предписано на'), 'Предписано на') : '';
  if (isNew || has('supplyDays')) out.supplyDays = num(body.supplyDays, 'Дни лечение', { min: 1, max: 365 });
  if (isNew || has('protocolUntil')) out.protocolUntil = date(body.protocolUntil, 'Протокол до');
  if (isNew || has('note')) out.note = str(body.note, 'Бележка', { max: 500 });
  return out;
}

/* -------------------------------- маршрути -------------------------------- */

export const adultRoutes = {

  /* ---- хронични заболявания ---- */

  'POST /api/patients/:id/chronic': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = patientOr404(store, params.id);
    const code = str(body.code, 'Заболяване', { required: true, max: 40 });
    if (!CONDITIONS[code]) bad('Непознато заболяване.');
    if (activeConditions(p).some(c => c.code === code)) bad(`„${CONDITIONS[code].name}“ вече е в списъка.`);
    const since = body.since ? notFuture(date(body.since, 'От кога'), 'От кога') : '';
    if (since && since < p.birthDate) bad('Датата е преди раждането.');
    const c = {
      id: store.nextId('c'), code, since,
      note: str(body.note, 'Бележка', { max: 500 }),
      targets: readTargets(body.targets),
      status: 'active', addedAt: new Date().toISOString(),
    };
    p.chronic.push(c);
    touch(store, p);
    store.audit(doctor, 'chronic_add', { patientId: p.id, name: p.name, condition: CONDITIONS[code].name });
    return { condition: c };
  },

  'PATCH /api/patients/:id/chronic/:cid': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = patientOr404(store, params.id);
    const c = p.chronic.find(x => x.id === params.cid) || notFound('Записът не е намерен.');
    const next = {};
    if (body.since !== undefined) next.since = body.since ? notFuture(date(body.since, 'От кога'), 'От кога') : '';
    if (next.since && next.since < p.birthDate) bad('Датата е преди раждането.');
    if (body.note !== undefined) next.note = str(body.note, 'Бележка', { max: 500 });
    if (body.targets !== undefined) next.targets = readTargets(body.targets);
    if (body.status !== undefined) {
      if (!['active', 'resolved'].includes(body.status)) bad('Непознат статус.');
      next.status = body.status;
      next.resolvedOn = body.status === 'resolved' ? today() : '';
    }
    Object.assign(c, next);
    touch(store, p);
    store.audit(doctor, 'chronic_update', { patientId: p.id, name: p.name, condition: CONDITIONS[c.code]?.name });
    return { condition: c };
  },

  'DELETE /api/patients/:id/chronic/:cid': (ctx) => {
    const { store, params, doctor } = ctx;
    const p = patientOr404(store, params.id);
    const c = p.chronic.find(x => x.id === params.cid) || notFound('Записът не е намерен.');
    p.chronic = p.chronic.filter(x => x !== c);
    touch(store, p);
    store.audit(doctor, 'chronic_delete', { patientId: p.id, name: p.name, condition: CONDITIONS[c.code]?.name });
  },

  /* ---- лекарства ---- */

  'POST /api/patients/:id/meds': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = patientOr404(store, params.id);
    const med = { id: store.nextId('rx'), ...readMed(body, true), addedAt: new Date().toISOString() };
    if (med.drug && activeMeds(p).some(m => m.drug === med.drug)) {
      bad(`${DRUGS[med.drug].bg} вече е в текущите лекарства.`);
    }
    p.meds.push(med);
    touch(store, p);
    store.audit(doctor, 'med_add', { patientId: p.id, name: p.name, med: med.drug ? DRUGS[med.drug].bg : med.name });
    const alerts = cachedAdultSummary(store, p).medAlerts.filter(a => a.meds.includes(med.id));
    return { med, alerts };
  },

  'PATCH /api/patients/:id/meds/:mid': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = patientOr404(store, params.id);
    const med = p.meds.find(m => m.id === params.mid) || notFound('Лекарството не е намерено.');
    const next = { ...med, ...readMed(body, false) };
    if (next.end && next.start && next.end < next.start) bad('Краят е преди началото.');
    if (next.drug && next.drug !== med.drug && activeMeds(p).some(m => m !== med && m.drug === next.drug)) {
      bad(`${DRUGS[next.drug].bg} вече е в текущите лекарства.`);
    }
    Object.assign(med, next);
    touch(store, p);
    const action = body.end ? 'med_stop' : body.prescribedOn ? 'med_renew' : 'med_update';
    store.audit(doctor, action, { patientId: p.id, name: p.name, med: med.drug ? DRUGS[med.drug].bg : med.name });
    return { med };
  },

  'DELETE /api/patients/:id/meds/:mid': (ctx) => {
    const { store, params, doctor } = ctx;
    const p = patientOr404(store, params.id);
    const med = p.meds.find(m => m.id === params.mid) || notFound('Лекарството не е намерено.');
    p.meds = p.meds.filter(m => m !== med);
    touch(store, p);
    store.audit(doctor, 'med_delete', { patientId: p.id, name: p.name, med: med.drug ? DRUGS[med.drug].bg : med.name });
  },

  /* ---- изследвания ---- */

  'POST /api/patients/:id/results': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = patientOr404(store, params.id);
    const when = notFuture(date(body.date || today(), 'Дата', { required: true }), 'Дата');
    if (when < p.birthDate) bad('Датата е преди раждането.');
    const items = entries(body.items);
    if (!items.length) bad('Въведете поне един резултат.');
    if (items.length > 60) bad('Твърде много резултати наведнъж.');
    const note = str(body.note, 'Бележка', { max: 500 });
    const saved = items.map((it) => {
      const code = str(it.code, 'Изследване', { required: true, max: 20 });
      if (isCheck(code)) {
        const text = str(it.text, CHECKS[code].name, { max: 500 }) || 'извършено';
        return { id: store.nextId('r'), date: when, code, value: null, text, note };
      }
      const lab = LABS[code];
      if (!lab) bad(`Непознато изследване „${code}“.`);
      const unit = it.unit || lab.unit;
      if (!unitsFor(code).includes(unit)) bad(`Непозната мерна единица за ${lab.name}.`);
      const raw = num(it.value, lab.name, { required: true });
      // Преобразуваната стойност се закръгля до точността на основната единица.
      const value = unit === lab.unit ? raw : round(toBaseUnit(code, raw, unit), lab.decimals ?? 1);
      if (value < lab.min || value > lab.max) bad(`${lab.name}: стойността е извън допустимите граници.`);
      return { id: store.nextId('r'), date: when, code, value, text: str(it.text, 'Коментар', { max: 200 }), note };
    });
    p.results.push(...saved);
    const closed = autoClosed(store, p, saved.map(r => r.code), when);
    touch(store, p);
    store.audit(doctor, 'results_add', { patientId: p.id, name: p.name, count: saved.length, date: when });
    return { results: saved, closed };
  },

  'DELETE /api/patients/:id/results/:rid': (ctx) => {
    const { store, params, doctor } = ctx;
    const p = patientOr404(store, params.id);
    const r = p.results.find(x => x.id === params.rid) || notFound('Резултатът не е намерен.');
    p.results = p.results.filter(x => x !== r);
    touch(store, p);
    store.audit(doctor, 'result_delete', { patientId: p.id, name: p.name, code: r.code, date: r.date });
  },

  /* ---- скали ---- */

  'POST /api/patients/:id/assessments': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = patientOr404(store, params.id);
    const tool = str(body.tool, 'Скала', { required: true, max: 20 });
    const def = TOOLS[tool] || notFound('Непозната скала.');
    const when = notFuture(date(body.date || today(), 'Дата', { required: true }), 'Дата');
    const number = def.number ? num(body.number, def.number.label, { min: def.number.min, max: def.number.max, required: def.kind === 'value' }) : null;
    let result;
    try {
      result = evaluate(tool, Array.isArray(body.answers) ? body.answers : [], { sex: p.sex, number });
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    const a = {
      id: store.nextId('a'), date: when, tool,
      answers: answerValues(tool, Array.isArray(body.answers) ? body.answers : []),
      extra: entries([body.extra])[0] ? { difficulty: Math.max(0, Math.min(3, Math.round(Number(body.extra.difficulty)) || 0)) } : null,
      number, score: result.score, result,
      note: str(body.note, 'Бележка', { max: 1000 }),
      doctorId: doctor ? doctor.id : '', recordedAt: new Date().toISOString(),
    };
    p.assessments.push(a);
    const closed = autoClosed(store, p, [tool], when);
    touch(store, p);
    store.audit(doctor, 'assessment_add', { patientId: p.id, name: p.name, tool: def.short, score: a.score });
    return { assessment: a, closed };
  },

  'DELETE /api/patients/:id/assessments/:aid': (ctx) => {
    const { store, params, doctor } = ctx;
    const p = patientOr404(store, params.id);
    const a = p.assessments.find(x => x.id === params.aid) || notFound('Оценката не е намерена.');
    p.assessments = p.assessments.filter(x => x !== a);
    touch(store, p);
    store.audit(doctor, 'assessment_delete', { patientId: p.id, name: p.name, tool: TOOLS[a.tool]?.short });
  },

  /* ---- начин на живот ---- */

  'PUT /api/patients/:id/lifestyle': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = patientOr404(store, params.id);
    const pick = (v, allowed, field) => {
      if (v === undefined || v === null || v === '') return '';
      if (!allowed.includes(v)) bad(`Непозната стойност за „${field}“.`);
      return v;
    };
    p.lifestyle = {
      smoking: pick(body.smoking, ['never', 'former', 'current'], 'Тютюнопушене'),
      alcohol: pick(body.alcohol, ['none', 'low', 'high'], 'Алкохол'),
      activity: pick(body.activity, Object.keys(ACTIVITY), 'Физическа активност'),
      diet: list(body.diet, 'Хранене', 10).filter(d => PREFERENCES[d]),
      bleedingHistory: !!body.bleedingHistory,
      notes: str(body.notes, 'Бележки', { max: 1000 }),
      updatedOn: today(),
    };
    touch(store, p);
    store.audit(doctor, 'lifestyle_update', { patientId: p.id, name: p.name });
    return { lifestyle: p.lifestyle };
  },

  /* ---- хранителен режим ---- */

  'POST /api/patients/:id/nutrition': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = patientOr404(store, params.id);
    const age = ageInMonthsExact(p.birthDate, today()) / 12;
    if (age < 18) bad('Хранителният режим е предназначен за възрастни.');
    const weight = num(body.weight, 'Тегло', { min: 30, max: 350 }) ?? latestMeasure(p, 'weight')?.value;
    const height = num(body.height, 'Ръст', { min: 120, max: 230 }) ?? latestMeasure(p, 'height')?.value;
    if (!weight || !height) bad('Нужни са тегло и ръст — въведете ги или добавете измерване.');
    const activity = body.activity || p.lifestyle?.activity || 'sedentary';
    if (!ACTIVITY[activity]) bad('Непозната физическа активност.');
    const goal = body.goal || '';
    if (goal && !GOALS[goal]) bad('Непозната цел.');
    const preferences = list(body.preferences, 'Предпочитания', 10).filter(x => PREFERENCES[x]);
    const meds = activeMeds(p);
    const classes = new Set(meds.filter(m => m.drug && DRUGS[m.drug]).flatMap(m => [...classesOf(m.drug)]));
    let plan;
    try {
      plan = nutritionPlan({
        sex: p.sex, age, weight, height, waist: latestMeasure(p, 'waist')?.value,
        activity, goal: goal || undefined, preferences,
        conditions: new Set(activeConditions(p).map(c => c.code)),
        egfr: latestEgfr(p)?.value, potassium: latestResult(p.results, 'k')?.value,
        classes, medNotes: foodNotes(p), variant: Number(body.variant) || 0,
      });
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    if (body.save) {
      const entry = { id: store.nextId('n'), date: today(), plan, doctorId: doctor ? doctor.id : '' };
      p.nutritionPlans.push(entry);
      touch(store, p);
      store.audit(doctor, 'nutrition_save', { patientId: p.id, name: p.name, kcal: plan.energy.target });
      return { plan, saved: entry };
    }
    return { plan };
  },

  'DELETE /api/patients/:id/nutrition/:nid': (ctx) => {
    const { store, params, doctor } = ctx;
    const p = patientOr404(store, params.id);
    const n = p.nutritionPlans.find(x => x.id === params.nid) || notFound('Режимът не е намерен.');
    p.nutritionPlans = p.nutritionPlans.filter(x => x !== n);
    touch(store, p);
    store.audit(doctor, 'nutrition_delete', { patientId: p.id, name: p.name });
  },
};
