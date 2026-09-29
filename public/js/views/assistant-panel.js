/* Асистентът в досието: подсказките за пациента, решенията на лекаря по
 * тях и — по избор — вторият поглед от езиков модел върху обезличено
 * обобщение на досието. Общо за практиката на ОПЛ и за СИМП. */

import { api } from '../api.js';
import { state } from '../app.js';
import { card, empty, field, h, input, loading, modal, mount, toast } from '../ui/components.js';
import { addDays, addMonths, formatDate, today } from '../shared/dates.js';
import { CATEGORIES, FEEDBACK, SEVERITY } from '../shared/assistant.js';

/** Цветът на обозначението според спешността. */
export const SEV_CLS = { 3: 'overdue', 2: 'due', 1: 'soon' };

export function sevBadge(sev) {
  return h('span.badge.' + SEV_CLS[sev], { title: SEVERITY[sev].hint }, SEVERITY[sev].label);
}

/* Настройката на езиковия модел се пита веднъж и се опреснява при промяна. */
let aiInfo = null;
export function aiSettings(refresh = false) {
  if (!aiInfo || refresh) aiInfo = api.aiSettings().catch(() => ({ enabled: false }));
  return aiInfo;
}

/* До кога важи приетото решение: колкото по-спешно, толкова по-скоро се проверява отново. */
const ACCEPT_DAYS = { 3: 7, 2: 30, 1: 90 };

/* --------------------------------- подсказка --------------------------------- */

/** Една подсказка: какво, защо, по коя насока и бутоните за решение. */
export function findingItem(f, { onDecide, compact = false } = {}) {
  return h('div.af.s' + f.severity, null,
    h('div.af-head', null,
      sevBadge(f.severity),
      h('span.af-cat', null, CATEGORIES[f.category] || ''),
      h('strong.af-title', null, f.title)),
    h('div.af-action', null, f.action),
    !compact && f.why.length ? h('ul.af-why', null, f.why.map(w => h('li', null, w))) : null,
    !compact && f.source ? h('div.af-src', null, 'Основание: ', f.source) : null,
    onDecide ? h('div.af-btns.no-print', null,
      h('button.btn.sm', { onclick: () => onDecide(f, 'accepted'), title: 'Ще го направя — подсказката се скрива и се връща след срока, ако все още е актуална' }, '✓ Прието'),
      h('button.btn.sm', { onclick: () => onDecide(f, 'done'), title: 'Вече е направено — подсказката се връща само ако се появят нови данни' }, 'Направено'),
      h('button.btn.sm', { onclick: () => onDecide(f, 'snoozed') }, 'Отложи…'),
      h('button.btn.sm.ghost', { onclick: () => onDecide(f, 'dismissed') }, 'Не е приложимо…')) : null);
}

/** Прозорецът за отлагане или отхвърляне — със срок и причина. */
function decisionDialog(f, status) {
  return new Promise(resolve => {
    let done = false;
    const asOf = today();
    const until = input({ type: 'date', value: status === 'snoozed' ? addMonths(asOf, 1) : addMonths(asOf, 12), min: addDays(asOf, 1), max: addDays(asOf, 3 * 366) });
    const reason = input({ maxlength: 300, placeholder: status === 'dismissed' ? 'например: изследвано другаде, пациентът отказва' : 'по желание' });
    const quick = status === 'snoozed' ? h('div.row.tight', { style: { flexWrap: 'wrap', marginTop: '-4px' } },
      [['1 седмица', addDays(asOf, 7)], ['1 месец', addMonths(asOf, 1)], ['3 месеца', addMonths(asOf, 3)], ['6 месеца', addMonths(asOf, 6)]]
        .map(([label, d]) => h('button.btn.sm.ghost', { type: 'button', onclick: () => { until.value = d; } }, label))) : null;
    modal({
      title: status === 'snoozed' ? 'Отлагане на подсказката' : 'Не е приложимо',
      body: h('div.stack', null,
        h('p.small', { style: { margin: 0 } }, h('strong', null, f.title)),
        field(status === 'snoozed' ? 'Покажи отново на' : 'Скрий до', until,
          status === 'dismissed' ? 'След тази дата подсказката се показва отново, ако все още е актуална.' : null),
        quick,
        field('Причина', reason)),
      actions: (close) => [
        h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
        h('button.btn.primary', {
          type: 'button',
          onclick: () => { done = true; close(); resolve({ until: until.value, reason: reason.value.trim() }); },
        }, status === 'snoozed' ? 'Отложи' : 'Скрий'),
      ],
      onClose: () => { if (!done) resolve(null); },
    });
  });
}

/** Решението на лекаря по подсказка; връща новото състояние или null при отказ. */
export async function decide(patientId, f, status) {
  const body = { key: f.key, status };
  if (status === 'snoozed' || status === 'dismissed') {
    const res = await decisionDialog(f, status);
    if (!res) return null;
    Object.assign(body, res);
  }
  if (status === 'accepted') {
    body.until = addDays(today(), ACCEPT_DAYS[f.severity] || 30);
    // В практиката на ОПЛ приетото става напомняне в досието.
    if (state.kind === 'gp') { body.remind = true; body.text = f.title; }
  }
  try {
    const res = await api.assistantFeedback(patientId, body);
    toast(status === 'accepted'
      ? `Прието. ${body.remind ? 'Напомняне' : 'Проверка'} на ${formatDate(body.until)}`
      : status === 'done' ? 'Отбелязано като направено.'
        : status === 'snoozed' ? `Отложено до ${formatDate(body.until)}` : 'Подсказката е скрита.', 'ok');
    return res;
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
}

/* ---------------------------------- табло ---------------------------------- */

/** Картата на таблото: пациентите със спешни и скорошни подсказки. */
export function assistantDashboardCard(data, max = 6) {
  if (!data) return null;
  const rows = data.patients.slice(0, max).map(p => h('tr.clickable', { onclick: () => { location.hash = `#/patient/${p.id}?tab=assistant`; } },
    h('td', null, h('div.name-cell', null, p.name), h('div.tiny.dim', null, p.phone || '')),
    h('td.nowrap', null, sevBadge(p.severity)),
    h('td.small', null, p.findings[0]?.title || '', p.count > 1 ? h('span.tiny.dim', null, ` · и още ${p.count - 1}`) : null)));
  return card(data.patients.length ? `Асистент: спешно и скоро (${data.patients.length})` : 'Асистент', {
    icon: '🧭', tight: true,
    actions: h('button.btn.sm', { onclick: () => { location.hash = '#/assistant'; } }, 'Всички'),
  },
  rows.length ? h('div', null, h('div.table-wrap', null, h('table', null, h('tbody', null, rows))),
    data.patients.length > max ? h('div.body.tiny.muted', null, `Показани са първите ${max} по спешност.`) : null)
    : empty('Асистентът няма спешни подсказки.', '✓'));
}

/* ------------------------------ обзор на досието ------------------------------ */

/** Най-важните подсказки на асистента в обзора на досието. */
export function assistantOverviewCard(ctx) {
  const as = ctx.data.assistant;
  if (!as || !as.active) return null;
  return card(`Асистент (${as.active})`, {
    icon: '🧭',
    actions: h('button.btn.sm', { onclick: () => ctx.openTab('assistant') }, as.active > as.top.length ? 'Всички' : 'Подробно'),
  },
  h('div.af-list', null, as.top.map(f => findingItem({ ...f, why: [] }, { compact: true }))));
}

/* ------------------------------ раздел в досието ------------------------------ */

/**
 * Разделът „Асистент“ в досието. Зарежда подсказките сам, за да не
 * забавя отварянето на досието.
 * @param {object} ctx  контекстът на досието ({ p, reload })
 */
export function assistantTab(ctx) {
  const host = h('div', null, loading('Асистентът преглежда досието…'));
  const draw = async () => {
    try {
      const [res, ai] = await Promise.all([api.patientAssistant(ctx.p.id), aiSettings()]);
      mount(host, assistantBody(ctx, res, ai, draw));
    } catch (err) {
      mount(host, card('Асистент', { icon: '🧭' }, h('p.small', null, err.message)));
    }
  };
  draw();
  return host;
}

function assistantBody(ctx, res, ai, redraw) {
  const { p } = ctx;
  const onDecide = async (f, status) => {
    if (await decide(p.id, f, status)) ctx.reload();
  };
  const bySev = [3, 2, 1].map(s => res.active.filter(f => f.severity === s)).filter(l => l.length);
  const reset = async (f) => {
    try {
      await api.assistantFeedback(p.id, { key: f.key, status: 'reset' });
      toast('Подсказката е върната в списъка.', 'ok');
      ctx.reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  const doctorName = (id) => state.doctors.find(d => d.id === id)?.name || '';

  return h('div.stack', null,
    card(res.active.length ? `Подсказки (${res.active.length})` : 'Подсказки', {
      icon: '🧭',
      actions: ai.enabled ? h('button.btn.sm', { onclick: () => aiDialog(p, redraw) }, '✨ Втори поглед') : null,
    },
    h('p.tiny.muted', { style: { marginTop: 0 } },
      'Асистентът сравнява резултатите, измерванията, лекарствата и текста на прегледите с клиничните насоки и подсказва какво може да се нуждае от допълнителна проверка или изследване. '
      + 'Предложенията са за преценка от лекаря.'),
    res.active.length
      ? bySev.map(list => h('div.af-list', null, list.map(f => findingItem(f, { onDecide }))))
      : empty('Асистентът няма подсказки за това досие.', '✓'),
    res.handled.length ? h('details.af-handled', null,
      h('summary', null, `Решени подсказки (${res.handled.length})`),
      h('div.table-wrap', null, h('table', null, h('tbody', null, res.handled.map(f => h('tr', null,
        h('td.small', null, h('strong', null, f.title), h('div.tiny.dim', null, CATEGORIES[f.category] || '')),
        h('td.small.nowrap', null, FEEDBACK[f.feedback.status] || f.feedback.status,
          f.feedback.until ? h('div.tiny.dim', null, 'до ' + formatDate(f.feedback.until)) : null),
        h('td.small.muted', null, f.feedback.reason || '', f.feedback.by ? h('div.tiny.dim', null, doctorName(f.feedback.by)) : null),
        h('td.right.no-print', null, h('button.btn.sm.ghost', { onclick: () => reset(f) }, 'Върни')))))))) : null),
    reviewCard(p, res.review, ai, redraw));
}

/* ------------------------------ втори поглед ------------------------------ */

function reviewCard(p, review, ai, redraw) {
  if (!review && !ai.enabled) {
    return h('p.tiny.muted', null,
      'Втори поглед от езиков модел може да се включи в Настройки, раздел „Асистент“, от компютъра, на който работи програмата.');
  }
  if (!review) return null;
  return card('Втори поглед от езиков модел', {
    icon: '✨',
    actions: ai.enabled ? h('button.btn.sm', { onclick: () => aiDialog(p, redraw) }, 'Нов анализ') : null,
  },
  h('div.tiny.dim', { style: { marginBottom: '8px' } },
    `${new Date(review.at).toLocaleDateString('bg-BG')} · ${review.model}${review.by ? ' · поискан от ' + (state.doctors.find(d => d.id === review.by)?.name || '') : ''}`),
  review.summary ? h('p.small', { style: { marginTop: 0 } }, review.summary) : null,
  review.suggestions.length
    ? h('div.af-list', null, review.suggestions.map(s => h('div.af.s' + s.severity, null,
      h('div.af-head', null, sevBadge(s.severity), h('strong.af-title', null, s.title)),
      h('div.af-action', null, s.action),
      s.why ? h('ul.af-why', null, h('li', null, s.why)) : null,
      s.source ? h('div.af-src', null, 'Основание: ', s.source) : null)))
    : h('p.small.muted', null, 'Езиковият модел не предлага допълнителни проверки.'),
  review.caveats ? h('p.tiny.muted', null, h('strong', null, 'Ограничения: '), review.caveats) : null,
  h('p.tiny.dim', { style: { marginBottom: 0 } },
    'Предложенията на езиковия модел могат да съдържат грешки. Проверете ги спрямо досието и насоките; решението е на лекаря.'));
}

/** Показва точния текст, който ще бъде изпратен, и изпраща само след потвърждение. */
export async function aiDialog(p, onDone) {
  let preview;
  try {
    preview = await api.aiPreview(p.id);
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  const status = h('div.small', { hidden: true });
  let sending = false;
  modal({
    title: 'Втори поглед от езиков модел',
    wide: true,
    body: h('div.stack', null,
      h('p.small', { style: { margin: 0 } },
        'До езиковия модел ще бъде изпратен само текстът по-долу. Имената, ЕГН, телефоните, имейлите и датите са премахнати, '
        + 'а времето е дадено относително („преди 3 мес.“). Прочетете го и изпратете, ако няма нищо, което да разпознава пациента.'),
      h('pre.ai-preview', null, preview.text),
      h('div.tiny.dim', null, `${preview.chars} знака · модел ${preview.model} · анализът обикновено отнема до минута`),
      status),
    actions: (close) => {
      const send = h('button.btn.primary', {
        type: 'button',
        onclick: async () => {
          if (sending) return;
          sending = true;
          send.disabled = true;
          status.hidden = false;
          mount(status, loading('Езиковият модел анализира обобщението…'));
          try {
            await api.aiReview(p.id);
            close();
            toast('Вторият поглед е готов.', 'ok');
            onDone();
          } catch (err) {
            mount(status, h('div.alert-strip', null, err.message));
            sending = false;
            send.disabled = false;
          }
        },
      }, 'Изпрати за анализ');
      return [h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'), send];
    },
  });
}
