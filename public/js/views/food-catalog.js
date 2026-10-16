/* Каталог на храните (версия 4.15): всички храни на програмата със състава им по USDA FoodData
 * Central — търсене, група, ограничения, „богато на …“ по критериите на ЕС и сортиране по
 * хранително вещество, на 100 г или на обичайна порция. Щракване върху ред показва всичко за храната. */

import { h, mount, select, input } from '../ui/components.js';
import { FOODS, FOOD_CATS, LIQUIDS, RECIPES, servingOf } from '../shared/recipes.js';
import { claimsOf, claimText, RICH_FILTERS } from '../shared/food-claims.js';
import { enFoodName } from '../shared/i18n/en-foods.js';

const dec = (v) => String(v).replace('.', ',');

/* Хранителните вещества: ключ, име, мерна единица, знаци след запетаята. */
export const NUTRIENTS = [
  ['kcal', 'Енергия', 'kcal', 0], ['p', 'Белтък', 'г', 1], ['c', 'Въглехидрати', 'г', 1], ['sug', 'захари', 'г', 1],
  ['f', 'Мазнини', 'г', 1], ['sfa', 'наситени', 'г', 1], ['fib', 'Фибри', 'г', 1], ['na', 'Натрий', 'мг', 0],
  ['k', 'Калий', 'мг', 0], ['ca', 'Калций', 'мг', 0], ['mg', 'Магнезий', 'мг', 0], ['fe', 'Желязо', 'мг', 1],
  ['vc', 'Витамин C', 'мг', 1], ['fol', 'Фолат', 'мкг', 0], ['b12', 'Витамин B12', 'мкг', 1], ['vd', 'Витамин D', 'мкг', 1],
  ['n3', 'Омега-3 EPA+DHA', 'мг', 0], ['ala', 'Омега-3 ALA', 'г', 2],
];
const NUT = Object.fromEntries(NUTRIENTS.map(n => [n[0], n]));

const RESTRICT = {
  any: ['всички храни', () => true],
  vegan: ['веганско', (f) => !['meat', 'fish', 'seafood', 'egg', 'dairy', 'honey'].some(x => f.flags.has(x))],
  vegetarian: ['вегетарианско', (f) => !['meat', 'fish', 'seafood'].some(x => f.flags.has(x))],
  glutenFree: ['без глутен', (f) => !f.flags.has('gluten')],
  lactoseFree: ['без лактоза', (f) => !f.flags.has('lactose')],
  lowK: ['без богатите на калий', (f) => !f.flags.has('highK')],
  noPurine: ['без богатите на пурини', (f) => !f.flags.has('purine')],
};

/* В колко рецепти влиза всяка храна. */
let recipeCount = null;
const recipesWith = (id) => {
  if (!recipeCount) {
    recipeCount = new Map();
    for (const r of RECIPES) for (const food of new Set(r.items.map(([food]) => food))) recipeCount.set(food, (recipeCount.get(food) || 0) + 1);
  }
  return recipeCount.get(id) || 0;
};

const fmt = (v, digits) => (v === null || v === undefined ? '—' : dec(digits ? Math.round(v * 10 ** digits) / 10 ** digits : Math.round(v)));

export function foodCatalog() {
  const ids = Object.keys(FOODS);
  const st = { q: '', cat: '', restrict: 'any', rich: '', sort: 'name', portion: false, open: null };
  const body = h('div');

  const search = input({ type: 'search', placeholder: 'Търсене по име (на български или английски)', 'aria-label': 'Търсене на храна' });
  search.addEventListener('input', () => { st.q = search.value.trim().toLowerCase(); draw(); });
  const catSel = select([{ value: '', label: 'всички групи' }, ...Object.entries(FOOD_CATS).map(([value, label]) => ({ value, label }))], { 'aria-label': 'Група' });
  catSel.addEventListener('change', () => { st.cat = catSel.value; draw(); });
  const restrictSel = select(Object.entries(RESTRICT).map(([value, [label]]) => ({ value, label })), { 'aria-label': 'Ограничение' });
  restrictSel.addEventListener('change', () => { st.restrict = restrictSel.value; draw(); });
  const richSel = select([{ value: '', label: 'всички' }, ...RICH_FILTERS.map(k => ({ value: k, label: claimText(k, 'source').replace('източник на ', '') }))], { 'aria-label': 'Богато на' });
  richSel.addEventListener('change', () => { st.rich = richSel.value; if (st.rich) { st.sort = st.rich === 'protein' ? 'p' : st.rich === 'fiber' ? 'fib' : st.rich; sortSel.value = st.sort; } draw(); });
  const sortSel = select([{ value: 'name', label: 'по име' }, ...NUTRIENTS.map(([value, label]) => ({ value, label: label.charAt(0).toUpperCase() + label.slice(1) }))], { 'aria-label': 'Сортиране' });
  sortSel.addEventListener('change', () => { st.sort = sortSel.value; draw(); });
  const portion = h('input', { type: 'checkbox', 'aria-label': 'На порция' });
  portion.addEventListener('change', () => { st.portion = portion.checked; draw(); });

  const amount = (id, key) => {
    const v = FOODS[id][key];
    if (v === null || v === undefined) return null;
    return st.portion ? (v * servingOf(id)) / 100 : v;
  };

  const detail = (id) => {
    const f = FOODS[id];
    const g = servingOf(id);
    const unit = LIQUIDS.has(id) ? 'мл' : 'г';
    const claims = claimsOf(id);
    const flags = [...f.flags].map(x => FLAG_LABEL[x]).filter(Boolean);
    return h('tr.food-detail', null, h('td', { colSpan: 5 },
      h('div.food-detail-grid', null,
        NUTRIENTS.map(([key, label, u, d]) => h('div', null,
          h('span.dim', null, label.charAt(0).toUpperCase() + label.slice(1)),
          h('strong', null, `${fmt(f[key], d)} ${u}`),
          h('span.tiny.dim', null, f[key] === null || f[key] === undefined ? '' : ` · ${fmt((f[key] * g) / 100, d)} на порция`)))),
      h('div.small', { style: { marginTop: '8px' } },
        `Порция: ${g} ${unit}${f.unit && f.unit.name === 'бр.' ? ` (1 бр. ≈ ${f.unit.grams} г)` : ''}. `,
        recipesWith(id) ? `Влиза в ${recipesWith(id)} рецепти. ` : 'Още не влиза в рецептите — само за справка. ',
        flags.length ? `Отбелязано: ${flags.join(', ')}. ` : ''),
      claims.length ? h('div.food-claims', null, claims.map(c => h('span.chip.claim-' + c.level, null, c.text))) : null,
      h('div.tiny.dim', { style: { marginTop: '6px' } },
        f.fdc
          ? ['Източник: USDA FoodData Central, SR Legacy — ', h('a', { href: `https://fdc.nal.usda.gov/food-details/${f.fdc}/nutrients`, target: '_blank', rel: 'noopener' }, `FDC ID ${f.fdc}`), `. ${enFoodName(id)}.`]
          : 'Съставът зависи от производителя — енергия, белтък, мазнини, въглехидрати, фибри, натрий, калий, желязо и калций са типичните; витамините не са известни.')));
  };

  const draw = () => {
    const restrict = RESTRICT[st.restrict][1];
    let list = ids.filter(id => {
      const f = FOODS[id];
      if (st.cat && f.cat !== st.cat) return false;
      if (!restrict(f)) return false;
      if (st.rich && !claimsOf(id).some(c => c.key === st.rich && (c.level === 'high' || c.level === 'source'))) return false;
      if (st.q && !f.name.toLowerCase().includes(st.q) && !enFoodName(id).toLowerCase().includes(st.q)) return false;
      return true;
    });
    if (st.sort === 'name') list.sort((a, b) => FOODS[a].name.localeCompare(FOODS[b].name, 'bg'));
    else list.sort((a, b) => (amount(b, st.sort) ?? -1) - (amount(a, st.sort) ?? -1));
    const sortCol = st.sort !== 'name' && !['kcal', 'p', 'fib'].includes(st.sort) ? NUT[st.sort] : null;
    const head = ['Храна', 'kcal', 'Белтък г', 'Фибри г', sortCol ? `${sortCol[1].charAt(0).toUpperCase() + sortCol[1].slice(1)} ${sortCol[2]}` : 'Група'];
    mount(body,
      h('div.small.dim', { style: { margin: '6px 0' } },
        `${list.length} от ${ids.length} храни · ${st.portion ? 'на обичайна порция' : 'на 100 г (100 мл за напитките)'}. Щракнете върху храна за целия състав.`),
      list.length ? h('div.table-wrap', null, h('table.food-table', null,
        h('thead', null, h('tr', null, head.map((x, i) => h('th', i ? { class: i === 2 || i === 3 ? 'num opt' : 'num' } : null, x)))),
        h('tbody', null, list.flatMap(id => {
          const f = FOODS[id];
          const claims = claimsOf(id).filter(c => c.level === 'high');
          const row = h('tr.clickable' + (st.open === id ? '.selected' : ''), { onclick: () => { st.open = st.open === id ? null : id; draw(); } },
            h('td', null, h('strong', null, f.name),
              h('div.tiny.dim', null, FOOD_CATS[f.cat] + (st.portion ? ` · ${servingOf(id)} ${LIQUIDS.has(id) ? 'мл' : 'г'}` : '')),
              claims.length ? h('div.food-claims', null, claims.slice(0, 4).map(c => h('span.chip.claim-high', null, c.text))) : null),
            h('td.num', null, fmt(amount(id, 'kcal'), 0)),
            h('td.num.opt', null, fmt(amount(id, 'p'), 1)),
            h('td.num.opt', null, fmt(amount(id, 'fib'), 1)),
            h('td.num', null, sortCol ? fmt(amount(id, sortCol[0]), sortCol[3]) : FOOD_CATS[f.cat].split(' ')[0]));
          return st.open === id ? [row, detail(id)] : [row];
        })))) : h('div.empty', null, 'Няма храна с тези условия.'));
  };

  draw();
  return h('div.food-catalog', null,
    h('div.food-filters', null,
      h('label.grow', null, h('span', null, 'Търсене'), search),
      h('label', null, h('span', null, 'Група'), catSel),
      h('label', null, h('span', null, 'Хранене'), restrictSel),
      h('label', null, h('span', null, 'Богато на'), richSel),
      h('label', null, h('span', null, 'Подреждане'), sortSel),
      h('label.check', null, portion, h('span', null, 'на порция'))),
    body,
    h('p.tiny.dim', null,
      'Съставът е по USDA FoodData Central (SR Legacy, обществено достояние) за 100 г продукт в състоянието от името — сварен, печен или суров. ',
      'Фолатът е от самата храна, без добавена фолиева киселина; витамините, които в САЩ се добавят към млякото и зърнените закуски, не са включени. ',
      '„Богато на“ и „източник на“ — по критериите на ЕС за хранителни претенции (Регламент 1924/2006; референтни стойности по Регламент 1169/2011, приложение XIII), за ориентация, а не като етикет на продукт.'));
}

const FLAG_LABEL = {
  gluten: 'глутен', lactose: 'лактоза', dairy: 'млечно', meat: 'месо', redmeat: 'червено месо', pork: 'свинско', fish: 'риба',
  seafood: 'морски дарове', egg: 'яйце', nuts: 'ядки', seeds: 'семена', legume: 'бобово', soy: 'соя', highK: 'много калий',
  purine: 'много пурини', salt: 'солено', sweet: 'сладко', liver: 'черен дроб — не при бременност', grapefruit: 'взаимодействия с лекарства',
  highgi: 'висок гликемичен индекс',
};
