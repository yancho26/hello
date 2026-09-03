import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, addMonths, daysBetween, formatAge, formatDate, monthsBetween, relativeDays,
} from '../public/js/shared/dates.js';
import * as egn from '../public/js/shared/egn.js';
import { computePlan, practiceTasks, summarize } from '../public/js/shared/schedule.js';
import { defaultSchedule } from '../public/js/shared/calendar.js';

test('добавянето на месеци притиска деня към края на месеца', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');   // високосна
  assert.equal(addMonths('2024-02-29', 12), '2025-02-28');
  assert.equal(addMonths('2025-11-15', 2), '2026-01-15');
  assert.equal(addMonths('2026-03-10', -3), '2025-12-10');
  assert.equal(addMonths('2026-05-31', 18), '2027-11-30');
});

test('разликите в дни и месеци са точни през граници на година', () => {
  assert.equal(daysBetween('2025-12-31', '2026-01-01'), 1);
  assert.equal(daysBetween('2024-02-28', '2024-03-01'), 2); // високосна година
  assert.equal(daysBetween('2026-01-01', '2025-12-31'), -1);
  assert.equal(monthsBetween('2025-06-20', '2026-07-14'), 12);
  assert.equal(monthsBetween('2025-06-20', '2026-07-20'), 13);
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

test('възрастта се изписва по начина, по който я казва лекарят', () => {
  assert.equal(formatAge('2026-09-01', '2026-09-15'), '14 дни');
  assert.equal(formatAge('2026-06-01', '2026-09-03'), '3 мес.');
  assert.equal(formatAge('2026-06-01', '2026-09-20'), '3 мес. 2 седм.');
  assert.equal(formatAge('2024-09-03', '2026-09-03'), '2 г.');
  assert.equal(formatAge('2024-06-03', '2026-09-03'), '2 г. 3 мес.');
  assert.equal(formatDate('2026-03-05'), '05.03.2026 г.');
});

test('относителните дати са четими', () => {
  assert.equal(relativeDays('2026-09-03', '2026-09-03'), 'днес');
  assert.equal(relativeDays('2026-09-04', '2026-09-03'), 'утре');
  assert.equal(relativeDays('2026-09-02', '2026-09-03'), 'вчера');
  assert.equal(relativeDays('2026-09-13', '2026-09-03'), 'след 10 дни');
  assert.equal(relativeDays('2026-08-24', '2026-09-03'), 'преди 10 дни');
});

test('ЕГН се разчита правилно', () => {
  // 2003 г.: месец 47 = юли 2000+
  const a = egn.parse('0347129552');
  assert.equal(a.birthDate, '2003-07-12');
  // 19xx: месецът е без добавка
  assert.equal(egn.birthDate('7501011234'), '1975-01-01');
  // 18xx: месец +20
  assert.equal(egn.birthDate('8523151234'), '1885-03-15');
  // Деветата цифра: четна за момче, нечетна за момиче
  assert.equal(egn.sex('0347129552'), 'f');
  assert.equal(egn.sex('0347129562'), 'm');
  assert.equal(a.sex, 'f');
  // Несъществуващи дати се отхвърлят
  assert.equal(egn.birthDate('9902310000'), null, '31 февруари не съществува');
  assert.equal(egn.birthDate('991331000'), null, 'къс низ');
  assert.equal(egn.parse('abc'), null);
});

test('контролната цифра на ЕГН се проверява', () => {
  // Проверка на алгоритъма: изчисляваме коректната последна цифра и я сверяваме.
  const base = '758300100';
  const weights = [2, 4, 8, 5, 10, 9, 7, 3, 6];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(base[i]), 0);
  const check = (sum % 11) % 10;
  assert.ok(egn.checksumValid(base + check));
  assert.ok(!egn.checksumValid(base + ((check + 1) % 10)));
});

/* --------------------------- график на дейностите --------------------------- */

const SCHEDULE = defaultSchedule();
const child = (over = {}) => ({
  id: 'p1', name: 'Тест Тестов', birthDate: '2026-01-15', sex: 'm', records: {}, ...over,
});

test('дължимите дати се смятат спрямо рождената дата', () => {
  const plan = computePlan(child(), SCHEDULE, { asOf: '2026-03-20' });
  const byId = Object.fromEntries(plan.map(e => [e.id, e]));
  assert.equal(byId['hexa-1'].due, '2026-03-15');   // 2 месеца
  assert.equal(byId['mmr-1'].due, '2027-02-15');    // 13 месеца
  assert.equal(byId['td-17'].due, '2043-01-15');    // 17 години
});

test('статусите отразяват срока и гратисния период', () => {
  const plan = computePlan(child(), SCHEDULE, { asOf: '2026-03-20', horizonDays: 30 });
  const byId = Object.fromEntries(plan.map(e => [e.id, e]));
  assert.equal(byId['hexa-1'].status, 'due', 'падежът е преди 5 дни — още е в срок');
  assert.equal(byId['hexa-2'].status, 'soon', 'следващият прием е след 26 дни');
  assert.equal(byId['mmr-1'].status, 'future');
  assert.equal(byId['hepb-1'].status, 'overdue', 'при раждане, гратисът е изтекъл');
});

test('поставена ваксина се отчита като изпълнена', () => {
  const p = child({ records: { 'hexa-1': { status: 'done', date: '2026-03-16', batch: 'X1' } } });
  const byId = Object.fromEntries(computePlan(p, SCHEDULE, { asOf: '2026-03-20' }).map(e => [e.id, e]));
  assert.equal(byId['hexa-1'].status, 'done');
  assert.equal(byId['hexa-1'].doneDate, '2026-03-16');
});

test('закъснял прием измества следващия с минималния интервал', () => {
  // Първият прием е поставен на 5 месеца вместо на 2. Вторият не може да е
  // на 3-месечна възраст — дължи се месец след действително поставения.
  const p = child({ records: { 'hexa-1': { status: 'done', date: '2026-06-20' } } });
  const byId = Object.fromEntries(computePlan(p, SCHEDULE, { asOf: '2026-06-25' }).map(e => [e.id, e]));
  assert.equal(byId['hexa-2'].due, '2026-07-20', 'изместено с един месец след реалната дата');
  assert.equal(byId['hexa-2'].status, 'soon');
  // Третият прием също се измества спрямо втория чрез първия.
  assert.ok(byId['hexa-3'].due >= '2026-07-20');
});

test('медицинският отвод спира напомнянето, но се връща след изтичането му', () => {
  const rec = { status: 'deferred', deferUntil: '2026-04-30', reason: 'Остро фебрилно заболяване' };
  const p = child({ records: { 'hexa-1': rec } });

  const active = computePlan(p, SCHEDULE, { asOf: '2026-04-10' }).find(e => e.id === 'hexa-1');
  assert.equal(active.status, 'deferred');

  const expired = computePlan(p, SCHEDULE, { asOf: '2026-05-01' }).find(e => e.id === 'hexa-1');
  assert.equal(expired.status, 'deferral_ended', 'изтеклият отвод трябва да се върне в списъка');
});

test('отказът на родител се помни и не се брои за просрочие', () => {
  const p = child({ records: { 'mmr-1': { status: 'refused', date: '2027-02-20' } } });
  const s = summarize(p, SCHEDULE, { asOf: '2027-06-01' });
  const mmr = s.plan.find(e => e.id === 'mmr-1');
  assert.equal(mmr.status, 'refused');
  assert.equal(s.counts.refused, 1);
});

test('препоръчителните ваксини се включват само при изрично отбелязване', () => {
  const without = computePlan(child(), SCHEDULE, { asOf: '2026-06-01' });
  assert.ok(!without.some(e => e.id === 'rota-1'), 'ротавирус не се показва по подразбиране');

  const with_ = computePlan(child({ optIn: ['rota-1', 'rota-2'] }), SCHEDULE, { asOf: '2026-06-01' });
  assert.ok(with_.some(e => e.id === 'rota-1'), 'включената препоръчителна ваксина се показва');
});

test('обхватът на имунизациите брои само дължимите до момента', () => {
  const p = child({
    records: {
      'hepb-1': { status: 'done', date: '2026-01-15' },
      'bcg': { status: 'done', date: '2026-01-16' },
      'hexa-1': { status: 'done', date: '2026-03-15' },
    },
  });
  const s = summarize(p, SCHEDULE, { asOf: '2026-03-20' });
  // Дължими до 20.03: хеп. Б, БЦЖ, хекса I, пневмо I. Изпълнени са 3 от 4.
  assert.equal(s.coverageDue, 4);
  assert.equal(s.coverageDone, 3);
  assert.equal(s.coverage, 75);
});

test('дете, което не е било водено, излиза с всички просрочени дейности', () => {
  const late = child({ birthDate: '2024-01-15' });
  const s = summarize(late, SCHEDULE, { asOf: '2026-09-03' });
  assert.ok(s.counts.overdue > 10, 'всички пропуснати дейности се виждат наведнъж');
  assert.equal(s.coverage, 0);
  assert.ok(s.needsAttention);
});

test('задачите на практиката се подреждат по спешност', () => {
  const patients = [
    child({ id: 'a', name: 'Просрочен', birthDate: '2025-01-15' }),
    child({ id: 'b', name: 'Предстоящ', birthDate: '2026-07-20' }),
  ];
  const tasks = practiceTasks(patients, SCHEDULE, { asOf: '2026-09-03', horizonDays: 30 });
  assert.equal(tasks[0].status, 'overdue');
  assert.ok(tasks.every(t => t.status !== 'done' && t.status !== 'future'));
  // Филтърът по лекар работи.
  const mine = practiceTasks(patients.map(p => ({ ...p, doctorId: 'd1' })), SCHEDULE,
    { asOf: '2026-09-03', doctorId: 'd2' });
  assert.equal(mine.length, 0);
});

test('архивираните деца отпадат от задачите', () => {
  const patients = [child({ id: 'a', birthDate: '2025-01-15', archived: true })];
  assert.equal(practiceTasks(patients, SCHEDULE, { asOf: '2026-09-03' }).length, 0);
});

test('календарът по подразбиране е свързан коректно', () => {
  const ids = new Set();
  for (const item of SCHEDULE) {
    assert.ok(item.id && !ids.has(item.id), `дублиран код: ${item.id}`);
    ids.add(item.id);
    assert.ok(item.name, 'липсва наименование');
    assert.ok(Number.isFinite(item.dueMonths), `невалиден срок при ${item.id}`);
    assert.ok(['vaccine', 'checkup', 'screening'].includes(item.group), `невалидна група при ${item.id}`);
    if (item.minMonths !== undefined) {
      assert.ok(item.minMonths <= item.dueMonths, `${item.id}: минималната възраст е след срока`);
    }
  }
  // Задължителната имунизация срещу варицела (в сила от 01.07.2026 г.) присъства.
  assert.ok(SCHEDULE.some(i => i.id === 'varicella-1' && i.mandatory));
  assert.ok(SCHEDULE.some(i => i.id === 'varicella-2' && i.mandatory));
});

test('пропуснат профилактичен преглед изтича, когато дойде следващият', () => {
  // Дете на 5 години без нито един отбелязан преглед: прегледът на 3 месеца
  // отдавна не подлежи на извършване и не бива да стои като задача.
  const s = summarize(child({ birthDate: '2021-09-03' }), SCHEDULE, { asOf: '2026-09-03' });
  const early = s.plan.find(e => e.id === 'chk-3');
  assert.equal(early.status, 'missed');

  // Текущият по възраст преглед обаче е дължим.
  const current = s.plan.find(e => e.id === 'chk-60');
  assert.ok(['due', 'overdue'].includes(current.status), 'текущият преглед е актуален, а не пропуснат');
});

test('непоставена ваксина остава просрочена независимо от възрастта', () => {
  // Наваксваща имунизация е възможна на всяка възраст — МПР не изтича.
  const s = summarize(child({ birthDate: '2018-09-03' }), SCHEDULE, { asOf: '2026-09-03' });
  const mmr = s.plan.find(e => e.id === 'mmr-1');
  assert.equal(mmr.status, 'overdue', 'ваксините никога не се водят пропуснати');
  assert.ok(mmr.overdueDays > 2000);
});

test('скринингите с изричен срок изтичат', () => {
  const s = summarize(child({ birthDate: '2024-09-03' }), SCHEDULE, { asOf: '2026-09-03' });
  // Ехографията на тазобедрените стави няма смисъл на 2 години.
  assert.equal(s.plan.find(e => e.id === 'hip-screen').status, 'missed');
  // Проба Манту на 7 г. няма зададен срок и остава актуална, когато дойде.
  assert.ok(['future', 'soon'].includes(s.plan.find(e => e.id === 'mantoux-7').status));
});

test('пропуснатите не влизат в задачите на практиката', () => {
  const patients = [child({ id: 'a', birthDate: '2021-09-03' })];
  const tasks = practiceTasks(patients, SCHEDULE, { asOf: '2026-09-03' });
  assert.ok(tasks.every(t => t.status !== 'missed'));
  // Но се броят в обобщението на досието.
  const s = summarize(patients[0], SCHEDULE, { asOf: '2026-09-03' });
  assert.ok(s.counts.missed > 10, 'пропуснатите се виждат в досието');
});
