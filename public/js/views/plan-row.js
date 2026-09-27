/* Ред от плана на пациента — ползва се в разделите за деца и за възрастни. */

import { api } from '../api.js';
import { scheduleItem } from '../app.js';
import { confirmDialog, h, statusBadge, toast } from '../ui/components.js';
import { formatDate, formatDateShort, relativeDays } from '../shared/dates.js';
import { deferDialog, markDoneDialog, refuseDialog } from './record-dialog.js';

export function planRow(e, ctx, compact = false) {
  const { p, reload } = ctx;
  const adult = !!ctx.isAdult;
  const item = scheduleItem(e.id) || { id: e.id, name: e.name, group: e.group, short: e.short };
  const rec = e.record;

  const actions = h('td.actions.no-print', null,
    rec && rec.auto
      ? h('span.tiny.dim', { title: 'Отбелязано по въведен резултат — отменя се, като се изтрие резултатът.' }, 'по резултат')
      : e.status === 'done' || e.status === 'refused'
      ? h('button.btn.xs', {
        title: 'Отмени отбелязването',
        onclick: async (ev) => {
          ev.stopPropagation();
          const ok = await confirmDialog({
            title: 'Отмяна',
            message: `Записът за „${e.name}“ ще бъде премахнат от досието.`,
            confirmLabel: 'Отмени', danger: true,
          });
          if (!ok) return;
          await api.clearRecord(p.id, e.id);
          toast('Записът е премахнат.');
          reload();
        },
      }, '↺')
      : h('div.row.tight', { style: { justifyContent: 'flex-end', flexWrap: 'nowrap' } },
        h('button.btn.xs.primary', {
          title: 'Отбележи като извършено',
          onclick: () => markDoneDialog({ patientId: p.id, patientName: p.name, item, onDone: reload }),
        }, '✓'),
        !compact && e.group === 'vaccine' ? h('button.btn.xs', {
          title: 'Медицински отвод',
          onclick: () => deferDialog({ patientId: p.id, patientName: p.name, item, onDone: reload }),
        }, '⏸') : null,
        !compact && (e.group === 'vaccine' || adult) ? h('button.btn.xs', {
          title: adult ? 'Отказ на пациента' : 'Отказ от родител',
          onclick: () => refuseDialog({ patientId: p.id, patientName: p.name, item, adult, onDone: reload }),
        }, '✕') : null));

  const nameCell = h('td', null,
    h('div', { style: { fontWeight: '600' } }, e.name),
    e.note ? h('div.tiny.dim', null, e.note) : null,
    rec && rec.reason ? h('div.tiny.dim', null, 'Причина: ' + rec.reason) : null,
    rec && rec.note ? h('div.tiny.dim', null, rec.note) : null);

  if (compact) {
    return h('tr' + (e.status === 'overdue' ? '.attention' : ''), null,
      nameCell,
      h('td.nowrap.small', null, formatDateShort(e.due)),
      h('td', null, statusBadge(e)),
      actions);
  }

  return h('tr' + (e.status === 'overdue' ? '.attention' : ''), null,
    nameCell,
    h('td.nowrap.small.dim', null, e.track === 'adult' && e.id.includes('@') && !Number.isFinite(e.doseMonths)
      ? 'сезонно' : ageLabel(e.doseMonths)),
    h('td.nowrap.small', null,
      h('div', null, formatDate(e.due)),
      e.status !== 'done' ? h('div.tiny.dim', null, relativeDays(e.due)) : null),
    h('td', null, statusBadge(e)),
    h('td.small.mono', null, rec && rec.batch ? rec.batch : rec && rec.product ? rec.product : ''),
    actions);
}

export function ageLabel(months) {
  if (!Number.isFinite(months)) return '';
  if (months === 0) return 'при раждане';
  if (months < 12) return months + ' мес.';
  const y = Math.floor(months / 12), m = Math.round(months % 12);
  return m ? `${y} г. ${m} м.` : `${y} г.`;
}
