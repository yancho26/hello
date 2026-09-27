/* Справки: обхват на имунизациите при децата, профилактика и регистър на
 * хроничните заболявания при възрастните, структура на регистъра. */

import { api } from '../api.js';
import { state } from '../app.js';
import { card, empty, h, mount, stat, table } from '../ui/components.js';
import { formatAge, formatDate } from '../shared/dates.js';
import { setPatientsView } from './patients.js';

const bar = (pct, colour) => h('div.row.tight', null,
  h('span.mono', { style: { color: colour, fontWeight: '650', minWidth: '42px' } }, pct === null ? '—' : pct + '%'),
  h('div', { style: { flex: 1, height: '6px', background: 'var(--line)', borderRadius: '3px' } },
    h('div', { style: { height: '100%', width: (pct || 0) + '%', background: colour, borderRadius: '3px' } })));
const colourFor = (pct) => (pct >= 95 ? 'var(--ok)' : pct >= 80 ? 'var(--warn)' : 'var(--danger)');
const controlColour = (pct) => (pct >= 70 ? 'var(--ok)' : pct >= 50 ? 'var(--warn)' : 'var(--danger)');

export async function renderReports(host) {
  const [reports, tasks] = await Promise.all([
    api.reports(),
    api.tasks({ horizon: 1 }),
  ]);

  const t = reports.totals;
  const ad = reports.adults;

  const byItemRows = reports.byItem.map(r => h('tr', null,
    h('td', null, r.name),
    h('td.mono.right', null, r.done),
    h('td.mono.right', null, r.due),
    h('td', { style: { minWidth: '160px' } }, bar(r.pct, colourFor(r.pct)))));

  const preventionRows = reports.prevention.map(r => h('tr', null,
    h('td', null, r.name),
    h('td.mono.right', null, r.done),
    h('td.mono.right', null, r.due),
    h('td', { style: { minWidth: '160px' } }, bar(r.pct, colourFor(r.pct)))));

  const chronicRows = reports.chronic.map(r => h('tr.clickable', {
    onclick: () => { setPatientsView({ group: 'adult', condition: r.code, filter: 'all', archived: false }); location.hash = '#/patients'; },
    title: 'Покажи пациентите',
  },
  h('td', null, h('strong', null, r.name), h('div.tiny.dim', null, r.groupLabel)),
  h('td.mono.right', null, r.count),
  h('td', { style: { minWidth: '150px' } }, r.hasTargets
    ? h('div', null, bar(r.pctControlled, controlColour(r.pctControlled)),
      h('div.tiny.dim', null, `${r.targetLabel}: ${r.controlled} в целта · ${r.uncontrolled} извън · ${r.unknown} без данни`))
    : h('span.small.dim', null, 'без числова цел')),
  h('td.mono.right', { style: { color: r.monitoringOverdue ? 'var(--danger)' : '' } }, r.monitoringOverdue)));

  const total = t.patients || 1;
  const ageRows = reports.ageBands.map(b => h('tr', null,
    h('td', null, b.label),
    h('td.mono.right', null, b.count),
    h('td', { style: { minWidth: '180px' } },
      h('div', {
        style: {
          height: '8px', background: b.adult ? 'var(--ok)' : 'var(--brand)', borderRadius: '4px', opacity: 0.8,
          width: Math.round((b.count / total) * 100) + '%', minWidth: b.count ? '4px' : '0',
        },
      }))));

  // Пациентите с просрочени дейности — най-полезната част от справката.
  const late = new Map();
  for (const task of tasks.buckets.overdue) {
    if (!late.has(task.patientId)) {
      late.set(task.patientId, {
        id: task.patientId, name: task.patientName, birthDate: task.birthDate,
        phone: task.patientPhone, items: [],
      });
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
      stat(t.patients, 'активни досиета', { foot: `${t.children} деца · ${ad.total} възрастни${t.archived ? ` · ${t.archived} архивирани` : ''}` }),
      stat(t.averageCoverage === null ? '—' : t.averageCoverage + '%', 'имунизационен обхват при децата', {
        kind: t.averageCoverage >= 95 ? 'ok' : t.averageCoverage >= 80 ? 'warn' : 'danger',
        foot: `${t.fullyCovered} деца с пълен обхват`,
      }),
      stat(ad.withChronic, 'възрастни с хронични заболявания', { foot: `${ad.monitoringOverdue} с просрочено проследяване` }),
      stat(t.withOverdue, 'пациенти с просрочия', { kind: t.withOverdue ? 'danger' : 'ok' })),

    h('div', { style: { height: '16px' } }),

    card('Регистър на хроничните заболявания', { icon: '🩺', tight: true },
      chronicRows.length
        ? table(['Заболяване', { label: 'Пациенти', class: 'right' }, 'В целта', { label: 'Просрочено проследяване', class: 'right' }], chronicRows)
        : empty('Няма вписани хронични заболявания.', null),
      chronicRows.length ? h('div.body.tiny.muted', null,
        'Контрол по основния показател на заболяването: налягане при хипертония, HbA1c при диабет, LDL (по сърдечно-съдовия риск) '
        + 'при дислипидемия и атеросклеротично ССЗ, TSH, пикочна киселина, бъбречна функция, PHQ-9/GAD-7. '
        + 'Процентът е от пациентите с данни. Щракнете върху ред за списъка.') : null),

    h('div', { style: { height: '16px' } }),

    h('div.grid.cols-2', null,
      card('Профилактика при възрастните', { icon: '🔬', tight: true },
        preventionRows.length
          ? table(['Дейност', { label: 'Извършени', class: 'right' }, { label: 'Дължими', class: 'right' }, 'Обхват'], preventionRows)
          : empty('Няма достатъчно данни.', null)),
      card('Обхват по имунизации при децата', { icon: '💉', tight: true },
        byItemRows.length
          ? table(['Имунизация', { label: 'Поставени', class: 'right' },
            { label: 'Дължими', class: 'right' }, 'Обхват'], byItemRows)
          : empty('Няма достатъчно данни.', null))),

    h('div', { style: { height: '16px' } }),

    h('div.grid.cols-2', null,
      card('Лекарства и психично здраве', { icon: '💊' }, h('dl.kv', null,
        h('dt', null, 'Сериозен сигнал за лекарства'), h('dd', null, ad.medSerious),
        h('dt', null, '5 или повече лекарства'), h('dd', null, ad.polypharmacy),
        h('dt', null, 'Изтекла рецепта или протокол'), h('dd', null, ad.renewalsOverdue),
        h('dt', null, 'Сигнал от скала за психично здраве'), h('dd', null, ad.mentalAlerts))),
      card('Възрастова структура', { icon: '👥', tight: true },
        table(['Възраст', { label: 'Пациенти', class: 'right' }, ''], ageRows))),

    h('div', { style: { height: '16px' } }),

    card(`Пациенти с просрочени дейности (${late.size})`, { icon: '⚠️', tight: true },
      lateRows.length
        ? table(['Пациент', 'Възраст', 'Телефон', { label: 'Брой', class: 'right' }, 'Какво липсва'], lateRows)
        : empty('Няма пациенти с просрочени дейности.', '✓')),

    h('p.tiny.muted', { style: { marginTop: '14px' } },
      'Обхватът при децата се изчислява по задължителните имунизации, чийто срок вече е настъпил; отказът на родител се брои като неимунизиран. '
      + 'Профилактиката при възрастните включва текущите задължителни дейности по календара — годишен преглед, скрининги и Td.'));
}
