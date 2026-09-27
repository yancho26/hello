/* Отбелязване на няколко дейности с едно действие.
 *
 * Това е най-честият случай в кабинета: детето идва веднъж и му се поставят
 * две ваксини, прави се профилактичен преглед и се измерва. Вместо четири
 * отделни прозореца — един. */

import { api } from '../api.js';
import { field, h, input, modal, normaliseDecimal, numberInput, toast } from '../ui/components.js';
import { daysBetween, formatDate, today } from '../shared/dates.js';
import { BP_FROM_YEARS } from '../shared/bp.js';
import { ACTIONABLE } from '../shared/schedule.js';

const GROUP_ICON = { vaccine: '💉', checkup: '🩺', screening: '🔬' };

export async function visitDialog({ patientId, patientName, onDone, includeSoonDays = 21 }) {
  let data;
  try {
    data = await api.patient(patientId);
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  const limitDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + includeSoonDays);
    return d.toISOString().slice(0, 10);
  })();

  const candidates = data.plan.filter(e =>
    ACTIONABLE.has(e.status) || (e.status === 'soon' && e.due <= limitDate));
  const isAdult = !!data.isAdult;
  // При хронично болен възрастен посещението може да е и диспансерният преглед.
  const review = isAdult && data.adult ? data.adult.monitoring.find(t => t.id === 'mon:review') : null;

  if (!candidates.length && !isAdult) {
    toast('Няма дължими дейности за отбелязване.');
    return;
  }

  // При дете с много натрупани пропуски не се отмятат дейности предварително:
  // едно невнимателно натискане не бива да „изпълни“ двайсет ваксини наведнъж.
  const dueNow = candidates.filter(e => ACTIONABLE.has(e.status));
  const preselect = dueNow.length <= 5;
  // Артериално налягане се измерва ежегодно от 3-годишна възраст.
  const ageYears = daysBetween(data.patient.birthDate, today()) / 365.25;
  const showBp = ageYears >= BP_FROM_YEARS;

  let form;
  const checks = [];

  const rowFor = (e) => {
    const isVaccine = e.group === 'vaccine';
    const batch = input({
      name: 'batch__' + e.id, placeholder: 'партиден №',
      style: { flex: 'none', width: '130px' },
    });
    const batchWrap = h('span', null, batch);
    const check = h('input', {
      type: 'checkbox', name: 'do__' + e.id,
      checked: preselect && ACTIONABLE.has(e.status),
      onchange: (ev) => batchWrap.classList.toggle('hidden', !ev.target.checked),
    });
    batchWrap.classList.toggle('hidden', !check.checked);
    checks.push({ check, batchWrap });

    return h('label.check', { style: { padding: '7px 0', borderBottom: '1px solid var(--line)' } },
      check,
      h('span.grow', null,
        h('div', null, (GROUP_ICON[e.group] || '•') + ' ', h('strong', null, e.name)),
        h('div.tiny.dim', null,
          'падеж ' + formatDate(e.due),
          e.status === 'overdue' ? ' · просрочено' : e.status === 'due' ? ' · дължимо сега' : ' · предстои')),
      isVaccine ? batchWrap : null);
  };

  const setAll = (value) => {
    for (const { check, batchWrap } of checks) {
      check.checked = value;
      batchWrap.classList.toggle('hidden', !value);
    }
  };

  const submit = async (close) => {
    const fd = new FormData(form);
    const date = fd.get('date');
    const chosen = candidates.filter(e => fd.get('do__' + e.id));
    const withReview = !!fd.get('review');
    const measured = ['weight', 'height', 'head', 'waist', 'systolic', 'diastolic', 'pulse']
      .some(k => normaliseDecimal(fd.get(k)));
    if (!chosen.length && !withReview && !measured) {
      toast(isAdult ? 'Изберете дейност или въведете измерване.' : 'Изберете поне една дейност.', 'error');
      return;
    }

    const failed = [];
    for (const e of chosen) {
      try {
        await api.setRecord(patientId, e.id, {
          status: 'done', date, batch: fd.get('batch__' + e.id) || '',
        });
      } catch (err) {
        failed.push(`${e.short || e.name}: ${err.message}`);
      }
    }

    // Измерванията се записват само ако лекарят ги е попълнил.
    if (measured) {
      const m = { date };
      for (const k of ['weight', 'height', 'head', 'waist', 'systolic', 'diastolic', 'pulse']) m[k] = normaliseDecimal(fd.get(k));
      try {
        await api.addMeasurement(patientId, m);
      } catch (err) {
        failed.push('измерване: ' + err.message);
      }
    }
    if (withReview) {
      try {
        await api.addVisit(patientId, { date, type: 'Диспансерен преглед', note: fd.get('reviewNote') || '' });
      } catch (err) {
        failed.push('диспансерен преглед: ' + err.message);
      }
    }

    const count = chosen.length + (withReview ? 1 : 0);
    if (failed.length) toast('Част от записите не преминаха — ' + failed.join('; '), 'error');
    else toast(count ? `Отбелязано за ${patientName}: ${count === 1 ? '1 дейност' : count + ' дейности'}.` : `Измерването е записано за ${patientName}.`, 'ok');

    close();
    if (onDone) await onDone();
  };

  modal({
    title: 'Отбелязване на посещение — ' + patientName,
    wide: true,
    body: (close) => {
      form = h('form', { onsubmit: (ev) => { ev.preventDefault(); submit(close); } },
        h('div.form-grid', { style: { marginBottom: '12px' } },
          h('div', null, field('Дата на посещението',
            input({ name: 'date', type: 'date', value: today(), max: today(), required: true })))),
        h('div.row', { style: { marginBottom: '4px' } },
          h('h3', null, 'Извършени дейности'),
          h('div.grow'),
          h('button.btn.xs', { type: 'button', onclick: () => setAll(true) }, 'Отметни всички'),
          h('button.btn.xs', { type: 'button', onclick: () => setAll(false) }, 'Изчисти')),
        !preselect
          ? h('div.alert-strip.warn', { style: { marginBottom: '8px' } },
            `Натрупани са ${dueNow.length} дължими дейности. Нищо не е отметнато предварително — `
            + 'изберете само това, което действително се извършва днес.')
          : null,
        review ? h('label.check', { style: { padding: '9px 0', borderBottom: '1px solid var(--line)' } },
          h('input', { type: 'checkbox', name: 'review', checked: review.status === 'overdue' || review.status === 'due' || review.status === 'soon' }),
          h('span.grow', null,
            h('div', null, '🩺 ', h('strong', null, 'Диспансерен преглед')),
            h('div.tiny.dim', null, review.reasons.join(', '),
              review.last ? ` · последен ${formatDate(review.last)}` : ' · няма запис'))) : null,
        h('div', { style: { maxHeight: '300px', overflowY: 'auto', marginBottom: '14px' } },
          candidates.map(rowFor),
          !candidates.length ? h('div.small.muted', { style: { padding: '8px 0' } }, 'Няма дължими дейности по профилактиката.') : null),
        h('h3', { style: { marginBottom: '4px' } }, 'Измервания',
          h('span.small.muted', { style: { fontWeight: '400' } },
            isAdult ? ' — по желание' : showBp ? ' — по желание; налягането се измерва ежегодно от 3 г.' : ' — по желание')),
        isAdult
          ? h('div.form-grid', null,
            h('div', null, field('Систолно (mmHg)', numberInput({ name: 'systolic', min: 50, max: 280 }))),
            h('div', null, field('Диастолно (mmHg)', numberInput({ name: 'diastolic', min: 20, max: 160 }))),
            h('div', null, field('Пулс (/мин)', numberInput({ name: 'pulse', min: 25, max: 220 }))),
            h('div', null, field('Тегло (кг)', numberInput({ name: 'weight', min: 30, max: 350 }))),
            h('div', null, field('Обиколка на талията (см)', numberInput({ name: 'waist', min: 40, max: 250 }))))
          : h('div.form-grid', null,
            h('div', null, field('Тегло (кг)', numberInput({ name: 'weight', min: 0.3, max: 200 }))),
            h('div', null, field('Ръст (см)', numberInput({ name: 'height', min: 20, max: 230 }))),
            h('div', null, field('Обиколка глава (см)', numberInput({ name: 'head', min: 20, max: 70 }))),
            showBp ? h('div', null, field('Систолно (mmHg)', numberInput({ name: 'systolic', min: 50, max: 250 }))) : null,
            showBp ? h('div', null, field('Диастолно (mmHg)', numberInput({ name: 'diastolic', min: 20, max: 160 }))) : null));
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, '✓ Запиши посещението'),
    ],
  });
}
