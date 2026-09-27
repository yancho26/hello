/* „Какво е новото“ — показва се веднъж на всеки компютър след обновяване. */

import { h, modal } from './ui/components.js';

export const CHANGES = [
  {
    version: '1.1.0',
    items: [
      ['⏻', 'Бутон за спиране на програмата', 'в горния десен ъгъл, в менюто с името ви и в „Настройки → Данни и копия“. Вижда се само на компютъра, на който работи програмата.'],
      ['🔌', 'Загубена връзка', 'ако програмата спре или мрежата прекъсне, долу се появява съобщение и връзката се възстановява сама.'],
      ['📋', 'Минали имунизации наведнъж', 'за дете от друга практика — всички ваксини от паспорта с техните дати в един прозорец (раздел „Имунизации“).'],
      ['🗄️', 'Външно копие', 'автоматично копие на данните на флашка или мрежова папка, всеки час при промени и при спиране.'],
      ['🔒', 'Автоматично излизане', 'при бездействие, по избор в „Настройки → Практика“.'],
      ['🛡️', 'По-сигурни прозорци', 'прозорец с попълнени данни не се затваря от случаен клик извън него.'],
      ['✨', 'По-подреден вид', 'досието е в две колони, търсенето и таблиците са изчистени, а Таблото и Справките броят просрочията еднакво.'],
    ],
  },
  {
    version: '1.0.0',
    items: [
      ['🪟', 'Инсталатор за Windows', 'програмата се инсталира като обикновено приложение и работи във фонов режим.'],
    ],
  },
];

const KEY = 'dk.whatsNewSeen';

function compare(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

/** Прозорецът с промените: от `since` (без нея) до текущата или всички. */
export function whatsNew({ all = false, since = null } = {}) {
  const list = CHANGES.filter(c => all || !since || compare(c.version, since) > 0);
  modal({
    title: all ? 'Промени по версии' : `Какво е новото във версия ${CHANGES[0].version}`,
    body: h('div.stack', null, list.map(c => h('div', null,
      all || list.length > 1 ? h('h3.whats-new-version', null, `Версия ${c.version}`) : null,
      h('ul.whats-new', null, c.items.map(([icon, title, text]) =>
        h('li', null, h('span.wn-icon', null, icon),
          h('div', null, h('strong', null, title), ' — ', text))))))),
    actions: (close) => [h('button.btn.primary', { onclick: () => close() }, 'Разбрах')],
  });
}

/** След обновяване: показва промените веднъж на този компютър. */
export function maybeShowWhatsNew(server) {
  if (!server || !server.version || !server.previousVersion) return;
  let seen = null;
  try { seen = localStorage.getItem(KEY); } catch { /* браузърът не пази */ }
  if (seen === server.version) return;
  try { localStorage.setItem(KEY, server.version); } catch { /* пак ще се покаже следващия път */ }
  if (compare(server.version, server.previousVersion) <= 0) return;
  whatsNew({ since: server.previousVersion });
}
