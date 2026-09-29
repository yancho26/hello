/* Справки на практиката за СИМП: дейност за период (прегледи по вид, по
 * лекар и по месеци, чести диагнози, насочващи лекари, неявили се),
 * диспансерно наблюдение, протоколи и списъците за действие по
 * специалности. Прегледите за периода се свалят и като файл за Excel. */

import { api } from '../api.js';
import { state } from '../app.js';
import { card, downloadFile, empty, h, input, mount, select, stat, table, toast } from '../ui/components.js';
import { addDays, addMonths, formatDate, monthName, today } from '../shared/dates.js';
import { makeXlsx } from '../shared/xlsx-writer.js';
import { enabledModules } from '../shared/specialty.js';
import { worklistCard } from './reports.js';

let period = { preset: 'month', from: null, to: null, doctor: '' };

function range() {
  const t = today();
  const monthStart = t.slice(0, 8) + '01';
  switch (period.preset) {
    case 'prev': {
      const start = addMonths(monthStart, -1);
      return { from: start, to: addDays(monthStart, -1) };
    }
    case 'quarter': {
      const m = Number(t.slice(5, 7));
      const q = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${t.slice(0, 4)}-${String(q).padStart(2, '0')}-01`, to: t };
    }
    case 'year': return { from: t.slice(0, 4) + '-01-01', to: t };
    case 'custom': return { from: period.from || monthStart, to: period.to || t };
    default: return { from: monthStart, to: t };
  }
}

const bar = (n, max) => h('div', { style: { flex: 1, height: '8px', background: 'var(--line)', borderRadius: '4px', minWidth: '80px' } },
  h('div', { style: { height: '100%', width: max ? Math.round((n / max) * 100) + '%' : 0, background: 'var(--brand)', borderRadius: '4px', minWidth: n ? '3px' : 0 } }));
const countRows = (items, label) => {
  const max = Math.max(0, ...items.map(i => i.count));
  return items.map(i => h('tr', null, h('td', null, label(i)), h('td.mono.right', null, i.count), h('td', { style: { minWidth: '140px' } }, bar(i.count, max))));
};

export async function renderSimpReports(host) {
  const { from, to } = range();
  const rerender = () => renderSimpReports(host);
  const mods = enabledModules(state.settings);
  const [rep, ...worklists] = await Promise.all([
    api.simpReports({ from, to, doctor: period.doctor }),
    ...mods.map(m => api.specialty(m, { doctor: period.doctor }).catch(() => null)),
  ]);
  const ex = rep.exams;
  const pct = (n, d) => (d ? Math.round((n / d) * 100) + '%' : '—');

  const presetSelect = select([
    ['month', 'този месец'], ['prev', 'миналия месец'], ['quarter', 'това тримесечие'], ['year', 'тази година'], ['custom', 'избран период'],
  ].map(([value, label]) => ({ value, label, selected: period.preset === value })), {
    style: { width: 'auto' },
    onchange: (e) => { period.preset = e.target.value; if (period.preset === 'custom') { period.from = from; period.to = to; } rerender(); },
  });
  const custom = period.preset === 'custom' ? [
    input({ type: 'date', value: from, max: today(), onchange: (e) => { period.from = e.target.value; rerender(); } }),
    input({ type: 'date', value: to, max: today(), onchange: (e) => { period.to = e.target.value; rerender(); } }),
  ] : null;
  const doctors = state.doctors.filter(d => d.active);
  const doctorSelect = doctors.length > 1 ? select([
    { value: '', label: 'всички лекари', selected: !period.doctor },
    ...doctors.map(d => ({ value: d.id, label: d.name, selected: period.doctor === d.id })),
  ], { style: { width: 'auto' }, onchange: (e) => { period.doctor = e.target.value; rerender(); } }) : null;

  const exportExcel = () => {
    if (!rep.rows.length) { toast('Няма прегледи за избрания период.'); return; }
    const rows = [['Дата', 'Час', 'Пациент', 'ЕГН', 'Вид на прегледа', 'МКБ-10', 'Диагноза', 'Направление (НРН)', 'Цел', 'Насочил', 'Лекар']];
    for (const r of rep.rows) rows.push([r.date, r.time, r.patient, r.egn, r.type, r.icd, r.diagnosis, r.referral, r.purpose, r.referrer, r.doctor]);
    downloadFile(makeXlsx([{ name: 'Прегледи', rows, widths: [12, 7, 30, 13, 24, 9, 40, 16, 20, 24, 24], dateColumns: [0] }]),
      `pregledi-${from}-${to}.xlsx`);
    toast(`Изтеглени са ${rep.rows.length} прегледа.`, 'ok');
  };

  const monthLabel = (m) => `${monthName(Number(m.month.slice(5, 7)))} ${m.month.slice(0, 4)}`;

  mount(host,
    h('div.page-head', null,
      h('div.titles', null,
        h('h1', null, 'Справки'),
        h('div.muted.small', null, `${state.practice.name} · ${formatDate(from)} – ${formatDate(to)}`)),
      h('div.row.no-print', { style: { flexWrap: 'wrap' } }, presetSelect, custom, doctorSelect,
        h('button.btn', { onclick: exportExcel, title: 'Всички прегледи за периода като файл за Excel' }, '⭱ Excel'),
        h('button.btn', { onclick: () => window.print() }, '🖨 Отпечатай'))),

    h('div.grid.cols-4', null,
      stat(ex.total, 'прегледа', { foot: `${ex.patients} пациенти · ${ex.newPatients} нови` }),
      stat(pct(ex.withReferral, ex.total), 'с направление', { foot: `${ex.withReferral} с направление · ${ex.withoutReferral} без` }),
      stat(rep.appointments.noshowPct === null ? '—' : rep.appointments.noshowPct + '%', 'не дошли на записан час', {
        kind: rep.appointments.noshowPct >= 15 ? 'warn' : '',
        foot: `${rep.appointments.kept} дошли · ${rep.appointments.noshow} не дошли · ${rep.appointments.cancelled} отказани`,
      }),
      stat(rep.followups.active, 'на диспансерно наблюдение', {
        kind: rep.followups.overdue ? 'warn' : 'ok',
        foot: `${rep.followups.overdue} просрочени · ${rep.protocols.active} активни протокола (${rep.protocols.expiring} изтичат)`,
      })),
    h('div', { style: { height: '16px' } }),

    h('div.grid.cols-2', null,
      card('Прегледи по вид', { icon: '🩺', tight: true },
        ex.byType.length ? table(['Вид', { label: 'Брой', class: 'right' }, ''], countRows(ex.byType, i => i.label)) : empty('Няма прегледи за периода.', null)),
      card(ex.byMonth.length > 1 ? 'Прегледи по месеци' : 'Прегледи по лекар', { icon: '📈', tight: true },
        ex.byMonth.length > 1
          ? table(['Месец', { label: 'Брой', class: 'right' }, ''], countRows(ex.byMonth, monthLabel))
          : ex.byDoctor.length ? table(['Лекар', { label: 'Брой', class: 'right' }, ''], countRows(ex.byDoctor, i => i.name)) : empty('Няма прегледи.', null))),
    ex.byMonth.length > 1 && ex.byDoctor.length > 1 ? [h('div', { style: { height: '16px' } }),
      card('Прегледи по лекар', { icon: '👩‍⚕️', tight: true }, table(['Лекар', { label: 'Брой', class: 'right' }, ''], countRows(ex.byDoctor, i => i.name)))] : null,
    h('div', { style: { height: '16px' } }),

    h('div.grid.cols-2', null,
      card('Най-чести диагнози', { icon: '🏷', tight: true },
        rep.diagnoses.length ? table(['Диагноза', { label: 'Брой', class: 'right' }, ''], countRows(rep.diagnoses, d => [h('strong', null, d.icd || '—'), ' ', d.text])) : empty('Няма диагнози за периода.', null)),
      card('Насочващи лекари', { icon: '📨', tight: true },
        rep.referrers.length ? table(['Лекар', { label: 'Прегледи', class: 'right' }, ''], countRows(rep.referrers, r => [r.name, r.uin ? h('div.tiny.dim', null, 'УИН ' + r.uin) : null]))
          : empty('Няма прегледи по направление за периода.', null))),

    worklists.filter(Boolean).map(w => [h('div', { style: { height: '16px' } }), worklistCard(w)]),

    h('p.tiny.muted', { style: { marginTop: '14px' } },
      'Прегледите се броят по датата им. „Нови“ са пациентите с първи преглед в практиката през периода. '
      + 'Процентът неявили се е от записаните часове до днес, без отказаните.'));
}
