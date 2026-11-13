/* Начало на приложението: вписване, навигация, общо състояние. */

import { api, setUnauthorizedHandler } from './api.js';
import { avatar, card, confirmDialog, field, h, icon, input, loading, modal, mount, toast } from './ui/components.js';
import { canChooseNav, currentNav, currentTheme, onPrefsChange, toggleNav, toggleTheme, applyPrefs } from './ui/theme.js';
import { appearanceControls } from './ui/appearance.js';
import { THEME_LABELS } from './shared/ui-prefs.js';
import { forgetRecent, openPalette } from './ui/palette.js';
import { showStoppedScreen } from './connection.js';
import { startIdleLogout } from './idle.js';
import { maybeShowWhatsNew } from './whats-new.js';
import { renderDashboard } from './views/dashboard.js';
import { renderPatients } from './views/patients.js';
import { renderPatient } from './views/patient.js';
import { renderReports } from './views/reports.js';
import { renderSettings } from './views/settings.js';
import { renderCalendar } from './views/calendar.js';
import { renderSimpDashboard } from './views/simp-dashboard.js';
import { renderAgenda } from './views/agenda.js';
import { renderSimpReports } from './views/simp-reports.js';
import { renderAssistant } from './views/assistant.js';
import { renderNutritionPage } from './views/nutrition-page.js';
import { findScheduleItem } from './shared/schedule.js';
import { MODULES } from './shared/specialty.js';

export const state = {
  doctor: null,
  practice: { name: 'Практика' },
  doctors: [],
  schedule: [],
  settings: { horizonDays: 30 },
  scheduleById: new Map(),
  /* Адреси и папки на сървъра — показват се в „Настройки → Данни“. */
  server: null,
  /* Продуктовият ключ: активирана ли е програмата и с кой ключ. */
  license: null,
  /* Видът на практиката, в която е влязъл потребителят: 'gp' (ОПЛ) или 'simp' (СИМП). */
  kind: 'gp',
};

/* Практиката на ОПЛ и практиката за СИМП имат различни табла, календар и справки. */
const VIEWS_BY_KIND = {
  gp: [
    { path: 'dashboard', label: 'Табло', icon: 'dashboard', render: renderDashboard },
    { path: 'patients', label: 'Пациенти', icon: 'patients', render: renderPatients },
    { path: 'calendar', label: 'Календар', icon: 'calendar', keywords: 'имунизации ваксини профилактика', render: renderCalendar },
    { path: 'assistant', label: 'Асистент', icon: 'assistant', keywords: 'подсказки сигнали', render: renderAssistant },
    { path: 'nutrition', label: 'Хранене', icon: 'nutrition', keywords: 'режим диета храни каталог', render: renderNutritionPage },
    { path: 'reports', label: 'Справки', icon: 'reports', keywords: 'отчет статистика обхват', render: renderReports },
    { path: 'settings', label: 'Настройки', icon: 'settings', keywords: 'потребители копие сигурност изглед тема', render: renderSettings },
  ],
  simp: [
    { path: 'dashboard', label: 'Табло', icon: 'dashboard', render: renderSimpDashboard },
    { path: 'agenda', label: 'График', icon: 'agenda', keywords: 'часове записване', render: renderAgenda },
    { path: 'patients', label: 'Пациенти', icon: 'patients', render: renderPatients },
    { path: 'assistant', label: 'Асистент', icon: 'assistant', keywords: 'подсказки сигнали', render: renderAssistant },
    { path: 'nutrition', label: 'Хранене', icon: 'nutrition', keywords: 'режим диета храни каталог', render: renderNutritionPage },
    { path: 'reports', label: 'Справки', icon: 'reports', keywords: 'отчет статистика', render: renderSimpReports },
    { path: 'settings', label: 'Настройки', icon: 'settings', keywords: 'потребители копие сигурност изглед тема', render: renderSettings },
  ],
};
const views = () => VIEWS_BY_KIND[state.kind] || VIEWS_BY_KIND.gp;

/** Описанието на двата вида практики — на екрана за вход и в менюто. */
export const KINDS = {
  gp: { title: 'Обща медицина', short: 'ОПЛ', about: 'Практика на общопрактикуващ лекар', icon: '🏥' },
  simp: { title: 'Специализирана помощ', short: 'СИМП', about: 'Специализирана извънболнична медицинска помощ: кабинет или център на лекари специалисти', icon: '🩺' },
};

const root = document.getElementById('root');

/* -------------------------------- навигация --------------------------------- */

export function go(path) {
  if (location.hash === '#/' + path) route();
  else location.hash = '#/' + path;
}

function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [head, ...rest] = raw.split('/');
  return { head, rest };
}

/* Докъде е превъртян всеки списък — за да се върне лекарят на същото място, след като
 * затвори досие, отворено от него. */
const scrollMemory = new Map();
let lastRoute = null;
/* Поредният номер на прехода: ако по-стар преход свърши след по-нов (бавни данни), екранът
 * се рисува отново, за да не остане старият изглед върху новия адрес. */
let routeSeq = 0;
let routeDone = 0;

async function route() {
  const { head, rest } = currentRoute();
  const host = document.getElementById('view');
  if (!host) return;

  const my = ++routeSeq;
  const key = head === 'patient' ? 'patient/' + String(rest[0] || '').split('?')[0] : head;
  const changed = !lastRoute || lastRoute.key !== key;
  if (lastRoute && changed) scrollMemory.set(lastRoute.key, window.scrollY);
  const backFromDossier = !!lastRoute && lastRoute.head === 'patient' && head !== 'patient';
  lastRoute = { key, head };

  const target = head === 'patient' ? 'patients' : head;
  for (const link of document.querySelectorAll('nav.main a, .bottom-nav a')) {
    const on = link.dataset.path === target;
    link.classList.toggle('active', on);
    if (on) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  const more = document.querySelector('.bottom-nav button[data-more]');
  if (more) more.classList.toggle('active', more.dataset.more.split(' ').includes(target));

  // Екранът за зареждане се показва само ако данните се бавят — иначе старият екран остава,
  // докато новият е готов, и няма мигане при всяко щракване. Ако изгледът вече е сложил част от
  // себе си (заглавие, раздели) и чака още данни, не се пипа: иначе ще остане само „Зареждане…“.
  const progress = document.querySelector('.route-progress');
  const before = host.firstChild;
  const slow = setTimeout(() => {
    progress?.classList.add('on');
    if (host.firstChild === before) mount(host, loading());
  }, 220);
  try {
    if (head === 'patient' && rest[0]) {
      // „#/patient/ид?exam=час“ — преглед, започнат от записан час в графика.
      const [id, query = ''] = rest[0].split('?');
      // Името на пациента не се слага в заглавието на раздела: то остава в историята на браузъра.
      document.title = 'Досие · DocUp';
      await renderPatient(host, id, new URLSearchParams(query));
    } else {
      const view = views().find(v => v.path === head) || views()[0];
      document.title = `${view.label} · DocUp`;
      await view.render(host);
    }
  } catch (err) {
    mount(host, card('Възникна грешка', {},
      h('p', null, err.message),
      h('button.btn', { onclick: () => route() }, 'Опитай отново')));
  } finally {
    clearTimeout(slow);
    if (my === routeSeq) progress?.classList.remove('on');
  }
  if (my !== routeSeq) {
    // Междувременно е започнал по-нов преход. Ако той вече е свършил, този го е препокрил — рисува се наново.
    if (routeDone === routeSeq) route();
    return;
  }
  routeDone = my;
  if (changed) {
    const y = backFromDossier ? scrollMemory.get(key) || 0 : 0;
    window.scrollTo(0, y);
    host.classList.add('enter');
    setTimeout(() => host.classList.remove('enter'), 240);
  }
}

/** Презарежда програмата от таблото — при вход, изход и смяна на практиката.
 * Адресът се сменя без събитие „hashchange“, за да не се покаже за миг
 * изглед от предишната практика. */
export function restart() {
  history.replaceState(null, '', location.pathname);
  location.reload();
}

/* --------------------------------- обвивка ----------------------------------- */

const newPatient = () => import('./views/patients.js').then(m => m.openPatientForm());

/** Прозорецът за бързо търсене: пациенти, действия и страници. */
function openSearch(initial = '') {
  openPalette({
    kind: state.kind,
    initial,
    pages: views().map(v => ({ label: v.label, path: v.path, icon: v.icon, keywords: v.keywords })),
    actions: [
      { label: 'Нов пациент', icon: 'plus', keywords: 'добави запиши досие', hint: 'N', run: newPatient },
      { label: currentTheme() === 'dark' ? 'Светла тема' : 'Тъмна тема', icon: currentTheme() === 'dark' ? 'sun' : 'moon', keywords: 'изглед тема тъмен светъл нощен режим', run: () => { toast('Тема: ' + THEME_LABELS[toggleTheme()] + '.'); } },
      { label: 'Клавишни комбинации', icon: 'keyboard', keywords: 'клавиатура бързи клавиши помощ', hint: '?', run: shortcutsDialog },
      { label: 'Смени практиката', icon: 'swap', keywords: 'опл симп вход', run: switchPractice },
    ],
  });
}

async function switchPractice() {
  forgetRecent();
  await api.chooseWorkspace(null);
  restart();
}


function shell() {
  const k = KINDS[state.kind];
  const who = state.doctor ? state.doctor.name : 'Вход';

  const themeBtn = h('button.tool-btn', { type: 'button', onclick: () => toggleTheme() });
  const collapseBtn = h('button.tool-btn', { type: 'button', onclick: () => toggleNav() }, icon('sidebar', { size: 19 }));
  const syncTools = () => {
    // Бутонът показва към коя тема води: луна на светъл екран, слънце на тъмен.
    const toDark = currentTheme() !== 'dark';
    themeBtn.replaceChildren(icon(toDark ? 'moon' : 'sun', { size: 19 }));
    const label = toDark ? 'Тъмна тема' : 'Светла тема';
    themeBtn.title = label;
    themeBtn.setAttribute('aria-label', label);
    themeBtn.dataset.tip = label;
    const full = currentNav() === 'full';
    collapseBtn.hidden = !canChooseNav();
    collapseBtn.title = full ? 'Свий менюто до иконки' : 'Разгъни менюто';
    collapseBtn.setAttribute('aria-label', collapseBtn.title);
    collapseBtn.dataset.tip = collapseBtn.title;
  };

  const side = h('aside.side.no-print', { 'aria-label': 'Меню' },
    h('div.side-head', null,
      h('a.side-logo', { href: '#/dashboard', title: 'DocUp — към таблото' },
        h('img.wordmark', { src: '/img/docup-logo.svg', alt: 'DocUp', width: 78, height: 28 }),
        h('img.mark', { src: '/favicon.svg', alt: 'DocUp', width: 36, height: 36 }))),
    h('div.practice-tag', { title: `${k.about}: ${state.practice.name}`, dataset: { tip: `${k.short} · ${state.practice.name}` } },
      h('span.kind-chip.' + state.kind, null, k.short),
      h('span.pname', null, state.practice.name)),
    h('button.side-search', {
      type: 'button', onclick: () => openSearch(), 'aria-label': 'Търсене на пациент', 'aria-keyshortcuts': '/',
      title: 'Търсене по име, ЕГН или телефон (клавиш /)', dataset: { tip: 'Търсене ( / )' },
    }, icon('search', { size: 18 }), h('span.ph', null, 'Търсене на пациент…'), h('kbd', null, '/')),
    h('button.btn.primary.side-new', {
      type: 'button', onclick: newPatient, title: 'Нов пациент (клавиш N)', 'aria-label': 'Нов пациент', dataset: { tip: 'Нов пациент ( N )' },
    }, icon('plus', { size: 17 }), h('span.lbl', null, 'Нов пациент')),
    h('nav.main', { 'aria-label': 'Основно меню' }, views().map(v =>
      h('a', { href: '#/' + v.path, dataset: { path: v.path, tip: v.label } }, icon(v.icon), h('span.lbl', null, v.label)))),
    h('div.side-foot', null,
      h('div.side-tools', null,
        themeBtn,
        h('button.tool-btn', { type: 'button', onclick: shortcutsDialog, title: 'Клавишни комбинации (клавиш ?)', 'aria-label': 'Клавишни комбинации', dataset: { tip: 'Клавишни комбинации ( ? )' } },
          icon('keyboard', { size: 19 })),
        collapseBtn,
        h('span.grow'),
        canStopHere()
          ? h('button.tool-btn.power', { type: 'button', onclick: stopProgram, title: 'Спиране на програмата', 'aria-label': 'Спиране на програмата', dataset: { tip: 'Спиране на програмата' } },
            icon('power', { size: 19 }))
          : null),
      h('button.user-chip', { type: 'button', onclick: () => userMenu(), title: who, dataset: { tip: who } },
        avatar(state.doctor ? state.doctor.name : '?'),
        h('span.who', null,
          h('span.uname', null, who),
          h('span.urole', null, (state.doctor && state.doctor.role) || k.about)))));

  // Телефон: лента горе и меню отдолу; на компютър са скрити от стиловете.
  const primary = views().slice(0, 4);
  const rest = views().slice(4);
  const topbar = h('header.topbar.no-print', null,
    h('img.wordmark', { src: '/img/docup-logo.svg', alt: 'DocUp', width: 67, height: 24 }),
    h('span.kind-chip.' + state.kind, { title: state.practice.name }, k.short),
    h('span.grow'),
    h('button.tool-btn', { type: 'button', onclick: () => openSearch(), 'aria-label': 'Търсене на пациент' }, icon('search', { size: 22 })),
    h('button.tool-btn.new', { type: 'button', onclick: newPatient, 'aria-label': 'Нов пациент' }, icon('plus', { size: 22 })),
    h('button.tool-btn', { type: 'button', onclick: () => userMenu(), 'aria-label': 'Меню на потребителя: ' + who }, avatar(state.doctor ? state.doctor.name : '?')));
  const bottom = h('nav.bottom-nav.no-print', { 'aria-label': 'Меню' },
    primary.map(v => h('a', { href: '#/' + v.path, dataset: { path: v.path } }, icon(v.icon, { size: 22 }), h('span.lbl', null, v.label))),
    h('button', { type: 'button', dataset: { more: rest.map(v => v.path).join(' ') }, onclick: () => userMenu(rest) },
      icon('more', { size: 22 }), h('span.lbl', null, 'Още')));

  mount(root,
    h('a.skip-link', { href: '#view', onclick: (e) => { e.preventDefault(); const v = document.getElementById('view'); v.tabIndex = -1; v.focus(); } }, 'Към съдържанието'),
    h('div.app-shell', { dataset: { nav: currentNav() } },
      side,
      h('div.app-main', null, topbar, h('main', null, h('div#view'))),
      bottom),
    h('div.route-progress', { 'aria-hidden': 'true' }));
  syncTools();
  onPrefsChange(syncTools);
  applyPrefs();
}

/* ------------------------------ спиране на програмата ------------------------ */

/** Бутонът се показва само на компютъра, на който работи програмата. */
export function canStopHere() {
  return !!(state.server && state.server.canStop && state.server.local);
}

function powerIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M12 3v8 M6.3 6.3a8 8 0 1 0 11.4 0');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.2');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);
  return svg;
}

export async function stopProgram() {
  const ok = await confirmDialog({
    title: 'Спиране на програмата',
    message: 'Програмата ще спре и за другите компютри в кабинета. Всички данни вече са записани. '
      + 'За да я стартирате отново, щракнете два пъти върху иконата „DocUp“ на работния плот.',
    confirmLabel: 'Спри програмата',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.stopProgram();
    showStoppedScreen();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** Менюто на потребителя. На телефон показва и страниците, които не са в лентата отдолу. */
function userMenu(pages = []) {
  const k = KINDS[state.kind];
  const item = (ico, label, onPick, opts = {}) => h('button.menu-item' + (opts.danger ? '.danger' : '') + (opts.desktop ? '.desktop-only' : ''), {
    type: 'button', title: opts.title, onclick: () => { ctl.close(); onPick(); },
  }, icon(ico, { size: 19 }), label, opts.hint ? h('span.hint', null, opts.hint) : null);

  const ctl = modal({
    title: h('span', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
      avatar(state.doctor ? state.doctor.name : '?'),
      h('span', null,
        h('span', { style: { display: 'block' } }, state.doctor ? state.doctor.name : 'Потребител'),
        h('span.small.muted', { style: { display: 'block', fontWeight: '500' } }, (state.doctor && state.doctor.role) || k.about))),
    body: h('div.stack', null,
      pages.length ? h('div.menu-list', null, pages.map(v => item(v.icon, v.label, () => go(v.path)))) : null,
      pages.length ? h('hr', { style: { margin: '2px 0', width: '100%' } }) : null,
      h('dl.kv', null,
        h('dt', null, 'Практика'), h('dd', null, h('span.kind-chip.' + state.kind, null, k.short), state.practice.name),
        h('dt', null, 'Колеги'), h('dd', null, state.doctors.filter(d => d.active).length)),
      h('div.menu-section', null, appearanceControls()),
      h('div.menu-section', null, h('div.menu-list', null,
        pages.some(v => v.path === 'settings') ? null : item('settings', 'Настройки', () => go('settings')),
        item('keyboard', 'Клавишни комбинации', shortcutsDialog, { hint: '?', desktop: true }),
        item('swap', 'Смени практиката', switchPractice, { title: 'Към екрана за вход с двете практики — ОПЛ и СИМП. Вписването тук остава.' }),
        canStopHere() ? item('power', 'Спри програмата', stopProgram, { danger: true }) : null,
        item('logout', 'Изход', async () => { forgetRecent(); await api.logout(); restart(); }, { danger: true }))),
      state.server && state.server.canStop && !canStopHere()
        ? h('p.small.muted', { style: { margin: 0 } }, 'Програмата работи на друг компютър в кабинета и може да бъде спряна само от него.')
        : null),
    actions: (close) => [h('button.btn', { onclick: () => close() }, 'Затвори')],
  });
}

/** Клавишните комбинации — отваря се с „?“. */
function shortcutsDialog() {
  const key = (...keys) => keys.map(x => h('kbd', null, x));
  const rows = [
    [key('/'), 'Търсене на пациент, страница или действие'],
    [key('Ctrl', 'K'), 'Същото търсене, и докато пишете в поле'],
    [key('N'), 'Нов пациент'],
    [key('G', 'D'), 'Към таблото'],
    [key('G', 'P'), 'Към пациентите'],
    [key('G', 'K'), state.kind === 'simp' ? 'Към графика' : 'Към календара'],
    [key('G', 'A'), 'Към асистента'],
    [key('G', 'R'), 'Към справките'],
    [key('G', 'S'), 'Към настройките'],
    [key('Esc'), 'Затваря прозореца; с въведени данни — второ натискане'],
    [key('?'), 'Този списък'],
  ];
  modal({
    title: 'Клавишни комбинации',
    body: h('div', null,
      h('dl.keys-list', null, rows.map(([keys, text]) => [h('dt', null, keys), h('dd', null, text)])),
      h('p.small.muted', { style: { margin: '14px 0 0' } }, 'Комбинациите с една буква важат, когато не пишете в поле.')),
    actions: (close) => [h('button.btn.primary', { onclick: () => close() }, 'Разбрах')],
  });
}

/* ------------------------ първоначална настройка и вход ---------------------- */

function setupScreen(kind = 'gp') {
  const simp = kind === 'simp';
  const specialties = h('div.stack', { style: { gap: '8px' } }, Object.entries(MODULES).map(([id, m]) =>
    h('label.check', null, h('input', { type: 'checkbox', name: 'specialty', value: id }),
      h('span', null, h('strong', null, `${m.icon} ${m.name}`), h('div.tiny.dim', null, m.about)))));
  const form = h('form.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd);
      delete data.specialty;
      if (data.pin && data.pin !== data.pin2) {
        toast('Двете въвеждания на ПИН не съвпадат.', 'error');
        return;
      }
      data.workspace = kind;
      if (simp) data.specialties = fd.getAll('specialty');
      try {
        await api.setup(data);
        restart();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  },
    field('Име на практиката', input({
      name: 'practiceName', required: true,
      placeholder: simp ? 'напр. АИСИМП – Кардиология д-р Петров' : 'напр. АИППМП д-р Иванова',
    })),
    simp ? field('Регистрационен номер в РЗИ', input({ name: 'rzi', inputmode: 'numeric', maxlength: 10, placeholder: '10 цифри, по желание' }),
      'Печата се на амбулаторния лист.') : null,
    field('Вашето име', input({ name: 'doctorName', required: true, placeholder: simp ? 'д-р Петър Петров' : 'д-р Мария Иванова' })),
    simp ? h('div.grid.cols-2', null,
      field('Специалност', input({ name: 'role', list: 'setupRoles', placeholder: 'напр. Кардиолог' })),
      field('УИН', input({ name: 'uin', inputmode: 'numeric', maxlength: 10, placeholder: '10 цифри' }))) : null,
    simp ? h('datalist#setupRoles', null, ['Кардиолог', 'Ендокринолог', 'Невролог', 'Пулмолог', 'Гастроентеролог', 'Нефролог', 'Ревматолог', 'Педиатър', 'Хирург', 'Уролог', 'Офталмолог', 'Дерматолог', 'Акушер-гинеколог', 'Оториноларинголог', 'Психиатър']
      .map(r => h('option', { value: r }))) : null,
    simp ? h('div', null, h('div.lbl', { style: { fontWeight: 600, marginBottom: '6px' } }, 'Модули с клинична логика'),
      specialties,
      h('div.field-hint', null, 'Добавят раздел в досието и списък за действие. Може да се променят по-късно от „Настройки“. Прегледите, направленията, протоколите и графикът работят за всяка специалност.')) : null,
    field('Адрес на практиката', input({ name: 'address', placeholder: 'по желание' })),
    field('Телефон', input({ name: 'phone', type: 'tel', placeholder: 'по желание' })),
    h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '4px 0' } }),
    field('ПИН за вход (4–8 цифри)',
      input({ name: 'pin', type: 'password', inputmode: 'numeric', pattern: '\\d{4,8}', placeholder: 'по желание' }),
      'Оставете празно, ако практиката е само ваша и компютърът не се ползва от други.'),
    field('Повторете ПИН', input({ name: 'pin2', type: 'password', inputmode: 'numeric' })),
    h('button.btn.primary.block', { type: 'submit' }, simp ? 'Създай практиката за СИМП' : 'Създай практиката'));

  mount(root, h('main', null, h('div.setup-screen', null,
    brandBlock(),
    card(simp ? 'Нова практика за СИМП' : 'Нова практика на ОПЛ', { icon: KINDS[kind].icon },
      h('p.muted', null,
        (simp
          ? 'Практика за специализирана извънболнична помощ — със свои пациенти, потребители и ПИН, отделно от практиката на ОПЛ. '
          : 'Настройте практиката на общопрактикуващия лекар — отнема по-малко от минута. ')
        + 'Данните остават само на този компютър.'),
      form,
      h('button.btn.ghost.sm', { style: { marginTop: '10px' }, onclick: () => restart() }, '← Назад към входа')))));
}

/* ------------------------------ активиране ---------------------------------- */

/** Поле за продуктов ключ: главни букви и тирета на всеки 5 знака, докато се пише. */
export function productKeyField() {
  const input = h('input.key-input', {
    name: 'key', autocomplete: 'off', spellcheck: false, autocapitalize: 'characters',
    placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX', maxlength: 29, required: true, autofocus: true,
    'aria-label': 'Продуктов ключ',
  });
  input.addEventListener('input', () => {
    const clean = input.value.toUpperCase().replace(/^\s*DOCUP[\s-]*/, '').replace(/[^0-9A-Z]/g, '').slice(0, 20);
    input.value = clean.match(/.{1,5}/g)?.join('-') || '';
  });
  return { input, field: h('div.key-field', null, h('span.key-prefix', null, 'DOCUP-'), input), value: () => 'DOCUP-' + input.value };
}

function activationScreen() {
  const key = productKeyField();
  const error = h('div.key-error', { role: 'alert' });
  const button = h('button.btn.primary.block', { type: 'submit' }, 'Активирай');
  const form = h('form.stack', {
    style: { gap: '12px' },
    onsubmit: async (e) => {
      e.preventDefault();
      error.textContent = '';
      button.disabled = true;
      try {
        await api.activate(key.value());
        toast('DocUp е активиран.', 'ok');
        setTimeout(() => location.reload(), 600);
      } catch (err) {
        error.textContent = err.message;
        button.disabled = false;
        key.input.focus();
      }
    },
  }, key.field, error, button);

  mount(root, h('main', null, h('div.setup-screen', null,
    brandBlock(),
    card('Активиране на DocUp', { icon: '🔑' },
      h('p.muted', { style: { marginTop: 0 } },
        'Въведете продуктовия ключ, който сте получили от DocUp. Програмата се активира веднъж, '
        + 'на компютъра, на който работи — другите компютри в кабинета не се нуждаят от ключ.'),
      form,
      h('p.small.muted', { style: { margin: '14px 0 0' } },
        'Данните на практиката са запазени и ще се покажат веднага след активирането.'),
      h('p.small.muted', { style: { margin: '6px 0 0' } },
        'Нямате ключ? ',
        h('a', { href: 'https://docup.health/', target: '_blank', rel: 'noopener noreferrer' }, 'docup.health'),
        ' · ',
        h('a', { href: 'mailto:business@docup.health' }, 'business@docup.health'))))));
}

/** Логото над екрана за вход и първоначалната настройка. */
function brandBlock() {
  return h('div.setup-brand', null,
    h('img', { src: '/img/docup-logo.svg', alt: 'DocUp', width: 141, height: 51 }),
    h('div.small.muted', null, 'Платформа за общопрактикуващи лекари и специалисти'));
}

/**
 * Екранът за вход: двете практики една до друга — обща медицина (ОПЛ) и
 * специализирана извънболнична помощ (СИМП). Всяка има свои потребители и ПИН.
 */
function entryScreen(info) {
  // На екрана за вход няма вписан потребител: списъкът „последно отворени“ се изчиства.
  forgetRecent();
  const enter = async (ws) => {
    try {
      await api.chooseWorkspace(ws);
      restart();
    } catch (err) { toast(err.message, 'error'); }
  };
  const showPin = (ws, doctor) => {
    modal({
      title: doctor.name,
      body: (close) => h('form#pinForm', {
        onsubmit: async (e) => {
          e.preventDefault();
          const pin = e.target.pin.value;
          try {
            await api.login(doctor.id, pin, ws);
            close();
            restart();
          } catch (err) {
            toast(err.message, 'error');
            e.target.pin.value = '';
            e.target.pin.focus();
          }
        },
      }, field('ПИН', input({ name: 'pin', type: 'password', inputmode: 'numeric', autofocus: true, required: true }))),
      actions: (close) => [
        h('button.btn', { onclick: () => close() }, 'Отказ'),
        h('button.btn.primary', {
          onclick: () => document.getElementById('pinForm').requestSubmit(),
        }, 'Вход'),
      ],
    });
  };

  const option = (w) => {
    const k = KINDS[w.id];
    let body;
    if (!w.ready) {
      body = h('div.stack', { style: { gap: '10px' } },
        h('p.small.muted', { style: { margin: 0 } }, 'Още не е създадена.'),
        h('button.btn.primary', { onclick: () => setupScreen(w.id) }, w.id === 'simp' ? '＋ Създай практика за СИМП' : '＋ Създай практика на ОПЛ'));
    } else if (w.signedIn || !w.requireLogin) {
      body = h('div.stack', { style: { gap: '10px' } },
        w.signedIn ? h('div.small', null, 'Вписан: ', h('strong', null, w.signedIn.name)) : null,
        h('button.btn.primary', { onclick: () => enter(w.id) }, 'Влез →'));
    } else {
      body = h('div', null,
        h('p.small.muted', { style: { margin: '0 0 8px' } }, 'Изберете себе си:'),
        h('div.login-doctors', null, w.doctors.map(doc =>
          h('button', { onclick: () => showPin(w.id, doc) },
            avatar(doc.name),
            h('div', null,
              h('div', { style: { fontWeight: 600 } }, doc.name),
              h('div.small.muted', null, doc.role || ''))))));
    }
    return h('section.card.entry-option' + (w.ready ? '' : '.empty-option') + (info.workspaceChosen && info.workspace === w.id ? '.current' : ''), null,
      h('div.body', null,
        h('div.entry-head', null,
          h('span.entry-icon', null, k.icon),
          h('div', null,
            h('div.entry-kind', null, k.title, h('span.kind-chip.' + w.id, null, k.short)),
            h('div.tiny.dim', null, k.about))),
        w.ready ? h('div.entry-name', null, w.name) : null,
        w.specialties && w.specialties.length ? h('div.tiny.dim', { style: { marginBottom: '8px' } }, w.specialties.join(' · ')) : null,
        body));
  };

  mount(root, h('main', null, h('div.setup-screen.entry', null,
    brandBlock(),
    h('h1.entry-title', null, 'Вход в DocUp'),
    h('p.muted.center', { style: { marginTop: 0 } }, 'Изберете практиката, в която ще работите.'),
    h('div.entry-grid', null, (info.workspaces || []).map(option)),
    themeFoot())));
}

/** Малък бутон за темата под екраните за вход и настройка. */
function themeFoot() {
  const btn = h('button.btn.ghost.sm', { type: 'button', onclick: () => { toggleTheme(); draw(); } });
  const draw = () => mount(btn, icon(currentTheme() === 'dark' ? 'sun' : 'moon', { size: 16 }), currentTheme() === 'dark' ? 'Светла тема' : 'Тъмна тема');
  draw();
  return h('div.entry-foot', null, btn);
}

/* -------------------------------- клавиши ------------------------------------ */

function keyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    // Ctrl+K отваря търсенето отвсякъде, и докато се пише в поле.
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'к' || e.key === 'К')) {
      e.preventDefault();
      openSearch();
      return;
    }
    if (typing || e.metaKey || e.altKey || e.ctrlKey) return;
    // Под отворен прозорец буквите не правят нищо.
    if (document.querySelector('.overlay, .palette-overlay')) return;

    if (e.key === '/') {
      e.preventDefault();
      openSearch();
    } else if (e.key === '?') {
      e.preventDefault();
      shortcutsDialog();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      newPatient();
    } else if (e.key === 'g' || e.key === 'G') {
      // g после d/p/k/a/r/s — бърз преход между изгледите
      const once = (ev) => {
        document.removeEventListener('keydown', once, true);
        const map = { d: 'dashboard', p: 'patients', k: state.kind === 'simp' ? 'agenda' : 'calendar', a: 'assistant', s: 'settings', r: 'reports' };
        const to = map[String(ev.key).toLowerCase()];
        if (to) { ev.preventDefault(); go(to); }
      };
      document.addEventListener('keydown', once, true);
      setTimeout(() => document.removeEventListener('keydown', once, true), 1500);
    }
  });
}

/* --------------------------------- старт ------------------------------------- */

async function start() {
  mount(root, h('main', null, loading('Свързване с данните на практиката…')));
  setUnauthorizedHandler(() => {
    // Сесията е изтекла: връщаме към екрана за вход, без да губим адреса.
    if (!document.querySelector('.entry-grid')) { forgetRecent(); location.reload(); }
  });

  let info;
  try {
    info = await api.state();
  } catch (err) {
    mount(root, h('main', null, card('Няма връзка', {}, h('p', null, err.message))));
    return;
  }

  if (info.needsActivation) { activationScreen(); return; }

  state.practice = info.practice || state.practice;
  state.doctors = info.doctors || [];
  state.kind = info.kind === 'simp' ? 'simp' : 'gp';

  // Първо се избира практиката (ОПЛ или СИМП); вход с ПИН — от същия екран.
  if (!info.workspaceChosen) { entryScreen(info); return; }
  if (info.needsSetup) { setupScreen(state.kind); return; }
  if (!info.doctor && info.requireLogin) { entryScreen(info); return; }

  state.doctor = info.doctor || { name: 'Практиката', role: '', id: '' };

  const boot = await api.bootstrap();
  state.kind = boot.kind === 'simp' ? 'simp' : 'gp';
  document.body.dataset.kind = state.kind;
  state.practice = boot.practice;
  state.doctors = boot.doctors;
  state.schedule = boot.schedule;
  state.settings = boot.settings;
  state.server = boot.server || null;
  state.extraBackup = boot.extraBackup || null;
  state.license = boot.license || null;
  state.scheduleById = new Map(boot.schedule.map(i => [i.id, i]));

  shell();
  keyboardShortcuts();
  window.addEventListener('hashchange', route);
  route();

  if (state.settings.requireLogin && info.doctor) startIdleLogout(Number(state.settings.autoLogoutMinutes) || 0);
  maybeShowWhatsNew(state.server);
}

/** Дейност от календара по код — включително повторение на дейност за възрастни (код@месеци). */
export function scheduleItem(id) {
  return state.scheduleById.get(id) || findScheduleItem(state.schedule, id)?.item || null;
}

/** Презарежда календара и настройките след промяна в „Настройки“. */
export async function refreshBootstrap() {
  const boot = await api.bootstrap();
  state.kind = boot.kind === 'simp' ? 'simp' : 'gp';
  state.practice = boot.practice;
  state.doctors = boot.doctors;
  state.schedule = boot.schedule;
  state.settings = boot.settings;
  state.server = boot.server || null;
  state.extraBackup = boot.extraBackup || null;
  state.license = boot.license || null;
  state.scheduleById = new Map(boot.schedule.map(i => [i.id, i]));
}

export { route };

// Модулите са заредени — проверката за стар браузър (boot-check.js) вече не е нужна.
window.__dkStarted?.();
start();
