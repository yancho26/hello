/* Досие на възрастен пациент: обзор, хронични заболявания, лекарства,
 * изследвания, измервания, профилактика и психично здраве. */

import { api } from '../api.js';
import { scheduleItem, state } from '../app.js';
import { badge, card, empty, h, table, toast } from '../ui/components.js';
import { trendChart } from '../ui/trend-chart.js';
import { durationText, formatDate, formatDateShort, relativeDays, today } from '../shared/dates.js';
import { ACTIONABLE } from '../shared/schedule.js';
import { OPT_IN_GROUPS } from '../shared/calendar.js';
import { CONDITIONS, REQUIREMENTS, bpTarget, hba1cTarget } from '../shared/chronic.js';
import {
  CHECKS, LABS, LAB_GROUPS, egfrSeries, flagFor, formatLab, isCheck, labName, nonHdl, rangeFor, rangeText, resultSeries, round,
} from '../shared/labs.js';
import { DRUGS } from '../shared/drugs.js';
import { SCHEDULE_SLOTS, activeMeds, medLabel } from '../shared/meds.js';
import { TOOLS } from '../shared/mental.js';
import { KDIGO_RISK_LABELS } from '../shared/clinical.js';
import { planRow } from './plan-row.js';
import { markDoneDialog } from './record-dialog.js';
import {
  adultMeasurementDialog, alertStrip, assessmentDialog, conditionDialog, deleteWithConfirm, findriscDialog,
  medDialog, openForRequirement, renewDialog, resultsDialog, runsOut, stopMedDialog,
} from './adult-dialogs.js';
import { printMedList } from './adult-print.js';

const dec = (v) => String(v ?? '').replace('.', ',');
const lastText = (t) => (t.last ? ` · последно ${formatDate(t.last)}`
  : t.assumed ? ` · прието при внасяне ${formatDate(t.assumed)}` : ' · няма запис');
const reasonsText = (list, max = 3) => (list.length > max ? `${list.slice(0, max).join(', ')} и още ${list.length - max}` : list.join(', '));
const STATUS_CLS = { good: 'done', ok: 'done', partial: 'due', bad: 'overdue', unknown: 'future' };

export const ADULT_TABS = [
  { id: 'overview', label: 'Обзор' },
  { id: 'chronic', label: 'Хронични заболявания' },
  { id: 'meds', label: 'Лекарства' },
  { id: 'labs', label: 'Изследвания' },
  { id: 'vitals', label: 'Измервания' },
  { id: 'prevention', label: 'Профилактика' },
  { id: 'mental', label: 'Психично здраве' },
  { id: 'nutrition', label: 'Хранене' },
  { id: 'visits', label: 'Прегледи' },
  { id: 'reminders', label: 'Напомняния' },
];

/** Броячи до имената на разделите. */
export function adultTabCount(id, ctx) {
  const { a, p, data } = ctx;
  if (id === 'chronic') return a.monitoring.filter(t => t.status === 'overdue' || t.status === 'due').length;
  if (id === 'meds') return a.medAlerts.filter(x => x.severity === 'contra' || x.severity === 'major').length
    + a.renewals.filter(r => r.status === 'overdue').length;
  if (id === 'prevention') return data.plan.filter(e => ACTIONABLE.has(e.status)).length;
  if (id === 'mental') return a.mental.alerts.filter(x => x.severity >= 3).length;
  if (id === 'reminders') return (p.reminders || []).filter(r => !r.done).length;
  return 0;
}

/** Предупреждения в заглавието на досието. */
export function adultHeaderAlerts(ctx) {
  const { a } = ctx;
  const out = [];
  if (a.conditions.length) {
    out.push(h('div.alert-strip.info', null, 'Хронични заболявания: ',
      h('strong', null, a.conditions.map(c => c.def.name).join(', '))));
  }
  const urgent = a.mental.alerts.filter(x => x.severity >= 3 && x.tool === 'phq9' && /въпрос 9/.test(x.text));
  for (const u of urgent) out.push(h('div.alert-strip', null, h('strong', null, '⚠ ' + u.text), h('span.small', null, ` (${formatDate(u.date)})`)));
  const contra = a.medAlerts.filter(x => x.severity === 'contra');
  if (contra.length) {
    out.push(h('div.alert-strip', null, h('strong', null, '💊 Противопоказание: '), contra.map(x => x.title).join('; ')));
  }
  return out;
}

export const ADULT_VIEWS = {
  overview: overviewTab,
  chronic: chronicTab,
  meds: medsTab,
  labs: labsTab,
  vitals: vitalsTab,
  prevention: preventionTab,
  mental: mentalTab,
};

/* ---------------------------------- обзор ---------------------------------- */

function overviewTab(ctx) {
  const { a } = ctx;
  return h('div.overview-grid', null,
    h('div.col', null, signalsCard(ctx), todoCard(ctx), controlCard(ctx)),
    h('div.col', null, vitalsCard(ctx), cvCard(ctx), medsSummaryCard(ctx),
      a.calculators.cha2ds2va || a.calculators.fib4 ? calculatorsCard(ctx) : null));
}

function signalsCard(ctx) {
  const { a } = ctx;
  const items = [
    ...a.mental.alerts.filter(x => x.severity >= 3).map(x => h('div.alert-strip', null,
      h('div', null, h('strong', null, x.text), h('div.small', { style: { fontWeight: 400 } }, `${TOOLS[x.tool]?.short || ''} · ${formatDate(x.date)}`)))),
    ...a.medAlerts.filter(x => x.severity === 'contra' || x.severity === 'major').slice(0, 5).map(alertStrip),
    ...a.renewals.filter(r => r.status === 'overdue').map(r => h('div.alert-strip.warn', null,
      `${r.kind === 'rx' ? 'Рецептата' : 'Протоколът'} за ${r.name} изтече ${formatDate(r.date)}.`)),
  ];
  for (const hint of a.hints) {
    items.push(h('div.alert-strip.info', null, h('div.grow', null, h('strong', null, 'Подсказка: '), hint.text),
      h('button.btn.xs', { onclick: () => conditionDialog(ctx, null, hint.code) }, 'Впиши')));
  }
  const more = a.medAlerts.filter(x => x.severity === 'contra' || x.severity === 'major').length - 5;
  return card('Сигнали', { icon: '⚠️' },
    items.length ? h('div.stack', { style: { gap: '8px' } }, items,
      more > 0 ? h('button.btn.sm', { onclick: () => ctx.openTab('meds') }, `и още ${more} в „Лекарства“`) : null)
      : empty('Няма сериозни сигнали.', '✓'));
}

function monitoringBadge(t) {
  if (t.status === 'overdue') return badge('overdue', `просрочено с ${durationText(t.overdueDays)}`);
  if (t.status === 'due') return badge('due', 'дължимо сега');
  if (t.status === 'soon') return badge('soon', relativeDays(t.due));
  return badge('future', formatDate(t.due));
}

function monitoringAction(ctx, t) {
  return h('button.btn.xs.primary', {
    title: t.req === 'review' ? 'Запиши диспансерен преглед' : 'Въведи резултат',
    onclick: (e) => { e.stopPropagation(); openForRequirement(ctx, t.req, { visit: () => ctx.addVisit('Диспансерен преглед') }); },
  }, t.req === 'review' ? '✓ Преглед' : '＋ Резултат');
}

function todoCard(ctx) {
  const { a, data, p, reload } = ctx;
  const rows = [];
  for (const t of a.monitoring.filter(x => x.status === 'overdue' || x.status === 'due')) {
    rows.push({ due: t.due, row: h('tr' + (t.status === 'overdue' ? '.attention' : ''), null,
      h('td', null, h('div', { style: { fontWeight: 600 } }, '🧪 ' + t.name),
        h('div.tiny.dim', { title: t.reasons.join(', ') }, reasonsText(t.reasons), lastText(t))),
      h('td.nowrap.small', null, formatDateShort(t.due)),
      h('td', null, monitoringBadge(t)),
      h('td.actions', null, monitoringAction(ctx, t))) });
  }
  for (const r of a.renewals) {
    const med = p.meds.find(m => m.id === r.medId);
    rows.push({ due: r.date, row: h('tr' + (r.status === 'overdue' ? '.attention' : ''), null,
      h('td', null, h('div', { style: { fontWeight: 600 } }, `💊 ${r.kind === 'rx' ? 'Рецепта' : 'Протокол'}: ${r.name}`)),
      h('td.nowrap.small', null, formatDateShort(r.date)),
      h('td', null, r.status === 'overdue' ? badge('overdue', 'изтекла') : badge('due', relativeDays(r.date))),
      h('td.actions', null, med ? h('button.btn.xs.primary', { onclick: () => renewDialog(ctx, med) }, 'Поднови') : null)) });
  }
  for (const e of data.plan.filter(x => ACTIONABLE.has(x.status))) {
    rows.push({ due: e.due, row: h('tr' + (e.status === 'overdue' ? '.attention' : ''), null,
      h('td', null, h('div', { style: { fontWeight: 600 } }, (e.group === 'vaccine' ? '💉 ' : e.group === 'checkup' ? '🩺 ' : '🔬 ') + e.name)),
      h('td.nowrap.small', null, formatDateShort(e.due)),
      h('td', null, e.status === 'overdue' ? badge('overdue', `просрочено с ${durationText(e.overdueDays)}`) : badge('due', 'дължимо сега')),
      h('td.actions', null, h('button.btn.xs.primary', {
        title: 'Отбележи като извършено',
        onclick: () => markDoneDialog({ patientId: p.id, patientName: p.name, item: scheduleItem(e.id) || e, onDone: reload }),
      }, '✓'))) });
  }
  rows.sort((x, y) => (x.due < y.due ? -1 : 1));
  const soon = a.monitoring.filter(t => t.status === 'soon').length
    + data.plan.filter(e => e.status === 'soon').length;
  return card(rows.length ? `За извършване (${rows.length})` : 'За извършване', { icon: '📌', tight: true },
    rows.length ? table(['Какво', 'Срок', 'Състояние', ''], rows.slice(0, 14).map(r => r.row))
      : empty('Няма просрочени или дължими дейности.', '✓'),
    soon ? h('div.body.small.muted', null, `Предстоят още ${soon} в близките ${state.settings.horizonDays} дни.`) : null);
}

function controlCard(ctx) {
  const { a } = ctx;
  if (!a.control.length) {
    return card('Контрол на заболяванията', { icon: '🎯' },
      a.conditions.length ? empty('Няма цели за проследяване при тези заболявания.', null)
        : h('div', null, h('p.small.muted', null, 'Няма вписани хронични заболявания.'),
          h('button.btn.sm', { onclick: () => conditionDialog(ctx) }, '＋ Заболяване')));
  }
  return card('Контрол на заболяванията', { icon: '🎯', tight: true },
    table(['Показател', 'Стойност', 'Цел', ''], a.control.map(c => h('tr', null,
      h('td', null, h('strong', null, c.label), c.date ? h('div.tiny.dim', null, formatDate(c.date)) : null),
      h('td.nowrap', null, c.value || h('span.dim', null, 'няма данни')),
      h('td.small.muted', null, c.target),
      h('td', null, badge(STATUS_CLS[c.status], { ok: 'в целта', partial: 'близо', bad: 'извън целта', unknown: 'няма данни' }[c.status]))))));
}

function tile(label, value, unit, sub, sev = 0) {
  if (value === null || value === undefined || value === '') return null;
  return h('div.tile', null,
    h('div.tiny.dim', null, label),
    h('div.tile-v', null, value, unit ? h('span.small.dim', null, ' ' + unit) : null),
    sub ? h('div.tiny.z-pill.s' + Math.min(2, sev), null, sub) : null);
}

function vitalsCard(ctx) {
  const { a } = ctx;
  const v = a.vitals;
  const r = a.renal;
  const tiles = [
    v.bp ? tile('Налягане', `${v.bp.systolic}/${v.bp.diastolic}`, 'mmHg', v.bpClass?.label, v.bpClass?.severity) : null,
    v.bp && v.bp.pulse ? tile('Пулс', v.bp.pulse, '/мин') : null,
    v.weight ? tile('Тегло', dec(v.weight.value), 'кг') : null,
    v.bmi ? tile('ИТМ', dec(v.bmi), '', v.bmiClass?.label, v.bmiClass?.severity) : null,
    v.waist ? tile('Талия', dec(v.waist.value), 'см', v.waistRisk?.label, v.waistRisk?.severity) : null,
    r.egfr ? tile('eGFR', r.egfr.value, '', r.stage
      ? (r.stage.ckd ? `ХБЗ ${r.stage.label} · риск ${KDIGO_RISK_LABELS[r.stage.risk]}` : `${r.stage.label} · без ХБЗ`) : '',
    r.stage && r.stage.ckd ? { moderate: 1, high: 2, very_high: 2 }[r.stage.risk] || 0 : 0) : null,
    r.crcl ? tile('CrCl (C–G)', r.crcl, 'mL/min') : null,
  ].filter(Boolean);
  return card('Показатели', {
    icon: '📊',
    actions: h('button.btn.sm', { onclick: () => adultMeasurementDialog(ctx) }, '＋ Измерване'),
  }, tiles.length ? h('div.tiles', null, tiles) : empty('Няма измервания.', null),
  v.bp ? h('div.tiny.dim', { style: { marginTop: '8px' } }, `Налягане от ${formatDate(v.bp.date)} · цел ${bpTarget(ctx.p).text}`) : null);
}

function cvCard(ctx) {
  const { a } = ctx;
  const cv = a.cv;
  const color = { very_high: 'overdue', high: 'due', moderate: 'soon', low: 'done' }[cv.category] || 'future';
  return card('Сърдечно-съдов риск', {
    icon: '❤️',
    actions: cv.needsOp || cv.model === 'SCORE2-OP'
      ? h('button.btn.sm', { onclick: () => assessmentDialog(ctx, 'score2op') }, 'Въведи SCORE2-OP') : null,
  },
  h('div.row', null, badge(color, cv.label), cv.score !== undefined && cv.score !== null
    ? h('span', { style: { fontSize: '20px', fontWeight: 700 } }, dec(cv.score) + '%') : null),
  h('div.small', { style: { marginTop: '6px' } }, cv.reason),
  cv.ldlTarget ? h('div.small', { style: { marginTop: '4px' } }, 'Цел за LDL: ', h('strong', null, cv.ldlTarget.text)) : null,
  cv.missing && cv.missing.length ? h('div.small.muted', { style: { marginTop: '4px' } }, 'Липсват: ' + cv.missing.join(', ') + '.') : null,
  cv.smokingUnknown ? h('div.tiny.dim', { style: { marginTop: '4px' } }, 'Не е отбелязано дали пуши — изчислено като за непушач (раздел „Хранене“ → начин на живот).') : null,
  h('div.tiny.dim', { style: { marginTop: '6px' } }, `Регион по ESC: ${state.settings.cvRegion === 'very_high' || !state.settings.cvRegion ? 'много висок риск (България)' : state.settings.cvRegion}.`));
}

function medsSummaryCard(ctx) {
  const { p } = ctx;
  const meds = activeMeds(p);
  return card(`Лекарства (${meds.length})`, {
    icon: '💊',
    actions: h('button.btn.sm', { onclick: () => ctx.openTab('meds') }, 'Всички'),
  }, meds.length
    ? h('ul.list-plain.compact', null, meds.slice(0, 10).map(m => h('li', null,
      h('strong', null, medLabel(m)), m.dose ? ' ' + m.dose : '', h('span.small.muted', null, ' · ' + scheduleText(m)))))
    : h('div', null, h('p.small.muted', null, 'Няма въведени лекарства.'),
      h('button.btn.sm', { onclick: () => medDialog(ctx) }, '＋ Лекарство')));
}

function calculatorsCard(ctx) {
  const c = ctx.a.calculators;
  return card('Калкулатори', { icon: '🧮' }, h('div.stack', { style: { gap: '10px' } },
    c.cha2ds2va ? h('div', null, h('strong', null, `CHA2DS2-VA: ${c.cha2ds2va.score}`),
      h('div.tiny.dim', null, c.cha2ds2va.parts.join(', ') || 'без рискови фактори'),
      h('div.small', null, c.cha2ds2va.advice)) : null,
    c.hasbled ? h('div', null, h('strong', null, `HAS-BLED: ${c.hasbled.score}`), h('div.small', null, c.hasbled.advice)) : null,
    c.fib4 ? h('div', null, h('strong', null, `FIB-4: ${dec(c.fib4.value)}`), h('div.small', null, c.fib4.advice)) : null));
}

export function scheduleText(m) {
  if (m.prn) return 'при нужда';
  const s = m.schedule || {};
  const parts = SCHEDULE_SLOTS.map(([k]) => s[k] || '0');
  return parts.every(x => x === '0') ? '—' : parts.join(' – ');
}

/* ------------------------------ хронични заболявания ------------------------------ */

function chronicTab(ctx) {
  const { p, a, reload } = ctx;
  const all = p.chronic || [];
  const active = all.filter(c => c.status !== 'resolved' && CONDITIONS[c.code]);
  const resolved = all.filter(c => c.status === 'resolved' && CONDITIONS[c.code]);

  const condCard = (c) => {
    const def = CONDITIONS[c.code];
    const tasks = a.monitoring.filter(t => t.reasons.includes(def.name));
    const targets = [];
    if (def.targets.includes('bp')) targets.push('налягане ' + bpTarget(p).text);
    if (def.targets.includes('hba1c')) targets.push('HbA1c ' + hba1cTarget(p).text);
    if (def.targets.includes('ldl') && a.cv.ldlTarget) targets.push('LDL ' + a.cv.ldlTarget.text);
    return card(def.name, {
      icon: '🩺',
      actions: [
        h('button.btn.xs', { title: 'Редакция', onclick: () => conditionDialog(ctx, c) }, '✎'),
        h('button.btn.xs', {
          title: 'Отбележи като отзвучало',
          onclick: async () => { await api.updateCondition(p.id, c.id, { status: 'resolved' }); toast('Отбелязано като отзвучало.'); reload(); },
        }, 'Отзвучало'),
        h('button.btn.xs.danger', {
          onclick: () => deleteWithConfirm(`„${def.name}“ ще бъде изтрито от досието.`, () => api.deleteCondition(p.id, c.id), reload),
        }, '✕'),
      ],
    },
    h('div.small', null, `МКБ-10 ${def.icd} · `, c.since ? `от ${formatDate(c.since)}` : 'без дата на поставяне', ` · диспансерен преглед на ${def.review} мес.`),
    targets.length ? h('div.small', { style: { marginTop: '4px' } }, 'Цели: ', h('strong', null, targets.join(' · '))) : null,
    c.note ? h('div.small.muted', { style: { marginTop: '4px' } }, c.note) : null,
    tasks.length ? h('div.chips', { style: { marginTop: '8px' } }, tasks.map(t => h('span.badge.' + (t.status === 'overdue' ? 'overdue' : t.status === 'due' ? 'due' : 'future'), null,
      `${t.name}: ${t.status === 'overdue' || t.status === 'due' ? 'дължимо' : formatDateShort(t.due)}`))) : null,
    h('details.tips', null, h('summary', null, 'Добра практика'), def.tips.map(tip => h('p.small', null, tip))));
  };

  const monRows = a.monitoring.map(t => h('tr' + (t.status === 'overdue' ? '.attention' : ''), null,
    h('td', null, h('strong', null, t.name), h('div.tiny.dim', { title: t.reasons.join(', ') }, reasonsText(t.reasons, 4))),
    h('td.small.nowrap', null, t.months < 12 ? `на ${t.months} мес.` : t.months === 12 ? 'ежегодно' : `на ${t.months / 12} г.`),
    h('td.small.nowrap', null, t.last ? formatDate(t.last)
      : t.assumed ? h('span.dim', { title: 'Прието за направено при внасянето на списъка' }, `внесено ${formatDate(t.assumed)}`)
        : h('span.dim', null, 'няма')),
    h('td', null, monitoringBadge(t)),
    h('td.actions', null, monitoringAction(ctx, t))));

  return h('div.stack', null,
    h('div.row.no-print', null,
      h('button.btn.primary', { onclick: () => conditionDialog(ctx) }, '＋ Заболяване'),
      h('div.grow'),
      h('span.small.muted', null, 'Честотите на проследяване са по ESC/ESH 2024, ESC 2023, KDIGO 2024, GOLD и GINA.')),
    active.length ? h('div.grid.cols-2', null, active.map(condCard))
      : card(null, {}, empty('Няма вписани хронични заболявания. Добавете ги, за да се изчисляват проследяването, целите и проверките на лекарствата.', '🩺')),
    a.monitoring.length ? card('Диспансерно наблюдение', { icon: '🧪', tight: true },
      table(['Изследване / преглед', 'Честота', 'Последно', 'Състояние', ''], monRows)) : null,
    resolved.length ? card('Отзвучали', { icon: '·', tight: true }, table(['Заболяване', 'От', ''], resolved.map(c => h('tr', null,
      h('td', null, CONDITIONS[c.code].name),
      h('td.small', null, c.since ? formatDate(c.since) : '—'),
      h('td.actions', null, h('button.btn.xs', {
        onclick: async () => { try { await api.updateCondition(p.id, c.id, { status: 'active' }); reload(); } catch (err) { toast(err.message, 'error'); } },
      }, 'Върни')))))) : null);
}

/* ---------------------------------- лекарства ---------------------------------- */

function medsTab(ctx) {
  const { p, a, reload } = ctx;
  const active = activeMeds(p);
  const stopped = (p.meds || []).filter(m => m.end && m.end <= today()).sort((x, y) => (x.end < y.end ? 1 : -1));
  const alertsByMed = new Map();
  for (const al of a.medAlerts) for (const id of al.meds) alertsByMed.set(id, [...(alertsByMed.get(id) || []), al]);

  const rxCell = (m) => {
    const end = runsOut(m);
    const r = a.renewals.find(x => x.medId === m.id && x.kind === 'rx');
    return h('td.small.nowrap', null, end
      ? h('div', null, 'до ' + formatDateShort(end), r ? h('div', null, badge(r.status === 'overdue' ? 'overdue' : 'due', r.status === 'overdue' ? 'изтекла' : relativeDays(end))) : null)
      : h('span.dim', null, '—'));
  };
  const protoCell = (m) => {
    const r = a.renewals.find(x => x.medId === m.id && x.kind === 'protocol');
    return h('td.small.nowrap', null, m.protocolUntil
      ? h('div', null, formatDateShort(m.protocolUntil), r ? h('div', null, badge(r.status === 'overdue' ? 'overdue' : 'due', r.status === 'overdue' ? 'изтекъл' : relativeDays(m.protocolUntil))) : null)
      : h('span.dim', null, '—'));
  };

  const rows = active.map(m => {
    const warn = alertsByMed.get(m.id) || [];
    const worst = warn.find(x => x.severity === 'contra') || warn.find(x => x.severity === 'major');
    return h('tr' + (worst ? '.attention' : ''), null,
      h('td', null,
        h('div', { style: { fontWeight: 600 } }, medLabel(m), m.name && m.drug ? h('span.tiny.dim', null, ' · ' + DRUGS[m.drug]?.bg) : null),
        h('div.tiny.dim', null, [m.indication ? CONDITIONS[m.indication]?.name : '', m.note, !m.drug ? 'не е от каталога — без проверки' : ''].filter(Boolean).join(' · ')),
        warn.length ? h('div.tiny', { style: { color: worst ? 'var(--danger)' : 'var(--warn)' } }, '⚠ ' + warn.map(x => x.title).join('; ')) : null),
      h('td.small', null, m.dose || '—'),
      h('td.small.nowrap.mono', null, scheduleText(m)),
      h('td.small.nowrap', null, m.start ? formatDateShort(m.start) : '—'),
      rxCell(m), protoCell(m),
      h('td.actions.no-print', null, h('div.row.tight', { style: { justifyContent: 'flex-end', flexWrap: 'nowrap' } },
        h('button.btn.xs', { title: 'Нова рецепта', onclick: () => renewDialog(ctx, m) }, '℞'),
        h('button.btn.xs', { title: 'Редакция', onclick: () => medDialog(ctx, m) }, '✎'),
        h('button.btn.xs', { title: 'Спиране', onclick: () => stopMedDialog(ctx, m) }, '⏹'),
        h('button.btn.xs.danger', {
          title: 'Изтриване (грешно въведено)',
          onclick: () => deleteWithConfirm(`${medLabel(m)} ще бъде изтрито от досието. Ако лекарството е спряно, използвайте „Спиране“ — така остава в историята.`,
            () => api.deleteMed(p.id, m.id), reload),
        }, '✕'))));
  });

  const bySeverity = ['contra', 'major', 'moderate', 'info'].map(s => a.medAlerts.filter(x => x.severity === s)).flat();

  return h('div.stack', null,
    h('div.row.no-print', null,
      h('button.btn.primary', { onclick: () => medDialog(ctx) }, '＋ Лекарство'),
      h('button.btn', { onclick: () => printMedList(p, ctx.data) }, '🖨 Лист „Моите лекарства“'),
      h('div.grow'),
      h('span.small.muted', null, active.length >= 5 ? `Полипрагмазия: ${active.length} лекарства — прегледайте нуждата от всяко.` : '')),
    card(bySeverity.length ? `Проверка на терапията (${bySeverity.length})` : 'Проверка на терапията', { icon: '🛡' },
      bySeverity.length ? h('div.stack', { style: { gap: '8px' } }, bySeverity.map(alertStrip))
        : empty('Не са открити взаимодействия, дублиране или проблеми с дозирането.', '✓'),
      h('p.tiny.muted', { style: { marginTop: '10px', marginBottom: 0 } },
        'Проверки: взаимодействия, дублиране, дозиране според eGFR/CrCl, Beers 2023 и STOPP при 65+ г., противопоказания при заболявания, алергии, липсваща терапия с доказана полза. Подпомагат, но не заменят преценката на лекаря.')),
    card(`Текуща терапия (${active.length})`, { icon: '💊', tight: true },
      active.length ? table(['Лекарство', 'Доза', 'Сут – обед – веч – сън', 'От', 'Рецепта', 'Протокол', ''], rows)
        : empty('Няма въведени лекарства.', '💊')),
    a.foodNotes.length ? card('Храна и напитки при приема', { icon: '🍽', tight: true },
      h('ul.list-plain.pad', null, a.foodNotes.map(n => h('li.small', null, h('strong', null, n.med + ': '), n.text)))) : null,
    stopped.length ? card(`Спрени (${stopped.length})`, { icon: '⏹', tight: true },
      table(['Лекарство', 'Приемано', 'Причина', ''], stopped.map(m => h('tr', null,
        h('td', null, medLabel(m), m.dose ? h('span.small.muted', null, ' ' + m.dose) : null),
        h('td.small.nowrap', null, `${m.start ? formatDateShort(m.start) : '?'} – ${formatDateShort(m.end)}`),
        h('td.small.muted', null, m.stopReason || ''),
        h('td.actions.no-print', null, h('button.btn.xs.danger', {
          onclick: () => deleteWithConfirm(`${medLabel(m)} ще бъде изтрито от историята.`, () => api.deleteMed(p.id, m.id), reload),
        }, '✕')))))) : null);
}

/* --------------------------------- изследвания --------------------------------- */

function labsTab(ctx) {
  const { p, reload } = ctx;
  const results = p.results || [];
  const egfr = egfrSeries(p);
  const nh = nonHdl(results);
  const charted = new Set();

  const series = (code) => (code === 'egfr' ? egfr : resultSeries(results, code));
  const groups = new Map();
  for (const code of Object.keys(LABS)) {
    const s = series(code);
    if (!s.length) continue;
    const g = LABS[code].group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(code);
  }

  const labRow = (code, holder) => {
    const s = series(code);
    const last = s[s.length - 1];
    const prev = s.length > 1 ? s[s.length - 2] : null;
    const flag = flagFor(code, last.value, p.sex);
    const r = rangeFor(code, p.sex);
    const diff = prev ? round(last.value - prev.value, LABS[code].decimals ?? 1) : null;
    const tr = h('tr.clickable', {
      onclick: () => {
        const open = holder.querySelector(`[data-chart="${code}"]`);
        if (open) { open.remove(); charted.delete(code); return; }
        // При HbA1c и LDL зелената зона е индивидуалната цел, а не нормата.
        const target = code === 'hba1c' && ctx.a.conditions.some(c => c.def.diabetes) ? hba1cTarget(p).value
          : code === 'ldl' && ctx.a.cv.ldlTarget ? ctx.a.cv.ldlTarget.value : null;
        const chart = trendChart({
          series: [{ label: LABS[code].short, points: s.map(x => ({ date: x.date, value: x.value, flag: !!flagFor(code, x.value, p.sex) })) }],
          unit: LABS[code].unit, decimals: LABS[code].decimals,
          band: target ? { lo: 0, hi: target } : r ? { lo: r[0], hi: r[1] >= LABS[code].max || r[1] === 99 ? null : r[1] } : null,
          lines: target ? [{ value: target, label: `цел <${dec(target)}` }] : [],
        });
        const row = h('tr', { dataset: { chart: code } }, h('td', { colSpan: 7 }, h('div.chart-inline', null, chart)));
        tr.after(row);
        charted.add(code);
      },
    },
    h('td', null, h('strong', null, LABS[code].short), h('div.tiny.dim', null, LABS[code].name)),
    h('td.nowrap', null, h('span.lab-value' + (flag ? '.flag' : ''), null, formatLab(code, last.value)),
      flag ? h('span.flag-mark', null, flag === 'H' ? ' ↑' : ' ↓') : null,
      last.source === 'calc' ? h('div.tiny.dim', null, 'изчислена') : null),
    h('td.small.nowrap', null, formatDate(last.date)),
    h('td.small.nowrap.muted', null, prev ? formatLab(code, prev.value) : '—'),
    h('td.small.nowrap', null, diff === null ? '' : diff === 0 ? '=' : (diff > 0 ? '▲ ' : '▼ ') + dec(Math.abs(diff))),
    h('td.small.dim.nowrap', null, rangeText(code, p.sex)),
    h('td.small.dim', null, s.length > 1 ? `${s.length} ▸` : ''));
    return tr;
  };

  const groupCards = [...groups.entries()].map(([g, codes]) => {
    const holder = h('tbody');
    const t = h('div.table-wrap', null, h('table.lab-table', null,
      h('thead', null, h('tr', null, ['Изследване', 'Последно', 'Дата', 'Предишно', 'Промяна', 'Норма', ''].map(x => h('th', null, x)))),
      holder));
    for (const code of codes) holder.appendChild(labRow(code, holder));
    if (g === 'lipids' && nh) {
      holder.appendChild(h('tr', null, h('td', null, h('strong', null, 'Не-HDL'), h('div.tiny.dim', null, 'общ − HDL')),
        h('td', null, `${dec(nh.value)} mmol/L`), h('td.small', null, formatDate(nh.date)), h('td'), h('td'), h('td'), h('td')));
    }
    return card(LAB_GROUPS[g], { tight: true }, t);
  });

  const checks = results.filter(r => isCheck(r.code)).sort((x, y) => (x.date < y.date ? 1 : -1));
  const byDate = new Map();
  for (const r of results) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  const history = [...byDate.entries()].sort((x, y) => (x[0] < y[0] ? 1 : -1));

  return h('div.stack', null,
    h('div.row.no-print', null,
      h('button.btn.primary', { onclick: () => resultsDialog(ctx) }, '＋ Резултати'),
      h('div.grow'),
      h('span.small.muted', null, 'Щракнете върху ред, за да видите графиката във времето.')),
    groupCards.length ? h('div.stack', null, groupCards) : card(null, {}, empty('Още няма въведени резултати.', '🧪')),
    checks.length ? card('Прегледи и процедури', { icon: '📋', tight: true }, table(['Дата', 'Вид', 'Заключение'], checks.map(r => h('tr', null,
      h('td.small.nowrap', null, formatDate(r.date)), h('td', null, CHECKS[r.code].name), h('td.small', null, r.text || ''))))) : null,
    history.length ? h('details.card.history', null,
      h('summary', null, `Всички записи по дати (${history.length})`),
      h('div.body.tight', null, table(['Дата', 'Резултати', ''], history.map(([d, list]) => h('tr', null,
        h('td.small.nowrap', null, formatDate(d)),
        h('td.small', null, list.map(r => h('span.result-chip', null, isCheck(r.code) ? labName(r.code) : `${LABS[r.code]?.short}: ${formatLab(r.code, r.value)}`,
          h('button.x', {
            title: 'Изтрий този резултат',
            onclick: () => deleteWithConfirm(`${labName(r.code)} от ${formatDate(r.date)} ще бъде изтрит.`, () => api.deleteResult(p.id, r.id), reload),
          }, '×')))),
        h('td.small.muted', null, list[0].note || '')))))) : null);
}

/* ---------------------------------- измервания ---------------------------------- */

function vitalsTab(ctx) {
  const { p, reload } = ctx;
  const ms = [...(p.measurements || [])].sort((x, y) => (x.date < y.date ? -1 : 1));
  const t = bpTarget(p);
  const heights = ms.filter(m => m.height);
  const heightAt = (date) => {
    const before = heights.filter(m => m.date <= date);
    return (before[before.length - 1] || heights[0])?.height;
  };
  const pts = (key) => ms.filter(m => Number.isFinite(m[key])).map(m => ({ date: m.date, value: m[key] }));
  const bmiPts = ms.filter(m => m.weight && heightAt(m.date)).map(m => ({ date: m.date, value: round(m.weight / ((heightAt(m.date) / 100) ** 2), 1) }));

  const chartCard = (title, chart, sub) => (chart ? h('div.chart-card', null, h('h3', null, title), sub ? h('div.sub', null, sub) : null, chart) : null);
  const charts = [
    chartCard('Артериално налягане', trendChart({
      series: [{ label: 'систолно', points: pts('systolic'), cls: 'a' }, { label: 'диастолно', points: pts('diastolic'), cls: 'b' }],
      unit: 'mmHg', lines: [{ value: t.sys, label: `цел <${t.sys}` }, { value: t.dia, label: `<${t.dia}` }],
    }), `цел ${t.text}`),
    chartCard('Тегло', trendChart({ series: [{ label: 'тегло', points: pts('weight') }], unit: 'кг', decimals: 1 })),
    chartCard('Индекс на телесната маса', trendChart({
      series: [{ label: 'ИТМ', points: bmiPts }], unit: 'кг/м²', decimals: 1, band: { lo: 18.5, hi: 25 },
    }), 'зелено — 18,5–24,9'),
    chartCard('Обиколка на талията', trendChart({
      series: [{ label: 'талия', points: pts('waist') }], unit: 'см',
      lines: [{ value: p.sex === 'f' ? 88 : 102, label: 'висок риск' }],
    })),
    chartCard('Пулс', trendChart({ series: [{ label: 'пулс', points: pts('pulse') }], unit: '/мин', band: { lo: 50, hi: 100 } })),
  ].filter(Boolean);

  const cell = (v, unit) => (v === null || v === undefined ? h('td.dim', null, '—') : h('td.nowrap.mono', null, dec(v), unit ? h('span.tiny.dim', null, ' ' + unit) : null));
  const rows = [...ms].reverse().map(m => h('tr', null,
    h('td.nowrap.small', null, formatDate(m.date)),
    cell(m.systolic ? `${m.systolic}/${m.diastolic}` : null), cell(m.pulse), cell(m.weight, 'кг'), cell(m.height, 'см'), cell(m.waist, 'см'),
    h('td.small.muted', null, m.note || ''),
    h('td.actions.no-print', null, h('button.btn.xs.danger', {
      onclick: () => deleteWithConfirm(`Измерването от ${formatDate(m.date)} ще бъде изтрито.`, () => api.deleteMeasurement(p.id, m.id), reload),
    }, '✕'))));

  return h('div.stack', null,
    h('div.row.no-print', null,
      h('button.btn.primary', { onclick: () => adultMeasurementDialog(ctx) }, '＋ Измерване'),
      h('div.grow'),
      h('span.small.muted', null, 'Налягането от един ден се осреднява. Категориите са по ESC 2024.')),
    charts.length ? h('div.charts', null, charts) : card(null, {}, empty('Още няма измервания.', '📈')),
    ms.length ? card('Всички измервания', { tight: true }, table(['Дата', 'Налягане', 'Пулс', 'Тегло', 'Ръст', 'Талия', 'Бележка', ''], rows)) : null);
}

/* --------------------------------- профилактика --------------------------------- */

function preventionTab(ctx) {
  const { p, data, a, reload } = ctx;
  const adultItems = data.plan.filter(e => e.track === 'adult');
  const childLeft = data.plan.filter(e => e.track !== 'adult' && e.group === 'vaccine'
    && (e.status === 'overdue' || e.status === 'deferral_ended' || e.status === 'due'));
  const open = adultItems.filter(e => !['done', 'skipped', 'missed', 'refused'].includes(e.status));
  const done = adultItems.filter(e => e.status === 'done' || e.status === 'refused').sort((x, y) => ((x.record?.date || '') < (y.record?.date || '') ? 1 : -1));
  const vaccines = open.filter(e => e.group === 'vaccine');
  const other = open.filter(e => e.group !== 'vaccine');

  const optIn = new Set(p.optIn || []);
  const groups = new Map();
  for (const item of state.schedule.filter(i => i.optIn && i.track === 'adult')) {
    const key = item.optInGroup || item.id;
    if (!groups.has(key)) groups.set(key, { key, items: [], meta: OPT_IN_GROUPS[key] });
    groups.get(key).items.push(item);
  }
  const toggle = async (group, on, box) => {
    const set = new Set(p.optIn || []);
    for (const item of group.items) { if (on) set.add(item.id); else set.delete(item.id); }
    try { await api.setOptIn(p.id, [...set]); await reload(); } catch (err) { toast(err.message, 'error'); box.checked = !on; }
  };
  const cols = ['Дейност', 'Възраст', 'Срок', 'Състояние', '', ''];
  const diabetic = a.conditions.some(c => c.def.diabetes);

  return h('div.stack', null,
    h('div.alert-strip.info', null, h('div', null,
      'Ежегоден профилактичен преглед (Наредба № 8), скрининг за рак по Препоръката на Съвета на ЕС (2022), ',
      'оценка на сърдечно-съдовия риск по ESC 2021 и ваксини по препоръките на ECDC. ',
      'Резултат от мамография, FIT, цитонамазка, липиди, глюкоза или скала отбелязва дейността автоматично.')),
    card('Скрининг и профилактични прегледи', { icon: '🔬', tight: true },
      other.length ? table(cols, other.map(e => planRow(e, ctx))) : empty('Няма дължими или предстоящи.', '✓')),
    card('Ваксини', { icon: '💉', tight: true },
      vaccines.length ? table(cols, vaccines.map(e => planRow(e, ctx))) : empty('Няма дължими ваксини.', '✓')),
    groups.size ? card('Препоръчителни ваксини', { icon: '☑' },
      h('div.grid.cols-2', null, [...groups.values()].map(group => {
        const box = h('input', { type: 'checkbox', checked: group.items.every(i => optIn.has(i.id)) });
        box.addEventListener('change', () => toggle(group, box.checked, box));
        return h('label.check', null, box, h('span', null,
          h('strong', null, group.meta ? group.meta.label : group.items[0].name),
          group.meta?.note ? h('div.tiny.dim', null, group.meta.note) : null));
      }))) : null,
    childLeft.length ? card('Пропуснати имунизации от детския календар', { icon: '🧒', tight: true },
      h('div.body.small.muted', null, 'Пациентът е регистриран като дете. Ако тези ваксини са поставени другаде, отбележете ги или изключете детския календар от „Редакция“.'),
      table(cols, childLeft.map(e => planRow(e, ctx)))) : null,
    !diabetic ? card('Риск от диабет тип 2', {
      icon: '🍬', actions: h('button.btn.sm', { onclick: () => findriscDialog(ctx, a) }, 'FINDRISC'),
    }, h('p.small.muted', { style: { margin: 0 } }, 'Финландската скала за риск от диабет — 8 въпроса, при ≥12 т. се изследва HbA1c или глюкоза.')) : null,
    done.length ? card(`Извършени (${done.length})`, { icon: '✓', tight: true }, table(cols, done.slice(0, 30).map(e => planRow(e, ctx)))) : null);
}

/* --------------------------------- психично здраве --------------------------------- */

const MENTAL_TOOLS = ['phq4', 'phq9', 'gad7', 'auditc', 'minicog', 'falls'];

function mentalTab(ctx) {
  const { p, a, reload } = ctx;
  const list = [...(p.assessments || [])].sort((x, y) => (x.date < y.date ? 1 : -1));
  const age = a.age;

  const toolCard = (id) => {
    const tool = TOOLS[id];
    const hist = list.filter(x => x.tool === id);
    const last = hist[0];
    const sev = last ? last.result.severity : 0;
    const hint = id === 'minicog' && age < 75 ? 'рутинно от 75 г. или при оплаквания' : id === 'falls' && age < 65 ? 'рутинно от 65 г.' : '';
    return h('div.tool-card', null,
      h('div.row', null, h('strong', null, tool.short), h('div.grow'),
        h('button.btn.xs.primary', { onclick: () => assessmentDialog(ctx, id) }, 'Попълни')),
      h('div.tiny.dim', null, tool.name.split('—')[1]?.trim() || tool.name),
      last ? h('div', { style: { marginTop: '6px' } },
        h('span.badge.' + (sev >= 3 ? 'overdue' : sev === 2 ? 'due' : sev === 1 ? 'soon' : 'done'), null, `${last.score} т. · ${last.result.label}`),
        h('div.tiny.dim', null, formatDate(last.date) + (hist.length > 1 ? ` · преди: ${hist.slice(1, 4).map(x => x.score).join(', ')}` : '')))
        : h('div.tiny.dim', { style: { marginTop: '6px' } }, 'Не е попълван' + (hint ? ` · ${hint}` : '')));
  };

  const phq = resultSeriesTool(p, 'phq9');
  const gad = resultSeriesTool(p, 'gad7');
  const chart = phq.length > 1 || gad.length > 1 ? trendChart({
    series: [{ label: 'PHQ-9', points: phq, cls: 'a' }, { label: 'GAD-7', points: gad, cls: 'b' }],
    lines: [{ value: 10, label: '≥10 — клинично значимо' }, { value: 5, label: 'ремисия <5' }],
  }) : null;

  return h('div.stack', null,
    a.mental.alerts.length ? h('div.stack', { style: { gap: '8px' } }, a.mental.alerts.map(x => h('div.alert-strip' + (x.severity >= 3 ? '' : '.warn'), null,
      h('div', null, h('strong', null, x.text), h('div.small', { style: { fontWeight: 400 } }, formatDate(x.date)))))) : null,
    h('div.tool-grid', null, MENTAL_TOOLS.map(toolCard)),
    chart ? h('div.charts', null, h('div.chart-card', null, h('h3', null, 'Проследяване на депресия и тревожност'),
      h('div.sub', null, 'PHQ-9 — синьо, GAD-7 — лилаво'), chart)) : null,
    list.length ? card('Всички оценки', { icon: '📋', tight: true }, table(['Дата', 'Скала', 'Резултат', 'Бележка', ''], list.map(x => h('tr', null,
      h('td.small.nowrap', null, formatDate(x.date)),
      h('td', null, TOOLS[x.tool]?.short || x.tool),
      h('td', null, h('strong', null, x.tool === 'score2op' ? `${dec(x.score)}%` : `${x.score} т.`), ' ', h('span.small.muted', null, x.result.label)),
      h('td.small.muted', null, x.note || ''),
      h('td.actions.no-print', null, h('button.btn.xs.danger', {
        onclick: () => deleteWithConfirm(`Оценката от ${formatDate(x.date)} ще бъде изтрита.`, () => api.deleteAssessment(p.id, x.id), reload),
      }, '✕')))))) : null,
    h('p.tiny.muted', null,
      'PHQ-9, GAD-7 и PHQ-4 са свободни за ползване. Mini-Cog се провежда по официалния формуляр (mini-cog.com) — програмата записва само резултата. '
      + 'Скалите подпомагат, но не поставят диагноза. При мисли за самонараняване — незабавна оценка на риска и насочване.'));
}

const resultSeriesTool = (p, tool) => (p.assessments || []).filter(x => x.tool === tool)
  .sort((x, y) => (x.date < y.date ? -1 : 1)).map(x => ({ date: x.date, value: x.score }));

export { REQUIREMENTS };
