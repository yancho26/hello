/* Повтарящи се части от интерфейса: карти, таблици, прозорци, известия. */

import { clear, h, initials, mount, svg } from './dom.js';
import { icon } from './icons.js';
import { STATUS_LABELS } from '../shared/schedule.js';
import { durationText, formatDate, relativeDays } from '../shared/dates.js';

/* --------------------------------- известия ---------------------------------- */

let toastHost = null;

export function toast(message, kind = '') {
  if (!toastHost) {
    toastHost = h('div.toasts');
    document.body.appendChild(toastHost);
  }
  const el = h('div.toast' + (kind ? '.' + kind : ''), { role: kind === 'error' ? 'alert' : 'status' },
    icon(kind === 'ok' ? 'check' : kind === 'error' || kind === 'warn' ? 'alert' : 'info', { size: 17 }),
    h('div', null, message));
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
  /* Щом в прозореца е въведено нещо, случаен клик извън него не го затваря,
   * а Esc иска второ натискане — за да не се губят попълнени данни. */
  let dirty = false;
  let escArmed = 0;
  const opener = document.activeElement;
  const close = (result) => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    // Фокусът се връща там, откъдето е отворен прозорецът — клавиатурата не губи мястото си.
    if (opener && opener.isConnected && typeof opener.focus === 'function' && !document.querySelector('.overlay')) opener.focus();
    if (onClose) onClose(result);
  };
  const warn = h('div.unsaved-warn', { hidden: true },
    'Има въведени данни. Натиснете Esc още веднъж, за да затворите без запис.');
  const onKey = (e) => {
    if (e.key !== 'Escape' && e.key !== 'Tab') return;
    // Само най-горният прозорец реагира.
    const overlays = document.querySelectorAll('.overlay');
    if (overlays[overlays.length - 1] !== overlay) return;
    if (e.key === 'Tab') {
      // Tab обикаля само в прозореца, не под него.
      const items = [...box.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.disabled && el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    e.stopPropagation();
    if (dirty && Date.now() - escArmed > 3000) {
      escArmed = Date.now();
      warn.hidden = false;
      setTimeout(() => { warn.hidden = true; }, 3000);
      return;
    }
    close();
  };

  const box = h('div.modal' + (wide === 'x' ? '.wide.xwide' : wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': typeof title === 'string' ? title : null },
    h('header', null,
      h('h2', null, title),
      h('button.icon-btn', { onclick: () => close(), title: 'Затваряне (Esc)', 'aria-label': 'Затваряне', type: 'button' }, icon('x', { size: 18 }))),
    h('div.body', null, typeof body === 'function' ? body(close) : body),
    warn,
    actions ? h('footer', null, actions(close)) : null);
  box.addEventListener('input', () => { dirty = true; });

  overlay.appendChild(box);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target !== overlay) return;
    if (dirty) {
      box.classList.remove('nudge');
      void box.offsetWidth; // рестартира анимацията
      box.classList.add('nudge');
      return;
    }
    close();
  });
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
  if (s === 'done' && entry.record && entry.record.imported) {
    return badge('done', 'прието при внасяне');
  }
  if (s === 'done') {
    return badge('done', entry.record && entry.record.date
      ? (entry.group === 'vaccine' ? 'поставена ' : 'извършено ') + formatDate(entry.record.date) : 'изпълнено');
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
      h('h2', null, opts.icon ? h('span.card-ico', { 'aria-hidden': 'true' }, opts.icon) : null, title),
      opts.actions ? h('div.row.tight', null, opts.actions) : null) : null,
    h('div.body' + (opts.tight ? '.tight' : ''), null, ...children));
}

export function stat(value, label, opts = {}) {
  // Брояч, който води някъде, е бутон и за клавиатурата: Tab стига до него, Enter го натиска.
  const act = opts.onclick ? {
    onclick: opts.onclick, role: 'button', tabindex: 0,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onclick(e); } },
  } : {};
  return h('div.stat' + (opts.kind ? '.' + opts.kind : '') + (opts.onclick ? '.clickable' : ''),
    act,
    h('div.value', null, value),
    h('div.label', null, label),
    opts.foot ? h('div.foot', null, opts.foot) : null);
}

export function empty(message, icon = '✓') {
  return h('div.empty', null, icon ? h('div.big', null, icon) : null, h('div', null, message));
}

export function loading(message = 'Зареждане…') {
  return h('div.loading', null, h('div.spinner'), message);
}

/**
 * Таблица с шапка и редове; `columns` са низове или {label, class}.
 * На телефон всеки ред става картичка, а пред стойността стои името на колоната (стиловете са
 * в app.css, „table.stack-sm“). За широки числови таблици: table(колони, редове, { stack: false }).
 */
export function table(columns, rows, opts = {}) {
  const labels = columns.map(c => (typeof c === 'string' ? c : c.label) || '');
  const thead = h('thead', null, h('tr', null,
    columns.map(c => h('th', typeof c === 'string' ? null : { class: c.class }, typeof c === 'string' ? c : c.label))));
  const tbody = h('tbody', null, rows);
  labelCells(tbody, labels);
  // Редовете, добавени по-късно („Покажи още“), също получават имената на колоните.
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => labelCells(tbody, labels)).observe(tbody, { childList: true });
  }
  return h('div.table-wrap', null, h('table' + (opts.stack === false ? '' : '.stack-sm'), null, thead, tbody));
}

function labelCells(tbody, labels) {
  for (const tr of tbody.children) {
    if (tr.dataset.labelled) continue;
    tr.dataset.labelled = '1';
    // Ред, който се отваря с щракване, се отваря и с Enter от клавиатурата.
    if (tr.classList.contains('clickable') && !tr.hasAttribute('tabindex')) {
      tr.tabIndex = 0;
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === tr) tr.click(); });
    }
    let i = 0;
    for (const td of tr.children) {
      const span = td.colSpan || 1;
      if (span === 1 && labels[i] && !td.classList.contains('name-cell') && !td.classList.contains('actions')) td.dataset.label = labels[i];
      i += span;
    }
  }
}

/**
 * Ред с раздели, който се превърта, когато не се побира на екрана: отстрани излизат стрелки,
 * а избраният раздел винаги е видим. `tabs` е готовият елемент .tabs с бутоните.
 */
export function tabStrip(tabs) {
  const step = (dir) => () => tabs.scrollBy({ left: dir * Math.max(160, tabs.clientWidth * 0.6), behavior: 'smooth' });
  const left = h('button.tab-arrow.left', { type: 'button', tabindex: -1, 'aria-hidden': 'true', onclick: step(-1) }, icon('chevronLeft', { size: 18 }));
  const right = h('button.tab-arrow.right', { type: 'button', tabindex: -1, 'aria-hidden': 'true', onclick: step(1) }, icon('chevronRight', { size: 18 }));
  const wrap = h('div.tabstrip.no-print', null, left, tabs, right);
  const update = () => {
    wrap.classList.toggle('can-left', tabs.scrollLeft > 4);
    wrap.classList.toggle('can-right', tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 4);
  };
  // Избраният раздел идва на екрана, без да се мести страницата.
  const reveal = () => {
    const a = tabs.querySelector('.active');
    if (a) {
      const pad = 48;
      if (a.offsetLeft < tabs.scrollLeft + pad) tabs.scrollLeft = Math.max(0, a.offsetLeft - pad);
      else if (a.offsetLeft + a.offsetWidth > tabs.scrollLeft + tabs.clientWidth - pad) tabs.scrollLeft = a.offsetLeft + a.offsetWidth - tabs.clientWidth + pad;
    }
    update();
  };
  tabs.addEventListener('scroll', update, { passive: true });
  tabs.addEventListener('click', () => setTimeout(reveal, 0));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(tabs);
  setTimeout(reveal, 0);
  return wrap;
}

/**
 * Лентата с разделите на досието. Остава горе при превъртане и тогава показва и кой е пациентът
 * (име, възраст, алергии) — за да не се бърка досието, докато се чете надолу.
 * Връща елементите за поставяне: [маркер, лента].
 */
export function dossierNav({ name, age, alert }, tabs) {
  const sentinel = h('div.dossier-sentinel', { 'aria-hidden': 'true' });
  const nav = h('div.dossier-nav.no-print', null,
    h('div.dossier-id', null,
      h('span.p-avatar.sm', { 'aria-hidden': 'true' }, initials(name)),
      h('span.nm', null, name),
      age ? h('span.ag', null, age) : null,
      alert ? h('span.badge.alert', { title: alert }, alert) : null),
    tabStrip(tabs));
  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver(([e]) => {
      nav.classList.toggle('stuck', !e.isIntersecting && e.boundingClientRect.top < 0);
    }, { threshold: 0 }).observe(sentinel);
  }
  return [sentinel, nav];
}

/**
 * Превключвател от съседни бутони: items = [{ id, label, count, tone }], active — избраният id.
 * onChange(id) се извиква при избор. Връща елемента; изборът се сменя с el.select(id).
 */
export function segmented(items, active, onChange, props = {}) {
  const el = h('div.seg', { role: 'tablist', ...props }, items.map(it =>
    h('button' + (it.id === active ? '.active' : ''), {
      type: 'button', role: 'tab', 'aria-selected': String(it.id === active), dataset: { id: it.id },
      onclick: () => { el.select(it.id); onChange(it.id); },
    }, it.label, it.count !== undefined && it.count !== null ? h('span.n' + (it.tone ? '.' + it.tone : ''), null, it.count) : null)));
  el.select = (id) => {
    for (const b of el.children) {
      const on = b.dataset.id === String(id);
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    }
  };
  return el;
}

/** Пръстен с процент — обхват на имунизациите или на профилактиката. */
export function coverageRing(pct, size = 62, label = 'обхват') {
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
      h('div.small.muted', null, label)));
}

/** Сваляне на файл, създаден в браузъра (Excel, CSV). Името е на латиница —
 *  някои браузъри заменят името на кирилица с „download“. */
export function downloadFile(bytes, filename, type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

export function avatar(name) {
  return h('span.avatar', { 'aria-hidden': 'true' }, initials(name));
}

export { clear, h, icon, initials, mount };
