/* Изчисляване на дължимите дейности за дете.
 *
 * Логиката е обща за сървъра и браузъра, за да няма разминаване между
 * това, което показва таблото, и това, което се вижда в досието. */

import { addDays, addMonths, daysBetween, today, DAYS_PER_MONTH } from './dates.js';

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
function expiryFor(item, schedule, birthDate) {
  if (item.group === 'vaccine') return null;
  if (Number.isFinite(item.expireMonths)) {
    return dueDateFor(birthDate, item.dueMonths + item.expireMonths);
  }
  if (item.group !== 'checkup') return null;

  let next = null;
  for (const other of schedule) {
    if (other.group !== 'checkup' || other.disabled) continue;
    if (other.dueMonths <= item.dueMonths) continue;
    if (next === null || other.dueMonths < next) next = other.dueMonths;
  }
  return next === null
    ? dueDateFor(birthDate, item.dueMonths + 12)
    : dueDateFor(birthDate, next);
}

/** Дата, на която дейността се пада, спрямо рождената дата. */
export function dueDateFor(birthDate, months) {
  return Number.isInteger(months)
    ? addMonths(birthDate, months)
    : addDays(birthDate, Math.round(months * DAYS_PER_MONTH));
}

/**
 * Изчислява плана на едно дете.
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
  for (const item of schedule) {
    if (item.optIn && !optIn.has(item.id)) continue;

    const rec = records[item.id] || null;
    let due = dueDateFor(patient.birthDate, item.dueMonths);

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

  // Обхват на задължителните имунизации, дължими до момента.
  const asOf = opts.asOf || today();
  let dueSoFar = 0, doneSoFar = 0;
  for (const e of plan) {
    if (e.group !== 'vaccine' || !e.item.mandatory) continue;
    if (e.due > asOf) continue;
    dueSoFar++;
    if (e.status === 'done') doneSoFar++;
  }

  return {
    counts,
    next,
    plan,
    coverage: dueSoFar ? Math.round((doneSoFar / dueSoFar) * 100) : null,
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
