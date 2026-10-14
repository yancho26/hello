/* Менструален цикъл: раздел „Цикъл“ в досието (дневник, фази, прогноза, оценка по FIGO),
 * полетата за цикъла във формата на хранителния режим и блокът „Цикъл и хранене“ в режима. */

import { api } from '../api.js';
import { card, confirmDialog, field, h, input, mount, numberInput, select, toast } from '../ui/components.js';
import { addDays, ageInMonthsExact, daysBetween, formatDate, today } from '../shared/dates.js';
import { CONTRACEPTION, DEFAULT_BLEED, DEFAULT_LENGTH, PHASES, cleanCycle, cycleStats, phasesFrom } from '../shared/cycle.js';
import { deleteWithConfirm } from './adult-dialogs.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const ageOf = (p) => (p.birthDate ? Math.floor(ageInMonthsExact(p.birthDate, today()) / 12) : p.age ?? null);

/* ------------------------------- обобщение ------------------------------- */

/** Днешният ден от цикъла, следващата менструация, овулацията и бележките. */
export function cycleStatus(s) {
  const rows = [];
  if (s.today) {
    rows.push(h('div.cycle-now', null,
      h('span.cycle-dot.ph-' + s.today.phase, null, s.today.icon),
      h('div', null,
        h('strong', null, `Ден ${s.today.day} от цикъла · ${s.today.label}`),
        h('div.small.muted', null,
          s.pending
            ? `Менструацията се очакваше на ${formatDate(s.nextStart)} — ако е започнала, въведете датата.`
            : `Следваща менструация около ${formatDate(s.nextStart)} (след ${plural(daysBetween(today(), s.nextStart), 'ден', 'дни')})`,
          s.ovulation ? ` · овулация около ${formatDate(s.ovulation)}` : ''))));
  } else if (!s.lastStart && !s.menopause) {
    rows.push(h('div.small.muted', null, 'Няма въведена менструация.'));
  }
  for (const f of s.flags) rows.push(h(`div.alert-strip${f.level === 'warn' ? '.warn' : '.info'}`, null, f.text));
  return h('div.stack', { style: { gap: '8px' } }, rows);
}

/** Лента с фазите за следващите дни. */
export function cycleCalendar(s, from = today(), n = 35) {
  const days = phasesFrom(s, from, n);
  if (!days.length) return null;
  return h('div', null,
    h('div.cycle-strip', null, days.map(d => h(`div.cycle-cell.ph-${d.phase}${d.date === today() ? '.today' : ''}`, {
      title: `${formatDate(d.date)} · ден ${d.day} · ${d.label}${d.predicted ? ' (прогноза)' : ''}`,
    }, h('span.tiny', null, d.date.slice(8)), h('span.tiny.dim', null, d.day)))),
    h('div.cycle-legend.tiny.muted', null, Object.entries(PHASES).map(([k, ph]) => h('span', null,
      h(`span.cycle-swatch.ph-${k}`), ph.label))));
}

/** Средна дължина, разлика, кървене — с нормите по FIGO. */
function statsList(s) {
  const src = s.lengthSource === 'records' ? `по ${plural(s.lengths.length, 'цикъл', 'цикъла')} от дневника`
    : s.lengthSource === 'entered' ? 'въведена' : 'приета (няма данни)';
  return h('dl.kv', null,
    h('dt', null, 'Дължина на цикъла'), h('dd', null, `${s.length} дни`, h('span.small.dim', null, ` · ${src} · норма 24–38 дни`)),
    s.min !== null ? h('dt', null, 'Най-кратък и най-дълъг') : null,
    s.min !== null ? h('dd', null, `${s.min}–${s.max} дни`,
      s.variation !== null ? h('span.small.dim', null, ` · разлика ${s.variation} дни, норма до ${s.variationLimit} (FIGO)`) : null) : null,
    h('dt', null, 'Менструация'), h('dd', null, `${s.bleed} дни`, h('span.small.dim', null, ' · норма до 8 дни')),
    h('dt', null, 'Контрацепция'), h('dd', null, CONTRACEPTION[s.contraception].label));
}

/* --------------------------------- досие --------------------------------- */

export function cycleTab(ctx) {
  const { p, reload } = ctx;
  const cycle = cleanCycle(p.cycle || {});
  const s = cycleStats(cycle, { age: ageOf(p) });
  const save = async (next, msg = 'Записано.') => {
    try {
      await api.saveCycle(p.id, next);
      toast(msg, 'ok');
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };

  // Нова менструация: дата (днес по подразбиране), дни, обилна.
  const start = input({ type: 'date', value: today(), max: today() });
  const days = numberInput({ min: 1, max: 20, placeholder: 'дни', style: { width: '80px' } });
  const heavy = h('input', { type: 'checkbox' });
  const add = async () => {
    if (!start.value) { toast('Изберете дата.', 'error'); return; }
    if (cycle.periods.some(x => x.start === start.value)) { toast('Тази дата вече е в дневника.', 'error'); return; }
    // Кървене до 2 седмици след друга менструация — вероятно е същата или междуменструално кървене.
    const near = cycle.periods.find(x => Math.abs(daysBetween(x.start, start.value)) < 15);
    if (near && !(await confirmDialog({
      title: 'Близо до друга менструация',
      message: `В дневника има менструация от ${formatDate(near.start)} — на ${plural(Math.abs(daysBetween(near.start, start.value)), 'ден', 'дни')} от тази дата. Кървене между менструациите не е нова менструация и не влиза в дължината на цикъла. Да се запише ли?`,
      confirmLabel: 'Запиши',
    }))) return;
    const d = Number(String(days.value).replace(',', '.'));
    save({ ...cycle, periods: [...cycle.periods, { start: start.value, days: d >= 1 ? d : null, heavy: heavy.checked }] }, 'Менструацията е записана.');
  };

  const rows = [...cycle.periods].reverse();
  const log = card('Дневник на менструациите', { icon: '📅', tight: true },
    h('div.row.tight.cycle-add', null,
      field('Първи ден', start), field('Дни на кървене', days),
      h('label.opt', null, heavy, h('span', null, 'обилна')),
      h('button.btn.sm.primary', { type: 'button', onclick: add }, '+ Добави')),
    rows.length ? h('div.table-wrap', null, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Начало'), h('th', null, 'Кървене'), h('th', null, 'Цикъл'), h('th'))),
      h('tbody', null, rows.map((x, i) => {
        const next = rows[i - 1];
        const len = next ? daysBetween(x.start, next.start) : null;
        return h('tr', null,
          h('td.nowrap', null, formatDate(x.start)),
          h('td', null, x.days ? `${x.days} дни` : '—', x.heavy ? h('span.badge.overdue', { style: { marginLeft: '6px' } }, 'обилна') : null),
          h('td', null, len ? `${len} дни` : h('span.dim', null, next ? '—' : 'текущ')),
          h('td.actions', null, h('button.btn.xs.danger', {
            title: 'Изтрий', onclick: () => deleteWithConfirm(`Записът от ${formatDate(x.start)} ще бъде изтрит.`,
              () => api.saveCycle(p.id, { ...cycle, periods: cycle.periods.filter(y => y.start !== x.start) }), reload),
          }, '✕')));
      })))) : h('p.small.muted', null, 'Добавете първия ден на поне две поредни менструации — дължината на цикъла се изчислява от тях.'));

  // Настройки: обичайна дължина и кървене (ако няма дневник), контрацепция, менопауза, бележка.
  const length = numberInput({ min: 15, max: 90, value: cycle.length ?? '', placeholder: String(DEFAULT_LENGTH) });
  const bleed = numberInput({ min: 1, max: 15, value: cycle.bleed ?? '', placeholder: String(DEFAULT_BLEED) });
  const contraception = select(Object.entries(CONTRACEPTION).map(([k, x]) => ({ value: k, label: x.label, selected: cycle.contraception === k })));
  const menopause = h('input', { type: 'checkbox', checked: cycle.menopause });
  const note = input({ value: cycle.note, maxlength: 500, placeholder: 'по желание' });
  const settings = card('Настройки', { icon: '⚙' },
    h('div.form-grid', null,
      h('div', null, field('Обичайна дължина на цикъла (дни)', length, 'Когато в дневника има по-малко от 2 цикъла.')),
      h('div', null, field('Обичайна менструация (дни)', bleed)),
      h('div', null, field('Контрацепция', contraception))),
    h('div.q-opts', { style: { margin: '10px 0' } }, h('label.opt', null, menopause, h('span', null, 'менопауза — без фази на цикъла'))),
    field('Бележка', note),
    h('div', { style: { marginTop: '10px' } }, h('button.btn.sm.primary', {
      type: 'button',
      onclick: () => save({
        ...cycle,
        length: String(length.value).trim() ? Number(String(length.value).replace(',', '.')) : null,
        bleed: String(bleed.value).trim() ? Number(String(bleed.value).replace(',', '.')) : null,
        contraception: contraception.value, menopause: menopause.checked, note: note.value,
      }),
    }, 'Запази')));

  return h('div.stack', null,
    card('Менструален цикъл', { icon: '🩸' },
      cycleStatus(s),
      s.lastStart && !s.menopause ? h('div', { style: { marginTop: '12px' } }, statsList(s)) : null,
      h('div', { style: { marginTop: '12px' } }, cycleCalendar(s)),
      h('p.tiny.muted', { style: { margin: '10px 0 0' } },
        'Овулацията е около 14 дни преди следващата менструация; прогнозата е ориентировъчна и не е метод за контрацепция. '
        + 'Норми по FIGO AUB System 1 (2018); липса на менструация над 3 месеца при редовен цикъл или над 6 при нередовен — вторична аменорея (ASRM 2024). '
        + 'Менюто по фазите — в раздел „Хранене“.')),
    log,
    settings);
}

/** Брой бележки за раздела в досието (нередовен цикъл, закъснение и т.н.). */
export function cycleTabCount(p) {
  if (p.sex !== 'f' || !p.cycle) return 0;
  return cycleStats(p.cycle, { age: ageOf(p) }).flags.filter(f => f.level === 'warn').length;
}

/* ------------------------- във формата на режима ------------------------- */

/**
 * Полетата за цикъла във формата на режима: менюто да следва фазите, първи ден на
 * последната менструация, дължина, кървене, контрацепция. cycle — записаният цикъл.
 */
export function cycleFields({ cycle = null, last = {}, age = null, hint = '' } = {}) {
  const s = cycleStats(cleanCycle(cycle || {}), { age });
  const sync = h('input', { type: 'checkbox', name: 'cycleSync', checked: last.cycleSync ?? !!s.lastStart });
  const prev = last.cycle?.lastPeriod || '';
  const lastPeriod = input({ type: 'date', max: today(), value: (prev > (s.lastStart || '') ? prev : s.lastStart) || '' });
  const length = numberInput({ min: 15, max: 90, value: last.cycle?.length ?? (s.lengthSource !== 'default' ? s.length : ''), placeholder: String(DEFAULT_LENGTH) });
  const bleed = numberInput({ min: 1, max: 15, value: last.cycle?.bleed ?? (cycle?.bleed || ''), placeholder: String(DEFAULT_BLEED) });
  const contraception = select(Object.entries(CONTRACEPTION).map(([k, x]) => ({ value: k, label: x.label, selected: (last.cycle?.contraception || s.contraception) === k })));
  const startDate = input({ type: 'date', min: today(), max: addDays(today(), 62), value: last.startDate > today() ? last.startDate : today() });
  const box = h('div.cycle-fields');
  const toggle = () => { box.style.display = sync.checked ? '' : 'none'; };
  sync.addEventListener('change', toggle);
  mount(box,
    h('div.form-grid', null,
      h('div', null, field('Първи ден на последната менструация', lastPeriod)),
      h('div', null, field('Дължина на цикъла (дни)', length, s.lengthSource === 'records' ? `от дневника: ${s.length} дни` : 'обикновено 24–38')),
      h('div', null, field('Менструация (дни)', bleed)),
      h('div', null, field('Контрацепция', contraception)),
      h('div', null, field('Меню от дата', startDate, 'Фазите се изчисляват за дните на менюто.'))),
    s.flags.length ? h('div.stack', { style: { gap: '6px', marginTop: '8px' } }, s.flags.map(f => h(`div.alert-strip${f.level === 'warn' ? '.warn' : '.info'}`, null, f.text))) : null,
    hint ? h('div.field-hint', null, hint) : null);
  toggle();
  const el = h('div.nut-section', null,
    h('div.nut-sec-title', null, 'Менструален цикъл'),
    h('div.q-opts', null, h('label.opt', null, sync, h('span', null, 'менюто да следва фазите на цикъла (cycle sync)'))),
    box);
  return {
    el,
    read: () => ({
      cycleSync: sync.checked,
      startDate: sync.checked && startDate.value && startDate.value !== today() ? startDate.value : '',
      cycle: sync.checked ? {
        lastPeriod: lastPeriod.value || '',
        length: String(length.value).trim() ? Number(String(length.value).replace(',', '.')) : null,
        bleed: String(bleed.value).trim() ? Number(String(bleed.value).replace(',', '.')) : null,
        contraception: contraception.value,
      } : undefined,
    }),
  };
}

/* ----------------------------- в изготвения режим ----------------------------- */

/** Етикет на фазата за ден от менюто. */
export function phaseChip(c) {
  if (!c) return null;
  return h(`span.cycle-chip.ph-${c.phase}`, { title: c.predicted ? 'прогноза' : '' },
    `${c.icon} ден ${c.day} · ${c.label}${c.kcalAdd ? ` · ${c.kcalAdd > 0 ? '+' : '−'}${Math.abs(c.kcalAdd)} kcal` : ''}`);
}

/** Блокът „Цикъл и хранене“ в режима. */
export function cyclePlanBlock(plan) {
  const c = plan.cycle;
  if (!c) return null;
  if (!c.applied) {
    return h('div.nut-list.cycle', null, h('h3', null, 'Цикъл и хранене'), h('p.small', null, c.reason));
  }
  const s = c.stats;
  return h('div.nut-list.cycle', null,
    h('h3', null, 'Цикъл и хранене'),
    h('p.small', { style: { margin: '0 0 6px' } },
      `Последна менструация ${formatDate(s.lastStart)} · цикъл ${s.length} дни · менструация ${s.bleed} дни`
      + (s.nextStart ? ` · следваща около ${formatDate(s.nextStart)}` : ''),
      h('br'), `Енергия: в лутеалната фаза +${c.kcalUp} kcal, в останалите дни −${c.kcalDown} kcal — средно за цикъла същата.`),
    plan.week ? null : h('p.small', { style: { margin: '0 0 6px' } }, 'Менюто е за ', phaseChip(c.days[0]), '.'),
    h('ul', null, c.evidence.map(t => h('li.small', null, t))),
    c.notes.length ? h('ul', null, c.notes.map(t => h('li.small', null, t))) : null,
    h('p.tiny.muted', { style: { margin: '6px 0 0' } }, c.notIncluded));
}
