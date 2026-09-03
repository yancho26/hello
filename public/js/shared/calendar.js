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
 *   optInGroup      обединява препоръчителните дози в една отметка (цялата серия)
 *   expireMonths    след колко месеца дейността престава да е приложима
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
    series: 'rota', doseNo: 1, mandatory: false, optIn: true, optInGroup: 'rota',
    note: 'Препоръчителна. Първият прием задължително преди 15-седмична възраст.',
  },
  {
    id: 'rota-2', group: 'vaccine', name: 'Ротавирус — II прием', short: 'Рота II',
    protects: 'ротавирусен гастроентерит', dueMonths: 3, minMonths: 2.5, graceMonths: 1,
    series: 'rota', doseNo: 2, minIntervalM: 1, mandatory: false, optIn: true, optInGroup: 'rota',
    note: 'Препоръчителна. Курсът приключва до 8-месечна възраст.',
  },
  {
    id: 'menb-1', group: 'vaccine', name: 'Менингококи B — I прием', short: 'Мен. B I',
    protects: 'инвазивна менингококова инфекция серогрупа B',
    dueMonths: 3, minMonths: 2, graceMonths: 2,
    series: 'menb', doseNo: 1, mandatory: false, optIn: true, optInGroup: 'menb', note: 'Препоръчителна.',
  },
  {
    id: 'menb-2', group: 'vaccine', name: 'Менингококи B — II прием', short: 'Мен. B II',
    protects: 'инвазивна менингококова инфекция серогрупа B',
    dueMonths: 5, minMonths: 4, graceMonths: 2,
    series: 'menb', doseNo: 2, minIntervalM: 2, mandatory: false, optIn: true, optInGroup: 'menb', note: 'Препоръчителна.',
  },
  {
    id: 'hepa-1', group: 'vaccine', name: 'Хепатит А — I прием', short: 'Хеп. А I',
    protects: 'вирусен хепатит А', dueMonths: 13, minMonths: 12, graceMonths: 6,
    series: 'hepa', doseNo: 1, mandatory: false, optIn: true, optInGroup: 'hepa', note: 'Препоръчителна.',
  },
  {
    id: 'hepa-2', group: 'vaccine', name: 'Хепатит А — II прием', short: 'Хеп. А II',
    protects: 'вирусен хепатит А', dueMonths: 19, minMonths: 18, graceMonths: 6,
    series: 'hepa', doseNo: 2, minIntervalM: 6, mandatory: false, optIn: true, optInGroup: 'hepa', note: 'Препоръчителна.',
  },
  {
    id: 'hpv-1', group: 'vaccine', name: 'HPV — I прием', short: 'HPV I',
    protects: 'онкогенни човешки папиломни вируси', dueMonths: 108, minMonths: 108, graceMonths: 36,
    series: 'hpv', doseNo: 1, mandatory: false, optIn: true, optInGroup: 'hpv',
    note: 'Препоръчителна, по национална програма. От май 2025 г. европейските '
      + 'препоръки, както и Американската академия по педиатрия, поставят началото '
      + 'на 9-годишна възраст — по-ранното начало дава по-добър имунен отговор и '
      + 'по-висока завършваемост. Двудозова схема при начало преди 15 г. '
      + 'Прилага се и на момчета, и на момичета.',
  },
  {
    id: 'hpv-2', group: 'vaccine', name: 'HPV — II прием', short: 'HPV II',
    protects: 'онкогенни човешки папиломни вируси', dueMonths: 114, minMonths: 114, graceMonths: 36,
    series: 'hpv', doseNo: 2, minIntervalM: 6, mandatory: false, optIn: true, optInGroup: 'hpv',
    note: 'Препоръчителна. Най-малко 6 месеца след първия прием.',
  },
  {
    id: 'rsv-nirsevimab', group: 'vaccine', name: 'РСВ — низевимаб', short: 'РСВ',
    protects: 'респираторно-синцитиален вирус', dueMonths: 0, minMonths: 0, graceMonths: 5,
    series: 'rsv', doseNo: 1, mandatory: false, optIn: true, optInGroup: 'rsv',
    note: 'Дълго действащо моноклонално антитяло за всички кърмачета през първия им '
      + 'РСВ сезон, по възможност още преди изписване от родилното. Към 2025 г. 16 от '
      + '23 страни в ЕС/ЕИП имат национални програми. Прилага се сезонно (есен–зима).',
  },
  {
    id: 'menacwy', group: 'vaccine', name: 'Менингококи ACWY', short: 'Мен. ACWY',
    protects: 'инвазивна менингококова инфекция серогрупи A, C, W, Y',
    dueMonths: 132, minMonths: 12, graceMonths: 24,
    series: 'menacwy', doseNo: 1, mandatory: false, optIn: true, optInGroup: 'menacwy',
    note: 'Препоръчителна в юношеска възраст; по-рано — при повишен риск, пътуване '
      + 'или живот в колектив.',
  },
];

/** Ежегодна имунизация — една дефиниция дава по един запис за всяка година. */
function buildAnnualFlu() {
  const items = [];
  for (let m = 6; m <= 216; m += 12) {
    const years = Math.floor(m / 12);
    items.push({
      id: 'flu-' + m, group: 'vaccine',
      name: `Грипна ваксина — ${m < 12 ? '6 мес.' : years + ' г.'}`,
      short: `Грип ${m < 12 ? '6 м.' : years + ' г.'}`,
      protects: 'сезонен грип',
      dueMonths: m, minMonths: Math.max(6, m - 1), graceMonths: 5, expireMonths: 9,
      mandatory: false, optIn: true, optInGroup: 'flu',
      note: m === 6
        ? 'Ежегодна имунизация от навършени 6 месеца. При първа имунизация под 9 г. — две дози с интервал 4 седмици.'
        : 'Прилага се преди началото на грипния сезон.',
    });
  }
  return items;
}

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
      m === 36 ? 'Проверка на зрение и слух. Първо измерване на артериално налягане — от 3 г. се измерва ежегодно.'
        : m === 60 ? 'Оценка на училищна готовност. Артериално налягане.'
          : 'Антропометрия, артериално налягане, физикален статус, зъбен статус.');
  }
  // 7–18 години — веднъж годишно.
  for (let y = 8; y <= 18; y++) {
    push(y * 12, `Профилактичен преглед — ${y} г.`,
      y === 12 ? 'Оценка на пубертетното развитие. Артериално налягане. Скрининг за депресия и тревожност.'
        : 'Антропометрия, артериално налягане, физикален статус, гръбначен стълб.');
  }
  return items;
}

/* --------------------- скрининг на развитието и психичното здраве ---------------------
 *
 * Съставено по периодичната схема Bright Futures на Американската академия по
 * педиатрия и по препоръките на европейските педиатрични дружества:
 *   • скрининг на развитието със стандартизиран инструмент — на 9, 18 и 30 месеца;
 *   • скрининг за разстройство от аутистичния спектър (M-CHAT-R/F) — на 18 и 24 месеца;
 *   • скрининг за следродилна депресия у майката — на прегледите в 1, 2, 4 и 6 месец;
 *   • оценка за депресия и тревожност — ежегодно от 12 години, а по преценка от 8.
 *
 * Тези дейности имат срок на валидност: пропуснат скрининг на 9 месеца не се
 * извършва на 3 години, затова изтича и не задръства списъка със задачи. */
function buildDevelopmentScreenings() {
  const items = [];

  for (const m of [9, 18, 30]) {
    items.push({
      id: 'dev-screen-' + m, group: 'screening',
      name: `Скрининг на развитието — ${m} мес.`, short: `Развитие ${m} м.`,
      dueMonths: m, minMonths: m - 1, graceMonths: 2, expireMonths: 9, mandatory: false,
      note: 'Стандартизиран инструмент за оценка на психомоторното развитие '
        + '(напр. ASQ-3 или PEDS), а не само общо впечатление от прегледа.',
    });
  }

  for (const m of [18, 24]) {
    items.push({
      id: 'asd-screen-' + m, group: 'screening',
      name: `Скрининг за аутистичен спектър — ${m} мес.`, short: `Аутизъм ${m} м.`,
      dueMonths: m, minMonths: m - 1, graceMonths: 2, expireMonths: 9, mandatory: false,
      note: 'Въпросник M-CHAT-R/F. При положителен резултат — уточняващо интервю '
        + 'и насочване, без изчакване до следващия преглед.',
    });
  }

  for (const m of [1, 2, 4, 6]) {
    items.push({
      id: 'maternal-mood-' + m, group: 'screening',
      name: `Скрининг за следродилна депресия у майката — ${m} мес.`,
      short: `Майка ${m} м.`,
      dueMonths: m, minMonths: m - 0.5, graceMonths: 1, expireMonths: 3, mandatory: false,
      note: 'Скалата на Единбург (EPDS) при прегледа на детето. Състоянието на '
        + 'майката пряко влияе върху развитието и храненето на кърмачето.',
    });
  }

  for (let y = 12; y <= 18; y++) {
    items.push({
      id: 'mood-screen-' + y, group: 'screening',
      name: `Скрининг за депресия и тревожност — ${y} г.`, short: `Настроение ${y} г.`,
      dueMonths: y * 12, minMonths: y * 12 - 2, graceMonths: 4, expireMonths: 12, mandatory: false,
      note: 'Ежегодно от 12-годишна възраст със стандартизиран въпросник (напр. PHQ-9 '
        + 'за юноши), с оценка на суициден риск при положителен резултат.',
    });
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
    id: 'vitamin-d', group: 'screening', name: 'Профилактика с витамин D', short: 'Витамин D',
    dueMonths: 0.5, minMonths: 0, graceMonths: 1, expireMonths: 6, mandatory: false,
    note: '400 IU дневно за всяко кърмаче от първите дни, независимо от начина на '
      + 'хранене, и през цялата първа година. Отбележете, че е обсъдено с родителя.',
  },
  {
    id: 'vision-screen', group: 'screening', name: 'Офталмологичен преглед', short: 'Зрение 3 г.',
    dueMonths: 36, minMonths: 30, graceMonths: 12, expireMonths: 18, mandatory: false,
    note: 'Скрининг за амблиопия и рефракционни аномалии. Колкото по-рано се открие '
      + 'амблиопия, толкова по-добър е резултатът от лечението.',
  },
  {
    id: 'vision-screen-5', group: 'screening', name: 'Зрителна острота преди училище', short: 'Зрение 5 г.',
    dueMonths: 60, minMonths: 54, graceMonths: 12, expireMonths: 24, mandatory: false,
    note: 'Проверка на зрителната острота преди постъпване в училище.',
  },
  {
    id: 'vision-screen-10', group: 'screening', name: 'Зрителна острота — 10 г.', short: 'Зрение 10 г.',
    dueMonths: 120, minMonths: 114, graceMonths: 12, expireMonths: 24, mandatory: false,
    note: 'Възрастта, в която най-често се проявява късогледство.',
  },
  {
    id: 'hearing-screen-6', group: 'screening', name: 'Аудиометрия — 6 г.', short: 'Слух 6 г.',
    dueMonths: 72, minMonths: 66, graceMonths: 12, expireMonths: 24, mandatory: false,
    note: 'Тонална аудиометрия при постъпване в училище.',
  },
  {
    id: 'hearing-screen-12', group: 'screening', name: 'Аудиометрия — 12 г.', short: 'Слух 12 г.',
    dueMonths: 144, minMonths: 138, graceMonths: 12, expireMonths: 24, mandatory: false,
    note: 'Включително високите честоти 6000–8000 Hz — за ранно откриване на '
      + 'увреждане от шум и слушалки.',
  },
  {
    id: 'lipids-9', group: 'screening', name: 'Липиден профил — 9–11 г.', short: 'Липиди 9 г.',
    dueMonths: 114, minMonths: 108, graceMonths: 12, expireMonths: 24, mandatory: false,
    note: 'Еднократен универсален скрининг между 9 и 11 години — преди пубертетното '
      + 'понижаване на липидите. По-рано и по-често при фамилна обремененост, '
      + 'затлъстяване или диабет.',
  },
  {
    id: 'lipids-17', group: 'screening', name: 'Липиден профил — 17–21 г.', short: 'Липиди 17 г.',
    dueMonths: 204, minMonths: 198, graceMonths: 12, expireMonths: 24, mandatory: false,
    note: 'Втори универсален скрининг в късна юношеска възраст.',
  },
];

/** Пълният календар по подразбиране. */
export function defaultSchedule() {
  return [
    ...DEFAULT_VACCINES,
    ...buildAnnualFlu(),
    ...buildCheckups(),
    ...DEFAULT_SCREENINGS,
    ...buildDevelopmentScreenings(),
  ].map(item => ({ ...item }));
}

/** Наименования на препоръчителните серии, показвани като една отметка. */
export const OPT_IN_GROUPS = {
  rota: { label: 'Ротавирус', note: 'Двудозова схема в първите месеци.' },
  menb: { label: 'Менингококи B', note: 'Препоръчителна в кърмаческа възраст.' },
  menacwy: { label: 'Менингококи ACWY', note: 'Препоръчителна в юношеска възраст.' },
  hepa: { label: 'Хепатит А', note: 'Двудозова схема след първата година.' },
  hpv: { label: 'HPV', note: 'От 9-годишна възраст, за момчета и момичета.' },
  rsv: { label: 'РСВ (низевимаб)', note: 'През първия РСВ сезон на кърмачето.' },
  flu: { label: 'Грипна ваксина (ежегодно)', note: 'Всяка есен от навършени 6 месеца.' },
};

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
