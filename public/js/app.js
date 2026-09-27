/* Начало на приложението: вписване, навигация, общо състояние. */

import { api, setUnauthorizedHandler } from './api.js';
import { avatar, card, confirmDialog, field, h, input, loading, modal, mount, toast } from './ui/components.js';
import { showStoppedScreen } from './connection.js';
import { startIdleLogout } from './idle.js';
import { maybeShowWhatsNew } from './whats-new.js';
import { renderDashboard } from './views/dashboard.js';
import { renderPatients } from './views/patients.js';
import { renderPatient } from './views/patient.js';
import { renderReports } from './views/reports.js';
import { renderSettings } from './views/settings.js';
import { renderCalendar } from './views/calendar.js';

export const state = {
  doctor: null,
  /* Изгледът, който показва списък, може да поеме глобалното търсене —
     така в интерфейса има само едно поле за търсене, а не две. */
  searchHandler: null,
  practice: { name: 'Практика' },
  doctors: [],
  schedule: [],
  settings: { horizonDays: 30 },
  scheduleById: new Map(),
  /* Адреси и папки на сървъра — показват се в „Настройки → Данни“. */
  server: null,
};

const VIEWS = [
  { path: 'dashboard', label: 'Табло', render: renderDashboard },
  { path: 'patients', label: 'Пациенти', render: renderPatients },
  { path: 'calendar', label: 'Календар', render: renderCalendar },
  { path: 'reports', label: 'Справки', render: renderReports },
  { path: 'settings', label: 'Настройки', render: renderSettings },
];

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

async function route() {
  const { head, rest } = currentRoute();
  const host = document.getElementById('view');
  if (!host) return;

  for (const link of document.querySelectorAll('nav.main a')) {
    const target = head === 'patient' ? 'patients' : head;
    link.classList.toggle('active', link.dataset.path === target);
  }

  state.searchHandler = null;
  mount(host, loading());
  try {
    if (head === 'patient' && rest[0]) {
      await renderPatient(host, rest[0]);
      return;
    }
    const view = VIEWS.find(v => v.path === head) || VIEWS[0];
    await view.render(host);
  } catch (err) {
    mount(host, card('Възникна грешка', {},
      h('p', null, err.message),
      h('button.btn', { onclick: () => route() }, 'Опитай отново')));
  }
}

/* --------------------------------- обвивка ----------------------------------- */

function shell() {
  let searchTimer = null;
  const searchInput = h('input', {
    type: 'search',
    placeholder: 'Търсене…',
    title: 'Търсене по име, ЕГН или телефон (клавиш /)',
    'aria-label': 'Търсене на дете',
    oninput: (e) => {
      const q = e.target.value;
      clearTimeout(searchTimer);
      // На екрана с пациентите филтрираме на живо; отвсякъде другаде
      // изчакваме Enter, за да не прескачаме изгледа при всяко натискане.
      if (currentRoute().head === 'patients' && state.searchHandler) {
        searchTimer = setTimeout(() => state.searchHandler(q), 180);
      }
    },
    onkeydown: (e) => {
      if (e.key === 'Enter') {
        const q = e.target.value.trim();
        if (currentRoute().head === 'patients') {
          if (state.searchHandler) state.searchHandler(q);
        } else {
          location.hash = '#/patients' + (q ? '?q=' + encodeURIComponent(q) : '');
        }
      }
      if (e.key === 'Escape') {
        e.target.value = '';
        if (currentRoute().head === 'patients' && state.searchHandler) state.searchHandler('');
        e.target.blur();
      }
    },
  });
  searchInput.id = 'globalSearch';

  const header = h('header.app', null,
    h('div.brand', null,
      h('img.mark', { src: '/favicon.svg', alt: '', width: 34, height: 34 }),
      h('div', null,
        h('div.name', null, 'Детска консултация'),
        h('div.sub', null, state.practice.name))),
    h('nav.main', null, VIEWS.map(v =>
      h('a', { href: '#/' + v.path, dataset: { path: v.path } }, v.label))),
    h('div.search-wrap', null,
      h('span.icon', null, '⌕'),
      searchInput,
      h('kbd', null, '/')),
    h('button.btn.primary.sm.no-print', {
      onclick: () => import('./views/patients.js').then(m => m.openPatientForm()),
      title: 'Ново дете (N)',
    }, '＋ Ново дете'),
    h('button.user-chip', { onclick: userMenu },
      avatar(state.doctor ? state.doctor.name : '?'),
      h('span', null, state.doctor ? state.doctor.name : 'Вход')),
    canStopHere()
      ? h('button.btn.icon.power.no-print', {
        onclick: stopProgram,
        title: 'Спиране на програмата',
        'aria-label': 'Спиране на програмата',
      }, powerIcon())
      : null);

  mount(root, header, h('main', null, h('div#view')));
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
      + 'За да я стартирате отново, щракнете два пъти върху иконата „Детска консултация“ на работния плот.',
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

function userMenu() {
  modal({
    title: state.doctor ? state.doctor.name : 'Потребител',
    body: h('div.stack', null,
      h('div.muted.small', null, state.doctor ? state.doctor.role : ''),
      h('dl.kv', null,
        h('dt', null, 'Практика'), h('dd', null, state.practice.name),
        h('dt', null, 'Колеги'), h('dd', null, state.doctors.filter(d => d.active).length)),
      h('div.row', null,
        h('button.btn', { onclick: () => { location.hash = '#/settings'; document.querySelector('.overlay').remove(); } },
          'Настройки')),
      state.server && state.server.canStop
        ? h('div.menu-section', null,
          h('div.lbl', null, 'Програмата'),
          canStopHere()
            ? h('button.btn.danger', {
              onclick: () => { document.querySelector('.overlay').remove(); stopProgram(); },
            }, '⏻ Спри програмата')
            : h('p.small.muted', { style: { margin: 0 } },
              'Програмата работи на друг компютър в кабинета и може да бъде спряна само от него.'))
        : null),
    actions: (close) => [
      h('button.btn', { onclick: () => close() }, 'Затвори'),
      h('button.btn.danger', {
        onclick: async () => { await api.logout(); location.reload(); },
      }, 'Изход'),
    ],
  });
}

/* ------------------------ първоначална настройка и вход ---------------------- */

function setupScreen() {
  const form = h('form.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      if (data.pin && data.pin !== data.pin2) {
        toast('Двете въвеждания на ПИН не съвпадат.', 'error');
        return;
      }
      try {
        await api.setup(data);
        location.reload();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  },
    field('Име на практиката', input({ name: 'practiceName', required: true, placeholder: 'напр. АИППМП д-р Иванова' })),
    field('Вашето име', input({ name: 'doctorName', required: true, placeholder: 'д-р Мария Иванова' })),
    field('Адрес на практиката', input({ name: 'address', placeholder: 'по желание' })),
    field('Телефон', input({ name: 'phone', type: 'tel', placeholder: 'по желание' })),
    h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '4px 0' } }),
    field('ПИН за вход (4–8 цифри)',
      input({ name: 'pin', type: 'password', inputmode: 'numeric', pattern: '\\d{4,8}', placeholder: 'по желание' }),
      'Оставете празно, ако практиката е само ваша и компютърът не се ползва от други.'),
    field('Повторете ПИН', input({ name: 'pin2', type: 'password', inputmode: 'numeric' })),
    h('button.btn.primary.block', { type: 'submit' }, 'Създай практиката'));

  mount(root, h('main', null, h('div.setup-screen', null,
    card('Добре дошли', { icon: '🧸' },
      h('p.muted', null,
        'Това е първото стартиране. Настройте практиката — отнема по-малко от минута. '
        + 'Данните остават само на този компютър.'),
      form))));
}

function loginScreen(doctors) {
  const showPin = (doctor) => {
    modal({
      title: doctor.name,
      body: (close) => h('form#pinForm', {
        onsubmit: async (e) => {
          e.preventDefault();
          const pin = e.target.pin.value;
          try {
            await api.login(doctor.id, pin);
            close();
            location.reload();
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

  mount(root, h('main', null, h('div.setup-screen', null,
    card(state.practice.name, { icon: '🧸' },
      h('p.muted', null, 'Изберете себе си, за да продължите.'),
      h('div.login-doctors', null, doctors.filter(d => d.active).map(doc =>
        h('button', { onclick: () => showPin(doc) },
          avatar(doc.name),
          h('div', null,
            h('div', { style: { fontWeight: 600 } }, doc.name),
            h('div.small.muted', null, doc.role || '')))))))));
}

/* -------------------------------- клавиши ------------------------------------ */

function keyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    if (typing || e.metaKey || e.altKey) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const box = document.getElementById('globalSearch');
        if (box) { box.focus(); box.select(); }
      }
      return;
    }
    if (e.ctrlKey && e.key !== 'k') return;

    if (e.key === '/' || (e.ctrlKey && e.key === 'k')) {
      e.preventDefault();
      const box = document.getElementById('globalSearch');
      if (box) { box.focus(); box.select(); }
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      import('./views/patients.js').then(m => m.openPatientForm());
    } else if (e.key === 'g') {
      // g после d/p/s — бърз преход между изгледите
      const once = (ev) => {
        document.removeEventListener('keydown', once, true);
        const map = { d: 'dashboard', p: 'patients', k: 'calendar', s: 'settings', r: 'reports' };
        if (map[ev.key]) { ev.preventDefault(); go(map[ev.key]); }
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
    if (!document.querySelector('.login-doctors')) location.reload();
  });

  let info;
  try {
    info = await api.state();
  } catch (err) {
    mount(root, h('main', null, card('Няма връзка', {}, h('p', null, err.message))));
    return;
  }

  state.practice = info.practice || state.practice;
  state.doctors = info.doctors || [];

  if (info.needsSetup) { setupScreen(); return; }
  if (!info.doctor && info.requireLogin) { loginScreen(info.doctors); return; }

  state.doctor = info.doctor || { name: 'Практиката', role: '', id: '' };

  const boot = await api.bootstrap();
  state.practice = boot.practice;
  state.doctors = boot.doctors;
  state.schedule = boot.schedule;
  state.settings = boot.settings;
  state.server = boot.server || null;
  state.extraBackup = boot.extraBackup || null;
  state.scheduleById = new Map(boot.schedule.map(i => [i.id, i]));

  shell();
  keyboardShortcuts();
  window.addEventListener('hashchange', route);
  route();

  if (state.settings.requireLogin && info.doctor) startIdleLogout(Number(state.settings.autoLogoutMinutes) || 0);
  maybeShowWhatsNew(state.server);
}

/** Презарежда календара и настройките след промяна в „Настройки“. */
export async function refreshBootstrap() {
  const boot = await api.bootstrap();
  state.practice = boot.practice;
  state.doctors = boot.doctors;
  state.schedule = boot.schedule;
  state.settings = boot.settings;
  state.server = boot.server || null;
  state.extraBackup = boot.extraBackup || null;
  state.scheduleById = new Map(boot.schedule.map(i => [i.id, i]));
}

export { route };

start();
