/* Специализирана извънболнична помощ (СИМП): направления, прегледи,
 * протоколи за лекарства, диспансерно наблюдение при специалиста и график
 * с часове. Общо за сървъра и за интерфейса. */

import { table } from './table.js';
import { addDays, addMonths, daysBetween, formatDate } from './dates.js';

/* --------------------------------- прегледи --------------------------------- */

/** Видовете прегледи при специалист. `referral` — нужно ли е направление по НЗОК. */
export const EXAM_TYPES = table({
  primary: { label: 'Първичен преглед', referral: true },
  secondary: { label: 'Вторичен преглед', referral: true },
  dispensary: { label: 'Диспансерен преглед', referral: true },
  hsa: { label: 'Високоспециализирана дейност', referral: true },
  prophylactic: { label: 'Профилактичен преглед', referral: false },
  paid: { label: 'Платен преглед', referral: false },
  other: { label: 'Друго', referral: false },
});

/** Прегледите на практиката на СИМП (записите в „Прегледи“ с отбелязан вид). */
export const examsOf = (p) => (p.visits || []).filter(v => v.simp && EXAM_TYPES[v.examType])
  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.recordedAt || '') < (b.recordedAt || '') ? 1 : -1));

/* ------------------------------- направления ------------------------------- */

export const REFERRAL_PURPOSES = table({
  consult: 'Консултация',
  joint: 'Съвместно лечение',
  dispensary: 'Диспансерно наблюдение',
  hsa: 'Високоспециализирана дейност',
  expert: 'Експертиза (ЛКК/ТЕЛК)',
  other: 'Друго',
});

/** Номерът на направлението: електронното (НРН) е от 12 знака — цифри и латински букви;
 * приемат се и по-кратки номера на хартиени направления. */
export const REFERRAL_NUMBER = /^[0-9A-Z]{3,20}$/;

/**
 * Докъде е стигнало направлението: очаква преглед, отворен срок за вторичен
 * преглед, изпълнено или затворено ръчно.
 * @param {number} secondaryDays  срокът за вторичен преглед след първичния (по НРД — 30 дни)
 */
export function referralState(ref, visits, asOf, secondaryDays = 30) {
  const exams = (visits || []).filter(v => v.simp && v.referralId === ref.id)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const primary = exams.find(v => v.examType !== 'secondary') || null;
  const secondary = exams.find(v => v.examType === 'secondary') || null;
  const base = { exams: exams.length, primary: primary ? primary.date : null, secondary: secondary ? secondary.date : null };
  if (ref.closed) return { ...base, status: 'closed', label: 'Затворено' };
  if (!exams.length) {
    return { ...base, status: 'new', label: 'Очаква преглед', waiting: daysBetween(ref.issued || asOf, asOf) };
  }
  if (secondary || !primary) return { ...base, status: 'done', label: 'Изпълнено' };
  const until = addDays(primary.date, secondaryDays);
  if (until < asOf) return { ...base, status: 'done', label: 'Изпълнено', secondaryUntil: until };
  return {
    ...base, status: 'secondary', label: 'Срок за вторичен преглед',
    secondaryUntil: until, daysLeft: daysBetween(asOf, until),
  };
}

/* ------------------------- диспансерно наблюдение ------------------------- */

export const FOLLOW_INTERVALS = [1, 2, 3, 4, 6, 12];

/**
 * Следващ диспансерен преглед при специалиста: от последния преглед в
 * практиката (или от началото на наблюдението) плюс интервала.
 * Състояние: 'ok' (далече), 'soon' (в хоризонта), 'due' (до месец след срока),
 * 'overdue' (повече от месец след срока), 'ended' (прекратено).
 */
export function followupState(f, visits, asOf, horizonDays = 30) {
  if (f.status === 'ended') return { status: 'ended', due: null, last: null };
  const since = f.since || asOf;
  const last = (visits || []).filter(v => v.simp && v.examType !== 'paid' && v.date >= since)
    .reduce((m, v) => (!m || v.date > m ? v.date : m), null);
  const every = Number(f.everyMonths) || 6;
  const due = last ? addMonths(last, every) : since;
  let status;
  if (due > asOf) status = due <= addDays(asOf, horizonDays) ? 'soon' : 'ok';
  else status = addDays(due, 30) >= asOf ? 'due' : 'overdue';
  return { status, due, last, overdueDays: due < asOf ? daysBetween(due, asOf) : 0 };
}

/* ------------------------------- протоколи ------------------------------- */

/**
 * Протокол за лекарства, заплащани от НЗОК: активен, изтичащ (в срока за
 * предупреждение), изтекъл, подновен или анулиран.
 */
export function protocolState(pr, asOf, warnDays = 30) {
  if (pr.status === 'cancelled') return { status: 'cancelled', label: 'Анулиран' };
  if (pr.status === 'renewed') return { status: 'renewed', label: 'Подновен' };
  if (!pr.validUntil) return { status: 'active', label: 'Активен' };
  const days = daysBetween(asOf, pr.validUntil);
  if (days < 0) return { status: 'expired', label: 'Изтекъл', days };
  if (days <= warnDays) return { status: 'expiring', label: days === 0 ? 'Изтича днес' : `Изтича след ${days} ${days === 1 ? 'ден' : 'дни'}`, days };
  return { status: 'active', label: 'Активен', days };
}

/* --------------------------------- график --------------------------------- */

export const APPT_STATUS = table({
  booked: 'Записан',
  arrived: 'Дошъл',
  done: 'Прегледан',
  noshow: 'Не дойде',
  cancelled: 'Отказан',
});

/** Часове, които заемат времето на лекаря (отказаните не заемат). */
export const occupies = (a) => a.status !== 'cancelled';

export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};
export const fromMinutes = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Ден от седмицата: 1 — понеделник … 7 — неделя. */
export function isoWeekday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 ? 7 : day;
}

/** Застъпва ли се часът с друг час на същия лекар в същия ден. */
export function overlapping(appts, candidate) {
  const start = toMinutes(candidate.time);
  const end = start + candidate.minutes;
  return appts.filter(a => a.id !== candidate.id && occupies(a) && a.date === candidate.date
    && (a.doctorId || '') === (candidate.doctorId || '')
    && toMinutes(a.time) < end && toMinutes(a.time) + a.minutes > start);
}

/**
 * Разписанието на един ден: работните интервали и записаните часове в тях.
 * Часовете извън работното време също се показват (записани по изключение).
 */
export function daySlots(agenda, date, appts) {
  const working = agenda.days.includes(isoWeekday(date));
  const start = toMinutes(agenda.start);
  const end = toMinutes(agenda.end);
  const slots = [];
  if (working) {
    for (let t = start; t + agenda.slot <= end; t += agenda.slot) {
      const taken = appts.filter(a => occupies(a) && toMinutes(a.time) < t + agenda.slot && toMinutes(a.time) + a.minutes > t);
      slots.push({ time: fromMinutes(t), free: !taken.length, appts: taken.filter(a => toMinutes(a.time) >= t) });
    }
  }
  const outside = appts.filter(a => occupies(a) && (!working || toMinutes(a.time) < start || toMinutes(a.time) >= end));
  return { working, slots, outside: outside.sort((a, b) => (a.time < b.time ? -1 : 1)) };
}

/** Първият свободен час от днес нататък (за бутона „Първи свободен час“). */
export function firstFree(agenda, appts, fromDate, fromTime = '00:00', doctorId = '', days = 60) {
  for (let i = 0; i < days; i++) {
    const date = addDays(fromDate, i);
    const mine = appts.filter(a => a.date === date && (a.doctorId || '') === (doctorId || ''));
    const { slots } = daySlots(agenda, date, mine);
    const slot = slots.find(s => s.free && (i > 0 || s.time >= fromTime));
    if (slot) return { date, time: slot.time };
  }
  return null;
}

/* --------------------------- шаблони за прегледа --------------------------- */

/** Описание на нормален статус — лекарят го редактира според находката. */
export const STATUS_TEMPLATES = table({
  general: 'Общо състояние — добро. В съзнание, контактен, ориентиран. Кожа и видими лигавици — с нормален цвят. '
    + 'Дишане — везикуларно, без хрипове. Сърдечна дейност — ритмична, ясни тонове, без патологични шумове. '
    + 'Корем — мек, неболезнен. Крайници — без отоци.',
  cardio: 'Общо състояние — добро. Без диспнея в покой. Шийни вени — без застой. '
    + 'Дишане — везикуларно, без хрипове. Сърдечна дейност — ритмична, ясни тонове, без патологични шумове. '
    + 'Корем — мек, неболезнен, без хепатомегалия. Крайници — без отоци, запазени периферни пулсации.',
  endo: 'Общо състояние — добро. Тегло и ръст — виж измерванията. Щитовидна жлеза — не се палпира увеличена, без възли. '
    + 'Без очни симптоми. Кожа — нормално влажна. Сърдечна дейност — ритмична. '
    + 'Стъпала — запазена чувствителност, без рани и деформации, палпируеми пулсации.',
});

/* ------------------------ чести диагнози по МКБ-10 ------------------------ */

/** Често поставяни диагнози по специалности — за бърз избор в прегледа. */
export const COMMON_DX = table({
  cardio: [
    ['I10', 'Есенциална (първична) хипертония'],
    ['I11.0', 'Хипертонична болест на сърцето със застойна сърдечна недостатъчност'],
    ['I11.9', 'Хипертонична болест на сърцето без застойна сърдечна недостатъчност'],
    ['I20.8', 'Други форми на стенокардия'],
    ['I25.1', 'Атеросклеротична болест на сърцето'],
    ['I25.2', 'Стар миокарден инфаркт'],
    ['I25.5', 'Исхемична кардиомиопатия'],
    ['I42.0', 'Дилатативна кардиомиопатия'],
    ['I42.1', 'Обструктивна хипертрофична кардиомиопатия'],
    ['I34.0', 'Митрална (клапна) недостатъчност'],
    ['I35.0', 'Аортна (клапна) стеноза'],
    ['I47.1', 'Надкамерна тахикардия'],
    ['I48', 'Предсърдно мъждене и трептене'],
    ['I49.3', 'Камерна преждевременна деполяризация'],
    ['I50.0', 'Застойна сърдечна недостатъчност'],
    ['I50.9', 'Сърдечна недостатъчност, неуточнена'],
    ['E78.0', 'Чиста хиперхолестеролемия'],
    ['E78.2', 'Смесена хиперлипидемия'],
    ['Z95.0', 'Наличие на сърдечен пейсмейкър'],
    ['Z95.5', 'Наличие на коронарен ангиопластичен имплантат и присадка'],
  ],
  endo: [
    ['E10.9', 'Инсулинозависим захарен диабет без усложнения'],
    ['E11.9', 'Неинсулинозависим захарен диабет без усложнения'],
    ['E11.2', 'Неинсулинозависим захарен диабет с бъбречни усложнения'],
    ['E11.4', 'Неинсулинозависим захарен диабет с неврологични усложнения'],
    ['E11.5', 'Неинсулинозависим захарен диабет с периферни съдови усложнения'],
    ['E11.7', 'Неинсулинозависим захарен диабет с множествени усложнения'],
    ['R73.0', 'Отклонения в резултатите от теста за глюкозен толеранс'],
    ['E03.9', 'Хипотиреоидизъм, неуточнен'],
    ['E06.3', 'Автоимунен тиреоидит'],
    ['E05.0', 'Тиреотоксикоза с дифузна гуша'],
    ['E05.2', 'Тиреотоксикоза с токсична многовъзлова гуша'],
    ['E04.1', 'Нетоксичен единичен тиреоиден възел'],
    ['E04.2', 'Нетоксична многовъзлова гуша'],
    ['E89.0', 'Хипотиреоидизъм след медицински процедури'],
    ['E21.0', 'Първичен хиперпаратиреоидизъм'],
    ['E22.1', 'Хиперпролактинемия'],
    ['E28.2', 'Синдром на поликистозните яйчници'],
    ['E66.0', 'Затлъстяване, дължащо се на прекомерен прием на енергийни ресурси'],
    ['M81.0', 'Постменопаузална остеопороза'],
    ['E55.9', 'Недоимък на витамин D, неуточнен'],
  ],
});

/* ------------------------ обобщение за едно досие ------------------------ */

/**
 * Всичко от практиката на СИМП за един пациент: прегледи, направления,
 * диспансерно наблюдение, протоколи и сигнали.
 * @param {object} p  досието
 * @param {object} settings  настройките на практиката
 * @param {string} asOf  към коя дата
 * @param {object[]} [appts]  записаните часове на пациента
 */
export function simpSummary(p, settings, asOf, appts = []) {
  const horizon = Number(settings.horizonDays) || 30;
  const exams = examsOf(p);
  const referrals = (p.referrals || []).map(r => ({ ...r, state: referralState(r, p.visits, asOf, settings.secondaryDays) }))
    .sort((a, b) => ((a.issued || '') < (b.issued || '') ? 1 : -1));
  const followups = (p.followups || []).map(f => ({ ...f, state: followupState(f, p.visits, asOf, horizon) }));
  const protocols = (p.protocols || []).map(pr => ({ ...pr, state: protocolState(pr, asOf, settings.protocolWarnDays) }))
    .sort((a, b) => ((a.validUntil || '') < (b.validUntil || '') ? 1 : -1));
  const upcoming = appts.filter(a => a.date >= asOf && (a.status === 'booked' || a.status === 'arrived'))
    .sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));

  const alerts = [];
  for (const f of followups) {
    if (f.state.status === 'overdue') alerts.push({ severity: 2, kind: 'followup', text: `Просрочен диспансерен преглед (${f.diagnosis || f.icd}) от ${formatDate(f.state.due)}` });
    else if (f.state.status === 'due' && !upcoming.length) alerts.push({ severity: 1, kind: 'followup', text: `Дължим диспансерен преглед (${f.diagnosis || f.icd})` });
  }
  for (const pr of protocols) {
    if (pr.state.status === 'expired' && !protocols.some(o => o !== pr && o.renewedFrom === pr.id)) {
      alerts.push({ severity: 2, kind: 'protocol', text: `Изтекъл протокол ${pr.number || ''} (${pr.drugs.join(', ')})`.replace('  ', ' ') });
    } else if (pr.state.status === 'expiring') {
      alerts.push({ severity: 1, kind: 'protocol', text: `Протокол ${pr.number || ''} (${pr.drugs.join(', ')}): ${pr.state.label.toLowerCase()}`.replace('  ', ' ') });
    }
  }
  for (const r of referrals) {
    if (r.state.status === 'secondary' && r.state.daysLeft <= 5) {
      alerts.push({ severity: 1, kind: 'referral', text: `Срокът за вторичен преглед изтича ${r.state.daysLeft === 0 ? 'днес' : `след ${r.state.daysLeft} ${r.state.daysLeft === 1 ? 'ден' : 'дни'}`}` });
    }
  }
  return {
    exams,
    lastExam: exams[0] || null,
    referrals,
    followups,
    protocols,
    upcoming,
    nextAppt: upcoming[0] || null,
    alerts: alerts.sort((a, b) => b.severity - a.severity),
  };
}
