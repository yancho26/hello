/* Приложен интерфейс на практиката за специализирана извънболнична помощ
 * (СИМП): прегледи с амбулаторен лист, направления, протоколи за лекарства,
 * диспансерно наблюдение при специалиста, график с часове, табло и справки.
 *
 * Всички пътища тук работят само в практиката за СИМП — практиката на ОПЛ
 * има своя календар, диспансеризация и справки. */

import { HttpError, bad, date, entries, notFound, num, str } from './validate.js';
import { addDays, ageInMonthsExact, daysBetween, isValidISO, today } from '../public/js/shared/dates.js';
import { isAdultPatient } from '../public/js/shared/schedule.js';
import { analyseMeasurements, growthConcerns } from '../public/js/shared/growth.js';
import { activeConditions } from '../public/js/shared/chronic.js';
import { adultFlags } from '../public/js/shared/adult.js';
import { normIcd } from '../public/js/shared/icd.js';
import { LOBES, noduleAssessment } from '../public/js/shared/endo.js';
import { MODULE_IDS } from '../public/js/shared/specialty.js';
import {
  APPT_STATUS, EXAM_TYPES, FOLLOW_INTERVALS, REFERRAL_NUMBER, REFERRAL_PURPOSES, examsOf, followupState,
  overlapping, protocolState, referralState, simpSummary,
} from '../public/js/shared/simp.js';
import { cachedAdultSummary } from './api-adult.js';
import { specialtyView } from './api-specialty.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_RANGE_DAYS = 62;

/* ------------------------------- помощни ------------------------------- */

function simpOnly(store) {
  if (store.kind !== 'simp') bad('Това е функция на практиката за СИМП.');
}

function patientOr404(store, id) {
  const p = store.patient(id) || notFound('Досието не е намерено.');
  for (const k of ['visits', 'referrals', 'protocols', 'followups', 'measurements']) if (!Array.isArray(p[k])) p[k] = [];
  return p;
}

const touch = (store, p) => {
  p.updatedAt = new Date().toISOString();
  store.persist();
};

function pastDate(value, p, field) {
  const d = date(value || today(), field, { required: true });
  if (d > today()) bad(`${field}: датата не може да е в бъдещето.`);
  if (p.birthDate && d < p.birthDate) bad(`${field}: датата е преди раждането.`);
  return d;
}

const pick = (value, allowed, field, required = false) => {
  if (value === undefined || value === null || value === '') {
    if (required) bad(`Полето „${field}“ е задължително.`);
    return '';
  }
  if (typeof value !== 'string' || !allowed[value]) bad(`Непозната стойност за „${field}“.`);
  return value;
};

const icdField = (value, field = 'Код по МКБ-10') => {
  const code = normIcd(str(value, field, { max: 20 }));
  if (code && !/^[A-Z]\d{2}(\.\d{1,2})?[A-Z0-9]?$/.test(code)) bad(`„${code}“ не прилича на код по МКБ-10 (например I10 или E11.9).`);
  return code;
};

const uinField = (value, field) => {
  const raw = str(value, field, { max: 20 }).replace(/\s/g, '');
  if (raw && !/^\d{10}$/.test(raw)) bad(`${field} е точно 10 цифри.`);
  return raw;
};

const specialtyField = (value) => {
  if (value === undefined || value === null || value === '') return '';
  if (!MODULE_IDS.includes(value)) bad('Непозната специалност.');
  return value;
};

const findIn = (list, id, what) => (list || []).find(x => x.id === id) || notFound(`${what} не е намерен${what.endsWith('о') ? 'о' : what.endsWith('а') ? 'а' : ''}.`);

/** Измерванията, въведени заедно с прегледа (налягане, пулс, тегло, ръст). */
function readVitals(value, store, p, when, doctor) {
  const v = entries([value])[0];
  if (!v) return null;
  const m = {
    systolic: num(v.systolic, 'Систолно налягане', { min: 50, max: 280 }),
    diastolic: num(v.diastolic, 'Диастолно налягане', { min: 20, max: 160 }),
    pulse: num(v.pulse, 'Пулс', { min: 25, max: 220 }),
    weight: num(v.weight, 'Тегло', { min: 0.3, max: 350 }),
    height: num(v.height, 'Ръст', { min: 20, max: 230 }),
    waist: num(v.waist, 'Обиколка на талията', { min: 40, max: 250 }),
  };
  if (Object.values(m).every(x => x === null)) return null;
  if ((m.systolic === null) !== (m.diastolic === null)) bad('Въведете и двете стойности на артериалното налягане.');
  if (m.systolic !== null && m.diastolic >= m.systolic) bad('Диастолното налягане трябва да е под систолното.');
  return {
    id: store.nextId('m'), date: when, head: null, ...m, note: 'При преглед',
    doctorId: doctor ? doctor.id : '', recordedAt: new Date().toISOString(),
  };
}

/** Полетата на прегледа — едни и същи при нов запис и при поправка. */
function readExam(store, p, body) {
  const examType = pick(body.examType, EXAM_TYPES, 'Вид на прегледа', true);
  const when = pastDate(body.date, p, 'Дата на прегледа');
  const time = str(body.time, 'Час', { max: 5 });
  if (time && !HHMM.test(time)) bad('Часът е във вида ЧЧ:ММ.');
  let referralId = str(body.referralId, 'Направление', { max: 60 });
  if (referralId) {
    const ref = findIn(p.referrals, referralId, 'Направлението');
    referralId = ref.id;
  }
  const extraDx = entries(body.extraDx).slice(0, 8).map((d, i) => ({
    icd: icdField(d.icd, `Код на придружаващо заболяване ${i + 1}`),
    text: str(d.text, `Придружаващо заболяване ${i + 1}`, { max: 300 }),
  })).filter(d => d.icd || d.text);
  const nrn = str(body.nrn, 'НРН на прегледа', { max: 30 }).toUpperCase().replace(/[\s-]/g, '');
  if (nrn && !REFERRAL_NUMBER.test(nrn)) bad('НРН на прегледа съдържа само цифри и латински букви.');
  const next = date(body.nextDate, 'Следващ преглед');
  if (next && next <= when) bad('Следващият преглед трябва да е след датата на този.');
  const exam = {
    date: when,
    time,
    examType,
    type: EXAM_TYPES[examType].label,
    nrn,
    specialty: specialtyField(body.specialty),
    referralId,
    complaint: str(body.complaint, 'Анамнеза', { max: 4000 }),
    findings: str(body.findings, 'Обективно състояние', { max: 4000 }),
    investigations: str(body.investigations, 'Изследвания', { max: 4000 }),
    diagnosis: str(body.diagnosis, 'Основна диагноза', { max: 500 }),
    icd: icdField(body.icd),
    extraDx,
    treatment: str(body.treatment, 'Терапия', { max: 3000 }),
    recommendations: str(body.recommendations, 'Препоръки', { max: 3000 }),
    nextDate: next,
    note: str(body.note, 'Бележка', { max: 1000 }),
  };
  if (!exam.diagnosis && !exam.icd) bad('Въведете основната диагноза или нейния код по МКБ-10.');
  return exam;
}

/** Предупреждения, които не спират записа, но лекарят трябва да знае. */
function examWarnings(store, p, exam, selfId = null) {
  const out = [];
  const others = p.visits.filter(v => v.simp && v.id !== selfId);
  if (exam.referralId) {
    const ref = p.referrals.find(r => r.id === exam.referralId);
    const linked = others.filter(v => v.referralId === exam.referralId).sort((a, b) => (a.date < b.date ? -1 : 1));
    const primary = linked.find(v => v.examType !== 'secondary');
    if (exam.examType === 'secondary') {
      if (!primary) out.push('По това направление няма първичен преглед.');
      else if (daysBetween(primary.date, exam.date) > store.settings.secondaryDays) {
        out.push(`Вторичният преглед е ${daysBetween(primary.date, exam.date)} дни след първичния — над срока от ${store.settings.secondaryDays} дни.`);
      }
      if (linked.some(v => v.examType === 'secondary')) out.push('По това направление вече има вторичен преглед.');
    } else if (primary) {
      out.push(`По това направление вече има ${primary.type.toLowerCase()} от ${primary.date.split('-').reverse().join('.')}.`);
    }
    if (ref && ref.issued && exam.date < ref.issued) out.push('Прегледът е преди датата на издаване на направлението.');
    if (ref && ref.closed) out.push('Направлението е отбелязано като затворено.');
  } else if (EXAM_TYPES[exam.examType].referral) {
    out.push(`${EXAM_TYPES[exam.examType].label} без въведено направление — ако е по НЗОК, добавете направлението.`);
  }
  return out;
}

function readReferral(store, p, body, current = null) {
  const number = str(body.number, 'Номер на направлението', { max: 30 }).toUpperCase().replace(/[\s-]/g, '');
  if (number && !REFERRAL_NUMBER.test(number)) bad('Номерът на направлението съдържа само цифри и латински букви (НРН е 12 знака).');
  if (number) {
    for (const other of store.patients) {
      const dup = (other.referrals || []).find(r => r.number === number && r !== current);
      if (dup) throw new HttpError(409, `Направление ${number} вече е въведено${other === p ? ' в това досие' : ` (${other.name})`}.`);
    }
  }
  const issued = pastDate(body.issued, p, 'Дата на издаване');
  return {
    number,
    issued,
    purpose: pick(body.purpose, REFERRAL_PURPOSES, 'Цел на направлението', true),
    specialty: specialtyField(body.specialty),
    fromName: str(body.fromName, 'Насочващ лекар', { max: 120 }),
    fromUin: uinField(body.fromUin, 'УИН на насочващия лекар'),
    fromPractice: str(body.fromPractice, 'Практика на насочващия лекар', { max: 160 }),
    icd: icdField(body.icd),
    diagnosis: str(body.diagnosis, 'Диагноза от направлението', { max: 500 }),
    note: str(body.note, 'Бележка', { max: 1000 }),
  };
}

function readProtocol(p, body) {
  const drugs = (Array.isArray(body.drugs) ? body.drugs : String(body.drugs ?? '').split(/\n|;/))
    .filter(x => typeof x === 'string' || typeof x === 'number')
    .map(x => String(x).trim()).filter(Boolean);
  if (!drugs.length) bad('Въведете поне едно лекарство в протокола.');
  if (drugs.length > 10) bad('Протоколът е с твърде много лекарства (до 10).');
  if (drugs.some(x => x.length > 160)) bad('Името на лекарството е твърде дълго (до 160 знака).');
  const issued = pastDate(body.issued, p, 'Дата на издаване');
  const validUntil = date(body.validUntil, 'Валиден до', { required: true });
  if (validUntil <= issued) bad('Протоколът трябва да е валиден след датата на издаване.');
  if (validUntil > addDays(issued, 731)) bad('Срокът на протокола е прекалено дълъг (до 2 години).');
  return {
    number: str(body.number, 'Номер на протокола', { max: 40 }),
    kind: str(body.kind, 'Вид на протокола', { max: 40 }),
    drugs,
    icd: icdField(body.icd),
    diagnosis: str(body.diagnosis, 'Диагноза', { max: 500 }),
    issued,
    validUntil,
    note: str(body.note, 'Бележка', { max: 1000 }),
  };
}

function readFollowup(p, body, current = null) {
  const icd = icdField(body.icd);
  const diagnosis = str(body.diagnosis, 'Диагноза', { max: 300 });
  if (!icd && !diagnosis && !current) bad('Въведете диагнозата, по която се води наблюдението.');
  const every = num(body.everyMonths, 'Честота', { min: 1, max: 24, required: !current });
  if (every !== null && !Number.isInteger(every)) bad('Честотата е цял брой месеци.');
  const since = body.since === undefined && current ? current.since : date(body.since || today(), 'От дата', { required: true });
  if (since > addDays(today(), 366)) bad('Началото на наблюдението е твърде далеч в бъдещето.');
  if (p.birthDate && since < p.birthDate) bad('Началото на наблюдението е преди раждането.');
  return {
    icd: icd || current?.icd || '',
    diagnosis: diagnosis || current?.diagnosis || '',
    since,
    everyMonths: every ?? current.everyMonths,
    specialty: body.specialty === undefined && current ? current.specialty || '' : specialtyField(body.specialty),
    note: body.note === undefined && current ? current.note || '' : str(body.note, 'Бележка', { max: 500 }),
  };
}

/* --------------------------------- часове --------------------------------- */

function readAppointment(store, body, current = null) {
  const src = { ...(current || {}), ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) };
  const when = date(src.date, 'Дата', { required: true });
  if (when < addDays(today(), -366) || when > addDays(today(), 366)) bad('Датата е извън графика (до година назад и напред).');
  const time = str(src.time, 'Час', { required: true, max: 5 });
  if (!HHMM.test(time)) bad('Часът е във вида ЧЧ:ММ.');
  const minutes = num(src.minutes ?? store.settings.agenda.slot, 'Продължителност', { min: 5, max: 240, required: true });
  if (!Number.isInteger(minutes)) bad('Продължителността е цял брой минути.');
  const doctorId = str(src.doctorId, 'Лекар', { max: 60 });
  if (doctorId) {
    const d = store.doctor(doctorId);
    if (!d || d.active === false) bad('Лекарят не е намерен или е спрян.');
  }
  const patientId = str(src.patientId, 'Пациент', { max: 60 });
  const patient = patientId ? store.patient(patientId) || notFound('Досието не е намерено.') : null;
  const name = str(src.name, 'Име', { max: 120 }) || (patient ? patient.name : '');
  if (!name) bad('Изберете пациент или въведете име.');
  const status = src.status === undefined ? 'booked' : pick(src.status, APPT_STATUS, 'Състояние', true);
  const examType = src.examType ? pick(src.examType, EXAM_TYPES, 'Вид на прегледа') : '';
  return {
    date: when, time, minutes, doctorId, patientId: patient ? patient.id : '',
    name, phone: str(src.phone, 'Телефон', { max: 60 }) || (patient ? patient.phone || '' : ''),
    reason: str(src.reason, 'Повод', { max: 300 }),
    examType, status,
    note: str(src.note, 'Бележка', { max: 500 }),
  };
}

function appointmentsOf(store) {
  if (!Array.isArray(store.data.appointments)) store.data.appointments = [];
  return store.data.appointments;
}

function conflictCheck(store, candidate, force) {
  if (force === true || candidate.status === 'cancelled') return;
  const clash = overlapping(appointmentsOf(store), candidate);
  if (clash.length) {
    const c = clash[0];
    throw new HttpError(409, `Часът се застъпва с ${c.time} (${c.name}). Изберете друг час или запишете въпреки това.`);
  }
}

/** Часът с данните на пациента за показване. */
function apptView(store, a) {
  const p = a.patientId ? store.patient(a.patientId) : null;
  return {
    ...a,
    patient: p ? { id: p.id, name: p.name, birthDate: p.birthDate, phone: p.phone || '', egn: p.egn || '', archived: !!p.archived } : null,
  };
}

/* ------------------------------ за досието ------------------------------ */

/** Часовете, групирани по пациент (веднъж на заявка, а не за всеки пациент). */
function apptIndex(store) {
  const map = new Map();
  for (const a of appointmentsOf(store)) {
    if (!a.patientId) continue;
    if (!map.has(a.patientId)) map.set(a.patientId, []);
    map.get(a.patientId).push(a);
  }
  return map;
}

/** Картичка за списъка с пациенти в практиката за СИМП. */
export function simpPatientCard(store, p, opts, index = apptIndex(store)) {
  const asOf = opts.asOf || today();
  const s = simpSummary(p, store.settings, asOf, index.get(p.id) || []);
  const adult = isAdultPatient(p, asOf);
  const flags = adult && ((p.meds || []).length || (p.chronic || []).length) ? adultFlags(cachedAdultSummary(store, p, opts)) : null;
  const order = { overdue: 4, due: 3, soon: 2, ok: 1 };
  const follow = s.followups.filter(f => f.state.status !== 'ended')
    .sort((a, b) => (order[b.state.status] || 0) - (order[a.state.status] || 0))[0];
  const serious = s.alerts.filter(a => a.severity >= 2).length + (flags?.medSerious ? 1 : 0);
  return {
    id: p.id, name: p.name, egn: p.egn || '', sex: p.sex, birthDate: p.birthDate, phone: p.phone || '',
    doctorId: p.doctorId || '', archived: !!p.archived, allergies: p.allergies || [], conditions: p.conditions || [],
    ageGroup: adult ? 'adult' : 'child',
    chronic: activeConditions(p).map(c => c.code),
    adult: null,
    simp: {
      lastExam: s.lastExam ? { date: s.lastExam.date, type: s.lastExam.type, diagnosis: s.lastExam.diagnosis, icd: s.lastExam.icd } : null,
      nextAppt: s.nextAppt ? { date: s.nextAppt.date, time: s.nextAppt.time } : null,
      followup: follow ? { status: follow.state.status, due: follow.state.due, diagnosis: follow.diagnosis || follow.icd } : null,
      protocolsExpiring: s.protocols.filter(x => x.state.status === 'expiring').length,
      protocolsExpired: s.alerts.filter(a => a.kind === 'protocol' && a.severity >= 2).length,
      referralsOpen: s.referrals.filter(r => r.state.status === 'new' || r.state.status === 'secondary').length,
      exams: s.exams.length,
      medSerious: flags?.medSerious || 0,
    },
    counts: { overdue: serious, due: s.alerts.length - s.alerts.filter(a => a.severity >= 2).length, soon: 0, deferred: 0, done: 0, refused: 0, missed: 0 },
    coverage: null, coverageKind: null, growthConcerns: 0, developmentConcerns: 0, developmentDue: null,
    needsAttention: serious > 0,
    next: null,
    lastMeasurement: (p.measurements || []).length ? p.measurements.reduce((a, b) => (a.date > b.date ? a : b)).date : null,
    lastVisit: s.lastExam ? s.lastExam.date : null,
  };
}

/** Пълното досие в практиката за СИМП. */
export function simpPatientView(store, p, opts) {
  const asOf = opts.asOf || today();
  const adult = isAdultPatient(p, asOf);
  const adultData = adult ? cachedAdultSummary(store, p, opts) : null;
  const appts = appointmentsOf(store).filter(a => a.patientId === p.id);
  const growth = adult ? [] : analyseMeasurements(p, p.measurements || []);
  return {
    patient: p,
    kind: 'simp',
    isAdult: adult,
    adult: adultData,
    specialty: adultData ? specialtyView(store, p, adultData, asOf) : null,
    simp: simpSummary(p, store.settings, asOf, appts),
    appointments: appts.slice().sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1)).slice(0, 30),
    growth,
    concerns: adult ? [] : growthConcerns(p, growth),
    plan: [],
    summary: { counts: {}, coverage: null },
    ageMonths: ageInMonthsExact(p.birthDate, asOf),
  };
}

/* -------------------------------- пътища -------------------------------- */

export const simpRoutes = {

  /* ---- прегледи (амбулаторен лист) ---- */

  'POST /api/patients/:id/exams': (ctx) => {
    const { store, params, body, doctor } = ctx;
    simpOnly(store);
    const p = patientOr404(store, params.id);
    const exam = readExam(store, p, body);
    const warnings = examWarnings(store, p, exam);
    const vitals = readVitals(body.vitals, store, p, exam.date, doctor);
    let appt = null;
    if (body.appointmentId) {
      appt = appointmentsOf(store).find(a => a.id === body.appointmentId) || notFound('Записаният час не е намерен.');
      if (appt.patientId && appt.patientId !== p.id) bad('Записаният час е на друг пациент.');
    }
    const v = {
      id: store.nextId('v'), simp: true, ...exam,
      appointmentId: appt ? appt.id : '',
      doctorId: doctor ? doctor.id : '',
      recordedAt: new Date().toISOString(),
    };
    p.visits.push(v);
    if (vitals) p.measurements.push(vitals);
    if (appt) {
      Object.assign(appt, { status: 'done', patientId: p.id, examId: v.id, updatedAt: new Date().toISOString() });
    }
    touch(store, p);
    store.audit(doctor, 'exam_add', {
      patientId: p.id, name: p.name, date: v.date, type: v.type, icd: v.icd,
      ...(v.referralId ? { referral: p.referrals.find(r => r.id === v.referralId)?.number || v.referralId } : {}),
    });
    return { visit: v, warnings, measurement: vitals };
  },

  'PUT /api/patients/:id/exams/:vid': (ctx) => {
    const { store, params, body, doctor } = ctx;
    simpOnly(store);
    const p = patientOr404(store, params.id);
    const v = p.visits.find(x => x.id === params.vid && x.simp) || notFound('Прегледът не е намерен.');
    const exam = readExam(store, p, body);
    const warnings = examWarnings(store, p, exam, v.id);
    Object.assign(v, exam, { updatedAt: new Date().toISOString(), updatedBy: doctor ? doctor.id : '' });
    touch(store, p);
    store.audit(doctor, 'exam_update', { patientId: p.id, name: p.name, date: v.date, type: v.type, icd: v.icd });
    return { visit: v, warnings };
  },

  /* ---- направления ---- */

  'POST /api/patients/:id/referrals': (ctx) => {
    const { store, params, body, doctor } = ctx;
    simpOnly(store);
    const p = patientOr404(store, params.id);
    if (p.referrals.length >= 300) bad('Твърде много направления в едно досие.');
    const r = {
      id: store.nextId('rf'), ...readReferral(store, p, body), closed: false,
      doctorId: doctor ? doctor.id : '', createdAt: new Date().toISOString(),
    };
    p.referrals.push(r);
    // Насочващият лекар се запомня като личен лекар, ако още не е въведен.
    if (!p.gp?.name && r.fromName && body.fromIsGp !== false) {
      p.gp = { name: r.fromName, uin: r.fromUin, phone: '', practice: r.fromPractice };
    }
    touch(store, p);
    store.audit(doctor, 'referral_add', { patientId: p.id, name: p.name, number: r.number, purpose: REFERRAL_PURPOSES[r.purpose] });
    return { referral: r };
  },

  'PATCH /api/patients/:id/referrals/:rid': (ctx) => {
    const { store, params, body, doctor } = ctx;
    simpOnly(store);
    const p = patientOr404(store, params.id);
    const r = findIn(p.referrals, params.rid, 'Направлението');
    const onlyClose = Object.keys(body).every(k => k === 'closed');
    if (!onlyClose) Object.assign(r, readReferral(store, p, { ...r, ...body }, r));
    if (body.closed !== undefined) r.closed = body.closed === true;
    r.updatedAt = new Date().toISOString();
    touch(store, p);
    store.audit(doctor, 'referral_update', { patientId: p.id, name: p.name, number: r.number, closed: r.closed });
    return { referral: r };
  },

  'DELETE /api/patients/:id/referrals/:rid': (ctx) => {
    const { store, params, doctor } = ctx;
    simpOnly(store);
    const p = patientOr404(store, params.id);
    const r = findIn(p.referrals, params.rid, 'Направлението');
    if (p.visits.some(v => v.referralId === r.id)) {
      bad('По направлението има записани прегледи — отбележете го като затворено вместо да го изтривате.');
    }
    p.referrals = p.referrals.filter(x => x !== r);
    touch(store, p);
    store.audit(doctor, 'referral_delete', { patientId: p.id, name: p.name, number: r.number });
  },

  /* ---- протоколи за лекарства ---- */

  'POST /api/patients/:id/protocols': (ctx) => {
    const { store, params, body, doctor } = ctx;
    simpOnly(store);
    const p = patientOr404(store, params.id);
    if (p.protocols.length >= 200) bad('Твърде много протоколи в едно досие.');
    const renewed = body.renewedFrom ? findIn(p.protocols, String(body.renewedFrom), 'Протоколът') : null;
    const pr = {
      id: store.nextId('pr'), ...readProtocol(p, body), status: 'active',
      renewedFrom: renewed ? renewed.id : '',
      doctorId: doctor ? doctor.id : '', createdAt: new Date().toISOString(),
    };
    p.protocols.push(pr);
    if (renewed && renewed.status === 'active') renewed.status = 'renewed';
    touch(store, p);
    store.audit(doctor, renewed ? 'protocol_renew' : 'protocol_add', {
      patientId: p.id, name: p.name, number: pr.number, drugs: pr.drugs.join(', '), validUntil: pr.validUntil,
    });
    return { protocol: pr };
  },

  'PATCH /api/patients/:id/protocols/:prid': (ctx) => {
    const { store, params, body, doctor } = ctx;
    simpOnly(store);
    const p = patientOr404(store, params.id);
    const pr = findIn(p.protocols, params.prid, 'Протоколът');
    const onlyStatus = Object.keys(body).every(k => k === 'status');
    if (!onlyStatus) Object.assign(pr, readProtocol(p, { ...pr, ...body }));
    if (body.status !== undefined) {
      if (!['active', 'cancelled', 'renewed'].includes(body.status)) bad('Непознато състояние на протокола.');
      pr.status = body.status;
    }
    pr.updatedAt = new Date().toISOString();
    touch(store, p);
    store.audit(doctor, 'protocol_update', { patientId: p.id, name: p.name, number: pr.number, status: pr.status });
    return { protocol: pr };
  },

  'DELETE /api/patients/:id/protocols/:prid': (ctx) => {
    const { store, params, doctor } = ctx;
    simpOnly(store);
    const p = patientOr404(store, params.id);
    const pr = findIn(p.protocols, params.prid, 'Протоколът');
    p.protocols = p.protocols.filter(x => x !== pr);
    touch(store, p);
    store.audit(doctor, 'protocol_delete', { patientId: p.id, name: p.name, number: pr.number });
  },

  /* ---- диспансерно наблюдение при специалиста ---- */

  'POST /api/patients/:id/followups': (ctx) => {
    const { store, params, body, doctor } = ctx;
    simpOnly(store);
    const p = patientOr404(store, params.id);
    if (p.followups.filter(f => f.status !== 'ended').length >= 20) bad('Твърде много активни наблюдения.');
    const f = {
      id: store.nextId('fu'), ...readFollowup(p, body), status: 'active',
      doctorId: doctor ? doctor.id : '', createdAt: new Date().toISOString(),
    };
    p.followups.push(f);
    touch(store, p);
    store.audit(doctor, 'followup_add', { patientId: p.id, name: p.name, diagnosis: f.diagnosis || f.icd, everyMonths: f.everyMonths });
    return { followup: f };
  },

  'PATCH /api/patients/:id/followups/:fid': (ctx) => {
    const { store, params, body, doctor } = ctx;
    simpOnly(store);
    const p = patientOr404(store, params.id);
    const f = findIn(p.followups, params.fid, 'Наблюдението');
    const next = readFollowup(p, body, f);
    if (body.status !== undefined) {
      if (!['active', 'ended'].includes(body.status)) bad('Непознато състояние на наблюдението.');
      next.status = body.status;
      next.ended = body.status === 'ended' ? date(body.ended || today(), 'Дата на прекратяване', { required: true }) : '';
      next.endReason = body.status === 'ended' ? str(body.endReason, 'Причина', { max: 200 }) : '';
    }
    Object.assign(f, next, { updatedAt: new Date().toISOString() });
    touch(store, p);
    store.audit(doctor, 'followup_update', { patientId: p.id, name: p.name, diagnosis: f.diagnosis || f.icd, status: f.status });
    return { followup: f };
  },

  'DELETE /api/patients/:id/followups/:fid': (ctx) => {
    const { store, params, doctor } = ctx;
    simpOnly(store);
    const p = patientOr404(store, params.id);
    const f = findIn(p.followups, params.fid, 'Наблюдението');
    p.followups = p.followups.filter(x => x !== f);
    touch(store, p);
    store.audit(doctor, 'followup_delete', { patientId: p.id, name: p.name, diagnosis: f.diagnosis || f.icd });
  },

  /* ---- график с часове ---- */

  'GET /api/appointments': (ctx) => {
    const { store, query } = ctx;
    simpOnly(store);
    const from = query.from && isValidISO(query.from) ? query.from : today();
    const to = query.to && isValidISO(query.to) ? query.to : from;
    if (to < from) bad('Крайната дата е преди началната.');
    if (daysBetween(from, to) > MAX_RANGE_DAYS) bad(`Периодът е до ${MAX_RANGE_DAYS} дни.`);
    const list = appointmentsOf(store)
      .filter(a => a.date >= from && a.date <= to)
      .filter(a => !query.doctor || (a.doctorId || '') === query.doctor || (query.doctor === 'none' && !a.doctorId))
      .filter(a => !query.patient || a.patientId === query.patient)
      .sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1))
      .map(a => apptView(store, a));
    return { from, to, agenda: store.settings.agenda, appointments: list };
  },

  'POST /api/appointments': (ctx) => {
    const { store, body, doctor } = ctx;
    simpOnly(store);
    if (appointmentsOf(store).length >= 50000) bad('Графикът е препълнен — архивирайте старите часове.');
    const a = {
      id: store.nextId('ap'), ...readAppointment(store, body),
      examId: '', createdBy: doctor ? doctor.id : '', createdAt: new Date().toISOString(),
    };
    conflictCheck(store, a, body.force);
    appointmentsOf(store).push(a);
    store.persist();
    store.audit(doctor, 'appointment_add', { appointmentId: a.id, date: a.date, time: a.time, name: a.name, ...(a.patientId ? { patientId: a.patientId } : {}) });
    return { appointment: apptView(store, a) };
  },

  'PATCH /api/appointments/:aid': (ctx) => {
    const { store, params, body, doctor } = ctx;
    simpOnly(store);
    const a = appointmentsOf(store).find(x => x.id === params.aid) || notFound('Записаният час не е намерен.');
    const next = readAppointment(store, body, a);
    const moved = next.date !== a.date || next.time !== a.time || next.minutes !== a.minutes || next.doctorId !== a.doctorId
      || (a.status === 'cancelled' && next.status !== 'cancelled');
    if (moved) conflictCheck(store, { ...a, ...next }, body.force);
    const before = a.status;
    Object.assign(a, next, { updatedAt: new Date().toISOString() });
    store.persist();
    store.audit(doctor, 'appointment_update', {
      appointmentId: a.id, date: a.date, time: a.time, name: a.name,
      ...(before !== a.status ? { status: APPT_STATUS[a.status] } : {}),
    });
    return { appointment: apptView(store, a) };
  },

  'DELETE /api/appointments/:aid': (ctx) => {
    const { store, params, doctor } = ctx;
    simpOnly(store);
    const list = appointmentsOf(store);
    const a = list.find(x => x.id === params.aid) || notFound('Записаният час не е намерен.');
    store.data.appointments = list.filter(x => x !== a);
    store.persist();
    store.audit(doctor, 'appointment_delete', { appointmentId: a.id, date: a.date, time: a.time, name: a.name });
  },

  /* ---- табло ---- */

  'GET /api/simp/overview': (ctx) => {
    const { store, query } = ctx;
    simpOnly(store);
    const asOf = query.asOf && isValidISO(query.asOf) ? query.asOf : today();
    const horizon = Math.min(365, Math.max(1, Number(query.horizon) || store.settings.horizonDays || 30));
    const mineOnly = (a) => !query.doctor || a.doctorId === query.doctor;
    const appts = appointmentsOf(store);
    const todays = appts.filter(a => a.date === asOf && mineOnly(a))
      .sort((a, b) => (a.time < b.time ? -1 : 1)).map(a => apptView(store, a));
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(asOf, i);
      week.push({ date: d, count: appts.filter(a => a.date === d && a.status !== 'cancelled' && mineOnly(a)).length });
    }

    const index = apptIndex(store);
    const followups = [];
    const protocols = [];
    const referrals = [];
    const nodules = [];
    let broken = 0;
    for (const p of store.patients) {
      if (p.archived) continue;
      if (query.doctor && p.doctorId && p.doctorId !== query.doctor) continue;
      try {
        const mine = index.get(p.id) || [];
        const booked = mine.find(a => a.date >= asOf && (a.status === 'booked' || a.status === 'arrived'));
        const who = { patientId: p.id, name: p.name, phone: p.phone || '', birthDate: p.birthDate, booked: booked ? { date: booked.date, time: booked.time } : null };
        for (const f of p.followups || []) {
          const st = followupState(f, p.visits, asOf, horizon);
          if (['overdue', 'due', 'soon'].includes(st.status)) {
            followups.push({ ...who, id: f.id, diagnosis: f.diagnosis || f.icd, icd: f.icd, everyMonths: f.everyMonths, ...st });
          }
        }
        const prs = p.protocols || [];
        for (const pr of prs) {
          const st = protocolState(pr, asOf, store.settings.protocolWarnDays);
          if (st.status === 'expiring' || (st.status === 'expired' && daysBetween(pr.validUntil, asOf) <= 90
            && !prs.some(o => o.renewedFrom === pr.id))) {
            protocols.push({ ...who, id: pr.id, number: pr.number, drugs: pr.drugs, validUntil: pr.validUntil, ...st });
          }
        }
        for (const r of p.referrals || []) {
          const st = referralState(r, p.visits, asOf, store.settings.secondaryDays);
          if (st.status === 'secondary' || (st.status === 'new' && st.waiting <= 60)) {
            referrals.push({ ...who, id: r.id, number: r.number, purpose: REFERRAL_PURPOSES[r.purpose], issued: r.issued, fromName: r.fromName, ...st });
          }
        }
        if (store.settings.modules?.endo && (p.nodules || []).length && isAdultPatient(p, asOf)) {
          for (const n of p.nodules) {
            const r = noduleAssessment(n, asOf);
            if (r.action !== 'follow' || !r.next || r.next > addDays(asOf, horizon)) continue;
            nodules.push({ ...who, id: n.id, lobe: LOBES[n.lobe] || '', due: r.next, category: r.catLabel, status: r.next < asOf ? 'overdue' : 'soon' });
          }
        }
      } catch (err) {
        broken++;
        console.error(`[СИМП] досие ${p.id}:`, err.message);
      }
    }
    const byDue = (a, b) => ((a.due || a.validUntil || '') < (b.due || b.validUntil || '') ? -1 : 1);
    const monthStart = asOf.slice(0, 8) + '01';
    let examsMonth = 0;
    let examsToday = 0;
    for (const p of store.patients) {
      for (const v of p.visits || []) {
        if (!v.simp || (query.doctor && v.doctorId !== query.doctor)) continue;
        if (v.date >= monthStart && v.date <= asOf) examsMonth++;
        if (v.date === asOf) examsToday++;
      }
    }
    return {
      asOf, horizon, broken,
      today: todays,
      week,
      counts: {
        patients: store.patients.filter(p => !p.archived).length,
        today: todays.filter(a => a.status !== 'cancelled').length,
        arrived: todays.filter(a => a.status === 'arrived').length,
        done: todays.filter(a => a.status === 'done').length,
        noshow: todays.filter(a => a.status === 'noshow').length,
        examsToday, examsMonth,
      },
      followups: followups.sort(byDue),
      protocols: protocols.sort(byDue),
      referrals: referrals.sort((a, b) => (a.status === b.status ? byDue(a, b) : a.status === 'secondary' ? -1 : 1)),
      nodules: nodules.sort(byDue),
    };
  },

  /* ---- справки за дейността ---- */

  'GET /api/simp/reports': (ctx) => {
    const { store, query } = ctx;
    simpOnly(store);
    const asOf = today();
    const to = query.to && isValidISO(query.to) ? query.to : asOf;
    const from = query.from && isValidISO(query.from) ? query.from : to.slice(0, 8) + '01';
    if (to < from) bad('Крайната дата е преди началната.');
    if (daysBetween(from, to) > 3 * 366) bad('Периодът е до 3 години.');
    const inRange = (d) => d >= from && d <= to;
    const byType = new Map(Object.keys(EXAM_TYPES).map(k => [k, 0]));
    const byDoctor = new Map();
    const byMonth = new Map();
    const dx = new Map();
    const referrers = new Map();
    const rows = [];
    let total = 0;
    let withReferral = 0;
    let newPatients = 0;
    const seen = new Set();

    for (const p of store.patients) {
      const exams = examsOf(p).filter(v => !query.doctor || v.doctorId === query.doctor);
      if (!exams.length) continue;
      const first = exams[exams.length - 1];
      if (inRange(first.date)) newPatients++;
      for (const v of exams) {
        if (!inRange(v.date)) continue;
        total++;
        seen.add(p.id);
        byType.set(v.examType, (byType.get(v.examType) || 0) + 1);
        byDoctor.set(v.doctorId || '', (byDoctor.get(v.doctorId || '') || 0) + 1);
        const month = v.date.slice(0, 7);
        byMonth.set(month, (byMonth.get(month) || 0) + 1);
        const key = v.icd || v.diagnosis;
        if (key) {
          const row = dx.get(key) || { icd: v.icd || '', text: v.diagnosis || '', count: 0 };
          row.count++;
          if (!row.text && v.diagnosis) row.text = v.diagnosis;
          dx.set(key, row);
        }
        const ref = v.referralId ? (p.referrals || []).find(r => r.id === v.referralId) : null;
        if (ref) {
          withReferral++;
          const rk = ref.fromUin || ref.fromName || '—';
          const row = referrers.get(rk) || { name: ref.fromName || '(без име)', uin: ref.fromUin || '', count: 0 };
          row.count++;
          referrers.set(rk, row);
        }
        if (rows.length < 20000) {
          rows.push({
            date: v.date, time: v.time || '', patient: p.name, egn: p.egn || '', type: v.type, icd: v.icd || '',
            diagnosis: v.diagnosis || '', referral: ref ? ref.number || '' : '', purpose: ref ? REFERRAL_PURPOSES[ref.purpose] : '',
            referrer: ref ? ref.fromName || '' : '', doctor: store.doctor(v.doctorId)?.name || '',
          });
        }
      }
    }
    const appts = appointmentsOf(store).filter(a => inRange(a.date) && (!query.doctor || a.doctorId === query.doctor) && a.date <= asOf);
    const noshow = appts.filter(a => a.status === 'noshow').length;
    const kept = appts.filter(a => a.status === 'done' || a.status === 'arrived').length;
    let followActive = 0;
    let followOverdue = 0;
    let protoActive = 0;
    let protoExpiring = 0;
    for (const p of store.patients) {
      if (p.archived) continue;
      for (const f of p.followups || []) {
        const st = followupState(f, p.visits, asOf);
        if (st.status === 'ended') continue;
        followActive++;
        if (st.status === 'overdue') followOverdue++;
      }
      for (const pr of p.protocols || []) {
        const st = protocolState(pr, asOf, store.settings.protocolWarnDays);
        if (st.status === 'active' || st.status === 'expiring') protoActive++;
        if (st.status === 'expiring') protoExpiring++;
      }
    }
    rows.sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
    return {
      from, to,
      exams: {
        total, patients: seen.size, newPatients, withReferral, withoutReferral: total - withReferral,
        byType: [...byType.entries()].filter(([, n]) => n).map(([type, count]) => ({ type, label: EXAM_TYPES[type].label, count })),
        byDoctor: [...byDoctor.entries()].map(([id, count]) => ({ id, name: store.doctor(id)?.name || '(без лекар)', count }))
          .sort((a, b) => b.count - a.count),
        byMonth: [...byMonth.entries()].sort().map(([month, count]) => ({ month, count })),
      },
      diagnoses: [...dx.values()].sort((a, b) => b.count - a.count).slice(0, 20),
      referrers: [...referrers.values()].sort((a, b) => b.count - a.count).slice(0, 20),
      appointments: {
        total: appts.filter(a => a.status !== 'cancelled').length, kept, noshow,
        cancelled: appts.filter(a => a.status === 'cancelled').length,
        noshowPct: kept + noshow ? Math.round((noshow / (kept + noshow)) * 100) : null,
      },
      followups: { active: followActive, overdue: followOverdue },
      protocols: { active: protoActive, expiring: protoExpiring },
      rows,
    };
  },
};

export { FOLLOW_INTERVALS };
