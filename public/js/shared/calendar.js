/* Имунизационен календар и профилактични дейности — стойности по подразбиране.
 *
 * ВАЖНО: това са начални настройки, които практиката може да редактира от
 * „Настройки → Календар“. Приложението никога не приема тези стойности за
 * нормативно обвързващи — при промяна в наредбите календарът се актуализира
 * от UI-я, без намеса в кода.
 *
 * Съставено по задължителния имунизационен календар на Република България
 * (Наредба № 15 от 12.05.2005 г. за имунизациите), включително задължителната
 * имунизация срещу варицела, в сила от 01.07.2026 г.
 * Последна проверка на съдържанието: септември 2026 г.
 */

export const CALENDAR_VERIFIED = '2026-09';

/** Групи, по които се подреждат дейностите в досието. */
export const GROUPS = {
  vaccine: { id: 'vaccine', label: 'Имунизации', icon: '💉' },
  checkup: { id: 'checkup', label: 'Профилактични прегледи', icon: '🩺' },
  screening: { id: 'screening', label: 'Скрининг и изследвания', icon: '🔬' },
};

/**
 * Полета на един елемент от календара:
 *   id              уникален код (не се променя, ползва се за връзка със записите)
 *   group           vaccine | checkup | screening
 *   name            пълно наименование
 *   short           кратко име за таблици и печат
 *   protects        срещу какво предпазва (за ваксини)
 *   dueMonths       препоръчителна възраст в месеци
 *   minMonths       най-ранна допустима възраст
 *   graceMonths     колко месеца след срока още се води „дължимо“, преди „просрочено“
 *   series          код на серията дози (за проверка на интервали)
 *   doseNo          номер на приема в серията
 *   minIntervalM    минимален интервал в месеци след предходния прием от серията
 *   mandatory       задължителна по календара
 *   optIn           препоръчителна — включва се за конкретно дете по преценка
 *   note            пояснение, което се показва до реда
 */

export const DEFAULT_VACCINES = [
  {
    id: 'hepb-1', group: 'vaccine', name: 'Хепатит Б — I прием', short: 'Хеп. Б I',
    protects: 'вирусен хепатит Б', dueMonths: 0, minMonths: 0, graceMonths: 1,
    series: 'hepb', doseNo: 1, mandatory: true,
    note: 'До 24-ия час след раждането, моновалентна ваксина.',
  },
  {
    id: 'bcg', group: 'vaccine', name: 'БЦЖ — туберкулоза', short: 'БЦЖ',
    protects: 'туберкулоза', dueMonths: 0, minMonths: 0, graceMonths: 1,
    series: 'bcg', doseNo: 1, mandatory: true,
    note: 'До 48-ия час след раждането, при тегло над 2000 г.',
  },
  {
    id: 'hexa-1', group: 'vaccine', name: 'Шесткомпонентна — I прием', short: 'Хекса I',
    protects: 'дифтерия, тетанус, коклюш, полиомиелит, хепатит Б, Hib',
    dueMonths: 2, minMonths: 1.5, graceMonths: 1,
    series: 'dtp', doseNo: 1, mandatory: true,
    note: 'ДТКa-ИПВ-ХепБ-Хиб. Не по-рано от навършени 6 седмици.',
  },
  {
    id: 'pneumo-1', group: 'vaccine', name: 'Пневмококи — I прием', short: 'Пневмо I',
    protects: 'инвазивни пневмококови инфекции', dueMonths: 2, minMonths: 1.5, graceMonths: 1,
    series: 'pneumo', doseNo: 1, mandatory: true,
    note: 'Конюгирана пневмококова ваксина. Прилага се едновременно с шесткомпонентната.',
  },
  {
    id: 'hexa-2', group: 'vaccine', name: 'Шесткомпонентна — II прием', short: 'Хекса II',
    protects: 'дифтерия, тетанус, коклюш, полиомиелит, хепатит Б, Hib',
    dueMonths: 3, minMonths: 2.5, graceMonths: 1,
    series: 'dtp', doseNo: 2, minIntervalM: 1, mandatory: true,
    note: 'Най-малко един месец след предходния прием.',
  },
  {
    id: 'hexa-3', group: 'vaccine', name: 'Шесткомпонентна — III прием', short: 'Хекса III',
    protects: 'дифтерия, тетанус, коклюш, полиомиелит, хепатит Б, Hib',
    dueMonths: 4, minMonths: 3.5, graceMonths: 1,
    series: 'dtp', doseNo: 3, minIntervalM: 1, mandatory: true,
    note: 'Най-малко един месец след предходния прием.',
  },
  {
    id: 'pneumo-2', group: 'vaccine', name: 'Пневмококи — II прием', short: 'Пневмо II',
    protects: 'инвазивни пневмококови инфекции', dueMonths: 4, minMonths: 3.5, graceMonths: 1,
    series: 'pneumo', doseNo: 2, minIntervalM: 2, mandatory: true,
  },
  {
    id: 'bcg-check', group: 'screening', name: 'Проверка за белег от БЦЖ', short: 'БЦЖ белег',
    dueMonths: 7, minMonths: 6, graceMonths: 2, mandatory: true,
    note: 'При липса на белег — проба Манту; при отрицателна проба се извършва реимунизация.',
  },
  {
    id: 'pneumo-3', group: 'vaccine', name: 'Пневмококи — реимунизация', short: 'Пневмо III',
    protects: 'инвазивни пневмококови инфекции', dueMonths: 12, minMonths: 11, graceMonths: 2,
    series: 'pneumo', doseNo: 3, minIntervalM: 6, mandatory: true,
  },
  {
    id: 'varicella-1', group: 'vaccine', name: 'Варицела — I прием', short: 'Варицела I',
    protects: 'варицела (лещенка)', dueMonths: 13, minMonths: 12, graceMonths: 3,
    series: 'varicella', doseNo: 1, mandatory: true,
    note: 'Задължителна от 01.07.2026 г. Прилага се на 12–15-месечна възраст. '
      + 'С МПР — едновременно или с интервал най-малко 30 дни.',
  },
  {
    id: 'mmr-1', group: 'vaccine', name: 'МПР — I прием', short: 'МПР I',
    protects: 'морбили, паротит, рубеола', dueMonths: 13, minMonths: 12, graceMonths: 3,
    series: 'mmr', doseNo: 1, mandatory: true,
  },
  {
    id: 'penta-4', group: 'vaccine', name: 'Петкомпонентна — реимунизация', short: 'Пента IV',
    protects: 'дифтерия, тетанус, коклюш, полиомиелит, Hib',
    dueMonths: 16, minMonths: 15, graceMonths: 3,
    series: 'dtp', doseNo: 4, minIntervalM: 6, mandatory: true,
    note: 'ДТКa-ИПВ-Хиб.',
  },
  {
    id: 'varicella-2', group: 'vaccine', name: 'Варицела — II прием', short: 'Варицела II',
    protects: 'варицела (лещенка)', dueMonths: 48, minMonths: 45, graceMonths: 6,
    series: 'varicella', doseNo: 2, minIntervalM: 3, mandatory: true,
    note: 'В годината на навършване на 4 години. Дължи се само на деца, получили '
      + 'първия прием по задължителния календар.',
  },
  {
    id: 'dtap-ipv-5', group: 'vaccine', name: 'Четирикомпонентна — реимунизация', short: 'Тетра V',
    protects: 'дифтерия, тетанус, коклюш, полиомиелит',
    dueMonths: 72, minMonths: 66, graceMonths: 6,
    series: 'dtp', doseNo: 5, mandatory: true,
    note: 'ДТКa-ИПВ, на 6-годишна възраст.',
  },
  {
    id: 'mantoux-7', group: 'screening', name: 'Проба Манту и БЦЖ при отрицателна', short: 'Манту 7 г.',
    dueMonths: 84, minMonths: 78, graceMonths: 6, mandatory: true,
    note: 'Реимунизация срещу туберкулоза при отрицателна проба.',
  },
  {
    id: 'mmr-2', group: 'vaccine', name: 'МПР — реимунизация', short: 'МПР II',
    protects: 'морбили, паротит, рубеола', dueMonths: 144, minMonths: 138, graceMonths: 6,
    series: 'mmr', doseNo: 2, minIntervalM: 1, mandatory: true,
    note: 'На 12-годишна възраст.',
  },
  {
    id: 'td-12', group: 'vaccine', name: 'Тд — реимунизация', short: 'Тд 12 г.',
    protects: 'тетанус, дифтерия', dueMonths: 144, minMonths: 138, graceMonths: 6,
    series: 'td', doseNo: 1, mandatory: true,
    note: 'На 12-годишна възраст.',
  },
  {
    id: 'td-17', group: 'vaccine', name: 'Тд — реимунизация', short: 'Тд 17 г.',
    protects: 'тетанус, дифтерия', dueMonths: 204, minMonths: 198, graceMonths: 12,
    series: 'td', doseNo: 2, minIntervalM: 24, mandatory: true,
    note: 'На 17-годишна възраст. След това реимунизация на всеки 10 години.',
  },

  /* ---- Препоръчителни имунизации: включват се за дете по преценка на лекаря ---- */
  {
    id: 'rota-1', group: 'vaccine', name: 'Ротавирус — I прием', short: 'Рота I',
    protects: 'ротавирусен гастроентерит', dueMonths: 2, minMonths: 1.5, graceMonths: 1,
    series: 'rota', doseNo: 1, mandatory: false, optIn: true,
    note: 'Препоръчителна. Първият прием задължително преди 15-седмична възраст.',
  },
  {
    id: 'rota-2', group: 'vaccine', name: 'Ротавирус — II прием', short: 'Рота II',
    protects: 'ротавирусен гастроентерит', dueMonths: 3, minMonths: 2.5, graceMonths: 1,
    series: 'rota', doseNo: 2, minIntervalM: 1, mandatory: false, optIn: true,
    note: 'Препоръчителна. Курсът приключва до 8-месечна възраст.',
  },
  {
    id: 'menb-1', group: 'vaccine', name: 'Менингококи B — I прием', short: 'Мен. B I',
    protects: 'инвазивна менингококова инфекция серогрупа B',
    dueMonths: 3, minMonths: 2, graceMonths: 2,
    series: 'menb', doseNo: 1, mandatory: false, optIn: true, note: 'Препоръчителна.',
  },
  {
    id: 'menb-2', group: 'vaccine', name: 'Менингококи B — II прием', short: 'Мен. B II',
    protects: 'инвазивна менингококова инфекция серогрупа B',
    dueMonths: 5, minMonths: 4, graceMonths: 2,
    series: 'menb', doseNo: 2, minIntervalM: 2, mandatory: false, optIn: true, note: 'Препоръчителна.',
  },
  {
    id: 'hepa-1', group: 'vaccine', name: 'Хепатит А — I прием', short: 'Хеп. А I',
    protects: 'вирусен хепатит А', dueMonths: 13, minMonths: 12, graceMonths: 6,
    series: 'hepa', doseNo: 1, mandatory: false, optIn: true, note: 'Препоръчителна.',
  },
  {
    id: 'hepa-2', group: 'vaccine', name: 'Хепатит А — II прием', short: 'Хеп. А II',
    protects: 'вирусен хепатит А', dueMonths: 19, minMonths: 18, graceMonths: 6,
    series: 'hepa', doseNo: 2, minIntervalM: 6, mandatory: false, optIn: true, note: 'Препоръчителна.',
  },
  {
    id: 'hpv-1', group: 'vaccine', name: 'HPV — I прием', short: 'HPV I',
    protects: 'онкогенни човешки папиломни вируси', dueMonths: 132, minMonths: 108, graceMonths: 24,
    series: 'hpv', doseNo: 1, mandatory: false, optIn: true,
    note: 'Препоръчителна, по национална програма. Двудозова схема до 15 г.',
  },
  {
    id: 'hpv-2', group: 'vaccine', name: 'HPV — II прием', short: 'HPV II',
    protects: 'онкогенни човешки папиломни вируси', dueMonths: 138, minMonths: 114, graceMonths: 24,
    series: 'hpv', doseNo: 2, minIntervalM: 6, mandatory: false, optIn: true,
    note: 'Препоръчителна. Най-малко 6 месеца след първия прием.',
  },
];

/** Профилактични прегледи по честотата от Наредба № 8 за диспансеризация и
 *  профилактични прегледи при лица под 18 години. */
export function buildCheckups() {
  const items = [];
  const push = (months, label, note, extra = {}) => items.push({
    id: `chk-${months}`, group: 'checkup', name: label, short: label,
    dueMonths: months, minMonths: Math.max(0, months - 0.5),
    graceMonths: months < 12 ? 0.75 : months < 24 ? 1.5 : 3,
    mandatory: true, note, ...extra,
  });

  // До 1 година — ежемесечно.
  for (let m = 1; m <= 12; m++) {
    const notes = {
      1: 'Оценка на кърменето и наддаването. Скрининг за дисплазия на тазобедрените стави.',
      4: 'Начало на захранване — консултация с родителя.',
      6: 'Оценка на психомоторното развитие. Профилактика на желязодефицитна анемия.',
      9: 'Изследване на хемоглобин по преценка.',
      12: 'Годишна оценка: антропометрия, психомоторно развитие, имунизационен статус.',
    };
    push(m, `Профилактичен преглед — ${m} мес.`, notes[m] || 'Антропометрия, физикален статус, психомоторно развитие.');
  }
  // 1–2 години — на всеки 3 месеца.
  for (let m = 15; m <= 24; m += 3) {
    push(m, `Профилактичен преглед — ${m} мес.`, 'Антропометрия, реч и моторика, хранене.');
  }
  // 2–7 години — два пъти годишно.
  for (let m = 30; m <= 84; m += 6) {
    const y = Math.floor(m / 12), rest = m % 12;
    const label = rest ? `${y} г. ${rest} мес.` : `${y} г.`;
    push(m, `Профилактичен преглед — ${label}`,
      m === 36 ? 'Проверка на зрение и слух. Измерване на артериално налягане.'
        : m === 60 ? 'Оценка на училищна готовност.'
          : 'Антропометрия, физикален статус, зъбен статус.');
  }
  // 7–18 години — веднъж годишно.
  for (let y = 8; y <= 18; y++) {
    push(y * 12, `Профилактичен преглед — ${y} г.`,
      y === 12 ? 'Оценка на пубертетното развитие. Артериално налягане.'
        : 'Антропометрия, артериално налягане, физикален статус, гръбначен стълб.');
  }
  return items;
}

/** Скринингови дейности — практически стандарт на практиката, не нормативен списък. */
export const DEFAULT_SCREENINGS = [
  {
    id: 'neonatal-screen', group: 'screening', name: 'Неонатален скрининг', short: 'Неон. скрининг',
    dueMonths: 0, minMonths: 0, graceMonths: 1, expireMonths: 4, mandatory: true,
    note: 'Извършва се в родилното отделение. Отбележете получен резултат.',
  },
  {
    id: 'hearing-screen', group: 'screening', name: 'Скрининг на слуха', short: 'Слух',
    dueMonths: 0, minMonths: 0, graceMonths: 2, expireMonths: 12, mandatory: true,
    note: 'Отоакустични емисии в родилното отделение.',
  },
  {
    id: 'hip-screen', group: 'screening', name: 'Ехография на тазобедрени стави', short: 'ТБС ехо',
    dueMonths: 1, minMonths: 0.5, graceMonths: 2, expireMonths: 11, mandatory: true,
    note: 'Скрининг за развитийна дисплазия на тазобедрената става.',
  },
  {
    id: 'hb-screen-12', group: 'screening', name: 'Хемоглобин — скрининг за анемия', short: 'Hb 12 мес.',
    dueMonths: 12, minMonths: 9, graceMonths: 6, expireMonths: 24, mandatory: false,
    note: 'Скрининг за желязодефицитна анемия в кърмаческа възраст.',
  },
  {
    id: 'vision-screen', group: 'screening', name: 'Офталмологичен преглед', short: 'Зрение',
    dueMonths: 36, minMonths: 30, graceMonths: 12, expireMonths: 36, mandatory: false,
    note: 'Скрининг за амблиопия и рефракционни аномалии.',
  },
];

/** Пълният календар по подразбиране. */
export function defaultSchedule() {
  return [...DEFAULT_VACCINES, ...buildCheckups(), ...DEFAULT_SCREENINGS]
    .map(item => ({ ...item }));
}

/** Причини за отвод — предлагат се в падащо меню. */
export const DEFERRAL_REASONS = [
  'Остро фебрилно заболяване',
  'Обостряне на хронично заболяване',
  'Имуносупресивна терапия',
  'Провеждано лечение с кортикостероиди',
  'Алергична реакция към предходен прием',
  'Недоносеност — отлага се по преценка',
  'Липса на ваксина',
  'Друга медицинска причина',
];
