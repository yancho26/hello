/* Настройки: практика, потребители, календар, данни, сигурност и журнал. */

import { api } from '../api.js';
import { canStopHere, productKeyField, refreshBootstrap, state, stopProgram } from '../app.js';
import { whatsNew } from '../whats-new.js';
import {
  badge, card, confirmDialog, decimalFields, empty, field, h, input, modal, mount,
  numberInput, select, table, toast,
} from '../ui/components.js';
import { formatDate } from '../shared/dates.js';
import { CALENDAR_VERIFIED, GROUPS } from '../shared/calendar.js';
import { CV_REGIONS } from '../shared/clinical.js';
import { downloadTemplate, openImportDialog } from './import-dialog.js';
import { MODULES } from '../shared/specialty.js';
import { aiSettings } from './assistant-panel.js';
import { FEEDBACK } from '../shared/assistant.js';

let scheduleTrack = 'child';

let tab = 'practice';

const TABS = [
  { id: 'practice', label: 'Практика' },
  { id: 'doctors', label: 'Потребители' },
  { id: 'schedule', label: 'Календар' },
  { id: 'assistant', label: 'Асистент' },
  { id: 'data', label: 'Данни и копия' },
  { id: 'security', label: 'Сигурност' },
  { id: 'audit', label: 'Журнал' },
];

export async function renderSettings(host) {
  const rerender = () => renderSettings(host);
  // Календарът за имунизации и профилактика е на практиката на ОПЛ.
  const tabs = TABS.filter(t => state.kind !== 'simp' || t.id !== 'schedule');
  if (!tabs.some(t => t.id === tab)) tab = 'practice';
  const bar = h('div.tabs.no-print', null, tabs.map(t =>
    h('button' + (tab === t.id ? '.active' : ''), {
      onclick: () => { tab = t.id; rerender(); },
    }, t.label)));

  mount(host,
    h('div.page-head', null, h('div.titles', null,
      h('h1', null, 'Настройки'),
      h('div.muted.small', null, state.practice.name))),
    bar,
    h('div#settingsBody'));

  const body = document.getElementById('settingsBody');
  const views = {
    practice: practiceTab, doctors: doctorsTab, schedule: scheduleTab, assistant: assistantTab,
    data: dataTab, security: securityTab, audit: auditTab,
  };
  mount(body, await views[tab](rerender));
}

/* -------------------------------- практика ----------------------------------- */

async function practiceTab(rerender) {
  let form;
  const save = async () => {
    const d = Object.fromEntries(new FormData(form));
    try {
      await api.updateSettings({
        practice: { name: d.name, address: d.address, phone: d.phone, ...(state.kind === 'simp' ? { rzi: d.rzi } : {}) },
        horizonDays: d.horizonDays,
        requireLogin: d.requireLogin === 'on',
        autoLogoutMinutes: Number(d.autoLogoutMinutes || 0),
        cvRegion: d.cvRegion,
      });
      await refreshBootstrap();
      toast('Настройките са запазени.', 'ok');
      rerender();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); save(); } },
    h('div.full', null, field('Име на практиката', input({ name: 'name', value: state.practice.name, required: true }))),
    state.kind === 'simp' ? h('div', null, field('Регистрационен номер в РЗИ', input({ name: 'rzi', value: state.practice.rzi || '', inputmode: 'numeric', maxlength: 10 }),
      'Печата се на амбулаторния лист.')) : null,
    h('div', null, field('Телефон', input({ name: 'phone', value: state.practice.phone || '' }))),
    h('div', null, field('Адрес', input({ name: 'address', value: state.practice.address || '' }))),
    h('div', null, field('Хоризонт за „предстоящи“',
      input({ name: 'horizonDays', type: 'number', min: 1, max: 365, value: state.settings.horizonDays }),
      'На колко дни напред таблото показва предстоящите дейности.')),
    h('div.full', null, h('label.check', null,
      h('input', { type: 'checkbox', name: 'requireLogin', checked: state.settings.requireLogin !== false }),
      h('span', null, h('strong', null, 'Изискване на вход с ПИН'),
        h('div.tiny.dim', null,
          'Препоръчително, когато компютърът се ползва от повече хора. '
          + 'Вписването отбелязва кой е направил всяка промяна в журнала.')))),
    h('div', null, field('Автоматично излизане при бездействие',
      select([
        { value: 0, label: 'изключено' },
        ...[5, 10, 15, 30, 60].map(m => ({ value: m, label: `след ${m} минути` })),
      ].map(o => ({ ...o, selected: Number(state.settings.autoLogoutMinutes || 0) === o.value })),
      { name: 'autoLogoutMinutes' }),
      'Важи при вход с ПИН. Минута преди това програмата предупреждава. Пази досиетата, ако някой остави компютъра отключен.')),
    h('div', null, field('Регион за SCORE2 (ESC)',
      select(Object.entries(CV_REGIONS).map(([value, label]) => ({
        value, label: label + (value === 'very_high' ? ' — България' : ''),
        selected: (state.settings.cvRegion || 'very_high') === value,
      })), { name: 'cvRegion' }),
      'Калибрирането на SCORE2 и SCORE2-Diabetes по сърдечно-съдовата смъртност в страната. България е в региона с много висок риск.')),
    h('div.full', null, h('button.btn.primary', { type: 'submit' }, 'Запази')));

  return h('div.stack', null, card('Данни на практиката', { icon: '🏥' }, form),
    state.kind === 'simp' ? [modulesCard(rerender), agendaCard(rerender)] : null);
}

const WEEKDAYS_BG = ['понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота', 'неделя'];

/** Работно време за графика и сроковете за направления и протоколи (СИМП). */
function agendaCard(rerender) {
  const ag = state.settings.agenda || { start: '08:00', end: '16:00', slot: 20, days: [1, 2, 3, 4, 5] };
  let form;
  const save = async () => {
    const fd = new FormData(form);
    try {
      await api.updateSettings({
        agenda: { start: fd.get('start'), end: fd.get('end'), slot: Number(fd.get('slot')), days: fd.getAll('day').map(Number) },
        secondaryDays: Number(fd.get('secondaryDays')),
        protocolWarnDays: Number(fd.get('protocolWarnDays')),
      });
      await refreshBootstrap();
      toast('Работното време е запазено.', 'ok');
      rerender();
    } catch (err) { toast(err.message, 'error'); }
  };
  form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); save(); } },
    h('div', null, field('Начало на работния ден', input({ name: 'start', type: 'time', value: ag.start, required: true }))),
    h('div', null, field('Край на работния ден', input({ name: 'end', type: 'time', value: ag.end, required: true }))),
    h('div', null, field('Продължителност на един час', select([10, 15, 20, 30, 40, 45, 60].map(m => ({ value: m, label: `${m} минути`, selected: m === ag.slot })), { name: 'slot' }))),
    h('div.full', null, h('div.lbl.small', { style: { fontWeight: 600, marginBottom: '6px' } }, 'Работни дни'),
      h('div.row', { style: { flexWrap: 'wrap', gap: '6px 16px' } }, WEEKDAYS_BG.map((d, i) => h('label.check', null,
        h('input', { type: 'checkbox', name: 'day', value: i + 1, checked: ag.days.includes(i + 1) }), h('span', null, d))))),
    h('div', null, field('Срок за вторичен преглед (дни)', input({ name: 'secondaryDays', type: 'number', min: 1, max: 90, value: state.settings.secondaryDays || 30 }),
      'След първичния преглед по същото направление. По НРД — 30 дни.')),
    h('div', null, field('Предупреждение за протокол (дни преди изтичане)', input({ name: 'protocolWarnDays', type: 'number', min: 7, max: 120, value: state.settings.protocolWarnDays || 30 }))),
    h('div.full', null, h('button.btn.primary', { type: 'submit' }, 'Запази')));
  return card('Работно време и срокове', { icon: '🕘' },
    h('p.small.muted', null, 'Графикът предлага свободните часове в работното време. Час извън него може да се запише ръчно.'), form);
}

/** Модулите с клинична логика по специалности — включват се за цялата практика за СИМП. */
function modulesCard(rerender) {
  const on = state.settings.modules || {};
  const toggle = async (id, value, box) => {
    try {
      await api.updateSettings({ modules: { [id]: value } });
      await refreshBootstrap();
      toast(value ? `Модулът „${MODULES[id].name}“ е включен — в досиетата на пълнолетните има нов раздел.` : `Модулът „${MODULES[id].name}“ е изключен. Въведените данни се пазят.`, 'ok');
      rerender();
    } catch (err) {
      box.checked = !value;
      toast(err.message, 'error');
    }
  };
  return card('Специалности на практиката', { icon: '🧩' },
    h('p.small.muted', null, 'Всеки модул добавя раздел с клинична логика в досието на пълнолетен пациент, преглед, попълнен от раздела, '
      + 'и списък за действие в „Справки“. Прегледите, направленията, протоколите, наблюдението и графикът работят за всяка специалност.'),
    h('div.stack', { style: { gap: '10px' } }, Object.entries(MODULES).map(([id, m]) => {
      const box = h('input', { type: 'checkbox', checked: !!on[id] });
      box.addEventListener('change', () => toggle(id, box.checked, box));
      return h('label.check', null, box, h('span', null, h('strong', null, `${m.icon} ${m.name}`), h('div.tiny.dim', null, m.about)));
    })));
}

/* ------------------------------- потребители --------------------------------- */

async function doctorsTab(rerender) {
  const rows = state.doctors.map(d => h('tr', null,
    h('td.name-cell', null, d.name),
    h('td.small.muted', null, d.role || '', d.uin ? h('div.tiny.dim', null, 'УИН ' + d.uin) : null),
    h('td', null, d.hasPin ? badge('done', 'с ПИН') : badge('', 'без ПИН')),
    h('td', null, d.active ? badge('done', 'активен') : badge('', 'спрян')),
    h('td.actions', null,
      h('button.btn.xs', { onclick: () => doctorDialog(d, rerender) }, '✎'),
      ' ',
      h('button.btn.xs', {
        onclick: async () => {
          try {
            await api.updateDoctor(d.id, { active: !d.active });
            await refreshBootstrap();
            rerender();
          } catch (err) { toast(err.message, 'error'); }
        },
      }, d.active ? 'Спри' : 'Пусни'))));

  return card('Потребители в практиката', {
    icon: '👥',
    actions: h('button.btn.sm.primary', { onclick: () => doctorDialog(null, rerender) }, '＋ Добави'),
    tight: true,
  }, table(['Име', 'Длъжност', 'ПИН', 'Състояние', ''], rows),
  h('div.body.tiny.muted', null, state.kind === 'simp'
    ? 'Това са потребителите на практиката за СИМП. Практиката на ОПЛ в същата инсталация има свои потребители и ПИН-ове.'
    : 'Това са потребителите на практиката на ОПЛ. Практиката за СИМП в същата инсталация има свои потребители и ПИН-ове.'));
}

function doctorDialog(doctor, rerender) {
  let form;
  const submit = async (close) => {
    const d = Object.fromEntries(new FormData(form));
    if (d.pin && d.pin !== d.pin2) { toast('Двата ПИН-а не съвпадат.', 'error'); return; }
    const payload = { name: d.name, role: d.role, uin: d.uin };
    if (d.pin || (doctor && d.clearPin === 'on')) payload.pin = d.clearPin === 'on' ? '' : d.pin;
    try {
      if (doctor) await api.updateDoctor(doctor.id, payload);
      else await api.addDoctor(payload);
      await refreshBootstrap();
      toast('Записано.', 'ok');
      close();
      rerender();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  modal({
    title: doctor ? 'Редакция — ' + doctor.name : 'Нов потребител',
    body: (close) => {
      form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div.full', null, field('Име', input({ name: 'name', required: true, value: doctor ? doctor.name : '' }))),
        h('div', null, field(state.kind === 'simp' ? 'Специалност / длъжност' : 'Длъжност', input({
          name: 'role', value: doctor ? doctor.role || '' : state.kind === 'simp' ? '' : 'Общопрактикуващ лекар', list: 'roleChoices',
        }), 'Изберете от списъка или напишете своя.'),
        h('datalist#roleChoices', null, (state.kind === 'simp'
          ? ['Кардиолог', 'Ендокринолог', 'Невролог', 'Пулмолог', 'Гастроентеролог', 'Нефролог', 'Ревматолог', 'Педиатър', 'Хирург', 'Уролог', 'Офталмолог', 'Дерматолог', 'Акушер-гинеколог', 'Оториноларинголог', 'Психиатър', 'Медицинска сестра', 'Регистратор']
          : ['Общопрактикуващ лекар', 'Педиатър', 'Медицинска сестра', 'Регистратор'])
          .map(r => h('option', { value: r })))),
        h('div', null, field('УИН', input({ name: 'uin', value: doctor ? doctor.uin || '' : '', inputmode: 'numeric', maxlength: 10 }),
          'Уникален идентификационен номер на лекаря — печата се на документите.')),
        h('div', null, field(doctor ? 'Нов ПИН' : 'ПИН',
          input({ name: 'pin', type: 'password', inputmode: 'numeric', pattern: '\\d{4,8}' }),
          '4–8 цифри')),
        h('div', null, field('Повторете', input({ name: 'pin2', type: 'password', inputmode: 'numeric' }))),
        doctor && doctor.hasPin
          ? h('div.full', null, h('label.check', null,
            h('input', { type: 'checkbox', name: 'clearPin' }),
            h('span', null, 'Премахни ПИН-а (вход без парола)')))
          : null);
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, 'Запази'),
    ],
  });
}

/* --------------------------------- календар ---------------------------------- */

export function adultWhen(i) {
  const y = (m) => Math.round((m / 12) * 10) / 10;
  if (i.recur) {
    const every = i.recur.everyMonths % 12 === 0 ? `на ${i.recur.everyMonths / 12} г.` : `на ${i.recur.everyMonths} мес.`;
    const to = i.recur.toMonths < 1200 ? `–${y(i.recur.toMonths)} г.` : '+';
    return `${y(i.recur.fromMonths)}${to}, ${i.recur.everyMonths === 12 ? 'ежегодно' : every}`;
  }
  if (i.seasonal) {
    const from = `всяка есен от ${y(i.fromMonths ?? 216)} г.`;
    return i.riskFromMonths !== undefined ? `${from}; по-рано при риск` : from;
  }
  return `${y(i.dueMonths)} г.` + (i.riskFromMonths !== undefined ? `; от ${y(i.riskFromMonths)} г. при риск` : '');
}

const sortKey = (i) => (i.recur ? i.recur.fromMonths : i.seasonal ? i.fromMonths ?? 216 : i.dueMonths);

async function scheduleTab(rerender) {
  const groups = ['vaccine', 'screening', 'checkup'];
  const adult = scheduleTrack === 'adult';

  const sections = groups.map(g => {
    const items = state.schedule.filter(i => i.group === g && (i.track === 'adult') === adult)
      .sort((a, b) => sortKey(a) - sortKey(b));
    if (!items.length) return null;
    const rows = items.map(i => h('tr', { style: { opacity: i.disabled ? .5 : 1 } },
      h('td', null,
        h('div', { style: { fontWeight: '600' } }, i.name,
          i.sex ? h('span.tiny.dim', null, i.sex === 'f' ? ' · жени' : ' · мъже') : null),
        i.note ? h('div.tiny.dim', null, i.note) : null),
      h('td.nowrap.small', null, adult ? adultWhen(i) : i.dueMonths + ' мес.'),
      h('td.nowrap.mono.small', null, (i.graceMonths ?? 1) + ' мес.'),
      h('td', null, i.optIn ? badge('', 'препоръчителна') : i.mandatory ? badge('done', 'задължителна') : badge('', 'по преценка')),
      h('td.actions', null,
        h('button.btn.xs', { onclick: () => scheduleItemDialog(i, rerender) }, '✎'),
        ' ',
        h('button.btn.xs', {
          onclick: async () => {
            await api.updateScheduleItem(i.id, { disabled: !i.disabled });
            await refreshBootstrap();
            rerender();
          },
        }, i.disabled ? 'Включи' : 'Изключи'),
        i.custom ? h('span', null, ' ', h('button.btn.xs.danger', {
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'Изтриване', message: `„${i.name}“ ще бъде премахната от календара.`,
              confirmLabel: 'Изтрий', danger: true,
            });
            if (!ok) return;
            await api.deleteScheduleItem(i.id);
            await refreshBootstrap();
            rerender();
          },
        }, '✕')) : null)));

    return card(`${GROUPS[g].label} (${items.length})`, { icon: GROUPS[g].icon, tight: true },
      table(['Дейност', 'Възраст', 'Гратис', 'Вид', ''], rows));
  }).filter(Boolean);

  return h('div.stack', null,
    h('div.chips', null,
      h('button.chip' + (!adult ? '.active' : ''), { onclick: () => { scheduleTrack = 'child'; rerender(); } }, 'Деца'),
      h('button.chip' + (adult ? '.active' : ''), { onclick: () => { scheduleTrack = 'adult'; rerender(); } }, 'Възрастни')),
    h('div.alert-strip.info', null,
      adult
        ? h('div', null,
          'Профилактиката при възрастни: Наредба № 8 (годишен преглед), Наредба № 15 (Td на 25 г. и на 10 години), ',
          'Препоръката на Съвета на ЕС за скрининг на рак (2022), ESC 2021 и препоръките на ECDC за ваксините. ',
          'Повтарящите се дейности се пресмятат за всеки пациент; при хронично заболяване ваксините се дължат по-рано.')
        : h('div', null,
          'Календарът се прилага за всички деца. Промяна тук влиза в сила веднага и за вече заведените досиета. ',
          h('strong', null, 'Сверявайте с актуалната Наредба № 15. '),
          `Съдържанието по подразбиране е проверено към ${CALENDAR_VERIFIED}.`)),
    h('div.row.no-print', null,
      h('button.btn.primary', { onclick: () => scheduleItemDialog(null, rerender) }, '＋ Добави дейност'),
      h('div.grow'),
      h('button.btn', {
        onclick: async () => {
          const ok = await confirmDialog({
            title: 'Връщане към стандартния календар',
            message: 'Всички промени по календара (за деца и за възрастни) ще бъдат отменени. Данните на пациентите не се засягат.',
            confirmLabel: 'Върни стандартния', danger: true,
          });
          if (!ok) return;
          await api.resetSchedule();
          await refreshBootstrap();
          toast('Календарът е върнат към стандартния.');
          rerender();
        },
      }, 'Върни стандартния календар')),
    ...sections);
}

function scheduleItemDialog(item, rerender) {
  let form;
  const adult = item ? item.track === 'adult' : scheduleTrack === 'adult';
  const submit = async (close) => {
    const d = decimalFields(Object.fromEntries(new FormData(form)), ['dueMonths', 'graceMonths', 'years', 'everyYears']);
    const payload = {
      name: d.name, short: d.short, note: d.note,
      dueMonths: d.dueMonths, graceMonths: d.graceMonths,
      mandatory: d.mandatory === 'on',
    };
    if (adult) {
      delete payload.dueMonths;
      if (d.years !== undefined && d.years !== '') {
        if (item && item.recur) payload.fromMonths = Math.round(Number(d.years) * 12);
        else if (!item || !item.seasonal) payload.dueMonths = Math.round(Number(d.years) * 12);
      }
      if (d.everyYears) payload.everyMonths = Math.round(Number(d.everyYears) * 12);
    }
    try {
      if (item) await api.updateScheduleItem(item.id, payload);
      else await api.addScheduleItem({ ...payload, group: d.group, track: adult ? 'adult' : undefined, sex: d.sex || undefined });
      await refreshBootstrap();
      toast('Календарът е обновен.', 'ok');
      close();
      rerender();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  modal({
    title: item ? 'Редакция — ' + item.name : 'Нова дейност в календара',
    body: (close) => {
      form = h('form.form-grid', { onsubmit: (e) => { e.preventDefault(); submit(close); } },
        h('div.full', null, field('Наименование', input({ name: 'name', required: true, value: item ? item.name : '' }))),
        h('div', null, field('Кратко име', input({ name: 'short', value: item ? item.short || '' : '' }))),
        !item ? h('div', null, field('Вид', select([
          { value: 'vaccine', label: 'Имунизация' },
          { value: 'checkup', label: 'Профилактичен преглед' },
          { value: 'screening', label: 'Скрининг / изследване' },
        ], { name: 'group' }))) : null,
        adult
          ? (item && item.seasonal ? h('div', null, field('Кога', h('div.small', null, adultWhen(item)))) : h('div', null, field(item && item.recur ? 'От възраст (години)' : 'Възраст (години)',
            numberInput({ name: 'years', min: 18, max: 100, required: true,
              value: item ? String(Math.round(((item.recur ? item.recur.fromMonths : item.dueMonths) / 12) * 10) / 10).replace('.', ',') : '' }))))
          : h('div', null, field('Възраст (месеци)',
            numberInput({ name: 'dueMonths', min: 0, max: 240, required: true,
              value: item ? item.dueMonths : '' }),
            '0 = при раждане, 12 = на 1 година')),
        adult && (!item || item.recur) ? h('div', null, field('Повтаря се на (години)',
          numberInput({ name: 'everyYears', min: 0.1, max: 20,
            value: item && item.recur ? String(Math.round((item.recur.everyMonths / 12) * 10) / 10).replace('.', ',') : '' }),
          item ? null : 'Празно — еднократно.')) : null,
        adult && !item ? h('div', null, field('За', select([
          { value: '', label: 'мъже и жени' }, { value: 'f', label: 'само жени' }, { value: 'm', label: 'само мъже' },
        ], { name: 'sex' }))) : null,
        h('div', null, field('Гратисен период (месеци)',
          numberInput({ name: 'graceMonths', min: 0, max: 60,
            value: item ? item.graceMonths ?? 1 : 1 }),
          'След него дейността се води просрочена.')),
        h('div.full', null, field('Бележка', input({ name: 'note', value: item ? item.note || '' : '' }))),
        h('div.full', null, h('label.check', null,
          h('input', { type: 'checkbox', name: 'mandatory', checked: item ? !!item.mandatory : true }),
          h('span', null, 'Задължителна — влиза в изчисляването на обхвата'))));
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, 'Запази'),
    ],
  });
}

/* ---------------------------------- данни ------------------------------------ */

async function dataTab(rerender) {
  const doExport = async () => {
    try {
      const data = await api.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `docup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Копието е свалено.', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const fileInput = h('input', {
    type: 'file', accept: 'application/json', style: { display: 'none' },
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = '';
      let parsed;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        toast('Файлът не е валиден JSON.', 'error');
        return;
      }
      const count = Array.isArray(parsed.patients) ? parsed.patients.length : 0;
      const ok = await confirmDialog({
        title: 'Възстановяване от копие',
        message: `Текущите данни ще бъдат заменени с ${count} досиета от файла. `
          + 'Преди това автоматично се прави резервно копие на сегашните данни.',
        confirmLabel: 'Възстанови', danger: true,
      });
      if (!ok) return;
      try {
        await api.importAll(parsed);
        toast('Данните са възстановени.', 'ok');
        location.reload();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  });

  const srv = state.server || {};
  const where = srv.dataDir
    ? h('code.path', null, srv.dataDir)
    : 'папка „data“ до програмата';
  const backups = srv.backupDir ? h('code.path', null, srv.backupDir) : '„data/backups“';

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Копирано.', 'ok');
    } catch {
      toast('Маркирайте адреса и го копирайте ръчно.');
    }
  };
  const addressRow = (url) => h('div.row.address-row', null,
    h('code.path', null, url),
    h('button.btn.sm', { onclick: () => copy(url), title: 'Копирай адреса' }, 'Копирай'));

  const connection = srv.port ? card('Връзка от другите компютри', { icon: '🖧' },
    h('p.small', null,
      'Програмата работи на този компютър. От другите компютри в кабинета отворете в браузъра '
      + (srv.addresses?.length > 1 ? 'един от адресите:' : 'адреса:')),
    srv.addresses?.length
      ? h('div.address-list', null, srv.addresses.map(addressRow))
      : h('p.small.muted', null, 'Компютърът не е свързан към локална мрежа.'),
    h('p.small.muted', { style: { marginBottom: 0 } },
      'Ако адресът не се отваря от друг компютър: мрежата в Windows трябва да е „Частна“ (Private), '
      + 'а двата компютъра — в една и съща мрежа. Този компютър трябва да е включен, докато другите работят.')) : null;

  const program = srv.version ? card('Програмата', { icon: '⚙️' },
    h('dl.kv', null,
      h('dt', null, 'Програма'), h('dd', null, `DocUp ${srv.version}${srv.edition === 'windows' ? ' за Windows' : ''}`),
      h('dt', null, 'Работи на'), h('dd', null, srv.local ? 'този компютър' : 'друг компютър в кабинета'),
      h('dt', null, 'Сайт'), h('dd', null,
        h('a', { href: 'https://docup.health/', target: '_blank', rel: 'noopener noreferrer' }, 'docup.health')),
      state.license?.active ? h('dt', null, 'Лиценз') : null,
      state.license?.active ? h('dd', null, 'активиран · ', h('span.mono', null, state.license.key),
        state.license.activatedAt ? h('span.small.muted', null, ` · от ${formatDate(state.license.activatedAt.slice(0, 10))}`) : null) : null),
    h('div.row', { style: { marginTop: '12px' } },
      h('button.btn', { onclick: () => whatsNew({ all: true }) }, 'Какво е новото'),
      state.license?.active ? h('button.btn', { onclick: () => changeKeyDialog(rerender) }, 'Смени продуктовия ключ') : null,
      canStopHere()
        ? h('button.btn.danger', { onclick: stopProgram }, '⏻ Спри програмата')
        : null),
    srv.canStop && !srv.local
      ? h('p.small.muted', { style: { margin: '10px 0 0' } },
        'Програмата може да бъде спряна само от компютъра, на който работи.')
      : null,
    srv.edition === 'windows'
      ? h('p.small.muted', { style: { margin: '10px 0 0' } },
        'Обновяване: стартирайте файла за обновяване на компютъра, на който работи програмата. '
        + 'Данните и настройките се запазват.')
      : null) : null;

  return h('div.stack', null,
    connection,
    card('Внасяне на пациенти от друга програма', { icon: '📥' },
      h('p.small.muted', null,
        'Списък от медицинската програма, от Excel или LibreOffice, CSV, HTML или XML таблица, или копирани клетки. '
        + 'Колоните се разпознават сами, диагнозите с МКБ код стават хронични заболявания, а вече въведените пациенти се допълват, без да се дублират.'),
      h('div.row', null,
        h('button.btn.primary', { onclick: () => openImportDialog({ onDone: rerender }) }, '⭳ Внасяне на списък'),
        h('button.btn', { onclick: downloadTemplate }, 'Образец за попълване (Excel)'))),
    extraBackupCard(srv, rerender),
    program,
    card('Резервни копия', { icon: '💾' },
      h('p.small.muted', null,
        'Сървърът прави автоматично копие всеки ден при първата промяна и пази последните 60 дни в ',
        backups,
        '. Свалете копие и извън компютъра — на външен диск или защитена папка.'),
      h('div.row', null,
        h('button.btn.primary', { onclick: doExport }, '⬇ Свали пълно копие (JSON)'),
        h('button.btn', { onclick: () => fileInput.click() }, '⬆ Възстанови от файл'),
        fileInput)),

    card('Къде се пазят данните', { icon: '🔒' },
      h('p.small', null,
        'Всички данни стоят на компютъра, на който работи програмата — в ', where, '. '
        + 'Нищо не се изпраща в интернет и няма външни услуги.'),
      h('p.small.muted', { style: { marginBottom: 0 } },
        'Данните на пациентите са лични данни за здравословно състояние. Достъпът до компютъра, '
        + 'резервните копия и мрежата на кабинета са отговорност на практиката като администратор на лични данни.')));
}

/* Смяна на продуктовия ключ (например при нов лиценз). */
function changeKeyDialog(rerender) {
  const key = productKeyField();
  const error = h('div.key-error', { role: 'alert' });
  modal({
    title: 'Смяна на продуктовия ключ',
    body: () => h('form#keyForm.stack', {
      style: { gap: '10px' },
      onsubmit: (e) => e.preventDefault(),
    }, h('p.small.muted', { style: { margin: 0 } }, 'Текущият ключ е заменен само ако новият е валиден.'), key.field, error),
    actions: (close) => [
      h('button.btn', { onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', {
        onclick: async () => {
          error.textContent = '';
          try {
            const res = await api.activate(key.value());
            state.license = { ...state.license, ...res.license };
            close();
            toast('Продуктовият ключ е сменен.', 'ok');
            rerender();
          } catch (err) {
            error.textContent = err.message;
          }
        },
      }, 'Смени'),
    ],
  });
}

/* Външно копие: флашка, втори диск или мрежова папка. */
function extraBackupCard(srv, rerender) {
  const current = state.settings.extraBackupDir || '';
  const status = state.extraBackup;
  const local = srv.local !== false;

  const pathInput = input({
    value: current, placeholder: 'например E:\\DocUp или \\\\сървър\\копия',
    disabled: !local, 'aria-label': 'Папка за външно копие',
  });

  const save = async (value) => {
    try {
      const res = await api.updateSettings({ extraBackupDir: value });
      state.settings = res.settings;
      state.extraBackup = res.extraBackup;
      toast(value ? 'Папката е проверена и първото копие е направено.' : 'Външното копие е изключено.', 'ok');
      rerender();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const copyNow = async (btn) => {
    btn.disabled = true;
    try {
      const res = await api.copyBackupNow();
      state.extraBackup = res.extraBackup;
      toast('Копието е направено.', 'ok');
      rerender();
    } catch (err) {
      btn.disabled = false;
      toast(err.message, 'error');
    }
  };

  let statusLine = null;
  if (current && status && status.dir === current) {
    const when = new Date(status.at).toLocaleString('bg-BG', { dateStyle: 'medium', timeStyle: 'short' });
    statusLine = status.ok
      ? h('div.backup-status.ok', null, '✓ Последно копие: ', when)
      : h('div.backup-status.error', null,
        h('strong', null, `✕ Последният опит (${when}) не успя. `),
        status.error || '',
        h('div.small', null, 'Проверете дали флашката или мрежовата папка е свързана.'));
  }

  return card('Външно копие', { icon: '🗄️' },
    h('p.small', { style: { marginTop: 0 } },
      'Автоматично копие на всички данни в папка извън този диск — флашка, външен диск или мрежова папка. '
      + 'Прави се при първата промяна за деня, на всеки час при промени и при спиране на програмата. '
      + 'Пазят се последните 60 дни. Така данните оцеляват и при повреда или кражба на компютъра.'),
    h('div.row', null,
      h('div', { style: { flex: '1', minWidth: '260px' } }, pathInput),
      local ? h('button.btn.primary', { onclick: () => save(pathInput.value.trim()) }, current ? 'Смени' : 'Включи') : null,
      local && current ? h('button.btn', { onclick: (e) => copyNow(e.currentTarget) }, 'Копирай сега') : null,
      local && current ? h('button.btn.ghost', { onclick: () => save('') }, 'Изключи') : null),
    statusLine,
    local ? null : h('p.small.muted', { style: { marginBottom: 0 } },
      'Папката се задава от компютъра, на който работи програмата.'),
    current ? null : h('p.small.muted', { style: { margin: '10px 0 0' } },
      'Съвет: флашка, която стои постоянно в компютъра, пази от повреда на диска. '
      + 'Втора флашка, сменяна веднъж седмично и пазена извън кабинета, пази и от кражба или пожар.'));
}

/* -------------------------------- сигурност ---------------------------------- */

const CHECK_ICON = { ok: '✓', info: 'i', warn: '!', bad: '✕' };
const CHECK_GROUPS = [
  ['security', 'Сигурност', '🛡️'],
  ['data', 'Данни и копия', '💾'],
  ['computer', 'Компютър и други програми', '🖥️'],
];

async function securityTab(rerender) {
  let check;
  try {
    check = await api.systemCheck();
  } catch (err) {
    return card('Проверка на сигурността и компютъра', { icon: '🛡️' }, h('p.small', null, err.message));
  }

  // Часовникът на компютъра, от който се гледа, спрямо този на програмата.
  const skew = Math.round((Date.now() - Date.parse(check.serverTime)) / 60000);
  if (Math.abs(skew) >= 5) {
    check.items.push({
      group: 'computer', level: 'warn',
      title: `Часовникът на този компютър се разминава с програмата с ${Math.abs(skew)} мин.`,
      detail: 'Сверете датата и часа в Windows — иначе часовете в журнала и сроковете изглеждат объркани.',
    });
  }

  const bad = check.items.filter(i => i.level === 'bad').length;
  const warn = check.items.filter(i => i.level === 'warn').length;
  const summary = bad
    ? h('div.alert-strip', null, `✕ ${bad} ${bad === 1 ? 'проблем изисква' : 'проблема изискват'} внимание`
      + (warn ? `, ${warn} ${warn === 1 ? 'препоръка' : 'препоръки'}` : ''))
    : warn
      ? h('div.alert-strip.warn', null, `! ${warn} ${warn === 1 ? 'препоръка' : 'препоръки'} за по-добра защита`)
      : h('div.alert-strip.ok', null, '✓ Всичко е наред');

  const groups = CHECK_GROUPS.map(([id, label, icon]) => {
    const rows = check.items.filter(i => i.group === id);
    if (!rows.length) return null;
    return h('div.sys-group', null,
      h('h3', null, icon, ' ', label),
      rows.map(i => h('div.sys-row.' + i.level, null,
        h('span.sys-icon', { 'aria-hidden': 'true' }, CHECK_ICON[i.level] || ''),
        h('div', null,
          h('div.sys-title', null, i.title),
          i.detail ? h('div.small.muted', null, i.detail) : null))));
  });

  return h('div.stack', null,
    card('Проверка на сигурността и компютъра', {
      icon: '🛡️',
      actions: h('button.btn.sm', { onclick: rerender }, '↻ Провери отново'),
    }, summary, groups,
    h('p.tiny.muted', { style: { margin: '12px 0 0' } },
      `Проверено ${new Date(check.checkedAt).toLocaleString('bg-BG', { dateStyle: 'medium', timeStyle: 'short' })}.`)),
    networkCard(check, rerender));
}

/* Кой може да отваря програмата по мрежата. */
function networkCard(check, rerender) {
  const can = check.canChangeNetwork;
  const MODES = [
    ['lan', 'Компютрите в кабинета (вътрешната мрежа)',
      'Препоръчително. Свързват се компютрите в същата мрежа — общ рутер или защитена връзка (VPN). Връзки от интернет се отказват.'],
    ['local', 'Само този компютър',
      'Най-сигурно, когато програмата се ползва само тук. Другите компютри не могат да се свържат.'],
    ['any', 'Всякакви адреси, включително от интернет',
      'Само ако знаете какво правите: кабинетът е зад VPN и всички потребители имат ПИН. Не се препоръчва.'],
  ];
  const radios = MODES.map(([value, label, hint]) => h('label.check', null,
    h('input', { type: 'radio', name: 'network', value, checked: check.network === value, disabled: !can }),
    h('span', null, h('strong', null, label), h('div.tiny.dim', null, hint))));
  const hosts = h('textarea', {
    rows: 3, disabled: !can, 'aria-label': 'Разрешени имена на адреси',
    placeholder: 'например kabinet.example.bg',
  }, (check.allowedHosts || []).join('\n'));

  const save = async () => {
    const network = radios.map(r => r.querySelector('input')).find(i => i.checked)?.value || check.network;
    if (network === 'local' && check.network !== 'local') {
      const ok = await confirmDialog({
        title: 'Само този компютър',
        message: 'Другите компютри в кабинета веднага ще загубят достъп до програмата.',
        confirmLabel: 'Ограничи', danger: true,
      });
      if (!ok) return;
    }
    try {
      const res = await api.updateSettings({ network, allowedHosts: hosts.value.split(/\s+/).filter(Boolean) });
      state.settings = res.settings;
      toast('Настройките за достъп са запазени.', 'ok');
      rerender();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return card('Достъп по мрежата', { icon: '🖧' },
    h('div.stack', { style: { gap: '10px' } }, radios),
    h('div', { style: { marginTop: '14px' } }, field('Разрешени имена на адреси',
      hosts,
      'Програмата се отваря по IP адрес, localhost или името на компютъра. Друго име (например за връзка през VPN) '
      + 'се добавя тук, по едно на ред. Така чужд сайт не може да се представи за програмата.')),
    can
      ? h('div.row', { style: { marginTop: '12px' } }, h('button.btn.primary', { onclick: save }, 'Запази'))
      : h('p.small.muted', { style: { margin: '12px 0 0' } }, 'Достъпът се променя от компютъра, на който работи програмата.'));
}

/* --------------------------------- асистент ---------------------------------- */

async function assistantTab(rerender) {
  const ai = await aiSettings(true);
  const can = ai.canChange;
  const enabled = h('input', { type: 'checkbox', checked: ai.enabled, disabled: !can || !ai.library });
  const key = input({
    type: 'password', autocomplete: 'off', spellcheck: false, disabled: !can || !ai.library,
    placeholder: ai.hasKey ? `зададен (${ai.keyHint}); въведете нов, за да го смените` : 'sk-ant-…',
  });
  const busy = (btn, fn) => async () => {
    btn.disabled = true;
    try { await fn(); } finally { btn.disabled = false; }
  };
  const saveBtn = h('button.btn.primary', null, 'Запази');
  saveBtn.onclick = busy(saveBtn, async () => {
    const body = { enabled: enabled.checked };
    if (key.value.trim()) body.apiKey = key.value.trim();
    try {
      await api.updateAiSettings(body);
      toast(body.enabled ? 'Езиковият модел е включен.' : 'Езиковият модел е изключен.', 'ok');
      rerender();
    } catch (err) { toast(err.message, 'error'); }
  });
  const testBtn = h('button.btn', null, 'Провери връзката');
  testBtn.onclick = busy(testBtn, async () => {
    try {
      const res = await api.testAi();
      toast(`Връзката работи (${res.model}).`, 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });
  const removeBtn = h('button.btn.danger', null, 'Премахни ключа');
  removeBtn.onclick = busy(removeBtn, async () => {
    const ok = await confirmDialog({
      title: 'Премахване на ключа', message: 'Ключът ще бъде изтрит от този компютър и вторият поглед ще се изключи.',
      confirmLabel: 'Премахни', danger: true,
    });
    if (!ok) return;
    try {
      await api.updateAiSettings({ enabled: false, apiKey: '' });
      toast('Ключът е премахнат.', 'ok');
      rerender();
    } catch (err) { toast(err.message, 'error'); }
  });

  return h('div.stack', null,
    card('Асистент на практиката', { icon: '🧭' },
      h('p.small', { style: { marginTop: 0 } },
        'Асистентът е винаги включен и работи изцяло на този компютър. Преглежда всяко досие и подсказва, когато състоянието на пациента '
        + 'изисква допълнителна проверка или изследване:'),
      h('ul.small', null,
        h('li', null, 'отклонени резултати и промени във времето: калий, натрий, хемоглобин, бъбречна функция, чернодробни ензими, TSH, PSA, NT-proBNP, HbA1c, CRP и други;'),
        h('li', null, 'кръвно налягане, пулс и загуба на тегло;'),
        h('li', null, 'скрининг според възрастта и рисковите фактори: предсърдно мъждене, аневризма на коремната аорта, диабет;'),
        h('li', null, 'лечение, което изисква контрол: инхибитори на РААС, статини, антикоагуланти, литий, кортикостероиди;'),
        h('li', null, 'тревожни оплаквания в текста на прегледите (кръв в изпражненията, задух, болка в гърдите, отпадна неврологична симптоматика и други), като разпознава отрицанието „без“, „не“, „отрича“;'),
        h('li', null, 'сигналите, които програмата вече изчислява: проследяване по заболявания, лекарства, психично здраве, растеж, специалности.')),
      h('p.small.muted', { style: { marginBottom: 0 } },
        'Всяка подсказка казва какво, защо и по коя насока. Решенията на лекаря се помнят в досието.')),

    card('Втори поглед от езиков модел (по избор)', { icon: '✨' },
      h('p.small', { style: { marginTop: 0 } },
        'Лекарят може да поиска от езиков модел на Anthropic (Claude) втори поглед върху едно досие. Изпраща се само обезличено обобщение: '
        + 'пол, възраст, заболявания, лекарства, изследвания, текст на прегледите. Имената, ЕГН, телефоните, имейлите и датите се премахват. '
        + 'Преди всяко изпращане лекарят вижда точния текст и го потвърждава.'),
      h('p.small', null,
        'Нужен е API ключ от console.anthropic.com на името на практиката; заявките се плащат по сметката на практиката при Anthropic. '
        + 'Ключът се пази само на този компютър, не се показва в браузъра и не влиза в копията и експорта. '
        + 'Преди да включите тази възможност, преценете съответствието с GDPR и вътрешните правила на практиката.'),
      !ai.library ? h('div.alert-strip.warn', null,
        'Библиотеката за връзка с езиковия модел липсва. При версията за Node.js изпълнете „npm install“ в папката на програмата.') : null,
      h('div.stack', { style: { marginTop: '10px' } },
        h('label.check', null, enabled, h('span', null, h('strong', null, 'Включи втория поглед'),
          h('div.tiny.dim', null, `Модел ${ai.model}. При отказ заявката автоматично се поема от резервен модел.`))),
        field('API ключ', key, ai.hasKey ? `Зададен ключ, завършващ на ${ai.keyHint}.` : 'Ключът започва със „sk-ant-“.')),
      can
        ? h('div.row', { style: { marginTop: '12px', flexWrap: 'wrap' } }, saveBtn,
          ai.hasKey ? testBtn : null, ai.hasKey ? removeBtn : null)
        : h('p.small.muted', { style: { margin: '12px 0 0' } }, 'Езиковият модел се настройва от компютъра, на който работи програмата.'),
      ai.updatedAt ? h('p.tiny.dim', { style: { marginBottom: 0 } }, 'Последна промяна: ' + new Date(ai.updatedAt).toLocaleString('bg-BG')) : null));
}

/* ---------------------------------- журнал ----------------------------------- */

const NETWORK_LABELS = { local: 'само този компютър', lan: 'вътрешната мрежа', any: 'всякакви адреси' };

async function auditTab() {
  const { entries } = await api.audit(200);

  const LABELS = {
    login: 'вписване', login_failed: 'неуспешен вход', setup: 'първоначална настройка',
    login_locked: 'входът е временно заключен', sessions_revoked: 'затворени отворени сесии',
    activated: 'активиране с продуктов ключ', activation_failed: 'невалиден продуктов ключ',
    patient_create: 'ново досие', patient_update: 'промяна в досие',
    patient_archive: 'архивиране', patient_restore: 'връщане от архив',
    record_set: 'отбелязана дейност', record_clear: 'премахнат запис',
    measurement_add: 'ново измерване', measurement_delete: 'изтрито измерване',
    visit_add: 'нов преглед', visit_delete: 'изтрит преглед',
    reminder_add: 'ново напомняне', reminder_update: 'промяна в напомняне',
    reminder_delete: 'изтрито напомняне', optin_set: 'препоръчителни ваксини',
    settings_update: 'промяна в настройките', schedule_update: 'промяна в календара',
    schedule_add: 'нова дейност в календара', schedule_delete: 'изтрита дейност',
    schedule_reset: 'календарът е върнат', export: 'сваляне на копие', import: 'възстановяване от копие',
    doctor_add: 'нов потребител', doctor_update: 'промяна в потребител',
    records_history: 'минали имунизации', system_stop: 'спиране на програмата',
    backup_copy: 'копие във външна папка', auto_logout: 'автоматично излизане',
    patients_import: 'внасяне на списък', development_add: 'оценка на развитието', development_delete: 'изтрита оценка на развитието',
    chronic_add: 'ново хронично заболяване', chronic_update: 'промяна в заболяване', chronic_delete: 'изтрито заболяване',
    med_add: 'ново лекарство', med_update: 'промяна в лекарство', med_stop: 'спряно лекарство',
    med_renew: 'рецепта', med_delete: 'изтрито лекарство',
    results_add: 'резултати от изследвания', result_delete: 'изтрит резултат',
    assessment_add: 'попълнена скала', assessment_delete: 'изтрита скала',
    lifestyle_update: 'начин на живот', nutrition_save: 'хранителен режим', nutrition_delete: 'изтрит хранителен режим',
    assistant_feedback: 'решение по подсказка на асистента', ai_review: 'втори поглед от езиков модел',
    ai_settings: 'настройка на езиковия модел',
  };

  const rows = entries.map(e => {
    const when = new Date(e.ts);
    const details = e.action === 'patients_import'
      ? `${e.source || ''} · нови ${e.created}, допълнени ${e.updated}, пропуснати ${e.skipped}`
      : e.action === 'assistant_feedback' ? [e.name, e.status === 'reset' ? 'върната' : FEEDBACK[e.status] || e.status].filter(Boolean).join(' · ')
      : e.action === 'ai_settings' ? `${e.enabled ? 'включен' : 'изключен'} · ключ ${e.key}`
      : e.action === 'ai_review' ? [e.name, e.model, `${e.suggestions} предложения`].filter(Boolean).join(' · ')
      : [e.name, e.item, e.condition, e.med, e.tool, e.status, e.key, e.date && formatDate(e.date),
        e.ip && `от ${e.ip}`, e.network && `достъп: ${NETWORK_LABELS[e.network] || e.network}`].filter(Boolean).join(' · ');
    return h('tr', null,
      h('td.nowrap.small.mono', null,
        when.toLocaleDateString('bg-BG'), ' ', when.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })),
      h('td.small', null, e.actor ? e.actor.name : '—'),
      h('td.small', null, LABELS[e.action] || e.action),
      h('td.small.muted', null, details));
  });

  return card('Журнал на действията', { icon: '📋', tight: true },
    rows.length
      ? table(['Кога', 'Кой', 'Действие', 'Подробности'], rows)
      : empty('Журналът е празен.', null));
}
