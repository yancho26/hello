/* Общо за разделите на специалистите: въвеждане на структурирани
 * изследвания, списък със сигнали, история и преглед, попълнен от раздела
 * (амбулаторен лист за пациента и личния лекар). */

import { api } from '../api.js';
import { badge, card, empty, field, h, input, modal, numberInput, select, table, toast } from '../ui/components.js';
import { formatDate, today } from '../shared/dates.js';
import { STUDY_KINDS, STUDY_TEXT_MAX, studyLine, validateStudy } from '../shared/studies.js';
import { SCHEDULE_SLOTS, activeMeds, medLabel } from '../shared/meds.js';
import { deleteWithConfirm } from './adult-dialogs.js';
import { examDialog } from './simp-dialogs.js';

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

/* ------------------------- преглед от раздела ------------------------- */

/**
 * Преглед при специалиста, попълнен автоматично от раздела на
 * специалността (изследвания, диагнози, терапия, препоръки). Лекарят го
 * допълва; записва се като преглед (амбулаторен лист) и може да се отпечата.
 */
export function consultDialog(ctx, module, build) {
  const draft = build();
  // Първата диагноза е основна, останалите — придружаващи.
  const codes = String(draft.icd || '').split(/,\s*/).filter(Boolean);
  const names = String(draft.diagnosis || '').split(/;\s*/).filter(Boolean);
  examDialog(ctx, {
    specialty: module,
    draft: {
      ...draft,
      icd: codes[0] || '', diagnosis: names[0] || '',
      extraDx: names.slice(1).map((text, i) => ({ icd: codes[i + 1] || '', text })),
    },
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
