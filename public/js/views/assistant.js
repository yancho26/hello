/* Асистентът на практиката: пациентите, чието състояние изисква
 * допълнителна проверка или изследване, подредени по спешност. Оттук
 * лекарят отваря досието направо на подсказките или отпечатва списък
 * за обаждане. */

import { api } from '../api.js';
import { state } from '../app.js';
import { card, empty, h, mount, select, stat, table, toast } from '../ui/components.js';
import { formatAge, formatDate } from '../shared/dates.js';
import { CATEGORIES, SEVERITY } from '../shared/assistant.js';
import { printWindow } from './adult-print.js';
import { sevBadge } from './assistant-panel.js';

let filter = { severity: '1', category: '', doctor: '' };
const SHOW = 60;

export async function renderAssistant(host) {
  const rerender = () => renderAssistant(host);
  const data = await api.assistant({ severity: filter.severity, category: filter.category, doctor: filter.doctor });
  const t = data.totals;
  let limit = SHOW;

  const sevSelect = select([
    { value: '1', label: 'всички подсказки' },
    { value: '2', label: 'спешни и скоро' },
    { value: '3', label: 'само спешни' },
  ].map(o => ({ ...o, selected: filter.severity === o.value })), {
    style: { width: 'auto' }, 'aria-label': 'Спешност',
    onchange: (e) => { filter.severity = e.target.value; rerender(); },
  });
  const catSelect = select([
    { value: '', label: 'всички видове', selected: !filter.category },
    ...Object.entries(CATEGORIES).map(([value, label]) => ({ value, label, selected: filter.category === value })),
  ], { style: { width: 'auto' }, 'aria-label': 'Вид', onchange: (e) => { filter.category = e.target.value; rerender(); } });
  const doctors = state.doctors.filter(d => d.active);
  const doctorSelect = doctors.length > 1 ? select([
    { value: '', label: 'всички лекари', selected: !filter.doctor },
    ...doctors.map(d => ({ value: d.id, label: d.name, selected: filter.doctor === d.id })),
  ], { style: { width: 'auto' }, 'aria-label': 'Лекар', onchange: (e) => { filter.doctor = e.target.value; rerender(); } }) : null;

  const open = (id) => { location.hash = `#/patient/${id}?tab=assistant`; };
  const row = (p) => h('tr.clickable', { onclick: () => open(p.id) },
    h('td', null, h('div.name-cell', null, p.name), h('div.tiny.dim', null, formatAge(p.birthDate), p.phone ? ' · ' + p.phone : '')),
    h('td.nowrap', null, sevBadge(p.severity)),
    h('td.small', null, h('ul.af-mini', null, p.findings.map(f => h('li.s' + f.severity, null, f.title))),
      p.count > p.findings.length ? h('div.tiny.dim', null, `и още ${p.count - p.findings.length}`) : null));

  const list = h('div');
  const drawList = () => mount(list,
    table(['Пациент', 'Спешност', 'Какво да се провери'], data.patients.slice(0, limit).map(row)),
    data.patients.length > limit ? h('div.body', null, h('button.btn.sm', {
      onclick: () => { limit += SHOW; drawList(); },
    }, `Покажи още (${data.patients.length - limit})`)) : null);
  drawList();

  const catRows = Object.entries(t.byCategory).sort((a, b) => b[1] - a[1]);

  mount(host,
    h('div.page-head', null,
      h('div.titles', null,
        h('h1', null, 'Асистент'),
        h('div.muted.small', null, `${state.practice.name} · към ${formatDate(data.asOf)}`)),
      h('div.row.no-print', { style: { flexWrap: 'wrap' } }, sevSelect, catSelect, doctorSelect,
        h('button.btn', { onclick: () => printCallList(data), title: 'Списък с телефоните и какво да се направи' }, '🖨 Списък за обаждане'))),

    h('div.grid.cols-4', null,
      stat(t.patients, 'пациенти с подсказки', { foot: `${t.findings} подсказки общо` }),
      stat(t.bySeverity[3], SEVERITY[3].label, { kind: t.bySeverity[3] ? 'danger' : 'ok', foot: SEVERITY[3].hint }),
      stat(t.bySeverity[2], SEVERITY[2].label, { kind: t.bySeverity[2] ? 'warn' : 'ok', foot: SEVERITY[2].hint }),
      stat(t.bySeverity[1], SEVERITY[1].label, { foot: SEVERITY[1].hint })),
    h('div', { style: { height: '16px' } }),

    h('div.assistant-layout', null,
      card(data.patients.length ? `Пациенти за внимание (${data.patients.length})` : 'Пациенти за внимание', { icon: '🧭', tight: true },
        data.patients.length ? list : empty('Няма пациенти с подсказки по избраните условия.', '✓')),
      h('div.stack', null,
        catRows.length ? card('По вид', { icon: '🗂', tight: true },
          table(['Вид', { label: 'Брой', class: 'right' }], catRows.map(([k, n]) => h('tr.clickable', {
            onclick: () => { filter.category = filter.category === k ? '' : k; rerender(); },
          }, h('td.small', null, CATEGORIES[k]), h('td.mono.right', null, n))))) : null,
        card('Как работи', { icon: 'ℹ️' },
          h('p.small', { style: { marginTop: 0 } },
            'Асистентът преглежда всяко досие: отклонени резултати и промени във времето, кръвно и тегло, лекарства, които изискват контрол, '
            + 'пропуснат скрининг, просрочено проследяване и тревожни оплаквания в текста на прегледите.'),
          h('p.small', null,
            'За всяка подсказка казва какво да се направи, защо и по коя насока. Отбележете „Прието“, „Направено“, „Отложи“ или „Не е приложимо“ в досието; '
            + 'решението се помни и подсказката се връща само след срока или при нови данни.'),
          h('p.tiny.muted', { style: { marginBottom: 0 } },
            'Всичко се изчислява на този компютър. Правилата следват европейските и американските насоки, сверени към септември 2026 г.; списъкът е в Настройки, раздел „Асистент“. '
            + 'Подсказките помагат, но не заменят преценката на лекаря.')))),
    data.broken ? h('p.tiny.muted', null, `${data.broken} досиета не можаха да бъдат прегледани; подробности в дневника на програмата.`) : null);
}

/** Отпечатва списък за обаждане: пациент, телефон, какво да се направи. */
function printCallList(data) {
  if (!data.patients.length) { toast('Няма пациенти в списъка.'); return; }
  printWindow('Асистент — списък за обаждане', `
    .s3 { color: #b3261e; font-weight: 600; }
    .s2 { color: #8a4b00; }
    td:first-child { width: 34%; }
    .box { display: inline-block; width: 3.5mm; height: 3.5mm; border: 1px solid #777; margin-right: 2mm; vertical-align: -0.5mm; }
  `, ({ el, add, tableOf, doc }) => {
    add(el('h1', 'Списък за обаждане'));
    add(el('div', `${state.practice.name} · ${formatDate(data.asOf)} · ${data.patients.length} пациенти`, 'practice'));
    const rows = data.patients.map(p => {
      const who = el('div');
      const box = el('span', undefined, 'box');
      who.appendChild(box);
      who.appendChild(el('b', p.name));
      who.appendChild(el('div', `${formatAge(p.birthDate)}${p.phone ? ' · тел. ' + p.phone : ''}`, 'muted'));
      const what = doc.createElement('ul');
      for (const f of p.findings) {
        const li = el('li', `${f.title}. ${f.action}`, 's' + f.severity);
        what.appendChild(li);
      }
      if (p.count > p.findings.length) what.appendChild(el('li', `и още ${p.count - p.findings.length} в досието`, 'muted'));
      return [who, what];
    });
    add(tableOf(['Пациент', 'Какво да се направи'], rows));
    add(el('div', 'Подсказките на асистента са за преценка от лекаря. Отбележете решението в досието, раздел „Асистент“.', 'note'));
  });
}

