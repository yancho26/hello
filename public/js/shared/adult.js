/* Обобщение за възрастен пациент — събира на едно място показателите,
 * изчисленията, контрола на заболяванията, проследяването, лекарствените
 * сигнали и психичното здраве. Общо за сървъра и браузъра. */

import { ageInMonthsExact, today } from './dates.js';
import {
  CV_REGIONS, LDL_TARGETS, RISK_LABELS, SCORE2_OP_NOTE, bmi as bmiOf, bmiClass, bpClassAdult, ckdStage,
  cha2ds2va, crclCockcroftGault, fib4, hasBled, hba1cToMmolMol, score2, score2Category, score2Diabetes,
  score2DiabetesCategory, waistRisk,
} from './clinical.js';
import { LABS, latestEgfr, latestResult } from './labs.js';
import {
  CONDITIONS, activeConditions, controlStatus, hasAscvd, latestBp, latestMeasure, monitoringTasks,
} from './chronic.js';
import { activeMeds, checkMedications, foodNotes, medMonitoring, renewals } from './meds.js';
import { classesOf } from './drugs.js';
import { mentalSummary } from './mental.js';

const years = (p, asOf) => ageInMonthsExact(p.birthDate, asOf) / 12;

/**
 * Категория на сърдечно-съдовия риск по ESC (2021 превенция, 2023 диабет).
 * Връща { category, label, reason, score, model, ldlTarget, missing, note }.
 */
export function cardiovascularRisk(p, { asOf = today(), region = 'very_high', egfr = null, uacr = null, bp = null } = {}) {
  const age = years(p, asOf);
  const conds = new Set(activeConditions(p).map(c => c.code));
  const res = p.results || [];
  const tc = latestResult(res, 'tchol');
  const hdl = latestResult(res, 'hdl');
  const ldl = latestResult(res, 'ldl');
  const a1c = latestResult(res, 'hba1c');
  const smoker = p.lifestyle?.smoking === 'current';
  const out = (category, reason, extra = {}) => ({
    category, label: RISK_LABELS[category], reason,
    ldlTarget: LDL_TARGETS[category === 'low' ? 'moderate' : category], ...extra,
  });

  if (hasAscvd(p)) return out('very_high', 'установено атеросклеротично сърдечно-съдово заболяване');

  // Тежко ХБЗ.
  if (egfr !== null && (egfr < 30 || (egfr < 45 && uacr > 30))) {
    return out('very_high', `тежко ХБЗ (eGFR ${egfr}${uacr !== null ? `, UACR ${uacr}` : ''})`);
  }

  const dm2 = conds.has('dm2');
  if (dm2) {
    const tod = (egfr !== null && egfr < 45) || (egfr !== null && egfr < 60 && uacr >= 3) || uacr > 30;
    if (tod) return out('very_high', 'диабет тип 2 с тежко увреждане на прицелни органи');
    const since = activeConditions(p).find(c => c.code === 'dm2')?.since;
    const ageDx = since ? ageInMonthsExact(p.birthDate, since) / 12 : null;
    const input = {
      age, sex: p.sex, smoker, sbp: bp?.systolic, tchol: tc?.value, hdl: hdl?.value,
      ageAtDiagnosis: ageDx, hba1c: a1c ? hba1cToMmolMol(a1c.value) : null, egfr, region,
    };
    const r = score2Diabetes(input);
    if (r) {
      const category = score2DiabetesCategory(r.risk);
      return out(category, `SCORE2-Diabetes ${String(r.risk).replace('.', ',')}%`, { score: r.risk, model: r.model });
    }
    const missing = [];
    if (!(age >= 40 && age < 70)) missing.push('възраст 40–69 г.');
    if (!bp) missing.push('налягане');
    if (!tc || !hdl) missing.push('общ и HDL-холестерол');
    if (!a1c) missing.push('HbA1c');
    if (egfr === null) missing.push('креатинин/eGFR');
    if (!ageDx) missing.push('от кога е диабетът');
    return out('high', 'диабет тип 2 (SCORE2-Diabetes не може да се изчисли)', { missing });
  }
  if (conds.has('dm1')) return out('high', 'диабет тип 1');

  // Умерено ХБЗ.
  if (egfr !== null && ((egfr < 45) || (egfr < 60 && uacr >= 3) || uacr > 30)) {
    return out('high', 'умерено ХБЗ');
  }
  // Силно изразен единичен рисков фактор.
  if ((tc && tc.value > 8) || (ldl && ldl.value > 4.9) || (bp && (bp.systolic >= 180 || bp.diastolic >= 110))) {
    return out('high', 'силно изразен рисков фактор (холестерол >8 или LDL >4,9 mmol/L, или АН ≥180/110)');
  }

  if (age >= 70) {
    const op = [...(p.assessments || [])].filter(a => a.tool === 'score2op').sort((a, b) => (a.date < b.date ? -1 : 1)).pop();
    if (op) {
      return out(op.result.category, `SCORE2-OP ${String(op.score).replace('.', ',')}% (въведен ${op.date})`, { score: op.score, model: 'SCORE2-OP' });
    }
    return { category: null, label: 'не е оценен', reason: SCORE2_OP_NOTE, ldlTarget: null, needsOp: true };
  }
  if (age < 40) {
    return { category: null, label: 'не се изчислява', reason: 'SCORE2 се прилага от 40 г. При младите хора се оценяват отделните рискови фактори.', ldlTarget: LDL_TARGETS.low };
  }
  const r = score2({ age, sex: p.sex, smoker, sbp: bp?.systolic, tchol: tc?.value, hdl: hdl?.value, diabetes: false, region });
  if (!r) {
    const missing = [];
    if (!bp) missing.push('налягане');
    if (!tc || !hdl) missing.push('общ и HDL-холестерол');
    return { category: null, label: 'липсват данни', reason: 'За SCORE2 са нужни налягане, общ и HDL-холестерол.', missing, ldlTarget: null };
  }
  const category = score2Category(r.risk, age);
  return out(category, `SCORE2 ${String(r.risk).replace('.', ',')}% (${CV_REGIONS[region]})`, {
    score: r.risk, model: r.model, smokingUnknown: !p.lifestyle?.smoking,
  });
}

/** Пълно обобщение на възрастен пациент. */
export function adultSummary(p, { asOf = today(), region = 'very_high', horizonDays = 30 } = {}) {
  const age = years(p, asOf);
  const conds = new Set(activeConditions(p).map(c => c.code));
  const res = p.results || [];

  const weight = latestMeasure(p, 'weight');
  const height = latestMeasure(p, 'height');
  const waist = latestMeasure(p, 'waist');
  const bp = latestBp(p);
  const b = weight && height ? bmiOf(weight.value, height.value) : null;
  const e = latestEgfr(p);
  const u = latestResult(res, 'uacr');
  const creat = latestResult(res, 'creat');
  const crcl = creat && weight ? crclCockcroftGault(creat.value, age, weight.value, p.sex) : null;
  const egfr = e ? e.value : null;
  const uacr = u ? u.value : null;

  const cv = cardiovascularRisk(p, { asOf, region, egfr, uacr, bp });
  const control = controlStatus(p, { ldlTarget: cv.ldlTarget }, asOf);

  const labs = {};
  for (const code of Object.keys(LABS)) {
    const r = latestResult(res, code);
    if (r) labs[code] = r;
  }
  if (e) labs.egfr = { ...(labs.egfr || {}), date: e.date, value: e.value, source: e.source };

  // Калкулатори, които имат смисъл за конкретните заболявания.
  const calculators = {};
  const htn = conds.has('htn');
  if (conds.has('af')) {
    calculators.cha2ds2va = cha2ds2va({
      hf: conds.has('hf'), htn, age, diabetes: conds.has('dm2') || conds.has('dm1'),
      stroke: conds.has('stroke'), vascular: conds.has('chd') || conds.has('pad'),
    });
    const meds = activeMeds(p, asOf);
    const antithrombotic = meds.some(m => m.drug && ['ASPIRIN', 'P2Y12', 'NSAID'].some(c => classesOf(m.drug).has(c)));
    calculators.hasbled = hasBled({
      uncontrolledHtn: bp ? bp.systolic > 160 : false,
      abnormalRenal: egfr !== null && egfr < 30,
      abnormalLiver: conds.has('masld') && (labs.alt?.value > 120),
      stroke: conds.has('stroke'),
      bleeding: !!p.lifestyle?.bleedingHistory,
      labileInr: false,
      age, drugs: antithrombotic,
      alcohol: p.lifestyle?.alcohol === 'high',
    });
  }
  if ((conds.has('masld') || conds.has('obesity') || conds.has('dm2')) && labs.ast && labs.alt && labs.plt) {
    calculators.fib4 = fib4(age, labs.ast.value, labs.alt.value, labs.plt.value);
  }

  const monitoringExtra = medMonitoring(p, { crcl }, asOf);
  const monitoring = monitoringTasks(p, { asOf, horizonDays, extra: monitoringExtra });

  const medCtx = {
    age, sex: p.sex, egfr, crcl, weight: weight?.value, creat: creat?.value, uacr,
    conditions: conds, allergies: p.allergies || [],
    cha2ds2va: calculators.cha2ds2va?.score,
    ldlAboveTarget: !!(cv.ldlTarget && labs.ldl && labs.ldl.value >= cv.ldlTarget.value),
  };

  return {
    age: Math.floor(age),
    vitals: {
      weight, height, waist, bp,
      bmi: b ? Math.round(b * 10) / 10 : null,
      bmiClass: bmiClass(b),
      waistRisk: waist ? waistRisk(p.sex, waist.value) : null,
      bpClass: bp ? bpClassAdult(bp.systolic, bp.diastolic) : null,
    },
    renal: {
      egfr: e, uacr: u, crcl: crcl ? Math.round(crcl) : null,
      stage: egfr !== null ? ckdStage(egfr, uacr) : null,
    },
    labs,
    cv,
    control,
    calculators,
    monitoring,
    medAlerts: checkMedications(p, medCtx, asOf),
    renewals: renewals(p, { asOf }),
    foodNotes: foodNotes(p, asOf),
    mental: mentalSummary(p.assessments),
    conditions: activeConditions(p).map(c => ({ ...c, def: CONDITIONS[c.code] })),
  };
}

/** Кратки броячи за списъци и таблото. */
export function adultFlags(summary) {
  const monOverdue = summary.monitoring.filter(t => t.status === 'overdue').length;
  const monDue = summary.monitoring.filter(t => t.status === 'due').length;
  const medSerious = summary.medAlerts.filter(a => a.severity === 'contra' || a.severity === 'major').length;
  const offTarget = summary.control.filter(c => c.status === 'bad').length;
  const mentalUrgent = summary.mental.alerts.filter(a => a.severity >= 3).length;
  return {
    monOverdue, monDue, medSerious, offTarget, mentalUrgent,
    renewals: summary.renewals.length,
    attention: monOverdue > 0 || medSerious > 0 || offTarget > 0 || mentalUrgent > 0 || summary.renewals.some(r => r.status === 'overdue'),
  };
}
