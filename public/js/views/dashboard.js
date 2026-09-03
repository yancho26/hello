/* Табло: какво трябва да се свърши днес и кой изостава.
 *
 * Задачите се групират по дете, а не по дейност — едно дете с десет
 * пропуснати ваксини е едно обаждане, а не десет реда в списъка. */

import { api } from '../api.js';
import { state } from '../app.js';
import { badge, card, empty, h, mount, stat, table, toast } from '../ui/components.js';
import { durationText, formatAge, formatDate, formatDateShort, relativeDays, today, weekdayName } from '../shared/dates.js';
import { markDoneDialog } from './record-dialog.js';
import { visitDialog } from './visit-dialog.js';

const GROUP_ICON = { vaccine: '💉', checkup: '🩺', screening: '🔬', reminder: '🔔' };

let filters = { horizon: null, onlyMine: false };

export async function renderDashboard(host) {
  const horizon = filters.horizon ?? state.settings.horizonDays ?? 30;
  const params = { horizon };
  if (filters.onlyMine && state.doctor && state.doctor.id) params.doctor = state.doctor.id;

  const [tasks, reports] = await Promise.all([api.tasks(params), api.reports()]);
  const reload = () => renderDashboard(host);
  const { buckets } = tasks;
  const todayISO = today();

  const overdue = groupByChild(buckets.overdue);
  const dueToday = groupByChild(buckets.today);
  const soon = groupByChild(buckets.soon);

  const stats = h('div.grid.cols-4', null,
    stat(reports.totals.patients, 'деца в регистъра', {
      foot: reports.totals.archived ? `${reports.totals.archived} в архив` : null,
      onclick: () => { location.hash = '#/patients'; },
    }),
    stat(overdue.length, 'деца с просрочия', {
      kind: overdue.length ? 'danger' : 'ok',
      foot: `${buckets.overdue.length} дейности общо`,
    }),
    stat(dueToday.length, 'деца с дейности за днес', { kind: dueToday.length ? 'warn' : '' }),
    stat(reports.totals.averageCoverage === null ? '—' : reports.totals.averageCoverage + '%',
      'среден имунизационен обхват', {
      kind: reports.totals.averageCoverage >= 95 ? 'ok'
        : reports.totals.averageCoverage >= 80 ? 'warn' : 'danger',
      foot: `${reports.totals.fullyCovered} деца с пълен обхват`,
    }));

  const controls = h('div.row.no-print', null,
    h('div.chips', null,
      h('button.chip' + (filters.onlyMine ? '' : '.active'), {
        onclick: () => { filters.onlyMine = false; reload(); },
      }, 'Цялата практика'),
      h('button.chip' + (filters.onlyMine ? '.active' : ''), {
        onclick: () => { filters.onlyMine = true; reload(); },
      }, 'Моите пациенти')),
    h('div.grow'),
    h('select', {
      style: { width: 'auto' },
      onchange: (e) => { filters.horizon = Number(e.target.value); reload(); },
    }, [7, 14, 30, 60, 90].map(d =>
      h('option', { value: d, selected: d === horizon }, `следващите ${d} дни`))),
    h('button.btn', { onclick: () => printCallList([...buckets.overdue, ...buckets.today, ...buckets.soon]) },
      '🖨 Списък за обаждане'));

  mount(host,
    h('div.page-head', null,
      h('div.titles', null,
        h('h1', null, 'Табло'),
        h('div.muted.small', null,
          `${weekdayName(todayISO)}, ${formatDate(todayISO)} · ${state.practice.name}`)),
      controls),
    stats,
    h('div', { style: { height: '16px' } }),
    section('Просрочени', overdue, reload, {
      icon: '⚠️', emptyText: 'Няма просрочени дейности. Отлична работа!', collapsedAfter: 12,
    }),
    section('За днес', dueToday, reload, {
      icon: '📌', emptyText: 'Няма дейности с падеж днес.',
    }),
    section(`Предстоящи — следващите ${horizon} дни`, soon, reload, {
      icon: '📅', emptyText: 'Няма предстоящи дейности в този период.', collapsedAfter: 12,
    }),
    buckets.deferred.length
      ? section('Активни отводи', groupByChild(buckets.deferred), reload, { icon: '⏸' })
      : null);
}

/** Свива списъка със задачи до по един ред на дете. */
function groupByChild(tasks) {
  const map = new Map();
  for (const t of tasks) {
    if (!map.has(t.patientId)) {
      map.set(t.patientId, {
        id: t.patientId, name: t.patientName, phone: t.patientPhone,
        birthDate: t.birthDate, items: [],
      });
    }
    map.get(t.patientId).items.push(t);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.items.sort((a, b) => (a.actionDate < b.actionDate ? -1 : 1));
    g.earliest = g.items[0].actionDate;
    g.worstOverdue = Math.max(...g.items.map(i => i.overdueDays || 0));
    g.status = g.items[0].status;
  }
  groups.sort((a, b) => (a.earliest < b.earliest ? -1 : a.earliest > b.earliest ? 1 : 0));
  return groups;
}

function section(title, groups, reload, opts = {}) {
  if (!groups.length) {
    return card(title, { icon: opts.icon }, empty(opts.emptyText || 'Няма записи.', '✓'));
  }
  const limit = opts.collapsedAfter || groups.length;
  const body = table(
    ['Срок', 'Дете', 'Възраст', 'Какво предстои', 'Телефон', 'Състояние', { label: '', class: 'right' }],
    groups.slice(0, limit).map(g => childRow(g, reload)));

  const more = groups.length > limit
    ? h('div.center', { style: { padding: '10px' } },
      h('button.btn.sm', {
        onclick: (e) => {
          const tbody = e.target.closest('.body').querySelector('tbody');
          for (const g of groups.slice(limit)) tbody.appendChild(childRow(g, reload));
          e.target.remove();
        },
      }, `Покажи още ${groups.length - limit} деца`))
    : null;

  const count = groups.reduce((n, g) => n + g.items.length, 0);
  return card(`${title} — ${groups.length} ${groups.length === 1 ? 'дете' : 'деца'} (${count} дейности)`,
    { icon: opts.icon, tight: true }, body, more);
}

function childRow(g, reload) {
  const open = () => { location.hash = '#/patient/' + g.id; };
  const shown = g.items.slice(0, 3);
  const rest = g.items.length - shown.length;
  const isOverdue = g.items.some(i => i.status === 'overdue' || i.status === 'deferral_ended');

  const actionable = g.items.filter(i => !i.isReminder && state.scheduleById.has(i.itemId));

  return h('tr.clickable' + (isOverdue ? '.attention' : ''), { onclick: open },
    h('td.nowrap', null,
      h('div', null, formatDateShort(g.earliest)),
      h('div.tiny.dim', null, relativeDays(g.earliest))),
    h('td.name-cell', null, g.name),
    h('td.nowrap.small', null, formatAge(g.birthDate)),
    h('td', null,
      h('div.small', null, shown.map(i => `${GROUP_ICON[i.group] || '•'} ${i.short || i.name}`).join(' · ')),
      rest > 0 ? h('div.tiny.dim', null, `и още ${rest}`) : null),
    h('td.nowrap.mono.small', null, g.phone || '—'),
    h('td', null, isOverdue
      ? badge('overdue', 'изостава с ' + durationText(g.worstOverdue))
      : g.status === 'deferred' ? badge('deferred', 'отвод')
        : g.earliest <= today() ? badge('due', 'дължимо сега') : badge('soon', relativeDays(g.earliest))),
    h('td.actions.no-print', null,
      actionable.length === 1
        ? h('button.btn.xs.primary', {
          title: 'Отбележи като извършено',
          onclick: (e) => {
            e.stopPropagation();
            markDoneDialog({
              patientId: g.id, patientName: g.name,
              item: state.scheduleById.get(actionable[0].itemId), onDone: reload,
            });
          },
        }, '✓')
        : actionable.length > 1
          ? h('button.btn.xs.primary', {
            title: 'Отбележи няколко дейности наведнъж',
            onclick: (e) => {
              e.stopPropagation();
              visitDialog({ patientId: g.id, patientName: g.name, onDone: reload });
            },
          }, '✓ ' + actionable.length)
          : null));
}

/* --------------------------- списък за обаждане ------------------------------ */

function printCallList(rows) {
  if (!rows.length) {
    toast('Няма деца за обаждане в избрания период.');
    return;
  }
  const groups = groupByChild(rows);
  const win = window.open('', '_blank');
  if (!win) {
    toast('Изскачащият прозорец е блокиран от браузъра.', 'error');
    return;
  }

  const doc = win.document;
  doc.title = 'Списък за обаждане — ' + formatDate(today());
  const style = doc.createElement('style');
  style.textContent = `
    body { font: 12pt/1.4 system-ui, sans-serif; margin: 16mm 12mm; color: #111; }
    h1 { font-size: 15pt; margin: 0 0 2mm; }
    .sub { color: #555; font-size: 10pt; margin-bottom: 6mm; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #ccc; padding: 2.5mm 2mm; text-align: left; vertical-align: top; }
    th { font-size: 9pt; text-transform: uppercase; letter-spacing: .04em; color: #444; }
    .phone { font-weight: 600; white-space: nowrap; }
    .items { font-size: 10pt; color: #333; }
    .late { color: #b3261e; font-weight: 600; }
    .tick { width: 8mm; text-align: center; }
    @page { margin: 12mm; }
  `;
  doc.head.appendChild(style);

  const mk = (tag, text, cls) => {
    const el = doc.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };

  doc.body.appendChild(mk('h1', 'Списък за обаждане'));
  doc.body.appendChild(mk('div',
    `${state.practice.name} · ${formatDate(today())} · ${groups.length} деца`, 'sub'));

  const tbl = doc.createElement('table');
  const head = doc.createElement('tr');
  for (const label of ['✓', 'Дете', 'Възраст', 'Телефон', 'За какво', 'Забележка']) {
    head.appendChild(mk('th', label));
  }
  tbl.appendChild(head);

  for (const g of groups) {
    const tr = doc.createElement('tr');
    tr.appendChild(mk('td', '☐', 'tick'));
    tr.appendChild(mk('td', g.name));
    tr.appendChild(mk('td', formatAge(g.birthDate)));
    tr.appendChild(mk('td', g.phone || '—', 'phone'));
    const items = mk('td', undefined, 'items');
    for (const it of g.items) {
      const line = doc.createElement('div');
      line.textContent = (it.short || it.name) + ' — ' + formatDateShort(it.actionDate);
      if (it.status === 'overdue') line.className = 'late';
      items.appendChild(line);
    }
    tr.appendChild(items);
    tr.appendChild(mk('td', ''));
    tbl.appendChild(tr);
  }

  doc.body.appendChild(tbl);
  win.focus();
  setTimeout(() => win.print(), 250);
}
