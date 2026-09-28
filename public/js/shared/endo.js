/* Модул „Ендокринология“ — изчисления за специалиста.
 *
 *   • диабет: контрол спрямо индивидуалната цел, отчет от сензор (CGM) по
 *     международния консенсус за времето в диапазон (Battelino 2019),
 *     самоконтрол, инсулинов режим (обща дневна доза, въглехидратен
 *     коефициент, корекционен фактор, титриране на базалния инсулин по ADA),
 *     риск за стъпалото по IWGDF 2023 и лечение със защита на органите;
 *   • щитовидна жлеза: тълкуване на TSH, fT4 и fT3, доза левотироксин,
 *     курс с тиамазол;
 *   • възли на щитовидната жлеза: EU-TIRADS (ETA 2017), показания за
 *     тънкоиглена биопсия и проследяване (ETA 2023), растеж и цитология по
 *     Bethesda 2023.
 *
 * Общо за сървъра и браузъра. Подпомага, но не заменя преценката на лекаря.
 */

import { addMonths, daysBetween, formatDate, today } from './dates.js';
import { latestResult, rangeFor, resultSeries, round } from './labs.js';
import { classesOf, componentsOf } from './drugs.js';
import { activeMeds, dailyDose, medLabel } from './meds.js';
import { hba1cTarget } from './chronic.js';
import { latestStudy, studySeries } from './cardio.js';
import { table } from './table.js';

export const ENDO_VERIFIED = '2026-09';

const dec = (v, d = 1) => String(round(v, d)).replace('.', ',');
const has = (m, cls) => !!m.drug && classesOf(m.drug).has(cls);
const inn = (m) => (m.drug ? componentsOf(m.drug) : []);
/* „Статин“ → „статин“; съкращения като „SGLT2-инхибитор“ остават. */
const lc = (s) => (/^[А-ЯA-Z][а-яa-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/* ---------------------------------- CGM ---------------------------------- */

/** GMI (%) от средната глюкоза в mmol/L (Bergenstal 2018: 3,31 + 0,02392 × mg/dL). */
export const gmiFromMean = (mmol) => round(3.31 + 0.02392 * mmol * 18.016, 1);

/* Цели по международния консенсус (Battelino 2019). */
export const CGM_TARGETS = table({
  standard: { tir: 70, tbr: 4, veryLow: 1, tar: 25, veryHigh: 5, label: 'възрастни с диабет тип 1 и 2' },
  older: { tir: 50, tbr: 1, veryLow: 1, tar: null, veryHigh: 10, label: 'по-възрастни или с висок риск от хипогликемия' },
});

/**
 * Оценка на отчета от сензора. `older` — по-свободните цели (възраст, крехкост,
 * риск от хипогликемия). Връща показателите с целите и дали са постигнати.
 */
export function assessCgm(v, { older = false } = {}) {
  const t = CGM_TARGETS[older ? 'older' : 'standard'];
  const tbr = (v.low || 0) + (v.veryLow || 0);
  const tar = (v.high || 0) + (v.veryHigh || 0);
  const gmi = v.gmi ?? (v.mean ? gmiFromMean(v.mean) : null);
  const items = [
    { id: 'tir', label: 'Време в диапазона 3,9–10,0', value: v.tir, target: `>${t.tir}%`, ok: v.tir > t.tir },
    { id: 'tbr', label: 'Под 3,9', value: round(tbr, 1), target: `<${t.tbr}%`, ok: tbr < t.tbr },
  ];
  if (!older) items.push({ id: 'veryLow', label: 'Под 3,0', value: v.veryLow ?? 0, target: `<${t.veryLow}%`, ok: (v.veryLow ?? 0) < t.veryLow });
  if (t.tar !== null) items.push({ id: 'tar', label: 'Над 10,0', value: round(tar, 1), target: `<${t.tar}%`, ok: tar < t.tar });
  items.push({ id: 'veryHigh', label: 'Над 13,9', value: v.veryHigh ?? 0, target: `<${t.veryHigh}%`, ok: (v.veryHigh ?? 0) < t.veryHigh });
  if (v.cv !== undefined) items.push({ id: 'cv', label: 'Вариабилност (CV)', value: v.cv, target: '≤36%', ok: v.cv <= 36 });
  const sufficient = (v.days ?? 0) >= 14 && (v.active === undefined || v.active >= 70);
  const firstBad = items.find(i => !i.ok);
  // Консенсусът: първо се намалява времето под диапазона, после се увеличава TIR.
  const focus = !items.find(i => i.id === 'tbr').ok || (items.find(i => i.id === 'veryLow') && !items.find(i => i.id === 'veryLow').ok)
    ? 'Първо намалете хипогликемиите — времето под диапазона е над целта.'
    : firstBad ? `Основна цел: ${firstBad.label.toLowerCase()} ${firstBad.target}.` : 'Всички показатели са в целта.';
  return {
    items, gmi, sufficient, focus, targets: t, older,
    sufficiencyText: sufficient ? null : 'За надеждна оценка са нужни поне 14 дни и поне 70% активен сензор.',
  };
}

/** Самоконтрол с глюкомер — цели по ADA 2025: на гладно 4,4–7,2, след хранене <10,0 mmol/L. */
export function assessSmbg(v) {
  const out = [];
  if (v.fasting !== undefined) out.push({ label: 'Средна на гладно', value: `${dec(v.fasting)} mmol/L`, target: '4,4–7,2', ok: v.fasting >= 4.4 && v.fasting <= 7.2 });
  if (v.post !== undefined) out.push({ label: 'Средна след хранене', value: `${dec(v.post)} mmol/L`, target: '<10,0', ok: v.post < 10 });
  const hypo = v.hypo || 0, hypo2 = v.hypo2 || 0, severe = v.severe || 0;
  out.push({ label: 'Хипогликемии', value: `${hypo}${hypo2 ? ` (под 3,0: ${hypo2})` : ''}${severe ? `, тежки: ${severe}` : ''}`, target: 'без', ok: hypo === 0 && severe === 0 });
  return out;
}

/* -------------------------------- инсулин -------------------------------- */

const BASAL = ['insulin_glargine', 'insulin_degludec'];
const BOLUS = ['insulin_aspart', 'insulin_lispro', 'insulin_glulisine'];
const PREMIX = ['insulin_aspart_mix', 'insulin_lispro_mix'];

export const INSULIN_KIND = table({ basal: 'базален', bolus: 'прандиален', premix: 'двуфазен', human: 'човешки' });

/** Инсулиновият режим: дневни единици по вид, обща доза на кг, коефициенти. */
export function insulinRegimen(p, { weight = null, asOf = today() } = {}) {
  const list = [];
  const unknown = [];
  for (const m of activeMeds(p, asOf)) {
    if (!has(m, 'INSULIN')) continue;
    const id = inn(m)[0];
    const kind = BASAL.includes(id) ? 'basal' : BOLUS.includes(id) ? 'bolus' : PREMIX.includes(id) ? 'premix' : 'human';
    const dd = dailyDose(m);
    // Инсулинът се дозира в единици — число без мерна единица е единици.
    const units = dd && (dd.unit === 'U' || dd.unit === 'mg') ? dd.daily : null;
    if (units === null) unknown.push(medLabel(m));
    list.push({ med: m, name: medLabel(m), kind, units, intakes: dd?.intakes ?? null });
  }
  if (!list.length) return null;
  const sum = (k) => list.filter(x => x.kind === k && x.units !== null).reduce((a, x) => a + x.units, 0);
  const tdd = list.reduce((a, x) => a + (x.units || 0), 0);
  const basal = sum('basal');
  const bolus = sum('bolus');
  const out = {
    list, unknown, tdd: round(tdd, 1), basal: round(basal, 1), bolus: round(bolus, 1),
    perKg: weight && tdd ? round(tdd / weight, 2) : null,
    basalPerKg: weight && basal ? round(basal / weight, 2) : null,
    basalPct: tdd && basal ? Math.round((basal / tdd) * 100) : null,
    basalBolus: basal > 0 && bolus > 0,
  };
  // Правило 500 (въглехидрати) и 100 (корекция в mmol/L) — ориентировъчни начални стойности.
  if (out.basalBolus && tdd > 0 && !unknown.length) {
    out.icr = Math.round(500 / tdd);
    out.isf = round(100 / tdd, 1);
  }
  out.overbasal = out.basalPerKg !== null && out.basalPerKg > 0.5;
  return out;
}

/**
 * Титриране на базалния инсулин при диабет тип 2 (ADA 2025): +2 единици
 * на 3 дни до гладно 4,4–7,2 mmol/L; при хипогликемия без ясна причина —
 * намаление с 10–20%. Над 0,5 ед./кг — свръхбазализация.
 */
export function basalAdvice(regimen, smbg) {
  if (!regimen || !regimen.basal) return null;
  const fasting = smbg?.values.fasting;
  const hypos = (smbg?.values.hypo2 || 0) + (smbg?.values.severe || 0);
  const lo = Math.max(1, Math.round(regimen.basal * 0.1)), hi = Math.max(2, Math.round(regimen.basal * 0.2));
  if (smbg && ((smbg.values.hypo || 0) > 0 || hypos > 0)) {
    return { kind: 'down', text: `Хипогликемии при самоконтрола — потърсете причината; ако няма ясна, намалете базалния инсулин с 10–20% (${lo}–${hi} ед.).` };
  }
  if (regimen.overbasal) {
    return { kind: 'stop', text: `Базален инсулин ${dec(regimen.basalPerKg, 2)} ед./кг — над 0,5: вероятна свръхбазализация. Вместо ново повишаване обмислете GLP-1 агонист или прандиален инсулин.` };
  }
  if (fasting === undefined) return { kind: 'info', text: 'Въведете самоконтрол (средна на гладно), за да се предложи титриране.' };
  if (fasting > 7.2) return { kind: 'up', text: `Средна на гладно ${dec(fasting)} mmol/L — повишавайте базалния инсулин с 2 ед. на всеки 3 дни до гладно 4,4–7,2 mmol/L.` };
  if (fasting < 4.4) return { kind: 'down', text: `Средна на гладно ${dec(fasting)} mmol/L — под целта; намалете базалния инсулин с 10–20% (${lo}–${hi} ед.).` };
  return { kind: 'ok', text: `Средна на гладно ${dec(fasting)} mmol/L — в целта; базалната доза е подходяща.` };
}

/* -------------------------------- стъпала -------------------------------- */

/* IWGDF 2023: категория на риска и колко често се преглежда стъпалото. */
export const IWGDF = table({
  0: { label: 'много нисък риск', every: 'веднъж годишно', months: 12 },
  1: { label: 'нисък риск', every: 'на 6–12 месеца', months: 6 },
  2: { label: 'умерен риск', every: 'на 3–6 месеца', months: 3 },
  3: { label: 'висок риск', every: 'на 1–3 месеца', months: 1 },
});

export function iwgdfCategory(v) {
  if (!v) return null;
  const { lops, pad, deformity, ulcerHistory, amputation, esrd } = v;
  let cat = 0;
  if ((lops || pad) && (ulcerHistory || amputation || esrd)) cat = 3;
  else if ((lops && pad) || (lops && deformity) || (pad && deformity)) cat = 2;
  else if (lops || pad) cat = 1;
  return { cat, ...IWGDF[cat], urgent: !!v.ulcer };
}

/* --------------------------- лечение със защита --------------------------- */

/**
 * Лечение с доказана полза отвъд глюкозата (ESC 2023, ADA 2025, KDIGO 2024)
 * и годишен преглед при диабет. Всеки ред: { label, ok, note }.
 */
export function diabetesChecklist(p, a, asOf = today()) {
  const conds = new Set(a.conditions.map(c => c.code));
  const meds = activeMeds(p, asOf);
  const hasCls = (cls) => meds.some(m => has(m, cls));
  const egfr = a.renal.egfr?.value ?? null;
  const uacr = a.renal.uacr?.value ?? null;
  const ascvd = ['chd', 'pad', 'stroke'].some(c => conds.has(c));
  const ckd = (egfr !== null && egfr >= 20 && egfr < 60) || uacr >= 3;
  const out = [];
  if (conds.has('dm2')) {
    if (ascvd || conds.has('hf') || ckd) {
      const why = [ascvd && 'атеросклеротично ССЗ', conds.has('hf') && 'сърдечна недостатъчност', ckd && 'ХБЗ'].filter(Boolean).join(', ');
      out.push({ label: 'SGLT2-инхибитор', ok: hasCls('SGLT2'), note: `показан при ${why}, независимо от HbA1c` });
    }
    if (ascvd || a.vitals.bmi >= 30) {
      out.push({ label: 'GLP-1 агонист с доказана полза', ok: hasCls('GLP1'), note: ascvd ? 'при атеросклеротично ССЗ (ESC 2023, клас I)' : 'при затлъстяване — загуба на тегло и сърдечно-съдова полза' });
    }
  }
  if (a.age >= 40 || ascvd) {
    out.push({ label: 'Статин', ok: hasCls('STATIN') || hasCls('EZETIMIBE') || hasCls('PCSK9'), note: a.cv.ldlTarget ? `цел LDL ${a.cv.ldlTarget.text}` : '' });
  }
  if (uacr >= 3) out.push({ label: 'ACE-инхибитор или сартан', ok: hasCls('ACEI') || hasCls('ARB'), note: `албуминурия (UACR ${dec(uacr)} mg/mmol)` });
  if (conds.has('dm2') && uacr >= 3 && egfr >= 25 && (hasCls('ACEI') || hasCls('ARB'))) {
    out.push({ label: 'Финеренон', ok: hasCls('FINERENONE'), optional: true, note: 'обмислете при остатъчна албуминурия въпреки ACEi/ARB, eGFR ≥25 и нормален калий (KDIGO 2024)' });
  }
  const mon = (req) => a.monitoring.find(t => t.req === req);
  for (const [req, label] of [['hba1c', 'HbA1c'], ['eye', 'Очни дъна'], ['foot', 'Преглед на стъпалата'], ['uacr', 'Албуминурия (UACR)'], ['renal', 'Креатинин / eGFR'], ['lipids', 'Липиден профил']]) {
    const t = mon(req);
    if (!t) continue;
    out.push({ label, ok: t.status === 'future' || t.status === 'soon', last: t.last, due: t.due, status: t.status, monitoring: true, req });
  }
  return out;
}

/** Контрол на гликемията: последен HbA1c, цел и промяна. */
export function glycemia(p, asOf = today()) {
  const series = resultSeries(p.results, 'hba1c');
  const last = series.at(-1) || null;
  const prev = series.length > 1 ? series.at(-2) : null;
  const target = hba1cTarget(p, asOf);
  return {
    series, last, prev, target,
    status: !last ? 'unknown' : last.value < target.value ? 'ok' : last.value < target.value + 1 ? 'partial' : 'bad',
    change: last && prev ? round(last.value - prev.value, 1) : null,
    age: last ? daysBetween(last.date, asOf) : null,
  };
}

/* ----------------------------- щитовидна жлеза ----------------------------- */

const flag = (code, value, sex) => {
  if (value === null || value === undefined) return null;
  const r = rangeFor(code, sex);
  return value > r[1] ? 'H' : value < r[0] ? 'L' : 'N';
};

/**
 * Тълкуване на тиреоидните хормони. `onLt4` — на левотироксин;
 * `onAtd` — на тиреостатик. Връща { id, label, text, severity }.
 */
export function thyroidPattern({ tsh = null, ft4 = null, ft3 = null, sex = 'f', onLt4 = false, onAtd = false } = {}) {
  if (tsh === null) return null;
  const T = flag('tsh', tsh, sex), F4 = flag('ft4', ft4, sex), F3 = flag('ft3', ft3, sex);
  const r = (id, label, text, severity = 1) => ({ id, label, text, severity });
  if (onLt4) {
    if (T === 'H' && (F4 === 'L' || tsh >= 10)) return r('lt4_under', 'Недостатъчно заместване', 'Повишете дозата с 25–50 µg; проверете приема (на гладно, без калций и желязо) и лекарствата, които пречат на усвояването.', 2);
    if (T === 'H') return r('lt4_under_mild', 'Леко недостатъчно заместване', 'Повишете дозата с 12,5–25 µg; TSH след 6–8 седмици.', 1);
    if (T === 'L' && (F4 === 'H' || F3 === 'H')) return r('lt4_over', 'Предозиране с левотироксин', 'Намалете дозата; при възрастни и сърдечни болести — риск от ПМ и остеопороза.', 2);
    if (T === 'L') return r('lt4_over_mild', 'Потиснат TSH на левотироксин', tsh < 0.1 ? 'TSH <0,1 — намалете дозата, освен ако потискането е умишлено (след рак на щитовидната жлеза).' : 'Обмислете намаляване с 12,5–25 µg, особено над 65 г. или при сърдечно заболяване.', 1);
    if (F4 === 'L') return r('lt4_low_ft4', 'Нисък fT4 при неповишен TSH', 'При централен хипотиреоидизъм TSH не е надежден — дозата се води по fT4 (в горната половина на нормата).', 1);
    if (F4 === 'H' && T === 'N') return r('lt4_timing', 'Висок fT4 при нормален TSH', 'Често — таблетката е приета преди изследването. Повторете с кръв преди сутрешната доза.', 0);
    return r('lt4_ok', 'Адекватно заместване', 'TSH в референтните граници — продължете със същата доза, контрол след 6–12 месеца.', 0);
  }
  if (onAtd) {
    if (T === 'H' || F4 === 'L') return r('atd_over', 'Хипотиреоидизъм от тиреостатика', 'Намалете дозата на тиамазол (или добавете левотироксин при схема „блокирай и замести“).', 2);
    if (F4 === 'H' || F3 === 'H') return r('atd_under', 'Продължаваща тиреотоксикоза', 'Повишете дозата на тиамазол; fT4 и fT3 след 4–6 седмици. TSH може да остане потиснат месеци.', 2);
    if (T === 'L') return r('atd_ok_tsh', 'Еутиреоидни хормони при още потиснат TSH', 'Очаквано в началото на лечението — дозата се води по fT4 и fT3.', 0);
    return r('atd_ok', 'Еутиреоидно състояние на тиамазол', 'Поддържаща доза; контрол на 2–3 месеца.', 0);
  }
  if (T === 'H' && F4 === 'L') return r('hypo', 'Явен първичен хипотиреоидизъм', 'Показано е лечение с левотироксин. Anti-TPO уточнява автоимунната причина.', 2);
  if (T === 'H' && (F4 === 'N' || F4 === null)) {
    return tsh >= 10
      ? r('subhypo10', 'Субклиничен хипотиреоидизъм, TSH ≥10', 'Повторете TSH и fT4 след 2–3 месеца; при потвърждение лечението се препоръчва (ETA 2013).', 1)
      : r('subhypo', 'Субклиничен хипотиреоидизъм', 'Повторете след 2–3 месеца с anti-TPO. Лечение при симптоми, anti-TPO+, планирана бременност; над 70 г. обикновено само наблюдение.', 1);
  }
  if (T === 'L' && (F4 === 'H' || F3 === 'H')) {
    return F4 === 'N' && F3 === 'H'
      ? r('t3tox', 'Т3-тиреотоксикоза', 'Нормален fT4 с висок fT3 — ранна Базедова болест или токсичен възел. TRAb и сцинтиграфия.', 2)
      : r('hyper', 'Явен хипертиреоидизъм', 'TRAb за Базедова болест; при отрицателни — сцинтиграфия. Бета-блокер за симптомите.', 2);
  }
  if (T === 'L' && (F4 === 'N' || F4 === null) && (F3 === 'N' || F3 === null)) {
    return tsh < 0.1
      ? r('subhyper2', 'Субклиничен хипертиреоидизъм, степен 2 (TSH <0,1)', 'Лечение се препоръчва над 65 г., при сърдечно заболяване или остеопороза (ETA 2015). Повторете с fT3.', 1)
      : r('subhyper1', 'Субклиничен хипертиреоидизъм, степен 1 (TSH 0,1–0,39)', 'Обикновено наблюдение; повторете след 2–3 месеца. Изключете лекарства и нетиреоидно заболяване.', 1);
  }
  if (F4 === 'L' && T !== 'H') return r('central', 'Нисък fT4 без повишен TSH', 'Възможен централен хипотиреоидизъм или тежко нетиреоидно заболяване — изследвайте хипофизната функция.', 2);
  if (F4 === 'H' && T !== 'L') return r('discordant', 'Висок fT4 без потиснат TSH', 'Несъответствие: интерференция при изследването (биотин, антитела), TSH-секретиращ аденом или резистентност. Повторете по друг метод.', 1);
  return r('euthyroid', 'Еутиреоидно състояние', 'TSH и тиреоидните хормони са в референтните граници.', 0);
}

/**
 * Левотироксин: доза на кг и ориентир за пълно заместване (1,6 µg/кг) или
 * предпазливо начало (25–50 µg) над 60 г. и при исхемична болест.
 */
export function lt4Dose(p, a, asOf = today()) {
  const m = activeMeds(p, asOf).find(x => has(x, 'LEVOTHYROXINE'));
  const weight = a.vitals.weight?.value ?? null;
  const chd = a.conditions.some(c => c.code === 'chd' || c.code === 'af');
  const cautious = a.age >= 60 || chd;
  const out = { med: m || null, weight, cautious };
  if (m) {
    const dd = dailyDose(m);
    // Левотироксинът се дозира в микрограми — „100“ или „100 мг“ почти винаги означава 100 µg.
    if (dd) out.daily = dd.unit === 'µg' ? dd.daily : dd.unit === 'mg' && dd.daily >= 12.5 ? dd.daily : dd.unit === 'mg' ? dd.daily * 1000 : null;
    if (out.daily && weight) out.perKg = round(out.daily / weight, 2);
  }
  if (weight) out.full = Math.round((1.6 * weight) / 12.5) * 12.5;
  out.startText = cautious
    ? `Начална доза 25–50 µg дневно${chd ? ' (сърдечно заболяване)' : ' (над 60 г.)'}, повишаване с 12,5–25 µg на 6–8 седмици.`
    : weight ? `Пълно заместване ≈${out.full} µg дневно (1,6 µg/кг) при явен хипотиреоидизъм.` : 'Пълно заместване ≈1,6 µg/кг дневно при явен хипотиреоидизъм.';
  return out;
}

/** Курс с тиамазол: продължителност и напомняния (ETA 2018 за Базедова болест). */
export function atdCourse(p, asOf = today()) {
  const m = activeMeds(p, asOf).find(x => has(x, 'ANTITHYROID'));
  if (!m) return null;
  const months = m.start ? Math.floor(daysBetween(m.start, asOf) / 30.44) : null;
  const notes = ['Пациентът спира лекарството и прави кръвна картина при температура или болки в гърлото (агранулоцитоза).'];
  if (months !== null && months >= 12) notes.unshift(`${months} месеца лечение — при Базедова болест курсът е 12–18 месеца; изследвайте TRAb преди спиране. При високи TRAb — продължаване или радикално лечение.`);
  else if (months !== null) notes.unshift(`${months} месеца лечение от ${formatDate(m.start)} При Базедова болест курсът е 12–18 месеца.`);
  return { med: m, name: medLabel(m), months, notes };
}

/* ----------------------------- възли: EU-TIRADS ----------------------------- */

export const COMPOSITION = table({ cystic: 'чиста киста (анехогенна)', spongiform: 'изцяло спонгиформен', mixed: 'смесен (кистично-солиден)', solid: 'солиден' });
export const ECHOGENICITY = table({ hyper: 'хиперехогенен', iso: 'изоехогенен', mild: 'леко хипоехогенен', marked: 'силно хипоехогенен' });
export const LOBES = table({ right: 'десен лоб', left: 'ляв лоб', isthmus: 'провлак' });

export const EU_TIRADS = table({
  2: { label: 'EU-TIRADS 2 — доброкачествен', risk: '≈0%', fnaOver: null },
  3: { label: 'EU-TIRADS 3 — нисък риск', risk: '2–4%', fnaOver: 20 },
  4: { label: 'EU-TIRADS 4 — междинен риск', risk: '6–17%', fnaOver: 15 },
  5: { label: 'EU-TIRADS 5 — висок риск', risk: '26–87%', fnaOver: 10 },
});

/** Високорискови белези: неовална форма, неравни ръбове, микрокалцификати, силна хипоехогенност. */
export function highRiskFeatures(e) {
  return [
    e.shape === 'taller' && 'неовална форма',
    e.margins === 'irregular' && 'неравни ръбове',
    e.microcalc && 'микрокалцификати',
    e.echogenicity === 'marked' && 'силно хипоехогенен',
  ].filter(Boolean);
}

/** EU-TIRADS категория на един ехографски преглед на възел (ETA 2017). */
export function euTirads(e) {
  if (!e) return null;
  if (e.composition === 'cystic' || e.composition === 'spongiform') return 2;
  if (highRiskFeatures(e).length) return 5;
  if (e.echogenicity === 'mild') return 4;
  return 3;
}

export const BETHESDA = table({
  1: { label: 'I — недиагностична', rom: '13%', action: 'Повторна тънкоиглена биопсия под ехографски контрол.' },
  2: { label: 'II — доброкачествена', rom: '4%', action: 'Проследяване.' },
  3: { label: 'III — атипия с неустановено значение', rom: '22%', action: 'Повторна биопсия, молекулярно изследване, диагностична лобектомия или наблюдение.' },
  4: { label: 'IV — фоликуларна неоплазма', rom: '30%', action: 'Молекулярно изследване или диагностична лобектомия.' },
  5: { label: 'V — съмнение за малигненост', rom: '74%', action: 'Хирургично лечение (лобектомия или тиреоидектомия); молекулярно изследване по преценка.' },
  6: { label: 'VI — малигнена', rom: '97%', action: 'Хирургично лечение — насочване към ендокринен хирург.' },
});

const maxDim = (e) => Math.max(...(e.dims || []).filter(x => x > 0), 0);
/** Обем на елипсоид: 0,524 × a × b × c (mm³ → mL). */
export const noduleVolume = (e) => ((e.dims || []).length === 3 && e.dims.every(x => x > 0)
  ? round((0.524 * e.dims[0] * e.dims[1] * e.dims[2]) / 1000, 2) : null);

/**
 * Значим растеж (ETA 2023): ≥20% в поне два размера с поне 2 мм, или
 * увеличение на обема >50%. Сравнява се с първото измерване.
 */
export function noduleGrowth(first, last) {
  if (!first || !last || first === last) return null;
  const a = first.dims || [], b = last.dims || [];
  let grown = 0;
  for (let i = 0; i < 3; i++) {
    if (a[i] > 0 && b[i] > 0 && b[i] >= a[i] * 1.2 && b[i] - a[i] >= 2) grown++;
  }
  const v1 = noduleVolume(first), v2 = noduleVolume(last);
  const volPct = v1 && v2 ? Math.round(((v2 - v1) / v1) * 100) : null;
  const significant = grown >= 2 || (volPct !== null && volPct > 50);
  return {
    significant, volPct, grown,
    text: significant
      ? `Значим растеж от ${formatDate(first.date)}${volPct !== null ? ` (обем ${volPct > 0 ? '+' : ''}${volPct}%)` : ''} — нужна е преоценка.`
      : `Без значим растеж от ${formatDate(first.date)}${volPct !== null ? ` (обем ${volPct > 0 ? '+' : ''}${volPct}%)` : ''}.`,
  };
}

/**
 * Пълна оценка на един възел: категория, размер, растеж, цитология и
 * какво следва — биопсия или контролна ехография и кога.
 */
export function noduleAssessment(n, asOf = today()) {
  const exams = [...(n.exams || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  const fna = [...(n.fna || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = exams.at(-1) || null;
  const out = { nodule: n, exams, fna, last, removed: n.status === 'removed' };
  if (!last) return { ...out, action: 'exam', text: 'Няма въведена ехография.' };
  const cat = euTirads(last);
  const size = maxDim(last);
  const lastFna = fna.at(-1) || null;
  const benignCount = fna.filter(f => f.bethesda === 2).length;
  Object.assign(out, {
    cat, catLabel: EU_TIRADS[cat].label, risk: EU_TIRADS[cat].risk, size,
    volume: noduleVolume(last), features: highRiskFeatures(last),
    growth: noduleGrowth(exams[0], last),
    bethesda: lastFna ? { ...BETHESDA[lastFna.bethesda], value: lastFna.bethesda, date: lastFna.date } : null,
  });
  if (out.removed) return { ...out, action: 'none', text: 'Възелът е отстранен.' };

  const follow = (months, text) => ({ ...out, action: 'follow', next: addMonths(last.date, months), text });
  // Цитологията има предимство, ако е след последната ехография или от същия ден.
  if (lastFna && lastFna.date >= exams[0].date) {
    const b = lastFna.bethesda;
    if (b === 2) {
      if (out.growth?.significant) return { ...out, action: 'fna', text: 'Доброкачествена цитология, но значим растеж — повторна биопсия.' };
      if (cat === 5 && benignCount < 2) return { ...out, action: 'fna', text: 'Доброкачествена цитология при EU-TIRADS 5 — повторна биопсия (ETA 2023).' };
      return follow(36, benignCount >= 2
        ? 'Две доброкачествени цитологии — повторна биопсия не е нужна; контролна ехография след 3–5 години.'
        : 'Доброкачествена цитология — контролна ехография след 3–5 години (ETA 2023).');
    }
    if (b === 1) return { ...out, action: 'fna', text: BETHESDA[1].action };
    if (b === 3 || b === 4) return { ...out, action: 'refer', text: BETHESDA[b].action };
    return { ...out, action: 'surgery', text: BETHESDA[b].action };
  }
  const limit = EU_TIRADS[cat].fnaOver;
  if (limit && size > limit) {
    return { ...out, action: 'fna', text: `Показана е тънкоиглена биопсия: ${EU_TIRADS[cat].label.split(' — ')[0]} и размер ${size} мм (над ${limit} мм).${out.growth?.significant ? ' ' + out.growth.text : ''}` };
  }
  if (out.growth?.significant && cat >= 3) return { ...out, action: 'fna', text: `${out.growth.text} Обмислете биопсия.` };
  if (cat === 2) return size > 10 ? follow(36, 'Доброкачествен — контролна ехография след 3–5 години.') : { ...out, action: 'none', text: 'Доброкачествен до 10 мм — не е нужно проследяване.' };
  if (cat === 3) return size > 10 ? follow(36, 'Нисък риск, 10–20 мм — контролна ехография след 3–5 години.') : { ...out, action: 'none', text: 'Нисък риск до 10 мм — не е нужно проследяване.' };
  if (cat === 4) return follow(12, 'Междинен риск до 15 мм — контролна ехография след 1 година.');
  return follow(6, size >= 5
    ? 'Висок риск, 5–10 мм: биопсия при подозрителни лимфни възли, съмнение за екстратиреоидно разпространение или рискова локализация (до трахеята или n. recurrens); иначе активно наблюдение на 6–12 месеца.'
    : 'Висок риск под 5 мм — активно наблюдение с ехография на 6–12 месеца.');
}

/* --------------------------------- обобщение --------------------------------- */

/** Всичко за раздела „Ендокринология“. `a` е обобщението за възрастен (adult.js). */
export function endoSummary(p, a, asOf = today()) {
  const conds = new Set(a.conditions.map(c => c.code));
  const meds = activeMeds(p, asOf);
  const diabetic = conds.has('dm1') || conds.has('dm2');
  const onInsulin = meds.some(m => has(m, 'INSULIN'));
  const cgmStudy = latestStudy(p, 'cgm');
  const smbgStudy = latestStudy(p, 'smbg');
  const footStudy = latestStudy(p, 'foot');
  const older = a.age >= 65 || conds.has('dementia');

  const showDiabetes = diabetic || onInsulin || !!cgmStudy || conds.has('prediabetes');
  const regimen = showDiabetes ? insulinRegimen(p, { weight: a.vitals.weight?.value ?? null, asOf }) : null;
  const diabetes = showDiabetes ? {
    glycemia: glycemia(p, asOf),
    cgm: cgmStudy ? { study: cgmStudy, ...assessCgm(cgmStudy.values, { older }) } : null,
    cgmSeries: studySeries(p, 'cgm').map(s => ({ date: s.date, value: s.values.tir })),
    smbg: smbgStudy ? { study: smbgStudy, items: assessSmbg(smbgStudy.values) } : null,
    regimen,
    basal: regimen ? basalAdvice(regimen, smbgStudy) : null,
    foot: footStudy ? { study: footStudy, ...iwgdfCategory(footStudy.values) } : null,
    checklist: diabetesChecklist(p, a, asOf),
    type: conds.has('dm1') ? 'dm1' : conds.has('dm2') ? 'dm2' : null,
  } : null;

  const tsh = latestResult(p.results, 'tsh');
  const onLt4 = meds.some(m => has(m, 'LEVOTHYROXINE'));
  const onAtd = meds.some(m => has(m, 'ANTITHYROID'));
  const nodules = (p.nodules || []).map(n => noduleAssessment(n, asOf));
  const showThyroid = !!tsh || onLt4 || onAtd || conds.has('hypothyroid') || nodules.length > 0;
  let thyroid = null;
  if (showThyroid) {
    // Хормоните се тълкуват заедно, само ако са от една и съща дата с TSH.
    const same = (code) => { const r = latestResult(p.results, code); return r && tsh && r.date === tsh.date ? r.value : null; };
    thyroid = {
      tsh, ft4: same('ft4'), ft3: same('ft3'),
      pattern: tsh ? thyroidPattern({ tsh: tsh.value, ft4: same('ft4'), ft3: same('ft3'), sex: p.sex, onLt4, onAtd }) : null,
      antibodies: ['atpo', 'trab'].map(c => latestResult(p.results, c)).filter(Boolean),
      tshSeries: resultSeries(p.results, 'tsh'),
      lt4: onLt4 || conds.has('hypothyroid') ? lt4Dose(p, a, asOf) : null,
      atd: atdCourse(p, asOf),
    };
  }

  const alerts = [];
  const g = diabetes?.glycemia;
  if (g?.last && g.status === 'bad') alerts.push({ id: 'a1c_high', severity: 2, text: `HbA1c ${dec(g.last.value)}% — над целта ${g.target.text} с повече от 1 пункт.` });
  else if (g?.last && g.status === 'partial') alerts.push({ id: 'a1c_above', severity: 1, text: `HbA1c ${dec(g.last.value)}% — над целта ${g.target.text}.` });
  if (diabetes?.cgm && diabetes.cgm.items.some(i => (i.id === 'tbr' || i.id === 'veryLow') && !i.ok)) {
    alerts.push({ id: 'cgm_hypo', severity: 3, text: 'Сензорът показва време под диапазона над целта — риск от хипогликемия.' });
  }
  if (diabetes?.smbg && (diabetes.smbg.study.values.severe || 0) > 0) alerts.push({ id: 'severe_hypo', severity: 3, text: 'Тежка хипогликемия при самоконтрола — преразгледайте лечението.' });
  if (diabetes?.foot?.urgent) alerts.push({ id: 'foot_ulcer', severity: 3, text: 'Активна язва на стъпалото — спешно към кабинет за диабетно стъпало.' });
  if (diabetes?.regimen?.overbasal) alerts.push({ id: 'overbasal', severity: 1, text: `Базален инсулин ${dec(diabetes.regimen.basalPerKg, 2)} ед./кг — над 0,5: вероятна свръхбазализация.` });
  for (const row of diabetes?.checklist || []) {
    if (!row.ok && !row.monitoring && !row.optional) alerts.push({ id: 'dm_therapy', severity: 1, text: `Без ${lc(row.label)} — ${row.note}.` });
  }
  if (thyroid?.pattern && thyroid.pattern.severity >= 2) alerts.push({ id: 'thyroid', severity: 2, text: `${thyroid.pattern.label} (TSH ${dec(tsh.value, 2)}).` });
  for (const n of nodules) {
    const where = `${LOBES[n.nodule.lobe] || ''}${n.nodule.location ? ', ' + n.nodule.location : ''}`;
    if (n.action === 'fna') alerts.push({ id: 'nodule_fna', severity: 2, text: `Възел (${where}): ${n.text}` });
    if (n.action === 'surgery' || n.action === 'refer') alerts.push({ id: 'nodule_cyto', severity: 3, text: `Възел (${where}): цитология ${n.bethesda.label} — ${n.text}` });
    if (n.action === 'follow' && n.next <= asOf) alerts.push({ id: 'nodule_follow', severity: 1, text: `Възел (${where}): контролна ехография — дължима от ${formatDate(n.next)}` });
  }
  return { diabetes, thyroid, nodules, alerts: alerts.sort((x, y) => y.severity - x.severity) };
}

/** Проследяване, което добавя модулът (за диспансерното наблюдение): стъпала по IWGDF. */
export function endoMonitoring(p) {
  const foot = latestStudy(p, 'foot');
  if (!foot) return [];
  const r = iwgdfCategory(foot.values);
  return [{ req: 'foot', months: r.months, reason: `IWGDF ${r.cat} — ${r.label}`, start: foot.date, added: foot.date }];
}

