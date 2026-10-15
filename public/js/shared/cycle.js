/* Менструален цикъл: дневник на менструациите, фази, прогноза и оценка.
 *
 * Цикълът се брои от първия ден на менструацията. Овулацията е около 14 дни
 * преди следващата менструация — лутеалната фаза е по-постоянна от фоликуларната.
 * Предменструалните дни са последните 5 дни на цикъла (както при оценката на ПМС, ACOG 2023).
 *
 * Нормални граници — FIGO AUB System 1 (Munro и съавт., 2018): цикъл 24–38 дни;
 * разлика между най-краткия и най-дългия цикъл до 7 дни на 26–41 г. и до 9 дни
 * на 18–25 и 42–45 г.; кървене до 8 дни. Липса на менструация над 3 месеца при
 * досега редовен цикъл или над 6 месеца при нередовен — вторична аменорея; при
 * редовен цикъл закъснение и от 1 седмица изисква да се изключи бременност (ASRM 2024).
 *
 * Прогнозата е ориентировъчна и не е метод за контрацепция.
 * Общо за сървъра и интерфейса. */

import { table } from './table.js';
import { addDays, daysBetween, isValidISO, today } from './dates.js';

export const CONTRACEPTION = table({
  none: { label: 'без хормонална контрацепция', natural: true },
  cuiud: { label: 'медна спирала', natural: true },
  lngiud: { label: 'хормонална спирала', natural: true },
  combined: { label: 'комбинирана хормонална (хапче, пластир, пръстен)', natural: false },
  progestin: { label: 'само с прогестаген (хапче, инжекция, имплант)', natural: false },
});

export const PHASES = table({
  menstrual: { label: 'менструация', icon: '🩸' },
  follicular: { label: 'фоликуларна фаза', icon: '🌱' },
  ovulation: { label: 'около овулацията', icon: '◎' },
  luteal: { label: 'лутеална фаза', icon: '🌙' },
  premenstrual: { label: 'предменструални дни', icon: '☁' },
});

export const DEFAULT_LENGTH = 28;
export const DEFAULT_BLEED = 5;
/** Първата буква — главна. */
const upper1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const LUTEAL_DAYS = 14;
const PREMENSTRUAL_DAYS = 5;
/* Записи, по-далечни от година, не влизат в оценката. */
const WINDOW_DAYS = 365;

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Менструациите по дата, най-старата първа; без невалидни и повторени дати. */
export function sortedPeriods(periods = []) {
  const seen = new Set();
  return (periods || [])
    .filter(x => x && isValidISO(x.start) && !seen.has(x.start) && seen.add(x.start))
    .sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** Нормалната разлика между най-краткия и най-дългия цикъл по FIGO според възрастта. */
export function variationLimit(age) {
  return age >= 26 && age <= 41 ? 7 : 9;
}

/** Ден от цикъла и фаза за дата. */
export function phaseOn(date, { lastStart, length = DEFAULT_LENGTH, bleed = DEFAULT_BLEED }) {
  const since = daysBetween(lastStart, date);
  if (since < 0) return null;
  const day = (since % length) + 1;
  const cycleNo = Math.floor(since / length);
  const ovulationDay = Math.max(bleed + 2, length - LUTEAL_DAYS);
  let phase;
  if (day <= bleed) phase = 'menstrual';
  else if (Math.abs(day - ovulationDay) <= 1) phase = 'ovulation';
  else if (day < ovulationDay) phase = 'follicular';
  else if (day > length - PREMENSTRUAL_DAYS) phase = 'premenstrual';
  else phase = 'luteal';
  return { date, day, phase, label: PHASES[phase].label, icon: PHASES[phase].icon, predicted: cycleNo > 0, length };
}

/**
 * Оценка на цикъла по дневника.
 * @param {object} cycle { periods: [{ start, days, heavy }], length, bleed, contraception, menopause }
 * @returns статистика, прогноза, днешната фаза и бележки по FIGO и ASRM
 */
export function cycleStats(cycle = {}, { age = null, asOf = today() } = {}) {
  const periods = sortedPeriods(cycle.periods).filter(x => x.start <= asOf);
  const contraception = CONTRACEPTION[cycle.contraception] ? cycle.contraception : 'none';
  const natural = CONTRACEPTION[contraception].natural && !cycle.menopause;
  const recent = periods.filter(x => daysBetween(x.start, asOf) <= WINDOW_DAYS);
  // Дължините на циклите — между началата на поредни менструации (10–120 дни; по-дългите са пропуснати записи).
  const lengths = [];
  for (let i = 1; i < recent.length; i++) {
    const d = daysBetween(recent[i - 1].start, recent[i].start);
    if (d >= 10 && d <= 120) lengths.push(d);
  }
  const lastSix = lengths.slice(-6);
  const entered = Number(cycle.length) >= 15 && Number(cycle.length) <= 90 ? Math.round(Number(cycle.length)) : null;
  const length = lastSix.length >= 2 ? median(lastSix) : entered || lastSix[0] || DEFAULT_LENGTH;
  const lengthSource = lastSix.length >= 2 ? 'records' : entered ? 'entered' : lastSix.length ? 'records' : 'default';
  const durations = recent.map(x => Number(x.days)).filter(n => n >= 1 && n <= 20);
  const enteredBleed = Number(cycle.bleed) >= 1 && Number(cycle.bleed) <= 15 ? Math.round(Number(cycle.bleed)) : null;
  const bleed = Math.min(length - 4, durations.length ? median(durations.slice(-6)) : enteredBleed || DEFAULT_BLEED);
  const lastStart = periods.length ? periods[periods.length - 1].start : (isValidISO(cycle.lastPeriod) && cycle.lastPeriod <= asOf ? cycle.lastPeriod : null);

  const out = {
    periods, lengths, length, lengthSource, bleed, lastStart, contraception, natural,
    menopause: !!cycle.menopause,
    min: lengths.length ? Math.min(...lastSix) : null,
    max: lengths.length ? Math.max(...lastSix) : null,
    variation: lastSix.length >= 3 ? Math.max(...lastSix) - Math.min(...lastSix) : null,
    variationLimit: variationLimit(age),
    regular: null,
    daysSince: lastStart ? daysBetween(lastStart, asOf) : null,
    late: 0, pending: 0,
    today: null, nextStart: null, ovulation: null,
    flags: [],
  };
  const flag = (code, level, text) => out.flags.push({ code, level, text });

  if (cycle.menopause) {
    flag('menopause', 'info', 'Менопауза — фазите на цикъла не се изчисляват.');
    return out;
  }
  if (!natural) {
    flag('hormonal', 'info', `${upper1(CONTRACEPTION[contraception].label)}: овулацията е потисната и кървенето не е истинска менструация — фазите не се изчисляват.`);
  }

  // Редовност по FIGO — нужни са поне 3 цикъла.
  if (out.variation !== null) {
    out.regular = out.variation <= out.variationLimit;
    if (!out.regular && natural) {
      // FIGO допуска единичен по-къс или по-дълъг цикъл — без най-отдалечения от медианата.
      const m = median(lastSix);
      const far = lastSix.reduce((a, b) => (Math.abs(b - m) > Math.abs(a - m) ? b : a));
      const rest = [...lastSix];
      rest.splice(rest.indexOf(far), 1);
      if (rest.length >= 2 && Math.max(...rest) - Math.min(...rest) <= out.variationLimit) {
        out.regular = true;
        flag('outlier', 'info', `Един цикъл (${far} дни) се различава от останалите — единични по-къси или по-дълги цикли са нормални (FIGO).`);
      } else {
        flag('irregular', 'warn', `Нередовен цикъл: разлика ${out.variation} дни между най-краткия и най-дългия цикъл при норма до ${out.variationLimit} дни (FIGO 2018).`);
      }
    }
  }
  if (natural && lengths.length >= 2) {
    if (length < 24) flag('frequent', 'warn', `Чести менструации: цикъл около ${length} дни при норма 24–38 дни (FIGO 2018).`);
    if (length > 38) flag('infrequent', 'warn', `Редки менструации: цикъл около ${length} дни при норма 24–38 дни (FIGO 2018).`);
  }
  if (durations.length && median(durations.slice(-6)) > 8) {
    flag('prolonged', 'warn', `Продължително кървене: около ${median(durations.slice(-6))} дни при норма до 8 дни (FIGO 2018).`);
  }
  if (recent.slice(-3).some(x => x.heavy)) {
    flag('heavy', 'warn', 'Обилна менструация: кръвна картина при всички жени с обилно кървене (NICE NG88); храни, богати на желязо, в дните на менструацията.');
  }
  if (age >= 45 && natural) flag('perimenopause', 'info', 'След 45 г. цикълът често става нередовен (перименопауза) — нормите на FIGO са за 18–45 г.');

  if (!lastStart) return out;
  if (natural) {
    const since = out.daysSince;
    const limit = out.regular === false ? 180 : 90;
    if (since > limit) {
      flag('amenorrhea', 'warn', `Няма менструация от ${since} дни: при досега редовен цикъл над 3 месеца, при нередовен над 6 месеца е вторична аменорея — изследване (ASRM 2024). Изключете бременност.`);
      out.late = since - length;
      return out;
    }
    if (since >= length + 7) {
      out.late = since - length;
      flag('late', 'warn', `Менструацията закъснява с ${out.late} дни: при възможна бременност — тест (ASRM 2024). Ако е започнала, въведете датата.`);
      return out;
    }
    out.today = phaseOn(asOf, out);
    // Следващата менструация след последната отбелязана; ако датата е минала, а нова не е
    // въведена — колко дни чака (до 6; от 7 е закъснение).
    out.nextStart = addDays(lastStart, length);
    out.pending = since >= length ? since - length + 1 : 0;
    const thisCycle = addDays(lastStart, Math.floor(since / length) * length);
    out.ovulation = addDays(thisCycle, Math.max(bleed + 2, length - LUTEAL_DAYS) - 1);
    if (out.ovulation < asOf) out.ovulation = addDays(out.ovulation, length);
  }
  return out;
}

/** Фазите за няколко поредни дни от дата (за менюто и календара). */
export function phasesFrom(stats, from, n) {
  if (!stats?.lastStart || !stats.natural || stats.late || stats.menopause) return [];
  return Array.from({ length: n }, (_, i) => phaseOn(addDays(from, i), stats)).filter(Boolean);
}

/** Данните за цикъла от формата или от досието — проверени и нормализирани. */
export function cleanCycle(c = {}) {
  const periods = sortedPeriods(c.periods).slice(-36).map(x => ({
    start: x.start,
    days: Number(x.days) >= 1 && Number(x.days) <= 20 ? Math.round(Number(x.days)) : null,
    heavy: !!x.heavy,
  }));
  return {
    periods,
    length: Number(c.length) >= 15 && Number(c.length) <= 90 ? Math.round(Number(c.length)) : null,
    bleed: Number(c.bleed) >= 1 && Number(c.bleed) <= 15 ? Math.round(Number(c.bleed)) : null,
    contraception: CONTRACEPTION[c.contraception] ? c.contraception : 'none',
    menopause: !!c.menopause,
    note: String(c.note || '').slice(0, 500),
  };
}

/** Записаният цикъл плюс данните от формата на режима: нови менструации се добавят, настройките се обновяват. */
export function mergeCycle(stored, form) {
  if (!form) return stored ? cleanCycle(stored) : null;
  const base = cleanCycle(stored || {});
  return cleanCycle({
    ...base,
    periods: [...base.periods, ...form.periods.filter(x => !base.periods.some(y => y.start === x.start))],
    length: form.length ?? base.length,
    bleed: form.bleed ?? base.bleed,
    contraception: form.contraception || base.contraception,
    menopause: base.menopause || form.menopause,
  });
}
