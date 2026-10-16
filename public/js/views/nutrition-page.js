/* Страница „Хранене“: хранителен режим за човек, който не е в пациентската листа —
 * консултация, близък на пациент, човек от друга практика. Записват се отделно от
 * пациентите и не влизат в списъка, справките и напомнянията. */

import { api } from '../api.js';
import { state } from '../app.js';
import { card, empty, field, h, input, mount, numberInput, select, toast } from '../ui/components.js';
import { formatDate } from '../shared/dates.js';
import { GOALS } from '../shared/nutrition.js';
import { searchDrugs, drugName } from '../shared/drugs.js';
import { planForm, planView, progressCard, savedPlans } from './nutrition-view.js';
import { deleteWithConfirm } from './adult-dialogs.js';
import { downloadNutritionPdf } from './pdf-export.js';
import { foodCatalog } from './food-catalog.js';
import { FOODS } from '../shared/recipes.js';

const dec = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
let selected = null;   // id на отворения човек или 'new'
let view = 'people';   // 'people' — хората извън листата; 'foods' — каталогът на храните (версия 4.15)

export async function renderNutritionPage(host) {
  const { clients } = await api.nutritionClients();
  const listEl = h('div');
  const editor = h('div');
  const rerender = () => renderNutritionPage(host);

  const open = async (id) => {
    selected = id;
    drawList();
    if (id === 'new') { mount(editor, clientEditor(null, { onSaved: (c) => { selected = c.id; rerender(); }, onClose })); return; }
    try {
      const { client } = await api.nutritionClient(id);
      mount(editor, clientEditor(client, { onSaved: () => rerender(), onClose }));
    } catch (err) { toast(err.message, 'error'); }
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const onClose = () => { selected = null; rerender(); };

  const drawList = () => mount(listEl, clients.length
    ? h('div.table-wrap', null, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Име'), h('th', null, 'Възраст'), h('th', null, 'Диагнози'), h('th', null, 'Последен режим'))),
      h('tbody', null, clients.map(c => h('tr.clickable' + (selected === c.id ? '.selected' : ''), { onclick: () => open(c.id) },
        h('td', null, h('strong', null, c.name || h('span.dim', null, 'без име')), c.phone ? h('div.tiny.dim', null, c.phone) : null),
        h('td.small', null, `${c.age} г. · ${c.sex === 'f' ? 'жена' : 'мъж'}`),
        h('td.small.mono', null, c.diagnoses.slice(0, 6).join(', ') || '—'),
        h('td.small', null, c.lastPlan ? `${formatDate(c.lastPlan.date)} · ${c.lastPlan.kcal} kcal · ${GOALS[c.lastPlan.goal] || ''}` : h('span.dim', null, 'няма'),
          c.plans > 1 ? h('span.tiny.dim', null, ` (${c.plans} режима)`) : null))))))
    : empty('Още няма хора извън пациентската листа. „Нов човек“ започва нов хранителен режим.', '🥗'));
  drawList();

  const tabs = h('div.tabs.no-print', { role: 'tablist' },
    [['people', 'Хора извън листата'], ['foods', `Каталог на храните (${Object.keys(FOODS).length})`]].map(([id, label]) =>
      h('button' + (view === id ? '.active' : ''), { role: 'tab', 'aria-selected': String(view === id), onclick: () => { view = id; rerender(); } }, label)));
  if (view === 'foods') {
    mount(host,
      h('div.page-head', null,
        h('div.titles', null,
          h('h1', null, 'Хранене'),
          h('div.muted.small', null, `${state.practice.name} · състав на храните, „богати на …“ и порции`))),
      tabs,
      card('Каталог на храните', { icon: '🥦' }, foodCatalog()));
    return;
  }

  mount(host,
    h('div.page-head', null,
      h('div.titles', null,
        h('h1', null, 'Хранене'),
        h('div.muted.small', null, `${state.practice.name} · хранителен режим за хора извън пациентската листа`)),
      h('div.row.no-print', null,
        h('button.btn.primary', { onclick: () => open('new') }, '+ Нов човек'))),
    tabs,
    h('div.alert-strip.info', { style: { marginBottom: '14px' } },
      'За пациент от листата режимът се изготвя в досието му, раздел „Хранене“ — там данните се вземат от досието. '
      + 'Тук въведете човека и всичките му заболявания по МКБ-10; записът не става пациент и не влиза в справките.'),
    card(`Хора (${clients.length})`, { icon: '🧑', tight: true }, listEl),
    h('div', { style: { height: '16px' } }),
    editor);

  if (selected) open(selected);
}

/* ------------------------------- редактор ------------------------------- */

function clientEditor(client, { onSaved, onClose }) {
  const c = client || { name: '', sex: '', birthDate: '', age: '', phone: '', weight: '', height: '', waist: '', activity: 'sedentary', diagnoses: [], allergies: [], meds: [], egfr: '', potassium: '', note: '', plans: [] };
  const preview = h('div');
  let variant = 0;
  let swaps = {};   // „Друго ястие“ — до ново изготвяне или „Друго меню“
  let clientId = client?.id || null;

  /* --------------------------- данни на човека --------------------------- */
  const name = input({ name: 'name', value: c.name || '', placeholder: 'по желание — например инициали' });
  const phone = input({ name: 'phone', value: c.phone || '', placeholder: 'по желание' });
  const sex = select([{ value: '', label: '—' }, { value: 'f', label: 'жена' }, { value: 'm', label: 'мъж' }]
    .map(o => ({ ...o, selected: (c.sex || '') === o.value })), { name: 'sex' });
  const birth = h('input', { type: 'date', name: 'birthDate', value: c.birthDate || '' });
  const age = numberInput({ name: 'age', min: 18, max: 110, value: c.birthDate ? '' : dec(c.age), placeholder: 'ако няма дата' });
  const waist = numberInput({ name: 'waist', min: 40, max: 250, value: dec(c.waist) });
  const egfr = numberInput({ name: 'egfr', min: 3, max: 200, value: dec(c.egfr), placeholder: 'mL/min/1,73 м²' });
  const potassium = numberInput({ name: 'potassium', min: 2, max: 9, value: dec(c.potassium), placeholder: 'mmol/L' });
  const allergies = input({ name: 'allergies', value: (c.allergies || []).join(', '), placeholder: 'напр. орехи, риба, мляко' });
  const note = h('textarea', { name: 'note', rows: 2, placeholder: 'по желание' }, c.note || '');
  const meds = medsPicker(c.meds || []);

  const top = h('div.stack', null,
    h('div.form-grid', null,
      h('div', null, field('Име', name)),
      h('div', null, field('Пол', sex)),
      h('div', null, field('Телефон', phone))),
    h('div.form-grid', null,
      h('div', null, field('Дата на раждане', birth)),
      h('div', null, field('или възраст (г.)', age)),
      h('div', null, field('Талия (см)', waist))),
    h('div.form-grid', null,
      h('div', null, field('eGFR', egfr, 'ако е известен — за бъбречната функция')),
      h('div', null, field('Калий', potassium)),
      h('div', null, field('Алергии и непоносимости', allergies, 'изключват се от менюто'))),
    h('div.nut-section', null,
      h('div.nut-sec-title', null, 'Лекарства'),
      meds.el,
      h('div.field-hint', null, 'За връзките между лекарства и храна, както и калия при ACE-инхибитор, сартан или MRA.')),
    field('Бележка', note));

  const readPerson = (body) => ({
    name: name.value.trim(), sex: sex.value, phone: phone.value.trim(),
    birthDate: birth.value, age: birth.value ? undefined : String(age.value).replace(',', '.'),
    weight: body.weight, height: body.height, waist: String(waist.value).replace(',', '.'),
    activity: body.activity, diagnoses: body.diagnoses,
    egfr: String(egfr.value).replace(',', '.'), potassium: String(potassium.value).replace(',', '.'),
    allergies: allergies.value, meds: meds.value(), note: note.value,
  });

  const person = (p) => ({ name: p.name || 'Без име', birthDate: p.birthDate, age: p.age, sex: p.sex });
  const show = (plan, who) => mount(preview, planView(plan, {
    onVariant: () => { variant++; swaps = {}; form.generate(); },
    onSwap: (key) => { swaps = { ...swaps, [key]: (swaps[key] || 0) + 1 }; form.generate(); },
    onSave: () => form.generate(true),
    saveLabel: clientId ? 'Запази режима' : 'Запази човека и режима',
    onPdf: () => downloadNutritionPdf(person(who), plan),
    onPdfShopping: () => downloadNutritionPdf(person(who), plan, { only: 'shopping' }),
  }));

  const last = c.plans?.length ? c.plans[c.plans.length - 1].plan.input : {};
  const form = planForm({
    last: { ...last, diagnoses: c.diagnoses, weight: dec(c.weight) || last.weight, height: dec(c.height) || last.height, activity: c.activity || last.activity, swaps: undefined },
    top,
    diagnoses: c.diagnoses,
    diagnosesHint: 'Въведете всички заболявания на човека — всеки код се взема предвид при изготвянето.',
    cycle: { stored: c.cycle, age: c.age || null, hidden: c.sex !== 'f', hint: 'Новата дата се записва, когато запазите режима.' },
    footer: 'Съобразява се с диагнозите, бъбречната функция, калия, лекарствата и алергиите.',
    onSubmit: () => { variant = 0; swaps = {}; },
    onGenerate: async (body, save) => {
      const p = readPerson(body);
      try {
        const res = await api.nutritionPlanFor({ ...body, person: p, clientId, variant, swaps, save });
        if (save) {
          clientId = res.client.id;
          toast('Записано в „Хранене“.', 'ok');
          onSaved(res.client);
          return;
        }
        show(res.plan, { ...p, age: res.plan.input.age });
        preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) { toast(err.message, 'error'); }
    },
  });

  // Полетата за цикъла — само за жени.
  sex.addEventListener('change', () => {
    for (const el of [form.cycleEl, form.trainingCycleEl]) if (el) el.style.display = sex.value === 'f' ? '' : 'none';
  });

  const saveData = async () => {
    const p = readPerson(form.read());
    try {
      const res = clientId ? await api.saveNutritionClient(clientId, p) : await api.addNutritionClient(p);
      clientId = res.client.id;
      toast('Данните са записани.', 'ok');
      onSaved(res.client);
    } catch (err) { toast(err.message, 'error'); }
  };

  const saved = [...(c.plans || [])].sort((x, y) => (x.date < y.date ? 1 : -1));
  // Напредък по последния режим — по теглата, записани след него (версия 4.14).
  const progress = client && saved.length ? progressCard(saved[0], c.weights || [], {
    onWeight: async (m) => {
      try {
        await api.addNutritionClientWeight(client.id, m);
        toast('Теглото е записано.', 'ok');
        onSaved(client);
      } catch (err) { toast(err.message, 'error'); }
    },
    onApply: (x) => form.apply(x),
  }) : null;
  return h('div.stack', null,
    card(client ? (client.name || 'Без име') : 'Нов човек', {
      icon: '🥗',
      actions: [
        h('button.btn.sm', { onclick: saveData }, '💾 Запиши данните'),
        client ? h('button.btn.sm.danger', {
          onclick: () => deleteWithConfirm(`„${client.name || 'Без име'}“ и запазените му режими ще бъдат изтрити.`,
            () => api.deleteNutritionClient(client.id), onClose),
        }, 'Изтрий') : null,
        h('button.btn.sm.ghost', { onclick: onClose }, 'Затвори'),
      ],
    }, form.el),
    progress,
    preview,
    savedPlans(saved, {
      show: (plan) => show(plan, c),
      pdf: (n) => downloadNutritionPdf(person(c), n.plan),
      remove: (n) => deleteWithConfirm('Запазеният режим ще бъде изтрит.', () => api.deleteNutritionClientPlan(client.id, n.id), () => onSaved(client)),
    }));
}

/* ------------------------------- лекарства ------------------------------- */

let medsSeq = 0;
function medsPicker(initial) {
  const items = [...initial];
  const chips = h('div.dx-list');
  const listId = 'med-options-' + (++medsSeq);
  const datalist = h('datalist', { id: listId });
  const inp = h('input', { type: 'text', placeholder: 'име на лекарство', autocomplete: 'off', list: listId });
  const render = () => mount(chips, items.length
    ? items.map((id, i) => h('div.dx-chip', null, h('span.dx-name', null, drugName(id)),
      h('button.btn.xs.ghost', { type: 'button', title: 'Махни', onclick: () => { items.splice(i, 1); render(); } }, '✕')))
    : h('div.small.dim', null, 'Няма въведени лекарства.'));
  inp.addEventListener('input', () => mount(datalist, searchDrugs(inp.value).map(d => h('option', { value: d.name }))));
  const add = () => {
    const hit = searchDrugs(inp.value)[0];
    if (!hit) { toast('Лекарството не е намерено в каталога.', 'error'); return; }
    if (!items.includes(hit.id)) items.push(hit.id);
    inp.value = '';
    render();
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  render();
  return {
    el: h('div.med-picker', null, chips, h('div.row.tight', { style: { marginTop: '8px' } }, inp, datalist, h('button.btn.sm', { type: 'button', onclick: add }, '+ Добави'))),
    value: () => [...items],
  };
}
