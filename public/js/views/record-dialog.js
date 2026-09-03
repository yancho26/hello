/* Прозорците за отбелязване на ваксина, преглед, отвод и отказ.
 * Ползват се и от таблото, и от досието на детето. */

import { api } from '../api.js';
import { field, h, input, modal, select, toast } from '../ui/components.js';
import { today } from '../shared/dates.js';
import { DEFERRAL_REASONS } from '../shared/calendar.js';

/** Отбелязване на изпълнена дейност. */
export function markDoneDialog({ patientId, patientName, item, onDone }) {
  const isVaccine = item.group === 'vaccine';
  let form;

  const submit = async (close) => {
    const data = Object.fromEntries(new FormData(form));
    try {
      await api.setRecord(patientId, item.id, { status: 'done', ...data });
      toast(`${item.short || item.name} — отбелязано за ${patientName}.`, 'ok');
      close();
      if (onDone) await onDone();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  modal({
    title: item.name,
    body: (close) => {
      form = h('form.form-grid', {
        onsubmit: (e) => { e.preventDefault(); submit(close); },
      },
        h('div.full', null, h('div.muted.small', null, patientName)),
        h('div', null, field('Дата на извършване',
          input({ name: 'date', type: 'date', value: today(), max: today(), required: true }))),
        isVaccine ? h('div', null, field('Партиден номер',
          input({ name: 'batch', placeholder: 'от флакона' }))) : null,
        isVaccine ? h('div.full', null, field('Препарат',
          input({ name: 'product', placeholder: 'търговско име на ваксината' }))) : null,
        h('div.full', null, field('Бележка', input({ name: 'note', placeholder: 'по желание' }))));
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, '✓ Отбележи'),
    ],
  });
}

/** Медицински отвод — с причина и срок. */
export function deferDialog({ patientId, patientName, item, onDone }) {
  let form;
  const defaultUntil = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();

  const submit = async (close) => {
    const data = Object.fromEntries(new FormData(form));
    if (data.reason === '__other') data.reason = data.otherReason || 'Друга медицинска причина';
    delete data.otherReason;
    try {
      await api.setRecord(patientId, item.id, { status: 'deferred', ...data });
      toast('Отводът е записан. Дейността ще се появи отново след изтичането му.', 'ok');
      close();
      if (onDone) await onDone();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  modal({
    title: 'Отвод — ' + item.name,
    body: (close) => {
      const other = h('div.full.hidden', null, field('Опишете причината', input({ name: 'otherReason' })));
      const reasons = select(
        [...DEFERRAL_REASONS.map(r => ({ value: r, label: r })), { value: '__other', label: 'Друго…' }],
        {
          name: 'reason',
          onchange: (e) => other.classList.toggle('hidden', e.target.value !== '__other'),
        });
      form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div.full', null, h('div.muted.small', null, patientName)),
        h('div.full', null, field('Причина за отвода', reasons)),
        other,
        h('div', null, field('Отвод до', input({ name: 'deferUntil', type: 'date', value: defaultUntil, required: true }),
          'На тази дата дейността се връща в списъка със задачи.')),
        h('div.full', null, field('Бележка', input({ name: 'note' }))));
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, 'Запиши отвода'),
    ],
  });
}

/** Отказ от родител. */
export function refuseDialog({ patientId, patientName, item, onDone }) {
  let form;
  const submit = async (close) => {
    const data = Object.fromEntries(new FormData(form));
    try {
      await api.setRecord(patientId, item.id, { status: 'refused', date: today(), ...data });
      toast('Отказът е записан в досието.', 'ok');
      close();
      if (onDone) await onDone();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  modal({
    title: 'Отказ на родител — ' + item.name,
    body: (close) => {
      form = h('form.stack', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div.muted.small', null, patientName),
        h('div.alert-strip.warn', null,
          'Записва се, че родителят е информиран и е отказал. Дейността спира да излиза като просрочена.'),
        field('Бележка по отказа', input({ name: 'note', placeholder: 'напр. писмен отказ в досието' })));
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, 'Запиши'),
    ],
  });
}
