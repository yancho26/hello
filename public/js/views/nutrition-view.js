/* Раздел „Хранене“: начин на живот и личен хранителен режим — цел и темпо,
 * хранителен модел, брой хранения, ограничения, заболявания по МКБ-10, меню за
 * ден или седмица с рецепти и списък за пазаруване.
 * Формата и показването са общи за досието и за външен човек (nutrition-page.js). */

import { api } from '../api.js';
import { badge, card, decimalFields, empty, field, h, numberInput, select, toast, mount } from '../ui/components.js';
import { trendChart } from '../ui/trend-chart.js';
import { addDays, daysBetween, formatDate, today } from '../shared/dates.js';
import { ACTIVITY, FOODS, GOALS, PACES, PATTERNS, PREFERENCES, allergyPreferences, expectedWeight, planProgress, weekChunks } from '../shared/nutrition.js';
import { shopName } from '../shared/recipes.js';
import { enBaseName } from '../shared/i18n/en-foods.js';
import { dietProfiles, dossierDiagnoses, dxName, searchDx, validIcd } from '../shared/diet-icd.js';
import { normIcd } from '../shared/icd.js';
import { ALCOHOL, SMOKING, deleteWithConfirm, lifestyleDialog } from './adult-dialogs.js';
import { busy, downloadNutritionPdf } from './pdf-export.js';
import { cycleFields, cyclePlanBlock, phaseChip } from './cycle-view.js';
import { trainingCard, trainingChip, trainingFields, trainingTips } from './training-view.js';
import { ui as L, withPlanLang } from '../shared/i18n/plan-en.js';

const dec = (v) => String(v ?? '').replace('.', ',');

/* Последният изготвен режим и изборът във формата остават при превключване между разделите. */
const drafts = new Map();

export function nutritionTab(ctx) {
  const { p, a, reload } = ctx;
  const ls = p.lifestyle || {};
  const preview = h('div');
  let variant = 0;
  // „Друго ястие“: колко пъти е сменено всяко място в менюто — до ново изготвяне или „Друго меню“.
  let swaps = {};
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
  const allergy = allergyPreferences(p.allergies || []);

  const show = (plan) => mount(preview, planView(plan, {
    onVariant: () => { variant++; swaps = {}; form.generate(); },
    onSwap: (key) => { swaps = { ...swaps, [key]: (swaps[key] || 0) + 1 }; form.generate(); },
    onSave: () => form.generate(true),
    saveLabel: 'Запази в досието',
    onPdf: () => downloadNutritionPdf(p, plan),
    onPdfEn: () => downloadNutritionPdf(p, plan, { lang: 'en' }),
    onPdfShopping: () => downloadNutritionPdf(p, plan, { only: 'shopping' }),
  }));

  const saved = [...(p.nutritionPlans || [])].sort((x, y) => (x.date < y.date ? 1 : -1));
  const form = planForm({
    last,
    dislikes: saved[0]?.plan.input.dislikes || [],
    weight: { value: v.weight ? dec(v.weight.value) : '', hint: v.weight ? `последно ${formatDate(v.weight.date)}` : 'няма измерване' },
    height: { value: v.height ? dec(v.height.value) : '', hint: v.bmi ? `ИТМ ${dec(v.bmi)} — ${v.bmiClass?.label || ''}` : '' },
    activity: ls.activity,
    pulse: lastPulse(p),
    defaultGoal: v.bmi >= 25 ? 'lose' : v.bmi && v.bmi < 18.5 ? 'gain' : 'maintain',
    defaultPattern: conds.has('htn') ? 'dash' : 'mediterranean',
    prefs: [...(ls.diet || []), ...allergy.prefs],
    prefsHint: allergy.matched.length ? `Отбелязани са според алергиите в досието: ${allergy.matched.join(', ')}.` : '',
    diagnoses: dossierDiagnoses(p),
    cycle: p.sex === 'f' ? {
      stored: p.cycle, age: a.age ?? null,
      hint: 'Новата дата се добавя в дневника (раздел „Цикъл“), когато запазите режима.',
    } : null,
    diagnosesHint: 'Попълнени са от хроничните заболявания, „Други заболявания“ и прегледите при специалист. Добавете или махнете — режимът се изготвя по този списък.',
    footer: 'Съобразява се с диагнозите, бъбречната функция, калия, лекарствата и алергиите от досието.',
    onGenerate: async (body, save) => {
      try {
        const res = await api.nutrition(p.id, { ...body, variant, swaps, save });
        drafts.set(p.id, { plan: res.plan, variant, swaps, form: body });
        if (save) {
          toast('Режимът е запазен в досието.', 'ok');
          await reload();
          return;
        }
        show(res.plan);
        preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) { toast(err.message, 'error'); }
    },
    onSubmit: () => { variant = 0; swaps = {}; },
  });

  if (draft) {
    variant = draft.variant;
    swaps = draft.swaps || {};
    show(draft.plan);
  }
  // Напредък по последния запазен режим — по измерванията на теглото в досието.
  const progress = saved.length ? progressCard(saved[0], (p.measurements || []).filter(m => m.weight > 0).map(m => ({ date: m.date, weight: m.weight })), {
    onWeight: async (m) => {
      try {
        await api.addMeasurement(p.id, m);
        toast('Теглото е записано в измерванията.', 'ok');
        await reload();
      } catch (err) { toast(err.message, 'error'); }
    },
    onApply: (x) => form.apply(x),
  }) : null;

  return h('div.stack', null,
    lifestyle,
    progress,
    card('Личен хранителен режим', { icon: '🥗' }, form.el),
    preview,
    savedPlans(saved, {
      show,
      pdf: (n) => downloadNutritionPdf(p, n.plan),
      pdfEn: (n) => downloadNutritionPdf(p, n.plan, { lang: 'en' }),
      remove: (n) => deleteWithConfirm('Запазеният режим ще бъде изтрит.', () => api.deleteNutrition(p.id, n.id), reload),
    }));
}

/* ------------------------- напредък (версия 4.14) ------------------------- */

const PROGRESS_STRIP = { ok: 'ok', done: 'ok', slow: 'warn', fast: 'warn', up: 'warn', down: 'warn', early: 'info', none: 'info' };

/**
 * Напредък по последния запазен режим: теглото по прогнозата и измереното след режима, какво да
 * се промени. weights: [{ date, weight }]; onWeight({ date, weight }) — записва ново тегло;
 * onApply({ weight, kcalAdjust }) — нов режим с последното тегло и корекцията на енергията.
 */
export function progressCard(saved, weights, { onWeight, onApply } = {}) {
  const pr = planProgress(saved, weights);
  if (!pr) return null;
  const plan = saved.plan;
  const from = saved.date;
  const lastDate = pr.points.length ? pr.points[pr.points.length - 1].date : from;
  const span = Math.max(56, daysBetween(from, lastDate) + 28);
  const expected = [];
  for (let d = 0; d <= span; d += 7) expected.push({ date: addDays(from, d), value: expectedWeight(plan, d) });
  const chart = trendChart({
    series: [
      { label: 'по прогнозата', points: expected, cls: 'proj', dots: false },
      { label: 'измерено', points: [{ date: from, value: pr.start }, ...pr.points.map(p => ({ date: p.date, value: p.weight }))], cls: 'a' },
    ],
    unit: 'кг', decimals: 1,
    lines: pr.targetWeight ? [{ value: pr.targetWeight, label: `цел ${dec(pr.targetWeight)} кг` }] : [],
  });
  const facts = [`начало ${dec(pr.start)} кг на ${formatDate(from)}`];
  if (pr.points.length) {
    facts.push(`последно ${dec(pr.last)} кг на ${formatDate(pr.to)}`,
      `${pr.change > 0 ? '+' : pr.change < 0 ? '−' : ''}${dec(Math.abs(pr.change))} кг за ${dec(pr.weeks)} седм.`,
      `средно ${pr.rate > 0 ? '+' : pr.rate < 0 ? '−' : ''}${dec(Math.abs(pr.rate))} кг седмично`,
      `по прогнозата ${pr.expected > 0 ? '+' : pr.expected < 0 ? '−' : ''}${dec(Math.abs(pr.expected))} кг`);
  }
  const date = h('input', { type: 'date', value: today(), max: today() });
  const weight = numberInput({ min: 30, max: 350, placeholder: 'кг' });
  const save = () => {
    const w = Number(String(weight.value).replace(',', '.'));
    if (!(w >= 30 && w <= 350)) { toast('Въведете тегло между 30 и 350 кг.', 'error'); return; }
    onWeight({ date: date.value || today(), weight: w });
  };
  return card(`Напредък по режима от ${formatDate(from)}`, { icon: '📉' },
    h(`div.alert-strip.${PROGRESS_STRIP[pr.status] || 'info'}`, { style: { marginBottom: '10px' } }, pr.text),
    h('div.small.muted', null, facts.join(' · ')),
    chart ? h('div.proj-chart', null, chart,
      h('div.tiny.muted', null, 'Пунктир — очакваното тегло по прогнозата на режима; точките — измереното тегло.')) : null,
    h('div.row.tight.no-print.progress-row', { style: { flexWrap: 'wrap', marginTop: '10px', gap: '8px' } },
      onWeight ? [h('span.small', null, 'Тегло днес:'), date, weight, h('button.btn.sm', { type: 'button', onclick: save }, '💾 Запиши теглото')] : null,
      onApply && pr.kcalNew ? h('button.btn.sm.primary', {
        type: 'button', onclick: () => onApply({ weight: pr.last, kcalAdjust: pr.adjust }),
        title: 'Изготвя режима отново с последното тегло и с корекцията на енергията',
      }, `↻ Нов режим с около ${pr.kcalNew} kcal`) : null,
      onApply && pr.points.length && !pr.kcalNew ? h('button.btn.sm', {
        type: 'button', onclick: () => onApply({ weight: pr.last }),
        title: 'Изготвя режима отново с последното тегло',
      }, '↻ Нов режим с последното тегло') : null),
    h('p.tiny.muted', { style: { margin: '8px 0 0' } },
      'Правилата: при отслабване — спад под 0,25 кг седмично за 3 седмици: с 150–200 kcal по-малко; над 1 кг седмично: с 200 kcal повече. '
      + 'При покачване — без покачване за 3 седмици: с 200–300 kcal повече; над 1 кг седмично: с 200 kcal по-малко.'));
}

/** Пулсът в покой от последното измерване през последната година — за пулса по резерва. */
function lastPulse(p) {
  const since = addDays(today(), -365);
  const m = (p.measurements || []).filter(x => x.pulse > 0 && x.date >= since).sort((a, b) => (a.date < b.date ? -1 : 1)).pop();
  return m ? Math.round(m.pulse) : null;
}

/** Таблица със запазените режими. */
export function savedPlans(saved, { show, pdf, pdfEn, remove }) {
  if (!saved.length) return null;
  return card('Запазени режими', { icon: '📁', tight: true }, h('div.table-wrap', null, h('table', null,
    h('tbody', null, saved.map(n => h('tr', null,
      h('td.small.nowrap', null, formatDate(n.date)),
      h('td', null, `${n.plan.targets.kcal} kcal · белтък ${n.plan.targets.protein} г · ${GOALS[n.plan.input.goal] || ''}`,
        n.plan.pattern ? h('div.tiny.dim', null, `${n.plan.pattern.label}${menuKind(n.plan)}`
          + (n.plan.input.diagnoses?.length ? ` · ${n.plan.input.diagnoses.map(d => d.code).join(', ')}` : '')) : null),
      h('td.actions', null,
        h('button.btn.xs', { onclick: () => show(n.plan) }, 'Покажи'), ' ',
        h('button.btn.xs', { onclick: busy(() => pdf(n)), title: 'PDF отчет' }, '📄 PDF'), ' ',
        pdfEn && n.plan.lang !== 'en' ? [h('button.btn.xs', { onclick: busy(() => pdfEn(n)), title: 'Същият режим като PDF на английски' }, '📄 EN'), ' '] : null,
        h('button.btn.xs.danger', { onclick: () => remove(n) }, '✕'))))))));
}

const menuKind = (plan) => (!plan.week ? '' : plan.week.length > 7 ? ' · месечно меню' : ' · седмично меню');

/* ------------------------------- форма ------------------------------- */

/**
 * Изборът за режима. cfg: last (предишният избор), weight/height ({ value, hint }), activity,
 * defaultGoal, defaultPattern, prefs, prefsHint, diagnoses, diagnosesHint, top (полета отгоре),
 * cycle ({ stored, age, hint, hidden } — менструалният цикъл за жени), footer, onGenerate(body, save), onSubmit,
 * pulse (пулс в покой за тренировките), dislikes (храните, които човекът не яде — от последния режим).
 * Връща { el, read, generate, apply, cycleEl, trainingCycleEl }.
 */
export function planForm(cfg) {
  const last = cfg.last || {};
  const weight = numberInput({ name: 'weight', min: 30, max: 350, value: last.weight ?? cfg.weight?.value ?? '' });
  const height = numberInput({ name: 'height', min: 120, max: 230, value: last.height ?? cfg.height?.value ?? '' });
  const activity = select(Object.entries(ACTIVITY).map(([k, x]) => ({
    value: k, label: x.label, selected: (last.activity || cfg.activity || 'sedentary') === k,
  })), { name: 'activity' });

  const defaultGoal = last.goal || cfg.defaultGoal || 'maintain';
  const goalRadios = Object.entries(GOALS).map(([k, label]) => h('label.opt', null,
    h('input', { type: 'radio', name: 'goal', value: k, checked: k === defaultGoal }), h('span', null, label)));
  const pace = select(Object.entries(PACES).map(([k, x]) => ({ value: k, label: x.label, selected: (last.pace || 'standard') === k })), { name: 'pace' });
  const paceHint = h('div.field-hint');
  const target = numberInput({ name: 'targetWeight', min: 30, max: 350, value: last.targetWeight ?? '', placeholder: 'по желание' });
  const adjust = numberInput({ name: 'kcalAdjust', min: -600, max: 600, value: last.kcalAdjust || '', placeholder: 'напр. −150' });
  const targetHelp = h('div.row.tight', { style: { flexWrap: 'wrap', marginTop: '4px' } });
  const pattern = select(Object.entries(PATTERNS).map(([k, x]) => ({ value: k, label: x.label, selected: k === (last.pattern || cfg.defaultPattern || 'mediterranean') })), { name: 'pattern' });
  const patternHint = h('div.field-hint');
  const meals = select([3, 4, 5].map(n => ({ value: n, label: `${n} хранения`, selected: Number(last.mealsPerDay || 5) === n })), { name: 'mealsPerDay' });
  const days = select([
    { value: 1, label: '1 ден, по 2 варианта', selected: Number(last.days || 1) === 1 },
    { value: 7, label: 'седмица с пазаруване', selected: Number(last.days || 1) === 7 },
    { value: 28, label: 'месец (4 седмици), пазаруване по седмици', selected: Number(last.days || 1) === 28 },
  ], { name: 'days' });
  const lang = select([
    { value: 'bg', label: 'български', selected: (last.lang || 'bg') === 'bg' },
    { value: 'en', label: 'английски (English)', selected: last.lang === 'en' },
  ], { name: 'lang' });
  const quick = h('input', { type: 'checkbox', name: 'quick', checked: !!last.quick });
  const strength = h('input', { type: 'checkbox', name: 'strength', checked: !!last.strength });
  const sourced = h('input', { type: 'checkbox', name: 'sourcedOnly', checked: !!last.sourcedOnly });
  const dx = diagnosesEditor(last.diagnoses || cfg.diagnoses || [], { week: last.pregnancyWeek });
  const cyc = cfg.cycle ? cycleFields({ cycle: cfg.cycle.stored, last, age: cfg.cycle.age, hint: cfg.cycle.hint }) : null;
  if (cyc && cfg.cycle.hidden) cyc.el.style.display = 'none';
  const tr = trainingFields({ last, activity: last.activity || cfg.activity, goal: last.goal || cfg.defaultGoal, female: !!cfg.cycle && !cfg.cycle.hidden, pulse: cfg.pulse });
  const dislikes = dislikesEditor(last.dislikes || cfg.dislikes || []);

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

  const chosen = new Set(last.preferences || cfg.prefs || []);
  const prefBoxes = Object.entries(PREFERENCES).map(([k, label]) => h('label.opt', null,
    h('input', { type: 'checkbox', name: 'pref', value: k, checked: chosen.has(k) }), h('span', null, label)));

  let el;
  const read = () => {
    const fd = new FormData(el);
    const d = decimalFields(Object.fromEntries(fd), ['weight', 'height', 'targetWeight']);
    const kcalAdjust = Number(String(d.kcalAdjust || '').replace(/[−–]/g, '-').replace(',', '.').replace(/\s/g, ''));
    return {
      weight: d.weight, height: d.height, activity: d.activity, goal: goalValue(),
      pace: d.pace || 'standard', targetWeight: goalValue() === 'maintain' ? '' : d.targetWeight,
      kcalAdjust: Number.isFinite(kcalAdjust) ? Math.max(-600, Math.min(600, Math.round(kcalAdjust))) : 0,
      pattern: d.pattern, mealsPerDay: Number(d.mealsPerDay), days: Number(d.days),
      quick: quick.checked, strength: strength.checked, sourcedOnly: sourced.checked,
      preferences: fd.getAll('pref'), dislikes: dislikes.value(), diagnoses: dx.value(), pregnancyWeek: dx.week(),
      ...(cyc && cyc.el.style.display !== 'none' ? cyc.read() : {}),
      training: tr.read(),
      lang: d.lang || 'bg',
    };
  };
  const generate = (save = false) => cfg.onGenerate(read(), save);
  /* Нов режим по напредъка: последното тегло и корекция на енергията. */
  const apply = ({ weight: w, kcalAdjust } = {}) => {
    if (w) weight.value = dec(w);
    if (kcalAdjust !== undefined) adjust.value = kcalAdjust ? String(kcalAdjust).replace('-', '−') : '';
    refresh();
    cfg.onSubmit?.();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    generate();
  };

  el = h('form.stack', { onsubmit: (e) => { e.preventDefault(); cfg.onSubmit?.(); generate(); } },
    cfg.top || null,
    h('div.form-grid', null,
      h('div', null, field('Тегло (кг)', weight, cfg.weight?.hint)),
      h('div', null, field('Ръст (см)', height, cfg.height?.hint)),
      h('div', null, field('Физическа активност', activity))),
    h('div.nut-section', null,
      h('div.nut-sec-title', null, 'Заболявания по МКБ-10'),
      dx.el,
      cfg.diagnosesHint ? h('div.field-hint', null, cfg.diagnosesHint) : null),
    cyc ? cyc.el : null,
    h('div.nut-section', null,
      h('div.nut-sec-title', null, 'Цел'),
      h('div.q-opts', null, goalRadios),
      h('div.form-grid', { style: { marginTop: '10px' } },
        h('div', null, field('Темпо', pace, paceHint)),
        h('div', null, field('Целево тегло (кг)', target, targetHelp)),
        h('div', null, field('Корекция на енергията (kcal)', adjust, 'по проследяването на теглото — от −600 до +600')))),
    h('div.nut-section', null,
      h('div.nut-sec-title', null, 'Хранене'),
      h('div.form-grid', null,
        h('div', null, field('Хранителен модел', pattern, patternHint)),
        h('div', null, field('Хранения на ден', meals)),
        h('div', null, field('Меню', days)),
        h('div', null, field('Език на режима', lang, 'Менюто, рецептите, съветите и PDF отчетът.'))),
      h('div.q-opts', { style: { marginTop: '10px' } },
        h('label.opt', null, quick, h('span', null, 'бързи рецепти, до 20 минути')),
        h('label.opt', null, strength, h('span', null, 'силови тренировки — повече белтък')),
        h('label.opt', null, sourced, h('span', null, 'само рецепти с публикуван източник (NHLBI)')))),
    tr.el,
    h('div.nut-section', null,
      h('div.nut-sec-title', null, 'Ограничения и предпочитания'),
      h('div.q-opts', null, prefBoxes),
      cfg.prefsHint ? h('div.field-hint', null, cfg.prefsHint) : null,
      h('div.nut-sec-sub', null, 'Не яде'),
      dislikes.el,
      h('div.field-hint', null, 'Ястията с тези храни не влизат в менюто, ако има с какво да се заменят.')),
    h('div', null, h('button.btn.primary', { type: 'submit' }, '🍽 Изготви режим'),
      cfg.footer ? h('span.small.muted', { style: { marginLeft: '10px' } }, cfg.footer) : null));
  refresh();
  return { el, read, generate, apply, cycleEl: cyc?.el || null, trainingCycleEl: tr.cycleEl };
}

/* ------------------------- храни, които не яде ------------------------- */

const FOOD_LIST = Object.keys(FOODS).map(id => ({ id, name: shopName(id) })).sort((a, b) => a.name.localeCompare(b.name, 'bg'));
let dislikeSeq = 0;

/** Храните, които човекът не яде (версия 4.14): търсене по име в каталога на рецептите. */
export function dislikesEditor(initial = []) {
  const items = initial.filter(id => FOODS[id]);
  const chips = h('div.q-opts.dislike-chips');
  const listId = 'food-options-' + (++dislikeSeq);
  const datalist = h('datalist', { id: listId }, FOOD_LIST.map(f => h('option', { value: f.name })));
  const inp = h('input', { type: 'text', placeholder: 'храна, напр. гъби или патладжан', autocomplete: 'off', list: listId });
  const render = () => mount(chips, items.length
    ? items.map((id, i) => h('span.dislike-chip', null, shopName(id),
      h('button.btn.xs.ghost', { type: 'button', title: 'Махни', onclick: () => { items.splice(i, 1); render(); } }, '✕')))
    : h('span.small.dim', null, 'Няма.'));
  const add = () => {
    const q = inp.value.trim().toLowerCase();
    if (!q) return;
    const hit = FOOD_LIST.find(f => f.name.toLowerCase() === q) || FOOD_LIST.find(f => f.name.toLowerCase().includes(q));
    if (!hit) { toast('Няма такава храна в рецептите на програмата.', 'error'); return; }
    if (!items.includes(hit.id)) items.push(hit.id);
    inp.value = '';
    render();
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  inp.addEventListener('change', () => { if (FOOD_LIST.some(f => f.name === inp.value)) add(); });
  render();
  return {
    el: h('div', null, chips, h('div.row.tight', { style: { marginTop: '6px' } }, inp, datalist, h('button.btn.sm', { type: 'button', onclick: add }, '+ Добави'))),
    value: () => [...items],
  };
}

/* ------------------------- диагнози по МКБ-10 ------------------------- */

const PREGNANCY = /^O|^Z3[3-6]/;
let dxListSeq = 0;

/**
 * Списък с диагнози: код, име, откъде е дошла и как се отразява на режима.
 * Нов код се въвежда с търсене по код или по име.
 */
export function diagnosesEditor(initial = [], { week = null } = {}) {
  let items = initial.map(d => ({ code: normIcd(d.code), name: d.name || dxName(d.code), from: d.from || '' }));
  const listEl = h('div.dx-list');
  const listId = 'dx-options-' + (++dxListSeq);
  const datalist = h('datalist', { id: listId });
  const inp = h('input', { type: 'text', placeholder: 'код или име, напр. K21.0 или рефлукс', autocomplete: 'off', list: listId });
  const weekInput = numberInput({ name: 'pregnancyWeek', min: 1, max: 42, value: week ?? '', placeholder: 'седмица' });
  const weekRow = h('div.dx-week', null, field('Гестационна седмица', weekInput, 'За енергията по тримесечия (EFSA).'));

  const render = () => {
    mount(listEl, items.length ? items.map((d, i) => {
      const eff = dietProfiles([d]).considered[0];
      return h('div.dx-chip', null,
        h('span.dx-code', null, d.code),
        h('span.dx-name', null, d.name || '—'),
        eff?.label ? h('span.dx-eff', null, `${eff.label}${eff.effects.length ? ' · ' + eff.effects.join(', ') : ''}`)
          : h('span.dx-eff.none', null, 'без специфични хранителни правила'),
        d.from ? h('span.tiny.dim', null, d.from) : null,
        h('button.btn.xs.ghost', { type: 'button', title: 'Махни', onclick: () => { items.splice(i, 1); render(); } }, '✕'));
    }) : h('div.small.dim', null, 'Няма въведени диагнози.'));
    weekRow.style.display = items.some(d => PREGNANCY.test(d.code)) ? '' : 'none';
  };
  inp.addEventListener('input', () => {
    mount(datalist, searchDx(inp.value).map(d => h('option', { value: `${d.code} — ${d.name}` })));
  });
  const add = () => {
    const raw = inp.value.trim();
    if (!raw) return;
    const m = /^([A-Za-zА-Яа-я]\s?\d{2}(?:[.,]\d{1,2})?)\s*(?:[—–-]\s*)?(.*)$/.exec(raw);
    let code = m ? normIcd(m[1].replace(',', '.')) : '';
    let name = m ? m[2].trim() : '';
    if (!code || !validIcd(code)) {
      const hit = searchDx(raw)[0];
      if (!hit) { toast('Въведете код по МКБ-10 (буква и две цифри, например K21.0) или изберете от списъка.', 'error'); return; }
      code = hit.code; name = hit.name;
    }
    if (items.some(d => d.code === code)) { toast(`${code} вече е в списъка.`, 'error'); return; }
    items.push({ code, name: name || dxName(code), from: '' });
    inp.value = '';
    mount(datalist);
    render();
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  render();
  const el = h('div.dx-editor', null, listEl,
    h('div.row.tight', { style: { marginTop: '8px' } }, inp, datalist, h('button.btn.sm', { type: 'button', onclick: add }, '+ Добави')),
    weekRow);
  return {
    el,
    value: () => items.map(d => ({ code: d.code, name: d.name })),
    week: () => {
      const n = Number(String(weekInput.value).replace(',', '.'));
      return items.some(d => PREGNANCY.test(d.code)) && n >= 1 && n <= 42 ? Math.round(n) : null;
    },
  };
}

/* ------------------------------- показване ------------------------------- */

const fd = (iso) => L(formatDate(iso));

/* Витамини и минерали в менюто спрямо EFSA (версия 4.15). */
function microBlock(plan) {
  const m = plan.micro;
  if (!m?.rows?.length) return null;
  const num = (v) => (plan.lang === 'en' ? String(v) : dec(v));
  return h('div.nut-list.micro', null,
    h('h3', null, L(m.basis === 'week' ? 'Витамини и минерали — средно на ден в менюто' : 'Витамини и минерали — в първия вариант на деня')),
    h('table.micro-table', null, h('tbody', null, m.rows.map(r => h('tr', { class: 'st-' + r.status },
      h('td', null, r.label),
      h('td.num', null, `${num(r.value)} ${r.unit}`),
      h('td.bar', null, h('div.micro-bar' + (r.max ? '.max' : ''), { title: `${r.pct}%` }, h('span', { style: { width: Math.min(100, r.pct) + '%' } }))),
      h('td.num.dim', null, `${r.max ? '< ' : ''}${num(r.ref)} ${r.unit}`))))),
    m.notes.length ? h('ul', null, m.notes.map(n => h('li', null, n.text))) : null,
    h('p.tiny.dim', { style: { margin: '6px 0 0' } }, L('Препоръки за възрастни по EFSA 2017; съставът на храните — по USDA FoodData Central. Растителните напитки и кисели млека са без витамините, добавени от производителя.')));
}

const list = (title, items, cls = '') => (items && items.length ? h('div.nut-list' + (cls ? '.' + cls : ''), null, h('h3', null, title),
  h('ul', null, items.map(x => h('li', null, x)))) : null);

/** Източникът на рецептата: „NHLBI · Baked Salmon Dijon“ с връзка. */
export function sourceText(src) {
  if (!src?.length) return null;
  return src.map(s => `${s.org}, „${s.title}“${s.page && !s.url.includes('healthy-eating-recipes') ? `, стр. ${s.page}` : ''}`).join('; ');
}

/** Рецепта: състав, приготвяне, подправки, време, стойности и източник. swap — „Друго ястие“. */
function recipeCard(o, { label = null, open = false, swap = null } = {}) {
  if (!o) return h('div.small.muted', null, L('Няма подходящо ястие при избраните ограничения.'));
  return h('div.recipe', null,
    h('div.recipe-head', null,
      label ? badge('', label) : null,
      h('strong', null, o.name),
      o.time ? h('span.tiny.dim', null, L(`⏱ ${o.time} мин`)) : null,
      swap ? h('button.btn.xs.ghost.recipe-swap.no-print', { type: 'button', title: 'Друго ястие на това място — останалото меню не се променя', onclick: swap }, '↻ Друго') : null),
    h('div.small.muted', null, o.items.map(x => x.text).join(' · ')),
    o.method ? h('details.recipe-how', { open }, h('summary', null, L('Приготвяне')),
      h('p.small', null, o.method),
      o.flavor?.length ? h('p.small', null, h('strong', null, L('За вкус: ')), o.flavor.join(', ')) : null) : null,
    h('div.tiny.dim', null, L(`${o.kcal} kcal · Б ${o.protein} г · В ${o.carbs} г · М ${o.fat} г · фибри ${o.fiber} г`)),
    o.source?.length ? h('div.tiny.recipe-src', null, L('📖 Източник: '),
      ...o.source.flatMap((s, i) => [i ? '; ' : '', h('a', { href: s.url, target: '_blank', rel: 'noopener' }, L(`${s.org}, „${s.title}“`)),
        s.page && !s.url.includes('healthy-eating-recipes') ? L(`, стр. ${s.page}`) : ''])) : null);
}

function projectionText(plan) {
  const pr = plan.projection;
  const goal = plan.input.goal;
  if (goal === 'maintain') return L('Цел: поддържане на теглото.');
  if (!pr) return L(`Цел: ${GOALS[goal] || GOALS.maintain}.`);
  const parts = [L(`Цел: ${GOALS[goal]}, ${PACES[plan.input.pace]?.label || ''} темпо`),
    L(`около ${pr.weeklyKg > 0 ? '+' : '−'}${dec(Math.abs(pr.weeklyKg))} кг седмично`)];
  if (pr.targetWeight) parts.push(L(`до ${dec(pr.targetWeight)} кг за около ${pr.weeks} седмици, към ${fd(pr.eta)}`));
  return parts.join(' · ');
}

/** Как е взета предвид всяка диагноза. */
function diagnosesBlock(plan) {
  const dx = plan.diagnoses || [];
  if (!dx.length) return null;
  return h('div.nut-list.dx', null, h('h3', null, L('Заболявания, взети предвид')),
    h('ul', null, dx.map(c => h('li', null,
      h('strong', null, c.code), ' ', c.name || '',
      c.label ? h('span.small', null, ` — ${c.effects.join(', ')}`, c.src ? h('span.dim', null, ` (${c.src})`) : null)
        : h('span.small.dim', null, L(' — без специфични хранителни правила; режимът е общ'))))));
}

/** Списък за пазаруване: продуктите по групи и подправките. */
function shopGrid(shop) {
  return h('div', null,
    h('div.shop-grid', null, shop.groups.map(g => h('div.shop-group', null,
      h('h3', null, g.label),
      h('ul', null, g.items.map(it => h('li', null, h('span', null, it.name), h('span.dim', null, it.amount))))))),
    shop.spices.length ? h('div.body.small', null, h('strong', null, L('Подправки и билки: ')), shop.spices.join(', ')) : null);
}

/** Показване на изготвения режим. */
export function planView(plan, opts = {}) {
  // Надписите около режима — на езика на режима (версия 4.11).
  return withPlanLang(plan, () => planBody(plan, opts));
}

/** Очакваното тегло по седмици — графика с целта (версия 4.14). */
function projectionChart(plan) {
  const pr = plan.projection;
  if (!pr?.curve?.length) return null;
  const from = pr.from || plan.input.startDate || today();
  const chart = trendChart({
    series: [{ label: L('очаквано тегло'), points: pr.curve.map(c => ({ date: addDays(from, c.week * 7), value: c.weight })), cls: 'proj', dots: false }],
    unit: L('кг'), decimals: 1,
    lines: pr.targetWeight ? [{ value: pr.targetWeight, label: L(`цел ${dec(pr.targetWeight)} кг`) }] : [],
  });
  return h('div.proj-chart', null, chart,
    h('div.tiny.muted', null, L('Прогнозата отчита, че с теглото се променя и разходът на енергия — промяната се забавя с времето (Hall 2011).')));
}

function planBody(plan, { onVariant, onSave, onPdf, onPdfEn, onPdfShopping, onSwap, saveLabel = 'Запази' } = {}) {
  const t = plan.targets;
  const tile = (label, value, unit, sub) => h('div.tile', null, h('div.tiny.dim', null, label),
    h('div.tile-v', null, value, h('span.small.dim', null, ' ' + unit)), sub ? h('div.tiny.dim', null, sub) : null);
  const swapAt = (key) => (onSwap ? () => onSwap(key) : null);
  const dislikes = (plan.input.dislikes || []).filter(id => FOODS[id]).map(id => (plan.lang === 'en' ? enBaseName(id) : shopName(id)));

  const dayView = (d, open) => h('details.week-day', { open },
    h('summary', null, h('strong', null, d.label), h('span.small.dim', null, ` ${fd(d.date)}`),
      d.cycle ? phaseChip(d.cycle) : null,
      trainingChip(d.training),
      h('span.grow'), h('span.small.muted', null, L(`${d.totals.kcal} kcal · Б ${d.totals.protein} г · фибри ${d.totals.fiber} г`)
        + (d.totals.fe !== undefined ? L(` · желязо ${Math.round(d.totals.fe)} мг · калций ${Math.round(d.totals.ca / 10) * 10} мг`) : ''))),
    trainingTips(d.training),
    h('div.meals', null, d.meals.map((m, i) => h('div.meal', null,
      h('div.meal-head', null, h('strong', null, m.label), h('span.tiny.dim', null, `${m.time || ''} · ≈${m.kcal} kcal`)),
      recipeCard(m.option, { swap: swapAt(`${d.day - 1}.${i}.0`) })))));
  const month = plan.week && plan.week.length > 7;
  const menu = month
    // Месец: по седмици, всяка със своя списък за пазаруване.
    ? h('div.stack', null, weekChunks(plan.week).map((days, w) => {
      const shop = plan.shoppingWeeks?.[w];
      return h('section.month-week', null,
        h('h3.month-week-title', null, L(`Седмица ${w + 1}`), h('span.small.dim', null, ` · ${fd(days[0].date)} – ${fd(days[days.length - 1].date)}`)),
        h('div.stack', null, days.map((d, i) => dayView(d, w === 0 && i === 0))),
        shop ? h('details.month-shop', { open: w === 0 },
          h('summary', null, L(`🛒 Пазаруване за седмица ${w + 1}`), h('span.small.dim', null, L(` · ${shop.groups.reduce((n, g) => n + g.items.length, 0)} продукта`))),
          shopGrid(shop)) : null);
    }))
    : plan.week
      ? h('div.stack', null, plan.week.map((d, i) => dayView(d, i === 0)))
      : h('div.meals', null, plan.meals.map((m, si) => h('div.meal', null,
      h('div.meal-head', null, h('strong', null, m.label), h('span.tiny.dim', null, `${m.time ? m.time + ' · ' : ''}≈${m.kcal} kcal`)),
      m.options.length ? m.options.map((o, i) => recipeCard(o, { label: L(`вариант ${i + 1}`), swap: swapAt(`0.${si}.${i}`) })) : h('div.small.muted', null, L('Няма подходящо ястие.')))));

  const shopping = plan.shopping ? card(L('Списък за пазаруване за седмицата'), { icon: '🛒', tight: true }, shopGrid(plan.shopping)) : null;

  const options = plan.week ? plan.week.flatMap(d => d.meals.map(m => m.option)) : plan.meals.flatMap(m => m.options);
  // Желязо и калций в менюто: средно за седмицата или за първия вариант на деня.
  const minerals = plan.week
    ? { fe: plan.week.reduce((s, d) => s + (d.totals.fe || 0), 0) / plan.week.length, ca: plan.week.reduce((s, d) => s + (d.totals.ca || 0), 0) / plan.week.length }
    : { fe: plan.day?.fe || 0, ca: plan.day?.ca || 0 };
  const sourcedCount = options.filter(o => o?.source?.length).length;

  return h('div.stack', null,
    card(L(`Режим: ${t.kcal} kcal дневно`), {
      icon: '📝',
      actions: [
        plan.lang === 'en' ? badge('', 'English') : null,
        onVariant ? h('button.btn.sm', { onclick: onVariant }, '↻ Друго меню') : null,
        onPdf ? h('button.btn.sm', { onclick: busy(onPdf), title: 'Цветен PDF отчет: цели, насоки, тренировки, меню, пазаруване и източници' }, plan.training ? '📄 PDF с тренировките' : '📄 PDF отчет') : null,
        // Същият режим на английски — без смяна на езика и ново изготвяне (версия 4.15.1).
        onPdfEn && plan.lang !== 'en' ? h('button.btn.sm', { onclick: busy(onPdfEn), title: 'Същият режим като PDF на английски — менюто, рецептите, съветите, тренировките и пазаруването' }, '📄 PDF на английски') : null,
        onPdfShopping && (plan.shopping || plan.shoppingWeeks) ? h('button.btn.sm', { onclick: busy(onPdfShopping), title: 'Само списъците за пазаруване като PDF' }, '🛒 PDF пазаруване') : null,
        onSave ? h('button.btn.sm.primary', { onclick: onSave }, saveLabel) : null,
      ],
    },
    plan.warnings.length ? h('div.stack', { style: { gap: '6px', marginBottom: '12px' } }, plan.warnings.map(w => h('div.alert-strip.warn', null, w))) : null,
    h('div.alert-strip.info', { style: { marginBottom: '12px' } }, projectionText(plan),
      plan.projection?.note ? h('div.small', { style: { fontWeight: 400 } }, plan.projection.note) : null),
    projectionChart(plan),
    h('div.tiles', null,
      tile(L('Енергия'), t.kcal, 'kcal', L(`покой ${plan.energy.bmr} · разход ${plan.energy.tdee}`)),
      tile(L('Белтък'), t.protein, L('г'), L(`${dec(t.proteinPerKg)} г/кг`) + (t.proteinMax ? L(` · до ${t.proteinMax} г`) : '')),
      tile(L('Въглехидрати'), t.carbs, L('г'), L(`${t.carbPct}% · захари <${t.sugarMax} г`)),
      tile(L('Мазнини'), t.fat, L('г'), L(`${t.fatPct}% · наситени <${t.satFat} г`)),
      tile(L('Фибри'), t.fiber, L('г')),
      tile(L('Сол'), '<' + t.salt, L('г')),
      tile(L('Течности'), L(dec(Math.round(t.fluids / 100) / 10)), L('л')),
      t.iron ? tile(L('Желязо'), t.iron, L('мг'), L(`в менюто ≈${Math.round(minerals.fe)} мг`)) : null,
      t.calcium ? tile(L('Калций'), t.calcium, L('мг'), L(`в менюто ≈${Math.round(minerals.ca / 10) * 10} мг`)) : null),
    t.proteinNote ? h('p.small.muted', { style: { margin: '8px 0 0' } }, t.proteinNote) : null,
    plan.pattern ? h('p.small', { style: { margin: '8px 0 0' } }, h('strong', null, L(`Модел: ${plan.pattern.label}. `)), plan.pattern.about) : null,
    dislikes.length ? h('p.small', { style: { margin: '6px 0 0' } }, h('strong', null, L('Не яде: ')), dislikes.join(', ') + '.') : null,
    diagnosesBlock(plan),
    cyclePlanBlock(plan),
    microBlock(plan),
    plan.portions ? h('div.nut-cols', null,
      h('div.nut-list', null, h('h3', null, L('Порции за деня')),
        h('table.portions', null, h('tbody', null, plan.portions.map(x => h('tr', null,
          h('td', null, h('strong', null, x.count)), h('td', null, x.group, h('div.tiny.dim', null, x.unit))))))),
      list(L('Седмичен ритъм'), plan.weekly)) : null,
    h('div.nut-cols', null,
      list(L('Предпочитайте'), plan.prefer, 'good'),
      list(L('Ограничете'), plan.limit, 'limit'),
      list(L('Избягвайте'), plan.avoid, 'avoid')),
    plan.medNotes.length ? h('div.nut-list.med', null, h('h3', null, L('Лекарства и храна')),
      h('ul', null, plan.medNotes.map(n => h('li', null, h('strong', null, n.med + ': '), n.text)))) : null,
    h('div.nut-cols', null,
      list(L('Навици'), plan.habits),
      list(L('Вкус без много сол'), plan.flavor),
      list(L('Контрол на теглото'), plan.monitoring)),
    list(L('Бележки'), plan.notes)),

    trainingCard(plan),

    card(month ? L('Меню за месеца') : plan.week ? L('Меню за седмицата') : L('Примерно меню за деня'), {
      icon: '🍽',
    },
    h('p.small.muted', { style: { marginTop: 0 } }, month
      ? L('Четири седмици, всяка със свой списък за пазаруване. В рамките на седмицата обядите и вечерите не се повтарят; всяка седмица риба поне 2 пъти, бобови поне 3 пъти, червено месо до 2 пъти. Щракнете върху ден или „Приготвяне“.')
      : plan.week
      ? L('Обядите и вечерите не се повтарят; риба поне 2 пъти, бобови поне 3 пъти, червено месо до 2 пъти седмично. Щракнете върху ден или „Приготвяне“.')
      : L(`Около ${plan.day.kcal} kcal, белтък ${plan.day.protein} г, фибри ${plan.day.fiber} г — изберете по един вариант за всяко хранене.`),
    sourcedCount ? L(` С публикуван източник (NHLBI): ${sourcedCount} от ${options.filter(Boolean).length} ястия.`) : ''),
    plan.trainingToday ? h('div.row.tight', { style: { flexWrap: 'wrap', marginBottom: '8px' } }, h('strong.small', null, L('Тренировка днес: ')),
      trainingChip(plan.trainingToday) || h('span.small.dim', null, L('почивка')), trainingTips(plan.trainingToday)) : null,
    menu),
    shopping,
    h('p.tiny.muted', null,
      L('Енергия по Mifflin–St Jeor с коефициент за активност; препоръки по EFSA, СЗО, NICE NG246, ESPEN, ACSM, ESC, ADA 2026, KDIGO 2024; правилата по диагнози — по насоката, посочена до всяка. ')
      + (plan.cycle?.applied ? L('Фазите на цикъла — по FIGO 2018 и ASRM 2024; промените по фази — по Tucker 2024, Benton 2020, EFSA 2015, ACOG 2023. ') : '')
      + L('Рецептите с източник са на NHLBI (National Heart, Lung, and Blood Institute, NIH) — обществено достояние; съставките са пренесени за порция и порциите са пресметнати по каталога на програмата. ')
      + L('Режимът е ориентировъчен — при напреднало ХБЗ, диализа, бременност или хранителни разстройства е нужен диетолог.')));
}

export { empty };
