/* Тренировки в хранителния режим: полетата във формата и тренировъчният план за 4 седмици,
 * синхронизиран с менюто и с менструалния цикъл (версия 4.7). */

import { card, field, h, mount, select } from '../ui/components.js';
import { formatDate } from '../shared/dates.js';
import {
  ACTIVITIES, INTENSITY, SESSION_MINUTES, TRAINING_FOCUS, TRAINING_LEVELS, TRAINING_TIMES,
} from '../shared/training.js';

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
      h('div', null, field('Цел на тренировките', focus))),
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
    } : null),
  };
}

/* ------------------------------------ в режима ------------------------------------ */

/** Кратко: „🏋 55 мин · 🚶 20 мин“ — за деня от менюто. */
export function trainingChip(t) {
  if (!t || !t.sessions.length && !t.addOns.length) return null;
  const parts = t.sessions.map(s => `${s.icon} ${s.minutes} мин`);
  if (t.addOns.includes('strength')) parts.push('сила 15 мин');
  if (t.addOns.includes('balance')) parts.push('баланс 10 мин');
  return h('span.train-chip', { title: t.sessions.map(s => `${s.label}, ${INTENSITY[s.intensity].label}`).join('; ') }, parts.join(' · '));
}

/** Съветите за храненето около тренировката в деня от менюто. */
export function trainingTips(t) {
  if (!t || !t.tips.length) return null;
  return h('div.train-tips.small', null, '🏃 ', t.tips.join(' '));
}

const sessionLine = (s, hr, rpeOnly) => {
  const it = INTENSITY[s.intensity];
  // Пулсът е ориентир само за аеробните тренировки; при силовите и пилатеса — усещането.
  const aerobicRole = ['cardio', 'mixed', 'sport'].includes(ACTIVITIES[s.activity]?.role);
  const pulse = !rpeOnly && hr && aerobicRole && s.intensity !== 'light' ? `, пулс ${hr[s.intensity].join('–')}` : '';
  return `${s.label[0].toUpperCase()}${s.label.slice(1)} · ${s.minutes} мин · ${it.label} (RPE ${it.rpe}${pulse})${s.time ? ` · ${s.time}` : ''}${s.long ? ' · дълга' : ''}`;
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
      h('summary', null, h('strong', null, `Седмица ${wk.week}`), h('span.small.dim', null, ` ${formatDate(wk.from)} – ${formatDate(wk.to)}`),
        h('span.grow'), h('span.small.muted', null, `аеробни ${wk.aerobic} мин · силови ${wk.strength} · общо ${wk.minutes} мин · ≈${wk.kcal} kcal`)),
      h('div.train-days', null, days.map(d => h('div.train-day' + (d.sessions.length ? '' : '.rest'), null,
        h('div.train-day-head', null, h('strong', null, d.label), h('span.small.dim', null, ` ${formatDate(d.date)}`),
          d.cycle ? h(`span.cycle-chip.ph-${d.cycle.phase}`, null, `${d.cycle.icon} ден ${d.cycle.day}`) : null),
        d.sessions.length ? d.sessions.map(s => h('details.train-session', null,
          h('summary', null, `${s.icon} `, sessionLine(s, t.hr, t.rpeOnly), s.extra ? h('span.tiny.dim', null, ' · ежедневно движение') : null),
          h('ul.small', null, s.blocks.map(b => h('li', null, h('strong', null, b.name + ': '), b.text)))))
          : h('div.small.dim', null, 'Почивка или леко движение.'),
        d.addOns.length ? h('ul.small.train-addons', null, d.addOns.map(a => h('li', null, a.text))) : null,
        d.cycle ? h('div.tiny.muted', null, d.cycle.text) : null))));
  };
  return card('Тренировъчен план за 4 седмици', { icon: '🏃' },
    t.warnings.length ? h('div.stack', { style: { gap: '6px', marginBottom: '12px' } }, t.warnings.map(w => h('div.alert-strip.warn', null, w))) : null,
    h('div.tiles', null,
      tile('Аеробни', w1.aerobic, 'мин/седм.', `цел ${t.targets.aerobic}${t.targets.aerobic < t.targets.aerobicMax ? `–${t.targets.aerobicMax}` : ''} (СЗО); интензивните се броят двойно`),
      tile('Силови', w1.strength, 'дни/седм.', `цел поне ${t.targets.strengthDays} (СЗО)`),
      t.targets.balanceDays ? tile('Баланс', t.targets.balanceDays === 7 ? 'всеки ден' : `${t.targets.balanceDays}`, t.targets.balanceDays === 7 ? '' : 'дни/седм.', 'СЗО, Too Fit To Fracture') : null,
      tile('Тренировки', t.input.daysPerWeek, '× седм.', `по ${t.input.minutes} мин · ${TRAINING_LEVELS[t.input.level].split(' — ')[0]}`),
      tile('Разход', w1.kcal, 'kcal/седм.', 'над покоя, по Compendium 2024'),
      t.hr ? tile('Пулс', `${t.hr.moderate[0]}–${t.hr.moderate[1]}`, '/мин', `умерено; интензивно ${t.hr.vigorous[0]}–${t.hr.vigorous[1]}; макс. ≈${t.hr.max}`)
        : tile('Пулс', '—', '', 'бета-блокер: водете се по RPE')),
    h('p.small.muted', { style: { margin: '8px 0 0' } },
      Object.values(INTENSITY).map(i => `${i.label[0].toUpperCase()}${i.label.slice(1)}: RPE ${i.rpe} от 10, ${i.talk}`).join('. ') + '.'),
    h('div.nut-cols', null,
      list('Кога да тренирате', t.timeAdvice),
      list('Цикъл и тренировки', t.cycle),
      list('Бележки', t.notes)),
    h('div.stack', { style: { marginTop: '10px' } }, t.weeks.map(weekView)),
    h('p.tiny.muted', { style: { margin: '10px 0 0' } },
      'Цели по СЗО 2020; интензивност по 2024 Adult Compendium of Physical Activities; силови по ACSM; при заболявания — по насоката, посочена до всяка бележка. '
      + 'Обемът расте постепенно, 4-тата седмица е по-лека. Менюто дава повече енергия в дните с повече тренировка и по-малко в почивните.'));
}
