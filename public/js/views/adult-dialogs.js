/* Прозорци за възрастни пациенти: заболяване, лекарство, резултати,
 * скали, начин на живот, измерване и FINDRISC. */

import { api } from '../api.js';
import {
  badge, confirmDialog, decimalFields, field, h, input, modal, normaliseDecimal, numberInput, select, toast,
} from '../ui/components.js';
import { addDays, formatDate, today } from '../shared/dates.js';
import { CONDITIONS, CONDITION_GROUPS, REQUIREMENTS, activeConditions } from '../shared/chronic.js';
import { CHECKS, LABS, LAB_GROUPS, rangeText, unitsFor } from '../shared/labs.js';
import { DRUGS, drugName, searchDrugs } from '../shared/drugs.js';
import { SCHEDULE_SLOTS, SEVERITY, medLabel } from '../shared/meds.js';
import { TOOLS, evaluate } from '../shared/mental.js';
import { ACTIVITY, PREFERENCES } from '../shared/nutrition.js';
import { FINDRISC_QUESTIONS, findrisc } from '../shared/clinical.js';

const dec = (v) => String(v ?? '').replace('.', ',');
const actionsFor = (label, submit) => (close) => [
  h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
  h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, label),
];

/* ------------------------------ заболяване ------------------------------ */

export function conditionDialog(ctx, existing = null, preset = '') {
  const { p, reload } = ctx;
  const active = new Set(activeConditions(p).map(c => c.code));
  let form;
  const tips = h('div.stack', { style: { gap: '6px' } });
  const targetsBox = h('div.form-grid.full');

  const renderExtras = (code) => {
    const def = CONDITIONS[code];
    tips.replaceChildren(...(def ? [
      h('div.tiny.dim', null, `МКБ-10: ${def.icd} · диспансерен преглед на ${def.review} мес.`),
      h('div.tiny', null, 'Проследяване: ', def.needs.map(([r, m]) => `${REQUIREMENTS[r].name.toLowerCase()} (${m} мес.)`).join(', ')),
      ...def.tips.map(t => h('div.tiny.muted', null, '• ' + t)),
    ] : []));
    const cur = existing ? existing.targets || {} : {};
    targetsBox.replaceChildren(
      def && def.targets.includes('bp') ? h('div', null, field('Индивидуална цел за налягане',
        input({ name: 'bp', value: cur.bp || '', placeholder: 'напр. 140/90' }),
        'Празно — по ESC 2024 (<130/80, при 85+ г. <140/90).')) : null,
      def && def.targets.includes('hba1c') ? h('div', null, field('Индивидуална цел за HbA1c (%)',
        numberInput({ name: 'hba1c', min: 5.5, max: 10, value: cur.hba1c ? dec(cur.hba1c) : '', placeholder: 'напр. 7,5' }),
        'Празно — по възрастта (<7,0%; 70+ г. <7,5%; 80+ г. <8,0%).')) : null);
  };

  const options = [];
  for (const [g, label] of Object.entries(CONDITION_GROUPS)) {
    const inGroup = Object.entries(CONDITIONS).filter(([, d]) => d.group === g);
    if (!inGroup.length) continue;
    const og = h('optgroup', { label });
    for (const [code, d] of inGroup) {
      og.appendChild(h('option', { value: code, disabled: !existing && active.has(code) }, d.name + (active.has(code) && !existing ? ' (вписано)' : '')));
    }
    options.push(og);
  }
  const codeSelect = h('select', { name: 'code', disabled: !!existing, onchange: (e) => renderExtras(e.target.value) },
    h('option', { value: '' }, '— изберете —'), options);
  if (existing) codeSelect.value = existing.code;
  else if (preset && !active.has(preset)) codeSelect.value = preset;

  const submit = async (close) => {
    const d = decimalFields(Object.fromEntries(new FormData(form)), ['hba1c']);
    const code = existing ? existing.code : d.code;
    if (!code) { toast('Изберете заболяване.', 'error'); return; }
    const payload = { since: d.since, note: d.note, targets: { bp: d.bp || '', hba1c: d.hba1c || '' } };
    try {
      if (existing) await api.updateCondition(p.id, existing.id, payload);
      else await api.addCondition(p.id, { code, ...payload });
      toast('Записано.', 'ok');
      close();
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };

  modal({
    title: existing ? CONDITIONS[existing.code].name : 'Хронично заболяване — ' + p.name,
    wide: true,
    body: (close) => {
      form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div.full', null, field('Заболяване', codeSelect)),
        h('div', null, field('От кога', input({ name: 'since', type: 'date', max: today(), value: existing ? existing.since || '' : '' }),
          'Нужно за SCORE2-Diabetes и за началото на проследяването.')),
        h('div', null, field('Бележка', input({ name: 'note', value: existing ? existing.note || '' : '', placeholder: 'стадий, специалист…' }))),
        targetsBox,
        h('div.full', null, tips));
      renderExtras(existing ? existing.code : codeSelect.value);
      return form;
    },
    actions: actionsFor(existing ? 'Запази' : 'Добави', submit),
  });
}

/* ------------------------------- лекарство ------------------------------- */

export function medDialog(ctx, existing = null) {
  const { p, reload } = ctx;
  let form;
  let chosen = existing ? existing.drug || '' : '';
  const chosenBox = h('div');
  const results = h('div.drug-results');
  const nameInput = input({ name: 'name', value: existing ? existing.name || '' : '', placeholder: 'търговско име или свободен текст' });

  const renderChosen = () => {
    chosenBox.replaceChildren(chosen
      ? h('div.row.tight', null, badge('done', drugName(chosen)),
        DRUGS[chosen].brands.length ? h('span.tiny.dim', null, DRUGS[chosen].brands.filter(b => /[а-я]/i.test(b)).slice(0, 3).join(', ')) : null,
        existing ? null : h('button.btn.xs', { type: 'button', onclick: () => { chosen = ''; renderChosen(); } }, 'смени'))
      : h('div.tiny.dim', null, 'Лекарството от каталога участва в проверките за взаимодействия, дозиране и проследяване.'));
    search.classList.toggle('hidden', !!chosen);
  };

  const search = input({
    placeholder: 'Търсене: име, активно вещество или търговско име (напр. Конкор, метформин)…',
    autocomplete: 'off',
    oninput: (e) => {
      const hits = searchDrugs(e.target.value, 10);
      results.replaceChildren(...hits.map(hit => h('button.drug-hit', {
        type: 'button',
        onclick: () => {
          chosen = hit.id;
          if (!nameInput.value && hit.brand) nameInput.value = hit.brand;
          results.replaceChildren();
          e.target.value = '';
          renderChosen();
        },
      }, h('strong', null, hit.name), hit.brand ? h('span.tiny.dim', null, ' · ' + hit.brand) : null)));
    },
  });

  const conds = activeConditions(p);
  const indication = select([
    { value: '', label: '—' },
    ...conds.map(c => ({ value: c.code, label: CONDITIONS[c.code].name, selected: existing && existing.indication === c.code })),
    ...Object.entries(CONDITIONS).filter(([code]) => !conds.some(c => c.code === code))
      .map(([code, d]) => ({ value: code, label: d.name, selected: existing && existing.indication === code })),
  ], { name: 'indication' });

  const sched = existing ? existing.schedule || {} : {};
  const supply = select([30, 60, 90].map(v => ({ value: v, label: `${v} дни`, selected: Number(existing?.supplyDays || 30) === v })), { name: 'supplyDays' });

  const submit = async (close) => {
    const d = Object.fromEntries(new FormData(form));
    const payload = {
      drug: chosen, name: d.name, dose: d.dose,
      schedule: Object.fromEntries(SCHEDULE_SLOTS.map(([k]) => [k, d['s_' + k] || ''])),
      prn: d.prn === 'on', chronic: d.chronic === 'on',
      indication: d.indication, start: d.start,
      prescribedOn: d.prescribedOn, supplyDays: d.prescribedOn ? d.supplyDays : '',
      protocolUntil: d.protocolUntil, note: d.note,
    };
    if (existing) delete payload.drug;
    try {
      if (existing) {
        await api.updateMed(p.id, existing.id, payload);
        toast('Промените са запазени.', 'ok');
        close();
        await reload();
        return;
      }
      const res = await api.addMed(p.id, payload);
      close();
      await reload();
      const serious = res.alerts.filter(a => a.severity !== 'info');
      if (serious.length) alertsDialog(`Внимание при ${medLabel(res.med)}`, serious);
      else toast('Лекарството е добавено.', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  };

  modal({
    title: existing ? 'Лекарство — ' + medLabel(existing) : 'Ново лекарство — ' + p.name,
    wide: true,
    body: (close) => {
      form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        // Не е <label>: щракването по резултат иначе се препраща към бутона „смени“.
        h('div.full', null, h('span.field-lbl', null, 'Лекарство'), chosenBox, search, results),
        h('div', null, field('Търговско име / свободен текст', nameInput)),
        h('div', null, field('Доза', input({ name: 'dose', value: existing ? existing.dose || '' : '', placeholder: 'напр. 5 мг' }))),
        h('div.full', null, h('span.lbl.field-lbl', null, 'Прием (брой таблетки)'),
          h('div.slots', null, SCHEDULE_SLOTS.map(([k, label]) => h('label.slot', null,
            h('span.tiny.dim', null, label),
            input({ name: 's_' + k, value: sched[k] || '', placeholder: '0', maxlength: 6 })))),
          h('label.check', { style: { marginTop: '6px' } },
            h('input', { type: 'checkbox', name: 'prn', checked: existing ? !!existing.prn : false }),
            h('span', null, 'При нужда'))),
        h('div', null, field('Показание', indication)),
        h('div', null, field('Приема от', input({ name: 'start', type: 'date', max: today(), value: existing ? existing.start || '' : today() }))),
        h('div.full', null, h('h3', { style: { marginTop: '4px' } }, 'Рецепта и протокол',
          h('span.small.muted', { style: { fontWeight: 400 } }, ' — за напомняне при изтичане'))),
        h('div', null, field('Последна рецепта', input({ name: 'prescribedOn', type: 'date', max: today(), value: existing ? existing.prescribedOn || '' : '' }))),
        h('div', null, field('За колко дни', supply)),
        h('div', null, field('Протокол (НЗОК) до', input({ name: 'protocolUntil', type: 'date', value: existing ? existing.protocolUntil || '' : '' }))),
        h('div.full', null, h('label.check', null,
          h('input', { type: 'checkbox', name: 'chronic', checked: existing ? existing.chronic !== false : true }),
          h('span', null, 'Постоянна терапия'))),
        h('div.full', null, field('Бележка', input({ name: 'note', value: existing ? existing.note || '' : '', placeholder: 'напр. след хранене' }))));
      renderChosen();
      return form;
    },
    actions: actionsFor(existing ? 'Запази' : 'Добави', submit),
  });
}

export function stopMedDialog(ctx, med) {
  const { p, reload } = ctx;
  let form;
  const submit = async (close) => {
    const d = Object.fromEntries(new FormData(form));
    try {
      await api.updateMed(p.id, med.id, { end: d.end, stopReason: d.reason === '__other' ? d.other : d.reason });
      toast('Лекарството е спряно.', 'ok');
      close();
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  modal({
    title: 'Спиране — ' + medLabel(med),
    body: (close) => {
      const other = h('div.full.hidden', null, field('Причина', input({ name: 'other' })));
      form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div', null, field('Спряно на', input({ name: 'end', type: 'date', value: today(), required: true }))),
        h('div', null, field('Причина', select(
          ['Нежелана реакция', 'Взаимодействие', 'Недостатъчен ефект', 'Не е нужно повече', 'Смяна с друго лекарство', 'По решение на специалист']
            .map(v => ({ value: v, label: v })).concat([{ value: '__other', label: 'Друго…' }]),
          { name: 'reason', onchange: (e) => other.classList.toggle('hidden', e.target.value !== '__other') }))),
        other);
      return form;
    },
    actions: actionsFor('Спри лекарството', submit),
  });
}

export function renewDialog(ctx, med) {
  const { p, reload } = ctx;
  let form;
  const submit = async (close) => {
    const d = Object.fromEntries(new FormData(form));
    const payload = { prescribedOn: d.prescribedOn, supplyDays: d.supplyDays };
    if (d.protocolUntil) payload.protocolUntil = d.protocolUntil;
    try {
      await api.updateMed(p.id, med.id, payload);
      toast('Рецептата е отбелязана.', 'ok');
      close();
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  modal({
    title: 'Нова рецепта — ' + medLabel(med),
    body: (close) => {
      form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div', null, field('Издадена на', input({ name: 'prescribedOn', type: 'date', max: today(), value: today(), required: true }))),
        h('div', null, field('За колко дни', select([30, 60, 90].map(v => ({ value: v, label: `${v} дни`, selected: Number(med.supplyDays || 30) === v })), { name: 'supplyDays' }))),
        h('div.full', null, field('Нов протокол до', input({ name: 'protocolUntil', type: 'date', value: '' }),
          med.protocolUntil ? `Сегашният е до ${formatDate(med.protocolUntil)}. Оставете празно, ако не се подновява.` : 'По желание.')));
      return form;
    },
    actions: actionsFor('Запиши', submit),
  });
}

/** Показва лекарствените сигнали след добавяне на лекарство. */
export function alertsDialog(title, alerts) {
  modal({
    title,
    wide: true,
    body: h('div.stack', null, alerts.map(alertStrip)),
    actions: (close) => [h('button.btn.primary', { onclick: () => close() }, 'Разбрах')],
  });
}

export function alertStrip(a) {
  const cls = a.severity === 'contra' || a.severity === 'major' ? '' : a.severity === 'moderate' ? '.warn' : '.info';
  return h('div.alert-strip' + cls, null, h('div', null,
    h('div', null, h('span.sev', null, SEVERITY[a.severity].label), ' ', h('strong', null, a.title)),
    a.text ? h('div.small', { style: { fontWeight: 400 } }, a.text) : null,
    a.advice ? h('div.small', { style: { fontWeight: 600 } }, a.advice) : null));
}

/* ------------------------------ резултати ------------------------------ */

const PANELS = [
  { label: 'Диабет', codes: ['hba1c', 'glucose', 'creat', 'uacr', 'tchol', 'ldl', 'hdl', 'tg'] },
  { label: 'Липиден профил', codes: ['tchol', 'ldl', 'hdl', 'tg'] },
  { label: 'Бъбреци', codes: ['creat', 'uacr', 'k', 'na'] },
  { label: 'Черен дроб', codes: ['alt', 'ast', 'plt'] },
  { label: 'Щитовидна жлеза', codes: ['tsh', 'ft4'] },
  { label: 'Кръвна картина', codes: ['hb', 'plt', 'wbc', 'ferritin'] },
];

/**
 * Въвеждане на резултати. `codes` — кои изследвания да излязат най-отгоре
 * (например по задачите от диспансерното наблюдение).
 */
export function resultsDialog(ctx, codes = []) {
  const { p, reload } = ctx;
  let form;
  const shown = new Set(codes.filter(c => LABS[c]));
  const wantChecks = new Set(codes.filter(c => CHECKS[c]));
  const labsBox = h('div.lab-grid');
  const showAll = { on: shown.size === 0 && wantChecks.size === 0 };

  const labRow = (code) => {
    const lab = LABS[code];
    const units = unitsFor(code);
    const r = rangeText(code, p.sex);
    return h('div.lab-row', { dataset: { code } },
      h('div.lab-name', null, h('div', null, lab.name),
        r ? h('div.tiny.dim', null, `норма ${r} ${lab.unit}`) : null),
      numberInput({ name: 'v_' + code, min: 0, placeholder: '' }),
      units.length > 1
        ? select(units.map(u => ({ value: u, label: u })), { name: 'u_' + code, style: { width: 'auto' } })
        : h('span.tiny.dim.unit', null, lab.unit));
  };

  const render = () => {
    const list = showAll.on ? Object.keys(LABS) : [...shown];
    const groups = new Map();
    for (const code of list) {
      const g = LABS[code].group;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(code);
    }
    labsBox.replaceChildren(...[...groups.entries()].map(([g, list]) =>
      h('div.lab-group', null, h('div.lab-group-title', null, LAB_GROUPS[g]), list.map(labRow))));
  };

  const panelButtons = h('div.chips', null,
    PANELS.map(pn => h('button.chip', {
      type: 'button',
      onclick: () => { for (const c of pn.codes) shown.add(c); showAll.on = false; render(); },
    }, '＋ ' + pn.label)),
    h('button.chip', { type: 'button', onclick: () => { showAll.on = true; render(); } }, 'Всички изследвания'));

  const checks = h('div.stack', { style: { gap: '6px' } }, Object.entries(CHECKS).map(([code, c]) => {
    const text = input({ name: 't_' + code, placeholder: 'заключение (по желание)', disabled: !wantChecks.has(code) });
    const box = h('input', {
      type: 'checkbox', name: 'c_' + code, checked: wantChecks.has(code),
      onchange: (e) => { text.disabled = !e.target.checked; if (e.target.checked) text.focus(); },
    });
    return h('div.check-row', null, h('label.check', null, box, h('span', null, c.name)), text);
  }));

  const submit = async (close) => {
    const fd = new FormData(form);
    const items = [];
    for (const code of Object.keys(LABS)) {
      const raw = normaliseDecimal(fd.get('v_' + code));
      if (raw === '' || raw === null) continue;
      items.push({ code, value: raw, unit: fd.get('u_' + code) || LABS[code].unit });
    }
    for (const code of Object.keys(CHECKS)) {
      if (fd.get('c_' + code)) items.push({ code, text: fd.get('t_' + code) || '' });
    }
    if (!items.length) { toast('Въведете поне един резултат.', 'error'); return; }
    try {
      const res = await api.addResults(p.id, { date: fd.get('date'), items, note: fd.get('note') });
      toast(`Записани резултати: ${res.results.length}.` + (res.closed.length ? ` Отбелязано в профилактиката: ${res.closed.join('; ')}` : ''), 'ok');
      close();
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };

  modal({
    title: 'Резултати от изследвания — ' + p.name,
    wide: true,
    body: (close) => {
      form = h('form', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div.form-grid', null,
          h('div', null, field('Дата на изследването', input({ name: 'date', type: 'date', max: today(), value: today(), required: true }))),
          h('div', null, field('Бележка', input({ name: 'note', placeholder: 'лаборатория, направление…' })))),
        h('div', { style: { margin: '12px 0 8px' } }, panelButtons),
        labsBox,
        h('h3', { style: { margin: '14px 0 6px' } }, 'Прегледи и процедури'),
        checks,
        h('p.tiny.muted', { style: { marginTop: '10px' } },
          'eGFR се изчислява автоматично от креатинина (CKD-EPI 2021). Стойности в други единици се преобразуват.'));
      render();
      return form;
    },
    actions: actionsFor('Запиши резултатите', submit),
  });
}

/* --------------------------------- скали --------------------------------- */

export function assessmentDialog(ctx, toolId) {
  const { p, reload } = ctx;
  const tool = TOOLS[toolId];
  let form;
  const live = h('div.score-live');

  const rows = tool.items
    ? tool.items.map((text, i) => ({ text, options: tool.options, name: 'q' + i }))
    : tool.questions
      ? tool.questions.map((q, i) => ({ text: q.text, options: q.options, name: 'q' + i }))
      : (tool.fields || []).map((f, i) => ({ text: f.label, options: f.options, name: 'q' + i }));

  const answers = () => {
    const fd = new FormData(form);
    return rows.map(r => fd.get(r.name));
  };
  const update = () => {
    const a = answers();
    const number = form.querySelector('[name="number"]');
    const n = number ? Number(normaliseDecimal(number.value)) || null : null;
    if (tool.kind === 'value') {
      if (!n && n !== 0) { live.replaceChildren(h('span.dim', null, 'Въведете стойността.')); return; }
      const r = evaluate(toolId, [], { number: n });
      live.replaceChildren(h('strong', null, `${dec(n)}%`), ' · ', r.label);
      return;
    }
    const filled = a.filter(v => v !== null).length;
    if (filled < rows.length) {
      live.replaceChildren(h('span.dim', null, `Отговорени ${filled} от ${rows.length}`));
      return;
    }
    const r = evaluate(toolId, a.map(Number), { sex: p.sex, number: n });
    live.replaceChildren(h('strong', null, `${r.score} т.`), ' · ', r.label,
      r.alerts.length ? h('div.alert-strip', { style: { marginTop: '6px' } }, r.alerts[0].text) : null);
  };

  const submit = async (close) => {
    const a = answers();
    if (a.some(v => v === null)) { toast('Отговорете на всички въпроси.', 'error'); return; }
    const number = form.querySelector('[name="number"]');
    const extra = form.querySelector('[name="extra"]:checked');
    try {
      const res = await api.addAssessment(p.id, {
        tool: toolId, date: form.date.value,
        answers: a.map(v => (v === null ? null : Number(v))),
        number: number ? normaliseDecimal(number.value) : undefined,
        extra: extra ? { difficulty: Number(extra.value) } : null,
        note: form.note.value,
      });
      close();
      await reload();
      const r = res.assessment.result;
      modal({
        title: `${tool.short}: ${r.label}`,
        body: h('div.stack', null,
          h('div', { style: { fontSize: '22px', fontWeight: 700 } }, tool.kind === 'value' ? `${dec(r.score)}%` : `${r.score} т.`,
            tool.max && tool.kind !== 'value' ? h('span.small.dim', null, ` от ${tool.max}`) : null),
          r.alerts.map(al => h('div.alert-strip', null, al.text)),
          h('p', null, r.advice),
          res.closed.length ? h('div.small.muted', null, 'Отбелязано в профилактиката: ' + res.closed.join(', ')) : null),
        actions: (c) => [h('button.btn.primary', { onclick: () => c() }, 'Затвори')],
      });
    } catch (err) { toast(err.message, 'error'); }
  };

  modal({
    title: tool.name + ' — ' + p.name,
    wide: true,
    body: (close) => {
      form = h('form', { onsubmit: (e) => { e.preventDefault(); submit(close); }, oninput: () => update(), onchange: () => update() },
        h('div.form-grid', null,
          h('div', null, field('Дата', input({ name: 'date', type: 'date', max: today(), value: today(), required: true })))),
        tool.intro ? h('p.small.muted', { style: { margin: '10px 0' } }, tool.intro) : null,
        h('div.questionnaire', null, rows.map((r, i) => h('div.q', null,
          h('div.q-text', null, h('span.q-n', null, (i + 1) + '.'), r.text),
          h('div.q-opts', null, r.options.map(([v, label]) => h('label.opt', null,
            h('input', { type: 'radio', name: r.name, value: v }),
            h('span', null, label))))))),
        tool.extra ? h('div.q', null,
          h('div.q-text', null, tool.extra.text),
          h('div.q-opts', null, tool.extra.options.map(([v, label]) => h('label.opt', null,
            h('input', { type: 'radio', name: 'extra', value: v }), h('span', null, label))))) : null,
        tool.number ? h('div.form-grid', { style: { marginTop: '10px' } },
          h('div', null, field(tool.number.label, numberInput({ name: 'number', min: tool.number.min, max: tool.number.max })))) : null,
        h('div', { style: { marginTop: '10px' } }, field('Бележка', input({ name: 'note' }))),
        live);
      setTimeout(update, 0);
      return form;
    },
    actions: actionsFor('Запиши', submit),
  });
}

/* ---------------------------- начин на живот ---------------------------- */

export const SMOKING = { never: 'никога не е пушил(а)', former: 'бивш пушач', current: 'пуши' };
export const ALCOHOL = { none: 'не пие', low: 'умерено', high: 'рискова употреба' };

export function lifestyleDialog(ctx) {
  const { p, reload } = ctx;
  const ls = p.lifestyle || {};
  let form;
  const radios = (name, map, value) => h('div.q-opts', null, Object.entries(map).map(([v, label]) =>
    h('label.opt', null, h('input', { type: 'radio', name, value: v, checked: value === v }), h('span', null, label))));

  const submit = async (close) => {
    const fd = new FormData(form);
    try {
      await api.setLifestyle(p.id, {
        smoking: fd.get('smoking') || '', alcohol: fd.get('alcohol') || '', activity: fd.get('activity') || '',
        diet: fd.getAll('diet'), bleedingHistory: fd.get('bleedingHistory') === 'on', notes: fd.get('notes'),
      });
      toast('Записано.', 'ok');
      close();
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };

  modal({
    title: 'Начин на живот — ' + p.name,
    wide: true,
    body: (close) => {
      form = h('form.stack', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div', null, h('div.lbl.field-lbl', null, 'Тютюнопушене'), radios('smoking', SMOKING, ls.smoking),
          h('div.field-hint', null, 'Влиза в SCORE2 — без отговор рискът се изчислява като за непушач.')),
        h('div', null, h('div.lbl.field-lbl', null, 'Алкохол'), radios('alcohol', ALCOHOL, ls.alcohol)),
        h('div', null, h('div.lbl.field-lbl', null, 'Физическа активност'),
          radios('activity', Object.fromEntries(Object.entries(ACTIVITY).map(([k, v]) => [k, v.label])), ls.activity)),
        h('div', null, h('div.lbl.field-lbl', null, 'Хранене'),
          h('div.q-opts', null, Object.entries(PREFERENCES).map(([k, label]) => h('label.opt', null,
            h('input', { type: 'checkbox', name: 'diet', value: k, checked: (ls.diet || []).includes(k) }), h('span', null, label))))),
        h('label.check', null, h('input', { type: 'checkbox', name: 'bleedingHistory', checked: !!ls.bleedingHistory }),
          h('span', null, 'Прекарано голямо кървене или предразположение (за HAS-BLED)')),
        field('Бележки', h('textarea', { name: 'notes', rows: 2 }, ls.notes || '')));
      return form;
    },
    actions: actionsFor('Запази', submit),
  });
}

/* ------------------------------- измерване ------------------------------- */

export function adultMeasurementDialog(ctx) {
  const { p, reload } = ctx;
  let form;
  const submit = async (close) => {
    const d = decimalFields(Object.fromEntries(new FormData(form)),
      ['weight', 'height', 'waist', 'systolic', 'diastolic', 'pulse', 'systolic2', 'diastolic2']);
    try {
      await api.addMeasurement(p.id, {
        date: d.date, weight: d.weight, height: d.height, waist: d.waist,
        systolic: d.systolic, diastolic: d.diastolic, pulse: d.pulse, note: d.note,
      });
      if (d.systolic2 || d.diastolic2) {
        await api.addMeasurement(p.id, { date: d.date, systolic: d.systolic2, diastolic: d.diastolic2, note: 'второ измерване' });
      }
      toast('Измерването е записано.', 'ok');
      close();
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  modal({
    title: 'Измерване — ' + p.name,
    wide: true,
    body: (close) => {
      form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div', null, field('Дата', input({ name: 'date', type: 'date', value: today(), max: today(), required: true }))),
        h('div', null, field('Тегло (кг)', numberInput({ name: 'weight', min: 30, max: 350 }))),
        h('div', null, field('Ръст (см)', numberInput({ name: 'height', min: 120, max: 230 }), 'Достатъчно е веднъж.')),
        h('div', null, field('Обиколка на талията (см)', numberInput({ name: 'waist', min: 40, max: 250 }))),
        h('div', null, field('Систолно (mmHg)', numberInput({ name: 'systolic', min: 50, max: 280 }))),
        h('div', null, field('Диастолно (mmHg)', numberInput({ name: 'diastolic', min: 20, max: 160 }))),
        h('div', null, field('Пулс (/мин)', numberInput({ name: 'pulse', min: 25, max: 220 }))),
        h('div', null, field('Второ измерване — систолно', numberInput({ name: 'systolic2', min: 50, max: 280 }),
          'ESH: средно от 2 измервания през 1–2 минути.')),
        h('div', null, field('Второ измерване — диастолно', numberInput({ name: 'diastolic2', min: 20, max: 160 }))),
        h('div.full', null, field('Бележка', input({ name: 'note', placeholder: 'напр. домашно измерване, дясна ръка' }))));
      return form;
    },
    actions: actionsFor('Запиши', submit),
  });
}

/* -------------------------------- FINDRISC -------------------------------- */

export function findriscDialog(ctx, summary) {
  const { p } = ctx;
  const v = summary.vitals;
  let form;
  const out = h('div.score-live');
  const update = () => {
    const fd = new FormData(form);
    const answers = Object.fromEntries(FINDRISC_QUESTIONS.map(q => [q.id, fd.get(q.id)]));
    const r = findrisc({ age: summary.age, bmi: v.bmi, waist: v.waist?.value, sex: p.sex, answers });
    out.replaceChildren(r
      ? h('div', null, h('strong', null, `${r.score} т. · ${r.label} риск`),
        h('div.small', null, `Вероятност за диабет тип 2 в следващите 10 години: ${r.chance}.`),
        h('div.small', null, r.advice))
      : h('span.dim', null, 'Отговорете на всички въпроси.'));
  };
  modal({
    title: 'FINDRISC — риск от диабет тип 2',
    wide: true,
    body: () => {
      if (!v.bmi || !v.waist) {
        return h('div.alert-strip.warn', null, 'Нужни са тегло, ръст и обиколка на талията — добавете измерване.');
      }
      form = h('form', { onchange: update },
        h('p.small.muted', null, `Възраст ${summary.age} г. · ИТМ ${dec(v.bmi)} · талия ${dec(v.waist.value)} см — попълнени от досието.`),
        h('div.questionnaire', null, FINDRISC_QUESTIONS.map((q, i) => h('div.q', null,
          h('div.q-text', null, h('span.q-n', null, (i + 1) + '.'), q.text),
          h('div.q-opts', null, q.options.map(([val, label]) => h('label.opt', null,
            h('input', { type: 'radio', name: q.id, value: val }), h('span', null, label))))))),
        out);
      setTimeout(update, 0);
      return form;
    },
    actions: (close) => [h('button.btn', { onclick: () => close() }, 'Затвори')],
  });
}

/* ------------------------------ помощни ------------------------------ */

/** Какво да се отвори за дадена задача от диспансерното наблюдение. */
export function openForRequirement(ctx, req, extra = {}) {
  if (req === 'review') { extra.visit?.(); return; }
  const r = REQUIREMENTS[req];
  if (!r) return;
  if (r.tools) { assessmentDialog(ctx, r.tools[0]); return; }
  resultsDialog(ctx, r.codes);
}

export async function deleteWithConfirm(message, action, done) {
  const ok = await confirmDialog({ title: 'Изтриване', message, confirmLabel: 'Изтрий', danger: true });
  if (!ok) return;
  try {
    await action();
    toast('Изтрито.');
    await done();
  } catch (err) { toast(err.message, 'error'); }
}

export const runsOut = (m) => (m.prescribedOn && m.supplyDays ? addDays(m.prescribedOn, Number(m.supplyDays)) : null);
