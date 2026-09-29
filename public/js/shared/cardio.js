/* Модул „Кардиология“ — изчисления за специалиста.
 *
 *   • сърдечна недостатъчност: два вида по фракцията на изтласкване с
 *     граница 50% и основното лечение за всеки (ESC 2026); целевите дози
 *     (ESC 2021, Таблица 8); показания за ICD, CRT и ивабрадин (ESC 2021);
 *   • предсърдно мъждене: правилна доза на НОАК според възраст, тегло и
 *     креатининов клирънс (ESC 2024, EHRA 2021);
 *   • LDL: колко още трябва да се понижи и кой следващ етап на лечението
 *     би достигнал целта (средни понижения от ESC/EAS 2025, Фигура 2);
 *   • амбулаторно и домашно налягане: прагове (ESC 2024), нощен спад,
 *     хипертония „бяла престилка“ и маскирана хипертония;
 *   • ЕКГ: коригиран QT (Fridericia и Bazett) и лекарствата, които го удължават;
 *   • ехокардиография: отклонения от референтните стойности (ASE/EACVI).
 *
 * Общо за сървъра и браузъра. Резултатите подпомагат, но не заменят
 * преценката на лекаря.
 */

import { daysBetween, today } from './dates.js';
import { latestResult, resultSeries, round } from './labs.js';
import { classesOf, componentsOf, drugName } from './drugs.js';
import { activeMeds, dailyDose, medLabel } from './meds.js';
import { table } from './table.js';

export const CARDIO_VERIFIED = '2026-09';

const dec = (v, d = 1) => String(round(v, d)).replace('.', ',');
const has = (m, cls) => !!m.drug && classesOf(m.drug).has(cls);
const inn = (m) => (m.drug ? componentsOf(m.drug) : []);

/* ------------------------------ изследвания ------------------------------ */

/** Всички записи от даден вид, от най-стария към най-новия. */
export function studySeries(p, kind) {
  return (p.studies || []).filter(s => s.kind === kind)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
export const latestStudy = (p, kind) => studySeries(p, kind).at(-1) || null;

/* ------------------------- сърдечна недостатъчност ------------------------- */

/**
 * Фенотип по фракцията на изтласкване (ESC 2026): намалена под 50%,
 * запазена от 50%. „Леко намалената“ ФИ (41–49%) от насоките от 2021 г.
 * вече се лекува като намалена. Подобрена (HFimpEF) — предишна ≤40%, сега
 * >40% с покачване поне с 10 пункта (универсална дефиниция 2021); лечението
 * продължава.
 */
export function efPhenotype(series) {
  const list = (series || []).filter(s => Number.isFinite(s.values?.ef));
  if (!list.length) return null;
  const last = list.at(-1);
  const ef = last.values.ef;
  const lowest = Math.min(...list.slice(0, -1).map(s => s.values.ef));
  if (ef > 40 && lowest <= 40 && ef - lowest >= 10) {
    return { id: 'hfimpef', label: 'СН с подобрена ФИ (HFimpEF)', ef, date: last.date, previous: lowest };
  }
  if (ef < 50) return { id: 'hfref', label: 'СН с намалена ФИ (HFrEF)', ef, date: last.date };
  return { id: 'hfpef', label: 'СН със запазена ФИ (HFpEF)', ef, date: last.date };
}

/** Основното лечение по вида на СН (ESC 2026): при запазена ФИ — MRA и SGLT2-инхибитор. */
export const FOUNDATIONAL = table({
  hfref: ['raas', 'bb', 'mra', 'sglt2'],
  hfimpef: ['raas', 'bb', 'mra', 'sglt2'],
  hfpef: ['mra', 'sglt2'],
});
export const pillarsFor = (phenotype) => FOUNDATIONAL[phenotype?.id] || FOUNDATIONAL.hfref;

export const HF_PILLARS = table({
  raas: { label: 'ARNI / ACE-инхибитор / сартан', short: 'ARNI/ACEi/ARB' },
  bb: { label: 'Бета-блокер', short: 'Бета-блокер' },
  mra: { label: 'Минералкортикоиден антагонист', short: 'MRA' },
  sglt2: { label: 'SGLT2-инхибитор', short: 'SGLT2i' },
});

/* Целеви дози от ESC 2021, Таблица 8. `target` е дневната доза в мг (при
 * диапазон — долната граница); при сакубитрил/валсартан — по първата съставка. */
export const HF_DOSES = table({
  'sacubitril+valsartan': { pillar: 'raas', start: '49/51 мг 2 пъти дневно (24/26 мг при прекарана симптомна хипотония)', target: 194, text: '97/103 мг 2 пъти дневно', step: [24, 49, 97] },
  captopril: { pillar: 'raas', start: '6,25 мг 3 пъти дневно', target: 150, text: '50 мг 3 пъти дневно' },
  enalapril: { pillar: 'raas', start: '2,5 мг 2 пъти дневно', target: 20, text: '10–20 мг 2 пъти дневно' },
  lisinopril: { pillar: 'raas', start: '2,5–5 мг веднъж дневно', target: 20, text: '20–35 мг веднъж дневно' },
  ramipril: { pillar: 'raas', start: '2,5 мг 2 пъти дневно', target: 10, text: '5 мг 2 пъти дневно' },
  candesartan: { pillar: 'raas', start: '4 мг веднъж дневно', target: 32, text: '32 мг веднъж дневно' },
  losartan: { pillar: 'raas', start: '50 мг веднъж дневно', target: 150, text: '150 мг веднъж дневно' },
  valsartan: { pillar: 'raas', start: '40 мг 2 пъти дневно', target: 320, text: '160 мг 2 пъти дневно' },
  bisoprolol: { pillar: 'bb', start: '1,25 мг веднъж дневно', target: 10, text: '10 мг веднъж дневно' },
  carvedilol: { pillar: 'bb', start: '3,125 мг 2 пъти дневно', target: 50, text: '25 мг 2 пъти дневно (до 50 мг 2 пъти при тегло над 85 кг)' },
  metoprolol: {
    pillar: 'bb', start: '12,5–25 мг веднъж дневно', target: 200, text: '200 мг веднъж дневно',
    note: 'При СН доказана полза има само метопролол сукцинат с удължено освобождаване (Беталок ЗОК), не тартрат (Егилок).',
  },
  nebivolol: { pillar: 'bb', start: '1,25 мг веднъж дневно', target: 10, text: '10 мг веднъж дневно', note: 'Небивололът не е показал намаляване на смъртността при СН.' },
  eplerenone: { pillar: 'mra', start: '25 мг веднъж дневно', target: 50, text: '50 мг веднъж дневно' },
  finerenone: {
    pillar: 'mra', start: '10 мг при eGFR 25–60, 20 мг при eGFR >60, веднъж дневно', target: 20, text: '20 мг при eGFR ≤60, 40 мг при eGFR >60',
    note: 'Доказателствата за финеренон при СН са при ФИ ≥40% (FINEARTS-HF); при ФИ под 40% — спиронолактон или еплеренон.',
  },
  spironolactone: { pillar: 'mra', start: '25 мг веднъж дневно (12,5 мг при риск от хиперкалиемия)', target: 50, text: '50 мг веднъж дневно' },
  dapagliflozin: { pillar: 'sglt2', start: '10 мг веднъж дневно', target: 10, text: '10 мг веднъж дневно' },
  empagliflozin: { pillar: 'sglt2', start: '10 мг веднъж дневно', target: 10, text: '10 мг веднъж дневно' },
});

const NO_HF_TARGET = 'ESC 2021 не посочва целева доза за това лекарство при СН с намалена ФИ.';
const BB_NO_EVIDENCE = 'Не е сред бета-блокерите с доказана полза при СН (бизопролол, карведилол, метопролол сукцинат, небиволол).';

/** Към коя група спада лекарството и каква е целевата му доза. */
function pillarOf(m) {
  for (const id of inn(m)) {
    if (HF_DOSES[id]) return { pillar: HF_DOSES[id].pillar, id, dose: HF_DOSES[id] };
  }
  if (m.drug === 'sacubitril+valsartan') return { pillar: 'raas', id: m.drug, dose: HF_DOSES[m.drug] };
  if (has(m, 'ARNI') || has(m, 'ACEI') || has(m, 'ARB')) return { pillar: 'raas', id: inn(m).find(x => classesOf(x).has('ACEI') || classesOf(x).has('ARB')), dose: null, note: NO_HF_TARGET };
  if (has(m, 'BB')) return { pillar: 'bb', id: inn(m).find(x => classesOf(x).has('BB')), dose: null, note: BB_NO_EVIDENCE };
  if (has(m, 'MRA')) return { pillar: 'mra', id: inn(m)[0], dose: null, note: NO_HF_TARGET };
  if (has(m, 'SGLT2')) return { pillar: 'sglt2', id: inn(m).find(x => classesOf(x).has('SGLT2')), dose: null, note: NO_HF_TARGET };
  return null;
}

/**
 * Основното лечение на СН: за всяка група — какво приема пациентът, каква
 * част от целевата доза, какво пречи на повишаването и какъв е следващият
 * етап. При намалена ФИ — четирите групи, при запазена — MRA и SGLT2i.
 * ctx: { k, egfr, sbp, hr, pillars }
 */
export function hfTherapy(p, ctx = {}, asOf = today()) {
  const meds = activeMeds(p, asOf);
  const { k = null, egfr = null, sbp = null, hr = null, pillars = Object.keys(HF_PILLARS) } = ctx;
  const preserved = pillars.length < 4;
  const rows = [];
  for (const pid of pillars) {
    const found = meds.map(m => ({ m, info: pillarOf(m) })).filter(x => x.info && x.info.pillar === pid);
    // При ARNI сартанът е част от него — показва се ARNI.
    const pick = found.find(x => x.m.drug === 'sacubitril+valsartan') || found[0];
    const barriers = [];
    if (pid === 'raas' || pid === 'bb') {
      if (sbp !== null && sbp < 90) barriers.push(`систолно налягане ${sbp} mmHg — не повишавайте дозата`);
    }
    if (pid === 'raas' || pid === 'mra') {
      if (k !== null && k > 5.5) barriers.push(`калий ${dec(k)} mmol/L — намалете или спрете (при >6,0 спрете)`);
      else if (k !== null && k > 5.0) barriers.push(`калий ${dec(k)} mmol/L — не започвайте и не повишавайте`);
    }
    if (pid === 'mra' && egfr !== null && egfr < 30) barriers.push(`eGFR ${egfr} — MRA не се започва при eGFR <30`);
    if (pid === 'raas' && egfr !== null && egfr < 30) barriers.push(`eGFR ${egfr} — повишавайте внимателно, с контрол на креатинина и калия`);
    if (pid === 'bb' && hr !== null && hr < 50) barriers.push(`пулс ${hr}/мин — намалете дозата`);
    else if (pid === 'bb' && hr !== null && hr < 60) barriers.push(`пулс ${hr}/мин — не повишавайте`);
    if (pid === 'sglt2' && egfr !== null && egfr < 20) barriers.push(`eGFR ${egfr} — SGLT2-инхибитор не се започва под 20`);
    else if (pid === 'sglt2' && egfr !== null && egfr < 25) barriers.push(`eGFR ${egfr} — от двата само емпаглифлозин (дапаглифлозин от 25)`);

    if (!pick) {
      rows.push({
        pillar: pid, label: HF_PILLARS[pid].label, status: 'missing', barriers,
        next: barriers.length ? 'Липсва — вижте ограниченията.' : `Започнете: ${preserved && pid === 'mra' ? START_MRA_PRESERVED : START_TEXT[pid]}`,
      });
      continue;
    }
    const { m, info } = pick;
    const dd = dailyDose(m);
    const row = {
      pillar: pid, label: HF_PILLARS[pid].label, med: m, name: medLabel(m), barriers,
      note: info.dose?.note || info.note || '', target: info.dose ? info.dose.text : null,
    };
    if (!info.dose) {
      row.status = 'no_target';
      row.next = info.note;
    } else if (!dd || dd.unit !== 'mg') {
      row.status = 'unknown';
      row.next = 'Въведете доза в мг и броя приеми, за да се сравни с целевата.';
    } else {
      row.daily = dd.daily;
      row.pct = Math.round((dd.daily / info.dose.target) * 100);
      row.status = row.pct >= 100 ? 'target' : 'low';
      row.next = row.status === 'target' ? 'Целева доза.'
        : barriers.length ? `${row.pct}% от целевата — повишаването е ограничено.`
          : `${row.pct}% от целевата (${info.dose.text}). Удвояване на дозата, ако се понася — не по-често от 2 седмици.`;
    }
    rows.push(row);
  }
  const onTarget = rows.filter(r => r.status === 'target').length;
  const present = rows.filter(r => r.status !== 'missing').length;
  return { rows, onTarget, present };
}

export const NYHA_ROMAN = ['', 'I', 'II', 'III', 'IV'];

const START_MRA_PRESERVED = 'финеренон 10–20 мг веднъж дневно (при eGFR ≥25) или спиронолактон 25 мг; калий ≤5,0';

const START_TEXT = table({
  raas: 'сакубитрил/валсартан 49/51 мг 2 пъти дневно или ACE-инхибитор (напр. рамиприл 2,5 мг 2 пъти дневно)',
  bb: 'бизопролол 1,25 мг веднъж дневно или карведилол 3,125 мг 2 пъти дневно',
  mra: 'еплеренон или спиронолактон 25 мг веднъж дневно (при калий ≤5,0 и eGFR ≥30)',
  sglt2: 'дапаглифлозин или емпаглифлозин 10 мг веднъж дневно',
});

/** Препоръки по фенотипа, освен основното лечение (ESC 2026; устройства — ESC 2021). */
export function hfAdvice(phenotype, { ecg = null, hr = null, therapy = null, nyha = null, bmi = null, glp1 = false } = {}) {
  const out = [];
  if (!phenotype) return out;
  const ef = phenotype.ef;
  if (phenotype.id === 'hfref') {
    out.push('Основно лечение (ESC 2026): ARNI/ACEi/ARB, бета-блокер, MRA и SGLT2-инхибитор, започнати бързо — в рамките на седмици, после повишаване до целевите дози.');
    if (ef > 40) out.push(`ФИ ${ef}%: по ESC 2026 това е намалена ФИ — лечението е като при ФИ под 40%.`);
  }
  if (phenotype.id === 'hfpef') {
    out.push('Основно лечение (ESC 2026): MRA и SGLT2-инхибитор — клас I. Диуретик при задръжка на течности; систолно налягане под 130 mmHg; лечение на ПМ и другите съпътстващи заболявания.');
    if (bmi !== null && bmi >= 30 && !glp1) {
      out.push(`ИТМ ${String(bmi).replace('.', ',')}: семаглутид или тирзепатид — клас IIa при запазена ФИ и затлъстяване (ESC 2026).`);
    }
  }
  if (phenotype.id === 'hfimpef') {
    out.push(`ФИ се е подобрила от ${phenotype.previous}% на ${ef}%. Лечението продължава — спирането му води до повторно влошаване (TRED-HF).`);
  }
  if (phenotype.id === 'hfref' && ef <= 35) {
    out.push('ФИ ≤35% въпреки поне 3 месеца оптимално лечение и NYHA II–III: обсъдете ICD — клас I при исхемична, IIa при неисхемична етиология (ESC 2021).');
    const sinus = ecg && ecg.values.rhythm === 'sinus';
    const qrs = ecg?.values.qrs;
    if (sinus && qrs >= 130) {
      const lbbb = !!ecg.values.lbbb;
      const cls = qrs >= 150 ? (lbbb ? 'I' : 'IIa') : (lbbb ? 'IIa' : 'IIb');
      out.push(`Синусов ритъм, QRS ${qrs} ms${lbbb ? ' с ЛББ' : ' без ЛББ'}: CRT — клас ${cls} (ESC 2021).`);
    }
    const rate = hr ?? ecg?.values.hr;
    const bbRow = therapy?.rows.find(r => r.pillar === 'bb');
    if (sinus && rate >= 70 && bbRow && (bbRow.status === 'target' || bbRow.barriers.length)) {
      out.push(`Синусов ритъм и пулс ${rate}/мин при максимално поносим бета-блокер: ивабрадин 5 мг 2 пъти дневно — клас IIa.`);
    }
  }
  if (nyha >= 3 && phenotype.id === 'hfref') {
    out.push(`NYHA ${NYHA_ROMAN[nyha]} при оптимално лечение — ранна консултация с център за напреднала СН, клас I (ESC 2026).`);
  }
  return out;
}

/* ----------------------------- предсърдно мъждене ----------------------------- */

const NOAC = ['apixaban', 'rivaroxaban', 'edoxaban', 'dabigatran'];

/**
 * Правилната доза на НОАК при предсърдно мъждене и сравнение с въведената.
 * ctx: { age, weight, creat (µmol/L), crcl (mL/min), verapamil, hasbled }
 * Връща { drug, name, expected, verdict: ok|low|high|contra|unknown, text }.
 */
export function noacDose(m, ctx = {}) {
  const id = inn(m).find(x => NOAC.includes(x));
  if (!id) return null;
  const { age = null, weight = null, creat = null, crcl = null, verapamil = false, hasbled = null } = ctx;
  const dd = dailyDose(m);
  const per = dd && dd.unit === 'mg' ? dd.perIntake : null;
  const out = { drug: id, name: medLabel(m), per, intakes: dd?.intakes ?? null, reasons: [] };
  const missing = [];
  if (crcl === null) missing.push('креатининов клирънс (креатинин и тегло)');

  let full, reduced, freq, reduce = false, contra = false, optional = false;
  if (id === 'apixaban') {
    full = 5; reduced = 2.5; freq = 2;
    const crit = [age >= 80 && 'възраст ≥80 г.', weight !== null && weight <= 60 && 'тегло ≤60 кг', creat !== null && creat >= 133 && 'креатинин ≥133 µmol/L'].filter(Boolean);
    if (crit.length >= 2) { reduce = true; out.reasons.push(...crit); }
    if (crcl !== null && crcl < 15) contra = true;
    else if (crcl !== null && crcl < 30) { reduce = true; out.reasons.push(`CrCl ${Math.round(crcl)}`); }
    if (age === null || weight === null || creat === null) missing.push('възраст, тегло и креатинин');
  } else if (id === 'rivaroxaban') {
    full = 20; reduced = 15; freq = 1;
    if (crcl !== null && crcl < 15) contra = true;
    else if (crcl !== null && crcl < 50) { reduce = true; out.reasons.push(`CrCl ${Math.round(crcl)} (15–49)`); }
  } else if (id === 'edoxaban') {
    full = 60; reduced = 30; freq = 1;
    if (crcl !== null && crcl < 15) contra = true;
    else if (crcl !== null && crcl <= 50) { reduce = true; out.reasons.push(`CrCl ${Math.round(crcl)} (15–50)`); }
    if (weight !== null && weight <= 60) { reduce = true; out.reasons.push('тегло ≤60 кг'); }
    if (weight === null) missing.push('тегло');
  } else {
    full = 150; reduced = 110; freq = 2;
    if (crcl !== null && crcl < 30) contra = true;
    if (age >= 80) { reduce = true; out.reasons.push('възраст ≥80 г.'); }
    if (verapamil) { reduce = true; out.reasons.push('верапамил'); }
    if (!reduce) {
      const soft = [age >= 75 && age < 80 && 'възраст 75–79 г.', crcl !== null && crcl >= 30 && crcl <= 50 && `CrCl ${Math.round(crcl)} (30–50)`, hasbled >= 3 && `HAS-BLED ${hasbled}`].filter(Boolean);
      if (soft.length) { optional = true; out.reasons.push(...soft); }
    }
  }
  const fmt = (mg) => `${dec(mg)} мг ${freq === 2 ? '2 пъти дневно' : 'веднъж дневно'}`;
  out.expected = contra ? 'не се препоръчва' : optional ? `${fmt(full)} или ${fmt(reduced)}` : fmt(reduce ? reduced : full);

  if (contra) {
    out.verdict = 'contra';
    out.text = `${drugName(id)} не се препоръчва при CrCl ${Math.round(crcl)} mL/min.`;
    return out;
  }
  if (per === null || !dd) {
    out.verdict = 'unknown';
    out.text = `Очаквана доза: ${out.expected}. Въведете дозата в мг и приема, за да се сравни.`;
    return out;
  }
  const allowed = optional ? [full, reduced] : [reduce ? reduced : full];
  if (dd.intakes !== freq) {
    out.verdict = 'wrong';
    out.text = `${drugName(id)} се приема ${freq === 2 ? '2 пъти дневно' : 'веднъж дневно'}, а е въведен ${dd.intakes} пъти.`;
  } else if (allowed.some(a => Math.abs(a - per) < 0.01)) {
    out.verdict = 'ok';
    out.text = `Дозата отговаря${out.reasons.length ? ` (${out.reasons.join(', ')})` : ''}.`;
  } else if (per < Math.min(...allowed)) {
    out.verdict = 'low';
    out.text = `Ниска доза: ${dec(per)} мг при очаквани ${out.expected}. Неоправдано намалената доза не предпазва достатъчно от инсулт.`;
  } else {
    out.verdict = 'high';
    out.text = `Висока доза: ${dec(per)} мг при очаквани ${out.expected}${out.reasons.length ? ` (${out.reasons.join(', ')})` : ''} — риск от кървене.`;
  }
  if (missing.length && out.verdict === 'ok') out.text += ` Липсват: ${missing.join(', ')} — проверката е непълна.`;
  out.missing = missing;
  return out;
}

/** Антикоагулацията при пациент с ПМ. */
export function afCare(p, ctx = {}, asOf = today()) {
  const meds = activeMeds(p, asOf);
  const verapamil = meds.some(m => inn(m).includes('verapamil'));
  const oac = meds.filter(m => has(m, 'DOAC') || has(m, 'VKA'));
  const items = oac.map(m => (has(m, 'DOAC')
    ? { med: m, kind: 'doac', check: noacDose(m, { ...ctx, verapamil }) }
    : { med: m, kind: 'vka', inr: latestResult(p.results, 'inr') }));
  const rate = ctx.hr ?? null;
  return {
    items,
    none: !oac.length,
    rate,
    rateText: rate === null ? null : rate >= 110
      ? `Пулс ${rate}/мин в покой — над 110; целта за контрол на честотата е под 110 (ESC 2024).`
      : `Пулс ${rate}/мин в покой — в целта за контрол на честотата (под 110).`,
  };
}

/* ---------------------------------- LDL ---------------------------------- */

/* Интензивност на статина по дневна доза (ESC/EAS 2019): висока — понижава
 * LDL с ≥50%, умерена — с 30–50%. [доза от, интензивност] във възходящ ред. */
export const STATIN_INTENSITY = table({
  atorvastatin: [[10, 'moderate'], [40, 'high']],
  rosuvastatin: [[5, 'moderate'], [20, 'high']],
  simvastatin: [[10, 'low'], [20, 'moderate']],
  pravastatin: [[10, 'low'], [40, 'moderate']],
});
export const INTENSITY_LABELS = table({ low: 'ниска', moderate: 'умерена', high: 'висока', unknown: 'неизвестна' });

/** Каква е сегашната липидопонижаваща терапия. */
export function lipidTherapy(p, asOf = today()) {
  const out = { statin: null, ezetimibe: false, bempedoic: false, pcsk9: null, meds: [] };
  for (const m of activeMeds(p, asOf)) {
    if (!m.drug) continue;
    const classes = classesOf(m.drug);
    let used = false;
    if (classes.has('STATIN')) {
      const id = inn(m).find(x => classesOf(x).has('STATIN'));
      const dd = dailyDose(m);
      const steps = STATIN_INTENSITY[id];
      let intensity = 'unknown';
      if (steps && dd && dd.unit === 'mg') {
        intensity = 'low';
        for (const [from, level] of steps) if (dd.daily >= from) intensity = level;
      }
      out.statin = { med: m, id, daily: dd?.daily ?? null, intensity };
      used = true;
    }
    if (classes.has('EZETIMIBE')) { out.ezetimibe = true; used = true; }
    if (classes.has('BEMPEDOIC')) { out.bempedoic = true; used = true; }
    if (classes.has('PCSK9')) { out.pcsk9 = 'mab'; used = true; }
    if (classes.has('PCSK9_SIRNA') && !out.pcsk9) { out.pcsk9 = 'sirna'; used = true; }
    if (used) out.meds.push(m);
  }
  return out;
}

/* Средно понижение на LDL (дял от изходния) — ESC/EAS 2025, Фигура 2. */
const STATIN_EFFECT = table({ none: 0, low: 0.2, moderate: 0.3, high: 0.5, unknown: 0.3 });
const ALONE = table({ e: 0.23, b: 0.2, eb: 0.38, k: 0.6, ek: 0.7, ebk: 0.75, bk: 0.68 });
/* Допълнително понижение върху статин (изведено от комбинациите с висока интензивност). */
const ON_STATIN = table({ e: 0.2, b: 0.16, eb: 0.36, k: 0.5, ek: 0.6, bk: 0.58, ebk: 0.72 });

export function ldlReduction({ statin = 'none', e = false, b = false, k = false, sirna = false }) {
  const s = STATIN_EFFECT[statin] ?? 0;
  const key = (e ? 'e' : '') + (b ? 'b' : '') + (k || sirna ? 'k' : '');
  if (!key) return s;
  if (s > 0) return 1 - (1 - s) * (1 - ON_STATIN[key]);
  // Без статин: инклисиранът понижава LDL с около 50%, антителата — с около 60%.
  if (sirna && !k) {
    const rest = key.replace('k', '');
    return 1 - (1 - (rest ? ALONE[rest] : 0)) * 0.5;
  }
  return ALONE[key];
}

/**
 * Пътят до целевия LDL. От сегашната стойност и терапия се изчислява
 * приблизителната изходна стойност и какво би дал всеки следващ етап.
 */
export function ldlPath({ ldl, target, therapy, halve = false }) {
  if (!ldl || !target) return null;
  const cur = {
    statin: therapy.statin ? therapy.statin.intensity : 'none',
    e: therapy.ezetimibe, b: therapy.bempedoic, k: therapy.pcsk9 === 'mab', sirna: therapy.pcsk9 === 'sirna',
  };
  const now = ldlReduction(cur);
  const baseline = ldl / (1 - now);
  // При висок и много висок риск целта е и понижение ≥50% от изходното (ESC/EAS 2019).
  const goal = halve ? Math.min(target, baseline * 0.5) : target;
  target = round(goal, 2);
  const needPct = ldl > target ? Math.round((1 - target / ldl) * 100) : 0;
  const steps = [];
  let state = { ...cur };
  const push = (label, next) => {
    state = next;
    const projected = baseline * (1 - ldlReduction(state));
    // Малък толеранс: точно 50% понижение изпълнява условието „≥50% от изходното“.
    steps.push({ label, projected: round(projected, 1), reaches: projected < target + 0.005 });
  };
  if (cur.statin !== 'high') push(cur.statin === 'none' ? 'Статин с висока интензивност (аторвастатин 40–80 мг или розувастатин 20–40 мг)' : 'Преминаване към статин с висока интензивност', { ...state, statin: 'high' });
  if (!cur.e) push('+ езетимиб 10 мг', { ...state, e: true });
  if (!cur.k && !cur.sirna) push('+ PCSK9 инхибитор (еволокумаб, алирокумаб или инклисиран)', { ...state, k: true });
  if (!cur.b) push('+ бемпедоева киселина 180 мг (при непоносимост към статин или недостатъчен ефект)', { ...state, b: true });
  const first = steps.findIndex(s => s.reaches);
  return {
    ldl, target, needPct, atTarget: ldl < target,
    baseline: round(baseline, 1), steps, recommended: first,
    currentLabel: therapyLabel(therapy),
  };
}

export function therapyLabel(t) {
  const parts = [];
  if (t.statin) parts.push(`${drugName(t.statin.id)} ${t.statin.daily ? dec(t.statin.daily, 0) + ' мг' : ''} (${INTENSITY_LABELS[t.statin.intensity]} интензивност)`.replace('  ', ' '));
  if (t.ezetimibe) parts.push('езетимиб');
  if (t.bempedoic) parts.push('бемпедоева киселина');
  if (t.pcsk9) parts.push(t.pcsk9 === 'mab' ? 'PCSK9 антитяло' : 'инклисиран');
  return parts.length ? parts.join(' + ') : 'без липидопонижаващо лечение';
}

/**
 * Липопротеин(а) — ESC/EAS 2019 и 2025. Приема резултат в mg/dL или в
 * nmol/L (двете не се преобразуват точно едно в друго): 30 mg/dL ≈ 62 nmol/L,
 * 50 mg/dL ≈ 105 nmol/L, 180 mg/dL ≈ 430 nmol/L.
 */
export function lpaAssess(mg = null, nmol = null) {
  const pick = mg !== null ? { v: mg, u: 'mg/dL', t: [30, 50, 180] } : nmol !== null ? { v: nmol, u: 'nmol/L', t: [62, 105, 430] } : null;
  if (!pick) return { level: 'unknown', text: 'Не е изследван. Lp(a) се изследва поне веднъж в живота на всеки възрастен (ESC/EAS 2025).' };
  const [lo, hi, top] = pick.t;
  const val = `Lp(a) ${dec(pick.v, 0)} ${pick.u}`;
  if (pick.v > top) return { level: 'very_high', text: `${val} — над ${top}: рискът е като при хетерозиготна фамилна хиперхолестеролемия.` };
  if (pick.v > hi) return { level: 'high', text: `${val} — над ${hi}: повишава сърдечно-съдовия риск (ESC/EAS 2025, клас IIa).` };
  if (pick.v >= lo) return { level: 'border', text: `${val} — ${lo}–${hi}: слабо повишен риск.` };
  return { level: 'ok', text: `${val} — нисък.` };
}

/* ---------------------------- амбулаторно налягане ---------------------------- */

/* Прагове за хипертония извън кабинета (ESC 2024 = ESH 2023). */
export const ABPM_LIMITS = table({
  day: { sys: 135, dia: 85, label: 'дневно' },
  night: { sys: 120, dia: 70, label: 'нощно' },
  h24: { sys: 130, dia: 80, label: '24-часово' },
});
export const HOME_LIMIT = { sys: 135, dia: 85 };

const over = (s, d, lim) => (s >= lim.sys || d >= lim.dia);

/** Нощен спад на систолното налягане. */
export function dipping(daySys, nightSys) {
  if (!(daySys > 0) || !(nightSys > 0)) return null;
  const pct = round(((daySys - nightSys) / daySys) * 100, 1);
  const cls = pct < 0 ? { id: 'riser', label: 'обратен спад (нощно покачване)', severity: 2 }
    : pct < 10 ? { id: 'nondipper', label: 'без нощен спад (non-dipper)', severity: 1 }
      : pct <= 20 ? { id: 'dipper', label: 'нормален нощен спад', severity: 0 }
        : { id: 'extreme', label: 'прекомерен нощен спад', severity: 1 };
  return { pct, ...cls };
}

/**
 * Оценка на амбулаторното (Холтер) измерване. `office` — последното
 * измерване в кабинета { systolic, diastolic }; `treated` — на лечение ли е.
 */
export function assessAbpm(v, { office = null, treated = false } = {}) {
  const parts = [];
  const flags = {};
  for (const [key, lim] of Object.entries(ABPM_LIMITS)) {
    const s = v[key === 'h24' ? 'sys24' : key === 'day' ? 'sysDay' : 'sysNight'];
    const d = v[key === 'h24' ? 'dia24' : key === 'day' ? 'diaDay' : 'diaNight'];
    if (!(s > 0) || !(d > 0)) continue;
    flags[key] = over(s, d, lim);
    parts.push({ key, label: lim.label, value: `${s}/${d}`, limit: `≥${lim.sys}/${lim.dia}`, high: flags[key] });
  }
  const known = Object.keys(flags);
  if (!known.length) return null;
  const high = known.some(k => flags[k]);
  const out = { parts, high, dip: dipping(v.sysDay, v.sysNight) };
  if (flags.night && !flags.day && flags.day !== undefined) out.nocturnal = true;
  if (office && office.systolic) {
    const officeHigh = office.systolic >= 140 || office.diastolic >= 90;
    if (officeHigh && !high) out.phenotype = treated ? 'Неконтролирана в кабинета, контролирана извън него („бяла престилка“ при лечение).' : 'Хипертония „бяла престилка“: високо в кабинета, нормално при амбулаторното измерване.';
    else if (!officeHigh && high) out.phenotype = treated ? 'Маскирана неконтролирана хипертония: нормално в кабинета, високо извън него.' : 'Маскирана хипертония: нормално в кабинета, високо при амбулаторното измерване.';
    else if (officeHigh && high) out.phenotype = treated ? 'Неконтролирана хипертония — в кабинета и извън него.' : 'Потвърдена хипертония — в кабинета и извън него.';
    else out.phenotype = treated ? 'Контролирано налягане — в кабинета и извън него.' : 'Нормално налягане — в кабинета и извън него.';
  }
  out.summary = high
    ? `Над праговете за хипертония: ${parts.filter(x => x.high).map(x => x.label).join(', ')}.`
    : 'Под праговете за хипертония (24 ч <130/80, ден <135/85, нощ <120/70).';
  return out;
}

export function assessHome(v, { office = null } = {}) {
  if (!(v.sys > 0) || !(v.dia > 0)) return null;
  const high = over(v.sys, v.dia, HOME_LIMIT);
  const out = { high, summary: high ? `Средно ${v.sys}/${v.dia} — над прага 135/85 за домашно измерване.` : `Средно ${v.sys}/${v.dia} — под прага 135/85.` };
  if (v.days && v.days < 3) out.warn = 'Под 3 дни измерване — средната стойност е ненадеждна (препоръчват се 7 дни, сутрин и вечер).';
  if (office && office.systolic) {
    const officeHigh = office.systolic >= 140 || office.diastolic >= 90;
    if (officeHigh && !high) out.phenotype = 'Високо в кабинета, нормално у дома — съмнение за ефект „бяла престилка“.';
    if (!officeHigh && high) out.phenotype = 'Нормално в кабинета, високо у дома — съмнение за маскирана хипертония.';
  }
  return out;
}

/* ---------------------------------- ЕКГ ---------------------------------- */

/** Коригиран QT: Fridericia (предпочитан) и Bazett. */
export function qtc(qtMs, hr) {
  if (!(qtMs > 0) || !(hr > 0)) return null;
  const rr = 60 / hr;
  return { fridericia: Math.round(qtMs / Math.cbrt(rr)), bazett: Math.round(qtMs / Math.sqrt(rr)), rr: round(rr, 2) };
}

/** Оценка на QTc (AHA/ACCF/HRS 2009): удължен ≥450 ms при мъже, ≥460 ms при жени; ≥500 ms — висок риск. */
export function qtcAssess(value, sex) {
  if (!(value > 0)) return null;
  const limit = sex === 'f' ? 460 : 450;
  if (value >= 500) return { level: 'high', severity: 3, label: `QTc ${value} ms — ≥500: висок риск от torsades de pointes` };
  if (value >= limit) return { level: 'long', severity: 2, label: `QTc ${value} ms — удължен (≥${limit} ms)` };
  if (value < 350) return { level: 'short', severity: 1, label: `QTc ${value} ms — къс (под 350 ms)` };
  return { level: 'ok', severity: 0, label: `QTc ${value} ms — в норма` };
}

export const RHYTHMS = table({
  sinus: 'синусов ритъм', af: 'предсърдно мъждене', flutter: 'предсърдно трептене',
  paced: 'пейсмейкърен ритъм', other: 'друг ритъм',
});

/** ЕКГ с QTc и свързаните рискове. */
export function ecgAssess(study, p, { k = null, asOf = today() } = {}) {
  if (!study) return null;
  const v = study.values || {};
  const q = qtc(v.qt, v.hr);
  const assess = q ? qtcAssess(q.fridericia, p.sex) : null;
  const qtMeds = activeMeds(p, asOf).filter(m => has(m, 'QT'));
  const warnings = [];
  if (assess && assess.severity >= 2 && qtMeds.length) {
    warnings.push(`Лекарства, които удължават QT: ${qtMeds.map(medLabel).join(', ')} — преценете спиране или смяна.`);
  }
  if (assess && assess.severity >= 2 && k !== null && k < 3.5) warnings.push(`Калий ${dec(k)} mmol/L — коригирайте хипокалиемията.`);
  if (v.hr > 0 && v.hr < 50) warnings.push(`Брадикардия ${v.hr}/мин.`);
  if (v.pr >= 300) warnings.push(`PR ${v.pr} ms — AV блок I степен с много дълъг PR.`);
  else if (v.pr > 200) warnings.push(`PR ${v.pr} ms — AV блок I степен.`);
  if (v.qrs >= 120) warnings.push(`QRS ${v.qrs} ms — широк комплекс${v.lbbb ? ' (ЛББ)' : ''}.`);
  if (q && ['af', 'flutter'].includes(v.rhythm)) warnings.push('При предсърдно мъждене QTc е ориентировъчен — RR интервалите са неравни; измерете в няколко удара.');
  if (q && v.qrs >= 120) warnings.push('При широк QRS QTc надценява реполяризацията — оценявайте JT интервала.');
  return { study, qtc: q, assess, qtMeds, warnings, rhythm: RHYTHMS[v.rhythm] || '' };
}

/* ------------------------------ ехокардиография ------------------------------ */

/* Граници за възрастни (ASE/EACVI 2015–2016). */
export function echoFlags(v, sex) {
  const out = [];
  const f = sex === 'f';
  if (v.ef > 0 && v.ef < 50) out.push(`ФИ ${v.ef}%${v.ef <= 40 ? ' — намалена' : ' — леко намалена'}`);
  if (v.lvedd > (f ? 52 : 58)) out.push(`ЛК дилатиран: ТДД ${v.lvedd} мм (над ${f ? 52 : 58})`);
  if (v.ivs > (f ? 9 : 10)) out.push(`Задебелен междукамерен септум ${v.ivs} мм`);
  if (v.lavi > 34) out.push(`Разширено ляво предсърдие: ${v.lavi} мл/м² (над 34)`);
  if (v.ee > 14) out.push(`E/e' ${dec(v.ee)} — повишено налягане на пълнене (над 14)`);
  if (v.trv > 2.8) out.push(`Трикуспидална регургитация ${dec(v.trv)} м/с — възможна белодробна хипертония (над 2,8)`);
  if (v.tapse > 0 && v.tapse < 17) out.push(`TAPSE ${v.tapse} мм — намалена функция на дясната камера (под 17)`);
  return out;
}

/* --------------------------------- обобщение --------------------------------- */

/** Последният резултат за Lp(a) — в която и да е от двете единици. */
function lpaOf(res) {
  const mg = latestResult(res, 'lpa');
  const nmol = latestResult(res, 'lpan');
  const useMg = mg && (!nmol || mg.date >= nmol.date);
  const last = useMg ? mg : nmol;
  return { lpa: lpaAssess(useMg ? mg.value : null, !useMg && nmol ? nmol.value : null), lpaDate: last?.date || null };
}

/**
 * Всичко за раздела „Кардиология“. `a` е обобщението за възрастен (adult.js).
 * Връща и кратки сигнали за справките.
 */
export function cardioSummary(p, a, asOf = today()) {
  const conds = new Set(a.conditions.map(c => c.code));
  const res = p.results || [];
  const echoes = studySeries(p, 'echo');
  const ecg = latestStudy(p, 'ecg');
  const nyhaStudy = latestStudy(p, 'nyha');
  const k = latestResult(res, 'k')?.value ?? null;
  const egfr = a.renal.egfr?.value ?? null;
  const bp = a.vitals.bp;
  const hr = bp?.pulse || ecg?.values.hr || null;
  const phenotype = efPhenotype(echoes);
  const nyha = nyhaStudy?.values.nyha ?? null;

  const showHf = conds.has('hf') || (phenotype && phenotype.ef < 50);
  const therapy = showHf ? hfTherapy(p, { k, egfr, sbp: bp?.systolic ?? null, hr, pillars: pillarsFor(phenotype) }, asOf) : null;
  const glp1 = activeMeds(p, asOf).some(m => has(m, 'GLP1'));
  const hf = showHf ? {
    phenotype, nyha, nyhaDate: nyhaStudy?.date || null, therapy,
    advice: hfAdvice(phenotype, { ecg, hr, therapy, nyha, bmi: a.vitals.bmi, glp1 }),
    ntprobnp: resultSeries(res, 'ntprobnp'),
    efSeries: echoes.filter(s => Number.isFinite(s.values.ef)).map(s => ({ date: s.date, value: s.values.ef })),
  } : null;

  const showAf = conds.has('af') || (ecg && ['af', 'flutter'].includes(ecg.values.rhythm));
  const af = showAf ? afCare(p, {
    age: a.age, weight: a.vitals.weight?.value ?? null, creat: a.labs.creat?.value ?? null,
    crcl: a.renal.crcl, hasbled: a.calculators.hasbled?.score ?? null, hr,
  }, asOf) : null;

  const therapyLipids = lipidTherapy(p, asOf);
  const ldl = a.labs.ldl || null;
  const lipids = {
    therapy: therapyLipids,
    ldl, target: a.cv.ldlTarget,
    path: ldl && a.cv.ldlTarget ? ldlPath({
      ldl: ldl.value, target: a.cv.ldlTarget.value, therapy: therapyLipids,
      halve: ['very_high', 'high'].includes(a.cv.category),
    }) : null,
    ...lpaOf(res),
    stale: ldl ? daysBetween(ldl.date, asOf) > 365 : false,
  };

  const treated = activeMeds(p, asOf).some(m => ['ACEI', 'ARB', 'CCB_DHP', 'THIAZIDE', 'BB', 'MRA'].some(c => has(m, c)));
  const abpmStudy = latestStudy(p, 'abpm');
  const homeStudy = latestStudy(p, 'hbpm');
  const pressure = {
    abpm: abpmStudy ? { study: abpmStudy, ...(assessAbpm(abpmStudy.values, { office: bp, treated }) || {}) } : null,
    home: homeStudy ? { study: homeStudy, ...(assessHome(homeStudy.values, { office: bp }) || {}) } : null,
    treated,
  };

  const ecgInfo = ecgAssess(ecg, p, { k, asOf });
  const lastEcho = echoes.at(-1) || null;
  const echo = lastEcho ? { study: lastEcho, flags: echoFlags(lastEcho.values, p.sex) } : null;

  // Сигнали — за обзора на раздела и за справките.
  const alerts = [];
  if (hf?.phenotype && therapy) {
    const missing = therapy.rows.filter(r => r.status === 'missing' && !r.barriers.length);
    const kind = hf.phenotype.id === 'hfpef' ? 'СН със запазена ФИ' : 'СН с намалена ФИ';
    if (missing.length) alerts.push({ id: 'hf_missing', severity: 2, text: `${kind} без ${missing.map(r => HF_PILLARS[r.pillar].short).join(', ')} (основно лечение, ESC 2026).` });
    const low = therapy.rows.filter(r => r.status === 'low' && !r.barriers.length);
    if (low.length) alerts.push({ id: 'hf_low', severity: 1, text: `Под целевата доза: ${low.map(r => `${r.name} (${r.pct}%)`).join(', ')}.` });
  }
  if (hf && !hf.phenotype) alerts.push({ id: 'hf_no_echo', severity: 1, text: 'Сърдечна недостатъчност без въведена фракция на изтласкване — добавете ехокардиография.' });
  if (af) {
    if (af.none && (a.calculators.cha2ds2va?.score ?? 0) >= 2) alerts.push({ id: 'af_no_oac', severity: 3, text: `Предсърдно мъждене, CHA2DS2-VA ${a.calculators.cha2ds2va.score}, без антикоагулант.` });
    for (const it of af.items) {
      if (it.kind === 'doac' && ['low', 'high', 'contra', 'wrong'].includes(it.check.verdict)) {
        alerts.push({ id: 'noac_dose', severity: it.check.verdict === 'low' ? 2 : 3, text: `${it.check.name}: ${it.check.text}` });
      }
    }
  }
  if (lipids.path && !lipids.path.atTarget) alerts.push({ id: 'ldl_above', severity: 1, text: `LDL ${dec(ldl.value, 2)} mmol/L над целта ${a.cv.ldlTarget.text} (нужни още −${lipids.path.needPct}%).` });
  if (ecgInfo?.assess && ecgInfo.assess.severity >= 2) alerts.push({ id: 'qtc', severity: ecgInfo.assess.severity, text: ecgInfo.assess.label + (ecgInfo.qtMeds.length ? ` · ${ecgInfo.qtMeds.length} лекарства удължават QT` : '') });
  if (pressure.abpm?.high && treated) alerts.push({ id: 'abpm_high', severity: 1, text: `Амбулаторно налягане над целта: ${pressure.abpm.parts.filter(x => x.high).map(x => `${x.label} ${x.value}`).join(', ')}.` });

  return { hf, af, lipids, pressure, ecg: ecgInfo, echo, alerts: alerts.sort((x, y) => y.severity - x.severity) };
}
