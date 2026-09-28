/* Защита на входа от налучкване на ПИН.
 *
 * ПИН от 4 цифри има само 10 000 възможности — без ограничение чужд човек в
 * мрежата на кабинета би го налучкал за минути. Затова:
 *   - след 5 поредни грешни опита за един потребител всеки следващ опит
 *     изчаква — 30 с, после 1 мин, 2 мин… до 15 мин;
 *   - от един компютър (адрес) се допускат до 30 грешни опита за 15 минути,
 *     независимо за кой потребител.
 * Успешен вход нулира брояча на потребителя. Броячите са в паметта: при
 * рестарт на програмата (възможен само от самия компютър) започват отначало.
 */

const FREE_ATTEMPTS = 5;
const BASE_LOCK_MS = 30 * 1000;
const MAX_LOCK_MS = 15 * 60 * 1000;
const FORGET_MS = 60 * 60 * 1000;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_LIMIT = 30;

export class LoginGuard {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.users = new Map();  // doctorId → { count, last }
    this.ips = new Map();    // адрес → [моменти на грешни опити]
  }

  lockMs(count) {
    if (count < FREE_ATTEMPTS) return 0;
    return Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (count - FREE_ATTEMPTS));
  }

  /** Колко милисекунди трябва да се изчака преди следващ опит (0 = може). */
  wait(doctorId, ip) {
    const t = this.now();
    let wait = 0;
    const u = this.users.get(doctorId);
    if (u) {
      if (t - u.last > FORGET_MS) this.users.delete(doctorId);
      else wait = Math.max(wait, u.last + this.lockMs(u.count) - t);
    }
    const list = (this.ips.get(ip) || []).filter(x => t - x < IP_WINDOW_MS);
    if (list.length) this.ips.set(ip, list); else this.ips.delete(ip);
    if (list.length >= IP_LIMIT) wait = Math.max(wait, list[list.length - IP_LIMIT] + IP_WINDOW_MS - t);
    return Math.max(0, wait);
  }

  /** Отбелязва грешен опит. Връща true, ако с него потребителят току-що е заключен. */
  fail(doctorId, ip) {
    const t = this.now();
    const u = this.users.get(doctorId) || { count: 0, last: 0 };
    u.count++;
    u.last = t;
    this.users.set(doctorId, u);
    const list = this.ips.get(ip) || [];
    list.push(t);
    this.ips.set(ip, list.slice(-IP_LIMIT * 2));
    return u.count === FREE_ATTEMPTS;
  }

  success(doctorId) {
    this.users.delete(doctorId);
  }

  /** Потребителите, които в момента изчакват след грешни опити. */
  locked() {
    const t = this.now();
    const out = [];
    for (const [doctorId, u] of this.users) {
      const until = u.last + this.lockMs(u.count);
      if (until > t) out.push({ doctorId, failures: u.count, until: new Date(until).toISOString() });
    }
    return out;
  }
}

/** „2 мин.“, „45 с“ — за съобщението при заключване. */
export function waitText(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} с`;
  return `${Math.ceil(s / 60)} мин.`;
}
