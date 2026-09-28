/* Раздел „Дозировки“ в досието на дете: доза по тегло за парацетамол,
 * ибупрофен и най-честите антибиотици (изчисленията са в shared/pedsdosing.js). */

import { state } from '../app.js';
import { card, field, h, mount, toast } from '../ui/components.js';
import { ageInMonthsExact, formatDate, today } from '../shared/dates.js';
import { latestMeasure } from '../shared/chronic.js';
import { DOSING_DRUGS, DOSING_VERIFIED, DRUG_ORDER, TABLET_MIN_KG, computeDose, fmt } from '../shared/pedsdosing.js';
import { header, printWindow } from './adult-print.js';

/* Изборът се помни, докато се работи с досието; листът за родителя — по пациент. */
const memory = { drug: 'paracetamol', regimen: {}, form: {}, days: {} };
const weights = new Map();
const sheets = new Map();

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function dosingTab(ctx) {
  const { p } = ctx;
  const root = h('div.stack');
  const measured = latestMeasure(p, 'weight');
  const ageMonths = ageInMonthsExact(p.birthDate, today());
  if (!weights.has(p.id) && measured) weights.set(p.id, measured.value);
  const sheet = sheets.get(p.id) || [];
  sheets.set(p.id, sheet);

  const render = () => mount(root, weightCard(), drugCard(), sheetCard(), sourcesNote());

  /* -------------------------------- тегло -------------------------------- */
  function weightCard() {
    const weight = weights.get(p.id);
    const input = h('input', {
      type: 'text', inputmode: 'decimal', value: weight ? fmt(weight) : '', placeholder: 'напр. 12,4',
      style: { width: '110px', fontSize: '18px', fontWeight: '700' }, 'aria-label': 'Тегло в килограми',
      onchange: (e) => {
        const v = Number(String(e.target.value).replace(',', '.'));
        if (Number.isFinite(v) && v >= 1 && v <= 150) weights.set(p.id, v);
        else if (e.target.value.trim()) toast('Въведете тегло между 1 и 150 kg.', 'error');
        else weights.delete(p.id);
        render();
      },
    });
    let source;
    if (!measured) {
      source = h('span.small.warn-text', null, 'Няма измерено тегло — въведете днешното.');
    } else {
      const ago = daysBetween(measured.date, today());
      const stale = ago > (ageMonths < 24 ? 30 : 90);
      source = h('span.small' + (stale ? '.warn-text' : '.muted'), null,
        weight === measured.value ? `от измерване на ${formatDate(measured.date)}` : `последно измерено ${fmt(measured.value)} kg на ${formatDate(measured.date)}`,
        stale ? ` — преди ${ago} дни; претеглете отново, ако е възможно.` : '');
    }
    return card('Тегло за изчислението', { icon: '⚖️' },
      h('div.row', { style: { alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
        input, h('strong', null, 'kg'), source));
  }

  /* ------------------------------ лекарство ------------------------------ */
  function drugCard() {
    const weight = weights.get(p.id);
    const drugId = memory.drug;
    const drug = DOSING_DRUGS[drugId];
    const chip = (id) => h('button.chip' + (id === drugId ? '.active' : ''), {
      onclick: () => { memory.drug = id; render(); },
    }, DOSING_DRUGS[id].name);
    const antipyretics = DRUG_ORDER.filter(id => DOSING_DRUGS[id].group === 'antipyretic');
    const antibiotics = DRUG_ORDER.filter(id => DOSING_DRUGS[id].group === 'antibiotic');
    const picker = h('div.stack', { style: { gap: '8px' } },
      h('div.row.tight', null, h('span.small.muted.dose-group', null, 'Температура и болка'), antipyretics.map(chip)),
      h('div.row.tight', null, h('span.small.muted.dose-group', null, 'Антибиотици'), antibiotics.map(chip)));

    const regimenId = memory.regimen[drugId] || drug.regimens[0].id;
    const regimen = drug.regimens.find(r => r.id === regimenId) || drug.regimens[0];
    const regimenSelect = drug.regimens.length > 1
      ? field('Режим', h('select', {
        onchange: (e) => { memory.regimen[drugId] = e.target.value; render(); },
      }, drug.regimens.map(r => h('option', { value: r.id, selected: r.id === regimen.id }, r.label))))
      : h('div.small.muted', null, regimen.label);
    const daysField = drug.group === 'antibiotic' && !regimen.fixedDays
      ? field('Дни', h('input', {
        type: 'number', min: 1, max: 30, value: memory.days[`${drugId}:${regimen.id}`] || regimen.days, style: { width: '90px' },
        onchange: (e) => { memory.days[`${drugId}:${regimen.id}`] = Number(e.target.value) || regimen.days; render(); },
      }))
      : null;

    if (!weight) {
      return card(drug.name, { icon: '💊' }, picker, h('p.muted', { style: { marginTop: '14px' } }, 'Въведете тегло, за да се изчисли дозата.'));
    }

    const days = memory.days[`${drugId}:${regimen.id}`];
    const rows = drug.forms.map(f => computeDose({
      drugId, regimenId: regimen.id, formId: f.id, weightKg: weight, ageMonths, days, patient: p,
    }));
    const chosenId = memory.form[drugId] && rows.some(r => r.form.id === memory.form[drugId] && r.dose)
      ? memory.form[drugId]
      : defaultForm(rows, regimen).form.id;
    const chosen = rows.find(r => r.form.id === chosenId);

    const table = h('div.table-wrap', null, h('table.dose-table', null,
      h('thead', null, h('tr', null, ['', 'Форма', 'Единична доза', 'Колко често', 'Общо'].map(c => h('th', null, c)))),
      h('tbody', null, rows.map(r => doseRow(r, r.form.id === chosenId, () => { memory.form[drugId] = r.form.id; render(); })))));

    const warnings = [...new Map(chosen.warnings.map(w => [w.text, w])).values()];
    const worst = warnings.some(w => w.level === 'bad');
    return card(drug.name, { icon: '💊' },
      picker,
      h('div.row', { style: { gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '14px' } }, regimenSelect, daysField),
      warnings.length ? h('div.stack', { style: { gap: '6px', marginTop: '12px' } }, warnings.map(w =>
        h('div.alert-strip' + (w.level === 'warn' ? '.warn' : w.level === 'info' ? '.info' : ''), null, w.text))) : null,
      table,
      chosen.text ? h('div.dose-result' + (worst ? '.blocked' : ''), null,
        h('div.dose-text', null, chosen.text),
        h('div.row.tight', null,
          h('button.btn.sm', { onclick: () => copy(chosen.text) }, 'Копирай'),
          h('button.btn.sm.primary', {
            onclick: () => {
              // Пази се изборът, не текстът: при друго тегло дозите се преизчисляват.
              const i = sheet.findIndex(s => s.drugId === drugId);
              const item = { drugId, regimenId: regimen.id, formId: chosen.form.id, days };
              if (i >= 0) sheet[i] = item; else sheet.push(item);
              toast('Добавено в листа за родителя.', 'ok');
              render();
            },
          }, '＋ В листа за родителя'))) : null,
      (chosen.notes || []).length ? h('ul.small.muted.dose-notes', null, chosen.notes.map(n => h('li', null, n))) : null);
  }

  /* -------------------------- лист за родителя --------------------------- */
  function sheetCard() {
    const weight = weights.get(p.id);
    if (!sheet.length || !weight) return null;
    const items = sheet.map(s => computeDose({ ...s, weightKg: weight, ageMonths, patient: p }));
    return card(`Лист за родителя (${sheet.length})`, {
      icon: '🖨',
      actions: [
        h('button.btn.sm', { onclick: () => { sheet.length = 0; render(); } }, 'Изчисти'),
        h('button.btn.sm.primary', { onclick: () => printSheet(p, weight, items) }, '🖨 Печат'),
      ],
    }, h('ul.dose-sheet', null, items.map((r, i) => h('li', null, r.text || `${r.drug}: няма подходяща доза`, ' ',
      h('button.btn.xs.ghost', { title: 'Премахни', onclick: () => { sheet.splice(i, 1); render(); } }, '✕')))),
    h('p.tiny.muted', { style: { margin: '6px 0 0' } }, `Дозите в листа са за ${fmt(weight)} kg.`));
  }

  render();
  return root;
}

/* По подразбиране: най-разредената суспензия, при която дозата е до 10 ml
 * (иначе най-концентрираната); за режими с определена суспензия — нея. */
function defaultForm(rows, regimen) {
  const liquids = rows.filter(r => r.dose && r.form.type === 'liquid'
    && !(regimen.forms && !regimen.forms.includes(r.form.id)));
  const byStrength = [...liquids].sort((a, b) => a.form.mgPer5ml - b.form.mgPer5ml);
  return byStrength.find(r => r.dose.ml <= 10) || byStrength.at(-1) || rows.find(r => r.dose) || rows[0];
}

function doseRow(r, selected, onSelect) {
  const f = r.form;
  const name = h('div', null, h('div', null, f.label), f.examples ? h('div.tiny.dim', null, 'напр. ' + f.examples) : null);
  if (!r.dose) {
    return h('tr.dose-na', null, h('td'), h('td', null, name),
      h('td.small.muted', { colSpan: 3 }, f.type === 'suppository' ? 'няма подходяща сила за това тегло'
        : r.weightKg < TABLET_MIN_KG ? `таблетки — от ${TABLET_MIN_KG} kg` : 'не пасва на дозата за това тегло'));
  }
  const unit = r.unit;
  let amount;
  if (f.type === 'liquid') {
    amount = h('div', null, h('strong.dose-ml', null, `${fmt(r.dose.ml)} ml`), h('span.small.muted', null, ` = ${fmt(r.dose.mg, 0)} ${unit}`),
      h('div.tiny.dim', null, `${fmt(r.dose.perKg)} mg/kg`));
  } else if (f.type === 'suppository') {
    amount = h('div', null, h('strong.dose-ml', null, `1 × ${r.suppository.mg} mg`), h('div.tiny.dim', null, `${fmt(r.suppository.perKg)} mg/kg`));
  } else {
    amount = h('div', null, h('strong.dose-ml', null, r.tablets.text), h('span.small.muted', null, ` = ${fmt(r.tablets.mg, 0)} ${unit}`),
      h('div.tiny.dim', null, `${fmt(r.tablets.perKg)} mg/kg`));
  }
  if (r.laterDose) {
    amount.appendChild(h('div.small', { style: { marginTop: '3px' } }, 'от 2-ия ден: ',
      h('strong', null, f.type === 'liquid' ? `${fmt(r.laterDose.ml)} ml` : r.laterDose.text), ` (${fmt(r.laterDose.mg, 0)} ${unit})`));
  }
  const often = r.group === 'antipyretic'
    ? `при нужда, през ${r.everyHours} ч., до ${r.suppository ? r.suppository.perDay : r.maxDosesPerDay} пъти за 24 ч.`
    : `${r.everyText}, ${r.days} ${r.days === 1 ? 'ден' : 'дни'}`;
  const total = r.group === 'antipyretic'
    ? (f.type === 'liquid' ? `до ${fmt(r.maxDay.ml)} ml за 24 ч.` : `до ${fmt(r.maxDay.mg, 0)} mg за 24 ч.`)
    : (f.type === 'liquid' ? `около ${r.courseMl} ml за курса` : '');
  return h('tr.clickable' + (selected ? '.selected' : ''), { onclick: onSelect },
    h('td', null, h('input', { type: 'radio', name: 'doseForm', checked: selected, 'aria-label': f.label })),
    h('td', null, name), h('td', null, amount), h('td.small', null, often), h('td.small', null, total));
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Копирано — поставете го в амбулаторния лист.', 'ok');
  } catch {
    toast('Маркирайте текста и го копирайте ръчно.');
  }
}

function sourcesNote() {
  return h('p.tiny.muted', { style: { margin: '4px 2px 0' } },
    `Дозите са по кратките характеристики на продуктите, BNF for Children, AAP, IDSA, CDC и NICE (проверени ${DOSING_VERIFIED.split('-').reverse().join('.')}), `
    + 'за деца с нормална бъбречна и чернодробна функция. Проверете концентрацията на етикета на бутилката. '
    + 'Изчислението помага, но не замества преценката на лекаря и кратката характеристика на продукта.');
}

/* Лист за родителя: какво, колко, колко често и докога — с едър шрифт. */
function printSheet(p, weight, items) {
  printWindow('Лекарства — ' + p.name, `
    body { font-size: 13pt; }
    .item { border: 1px solid #bbb; border-radius: 3mm; padding: 4mm 5mm; margin: 0 0 4mm; page-break-inside: avoid; }
    .item h2 { border: 0; margin: 0 0 2mm; padding: 0; font-size: 14pt; }
    .item .how { font-size: 14pt; font-weight: 600; }
    .item ul { font-size: 10.5pt; color: #333; }
    .tips { font-size: 10.5pt; }
  `, (ctx) => {
    const { el, add, list } = ctx;
    header(ctx, 'Лекарства за детето', p);
    add(el('div', `Тегло: ${fmt(weight)} kg. Дозите са изчислени за това тегло.`, 'muted'));
    if ((p.allergies || []).length) add(el('div', 'Алергии: ' + p.allergies.join(', '), 'warn'));
    for (const it of items) {
      if (!it.text) continue;
      const box = add(el('div', undefined, 'item'));
      box.appendChild(el('h2', it.drug));
      box.appendChild(el('div', it.text, 'how'));
      if (it.parentNotes.length) box.appendChild(list(it.parentNotes));
    }
    add(el('h2', 'Важно'));
    add(list([
      'Отмервайте със спринцовката или мерителната лъжичка от опаковката, не с кухненска лъжица.',
      ...(items.some(i => i.group === 'antibiotic') ? ['Антибиотикът се дава до края на курса, дори детето да се почувства по-добре.'] : []),
      'Не давайте повече от посочения брой пъти за 24 часа.',
      'Потърсете лекар при затруднено дишане, обрив, сънливост, отказ от течности, температура повече от 3 дни или ако детето изглежда зле.',
    ])).classList.add('tips');
    const sign = add(el('div', undefined, 'sign'));
    sign.appendChild(el('div', 'Лекар: ' + (state.doctor ? state.doctor.name : '')));
    sign.appendChild(el('div', 'Дата: ' + formatDate(today())));
  });
}
