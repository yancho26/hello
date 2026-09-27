/* Автоматично излизане при бездействие.
 *
 * Минута преди излизането се показва предупреждение; всяко движение на
 * мишката или натискане на клавиш го отменя. Докато някой работи, сесията
 * на сървъра се подновява на всеки две минути, за да не изтече, докато се
 * попълва дълъг формуляр.
 */

import { api } from './api.js';
import { h } from './ui/dom.js';

const EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'];
const HEARTBEAT_MS = 2 * 60 * 1000;

export function startIdleLogout(minutes) {
  if (!minutes) return;
  const limit = minutes * 60 * 1000;
  const warnBefore = Math.min(60 * 1000, limit / 2);
  let last = Date.now();
  let lastBeat = Date.now();
  let warning = null;
  let countdown = null;

  const hideWarning = () => {
    warning?.remove();
    warning = null;
    clearInterval(countdown);
  };

  const activity = () => {
    last = Date.now();
    if (warning) hideWarning();
    if (Date.now() - lastBeat > HEARTBEAT_MS) {
      lastBeat = Date.now();
      api.state().catch(() => {});
    }
  };
  for (const ev of EVENTS) window.addEventListener(ev, activity, { passive: true, capture: true });

  const logout = async () => {
    try { await api.logout(); } catch { /* сесията вече е изтекла */ }
    location.reload();
  };

  setInterval(() => {
    const idle = Date.now() - last;
    if (idle >= limit) {
      logout();
    } else if (idle >= limit - warnBefore && !warning) {
      const secs = h('strong', null, '');
      const tick = () => { secs.textContent = String(Math.max(0, Math.ceil((limit - (Date.now() - last)) / 1000))); };
      tick();
      countdown = setInterval(tick, 1000);
      warning = h('div.idle-warning', { role: 'alert' },
        h('div', null, 'Поради бездействие ще излезете от програмата след ', secs, ' секунди.'),
        h('div.small', null, 'Преместете мишката или натиснете клавиш, за да продължите.'));
      document.body.appendChild(warning);
    }
  }, 1000);
}
