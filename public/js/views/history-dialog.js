/* Минали имунизации наведнъж — за дете, което идва от друга практика.
 *
 * Вместо да се отбелязва ваксина по ваксина, лекарят вижда всички дължими
 * до днес ваксини с датите по календара и само поправя датите по
 * имунизационния паспорт. Записът е един — или всичко, или нищо.
 *
 * Нищо не е отметнато предварително: в досието влиза само това, което
 * лекарят изрично е потвърдил по документ.
 */

import { api } from '../api.js';
import { h, input, modal, toast } from '../ui/components.js';
import { formatDate, today } from '../shared/dates.js';

const PENDING = new Set(['overdue', 'due', 'deferral_ended']);

export function historyDialog({ p, data, reload }) {
  const todayISO = today();
  const items = data.plan.filter(e => e.group === 'vaccine' && PENDING.has(e.status) && e.due <= todayISO);

  if (!items.length) {
    toast('Няма дължими до днес ваксини за въвеждане.', 'ok');
    return;
  }

  const rows = items.map(e => {
    const check = h('input', { type: 'checkbox', 'aria-label': e.name });
    const dateInput = input({
      type: 'date', value: e.due < p.birthDate ? p.birthDate : e.due,
      min: p.birthDate, max: todayISO, required: true,
    });
    const batch = input({ placeholder: 'партида (по желание)' });
    const row = h('div.history-row', null,
      h('label.history-name', null, check,
        h('div', null,
          h('div', { style: { fontWeight: 600 } }, e.name),
          h('div.small.muted', null, `по календара: ${formatDate(e.due)}`))),
      dateInput, batch);
    const sync = () => {
      row.classList.toggle('off', !check.checked);
      dateInput.disabled = !check.checked;
      batch.disabled = !check.checked;
    };
    check.addEventListener('change', sync);
    sync();
    return { e, check, dateInput, batch, row };
  });

  const note = input({ value: 'по имунизационен паспорт', 'aria-label': 'Източник' });
  const counter = h('span.small.muted');
  const updateCounter = () => {
    const n = rows.filter(r => r.check.checked).length;
    counter.textContent = n ? `Избрани: ${n} от ${rows.length}` : 'Нищо не е избрано';
  };
  const setAll = (on) => {
    for (const r of rows) {
      r.check.checked = on;
      r.check.dispatchEvent(new Event('change'));
    }
    updateCounter();
  };
  for (const r of rows) r.check.addEventListener('change', updateCounter);
  updateCounter();

  const submit = async (close, button) => {
    const chosen = rows.filter(r => r.check.checked);
    if (!chosen.length) {
      toast('Изберете поне една ваксина.', 'error');
      return;
    }
    for (const r of chosen) {
      const v = r.dateInput.value;
      if (!v || v > todayISO || v < p.birthDate) {
        r.dateInput.classList.add('invalid');
        r.dateInput.focus();
        toast(`${r.e.name}: въведете дата между раждането и днес.`, 'error');
        return;
      }
      r.dateInput.classList.remove('invalid');
    }
    button.disabled = true;
    try {
      const res = await api.addHistory(p.id, {
        note: note.value.trim(),
        records: chosen.map(r => ({ itemId: r.e.id, date: r.dateInput.value, batch: r.batch.value.trim() })),
      });
      toast(`Записани са ${res.count} имунизации за ${p.name}.`, 'ok');
      close();
      await reload();
    } catch (err) {
      button.disabled = false;
      toast(err.message, 'error');
    }
  };

  modal({
    title: `Минали имунизации — ${p.name}`,
    wide: true,
    body: h('div.stack', null,
      h('p.small', { style: { margin: 0 } },
        'Отметнете ваксините, които са записани в имунизационния паспорт, и поправете датите. '
        + 'При отметка се попълва датата по календара. Ваксините без отметка остават дължими.'),
      h('div.row', { style: { justifyContent: 'space-between' } },
        counter,
        h('div.row.tight', null,
          h('button.btn.sm', { type: 'button', onclick: () => setAll(true) }, 'Отметни всички'),
          h('button.btn.sm', { type: 'button', onclick: () => setAll(false) }, 'Изчисти'))),
      h('div.history-list', null,
        h('div.history-row.head', null,
          h('div', null, 'Ваксина'), h('div', null, 'Дата на поставяне'), h('div', null, 'Партида')),
        rows.map(r => r.row)),
      h('label.field', null, h('span.lbl', null, 'Източник на данните (записва се като бележка)'), note)),
    actions: (close) => {
      const save = h('button.btn.primary', { type: 'button' }, '✓ Запиши избраните');
      save.addEventListener('click', () => submit(close, save));
      return [h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'), save];
    },
  });
}
