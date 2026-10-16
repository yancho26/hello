/* Хранителният режим на английски (версия 4.11).
 *
 * Режимът се изчислява на български (nutrition.js) и после се превежда:
 *   • ястията — от английските рецепти (en-recipes.js) с количествата на порцията;
 *   • храните, групите за пазаруване и подправките — от en-foods.js;
 *   • диагнозите — по кода по МКБ-10 (en-dx.js);
 *   • всеки друг текст — по речника en-text.js: точен текст или шаблон с {0}, {1} …
 *     (стойностите в шаблона също се превеждат; десетичната запетая става точка).
 * Каквото няма в речника, остава както е (напр. свободен текст от досието). */

import { FOODS, YIELDS } from '../recipes.js';
import { renderMethod } from '../recipe-method.js';
import { EN_CATS, EN_FLAVOR, enBaseName, enFoodName } from './en-foods.js';
import { MICRO_EN, microNoteText } from '../nutrition.js';
import { EN_RECIPES } from './en-recipes.js';
import { EN_DX } from './en-dx.js';
import { EN_TEXT } from './en-text.js';

const CYR = /[А-Яа-яЁё]/;
export const hasCyrillic = (s) => CYR.test(String(s));

/* ----------------------------------- речник ----------------------------------- */

const EXACT = new Map();
const PATTERNS = [];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [bg, en] of Object.entries(EN_TEXT)) {
  if (!/\{\d\}/.test(bg)) { EXACT.set(bg, en); continue; }
  const parts = bg.split(/\{(\d)\}/);
  const order = [];
  let src = '^';
  parts.forEach((p, i) => {
    if (i % 2) { order.push(Number(p)); src += '([\\s\\S]*?)'; } else src += escapeRe(p);
  });
  // Най-дългата постоянна част — за бърза проверка преди регулярния израз.
  const anchor = parts.filter((_, i) => i % 2 === 0).sort((a, b) => b.length - a.length)[0];
  PATTERNS.push({ re: new RegExp(`${src}$`), en, order, anchor, size: anchor.length });
}
PATTERNS.sort((a, b) => b.size - a.size);

const DATE_BG = /(\d{2}\.\d{2}\.\d{4}) г\./g;
/** Кавичките: „…“ → “…”. */
const quotes = (s) => s.replace(/„([^„“]*)“/g, '“$1”');
const decimals = (s) => s.replace(/(\d),(\d)/g, '$1.$2');

/** Превод на един текст; непознатото остава както е. */
export function tr(s) {
  if (typeof s !== 'string') return s;
  if (!CYR.test(s)) return quotes(decimals(s));
  // Датите: „15.10.2026 г.“ → „15.10.2026“.
  s = s.replace(DATE_BG, '$1');
  if (!CYR.test(s)) return quotes(decimals(s));
  const hit = EXACT.get(s);
  if (hit !== undefined) return hit;
  // С главна буква в началото на изречение: „Бягане“ → „Running“.
  const low = EXACT.get(s.charAt(0).toLowerCase() + s.slice(1));
  if (low !== undefined) return low.charAt(0).toUpperCase() + low.slice(1);
  for (const p of PATTERNS) {
    if (!s.includes(p.anchor)) continue;
    const m = p.re.exec(s);
    if (!m) continue;
    const vals = [];
    p.order.forEach((n, i) => { vals[n] = value(m[i + 1]); });
    return p.en.replace(/\{(\d)\}/g, (_, n) => vals[Number(n)] ?? '');
  }
  // Изброяване от текстове от речника: „ядки, риба“, „клек до стол; планк 20–40 с“.
  for (const sep of ['; ', ', ']) {
    if (!s.includes(sep)) continue;
    const parts = s.split(sep).map(x => (CYR.test(x) ? tr(x) : x));
    if (!parts.some(x => CYR.test(x))) return parts.join(sep);
  }
  return s;
}
const value = (v) => (CYR.test(v) ? tr(v) : decimals(v));

/* Текстовете около режима в екрана и в PDF — на езика на режима, докато се изгражда. */
let uiEn = false;
/** Надпис в интерфейса: на английски, докато се показва английски режим. */
export const ui = (s) => (uiEn ? tr(s) : s);
/** Изпълнява fn с езика на режима за ui(). */
export function withPlanLang(plan, fn) {
  const prev = uiEn;
  uiEn = plan?.lang === 'en';
  try { return fn(); } finally { uiEn = prev; }
}

/* ------------------------------------ ястия ------------------------------------ */

const PCS = (n) => (n === 1 ? 'pc' : 'pcs');
/** Количеството от българския текст: „2 бр. (≈120 г)“, „45 г (130 г сухо тегло)“. */
export function quantityEn(q) {
  return decimals(String(q))
    .replace(/(\d+) бр\./g, (_, n) => `${n} ${PCS(Number(n))}`)
    .replace(/ с\.л\./g, ' tbsp')
    .replace(/(\d) кг(?=[\s),]|$)/g, '$1 kg')
    .replace(/(\d) мл(?=[\s),]|$)/g, '$1 ml')
    .replace(/(\d) л(?=[\s),]|$)/g, '$1 l')
    .replace(/(\d) г(?=[\s),]|$)/g, '$1 g')
    .replace(/сухо тегло/g, 'dry weight')
    .replace(/сурово тегло/g, 'raw weight');
}

/* Имената на ястията следват замените — както RENAME в nutrition.js. */
const PLANT_YOGURT = [[/(?:strained \(Greek\) |strained |Greek )?yogurt|kefir/gi, 'plant-based yogurt']];
const TOFU = [[/with (?:white |feta |cottage )?cheese/gi, 'with tofu'], [/(?:white brined |cottage |white |feta )?cheese|feta/gi, 'tofu']];
const PASTA = /\b(?:whole-wheat |whole-grain )?(?:pasta|spaghetti|penne|farfalle|rotini|fusilli|macaroni|noodles|lasagna sheets)\b/gi;
const EN_RENAME = {
  'oats>buckwheat': [[/\bOatmeal\b/g, 'Buckwheat porridge'], [/\boatmeal\b/g, 'buckwheat porridge'], [/\b(?:rolled )?oats?\b/gi, 'buckwheat']],
  'bulgur>buckwheat': [[/bulgur/gi, 'buckwheat']],
  'couscous>quinoa': [[/couscous/gi, 'quinoa']],
  'pasta>rice': [[PASTA, 'brown rice']],
  'bread>gfbread': [[/(?:whole-wheat|whole-grain|wholegrain) (?:bread|toast)/gi, 'gluten-free bread']],
  'ryebread>gfbread': [[/rye bread/gi, 'gluten-free bread']],
  'pita>gfbread': [[/(?:whole-wheat )?pita/gi, 'gluten-free bread']],
  'milk>oatmilk': [[/(?<!coconut |evaporated |oat |almond )\bmilk\b/g, 'oat drink']],
  'lfmilk>oatmilk': [[/(?:lactose-free )?(?<!coconut |evaporated |oat )\bmilk\b/g, 'oat drink']],
  'kefir>lfyogurt': [[/kefir/gi, 'lactose-free yogurt']],
  'yogurt>soyyogurt': PLANT_YOGURT, 'lfyogurt>soyyogurt': PLANT_YOGURT, 'greekyogurt>soyyogurt': PLANT_YOGURT, 'kefir>soyyogurt': PLANT_YOGURT,
  'cottage>tofu': TOFU, 'whitecheese>tofu': TOFU,
};

function optionEn(o) {
  if (!o) return o;
  const rec = EN_RECIPES[o.key];
  let name = rec ? rec[0] : tr(o.name);
  for (const [from, to] of o.swaps || []) {
    for (const [re, rep] of EN_RENAME[`${from}>${to}`] || []) name = name.replace(re, rep);
  }
  name = name.replace(/plant-based (?:plant-based )+/g, 'plant-based ');
  const items = o.items.map(it => {
    const at = it.text.indexOf(' — ');
    const q = at >= 0 ? it.text.slice(at + 3) : '';
    return { ...it, text: `${it.extra ? '+ ' : ''}${enFoodName(it.food)}${q ? ` — ${quantityEn(q)}` : ''}` };
  });
  const method = rec ? renderMethod(rec[1], o.items, { swaps: o.swaps, lang: 'en', name: enBaseName }) : tr(o.method);
  return {
    ...o, name: name.charAt(0).toUpperCase() + name.slice(1), items, method,
    flavor: (o.flavor || []).map(f => EN_FLAVOR[f] || tr(f)),
  };
}

const shopNameEn = (food) => (YIELDS[food] ? enBaseName(food) : enFoodName(food));

function shoppingEn(s) {
  if (!s) return s;
  return {
    ...s,
    groups: s.groups.map(g => ({
      ...g, label: EN_CATS[g.cat] || tr(g.label),
      items: g.items.map(it => ({ ...it, name: shopNameEn(it.food), amount: quantityEn(it.amount) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'en')),
    })),
    spices: [...new Set((s.spices || []).map(x => EN_FLAVOR[x] || tr(x)))].sort((a, b) => a.localeCompare(b, 'en')),
  };
}

/* ---------------------------------- диагнози ---------------------------------- */

/** Английското име по кода (по най-дългото съвпадение) — иначе кодът. */
export function dxNameEn(code, name = '') {
  const c = String(code || '').toUpperCase();
  for (let n = c.length; n >= 3; n--) if (EN_DX[c.slice(0, n)]) return EN_DX[c.slice(0, n)];
  return name && !CYR.test(name) ? name : `ICD-10 ${c}`;
}

/* ---------------------------------- целият режим ---------------------------------- */

/** Всички текстове в обект — по речника. */
export function deepTr(x) {
  if (typeof x === 'string') return tr(x);
  if (Array.isArray(x)) return x.map(deepTr);
  if (x && typeof x === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(x)) out[k] = deepTr(v);
    return out;
  }
  return x;
}

/** Режимът на английски. Входът не се променя. */
export function translatePlan(plan) {
  const dx = (d) => ({ ...deepTr(d), code: d.code, name: dxNameEn(d.code, d.name) });
  const out = deepTr({
    ...plan, meals: null, week: null, shopping: null, shoppingWeeks: null, diagnoses: null, input: null, medNotes: null,
  });
  out.lang = 'en';
  out.input = { ...deepTr(plan.input), lang: 'en', diagnoses: (plan.input?.diagnoses || []).map(d => ({ code: d.code, name: dxNameEn(d.code, d.name) })) };
  out.diagnoses = (plan.diagnoses || []).map(dx);
  out.medNotes = (plan.medNotes || []).map(n => ({ ...n, med: n.drug ? n.drug.charAt(0).toUpperCase() + n.drug.slice(1) : n.med, text: tr(n.text) }));
  out.meals = (plan.meals || []).map(m => ({ ...deepTr({ ...m, options: null }), options: m.options.map(optionEn) }));
  out.week = plan.week ? plan.week.map(d => ({
    ...deepTr({ ...d, meals: null }),
    meals: d.meals.map(m => ({ ...deepTr({ ...m, option: null }), option: optionEn(m.option) })),
  })) : null;
  out.shopping = shoppingEn(plan.shopping);
  out.shoppingWeeks = plan.shoppingWeeks ? plan.shoppingWeeks.map(shoppingEn) : null;
  // Витамините и минералите (версия 4.15): имената и подсказките се изграждат наново на английски.
  if (plan.micro) {
    const rows = plan.micro.rows.map(r => ({ ...r, label: MICRO_EN[r.key][0], unit: MICRO_EN[r.key][1] }));
    out.micro = {
      ...plan.micro, rows,
      notes: plan.micro.notes.map(n => ({ ...n, text: microNoteText(n, plan.micro.rows, { lang: 'en', name: enBaseName }) })),
    };
  }
  return out;
}
