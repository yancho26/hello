/* Артериално налягане в детска възраст.
 *
 * Използва се опростената скринингова таблица от указанието на Американската
 * академия по педиатрия — „Clinical Practice Guideline for Screening and
 * Management of High Blood Pressure in Children and Adolescents“ (Pediatrics,
 * 2017;140(3):e20171904), Таблица 6 „Screening BP Values Requiring Further
 * Evaluation“. Стойностите отговарят на 90-и персентил за възраст и пол при
 * 5-и персентил за ръст; отрицателната им предсказваща стойност е над 99%,
 * тоест стойност под тях практически изключва хипертония.
 *
 * ВАЖНО: таблицата е скринингова. Стойност на или над прага изисква точна
 * оценка по пълните персентилни таблици (Таблици 4 и 5 от същото указание),
 * които отчитат и ръста на детето, и повторни измервания в различни дни.
 *
 * От 13-годишна възраст указанието въвежда фиксирани прагове, еднакви с тези
 * при възрастни: ≥120/80 — повишено, ≥130/80 — I степен, ≥140/90 — II степен.
 */

/** [възраст в години, момчета систолно, момчета диастолно, момичета сист., момичета диаст.] */
export const AAP_SCREENING_BP = [
  [1, 98, 52, 98, 54],
  [2, 100, 55, 101, 58],
  [3, 101, 58, 102, 60],
  [4, 102, 60, 103, 62],
  [5, 103, 63, 104, 64],
  [6, 105, 66, 105, 67],
  [7, 106, 68, 106, 68],
  [8, 107, 69, 107, 69],
  [9, 107, 70, 108, 71],
  [10, 108, 72, 109, 72],
  [11, 110, 74, 111, 74],
  [12, 113, 75, 114, 75],
  [13, 120, 80, 120, 80],
];

/** Възрастта, от която се препоръчва ежегодно измерване на артериалното налягане. */
export const BP_FROM_YEARS = 3;

/** Праговете за скрининг при дадена възраст и пол. */
export function screeningThreshold(sex, ageYears) {
  if (!(ageYears >= 1)) return null;
  const age = Math.min(13, Math.floor(ageYears));
  const row = AAP_SCREENING_BP.find(r => r[0] === age) || AAP_SCREENING_BP[AAP_SCREENING_BP.length - 1];
  return sex === 'f'
    ? { systolic: row[3], diastolic: row[4] }
    : { systolic: row[1], diastolic: row[2] };
}

/**
 * Оценка на измерено налягане.
 * @returns {{category, label, severity, threshold, adult}} или null при липса на данни
 */
export function assessBloodPressure(sex, ageYears, systolic, diastolic) {
  if (!(systolic > 0) || !(diastolic > 0) || !(ageYears >= 1)) return null;

  // От 13 години нататък се ползват фиксираните прагове на указанието.
  if (ageYears >= 13) {
    let category = 'normal';
    if (systolic >= 140 || diastolic >= 90) category = 'stage2';
    else if (systolic >= 130 || diastolic >= 80) category = 'stage1';
    else if (systolic >= 120) category = 'elevated';
    return {
      category,
      label: LABELS[category],
      severity: SEVERITY[category],
      threshold: { systolic: 120, diastolic: 80 },
      adult: true,
    };
  }

  const threshold = screeningThreshold(sex, ageYears);
  const highSystolic = systolic >= threshold.systolic;
  const highDiastolic = diastolic >= threshold.diastolic;
  const over = highSystolic || highDiastolic;
  return {
    category: over ? 'above_screening' : 'normal',
    label: over ? LABELS.above_screening : LABELS.normal,
    severity: over ? 1 : 0,
    threshold,
    highSystolic,
    highDiastolic,
    which: !over ? '' : highSystolic && highDiastolic ? 'систолното и диастолното'
      : highSystolic ? 'систолното' : 'диастолното',
    adult: false,
  };
}

const LABELS = {
  normal: 'в норма',
  elevated: 'повишено',
  stage1: 'артериална хипертония I степен',
  stage2: 'артериална хипертония II степен',
  above_screening: 'над скрининговия праг — нужна е точна оценка',
};

const SEVERITY = { normal: 0, elevated: 1, stage1: 2, stage2: 2, above_screening: 1 };

/** Дали за тази възраст изобщо се очаква измерване. */
export function bpDueFrom(ageYears) {
  return ageYears >= BP_FROM_YEARS;
}
