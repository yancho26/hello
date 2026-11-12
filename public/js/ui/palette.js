/* Бързо търсене (версия 5.0).
 *
 * Един прозорец за всичко: докато се пише, отдолу излизат пациентите с това име, ЕГН или телефон;
 * със стрелките и Enter се отваря досието. Без текст показва последно отворените досиета,
 * действията и страниците. Отваря се с „/“ или Ctrl+K от всеки екран.
 *
 * Последно отворените се пазят само докато разделът на браузъра е отворен (sessionStorage) и се
 * изчистват при изход и при смяна на практиката — имената не остават в браузъра. */

import { api } from '../api.js';
import { h, initials } from './dom.js';
import { icon } from './icons.js';
import { matchItems, normaliseSearch, pushRecent } from '../shared/quick-search.js';
import { formatAge } from '../shared/dates.js';

const recentKey = (kind) => `docup.recent.${kind}`;
const LIMIT = 8;
let current = null;

export function recentPatients(kind) {
  try { return pushRecent(JSON.parse(sessionStorage.getItem(recentKey(kind)) || '[]'), null); } catch { return []; }
}

/** Записва отвореното досие в „последно отворени“ за този раздел на браузъра. */
export function rememberPatient(kind, patient) {
  if (!patient || !patient.id) return;
  try { sessionStorage.setItem(recentKey(kind), JSON.stringify(pushRecent(recentPatients(kind), patient))); } catch { /* не пази */ }
}

/** Изчиства „последно отворени“ — при изход и при смяна на практиката. */
export function forgetRecent() {
  try { for (const kind of ['gp', 'simp']) sessionStorage.removeItem(recentKey(kind)); } catch { /* няма какво */ }
}

/** Името с подчертани части, които съвпадат с думите от заявката. */
function highlight(text, query) {
  const words = normaliseSearch(query).split(' ').filter(w => w.length > 0 && !/^\d+$/.test(w));
  const lower = String(text).toLowerCase();
  const marks = [];
  for (const w of words) {
    // Търси в началото на дума, после където и да е.
    let at = -1;
    for (const m of lower.matchAll(/(^|\s)(\S)/g)) {
      const start = m.index + m[1].length;
      if (lower.startsWith(w, start)) { at = start; break; }
    }
    if (at < 0) at = lower.indexOf(w);
    if (at >= 0) marks.push([at, at + w.length]);
  }
  if (!marks.length) return [text];
  marks.sort((a, b) => a[0] - b[0]);
  const out = [];
  let pos = 0;
  for (const [a, b] of marks) {
    if (a < pos) continue;
    if (a > pos) out.push(text.slice(pos, a));
    out.push(h('mark', null, text.slice(a, b)));
    pos = b;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

const sexMark = (sex) => (sex === 'f' ? ' ♀' : sex === 'm' ? ' ♂' : '');

/**
 * Отваря прозореца за търсене.
 * @param {object} o
 * @param {'gp'|'simp'} o.kind
 * @param {Array<{label:string, path:string, icon:string, keywords?:string}>} o.pages
 * @param {Array<{label:string, icon:string, run:Function, keywords?:string, hint?:string}>} o.actions
 * @param {string} [o.initial]
 */
export function openPalette({ kind, pages = [], actions = [], initial = '' }) {
  if (current) { current.input.focus(); return; }
  const opener = document.activeElement;

  const input = h('input', {
    type: 'search', placeholder: 'Име, ЕГН или телефон на пациент…', autocomplete: 'off', spellcheck: false,
    'aria-label': 'Търсене на пациент, страница или действие', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'paletteList',
  });
  input.value = initial;
  const list = h('div.palette-list#paletteList', { role: 'listbox' });
  const box = h('div.palette', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Бързо търсене' },
    h('div.palette-input', null, icon('search', { size: 20 }), input, h('kbd', null, 'Esc')),
    list,
    h('div.palette-foot', null,
      h('span', null, h('kbd', null, '↑'), h('kbd', null, '↓'), 'избор'),
      h('span', null, h('kbd', null, 'Enter'), 'отваряне'),
      h('span', null, h('kbd', null, 'Esc'), 'затваряне')));
  const overlay = h('div.palette-overlay', null, box);

  let items = [];       // плосък списък с елементите, които могат да се изберат
  let selected = 0;
  let seq = 0;
  let timer = null;
  let found = null;     // последният отговор на сървъра: { q, total, items }

  const close = () => {
    clearTimeout(timer);
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    current = null;
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
  };
  const run = (fn) => { close(); fn(); };

  const select = (i, scroll = true) => {
    if (!items.length) return;
    selected = (i + items.length) % items.length;
    items.forEach((it, k) => {
      it.el.classList.toggle('sel', k === selected);
      it.el.setAttribute('aria-selected', String(k === selected));
    });
    if (scroll) {
      const el = items[selected].el;
      const top = el.offsetTop - list.offsetTop;
      if (top < list.scrollTop) list.scrollTop = Math.max(0, top - 40);
      else if (top + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + el.offsetHeight - list.clientHeight + 8;
    }
  };

  const row = ({ lead, title, sub, hint, onPick, badges }) => {
    const el = h('button.palette-item', { type: 'button', role: 'option', tabindex: -1 },
      lead,
      h('div.pi-main', null,
        h('div.pi-title', null, title, badges || null),
        sub ? h('div.pi-sub', null, sub) : null),
      h('span.pi-hint', null, hint || 'отвори', icon('enter', { size: 14 })));
    const entry = { el, onPick };
    el.addEventListener('click', () => run(onPick));
    el.addEventListener('mousemove', () => { const k = items.indexOf(entry); if (k >= 0 && k !== selected) select(k, false); });
    items.push(entry);
    return el;
  };

  const patientRow = (p, q) => row({
    lead: h('span.p-avatar', { 'aria-hidden': 'true' }, initials(p.name)),
    title: [highlight(p.name, q), h('span.dim', null, sexMark(p.sex))],
    badges: [
      p.allergies ? h('span.badge.alert', { style: { marginLeft: '8px' } }, 'алергия') : null,
      p.archived ? h('span.badge', { style: { marginLeft: '8px' } }, 'архив') : null,
    ],
    sub: [p.birthDate ? formatAge(p.birthDate) : null, p.egn ? `ЕГН ${p.egn}` : null, p.phone || null].filter(Boolean).join(' · '),
    onPick: () => { location.hash = '#/patient/' + p.id; },
  });

  const draw = () => {
    const q = input.value.trim();
    items = [];
    const parts = [];
    const group = (title, rows) => { if (rows.length) parts.push(h('div.palette-group', null, title), ...rows); };

    if (!q) {
      group('Последно отворени', recentPatients(kind).map(p => patientRow(p, '')));
    } else if (found && found.q === q) {
      group(found.total > found.items.length ? `Пациенти — първите ${found.items.length} от ${found.total}` : 'Пациенти', found.items.map(p => patientRow(p, q)));
      if (found.total > found.items.length) {
        parts.push(row({
          lead: h('span.pi-ico', null, icon('patients', { size: 18 })),
          title: `Всички ${found.total} съвпадения в списъка с пациенти`,
          hint: 'покажи',
          onPick: () => { location.hash = '#/patients?q=' + encodeURIComponent(q); },
        }));
      }
    }
    group('Действия', matchItems(actions, q).map(a => row({
      lead: h('span.pi-ico', null, icon(a.icon, { size: 18 })), title: a.label, sub: a.sub, hint: a.hint || 'изпълни', onPick: a.run,
    })));
    group('Отиди на', matchItems(pages, q).map(pg => row({
      lead: h('span.pi-ico', null, icon(pg.icon, { size: 18 })), title: pg.label, hint: 'отвори',
      onPick: () => { location.hash = '#/' + pg.path; },
    })));

    if (!items.length) {
      parts.push(h('div.palette-empty', null,
        q && (!found || found.q !== q) ? 'Търсене…'
          : q ? `Няма пациент, страница или действие за „${q}“.` : 'Започнете да пишете име, ЕГН или телефон.'));
    }
    list.replaceChildren(...parts);
    selected = 0;
    select(0);
  };

  const search = () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (!q) { found = null; draw(); return; }
    const my = ++seq;
    timer = setTimeout(async () => {
      try {
        const res = await api.search(q, LIMIT);
        if (my !== seq || !current) return;
        found = { q, total: res.total, items: res.patients };
      } catch {
        if (my !== seq || !current) return;
        found = { q, total: 0, items: [] };
      }
      draw();
    }, 110);
    // Страниците и действията се филтрират веднага; пациентите идват след миг от сървъра.
    draw();
  };

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); select(selected + 1); }
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); select(selected - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selected]) run(items[selected].onPick);
    }
  }

  input.addEventListener('input', search);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
  current = { input, close };
  input.focus();
  input.select();
  if (initial.trim()) search(); else draw();
}

export function closePalette() {
  if (current) current.close();
}
