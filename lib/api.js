/* Приложният интерфейс (API). Всеки обработчик получава контекст с
 * хранилището, текущия лекар и разчетеното тяло на заявката. */

import fs from 'node:fs';
import { hashPin, verifyPin } from './store.js';
import { addDays, isValidISO, today } from '../public/js/shared/dates.js';
import { parse as parseEgn } from '../public/js/shared/egn.js';
import { practiceTasks, summarize } from '../public/js/shared/schedule.js';
import { analyseMeasurements } from '../public/js/shared/growth.js';
import { defaultSchedule } from '../public/js/shared/calendar.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = msg => { throw new HttpError(400, msg); };
const notFound = msg => { throw new HttpError(404, msg); };

/* ------------------------------ проверки ------------------------------- */

function str(value, field, { required = false, max = 500 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) bad(`Полето „${field}“ е задължително.`);
    return '';
  }
  const s = String(value).trim();
  if (s.length > max) bad(`Полето „${field}“ е твърде дълго (до ${max} знака).`);
  return s;
}

function date(value, field, { required = false } = {}) {
  if (!value) {
    if (required) bad(`Полето „${field}“ е задължително.`);
    return '';
  }
  const s = String(value).trim();
  if (!isValidISO(s)) bad(`„${field}“ не е валидна дата.`);
  return s;
}

function num(value, field, { min = -Infinity, max = Infinity, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) bad(`Полето „${field}“ е задължително.`);
    return null;
  }
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) bad(`„${field}“ трябва да е число.`);
  if (n < min || n > max) bad(`„${field}“ е извън допустимите граници (${min}–${max}).`);
  return n;
}

function list(value, field, max = 60) {
  if (!value) return [];
  if (!Array.isArray(value)) bad(`„${field}“ трябва да е списък.`);
  if (value.length > max) bad(`Твърде много елементи в „${field}“.`);
  return value.map(v => String(v).trim()).filter(Boolean);
}

/* --------------------------- помощни функции --------------------------- */

/** Кратко описание на дете за списъци — без тежките подмасиви. */
function patientCard(store, p, opts) {
  const s = summarize(p, store.schedule, opts);
  return {
    id: p.id,
    name: p.name,
    egn: p.egn || '',
    sex: p.sex,
    birthDate: p.birthDate,
    phone: p.phone || '',
    doctorId: p.doctorId || '',
    archived: !!p.archived,
    allergies: p.allergies || [],
    conditions: p.conditions || [],
    counts: s.counts,
    coverage: s.coverage,
    needsAttention: s.needsAttention,
    next: s.next ? {
      itemId: s.next.id, name: s.next.name, short: s.next.short,
      due: s.next.due, status: s.next.status, group: s.next.group,
    } : null,
    lastMeasurement: (p.measurements || []).length
      ? p.measurements.reduce((a, b) => (a.date > b.date ? a : b)).date : null,
    lastVisit: (p.visits || []).length
      ? p.visits.reduce((a, b) => (a.date > b.date ? a : b)).date : null,
  };
}

function normalise(text) {
  return String(text || '').toLowerCase()
    .replace(/[ьъ]/g, '').replace(/\s+/g, ' ').trim();
}

/* -------------------------------- рутер -------------------------------- */

export const routes = {

  /* ---- сесия и първоначална настройка ---- */

  'GET /api/state': (ctx) => {
    const { store, doctor } = ctx;
    const needsSetup = store.doctors.length === 0;
    return {
      needsSetup,
      requireLogin: store.settings.requireLogin,
      practice: store.data.practice,
      doctor: doctor ? { id: doctor.id, name: doctor.name, role: doctor.role } : null,
      doctors: store.doctors.map(d => ({ id: d.id, name: d.name, role: d.role, active: d.active !== false })),
      version: store.data.version,
    };
  },

  'POST /api/setup': (ctx) => {
    const { store, body } = ctx;
    if (store.doctors.length) throw new HttpError(409, 'Практиката вече е настроена.');
    const practiceName = str(body.practiceName, 'Име на практиката', { required: true, max: 120 });
    const doctorName = str(body.doctorName, 'Име на лекаря', { required: true, max: 120 });
    const pin = str(body.pin, 'ПИН', { max: 20 });
    if (pin && !/^\d{4,8}$/.test(pin)) bad('ПИН-ът трябва да е между 4 и 8 цифри.');

    store.data.practice = {
      name: practiceName,
      address: str(body.address, 'Адрес', { max: 200 }),
      phone: str(body.phone, 'Телефон', { max: 60 }),
    };
    const doc = {
      id: store.nextId('d'),
      name: doctorName,
      role: 'Общопрактикуващ лекар',
      pin: pin ? hashPin(pin) : null,
      active: true,
      createdAt: new Date().toISOString(),
    };
    store.doctors.push(doc);
    store.settings.requireLogin = !!pin;
    store.persist();
    store.audit(doc, 'setup', { practice: practiceName });

    const token = store.createSession(doc.id);
    ctx.setSession(token);
    return { ok: true, doctor: { id: doc.id, name: doc.name, role: doc.role } };
  },

  'POST /api/login': (ctx) => {
    const { store, body } = ctx;
    const doc = store.doctor(str(body.doctorId, 'Лекар', { required: true }));
    if (!doc || doc.active === false) throw new HttpError(401, 'Непознат потребител.');
    if (doc.pin && !verifyPin(String(body.pin || ''), doc.pin)) {
      store.audit(null, 'login_failed', { doctorId: doc.id });
      throw new HttpError(401, 'Грешен ПИН.');
    }
    const token = store.createSession(doc.id);
    ctx.setSession(token);
    store.audit(doc, 'login');
    return { ok: true, doctor: { id: doc.id, name: doc.name, role: doc.role } };
  },

  'POST /api/logout': (ctx) => {
    if (ctx.token) ctx.store.dropSession(ctx.token);
    ctx.clearSession();
    return { ok: true };
  },

  /* ---- начални данни за интерфейса ---- */

  'GET /api/bootstrap': (ctx) => {
    const { store } = ctx;
    return {
      practice: store.data.practice,
      doctors: store.doctors.map(d => ({
        id: d.id, name: d.name, role: d.role, active: d.active !== false, hasPin: !!d.pin,
      })),
      schedule: store.schedule,
      settings: store.settings,
      counts: {
        patients: store.patients.filter(p => !p.archived).length,
        archived: store.patients.filter(p => p.archived).length,
      },
    };
  },

  /* ---- пациенти ---- */

  'GET /api/patients': (ctx) => {
    const { store, query } = ctx;
    const opts = { asOf: today(), horizonDays: Number(query.horizon) || store.settings.horizonDays };
    const q = normalise(query.q);
    const wantArchived = query.archived === '1';

    let items = store.patients.filter(p => !!p.archived === wantArchived);
    if (query.doctor) items = items.filter(p => p.doctorId === query.doctor);
    if (q) {
      items = items.filter(p =>
        normalise(p.name).includes(q) ||
        (p.egn || '').includes(q) ||
        (p.phone || '').replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
        (p.contacts || []).some(c => normalise(c.name).includes(q) || (c.phone || '').includes(q)));
    }

    const cards = items.map(p => patientCard(store, p, opts));
    const sort = query.sort || 'name';
    cards.sort((a, b) => {
      if (sort === 'attention') {
        const d = (b.counts.overdue + b.counts.due) - (a.counts.overdue + a.counts.due);
        if (d !== 0) return d;
      } else if (sort === 'age') {
        if (a.birthDate !== b.birthDate) return a.birthDate > b.birthDate ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'bg');
    });
    return { patients: cards, total: cards.length };
  },

  'GET /api/patients/:id': (ctx) => {
    const { store, params, query } = ctx;
    const p = store.patient(params.id);
    if (!p) notFound('Досието не е намерено.');
    const opts = { asOf: today(), horizonDays: Number(query.horizon) || store.settings.horizonDays };
    const s = summarize(p, store.schedule, opts);
    return {
      patient: p,
      plan: s.plan.map(e => ({
        id: e.id, group: e.group, name: e.name, short: e.short, note: e.note,
        due: e.due, status: e.status, record: e.record, actionDate: e.actionDate,
        overdueDays: e.overdueDays || 0, mandatory: !!e.item.mandatory,
        optIn: !!e.item.optIn, protects: e.item.protects || '', doseMonths: e.item.dueMonths,
      })),
      summary: { counts: s.counts, coverage: s.coverage, coverageDone: s.coverageDone, coverageDue: s.coverageDue },
      growth: analyseMeasurements(p, p.measurements),
    };
  },

  'POST /api/patients': (ctx) => {
    const { store, body, doctor } = ctx;
    const patient = {
      id: store.nextId('p'),
      ...readPatientFields(body, true),
      records: {}, optIn: [], measurements: [], visits: [], reminders: [],
      createdAt: new Date().toISOString(),
      createdBy: doctor ? doctor.id : null,
    };
    if (patient.egn && store.patients.some(p => p.egn && p.egn === patient.egn)) {
      throw new HttpError(409, 'Дете с това ЕГН вече е записано.');
    }
    store.patients.push(patient);
    store.persist();
    store.audit(doctor, 'patient_create', { patientId: patient.id, name: patient.name });
    return { patient };
  },

  'PATCH /api/patients/:id': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = store.patient(params.id);
    if (!p) notFound('Досието не е намерено.');
    const fields = readPatientFields(body, false);
    if (fields.egn && store.patients.some(o => o.id !== p.id && o.egn === fields.egn)) {
      throw new HttpError(409, 'Дете с това ЕГН вече е записано.');
    }
    Object.assign(p, fields);
    p.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, 'patient_update', { patientId: p.id, name: p.name });
    return { patient: p };
  },

  'POST /api/patients/:id/archive': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = store.patient(params.id);
    if (!p) notFound('Досието не е намерено.');
    p.archived = body.archived !== false;
    p.archivedReason = str(body.reason, 'Причина', { max: 200 });
    p.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, p.archived ? 'patient_archive' : 'patient_restore',
      { patientId: p.id, name: p.name, reason: p.archivedReason });
    return { patient: p };
  },

  /* ---- имунизации, прегледи, скрининг ---- */

  'PUT /api/patients/:id/records/:itemId': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = store.patient(params.id);
    if (!p) notFound('Досието не е намерено.');
    const item = store.schedule.find(i => i.id === params.itemId);
    if (!item) notFound('Дейността не е намерена в календара.');

    const status = str(body.status, 'Статус', { required: true });
    if (!['done', 'deferred', 'refused', 'skipped'].includes(status)) {
      bad('Непознат статус на дейността.');
    }

    const rec = {
      status,
      date: status === 'done' ? date(body.date || today(), 'Дата', { required: true }) : date(body.date, 'Дата'),
      batch: str(body.batch, 'Партиден номер', { max: 60 }),
      product: str(body.product, 'Препарат', { max: 120 }),
      reason: str(body.reason, 'Причина', { max: 300 }),
      note: str(body.note, 'Бележка', { max: 1000 }),
      deferUntil: status === 'deferred' ? date(body.deferUntil, 'Отвод до', { required: true }) : '',
      doctorId: doctor ? doctor.id : '',
      recordedAt: new Date().toISOString(),
    };
    if (rec.date && rec.date > today()) bad('Датата не може да е в бъдещето.');
    if (rec.date && rec.date < p.birthDate) bad('Датата е преди раждането на детето.');
    if (status === 'deferred' && rec.deferUntil <= today()) {
      bad('Отводът трябва да е до бъдеща дата.');
    }

    p.records[params.itemId] = rec;
    p.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, 'record_set',
      { patientId: p.id, name: p.name, itemId: params.itemId, item: item.name, status, date: rec.date });
    return { record: rec };
  },

  'DELETE /api/patients/:id/records/:itemId': (ctx) => {
    const { store, params, doctor } = ctx;
    const p = store.patient(params.id);
    if (!p) notFound('Досието не е намерено.');
    const had = p.records[params.itemId];
    delete p.records[params.itemId];
    p.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, 'record_clear',
      { patientId: p.id, name: p.name, itemId: params.itemId, previous: had ? had.status : null });
    return { ok: true };
  },

  'PUT /api/patients/:id/optin': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = store.patient(params.id);
    if (!p) notFound('Досието не е намерено.');
    const valid = new Set(store.schedule.filter(i => i.optIn).map(i => i.id));
    p.optIn = list(body.optIn, 'Препоръчителни').filter(id => valid.has(id));
    p.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, 'optin_set', { patientId: p.id, name: p.name, optIn: p.optIn });
    return { optIn: p.optIn };
  },

  /* ---- растеж ---- */

  'POST /api/patients/:id/measurements': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = store.patient(params.id);
    if (!p) notFound('Досието не е намерено.');
    const m = {
      id: store.nextId('m'),
      date: date(body.date || today(), 'Дата', { required: true }),
      weight: num(body.weight, 'Тегло', { min: 0.3, max: 200 }),
      height: num(body.height, 'Ръст', { min: 20, max: 230 }),
      head: num(body.head, 'Обиколка на главата', { min: 20, max: 70 }),
      note: str(body.note, 'Бележка', { max: 500 }),
      doctorId: doctor ? doctor.id : '',
      recordedAt: new Date().toISOString(),
    };
    if (m.weight === null && m.height === null && m.head === null) {
      bad('Въведете поне едно измерване.');
    }
    if (m.date > today()) bad('Датата не може да е в бъдещето.');
    if (m.date < p.birthDate) bad('Датата е преди раждането на детето.');
    p.measurements.push(m);
    p.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, 'measurement_add', { patientId: p.id, name: p.name, date: m.date });
    return { measurement: m, growth: analyseMeasurements(p, p.measurements) };
  },

  'DELETE /api/patients/:id/measurements/:mid': (ctx) => {
    const { store, params, doctor } = ctx;
    const p = store.patient(params.id);
    if (!p) notFound('Досието не е намерено.');
    const before = p.measurements.length;
    p.measurements = p.measurements.filter(m => m.id !== params.mid);
    if (p.measurements.length === before) notFound('Измерването не е намерено.');
    store.persist();
    store.audit(doctor, 'measurement_delete', { patientId: p.id, name: p.name, measurementId: params.mid });
    return { growth: analyseMeasurements(p, p.measurements) };
  },

  /* ---- прегледи ---- */

  'POST /api/patients/:id/visits': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = store.patient(params.id);
    if (!p) notFound('Досието не е намерено.');
    const v = {
      id: store.nextId('v'),
      date: date(body.date || today(), 'Дата', { required: true }),
      type: str(body.type, 'Вид', { max: 60 }) || 'Амбулаторен преглед',
      complaint: str(body.complaint, 'Оплаквания', { max: 2000 }),
      findings: str(body.findings, 'Обективно състояние', { max: 4000 }),
      diagnosis: str(body.diagnosis, 'Диагноза', { max: 500 }),
      icd: str(body.icd, 'МКБ код', { max: 20 }).toUpperCase(),
      treatment: str(body.treatment, 'Терапия', { max: 2000 }),
      note: str(body.note, 'Бележка', { max: 2000 }),
      doctorId: doctor ? doctor.id : '',
      recordedAt: new Date().toISOString(),
    };
    if (v.date > today()) bad('Датата не може да е в бъдещето.');
    p.visits.push(v);
    p.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, 'visit_add', { patientId: p.id, name: p.name, date: v.date, diagnosis: v.diagnosis });
    return { visit: v };
  },

  'DELETE /api/patients/:id/visits/:vid': (ctx) => {
    const { store, params, doctor } = ctx;
    const p = store.patient(params.id);
    if (!p) notFound('Досието не е намерено.');
    const before = p.visits.length;
    p.visits = p.visits.filter(v => v.id !== params.vid);
    if (p.visits.length === before) notFound('Прегледът не е намерен.');
    store.persist();
    store.audit(doctor, 'visit_delete', { patientId: p.id, name: p.name, visitId: params.vid });
    return { ok: true };
  },

  /* ---- индивидуални напомняния ---- */

  'POST /api/patients/:id/reminders': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = store.patient(params.id);
    if (!p) notFound('Досието не е намерено.');
    const r = {
      id: store.nextId('r'),
      date: date(body.date, 'Дата', { required: true }),
      text: str(body.text, 'Описание', { required: true, max: 300 }),
      done: false, doneDate: '',
      doctorId: doctor ? doctor.id : '',
      createdAt: new Date().toISOString(),
    };
    p.reminders.push(r);
    p.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, 'reminder_add', { patientId: p.id, name: p.name, text: r.text, date: r.date });
    return { reminder: r };
  },

  'PATCH /api/patients/:id/reminders/:rid': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = store.patient(params.id);
    if (!p) notFound('Досието не е намерено.');
    const r = (p.reminders || []).find(x => x.id === params.rid);
    if (!r) notFound('Напомнянето не е намерено.');
    if (body.done !== undefined) {
      r.done = !!body.done;
      r.doneDate = r.done ? (date(body.doneDate, 'Дата') || today()) : '';
    }
    if (body.text !== undefined) r.text = str(body.text, 'Описание', { required: true, max: 300 });
    if (body.date !== undefined) r.date = date(body.date, 'Дата', { required: true });
    store.persist();
    store.audit(doctor, 'reminder_update', { patientId: p.id, name: p.name, reminderId: r.id, done: r.done });
    return { reminder: r };
  },

  'DELETE /api/patients/:id/reminders/:rid': (ctx) => {
    const { store, params, doctor } = ctx;
    const p = store.patient(params.id);
    if (!p) notFound('Досието не е намерено.');
    p.reminders = (p.reminders || []).filter(r => r.id !== params.rid);
    store.persist();
    store.audit(doctor, 'reminder_delete', { patientId: p.id, name: p.name, reminderId: params.rid });
    return { ok: true };
  },

  /* ---- задачи на практиката ---- */

  'GET /api/tasks': (ctx) => {
    const { store, query } = ctx;
    const horizonDays = Number(query.horizon) || store.settings.horizonDays;
    const asOf = query.asOf && isValidISO(query.asOf) ? query.asOf : today();
    const tasks = practiceTasks(store.patients, store.schedule, {
      asOf, horizonDays,
      doctorId: query.doctor || null,
      includeDeferred: query.deferred === '1',
    });

    // Индивидуалните напомняния се вливат в същия списък.
    for (const p of store.patients) {
      if (p.archived) continue;
      if (query.doctor && p.doctorId !== query.doctor) continue;
      for (const r of p.reminders || []) {
        if (r.done) continue;
        const status = r.date < asOf ? 'overdue' : r.date <= addDays(asOf, horizonDays) ? 'soon' : null;
        if (!status) continue;
        tasks.push({
          patientId: p.id, patientName: p.name, patientPhone: p.phone || '',
          birthDate: p.birthDate, doctorId: p.doctorId || '',
          itemId: r.id, name: r.text, short: r.text, group: 'reminder',
          status: r.date === asOf ? 'due' : status,
          due: r.date, actionDate: r.date, overdueDays: 0, isReminder: true,
        });
      }
    }
    tasks.sort((a, b) => (a.actionDate < b.actionDate ? -1 : a.actionDate > b.actionDate ? 1 : 0));

    const buckets = { overdue: [], today: [], soon: [], deferred: [] };
    for (const t of tasks) {
      if (t.status === 'deferred') buckets.deferred.push(t);
      else if (t.status === 'overdue' || t.status === 'deferral_ended') buckets.overdue.push(t);
      else if (t.actionDate <= asOf) buckets.today.push(t);
      else buckets.soon.push(t);
    }
    buckets.overdue.sort((a, b) => (a.actionDate < b.actionDate ? -1 : 1));
    return { asOf, horizonDays, buckets, total: tasks.length };
  },

  /* ---- справки ---- */

  'GET /api/reports': (ctx) => {
    const { store, query } = ctx;
    const asOf = query.asOf && isValidISO(query.asOf) ? query.asOf : today();
    const active = store.patients.filter(p => !p.archived);

    const ageBands = [
      { label: '0–11 мес.', from: 0, to: 11, count: 0 },
      { label: '1–2 г.', from: 12, to: 35, count: 0 },
      { label: '3–6 г.', from: 36, to: 83, count: 0 },
      { label: '7–13 г.', from: 84, to: 167, count: 0 },
      { label: '14–18 г.', from: 168, to: 240, count: 0 },
    ];
    const perItem = new Map();
    let fullyCovered = 0, withOverdue = 0, coverageSum = 0, coverageCount = 0;

    for (const p of active) {
      const s = summarize(p, store.schedule, { asOf });
      if (s.counts.overdue > 0) withOverdue++;
      if (s.coverage !== null) { coverageSum += s.coverage; coverageCount++; if (s.coverage === 100) fullyCovered++; }

      const months = monthsOld(p.birthDate, asOf);
      const band = ageBands.find(b => months >= b.from && months <= b.to);
      if (band) band.count++;

      for (const e of s.plan) {
        if (e.group !== 'vaccine' || !e.item.mandatory || e.due > asOf) continue;
        if (!perItem.has(e.id)) perItem.set(e.id, { id: e.id, name: e.name, due: 0, done: 0 });
        const row = perItem.get(e.id);
        row.due++;
        if (e.status === 'done') row.done++;
      }
    }

    const byItem = [...perItem.values()]
      .map(r => ({ ...r, pct: r.due ? Math.round((r.done / r.due) * 100) : null }))
      .sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100));

    return {
      asOf,
      totals: {
        patients: active.length,
        archived: store.patients.length - active.length,
        withOverdue,
        fullyCovered,
        averageCoverage: coverageCount ? Math.round(coverageSum / coverageCount) : null,
      },
      ageBands,
      byItem,
    };
  },

  /* ---- лекари ---- */

  'POST /api/doctors': (ctx) => {
    const { store, body, doctor } = ctx;
    const name = str(body.name, 'Име', { required: true, max: 120 });
    const pin = str(body.pin, 'ПИН', { max: 20 });
    if (pin && !/^\d{4,8}$/.test(pin)) bad('ПИН-ът трябва да е между 4 и 8 цифри.');
    const d = {
      id: store.nextId('d'),
      name,
      role: str(body.role, 'Длъжност', { max: 80 }) || 'Общопрактикуващ лекар',
      pin: pin ? hashPin(pin) : null,
      active: true,
      createdAt: new Date().toISOString(),
    };
    store.doctors.push(d);
    store.persist();
    store.audit(doctor, 'doctor_add', { doctorId: d.id, name: d.name });
    return { doctor: { id: d.id, name: d.name, role: d.role, active: true, hasPin: !!d.pin } };
  },

  'PATCH /api/doctors/:id': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const d = store.doctor(params.id);
    if (!d) notFound('Лекарят не е намерен.');
    if (body.name !== undefined) d.name = str(body.name, 'Име', { required: true, max: 120 });
    if (body.role !== undefined) d.role = str(body.role, 'Длъжност', { max: 80 });
    if (body.active !== undefined) {
      d.active = !!body.active;
      if (!d.active && store.doctors.filter(x => x.active !== false).length === 0) {
        d.active = true;
        bad('Трябва да остане поне един активен потребител.');
      }
    }
    if (body.pin !== undefined) {
      const pin = str(body.pin, 'ПИН', { max: 20 });
      if (pin && !/^\d{4,8}$/.test(pin)) bad('ПИН-ът трябва да е между 4 и 8 цифри.');
      d.pin = pin ? hashPin(pin) : null;
    }
    store.persist();
    store.audit(doctor, 'doctor_update', { doctorId: d.id, name: d.name });
    return { doctor: { id: d.id, name: d.name, role: d.role, active: d.active !== false, hasPin: !!d.pin } };
  },

  /* ---- настройки и календар ---- */

  'PATCH /api/settings': (ctx) => {
    const { store, body, doctor } = ctx;
    if (body.horizonDays !== undefined) {
      store.settings.horizonDays = num(body.horizonDays, 'Хоризонт', { min: 1, max: 365, required: true });
    }
    if (body.requireLogin !== undefined) store.settings.requireLogin = !!body.requireLogin;
    if (body.practice) {
      store.data.practice = {
        name: str(body.practice.name, 'Име на практиката', { required: true, max: 120 }),
        address: str(body.practice.address, 'Адрес', { max: 200 }),
        phone: str(body.practice.phone, 'Телефон', { max: 60 }),
      };
    }
    store.persist();
    store.audit(doctor, 'settings_update');
    return { settings: store.settings, practice: store.data.practice };
  },

  'PUT /api/schedule/:itemId': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const item = store.schedule.find(i => i.id === params.itemId);
    if (!item) notFound('Дейността не е намерена.');
    if (body.name !== undefined) item.name = str(body.name, 'Наименование', { required: true, max: 160 });
    if (body.short !== undefined) item.short = str(body.short, 'Кратко име', { max: 60 });
    if (body.note !== undefined) item.note = str(body.note, 'Бележка', { max: 600 });
    if (body.dueMonths !== undefined) {
      item.dueMonths = num(body.dueMonths, 'Възраст', { min: 0, max: 240, required: true });
      if (item.minMonths > item.dueMonths) item.minMonths = item.dueMonths;
    }
    if (body.graceMonths !== undefined) item.graceMonths = num(body.graceMonths, 'Гратис', { min: 0, max: 60 });
    if (body.mandatory !== undefined) item.mandatory = !!body.mandatory;
    if (body.disabled !== undefined) item.disabled = !!body.disabled;
    store.persist();
    store.audit(doctor, 'schedule_update', { itemId: item.id, name: item.name });
    return { item };
  },

  'POST /api/schedule': (ctx) => {
    const { store, body, doctor } = ctx;
    const item = {
      id: 'custom-' + store.nextId('s'),
      group: ['vaccine', 'checkup', 'screening'].includes(body.group) ? body.group : 'screening',
      name: str(body.name, 'Наименование', { required: true, max: 160 }),
      short: str(body.short, 'Кратко име', { max: 60 }),
      note: str(body.note, 'Бележка', { max: 600 }),
      dueMonths: num(body.dueMonths, 'Възраст', { min: 0, max: 240, required: true }),
      minMonths: 0,
      graceMonths: num(body.graceMonths, 'Гратис', { min: 0, max: 60 }) ?? 1,
      mandatory: body.mandatory !== false,
      optIn: !!body.optIn,
      custom: true,
    };
    item.minMonths = Math.max(0, item.dueMonths - 1);
    store.schedule.push(item);
    store.persist();
    store.audit(doctor, 'schedule_add', { itemId: item.id, name: item.name });
    return { item };
  },

  'DELETE /api/schedule/:itemId': (ctx) => {
    const { store, params, doctor } = ctx;
    const item = store.schedule.find(i => i.id === params.itemId);
    if (!item) notFound('Дейността не е намерена.');
    if (!item.custom) bad('Само добавените от практиката дейности могат да се изтриват. Стандартните може да изключите.');
    store.data.schedule = store.schedule.filter(i => i.id !== params.itemId);
    store.persist();
    store.audit(doctor, 'schedule_delete', { itemId: params.itemId, name: item.name });
    return { ok: true };
  },

  'POST /api/schedule/reset': (ctx) => {
    const { store, doctor } = ctx;
    store.data.schedule = defaultSchedule();
    store.persist();
    store.audit(doctor, 'schedule_reset');
    return { schedule: store.schedule };
  },

  /* ---- журнал, износ, внос ---- */

  'GET /api/audit': (ctx) => ({ entries: ctx.store.readAudit(Number(ctx.query.limit) || 200) }),

  'GET /api/export': (ctx) => {
    ctx.store.audit(ctx.doctor, 'export');
    return ctx.store.data;
  },

  'POST /api/import': (ctx) => {
    const { store, body, doctor } = ctx;
    if (!body || !Array.isArray(body.patients)) bad('Файлът не съдържа валидни данни (липсва списък с пациенти).');
    const incoming = body.patients.length;
    // Преди презапис задължително се прави копие на текущите данни.
    store.dailyBackup();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const preImport = `${store.backupDir}/pre-import-${stamp}.json`;
    try { fs.copyFileSync(store.file, preImport); } catch { /* още няма файл */ }

    store.data = {
      ...store.data,
      practice: body.practice || store.data.practice,
      doctors: Array.isArray(body.doctors) && body.doctors.length ? body.doctors : store.data.doctors,
      patients: body.patients,
      schedule: Array.isArray(body.schedule) && body.schedule.length ? body.schedule : store.data.schedule,
      settings: body.settings || store.data.settings,
    };
    store.migrate();
    store.persistSync();
    store.audit(doctor, 'import', { patients: incoming, backup: preImport });
    return { ok: true, patients: incoming };
  },
};

/* ------------------------- помощни за модула --------------------------- */

function readPatientFields(body, isNew) {
  const out = {};
  const has = k => body[k] !== undefined;

  if (isNew || has('name')) out.name = str(body.name, 'Име', { required: isNew, max: 120 });
  if (isNew || has('egn')) {
    const raw = str(body.egn, 'ЕГН', { max: 10 }).replace(/\D/g, '');
    if (raw && raw.length !== 10) bad('ЕГН трябва да е точно 10 цифри.');
    out.egn = raw;
  }
  // Не се изисква тук: ако е дадено валидно ЕГН, датата се допълва от него
  // по-долу, а проверката за задължителност е в края на функцията.
  if (isNew || has('birthDate')) out.birthDate = date(body.birthDate, 'Дата на раждане');
  if (isNew || has('sex')) {
    const s = str(body.sex, 'Пол');
    if (s && !['m', 'f'].includes(s)) bad('Полът трябва да е „m“ или „f“.');
    out.sex = s;
  }
  if (has('phone')) out.phone = str(body.phone, 'Телефон', { max: 60 });
  if (has('address')) out.address = str(body.address, 'Адрес', { max: 200 });
  if (has('doctorId')) out.doctorId = str(body.doctorId, 'Лекар', { max: 60 });
  if (has('notes')) out.notes = str(body.notes, 'Бележки', { max: 4000 });
  if (has('allergies')) out.allergies = list(body.allergies, 'Алергии');
  if (has('conditions')) out.conditions = list(body.conditions, 'Заболявания');
  if (has('contacts')) {
    out.contacts = (Array.isArray(body.contacts) ? body.contacts : []).slice(0, 8).map(c => ({
      name: str(c.name, 'Име на контакт', { max: 120 }),
      relation: str(c.relation, 'Роля', { max: 40 }),
      phone: str(c.phone, 'Телефон', { max: 60 }),
    })).filter(c => c.name || c.phone);
  }
  if (has('birth')) {
    const b = body.birth || {};
    out.birth = {
      weight: num(b.weight, 'Тегло при раждане', { min: 0.2, max: 8 }),
      height: num(b.height, 'Ръст при раждане', { min: 20, max: 70 }),
      head: num(b.head, 'Обиколка на главата', { min: 20, max: 50 }),
      gestWeeks: num(b.gestWeeks, 'Гестационна седмица', { min: 20, max: 45 }),
      apgar: str(b.apgar, 'Апгар', { max: 20 }),
      delivery: str(b.delivery, 'Раждане', { max: 60 }),
    };
  }

  // Ако е дадено валидно ЕГН, датата и полът се допълват от него.
  if (out.egn) {
    const parsed = parseEgn(out.egn);
    if (parsed) {
      if (!out.birthDate) out.birthDate = parsed.birthDate;
      if (!out.sex) out.sex = parsed.sex;
    }
  }
  if (isNew && !out.birthDate) bad('Въведете дата на раждане или валидно ЕГН.');
  if (out.birthDate && out.birthDate > today()) bad('Датата на раждане не може да е в бъдещето.');
  return out;
}

function monthsOld(birthDate, asOf) {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ay, am, ad] = asOf.split('-').map(Number);
  let m = (ay - by) * 12 + (am - bm);
  if (ad < bd) m--;
  return m;
}

/** Пътищата, достъпни без вписване. */
export const PUBLIC_ROUTES = new Set(['GET /api/state', 'POST /api/login', 'POST /api/setup']);
