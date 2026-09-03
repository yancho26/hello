/* Справки: обхват на имунизациите и структура на регистъра. */

import { api } from '../api.js';
import { state } from '../app.js';
import { card, empty, h, mount, stat, table } from '../ui/components.js';
import { formatAge, formatDate } from '../shared/dates.js';

export async function renderReports(host) {
  const [reports, tasks] = await Promise.all([
    api.reports(),
    api.tasks({ horizon: 1 }),
  ]);

  const t = reports.totals;

  const byItemRows = reports.byItem.map(r => {
    const colour = r.pct >= 95 ? 'var(--ok)' : r.pct >= 80 ? 'var(--warn)' : 'var(--danger)';
    return h('tr', null,
      h('td', null, r.name),
      h('td.mono.right', null, r.done),
      h('td.mono.right', null, r.due),
      h('td', { style: { minWidth: '160px' } },
        h('div.row.tight', null,
          h('span.mono', { style: { color: colour, fontWeight: '650', minWidth: '42px' } }, r.pct + '%'),
          h('div', { style: { flex: 1, height: '6px', background: 'var(--line)', borderRadius: '3px' } },
            h('div', { style: { height: '100%', width: r.pct + '%', background: colour, borderRadius: '3px' } })))));
  });

  const ageRows = reports.ageBands.map(b => h('tr', null,
    h('td', null, b.label),
    h('td.mono.right', null, b.count),
    h('td', { style: { minWidth: '180px' } },
      h('div', { style: { height: '8px', background: 'var(--brand)', borderRadius: '4px', opacity: .8,
        width: (t.patients ? Math.round((b.count / t.patients) * 100) : 0) + '%', minWidth: b.count ? '4px' : '0' } }))));

  // Децата с просрочени дейности — най-полезната част от справката.
  const late = new Map();
  for (const task of tasks.buckets.overdue) {
    if (!late.has(task.patientId)) {
      late.set(task.patientId, { id: task.patientId, name: task.patientName, birthDate: task.birthDate,
        phone: task.patientPhone, items: [] });
    }
    late.get(task.patientId).items.push(task);
  }
  const lateRows = [...late.values()]
    .sort((a, b) => b.items.length - a.items.length)
    .map(p => h('tr.clickable', { onclick: () => { location.hash = '#/patient/' + p.id; } },
      h('td.name-cell', null, p.name),
      h('td.small.nowrap', null, formatAge(p.birthDate)),
      h('td.mono.small.nowrap', null, p.phone || '—'),
      h('td.mono.right', null, p.items.length),
      h('td.small.muted', null, p.items.slice(0, 3).map(i => i.short).join(', ')
        + (p.items.length > 3 ? ` и още ${p.items.length - 3}` : ''))));

  mount(host,
    h('div.page-head', null,
      h('div.titles', null,
        h('h1', null, 'Справки'),
        h('div.muted.small', null, `${state.practice.name} · към ${formatDate(reports.asOf)}`)),
      h('button.btn.no-print', { onclick: () => window.print() }, '🖨 Отпечатай')),

    h('div.grid.cols-4', null,
      stat(t.patients, 'активни досиета', { foot: t.archived ? `${t.archived} архивирани` : null }),
      stat(t.averageCoverage === null ? '—' : t.averageCoverage + '%', 'среден обхват', {
        kind: t.averageCoverage >= 95 ? 'ok' : t.averageCoverage >= 80 ? 'warn' : 'danger',
      }),
      stat(t.fullyCovered, 'деца с пълен обхват', { kind: 'ok' }),
      stat(t.withOverdue, 'деца с просрочия', { kind: t.withOverdue ? 'danger' : 'ok' })),

    h('div', { style: { height: '16px' } }),

    h('div.grid.cols-2', null,
      card('Обхват по имунизации', { icon: '💉', tight: true },
        byItemRows.length
          ? table(['Имунизация', { label: 'Поставени', class: 'right' },
            { label: 'Дължими', class: 'right' }, 'Обхват'], byItemRows)
          : empty('Няма достатъчно данни.', '·')),
      card('Възрастова структура', { icon: '👶', tight: true },
        table(['Възраст', { label: 'Деца', class: 'right' }, ''], ageRows))),

    h('div', { style: { height: '16px' } }),

    card(`Деца с просрочени дейности (${late.size})`, { icon: '⚠️', tight: true },
      lateRows.length
        ? table(['Дете', 'Възраст', 'Телефон', { label: 'Брой', class: 'right' }, 'Какво липсва'], lateRows)
        : empty('Няма деца с просрочени дейности.', '✓')),

    h('p.tiny.muted', { style: { marginTop: '14px' } },
      'Обхватът се изчислява само по задължителните имунизации, чийто срок вече е настъпил. '
      + 'Деца с отбелязан отказ на родител се броят като неимунизирани.'));
}
