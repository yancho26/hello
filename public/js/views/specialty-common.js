/* Общо за разделите на специалистите: въвеждане на структурирани
 * изследвания, списък със сигнали, история и консултативно заключение за
 * общопрактикуващия лекар (запис като преглед, напомняне и печат). */

import { api } from '../api.js';
import { state } from '../app.js';
import { badge, card, empty, field, h, input, modal, numberInput, select, table, toast } from '../ui/components.js';
import { addMonths, formatDate, today } from '../shared/dates.js';
import { STUDY_KINDS, STUDY_TEXT_MAX, studyLine, validateStudy } from '../shared/studies.js';
import { MODULES } from '../shared/specialty.js';
import { SCHEDULE_SLOTS, activeMeds, medLabel } from '../shared/meds.js';
import { deleteWithConfirm } from './adult-dialogs.js';
import { header, printWindow } from './adult-print.js';

export const dec = (v, d = null) => (v === null || v === undefined ? '' : String(d === null ? v : Math.round(v * 10 ** d) / 10 ** d).replace('.', ','));
const actionsFor = (label, submit) => (close) => [
  h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
  h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, label),
];

/* ------------------------------ въвеждане ------------------------------ */

/** Диалог за структурирано изследване — полетата идват от studies.js. */
export function studyDialog(ctx, kind) {
  const { p, reload } = ctx;
  const def = STUDY_KINDS[kind];
  let form;
  const submit = async (close) => {
    const fd = new FormData(form);
    const values = {};
    for (const f of def.fields) {
      if (f.type === 'bool') values[f.key] = fd.get('f_' + f.key) === 'on';
      else values[f.key] = String(fd.get('f_' + f.key) ?? '').trim().replace(',', '.');
    }
    const check = validateStudy(kind, values);
    if (check.error) { toast(check.error, 'error'); return; }
    try {
      await api.addStudy(p.id, { kind, date: fd.get('date'), values, text: fd.get('text') });
      toast(`${def.name} — записано.`, 'ok');
      close();
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  const control = (f) => {
    if (f.type === 'bool') {
      return h('div.full', null, h('label.check', null, h('input', { type: 'checkbox', name: 'f_' + f.key }), h('span', null, f.label)));
    }
    if (f.type === 'select') {
      return h('div', null, field(f.label, select([{ value: '', label: '—' }, ...f.options.map(([value, label]) => ({ value, label }))], { name: 'f_' + f.key })));
    }
    return h('div', null, field(`${f.label}${f.unit ? ` (${f.unit})` : ''}`,
      numberInput({ name: 'f_' + f.key, min: f.min, max: f.max, required: !!f.required })));
  };
  modal({
    title: `${def.name} — ${p.name}`,
    wide: def.fields.length > 6,
    body: () => {
      form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); } },
        h('div', null, field('Дата', input({ name: 'date', type: 'date', value: today(), max: today(), required: true }))),
        def.fields.map(control),
        h('div.full', null, field('Заключение', h('textarea', { name: 'text', rows: 2, maxlength: STUDY_TEXT_MAX }))));
      return form;
    },
    actions: actionsFor('Запиши', submit),
  });
}

/** Бутоните за въвеждане в горната част на раздела. */
export function addButtons(ctx, kinds, extra = []) {
  return h('div.row.no-print', { style: { flexWrap: 'wrap', gap: '6px' } },
    kinds.map(k => h('button.btn.sm', { onclick: () => studyDialog(ctx, k) }, '＋ ' + STUDY_KINDS[k].short)),
    extra);
}

/* ------------------------------- показване ------------------------------- */

const SEV_CLASS = ['.info', '.info', '.warn', ''];

export function alertsCard(alerts, emptyText) {
  return card(alerts.length ? `Сигнали (${alerts.length})` : 'Сигнали', { icon: '⚠️' },
    alerts.length
      ? h('div.stack', { style: { gap: '8px' } }, alerts.map(a => h('div.alert-strip' + SEV_CLASS[Math.min(3, a.severity)], null, a.text)))
      : empty(emptyText, '✓'));
}

/** История на изследванията от дадените видове, най-новите първи. */
export function historyCard(ctx, kinds, title = 'Всички изследвания') {
  const { p, reload } = ctx;
  const list = (p.studies || []).filter(s => kinds.includes(s.kind)).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!list.length) return null;
  return card(`${title} (${list.length})`, { icon: '📋', tight: true },
    table(['Дата', 'Вид', 'Стойности', 'Заключение', ''], list.map(s => h('tr', null,
      h('td.small.nowrap', null, formatDate(s.date)),
      h('td', null, STUDY_KINDS[s.kind]?.name || s.kind),
      h('td.small', null, studyLine(s)),
      h('td.small.muted', null, s.text || ''),
      h('td.actions.no-print', null, h('button.btn.xs.danger', {
        title: 'Изтрий',
        onclick: () => deleteWithConfirm(`${STUDY_KINDS[s.kind]?.name || 'Записът'} от ${formatDate(s.date)} ще бъде изтрит.`, () => api.deleteStudy(p.id, s.id), reload),
      }, '✕'))))));
}

export const okBadge = (ok, yes = 'в целта', no = 'извън целта') => (ok === null || ok === undefined
  ? badge('future', 'няма данни') : ok ? badge('done', yes) : badge('overdue', no));

/** Хоризонтална лента с процент (за дози и времена). */
export function pctBar(pct, colour) {
  const w = Math.max(0, Math.min(100, pct || 0));
  return h('div.pct-bar', null, h('div', { style: { width: w + '%', background: colour } }));
}

/* ------------------------- консултативно заключение ------------------------- */

/**
 * Заключение на специалиста за ОПЛ: попълва се автоматично от раздела,
 * лекарят го допълва. Записва се като преглед (с напомняне за контрол) и
 * се отпечатва.
 */
export function consultDialog(ctx, module, build) {
  const { p, reload } = ctx;
  const def = MODULES[module];
  const draft = build();
  let form;
  const nextDefault = addMonths(today(), draft.nextMonths || 6);

  const collect = () => {
    const d = Object.fromEntries(new FormData(form));
    return {
      date: d.date, diagnosis: d.diagnosis.trim(), icd: d.icd.trim(), findings: d.findings.trim(),
      treatment: d.treatment.trim(), recommendations: d.recommendations.trim(),
      next: d.next, remind: d.remind === 'on',
    };
  };
  const save = async (close, andPrint) => {
    const c = collect();
    try {
      await api.addVisit(p.id, {
        date: c.date, type: `Консултация — ${def.specialist}`, diagnosis: c.diagnosis, icd: c.icd,
        findings: c.findings, treatment: [c.treatment, c.recommendations && 'Препоръки: ' + c.recommendations].filter(Boolean).join('\n'),
        note: c.next ? `Следващ контрол: ${formatDate(c.next)}` : '',
      });
      if (c.next && c.remind) await api.addReminder(p.id, { date: c.next, text: `Контролен преглед при ${def.specialist}` });
      toast('Консултацията е записана в „Прегледи“.', 'ok');
      if (andPrint) printConsult(p, module, c);
      close();
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };

  modal({
    title: `Консултативно заключение — ${def.specialist}`,
    wide: true,
    body: () => {
      form = h('form.form-grid', { onsubmit: (e) => e.preventDefault() },
        h('div', null, field('Дата', input({ name: 'date', type: 'date', value: today(), max: today(), required: true }))),
        h('div', null, field('Код по МКБ-10', input({ name: 'icd', value: draft.icd || '', maxlength: 20 }))),
        h('div.full', null, field('Диагноза', input({ name: 'diagnosis', value: draft.diagnosis || '', maxlength: 500 }))),
        h('div.full', null, field('Данни от изследванията', h('textarea', { name: 'findings', rows: 7, maxlength: 4000 }, draft.findings || ''),
          'Попълнено от раздела — редактирайте свободно.')),
        h('div.full', null, field('Терапия', h('textarea', { name: 'treatment', rows: 4, maxlength: 1200 }, draft.treatment || ''))),
        h('div.full', null, field('Препоръки към личния лекар', h('textarea', { name: 'recommendations', rows: 5, maxlength: 800 }, draft.recommendations || ''))),
        h('div', null, field('Следващ контролен преглед', input({ name: 'next', type: 'date', value: nextDefault, min: today() }))),
        h('div', null, h('label.check', { style: { marginTop: '26px' } },
          h('input', { type: 'checkbox', name: 'remind', checked: true }), h('span', null, 'Напомняне в програмата'))));
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn', { type: 'button', onclick: () => printConsult(p, module, collect()) }, '🖨 Само печат'),
      h('button.btn.primary', { type: 'button', onclick: () => save(close, true) }, 'Запиши и печатай'),
    ],
  });
}

/** Диагнозите от досието, които засягат модула, с кодове по МКБ-10. */
export function diagnosisDraft(ctx, codes) {
  const list = ctx.a.conditions.filter(c => codes.includes(c.code));
  return {
    diagnosis: list.map(c => c.def.name).join('; '),
    icd: list.map(c => c.def.icd.split(/[,–]/)[0].trim()).join(', '),
  };
}

const scheduleText = (m) => SCHEDULE_SLOTS.map(([k]) => m.schedule?.[k] || '0').join(' – ');

/** Текущата терапия като текст (за заключението). */
export function therapyText(p, filter = () => true) {
  return activeMeds(p).filter(filter).map(m => `${medLabel(m)}${m.dose ? ' ' + m.dose : ''} ${m.prn ? 'при нужда' : scheduleText(m)}`.trim()).join('\n');
}

export function printConsult(p, module, c) {
  const def = MODULES[module];
  printWindow(`Заключение — ${p.name}`, `
    .box { border: 1px solid #bbb; border-radius: 2mm; padding: 3mm 4mm; margin-top: 2mm; white-space: pre-wrap; }
    .lbl { font-size: 9pt; text-transform: uppercase; letter-spacing: .03em; color: #555; margin-top: 4mm; }
  `, (w) => {
    const { el, add } = w;
    header(w, `Консултативно заключение — ${def.specialist}`, p);
    const section = (label, text) => {
      if (!text) return;
      add(el('div', label, 'lbl'));
      add(el('div', text, 'box'));
    };
    add(el('div', `Дата на прегледа: ${formatDate(c.date || today())}`, 'muted'));
    section('Диагноза', [c.diagnosis, c.icd && `МКБ-10: ${c.icd}`].filter(Boolean).join('\n'));
    section('Данни от изследванията', c.findings);
    section('Терапия', c.treatment);
    section('Препоръки към личния лекар', c.recommendations);
    if (c.next) section('Следващ контролен преглед', formatDate(c.next));
    const doctor = state.doctor?.name || '';
    const sign = add(el('div', null, 'sign'));
    sign.appendChild(el('div', `Специалист: ${doctor}`));
    sign.appendChild(el('div', 'Подпис и печат'));
  });
}

