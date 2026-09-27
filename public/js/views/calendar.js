/* Справка за календара, който практиката прилага — за деца и за възрастни. */

import { state } from '../app.js';
import { card, h, mount, table } from '../ui/components.js';
import { CALENDAR_VERIFIED, GROUPS } from '../shared/calendar.js';
import { adultWhen } from './settings.js';

let track = 'child';

export async function renderCalendar(host) {
  const groups = ['vaccine', 'screening', 'checkup'];
  const adult = track === 'adult';
  const key = (i) => (i.recur ? i.recur.fromMonths : i.seasonal ? i.fromMonths ?? 216 : i.dueMonths);

  const sections = groups.map(g => {
    const items = state.schedule
      .filter(i => i.group === g && !i.disabled && (i.track === 'adult') === adult)
      .sort((a, b) => key(a) - key(b));
    if (!items.length) return null;

    const rows = items.map(i => h('tr', null,
      h('td.nowrap', null, h('strong', null, adult ? adultWhen(i) : ageLabel(i.dueMonths))),
      h('td', null,
        h('div', { style: { fontWeight: '600' } }, i.name,
          i.sex ? h('span.tiny.dim', null, i.sex === 'f' ? ' · жени' : ' · мъже') : null),
        i.protects ? h('div.tiny.dim', null, 'предпазва от: ' + i.protects) : null),
      h('td.small.muted', null, i.note || ''),
      h('td.nowrap.small', null, i.optIn
        ? h('span.badge', null, 'препоръчителна')
        : i.mandatory ? h('span.badge.done', null, 'задължителна') : h('span.badge', null, 'по преценка'))));

    return card(`${GROUPS[g].label} (${items.length})`, { icon: GROUPS[g].icon, tight: true },
      table([adult ? 'Кога' : 'Възраст', 'Дейност', 'Бележка', 'Вид'], rows));
  }).filter(Boolean);

  mount(host,
    h('div.page-head', null,
      h('div.titles', null,
        h('h1', null, 'Календар на практиката'),
        h('div.muted.small', null,
          'Тези срокове се прилагат автоматично за всеки пациент в регистъра.')),
      h('div.chips.no-print', null,
        h('button.chip' + (!adult ? '.active' : ''), { onclick: () => { track = 'child'; renderCalendar(host); } }, 'Деца'),
        h('button.chip' + (adult ? '.active' : ''), { onclick: () => { track = 'adult'; renderCalendar(host); } }, 'Възрастни'))),

    h('div.alert-strip.info', { style: { marginBottom: '16px' } },
      adult
        ? h('div', null,
          h('strong', null, 'Профилактика при възрастни. '),
          'Ежегоден профилактичен преглед (Наредба № 8), реимунизация срещу тетанус и дифтерия на 25 г. и на всеки 10 години (Наредба № 15), '
          + 'скрининг за рак на гърдата, шийката на матката и дебелото черво (Препоръка на Съвета на ЕС, 2022), '
          + 'оценка на сърдечно-съдовия риск (ESC 2021), ваксини срещу грип, COVID-19, пневмококи и РСВ (ECDC). '
          + 'При хронично заболяване ваксините се дължат по-рано. Сроковете се редактират от „Настройки → Календар“.')
        : h('div', null,
          h('strong', null, 'Съдържанието е настройваемо. '),
          'Календарът следва задължителния имунизационен календар на Република България '
          + '(Наредба № 15), включително задължителната имунизация срещу варицела в сила от 01.07.2026 г. '
          + `Последна проверка на съдържанието: ${CALENDAR_VERIFIED.replace('-', ' г., месец ')}. `
          + 'При промяна в наредбата редактирайте сроковете от „Настройки → Календар“.')),

    h('div.stack', null, sections));
}

function ageLabel(months) {
  if (months === 0) return 'при раждане';
  if (months < 12) return `${months} мес.`;
  const y = Math.floor(months / 12), m = Math.round(months % 12);
  return m ? `${y} г. ${m} мес.` : `${y} г.`;
}
