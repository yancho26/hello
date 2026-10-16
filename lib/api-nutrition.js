/* Хранителен режим за хора извън пациентската листа (раздел „Хранене“ в менюто)
 * и общата проверка на избора във формата — за пациент от листата и за външен човек.
 * Външните хора не са пациенти: не влизат в списъка, справките и напомнянията. */

import { HttpError, bad, date, entries, list, notFound, num, str } from './validate.js';
import { addDays, ageInMonthsExact, today } from '../public/js/shared/dates.js';
import { CONTRACEPTION, cleanCycle, mergeCycle } from '../public/js/shared/cycle.js';
import { ACTIVITIES, SESSION_MINUTES, TRAINING_FOCUS, TRAINING_LEVELS, TRAINING_TIMES } from '../public/js/shared/training.js';
import { normIcd } from '../public/js/shared/icd.js';
import { ICD_RE, dxName } from '../public/js/shared/diet-icd.js';
import { DRUGS, classesOf } from '../public/js/shared/drugs.js';
import { foodNotes } from '../public/js/shared/meds.js';
import { ACTIVITY, FOODS, GOALS, MENU_DAYS, PACES, PATTERNS, PREFERENCES, cleanSwaps, nutritionPlan } from '../public/js/shared/nutrition.js';
import { translatePlan } from '../public/js/shared/i18n/plan-en.js';

/** Диагнозите по МКБ-10 от формата: [{ code, name }], до 40. */
export function readDiagnoses(value) {
  const out = [];
  for (const [i, d] of entries(value).slice(0, 40).entries()) {
    const code = normIcd(str(d?.code, `Код по МКБ-10 (${i + 1})`, { max: 10 }));
    if (!code) continue;
    if (!ICD_RE.test(code)) bad(`„${code}“ не е код по МКБ-10 — буква и две цифри, например E11 или K21.0.`);
    if (out.some(x => x.code === code)) continue;
    out.push({ code, name: str(d?.name, `Диагноза ${code}`, { max: 200 }) || dxName(code) });
  }
  return out;
}

/**
 * Менструалният цикъл: дневник на менструациите ({ start, days, heavy }) и настройки.
 * lastPeriod (от формата на режима) се добавя към дневника, ако го няма.
 */
export function readCycle(value, { birthDate = '' } = {}) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) bad('Непознати данни за цикъла.');
  const check = (d) => {
    if (d > today()) bad('Началото на менструацията не може да е в бъдещето.');
    if (birthDate && d <= birthDate) bad('Началото на менструацията е преди датата на раждане.');
    return d;
  };
  const periods = [];
  for (const [i, x] of entries(value.periods).slice(0, 60).entries()) {
    const start = check(date(x.start, `Начало на менструация ${i + 1}`, { required: true }));
    const days = num(x.days, 'Дни на кървене', { min: 1, max: 20 });
    periods.push({ start, days: days ? Math.round(days) : null, heavy: x.heavy === true });
  }
  const last = date(value.lastPeriod, 'Първи ден на последната менструация');
  if (last && check(last) && !periods.some(x => x.start === last)) periods.push({ start: last, days: null, heavy: false });
  const contraception = value.contraception || 'none';
  if (!CONTRACEPTION[contraception]) bad('Непознат вид контрацепция.');
  return cleanCycle({
    periods,
    length: num(value.length, 'Дължина на цикъла', { min: 15, max: 90 }),
    bleed: num(value.bleed, 'Дни на менструацията', { min: 1, max: 15 }),
    contraception,
    menopause: value.menopause === true,
    note: str(value.note, 'Бележка за цикъла', { max: 500 }),
  });
}

/** Тренировъчният план от формата: видове тренировки, ниво, дни, минути, час, цел. */
export function readTraining(value) {
  if (value === undefined || value === null || value === false) return null;
  if (typeof value !== 'object' || Array.isArray(value)) bad('Непознати данни за тренировките.');
  const activities = list(value.activities, 'Тренировки', 20);
  if (activities.some(a => !ACTIVITIES[a])) bad('Непознат вид тренировка.');
  const pick = (v, tbl, field, def) => {
    if (v === undefined || v === null || v === '') return def;
    if (!tbl[v]) bad(`Непозната стойност за „${field}“.`);
    return v;
  };
  const days = value.daysPerWeek === undefined || value.daysPerWeek === '' ? 3 : Number(value.daysPerWeek);
  if (!Number.isInteger(days) || days < 2 || days > 7) bad('Тренировките са от 2 до 7 дни седмично.');
  const minutes = value.minutes === undefined || value.minutes === '' ? 45 : Number(value.minutes);
  if (!SESSION_MINUTES.includes(minutes)) bad(`Продължителността е ${SESSION_MINUTES.join(', ')} мин.`);
  const restingHr = num(value.restingHr, 'Пулс в покой', { min: 35, max: 120 });
  return {
    activities: [...new Set(activities)],
    level: pick(value.level, TRAINING_LEVELS, 'Ниво', 'beginner'),
    daysPerWeek: days, minutes,
    time: pick(value.time, TRAINING_TIMES, 'Час', 'any'),
    focus: pick(value.focus, TRAINING_FOCUS, 'Цел на тренировките', 'health'),
    cyclePeriodize: value.cyclePeriodize === true,
    restingHr: restingHr ? Math.round(restingHr) : null,
  };
}

/** Изборът във формата на режима — еднакъв за пациент и за външен човек. */
export function readPlanOptions(body) {
  const goal = body.goal || '';
  if (goal && !GOALS[goal]) bad('Непозната цел.');
  const pace = body.pace || '';
  if (pace && !PACES[pace]) bad('Непознато темпо.');
  const pattern = body.pattern || '';
  if (pattern && !PATTERNS[pattern]) bad('Непознат хранителен модел.');
  const mealsPerDay = body.mealsPerDay === undefined || body.mealsPerDay === '' ? 5 : Number(body.mealsPerDay);
  if (![3, 4, 5].includes(mealsPerDay)) bad('Храненията са 3, 4 или 5 на ден.');
  const days = body.days === undefined || body.days === '' ? 1 : Number(body.days);
  if (!MENU_DAYS.includes(days)) bad('Менюто е за 1 ден, за седмица или за месец (28 дни).');
  const week = num(body.pregnancyWeek, 'Гестационна седмица', { min: 1, max: 42 });
  const startDate = date(body.startDate, 'Начало на менюто');
  if (startDate && (startDate < today() || startDate > addDays(today(), 62))) bad('Менюто започва от днес до 2 месеца напред.');
  const lang = body.lang || 'bg';
  if (lang !== 'bg' && lang !== 'en') bad('Режимът е на български или на английски.');
  return {
    goal: goal || undefined, pace: pace || undefined, pattern: pattern || undefined,
    targetWeight: num(body.targetWeight, 'Целево тегло', { min: 30, max: 350 }),
    mealsPerDay, days,
    quick: body.quick === true, strength: body.strength === true, sourcedOnly: body.sourcedOnly === true,
    preferences: list(body.preferences, 'Предпочитания', 20).filter(x => PREFERENCES[x]),
    dislikes: [...new Set(list(body.dislikes, 'Храни, които не яде', 40).filter(x => FOODS[x]))],
    swaps: cleanSwaps(body.swaps),
    kcalAdjust: Math.round(num(body.kcalAdjust, 'Корекция на енергията', { min: -600, max: 600 }) || 0),
    pregnancyWeek: week ? Math.round(week) : null,
    cycleSync: body.cycleSync === true, startDate: startDate || undefined,
    training: readTraining(body.training) || undefined,
    variant: Math.min(10000, Math.max(0, Math.floor(Number(body.variant) || 0))),
    lang,
  };
}

/* ------------------------------- външен човек ------------------------------- */

/** Данните на човека от формата. */
function readPerson(body, current = {}) {
  const sex = body.sex ?? current.sex;
  if (sex !== 'm' && sex !== 'f') bad('Изберете пол.');
  let birthDate = body.birthDate === undefined ? current.birthDate || '' : str(body.birthDate, 'Дата на раждане', { max: 10 });
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) bad('Датата на раждане е в неправилен формат.');
  if (birthDate && birthDate > today()) bad('Датата на раждане е в бъдещето.');
  let age = body.age === undefined ? current.age ?? null : num(body.age, 'Възраст', { min: 18, max: 110 });
  if (birthDate) age = Math.floor(ageInMonthsExact(birthDate, today()) / 12);
  if (!(age >= 18)) bad('Хранителният режим е за възрастни — въведете дата на раждане или възраст от 18 г.');
  if (!birthDate && !(age <= 110)) bad('Възрастта е между 18 и 110 г.');
  const meds = list(body.meds ?? current.meds, 'Лекарства', 30).filter(id => DRUGS[id]);
  const allergies = (Array.isArray(body.allergies) ? body.allergies : String(body.allergies ?? (current.allergies || []).join(', ')).split(/[;,\n]/))
    .map(x => String(x).trim()).filter(Boolean).slice(0, 20).map(x => x.slice(0, 80));
  const pick = (key, field, opts) => (body[key] === undefined ? current[key] ?? null : num(body[key], field, opts));
  return {
    name: body.name === undefined ? current.name || '' : str(body.name, 'Име', { max: 120 }),
    sex, birthDate, age,
    phone: body.phone === undefined ? current.phone || '' : str(body.phone, 'Телефон', { max: 40 }),
    weight: pick('weight', 'Тегло', { min: 30, max: 350 }),
    height: pick('height', 'Ръст', { min: 120, max: 230 }),
    waist: pick('waist', 'Талия', { min: 40, max: 250 }),
    activity: ACTIVITY[body.activity] ? body.activity : current.activity || 'sedentary',
    diagnoses: body.diagnoses === undefined ? current.diagnoses || [] : readDiagnoses(body.diagnoses),
    allergies, meds,
    egfr: pick('egfr', 'eGFR', { min: 3, max: 200 }),
    potassium: pick('potassium', 'Калий', { min: 2, max: 9 }),
    note: body.note === undefined ? current.note || '' : str(body.note, 'Бележка', { max: 1000 }),
    cycle: sex === 'f' ? current.cycle || null : null,
  };
}

/** Режим за външен човек: данните му и изборът във формата. */
function planFor(person, options, cycle) {
  if (!person.weight || !person.height) bad('Нужни са тегло и ръст.');
  const pseudo = { meds: person.meds.map(drug => ({ drug })) };
  const classes = new Set(person.meds.flatMap(id => [...classesOf(id)]));
  try {
    const plan = nutritionPlan({
      sex: person.sex, age: person.age, weight: person.weight, height: person.height, waist: person.waist,
      activity: person.activity, allergies: person.allergies, diagnoses: person.diagnoses,
      egfr: person.egfr ?? undefined, potassium: person.potassium ?? undefined,
      classes, medNotes: foodNotes(pseudo), cycle: cycle || undefined, ...options,
    });
    return options.lang === 'en' ? translatePlan(plan) : plan;
  } catch (err) {
    throw new HttpError(400, err.message);
  }
}

const summary = (c) => {
  const last = c.plans[c.plans.length - 1];
  return {
    id: c.id, name: c.name, sex: c.sex, age: c.age, birthDate: c.birthDate, phone: c.phone,
    updatedAt: c.updatedAt, plans: c.plans.length,
    lastPlan: last ? { date: last.date, kcal: last.plan.targets.kcal, goal: last.plan.input.goal } : null,
    diagnoses: c.diagnoses.map(d => d.code),
  };
};
const clientOr404 = (store, id) => store.nutritionClients.find(c => c.id === id) || notFound('Записът не е намерен.');
const label = (c) => c.name || `без име, ${c.age} г.`;

export const nutritionRoutes = {
  'GET /api/nutrition/clients': ({ store }) => ({
    clients: [...store.nutritionClients].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(summary),
  }),

  'GET /api/nutrition/clients/:id': ({ store, params }) => ({ client: clientOr404(store, params.id) }),

  'POST /api/nutrition/clients': ({ store, body, doctor }) => {
    const c = { id: store.nextId('nc'), ...readPerson(body), plans: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), doctorId: doctor ? doctor.id : '' };
    store.nutritionClients.push(c);
    store.persist();
    store.audit(doctor, 'nutrition_client_add', { name: label(c) });
    return { client: c };
  },

  'PUT /api/nutrition/clients/:id': ({ store, params, body, doctor }) => {
    const c = clientOr404(store, params.id);
    Object.assign(c, readPerson(body, c), { updatedAt: new Date().toISOString() });
    store.persist();
    store.audit(doctor, 'nutrition_client_update', { name: label(c) });
    return { client: c };
  },

  'DELETE /api/nutrition/clients/:id': ({ store, params, doctor }) => {
    const c = clientOr404(store, params.id);
    store.data.nutritionClients = store.nutritionClients.filter(x => x !== c);
    store.persist();
    store.audit(doctor, 'nutrition_client_delete', { name: label(c) });
  },

  /* Изготвяне — с данните от формата; със save се записва (и човекът, ако е нов). */
  'POST /api/nutrition/plan': ({ store, body, doctor }) => {
    const current = body.clientId ? clientOr404(store, body.clientId) : null;
    const person = readPerson(body.person || {}, current || {});
    // Цикълът: записаният плюс датите и настройките от формата; при запазване влизат в дневника.
    const cycle = person.sex === 'f' ? mergeCycle(person.cycle, readCycle(body.cycle, { birthDate: person.birthDate })) : null;
    const plan = planFor(person, readPlanOptions(body), cycle);
    if (!body.save) return { plan };
    if (cycle) person.cycle = cycle;
    let c = current;
    if (c) Object.assign(c, person);
    else {
      c = { id: store.nextId('nc'), ...person, plans: [], createdAt: new Date().toISOString(), doctorId: doctor ? doctor.id : '' };
      store.nutritionClients.push(c);
    }
    const entry = { id: store.nextId('n'), date: today(), plan, doctorId: doctor ? doctor.id : '' };
    c.plans.push(entry);
    c.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, 'nutrition_client_plan', { name: label(c), kcal: plan.energy.target });
    return { plan, saved: entry, client: c };
  },

  /* Тегло между режимите (версия 4.14) — за напредъка по последния режим. Едно измерване на ден. */
  'POST /api/nutrition/clients/:id/weights': ({ store, params, body, doctor }) => {
    const c = clientOr404(store, params.id);
    const d = date(body.date || today(), 'Дата', { required: true });
    if (d > today()) bad('Датата не може да е в бъдещето.');
    const weight = num(body.weight, 'Тегло', { min: 30, max: 350, required: true });
    c.weights = [...(c.weights || []).filter(x => x.date !== d), { date: d, weight }].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-200);
    c.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, 'nutrition_client_weight', { name: label(c) });
    return { client: c };
  },

  'DELETE /api/nutrition/clients/:id/weights/:date': ({ store, params, doctor }) => {
    const c = clientOr404(store, params.id);
    const before = (c.weights || []).length;
    c.weights = (c.weights || []).filter(x => x.date !== params.date);
    if (c.weights.length === before) notFound('Измерването не е намерено.');
    c.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, 'nutrition_client_weight_delete', { name: label(c) });
    return { client: c };
  },

  'DELETE /api/nutrition/clients/:id/plans/:pid': ({ store, params, doctor }) => {
    const c = clientOr404(store, params.id);
    const n = c.plans.find(x => x.id === params.pid) || notFound('Режимът не е намерен.');
    c.plans = c.plans.filter(x => x !== n);
    c.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, 'nutrition_client_plan_delete', { name: label(c) });
  },
};
