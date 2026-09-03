/* Справка за календара, който практиката прилага. */

import { state } from '../app.js';
import { card, h, mount, table } from '../ui/components.js';
import { CALENDAR_VERIFIED, GROUPS } from '../shared/calendar.js';

export async function renderCalendar(host) {
  const groups = ['vaccine', 'screening', 'checkup'];

  const sections = groups.map(g => {
    const items = state.schedule
      .filter(i => i.group === g && !i.disabled)
      .sort((a, b) => a.dueMonths - b.dueMonths);
    if (!items.length) return null;

    const rows = items.map(i => h('tr', null,
      h('td.nowrap', null, h('strong', null, ageLabel(i.dueMonths))),
      h('td', null,
        h('div', { style: { fontWeight: '600' } }, i.name),
        i.protects ? h('div.tiny.dim', null, 'предпазва от: ' + i.protects) : null),
      h('td.small.muted', null, i.note || ''),
      h('td.nowrap.small', null, i.optIn
        ? h('span.badge', null, 'препоръчителна')
        : i.mandatory ? h('span.badge.done', null, 'задължителна') : h('span.badge', null, 'по преценка'))));

    return card(`${GROUPS[g].label} (${items.length})`, { icon: GROUPS[g].icon, tight: true },
      table(['Възраст', 'Дейност', 'Бележка', 'Вид'], rows));
  }).filter(Boolean);

  mount(host,
    h('div.page-head', null,
      h('div.titles', null,
        h('h1', null, 'Календар на практиката'),
        h('div.muted.small', null,
          'Тези срокове се прилагат автоматично за всяко дете в регистъра.'))),

    h('div.alert-strip.info', { style: { marginBottom: '16px' } },
      h('div', null,
        h('strong', null, 'Съдържанието е настройваемо. '),
        'Календарът следва задължителния имунизационен календар на Република България '
        + '(Наредба № 15), включително задължителната имунизация срещу варицела в сила от 01.07.2026 г. '
        + `Последна проверка на съдържанието: ${CALENDAR_VERIFIED.replace('-', ' г., месец ')}. `
        + 'При промяна в наредбата редактирайте сроковете от „Настройки → Календар“.')),

    h('div.stack', null, sections));
}

function ageLabel(months) {
  if (months === 0) return 'при раждане';
  if (months < 12) return months % 1 ? `${months} мес.` : `${months} мес.`;
  const y = Math.floor(months / 12), m = Math.round(months % 12);
  return m ? `${y} г. ${m} мес.` : `${y} г.`;
}
