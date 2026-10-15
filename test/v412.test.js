/* Версия 4.12: захранването по най-новите препоръки на педиатричните дружества в Европа и САЩ. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOOD_GROUPS, feedingFlags, foodsFor, infantFeedingPlan } from '../public/js/shared/infant-feeding.js';
import { GUIDELINES } from '../public/js/shared/guidelines.js';

const base = { sex: 'f', birthDate: '2026-04-10', asOf: '2026-10-15', birth: { weight: 3.3, height: 50, gestWeeks: 39 }, measurements: [] };
const plan = (extra = {}) => infantFeedingPlan({ ...base, feeding: 'formula', solidsStart: 6, ...extra });
const at = (foods, id) => foods.find(f => f.id === id);

test('храни: алергенните с началото на захранването, всички групи за 2–3 месеца', () => {
  for (const start of [4, 5, 6]) {
    const foods = foodsFor(start);
    // EAACI 2020, ESPGHAN 2024, AAAAI/ACAAI/CSACI 2021: яйце и фъстъци — с първите храни.
    for (const id of ['egg', 'peanut', 'gluten', 'meat', 'veg', 'cereal']) assert.equal(at(foods, id).from, start, `${start}: ${id}`);
    // Млечните и водата — от 6 месеца (ESPGHAN 2024, AAP).
    assert.equal(at(foods, 'dairy').from, Math.max(6, start));
    assert.equal(at(foods, 'water').from, 6);
    // Всичко без храната на бучки е въведено до 3 месеца след началото.
    for (const f of foods.filter(x => x.id !== 'finger')) assert.ok(f.from <= start + 2 && f.from >= start, `${start}: ${f.id}`);
    assert.equal(at(foods, 'finger').from, 8);
    assert.ok(foods.every(f => f.to >= f.from && f.to <= 11));
  }
  assert.ok(FOOD_GROUPS.some(f => f.id === 'peanut' && f.allergen));
  assert.ok(!FOOD_GROUPS.some(f => f.id === 'yolk'), 'цяло яйце, а не само жълтък');
  assert.match(at(FOOD_GROUPS, 'egg').label, /добре сварено/);
  assert.match(at(FOOD_GROUPS, 'peanut').label, /никога цели/);
});

test('правила: по ESPGHAN 2024, EAACI 2020, AAP, NIAID 2017 и DGA 2025–2030', () => {
  const rules = plan().rules;
  const text = rules.map(r => `${r.text} (${r.src})`).join('\n');
  assert.ok(rules.every(r => r.text && r.src));
  assert.match(text, /между 4 и 12 месеца\. Количеството .* не променят риска от цьолиакия.*ESPGHAN 2024/);
  assert.doesNotMatch(text, /малки количества/, 'ESPGHAN 2024: за количеството глутен няма препоръка');
  assert.doesNotMatch(text, /10–15 дни/);
  assert.match(text, /през 3–5 дни/);
  assert.match(text, /120–240 мл вода/);
  assert.match(text, /Без сокове до 12 месеца/);
  assert.match(text, /6–7 г фъстъчен белтък седмично/);
  assert.match(text, /до около 500 мл на ден/);
  assert.match(text, /не само ориз/);
  assert.match(text, /Веганско хранене .*B12/);
  // Всеки източник на правило е в регистъра на насоките.
  const shorts = new Set(Object.values(GUIDELINES).map(g => g.short));
  for (const src of new Set(rules.flatMap(r => r.src.split(', ')))) {
    if (['EMA'].includes(src)) continue;
    assert.ok(shorts.has(src) || shorts.has(src.replace(/ цьолиакия$/, '')), `няма в регистъра: ${src}`);
  }
  for (const id of ['espghan_who_2024', 'espghan_cd_2024', 'espghan_vegan_2025', 'eaaci_fa_2020', 'aap_bf_2022', 'aap_atopy_2019', 'aaaai_fa_2021', 'niaid_peanut_2017', 'dga_2025']) {
    assert.equal(GUIDELINES[id]?.since, '4.12.0', id);
    assert.match(GUIDELINES[id].url, /^https:\/\//);
  }
});

test('примерните дни: без „без глутен“, без жълтък, с яйце и фъстъци; 3–5 дни между новите храни', () => {
  for (const start of [4, 5, 6]) {
    for (const feeding of ['breast', 'formula', 'mixed']) {
      const p = plan({ solidsStart: start, feeding });
      const all = p.months.flatMap(m => [m.day.orientation, ...m.day.items.map(i => i.what)]).join('\n');
      assert.doesNotMatch(all, /без глутен|жълтък|10–15 дни|Преходно мляко/, `${start} ${feeding}`);
      assert.match(all, /добре сварено яйце/);
      assert.match(all, /фъстъчено масло/);
      // Броят на храненията в примерния ден не се променя.
      for (const m of p.months) assert.equal(m.day.items.length, m.feeds + (m.snacks ? 1 : 0));
    }
  }
});

test('сигнал: при риск от алергия — фъстъците от 4–6 месеца; кърменето — докато майката и детето желаят', () => {
  const young = (extra) => infantFeedingPlan({ ...base, birthDate: '2026-05-20', feeding: 'breast', solidsStart: 6, ...extra });
  assert.ok(feedingFlags(young({ allergyRisk: true })).some(f => /фъстъците още от 4–6 месеца/.test(f.text)));
  assert.ok(!feedingFlags(young({})).some(f => /фъстъците/.test(f.text)));
  const p = plan({ feeding: 'breast' });
  assert.match(p.months[8].breast, /докато майката и детето желаят \(AAP 2022, ESPGHAN 2024\)/);
});
