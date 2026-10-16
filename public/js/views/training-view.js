/* Тренировки в хранителния режим: полетата във формата и тренировъчният план за 4 седмици,
 * синхронизиран с менюто и с менструалния цикъл (версия 4.7). */

import { card, field, h, mount, numberInput, select } from '../ui/components.js';
import { formatDate } from '../shared/dates.js';
import {
  ACTIVITIES, HOME_EQUIPMENT, INTENSITY, SESSION_MINUTES, TRAINING_FOCUS, TRAINING_LEVELS, TRAINING_TIMES,
} from '../shared/training.js';
import { ui } from '../shared/i18n/plan-en.js';

const LEVEL_BY_ACTIVITY = { sedentary: 'beginner', light: 'beginner', moderate: 'intermediate', active: 'advanced', athlete: 'advanced' };
const FOCUS_BY_GOAL = { lose: 'weight', gain: 'muscle', maintain: 'health' };

/**
 * Полетата за тренировките. cfg: last (предишният избор — last.training), activity (нивото на
 * активност от досието), goal, female (показва избора за фазите на цикъла).
 * Връща { el, read, cycleEl }.
 */
export function trainingFields(cfg = {}) {
  const last = cfg.last?.training || null;
  const on = h('input', { type: 'checkbox', name: 'trainingOn', checked: !!last });
  const chosen = new Set(last?.activities || []);
  const boxes = Object.entries(ACTIVITIES).map(([id, a]) => h('label.opt', null,
    h('input', { type: 'checkbox', name: 'trainAct', value: id, checked: chosen.has(id) }), h('span', null, `${a.icon} ${a.label}`)));
  const level = select(Object.entries(TRAINING_LEVELS).map(([k, label]) => ({
    value: k, label, selected: (last?.level || LEVEL_BY_ACTIVITY[cfg.activity] || 'beginner') === k,
  })));
  const days = select([2, 3, 4, 5, 6, 7].map(n => ({ value: n, label: `${n} дни седмично`, selected: (last?.daysPerWeek || 3) === n })));
  const minutes = select(SESSION_MINUTES.map(n => ({ value: n, label: `${n} мин`, selected: (last?.minutes || 45) === n })));
  const time = select(Object.entries(TRAINING_TIMES).map(([k, t]) => ({ value: k, label: t.clock ? `${t.label}, около ${t.clock}` : t.label, selected: (last?.time || 'any') === k })));
  const focus = select(Object.entries(TRAINING_FOCUS).map(([k, label]) => ({
    value: k, label, selected: (last?.focus || FOCUS_BY_GOAL[cfg.goal] || 'health') === k,
  })));
  const pulse = numberInput({ name: 'restingHr', min: 35, max: 120, value: last?.restingHr ?? cfg.pulse ?? '', placeholder: 'по желание' });
  // Уредите у дома (версия 4.15) — домашните и кръговите тренировки ги ползват; без запис — ластик.
  const haveEq = new Set(Array.isArray(last?.equipment) ? last.equipment : ['band']);
  const eqBoxes = Object.entries(HOME_EQUIPMENT).map(([id, label]) => h('label.opt', null,
    h('input', { type: 'checkbox', name: 'trainEq', value: id, checked: haveEq.has(id) }), h('span', null, label)));
  const periodize = h('input', { type: 'checkbox', checked: !!last?.cyclePeriodize });
  const cycleEl = h('div.q-opts', { style: { marginTop: '8px' } }, h('label.opt', null, periodize,
    h('span', null, 'по-интензивните тренировки — във фоликуларната фаза (ограничени и противоречиви доказателства; само ако менюто следва цикъла)')));
  if (!cfg.female) cycleEl.style.display = 'none';
  const box = h('div.training-fields');
  mount(box,
    h('div.field-hint', null, 'Изберете всички тренировки, които човекът прави или иска да прави. Планът ги разпределя по дни за 4 седмици, с постепенно натоварване.'),
    h('div.q-opts.train-acts', null, boxes),
    h('div.form-grid', { style: { marginTop: '10px' } },
      h('div', null, field('Ниво', level)),
      h('div', null, field('Колко дни', days)),
      h('div', null, field('Една тренировка', minutes)),
      h('div', null, field('Кога', time)),
      h('div', null, field('Цел на тренировките', focus)),
      h('div', null, field('Пулс в покой (/мин)', pulse, 'сутрин, седнал — пулсът за тренировките се смята по резерва'))),
    h('div.field-hint', { style: { marginTop: '10px' } }, 'Уреди у дома — упражненията у дома и кръговите тренировки се подбират според тях (стол, стена и стъпало има винаги):'),
    h('div.q-opts.train-eq', null, eqBoxes),
    cycleEl);
  const toggle = () => { box.style.display = on.checked ? '' : 'none'; };
  on.addEventListener('change', toggle);
  toggle();
  const el = h('div.nut-section', null,
    h('div.nut-sec-title', null, 'Тренировки'),
    h('div.q-opts', null, h('label.opt', null, on, h('span', null, 'тренировъчен план, синхронизиран с менюто и с цикъла'))),
    box);
  return {
    el,
    cycleEl,
    read: () => (on.checked ? {
      activities: boxes.map(l => l.querySelector('input')).filter(i => i.checked).map(i => i.value),
      level: level.value, daysPerWeek: Number(days.value), minutes: Number(minutes.value), time: time.value, focus: focus.value,
      cyclePeriodize: cycleEl.style.display !== 'none' && periodize.checked,
      restingHr: Math.round(Number(String(pulse.value).replace(',', '.'))) || null,
      equipment: eqBoxes.map(l => l.querySelector('input')).filter(i => i.checked).map(i => i.value),
    } : null),
  };
}

/* ------------------------------------ в режима ------------------------------------ */

const fdl = (iso) => ui(formatDate(iso));

/** Кратко: „🏋 55 мин · 🚶 20 мин“ — за деня от менюто. */
export function trainingChip(t) {
  if (!t || !t.sessions.length && !t.addOns.length) return null;
  const parts = t.sessions.map(s => `${s.icon} ` + ui(`${s.minutes} мин`));
  if (t.addOns.includes('strength')) parts.push(ui('сила 15 мин'));
  if (t.addOns.includes('balance')) parts.push(ui('баланс 10 мин'));
  if (t.addOns.includes('pelvic')) parts.push(ui('тазово дъно'));
  return h('span.train-chip', { title: t.sessions.map(s => `${s.label}, ${ui(INTENSITY[s.intensity].label)}`).join('; ') }, parts.join(' · '));
}

/** Съветите за храненето около тренировката в деня от менюто. */
export function trainingTips(t) {
  if (!t || !t.tips.length) return null;
  return h('div.train-tips.small', null, '🏃 ', t.tips.join(' '));
}

const upper1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

const sessionLine = (s, hr, rpeOnly) => {
  const it = INTENSITY[s.intensity];
  // Пулсът е ориентир само за аеробните тренировки; при силовите и пилатеса — усещането.
  const aerobicRole = ['cardio', 'mixed', 'sport'].includes(ACTIVITIES[s.activity]?.role);
  const pulse = !rpeOnly && hr && aerobicRole && s.intensity !== 'light' ? ui(`, пулс ${hr[s.intensity].join('–')}`) : '';
  return `${upper1(s.label)} · ` + ui(`${s.minutes} мин`) + ` · ${ui(it.label)} (RPE ${it.rpe}${pulse})${s.time ? ` · ${s.time}` : ''}${s.long ? ui(' · дълга') : ''}`;
};

/** Картата „Тренировъчен план“. */
export function trainingCard(plan) {
  const t = plan.training;
  if (!t) return null;
  const tile = (label, value, unit, sub) => h('div.tile', null, h('div.tiny.dim', null, label),
    h('div.tile-v', null, value, h('span.small.dim', null, ' ' + unit)), sub ? h('div.tiny.dim', null, sub) : null);
  const w1 = t.weeks[1] || t.weeks[0];
  const list = (title, items) => (items?.length ? h('div.nut-list', null, h('h3', null, title), h('ul', null, items.map(x => h('li', null, x)))) : null);
  const weekView = (wk, i) => {
    const days = t.days.filter(d => d.week === i);
    return h('details.week-day.train-week', { open: i === 0 },
      h('summary', null, h('strong', null, ui(`Седмица ${wk.week}`)), h('span.small.dim', null, ` ${fdl(wk.from)} – ${fdl(wk.to)}`),
        h('span.grow'), h('span.small.muted', null, ui(`аеробни ${wk.aerobic} мин · силови ${wk.strength} · общо ${wk.minutes} мин · ≈${wk.kcal} kcal`))),
      h('div.train-days', null, days.map(d => h('div.train-day' + (d.sessions.length ? '' : '.rest'), null,
        h('div.train-day-head', null, h('strong', null, d.label), h('span.small.dim', null, ` ${fdl(d.date)}`),
          d.cycle ? h(`span.cycle-chip.ph-${d.cycle.phase}`, null, `${d.cycle.icon} ` + ui(`ден ${d.cycle.day}`)) : null),
        d.sessions.length ? d.sessions.map(s => h('details.train-session', null,
          h('summary', null, `${s.icon} `, sessionLine(s, t.hr, t.rpeOnly), s.extra ? h('span.tiny.dim', null, ui(' · ежедневно движение')) : null),
          h('ul.small', null, s.blocks.map(b => h('li', null, h('strong', null, b.name + ': '), b.text)))))
          : h('div.small.dim', null, ui('Почивка или леко движение.')),
        d.addOns.length ? h('ul.small.train-addons', null, d.addOns.map(a => h('li', null, a.text))) : null,
        d.cycle ? h('div.tiny.muted', null, d.cycle.text) : null))));
  };
  const steps = t.steps ? `${thousands(t.steps.from)}–${thousands(t.steps.to)}` : null;
  return card(ui('Тренировъчен план за 4 седмици'), { icon: '🏃' },
    t.warnings.length ? h('div.stack', { style: { gap: '6px', marginBottom: '12px' } }, t.warnings.map(w => h('div.alert-strip.warn', null, w))) : null,
    h('div.tiles', null,
      tile(ui('Аеробни'), w1.aerobic, ui('мин/седм.'), ui(`цел ${t.targets.aerobic}${t.targets.aerobic < t.targets.aerobicMax ? `–${t.targets.aerobicMax}` : ''} (СЗО); интензивните се броят двойно`)),
      tile(ui('Силови'), w1.strength, ui('дни/седм.'), t.targets.strengthDays > 2 ? ui(`цел поне ${t.targets.strengthDays} (GLP-1 агонист)`) : ui(`цел поне ${t.targets.strengthDays} (СЗО)`)),
      t.targets.balanceDays ? tile(ui('Баланс'), t.targets.balanceDays === 7 ? ui('всеки ден') : `${t.targets.balanceDays}`, t.targets.balanceDays === 7 ? '' : ui('дни/седм.'), ui('СЗО, Too Fit To Fracture')) : null,
      t.targets.pelvicFloor ? tile(ui('Тазово дъно'), ui('всеки ден'), '', ui('3 × поне 8 стягания (NICE)')) : null,
      tile(ui('Тренировки'), t.input.daysPerWeek, ui('× седм.'), ui(`по ${t.input.minutes} мин · ${TRAINING_LEVELS[t.input.level].split(' — ')[0]}`)),
      steps ? tile(ui('Крачки'), h('span.tile-v-sm', null, steps), ui('/ден'), ui('Paluch 2022, Ding 2025')) : null,
      tile(ui('Разход'), w1.kcal, ui('kcal/седм.'), ui('над покоя, по Compendium 2024')),
      t.hr ? tile(ui('Пулс'), `${t.hr.moderate[0]}–${t.hr.moderate[1]}`, ui('/мин'), t.hr.method === 'reserve'
        ? ui(`умерено; интензивно ${t.hr.vigorous[0]}–${t.hr.vigorous[1]}; по резерва, в покой ${t.hr.rest}`)
        : ui(`умерено; интензивно ${t.hr.vigorous[0]}–${t.hr.vigorous[1]}; макс. ≈${t.hr.max}`))
        : tile(ui('Пулс'), '—', '', ui('бета-блокер: водете се по RPE'))),
    h('p.small.muted', { style: { margin: '8px 0 0' } },
      Object.values(INTENSITY).map(i => `${upper1(ui(i.label))}: ` + ui(`RPE ${i.rpe} от 10, ${i.talk}`)).join('. ') + '.'),
    t.steps ? h('p.small', { style: { margin: '6px 0 0' } }, t.steps.text) : null,
    h('div.nut-cols', null,
      list(ui('Кога да тренирате'), t.timeAdvice),
      list(ui('Цикъл и тренировки'), t.cycle),
      list(ui('Бележки'), t.notes)),
    t.exercises?.length ? h('details.train-howto', null,
      h('summary', null, ui('Как се правят упражненията'), h('span.small.dim', null, ` · ${t.exercises.length}`)),
      h('ul.small', null, t.exercises.map(x => h('li', null, h('strong', null, upper1(x.name) + ': '), x.how)))) : null,
    h('div.stack', { style: { marginTop: '10px' } }, t.weeks.map(weekView)),
    h('p.tiny.muted', { style: { margin: '10px 0 0' } },
      ui('Цели по СЗО 2020; интензивност по 2024 Adult Compendium of Physical Activities; силови по ACSM; при заболявания — по насоката, посочена до всяка бележка. ')
      + ui('Обемът расте постепенно, 4-тата седмица е по-лека. Менюто дава повече енергия в дните с повече тренировка и по-малко в почивните.')));
}
