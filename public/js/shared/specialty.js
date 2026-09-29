/* Модули за специалисти от извънболничната помощ (СИМП): кои има,
 * как се наричат сигналите им в справките и обобщението за едно досие. */

import { table } from './table.js';
import { cardioSummary } from './cardio.js';
import { endoSummary } from './endo.js';
import { activeConditions } from './chronic.js';
import { activeMeds } from './meds.js';
import { classesOf } from './drugs.js';

export const MODULES = table({
  cardio: {
    name: 'Кардиология', specialist: 'кардиолог', icon: '❤️',
    about: 'Сърдечна недостатъчност с целеви дози, антикоагулация при предсърдно мъждене, път до целевия LDL, амбулаторно налягане, ЕКГ с QTc и ехокардиография.',
    alerts: table({
      af_no_oac: 'Предсърдно мъждене без антикоагулант',
      noac_dose: 'НОАК в неподходяща доза',
      hf_missing: 'СН без някоя от групите на основното лечение (ESC 2026)',
      hf_low: 'СН — под целевата доза',
      hf_no_echo: 'СН без въведена фракция на изтласкване',
      qtc: 'Удължен QTc',
      ldl_above: 'LDL над целта',
      abpm_high: 'Амбулаторно налягане над целта при лечение',
    }),
  },
  endo: {
    name: 'Ендокринология', specialist: 'ендокринолог', icon: '🦋',
    about: 'Диабет със сензор (CGM), инсулинов режим и титриране, риск за стъпалото по IWGDF, тълкуване на тиреоидните хормони и регистър на възлите с EU-TIRADS и Bethesda.',
    alerts: table({
      foot_ulcer: 'Активна язва на стъпалото',
      severe_hypo: 'Тежки хипогликемии',
      cgm_hypo: 'Хипогликемии по сензора',
      nodule_cyto: 'Възли с цитология, която изисква действие',
      nodule_fna: 'Възли за тънкоиглена биопсия',
      a1c_high: 'HbA1c над целта с повече от 1 пункт',
      a1c_above: 'HbA1c над целта',
      thyroid: 'Тиреоидна функция извън целта',
      overbasal: 'Свръхбазализация с инсулин',
      dm_therapy: 'Диабет без лечение със защита на органите',
      nodule_follow: 'Възли за контролна ехография',
    }),
  },
});

export const MODULE_IDS = Object.keys(MODULES);

/** Включените модули от настройките на практиката. */
export const enabledModules = (settings) => MODULE_IDS.filter(id => settings?.modules?.[id]);

const CARDIO_CONDS = ['hf', 'af', 'chd', 'htn', 'dyslip', 'pad', 'stroke'];
const ENDO_CONDS = ['dm1', 'dm2', 'prediabetes', 'hypothyroid', 'obesity', 'osteoporosis'];

/** Има ли в досието нещо, което засяга модула (за справките — да не се смята излишно). */
export function relevantTo(module, p) {
  const conds = activeConditions(p).map(c => c.code);
  const studies = (p.studies || []).map(s => s.kind);
  if (module === 'cardio') {
    return conds.some(c => CARDIO_CONDS.includes(c))
      || studies.some(k => ['echo', 'ecg', 'abpm', 'hbpm', 'holter', 'nyha'].includes(k))
      || activeMeds(p).some(m => m.drug && ['DOAC', 'VKA', 'STATIN'].some(c => classesOf(m.drug).has(c)));
  }
  return conds.some(c => ENDO_CONDS.includes(c)) || (p.nodules || []).length > 0
    || studies.some(k => ['cgm', 'smbg', 'foot'].includes(k))
    || (p.results || []).some(r => r.code === 'tsh' || r.code === 'hba1c')
    || activeMeds(p).some(m => m.drug && ['INSULIN', 'LEVOTHYROXINE', 'ANTITHYROID'].some(c => classesOf(m.drug).has(c)));
}

/** Обобщението на модула за един пациент (`a` — обобщението за възрастен). */
export function moduleSummary(module, p, a, asOf) {
  return module === 'cardio' ? cardioSummary(p, a, asOf) : endoSummary(p, a, asOf);
}
