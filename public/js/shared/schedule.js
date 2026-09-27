/* Изчисляване на дължимите дейности — за деца и за възрастни.
 *
 * Логиката е обща за сървъра и браузъра, за да няма разминаване между
 * това, което показва таблото, и това, което се вижда в досието.
 *
 * Детският календар важи за пациентите, които са регистрирани като деца
 * (или изрично отбелязани). Календарът за възрастни важи от 18 г. за всички.
 * Повтарящите се дейности за възрастни (ежегоден преглед, Td на 10 години,
 * скрининги) и сезонните ваксини се „разгръщат“ за всеки пациент в
 * отделни повторения със собствен код: базов-код@месеци или базов-код@година. */

import { addDays, addMonths, ageInMonthsExact, daysBetween, today, DAYS_PER_MONTH } from './dates.js';
import { vaccineRiskSince } from './chronic.js';

export const ADULT_MONTHS = 216;

const isAdultItem = (item) => item.track === 'adult';

/** Датата на регистриране в практиката. */
export const registeredOn = (p) => (p.createdAt || '').slice(0, 10) || today();

/** Прилага ли се детският календар — по подразбиране, ако е регистриран като дете. */
export function pediatricTracked(p) {
  if (typeof p.pediatric === 'boolean') return p.pediatric;
  if (!p.birthDate) return true;
  return ageInMonthsExact(p.birthDate, registeredOn(p)) < ADULT_MONTHS;
}

export const isAdultPatient = (p, asOf = today()) =>
  !!p.birthDate && ageInMonthsExact(p.birthDate, asOf) >= ADULT_MONTHS;

/** Статуси, подредени по спешност — по-малкото число излиза по-нагоре. */
export const STATUS_ORDER = {
  overdue: 0,        // просрочено
  deferral_ended: 1, // отводът е изтекъл и дейността отново е дължима
  due: 2,            // дължимо сега (в допустимия прозорец)
  soon: 3,           // предстои в избрания хоризонт
  deferred: 4,       // активен медицински отвод
  future: 5,         // предстои по-нататък
  done: 6,           // изпълнено
  refused: 7,        // отказ от родител
  missed: 8,         // пропуснато и вече неприложимо — остава само в досието
  skipped: 9,        // не подлежи
};

export const STATUS_LABELS = {
  overdue: 'просрочено',
  deferral_ended: 'изтекъл отвод',
  due: 'дължимо сега',
  soon: 'предстои',
  deferred: 'отвод',
  future: 'по-нататък',
  done: 'изпълнено',
  refused: 'отказ',
  missed: 'пропуснато',
  skipped: 'не подлежи',
};

/** Статусите, които изискват действие от лекаря. */
export const ACTIONABLE = new Set(['overdue', 'deferral_ended', 'due']);

/* Кога една неизпълнена дейност престава да бъде задача:
 *
 * Имунизациите не изтичат — наваксваща имунизация е възможна и дължима на
 * всяка възраст, затова непоставена ваксина остава просрочена.
 *
 * Профилактичният преглед обаче е привързан към възрастов период. Пропуснат
 * преглед на 3 месеца не може да се извърши на 5 години — на негово място
 * вече е дошъл следващият. Затова прегледът изтича, когато настъпи срокът
 * на следващия по ред, и се отбелязва като пропуснат: остава видим в
 * досието, но не задръства ежедневния списък със задачи.
 *
 * Скринингите изтичат само ако изрично е зададен срок (expireMonths). */
/* Кога изтича всеки детски профилактичен преглед — индексът се изчислява
 * веднъж за календар, а не за всеки пациент (важно при хиляди досиета). */
const nextCheckupCache = new WeakMap();
function nextCheckupIndex(schedule) {
  let index = nextCheckupCache.get(schedule);
  if (index) return index;
  const months = [...new Set(schedule
    .filter(i => i.group === 'checkup' && !i.disabled && !isAdultItem(i))
    .map(i => i.dueMonths))].sort((a, b) => a - b);
  index = new Map(months.map((m, i) => [m, i + 1 < months.length ? months[i + 1] : null]));
  nextCheckupCache.set(schedule, index);
  return index;
}

function expiryFor(item, schedule, birthDate) {
  if (item.expiresOn) return item.expiresOn;
  if (item.group === 'vaccine') return null;
  if (Number.isFinite(item.expireMonths)) {
    return dueDateFor(birthDate, item.dueMonths + item.expireMonths);
  }
  if (item.group !== 'checkup' || isAdultItem(item)) return null;
  const next = nextCheckupIndex(schedule).get(item.dueMonths);
  return next === null || next === undefined
    ? dueDateFor(birthDate, item.dueMonths + 12)
    : dueDateFor(birthDate, next);
}

/** Дата, на която дейността се пада, спрямо рождената дата. */
export function dueDateFor(birthDate, months) {
  return Number.isInteger(months)
    ? addMonths(birthDate, months)
    : addDays(birthDate, Math.round(months * DAYS_PER_MONTH));
}

const yearsLabel = (m) => `${Math.floor(m / 12)} г.`;
const pad = (n) => String(n).padStart(2, '0');

/**
 * Разгръща календара за конкретен пациент: кои дейности се прилагат и
 * конкретните повторения на повтарящите се и сезонните.
 */
export function expandSchedule(patient, schedule, asOf = today()) {
  const out = [];
  const peds = pediatricTracked(patient);
  const reg = registeredOn(patient);
  const records = patient.records || {};
  const birth = patient.birthDate;
  const riskSince = vaccineRiskSince(patient);
  const threeYearsAgo = addMonths(asOf, -36);
  // Без запис се показват повторенията, изтекли след тази дата (и не по-рано от 3 години).
  const showFrom = reg > threeYearsAgo ? reg : threeYearsAgo;
  const ageAtShowFrom = birth ? ageInMonthsExact(birth, showFrom) : 0;
  const ageNow = birth ? ageInMonthsExact(birth, asOf) : 0;
  // Повторенията със записи — за да останат в историята, колкото и стари да са.
  const recordedOcc = new Map();
  for (const key of Object.keys(records)) {
    const at = key.indexOf('@');
    if (at < 0) continue;
    const base = key.slice(0, at);
    if (!recordedOcc.has(base)) recordedOcc.set(base, []);
    recordedOcc.get(base).push(Number(key.slice(at + 1)));
  }
  // Дейност, чийто срок е преди регистрацията, е наваксване — срокът започва от регистрацията.
  const catchUp = (due, id) => (due < reg && !records[id] ? reg : due);

  for (const item of schedule) {
    if (item.disabled) continue;
    if (!isAdultItem(item)) {
      if (peds) out.push(item);
      continue;
    }
    if (item.sex && patient.sex && item.sex !== patient.sex) continue;

    if (item.recur) {
      const { fromMonths, toMonths, everyMonths } = item.recur;
      // Обхождат се само нужните повторения: от изтичащите след showFrom до първото бъдещо.
      const first = Math.max(0, Math.floor((ageAtShowFrom - fromMonths) / everyMonths) - 1);
      const last = Math.max(0, Math.floor((ageNow - fromMonths) / everyMonths) + 1);
      const months = new Set();
      for (let k = first; k <= last; k++) months.add(fromMonths + k * everyMonths);
      for (const m of recordedOcc.get(item.id) || []) months.add(m);
      let futureAdded = false;
      for (const m of [...months].sort((a, b) => a - b)) {
        if (m < fromMonths || m > toMonths || (m - fromMonths) % everyMonths !== 0) continue;
        const id = `${item.id}@${m}`;
        const rec = records[id];
        const expires = dueDateFor(birth, m + everyMonths);
        let due = dueDateFor(birth, m);
        if (due > asOf) {
          if (futureAdded && !rec) continue;
          futureAdded = true;
        } else if (!rec) {
          // Изтекли преди регистрацията или отдавна пропуснати — не се показват.
          if (expires <= showFrom) continue;
        }
        due = catchUp(due, id);
        out.push({
          ...item, id, baseId: item.id, occurrence: m, dueDate: due, expiresOn: expires,
          dueMonths: m, name: `${item.name} — ${yearsLabel(m)}`, short: `${item.short} ${yearsLabel(m)}`,
        });
      }
      continue;
    }

    if (item.seasonal) {
      const { month, day, validMonths } = item.seasonal;
      const regYear = Number(reg.slice(0, 4));
      const nowYear = Number(asOf.slice(0, 4));
      let futureAdded = false;
      for (let y = Math.min(regYear, nowYear) - 1; y <= nowYear + 1; y++) {
        const due = `${y}-${pad(month)}-${pad(day)}`;
        const expires = addMonths(due, validMonths);
        const age = ageInMonthsExact(birth, due);
        const byAge = age >= (item.fromMonths ?? 0);
        const byRisk = !!riskSince && item.riskFromMonths !== undefined
          && age >= item.riskFromMonths && riskSince <= expires;
        if (!byAge && !byRisk) continue;
        const id = `${item.id}@${y}`;
        const rec = records[id];
        if (!rec) {
          if (expires <= reg || expires <= asOf) continue;
          if (due > asOf && futureAdded) continue;
        }
        if (due > asOf) futureAdded = true;
        out.push({
          ...item, id, baseId: item.id, occurrence: y, dueDate: catchUp(due, id), expiresOn: expires,
          name: `${item.name} — сезон ${y}/${String(y + 1).slice(2)}`, short: `${item.short} ${y}/${String(y + 1).slice(2)}`,
        });
      }
      continue;
    }

    // Еднократна дейност за възрастни — по-рано при заболяване с повишен риск.
    let due = dueDateFor(birth, item.dueMonths);
    if (item.riskFromMonths !== undefined && riskSince) {
      const riskDue = [dueDateFor(birth, item.riskFromMonths), riskSince].sort().pop();
      if (riskDue < due) due = riskDue;
    }
    out.push({ ...item, dueDate: catchUp(due, item.id) });
  }
  return out;
}

/** Намира дейност от календара по код, включително повторение (код@месеци, код@година). */
export function findScheduleItem(schedule, id) {
  const [baseId, occ] = String(id || '').split('@');
  const base = schedule.find(i => i.id === baseId);
  if (!base) return null;
  if (occ === undefined) return base.recur || base.seasonal ? null : { item: base, base };
  const n = Number(occ);
  if (!Number.isInteger(n)) return null;
  if (base.recur) {
    const { fromMonths, toMonths, everyMonths } = base.recur;
    if (n < fromMonths || n > toMonths || (n - fromMonths) % everyMonths !== 0) return null;
    return { item: { ...base, id, name: `${base.name} — ${yearsLabel(n)}` }, base };
  }
  if (base.seasonal) {
    if (n < 2000 || n > 2100) return null;
    return { item: { ...base, id, name: `${base.name} — сезон ${n}/${String(n + 1).slice(2)}` }, base };
  }
  return null;
}

/**
 * Изчислява плана на един пациент.
 * @param {object} patient  досието (birthDate, records, optIn)
 * @param {Array}  schedule календарът (виж calendar.js)
 * @param {object} opts     { asOf, horizonDays }
 * @returns {Array} елементи с изчислен статус, подредени по дата
 */
export function computePlan(patient, schedule, opts = {}) {
  const asOf = opts.asOf || today();
  const horizonDays = opts.horizonDays ?? 30;
  const records = patient.records || {};
  const optIn = new Set(patient.optIn || []);

  // Дозите, вече поставени по серии — нужни за минималните интервали.
  const doneBySeries = new Map();
  for (const item of schedule) {
    const rec = records[item.id];
    if (item.series && rec && rec.status === 'done' && rec.date) {
      if (!doneBySeries.has(item.series)) doneBySeries.set(item.series, []);
      doneBySeries.get(item.series).push({ doseNo: item.doseNo || 0, date: rec.date });
    }
  }

  const plan = [];
  for (const item of expandSchedule(patient, schedule, asOf)) {
    if (item.optIn && !optIn.has(item.id)) continue;

    const rec = records[item.id] || null;
    let due = item.dueDate || dueDateFor(patient.birthDate, item.dueMonths);

    // Ако предходен прием от серията е закъснял, следващият се измества напред.
    if (item.series && item.minIntervalM) {
      for (const prev of doneBySeries.get(item.series) || []) {
        if (prev.doseNo < (item.doseNo || 0)) {
          const earliest = dueDateFor(prev.date, item.minIntervalM);
          if (earliest > due) due = earliest;
        }
      }
    }

    const entry = {
      id: item.id,
      item,
      group: item.group,
      name: item.name,
      short: item.short || item.name,
      note: item.note || '',
      due,
      record: rec,
      status: 'future',
      daysDiff: daysBetween(asOf, due),
    };

    if (rec && rec.status === 'done') {
      entry.status = 'done';
      entry.doneDate = rec.date;
    } else if (rec && rec.status === 'refused') {
      entry.status = 'refused';
    } else if (rec && rec.status === 'skipped') {
      entry.status = 'skipped';
    } else if (rec && rec.status === 'deferred') {
      if (rec.deferUntil && rec.deferUntil > asOf) {
        entry.status = 'deferred';
        entry.actionDate = rec.deferUntil;
      } else {
        entry.status = 'deferral_ended';
        entry.actionDate = rec.deferUntil || due;
      }
    } else if (due > asOf) {
      entry.status = daysBetween(asOf, due) <= horizonDays ? 'soon' : 'future';
    } else {
      const graceEnd = dueDateFor(due, item.graceMonths ?? 1);
      const expiry = expiryFor(item, schedule, patient.birthDate);
      if (expiry && asOf > expiry) {
        entry.status = 'missed';
        entry.expiredOn = expiry;
      } else {
        entry.status = asOf <= graceEnd ? 'due' : 'overdue';
      }
      entry.overdueDays = daysBetween(due, asOf);
    }

    // Датата, по която елементът се подрежда в списъците със задачи.
    entry.actionDate = entry.actionDate || due;
    plan.push(entry);
  }

  plan.sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    return a.actionDate < b.actionDate ? -1 : a.actionDate > b.actionDate ? 1 : 0;
  });
  return plan;
}

/** Обобщение за списъка с пациенти и за таблото. */
export function summarize(patient, schedule, opts = {}) {
  const plan = computePlan(patient, schedule, opts);
  const counts = { overdue: 0, due: 0, soon: 0, deferred: 0, done: 0, refused: 0, missed: 0 };
  let next = null;

  for (const e of plan) {
    if (e.status === 'overdue') counts.overdue++;
    else if (e.status === 'due' || e.status === 'deferral_ended') counts.due++;
    else if (e.status === 'soon') counts.soon++;
    else if (e.status === 'deferred') counts.deferred++;
    else if (e.status === 'done') counts.done++;
    else if (e.status === 'refused') counts.refused++;
    else if (e.status === 'missed') counts.missed++;
    if (!next && ACTIONABLE.has(e.status)) next = e;
  }
  if (!next) next = plan.find(e => e.status === 'soon') || plan.find(e => e.status === 'future') || null;

  // Обхват: при деца — задължителните имунизации, дължими до момента; при
  // възрастни — текущите задължителни профилактични дейности (преглед,
  // скрининги, Td), без изтеклите.
  const asOf = opts.asOf || today();
  const adult = isAdultPatient(patient, asOf);
  let dueSoFar = 0, doneSoFar = 0;
  for (const e of plan) {
    if (!e.item.mandatory || e.due > asOf) continue;
    if (adult) {
      if (!isAdultItem(e.item) || e.status === 'missed' || e.status === 'skipped') continue;
    } else if (e.group !== 'vaccine') continue;
    dueSoFar++;
    if (e.status === 'done') doneSoFar++;
  }

  return {
    counts,
    next,
    plan,
    coverage: dueSoFar ? Math.round((doneSoFar / dueSoFar) * 100) : null,
    coverageKind: adult ? 'prevention' : 'vaccines',
    coverageDone: doneSoFar,
    coverageDue: dueSoFar,
    needsAttention: counts.overdue > 0 || counts.due > 0,
  };
}

/** Всички дължими задачи на практиката, сплескани в един списък за таблото. */
export function practiceTasks(patients, schedule, opts = {}) {
  const asOf = opts.asOf || today();
  const horizonDays = opts.horizonDays ?? 30;
  const out = [];
  for (const p of patients) {
    if (p.archived) continue;
    if (opts.doctorId && p.doctorId !== opts.doctorId) continue;
    const plan = computePlan(p, schedule, { asOf, horizonDays });
    for (const e of plan) {
      if (e.status === 'done' || e.status === 'refused' || e.status === 'skipped'
        || e.status === 'future' || e.status === 'missed') continue;
      if (e.status === 'deferred' && !opts.includeDeferred) continue;
      out.push({
        patientId: p.id,
        patientName: p.name,
        patientPhone: p.phone || (p.contacts && p.contacts[0] && p.contacts[0].phone) || '',
        birthDate: p.birthDate,
        doctorId: p.doctorId || '',
        itemId: e.id,
        name: e.name,
        short: e.short,
        group: e.group,
        status: e.status,
        due: e.due,
        actionDate: e.actionDate,
        overdueDays: e.overdueDays || 0,
      });
    }
  }
  out.sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    return a.actionDate < b.actionDate ? -1 : a.actionDate > b.actionDate ? 1 : 0;
  });
  return out;
}
