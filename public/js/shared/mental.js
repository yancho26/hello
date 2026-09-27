/* Скали за психично здраве, когнитивни функции и риск при възрастни.
 *
 *   PHQ-9    депресия (Kroenke 2001) — свободен за ползване и превод
 *   GAD-7    генерализирана тревожност (Spitzer 2006) — свободен
 *   PHQ-4    бърз скрининг: PHQ-2 + GAD-2 (Kroenke 2009)
 *   AUDIT-C  рискова употреба на алкохол (СЗО; Bush 1998)
 *   Mini-Cog когнитивен скрининг (Borson) — © S. Borson; програмата само
 *            записва резултата, самият тест се провежда по официалния формуляр
 *   Падане   трите ключови въпроса на STEADI (CDC) и тестът „Стани и върви“
 *   SCORE2-OP ръчно въведен резултат от калкулатора на ESC (70+ г.)
 *
 * Скалите подпомагат, но не поставят диагноза.
 */

export const FREQ = [
  [0, 'Изобщо не'],
  [1, 'Няколко дни'],
  [2, 'Повече от половината дни'],
  [3, 'Почти всеки ден'],
];

const PHQ9_ITEMS = [
  'Малко интерес или удоволствие от нещата, които правите',
  'Чувство на потиснатост, депресия или безнадеждност',
  'Трудно заспиване, прекъснат сън или прекалено много сън',
  'Чувство на умора или липса на енергия',
  'Лош апетит или преяждане',
  'Лошо мнение за себе си — чувство, че сте неудачник или сте разочаровали себе си или семейството си',
  'Трудно съсредоточаване, например при четене или гледане на телевизия',
  'Движите се или говорите толкова бавно, че другите забелязват — или обратното, толкова сте неспокойни, че се движите много повече от обичайното',
  'Мисли, че би било по-добре да сте мъртви, или за самонараняване по някакъв начин',
];

const GAD7_ITEMS = [
  'Чувство на нервност, тревожност или напрегнатост',
  'Не можете да спрете или да овладеете притесненията си',
  'Прекалено притеснение за различни неща',
  'Трудно се отпускате',
  'Толкова сте неспокойни, че ви е трудно да стоите на едно място',
  'Лесно се дразните или ставате раздразнителни',
  'Страх, че може да се случи нещо ужасно',
];

const band = (score, bands) => bands.find(([max]) => score <= max);

export const TOOLS = {
  phq9: {
    name: 'PHQ-9 — депресия', short: 'PHQ-9', max: 27, adult: true,
    intro: 'През последните 2 седмици колко често сте имали някой от следните проблеми?',
    items: PHQ9_ITEMS, options: FREQ,
    extra: {
      id: 'difficulty',
      text: 'Доколко тези проблеми са ви затруднили в работата, у дома или с хората?',
      options: [[0, 'Изобщо не'], [1, 'Донякъде'], [2, 'Много'], [3, 'Изключително много']],
    },
    evaluate(answers) {
      const score = answers.slice(0, 9).reduce((s, v) => s + v, 0);
      const [, severity, label, advice] = band(score, [
        [4, 0, 'минимални симптоми', 'Без лечение; повторна оценка при нужда.'],
        [9, 1, 'лека депресия', 'Наблюдение и повторна оценка след 2–4 седмици; подкрепа и съвети за начин на живот.'],
        [14, 2, 'умерена депресия', 'Обмислете лечение: психотерапия и/или антидепресант; проследяване на 4–6 седмици.'],
        [19, 2, 'умерено тежка депресия', 'Активно лечение: антидепресант и/или психотерапия; обмислете консултация с психиатър.'],
        [27, 3, 'тежка депресия', 'Антидепресант и психотерапия; насочване към психиатър.'],
      ]);
      const alerts = [];
      if (answers[8] > 0) {
        alerts.push({
          severity: 3,
          text: 'Положителен отговор на въпрос 9 (мисли за смърт или самонараняване) — нужна е незабавна оценка на суицидния риск.',
        });
      }
      return { score, severity: Math.max(severity, alerts.length ? 3 : 0), label, advice, alerts };
    },
  },
  gad7: {
    name: 'GAD-7 — тревожност', short: 'GAD-7', max: 21, adult: true,
    intro: 'През последните 2 седмици колко често сте имали някой от следните проблеми?',
    items: GAD7_ITEMS, options: FREQ,
    evaluate(answers) {
      const score = answers.reduce((s, v) => s + v, 0);
      const [, severity, label, advice] = band(score, [
        [4, 0, 'минимална тревожност', 'Без лечение.'],
        [9, 1, 'лека тревожност', 'Наблюдение, психообразование, повторна оценка.'],
        [14, 2, 'умерена тревожност', 'Резултат ≥10 изисква допълнителна оценка; обмислете КПТ и/или SSRI/SNRI.'],
        [21, 3, 'тежка тревожност', 'Активно лечение; обмислете консултация с психиатър.'],
      ]);
      return { score, severity, label, advice, alerts: [] };
    },
  },
  phq4: {
    name: 'PHQ-4 — бърз скрининг за депресия и тревожност', short: 'PHQ-4', max: 12, adult: true,
    intro: 'През последните 2 седмици колко често сте имали някой от следните проблеми?',
    items: [GAD7_ITEMS[0], GAD7_ITEMS[1], PHQ9_ITEMS[0], PHQ9_ITEMS[1]], options: FREQ,
    evaluate(answers) {
      const score = answers.reduce((s, v) => s + v, 0);
      const gad2 = answers[0] + answers[1];
      const phq2 = answers[2] + answers[3];
      const [, severity, label] = band(score, [
        [2, 0, 'в норма'], [5, 1, 'леки симптоми'], [8, 2, 'умерени симптоми'], [12, 3, 'тежки симптоми'],
      ]);
      const next = [];
      if (phq2 >= 3) next.push('PHQ-2 ≥3 — попълнете PHQ-9.');
      if (gad2 >= 3) next.push('GAD-2 ≥3 — попълнете GAD-7.');
      return {
        score, severity, label, sub: { phq2, gad2 },
        advice: next.length ? next.join(' ') : 'Отрицателен скрининг.',
        alerts: [],
      };
    },
  },
  auditc: {
    name: 'AUDIT-C — употреба на алкохол', short: 'AUDIT-C', max: 12, adult: true, needsSex: true,
    intro: '1 стандартна напитка ≈ 10 г алкохол: около 250 мл бира, 100 мл вино или 30 мл концентрат.',
    questions: [
      { text: 'Колко често пиете алкохол?', options: [[0, 'Никога'], [1, 'Веднъж месечно или по-рядко'], [2, '2–4 пъти месечно'], [3, '2–3 пъти седмично'], [4, '4 или повече пъти седмично']] },
      { text: 'Колко стандартни напитки изпивате в обикновен ден, в който пиете?', options: [[0, '1–2'], [1, '3–4'], [2, '5–6'], [3, '7–9'], [4, '10 или повече']] },
      { text: 'Колко често изпивате 6 или повече стандартни напитки наведнъж?', options: [[0, 'Никога'], [1, 'По-рядко от веднъж месечно'], [2, 'Ежемесечно'], [3, 'Ежеседмично'], [4, 'Всеки ден или почти всеки ден']] },
    ],
    evaluate(answers, { sex } = {}) {
      const score = answers.reduce((s, v) => s + v, 0);
      const cutoff = sex === 'f' ? 3 : 4;
      const positive = score >= cutoff;
      const severe = score >= 8;
      return {
        score,
        severity: severe ? 3 : positive ? 2 : 0,
        label: severe ? 'вероятна зависимост или вредна употреба' : positive ? 'рискова употреба' : 'нискорискова употреба',
        advice: severe
          ? 'Пълен AUDIT, оценка за зависимост; обмислете насочване.'
          : positive
            ? `Положителен скрининг (≥${cutoff}): кратка интервенция — обратна връзка, съвет и цел за намаляване.`
            : 'Без интервенция; повторна оценка след няколко години.',
        alerts: [],
      };
    },
  },
  minicog: {
    name: 'Mini-Cog — когнитивен скрининг', short: 'Mini-Cog', max: 5, adult: true, kind: 'entry',
    intro: 'Проведете теста по официалния формуляр (mini-cog.com) и въведете резултата.',
    fields: [
      { id: 'words', label: 'Запомнени думи (0–3)', options: [[0, '0'], [1, '1'], [2, '2'], [3, '3']] },
      { id: 'clock', label: 'Рисунка на часовник', options: [[2, 'нормална (2 т.)'], [0, 'необичайна (0 т.)']] },
    ],
    evaluate(answers) {
      const score = answers.reduce((s, v) => s + v, 0);
      const positive = score < 3;
      return {
        score,
        severity: positive ? 2 : 0,
        label: positive ? 'положителен скрининг за когнитивно нарушение' : 'отрицателен скрининг',
        advice: positive
          ? 'Подробна когнитивна оценка, изследвания за обратими причини (TSH, B12, кръвна картина, глюкоза, електролити), преглед на лекарствата; насочване към невролог.'
          : 'При резултат 3 и оплаквания от паметта обмислете по-подробна оценка.',
        alerts: [],
      };
    },
  },
  falls: {
    name: 'Риск от падане (STEADI)', short: 'Падане', max: 3, adult: true, kind: 'entry',
    intro: 'Трите ключови въпроса на CDC STEADI. „Стани и върви“ — по желание.',
    fields: [
      { id: 'fell', label: 'Падал(а) ли е през последната година?', options: [[0, 'не'], [1, 'да']] },
      { id: 'unsteady', label: 'Чувства ли се неустойчив(а) при стоене или ходене?', options: [[0, 'не'], [1, 'да']] },
      { id: 'worried', label: 'Страхува ли се да не падне?', options: [[0, 'не'], [1, 'да']] },
    ],
    number: { id: 'tug', label: '„Стани и върви“ (TUG), секунди', min: 3, max: 120 },
    evaluate(answers, { number } = {}) {
      const score = answers.reduce((s, v) => s + v, 0);
      const slowTug = number >= 12;
      const atRisk = score > 0 || slowTug;
      return {
        score,
        severity: atRisk ? 2 : 0,
        label: atRisk ? 'повишен риск от падане' : 'без повишен риск',
        advice: atRisk
          ? `${slowTug ? 'TUG ≥12 с. ' : ''}Оценка на походката, силата и равновесието; преглед на лекарствата (седативни, антихипертензивни); зрение, ортостатично налягане, витамин D, безопасност у дома; упражнения за сила и равновесие.`
          : 'Повторна оценка след година.',
        alerts: [],
      };
    },
  },
  score2op: {
    name: 'SCORE2-OP — сърдечно-съдов риск (70+ г.)', short: 'SCORE2-OP', max: 100, adult: true, kind: 'value',
    intro: 'Изчислете в официалния калкулатор на ESC (HeartScore) и въведете 10-годишния риск в %.',
    number: { id: 'risk', label: '10-годишен риск, %', min: 0, max: 100 },
    evaluate(_answers, { number } = {}) {
      const risk = Number(number);
      const category = risk >= 15 ? 'very_high' : risk >= 7.5 ? 'high' : 'low';
      return {
        score: risk,
        category,
        severity: category === 'very_high' ? 3 : category === 'high' ? 2 : 0,
        label: { very_high: 'много висок риск', high: 'висок риск', low: 'нисък до умерен риск' }[category],
        advice: category === 'low' ? 'Промени в начина на живот.' : 'Лечение на рисковите фактори (ESC 2021).',
        alerts: [],
      };
    },
  },
};

/** Стойностите на отговорите по реда на въпросите. */
export function answerValues(tool, answers) {
  const t = TOOLS[tool];
  if (!t) throw new Error('Непознат инструмент.');
  if (t.kind === 'value') return [];
  const count = t.items ? t.items.length : t.questions ? t.questions.length : t.fields.length;
  const values = [];
  for (let i = 0; i < count; i++) {
    const raw = answers[i];
    if (raw === null || raw === undefined || raw === '') throw new Error(`Липсва отговор ${i + 1}.`);
    const v = Number(raw);
    const allowed = t.items ? t.options.map(o => o[0])
      : t.questions ? t.questions[i].options.map(o => o[0])
        : t.fields[i].options.map(o => o[0]);
    if (!allowed.includes(v)) throw new Error(`Липсва или е невалиден отговор ${i + 1}.`);
    values.push(v);
  }
  return values;
}

export function evaluate(tool, answers, opts = {}) {
  return TOOLS[tool].evaluate(answerValues(tool, answers), opts);
}

/** Последната оценка по всеки инструмент и най-важните сигнали. */
export function mentalSummary(assessments = []) {
  const latest = {};
  for (const a of [...assessments].sort((x, y) => (x.date < y.date ? -1 : 1))) {
    if (TOOLS[a.tool]) latest[a.tool] = a;
  }
  const alerts = [];
  for (const a of Object.values(latest)) {
    for (const al of a.result?.alerts || []) alerts.push({ ...al, tool: a.tool, date: a.date });
    if ((a.result?.severity || 0) >= 2 && a.tool !== 'score2op') {
      alerts.push({ severity: a.result.severity, text: `${TOOLS[a.tool].short}: ${a.result.label} (${a.score} т.)`, tool: a.tool, date: a.date });
    }
  }
  return { latest, alerts: alerts.sort((x, y) => y.severity - x.severity) };
}
