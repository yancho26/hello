/* Повтарящи се части от интерфейса: карти, таблици, прозорци, известия. */

import { clear, h, initials, mount, svg } from './dom.js';
import { STATUS_LABELS } from '../shared/schedule.js';
import { durationText, formatDate, relativeDays } from '../shared/dates.js';

/* --------------------------------- известия ---------------------------------- */

let toastHost = null;

export function toast(message, kind = '') {
  if (!toastHost) {
    toastHost = h('div.toasts');
    document.body.appendChild(toastHost);
  }
  const el = h('div.toast' + (kind ? '.' + kind : ''), message);
  toastHost.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .2s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 220);
  }, kind === 'error' ? 6000 : 3200);
}

/* --------------------------------- прозорци ---------------------------------- */

/**
 * Отваря модален прозорец. `render(close)` връща тялото;
 * бутоните се задават чрез `actions(close)`.
 */
export function modal({ title, body, actions, wide = false, onClose }) {
  const overlay = h('div.overlay');
  const close = (result) => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose(result);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  };

  const box = h('div.modal' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true' },
    h('header', null,
      h('h2', null, title),
      h('button.icon-btn', { onclick: () => close(), title: 'Затваряне', type: 'button' }, '✕')),
    h('div.body', null, typeof body === 'function' ? body(close) : body),
    actions ? h('footer', null, actions(close)) : null);

  overlay.appendChild(box);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);

  const first = box.querySelector('input, select, textarea, button.primary');
  if (first) setTimeout(() => first.focus(), 30);
  return { close, box };
}

/** Питане за потвърждение с ясно формулирано действие. */
export function confirmDialog({ title, message, confirmLabel = 'Потвърди', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    modal({
      title,
      body: h('p', null, message),
      actions: (close) => [
        h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
        h('button.btn' + (danger ? '.danger' : '.primary'), {
          type: 'button',
          onclick: () => { done = true; close(); resolve(true); },
        }, confirmLabel),
      ],
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

/* ---------------------------------- форми ------------------------------------ */

/** Поле с етикет. `input` е готов елемент. */
export function field(label, input, hint) {
  return h('label.field', null,
    h('span.lbl', null, label),
    input,
    hint ? h('div.field-hint', null, hint) : null);
}

export function input(props = {}) {
  return h('input', { type: 'text', ...props });
}

/**
 * Поле за десетично число.
 *
 * Умишлено НЕ е <input type="number">: при българска подредба лекарят пише
 * „7,4“, а числовото поле мълчаливо отхвърля запетаята и стойността се губи.
 * Тук се приемат и запетая, и точка, а преобразуването е при изпращането.
 */
export function numberInput(props = {}) {
  const { min, max, ...rest } = props;
  const el = h('input', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off', ...rest,
  });
  el.addEventListener('input', () => {
    const value = normaliseDecimal(el.value);
    const bad = el.value.trim() !== '' && (
      !/^-?\d*[.,]?\d*$/.test(el.value.trim())
      || (value !== '' && ((min !== undefined && +value < min) || (max !== undefined && +value > max))));
    el.classList.toggle('invalid', bad);
  });
  return el;
}

/** „7,4“ → „7.4“; празното си остава празно. */
export function normaliseDecimal(value) {
  return String(value ?? '').trim().replace(',', '.');
}

/** Преобразува десетичните полета във форма преди изпращане. */
export function decimalFields(data, keys) {
  const out = { ...data };
  for (const key of keys) {
    if (out[key] !== undefined) out[key] = normaliseDecimal(out[key]);
  }
  return out;
}

export function select(options, props = {}) {
  const el = h('select', props);
  for (const opt of options) {
    el.appendChild(h('option', { value: opt.value, selected: opt.selected }, opt.label));
  }
  return el;
}

/** Показва грешка под конкретно поле или като известие. */
export function showFormError(form, message) {
  const box = form.querySelector('.form-error');
  if (box) {
    box.textContent = message;
    box.classList.remove('hidden');
  } else {
    toast(message, 'error');
  }
}

/* --------------------------------- елементи ---------------------------------- */

export function badge(status, text) {
  return h('span.badge.' + status, null, text || STATUS_LABELS[status] || status);
}

/** Обозначение на статус със срока — това вижда лекарят най-често. */
export function statusBadge(entry) {
  const s = entry.status;
  if (s === 'done') {
    return badge('done', entry.record && entry.record.date
      ? 'поставена ' + formatDate(entry.record.date) : 'изпълнено');
  }
  if (s === 'overdue') return badge('overdue', `просрочено с ${durationText(entry.overdueDays)}`);
  if (s === 'missed') return badge('missed', 'пропуснато');
  if (s === 'deferral_ended') return badge('deferral_ended', 'отводът изтече');
  if (s === 'due') return badge('due', 'дължимо сега');
  if (s === 'soon') return badge('soon', relativeDays(entry.actionDate || entry.due));
  if (s === 'deferred') {
    return badge('deferred', 'отвод до ' + formatDate(entry.record ? entry.record.deferUntil : entry.actionDate));
  }
  if (s === 'refused') return badge('refused', 'отказ');
  if (s === 'skipped') return badge('skipped', 'не подлежи');
  return badge('future', formatDate(entry.due));
}

export function card(title, opts = {}, ...children) {
  return h('section.card', null,
    title ? h('header', null,
      h('h2', null, opts.icon ? h('span', null, opts.icon) : null, title),
      opts.actions ? h('div.row.tight', null, opts.actions) : null) : null,
    h('div.body' + (opts.tight ? '.tight' : ''), null, ...children));
}

export function stat(value, label, opts = {}) {
  return h('div.stat' + (opts.kind ? '.' + opts.kind : '') + (opts.onclick ? '.clickable' : ''),
    { onclick: opts.onclick },
    h('div.value', null, value),
    h('div.label', null, label),
    opts.foot ? h('div.foot', null, opts.foot) : null);
}

export function empty(message, icon = '✓') {
  return h('div.empty', null, h('div.big', null, icon), h('div', null, message));
}

export function loading(message = 'Зареждане…') {
  return h('div.loading', null, h('div.spinner'), message);
}

/** Таблица с шапка и редове; `columns` са низове или {label, class}. */
export function table(columns, rows) {
  const thead = h('thead', null, h('tr', null,
    columns.map(c => h('th', typeof c === 'string' ? null : { class: c.class }, typeof c === 'string' ? c : c.label))));
  return h('div.table-wrap', null, h('table', null, thead, h('tbody', null, rows)));
}

/** Пръстен с процент — обхват на имунизациите. */
export function coverageRing(pct, size = 62) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const value = pct === null ? 0 : pct;
  const colour = pct === null ? 'var(--line-strong)'
    : pct >= 95 ? 'var(--ok)' : pct >= 80 ? 'var(--warn)' : 'var(--danger)';
  return h('div.ring', null,
    svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
      svg('circle', {
        cx: size / 2, cy: size / 2, r, fill: 'none',
        stroke: 'var(--line)', 'stroke-width': 7,
      }),
      svg('circle', {
        cx: size / 2, cy: size / 2, r, fill: 'none',
        stroke: colour, 'stroke-width': 7, 'stroke-linecap': 'round',
        'stroke-dasharray': `${(c * value) / 100} ${c}`,
        transform: `rotate(-90 ${size / 2} ${size / 2})`,
      })),
    h('div', null,
      h('div.pct', null, pct === null ? '—' : pct + '%'),
      h('div.small.muted', null, 'обхват')));
}

export function avatar(name) {
  return h('span.avatar', null, initials(name));
}

export { clear, h, mount };
