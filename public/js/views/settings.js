/* Настройки: практика, потребители, календар, данни и журнал. */

import { api } from '../api.js';
import { refreshBootstrap, state } from '../app.js';
import {
  badge, card, confirmDialog, decimalFields, empty, field, h, input, modal, mount,
  numberInput, select, table, toast,
} from '../ui/components.js';
import { formatDate } from '../shared/dates.js';
import { CALENDAR_VERIFIED, GROUPS } from '../shared/calendar.js';

let tab = 'practice';

const TABS = [
  { id: 'practice', label: 'Практика' },
  { id: 'doctors', label: 'Потребители' },
  { id: 'schedule', label: 'Календар' },
  { id: 'data', label: 'Данни и копия' },
  { id: 'audit', label: 'Журнал' },
];

export async function renderSettings(host) {
  const rerender = () => renderSettings(host);
  const bar = h('div.tabs.no-print', null, TABS.map(t =>
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
    practice: practiceTab, doctors: doctorsTab, schedule: scheduleTab,
    data: dataTab, audit: auditTab,
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
        practice: { name: d.name, address: d.address, phone: d.phone },
        horizonDays: d.horizonDays,
        requireLogin: d.requireLogin === 'on',
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
    h('div.full', null, h('button.btn.primary', { type: 'submit' }, 'Запази')));

  return card('Данни на практиката', { icon: '🏥' }, form);
}

/* ------------------------------- потребители --------------------------------- */

async function doctorsTab(rerender) {
  const rows = state.doctors.map(d => h('tr', null,
    h('td.name-cell', null, d.name),
    h('td.small.muted', null, d.role || ''),
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
  }, table(['Име', 'Длъжност', 'ПИН', 'Състояние', ''], rows));
}

function doctorDialog(doctor, rerender) {
  let form;
  const submit = async (close) => {
    const d = Object.fromEntries(new FormData(form));
    if (d.pin && d.pin !== d.pin2) { toast('Двата ПИН-а не съвпадат.', 'error'); return; }
    const payload = { name: d.name, role: d.role };
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
        h('div.full', null, field('Длъжност', input({
          name: 'role', value: doctor ? doctor.role || '' : 'Общопрактикуващ лекар',
        }))),
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

async function scheduleTab(rerender) {
  const groups = ['vaccine', 'screening', 'checkup'];

  const sections = groups.map(g => {
    const items = state.schedule.filter(i => i.group === g).sort((a, b) => a.dueMonths - b.dueMonths);
    if (!items.length) return null;
    const rows = items.map(i => h('tr', { style: { opacity: i.disabled ? .5 : 1 } },
      h('td', null,
        h('div', { style: { fontWeight: '600' } }, i.name),
        i.note ? h('div.tiny.dim', null, i.note) : null),
      h('td.nowrap.mono.small', null, i.dueMonths + ' мес.'),
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
    h('div.alert-strip.info', null,
      h('div', null,
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
            message: 'Всички промени по календара ще бъдат отменени. Данните за децата не се засягат.',
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
  const submit = async (close) => {
    const d = decimalFields(Object.fromEntries(new FormData(form)), ['dueMonths', 'graceMonths']);
    const payload = {
      name: d.name, short: d.short, note: d.note,
      dueMonths: d.dueMonths, graceMonths: d.graceMonths,
      mandatory: d.mandatory === 'on',
    };
    try {
      if (item) await api.updateScheduleItem(item.id, payload);
      else await api.addScheduleItem({ ...payload, group: d.group });
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
        h('div', null, field('Възраст (месеци)',
          numberInput({ name: 'dueMonths', min: 0, max: 240, required: true,
            value: item ? item.dueMonths : '' }),
          '0 = при раждане, 12 = на 1 година')),
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
      a.download = `detska-konsultacia-${new Date().toISOString().slice(0, 10)}.json`;
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

  return h('div.stack', null,
    card('Резервни копия', { icon: '💾' },
      h('p.small.muted', null,
        'Сървърът прави автоматично копие всеки ден при първата промяна и пази последните 60 дни '
        + 'в папка „data/backups“. Свалете копие и извън компютъра — на външен диск или защитена папка.'),
      h('div.row', null,
        h('button.btn.primary', { onclick: doExport }, '⬇ Свали пълно копие (JSON)'),
        h('button.btn', { onclick: () => fileInput.click() }, '⬆ Възстанови от файл'),
        fileInput)),

    card('Къде се пазят данните', { icon: '🔒' },
      h('p.small', null,
        'Всички данни стоят на компютъра, на който работи програмата — в папка „data“ до нея. '
        + 'Нищо не се изпраща в интернет и няма външни услуги.'),
      h('p.small.muted', { style: { marginBottom: 0 } },
        'Данните за деца пациенти са лични данни за здравословно състояние. Достъпът до компютъра, '
        + 'резервните копия и мрежата на кабинета са отговорност на практиката като администратор на лични данни.')));
}

/* ---------------------------------- журнал ----------------------------------- */

async function auditTab() {
  const { entries } = await api.audit(200);

  const LABELS = {
    login: 'вписване', login_failed: 'неуспешен вход', setup: 'първоначална настройка',
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
  };

  const rows = entries.map(e => {
    const when = new Date(e.ts);
    const details = [e.name, e.item, e.status, e.date && formatDate(e.date)].filter(Boolean).join(' · ');
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
      : empty('Журналът е празен.', '·'));
}
