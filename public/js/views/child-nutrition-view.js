/* Раздел „Хранене“ в досието на дете от 1 до 17 години (версия 4.16): режим по възрастта —
 * енергия и хранителни вещества по EFSA, ИТМ за възрастта по СЗО, меню с рецепти и пазаруване,
 * движение, сън и екрани по СЗО и AASM, PDF за родителя. До 1 година — „Хранене до 1 година“. */

import { api } from '../api.js';
import { card, decimalFields, field, h, mount, numberInput, select, toast } from '../ui/components.js';
import { ageInMonthsExact, daysBetween, formatDate, today } from '../shared/dates.js';
import { PREFERENCES, allergyPreferences } from '../shared/nutrition.js';
import { CHILD_ACTIVITY, childActivityOptions, childBmi, defaultChildActivity, percentileText } from '../shared/child-nutrition.js';
import { CHILD_SPORTS, sportsFor } from '../shared/child-activity.js';
import { growthAge } from '../shared/growth.js';
import { dossierDiagnoses } from '../shared/diet-icd.js';
import { diagnosesEditor, dislikesEditor, planView, savedPlans } from './nutrition-view.js';
import { deleteWithConfirm } from './adult-dialogs.js';
import { downloadNutritionPdf } from './pdf-export.js';

const dec = (v) => String(v ?? '').replace('.', ',');

/* Последният изготвен режим и изборът във формата остават при превключване между разделите. */
const drafts = new Map();

/** Последното измерване на показателя: { date, value } или null. */
function latest(p, key) {
  const m = (p.measurements || []).filter(x => x[key] > 0).sort((a, b) => (a.date < b.date ? -1 : 1)).pop();
  return m ? { date: m.date, value: m[key] } : null;
}

export function childNutritionTab(ctx) {
  const { p, reload } = ctx;
  const ageMonths = ageInMonthsExact(p.birthDate, today());
  const draft = drafts.get(p.id);
  const saved = [...(p.nutritionPlans || [])].sort((x, y) => (x.date < y.date ? 1 : -1));
  const preview = h('div');
  let variant = draft?.variant || 0;
  let swaps = draft?.swaps || {};
  const w0 = latest(p, 'weight');
  const h0 = latest(p, 'height');

  const show = (plan) => mount(preview, planView(plan, {
    onVariant: () => { variant++; swaps = {}; form.generate(); },
    onSwap: (key) => { swaps = { ...swaps, [key]: (swaps[key] || 0) + 1 }; form.generate(); },
    onSave: () => form.generate(true),
    saveLabel: 'Запази в досието',
    onPdf: () => downloadNutritionPdf(p, plan),
    onPdfEn: () => downloadNutritionPdf(p, plan, { lang: 'en' }),
    onPdfShopping: () => downloadNutritionPdf(p, plan, { only: 'shopping' }),
  }));
  const form = childPlanForm({
    ageMonths, sex: p.sex, gestWeeks: p.birth?.gestWeeks ?? null,
    weight: w0, height: h0, last: draft?.form || {}, prev: saved[0]?.plan.input || {},
    breastfedDefault: p.feeding?.type === 'breast',
    allergies: p.allergies || [], diagnoses: dossierDiagnoses(p),
    diagnosesHint: 'Попълнени са от досието. Ограниченията (без глутен, без лактоза) се прилагат; съветите за възрастни не се показват.',
    onSubmit: () => { variant = 0; swaps = {}; },
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
  });
  if (draft) show(draft.plan);

  return h('div.stack', null,
    card(`Хранене и движение · ${Math.floor(ageMonths / 12)} г.`, { icon: '🥗' }, form.el),
    preview,
    savedPlans(saved, {
      show,
      pdf: (n) => downloadNutritionPdf(p, n.plan),
      pdfEn: (n) => downloadNutritionPdf(p, n.plan, { lang: 'en' }),
      remove: (n) => deleteWithConfirm('Запазеният режим ще бъде изтрит.', () => api.deleteNutrition(p.id, n.id), reload),
    }));
}

/**
 * Формата за режим на дете — обща за досието и за човек извън листата (nutrition-page.js).
 * cfg: ageMonths, sex, gestWeeks, weight/height ({ date, value } — последното измерване), last (изборът
 * при последното изготвяне), prev (входът на последния запазен режим), breastfedDefault, allergies,
 * diagnoses, diagnosesHint, top (полета отгоре), onGenerate(body, save), onSubmit.
 * Връща { el, read, generate }.
 */
export function childPlanForm(cfg) {
  const { ageMonths, sex } = cfg;
  const years = ageMonths / 12;
  const last = cfg.last || {};
  const prev = cfg.prev || {};
  const w0 = cfg.weight || null;
  const h0 = cfg.height || null;

  // Тегло и ръст — от последните измервания; при малко дете теглото остарява бързо.
  const stale = w0?.date && daysBetween(w0.date, today()) > (years < 2 ? 31 : 92);
  const weight = numberInput({ name: 'weight', min: 6, max: 200, value: last.weight ?? (w0 ? dec(w0.value) : '') });
  const height = numberInput({ name: 'height', min: 60, max: 220, value: last.height ?? (h0 ? dec(h0.value) : '') });
  const bmiHint = h('div.field-hint');
  const refreshBmi = () => {
    const w = Number(String(weight.value).replace(',', '.'));
    const hh = Number(String(height.value).replace(',', '.'));
    if (!(w > 0 && hh > 0) || !sex) { bmiHint.textContent = ''; return; }
    const b = childBmi(sex, growthAge(ageMonths, cfg.gestWeeks ?? null).months, w, hh);
    bmiHint.textContent = `ИТМ ${dec(b.value)} — ${b.percentile !== null ? `${percentileText(b.percentile)} перцентил, ` : ''}${b.label} (СЗО)`;
    bmiHint.className = 'field-hint' + (b.status === 'normal' ? '' : ' warn-text');
  };
  weight.addEventListener('input', refreshBmi);
  height.addEventListener('input', refreshBmi);

  const options = childActivityOptions(years);
  const activity = select(options.map(k => ({
    value: k, label: `${CHILD_ACTIVITY[k].label} (PAL ${dec(CHILD_ACTIVITY[k].pal)})`,
    selected: (last.childActivity || prev.childActivity || defaultChildActivity(years)) === k,
  })), { name: 'childActivity' });
  if (options.length < 2) activity.disabled = true;

  // Спорт и занимания — до 3; седмицата с движение ги разпределя по дни.
  const sportIds = years >= 3 ? sportsFor(years) : [];
  const chosen = new Set(last.sports || prev.sports || []);
  const sportBoxes = sportIds.map(k => h('label.opt', null,
    h('input', { type: 'checkbox', name: 'sport', value: k, checked: chosen.has(k) }), h('span', null, `${CHILD_SPORTS[k].icon} ${CHILD_SPORTS[k].label}`)));
  for (const l of sportBoxes) {
    const box = l.querySelector('input');
    box.addEventListener('change', () => {
      if (box.checked && sportBoxes.filter(x => x.querySelector('input').checked).length > 3) {
        box.checked = false;
        toast('Изберете до 3 спорта или занимания.', 'error');
      }
    });
  }
  const breastfed = h('input', { type: 'checkbox', name: 'breastfed', checked: last.breastfed ?? prev.breastfed ?? !!cfg.breastfedDefault });

  const meals = select([3, 4, 5].map(n => ({ value: n, label: `${n} хранения`, selected: Number(last.mealsPerDay || prev.mealsPerDay || 5) === n })), { name: 'mealsPerDay' });
  const days = select([
    { value: 1, label: '1 ден, по 2 варианта', selected: Number(last.days || 1) === 1 },
    { value: 7, label: 'седмица с пазаруване', selected: Number(last.days || 1) === 7 },
    { value: 28, label: 'месец (4 седмици), пазаруване по седмици', selected: Number(last.days || 1) === 28 },
  ], { name: 'days' });
  const lang = select([
    { value: 'bg', label: 'български', selected: (last.lang || 'bg') === 'bg' },
    { value: 'en', label: 'английски (English)', selected: last.lang === 'en' },
  ], { name: 'lang' });

  const allergy = allergyPreferences(cfg.allergies || []);
  const prefChosen = new Set(last.preferences || [...(prev.preferences || []).filter(x => PREFERENCES[x]), ...allergy.prefs]);
  const prefBoxes = Object.entries(PREFERENCES).map(([k, label]) => h('label.opt', null,
    h('input', { type: 'checkbox', name: 'pref', value: k, checked: prefChosen.has(k) }), h('span', null, label)));
  const dx = diagnosesEditor(last.diagnoses || cfg.diagnoses || []);
  const dislikes = dislikesEditor(last.dislikes || prev.dislikes || []);

  let el;
  const read = () => {
    const fd = new FormData(el);
    const d = decimalFields(Object.fromEntries(fd), ['weight', 'height']);
    return {
      weight: d.weight, height: d.height, childActivity: activity.value,
      sports: sportBoxes.map(l => l.querySelector('input')).filter(i => i.checked).map(i => i.value),
      breastfed: years < 3 && breastfed.checked,
      mealsPerDay: Number(d.mealsPerDay), days: Number(d.days), lang: d.lang || 'bg',
      preferences: fd.getAll('pref'), dislikes: dislikes.value(), diagnoses: dx.value(),
    };
  };
  const generate = (save = false) => cfg.onGenerate(read(), save);

  el = h('form.stack', { onsubmit: (e) => { e.preventDefault(); cfg.onSubmit?.(); generate(); } },
    cfg.top || null,
    stale ? h('div.alert-strip.warn', null, `Последното тегло е от ${formatDate(w0.date)} — претеглете и измерете детето за по-точен режим (раздел „Растеж“).`) : null,
    h('div.form-grid', null,
      h('div', null, field('Тегло (кг)', weight, w0?.date ? `последно ${formatDate(w0.date)}` : w0 ? '' : 'няма измерване')),
      h('div', null, field('Ръст (см)', height, bmiHint)),
      h('div', null, field('Физическа активност', activity, years < 4 ? 'До 3 г. EFSA приема PAL 1,4 за всички деца.' : 'По EFSA 2013; при спорт всеки ден — „активно“ или повече.'))),
    sportBoxes.length ? h('div.nut-section', null,
      h('div.nut-sec-title', null, 'Спорт и занимания'),
      h('div.q-opts', null, sportBoxes),
      h('div.field-hint', null, 'До 3 — седмицата с движение ги разпределя по дни; в останалите дни — игри навън и активен път до училище.')) : null,
    years < 3 ? h('div.q-opts', null, h('label.opt', null, breastfed, h('span', null, 'кърменето продължава'))) : null,
    h('div.nut-section', null,
      h('div.nut-sec-title', null, 'Заболявания по МКБ-10'),
      dx.el,
      cfg.diagnosesHint ? h('div.field-hint', null, cfg.diagnosesHint) : null),
    h('div.nut-section', null,
      h('div.nut-sec-title', null, 'Хранене'),
      h('div.form-grid', null,
        h('div', null, field('Хранения на ден', meals, '3 основни и 1–2 закуски — обичайното за деца')),
        h('div', null, field('Меню', days)),
        h('div', null, field('Език на режима', lang, 'Менюто, рецептите, съветите и PDF за родителя.'))),
      h('div.nut-sec-sub', null, 'Ограничения и предпочитания'),
      h('div.q-opts', null, prefBoxes),
      allergy.matched.length ? h('div.field-hint', null, `Отбелязани са според алергиите: ${allergy.matched.join(', ')}.`) : null,
      h('div.nut-sec-sub', null, 'Не яде'),
      dislikes.el),
    h('div', null, h('button.btn.primary', { type: 'submit' }, '🍽 Изготви режим'),
      h('span.small.muted', { style: { marginLeft: '10px' } },
        years < 4 ? 'До 4 г. — без цели ядки и пуканки; до 2 г. — пълномаслено мляко и без добавена захар.' : 'Енергията е за растежа по кривата на детето — без диети.')));
  refreshBmi();
  return { el, read, generate };
}
