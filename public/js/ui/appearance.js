/* Изборът на изглед (версия 5.0): тема, плътност на редовете и вид на менюто.
 * Показва се в менюто на потребителя и в „Настройки → Изглед“. Запазва се в браузъра. */

import { h, mount } from './dom.js';
import { icon } from './icons.js';
import { canChooseNav, getPrefs, setPrefs } from './theme.js';

/** Няколко възможности, от които една е избрана. options = [{ value, label, icon }]. */
export function choiceRow(options, current, onPick, label) {
  const row = h('div.choice-row', { role: 'radiogroup', 'aria-label': label });
  const draw = (value) => mount(row, options.map(o =>
    h('button.choice' + (o.value === value ? '.active' : ''), {
      type: 'button', role: 'radio', 'aria-checked': String(o.value === value),
      onclick: () => { onPick(o.value); draw(o.value); },
    }, o.icon ? icon(o.icon, { size: 17 }) : null, o.label)));
  draw(current);
  return row;
}

/** Тема и плътност; с { nav: true } — и видът на страничното меню. */
export function appearanceControls({ nav = false } = {}) {
  const prefs = getPrefs();
  return h('div.stack', null,
    h('div', null,
      h('div.field-lbl', null, 'Тема'),
      choiceRow([
        { value: 'auto', label: 'Като на компютъра', icon: 'monitor' },
        { value: 'light', label: 'Светла', icon: 'sun' },
        { value: 'dark', label: 'Тъмна', icon: 'moon' },
      ], prefs.theme, (theme) => setPrefs({ theme }), 'Тема')),
    h('div', null,
      h('div.field-lbl', null, 'Плътност на редовете'),
      choiceRow([
        { value: 'normal', label: 'Нормална' },
        { value: 'compact', label: 'Сбита — повече на един екран' },
      ], prefs.density, (density) => setPrefs({ density }), 'Плътност на редовете')),
    nav ? h('div', null,
      h('div.field-lbl', null, 'Странично меню'),
      choiceRow([
        { value: 'auto', label: 'Според ширината на екрана' },
        { value: 'full', label: 'Разгънато, с надписи', icon: 'sidebar' },
        { value: 'rail', label: 'Свито до иконки' },
      ], prefs.nav, (value) => setPrefs({ nav: value }), 'Странично меню'),
      canChooseNav() ? null : h('div.field-hint', null, 'На този екран менюто е свито, защото прозорецът е тесен. Изборът важи при по-широк прозорец.')) : null);
}
