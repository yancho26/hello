/* МКБ-10 → хронично заболяване в програмата.
 *
 * Изтеглените списъци обикновено носят диспансерните диагнози като кодове
 * („I10; E11.9“), понякога с текст, понякога с кирилски букви на мястото на
 * латинските („Е11“). Тук кодовете се разпознават и се свързват със
 * заболяванията, за които програмата води проследяване. */

/* Кирилските букви, които изглеждат като латински и се пишат вместо тях в кодовете. */
const LOOKALIKE = { А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X', У: 'Y' };

/** Кодът с латински букви и без интервал: „е 11.9“ → „E11.9“. */
export function normIcd(code) {
  const s = String(code || '').toUpperCase().replace(/\s+/g, '');
  return s.replace(/^[А-Я]/, ch => LOOKALIKE[ch] || ch);
}

/* [шаблон на кода, заболяване]. Първото съвпадение печели. */
const ICD_MAP = [
  [/^I1[0-5]/, 'htn'],
  [/^E11|^E1[34]/, 'dm2'],
  [/^E10/, 'dm1'],
  [/^R73/, 'prediabetes'],
  [/^E78/, 'dyslip'],
  [/^I2[0-5]/, 'chd'],
  [/^I70\.2|^I73\.9|^I74\.[34]/, 'pad'],
  [/^I6[34]|^I69\.[34]|^G45/, 'stroke'],
  [/^I50/, 'hf'],
  [/^I48/, 'af'],
  [/^N18/, 'ckd'],
  [/^J44/, 'copd'],
  [/^J45/, 'asthma'],
  [/^E0[23]|^E89\.0/, 'hypothyroid'],
  [/^E66/, 'obesity'],
  [/^M1A|^M10/, 'gout'],
  [/^M8[01]/, 'osteoporosis'],
  [/^F3[23]/, 'depression'],
  [/^F41/, 'anxiety'],
  [/^F0[0-3]|^G30/, 'dementia'],
  [/^K76\.0|^K75\.8/, 'masld'],
  [/^D50/, 'anemia'],
];

export function conditionForIcd(code) {
  const c = normIcd(code);
  for (const [re, cond] of ICD_MAP) if (re.test(c)) return cond;
  return null;
}

/* Думи в текста на диагнозата, когато няма код. Внимателно — само ясните. */
const KEYWORDS = [
  [/хипертони|хипертензи/, 'htn'],
  [/диабет\s*(тип\s*)?(1|i\b|първи)/, 'dm1'],
  [/диабет/, 'dm2'],
  [/предиабет|нарушен(а)? (глюкозен )?толеранс|гликемия на гладно/, 'prediabetes'],
  [/дислипидеми|хиперлипидеми|хиперхолестеролеми/, 'dyslip'],
  [/исхемична болест|стенокардия|миокарден инфаркт|(^|\s)ибс($|\s)/, 'chd'],
  [/предсърдно мъждене|предсърдно трептене|фибрилаци/, 'af'],
  [/сърдечна недостатъчност/, 'hf'],
  [/мозъчен инфаркт|исхемичен инсулт|(^|\s)инсулт|преходна исхемична атака/, 'stroke'],
  [/хронично бъбречно|бъбречна недостатъчност|(^|\s)(хбз|хбн)($|\s)/, 'ckd'],
  [/хобб|хронична обструктивна/, 'copd'],
  [/астма/, 'asthma'],
  [/хипотиреоидизъм|хипотиреоза/, 'hypothyroid'],
  [/затлъстяване/, 'obesity'],
  [/подагра/, 'gout'],
  [/остеопороза/, 'osteoporosis'],
  [/депреси/, 'depression'],
  [/тревожно разстройство|генерализирана тревожност/, 'anxiety'],
  [/деменци|алцхаймер/, 'dementia'],
  [/стеатоза|mafld|masld|nafld/, 'masld'],
  [/желязодефицитна анемия/, 'anemia'],
];

// Кодът е буква + 2 цифри (+ .цифри). Не \b: той не разпознава кирилицата.
const CODE_RE = /(^|[^A-Za-zА-Яа-я0-9])([A-ZАВСЕНКМОРТХУ]\s?\d{2}(?:\.\d{1,2})?)(?![0-9])/g;

/**
 * Разбира текста на колоната с диагнози.
 * @returns {{ conditions: string[], other: string[] }}
 *   conditions — кодовете на заболяванията в програмата;
 *   other — диагнозите, за които програмата няма проследяване (като текст).
 */
export function parseDiagnoses(text) {
  const src = String(text || '').trim();
  const conditions = new Set();
  const other = [];
  if (!src || /^(няма|не|-|—|0)$/i.test(src)) return { conditions: [], other: [] };

  const upper = src.toUpperCase();
  const hits = [...upper.matchAll(CODE_RE)].map(m => ({ index: m.index + m[1].length, code: m[2] }))
    // Буквата U не се използва в МКБ-10.
    .filter(h => normIcd(h.code)[0] !== 'U');

  if (hits.length) {
    for (let i = 0; i < hits.length; i++) {
      const seg = src.slice(hits[i].index, i + 1 < hits.length ? hits[i + 1].index : undefined)
        .replace(/[;,|/\s]+$/, '').trim();
      const cond = conditionForIcd(hits[i].code) || keywordCondition(seg);
      if (cond) conditions.add(cond);
      else other.push(tidy(seg.replace(hits[i].code, normIcd(hits[i].code))));
    }
    const before = src.slice(0, hits[0].index).replace(/[;,|\s]+$/, '').trim();
    if (before) splitText(before, conditions, other);
  } else {
    splitText(src, conditions, other);
  }
  return { conditions: [...conditions], other: [...new Set(other)].filter(Boolean) };
}

function splitText(text, conditions, other) {
  for (const part of text.split(/[;\n|]+/).map(tidy).filter(Boolean)) {
    const cond = keywordCondition(part);
    if (cond) conditions.add(cond);
    else other.push(part);
  }
}

function keywordCondition(text) {
  const t = String(text).toLowerCase();
  for (const [re, cond] of KEYWORDS) if (re.test(t)) return cond;
  return null;
}

const tidy = (s) => String(s).replace(/\s+/g, ' ').replace(/^[\s,;.-]+|[\s,;]+$/g, '').trim().slice(0, 120);
