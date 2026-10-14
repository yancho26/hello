/* Разпечатки за възрастни: лист „Моите лекарства“ и обобщение на досието
 * (например за насочване към специалист). Хранителният режим е PDF отчет (pdf-export.js). */

import { state } from '../app.js';
import { formatAge, formatDate, today } from '../shared/dates.js';
import { CONDITIONS } from '../shared/chronic.js';
import { LABS, formatLab } from '../shared/labs.js';
import { SCHEDULE_SLOTS, activeMeds, medLabel } from '../shared/meds.js';
import { TOOLS } from '../shared/mental.js';

const BASE_CSS = `
  body { font: 11pt/1.45 system-ui, "Segoe UI", sans-serif; margin: 14mm 13mm; color: #111; }
  h1 { font-size: 16pt; margin: 0 0 1mm; }
  h2 { font-size: 12pt; margin: 6mm 0 2mm; padding-bottom: 1mm; border-bottom: 1px solid #999; }
  .practice { font-size: 9.5pt; color: #555; margin-bottom: 4mm; }
  .facts { display: flex; flex-wrap: wrap; gap: 2mm 8mm; font-size: 10.5pt; margin-bottom: 3mm; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #d0d0d0; padding: 1.8mm 1.6mm; text-align: left; vertical-align: top; }
  th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .03em; color: #444; border-bottom: 1px solid #777; }
  .muted { color: #666; }
  .warn { color: #b3261e; font-weight: 600; }
  ul { margin: 1mm 0 0; padding-left: 5mm; }
  li { margin-bottom: 1mm; }
  .note { font-size: 8.5pt; color: #666; margin-top: 6mm; }
  .sign { margin-top: 10mm; display: flex; justify-content: space-between; font-size: 9.5pt; color: #444; }
  .sign div { border-top: 1px solid #999; padding-top: 1.5mm; width: 62mm; }
  @page { margin: 11mm; }
`;

/** Отваря прозорец за печат и дава помощник за сглобяване на съдържанието. */
export function printWindow(title, css, build) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Изскачащият прозорец е блокиран. Разрешете го за този адрес, за да се отпечата.');
    return;
  }
  const doc = win.document;
  doc.title = title;
  const style = doc.createElement('style');
  style.textContent = BASE_CSS + css;
  doc.head.appendChild(style);
  const el = (tag, text, cls) => {
    const n = doc.createElement(tag);
    if (text !== undefined && text !== null) n.textContent = String(text);
    if (cls) n.className = cls;
    return n;
  };
  const add = (node, parent = doc.body) => { parent.appendChild(node); return node; };
  const tableOf = (cols, rows) => {
    const t = el('table');
    const head = el('tr');
    for (const c of cols) head.appendChild(el('th', c));
    t.appendChild(head);
    for (const r of rows) {
      const tr = el('tr');
      for (const c of r) {
        if (c instanceof win.Node) { const td = el('td'); td.appendChild(c); tr.appendChild(td); } else tr.appendChild(el('td', c ?? ''));
      }
      t.appendChild(tr);
    }
    return t;
  };
  const list = (items) => {
    const ul = el('ul');
    for (const i of items) ul.appendChild(el('li', i));
    return ul;
  };
  build({ doc, el, add, tableOf, list });
  win.focus();
  setTimeout(() => win.print(), 250);
}

export function header({ el, add }, title, p) {
  add(el('h1', title));
  add(el('div', `${state.practice.name}${state.practice.phone ? ' · тел. ' + state.practice.phone : ''}`, 'practice'));
  const facts = add(el('div', undefined, 'facts'));
  const fact = (k, v) => { const d = el('div'); d.appendChild(el('span', k + ': ', 'muted')); d.appendChild(el('b', v)); facts.appendChild(d); };
  fact('Пациент', p.name);
  if (p.birthDate) {
    fact('Роден(а)', formatDate(p.birthDate));
    fact('Възраст', formatAge(p.birthDate));
  } else if (p.age) fact('Възраст', `${p.age} г.`);
  if (p.egn) fact('ЕГН', p.egn);
  fact('Дата', formatDate(today()));
}

/* ---------------------------- „Моите лекарства“ ---------------------------- */

export function printMedList(p, data) {
  const meds = activeMeds(p).filter(m => m.chronic !== false || !m.end);
  printWindow('Моите лекарства — ' + p.name, `
    body { font-size: 13pt; }
    td.slot, th.slot { text-align: center; width: 17mm; font-size: 14pt; font-weight: 700; }
    td.name { font-weight: 700; }
  `, (ctx) => {
    const { el, add } = ctx;
    header(ctx, 'Моите лекарства', p);
    if ((p.allergies || []).length) add(el('div', 'Алергии: ' + p.allergies.join(', '), 'warn'));

    const t = add(el('table'));
    const head = el('tr');
    for (const [c, cls] of [['Лекарство', ''], ['Доза', ''], ...SCHEDULE_SLOTS.map(([, l]) => [l, 'slot']), ['За какво / как', '']]) {
      head.appendChild(el('th', c, cls));
    }
    t.appendChild(head);
    for (const m of meds) {
      const tr = el('tr');
      tr.appendChild(el('td', medLabel(m), 'name'));
      tr.appendChild(el('td', m.dose || ''));
      for (const [k] of SCHEDULE_SLOTS) tr.appendChild(el('td', m.prn ? '' : (m.schedule || {})[k] || '', 'slot'));
      tr.appendChild(el('td', [m.prn ? 'при нужда' : '', m.indication ? CONDITIONS[m.indication]?.name : '', m.note].filter(Boolean).join(' · ')));
      t.appendChild(tr);
    }
    const food = data.adult ? data.adult.foodNotes : [];
    if (food.length) {
      add(el('h2', 'Храна и напитки'));
      const ul = add(el('ul'));
      for (const n of food) ul.appendChild(el('li', `${n.med}: ${n.text}`));
    }
    add(el('div', 'Не спирайте и не променяйте лекарствата без съвет от лекар. Носете този лист при всеки преглед и в болница.', 'note'));
    const sign = add(el('div', undefined, 'sign'));
    sign.appendChild(el('div', 'Лекар: ' + (state.doctor ? state.doctor.name : '')));
    sign.appendChild(el('div', 'Дата: ' + formatDate(today())));
  });
}

/* --------------------------------- обобщение --------------------------------- */

export function printAdultSummary(p, data) {
  const a = data.adult;
  printWindow('Обобщение — ' + p.name, '', (ctx) => {
    const { el, add, tableOf, list } = ctx;
    header(ctx, 'Обобщение на здравословното състояние', p);
    if ((p.allergies || []).length) add(el('div', 'Алергии: ' + p.allergies.join(', '), 'warn'));

    add(el('h2', 'Хронични заболявания'));
    add(a.conditions.length
      ? list(a.conditions.map(c => `${c.def.name} (${c.def.icd})${c.since ? ', от ' + formatDate(c.since) : ''}${c.note ? ' — ' + c.note : ''}`))
      : el('div', 'Няма вписани.', 'muted'));

    add(el('h2', 'Текуща терапия'));
    const meds = activeMeds(p);
    add(meds.length
      ? tableOf(['Лекарство', 'Доза', 'Прием'], meds.map(m => [medLabel(m), m.dose || '', m.prn ? 'при нужда'
        : SCHEDULE_SLOTS.map(([k]) => (m.schedule || {})[k] || '0').join('–')]))
      : el('div', 'Няма.', 'muted'));

    add(el('h2', 'Показатели'));
    const v = a.vitals;
    const rows = [];
    if (v.bp) rows.push(['Артериално налягане', `${v.bp.systolic}/${v.bp.diastolic} mmHg`, formatDate(v.bp.date), v.bpClass?.label || '']);
    if (v.weight) rows.push(['Тегло', `${String(v.weight.value).replace('.', ',')} кг`, formatDate(v.weight.date), '']);
    if (v.bmi) rows.push(['ИТМ', String(v.bmi).replace('.', ','), '', v.bmiClass?.label || '']);
    if (v.waist) rows.push(['Обиколка на талията', `${v.waist.value} см`, formatDate(v.waist.date), v.waistRisk?.label || '']);
    for (const [code, r] of Object.entries(a.labs)) {
      if (!LABS[code] || r.value === null || r.value === undefined) continue;
      rows.push([LABS[code].name, formatLab(code, r.value), formatDate(r.date), code === 'egfr' && a.renal.stage ? a.renal.stage.label : '']);
    }
    add(rows.length ? tableOf(['Показател', 'Стойност', 'Дата', 'Оценка'], rows) : el('div', 'Няма данни.', 'muted'));

    add(el('h2', 'Сърдечно-съдов риск'));
    add(el('div', `${a.cv.label}${a.cv.score !== undefined && a.cv.score !== null ? ` (${String(a.cv.score).replace('.', ',')}%)` : ''} — ${a.cv.reason}`));
    if (a.cv.ldlTarget) add(el('div', 'Цел за LDL: ' + a.cv.ldlTarget.text, 'muted'));

    const latest = Object.values(a.mental.latest || {});
    if (latest.length) {
      add(el('h2', 'Скали'));
      add(tableOf(['Скала', 'Резултат', 'Дата'], latest.map(x => [TOOLS[x.tool]?.short || x.tool, `${x.score} — ${x.result.label}`, formatDate(x.date)])));
    }
    const serious = a.medAlerts.filter(x => x.severity === 'contra' || x.severity === 'major');
    if (serious.length) {
      add(el('h2', 'Внимание при терапията'));
      add(list(serious.map(x => `${x.title}: ${x.text}`)));
    }
    const sign = add(el('div', undefined, 'sign'));
    sign.appendChild(el('div', 'Лекар: ' + (state.doctor ? state.doctor.name : '')));
    sign.appendChild(el('div', 'Дата: ' + formatDate(today())));
  });
}
