/* Практиката за СИМП: прозорците за преглед (амбулаторен лист),
 * направление, протокол за лекарства и диспансерно наблюдение, както и
 * печатът на амбулаторния лист. */

import { api } from '../api.js';
import { state } from '../app.js';
import { field, h, input, modal, numberInput, select, toast } from '../ui/components.js';
import { addDays, addMonths, formatAge, formatDate, today } from '../shared/dates.js';
import {
  COMMON_DX, EXAM_TYPES, FOLLOW_INTERVALS, REFERRAL_PURPOSES, STATUS_TEMPLATES,
} from '../shared/simp.js';
import { MODULES, enabledModules } from '../shared/specialty.js';
import { CONDITIONS } from '../shared/chronic.js';
import { LABS, formatLab, latestResult } from '../shared/labs.js';
import { STUDY_KINDS, studyLine } from '../shared/studies.js';
import { SCHEDULE_SLOTS, activeMeds, medLabel } from '../shared/meds.js';
import { printWindow } from './adult-print.js';

const actions = (label, submit, extra = []) => (close) => [
  h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
  ...extra.map(x => x(close)),
  h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, label),
];

const doctorName = (id) => state.doctors.find(d => d.id === id)?.name || '';
const scheduleText = (m) => (m.prn ? 'при нужда' : SCHEDULE_SLOTS.map(([k]) => m.schedule?.[k] || '0').join(' – '));

/** Текущата терапия като текст — за прегледа. */
export function therapyNow(p) {
  return activeMeds(p).map(m => `${medLabel(m)}${m.dose ? ' ' + m.dose : ''} ${scheduleText(m)}`.trim()).join('\n');
}

/** Последните резултати и изследвания — за полето „Изследвания“. */
export function investigationsNow(p, since = addMonths(today(), -12)) {
  const lines = [];
  const labs = [];
  for (const code of ['hba1c', 'glucose', 'ldl', 'chol', 'hdl', 'tg', 'creat', 'egfr', 'k', 'na', 'tsh', 'ft4', 'ft3', 'ntprobnp', 'hb', 'alt', 'uacr']) {
    if (!LABS[code]) continue;
    const r = latestResult(p.results || [], code);
    if (r && r.date >= since) labs.push(`${LABS[code].short} ${formatLab(code, r.value)} (${formatDate(r.date)})`);
  }
  if (labs.length) lines.push(labs.join('; ') + '.');
  const seen = new Set();
  for (const s of [...(p.studies || [])].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    if (seen.has(s.kind) || s.date < since || !STUDY_KINDS[s.kind]) continue;
    seen.add(s.kind);
    lines.push(`${STUDY_KINDS[s.kind].name} (${formatDate(s.date)}): ${studyLine(s)}${s.text ? '. ' + s.text : ''}.`);
  }
  return lines.join('\n');
}

/* ------------------------------ МКБ-10 поле ------------------------------ */

let dxListId = 0;

/** Код и текст на диагноза; изборът от списъка с чести диагнози попълва и двете. */
function dxFields(specialty, icd = '', text = '', { codeName = 'icd', textName = 'diagnosis', label = 'Основна диагноза' } = {}) {
  const id = 'dxList' + (++dxListId);
  const lists = specialty && COMMON_DX[specialty] ? [COMMON_DX[specialty]] : enabledModules(state.settings).map(m => COMMON_DX[m]).filter(Boolean);
  const all = lists.flat();
  const codeIn = input({ name: codeName, value: icd, list: id, maxlength: 12, placeholder: 'напр. I10', autocomplete: 'off' });
  const textIn = input({ name: textName, value: text, maxlength: 500, list: id + 't', autocomplete: 'off' });
  const fill = () => {
    const code = codeIn.value.trim().toUpperCase();
    const hit = all.find(([c]) => c === code);
    if (hit && !textIn.value.trim()) textIn.value = hit[1];
  };
  codeIn.addEventListener('change', fill);
  textIn.addEventListener('change', () => {
    const hit = all.find(([, t]) => t === textIn.value.trim());
    if (hit && !codeIn.value.trim()) codeIn.value = hit[0];
  });
  return h('div.dx-row', null,
    h('div.dx-code', null, field('Код', codeIn)),
    h('div.dx-text', null, field(label || 'Диагноза', textIn)),
    h('datalist#' + id, null, all.map(([c, t]) => h('option', { value: c }, t))),
    h('datalist#' + id + 't', null, all.map(([, t]) => h('option', { value: t }))));
}

/* --------------------------------- преглед --------------------------------- */

/**
 * Преглед при специалиста (амбулаторен лист).
 * @param {object} ctx  контекстът на досието (p, data, reload…)
 * @param {object} [opts]
 * @param {object} [opts.exam]  съществуващ преглед за поправка
 * @param {object} [opts.draft]  попълнено от раздела на специалността
 * @param {string} [opts.specialty]
 * @param {object} [opts.appointment]  записаният час, от който идва пациентът
 */
export function examDialog(ctx, opts = {}) {
  const { p, reload } = ctx;
  const ex = opts.exam || null;
  const draft = opts.draft || {};
  const mods = enabledModules(state.settings);
  // Специалността по подразбиране: единствената в практиката или тази на вписания лекар.
  const role = String(state.doctor?.role || '').toLowerCase();
  const specialty = ex ? ex.specialty || ''
    : opts.specialty || (mods.length === 1 ? mods[0] : mods.find(m => role.startsWith(MODULES[m].specialist)) || '');
  const simp = ctx.data.simp || { referrals: [], exams: [] };
  const openRefs = simp.referrals.filter(r => !r.closed && (r.state.status === 'new' || r.state.status === 'secondary' || (ex && r.id === ex.referralId)));
  // Подразбиране: вторичен, ако има отворен срок; първичен по ново направление; иначе диспансерен.
  const secondaryRef = openRefs.find(r => r.state.status === 'secondary');
  const newRef = openRefs.find(r => r.state.status === 'new');
  const pickedRef = opts.referralId ? openRefs.find(r => r.id === opts.referralId) : null;
  const defaultType = ex ? ex.examType
    : pickedRef ? (pickedRef.state.status === 'secondary' ? 'secondary' : 'primary')
      : opts.appointment?.examType || (newRef ? 'primary' : secondaryRef ? 'secondary' : simp.followups?.some(f => f.status !== 'ended') ? 'dispensary' : 'primary');
  const defaultRef = ex ? ex.referralId : pickedRef ? pickedRef.id : defaultType === 'secondary' ? secondaryRef?.id : newRef?.id;
  let form;

  const refLabel = (r) => `${r.number || 'без номер'} · ${REFERRAL_PURPOSES[r.purpose]} · ${formatDate(r.issued)}${r.fromName ? ' · ' + r.fromName : ''}${r.state.status === 'secondary' ? ` (вторичен до ${formatDate(r.state.secondaryUntil)})` : ''}`;
  const refSelect = select([
    { value: '', label: '— без направление —' },
    ...openRefs.map(r => ({ value: r.id, label: refLabel(r), selected: r.id === defaultRef })),
  ], { name: 'referralId' });
  const typeSelect = select(Object.entries(EXAM_TYPES).map(([value, t]) => ({ value, label: t.label, selected: value === defaultType })), { name: 'examType' });
  const refHint = h('div.field-hint');
  const updateHint = () => {
    const t = EXAM_TYPES[typeSelect.value];
    refHint.textContent = t.referral && !refSelect.value
      ? 'По НЗОК е нужно направление — добавете го с „＋ Направление“ в досието.'
      : typeSelect.value === 'secondary' && refSelect.value
        ? 'Вторичният преглед е по направлението на първичния.' : '';
  };
  typeSelect.addEventListener('change', updateHint);
  refSelect.addEventListener('change', updateHint);

  const specSelect = mods.length > 1 || (ex && ex.specialty)
    ? select([{ value: '', label: 'обща' }, ...mods.map(m => ({ value: m, label: MODULES[m].name, selected: m === specialty }))], { name: 'specialty' })
    : null;

  const area = (name, rows, value, max) => h('textarea', { name, rows, maxlength: max }, value || '');
  const findings = area('findings', 4, ex ? ex.findings : draft.status || '', 4000);
  const investigations = area('investigations', 4, ex ? ex.investigations : draft.findings || '', 4000);
  const treatment = area('treatment', 4, ex ? ex.treatment : draft.treatment ?? therapyNow(p), 3000);
  const complaint = area('complaint', 3, ex ? ex.complaint : '', 4000);
  const recommendations = area('recommendations', 4, ex ? ex.recommendations : draft.recommendations || '', 3000);
  const insert = (el, text) => {
    if (!text) { toast('Няма данни за попълване.'); return; }
    el.value = el.value.trim() ? el.value.trim() + '\n' + text : text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const firstRef = openRefs.find(r => r.id === defaultRef);
  const mainDx = dxFields(specialty, ex ? ex.icd : draft.icd || firstRef?.icd || '', ex ? ex.diagnosis : draft.diagnosis || firstRef?.diagnosis || '');
  const extraRows = h('div.stack', { style: { gap: '4px' } });
  const addExtra = (icd = '', text = '') => {
    if (extraRows.children.length >= 8) return;
    const i = extraRows.children.length;
    extraRows.appendChild(dxFields(specialty, icd, text, { codeName: `xicd${i}`, textName: `xtext${i}`, label: `Придружаващо заболяване ${i + 1}` }));
  };
  for (const d of (ex ? ex.extraDx : draft.extraDx) || []) addExtra(d.icd, d.text);
  const conditionsToExtra = () => {
    const mainCode = (form.querySelector('[name=icd]').value || '').toUpperCase();
    const have = new Set([...form.querySelectorAll('[name^=xicd]')].map(x => x.value.toUpperCase()));
    let added = 0;
    for (const c of (p.chronic || []).filter(x => x.status !== 'resolved' && CONDITIONS[x.code])) {
      const def = CONDITIONS[c.code];
      const code = def.icd.split(/[,–\s]/)[0].trim();
      if (code === mainCode || have.has(code)) continue;
      addExtra(code, def.name);
      added++;
    }
    if (!added) toast('Няма други вписани заболявания.');
  };

  const nextDefault = ex ? ex.nextDate : draft.nextMonths ? addMonths(today(), draft.nextMonths) : '';

  const collect = () => {
    const fd = new FormData(form);
    const d = Object.fromEntries(fd);
    const extraDx = [];
    for (let i = 0; i < 8; i++) {
      const icd = (d[`xicd${i}`] || '').trim();
      const text = (d[`xtext${i}`] || '').trim();
      if (icd || text) extraDx.push({ icd, text });
    }
    const vitals = { systolic: d.systolic, diastolic: d.diastolic, pulse: d.pulse, weight: d.weight, height: d.height };
    for (const k of Object.keys(vitals)) vitals[k] = String(vitals[k] ?? '').trim().replace(',', '.');
    return {
      date: d.date, time: d.time, examType: d.examType, referralId: d.referralId, specialty: d.specialty ?? specialty,
      nrn: (d.nrn || '').trim(),
      complaint: d.complaint, findings: d.findings, investigations: d.investigations,
      diagnosis: d.diagnosis, icd: d.icd, extraDx,
      treatment: d.treatment, recommendations: d.recommendations, nextDate: d.nextDate,
      note: d.note,
      ...(ex ? {} : { vitals, appointmentId: opts.appointment?.id || undefined }),
      book: d.book === 'on',
    };
  };

  const save = async (close, andPrint) => {
    const c = collect();
    const { book, ...body } = c;
    try {
      const res = ex ? await api.updateExam(p.id, ex.id, body) : await api.addExam(p.id, body);
      for (const w of res.warnings || []) toast('⚠ ' + w, 'warn');
      toast(ex ? 'Прегледът е поправен.' : 'Прегледът е записан.', 'ok');
      close();
      if (andPrint) printExam(p, res.visit, { referral: simp.referrals.find(r => r.id === res.visit.referralId), vitals: res.measurement });
      if (book && res.visit.nextDate) {
        const { bookDialog } = await import('./agenda.js');
        bookDialog({ patient: p, date: res.visit.nextDate, examType: 'dispensary', reason: 'Контролен преглед', onDone: reload });
      }
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };

  modal({
    title: `${ex ? 'Поправка на преглед' : 'Преглед'} — ${p.name}`,
    wide: 'x',
    body: () => {
      form = h('form.form-grid.exam-form', { onsubmit: (e) => e.preventDefault() },
        h('div', null, field('Дата', input({ name: 'date', type: 'date', value: ex ? ex.date : today(), max: today(), required: true }))),
        h('div', null, field('Час', input({ name: 'time', type: 'time', value: ex ? ex.time || '' : opts.appointment?.time || new Date().toTimeString().slice(0, 5) }))),
        h('div', null, field('Вид на прегледа', typeSelect)),
        h('div', null, field('НРН на прегледа', input({ name: 'nrn', value: ex ? ex.nrn || '' : '', maxlength: 20, placeholder: 'по желание' }),
          'Номерът от НЗИС — печата се на листа.')),
        h('div.full', null, field('Направление', refSelect, refHint)),
        specSelect ? h('div', null, field('Специалност', specSelect)) : null,

        h('div.full', null, field('Анамнеза и оплаквания', complaint)),
        h('div.full', null, h('label.field', null,
          h('span.lbl.row', null, 'Обективно състояние', h('div.grow'),
            h('button.btn.xs', { type: 'button', onclick: () => insert(findings, STATUS_TEMPLATES[specSelect?.value || specialty] || STATUS_TEMPLATES.general) }, 'Шаблон за нормален статус')),
          findings)),
        ex ? null : h('div.full.vitals-row', null,
          field('АН систолно', numberInput({ name: 'systolic', min: 50, max: 280, placeholder: 'mmHg' })),
          field('АН диастолно', numberInput({ name: 'diastolic', min: 20, max: 160, placeholder: 'mmHg' })),
          field('Пулс', numberInput({ name: 'pulse', min: 25, max: 220, placeholder: '/мин' })),
          field('Тегло', numberInput({ name: 'weight', min: 0.3, max: 350, placeholder: 'кг' })),
          field('Ръст', numberInput({ name: 'height', min: 20, max: 230, placeholder: 'см' }))),
        h('div.full', null, h('label.field', null,
          h('span.lbl.row', null, 'Изследвания', h('div.grow'),
            h('button.btn.xs', { type: 'button', onclick: () => insert(investigations, investigationsNow(p)) }, 'Попълни от досието')),
          investigations)),

        h('div.full', null, mainDx),
        h('div.full', null, h('div.row', { style: { alignItems: 'center' } },
          h('strong.small', null, 'Придружаващи заболявания'), h('div.grow'),
          h('button.btn.xs', { type: 'button', onclick: conditionsToExtra }, 'От заболяванията в досието'),
          h('button.btn.xs', { type: 'button', onclick: () => addExtra() }, '＋ Ред')),
        extraRows),

        h('div.full', null, h('label.field', null,
          h('span.lbl.row', null, 'Терапия', h('div.grow'),
            h('button.btn.xs', { type: 'button', onclick: () => { treatment.value = therapyNow(p); } }, 'Текущата терапия')),
          treatment)),
        h('div.full', null, field('Препоръки към личния лекар и пациента', recommendations)),
        h('div', null, field('Следващ преглед', input({ name: 'nextDate', type: 'date', value: nextDefault || '', min: addDays(today(), 1) }))),
        ex ? null : h('div', null, h('label.check', { style: { marginTop: '26px' } },
          h('input', { type: 'checkbox', name: 'book' }), h('span', null, 'Запиши час в графика'))),
        h('div.full', null, field('Бележка (не се печата)', input({ name: 'note', value: ex ? ex.note || '' : '', maxlength: 1000 }))));
      updateHint();
      return form;
    },
    actions: actions(ex ? 'Запази' : 'Запиши', (close) => save(close, false), [
      (close) => h('button.btn', { type: 'button', onclick: () => save(close, true) }, ex ? 'Запази и печатай' : 'Запиши и печатай'),
    ]),
  });
}

/* ---------------------------- амбулаторен лист ---------------------------- */

/** Печат на прегледа — за пациента и за личния лекар. */
export function printExam(p, v, { referral = null, vitals = null } = {}) {
  const doctor = state.doctors.find(d => d.id === v.doctorId) || state.doctor || {};
  const ref = referral || (p.referrals || []).find(r => r.id === v.referralId) || null;
  const vit = vitals || (p.measurements || []).find(m => m.date === v.date && m.note === 'При преглед') || null;
  printWindow(`Амбулаторен лист — ${p.name}`, `
    .box { white-space: pre-wrap; margin-top: 1mm; }
    .lbl { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .04em; color: #555; margin-top: 4mm; border-bottom: 1px solid #ccc; padding-bottom: .6mm; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 8mm; font-size: 10.5pt; }
    .dx { font-weight: 600; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; }
    .head .right { text-align: right; font-size: 9.5pt; color: #444; }
  `, ({ el, add }) => {
    const head = add(el('div', undefined, 'head'));
    const left = el('div');
    left.appendChild(el('h1', 'Амбулаторен лист'));
    left.appendChild(el('div', [state.practice.name, state.practice.rzi ? `РЗИ № ${state.practice.rzi}` : ''].filter(Boolean).join(' · '), 'practice'));
    head.appendChild(left);
    const right = el('div', undefined, 'right');
    right.appendChild(el('div', `${v.type}${v.nrn ? ' · НРН ' + v.nrn : ''}`));
    right.appendChild(el('div', `${formatDate(v.date)}${v.time ? ', ' + v.time + ' ч.' : ''}`));
    if (state.practice.address || state.practice.phone) right.appendChild(el('div', [state.practice.address, state.practice.phone && 'тел. ' + state.practice.phone].filter(Boolean).join(' · ')));
    head.appendChild(right);

    const grid = add(el('div', undefined, 'grid'));
    const fact = (k, val) => { if (!val) return; const d = el('div'); d.appendChild(el('span', k + ': ', 'muted')); d.appendChild(el('b', val)); grid.appendChild(d); };
    fact('Пациент', p.name);
    fact('ЕГН', p.egn || '');
    fact('Възраст', `${formatAge(p.birthDate, v.date)} (роден${p.sex === 'f' ? 'а' : ''} ${formatDate(p.birthDate)})`);
    fact('Адрес', p.address || '');
    if (ref) {
      fact('Направление', `${ref.number || 'без номер'} от ${formatDate(ref.issued)} · ${REFERRAL_PURPOSES[ref.purpose]}`);
      fact('Насочен от', [ref.fromName, ref.fromUin && `УИН ${ref.fromUin}`].filter(Boolean).join(', '));
    } else if (p.gp?.name) {
      fact('Личен лекар', [p.gp.name, p.gp.uin && `УИН ${p.gp.uin}`].filter(Boolean).join(', '));
    }

    const section = (label, text, cls = 'box') => {
      if (!text) return;
      add(el('div', label, 'lbl'));
      add(el('div', text, cls));
    };
    section('Основна диагноза', [v.diagnosis, v.icd && `МКБ-10: ${v.icd}`].filter(Boolean).join(' — '), 'box dx');
    section('Придружаващи заболявания', (v.extraDx || []).map(d => [d.text, d.icd && `(${d.icd})`].filter(Boolean).join(' ')).join('\n'));
    section('Анамнеза', v.complaint);
    const vitText = vit ? [
      vit.systolic ? `АН ${vit.systolic}/${vit.diastolic} mmHg` : '', vit.pulse ? `пулс ${vit.pulse}/мин` : '',
      vit.weight ? `тегло ${String(vit.weight).replace('.', ',')} кг` : '', vit.height ? `ръст ${vit.height} см` : '',
    ].filter(Boolean).join(', ') : '';
    section('Обективно състояние', [v.findings, vitText].filter(Boolean).join('\n'));
    section('Изследвания', v.investigations);
    section('Терапия', v.treatment);
    section('Препоръки', v.recommendations);
    if (v.nextDate) section('Следващ преглед', formatDate(v.nextDate));

    const sign = add(el('div', undefined, 'sign'));
    sign.appendChild(el('div', [doctor.name || '', doctor.role || '', doctor.uin ? `УИН ${doctor.uin}` : ''].filter(Boolean).join(', ')));
    sign.appendChild(el('div', 'Подпис и печат'));
  });
}

/* ------------------------------- направление ------------------------------- */

export function referralDialog(ctx, ref = null, { onDone } = {}) {
  const { p, reload } = ctx;
  const mods = enabledModules(state.settings);
  let form;
  const submit = async (close) => {
    const d = Object.fromEntries(new FormData(form));
    try {
      const res = ref ? await api.updateReferral(p.id, ref.id, d) : await api.addReferral(p.id, d);
      toast(ref ? 'Направлението е поправено.' : 'Направлението е добавено.', 'ok');
      close();
      await (onDone || reload)(res.referral);
    } catch (err) { toast(err.message, 'error'); }
  };
  const gp = p.gp || {};
  modal({
    title: `${ref ? 'Направление' : 'Ново направление'} — ${p.name}`,
    wide: true,
    body: () => {
      form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); } },
        h('div', null, field('НРН (номер на направлението)', input({ name: 'number', value: ref?.number || '', maxlength: 20, placeholder: '12 знака' }))),
        h('div', null, field('Дата на издаване', input({ name: 'issued', type: 'date', value: ref?.issued || today(), max: today(), required: true }))),
        h('div', null, field('Цел', select(Object.entries(REFERRAL_PURPOSES).map(([value, label]) => ({ value, label, selected: value === (ref?.purpose || 'consult') })), { name: 'purpose' }))),
        mods.length > 1 ? h('div', null, field('Към специалност', select([{ value: '', label: '—' }, ...mods.map(m => ({ value: m, label: MODULES[m].name, selected: ref?.specialty === m }))], { name: 'specialty' }))) : null,
        h('div', null, field('Насочващ лекар', input({ name: 'fromName', value: ref ? ref.fromName : gp.name || '', maxlength: 120 }))),
        h('div', null, field('УИН на насочващия', input({ name: 'fromUin', value: ref ? ref.fromUin : gp.uin || '', inputmode: 'numeric', maxlength: 10 }))),
        h('div.full', null, field('Практика на насочващия', input({ name: 'fromPractice', value: ref ? ref.fromPractice : gp.practice || '', maxlength: 160 }))),
        h('div.full', null, dxFields(mods.length === 1 ? mods[0] : ref?.specialty || '', ref?.icd || '', ref?.diagnosis || '', { label: 'Диагноза от направлението' })),
        h('div.full', null, field('Бележка', input({ name: 'note', value: ref?.note || '', maxlength: 1000 }))));
      return form;
    },
    actions: actions(ref ? 'Запази' : 'Добави', submit),
  });
}

/* -------------------------------- протокол -------------------------------- */

export function protocolDialog(ctx, pr = null, { renewFrom = null } = {}) {
  const { p, reload } = ctx;
  const base = pr || renewFrom || {};
  let form;
  const until = h('input', { type: 'date', name: 'validUntil', required: true, value: pr ? pr.validUntil : addDays(addMonths(today(), 12), -1) });
  const issuedIn = input({ name: 'issued', type: 'date', value: pr ? pr.issued : today(), max: today(), required: true });
  const setMonths = (m) => { until.value = addDays(addMonths(issuedIn.value || today(), m), -1); };
  const submit = async (close) => {
    const d = Object.fromEntries(new FormData(form));
    d.drugs = String(d.drugs || '').split('\n').map(x => x.trim()).filter(Boolean);
    if (renewFrom) d.renewedFrom = renewFrom.id;
    try {
      if (pr) await api.updateProtocol(p.id, pr.id, d); else await api.addProtocol(p.id, d);
      toast(renewFrom ? 'Протоколът е подновен.' : pr ? 'Протоколът е поправен.' : 'Протоколът е добавен.', 'ok');
      close();
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  const drugsText = (base.drugs && base.drugs.length ? base.drugs : activeMeds(p).map(m => `${medLabel(m)}${m.dose ? ' ' + m.dose : ''}`)).join('\n');
  modal({
    title: `${renewFrom ? 'Подновяване на протокол' : pr ? 'Протокол' : 'Нов протокол'} — ${p.name}`,
    wide: true,
    body: () => {
      form = h('form.form-grid', { onsubmit: (e) => e.preventDefault() },
        h('div', null, field('Номер', input({ name: 'number', value: pr ? pr.number : '', maxlength: 40 }))),
        h('div', null, field('Вид (образец)', input({ name: 'kind', value: base.kind || '', maxlength: 40, placeholder: 'напр. 1А' }))),
        h('div.full', null, field('Лекарства (по едно на ред)', h('textarea', { name: 'drugs', rows: 4, required: true }, drugsText),
          pr || renewFrom ? null : 'Попълнено от текущата терапия — оставете само тези по протокола.')),
        h('div.full', null, dxFields(enabledModules(state.settings)[0] || '', base.icd || '', base.diagnosis || '', { label: 'Диагноза' })),
        h('div', null, field('Издаден на', issuedIn)),
        h('div', null, field('Валиден до', until)),
        h('div.full', null, h('div.row.tight', null, h('span.small.muted', null, 'Срок: '),
          [3, 6, 12].map(m => h('button.btn.xs', { type: 'button', onclick: () => setMonths(m) }, `${m} мес.`)))),
        h('div.full', null, field('Бележка', input({ name: 'note', value: pr ? pr.note || '' : '', maxlength: 1000 }))));
      return form;
    },
    actions: actions(renewFrom ? 'Поднови' : pr ? 'Запази' : 'Добави', submit),
  });
}

/* -------------------------- диспансерно наблюдение -------------------------- */

export function followupDialog(ctx, f = null) {
  const { p, reload } = ctx;
  let form;
  const submit = async (close) => {
    const d = Object.fromEntries(new FormData(form));
    try {
      if (f) await api.updateFollowup(p.id, f.id, d); else await api.addFollowup(p.id, d);
      toast(f ? 'Наблюдението е променено.' : 'Пациентът е взет на диспансерно наблюдение.', 'ok');
      close();
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  const last = ctx.data.simp?.lastExam;
  modal({
    title: `${f ? 'Диспансерно наблюдение' : 'Вземане на диспансерно наблюдение'} — ${p.name}`,
    wide: true,
    body: () => {
      form = h('form.form-grid', { onsubmit: (e) => e.preventDefault() },
        h('div.full', null, dxFields(f?.specialty || enabledModules(state.settings)[0] || '', f ? f.icd : last?.icd || '', f ? f.diagnosis : last?.diagnosis || '', { label: 'Заболяване' })),
        h('div', null, field('Прегледи през', select(FOLLOW_INTERVALS.map(m => ({
          value: m, label: m === 12 ? '12 месеца (веднъж годишно)' : `${m} ${m === 1 ? 'месец' : 'месеца'}`, selected: m === (f ? f.everyMonths : 6),
        })), { name: 'everyMonths' }))),
        h('div', null, field('От дата', input({ name: 'since', type: 'date', value: f ? f.since : today(), required: true }),
          'Следващият преглед се изчислява от последния преглед в практиката.')),
        h('div.full', null, field('Бележка', input({ name: 'note', value: f ? f.note || '' : '', maxlength: 500 }))));
      return form;
    },
    actions: actions(f ? 'Запази' : 'Добави', submit),
  });
}

export { doctorName };
