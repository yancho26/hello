/* Връзка с програмата: откриване на прекъсване, автоматично възстановяване
 * и екранът след спиране на програмата.
 *
 * Когато сървърът престане да отговаря (спрян е, компютърът е изключен,
 * мрежата е прекъснала), горе се показва лента и на всеки няколко секунди се
 * прави опит за връзка. Щом програмата отговори, лентата изчезва сама.
 */

import { h } from './ui/dom.js';

const RETRY_MS = 3000;
let down = false;
let stopped = false;
let timer = null;
let banner = null;

async function ping() {
  try {
    const res = await fetch('/api/state', { cache: 'no-store', credentials: 'same-origin' });
    return res.ok;
  } catch {
    return false;
  }
}

function showBanner() {
  if (banner) return;
  banner = h('div.conn-banner', { role: 'alert' },
    h('span.conn-dot'),
    h('div', null,
      h('strong', null, 'Няма връзка с програмата. '),
      h('span', null, 'Опитвам отново автоматично… Ако програмата е спряна, стартирайте я от иконата '
        + '„DocUp“ на компютъра, на който е инсталирана.')),
    h('button.btn.sm', { onclick: () => check() }, 'Опитай сега'));
  document.body.appendChild(banner);
  document.body.classList.add('offline');
}

function hideBanner() {
  banner?.remove();
  banner = null;
  document.body.classList.remove('offline');
}

async function check() {
  clearTimeout(timer);
  if (await ping()) {
    markUp();
    return;
  }
  timer = setTimeout(check, RETRY_MS);
}

/** Извиква се от клиента за заявки, когато сървърът не отговаря. */
export function markDown() {
  if (down || stopped) return;
  down = true;
  showBanner();
  timer = setTimeout(check, RETRY_MS);
}

/** Извиква се при успешна заявка. */
export function markUp() {
  if (!down) return;
  down = false;
  clearTimeout(timer);
  hideBanner();
  // Обновяваме изгледа, защото докато е нямало връзка, данните може да са се променили.
  window.dispatchEvent(new Event('hashchange'));
  import('./ui/components.js').then(m => m.toast('Връзката с програмата е възстановена.', 'ok'));
}

export const isStopped = () => stopped;

/** Екранът след спиране от бутона. Щом програмата тръгне отново, страницата се презарежда. */
export function showStoppedScreen() {
  stopped = true;
  clearTimeout(timer);
  hideBanner();
  const screen = h('div.stopped-screen', null,
    h('div.stopped-card', null,
      h('img', { src: '/favicon.svg', alt: '', width: 72, height: 72 }),
      h('h1', null, 'Програмата е спряна'),
      h('p', null, 'Всички данни са записани. Другите компютри в кабинета също нямат достъп, докато програмата не бъде стартирана отново.'),
      h('p', null, 'За да я стартирате, щракнете два пъти върху иконата ',
        h('strong', null, '„DocUp“'), ' на работния плот или я изберете от менюто Старт.'),
      h('p.muted.small', null, 'Можете да затворите този прозорец. Ако стартирате програмата отново, тази страница ще се презареди сама.')));
  document.body.replaceChildren(screen);

  const poll = async () => {
    if (await ping()) location.reload();
    else setTimeout(poll, RETRY_MS);
  };
  setTimeout(poll, RETRY_MS);
}
