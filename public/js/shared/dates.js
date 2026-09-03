/* Работа с дати. Навсякъде в приложението датите са низове във формат ISO (ГГГГ-ММ-ДД),
 * за да няма изненади с часови зони. */

export const DAY_MS = 86400000;
/** Средна дължина на месеца по конвенцията на СЗО — 365.25 / 12. */
export const DAYS_PER_MONTH = 30.4375;

/** Днешната дата по локалния часовник, като ISO низ. */
export function today() {
  return toISO(new Date());
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Валиден ли е ISO низ и съществува ли такъв календарен ден. */
export function isValidISO(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function daysInMonth(year, month /* 1-12 */) {
  return new Date(year, month, 0).getDate();
}

/** Добавя месеци, като притиска деня към последния ден на месеца (31.01 + 1м = 28/29.02). */
export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = (y * 12) + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12;
  const nd = Math.min(d, daysInMonth(ny, nm + 1));
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return toISO(new Date(y, m - 1, d + days));
}

/** Брой цели дни между две дати (to - from). */
export function daysBetween(fromISO, toISOStr) {
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISOStr.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

/** Брой навършени месеци между две дати. */
export function monthsBetween(fromISO, toISOStr) {
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISOStr.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months--;
  return months;
}

/** Възраст в месеци с дробна част — за растежните криви на СЗО. */
export function ageInMonthsExact(birthISO, atISO) {
  return daysBetween(birthISO, atISO) / DAYS_PER_MONTH;
}

/** „2 г. 3 м.“ — четимо описание на възраст. За кърмачета показва и дни. */
export function formatAge(birthISO, atISO = today()) {
  const days = daysBetween(birthISO, atISO);
  if (days < 0) return '—';
  if (days < 31) return days === 1 ? '1 ден' : `${days} дни`;
  const months = monthsBetween(birthISO, atISO);
  if (months < 24) {
    const anchor = addMonths(birthISO, months);
    const restDays = daysBetween(anchor, atISO);
    const mPart = `${months} мес.`;
    return restDays >= 7 ? `${mPart} ${Math.floor(restDays / 7)} седм.` : mPart;
  }
  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  return restMonths ? `${years} г. ${restMonths} мес.` : `${years} г.`;
}

/** Описание на възраст, зададена в месеци — за календарни срокове. */
export function formatAgeMonths(months) {
  if (months === 0) return 'при раждане';
  if (months < 12) return `${months} мес.`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (m === 0) return `${y} г.`;
  return y < 2 ? `${y} г. ${m} мес.` : `${y} г. ${m} мес.`;
}

/** 15.03.2026 г. */
export function formatDate(iso) {
  if (!iso || !isValidISO(iso)) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y} г.`;
}

/** Кратък запис без годината, когато е текущата: „15.03“ или „15.03.2025“. */
export function formatDateShort(iso, refISO = today()) {
  if (!iso || !isValidISO(iso)) return '—';
  const [y, m, d] = iso.split('-');
  return y === refISO.slice(0, 4) ? `${d}.${m}` : `${d}.${m}.${y}`;
}

const MONTH_NAMES = ['януари', 'февруари', 'март', 'април', 'май', 'юни',
  'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
const WEEKDAYS = ['неделя', 'понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота'];

export function monthName(m /* 1-12 */) { return MONTH_NAMES[m - 1]; }

export function formatDateLong(iso) {
  if (!isValidISO(iso)) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y} г.`;
}

export function weekdayName(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

/** „днес“, „утре“, „преди 3 дни“, „след 12 дни“ — за списъците с напомняния. */
export function relativeDays(iso, refISO = today()) {
  const diff = daysBetween(refISO, iso);
  if (diff === 0) return 'днес';
  if (diff === 1) return 'утре';
  if (diff === -1) return 'вчера';
  return diff > 0 ? 'след ' + durationText(diff) : 'преди ' + durationText(-diff);
}

/** Продължителност с подходяща едрина: дни, месеци или години.
 *  „6081 дни“ не се чете — при такива изоставания се пише „16 г. 7 мес.“. */
export function durationText(days) {
  if (days < 45) return `${days} ${days === 1 ? 'ден' : 'дни'}`;
  const months = Math.round(days / DAYS_PER_MONTH);
  if (months < 24) return `${months} мес.`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} г. ${rest} мес.` : `${years} г.`;
}

/** Рожденият ден през дадена година, съобразен с 29 февруари. */
export function birthdayInYear(birthISO, year) {
  const [, m, d] = birthISO.split('-').map(Number);
  const day = Math.min(d, daysInMonth(year, m));
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
