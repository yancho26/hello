/* Асистентът: преглежда досието и подсказва, когато състоянието на пациента
 * изисква допълнителна проверка или изследване.
 *
 * Работи изцяло на компютъра на практиката. Съчетава три източника:
 *   1. клинични правила — отклонени резултати, промени във времето,
 *      показатели, пропуснат скрининг и лечение, което изисква контрол;
 *   2. четене на текста на прегледите — тревожни оплаквания (кръв в
 *      изпражненията, задух, болка в гърдите…) с отчитане на отрицанието
 *      („без болка в гърдите“ не е сигнал);
 *   3. сигналите, които програмата вече изчислява — проследяване по
 *      заболяванията, лекарства, психично здраве, растеж, специалности.
 *
 * Всяка подсказка казва какво да се направи, защо (конкретните стойности и
 * дати) и по коя насока. Решението остава на лекаря. Общо за сървъра и
 * интерфейса. */

import { table } from './table.js';
import { addDays, addMonths, daysBetween, formatDate, monthsBetween } from './dates.js';
import { LABS, egfrSeries, formatLab, isCheck, rangeFor, resultSeries } from './labs.js';
import { activeConditions } from './chronic.js';
import { activeMeds, medLabel } from './meds.js';
import { classesOf } from './drugs.js';
import { TOOLS } from './mental.js';
import { fib4 } from './clinical.js';
import { efPhenotype, pillarsFor } from './cardio.js';
import { cite } from './guidelines.js';

/* ------------------------------ речник ------------------------------ */

export const SEVERITY = table({
  3: { label: 'спешно', hint: 'днес или до няколко дни' },
  2: { label: 'скоро', hint: 'в следващите седмици' },
  1: { label: 'планово', hint: 'при следващото посещение' },
});

export const CATEGORIES = table({
  symptom: 'Оплаквания от прегледите',
  lab: 'Отклонени резултати',
  trend: 'Промяна във времето',
  vital: 'Показатели',
  screening: 'Скрининг',
  therapy: 'Лечение',
  monitoring: 'Диспансерно проследяване',
  diagnosis: 'Възможна диагноза',
  mental: 'Психично здраве',
  growth: 'Растеж и развитие',
  prevention: 'Профилактика',
  specialty: 'Специалност',
});

/** Възможни решения на лекаря по подсказка. */
export const FEEDBACK = table({
  accepted: 'Прието',
  done: 'Направено',
  snoozed: 'Отложено',
  dismissed: 'Не е приложимо',
});

/* ------------------------------ помощни ------------------------------ */

const dec = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
const lab = (code, v) => formatLab(code, v);
const when = (d) => formatDate(d);
/* Навършените години по календара — в деня на рождения ден възрастта вече е новата. */
const years = (p, asOf) => (p.birthDate ? monthsBetween(p.birthDate, asOf) / 12 : 0);

/** Най-новият резултат за изследване, ако не е по-стар от `months` месеца. */
function latest(p, code, asOf, months = 18) {
  const s = resultSeries(p.results || [], code).filter(r => r.date <= asOf);
  const r = s[s.length - 1];
  return r && r.date >= addMonths(asOf, -months) ? r : null;
}

/** Има ли запис след дадена дата — резултат, преглед/процедура или структурирано изследване. */
function doneSince(p, since, { labs = [], checks = [], studies = [], tools = [] } = {}) {
  if ((p.results || []).some(r => r.date >= since && (labs.includes(r.code) || checks.includes(r.code)))) return true;
  if ((p.studies || []).some(s => s.date >= since && studies.includes(s.kind))) return true;
  if ((p.assessments || []).some(a => a.date >= since && tools.includes(a.tool))) return true;
  return false;
}

/** Колкото по-стар е резултатът, толкова по-ниска е спешността на подсказката. */
function aged(sev, date, asOf) {
  const d = daysBetween(date, asOf);
  if (d > 180) return 1;
  if (d > 30) return Math.min(sev, 2);
  return sev;
}

const medsWith = (meds, classes) => meds.filter(m => m.drug && classes.some(c => classesOf(m.drug).has(c) || m.drug === c));
const names = (meds) => [...new Set(meds.map(medLabel))].join(', ');

/* „51 г.“ в края на изброяване не бива да дава „51 г..“. */
const tidy = (text) => String(text || '').replace(/\.\.(?=\s|$)/g, '.');

function finding(rule, subject, sev, category, title, action, why, source, extra = {}) {
  return {
    key: `${rule}:${subject}`,
    rule, severity: sev, category, title: tidy(title), action: tidy(action),
    why: (Array.isArray(why) ? why : [why]).filter(Boolean),
    source: source || '',
    ...extra,
  };
}

/* ------------------------- правила по резултатите ------------------------- */

const HYPERK_CLASSES = ['ACEI', 'ARB', 'ARNI', 'MRA', 'FINERENONE', 'K_SUPPLEMENT', 'TMP_SMX', 'NSAID'];
const HYPOK_CLASSES = ['LOOP', 'THIAZIDE'];
const HYPONA_CLASSES = ['THIAZIDE', 'SSRI', 'SNRI', 'carbamazepine', 'oxcarbazepine'];
const BLEED_CLASSES = ['DOAC', 'VKA', 'P2Y12', 'ASPIRIN', 'NSAID'];

function labRules(p, ctx) {
  const { asOf, meds, conds, age, sex } = ctx;
  const out = [];

  // Калий.
  const k = latest(p, 'k', asOf, 12);
  if (k && k.value >= 5.5) {
    const culprits = medsWith(meds, HYPERK_CLASSES);
    const severe = k.value >= 6.0;
    out.push(finding('k_high', k.date, aged(severe ? 3 : 2, k.date, asOf), 'lab',
      `Калий ${lab('k', k.value)} — ${severe ? 'тежка ' : ''}хиперкалиемия`,
      severe
        ? `Повторен калий и ЕКГ днес${culprits.length ? `; временно спиране или намаляване на ${names(culprits)}` : ''}.`
        : `Повторен калий до 72 часа${culprits.length ? `; преглед на дозата на ${names(culprits)}` : ''}.`,
      [`K⁺ ${lab('k', k.value)} на ${when(k.date)} (норма 3,5–5,1)`, culprits.length ? `Приема: ${names(culprits)}` : ''],
      cite('kdigo_ckd_2024', 'esc_hf_2026')));
  } else if (k && k.value < 3.5) {
    const culprits = medsWith(meds, HYPOK_CLASSES);
    const severe = k.value < 3.0;
    out.push(finding('k_low', k.date, aged(severe ? 3 : 2, k.date, asOf), 'lab',
      `Калий ${lab('k', k.value)} — хипокалиемия`,
      severe ? 'ЕКГ и заместване на калия; изследване на магнезий; контрол до няколко дни.'
        : `Повторен калий; заместване${culprits.length ? `; търсете причина — ${names(culprits)}` : ''}.`,
      [`K⁺ ${lab('k', k.value)} на ${when(k.date)}`, culprits.length ? `Приема: ${names(culprits)}` : ''],
      'ESC 2024 хипертония (диуретици)'));
  }

  // Натрий.
  const na = latest(p, 'na', asOf, 12);
  if (na && na.value < 130) {
    const culprits = medsWith(meds, HYPONA_CLASSES);
    const severe = na.value < 125;
    out.push(finding('na_low', na.date, aged(severe ? 3 : 2, na.date, asOf), 'lab',
      `Натрий ${lab('na', na.value)} — ${severe ? 'изразена ' : ''}хипонатриемия`,
      `${severe ? 'Спешна оценка на състоянието и повторен натрий' : 'Повторен натрий до седмица'}${culprits.length ? `; преглед на ${names(culprits)}` : ''}; оценка на обема и осмолалитета.`,
      [`Na⁺ ${lab('na', na.value)} на ${when(na.date)} (норма 135–145)`, culprits.length ? `Приема: ${names(culprits)}` : ''],
      'European Hyponatraemia Guideline 2014'));
  } else if (na && na.value > 150) {
    out.push(finding('na_high', na.date, aged(2, na.date, asOf), 'lab',
      `Натрий ${lab('na', na.value)} — хипернатриемия`,
      'Оценка на хидратацията и приема на течности; повторен натрий.',
      `Na⁺ ${lab('na', na.value)} на ${when(na.date)}`, ''));
  }

  // Хемоглобин и анемия.
  const hb = latest(p, 'hb', asOf, 12);
  const hbRange = rangeFor('hb', sex);
  const ferritin = latest(p, 'ferritin', asOf, 12);
  if (hb && hbRange && hb.value < hbRange[0] && age >= 18) {
    const fe = ferritin && Math.abs(daysBetween(ferritin.date, hb.date)) <= 90 ? ferritin : null;
    const ida = fe && fe.value < 30;
    const giWorkup = ida && (sex === 'm' || age >= 50);
    const bleeders = medsWith(meds, BLEED_CLASSES);
    let sev = hb.value < 80 ? 3 : 2;
    if (giWorkup) sev = Math.max(sev, age >= 60 ? 3 : 2);
    let action;
    if (!fe) action = 'Феритин, витамин B12, фолиева киселина, ретикулоцити и CRP; при нужда — окултна кръв (FIT).';
    else if (giWorkup) action = 'Желязодефицитна анемия: насочване за гастро- и колоноскопия, изследване за целиакия; желязо.';
    else if (ida) action = 'Желязодефицитна анемия: търсете източник на загуба (менструации, храносмилане), желязо и контрол след 4 седмици.';
    else action = 'Анемия без недоимък на желязо: B12, фолиева киселина, бъбречна функция, ретикулоцити; при неясна причина — хематолог.';
    out.push(finding('anemia', hb.date, aged(sev, hb.date, asOf), 'lab',
      `Анемия — Hb ${lab('hb', hb.value)}${ida ? ' с нисък феритин' : ''}`,
      action,
      [`Hb ${lab('hb', hb.value)} на ${when(hb.date)} (норма ${hbRange[0]}–${hbRange[1]})`,
        fe ? `Феритин ${lab('ferritin', fe.value)} на ${when(fe.date)}` : 'Няма феритин около тази дата',
        bleeders.length ? `Приема лекарства, повишаващи риска от кървене: ${names(bleeders)}` : ''],
      giWorkup ? 'BSG 2021 желязодефицитна анемия; NICE NG12' : cite('who_anemia_2024')));
  }

  // Спад на хемоглобина, дори в границите на нормата.
  const hbS = resultSeries(p.results || [], 'hb').filter(r => r.date <= asOf && r.date >= addMonths(asOf, -12));
  if (hbS.length >= 2 && !out.some(x => x.rule === 'anemia')) {
    const last = hbS[hbS.length - 1];
    const prevMax = hbS.slice(0, -1).reduce((m, r) => (r.value > m.value ? r : m));
    if (prevMax.value - last.value >= 20) {
      const bleeders = medsWith(meds, BLEED_CLASSES);
      out.push(finding('hb_drop', last.date, aged(2, last.date, asOf), 'trend',
        `Спад на хемоглобина с ${Math.round(prevMax.value - last.value)} g/L`,
        `Повторна ПКК; търсете кървене${bleeders.length ? ` (приема ${names(bleeders)})` : ''}; феритин.`,
        [`Hb ${lab('hb', prevMax.value)} на ${when(prevMax.date)}`, `Hb ${lab('hb', last.value)} на ${when(last.date)}`],
        ''));
    }
  }

  // Тромбоцити и левкоцити.
  const plt = latest(p, 'plt', asOf, 12);
  if (plt && plt.value < 100) {
    out.push(finding('plt_low', plt.date, aged(plt.value < 50 ? 3 : 2, plt.date, asOf), 'lab',
      `Тромбоцити ${lab('plt', plt.value)} — тромбоцитопения`,
      'Повторна ПКК с натривка (изключете агрегация); чернодробни проби; преглед на лекарствата; при потвърждение — хематолог.',
      `Тромб. ${lab('plt', plt.value)} на ${when(plt.date)} (норма 150–400)`, ''));
  } else if (plt && plt.value > 450) {
    out.push(finding('plt_high', plt.date, aged(plt.value > 600 ? 2 : 1, plt.date, asOf), 'lab',
      `Тромбоцити ${lab('plt', plt.value)} — тромбоцитоза`,
      `Повторна ПКК след 2–4 седмици; CRP, феритин${age >= 40 ? '; при персистиране без ясна причина — оценка за злокачествено заболяване' : ''}.`,
      `Тромб. ${lab('plt', plt.value)} на ${when(plt.date)}`,
      age >= 40 ? 'NICE NG12' : ''));
  }
  const wbc = latest(p, 'wbc', asOf, 12);
  if (wbc && (wbc.value < 3 || wbc.value > 15)) {
    out.push(finding('wbc', wbc.date, aged(wbc.value < 2 || wbc.value > 25 ? 3 : 2, wbc.date, asOf), 'lab',
      `Левкоцити ${lab('wbc', wbc.value)} — ${wbc.value < 3 ? 'левкопения' : 'левкоцитоза'}`,
      'Повторна ПКК с диференциално броене; търсете инфекция и лекарствена причина; при персистиране — хематолог.',
      `Левк. ${lab('wbc', wbc.value)} на ${when(wbc.date)} (норма 4–10)`, ''));
  }

  // Бъбречна функция.
  const eg = egfrSeries(p).filter(r => r.date <= asOf);
  const egLast = eg[eg.length - 1];
  if (egLast && egLast.date >= addMonths(asOf, -18)) {
    const base = eg.filter(r => r.date >= addMonths(egLast.date, -24) && daysBetween(r.date, egLast.date) >= 90)[0];
    if (base) {
      const yearsApart = daysBetween(base.date, egLast.date) / 365.25;
      const drop = base.value - egLast.value;
      const perYear = drop / Math.max(yearsApart, 0.25);
      if ((drop >= 5 && perYear > 5) || (drop / base.value >= 0.25 && egLast.value < 60)) {
        const nephro = medsWith(meds, ['NSAID', 'LITHIUM']);
        out.push(finding('egfr_decline', egLast.date, aged(2, egLast.date, asOf), 'trend',
          `Бързо спадаща бъбречна функция — eGFR ${base.value} → ${egLast.value}`,
          `Повторни креатинин и UACR; изключете остро увреждане и обструкция${nephro.length ? `; спрете или преразгледайте ${names(nephro)}` : ''}; обсъдете нефролог.`,
          [`eGFR ${base.value} на ${when(base.date)}`, `eGFR ${egLast.value} на ${when(egLast.date)} (около ${Math.round(perYear)} mL/min/1,73 m² на година)`],
          'KDIGO 2024 (бърза прогресия >5 на година)'));
      }
    }
    if (egLast.value < 30) {
      out.push(finding('egfr_low', egLast.date, aged(2, egLast.date, asOf), 'lab',
        `eGFR ${egLast.value} — тежко намалена бъбречна функция`,
        'Насочване към нефролог (ако още не се проследява); преглед на дозите на всички лекарства.',
        `eGFR ${egLast.value} на ${when(egLast.date)}`, 'KDIGO 2024'));
    } else if (egLast.value < 60 && !conds.has('ckd') && !latest(p, 'uacr', asOf, 12)) {
      out.push(finding('uacr_missing', egLast.date, 1, 'lab',
        `eGFR ${egLast.value} без изследван албумин в урината`,
        'Съотношение албумин/креатинин в урината (UACR) и повторен креатинин след 3 месеца — за стадиране на ХБЗ.',
        `eGFR ${egLast.value} на ${when(egLast.date)}; няма UACR в последната година`, 'KDIGO 2024'));
    }
  }

  // Чернодробни ензими.
  for (const code of ['alt', 'ast']) {
    const r = latest(p, code, asOf, 12);
    const rg = rangeFor(code, sex);
    if (!r || !rg) continue;
    const x = r.value / rg[1];
    if (x > 3) {
      const culprits = medsWith(meds, ['STATIN', 'METHOTREXATE', 'AMIODARONE', 'AZATHIOPRINE', 'valproate', 'FEBUXOSTAT', 'AZOLE']);
      out.push(finding('liver_high', `${code}:${r.date}`, aged(x > 5 ? 3 : 2, r.date, asOf), 'lab',
        `${LABS[code].short} ${lab(code, r.value)} — над 3 пъти горната граница`,
        `Повторни чернодробни проби с билирубин и алкална фосфатаза; хепатит B и C; алкохол${culprits.length ? `; преглед на ${names(culprits)}` : ''}; ехография.`,
        [`${LABS[code].short} ${lab(code, r.value)} на ${when(r.date)} (горна граница ${rg[1]})`, culprits.length ? `Приема: ${names(culprits)}` : ''],
        'EASL 2024'));
      break;
    }
  }
  const altS = resultSeries(p.results || [], 'alt').filter(r => r.date <= asOf);
  const altRange = rangeFor('alt', sex);
  if (altRange && altS.length >= 2 && !out.some(x => x.rule === 'liver_high') && !conds.has('masld')) {
    const last = altS[altS.length - 1];
    const older = altS.find(r => daysBetween(r.date, last.date) >= 180 && r.value > altRange[1]);
    if (last.value > altRange[1] && older && last.date >= addMonths(asOf, -12)) {
      out.push(finding('liver_persist', last.date, 1, 'lab',
        'Упорито повишен АЛАТ за повече от 6 месеца',
        'Изчислете FIB-4 (АЛАТ, АСАТ, тромбоцити); ехография на черния дроб; хепатит B и C; алкохол; метаболитни рискови фактори (MASLD).',
        [`АЛАТ ${lab('alt', older.value)} на ${when(older.date)}`, `АЛАТ ${lab('alt', last.value)} на ${when(last.date)}`],
        'EASL–EASD–EASO 2024 (MASLD)'));
    }
  }

  // Щитовидна жлеза без поставена диагноза и без лечение.
  const onLt4 = medsWith(meds, ['LEVOTHYROXINE']).length > 0;
  const onAtd = medsWith(meds, ['ANTITHYROID']).length > 0;
  const tsh = latest(p, 'tsh', asOf, 12);
  if (tsh && !onLt4 && !onAtd && !conds.has('hypothyroid')) {
    if (tsh.value > 10) {
      out.push(finding('tsh_high', tsh.date, aged(2, tsh.date, asOf), 'lab',
        `TSH ${lab('tsh', tsh.value)} — хипотиреоидизъм?`,
        'Повторни TSH и fT4 с anti-TPO; при потвърждение — лечение с левотироксин.',
        `TSH ${lab('tsh', tsh.value)} на ${when(tsh.date)}`, 'ETA 2013 субклиничен хипотиреоидизъм'));
    } else if (tsh.value > 4.5) {
      out.push(finding('tsh_high', tsh.date, 1, 'lab',
        `TSH ${lab('tsh', tsh.value)} — леко повишен`,
        'Повторни TSH и fT4 след 2–3 месеца; anti-TPO.',
        `TSH ${lab('tsh', tsh.value)} на ${when(tsh.date)}`, 'ETA 2013'));
    } else if (tsh.value < 0.1) {
      out.push(finding('tsh_low', tsh.date, aged(2, tsh.date, asOf), 'lab',
        `TSH ${lab('tsh', tsh.value)} — потиснат`,
        'fT4, fT3 и TRAb; ЕКГ (предсърдно мъждене); при потвърдена тиреотоксикоза — ендокринолог.',
        `TSH ${lab('tsh', tsh.value)} на ${when(tsh.date)}`, 'ETA 2018 хипертиреоидизъм'));
    }
  }
  if (tsh && onLt4 && age >= 65 && tsh.value < 0.1 && !ctx.modules?.endo) {
    out.push(finding('lt4_over', tsh.date, aged(2, tsh.date, asOf), 'therapy',
      `Потиснат TSH при лечение с левотироксин на ${Math.floor(age)} г.`,
      'Намалете дозата и повторете TSH след 6–8 седмици — свръхлечението увеличава риска от предсърдно мъждене и остеопороза.',
      `TSH ${lab('tsh', tsh.value)} на ${when(tsh.date)}`, 'ETA 2013'));
  }

  // Калций.
  const ca = latest(p, 'ca', asOf, 12);
  if (ca && ca.value > 2.6) {
    out.push(finding('ca_high', ca.date, aged(ca.value > 3.0 ? 3 : 2, ca.date, asOf), 'lab',
      `Калций ${lab('ca', ca.value)} — хиперкалциемия`,
      'Повторен калций (коригиран с албумин) и паратхормон; креатинин; при нисък PTH — търсене на злокачествено заболяване.',
      `Ca ${lab('ca', ca.value)} на ${when(ca.date)} (норма 2,15–2,55)`, ''));
  }

  // PSA.
  const psa = latest(p, 'psa', asOf, 12);
  if (psa && sex === 'm' && psa.value >= 3) {
    out.push(finding('psa_high', psa.date, aged(2, psa.date, asOf), 'lab',
      `PSA ${lab('psa', psa.value)}`,
      'Повторен PSA след няколко седмици (без инфекция, без скорошен преглед на простатата); при потвърждение — уролог и мултипараметричен ЯМР.',
      `PSA ${lab('psa', psa.value)} на ${when(psa.date)}`, cite('eau_prostate_2026')));
  }

  // NT-proBNP без поставена сърдечна недостатъчност.
  const bnp = latest(p, 'ntprobnp', asOf, 12);
  if (bnp && bnp.value > 125 && !conds.has('hf')) {
    const echoed = doneSince(p, bnp.date, { checks: ['echo'], studies: ['echo'] });
    if (!echoed) {
      const sev = bnp.value >= 2000 ? 3 : bnp.value >= 400 ? 2 : 1;
      out.push(finding('bnp_nohf', bnp.date, aged(sev, bnp.date, asOf), 'lab',
        `NT-proBNP ${lab('ntprobnp', bnp.value)} без диагноза сърдечна недостатъчност`,
        `Ехокардиография${sev === 3 ? ' и кардиолог до 2 седмици' : sev === 2 ? ' и кардиолог до 6 седмици' : ' при съответни оплаквания'}; ЕКГ.`,
        `NT-proBNP ${lab('ntprobnp', bnp.value)} на ${when(bnp.date)}`, 'NICE NG106; ESC 2026 СН'));
    }
  }

  // B12 и желязо без анемия.
  const b12 = latest(p, 'b12', asOf, 12);
  if (b12 && b12.value < 150) {
    const cause = medsWith(meds, ['METFORMIN', 'PPI']);
    out.push(finding('b12_low', b12.date, aged(2, b12.date, asOf), 'lab',
      `Витамин B12 ${lab('b12', b12.value)} — недоимък`,
      `Заместване с B12${cause.length ? `; причина може да е ${names(cause)}` : ''}; при неясна причина — антитела срещу вътрешния фактор.`,
      `B12 ${lab('b12', b12.value)} на ${when(b12.date)}`, 'BSH 2014'));
  }
  if (ferritin && ferritin.value < 15 && !out.some(x => x.rule === 'anemia')) {
    out.push(finding('iron_low', ferritin.date, 1, 'lab',
      `Феритин ${lab('ferritin', ferritin.value)} — недоимък на желязо`,
      `Търсете източник на загуба; желязо${sex === 'm' || age >= 50 ? '; при мъж или жена след менопауза — оценка на храносмилателната система' : ''}.`,
      `Феритин ${lab('ferritin', ferritin.value)} на ${when(ferritin.date)}`, 'BSG 2021'));
  }

  // Антикоагулация с варфарин / аценокумарол и литий.
  const inr = latest(p, 'inr', asOf, 3);
  if (inr && medsWith(meds, ['VKA']).length && (inr.value > 3.5 || inr.value < 1.8)) {
    const high = inr.value > 3.5;
    out.push(finding('inr', inr.date, aged(high && inr.value > 4.5 ? 3 : 2, inr.date, asOf), 'therapy',
      `INR ${lab('inr', inr.value)} — ${high ? 'над' : 'под'} целевия диапазон`,
      high ? 'Пропуснете доза, намалете дозата и контролирайте INR до 2–3 дни; попитайте за кървене.'
        : 'Проверете приема и храната; коригирайте дозата и контролирайте INR до седмица.',
      `INR ${lab('inr', inr.value)} на ${when(inr.date)} (цел 2,0–3,0)`, 'ESC 2024 ПМ'));
  }
  const li = latest(p, 'lithium', asOf, 6);
  if (li && li.value > 1.0) {
    out.push(finding('lithium_high', li.date, aged(li.value > 1.5 ? 3 : 2, li.date, asOf), 'therapy',
      `Литий ${lab('lithium', li.value)} — над терапевтичния диапазон`,
      'Оценка за токсичност (тремор, объркване, диария); повторно ниво 12 часа след дозата; креатинин; намалете дозата.',
      `Литий ${lab('lithium', li.value)} на ${when(li.date)} (0,4–1,0)`, 'NICE CG185'));
  }

  // Влошаване на гликемията при диабет.
  if (conds.has('dm2') || conds.has('dm1')) {
    const s = resultSeries(p.results || [], 'hba1c').filter(r => r.date <= asOf);
    const last = s[s.length - 1];
    const prev = s.slice(0, -1).reverse().find(r => daysBetween(r.date, last.date) <= 400 && daysBetween(r.date, last.date) >= 60);
    if (last && prev && last.value - prev.value >= 1 && last.date >= addMonths(asOf, -6)) {
      out.push(finding('a1c_rise', last.date, 2, 'trend',
        `HbA1c се повишава — ${dec(prev.value)} → ${dec(last.value)}%`,
        'Преглед на лечението и придържането към него; самоконтрол; обсъдете засилване на терапията.',
        [`HbA1c ${dec(prev.value)}% на ${when(prev.date)}`, `HbA1c ${dec(last.value)}% на ${when(last.date)}`],
        'ADA/EASD 2022 консенсус'));
    }
  }

  // Упорито възпаление.
  const crp = resultSeries(p.results || [], 'crp').filter(r => r.date <= asOf && r.date >= addMonths(asOf, -4));
  if (crp.length >= 2) {
    const last = crp[crp.length - 1];
    const first = crp.find(r => r.value > 10 && daysBetween(r.date, last.date) >= 28);
    if (last.value > 10 && first) {
      out.push(finding('crp_persist', last.date, 1, 'trend',
        `CRP остава повишен повече от 4 седмици (${lab('crp', last.value)})`,
        'Търсете огнище на инфекция, автоимунно или злокачествено заболяване: ПКК, урина, рентгенография.',
        [`CRP ${lab('crp', first.value)} на ${when(first.date)}`, `CRP ${lab('crp', last.value)} на ${when(last.date)}`], ''));
    }
  }
  return out;
}

/* ------------------------------ показатели ------------------------------ */

function vitalRules(p, ctx) {
  const { asOf, meds, age } = ctx;
  const out = [];
  const ms = (p.measurements || []).filter(m => m.date <= asOf).sort((a, b) => (a.date < b.date ? -1 : 1));

  const bpDay = ms.filter(m => m.systolic && m.diastolic);
  const lastBpDate = bpDay.length ? bpDay[bpDay.length - 1].date : null;
  if (lastBpDate && lastBpDate >= addMonths(asOf, -3)) {
    const same = bpDay.filter(m => m.date === lastBpDate);
    const sys = Math.round(same.reduce((s, m) => s + m.systolic, 0) / same.length);
    const dia = Math.round(same.reduce((s, m) => s + m.diastolic, 0) / same.length);
    if (sys >= 180 || dia >= 110) {
      out.push(finding('bp_severe', lastBpDate, aged(3, lastBpDate, asOf), 'vital',
        `Налягане ${sys}/${dia} — тежка хипертония`,
        'Повторно измерване; оценка за засягане на органи (главоболие, болка в гърдите, неврологични симптоми, ЕКГ, креатинин, урина); незабавна корекция на лечението.',
        `АН ${sys}/${dia} mmHg на ${when(lastBpDate)}`, 'ESC 2024 хипертония'));
    }
  }

  const pulseM = [...ms].reverse().find(m => Number.isFinite(m.pulse));
  if (pulseM && pulseM.date >= addMonths(asOf, -3) && age >= 18) {
    if (pulseM.pulse >= 110) {
      out.push(finding('hr_high', pulseM.date, aged(2, pulseM.date, asOf), 'vital',
        `Пулс ${pulseM.pulse}/мин в покой`,
        'ЕКГ (предсърдно мъждене, други тахиаритмии); ПКК, TSH; оценка за обезводняване и инфекция.',
        `Пулс ${pulseM.pulse}/мин на ${when(pulseM.date)}`, 'ESC 2024 ПМ'));
    } else if (pulseM.pulse < 45) {
      const brady = medsWith(meds, ['BB', 'BB_NONSEL', 'DIGOXIN', 'CCB_NDHP', 'AMIODARONE', 'ACHEI']);
      out.push(finding('hr_low', pulseM.date, aged(2, pulseM.date, asOf), 'vital',
        `Пулс ${pulseM.pulse}/мин — брадикардия`,
        `ЕКГ (AV блок); питайте за замайване и припадъци${brady.length ? `; преглед на дозата на ${names(brady)}` : ''}.`,
        [`Пулс ${pulseM.pulse}/мин на ${when(pulseM.date)}`, brady.length ? `Приема: ${names(brady)}` : ''], ''));
    }
  }

  // Необяснима загуба на тегло.
  const weights = ms.filter(m => Number.isFinite(m.weight));
  const lastW = weights[weights.length - 1];
  if (lastW && age >= 18 && lastW.date >= addMonths(asOf, -6)) {
    const window6 = weights.filter(m => m.date >= addMonths(lastW.date, -6) && m.date < lastW.date);
    const window12 = weights.filter(m => m.date >= addMonths(lastW.date, -12) && m.date < lastW.date);
    const max6 = window6.reduce((m, x) => (!m || x.weight > m.weight ? x : m), null);
    const max12 = window12.reduce((m, x) => (!m || x.weight > m.weight ? x : m), null);
    const lost6 = max6 ? (max6.weight - lastW.weight) / max6.weight : 0;
    const lost12 = max12 ? (max12.weight - lastW.weight) / max12.weight : 0;
    const intended = medsWith(meds, ['GLP1']).length > 0
      || (p.nutritionPlans || []).some(n => (n.plan?.input?.goal || n.goal) === 'lose' && n.date >= addMonths(lastW.date, -12));
    if (!intended && (lost6 >= 0.05 || lost12 >= 0.10)) {
      const from = lost6 >= 0.05 ? max6 : max12;
      const pct = Math.round((from.weight - lastW.weight) / from.weight * 100);
      out.push(finding('weight_loss', lastW.date, 2, 'vital',
        `Загуба на тегло ${pct}% без диета или лечение за отслабване`,
        'Разпитайте за апетит, храносмилане, кашлица, нощно изпотяване; ПКК, CRP, глюкоза, TSH, чернодробни проби, креатинин, урина; при неясна причина — образно изследване.',
        [`${dec(from.weight)} кг на ${when(from.date)}`, `${dec(lastW.weight)} кг на ${when(lastW.date)}`],
        'NICE NG12 (необяснима загуба на тегло)'));
    }
  }

  const heights = ms.filter(m => Number.isFinite(m.height));
  const h = heights[heights.length - 1];
  if (lastW && h && age >= 18 && lastW.date >= addMonths(asOf, -12)) {
    const bmi = lastW.weight / ((h.height / 100) ** 2);
    if (bmi < 18.5) {
      out.push(finding('bmi_low', lastW.date, 1, 'vital',
        `ИТМ ${dec(Math.round(bmi * 10) / 10)} — поднормено тегло`,
        'Оценка на храненето (MUST); търсете причина — храносмилане, щитовидна жлеза, депресия, хронично заболяване.',
        `${dec(lastW.weight)} кг, ${h.height} см на ${when(lastW.date)}`, 'ESPEN 2019'));
    }
  }
  return out;
}

/* ------------------------------- скрининг ------------------------------- */

function screeningRules(p, ctx) {
  const { asOf, conds, age } = ctx;
  const out = [];
  const lastEcg = [
    ...(p.results || []).filter(r => r.code === 'ecg').map(r => r.date),
    ...(p.studies || []).filter(s => s.kind === 'ecg').map(s => s.date),
  ].sort().pop();
  const afRisk = ['htn', 'dm2', 'dm1', 'hf', 'chd', 'pad', 'stroke'].some(c => conds.has(c));
  if (!conds.has('af') && (age >= 75 || (age >= 65 && afRisk)) && (!lastEcg || lastEcg < addMonths(asOf, -24))) {
    out.push(finding('af_screen', lastEcg || 'never', 1, 'screening',
      'Търсене на предсърдно мъждене',
      'Палпиране на пулса или ЕКГ при следващото посещение.',
      [`${Math.floor(age)} г.${afRisk ? ' с рискови фактори' : ''}`, lastEcg ? `Последна ЕКГ: ${when(lastEcg)}` : 'Няма записана ЕКГ'],
      'ESC 2024 ПМ (опортюнистичен скрининг)'));
  }
  return out;
}

/* ------------------------------- лечение ------------------------------- */

function therapyRules(p, ctx) {
  const { asOf, meds } = ctx;
  const out = [];
  // Нов инхибитор на РААС без контрол на креатинина и калия.
  for (const m of medsWith(meds, ['ACEI', 'ARB', 'ARNI', 'MRA', 'FINERENONE'])) {
    if (!m.start || m.start > asOf) continue;
    const days = daysBetween(m.start, asOf);
    if (days < 7 || days > 90) continue;
    const checked = (p.results || []).some(r => r.date >= m.start && ['creat', 'egfr', 'k'].includes(r.code));
    if (!checked) {
      out.push(finding('raas_start', `${m.id}:${m.start}`, 2, 'therapy',
        `Креатинин и калий след започване на ${medLabel(m)}`,
        'Креатинин (eGFR) и калий 1–2 седмици след започване или повишаване на дозата.',
        `${medLabel(m)} от ${when(m.start)}; няма креатинин и калий след това`, 'ESC 2024 хипертония; ESC 2026 СН'));
    }
  }
  // Нов статин без контрол на LDL.
  for (const m of medsWith(meds, ['STATIN', 'EZETIMIBE', 'PCSK9', 'PCSK9_SIRNA', 'BEMPEDOIC'])) {
    if (!m.start || m.start > asOf) continue;
    const days = daysBetween(m.start, asOf);
    if (days < 42 || days > 180) continue;
    if (!(p.results || []).some(r => r.date >= addDays(m.start, 28) && r.code === 'ldl')) {
      out.push(finding('lipid_start', `${m.id}:${m.start}`, 1, 'therapy',
        `LDL след започване на ${medLabel(m)}`,
        'Липиден профил 4–12 седмици след започване — за да се види дали целта е достигната.',
        `${medLabel(m)} от ${when(m.start)}; няма LDL след това`, cite('esc_lipid_2025')));
      break;
    }
  }
  // Дълъг прием на инхибитор на протонната помпа без посочена причина.
  for (const m of medsWith(meds, ['PPI'])) {
    if (!m.start || m.indication || daysBetween(m.start, asOf) < 365) continue;
    out.push(finding('ppi_long', m.id, 1, 'therapy',
      `${medLabel(m)} повече от година без посочена причина`,
      'Преценете дали е нужен; при липса на показание — постепенно намаляване или прием при нужда.',
      `${medLabel(m)} от ${when(m.start)}`, 'Deprescribing.org 2017'));
    break;
  }
  // Системен кортикостероид повече от 3 месеца.
  for (const m of medsWith(meds, ['CORTICOSTEROID'])) {
    if (!m.start || daysBetween(m.start, asOf) < 90) continue;
    const dxa = (p.results || []).some(r => r.code === 'dxa' && r.date >= addMonths(asOf, -24));
    out.push(finding('steroid_long', m.id, 1, 'therapy',
      `${medLabel(m)} повече от 3 месеца`,
      `Защита на костите: калций и витамин D${dxa ? '' : ', DXA'}, преценка за бифосфонат; глюкоза и налягане.`,
      `${medLabel(m)} от ${when(m.start)}`, 'ACR 2022 (глюкокортикоидна остеопороза)'));
    break;
  }
  return out;
}

/* ------------------- по най-новите насоки (ESC, ADA, USPSTF…) ------------------- */

const LIPID_LOWERING = ['STATIN', 'EZETIMIBE', 'PCSK9', 'PCSK9_SIRNA', 'BEMPEDOIC'];
const ANTIHTN = ['ACEI', 'ARB', 'ARNI', 'CCB_DHP', 'CCB_NDHP', 'THIAZIDE', 'LOOP', 'BB', 'BB_NONSEL', 'MRA', 'ALPHA', 'CENTRAL'];
const ICS_NAME = /будезонид|беклометазон|флутиказон|мометазон|циклезонид|budes|beclo|flutic|momet|cicles|пулмикорт|pulmicort|фликсотид|flixotide|симбикорт|symbicort|фостер|foster|серетид|seretide|релвар|relvar/i;

/** Последната дата на изследване или преглед от дадените кодове. */
function lastDone(p, codes, asOf) {
  return (p.results || []).filter(r => codes.includes(r.code) && r.date <= asOf).map(r => r.date).sort().pop() || null;
}

/** ХБЗ: вписана или eGFR под 60 два пъти поне 3 месеца един след друг (KDIGO). */
function ckdOf(p, conds, asOf) {
  if (conds.has('ckd')) return { why: 'Хронично бъбречно заболяване' };
  const low = egfrSeries(p).filter(r => r.date <= asOf && r.value < 60);
  if (low.length >= 2 && daysBetween(low[0].date, low[low.length - 1].date) >= 90) {
    return { why: `eGFR под 60 от ${when(low[0].date)} (${low[low.length - 1].value} на ${when(low[low.length - 1].date)})` };
  }
  return null;
}

function guidelineRules(p, ctx) {
  const { asOf, meds, conds, age, sex, modules, practice } = ctx;
  const a = ctx.a;
  const out = [];
  const onClass = (classes) => medsWith(meds, classes).length > 0;
  const dm = conds.has('dm1') || conds.has('dm2');
  const ascvd = ['chd', 'pad', 'stroke'].filter(c => conds.has(c));
  const eg = egfrSeries(p).filter(r => r.date <= asOf).pop() || null;
  const uacr = latest(p, 'uacr', asOf, 24);
  const k = latest(p, 'k', asOf, 12);
  const ckd = ckdOf(p, conds, asOf);
  const bmi = a?.vitals?.bmi ?? null;

  // Първичен алдостеронизъм — веднъж при всеки с хипертония.
  if (conds.has('htn') && !lastDone(p, ['arr'], asOf)) {
    const k24 = latest(p, 'k', asOf, 24);
    const hypoK = k24 && k24.value < 3.5;
    const classes = new Set(ANTIHTN.filter(c => onClass([c])));
    const resistant = classes.size >= 3 && (classes.has('THIAZIDE') || classes.has('LOOP'));
    out.push(finding('pa_screen', 'once', hypoK || resistant ? 2 : 1, 'screening',
      'Скрининг за първичен алдостеронизъм',
      'Веднъж: алдостерон и ренин (съотношение) с калий в същия ден. Антихипертензивните лекарства без MRA не се спират; ниският калий се коригира преди това. Положителен резултат — ендокринолог.',
      ['Артериална хипертония без изследван алдостерон/ренин',
        hypoK ? `Калий ${lab('k', k24.value)} на ${when(k24.date)}` : '',
        resistant ? `${classes.size} антихипертензивни групи, включително диуретик — резистентна хипертония` : ''],
      cite('esc_htn_2024', 'es_pa_2025', 'aha_htn_2025')));
  }

  // Lp(a) — поне веднъж в живота; търси се там, където променя решенията.
  const lpaR = latest(p, 'lpa', asOf, 1200);
  const lpanR = latest(p, 'lpan', asOf, 1200);
  if (!lpaR && !lpanR && age >= 18 && age < 80) {
    const ldl = latest(p, 'ldl', asOf, 60);
    const why = [
      ascvd.length ? 'атеросклеротично ССЗ' : '',
      dm ? 'диабет' : '', conds.has('htn') ? 'хипертония' : '', ckd ? 'ХБЗ' : '', conds.has('dyslip') ? 'дислипидемия' : '',
      ldl && ldl.value >= 3.0 ? `LDL ${lab('ldl', ldl.value)} на ${when(ldl.date)}` : '',
    ].filter(Boolean);
    if (why.length) {
      out.push(finding('lpa_once', 'once', 1, 'screening',
        'Lp(a) — веднъж в живота',
        'Добавете Lp(a) към следващия липиден профил. Над 50 mg/dL (105 nmol/L) повишава сърдечно-съдовия риск и налага по-строг контрол на LDL.',
        [`Няма изследван Lp(a); ${why.join(', ')}`], cite('esc_lipid_2025', 'acc_lipid_2026')));
    }
  }
  const lpaHigh = (lpaR && lpaR.value > 50) ? lpaR : (lpanR && lpanR.value > 105) ? lpanR : null;
  if (lpaHigh) {
    const code = lpaHigh === lpaR ? 'lpa' : 'lpan';
    out.push(finding('lpa_high', lpaHigh.date, 1, 'lab',
      `Повишен Lp(a) — ${lab(code, lpaHigh.value)}`,
      'По-интензивно понижаване на LDL и контрол на останалите рискови фактори; Lp(a) и при родителите, братята, сестрите и децата.',
      `Lp(a) ${lab(code, lpaHigh.value)} на ${when(lpaHigh.date)}`, cite('esc_lipid_2025', 'acc_lipid_2026')));
  }

  // Фиброза на черния дроб при метаболитен риск (FIB-4 → еластография).
  const metabolic = conds.has('dm2') || conds.has('prediabetes') || conds.has('masld') || conds.has('obesity') || (bmi !== null && bmi >= 30);
  if (metabolic && age >= 18) {
    const ast = latest(p, 'ast', asOf, 12), alt = latest(p, 'alt', asOf, 12), plt = latest(p, 'plt', asOf, 12);
    const f = ast && alt && plt ? fib4(age, ast.value, alt.value, plt.value) : null;
    const date = f ? [ast.date, alt.date, plt.date].sort().pop() : null;
    if (f && f.category !== 'low') {
      const elasto = lastDone(p, ['elasto'], asOf);
      if (!elasto || elasto < date) {
        const high = f.category === 'high';
        out.push(finding('fib4', date, high ? 2 : 1, 'lab',
          `FIB-4 ${dec(f.value)} — ${high ? 'висок' : 'неопределен'} риск от напреднала фиброза`,
          high ? 'Насочване към гастроентеролог или хепатолог; еластография.' : 'Еластография (FibroScan): под 8 kPa — нисък риск; 8 kPa и повече — хепатолог.',
          [`АСАТ ${lab('ast', ast.value)}, АЛАТ ${lab('alt', alt.value)}, тромбоцити ${lab('plt', plt.value)}; ${Math.floor(age)} г.`],
          cite('easl_masld_2024', 'ada_2026')));
      }
    }
  }

  // Бъбречна и сърдечно-съдова защита при ХБЗ.
  if (ckd && eg && eg.value >= 20 && !conds.has('dm1') && !onClass(['SGLT2'])) {
    // Силна препоръка (KDIGO 1A): диабет тип 2, СН, UACR ≥22,6 mg/mmol; eGFR под 45 — 2B.
    // ESC 2026: при повечето пациенти с ХБЗ — тогава планово, с UACR преди решението.
    const strong = conds.has('dm2') || conds.has('hf') || (uacr && uacr.value >= 22.6) || eg.value < 45;
    out.push(finding('sglt2_ckd', 'ckd', strong ? 2 : 1, 'therapy',
      'ХБЗ без SGLT2-инхибитор',
      strong
        ? 'Дапаглифлозин или емпаглифлозин 10 мг веднъж дневно; започва се при eGFR 20 и повече и продължава до диализа. Преходен спад на eGFR в началото е очакван.'
        : `Обмислете дапаглифлозин или емпаглифлозин — ESC 2026 ги препоръчва при повечето пациенти с ХБЗ.${uacr ? '' : ' Първо UACR: при албуминурия ползата е най-ясна.'}`,
      [ckd.why, conds.has('ckd') ? `eGFR ${eg.value} на ${when(eg.date)}` : '', uacr ? `UACR ${lab('uacr', uacr.value)} на ${when(uacr.date)}` : ''],
      cite('esc_ckd_2026', 'kdigo_ckd_2024')));
  }
  if (uacr && (uacr.value >= 30 || (uacr.value >= 3 && (dm || conds.has('htn') || ckd))) && !onClass(['ACEI', 'ARB', 'ARNI'])) {
    out.push(finding('raas_alb', uacr.date, 2, 'therapy',
      'Албуминурия без ACE-инхибитор или сартан',
      'ACE-инхибитор или сартан до максималната поносима доза; креатинин и калий след 2–4 седмици.',
      `UACR ${lab('uacr', uacr.value)} на ${when(uacr.date)}`, cite('kdigo_ckd_2024', 'esc_ckd_2026')));
  }
  if (conds.has('dm2') && ckd && uacr && uacr.value >= 3 && eg && eg.value >= 25) {
    const extra = [
      !onClass(['FINERENONE']) && (!k || k.value <= 5.0) ? 'финеренон 10–20 мг на фона на ACE-инхибитор или сартан (при калий до 5,0)' : '',
      !onClass(['GLP1']) ? 'семаглутид' : '',
    ].filter(Boolean);
    if (extra.length) {
      out.push(finding('t2d_ckd', 'albuminuria', 1, 'therapy',
        'Диабет тип 2, ХБЗ и албуминурия: допълнителна защита',
        `Обмислете ${extra.join(' и ')} — ${extra.length > 1 ? 'намаляват' : 'намалява'} прогресията на ХБЗ и сърдечно-съдовите събития.`,
        [`UACR ${lab('uacr', uacr.value)} на ${when(uacr.date)}`, `eGFR ${eg.value}`], cite('esc_ckd_2026', 'ada_2026')));
    }
  }

  // Статин: ССЗ, диабет 40–75 г., ХБЗ от 40 г.
  if (!onClass(LIPID_LOWERING) && age < 85) {
    const why = [
      ascvd.length ? 'атеросклеротично ССЗ' : '',
      dm && age >= 40 && age <= 75 ? `диабет, ${Math.floor(age)} г.` : '',
      ckd && age >= 40 ? 'ХБЗ' : '',
    ].filter(Boolean);
    if (why.length) {
      out.push(finding('statin', why.join(','), ascvd.length ? 2 : 1, 'therapy',
        'Без липидопонижаващо лечение',
        'Статин, ако няма противопоказания; при непоносимост — езетимиб или бемпедоева киселина. Липиден профил 4–12 седмици след започване.',
        [`Показание: ${why.join(', ')}`],
        cite(...[ascvd.length || dm ? 'esc_dm_2023' : null, 'esc_lipid_2025', dm ? 'ada_2026' : null, ckd ? 'esc_ckd_2026' : null, 'acc_lipid_2026'].filter(Boolean))));
    }
  }

  // Сърдечна недостатъчност — основното лечение (в СИМП с кардиологичния модул е в раздела му).
  if (conds.has('hf') && !modules.cardio) {
    const phenotype = efPhenotype((p.studies || []).filter(st => st.kind === 'echo').sort((x, y) => (x.date < y.date ? -1 : 1)));
    const pillars = pillarsFor(phenotype);
    const labels = { raas: 'ARNI/ACEi/ARB', bb: 'бета-блокер', mra: 'MRA', sglt2: 'SGLT2-инхибитор' };
    const present = {
      raas: onClass(['ACEI', 'ARB', 'ARNI']), bb: onClass(['BB', 'BB_NONSEL']),
      mra: onClass(['MRA', 'FINERENONE']), sglt2: onClass(['SGLT2']),
    };
    const blocked = {
      mra: (k && k.value > 5.0) || (eg && eg.value < 30),
      sglt2: eg && eg.value < 20,
      raas: k && k.value > 5.0,
    };
    const missing = pillars.filter(x => !present[x] && !blocked[x]);
    if (missing.length) {
      out.push(finding('hf_foundation', `${phenotype?.id || 'unknown'}:${missing.join(',')}`, 2, 'therapy',
        `Сърдечна недостатъчност без ${missing.map(x => labels[x]).join(', ')}`,
        phenotype?.id === 'hfpef'
          ? 'Основно лечение при запазена ФИ: MRA и SGLT2-инхибитор. При ИТМ 30 и повече — и семаглутид или тирзепатид.'
          : 'Основно лечение при ФИ под 50%: ARNI/ACEi/ARB, бета-блокер, MRA и SGLT2-инхибитор, започнати бързо, после до целевите дози.',
        [phenotype ? `ФИ ${phenotype.ef}% на ${when(phenotype.date)}` : 'Няма въведена фракция на изтласкване'],
        cite('esc_hf_2026')));
    }
    const echoDone = lastDone(p, ['echo'], asOf) || (p.studies || []).some(st => st.kind === 'echo');
    if (!echoDone) {
      out.push(finding('hf_echo', 'never', 1, 'therapy',
        'Сърдечна недостатъчност без ехокардиография',
        'Ехокардиография — фракцията на изтласкване определя лечението (граница 50%).',
        ['Няма записана ехокардиография'], cite('esc_hf_2026')));
    }
  }

  // Астма, лекувана само с бързодействащ бета-агонист.
  if (conds.has('asthma') && onClass(['SABA']) && !onClass(['ICS'])
    && !meds.some(m => !m.drug && ICS_NAME.test(m.name || ''))) {
    out.push(finding('asthma_saba', 'saba_only', 2, 'therapy',
      'Астма само с бързодействащ бета-агонист',
      'Противовъзпалителен облекчаващ инхалатор (ИКС-формотерол при нужда) или поддържащ инхалаторен кортикостероид; проверка на техниката.',
      [`Приема ${names(medsWith(meds, ['SABA']))} без инхалаторен кортикостероид`], cite('gina_2026')));
  }

  // Скрининг за диабет (ADA 2026): от 35 г. и при наднормено тегло с рисков фактор.
  // В практиката на ОПЛ календарът покрива всички от 40 г.
  if (!dm && !conds.has('prediabetes') && age >= 18 && (practice !== 'gp' || age < 40)) {
    const last = lastDone(p, ['glucose', 'hba1c'], asOf);
    if (!last || last < addMonths(asOf, -36)) {
      const hdl = latest(p, 'hdl', asOf, 36), tg = latest(p, 'tg', asOf, 36);
      const risk = [
        conds.has('htn') ? 'хипертония' : '', ascvd.length ? 'ССЗ' : '',
        conds.has('dyslip') || (hdl && hdl.value < 0.9) || (tg && tg.value > 2.82) ? 'дислипидемия' : '',
        p.lifestyle?.activity === 'sedentary' ? 'заседнал начин на живот' : '',
      ].filter(Boolean);
      const overweight = bmi !== null && bmi >= 25;
      if (age >= 35 || (overweight && risk.length)) {
        out.push(finding('dm_screen', last || 'never', 1, 'screening',
          'Скрининг за диабет',
          'Глюкоза на гладно или HbA1c; при нормален резултат — повторно след 3 години.',
          [age >= 35 ? `${Math.floor(age)} г.` : `ИТМ ${dec(bmi)} и ${risk.join(', ')}`,
            last ? `Последна глюкоза или HbA1c: ${when(last)}` : 'Няма глюкоза или HbA1c'],
          cite('ada_2026')));
      }
    }
  }

  // Аневризма на коремната аорта (ESC 2024; USPSTF 2019).
  const smoking = p.lifestyle?.smoking;
  const everSmoked = smoking === 'current' || smoking === 'former';
  const aaaWhy = sex === 'm' && age >= 65 && everSmoked ? `мъж на ${Math.floor(age)} г., ${smoking === 'current' ? 'пушач' : 'бивш пушач'}`
    : sex === 'm' && age >= 75 ? `мъж на ${Math.floor(age)} г.`
      : sex === 'f' && age >= 75 && (smoking === 'current' || conds.has('htn')) ? `жена на ${Math.floor(age)} г., ${smoking === 'current' ? 'пушачка' : 'с хипертония'}` : '';
  if (aaaWhy && age < 85 && !lastDone(p, ['aaa_us'], asOf)) {
    out.push(finding('aaa_screen', 'once', 1, 'screening',
      'Скрининг за аневризма на коремната аорта',
      'Еднократна ехография на коремната аорта.',
      [aaaWhy], cite('esc_aorta_2024', 'uspstf_aaa_2019')));
  }

  // Остеопороза при жени: от 65 г. и след менопауза с рисков фактор (USPSTF 2025).
  if (sex === 'f' && age >= 50 && age < 90 && !conds.has('osteoporosis') && !onClass(['BISPHOSPHONATE'])) {
    const lastDxa = lastDone(p, ['dxa'], asOf);
    if (!lastDxa || lastDxa < addMonths(asOf, -120)) {
      const risk = [
        smoking === 'current' ? 'тютюнопушене' : '', p.lifestyle?.alcohol === 'high' ? 'рискова употреба на алкохол' : '',
        bmi !== null && bmi < 20 ? `ИТМ ${dec(bmi)}` : '', conds.has('dm1') ? 'диабет тип 1' : '',
      ].filter(Boolean);
      const steroid = medsWith(meds, ['CORTICOSTEROID']).some(m => m.start && daysBetween(m.start, asOf) >= 90);
      if (!steroid && (age >= 65 || risk.length)) {
        out.push(finding('osteo_screen', lastDxa || 'never', 1, 'screening',
          'Скрининг за остеопороза',
          'Костна плътност (DXA) с оценка на риска от фрактура (FRAX).',
          [age >= 65 ? `Жена на ${Math.floor(age)} г.` : `Жена на ${Math.floor(age)} г. с ${risk.join(', ')}`,
            lastDxa ? `Последна DXA: ${when(lastDxa)}` : 'Няма DXA'],
          cite('uspstf_osteo_2025')));
      }
    }
  }

  // Рак на белия дроб — нискодозова КТ при дълго пушене (USPSTF 2021; в Европа — пилотно).
  if (everSmoked && age >= 50 && age <= 80) {
    const last = lastDone(p, ['ldct'], asOf);
    if (!last || last < addMonths(asOf, -12)) {
      out.push(finding('lung_screen', last || 'never', 1, 'screening',
        'Скрининг за рак на белия дроб — проверете пакетогодините',
        'При 20 и повече пакетогодини и тютюнопушене сега или през последните 15 години — нискодозова КТ на гърдите ежегодно. В Европа се въвежда поетапно; по преценка.',
        [`${Math.floor(age)} г., ${smoking === 'current' ? 'пушач' : 'бивш пушач'}`, last ? `Последна КТ: ${when(last)}` : 'Няма нискодозова КТ'],
        cite('uspstf_lung_2021', 'eu_cancer_2022')));
    }
  }
  return out;
}

/** Деца: изследвания при затлъстяване от 10 г. (AAP 2023). */
function childRules(p, ctx) {
  const { asOf, age, child } = ctx;
  const out = [];
  const bmi = child?.bmi;
  if (!bmi || age < 10 || age >= 18 || !(bmi.z > 2) || bmi.date < addMonths(asOf, -12)) return out;
  const since = addMonths(asOf, -24);
  const missing = [
    !(p.results || []).some(r => ['ldl', 'tchol'].includes(r.code) && r.date >= since) ? 'липиден профил' : '',
    !(p.results || []).some(r => ['glucose', 'hba1c'].includes(r.code) && r.date >= since) ? 'глюкоза на гладно или HbA1c' : '',
    !(p.results || []).some(r => r.code === 'alt' && r.date >= since) ? 'АЛАТ' : '',
  ].filter(Boolean);
  if (missing.length) {
    out.push(finding('child_obesity', bmi.date, 1, 'growth',
      'Затлъстяване при дете над 10 г.: изследвания',
      `${missing.join(', ')}; измерване на налягането; разговор за храненето, движението и съня.`.replace(/^./, c => c.toUpperCase()),
      [`ИТМ ${dec(bmi.value)} (z ${dec(bmi.z)}) на ${when(bmi.date)}`], cite('aap_obesity_2023')));
  }
  return out;
}

/* -------------------------- четене на прегледите -------------------------- */

const L = '[а-яёa-z]*';
/** Оплаквания и находки в текста на прегледите. `done` — изследвания, които
 * отговарят на сигнала, ако са направени след прегледа. */
export const RED_FLAGS = [
  {
    id: 'hemoptysis', sev: 3, re: new RegExp(`кръвохрак${L}|хемоптиз${L}|кашл${L} с кръв|кръв в храчк${L}`),
    title: 'Кръвохрачене', action: 'Рентгенография на гръдния кош до 2 седмици; при пушач над 40 г. — насочване по бърза процедура.',
    source: 'NICE NG12',
  },
  {
    id: 'rectal_bleeding', sev: 3, re: new RegExp(`кръв в (?:изпражнени${L}|фекали${L}|стола)|ректалн${L} кърве${L}|кърв${L} от (?:ануса|ректума)|хематохези${L}|мелена|черни (?:като катран )?изпражнения`),
    title: 'Кръв в изпражненията', action: 'ПКК и феритин; изследване за окултна кръв (FIT); насочване за колоноскопия.',
    source: 'NICE NG12', done: { checks: ['fit'] },
  },
  {
    id: 'dysphagia', sev: 3, re: new RegExp(`дисфаги${L}|затруднено преглъщане|трудно преглъща${L}|засяда${L} храна|заседна${L} храна`),
    title: 'Затруднено преглъщане', action: 'Горна ендоскопия по бърза процедура.',
    source: 'NICE NG12',
  },
  {
    id: 'breast_lump', sev: 3, re: new RegExp(`(?:бучк${L}|уплътнени${L}|възел${L}|формаци${L})\\s+(?:в|на) (?:лява${L} |дясна${L} )?(?:гърд${L}|млечн${L} жлез${L})`),
    title: 'Уплътнение в гърдата', action: 'Мамография и ехография; насочване към мамолог.',
    source: 'NICE NG12', done: { checks: ['mammo'] },
  },
  {
    id: 'neuro_deficit', sev: 3, re: new RegExp(`изкривяване на устата|изкривена уста|слабост в (?:ръка|крак|едната)${L}|нарушен${L} говор|говорни нарушения|неясен говор|внезапн${L} загуба на зрение|внезапн${L} изтръпване на половин`),
    title: 'Остър неврологичен дефицит — инсулт или ТИА?', action: 'Ако не е оценено: спешно насочване към невролог; при текущи симптоми — спешна помощ.',
    source: 'ESO 2021 ТИА',
  },
  {
    id: 'headache_red', sev: 3, re: new RegExp(`(?:най-силното|най-силно|внезапн${L}|гръмотевичн${L})\\s+главобол${L}`),
    title: 'Главоболие с тревожни белези', action: 'Спешна оценка (субарахноидален кръвоизлив?).',
    source: 'NICE CG150',
  },
  {
    id: 'suicidal', sev: 3, re: new RegExp(`самоубийств${L}|суицид${L}|мисли за смърт|самонаранява${L}|не иска да живее`),
    title: 'Мисли за самонараняване', action: 'Оценка на риска още днес; при висок риск — спешна психиатрична помощ.',
    source: 'NICE NG225', done: { tools: ['phq9'] },
  },
  {
    id: 'jaundice', sev: 3, re: new RegExp(`жълтеница|иктер${L}|пожълтяване${L}|жълти склери`),
    title: 'Жълтеница', action: 'Спешно: билирубин, чернодробни проби, ПКК и ехография на корема.',
    source: 'NICE NG12', done: { labs: ['alt', 'ast'] },
  },
  {
    id: 'chest_pain', sev: 2, re: new RegExp(`(?:болк${L}|стягане|тежест|парене|притискане)\\s+(?:в|зад|около)\\s+(?:гърд${L}|гръдн${L}|сърцето)|стенокард${L}|ангинозн${L}`),
    title: 'Болка в гърдите', action: 'ЕКГ; при болка в покой или нарастваща — спешна помощ и тропонин; иначе — неинвазивен тест за исхемия.',
    source: 'ESC 2024 хронични коронарни синдроми', done: { checks: ['ecg'], studies: ['ecg'] },
  },
  {
    id: 'dyspnea', sev: 2, re: new RegExp(`задух${L}|диспне${L}|недостиг на въздух|ортопне${L}|задъхва${L}`),
    title: 'Задух', action: 'ЕКГ и NT-proBNP; при съмнение за белодробна причина — спирометрия и рентгенография.',
    source: cite('esc_hf_2026', 'gold_2026'), done: { labs: ['ntprobnp'], checks: ['spiro', 'echo'], studies: ['echo'] },
  },
  {
    id: 'weight_loss_text', sev: 2, re: new RegExp(`(?:загуба на|спад на|свалил${L}|отслаб${L})\\s+(?:\\S+\\s+){0,2}(?:тегло|килограм${L}|кг)|необясним${L} отслабване|отслабва без`),
    title: 'Отслабване по данни на пациента', action: 'Измерване на теглото; ПКК, CRP, глюкоза, TSH, чернодробни проби.',
    source: 'NICE NG12', done: { labs: ['hb', 'crp', 'tsh'] },
  },
  {
    id: 'hematuria', sev: 2, re: new RegExp(`хематури${L}|кръв в урина${L}|червена урина|кървава урина`),
    title: 'Кръв в урината', action: 'Изследване на урина и креатинин; видима хематурия над 45 г. — уролог по бърза процедура.',
    source: 'NICE NG12',
  },
  {
    id: 'night_sweats', sev: 2, re: new RegExp(`нощн${L} изпотяван${L}|нощно потене|облива се в пот нощем`),
    title: 'Нощно изпотяване', action: 'ПКК, CRP, рентгенография на гръдния кош; изключете инфекция (включително туберкулоза) и лимфом.',
    source: '', done: { labs: ['hb', 'crp', 'wbc'] },
  },
  {
    id: 'syncope', sev: 2, re: new RegExp(`синкоп${L}|загуба на съзнание|загубил${L} съзнание|припадна${L}|припадък`),
    title: 'Загуба на съзнание', action: 'ЕКГ и ортостатично налягане; при усилие, с палпитации или при сърдечно заболяване — кардиолог спешно.',
    source: 'ESC 2018 синкоп', done: { checks: ['ecg'], studies: ['ecg'] },
  },
  {
    id: 'lymph', sev: 2, re: new RegExp(`увеличен${L} лимфн${L} възл${L}|лимфаденопати${L}|подут${L} лимфн${L} възл${L}`),
    title: 'Увеличени лимфни възли', action: 'ПКК; при възел над 2 см, твърд или персистиращ над 6 седмици — насочване.',
    source: 'NICE NG12', done: { labs: ['hb', 'wbc'] },
  },
  {
    id: 'palpitations', sev: 1, re: new RegExp(`сърцебиен${L}|палпитаци${L}|неравномерен пулс|прескача сърцето`),
    title: 'Сърцебиене', action: 'ЕКГ; при пристъпи — Холтер ЕКГ; TSH и ПКК.',
    source: 'ESC 2024 ПМ', done: { checks: ['ecg'], studies: ['ecg', 'holter'] },
  },
  {
    id: 'claudication', sev: 1, re: new RegExp(`(?:болк${L}|схващане|крампи) в (?:прасц${L}|подбедриц${L}) при ходене|клаудикаци${L}`),
    title: 'Болка в прасците при ходене', action: 'Глезенно-брахиален индекс; оценка на сърдечно-съдовия риск.',
    source: 'ESC 2024 периферна артериална болест',
  },
  {
    id: 'polyuria', sev: 1, re: new RegExp(`полиури${L}|полидипси${L}|пие много вода|силна жажда|често уриниране`),
    title: 'Жажда и често уриниране', action: 'Глюкоза и HbA1c; урина.',
    source: cite('ada_2026'), done: { labs: ['glucose', 'hba1c'] }, skipIf: (c) => c.conds.has('dm1') || c.conds.has('dm2'),
  },
  {
    id: 'memory', sev: 1, re: new RegExp(`забравя${L}|загуба на паметта|проблеми с паметта|отслабена памет|обърква${L} се`),
    title: 'Оплаквания от паметта', action: 'Когнитивна оценка (Mini-Cog); B12, TSH, глюкоза; преглед на антихолинергичните лекарства.',
    source: 'NICE NG97', done: { tools: ['minicog'] }, minAge: 60,
  },
  {
    id: 'falls', sev: 1, re: new RegExp(`паднал${L}|падане|пада често|спъва се`),
    title: 'Падане', action: 'Оценка на риска от падане: походка, ортостатично налягане, зрение, лекарства.',
    source: 'World Falls Guidelines 2022', done: { tools: ['falls'] }, minAge: 65,
  },
  {
    id: 'low_mood', sev: 1, re: new RegExp(`депресив${L}|потиснат${L}|безнадежд${L}|анхедони${L}|нищо не го радва|нищо не я радва`),
    title: 'Потиснато настроение', action: 'Скала PHQ-9.',
    source: 'NICE NG222', done: { tools: ['phq9', 'phq4'] },
  },
  {
    id: 'neuropathy', sev: 1, re: new RegExp(`изтръпва${L}|изтръпване|парестези${L}|мравучкане`),
    title: 'Изтръпване при диабет', action: 'Преглед на стъпалата с монофиламент и вибрация.',
    source: 'IWGDF 2023', done: { checks: ['foot'], studies: ['foot'] }, onlyIf: (c) => c.conds.has('dm1') || c.conds.has('dm2'),
  },
];

const NEGATIONS = new Set(['без', 'не', 'няма', 'отрича', 'отричат', 'липсва', 'липсват', 'отсъства', 'отсъстват', 'нито']);

/** Дали съвпадението е отречено („без задух“, „не съобщава за болка в гърдите“). */
export function negated(text, index) {
  const before = text.slice(0, index);
  const clause = before.split(/[.;!?\n]|,\s*(?:но|а)\s/).pop();
  const words = clause.toLowerCase().split(/[\s,:()]+/).filter(Boolean).slice(-5);
  return words.some(w => NEGATIONS.has(w));
}

/** Тревожни оплаквания в текста; връща [{flag, match}], без отречените. */
export function readText(text) {
  const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
  const found = [];
  for (const flag of RED_FLAGS) {
    const re = new RegExp(flag.re.source, 'g');
    let m;
    while ((m = re.exec(t))) {
      if (!negated(t, m.index)) { found.push({ flag, match: m[0] }); break; }
    }
  }
  return found;
}

function symptomRules(p, ctx) {
  const { asOf, age } = ctx;
  const out = [];
  const seen = new Set();
  const visits = (p.visits || []).filter(v => v.date <= asOf && v.date >= addDays(asOf, -60))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const v of visits) {
    const text = [v.complaint, v.findings, v.diagnosis, v.note].filter(Boolean).join('. ');
    for (const { flag, match } of readText(text)) {
      if (seen.has(flag.id)) continue;
      if (flag.minAge && age < flag.minAge) continue;
      if (flag.onlyIf && !flag.onlyIf(ctx)) continue;
      if (flag.skipIf && flag.skipIf(ctx)) continue;
      if (flag.done && doneSince(p, v.date, flag.done)) continue;
      seen.add(flag.id);
      let sev = flag.sev;
      if (flag.id === 'hematuria' && age >= 45) sev = 3;
      out.push(finding(`text_${flag.id}`, `${v.id || v.date}`, daysBetween(v.date, asOf) > 30 ? Math.min(sev, 2) : sev, 'symptom',
        flag.title, flag.action,
        [`„${match}“ — ${v.type || 'преглед'} на ${when(v.date)}`], flag.source, { visitId: v.id || '' }));
    }
  }
  return out;
}

/* ------------------------ вече изчислените сигнали ------------------------ */

function signalRules(p, ctx) {
  const { a, specialty, child, planOverdue } = ctx;
  const out = [];
  if (a) {
    const overdue = a.monitoring.filter(t => t.status === 'overdue');
    const due = a.monitoring.filter(t => t.status === 'due');
    if (overdue.length) {
      out.push(finding('monitoring', `overdue:${overdue.map(t => t.id).sort().join(',')}`, 2, 'monitoring',
        `Просрочено проследяване: ${overdue.length === 1 ? overdue[0].name : `${overdue.length} изследвания и прегледа`}`,
        `Направете: ${overdue.map(t => t.name).join(', ')}.`,
        overdue.slice(0, 5).map(t => `${t.name} — ${t.reasons.join(', ')}${t.last ? `, последно ${when(t.last)}` : ', няма запис'}`),
        'Честотите по ESC 2024, ESC 2026 ССЗ и ХБЗ, KDIGO 2024, ADA 2026, GOLD 2026 и GINA 2026', { reqs: overdue.map(t => t.req) }));
    } else if (due.length) {
      out.push(finding('monitoring', `due:${due.map(t => t.id).sort().join(',')}`, 1, 'monitoring',
        `Дължимо проследяване: ${due.length === 1 ? due[0].name : `${due.length} изследвания и прегледа`}`,
        `Направете: ${due.map(t => t.name).join(', ')}.`,
        due.slice(0, 5).map(t => `${t.name} — ${t.reasons.join(', ')}`), '', { reqs: due.map(t => t.req) }));
    }
    for (const al of a.medAlerts.filter(x => x.severity === 'contra' || x.severity === 'major')) {
      out.push(finding('med', `${al.type}:${al.title}`, al.severity === 'contra' ? 3 : 2, 'therapy',
        `Лекарства: ${al.title}`, al.advice || 'Преглед на терапията.', [al.text], ''));
    }
    for (const hnt of a.hints) {
      out.push(finding('hint', hnt.code, hnt.code === 'dm2' || hnt.code === 'htn' ? 2 : 1, 'diagnosis',
        'Данните подсказват невписано заболяване', hnt.text, [], ''));
    }
    for (const al of a.mental.alerts.filter(x => x.severity >= 3)) {
      out.push(finding('mental', `${al.tool}:${al.date}`, 3, 'mental', al.text,
        'Свържете се с пациента днес: оценка на риска и план за безопасност; при непосредствен риск — спешна психиатрична помощ.',
        [`${TOOLS[al.tool]?.short || al.tool}, попълнен ${formatDate(al.date)}`], 'NICE NG225 (самонараняване)'));
    }
  }
  if (child) {
    for (const c of child.growth) {
      out.push(finding('growth', c.id || c.title, 2, 'growth', `Растеж: ${c.title}`, c.detail || 'Подробности в раздел „Растеж“.', [], 'СЗО, NICE NG75'));
    }
    for (const c of child.development) {
      out.push(finding('development', c.id || c.title, 2, 'growth', c.title, c.detail || 'Подробности в раздел „Развитие“.', [], ''));
    }
  }
  if (planOverdue && planOverdue.length) {
    out.push(finding('prevention', planOverdue.map(e => e.id).sort().join(','), 1, 'prevention',
      `Профилактика: ${planOverdue.length === 1 ? planOverdue[0].name : `${planOverdue.length} просрочени дейности`}`,
      `Просрочено: ${planOverdue.slice(0, 6).map(e => e.name).join(', ')}${planOverdue.length > 6 ? ` и още ${planOverdue.length - 6}` : ''}.`,
      [], 'Календарът на практиката'));
  }
  for (const [mod, s] of Object.entries(specialty || {})) {
    for (const al of (s.alerts || []).filter(x => x.severity >= 2)) {
      out.push(finding(`mod_${mod}`, `${al.id}:${al.text}`.slice(0, 160), Math.min(3, al.severity), 'specialty',
        al.text, 'Подробности в раздела на специалността.', [], ''));
    }
  }
  return out;
}

/* ------------------------------ обобщение ------------------------------ */

/**
 * Всички подсказки за едно досие, подредени по спешност.
 * @param {object} p  досието
 * @param {object} ctx
 * @param {string} ctx.asOf
 * @param {object} [ctx.adult]  обобщението за възрастен (adultSummary)
 * @param {object} [ctx.specialty]  обобщенията на модулите на специалностите
 * @param {object} [ctx.child]  { growth: [...], development: [...] } — сериозните сигнали при дете
 * @param {object[]} [ctx.planOverdue]  просрочените дейности от календара
 * @param {object} [ctx.modules]  включените модули ({ cardio, endo })
 */
export function assistantFindings(p, ctx) {
  const asOf = ctx.asOf;
  const age = years(p, asOf);
  const base = {
    asOf, age, sex: p.sex,
    conds: new Set(activeConditions(p).map(c => c.code)),
    meds: activeMeds(p, asOf),
    modules: ctx.modules || {},
    a: ctx.adult || null,
    specialty: ctx.specialty || null,
    child: ctx.child || null,
    planOverdue: ctx.planOverdue || [],
    practice: ctx.practice || 'gp',
  };
  const all = [
    ...symptomRules(p, base),
    ...(age >= 18
      ? [...labRules(p, base), ...vitalRules(p, base), ...screeningRules(p, base), ...therapyRules(p, base), ...guidelineRules(p, base)]
      : childRules(p, base)),
    ...signalRules(p, base),
  ];
  const seen = new Set();
  const out = [];
  for (const f of all) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    out.push(f);
  }
  return out.sort((x, y) => y.severity - x.severity || CATEGORY_ORDER.indexOf(x.category) - CATEGORY_ORDER.indexOf(y.category));
}

const CATEGORY_ORDER = Object.keys(CATEGORIES);

/**
 * Решенията на лекаря: кои подсказки са приети, направени, отложени или
 * отхвърлени. Отложените и приетите се връщат след срока; отхвърлените —
 * след 12 месеца; „направено“ — докато стойностите не се променят
 * (новите данни дават нов ключ и нова подсказка).
 */
export function applyFeedback(findings, feedback, asOf) {
  const active = [];
  const handled = [];
  for (const f of findings) {
    const fb = feedback && Object.prototype.hasOwnProperty.call(feedback, f.key) ? feedback[f.key] : null;
    if (fb && (!fb.until || fb.until > asOf)) handled.push({ ...f, feedback: fb });
    else active.push(f);
  }
  return { active, handled };
}

/** Срокът, до който решението важи. */
export function feedbackUntil(status, asOf, until) {
  if (until) return until;
  if (status === 'snoozed') return addMonths(asOf, 1);
  if (status === 'accepted') return addMonths(asOf, 1);
  if (status === 'dismissed') return addMonths(asOf, 12);
  return '';
}

/** Точки за подреждане на пациентите в списъка на асистента. */
export function patientScore(findings) {
  if (!findings.length) return 0;
  const max = Math.max(...findings.map(f => f.severity));
  return max * 100 + findings.filter(f => f.severity === max).length * 10 + findings.length;
}

export { isCheck };
