/* Досие на пациент в практиката за СИМП: обзор, разделите на
 * специалностите, прегледи (амбулаторни листове), направления, протоколи,
 * диспансерно наблюдение и — при пълнолетен — заболявания, лекарства,
 * изследвания и измервания. */

import { api } from '../api.js';
import { state } from '../app.js';
import { badge, card, confirmDialog, empty, h, mount, table, toast } from '../ui/components.js';
import { formatAge, formatDate, formatDateShort, relativeDays, today, weekdayName } from '../shared/dates.js';
import { APPT_STATUS, EXAM_TYPES, REFERRAL_PURPOSES } from '../shared/simp.js';
import { MODULES, enabledModules } from '../shared/specialty.js';
import { ADULT_VIEWS, adultHeaderAlerts } from './adult-patient.js';
import { deleteWithConfirm } from './adult-dialogs.js';
import { examDialog, followupDialog, printExam, protocolDialog, referralDialog } from './simp-dialogs.js';
import { bookDialog } from './agenda.js';
import { openPatientForm } from './patients.js';
import { growthTab } from './patient.js';
import { assistantOverviewCard, assistantTab } from './assistant-panel.js';

let activeTab = 'overview';
let activeFor = null;

const REF_CLS = { new: 'due', secondary: 'soon', done: 'done', closed: 'skipped' };
const PROTO_CLS = { active: 'done', expiring: 'due', expired: 'overdue', renewed: 'skipped', cancelled: 'skipped' };
const FOLLOW_CLS = { ok: 'future', soon: 'soon', due: 'due', overdue: 'overdue', ended: 'skipped' };
const APPT_CLS = { booked: 'soon', arrived: 'due', done: 'done', noshow: 'overdue', cancelled: 'skipped' };

function tabsFor(data) {
  const tabs = [{ id: 'overview', label: 'Обзор' }, { id: 'assistant', label: 'Асистент' }];
  if (data.isAdult) for (const id of enabledModules(state.settings)) tabs.push({ id, label: MODULES[id].name });
  tabs.push(
    { id: 'exams', label: 'Прегледи' },
    { id: 'referrals', label: 'Направления' },
    { id: 'protocols', label: 'Протоколи' },
    { id: 'followups', label: 'Наблюдение' },
  );
  if (data.isAdult) {
    tabs.push(
      { id: 'chronic', label: 'Заболявания' },
      { id: 'meds', label: 'Лекарства' },
      { id: 'labs', label: 'Изследвания' },
      { id: 'vitals', label: 'Измервания' },
    );
  } else {
    tabs.push({ id: 'growth', label: 'Растеж' });
  }
  return tabs;
}

function tabCount(id, data) {
  const s = data.simp;
  if (MODULES[id]) return (data.specialty?.[id]?.alerts || []).filter(x => x.severity >= 2).length;
  if (id === 'assistant') return data.assistant?.active || 0;
  if (id === 'referrals') return s.referrals.filter(r => r.state.status === 'new' || r.state.status === 'secondary').length;
  if (id === 'protocols') return s.protocols.filter(x => x.state.status === 'expiring' || x.state.status === 'expired').length;
  if (id === 'followups') return s.followups.filter(f => f.state.status === 'overdue' || f.state.status === 'due').length;
  if (id === 'meds' && data.adult) return data.adult.medAlerts.filter(x => x.severity === 'contra' || x.severity === 'major').length;
  return 0;
}

export async function renderSimpPatient(host, id, params = new URLSearchParams()) {
  const data = await api.patient(id);
  const p = data.patient;
  const reload = () => renderSimpPatient(host, id);
  if (activeFor !== id) { activeTab = 'overview'; activeFor = id; }
  if (params.get('tab')) {
    activeTab = params.get('tab');
    history.replaceState(null, '', '#/patient/' + id);
  }

  const ctx = {
    p, data, reload, isAdult: !!data.isAdult, a: data.adult,
    openTab: (tab) => { activeTab = tab; renderTab(); },
    // От разделите за възрастни: „Диспансерен преглед“ отваря прегледа на специалиста.
    addVisit: () => examDialog(ctx, {}),
  };
  const tabs = tabsFor(data);
  if (!tabs.some(t => t.id === activeTab)) activeTab = 'overview';

  const tabBar = h('div.tabs.no-print', null, tabs.map(t => {
    const n = tabCount(t.id, data);
    return h('button' + (activeTab === t.id ? '.active' : ''), { onclick: () => { activeTab = t.id; renderTab(); } },
      t.label, n ? h('span.n', null, n) : null);
  }));
  const content = h('div#tabContent');
  const views = {
    ...ADULT_VIEWS,
    overview: overviewTab, assistant: assistantTab, exams: examsTab, referrals: referralsTab, protocols: protocolsTab, followups: followupsTab,
    growth: growthTab,
  };
  const renderTab = () => {
    for (const [i, btn] of [...tabBar.children].entries()) btn.classList.toggle('active', tabs[i].id === activeTab);
    mount(content, (views[activeTab] || overviewTab)(ctx));
  };

  mount(host, header(ctx), tabBar, content);
  renderTab();

  // Преглед, започнат от записан час в графика.
  const fromAppt = params.get('exam');
  if (fromAppt) {
    history.replaceState(null, '', '#/patient/' + id);
    const appt = (data.appointments || []).find(a => a.id === fromAppt);
    if (appt) examDialog(ctx, { appointment: appt });
  }
}

/* --------------------------------- заглавие --------------------------------- */

function header(ctx) {
  const { p, data, reload } = ctx;
  const s = data.simp;
  const doctor = state.doctors.find(d => d.id === p.doctorId);
  const alerts = [];
  if (p.allergies?.length) alerts.push(h('div.alert-strip', null, '⚠ Алергии: ', h('strong', null, p.allergies.join(', '))));
  if (ctx.isAdult && ctx.a) alerts.push(...adultHeaderAlerts(ctx));
  for (const al of s.alerts) alerts.push(h('div.alert-strip' + (al.severity >= 2 ? '' : '.warn'), null, al.text));
  if (p.archived) alerts.push(h('div.alert-strip.warn', null, 'Досието е в архив.', p.archivedReason ? ' ' + p.archivedReason : ''));
  const next = s.nextAppt;

  return h('div.card', null, h('div.body', null,
    h('div.patient-head', null,
      h('div.who', null,
        h('button.btn.ghost.sm.no-print', { onclick: () => { location.hash = '#/patients'; }, style: { marginBottom: '6px', marginLeft: '-8px' } }, '← Всички пациенти'),
        h('h1', null, p.name, h('span.dim', { style: { fontSize: '18px' } }, p.sex === 'f' ? '♀' : p.sex === 'm' ? '♂' : '')),
        h('div.facts', null,
          fact('Възраст', formatAge(p.birthDate)),
          fact(p.sex === 'f' ? 'Родена' : 'Роден', formatDate(p.birthDate)),
          fact('ЕГН', p.egn || '—'),
          fact('Телефон', p.phone || '—'),
          fact('Личен лекар', p.gp?.name ? p.gp.name + (p.gp.phone ? ` · ${p.gp.phone}` : '') : '—'),
          fact('Лекуващ', doctor ? doctor.name : '—'),
          fact('Следващ час', next ? `${formatDateShort(next.date)}, ${next.time}` : '—'))),
      h('div.row.tight.no-print', { style: { flexWrap: 'wrap', justifyContent: 'flex-end' } },
        h('button.btn.sm.primary', { onclick: () => examDialog(ctx) }, '＋ Преглед'),
        h('button.btn.sm', { onclick: () => bookDialog({ patient: p, onDone: reload }) }, '＋ Час'),
        h('button.btn.sm', { onclick: () => referralDialog(ctx) }, '＋ Направление'),
        h('button.btn.sm', { onclick: () => openPatientForm(p, reload) }, '✎ Редакция'),
        h('button.btn.sm.danger', {
          onclick: async () => {
            const ok = await confirmDialog({
              title: p.archived ? 'Връщане от архив' : 'Архивиране на досието',
              message: p.archived ? `Досието на ${p.name} ще се върне в активния списък.`
                : `Досието на ${p.name} ще бъде преместено в архива. Данните се запазват.`,
              confirmLabel: p.archived ? 'Върни' : 'Архивирай', danger: !p.archived,
            });
            if (!ok) return;
            await api.archivePatient(p.id, !p.archived, '');
            reload();
          },
        }, p.archived ? 'Върни от архив' : 'Архивирай'))),
    alerts.length ? h('div.stack', { style: { marginTop: '12px' } }, alerts) : null,
    p.notes ? h('p.small.muted', { style: { marginTop: '10px', marginBottom: 0 } }, h('strong', null, 'Бележки: '), p.notes) : null));
}

const fact = (k, v) => h('div.fact', null, h('div.k', null, k), h('div.v', null, v));

/* ----------------------------------- обзор ----------------------------------- */

function overviewTab(ctx) {
  const { data } = ctx;
  return h('div.overview-grid', null,
    h('div.col', null, assistantOverviewCard(ctx), signalsCard(ctx), referralsCard(ctx), recentExamsCard(ctx)),
    h('div.col', null, apptCard(ctx), followupsCard(ctx), protocolsCard(ctx), data.isAdult ? vitalsMini(ctx) : null));
}

function signalsCard(ctx) {
  const { data } = ctx;
  const items = [];
  for (const id of enabledModules(state.settings)) {
    for (const al of (data.specialty?.[id]?.alerts || []).filter(x => x.severity >= 2)) {
      items.push(h('div.alert-strip' + (al.severity >= 3 ? '' : '.warn'), null,
        h('div.grow', null, h('strong', null, MODULES[id].name + ': '), al.text),
        h('button.btn.xs', { onclick: () => ctx.openTab(id) }, 'Виж')));
    }
  }
  if (data.adult) {
    for (const al of data.adult.medAlerts.filter(x => x.severity === 'contra' || x.severity === 'major').slice(0, 4)) {
      items.push(h('div.alert-strip' + (al.severity === 'contra' ? '' : '.warn'), null, h('strong', null, '💊 '), al.title));
    }
  }
  return card(items.length ? `Сигнали от специалностите (${items.length})` : 'Сигнали от специалностите', { icon: '⚠️' },
    items.length ? h('div.stack', { style: { gap: '8px' } }, items) : empty('Няма сериозни сигнали.', '✓'));
}

function referralsCard(ctx) {
  const open = ctx.data.simp.referrals.filter(r => r.state.status === 'new' || r.state.status === 'secondary');
  return card('Направления', {
    icon: '📨', tight: true,
    actions: h('button.btn.sm', { onclick: () => referralDialog(ctx) }, '＋ Направление'),
  }, open.length ? table(['Направление', 'Състояние', ''], open.map(r => h('tr', null,
    h('td', null, h('strong', null, r.number || 'без номер'), h('div.tiny.dim', null,
      `${REFERRAL_PURPOSES[r.purpose]} · ${formatDate(r.issued)}${r.fromName ? ' · ' + r.fromName : ''}`),
    r.diagnosis || r.icd ? h('div.tiny', null, [r.icd, r.diagnosis].filter(Boolean).join(' ')) : null),
    h('td', null, refBadge(r)),
    h('td.actions', null, h('button.btn.xs.primary', {
      onclick: () => examDialog(ctx, { referralId: r.id }),
    }, r.state.status === 'secondary' ? 'Вторичен' : 'Преглед')))))
    : empty('Няма отворени направления.', null));
}

function refBadge(r) {
  const st = r.state;
  if (st.status === 'secondary') {
    return badge(st.daysLeft <= 5 ? 'due' : 'soon', `вторичен до ${formatDateShort(st.secondaryUntil)}`);
  }
  if (st.status === 'new') return badge('due', st.waiting > 0 ? `чака ${st.waiting} ${st.waiting === 1 ? 'ден' : 'дни'}` : 'очаква преглед');
  return badge(REF_CLS[st.status], st.label.toLowerCase());
}

function recentExamsCard(ctx) {
  const exams = ctx.data.simp.exams;
  return card('Последни прегледи', {
    icon: '🩺', tight: true,
    actions: exams.length > 4 ? h('button.btn.sm', { onclick: () => ctx.openTab('exams') }, 'Всички') : null,
  }, exams.length ? h('div.body', null, h('div.timeline', null, exams.slice(0, 4).map(v => h('div.entry', null,
    h('div.small', null, h('strong', null, formatDate(v.date)), ' · ', v.type),
    h('div.small', null, [v.icd, v.diagnosis].filter(Boolean).join(' '))))))
    : empty('Още няма прегледи в практиката.', null));
}

function apptCard(ctx) {
  const { p, data, reload } = ctx;
  const upcoming = data.simp.upcoming;
  return card('Записани часове', {
    icon: '📅', tight: true,
    actions: h('button.btn.sm', { onclick: () => bookDialog({ patient: p, onDone: reload }) }, '＋ Час'),
  }, upcoming.length ? table(['Кога', 'Повод', ''], upcoming.slice(0, 4).map(a => h('tr', null,
    h('td.nowrap', null, h('strong', null, `${formatDateShort(a.date)}, ${a.time}`), h('div.tiny.dim', null, `${weekdayName(a.date)} · ${relativeDays(a.date)}`)),
    h('td.small', null, [...new Set([a.examType && EXAM_TYPES[a.examType]?.label, a.reason].filter(Boolean))].join(' · ') || '—'),
    h('td.actions', null, h('button.btn.xs', { onclick: () => bookDialog({ appointment: { ...a, patient: { id: p.id, name: p.name, birthDate: p.birthDate, phone: p.phone } }, onDone: reload }) }, '✎')))))
    : empty('Няма предстоящ час.', null));
}

function followupsCard(ctx) {
  const list = ctx.data.simp.followups.filter(f => f.status !== 'ended');
  return card('Диспансерно наблюдение', {
    icon: '🗓', tight: true,
    actions: h('button.btn.sm', { onclick: () => followupDialog(ctx) }, '＋ Наблюдение'),
  }, list.length ? table(['Заболяване', 'Следващ преглед', ''], list.map(f => h('tr' + (f.state.status === 'overdue' ? '.attention' : ''), null,
    h('td', null, h('strong', null, f.diagnosis || f.icd), h('div.tiny.dim', null, `${f.icd ? f.icd + ' · ' : ''}на ${f.everyMonths} мес.`)),
    h('td.nowrap', null, formatDateShort(f.state.due), h('div', null, followBadge(f))),
    h('td.actions', null, h('button.btn.xs', { onclick: () => followupDialog(ctx, f) }, '✎')))))
    : empty('Пациентът не е на диспансерно наблюдение в практиката.', null));
}

function followBadge(f) {
  const st = f.state;
  const label = { ok: 'планиран', soon: relativeDays(st.due), due: 'дължим', overdue: `просрочен ${st.overdueDays} дни`, ended: 'прекратено' }[st.status];
  return badge(FOLLOW_CLS[st.status], label);
}

function protocolsCard(ctx) {
  const list = ctx.data.simp.protocols.filter(x => ['active', 'expiring', 'expired'].includes(x.state.status));
  return card('Протоколи за лекарства', {
    icon: '📄', tight: true,
    actions: h('button.btn.sm', { onclick: () => protocolDialog(ctx) }, '＋ Протокол'),
  }, list.length ? table(['Лекарства', 'Валиден до', ''], list.map(pr => h('tr' + (pr.state.status === 'expired' ? '.attention' : ''), null,
    h('td', null, h('div.small', null, pr.drugs.join(', ')), h('div.tiny.dim', null, [pr.number && `№ ${pr.number}`, pr.kind].filter(Boolean).join(' · '))),
    h('td.nowrap', null, formatDateShort(pr.validUntil), h('div', null, badge(PROTO_CLS[pr.state.status], pr.state.label.toLowerCase()))),
    h('td.actions', null, pr.state.status !== 'active'
      ? h('button.btn.xs.primary', { onclick: () => protocolDialog(ctx, null, { renewFrom: pr }) }, 'Поднови') : null))))
    : empty('Няма активни протоколи.', null));
}

function vitalsMini(ctx) {
  const v = ctx.a.vitals;
  const bits = [
    v.bp ? `АН ${v.bp.systolic}/${v.bp.diastolic}${v.bp.pulse ? `, пулс ${v.bp.pulse}` : ''} (${formatDateShort(v.bp.date)})` : '',
    v.weight ? `тегло ${String(v.weight.value).replace('.', ',')} кг` : '',
    v.bmi ? `ИТМ ${String(v.bmi).replace('.', ',')}` : '',
    ctx.a.renal?.egfr ? `eGFR ${ctx.a.renal.egfr.value}` : '',
  ].filter(Boolean);
  return card('Показатели', { icon: '📊', actions: h('button.btn.sm', { onclick: () => ctx.openTab('vitals') }, 'Подробно') },
    bits.length ? h('div.small', null, bits.join(' · ')) : empty('Няма измервания.', null));
}

/* --------------------------------- прегледи --------------------------------- */

function examsTab(ctx) {
  const { p, data, reload } = ctx;
  const exams = data.simp.exams;
  // Прегледите, записани преди отделянето на СИМП (например „Консултация — кардиолог“ от 3.3).
  const older = (p.visits || []).filter(v => !v.simp).sort((a, b) => (a.date < b.date ? 1 : -1));
  const refs = new Map(data.simp.referrals.map(r => [r.id, r]));
  return h('div.stack', null,
    h('div.row.no-print', null,
      h('button.btn.primary', { onclick: () => examDialog(ctx) }, '＋ Преглед'),
      h('div.grow'),
      h('span.small.muted', null, `${exams.length} ${exams.length === 1 ? 'преглед' : 'прегледа'} в практиката`)),
    exams.length ? card(null, {}, h('div.timeline', null, exams.map(v => {
      const ref = refs.get(v.referralId);
      const doctor = state.doctors.find(d => d.id === v.doctorId);
      return h('div.entry', null,
        h('div.row', null,
          h('strong', null, formatDate(v.date), v.time ? ', ' + v.time : ''),
          badge('', v.type),
          v.icd ? badge('', v.icd) : null,
          ref ? h('span.tiny.dim', null, `направление ${ref.number || 'без номер'}`) : null,
          h('div.grow'),
          h('div.row.tight.no-print', null,
            h('button.btn.xs', { title: 'Печат на амбулаторния лист', onclick: () => printExam(p, v, { referral: ref }) }, '🖨'),
            h('button.btn.xs', { title: 'Поправка', onclick: () => examDialog(ctx, { exam: v }) }, '✎'),
            h('button.btn.xs.danger', {
              title: 'Изтриване',
              onclick: () => deleteWithConfirm(`Прегледът от ${formatDate(v.date)} ще бъде изтрит.`, () => api.deleteVisit(p.id, v.id), reload),
            }, '✕'))),
        v.diagnosis ? h('div', { style: { fontWeight: 600, marginTop: '2px' } }, v.diagnosis) : null,
        (v.extraDx || []).length ? h('div.small.muted', null, 'Придружаващи: ', v.extraDx.map(d => [d.text, d.icd && `(${d.icd})`].filter(Boolean).join(' ')).join('; ')) : null,
        v.complaint ? h('div.small', null, h('span.dim', null, 'Анамнеза: '), v.complaint) : null,
        v.findings ? h('div.small', null, h('span.dim', null, 'Статус: '), v.findings) : null,
        v.investigations ? h('div.small', null, h('span.dim', null, 'Изследвания: '), v.investigations) : null,
        v.treatment ? h('div.small', null, h('span.dim', null, 'Терапия: '), v.treatment) : null,
        v.recommendations ? h('div.small', null, h('span.dim', null, 'Препоръки: '), v.recommendations) : null,
        h('div.tiny.dim', null, [doctor?.name, v.nextDate && `следващ преглед ${formatDate(v.nextDate)}`].filter(Boolean).join(' · ')));
    }))) : card(null, {}, empty('Още няма прегледи.', '🩺')),
    older.length ? card(`По-стари записи (${older.length})`, { icon: '·', tight: true }, table(['Дата', 'Вид', 'Диагноза'], older.map(v => h('tr', null,
      h('td.small.nowrap', null, formatDate(v.date)), h('td.small', null, v.type), h('td.small', null, [v.icd, v.diagnosis].filter(Boolean).join(' ')))))) : null);
}

/* -------------------------------- направления -------------------------------- */

function referralsTab(ctx) {
  const { p, data, reload } = ctx;
  const list = data.simp.referrals;
  return h('div.stack', null,
    h('div.row.no-print', null,
      h('button.btn.primary', { onclick: () => referralDialog(ctx) }, '＋ Направление'),
      h('div.grow'),
      h('span.small.muted', null, `Вторичен преглед по същото направление — до ${state.settings.secondaryDays || 30} дни след първичния.`)),
    list.length ? card(null, { tight: true }, table(['НРН', 'Издадено', 'Цел', 'Насочен от', 'Диагноза', 'Прегледи', 'Състояние', ''], list.map(r => h('tr', null,
      h('td.mono.small', null, r.number || '—'),
      h('td.small.nowrap', null, formatDate(r.issued)),
      h('td.small', null, REFERRAL_PURPOSES[r.purpose]),
      h('td.small', null, r.fromName || '—', r.fromUin ? h('div.tiny.dim', null, 'УИН ' + r.fromUin) : null),
      h('td.small', null, [r.icd, r.diagnosis].filter(Boolean).join(' ') || '—'),
      h('td.small.nowrap', null, [r.state.primary && `първичен ${formatDateShort(r.state.primary)}`, r.state.secondary && `вторичен ${formatDateShort(r.state.secondary)}`].filter(Boolean).join(', ') || '—'),
      h('td', null, refBadge(r)),
      h('td.actions.no-print', null, h('div.row.tight', { style: { flexWrap: 'nowrap' } },
        h('button.btn.xs', { title: 'Поправка', onclick: () => referralDialog(ctx, r) }, '✎'),
        h('button.btn.xs', {
          title: r.closed ? 'Отвори отново' : 'Затвори направлението',
          onclick: async () => { try { await api.updateReferral(p.id, r.id, { closed: !r.closed }); reload(); } catch (err) { toast(err.message, 'error'); } },
        }, r.closed ? 'Отвори' : 'Затвори'),
        r.state.exams ? null : h('button.btn.xs.danger', {
          onclick: () => deleteWithConfirm(`Направление ${r.number || ''} ще бъде изтрито.`, () => api.deleteReferral(p.id, r.id), reload),
        }, '✕')))))))
      : card(null, {}, empty('Няма въведени направления.', '📨')));
}

/* --------------------------------- протоколи --------------------------------- */

function protocolsTab(ctx) {
  const { p, data, reload } = ctx;
  const list = data.simp.protocols;
  return h('div.stack', null,
    h('div.row.no-print', null,
      h('button.btn.primary', { onclick: () => protocolDialog(ctx) }, '＋ Протокол'),
      h('div.grow'),
      h('span.small.muted', null, `Предупреждение ${state.settings.protocolWarnDays || 30} дни преди изтичане — на таблото и тук.`)),
    list.length ? card(null, { tight: true }, table(['Номер', 'Лекарства', 'Диагноза', 'Издаден', 'Валиден до', 'Състояние', ''], list.map(pr => h('tr' + (pr.state.status === 'expired' ? '.attention' : ''), null,
      h('td.small', null, pr.number || '—', pr.kind ? h('div.tiny.dim', null, pr.kind) : null),
      h('td.small', null, pr.drugs.join(', ')),
      h('td.small', null, [pr.icd, pr.diagnosis].filter(Boolean).join(' ') || '—'),
      h('td.small.nowrap', null, formatDate(pr.issued)),
      h('td.small.nowrap', null, formatDate(pr.validUntil)),
      h('td', null, badge(PROTO_CLS[pr.state.status], pr.state.label.toLowerCase())),
      h('td.actions.no-print', null, h('div.row.tight', { style: { flexWrap: 'nowrap' } },
        ['active', 'expiring', 'expired'].includes(pr.state.status)
          ? h('button.btn.xs.primary', { onclick: () => protocolDialog(ctx, null, { renewFrom: pr }) }, 'Поднови') : null,
        h('button.btn.xs', { title: 'Поправка', onclick: () => protocolDialog(ctx, pr) }, '✎'),
        pr.state.status !== 'cancelled' ? h('button.btn.xs', {
          title: 'Анулиране',
          onclick: async () => {
            const ok = await confirmDialog({ title: 'Анулиране на протокол', message: `Протоколът за ${pr.drugs.join(', ')} ще бъде отбелязан като анулиран.`, confirmLabel: 'Анулирай', danger: true });
            if (!ok) return;
            try { await api.updateProtocol(p.id, pr.id, { status: 'cancelled' }); reload(); } catch (err) { toast(err.message, 'error'); }
          },
        }, 'Анулирай') : null,
        h('button.btn.xs.danger', {
          onclick: () => deleteWithConfirm('Протоколът ще бъде изтрит (грешно въведен).', () => api.deleteProtocol(p.id, pr.id), reload),
        }, '✕')))))))
      : card(null, {}, empty('Няма въведени протоколи.', '📄')),
    h('p.tiny.muted', null, 'Протоколите за лекарства, заплащани от НЗОК, се издават и регистрират по установения ред. Тук се води регистърът на практиката — за да не изтече протокол незабелязано.'));
}

/* ----------------------------- диспансерно наблюдение ----------------------------- */

function followupsTab(ctx) {
  const { p, data, reload } = ctx;
  const list = data.simp.followups;
  const appts = data.appointments || [];
  return h('div.stack', null,
    h('div.row.no-print', null,
      h('button.btn.primary', { onclick: () => followupDialog(ctx) }, '＋ Наблюдение'),
      h('div.grow'),
      h('span.small.muted', null, 'Следващият преглед се изчислява от последния преглед в практиката и честотата.')),
    list.length ? card(null, { tight: true }, table(['Заболяване', 'Честота', 'От', 'Последен преглед', 'Следващ', ''], list.map(f => h('tr' + (f.state.status === 'overdue' ? '.attention' : ''), null,
      h('td', null, h('strong', null, f.diagnosis || f.icd), f.icd && f.diagnosis ? h('div.tiny.dim', null, f.icd) : null, f.note ? h('div.tiny.dim', null, f.note) : null),
      h('td.small.nowrap', null, `на ${f.everyMonths} мес.`),
      h('td.small.nowrap', null, formatDate(f.since)),
      h('td.small.nowrap', null, f.state.last ? formatDate(f.state.last) : '—'),
      h('td.nowrap', null, f.status === 'ended' ? badge('skipped', `прекратено ${f.ended ? formatDateShort(f.ended) : ''}`.trim()) : h('div', null, formatDateShort(f.state.due), h('div', null, followBadge(f)))),
      h('td.actions.no-print', null, h('div.row.tight', { style: { flexWrap: 'nowrap' } },
        f.status !== 'ended' ? h('button.btn.xs.primary', { onclick: () => bookDialog({ patient: p, date: f.state.due > today() ? f.state.due : today(), examType: 'dispensary', reason: `Диспансерен преглед — ${f.diagnosis || f.icd}`, onDone: reload }) }, 'Час') : null,
        h('button.btn.xs', { title: 'Промяна', onclick: () => followupDialog(ctx, f) }, '✎'),
        h('button.btn.xs', {
          onclick: async () => {
            try {
              await api.updateFollowup(p.id, f.id, f.status === 'ended' ? { status: 'active' } : { status: 'ended' });
              reload();
            } catch (err) { toast(err.message, 'error'); }
          },
        }, f.status === 'ended' ? 'Поднови' : 'Прекрати'),
        h('button.btn.xs.danger', { onclick: () => deleteWithConfirm('Наблюдението ще бъде изтрито.', () => api.deleteFollowup(p.id, f.id), reload) }, '✕')))))))
      : card(null, {}, empty('Пациентът не е на диспансерно наблюдение в практиката.', '🗓')),
    appts.length ? card('История на часовете', { icon: '📅', tight: true }, table(['Дата', 'Час', 'Повод', 'Състояние'], appts.slice(0, 20).map(a => h('tr', null,
      h('td.small.nowrap', null, formatDate(a.date)), h('td.small', null, a.time),
      h('td.small', null, [...new Set([a.examType && EXAM_TYPES[a.examType]?.label, a.reason].filter(Boolean))].join(' · ') || '—'),
      h('td', null, badge(APPT_CLS[a.status], APPT_STATUS[a.status])))))) : null);
}
