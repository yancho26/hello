/* Показателите на пациента за хранителния режим (версия 4.18).
 *
 * Режимът се позовава на това, което вече е в досието: последното налягане, гликиран
 * хемоглобин, LDL, триглицериди, пикочна киселина, хемоглобин и феритин, витамин D и B12,
 * калий и промяната в теглото — с датата и с целта на човека. Целите са същите, които
 * досието показва в „Контрол“: за налягането и HbA1c — индивидуалната, ако лекарят я е
 * задал, иначе по възраст (chronic.js); за LDL — по сърдечно-съдовия риск (adult.js).
 *
 * Стари резултати не се цитират: изследванията са до 12 месеца назад, налягането — до 6.
 * Нищо не напуска компютъра — модулът само чете досието.
 */

import { addDays, today } from './dates.js';
import { latestEgfr, rangeFor, resultSeries } from './labs.js';
import { bpTarget, hba1cTarget, latestBp } from './chronic.js';

/** Колко назад един резултат още се цитира. */
export const LAB_FRESH_DAYS = 365;
export const BP_FRESH_DAYS = 183;
/** Теглото: последното измерване до 3 месеца назад, сравнено с най-ранното през последната година (поне 4 седмици по-рано). */
const WEIGHT_LAST_DAYS = 92;
const WEIGHT_MIN_SPAN = 28;

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * @param {object} patient  досието
 * @param {object} opts     { asOf, ldlTarget: { value } | null } — целта за LDL идва от оценката на риска
 * @returns {object} само наличните и скорошни показатели:
 *   bp { sys, dia, date, target: { sys, dia }, ok }, hba1c { value, date, prev, target, ok },
 *   ldl { value, date, prev, target|null, ok|null }, tg { value, date, ok }, urate { value, date, target, ok },
 *   hb { value, date, low }, ferritin { value, date, low }, vitd { value, date, low }, b12 { value, date, low },
 *   k { value, date }, egfr { value, date }, weight { change, pct, from, to };
 *   targets { bp: { sys, dia }, hba1c } — целите на човека, и когато няма скорошно измерване (за дневника)
 */
export function patientIndicators(patient, { asOf = today(), ldlTarget = null } = {}) {
  const out = {};
  if (!patient) return out;
  const results = patient.results || [];
  const since = addDays(asOf, -LAB_FRESH_DAYS);
  const lab = (code) => {
    const series = resultSeries(results, code).filter(r => r.date <= asOf);
    const last = series.at(-1);
    if (!last || last.date < since) return null;
    const prev = series.length > 1 ? series.at(-2) : null;
    return {
      value: last.value, date: last.date,
      prev: prev && prev.date >= addDays(asOf, -2 * LAB_FRESH_DAYS) && prev.date < last.date ? { value: prev.value, date: prev.date } : null,
    };
  };
  const low = (code, value) => { const r = rangeFor(code, patient.sex); return !!r && value < r[0]; };

  const bpT = bpTarget(patient, asOf);
  out.targets = { bp: { sys: bpT.sys, dia: bpT.dia }, hba1c: hba1cTarget(patient, asOf).value };
  const bp = latestBp(patient);
  if (bp && bp.date >= addDays(asOf, -BP_FRESH_DAYS) && bp.date <= asOf) {
    const t = bpT;
    out.bp = { sys: bp.systolic, dia: bp.diastolic, date: bp.date, target: { sys: t.sys, dia: t.dia }, ok: bp.systolic < t.sys && bp.diastolic < t.dia };
  }
  const a1c = lab('hba1c');
  if (a1c) {
    const t = hba1cTarget(patient, asOf);
    out.hba1c = { ...a1c, target: t.value, ok: a1c.value < t.value };
  }
  const ldl = lab('ldl');
  if (ldl) out.ldl = { ...ldl, target: ldlTarget?.value ?? null, ok: ldlTarget?.value ? ldl.value < ldlTarget.value : null };
  const tg = lab('tg');
  if (tg) out.tg = { ...tg, ok: tg.value <= 1.7 };
  const urate = lab('urate');
  if (urate) out.urate = { ...urate, target: 360, ok: urate.value < 360 };
  for (const code of ['hb', 'ferritin', 'vitd', 'b12']) {
    const r = lab(code);
    if (r) out[code] = { value: r.value, date: r.date, low: low(code, r.value) };
  }
  const k = lab('k');
  if (k) out.k = { value: k.value, date: k.date };
  const egfr = latestEgfr(patient);
  if (egfr && egfr.date >= since && egfr.date <= asOf) out.egfr = { value: egfr.value, date: egfr.date };

  const weights = (patient.measurements || []).filter(m => Number.isFinite(m.weight) && m.weight > 0 && m.date <= asOf)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = weights.at(-1);
  if (last && last.date >= addDays(asOf, -WEIGHT_LAST_DAYS)) {
    const first = weights.find(m => m.date >= addDays(last.date, -LAB_FRESH_DAYS) && m.date <= addDays(last.date, -WEIGHT_MIN_SPAN));
    if (first) {
      const change = round1(last.weight - first.weight);
      out.weight = { change, pct: round1((change / first.weight) * 100), from: first.date, to: last.date };
    }
  }
  return out;
}
