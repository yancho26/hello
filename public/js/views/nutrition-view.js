/* Раздел „Хранене“: начин на живот и личен хранителен режим — цел и темпо,
 * хранителен модел, брой хранения, ограничения, меню за ден или седмица с
 * рецепти и списък за пазаруване. */

import { api } from '../api.js';
import { badge, card, decimalFields, empty, field, h, numberInput, select, toast, mount } from '../ui/components.js';
import { formatDate } from '../shared/dates.js';
import { ACTIVITY, GOALS, PACES, PATTERNS, PREFERENCES, allergyPreferences } from '../shared/nutrition.js';
import { ALCOHOL, SMOKING, deleteWithConfirm, lifestyleDialog } from './adult-dialogs.js';
import { printNutritionPlan } from './adult-print.js';

const dec = (v) => String(v ?? '').replace('.', ',');

/* Последният изготвен режим и изборът във формата остават при превключване между разделите. */
const drafts = new Map();

export function nutritionTab(ctx) {
  const { p, a, reload } = ctx;
  const ls = p.lifestyle || {};
  const preview = h('div');
  let variant = 0;
  const draft = drafts.get(p.id);
  const last = draft?.form || {};

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
  const conds = new Set(a.conditions.map(c => c.code));
  const defaultGoal = last.goal || (v.bmi >= 25 ? 'lose' : v.bmi && v.bmi < 18.5 ? 'gain' : 'maintain');
  const defaultPattern = last.pattern || (conds.has('htn') ? 'dash' : 'mediterranean');
  const allergy = allergyPreferences(p.allergies || []);
  const chosenPrefs = new Set(last.preferences || [...(ls.diet || []), ...allergy.prefs]);

  /* ------------------------------- полета ------------------------------- */

  const weight = numberInput({ name: 'weight', min: 30, max: 350, value: last.weight ?? (v.weight ? dec(v.weight.value) : '') });
  const height = numberInput({ name: 'height', min: 120, max: 230, value: last.height ?? (v.height ? dec(v.height.value) : '') });
  const activity = select(Object.entries(ACTIVITY).map(([k, x]) => ({
    value: k, label: x.label, selected: (last.activity || ls.activity || 'sedentary') === k,
  })), { name: 'activity' });

  const goalRadios = Object.entries(GOALS).map(([k, label]) => h('label.opt', null,
    h('input', { type: 'radio', name: 'goal', value: k, checked: k === defaultGoal }), h('span', null, label)));
  const pace = select(Object.entries(PACES).map(([k, x]) => ({ value: k, label: x.label, selected: (last.pace || 'standard') === k })), { name: 'pace' });
  const paceHint = h('div.field-hint');
  const target = numberInput({ name: 'targetWeight', min: 30, max: 350, value: last.targetWeight ?? '', placeholder: 'по желание' });
  const targetHelp = h('div.row.tight', { style: { flexWrap: 'wrap', marginTop: '4px' } });
  const pattern = select(Object.entries(PATTERNS).map(([k, x]) => ({ value: k, label: x.label, selected: k === defaultPattern })), { name: 'pattern' });
  const patternHint = h('div.field-hint');
  const meals = select([3, 4, 5].map(n => ({ value: n, label: `${n} хранения`, selected: Number(last.mealsPerDay || 5) === n })), { name: 'mealsPerDay' });
  const days = select([
    { value: 1, label: '1 ден, по 2 варианта', selected: Number(last.days || 1) === 1 },
    { value: 7, label: 'седмица с пазаруване', selected: Number(last.days || 1) === 7 },
  ], { name: 'days' });
  const quick = h('input', { type: 'checkbox', name: 'quick', checked: !!last.quick });
  const strength = h('input', { type: 'checkbox', name: 'strength', checked: !!last.strength });

  const goalValue = () => goalRadios.map(l => l.querySelector('input')).find(i => i.checked)?.value || 'maintain';
  const refresh = () => {
    const g = goalValue();
    const w = Number(String(weight.value).replace(',', '.'));
    pace.disabled = g === 'maintain';
    target.disabled = g === 'maintain';
    const kcal = g === 'lose' ? PACES[pace.value].lose : g === 'gain' ? PACES[pace.value].gain : 0;
    paceHint.textContent = g === 'maintain' ? 'Енергията е равна на разхода.'
      : `${kcal > 0 ? '+' : ''}${kcal} kcal дневно — около ${dec(Math.abs(Math.round(kcal * 7 / 770) / 10))} кг седмично.`;
    patternHint.textContent = PATTERNS[pattern.value].about;
    const opts = [];
    if (w > 30 && g === 'lose') opts.push([`−5% · ${Math.round(w * 0.95)} кг`, Math.round(w * 0.95)], [`−10% · ${Math.round(w * 0.9)} кг`, Math.round(w * 0.9)]);
    const h2 = Number(String(height.value).replace(',', '.'));
    if (w > 30 && h2 > 120 && g === 'gain') {
      const n = Math.round(20 * (h2 / 100) ** 2);
      if (n > w) opts.push([`ИТМ 20 · ${n} кг`, n]);
    }
    mount(targetHelp, opts.map(([label, val]) => h('button.btn.xs.ghost', { type: 'button', onclick: () => { target.value = String(val); } }, label)));
  };
  for (const el of [pace, pattern, weight, height]) el.addEventListener('change', refresh);
  for (const l of goalRadios) l.querySelector('input').addEventListener('change', refresh);

  const prefBoxes = Object.entries(PREFERENCES).map(([k, label]) => h('label.opt', null,
    h('input', { type: 'checkbox', name: 'pref', value: k, checked: chosenPrefs.has(k) }), h('span', null, label)));

  /* ------------------------------- изготвяне ------------------------------- */

  let form;
  const readForm = () => {
    const fd = new FormData(form);
    const d = decimalFields(Object.fromEntries(fd), ['weight', 'height', 'targetWeight']);
    return {
      weight: d.weight, height: d.height, activity: d.activity, goal: goalValue(),
      pace: d.pace || 'standard', targetWeight: goalValue() === 'maintain' ? '' : d.targetWeight,
      pattern: d.pattern, mealsPerDay: Number(d.mealsPerDay), days: Number(d.days),
      quick: quick.checked, strength: strength.checked, preferences: fd.getAll('pref'),
    };
  };
  const show = (plan) => mount(preview, planView(plan, {
    onVariant: () => { variant++; generate(); },
    onSave: () => generate(true),
    onPrint: () => printNutritionPlan(p, plan),
  }));
  const generate = async (save = false) => {
    const body = readForm();
    try {
      const res = await api.nutrition(p.id, { ...body, variant, save });
      drafts.set(p.id, { plan: res.plan, variant, form: body });
      if (save) {
        toast('Режимът е запазен в досието.', 'ok');
        await reload();
        return;
      }
      show(res.plan);
      preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { toast(err.message, 'error'); }
  };

  form = h('form.stack', { onsubmit: (e) => { e.preventDefault(); variant = 0; generate(); } },
    h('div.form-grid', null,
      h('div', null, field('Тегло (кг)', weight, v.weight ? `последно ${formatDate(v.weight.date)}` : 'няма измерване')),
      h('div', null, field('Ръст (см)', height, v.bmi ? `ИТМ ${dec(v.bmi)} — ${v.bmiClass?.label || ''}` : '')),
      h('div', null, field('Физическа активност', activity))),
    h('div.nut-section', null,
      h('div.nut-sec-title', null, 'Цел'),
      h('div.q-opts', null, goalRadios),
      h('div.form-grid', { style: { marginTop: '10px' } },
        h('div', null, field('Темпо', pace, paceHint)),
        h('div', null, field('Целево тегло (кг)', target, targetHelp)))),
    h('div.nut-section', null,
      h('div.nut-sec-title', null, 'Хранене'),
      h('div.form-grid', null,
        h('div', null, field('Хранителен модел', pattern, patternHint)),
        h('div', null, field('Хранения на ден', meals)),
        h('div', null, field('Меню', days))),
      h('div.q-opts', { style: { marginTop: '10px' } },
        h('label.opt', null, quick, h('span', null, 'бързи рецепти, до 20 минути')),
        h('label.opt', null, strength, h('span', null, 'силови тренировки — повече белтък')))),
    h('div.nut-section', null,
      h('div.nut-sec-title', null, 'Ограничения и предпочитания'),
      h('div.q-opts', null, prefBoxes),
      allergy.matched.length ? h('div.field-hint', null, `Отбелязани са според алергиите в досието: ${allergy.matched.join(', ')}.`) : null),
    h('div', null, h('button.btn.primary', { type: 'submit' }, '🍽 Изготви режим'),
      h('span.small.muted', { style: { marginLeft: '10px' } },
        'Съобразява се със заболяванията, бъбречната функция, калия, лекарствата и алергиите от досието.')));
  refresh();

  const saved = [...(p.nutritionPlans || [])].sort((x, y) => (x.date < y.date ? 1 : -1));
  if (draft) {
    variant = draft.variant;
    show(draft.plan);
  }

  return h('div.stack', null,
    lifestyle,
    card('Личен хранителен режим', { icon: '🥗' }, form),
    preview,
    saved.length ? card('Запазени режими', { icon: '📁', tight: true }, h('div.table-wrap', null, h('table', null,
      h('tbody', null, saved.map(n => h('tr', null,
        h('td.small.nowrap', null, formatDate(n.date)),
        h('td', null, `${n.plan.targets.kcal} kcal · белтък ${n.plan.targets.protein} г · ${GOALS[n.plan.input.goal] || ''}`,
          n.plan.pattern ? h('div.tiny.dim', null, `${n.plan.pattern.label}${n.plan.week ? ' · седмично меню' : ''}`) : null),
        h('td.actions', null,
          h('button.btn.xs', { onclick: () => show(n.plan) }, 'Покажи'), ' ',
          h('button.btn.xs', { onclick: () => printNutritionPlan(p, n.plan) }, '🖨'), ' ',
          h('button.btn.xs.danger', {
            onclick: () => deleteWithConfirm('Запазеният режим ще бъде изтрит.', () => api.deleteNutrition(p.id, n.id), reload),
          }, '✕')))))))) : null);
}

/* ------------------------------- показване ------------------------------- */

const list = (title, items, cls = '') => (items && items.length ? h('div.nut-list' + (cls ? '.' + cls : ''), null, h('h3', null, title),
  h('ul', null, items.map(x => h('li', null, x)))) : null);

/** Рецепта: състав, приготвяне, подправки, време и стойности. */
function recipeCard(o, { label = null, open = false } = {}) {
  if (!o) return h('div.small.muted', null, 'Няма подходящо ястие при избраните ограничения.');
  return h('div.recipe', null,
    h('div.recipe-head', null,
      label ? badge('', label) : null,
      h('strong', null, o.name),
      o.time ? h('span.tiny.dim', null, `⏱ ${o.time} мин`) : null),
    h('div.small.muted', null, o.items.map(x => x.text).join(' · ')),
    o.method ? h('details.recipe-how', { open }, h('summary', null, 'Приготвяне'),
      h('p.small', null, o.method),
      o.flavor?.length ? h('p.small', null, h('strong', null, 'За вкус: '), o.flavor.join(', ')) : null) : null,
    h('div.tiny.dim', null, `${o.kcal} kcal · Б ${o.protein} г · В ${o.carbs} г · М ${o.fat} г · фибри ${o.fiber} г`));
}

function projectionText(plan) {
  const pr = plan.projection;
  const goal = plan.input.goal;
  if (goal === 'maintain') return 'Цел: поддържане на теглото.';
  if (!pr) return `Цел: ${GOALS[goal] || GOALS.maintain}.`;
  const parts = [`Цел: ${GOALS[goal]}, ${PACES[plan.input.pace]?.label || ''} темпо`,
    `около ${pr.weeklyKg > 0 ? '+' : '−'}${dec(Math.abs(pr.weeklyKg))} кг седмично`];
  if (pr.targetWeight) parts.push(`до ${dec(pr.targetWeight)} кг за около ${pr.weeks} седмици, към ${formatDate(pr.eta)}`);
  return parts.join(' · ');
}

/** Показване на изготвения режим. */
export function planView(plan, { onVariant, onSave, onPrint } = {}) {
  const t = plan.targets;
  const tile = (label, value, unit, sub) => h('div.tile', null, h('div.tiny.dim', null, label),
    h('div.tile-v', null, value, h('span.small.dim', null, ' ' + unit)), sub ? h('div.tiny.dim', null, sub) : null);

  const menu = plan.week
    ? h('div.stack', null, plan.week.map((d, i) => h('details.week-day', { open: i === 0 },
      h('summary', null, h('strong', null, d.label), h('span.small.dim', null, ` ${formatDate(d.date)}`),
        h('span.grow'), h('span.small.muted', null, `${d.totals.kcal} kcal · Б ${d.totals.protein} г · фибри ${d.totals.fiber} г`)),
      h('div.meals', null, d.meals.map(m => h('div.meal', null,
        h('div.meal-head', null, h('strong', null, m.label), h('span.tiny.dim', null, `${m.time || ''} · ≈${m.kcal} kcal`)),
        recipeCard(m.option)))))))
    : h('div.meals', null, plan.meals.map(m => h('div.meal', null,
      h('div.meal-head', null, h('strong', null, m.label), h('span.tiny.dim', null, `${m.time ? m.time + ' · ' : ''}≈${m.kcal} kcal`)),
      m.options.length ? m.options.map((o, i) => recipeCard(o, { label: `вариант ${i + 1}` })) : h('div.small.muted', null, 'Няма подходящо ястие.'))));

  const shopping = plan.shopping ? card('Списък за пазаруване за седмицата', { icon: '🛒', tight: true },
    h('div.shop-grid', null, plan.shopping.groups.map(g => h('div.shop-group', null,
      h('h3', null, g.label),
      h('ul', null, g.items.map(it => h('li', null, h('span', null, it.name), h('span.dim', null, it.amount))))))),
    plan.shopping.spices.length ? h('div.body.small', null, h('strong', null, 'Подправки и билки: '), plan.shopping.spices.join(', ')) : null) : null;

  return h('div.stack', null,
    card(`Режим: ${t.kcal} kcal дневно`, {
      icon: '📝',
      actions: [
        onVariant ? h('button.btn.sm', { onclick: onVariant }, '↻ Друго меню') : null,
        onPrint ? h('button.btn.sm', { onclick: onPrint }, '🖨 Печат') : null,
        onSave ? h('button.btn.sm.primary', { onclick: onSave }, 'Запази в досието') : null,
      ],
    },
    plan.warnings.length ? h('div.stack', { style: { gap: '6px', marginBottom: '12px' } }, plan.warnings.map(w => h('div.alert-strip.warn', null, w))) : null,
    h('div.alert-strip.info', { style: { marginBottom: '12px' } }, projectionText(plan),
      plan.projection?.note ? h('div.small', { style: { fontWeight: 400 } }, plan.projection.note) : null),
    h('div.tiles', null,
      tile('Енергия', t.kcal, 'kcal', `покой ${plan.energy.bmr} · разход ${plan.energy.tdee}`),
      tile('Белтък', t.protein, 'г', `${dec(t.proteinPerKg)} г/кг${t.proteinMax ? ` · до ${t.proteinMax} г` : ''}`),
      tile('Въглехидрати', t.carbs, 'г', `${t.carbPct}% · захари <${t.sugarMax} г`),
      tile('Мазнини', t.fat, 'г', `${t.fatPct}% · наситени <${t.satFat} г`),
      tile('Фибри', t.fiber, 'г'),
      tile('Сол', '<' + t.salt, 'г'),
      tile('Течности', dec(Math.round(t.fluids / 100) / 10), 'л')),
    t.proteinNote ? h('p.small.muted', { style: { margin: '8px 0 0' } }, t.proteinNote) : null,
    plan.pattern ? h('p.small', { style: { margin: '8px 0 0' } }, h('strong', null, `Модел: ${plan.pattern.label}. `), plan.pattern.about) : null,
    plan.portions ? h('div.nut-cols', null,
      h('div.nut-list', null, h('h3', null, 'Порции за деня'),
        h('table.portions', null, h('tbody', null, plan.portions.map(x => h('tr', null,
          h('td', null, h('strong', null, x.count)), h('td', null, x.group, h('div.tiny.dim', null, x.unit))))))),
      list('Седмичен ритъм', plan.weekly)) : null,
    h('div.nut-cols', null,
      list('Предпочитайте', plan.prefer, 'good'),
      list('Ограничете', plan.limit, 'limit'),
      list('Избягвайте', plan.avoid, 'avoid')),
    plan.medNotes.length ? h('div.nut-list.med', null, h('h3', null, 'Лекарства и храна'),
      h('ul', null, plan.medNotes.map(n => h('li', null, h('strong', null, n.med + ': '), n.text)))) : null,
    h('div.nut-cols', null,
      list('Навици', plan.habits),
      list('Вкус без много сол', plan.flavor),
      list('Контрол на теглото', plan.monitoring)),
    list('Бележки', plan.notes)),

    card(plan.week ? 'Меню за седмицата' : 'Примерно меню за деня', {
      icon: '🍽',
    },
    h('p.small.muted', { style: { marginTop: 0 } }, plan.week
      ? 'Обядите и вечерите не се повтарят; риба поне 2 пъти, бобови поне 3 пъти, червено месо до 2 пъти седмично. Щракнете върху ден или „Приготвяне“.'
      : `Около ${plan.day.kcal} kcal, белтък ${plan.day.protein} г, фибри ${plan.day.fiber} г — изберете по един вариант за всяко хранене.`),
    menu),
    shopping,
    h('p.tiny.muted', null,
      'Енергия по Mifflin–St Jeor с коефициент за активност; препоръки по EFSA, СЗО, NICE NG246, ESPEN, ACSM, ESC, ADA 2026, KDIGO 2024. '
      + 'Режимът е ориентировъчен — при напреднало ХБЗ, диализа, бременност или хранителни разстройства е нужен диетолог.'));
}

export { empty };
