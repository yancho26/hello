/* Предпочитания за изгледа (версия 5.0): тема, плътност на редовете и странично меню.
 *
 * Пазят се в браузъра на всеки компютър, а не в данните на практиката: лаптопът в кабинета може
 * да е с тъмна тема и свито меню, а компютърът на регистратурата — със светла. Тук е само
 * логиката, без достъп до браузъра, за да се проверява с тестове. */

export const THEMES = ['auto', 'light', 'dark'];
export const DENSITIES = ['normal', 'compact'];
export const NAV_MODES = ['auto', 'full', 'rail'];
export const DEFAULT_PREFS = Object.freeze({ theme: 'auto', density: 'normal', nav: 'auto' });

export const THEME_LABELS = { auto: 'като на компютъра', light: 'светла', dark: 'тъмна' };
export const DENSITY_LABELS = { normal: 'нормална', compact: 'сбита' };
export const NAV_LABELS = { auto: 'според ширината на екрана', full: 'разгънато', rail: 'свито до иконки' };

/* Ширини на екрана, при които менюто сменя вида си. */
export const PHONE_MAX = 720;      // до тук: лента с бутони отдолу
export const RAIL_MAX = 1099;      // до тук: само иконки, без избор
export const AUTO_FULL_MIN = 1280; // от тук нагоре „според ширината“ значи разгънато

/** Каквото и да е записано в браузъра → валидни предпочитания. */
export function cleanPrefs(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    theme: THEMES.includes(src.theme) ? src.theme : DEFAULT_PREFS.theme,
    density: DENSITIES.includes(src.density) ? src.density : DEFAULT_PREFS.density,
    nav: NAV_MODES.includes(src.nav) ? src.nav : DEFAULT_PREFS.nav,
  };
}

/** Записаният текст (JSON) → предпочитания; повреден запис дава подразбираните. */
export function parsePrefs(text) {
  try { return cleanPrefs(JSON.parse(text)); } catch { return cleanPrefs(null); }
}

/** Темата, която се показва: „auto“ следва настройката на компютъра. */
export function resolveTheme(theme, systemDark) {
  if (theme === 'dark' || theme === 'light') return theme;
  return systemDark ? 'dark' : 'light';
}

/** Следващата тема при натискане на бутона: според компютъра → светла → тъмна → според компютъра. */
export function nextTheme(theme) {
  const i = THEMES.indexOf(theme);
  return THEMES[(i + 1) % THEMES.length];
}

/**
 * Видът на менюто при дадена ширина на прозореца:
 *   'phone' — лента отдолу; 'rail' — тясна лента с иконки; 'full' — меню с надписи.
 * На тесен прозорец изборът на потребителя не важи: менюто не бива да изяжда съдържанието.
 */
export function resolveNav(nav, width) {
  const w = Number(width) || 0;
  if (w <= PHONE_MAX) return 'phone';
  if (w <= RAIL_MAX) return 'rail';
  if (nav === 'full' || nav === 'rail') return nav;
  return w < AUTO_FULL_MIN ? 'rail' : 'full';
}

/** Може ли потребителят да избира между свито и разгънато меню при тази ширина. */
export function navChoiceAvailable(width) {
  return (Number(width) || 0) > RAIL_MAX;
}
