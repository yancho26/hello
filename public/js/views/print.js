/* Разпечатки: имунизационен паспорт на детето. */

import { state } from '../app.js';
import { formatAge, formatDate, today } from '../shared/dates.js';

const STATUS_TEXT = {
  done: 'поставена', overdue: 'просрочена', due: 'дължима',
  deferral_ended: 'отводът изтече', soon: 'предстои', future: 'предстои',
  deferred: 'отвод', refused: 'отказ на родител', skipped: 'не подлежи',
};

export function printImmunisationCard(patient, data) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Изскачащият прозорец е блокиран. Разрешете го за този адрес, за да се отпечата паспортът.');
    return;
  }
  const doc = win.document;
  doc.title = 'Имунизационен паспорт — ' + patient.name;

  const style = doc.createElement('style');
  style.textContent = `
    body { font: 11pt/1.42 system-ui, sans-serif; margin: 16mm 14mm; color: #111; }
    h1 { font-size: 15pt; margin: 0 0 1mm; }
    h2 { font-size: 11.5pt; margin: 7mm 0 2mm; padding-bottom: 1mm; border-bottom: 1px solid #999; }
    .practice { font-size: 9.5pt; color: #555; margin-bottom: 5mm; }
    .facts { display: flex; flex-wrap: wrap; gap: 3mm 9mm; font-size: 10pt; margin-bottom: 3mm; }
    .facts b { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    th, td { border-bottom: 1px solid #d5d5d5; padding: 1.6mm 1.5mm; text-align: left; vertical-align: top; }
    th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .03em; color: #444; border-bottom: 1px solid #888; }
    td.c { text-align: center; }
    .done { color: #14603c; font-weight: 600; }
    .late { color: #b3261e; font-weight: 600; }
    .muted { color: #666; }
    .sign { margin-top: 10mm; display: flex; justify-content: space-between; font-size: 9.5pt; color: #444; }
    .sign div { border-top: 1px solid #999; padding-top: 1.5mm; width: 62mm; }
    .note { font-size: 8.5pt; color: #666; margin-top: 6mm; }
    @page { margin: 12mm; }
  `;
  doc.head.appendChild(style);

  const el = (tag, text, cls) => {
    const n = doc.createElement(tag);
    if (text !== undefined && text !== null) n.textContent = String(text);
    if (cls) n.className = cls;
    return n;
  };

  doc.body.appendChild(el('h1', 'Имунизационен паспорт'));
  doc.body.appendChild(el('div', `${state.practice.name}${state.practice.phone ? ' · тел. ' + state.practice.phone : ''}`, 'practice'));

  const facts = el('div', undefined, 'facts');
  const addFact = (k, v) => {
    const d = doc.createElement('div');
    d.appendChild(el('span', k + ': ', 'muted'));
    d.appendChild(el('b', v));
    facts.appendChild(d);
  };
  addFact('Име', patient.name);
  addFact('ЕГН', patient.egn || '—');
  addFact('Дата на раждане', formatDate(patient.birthDate));
  addFact('Възраст', formatAge(patient.birthDate));
  addFact('Пол', patient.sex === 'f' ? 'женски' : patient.sex === 'm' ? 'мъжки' : '—');
  doc.body.appendChild(facts);

  if (patient.allergies && patient.allergies.length) {
    const a = el('div', 'Алергии: ' + patient.allergies.join(', '), 'late');
    a.style.marginBottom = '3mm';
    doc.body.appendChild(a);
  }

  const section = (title, rows, withBatch) => {
    if (!rows.length) return;
    doc.body.appendChild(el('h2', title));
    const t = doc.createElement('table');
    const head = doc.createElement('tr');
    const cols = withBatch
      ? ['Имунизация', 'Възраст по календар', 'Дата на поставяне', 'Партида / препарат', 'Състояние']
      : ['Дейност', 'Възраст по календар', 'Дата', 'Състояние'];
    for (const c of cols) head.appendChild(el('th', c));
    t.appendChild(head);

    for (const e of rows) {
      const tr = doc.createElement('tr');
      tr.appendChild(el('td', e.name));
      tr.appendChild(el('td', ageLabel(e.doseMonths), 'muted'));
      const rec = e.record || {};
      tr.appendChild(el('td', rec.date ? formatDate(rec.date) : '—'));
      if (withBatch) {
        tr.appendChild(el('td', [rec.batch, rec.product].filter(Boolean).join(' · ') || '—'));
      }
      const st = el('td', STATUS_TEXT[e.status] || e.status);
      if (e.status === 'done') st.className = 'done';
      else if (e.status === 'overdue' || e.status === 'deferral_ended') st.className = 'late';
      else st.className = 'muted';
      tr.appendChild(st);
      t.appendChild(tr);
    }
    doc.body.appendChild(t);
  };

  const vaccines = data.plan.filter(e => e.group === 'vaccine');
  const others = data.plan.filter(e => e.group === 'screening');
  const checkups = data.plan.filter(e => e.group === 'checkup' && e.status === 'done');

  section('Имунизации', vaccines, true);
  section('Скрининг и изследвания', others, false);
  if (checkups.length) section('Извършени профилактични прегледи', checkups.slice(-14), false);

  const cov = data.summary.coverage;
  doc.body.appendChild(el('div',
    `Обхват на задължителните имунизации, дължими към ${formatDate(today())}: `
    + (cov === null ? 'няма дължими' : `${cov}% (${data.summary.coverageDone} от ${data.summary.coverageDue})`),
    'note'));

  const sign = el('div', undefined, 'sign');
  sign.appendChild(el('div', 'Лекар: ' + (state.doctor ? state.doctor.name : '')));
  sign.appendChild(el('div', 'Дата: ' + formatDate(today())));
  doc.body.appendChild(sign);

  doc.body.appendChild(el('div',
    'Документът е справка от регистъра на практиката и не замества официалния имунизационен паспорт.',
    'note'));

  win.focus();
  setTimeout(() => win.print(), 250);
}

function ageLabel(months) {
  if (months === 0) return 'при раждане';
  if (months < 12) return months + ' мес.';
  const y = Math.floor(months / 12), m = Math.round(months % 12);
  return m ? `${y} г. ${m} м.` : `${y} г.`;
}
