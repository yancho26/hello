/* Досие на дете: обзор, имунизации, прегледи, растеж, визити, напомняния. */

import { api } from '../api.js';
import { state } from '../app.js';
import {
  badge, card, confirmDialog, coverageRing, decimalFields, empty, field, h, input, modal, mount,
  numberInput, select, statusBadge, table, toast,
} from '../ui/components.js';
import { growthChart } from '../ui/charts.js';
import { formatAge, formatDate, formatDateShort, relativeDays, today } from '../shared/dates.js';
import { CORRECT_UNTIL_MONTHS, INDICATORS, isPreterm } from '../shared/growth.js';
import { ACTIONABLE } from '../shared/schedule.js';
import { OPT_IN_GROUPS } from '../shared/calendar.js';
import { openPatientForm } from './patients.js';
import { deferDialog, markDoneDialog, refuseDialog } from './record-dialog.js';
import { visitDialog } from './visit-dialog.js';
import { printImmunisationCard } from './print.js';

let activeTab = 'overview';

const TABS = [
  { id: 'overview', label: 'Обзор' },
  { id: 'vaccines', label: 'Имунизации' },
  { id: 'checkups', label: 'Профилактични прегледи' },
  { id: 'growth', label: 'Растеж' },
  { id: 'visits', label: 'Прегледи' },
  { id: 'reminders', label: 'Напомняния' },
];

export async function renderPatient(host, id) {
  const data = await api.patient(id);
  const p = data.patient;
  const reload = () => renderPatient(host, id);

  const actionable = data.plan.filter(e => ACTIONABLE.has(e.status));
  const vaccines = data.plan.filter(e => e.group === 'vaccine');
  const checkups = data.plan.filter(e => e.group === 'checkup' || e.group === 'screening');

  const ctx = { p, data, reload, actionable, vaccines, checkups };

  const tabBar = h('div.tabs.no-print', null, TABS.map(t => {
    const n = t.id === 'vaccines' ? vaccines.filter(e => ACTIONABLE.has(e.status)).length
      : t.id === 'checkups' ? checkups.filter(e => ACTIONABLE.has(e.status)).length
        : t.id === 'reminders' ? (p.reminders || []).filter(r => !r.done).length : 0;
    return h('button' + (activeTab === t.id ? '.active' : ''), {
      onclick: () => { activeTab = t.id; renderTab(); },
    }, t.label, n ? h('span.n', null, n) : null);
  }));

  const content = h('div#tabContent');
  const renderTab = () => {
    for (const [i, btn] of [...tabBar.children].entries()) {
      btn.classList.toggle('active', TABS[i].id === activeTab);
    }
    const view = {
      overview: overviewTab, vaccines: vaccinesTab, checkups: checkupsTab,
      growth: growthTab, visits: visitsTab, reminders: remindersTab,
    }[activeTab] || overviewTab;
    mount(content, view(ctx));
  };

  mount(host, patientHeader(ctx), tabBar, content);
  renderTab();
}

/* --------------------------------- заглавие ---------------------------------- */

function patientHeader({ p, data, reload }) {
  const doctor = state.doctors.find(d => d.id === p.doctorId);
  const alerts = [];
  if (p.allergies && p.allergies.length) {
    alerts.push(h('div.alert-strip', null, '⚠ Алергии: ', h('strong', null, p.allergies.join(', '))));
  }
  if (p.conditions && p.conditions.length) {
    alerts.push(h('div.alert-strip.info', null, 'Диспансерно наблюдение: ', h('strong', null, p.conditions.join(', '))));
  }
  if (p.archived) {
    alerts.push(h('div.alert-strip.warn', null, 'Досието е в архив.',
      p.archivedReason ? ' ' + p.archivedReason : ''));
  }
  const severe = (data.concerns || []).filter(c => c.severity >= 2);
  if (severe.length) {
    alerts.push(h('div.alert-strip', null,
      h('div', null,
        h('strong', null, 'Растеж: ' + severe.map(c => c.title).join('; ')),
        h('div.small', { style: { fontWeight: '400' } }, 'Подробности в раздел „Растеж“.'))));
  }

  return h('div', null,
    h('div.card', null, h('div.body', null,
      h('div.patient-head', null,
        h('div.who', null,
          h('button.btn.ghost.sm.no-print', {
            onclick: () => { location.hash = '#/patients'; },
            style: { marginBottom: '6px', marginLeft: '-8px' },
          }, '← Всички деца'),
          h('h1', null, p.name,
            h('span.dim', { style: { fontSize: '18px' } }, p.sex === 'f' ? '♀' : p.sex === 'm' ? '♂' : '')),
          h('div.facts', null,
            fact('Възраст', formatAge(p.birthDate)),
            fact('Роден', formatDate(p.birthDate)),
            fact('ЕГН', p.egn || '—'),
            fact('Телефон', p.phone || '—'),
            fact('Личен лекар', doctor ? doctor.name : '—'),
            p.birth && isPreterm(Number(p.birth.gestWeeks))
              ? fact('Гестационна възраст', p.birth.gestWeeks + ' с.') : null)),
        h('div', null, coverageRing(data.summary.coverage)),
        h('div.row.tight.no-print', null,
          h('button.btn.sm.primary', {
            onclick: () => visitDialog({ patientId: p.id, patientName: p.name, onDone: reload }),
          }, '✓ Отбележи посещение'),
          h('button.btn.sm', { onclick: () => openPatientForm(p, reload) }, '✎ Редакция'),
          h('button.btn.sm', { onclick: () => printImmunisationCard(p, data) }, '🖨 Имунизационен паспорт'),
          h('button.btn.sm.danger', {
            onclick: async () => {
              const ok = await confirmDialog({
                title: p.archived ? 'Връщане от архив' : 'Архивиране на досието',
                message: p.archived
                  ? `Досието на ${p.name} ще се върне в активния списък.`
                  : `${p.name} ще бъде преместен в архива и няма да излиза в напомнянията. Данните се запазват.`,
                confirmLabel: p.archived ? 'Върни' : 'Архивирай',
                danger: !p.archived,
              });
              if (!ok) return;
              await api.archivePatient(p.id, !p.archived, '');
              toast(p.archived ? 'Досието е върнато.' : 'Досието е архивирано.', 'ok');
              reload();
            },
          }, p.archived ? 'Върни от архив' : 'Архивирай'))),
      alerts.length ? h('div.stack', { style: { marginTop: '12px' } }, alerts) : null,
      p.notes ? h('p.small.muted', { style: { marginTop: '10px', marginBottom: 0 } },
        h('strong', null, 'Бележки: '), p.notes) : null)));
}

function fact(k, v) {
  return h('div.fact', null, h('div.k', null, k), h('div.v', null, v));
}

/* ---------------------------------- обзор ------------------------------------ */

function overviewTab(ctx) {
  const { p, data, actionable, reload } = ctx;
  const growth = data.growth || [];
  const last = growth[growth.length - 1];

  const next = data.plan.filter(e => e.status === 'soon').slice(0, 5);

  return h('div.grid.cols-2', null,
    card(actionable.length ? `За извършване (${actionable.length})` : 'За извършване',
      { icon: '📌', tight: true },
      actionable.length
        ? table(['Дейност', 'Срок', 'Състояние', ''],
          actionable.slice(0, 12).map(e => planRow(e, ctx, true)))
        : empty('Всичко по календара е изпълнено.', '✓')),

    card('Предстоящи', { icon: '📅', tight: true },
      next.length
        ? table(['Дейност', 'Срок', 'Състояние', ''], next.map(e => planRow(e, ctx, true)))
        : empty('Няма предстоящи дейности в близките дни.', '·')),

    card('Растеж', {
      icon: '📈',
      actions: h('button.btn.sm', { onclick: () => { activeTab = 'growth'; renderTabFromOverview(ctx); } }, 'Подробно'),
    },
      last
        ? h('div', null,
          h('div.muted.small', null, 'Последно измерване: ' + formatDate(last.date),
            ' · ', formatAge(p.birthDate, last.date)),
          h('div.grid.cols-3', { style: { marginTop: '10px' } },
            measureTile('Тегло', last.weight, 'кг', last.assessments.weight),
            measureTile('Ръст', last.height, 'см', last.assessments.height),
            last.head ? measureTile('Глава', last.head, 'см', last.assessments.head) : null,
            last.bmi ? measureTile('ИТМ', last.bmi.toFixed(1), 'кг/м²', last.assessments.bmi) : null))
        : h('div', null,
          h('p.muted.small', null, 'Още няма записани измервания.'),
          h('button.btn.sm.primary', { onclick: () => addMeasurementDialog(ctx) }, '＋ Добави измерване'))),

    card('Последни прегледи', { icon: '🩺', tight: true },
      (p.visits || []).length
        ? h('div.body', null, h('div.timeline', null,
          [...p.visits].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 4).map(v =>
            h('div.entry', null,
              h('div.small', null, h('strong', null, formatDate(v.date)), ' · ', v.type),
              v.diagnosis ? h('div.small', null, v.diagnosis, v.icd ? ` (${v.icd})` : '') : null))))
        : empty('Няма записани прегледи.', '·')));
}

function renderTabFromOverview(ctx) {
  // Превключването от обзора минава през пълно преизчертаване, за да се
  // обновят и броячите по разделите.
  ctx.reload();
}

function measureTile(label, value, unit, assessment) {
  if (value === null || value === undefined) return null;
  const sev = assessment ? assessment.severity : 0;
  return h('div', null,
    h('div.tiny.dim', null, label),
    h('div', { style: { fontSize: '18px', fontWeight: '650' } }, value, h('span.small.dim', null, ' ' + unit)),
    assessment
      ? h('div.tiny', null,
        h('span.z-pill.s' + sev, null, 'П' + Math.round(assessment.percentile)),
        ' · ', assessment.label)
      : null);
}

/* ------------------------------- имунизации ---------------------------------- */

function vaccinesTab(ctx) {
  const { p, vaccines, reload } = ctx;
  const optIn = new Set(p.optIn || []);
  const recommended = state.schedule.filter(i => i.optIn);

  const mandatory = vaccines.filter(e => !e.optIn);
  const chosen = vaccines.filter(e => e.optIn);

  // Препоръчителните ваксини се включват по серии, а не доза по доза:
  // лекарят решава „това дете ще се ваксинира срещу ротавирус“, а не
  // отделно за всеки прием.
  const groups = new Map();
  for (const item of recommended) {
    const key = item.optInGroup || item.id;
    if (!groups.has(key)) groups.set(key, { key, items: [], meta: OPT_IN_GROUPS[key] });
    groups.get(key).items.push(item);
  }

  const toggle = async (group, on, checkbox) => {
    const set = new Set(p.optIn || []);
    for (const item of group.items) {
      if (on) set.add(item.id); else set.delete(item.id);
    }
    try {
      await api.setOptIn(p.id, [...set]);
      await reload();
    } catch (err) {
      toast(err.message, 'error');
      checkbox.checked = !on;
    }
  };

  return h('div.stack', null,
    card('Задължителни имунизации', {
      icon: '💉', tight: true,
      actions: h('span.small.muted', null,
        `${mandatory.filter(e => e.status === 'done').length} от ${mandatory.length} поставени`),
    }, table(['Ваксина', 'Възраст', 'Срок', 'Състояние', 'Партида', ''],
      mandatory.map(e => planRow(e, ctx)))),

    chosen.length
      ? card('Препоръчителни имунизации', { icon: '➕', tight: true },
        table(['Ваксина', 'Възраст', 'Срок', 'Състояние', 'Партида', ''], chosen.map(e => planRow(e, ctx))))
      : null,

    card('Избор на препоръчителни имунизации', { icon: '☑' },
      h('p.small.muted', null,
        'Отбележете кои препоръчителни ваксини се прилагат на това дете. '
        + 'Само отбелязаните влизат в напомнянията. Отметката включва цялата серия.'),
      h('div.grid.cols-2', null, [...groups.values()].map(group => {
        const on = group.items.every(i => optIn.has(i.id));
        const box = h('input', { type: 'checkbox', checked: on });
        box.addEventListener('change', () => toggle(group, box.checked, box));
        const label = group.meta ? group.meta.label : group.items[0].name;
        const protects = group.items[0].protects;
        return h('label.check', null, box,
          h('span', null,
            h('strong', null, label),
            h('span.tiny.dim', null, group.items.length > 1 ? ` · ${group.items.length} приема` : ''),
            protects ? h('div.tiny.dim', null, protects) : null,
            group.meta && group.meta.note ? h('div.tiny.dim', null, group.meta.note) : null));
      }))));
}

/* --------------------------- прегледи по календар ---------------------------- */

function checkupsTab(ctx) {
  const { checkups } = ctx;
  const upcoming = checkups.filter(e =>
    e.status !== 'done' && e.status !== 'skipped' && e.status !== 'missed');
  const done = checkups.filter(e => e.status === 'done');
  const missed = checkups.filter(e => e.status === 'missed');

  return h('div.stack', null,
    card('Предстоящи и дължими', { icon: '🩺', tight: true },
      upcoming.length
        ? table(['Дейност', 'Възраст', 'Срок', 'Състояние', '', ''],
          upcoming.slice(0, 40).map(e => planRow(e, ctx)))
        : empty('Няма предстоящи прегледи.', '✓')),
    done.length
      ? card(`Извършени (${done.length})`, { icon: '✓', tight: true },
        table(['Дейност', 'Възраст', 'Извършен на', '', '', ''], done.map(e => planRow(e, ctx))))
      : null,
    missed.length
      ? card(`Пропуснати (${missed.length})`, { icon: '·', tight: true },
        h('div.body', null, h('p.small.muted', { style: { margin: 0 } },
          'Възрастовият период на тези дейности е отминал — те не се броят за просрочени '
          + 'и не влизат в списъка със задачи. Остават тук за пълнота на досието.')),
        table(['Дейност', 'Възраст', 'Падеж', 'Състояние', '', ''], missed.map(e => planRow(e, ctx))))
      : null);
}

/* ------------------------------ ред от плана --------------------------------- */

function planRow(e, ctx, compact = false) {
  const { p, reload } = ctx;
  const item = state.scheduleById.get(e.id) || { id: e.id, name: e.name, group: e.group, short: e.short };
  const rec = e.record;

  const actions = h('td.actions.no-print', null,
    e.status === 'done'
      ? h('button.btn.xs', {
        title: 'Отмени отбелязването',
        onclick: async (ev) => {
          ev.stopPropagation();
          const ok = await confirmDialog({
            title: 'Отмяна',
            message: `Записът за „${e.name}“ ще бъде премахнат от досието.`,
            confirmLabel: 'Отмени', danger: true,
          });
          if (!ok) return;
          await api.clearRecord(p.id, e.id);
          toast('Записът е премахнат.');
          reload();
        },
      }, '↺')
      : h('div.row.tight', { style: { justifyContent: 'flex-end' } },
        h('button.btn.xs.primary', {
          title: 'Отбележи като извършено',
          onclick: () => markDoneDialog({ patientId: p.id, patientName: p.name, item, onDone: reload }),
        }, '✓'),
        !compact && e.group === 'vaccine' ? h('button.btn.xs', {
          title: 'Медицински отвод',
          onclick: () => deferDialog({ patientId: p.id, patientName: p.name, item, onDone: reload }),
        }, '⏸') : null,
        !compact && e.group === 'vaccine' ? h('button.btn.xs', {
          title: 'Отказ от родител',
          onclick: () => refuseDialog({ patientId: p.id, patientName: p.name, item, onDone: reload }),
        }, '✕') : null));

  const nameCell = h('td', null,
    h('div', { style: { fontWeight: '600' } }, e.name),
    e.note ? h('div.tiny.dim', null, e.note) : null,
    rec && rec.reason ? h('div.tiny.dim', null, 'Причина: ' + rec.reason) : null,
    rec && rec.note ? h('div.tiny.dim', null, rec.note) : null);

  if (compact) {
    return h('tr' + (e.status === 'overdue' ? '.attention' : ''), null,
      nameCell,
      h('td.nowrap.small', null, formatDateShort(e.due)),
      h('td', null, statusBadge(e)),
      actions);
  }

  return h('tr' + (e.status === 'overdue' ? '.attention' : ''), null,
    nameCell,
    h('td.nowrap.small.dim', null, ageLabel(e.doseMonths)),
    h('td.nowrap.small', null,
      h('div', null, formatDate(e.due)),
      e.status !== 'done' ? h('div.tiny.dim', null, relativeDays(e.due)) : null),
    h('td', null, statusBadge(e)),
    h('td.small.mono', null, rec && rec.batch ? rec.batch : rec && rec.product ? rec.product : ''),
    actions);
}

function ageLabel(months) {
  if (months === 0) return 'при раждане';
  if (months < 12) return months + ' мес.';
  const y = Math.floor(months / 12), m = Math.round(months % 12);
  return m ? `${y} г. ${m} м.` : `${y} г.`;
}

/* ---------------------------------- растеж ----------------------------------- */

function growthTab(ctx) {
  const { p, data, reload } = ctx;
  const growth = data.growth || [];
  const concerns = data.concerns || [];
  const preterm = p.birth && isPreterm(Number(p.birth.gestWeeks));
  const target = data.targetHeight;

  const charts = Object.values(INDICATORS).map(ind => {
    const points = growth
      .map(m => {
        const value = ind.key === 'bmi' ? m.bmi : m[ind.key];
        const a = m.assessments[ind.key];
        return value ? { ageMonths: m.ageMonths, value, severity: a ? a.severity : 0, label: a ? a.label : '' } : null;
      })
      .filter(Boolean);
    if (!points.length) return null;
    const chart = growthChart(ind.key, p, points);
    if (!chart) return null;
    const latest = points[points.length - 1];
    return h('div.chart-card', null,
      h('h3', null, ind.label),
      h('div.sub', null, `последно: ${fmtNum(latest.value)} ${ind.unit}`),
      chart);
  }).filter(Boolean);

  const rows = [...growth].reverse().map(m => h('tr', null,
    h('td.nowrap', null,
      h('div', null, formatDate(m.date)),
      h('div.tiny.dim', null, formatAge(p.birthDate, m.date)),
      m.ageCorrected
        ? h('div.tiny', { style: { color: 'var(--brand)' } },
          'коригирана: ' + fmtNum(Math.round(m.ageMonths * 10) / 10) + ' мес.')
        : null),
    valueCell(m.weight, 'кг', m.assessments.weight),
    valueCell(m.height, 'см', m.assessments.height),
    valueCell(m.head, 'см', m.assessments.head),
    valueCell(m.bmi ? +m.bmi.toFixed(1) : null, '', m.assessments.bmi),
    bpCell(m),
    h('td.small.muted', null, m.note || ''),
    h('td.actions.no-print', null, h('button.btn.xs.danger', {
      onclick: async () => {
        const ok = await confirmDialog({
          title: 'Изтриване на измерване',
          message: `Измерването от ${formatDate(m.date)} ще бъде изтрито.`,
          confirmLabel: 'Изтрий', danger: true,
        });
        if (!ok) return;
        await api.deleteMeasurement(p.id, m.id);
        toast('Измерването е изтрито.');
        reload();
      },
    }, '✕'))));

  return h('div.stack', null,
    h('div.row.no-print', null,
      h('button.btn.primary', { onclick: () => addMeasurementDialog(ctx) }, '＋ Ново измерване'),
      h('div.grow'),
      h('span.small.muted', null, 'Кривите следват стандартите на СЗО (перцентили 3–97).')),

    concerns.length ? h('div.stack', null, concerns.map(c =>
      h('div.alert-strip' + (c.severity >= 2 ? '' : '.warn'), null,
        h('div', null,
          h('strong', null, c.title),
          h('div.small', { style: { fontWeight: '400' } }, c.detail))))) : null,

    preterm ? h('div.alert-strip.info', null,
      h('div', null,
        h('strong', null, `Родено на ${p.birth.gestWeeks} гестационна седмица. `),
        'Растежът се оценява по ',
        h('strong', null, 'коригирана възраст'),
        ` до навършени ${CORRECT_UNTIL_MONTHS} месеца. `,
        'Имунизациите обаче се прилагат по хронологична възраст — недоносеното дете '
        + 'получава ваксините си на същата календарна възраст като доносеното.')) : null,

    target ? h('div.alert-strip.info', null,
      h('div', null,
        h('strong', null, 'Целеви (средно родителски) ръст: '),
        `${target.target.toFixed(0)} см `,
        h('span.small', { style: { fontWeight: '400' } },
          `(очакван диапазон ${target.low.toFixed(0)}–${target.high.toFixed(0)} см)`))) : null,

    charts.length
      ? h('div.charts', null, charts)
      : card(null, {}, empty('Добавете измерване, за да се начертаят кривите.', '📈')),

    growth.length
      ? card('Записани измервания', { tight: true },
        table(['Дата', 'Тегло', 'Ръст', 'Глава', 'ИТМ', 'Налягане', 'Бележка', ''], rows))
      : null,

    growth.length ? h('p.tiny.muted', null,
      'Стойностите за тегло и обиколка на главата се оценяват до 5-годишна възраст, '
      + 'ръстът и ИТМ — до 19 години. От 24-месечна възраст ръстът се измерва в изправено положение. '
      + 'Артериалното налягане се сравнява със скрининговата таблица на Американската академия '
      + 'по педиатрия (2017); стойност над прага изисква повторни измервания в различни дни.') : null);
}

function valueCell(value, unit, assessment) {
  if (value === null || value === undefined) return h('td.dim', null, '—');
  return h('td.nowrap', null,
    h('span.mono', { style: { fontWeight: '600' } }, fmtNum(value)),
    unit ? h('span.tiny.dim', null, ' ' + unit) : null,
    assessment
      ? h('div.tiny', null,
        h('span.z-pill.s' + assessment.severity, null,
          'П' + Math.round(assessment.percentile), ' · z ', assessment.z.toFixed(1)))
      : null);
}

function bpCell(m) {
  if (!(m.systolic > 0) || !(m.diastolic > 0)) return h('td.dim', null, '—');
  const a = m.assessments.bp;
  return h('td.nowrap', null,
    h('span.mono', { style: { fontWeight: '600' } }, `${m.systolic}/${m.diastolic}`),
    a ? h('div.tiny', null, h('span.z-pill.s' + a.severity, null, a.label)) : null);
}

const fmtNum = (v) => (Math.round(v * 100) / 100).toString().replace('.', ',');

function addMeasurementDialog(ctx) {
  const { p, reload } = ctx;
  let form;
  const submit = async (close) => {
    const data = decimalFields(Object.fromEntries(new FormData(form)),
      ['weight', 'height', 'head', 'systolic', 'diastolic']);
    try {
      await api.addMeasurement(p.id, data);
      toast('Измерването е записано.', 'ok');
      close();
      await reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  modal({
    title: 'Ново измерване — ' + p.name,
    body: (close) => {
      form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div.full', null, field('Дата', input({ name: 'date', type: 'date', value: today(), max: today(), required: true }))),
        h('div', null, field('Тегло (кг)', numberInput({ name: 'weight', min: 0.3, max: 200, placeholder: 'напр. 8,4' }))),
        h('div', null, field('Ръст / дължина (см)', numberInput({ name: 'height', min: 20, max: 230, placeholder: 'напр. 68,5' }))),
        h('div', null, field('Обиколка на главата (см)', numberInput({ name: 'head', min: 20, max: 70 }))),
        h('div', null, field('Систолно налягане', numberInput({ name: 'systolic', min: 50, max: 250, placeholder: 'mmHg' }),
          'От 3-годишна възраст — ежегодно.')),
        h('div', null, field('Диастолно налягане', numberInput({ name: 'diastolic', min: 20, max: 160, placeholder: 'mmHg' }))),
        h('div.full', null, field('Бележка', input({ name: 'note' }))));
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, 'Запиши'),
    ],
  });
}

/* ---------------------------------- визити ----------------------------------- */

function visitsTab(ctx) {
  const { p, reload } = ctx;
  const visits = [...(p.visits || [])].sort((a, b) => (a.date < b.date ? 1 : -1));

  return h('div.stack', null,
    h('div.row.no-print', null,
      h('button.btn.primary', { onclick: () => addVisitDialog(ctx) }, '＋ Нов преглед'),
      h('div.grow'),
      h('span.small.muted', null, `${visits.length} записани прегледа`)),

    visits.length
      ? card(null, {}, h('div.timeline', null, visits.map(v =>
        h('div.entry', null,
          h('div.row', null,
            h('strong', null, formatDate(v.date)),
            badge('', v.type),
            v.icd ? badge('', v.icd) : null,
            h('div.grow'),
            h('button.btn.xs.danger.no-print', {
              onclick: async () => {
                const ok = await confirmDialog({
                  title: 'Изтриване на преглед',
                  message: `Прегледът от ${formatDate(v.date)} ще бъде изтрит.`,
                  confirmLabel: 'Изтрий', danger: true,
                });
                if (!ok) return;
                await api.deleteVisit(p.id, v.id);
                toast('Прегледът е изтрит.');
                reload();
              },
            }, '✕')),
          v.diagnosis ? h('div', { style: { fontWeight: '600', marginTop: '2px' } }, v.diagnosis) : null,
          v.complaint ? h('div.small', null, h('span.dim', null, 'Оплаквания: '), v.complaint) : null,
          v.findings ? h('div.small', null, h('span.dim', null, 'Обективно: '), v.findings) : null,
          v.treatment ? h('div.small', null, h('span.dim', null, 'Терапия: '), v.treatment) : null,
          v.note ? h('div.small.muted', null, v.note) : null))))
      : card(null, {}, empty('Няма записани прегледи.', '🩺')));
}

function addVisitDialog(ctx) {
  const { p, reload } = ctx;
  let form;
  const submit = async (close) => {
    const data = Object.fromEntries(new FormData(form));
    try {
      await api.addVisit(p.id, data);
      toast('Прегледът е записан.', 'ok');
      close();
      await reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  modal({
    title: 'Нов преглед — ' + p.name,
    wide: true,
    body: (close) => {
      form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div', null, field('Дата', input({ name: 'date', type: 'date', value: today(), max: today(), required: true }))),
        h('div', null, field('Вид', select([
          'Амбулаторен преглед', 'Профилактичен преглед', 'Вторичен преглед',
          'Домашно посещение', 'Консултация по телефон', 'Издаване на документ',
        ].map(v => ({ value: v, label: v })), { name: 'type' }))),
        h('div.full', null, field('Оплаквания', h('textarea', { name: 'complaint', rows: 2 }))),
        h('div.full', null, field('Обективно състояние', h('textarea', { name: 'findings', rows: 3 }))),
        h('div', null, field('Диагноза', input({ name: 'diagnosis', placeholder: 'напр. Остър фарингит' }))),
        h('div', null, field('Код по МКБ-10', input({ name: 'icd', placeholder: 'J02.9', maxlength: 10 }))),
        h('div.full', null, field('Терапия', h('textarea', { name: 'treatment', rows: 2 }))),
        h('div.full', null, field('Бележка', input({ name: 'note' }))));
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, 'Запиши'),
    ],
  });
}

/* -------------------------------- напомняния --------------------------------- */

function remindersTab(ctx) {
  const { p, reload } = ctx;
  const reminders = [...(p.reminders || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  const open = reminders.filter(r => !r.done);
  const done = reminders.filter(r => r.done);

  const row = (r) => h('li', null, h('div.row', null,
    h('input', {
      type: 'checkbox', checked: r.done,
      onchange: async (e) => {
        try {
          await api.updateReminder(p.id, r.id, { done: e.target.checked });
          await reload();
        } catch (err) { toast(err.message, 'error'); }
      },
    }),
    h('div.grow', null,
      h('div', { style: { textDecoration: r.done ? 'line-through' : 'none' } }, r.text),
      h('div.tiny.dim', null, formatDate(r.date), ' · ',
        r.done ? 'изпълнено ' + formatDate(r.doneDate) : relativeDays(r.date))),
    !r.done && r.date < today() ? badge('overdue', 'просрочено') : null,
    h('button.btn.xs.danger.no-print', {
      onclick: async () => {
        await api.deleteReminder(p.id, r.id);
        toast('Напомнянето е изтрито.');
        reload();
      },
    }, '✕')));

  return h('div.stack', null,
    h('div.row.no-print', null,
      h('button.btn.primary', { onclick: () => addReminderDialog(ctx) }, '＋ Ново напомняне'),
      h('div.grow'),
      h('span.small.muted', null, 'Свободни напомняния извън календара — контролен преглед, изследване, документ.')),
    card('Активни', { icon: '🔔' },
      open.length ? h('ul.list-plain', null, open.map(row)) : empty('Няма активни напомняния.', '·')),
    done.length ? card('Изпълнени', { icon: '✓' }, h('ul.list-plain', null, done.map(row))) : null);
}

function addReminderDialog(ctx) {
  const { p, reload } = ctx;
  let form;
  const submit = async (close) => {
    const data = Object.fromEntries(new FormData(form));
    try {
      await api.addReminder(p.id, data);
      toast('Напомнянето е добавено.', 'ok');
      close();
      await reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  modal({
    title: 'Ново напомняне — ' + p.name,
    body: (close) => {
      form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div.full', null, field('Какво да се направи',
          input({ name: 'text', required: true, placeholder: 'напр. Контролен преглед след отит' }))),
        h('div.full', null, field('Дата', input({ name: 'date', type: 'date', value: today(), required: true }))));
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, 'Добави'),
    ],
  });
}
