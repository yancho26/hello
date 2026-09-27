/* Раздел „Хранене“: начин на живот и личен хранителен режим. */

import { api } from '../api.js';
import { badge, card, decimalFields, empty, field, h, numberInput, select, toast, mount } from '../ui/components.js';
import { formatDate } from '../shared/dates.js';
import { ACTIVITY, GOALS, PREFERENCES } from '../shared/nutrition.js';
import { ALCOHOL, SMOKING, deleteWithConfirm, lifestyleDialog } from './adult-dialogs.js';
import { printNutritionPlan } from './adult-print.js';

const dec = (v) => String(v ?? '').replace('.', ',');

/* Последният изготвен режим остава видим при превключване между разделите. */
const drafts = new Map();

export function nutritionTab(ctx) {
  const { p, a, reload } = ctx;
  const ls = p.lifestyle || {};
  const preview = h('div');
  let form;
  let variant = 0;

  const lifestyle = card('Начин на живот', {
    icon: '🚶', actions: h('button.btn.sm', { onclick: () => lifestyleDialog(ctx) }, '✎ Редакция'),
  }, h('dl.kv', null,
    h('dt', null, 'Тютюнопушене'), h('dd', null, SMOKING[ls.smoking] || h('span.dim', null, 'не е отбелязано')),
    h('dt', null, 'Алкохол'), h('dd', null, ALCOHOL[ls.alcohol] || h('span.dim', null, 'не е отбелязано')),
    h('dt', null, 'Физическа активност'), h('dd', null, ACTIVITY[ls.activity]?.label || h('span.dim', null, 'не е отбелязано')),
    h('dt', null, 'Хранене'), h('dd', null, (ls.diet || []).map(d => PREFERENCES[d]).join(', ') || '—'),
    ls.notes ? h('dt', null, 'Бележки') : null, ls.notes ? h('dd', null, ls.notes) : null),
  ls.smoking === 'current' ? h('div.alert-strip.warn', { style: { marginTop: '10px' } },
    'Пуши: кратък съвет за спиране при всяко посещение (метод 5А); никотинозаместители или варениклин повишават успеха.') : null);

  const v = a.vitals;
  const defaultGoal = v.bmi >= 25 ? 'lose' : v.bmi && v.bmi < 18.5 ? 'gain' : 'maintain';

  const generate = async (save = false) => {
    const d = decimalFields(Object.fromEntries(new FormData(form)), ['weight', 'height']);
    try {
      const res = await api.nutrition(p.id, {
        weight: d.weight, height: d.height, activity: d.activity, goal: d.goal,
        preferences: new FormData(form).getAll('pref'), variant, save,
      });
      drafts.set(p.id, { plan: res.plan, variant });
      if (save) {
        toast('Режимът е запазен в досието.', 'ok');
        await reload();
        return;
      }
      mount(preview, planView(res.plan, {
        onVariant: () => { variant++; generate(); },
        onSave: () => generate(true),
        onPrint: () => printNutritionPlan(p, res.plan),
      }));
    } catch (err) { toast(err.message, 'error'); }
  };

  form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); variant = 0; generate(); } },
    h('div', null, field('Тегло (кг)', numberInput({ name: 'weight', min: 30, max: 350, value: v.weight ? dec(v.weight.value) : '' }),
      v.weight ? `последно ${formatDate(v.weight.date)}` : 'няма измерване')),
    h('div', null, field('Ръст (см)', numberInput({ name: 'height', min: 120, max: 230, value: v.height ? dec(v.height.value) : '' }))),
    h('div', null, field('Физическа активност', select(Object.entries(ACTIVITY).map(([k, x]) => ({
      value: k, label: x.label, selected: (ls.activity || 'sedentary') === k,
    })), { name: 'activity' }))),
    h('div', null, field('Цел', select(Object.entries(GOALS).map(([k, label]) => ({
      value: k, label, selected: k === defaultGoal,
    })), { name: 'goal' }), v.bmi ? `ИТМ ${dec(v.bmi)} — ${v.bmiClass?.label || ''}` : '')),
    h('div.full', null, h('div.q-opts', null, Object.entries(PREFERENCES).map(([k, label]) => h('label.opt', null,
      h('input', { type: 'checkbox', name: 'pref', value: k, checked: (ls.diet || []).includes(k) }), h('span', null, label))))),
    h('div.full', null, h('button.btn.primary', { type: 'submit' }, '🍽 Изготви режим'),
      h('span.small.muted', { style: { marginLeft: '10px' } },
        'Съобразява се със заболяванията, бъбречната функция, калия и лекарствата от досието.')));

  const saved = [...(p.nutritionPlans || [])].sort((x, y) => (x.date < y.date ? 1 : -1));
  const draft = drafts.get(p.id);
  if (draft) {
    variant = draft.variant;
    mount(preview, planView(draft.plan, {
      onVariant: () => { variant++; generate(); },
      onSave: () => generate(true),
      onPrint: () => printNutritionPlan(p, draft.plan),
    }));
  }

  return h('div.stack', null,
    lifestyle,
    card('Личен хранителен режим', { icon: '🥗' }, form),
    preview,
    saved.length ? card('Запазени режими', { icon: '📁', tight: true }, h('div.table-wrap', null, h('table', null,
      h('tbody', null, saved.map(n => h('tr', null,
        h('td.small.nowrap', null, formatDate(n.date)),
        h('td', null, `${n.plan.targets.kcal} kcal · белтък ${n.plan.targets.protein} г · ${GOALS[n.plan.input.goal] || ''}`),
        h('td.actions', null,
          h('button.btn.xs', { onclick: () => printNutritionPlan(p, n.plan) }, '🖨'), ' ',
          h('button.btn.xs.danger', {
            onclick: () => deleteWithConfirm('Запазеният режим ще бъде изтрит.', () => api.deleteNutrition(p.id, n.id), reload),
          }, '✕')))))))) : null);
}

/** Показване на изготвения режим. */
export function planView(plan, { onVariant, onSave, onPrint } = {}) {
  const t = plan.targets;
  const tile = (label, value, unit, sub) => h('div.tile', null, h('div.tiny.dim', null, label),
    h('div.tile-v', null, value, h('span.small.dim', null, ' ' + unit)), sub ? h('div.tiny.dim', null, sub) : null);
  const list = (title, items, cls) => (items.length ? h('div.nut-list.' + cls, null, h('h3', null, title),
    h('ul', null, items.map(x => h('li', null, x)))) : null);

  return card(`Режим: ${t.kcal} kcal дневно`, {
    icon: '📝',
    actions: [
      onVariant ? h('button.btn.sm', { onclick: onVariant }, '↻ Друг вариант на менюто') : null,
      onPrint ? h('button.btn.sm', { onclick: onPrint }, '🖨 Печат') : null,
      onSave ? h('button.btn.sm.primary', { onclick: onSave }, 'Запази в досието') : null,
    ],
  },
  plan.warnings.length ? h('div.stack', { style: { gap: '6px', marginBottom: '12px' } }, plan.warnings.map(w => h('div.alert-strip.warn', null, w))) : null,
  h('div.tiles', null,
    tile('Енергия', t.kcal, 'kcal', `покой ${plan.energy.bmr} · разход ${plan.energy.tdee}`),
    tile('Белтък', t.protein, 'г', `${dec(t.proteinPerKg)} г/кг`),
    tile('Въглехидрати', t.carbs, 'г', `${t.carbPct}% · захари <${t.sugarMax} г`),
    tile('Мазнини', t.fat, 'г', `${t.fatPct}% · наситени <${t.satFat} г`),
    tile('Фибри', t.fiber, 'г'),
    tile('Сол', '<' + t.salt, 'г'),
    tile('Течности', dec(Math.round(t.fluids / 100) / 10), 'л')),
  t.proteinNote ? h('p.small.muted', { style: { margin: '8px 0 0' } }, t.proteinNote) : null,
  h('div.nut-cols', null,
    list('Предпочитайте', plan.prefer, 'good'),
    list('Ограничете', plan.limit, 'limit'),
    list('Избягвайте', plan.avoid, 'avoid')),
  plan.medNotes.length ? h('div.nut-list.med', null, h('h3', null, 'Лекарства и храна'),
    h('ul', null, plan.medNotes.map(n => h('li', null, h('strong', null, n.med + ': '), n.text)))) : null,
  plan.notes.length ? h('div.nut-list', null, h('h3', null, 'Бележки'), h('ul', null, plan.notes.map(n => h('li', null, n)))) : null,
  h('h3', { style: { margin: '16px 0 8px' } }, 'Примерно меню за деня ', h('span.small.muted', { style: { fontWeight: 400 } },
    `— около ${plan.day.kcal} kcal, белтък ${plan.day.protein} г, фибри ${plan.day.fiber} г; изберете по един вариант за всяко хранене`)),
  h('div.meals', null, plan.meals.map(m => h('div.meal', null,
    h('div.meal-head', null, h('strong', null, m.label), h('span.tiny.dim', null, `≈${m.kcal} kcal`)),
    m.options.map((o, i) => h('div.meal-opt', null,
      h('div', null, badge('', `вариант ${i + 1}`), ' ', h('strong', null, o.name)),
      h('div.small.muted', null, o.items.map(x => x.text).join(' · ')),
      h('div.tiny.dim', null, `${o.kcal} kcal · Б ${o.protein} г · В ${o.carbs} г · М ${o.fat} г`)))))),
  h('p.tiny.muted', { style: { marginTop: '10px' } },
    'Енергия по Mifflin–St Jeor с коефициент за активност; препоръки по ESC, ADA/EASD, KDIGO 2024, СЗО и ESH. '
    + 'Режимът е ориентировъчен — при напреднало ХБЗ, диализа или хранителни разстройства е нужен диетолог.'));
}

export { empty };
