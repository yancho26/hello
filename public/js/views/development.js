/* Раздел „Нервно-психическо развитие“ в досието на детето. */

import { api } from '../api.js';
import {
  badge, card, confirmDialog, empty, field, h, input, modal, select, table, toast,
} from '../ui/components.js';
import { formatAge, formatDate } from '../shared/dates.js';
import {
  CHECKPOINTS, DEV_DOMAINS, DEV_SOURCE, DOMAIN_ORDER, MILESTONE_ANSWERS,
  RED_FLAGS, SCREENING_LABELS, SCREENING_RESULTS, SCREENING_TOOLS,
  assessRecord, labelForAge,
} from '../shared/development.js';

const STATUS_BADGE = {
  ok: 'done', watch: 'due', screen: 'overdue', refer: 'overdue', red_flag: 'overdue',
};

export function developmentTab(ctx) {
  const { p, data, reload } = ctx;
  const dev = data.development;
  if (!dev) return card(null, {}, empty('Няма данни за развитието.', '🧠'));

  const done = new Map(dev.assessments.map(a => [a.record.checkpoint, a]));
  const ageMonths = dev.age.months;

  /* --- лентата с текущото състояние --- */
  const latest = dev.latest;
  const banner = latest
    ? h('div.alert-strip' + bannerClass(latest.action.severity), null,
      h('div', null,
        h('strong', null, `${latest.action.label} — по листа за ${labelForAge(latest.record.checkpoint)}`),
        h('div.small', { style: { fontWeight: '400' } }, latest.action.detail)))
    : null;

  const dueNote = dev.dueCheckpoint && !dev.dueDone
    ? h('div.alert-strip.warn', null,
      h('div', null,
        h('strong', null, `Предстои оценка по листа за ${labelForAge(dev.dueCheckpoint.ageMonths)}. `),
        dev.dueCheckpoint.screening.length
          ? 'На тази възраст се препоръчва и ' + dev.dueCheckpoint.screening
            .map(s => SCREENING_LABELS[s].toLowerCase()).join(' и ') + '.'
          : 'Попълнете контролния лист по време на профилактичния преглед.'))
    : null;

  const correctedNote = dev.age.corrected
    ? h('div.alert-strip.info', null,
      h('div', null,
        h('strong', null, 'Оценява се по коригирана възраст — '),
        `${labelForAge(Math.round(ageMonths))} вместо ${formatAge(p.birthDate)}. `,
        'При недоносеност развитието се преценява по коригирана възраст до 24 месеца.'))
    : null;

  /* --- обобщение по контролни възрасти --- */
  const rows = CHECKPOINTS
    .filter(cp => cp.ageMonths <= ageMonths + 0.5 || done.has(cp.ageMonths))
    .map(cp => {
      const a = done.get(cp.ageMonths);
      return h('tr' + (a && a.action.severity >= 2 ? '.attention' : ''), null,
        h('td.nowrap', null, h('strong', null, labelForAge(cp.ageMonths))),
        h('td.nowrap.small', null, a ? formatDate(a.record.date) : h('span.dim', null, '—')),
        h('td', null, a
          ? badge(STATUS_BADGE[a.status], a.action.label)
          : h('span.badge', null, 'не е попълнен')),
        h('td.small', null, a
          ? `${a.met} от ${a.total} покрити` + (a.notMet ? `, ${a.notMet} непокрити` : '')
          : ''),
        h('td.small.muted', null, a && a.record.screening
          ? toolLabel(a.record.screening.tool) + ': ' + SCREENING_RESULTS[a.record.screening.result].label
          : cp.screening.length ? '(препоръчва се скрининг)' : ''),
        h('td.actions.no-print', null,
          h('button.btn.xs' + (a ? '' : '.primary'), {
            onclick: () => checklistDialog(ctx, cp, a ? a.record : null),
          }, a ? '✎' : 'Попълни'),
          a ? h('span', null, ' ', h('button.btn.xs.danger', {
            onclick: async () => {
              const ok = await confirmDialog({
                title: 'Изтриване на оценка',
                message: `Оценката по листа за ${labelForAge(cp.ageMonths)} ще бъде изтрита.`,
                confirmLabel: 'Изтрий', danger: true,
              });
              if (!ok) return;
              await api.deleteDevelopment(p.id, a.record.id);
              toast('Оценката е изтрита.');
              reload();
            },
          }, '✕')) : null));
    });

  /* --- изпълнението по области при последната оценка --- */
  const domainCard = latest
    ? card(`Области при последната оценка (${labelForAge(latest.record.checkpoint)})`, { icon: '🧠' },
      h('div.grid.cols-2', null, DOMAIN_ORDER.map(key => {
        const items = latest.checkpoint.items.filter(i => i.domain === key);
        if (!items.length) return null;
        const answers = latest.record.answers || {};
        const notMet = items.filter(i => answers[i.id] === 'not_yet');
        return h('div', null,
          h('div.row.tight', null,
            h('strong', null, DEV_DOMAINS[key].icon + ' ' + DEV_DOMAINS[key].short),
            notMet.length
              ? badge('overdue', `${notMet.length} непокрити`)
              : badge('done', 'по възраст')),
          notMet.length
            ? h('ul.list-plain.small', { style: { marginTop: '4px' } },
              notMet.map(i => h('li', { style: { padding: '3px 0' } }, i.bg)))
            : null);
      }).filter(Boolean)))
    : null;

  return h('div.stack', null,
    h('div.row.no-print', null,
      dev.dueCheckpoint
        ? h('button.btn.primary', {
          onclick: () => checklistDialog(ctx, dev.dueCheckpoint,
            done.get(dev.dueCheckpoint.ageMonths) ? done.get(dev.dueCheckpoint.ageMonths).record : null),
        }, `＋ Оценка по листа за ${labelForAge(dev.dueCheckpoint.ageMonths)}`)
        : h('span.muted.small', null, 'Първият контролен лист е на 2-месечна възраст.'),
      h('div.grow'),
      h('span.small.muted', null, `Попълнени ${dev.coverage.done} от ${dev.coverage.expected} листа`)),

    banner, dueNote, correctedNote,

    rows.length
      ? card('Оценки по контролни възрасти', { icon: '📋', tight: true },
        table(['Възраст', 'Дата', 'Заключение', 'Етапи', 'Скрининг', ''], rows))
      : card(null, {}, empty('Още няма попълнени контролни листове.', '🧠')),

    domainCard,

    dev.history && dev.history.length
      ? card(`Предишни находки (${dev.history.length})`, { icon: '🕓' },
        h('p.small.muted', { style: { marginTop: 0 } },
          'Находки от по-ранни оценки. Последната оценка ги е заменила — остават тук за проследимост.'),
        h('ul.list-plain', null, dev.history.map(c =>
          h('li', null,
            h('div.small', null, h('strong', null, c.title), ' · ', formatDate(c.date)),
            h('div.tiny.dim', null, c.detail)))))
      : null,

    card('За тези списъци', { icon: 'ℹ️' },
      h('p.small.muted', { style: { marginBottom: '6px' } },
        `Етапите са по ${DEV_SOURCE} Ревизията от 2022 г. ги постави на 75-и персентил — `
        + 'това, което правят 75% и повече от децата на съответната възраст. Дотогава се ползваше '
        + 'медианата, при която по определение половината деца не покриват етапа и това насърчаваше изчакване.'),
      h('p.small.muted', { style: { marginBottom: '6px' } },
        h('strong', null, 'Непокрит етап не е диагноза. '),
        'Той е основание да се направи стандартизиран скрининг сега, вместо да се изчака следващият преглед.'),
      h('p.small.muted', { style: { marginBottom: 0 } },
        'Текстовете са работен превод на материала на CDC (обществено достояние) и служат за наблюдение, '
        + 'а не като валидиран психометричен тест. Оригиналът на всеки етап се вижда при посочване с мишката.')));
}

function bannerClass(severity) {
  return severity >= 2 ? '' : severity === 1 ? '.warn' : '.info';
}

function toolLabel(id) {
  const t = SCREENING_TOOLS.find(x => x.id === id);
  return t ? t.label : id;
}

/* ------------------------------ формулярът ------------------------------ */

function checklistDialog(ctx, checkpoint, existing) {
  const { p, reload } = ctx;
  const answers = { ...((existing && existing.answers) || {}) };
  let form;

  const counters = h('div.row.tight');
  const refreshCounters = () => {
    const values = Object.values(answers);
    const yes = values.filter(v => v === 'yes').length;
    const no = values.filter(v => v === 'not_yet').length;
    const unsure = values.filter(v => v === 'unsure').length;
    const total = checkpoint.items.length;
    // replaceChildren не пропуска null — подава се само това, което има.
    counters.replaceChildren(...[
      badge('done', `покрити ${yes}`),
      no ? badge('overdue', `непокрити ${no}`) : null,
      unsure ? badge('due', `несигурни ${unsure}`) : null,
      h('span.small.muted', null, `от ${total}`),
    ].filter(Boolean));
  };

  const answerRow = (item) => {
    const buttons = Object.entries(MILESTONE_ANSWERS).map(([value, meta]) =>
      h('button.btn.xs', {
        type: 'button',
        title: meta.label,
        dataset: { value },
        onclick: (e) => {
          answers[item.id] = answers[item.id] === value ? undefined : value;
          if (answers[item.id] === undefined) delete answers[item.id];
          for (const b of e.target.parentElement.children) {
            b.classList.toggle('primary', b.dataset.value === answers[item.id]);
          }
          refreshCounters();
        },
      }, meta.short + ' ' + meta.label));
    for (const b of buttons) b.classList.toggle('primary', b.dataset.value === answers[item.id]);

    return h('div', {
      style: {
        display: 'flex', gap: '10px', alignItems: 'flex-start',
        padding: '7px 0', borderBottom: '1px solid var(--line)',
      },
    },
      h('div.grow', { title: item.en }, item.bg),
      h('div.row.tight', { style: { flexWrap: 'nowrap' } }, buttons));
  };

  const domainBlocks = DOMAIN_ORDER.map(key => {
    const items = checkpoint.items.filter(i => i.domain === key);
    if (!items.length) return null;
    return h('div', { style: { marginBottom: '14px' } },
      h('h3', { style: { marginBottom: '4px' } },
        DEV_DOMAINS[key].icon + ' ' + DEV_DOMAINS[key].label),
      items.map(answerRow));
  }).filter(Boolean);

  const screeningTool = select(
    [{ value: '', label: '— не е правен —' },
      ...SCREENING_TOOLS.map(t => ({
        value: t.id, label: t.label,
        selected: existing && existing.screening && existing.screening.tool === t.id,
      }))],
    { name: 'screeningTool' });
  const screeningResult = select(
    Object.entries(SCREENING_RESULTS).map(([value, meta]) => ({
      value, label: meta.label,
      selected: existing && existing.screening && existing.screening.result === value,
    })), { name: 'screeningResult' });

  const submit = async (close) => {
    const fd = new FormData(form);
    const payload = {
      date: fd.get('date'),
      checkpoint: checkpoint.ageMonths,
      answers,
      lostSkills: fd.get('lostSkills') === 'on',
      parentConcern: fd.get('parentConcern') === 'on',
      action: fd.get('action'),
      note: fd.get('note'),
    };
    if (fd.get('screeningTool')) {
      payload.screening = {
        tool: fd.get('screeningTool'),
        result: fd.get('screeningResult'),
        score: fd.get('screeningScore'),
      };
    }
    try {
      const res = await api.addDevelopment(p.id, payload);
      const outcome = assessRecord(res.record);
      const closed = (res.closedItems || []).length
        ? ' Отбелязан е и скринингът в календара.' : '';
      toast(`Записано: ${outcome.action.label}.${closed}`,
        outcome.action.severity >= 2 ? 'error' : 'ok');
      close();
      await reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  modal({
    title: `Развитие — контролен лист за ${labelForAge(checkpoint.ageMonths)}`,
    wide: true,
    body: (close) => {
      form = h('form', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div.row', { style: { marginBottom: '10px' } },
          h('div', null, field('Дата на оценката',
            input({
              name: 'date', type: 'date',
              value: existing ? existing.date : new Date().toISOString().slice(0, 10),
              max: new Date().toISOString().slice(0, 10), required: true,
            }))),
          h('div.grow'),
          counters),

        checkpoint.screening.length
          ? h('div.alert-strip.info', { style: { marginBottom: '10px' } },
            'На тази възраст се препоръчва: '
            + checkpoint.screening.map(s => SCREENING_LABELS[s]).join(' и ') + '.')
          : null,

        h('div', { style: { maxHeight: '46vh', overflowY: 'auto', paddingRight: '6px' } },
          domainBlocks),

        h('h3', { style: { marginBottom: '6px' } }, 'Тревожни признаци'),
        ...RED_FLAGS.map(flag => h('label.check', { style: { marginBottom: '6px' } },
          h('input', {
            type: 'checkbox',
            name: flag.id === 'loss' ? 'lostSkills' : 'parentConcern',
            checked: existing
              ? (flag.id === 'loss' ? !!existing.lostSkills : !!existing.parentConcern)
              : false,
          }),
          h('span', null, h('strong', null, flag.label),
            h('div.tiny.dim', null, flag.detail)))),

        h('h3', { style: { margin: '10px 0 6px' } }, 'Стандартизиран скрининг'),
        h('div.form-grid', null,
          h('div', null, field('Инструмент', screeningTool)),
          h('div', null, field('Резултат', screeningResult)),
          h('div', null, field('Точки / бележка', input({
            name: 'screeningScore',
            value: existing && existing.screening ? existing.screening.score || '' : '',
          })))),

        h('div.form-grid', { style: { marginTop: '10px' } },
          h('div.full', null, field('Предприети действия', input({
            name: 'action', placeholder: 'напр. насочен към детски невролог',
            value: existing ? existing.action || '' : '',
          }))),
          h('div.full', null, field('Бележка',
            h('textarea', { name: 'note', rows: 2 }, existing ? existing.note || '' : '')))));

      refreshCounters();
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, 'Запиши оценката'),
    ],
  });
}
