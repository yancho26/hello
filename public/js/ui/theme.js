/* Изгледът в този браузър (версия 5.0): светла или тъмна тема, плътност, вид на менюто.
 * Логиката е в shared/ui-prefs.js; тук е връзката с браузъра. */

import { cleanPrefs, navChoiceAvailable, nextTheme, parsePrefs, resolveNav, resolveTheme } from '../shared/ui-prefs.js';

const KEY = 'docup.ui';
const dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const listeners = new Set();

let prefs = read();

function read() {
  try { return parsePrefs(localStorage.getItem(KEY)); } catch { return cleanPrefs(null); }
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* браузърът не пази: важи до затваряне */ }
}

export function getPrefs() {
  return { ...prefs };
}

/** Темата, която се вижда в момента: 'light' или 'dark'. */
export function currentTheme() {
  return resolveTheme(prefs.theme, !!(dark && dark.matches));
}

/** Видът на менюто в момента: 'full', 'rail' или 'phone'. */
export function currentNav() {
  return resolveNav(prefs.nav, window.innerWidth);
}

export function canChooseNav() {
  return navChoiceAvailable(window.innerWidth);
}

/** Нанася предпочитанията върху страницата. */
export function applyPrefs() {
  const root = document.documentElement;
  root.dataset.theme = currentTheme();
  root.dataset.density = prefs.density;
  const shell = document.querySelector('.app-shell');
  if (shell) shell.dataset.nav = currentNav();
  for (const fn of listeners) fn(getPrefs());
}

export function setPrefs(patch) {
  prefs = cleanPrefs({ ...prefs, ...patch });
  write();
  applyPrefs();
}

export function cycleTheme() {
  setPrefs({ theme: nextTheme(prefs.theme) });
  return prefs.theme;
}

/** Свива или разгъва менюто (когато екранът е достатъчно широк за избор). */
export function toggleNav() {
  setPrefs({ nav: currentNav() === 'full' ? 'rail' : 'full' });
}

/** Извиква fn при всяка промяна на изгледа; връща функция за отписване. */
export function onPrefsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (dark) {
  const react = () => { if (prefs.theme === 'auto') applyPrefs(); };
  if (dark.addEventListener) dark.addEventListener('change', react);
  else if (dark.addListener) dark.addListener(react);
}
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyPrefs, 60);
});
// Друг раздел на същия браузър е сменил изгледа.
window.addEventListener('storage', (e) => {
  if (e.key === KEY) { prefs = read(); applyPrefs(); }
});

applyPrefs();
