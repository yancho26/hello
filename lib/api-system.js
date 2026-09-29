/* Проверка на сигурността и на компютъра — показва се в „Настройки“.
 *
 * Събира на едно място неща, които иначе се откриват едва когато нещо се
 * обърка: включен ли е ПИН, кой може да се свърже по мрежата, има ли външно
 * копие, достатъчно ли е мястото на диска, верен ли е часовникът, не пречи ли
 * друга програма (зает порт, синхронизирана папка, антивирус) и цял ли е
 * журналът на действията. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* По-ранна дата на компютъра означава спрял или сбъркан часовник (например
 * изтощена батерия на дънната платка) — сроковете в програмата биха били грешни. */
const EARLIEST_PLAUSIBLE = '2026-09-01';
const SYNC_FOLDER = /onedrive|dropbox|google ?drive|googledrive|icloud|yandex\.?disk|pcloud|mega/i;
const GB = 1024 ** 3;

const item = (group, level, title, detail = '') => ({ group, level, title, detail });
const gb = (bytes) => (bytes / GB).toFixed(bytes < 10 * GB ? 1 : 0).replace('.', ',') + ' GB';

function diskFree(dir) {
  try {
    const st = fs.statfsSync(dir);
    return st.bavail * st.bsize;
  } catch {
    return null;
  }
}

function canWrite(dir) {
  const probe = path.join(dir, `.write-test-${process.pid}`);
  try {
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return null;
  } catch (err) {
    return err.message;
  }
}

function latestBackup(dir) {
  try {
    const files = fs.readdirSync(dir).filter(f => /^practice-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    return { count: files.length, last: files.length ? files.at(-1).slice(9, 19) : null };
  } catch {
    return { count: 0, last: null };
  }
}

export function systemCheck(store, server = {}, { isLocal = false, install = store } = {}) {
  const items = [];
  const st = store.settings;
  const active = store.doctors.filter(d => d.active !== false);
  const noPin = active.filter(d => !d.pin).map(d => d.name);
  // Достъпът по мрежата е общ за инсталацията (и за двете практики).
  const network = install.settings.network || 'lan';
  const localOnly = network === 'local' || server.host === '127.0.0.1';

  /* ------------------------------ сигурност ------------------------------ */

  const license = store.license?.info();
  if (license?.active) {
    items.push(item('security', 'ok', `DocUp е активиран (${license.key})`,
      license.activatedAt ? `от ${license.activatedAt.slice(0, 10)}${license.activatedBy ? `, ${license.activatedBy}` : ''}` : ''));
  }

  if (!st.requireLogin || !active.some(d => d.pin)) {
    items.push(localOnly
      ? item('security', 'warn', 'Програмата се отваря без ПИН',
        'Всеки, който седне на този компютър, вижда данните. Задайте ПИН в „Потребители“ и включете входа с ПИН.')
      : item('security', 'bad', 'Без ПИН и с достъп от мрежата',
        'Всеки компютър във вътрешната мрежа може да отвори данните на пациентите. Задайте ПИН на всеки потребител или ограничете достъпа до „Само този компютър“.'));
  } else if (noPin.length) {
    items.push(item('security', 'warn', `Потребители без ПИН: ${noPin.join(', ')}`,
      'Всеки може да влезе като тях без парола.'));
  } else {
    items.push(item('security', 'ok', 'Вход с ПИН за всички потребители'));
  }

  if (st.requireLogin && !Number(st.autoLogoutMinutes)) {
    items.push(item('security', 'warn', 'Автоматичното излизане е изключено',
      'Оставен без надзор компютър остава влязъл. Препоръчително е 10 или 15 минути.'));
  } else if (st.requireLogin) {
    items.push(item('security', 'ok', `Автоматично излизане след ${st.autoLogoutMinutes} мин. бездействие`));
  }

  if (network === 'any') {
    items.push(item('security', 'bad', 'Достъп от всякакви адреси, включително от интернет',
      'Подходящо е само зад защитена връзка (VPN). За работа в кабинета изберете „Вътрешната мрежа“.'));
  } else if (localOnly) {
    items.push(item('security', 'ok', 'Достъп само от този компютър'));
  } else {
    const addrs = server.addresses || [];
    items.push(item('security', 'ok', 'Достъп само от вътрешната мрежа на кабинета',
      addrs.length ? `Другите компютри отварят: ${addrs.join(', ')}` : ''));
  }
  const hosts = install.settings.allowedHosts || [];
  if (hosts.length) {
    items.push(item('security', 'info', `Допълнително разрешени адреси: ${hosts.join(', ')}`));
  }

  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const failed = store.readAudit(3000).filter(e => e.action === 'login_failed' && e.ts >= dayAgo);
  const locked = store.loginGuard ? store.loginGuard.locked() : [];
  if (locked.length) {
    const names = locked.map(l => store.doctor(l.doctorId)?.name || l.doctorId);
    items.push(item('security', 'warn', `Временно заключен вход: ${names.join(', ')}`,
      'След няколко грешни ПИН-а входът изчаква. Ако не сте били вие, сменете ПИН-а.'));
  } else if (failed.length >= 10) {
    items.push(item('security', 'warn', `${failed.length} неуспешни опита за вход през последното денонощие`,
      'Проверете журнала — от кои адреси идват опитите.'));
  } else {
    items.push(item('security', 'ok', failed.length
      ? `Неуспешни опити за вход за денонощие: ${failed.length}` : 'Няма неуспешни опити за вход за денонощие'));
  }

  const audit = store.verifyAudit();
  if (!audit.ok) {
    items.push(item('security', 'bad', `Журналът на действията е променян (ред ${audit.brokenAt})`,
      'Ред е изтрит или редактиран извън програмата. Запазете копие на audit.log и проверете кой има достъп до папката с данните.'));
  } else if (audit.total) {
    items.push(item('security', 'ok', 'Журналът на действията е цял', audit.verified
      ? `${audit.verified} защитени записа${audit.legacy ? ` и ${audit.legacy} от по-стари версии` : ''}.`
      : `${audit.legacy} записа от по-стари версии; всеки нов запис се защитава с отпечатък.`));
  } else {
    items.push(item('security', 'ok', 'Журналът на действията е празен и защитен от промени'));
  }

  /* ----------------------------- копия на данните ----------------------------- */

  const extra = store.extraStatus;
  if (!st.extraBackupDir) {
    items.push(item('data', 'warn', 'Няма външно копие',
      'При повреда на диска или кражба на компютъра данните се губят. Задайте флашка, втори диск или мрежова папка в „Данни и копия“.'));
  } else if (extra && !extra.ok) {
    items.push(item('data', 'bad', 'Последното външно копие е неуспешно', extra.error || ''));
  } else if (extra?.at && Date.now() - Date.parse(extra.at) > 7 * 86400000) {
    items.push(item('data', 'warn', 'Външното копие е по-старо от седмица', `Последно: ${extra.at.slice(0, 10)}`));
  } else {
    items.push(item('data', 'ok', 'Външното копие е актуално', extra?.at ? `Последно: ${extra.at.slice(0, 16).replace('T', ' ')}` : ''));
  }

  const backups = latestBackup(store.backupDir);
  items.push(backups.count
    ? item('data', 'ok', `Дневни копия на този компютър: ${backups.count}`, `Последно: ${backups.last}`)
    : item('data', 'info', 'Още няма дневни копия', 'Първото се прави при първата промяна за деня.'));

  if (store.lastWriteError) {
    items.push(item('data', 'bad', 'Последният запис на данните е неуспешен',
      `${store.lastWriteError.message}. Често причината е антивирус или програма за синхронизиране, която държи файла.`));
  }
  if ((store.repairs || []).length) {
    items.push(item('data', 'warn', 'При зареждане бяха поправени неправилни данни', store.repairs.join('; ')));
  }

  /* -------------------------------- компютър -------------------------------- */

  if (server.portNote) {
    items.push(item('computer', 'info', server.portNote));
  } else if (server.port) {
    items.push(item('computer', 'ok', `Програмата работи на порт ${server.port}`));
  }

  const free = diskFree(store.dir);
  if (free !== null) {
    if (free < 300 * 1024 ** 2) {
      items.push(item('computer', 'bad', `Място на диска: ${gb(free)}`, 'Освободете място — при запълнен диск данните не могат да се запишат.'));
    } else if (free < 2 * GB) {
      items.push(item('computer', 'warn', `Място на диска: ${gb(free)}`, 'Малко свободно място.'));
    } else {
      items.push(item('computer', 'ok', `Свободно място на диска: ${gb(free)}`));
    }
  }

  const writeError = canWrite(store.dir);
  items.push(writeError
    ? item('computer', 'bad', 'Папката с данните не позволява запис', writeError)
    : item('computer', 'ok', 'Папката с данните позволява запис', isLocal ? store.dir : ''));

  if (SYNC_FOLDER.test(store.dir)) {
    items.push(item('computer', 'warn', 'Данните са в синхронизирана папка (OneDrive, Dropbox…)',
      'Синхронизирането може да заключва файла по време на запис или да създава конфликтни копия. По-сигурно е данните да са в C:\\ProgramData, а синхронизираната папка да се ползва за външно копие.'));
  }

  const now = new Date().toISOString();
  if (now.slice(0, 10) < EARLIEST_PLAUSIBLE) {
    items.push(item('computer', 'bad', `Часовникът на компютъра показва ${now.slice(0, 10)}`,
      'Датата е грешна — сроковете за имунизации и прегледи ще са неверни. Поправете датата в Windows.'));
  }

  for (const note of server.envNotes || []) items.push(item('computer', 'info', note));

  const mem = process.memoryUsage().rss;
  items.push(item('computer', 'info', `Работи от ${formatUptime(process.uptime())}`,
    `${os.type()} ${os.release()} · Node.js ${process.versions.node} · памет ${Math.round(mem / 1024 ** 2)} MB`));

  return {
    checkedAt: now,
    serverTime: now,
    network,
    allowedHosts: hosts,
    canChangeNetwork: isLocal,
    items,
  };
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 48) return `${Math.floor(h / 24)} дни`;
  if (h) return `${h} ч. ${m} мин.`;
  return `${m} мин.`;
}

export const systemRoutes = {
  'GET /api/system/check': (ctx) => systemCheck(ctx.store, ctx.server ? ctx.server() : {}, { isLocal: ctx.isLocal(), install: ctx.install || ctx.store }),
};
