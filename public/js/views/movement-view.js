/* Движение, сън и екрани в режима на дете (версия 4.16): целта по СЗО, седмица с игри и спорт,
 * сън по AASM и екрани — общо за досието и за PDF изгледа в браузъра. */

import { card, h } from '../ui/components.js';
import { ui } from '../shared/i18n/plan-en.js';

/* Видът движение — етикет и клас за цвета. */
const KIND = {
  play: { label: 'игра', cls: 'play' },
  mvpa: { label: 'умерено до интензивно', cls: 'mvpa' },
  vigorous: { label: 'интензивно', cls: 'vig' },
  strength: { label: 'мускули и кости', cls: 'str' },
};

/** Картата „Движение, сън и екрани“ — само за режим на дете. */
export function movementCard(plan) {
  const m = plan.child?.movement;
  if (!m) return null;
  const fact = (icon, title, text) => h('div.move-fact', null, h('div.move-fact-icon', null, icon),
    h('div', null, h('div.tiny.dim', null, title), h('div.small', null, text)));
  return card(ui('Движение, сън и екрани'), { icon: '🤸' },
    h('p.small', { style: { marginTop: 0 } }, h('strong', null, ui('Цел: ')), m.goal.text),
    h('div.move-facts', null,
      fact('🏃', ui('Движение'), m.goal.mvpa && m.goal.minutes === 60
        ? ui(`средно поне ${m.goal.minutes} мин дневно`) : ui(`поне ${m.goal.minutes} мин дневно`) + (m.goal.mvpa ? ui(`, от тях ${m.goal.mvpa} енергично`) : '')),
      fact('😴', ui('Сън'), ui(`${m.sleep.hours} часа`) + ` — ${m.sleep.note}`),
      fact('📵', ui('Екрани'), m.screens),
      fact('🪑', ui('Седене'), m.restraint)),
    h('div.move-week', null, m.days.map(d => h('div.move-day', null,
      h('div.move-day-head', null, h('strong', null, d.label), h('span.tiny.dim', null, ui(`${d.minutes} мин`))),
      h('ul', null, d.items.map(x => h('li', { class: 'k-' + (KIND[x.kind]?.cls || 'play') },
        x.icon ? `${x.icon} ` : '', x.label, h('span.tiny.dim', null, ui(` · ${x.minutes} мин`)))))))),
    h('div.move-legend.tiny.dim', null, Object.values(KIND).map(k => h('span', { class: 'k-' + k.cls }, ui(k.label)))),
    m.tips?.length ? h('ul.small', { style: { margin: '10px 0 0', paddingLeft: '18px' } }, m.tips.map(t => h('li', null, t))) : null,
    h('p.tiny.muted', { style: { margin: '8px 0 0' } },
      ui('Движение и екрани — по СЗО 2019 (деца под 5 г.) и СЗО 2020 (5–17 г.); сън — по СЗО 2019 и AASM 2016. Седмицата е пример — дейностите се сменят по желание на детето.')));
}
