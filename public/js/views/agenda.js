/* График с часове на практиката за СИМП: седмица, ден по лекари,
 * записване, пристигане, преглед от часа и списък за деня. */

import { api } from '../api.js';
import { state } from '../app.js';
import { badge, card, confirmDialog, empty, field, h, input, modal, mount, select, toast } from '../ui/components.js';
import { addDays, formatAge, formatDate, formatDateLong, today, weekdayName } from '../shared/dates.js';
import { APPT_STATUS, EXAM_TYPES, daySlots, firstFree, fromMinutes, isoWeekday, toMinutes } from '../shared/simp.js';
import { printWindow } from './adult-print.js';

let view = { date: null, doctor: 'all' };

const STATUS_CLS = { booked: 'soon', arrived: 'due', done: 'done', noshow: 'overdue', cancelled: 'skipped' };
const WEEKDAY_SHORT = ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'];

const activeDoctors = () => state.doctors.filter(d => d.active);
const endTime = (a) => fromMinutes(toMinutes(a.time) + a.minutes);
const weekStart = (iso) => addDays(iso, 1 - isoWeekday(iso));

export async function renderAgenda(host) {
  if (!view.date) view.date = today();
  const rerender = () => renderAgenda(host);
  const monday = weekStart(view.date);
  const data = await api.appointments({ from: monday, to: addDays(monday, 6) });
  const agenda = data.agenda;
  const doctors = activeDoctors();
  const byDoctor = (a) => view.doctor === 'all' || (a.doctorId || '') === (view.doctor === 'none' ? '' : view.doctor);
  const all = data.appointments.filter(byDoctor);
  const dayAppts = all.filter(a => a.date === view.date);

  const go = (d) => { view.date = d; rerender(); };
  const dateInput = input({ type: 'date', class: 'agenda-date', value: view.date, onchange: (e) => e.target.value && go(e.target.value) });
  const doctorSelect = doctors.length > 1 || data.appointments.some(a => !a.doctorId)
    ? select([
      { value: 'all', label: 'всички лекари', selected: view.doctor === 'all' },
      ...doctors.map(d => ({ value: d.id, label: d.name, selected: view.doctor === d.id })),
      { value: 'none', label: 'без избран лекар', selected: view.doctor === 'none' },
    ], { style: { width: 'auto' }, onchange: (e) => { view.doctor = e.target.value; rerender(); } })
    : null;

  const week = h('div.week-strip', null, Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    const n = all.filter(a => a.date === d && a.status !== 'cancelled').length;
    const off = !agenda.days.includes(i + 1);
    return h('button.week-day' + (d === view.date ? '.active' : '') + (d === today() ? '.today' : '') + (off ? '.off' : ''), { onclick: () => go(d) },
      h('div.wd', null, WEEKDAY_SHORT[i + 1]),
      h('div.dn', null, d.slice(8, 10).replace(/^0/, '') + '.' + d.slice(5, 7)),
      h('div.cnt', null, n ? `${n} ${n === 1 ? 'час' : 'часа'}` : off ? 'почивен' : '—'));
  }));

  // Колони по лекар: при „всички“ — всеки активен лекар; иначе само избраният.
  const columns = view.doctor === 'all'
    ? [...doctors.map(d => ({ id: d.id, name: d.name })), ...(dayAppts.some(a => !a.doctorId) || !doctors.length ? [{ id: '', name: 'без избран лекар' }] : [])]
    : [{ id: view.doctor === 'none' ? '' : view.doctor, name: view.doctor === 'none' ? 'без избран лекар' : doctors.find(d => d.id === view.doctor)?.name || '' }];

  const counts = {
    booked: dayAppts.filter(a => a.status === 'booked').length,
    arrived: dayAppts.filter(a => a.status === 'arrived').length,
    done: dayAppts.filter(a => a.status === 'done').length,
    noshow: dayAppts.filter(a => a.status === 'noshow').length,
  };

  mount(host,
    h('div.page-head', null,
      h('div.titles', null,
        h('h1', null, 'График'),
        h('div.muted.small', null, `${weekdayName(view.date)}, ${formatDateLong(view.date)} · работно време ${agenda.start}–${agenda.end}, час от ${agenda.slot} мин.`)),
      h('div.row.no-print', { style: { flexWrap: 'wrap' } },
        h('button.btn', { onclick: () => go(addDays(view.date, -7)), title: 'Предишната седмица' }, '«'),
        h('button.btn', { onclick: () => go(addDays(view.date, -1)), title: 'Предишния ден' }, '‹'),
        h('button.btn', { onclick: () => go(today()) }, 'Днес'),
        h('button.btn', { onclick: () => go(addDays(view.date, 1)), title: 'Следващия ден' }, '›'),
        h('button.btn', { onclick: () => go(addDays(view.date, 7)), title: 'Следващата седмица' }, '»'),
        dateInput, doctorSelect,
        h('button.btn', { onclick: () => printDay(view.date, dayAppts) }, '🖨 Списък за деня'),
        h('button.btn.primary', { onclick: () => bookDialog({ date: view.date, doctorId: columns.length === 1 ? columns[0].id : '', onDone: rerender }) }, '＋ Час'))),
    week,
    h('div.row.small.muted', { style: { margin: '10px 0' } },
      `Записани ${counts.booked} · дошли ${counts.arrived} · прегледани ${counts.done}${counts.noshow ? ` · не дошли ${counts.noshow}` : ''}`),
    h('div.agenda-cols', { style: { gridTemplateColumns: `repeat(${columns.length}, minmax(260px, 1fr))` } },
      columns.map(col => dayColumn(col, agenda, dayAppts.filter(a => (a.doctorId || '') === col.id), rerender))));
}

function dayColumn(col, agenda, appts, rerender) {
  const { working, slots, outside } = daySlots(agenda, view.date, appts);
  const past = view.date < today();
  const rows = [];
  for (const s of slots) {
    if (s.appts.length) {
      for (const a of s.appts) rows.push(apptRow(a, rerender));
    } else if (s.free) {
      rows.push(h('div.ag-slot.free', null,
        h('span.t', null, s.time),
        past ? h('span.dim.small', null, '—')
          : h('button.btn.xs.ghost', { onclick: () => bookDialog({ date: view.date, time: s.time, doctorId: col.id, onDone: rerender }) }, '＋ свободен')));
    }
  }
  return card(col.name || 'Час', { tight: true },
    !working ? h('div.body.small.muted', null, 'Почивен ден по работното време.') : null,
    rows.length ? h('div.ag-slots', null, rows) : working ? empty('Няма работни часове.', null) : null,
    outside.length ? h('div', null, h('div.small.muted', { style: { padding: '6px 12px' } }, 'Извън работното време'),
      h('div.ag-slots', null, outside.map(a => apptRow(a, rerender)))) : null);
}

function apptRow(a, rerender) {
  const patientName = a.patient ? a.patient.name : a.name;
  const set = async (status) => {
    try {
      await api.updateAppointment(a.id, { status });
      rerender();
    } catch (err) { toast(err.message, 'error'); }
  };
  const openExam = async () => {
    const pid = a.patientId || await linkPatient(a);
    if (!pid) return;
    location.hash = '#/patient/' + pid + '?exam=' + a.id;
  };
  const buttons = {
    booked: [
      h('button.btn.xs.primary', { onclick: () => set('arrived') }, 'Дойде'),
      h('button.btn.xs', { onclick: () => set('noshow') }, 'Не дойде'),
      h('button.btn.xs', { title: 'Отказан час', onclick: () => set('cancelled') }, 'Отказ'),
    ],
    arrived: [
      h('button.btn.xs.primary', { onclick: openExam }, 'Преглед'),
      h('button.btn.xs', { title: 'Обратно към „записан“', onclick: () => set('booked') }, '↩'),
    ],
    done: [a.patientId ? h('button.btn.xs', { onclick: () => { location.hash = '#/patient/' + a.patientId; } }, 'Досие') : null],
    noshow: [h('button.btn.xs', { onclick: () => set('booked') }, '↩ Върни')],
    cancelled: [h('button.btn.xs', { onclick: () => set('booked') }, '↩ Върни')],
  }[a.status] || [];
  return h('div.ag-slot.appt.' + a.status, null,
    h('span.t', null, a.time, h('span.tiny.dim', null, '–' + endTime(a))),
    h('div.grow', null,
      h('div', null,
        a.patientId
          ? h('a', { href: '#/patient/' + a.patientId, style: { fontWeight: 600 } }, patientName)
          : h('strong', null, patientName, h('span.tiny.dim', null, ' · ново')),
        a.patient ? h('span.tiny.dim', null, ' · ' + formatAge(a.patient.birthDate)) : null),
      h('div.tiny.dim', null, [...new Set([a.phone, a.examType && EXAM_TYPES[a.examType]?.label, a.reason].filter(Boolean))].join(' · ')),
      a.note ? h('div.tiny', null, a.note) : null),
    h('div.appt-actions.no-print', null,
      badge(STATUS_CLS[a.status], APPT_STATUS[a.status]),
      h('div.row.tight', null, buttons,
        h('button.btn.xs', { title: 'Промяна или преместване', onclick: () => bookDialog({ appointment: a, onDone: rerender }) }, '✎'))));
}

/** Час без досие: създава се досие с името и телефона от часа. */
async function linkPatient(a) {
  const ok = await confirmDialog({
    title: 'Нов пациент',
    message: `${a.name} още няма досие. Ще се отвори формулярът за нов пациент с името и телефона от часа.`,
    confirmLabel: 'Създай досие',
  });
  if (!ok) return null;
  const { openPatientForm } = await import('./patients.js');
  return new Promise(resolve => {
    openPatientForm(null, async (patient) => {
      try {
        await api.updateAppointment(a.id, { patientId: patient.id });
        resolve(patient.id);
      } catch (err) { toast(err.message, 'error'); resolve(null); }
    }, { name: a.name, phone: a.phone });
  });
}

/* --------------------------------- записване --------------------------------- */

/**
 * Записване или промяна на час.
 * @param {object} o
 * @param {object} [o.appointment]  съществуващ час (промяна)
 * @param {object} [o.patient]  досието, от което се записва
 */
export function bookDialog(o = {}) {
  const a = o.appointment || null;
  const doctors = activeDoctors();
  let chosen = a?.patient || (o.patient ? { id: o.patient.id, name: o.patient.name, phone: o.patient.phone || '', birthDate: o.patient.birthDate } : null);
  let form;

  const dateIn = input({ name: 'date', type: 'date', value: a?.date || o.date || today(), required: true });
  const timeIn = input({ name: 'time', type: 'time', value: a?.time || o.time || '', required: true, step: 300 });
  const doctorIn = select([
    { value: '', label: '— без избор —' },
    ...doctors.map(d => ({ value: d.id, label: d.name, selected: (a ? a.doctorId : o.doctorId ?? state.doctor?.id) === d.id })),
  ], { name: 'doctorId' });
  const minutesIn = select([10, 15, 20, 30, 40, 45, 60, 90].map(m => ({
    value: m, label: `${m} мин.`, selected: m === (a?.minutes || state.settings.agenda?.slot || 20),
  })), { name: 'minutes' });
  const freeBox = h('div.free-times');

  const loadFree = async () => {
    const date = dateIn.value;
    if (!date) return;
    try {
      const res = await api.appointments({ from: date, to: date });
      const mine = res.appointments.filter(x => (x.doctorId || '') === doctorIn.value && x.id !== a?.id);
      const { working, slots } = daySlots(res.agenda, date, mine);
      const now = date === today() ? new Date().toTimeString().slice(0, 5) : '00:00';
      const free = slots.filter(s => s.free && s.time >= now);
      mount(freeBox, !working ? h('span.tiny.dim', null, 'Почивен ден.')
        : free.length ? free.slice(0, 24).map(s => h('button.chip' + (timeIn.value === s.time ? '.active' : ''), {
          type: 'button', onclick: () => { timeIn.value = s.time; loadFree(); },
        }, s.time))
          : h('span.tiny.dim', null, 'Няма свободни часове този ден.'));
    } catch { mount(freeBox); }
  };
  dateIn.addEventListener('change', loadFree);
  doctorIn.addEventListener('change', loadFree);

  const firstFreeBtn = h('button.btn.xs', {
    type: 'button',
    onclick: async () => {
      const from = today() > dateIn.value ? today() : dateIn.value || today();
      const res = await api.appointments({ from, to: addDays(from, 60) });
      const now = new Date().toTimeString().slice(0, 5);
      const hit = firstFree(res.agenda, res.appointments.filter(x => x.id !== a?.id), from, from === today() ? now : '00:00', doctorIn.value, 61);
      if (!hit) { toast('Няма свободен час в следващите два месеца.'); return; }
      dateIn.value = hit.date;
      timeIn.value = hit.time;
      loadFree();
    },
  }, 'Първи свободен час');

  // Пациент: търсене в досиетата или ново име и телефон.
  const who = h('div');
  const nameIn = input({ name: 'name', value: a && !a.patientId ? a.name : '', placeholder: 'Име и фамилия' });
  const phoneIn = input({ name: 'phone', value: a ? a.phone : '', type: 'tel', placeholder: 'Телефон' });
  const results = h('div.search-results');
  let timer = null;
  const searchIn = input({
    placeholder: 'Търсене по име, ЕГН или телефон', autocomplete: 'off',
    oninput: (e) => {
      clearTimeout(timer);
      const q = e.target.value.trim();
      if (q.length < 2) { mount(results); return; }
      timer = setTimeout(async () => {
        const res = await api.patients({ q });
        mount(results, res.patients.slice(0, 8).map(pt => h('button.search-hit', {
          type: 'button', onclick: () => { chosen = pt; drawWho(); },
        }, h('strong', null, pt.name), h('span.tiny.dim', null, ` · ${formatAge(pt.birthDate)}${pt.egn ? ' · ' + pt.egn : ''}${pt.phone ? ' · ' + pt.phone : ''}`))),
        res.patients.length ? null : h('div.tiny.dim', { style: { padding: '6px' } }, 'Няма такова досие — въведете името и телефона по-долу.'));
      }, 200);
    },
  });
  const drawWho = () => {
    if (chosen) {
      if (!phoneIn.value) phoneIn.value = chosen.phone || '';
      mount(who, h('div.chosen-patient', null,
        h('strong', null, chosen.name), chosen.birthDate ? h('span.small.muted', null, ' · ' + formatAge(chosen.birthDate)) : null,
        h('button.btn.xs', { type: 'button', onclick: () => { chosen = null; drawWho(); } }, 'Смени'),
        h('div', { style: { marginTop: '8px' } }, field('Телефон за връзка', phoneIn))));
    } else {
      mount(who, field('Пациент', searchIn), results,
        h('div.grid.cols-2', null, field('Или нов човек — име', nameIn), field('Телефон', phoneIn)));
    }
  };
  drawWho();

  const submit = async (close, force = false) => {
    const d = Object.fromEntries(new FormData(form));
    const body = {
      date: d.date, time: d.time, minutes: Number(d.minutes), doctorId: d.doctorId,
      patientId: chosen ? chosen.id : '', name: chosen ? chosen.name : nameIn.value.trim(), phone: phoneIn.value.trim(),
      examType: d.examType, reason: d.reason, note: d.note, force,
    };
    try {
      if (a) await api.updateAppointment(a.id, body); else await api.addAppointment(body);
      toast(a ? 'Часът е променен.' : `Записан час: ${formatDate(body.date)}, ${body.time} ч.`, 'ok');
      close();
      if (o.onDone) await o.onDone();
    } catch (err) {
      if (err.status === 409 && !force) {
        const ok = await confirmDialog({ title: 'Часът е зает', message: err.message, confirmLabel: 'Запиши въпреки това' });
        if (ok) submit(close, true);
        return;
      }
      toast(err.message, 'error');
    }
  };

  modal({
    title: a ? `Час — ${a.patient ? a.patient.name : a.name}` : 'Записване на час',
    wide: true,
    body: () => {
      form = h('form.form-grid', { onsubmit: (e) => e.preventDefault() },
        h('div.full', null, who),
        h('div', null, field('Дата', dateIn)),
        h('div', null, field('Час', timeIn)),
        h('div.full', null, h('div.row.tight', { style: { alignItems: 'center', flexWrap: 'wrap' } },
          h('span.small.muted', null, 'Свободни: '), freeBox, h('div.grow'), firstFreeBtn)),
        h('div', null, field('Лекар', doctorIn)),
        h('div', null, field('Продължителност', minutesIn)),
        h('div', null, field('Вид на прегледа', select([{ value: '', label: '—' }, ...Object.entries(EXAM_TYPES).map(([value, t]) => ({
          value, label: t.label, selected: value === (a?.examType || o.examType || ''),
        }))], { name: 'examType' }))),
        h('div', null, field('Повод', input({ name: 'reason', value: a?.reason || o.reason || '', maxlength: 300, placeholder: 'напр. контрол, резултати' }))),
        h('div.full', null, field('Бележка', input({ name: 'note', value: a?.note || '', maxlength: 500 }))));
      setTimeout(loadFree, 0);
      return form;
    },
    actions: (close) => [
      a ? h('button.btn.danger', {
        type: 'button',
        onclick: async () => {
          const ok = await confirmDialog({ title: 'Изтриване на часа', message: 'Часът ще бъде изтрит от графика. За отказан от пациента час използвайте „Отказ“ — така остава в историята.', confirmLabel: 'Изтрий', danger: true });
          if (!ok) return;
          try { await api.deleteAppointment(a.id); close(); if (o.onDone) await o.onDone(); } catch (err) { toast(err.message, 'error'); }
        },
      }, 'Изтрий') : null,
      h('div.grow'),
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, a ? 'Запази' : 'Запиши час'),
    ],
  });
}

/* ------------------------------ списък за деня ------------------------------ */

function printDay(date, appts) {
  const list = appts.filter(a => a.status !== 'cancelled').sort((x, y) => (x.time < y.time ? -1 : 1));
  if (!list.length) { toast('Няма записани часове за деня.'); return; }
  printWindow(`График — ${formatDate(date)}`, '', ({ el, add, tableOf }) => {
    add(el('h1', `График за ${weekdayName(date)}, ${formatDate(date)}`));
    add(el('div', state.practice.name, 'practice'));
    const doctors = new Map(state.doctors.map(d => [d.id, d.name]));
    add(tableOf(['Час', 'Пациент', 'Телефон', 'Лекар', 'Вид / повод', 'Бележка'], list.map(a => [
      `${a.time}–${endTime(a)}`,
      (a.patient ? a.patient.name : a.name) + (a.patient?.egn ? `\n${a.patient.egn}` : ''),
      a.phone || '', doctors.get(a.doctorId) || '',
      [a.examType && EXAM_TYPES[a.examType]?.label, a.reason].filter(Boolean).join(' — '), '',
    ])));
  });
}
