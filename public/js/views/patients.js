/* Списък с деца и формулярът за въвеждане/редакция. */

import { api } from '../api.js';
import { state } from '../app.js';
import {
  badge, card, decimalFields, empty, field, h, input, modal, mount,
  numberInput, select, table, toast,
} from '../ui/components.js';
import { formatAge, formatDate, today } from '../shared/dates.js';
import { parse as parseEgn } from '../shared/egn.js';

let view = { q: '', filter: 'all', sort: 'name', archived: false };

function readQueryFromHash() {
  const m = location.hash.match(/\?q=([^&]*)/);
  if (m) view.q = decodeURIComponent(m[1]);
}

export async function renderPatients(host) {
  readQueryFromHash();
  const box = document.getElementById('globalSearch');
  if (box && view.q && box.value !== view.q) box.value = view.q;

  const data = await api.patients({
    q: view.q,
    sort: view.sort,
    archived: view.archived ? '1' : '',
    doctor: view.filter === 'mine' && state.doctor ? state.doctor.id : '',
  });

  let list = data.patients;
  if (view.filter === 'attention') list = list.filter(p => p.needsAttention);

  const chips = h('div.chips.no-print', null,
    chip('Всички', 'all', data.patients.length),
    chip('За внимание', 'attention', data.patients.filter(p => p.needsAttention).length),
    state.doctors.length > 1 ? chip('Моите', 'mine') : null,
    h('button.chip' + (view.archived ? '.active' : ''), {
      onclick: () => { view.archived = !view.archived; renderPatients(host); },
    }, 'Архив'));

  function chip(label, key, count) {
    return h('button.chip' + (view.filter === key && !view.archived ? '.active' : ''), {
      onclick: () => { view.filter = key; view.archived = false; renderPatients(host); },
    }, label, count !== undefined ? h('span.count', null, `(${count})`) : null);
  }

  // Търсенето идва от полето в заглавната лента.
  state.searchHandler = (q) => { view.q = q; renderPatients(host); };

  const sortSelect = select([
    { value: 'name', label: 'по име', selected: view.sort === 'name' },
    { value: 'attention', label: 'по спешност', selected: view.sort === 'attention' },
    { value: 'age', label: 'по възраст', selected: view.sort === 'age' },
  ], {
    style: { width: 'auto' },
    onchange: (e) => { view.sort = e.target.value; renderPatients(host); },
  });

  mount(host,
    h('div.page-head', null,
      h('div.titles', null,
        h('h1', null, view.archived ? 'Архив' : 'Пациенти'),
        h('div.muted.small', null, `${list.length} ${list.length === 1 ? 'дете' : 'деца'}`)),
      h('div.row.no-print', { style: { flexWrap: 'nowrap' } }, sortSelect,
        h('button.btn.primary', { onclick: () => openPatientForm(null, () => renderPatients(host)) }, '＋ Ново дете'))),
    chips,
    h('div', { style: { height: '12px' } }),
    list.length
      ? card(null, { tight: true }, table(
        ['Дете', 'Възраст', 'ЕГН', 'Телефон', 'Следваща дейност', 'Обхват', ''],
        list.map(p => patientRow(p, host))))
      : card(null, {}, empty(view.q
        ? `Няма съвпадение за „${view.q}“.`
        : view.archived ? 'Архивът е празен.' : 'Все още няма записани деца.', '🔎')));
}

function patientRow(p, host) {
  const attention = p.counts.overdue > 0;
  const alerts = [];
  if (p.allergies && p.allergies.length) alerts.push(badge('alert', '⚠ алергия'));
  if (p.conditions && p.conditions.length) alerts.push(badge('', p.conditions[0]));

  return h('tr.clickable' + (attention ? '.attention' : ''), {
    onclick: () => { location.hash = '#/patient/' + p.id; },
  },
    h('td.name-cell', null,
      h('div', null, p.name, ' ', h('span.dim', null, p.sex === 'f' ? '♀' : p.sex === 'm' ? '♂' : '')),
      alerts.length ? h('div.row.tight', { style: { marginTop: '3px' } }, alerts) : null),
    h('td.nowrap.small', null,
      h('div', null, formatAge(p.birthDate)),
      h('div.tiny.dim', null, formatDate(p.birthDate))),
    h('td.mono.small', null, p.egn || '—'),
    h('td.mono.small.nowrap', null, p.phone || '—'),
    h('td', null, p.next
      ? h('div', null,
        h('div.small', null, p.next.short || p.next.name),
        h('div.tiny', null, statusText(p.next)))
      : h('span.dim.small', null, '—')),
    h('td.nowrap', null, coverageBar(p.coverage)),
    h('td.actions.no-print', null,
      p.counts.overdue
        ? badge('overdue', p.counts.overdue + ' просрочени')
        : p.counts.due ? badge('due', p.counts.due + ' дължими') : null));
}

function statusText(next) {
  const map = {
    overdue: ['overdue', 'просрочено'],
    deferral_ended: ['deferral_ended', 'изтекъл отвод'],
    due: ['due', 'дължимо сега'],
    soon: ['soon', formatDate(next.due)],
    deferred: ['deferred', 'отвод'],
  };
  const [cls, text] = map[next.status] || ['future', formatDate(next.due)];
  return badge(cls, text);
}

function coverageBar(pct) {
  if (pct === null) return h('span.dim.small', null, '—');
  const colour = pct >= 95 ? 'var(--ok)' : pct >= 80 ? 'var(--warn)' : 'var(--danger)';
  return h('div', { style: { minWidth: '78px' } },
    h('div.small.mono', { style: { color: colour, fontWeight: '650' } }, pct + '%'),
    h('div', { style: { height: '4px', background: 'var(--line)', borderRadius: '3px', marginTop: '3px' } },
      h('div', { style: { height: '100%', width: pct + '%', background: colour, borderRadius: '3px' } })));
}

/* ---------------------------- формуляр за дете ------------------------------- */

export function openPatientForm(patient = null, onSaved = null) {
  const isNew = !patient;
  let form;

  const doctorOptions = [
    { value: '', label: '— без избор —' },
    ...state.doctors.filter(d => d.active).map(d => ({
      value: d.id, label: d.name,
      selected: patient ? patient.doctorId === d.id : (state.doctor && state.doctor.id === d.id),
    })),
  ];

  const submit = async (close) => {
    const fd = new FormData(form);
    const data = Object.fromEntries(fd);
    data.allergies = splitList(data.allergies);
    data.conditions = splitList(data.conditions);
    data.contacts = [];
    for (let i = 0; i < 2; i++) {
      const name = fd.get('contactName' + i);
      const phone = fd.get('contactPhone' + i);
      const relation = fd.get('contactRelation' + i);
      if (name || phone) data.contacts.push({ name, phone, relation });
      delete data['contactName' + i];
      delete data['contactPhone' + i];
      delete data['contactRelation' + i];
    }
    const b = decimalFields(data, ['birthWeight', 'birthHeight', 'birthHead']);
    data.birth = {
      weight: b.birthWeight, height: b.birthHeight, head: b.birthHead,
      gestWeeks: data.gestWeeks, delivery: data.delivery, apgar: data.apgar,
    };
    for (const k of ['birthWeight', 'birthHeight', 'birthHead', 'gestWeeks', 'delivery', 'apgar']) delete data[k];

    try {
      const res = isNew ? await api.createPatient(data) : await api.updatePatient(patient.id, data);
      toast(isNew ? 'Детето е записано.' : 'Промените са запазени.', 'ok');
      close();
      if (onSaved) await onSaved(res.patient);
      else if (isNew) location.hash = '#/patient/' + res.patient.id;
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  modal({
    title: isNew ? 'Ново дете' : 'Редакция — ' + patient.name,
    wide: true,
    body: (close) => {
      const egnField = input({
        name: 'egn', value: patient ? patient.egn : '', inputmode: 'numeric', maxlength: 10,
        placeholder: '10 цифри',
      });
      const birthField = input({
        name: 'birthDate', type: 'date', max: today(),
        value: patient ? patient.birthDate : '',
      });
      const sexField = select([
        { value: '', label: '—' },
        { value: 'm', label: 'момче', selected: patient && patient.sex === 'm' },
        { value: 'f', label: 'момиче', selected: patient && patient.sex === 'f' },
      ], { name: 'sex' });
      const egnHint = h('div.field-hint', null, 'Датата и полът се попълват автоматично.');

      // Въвеждането на ЕГН попълва останалото — така се пести писане.
      egnField.addEventListener('input', () => {
        const parsed = parseEgn(egnField.value);
        egnField.classList.remove('invalid');
        if (!parsed) {
          egnHint.textContent = egnField.value.length === 10
            ? 'ЕГН не отговаря на валидна дата.' : 'Датата и полът се попълват автоматично.';
          if (egnField.value.length === 10) egnField.classList.add('invalid');
          return;
        }
        birthField.value = parsed.birthDate;
        sexField.value = parsed.sex;
        egnHint.textContent = parsed.valid
          ? `Роден${parsed.sex === 'f' ? 'а' : ''} на ${formatDate(parsed.birthDate)}`
          : '⚠ Контролната цифра не съвпада — проверете ЕГН.';
        egnField.classList.toggle('invalid', !parsed.valid);
      });

      const c = (patient && patient.contacts) || [];
      const birth = (patient && patient.birth) || {};

      form = h('form', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div.form-grid', null,
          h('div.full', null, field('Име и фамилия',
            input({ name: 'name', required: true, value: patient ? patient.name : '', placeholder: 'Иван Петров Георгиев' }))),
          h('div', null, h('label.field', null, h('span.lbl', null, 'ЕГН'), egnField, egnHint)),
          h('div', null, field('Дата на раждане', birthField)),
          h('div', null, field('Пол', sexField)),
          h('div', null, field('Телефон', input({
            name: 'phone', type: 'tel', value: patient ? patient.phone || '' : '', placeholder: '08…',
          }))),
          h('div', null, field('Личен лекар', select(doctorOptions, { name: 'doctorId' }))),
          h('div.full', null, field('Адрес', input({ name: 'address', value: patient ? patient.address || '' : '' }))),

          h('div.full', null, h('h3', { style: { marginTop: '6px' } }, 'Родители и контакти')),
          ...[0, 1].flatMap(i => [
            h('div', null, field(i === 0 ? 'Име на родител' : 'Втори контакт',
              input({ name: 'contactName' + i, value: c[i] ? c[i].name : '' }))),
            h('div', null, field('Роля', input({
              name: 'contactRelation' + i, value: c[i] ? c[i].relation : '',
              placeholder: i === 0 ? 'майка' : 'баща',
            }))),
            h('div', null, field('Телефон', input({
              name: 'contactPhone' + i, type: 'tel', value: c[i] ? c[i].phone : '',
            }))),
          ]),

          h('div.full', null, h('h3', { style: { marginTop: '6px' } }, 'Медицински данни')),
          h('div.full', null, field('Алергии',
            input({
              name: 'allergies', placeholder: 'разделени със запетая',
              value: (patient && patient.allergies || []).join(', '),
            }),
            'Показват се като предупреждение в досието.')),
          h('div.full', null, field('Хронични заболявания / диспансеризация',
            input({
              name: 'conditions', placeholder: 'разделени със запетая',
              value: (patient && patient.conditions || []).join(', '),
            }))),

          h('div.full', null, h('h3', { style: { marginTop: '6px' } }, 'Данни при раждане')),
          h('div', null, field('Тегло (кг)', numberInput({
            name: 'birthWeight', min: 0.2, max: 8, value: birth.weight ?? '',
          }))),
          h('div', null, field('Ръст (см)', numberInput({
            name: 'birthHeight', min: 20, max: 70, value: birth.height ?? '',
          }))),
          h('div', null, field('Обиколка глава (см)', numberInput({
            name: 'birthHead', min: 20, max: 50, value: birth.head ?? '',
          }))),
          h('div', null, field('Гест. седмица', numberInput({
            name: 'gestWeeks', min: 20, max: 45, value: birth.gestWeeks ?? '',
          }))),
          h('div', null, field('Апгар', input({ name: 'apgar', value: birth.apgar || '', placeholder: '9/10' }))),
          h('div', null, field('Раждане', input({ name: 'delivery', value: birth.delivery || '', placeholder: 'нормално / секцио' }))),

          h('div.full', null, field('Бележки',
            h('textarea', { name: 'notes', rows: 3 }, patient ? patient.notes || '' : '')))));
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) },
        isNew ? 'Създай досие' : 'Запази'),
    ],
  });
}

function splitList(value) {
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean);
}
