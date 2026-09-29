/* Табло на практиката за СИМП: часовете за днес, кого да поканим
 * (диспансерно наблюдение, изтичащи протоколи, контролни ехографии),
 * направленията със срок и сигналите по специалности. */

import { api } from '../api.js';
import { assistantDashboardCard } from './assistant-panel.js';
import { state } from '../app.js';
import { badge, card, empty, h, mount, stat, table, toast } from '../ui/components.js';
import { formatAge, formatDate, formatDateShort, relativeDays, today, weekdayName } from '../shared/dates.js';
import { APPT_STATUS, EXAM_TYPES } from '../shared/simp.js';
import { MODULES, enabledModules } from '../shared/specialty.js';
import { bookDialog } from './agenda.js';
import { printWindow } from './adult-print.js';

let filters = { onlyMine: false, horizon: null };

const APPT_CLS = { booked: 'soon', arrived: 'due', done: 'done', noshow: 'overdue', cancelled: 'skipped' };
const FOLLOW_CLS = { soon: 'soon', due: 'due', overdue: 'overdue' };
const WD = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export async function renderSimpDashboard(host) {
  const horizon = filters.horizon ?? state.settings.horizonDays ?? 30;
  const params = { horizon };
  if (filters.onlyMine && state.doctor?.id) params.doctor = state.doctor.id;
  const mods = enabledModules(state.settings);
  const [ov, assistant, ...lists] = await Promise.all([
    api.simpOverview(params),
    api.assistant({ severity: 2, doctor: params.doctor }).catch(() => null),
    ...mods.map(m => api.specialty(m, filters.onlyMine && state.doctor?.id ? { doctor: state.doctor.id } : {}).catch(() => null)),
  ]);
  const reload = () => renderSimpDashboard(host);
  const c = ov.counts;
  const todayISO = today();
  const openPatient = (id) => () => { location.hash = '#/patient/' + id; };
  const bookFor = (row, reason, examType = 'dispensary') => (e) => {
    e.stopPropagation();
    bookDialog({ patient: { id: row.patientId, name: row.name, phone: row.phone, birthDate: row.birthDate }, examType, reason, onDone: reload });
  };
  const bookedCell = (row, reason) => (row.booked
    ? h('span.small', null, '📅 ', formatDateShort(row.booked.date), ', ', row.booked.time)
    : h('button.btn.xs.primary.no-print', { onclick: bookFor(row, reason) }, 'Запиши час'));

  const late = ov.followups.filter(f => f.status !== 'soon');
  const stats = h('div.grid.cols-4', null,
    stat(c.today, 'часа днес', {
      foot: `${c.arrived} в чакалнята · ${c.done} прегледани${c.noshow ? ` · ${c.noshow} не дошли` : ''}`,
      onclick: () => { location.hash = '#/agenda'; },
    }),
    stat(c.examsMonth, 'прегледа този месец', { foot: `${c.examsToday} днес` }),
    stat(late.length, 'за диспансерен преглед', {
      kind: ov.followups.some(f => f.status === 'overdue') ? 'danger' : late.length ? 'warn' : 'ok',
      foot: `${ov.followups.filter(f => f.status === 'overdue').length} просрочени · ${ov.followups.filter(f => f.status === 'soon').length} предстоят`,
    }),
    stat(ov.protocols.length, 'протокола за подновяване', {
      kind: ov.protocols.some(p => p.status === 'expired') ? 'danger' : ov.protocols.length ? 'warn' : 'ok',
      foot: `${c.patients} пациенти в регистъра`,
    }));

  const week = h('div.week-strip.mini', null, ov.week.map(d => h('button.week-day' + (d.date === todayISO ? '.today' : ''), {
    onclick: () => { location.hash = '#/agenda'; },
    title: 'Към графика',
  }, h('div.wd', null, WD[new Date(d.date + 'T12:00').getDay()]),
  h('div.dn', null, d.date.slice(8, 10).replace(/^0/, '') + '.' + d.date.slice(5, 7)),
  h('div.cnt', null, d.count ? `${d.count} ${d.count === 1 ? 'час' : 'часа'}` : '—'))));

  const todayRows = ov.today.map(a => {
    const name = a.patient ? a.patient.name : a.name;
    const setStatus = (status) => async (e) => {
      e.stopPropagation();
      try { await api.updateAppointment(a.id, { status }); reload(); } catch (err) { toast(err.message, 'error'); }
    };
    return h('tr' + (a.patientId ? '.clickable' : '') + (a.status === 'arrived' ? '.attention' : ''), { onclick: a.patientId ? openPatient(a.patientId) : null },
      h('td.nowrap.mono', null, a.time),
      h('td.name-cell', null, name, a.patient ? h('div.tiny.dim', null, formatAge(a.patient.birthDate)) : h('div.tiny.dim', null, 'още без досие')),
      h('td.small', null, [...new Set([a.examType && EXAM_TYPES[a.examType]?.label, a.reason].filter(Boolean))].join(' · ') || '—'),
      h('td.small.mono.nowrap', null, a.phone || '—'),
      h('td', null, badge(APPT_CLS[a.status], APPT_STATUS[a.status])),
      h('td.actions.no-print', null,
        a.status === 'booked' ? h('button.btn.xs.primary', { onclick: setStatus('arrived') }, 'Дойде') : null,
        a.status === 'arrived' && a.patientId ? h('button.btn.xs.primary', {
          onclick: (e) => { e.stopPropagation(); location.hash = `#/patient/${a.patientId}?exam=${a.id}`; },
        }, 'Преглед') : null,
        a.status === 'arrived' && !a.patientId ? h('button.btn.xs', { onclick: (e) => { e.stopPropagation(); location.hash = '#/agenda'; } }, 'В графика') : null));
  });

  const followRows = ov.followups.map(f => h('tr.clickable' + (f.status === 'overdue' ? '.attention' : ''), { onclick: openPatient(f.patientId) },
    h('td.name-cell', null, f.name, h('div.tiny.dim', null, formatAge(f.birthDate))),
    h('td.small', null, f.diagnosis, h('div.tiny.dim', null, `на ${f.everyMonths} мес.${f.last ? ` · последен ${formatDateShort(f.last)}` : ''}`)),
    h('td.nowrap.small', null, formatDateShort(f.due), h('div', null, badge(FOLLOW_CLS[f.status], f.status === 'overdue' ? `просрочен ${f.overdueDays} дни` : f.status === 'due' ? 'дължим' : relativeDays(f.due)))),
    h('td.small.mono.nowrap', null, f.phone || '—'),
    h('td.actions', null, bookedCell(f, `Диспансерен преглед — ${f.diagnosis}`))));

  const protoRows = ov.protocols.map(pr => h('tr.clickable' + (pr.status === 'expired' ? '.attention' : ''), { onclick: openPatient(pr.patientId) },
    h('td.name-cell', null, pr.name),
    h('td.small', null, pr.drugs.join(', '), pr.number ? h('div.tiny.dim', null, '№ ' + pr.number) : null),
    h('td.nowrap.small', null, formatDateShort(pr.validUntil), h('div', null, badge(pr.status === 'expired' ? 'overdue' : 'due', pr.label.toLowerCase()))),
    h('td.actions', null, bookedCell(pr, 'Подновяване на протокол', 'dispensary'))));

  const refRows = ov.referrals.map(r => h('tr.clickable', { onclick: openPatient(r.patientId) },
    h('td.name-cell', null, r.name),
    h('td.small', null, r.number || 'без номер', h('div.tiny.dim', null, `${r.purpose}${r.fromName ? ' · ' + r.fromName : ''}`)),
    h('td', null, r.status === 'secondary'
      ? badge(r.daysLeft <= 5 ? 'due' : 'soon', `вторичен до ${formatDateShort(r.secondaryUntil)}`)
      : badge('due', r.waiting > 0 ? `чака ${r.waiting} ${r.waiting === 1 ? 'ден' : 'дни'}` : 'очаква преглед')),
    h('td.actions', null, r.booked ? h('span.small', null, '📅 ', formatDateShort(r.booked.date)) : h('button.btn.xs.no-print', {
      onclick: bookFor(r, r.status === 'secondary' ? 'Вторичен преглед' : 'Първичен преглед', r.status === 'secondary' ? 'secondary' : 'primary'),
    }, 'Запиши час'))));

  const noduleRows = ov.nodules.map(n => h('tr.clickable' + (n.status === 'overdue' ? '.attention' : ''), { onclick: openPatient(n.patientId) },
    h('td.name-cell', null, n.name),
    h('td.small', null, `${n.lobe} · ${n.category}`),
    h('td.nowrap.small', null, formatDateShort(n.due), h('div', null, badge(n.status === 'overdue' ? 'overdue' : 'soon', n.status === 'overdue' ? 'просрочена' : relativeDays(n.due)))),
    h('td.actions', null, bookedCell(n, 'Контролна ехография на възел'))));

  const moduleCards = lists.filter(Boolean).map(w => {
    const m = MODULES[w.module];
    const top = w.groups.slice().sort((a, b) => b.patients.length - a.patients.length).slice(0, 6);
    return card(`${m.name} — сигнали`, {
      icon: m.icon, tight: true,
      actions: h('button.btn.sm', { onclick: () => { location.hash = '#/reports'; } }, 'Списъци'),
    }, top.length ? h('ul.list-plain.pad', null, top.map(g => h('li.row', null,
      h('span.grow.small', null, g.label),
      badge(g.patients.some(p => p.severity >= 3) ? 'overdue' : g.patients.some(p => p.severity === 2) ? 'due' : 'soon', g.patients.length))))
      : empty(`Няма сигнали в ${w.considered} досиета.`, '✓'));
  });

  const controls = h('div.row.no-print', null,
    h('div.chips', null,
      h('button.chip' + (filters.onlyMine ? '' : '.active'), { onclick: () => { filters.onlyMine = false; reload(); } }, 'Цялата практика'),
      state.doctors.filter(d => d.active).length > 1
        ? h('button.chip' + (filters.onlyMine ? '.active' : ''), { onclick: () => { filters.onlyMine = true; reload(); } }, 'Моите') : null),
    h('div.grow'),
    h('select', { style: { width: 'auto' }, onchange: (e) => { filters.horizon = Number(e.target.value); reload(); } },
      [7, 14, 30, 60, 90].map(d => h('option', { value: d, selected: d === horizon }, `следващите ${d} дни`))),
    h('button.btn', { onclick: () => printCallList(ov) }, '🖨 Списък за обаждане'),
    h('button.btn.primary', { onclick: () => bookDialog({ onDone: reload }) }, '＋ Час'));

  mount(host,
    h('div.page-head', null,
      h('div.titles', null,
        h('h1', null, 'Табло'),
        h('div.muted.small', null, `${weekdayName(todayISO)}, ${formatDate(todayISO)} · ${state.practice.name}`)),
      controls),
    stats,
    h('div', { style: { height: '12px' } }),
    week,
    h('div', { style: { height: '12px' } }),
    h('div.overview-grid', null,
      h('div.col', null,
        card(`Днес (${ov.today.length})`, {
          icon: '📅', tight: true,
          actions: h('button.btn.sm', { onclick: () => { location.hash = '#/agenda'; } }, 'График'),
        }, todayRows.length ? table(['Час', 'Пациент', 'Повод', 'Телефон', 'Състояние', ''], todayRows) : empty('Няма записани часове за днес.', '☕')),
        card(`Диспансерно наблюдение (${ov.followups.length})`, { icon: '🗓', tight: true },
          followRows.length ? table(['Пациент', 'Заболяване', 'Срок', 'Телефон', ''], followRows) : empty('Няма дължими диспансерни прегледи.', '✓'))),
      h('div.col', null,
        assistantDashboardCard(assistant),
        card(`Протоколи за подновяване (${ov.protocols.length})`, { icon: '📄', tight: true },
          protoRows.length ? table(['Пациент', 'Лекарства', 'Валиден до', ''], protoRows) : empty('Няма изтичащи протоколи.', '✓')),
        card(`Направления (${ov.referrals.length})`, { icon: '📨', tight: true },
          refRows.length ? table(['Пациент', 'Направление', 'Състояние', ''], refRows) : empty('Няма направления, които чакат преглед.', '✓')),
        noduleRows.length ? card(`Контролни ехографии на възли (${noduleRows.length})`, { icon: '🦋', tight: true },
          table(['Пациент', 'Възел', 'Срок', ''], noduleRows)) : null,
        moduleCards)),
    ov.broken ? h('p.small.muted', null, `${ov.broken} досиета не могат да бъдат обработени — подробностите са в дневника на програмата.`) : null);
}

/** Кого да поканим: диспансерни прегледи и протоколи без записан час. */
function printCallList(ov) {
  const rows = [
    ...ov.followups.filter(f => !f.booked && f.status !== 'soon').map(f => ({ ...f, what: `Диспансерен преглед — ${f.diagnosis} (срок ${formatDate(f.due)})` })),
    ...ov.protocols.filter(p => !p.booked).map(p => ({ ...p, what: `Протокол: ${p.drugs.join(', ')} — валиден до ${formatDate(p.validUntil)}` })),
    ...ov.nodules.filter(n => !n.booked).map(n => ({ ...n, what: `Контролна ехография на възел (${formatDate(n.due)})` })),
  ];
  if (!rows.length) { toast('Няма пациенти за обаждане — всички имат записан час.'); return; }
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.patientId)) by.set(r.patientId, { name: r.name, phone: r.phone, birthDate: r.birthDate, items: [] });
    by.get(r.patientId).items.push(r.what);
  }
  printWindow('Списък за обаждане', '', ({ el, add, tableOf }) => {
    add(el('h1', 'Списък за обаждане'));
    add(el('div', `${state.practice.name} · ${formatDate(today())} · ${by.size} пациенти`, 'practice'));
    add(tableOf(['✓', 'Пациент', 'Възраст', 'Телефон', 'За какво', 'Записан за'], [...by.values()].map(p => [
      '☐', p.name, formatAge(p.birthDate), p.phone || '—', p.items.join('\n'), '',
    ])));
  });
}
