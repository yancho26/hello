/* Проверки на раздела за нервно-психическо развитие. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS, CHECKPOINTS, CHECKPOINT_AGES, CHECKPOINT_BY_AGE, DOMAIN_ORDER,
  SCREENING_AT, TOTAL_MILESTONES, assessRecord, checkpointFor,
  developmentSummary, labelForAge, nextCheckpointAfter,
} from '../public/js/shared/development.js';

test('контролните възрасти съвпадат със схемата на CDC от 2022 г.', () => {
  assert.deepEqual(CHECKPOINT_AGES, [2, 4, 6, 9, 12, 15, 18, 24, 30, 36, 48, 60],
    'включително добавените през 2022 г. листове на 15 и 30 месеца');
  assert.equal(TOTAL_MILESTONES, 155);
});

test('всеки етап има код, област и двата текста', () => {
  const ids = new Set();
  for (const cp of CHECKPOINTS) {
    assert.ok(cp.items.length >= 8, `${cp.ageMonths} мес. има твърде малко етапи`);
    for (const item of cp.items) {
      assert.ok(!ids.has(item.id), 'дублиран код ' + item.id);
      ids.add(item.id);
      assert.ok(DOMAIN_ORDER.includes(item.domain));
      assert.ok(item.bg && item.bg.length > 3, 'липсва български текст: ' + item.id);
      assert.ok(item.en && item.en.length > 3, 'липсва оригинал: ' + item.id);
      assert.ok(!/[a-zA-Z]{4}/.test(item.bg), 'непреведен текст: ' + item.bg);
    }
    // Четирите области присъстват навсякъде освен там, където CDC няма етапи.
    assert.ok(cp.items.some(i => i.domain === 'motor'), `${cp.ageMonths} мес. без моторика`);
  }
});

test('скринингите са на препоръчаните възрасти', () => {
  assert.deepEqual(SCREENING_AT[9], ['general']);
  assert.deepEqual(SCREENING_AT[18], ['general', 'autism']);
  assert.deepEqual(SCREENING_AT[24], ['autism']);
  assert.deepEqual(SCREENING_AT[30], ['general']);
  assert.equal(CHECKPOINT_BY_AGE.get(12).screening.length, 0, 'на 12 мес. няма задължителен скрининг');
});

test('избира се контролната възраст, която вече е настъпила', () => {
  assert.equal(checkpointFor(0), null, 'за новородено още няма настъпил лист');
  assert.equal(nextCheckpointAfter(0).ageMonths, 2, 'първият предстоящ е на 2 месеца');
  assert.equal(checkpointFor(2).ageMonths, 2);
  assert.equal(checkpointFor(10).ageMonths, 9);
  assert.equal(checkpointFor(22).ageMonths, 18);
  // Половин месец толеранс: дете дни преди рождения ден се преглежда по
  // предстоящия лист, защото това е прегледът, на който идва.
  assert.equal(checkpointFor(23.9).ageMonths, 24);
  assert.equal(checkpointFor(70).ageMonths, 60);
  assert.equal(nextCheckpointAfter(10).ageMonths, 12);
  assert.equal(nextCheckpointAfter(60), null);
});

/* --------------------------- оценка на запис --------------------------- */

const answersFor = (age, value) => {
  const cp = CHECKPOINT_BY_AGE.get(age);
  return Object.fromEntries(cp.items.map(i => [i.id, value]));
};

test('покрити всички етапи — развитие по възраст', () => {
  const r = assessRecord({ checkpoint: 9, answers: answersFor(9, 'yes') });
  assert.equal(r.status, 'ok');
  assert.equal(r.notMet, 0);
  assert.equal(r.met, r.total);
  assert.equal(r.action.severity, 0);
});

test('един непокрит етап води до стандартизиран скрининг, не до изчакване', () => {
  const cp = CHECKPOINT_BY_AGE.get(9);
  const answers = answersFor(9, 'yes');
  answers[cp.items[0].id] = 'not_yet';
  const r = assessRecord({ checkpoint: 9, answers });
  assert.equal(r.status, 'screen');
  assert.equal(r.notMet, 1);
  assert.equal(r.missing[0].id, cp.items[0].id);
  assert.match(ACTIONS.screen.detail, /75-и персентил/);
});

test('несигурен отговор води само до проследяване', () => {
  const cp = CHECKPOINT_BY_AGE.get(12);
  const answers = answersFor(12, 'yes');
  answers[cp.items[0].id] = 'unsure';
  const r = assessRecord({ checkpoint: 12, answers });
  assert.equal(r.status, 'watch');
  assert.equal(r.unsure, 1);
});

test('загубата на умение е с най-висок приоритет', () => {
  const r = assessRecord({ checkpoint: 24, answers: answersFor(24, 'yes'), lostSkills: true });
  assert.equal(r.status, 'red_flag', 'дори при всички покрити етапи');
  assert.equal(r.action.severity, 2);
  assert.match(r.action.detail, /без изчакване/);
});

test('положителният скрининг води до насочване', () => {
  const r = assessRecord({
    checkpoint: 18, answers: answersFor(18, 'yes'),
    screening: { tool: 'mchat', result: 'positive' },
  });
  assert.equal(r.status, 'refer');

  const borderline = assessRecord({
    checkpoint: 18, answers: answersFor(18, 'yes'),
    screening: { tool: 'asq3', result: 'borderline' },
  });
  assert.equal(borderline.status, 'watch');
});

test('притеснението на родителя само по себе си вдига проследяване', () => {
  const r = assessRecord({ checkpoint: 6, answers: answersFor(6, 'yes'), parentConcern: true });
  assert.equal(r.status, 'watch');
});

test('неотговорените етапи не се броят за непокрити', () => {
  const r = assessRecord({ checkpoint: 30, answers: {} });
  assert.equal(r.notMet, 0);
  assert.equal(r.unanswered, r.total);
  assert.equal(r.status, 'ok', 'празен формуляр не бива да ражда тревога');
});

/* ------------------------------ обобщение ------------------------------ */

const child = (over = {}) => ({
  sex: 'm', birthDate: '2025-09-04', birth: { gestWeeks: 40 }, ...over,
});

test('обобщението показва коя контролна възраст се пада сега', () => {
  const s = developmentSummary(child(), [], 12.2);
  assert.equal(s.dueCheckpoint.ageMonths, 12);
  assert.equal(s.dueDone, false);
  assert.equal(s.coverage.expected, 5, 'на 12 мес. се падат листовете 2, 4, 6, 9 и 12');
  assert.equal(s.coverage.done, 0);
});

test('попълненият лист се отчита като извършен', () => {
  const records = [{ id: 'r1', date: '2026-09-04', checkpoint: 12, answers: answersFor(12, 'yes') }];
  const s = developmentSummary(child(), records, 12.2);
  assert.equal(s.dueDone, true);
  assert.equal(s.coverage.done, 1);
  assert.equal(s.latest.status, 'ok');
  assert.equal(s.concerns.length, 0);
});

test('находките от развитието влизат в обобщението', () => {
  const cp = CHECKPOINT_BY_AGE.get(9);
  const answers = answersFor(9, 'yes');
  answers[cp.items[0].id] = 'not_yet';
  answers[cp.items[1].id] = 'not_yet';
  const s = developmentSummary(child(), [{ id: 'r1', date: '2026-06-04', checkpoint: 9, answers }], 10);
  assert.equal(s.concerns.length, 1);
  assert.equal(s.concerns[0].severity, 2);
  assert.match(s.concerns[0].title, /Развитие \(9 мес\.\)/);
  assert.match(s.concerns[0].detail, /Непокрити етапи/);
});

test('при недоносеност се ползва коригирана възраст', () => {
  // Родено на 30 г.с.: на 12 месеца хронологично е около 9.7 коригирано.
  const preterm = child({ birth: { gestWeeks: 30 } });
  const s = developmentSummary(preterm, [], 12);
  assert.ok(s.age.corrected);
  assert.equal(s.dueCheckpoint.ageMonths, 9,
    'оценява се по листа за 9 месеца, а не за 12');

  const term = developmentSummary(child(), [], 12);
  assert.equal(term.age.corrected, false);
  assert.equal(term.dueCheckpoint.ageMonths, 12);
});

test('надписите за възраст са четими', () => {
  assert.equal(labelForAge(9), '9 мес.');
  assert.equal(labelForAge(24), '2 г.');
  assert.equal(labelForAge(30), '2 г. 6 мес.');
  assert.equal(labelForAge(60), '5 г.');
});

test('за новородено разделът показва предстоящия лист, а не грешка', () => {
  const s = developmentSummary(child(), [], 0.5);
  assert.equal(s.dueCheckpoint, null);
  assert.equal(s.dueDone, false);
  assert.equal(s.coverage.expected, 0);
  assert.equal(s.concerns.length, 0);
});

test('активна е находката от последната оценка, а не от старите', () => {
  const cp9 = CHECKPOINT_BY_AGE.get(9);
  const bad9 = answersFor(9, 'yes');
  bad9[cp9.items[0].id] = 'not_yet';

  const records = [
    { id: 'r1', date: '2026-01-04', checkpoint: 9, answers: bad9 },
    { id: 'r2', date: '2026-09-04', checkpoint: 12, answers: answersFor(12, 'yes') },
  ];
  const s = developmentSummary(child(), records, 12.5);
  assert.equal(s.concerns.length, 0, 'последната оценка е чиста — детето не се маркира');
  assert.equal(s.history.length, 1, 'но старата находка остава в историята');
  assert.match(s.history[0].title, /9 мес/);
});

test('загубата на умение остава видима и след добра последваща оценка', () => {
  const records = [
    { id: 'r1', date: '2026-01-04', checkpoint: 9, answers: answersFor(9, 'yes'), lostSkills: true },
    { id: 'r2', date: '2026-09-04', checkpoint: 12, answers: answersFor(12, 'yes') },
  ];
  const s = developmentSummary(child(), records, 12.5);
  assert.equal(s.concerns.length, 1);
  assert.match(s.concerns[0].title, /Незабавно насочване/);
});
