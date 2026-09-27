/* Внасяне на цял списък с пациенти от друга програма.
 *
 * Три пътя: файл (Excel, LibreOffice, CSV, HTML, XML), поставяне на
 * копирани от Excel клетки или попълване на образеца. Програмата сама
 * разпознава коя колона какво съдържа; лекарят проверява, вижда какво ще
 * стане с всеки ред и едва тогава внася. */

import { api } from '../api.js';
import { state } from '../app.js';
import { badge, confirmDialog, downloadFile, h, modal, select, toast, mount } from '../ui/components.js';
import { TARGETS, TARGET_ORDER, columnLetter, guessMapping } from '../shared/import-columns.js';
import { makeXlsx } from '../shared/xlsx-writer.js';
import { CONDITIONS } from '../shared/chronic.js';
import { formatDate, today } from '../shared/dates.js';

const ACCEPT = '.xlsx,.xlsm,.xls,.ods,.csv,.txt,.tsv,.html,.htm,.xml';

const ACTION = {
  create: ['done', 'нов'],
  update: ['soon', 'допълване'],
  same: ['future', 'вече е въведен'],
  exists: ['future', 'вече е въведен'],
  duplicate: ['due', 'повторен ред'],
  error: ['overdue', 'не се внася'],
};

export function openImportDialog({ onDone } = {}) {
  const st = {
    step: 'source', source: '', read: null, sheet: 0, headerRow: -1, mapping: [],
    options: {
      existing: 'fill', baseline: 'assume', fixCase: true, extraToNotes: false,
      doctorId: state.doctor && state.doctor.id ? state.doctor.id : '',
    },
    dry: null, filter: 'all', busy: false, done: null, seq: 0,
  };
  const body = h('div.import');
  const foot = h('div.import-foot');
  let closeDialog = () => {};

  modal({
    title: 'Внасяне на пациенти от друга програма',
    wide: 'x',
    body: (close) => { closeDialog = close; return body; },
    actions: () => [foot],
    onClose: () => { if (st.done && onDone) onDone(); },
  });

  const sheet = () => st.read.sheets[st.sheet];
  const setFoot = (...nodes) => mount(foot, ...nodes.filter(Boolean));

  /* ------------------------------ 1. източник ------------------------------ */

  const renderSource = () => {
    st.step = 'source';
    const input = h('input', {
      type: 'file', accept: ACCEPT, hidden: true,
      onchange: (e) => { if (e.target.files[0]) readFile(e.target.files[0]); },
    });
    const drop = h('label.drop-zone', {
      ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); },
      ondragleave: () => drop.classList.remove('over'),
      ondrop: (e) => {
        e.preventDefault();
        drop.classList.remove('over');
        if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
      },
    }, input,
    h('div.drop-icon', null, '📄'),
    h('strong', null, 'Изберете файла със списъка или го пуснете тук'),
    h('div.small.muted', null, 'Excel (.xlsx, .xls), LibreOffice (.ods), CSV или текст, HTML или XML таблица — до 20 MB'),
    h('span.btn.primary', { style: { marginTop: '10px' } }, 'Избор на файл…'));

    const paste = h('textarea.paste-box', {
      rows: 5, placeholder: 'Маркирайте клетките в Excel заедно със заглавния ред, копирайте (Ctrl+C) и поставете тук (Ctrl+V).',
    });

    mount(body, 
      h('div.import-grid', null,
        h('div.stack', null,
          drop,
          h('div.or-line', null, h('span', null, 'или')),
          h('div', null,
            h('div.field-lbl', null, 'Поставете копирани клетки'),
            paste,
            h('div.row', { style: { marginTop: '6px' } },
              h('button.btn', { type: 'button', onclick: () => readPaste(paste.value) }, 'Продължи с поставеното')))),
        h('div.import-help', null,
          h('h3', null, 'Откъде да взема списъка'),
          h('ol', null,
            h('li', null, 'В медицинската програма отворете списъка на пациентите (регистъра на записаните лица).'),
            h('li', null, 'Изберете „Експорт“, „Запис в Excel“ или „Печат → Excel“. Обикновено се записва файл .xlsx, .xls или .csv.'),
            h('li', null, 'Изберете файла тук. Колоните се разпознават сами — ЕГН, имена, дата на раждане, пол, телефон, адрес, диагнози с МКБ код.')),
          h('p.small', null, h('strong', null, 'Програмата не изнася във файл? '),
            'Маркирайте таблицата на екрана, копирайте я и я поставете отляво.'),
          h('p.small', null, h('strong', null, 'Списък на ръка? '),
            'Попълнете образеца и го изберете като файл.'),
          h('button.btn.sm', { type: 'button', onclick: downloadTemplate }, '⭳ Образец за попълване (Excel)'),
          h('p.tiny.muted', { style: { marginTop: '12px' } },
            'Файлът се чете на компютъра на практиката — данните не излизат навън. Преди внасянето програмата прави копие на досегашните данни.'))));
    setFoot(h('button.btn', { type: 'button', onclick: () => closeDialog() }, 'Отказ'));
  };

  const busy = (text) => {
    mount(body, h('div.loading', null, h('div.spinner'), text));
    setFoot();
  };

  const readFile = async (file) => {
    if (file.size > 20 * 1024 * 1024) { toast('Файлът е по-голям от 20 MB.', 'error'); return; }
    busy(`Четене на „${file.name}“…`);
    try {
      const data = toBase64(await file.arrayBuffer());
      st.read = await api.importRead({ filename: file.name, data });
      st.source = file.name;
      startMapping();
    } catch (err) {
      toast(err.message, 'error');
      renderSource();
    }
  };

  const readPaste = async (text) => {
    if (!text.trim()) { toast('Няма поставен текст.', 'error'); return; }
    busy('Разчитане на поставените клетки…');
    try {
      st.read = await api.importRead({ text });
      st.source = 'поставено от Excel';
      startMapping();
    } catch (err) {
      toast(err.message, 'error');
      renderSource();
    }
  };

  /* ------------------------------ 2. колони ------------------------------ */

  const startMapping = () => {
    // Листът по подразбиране — първият с разпознат заглавен ред, иначе най-големият.
    const sheets = st.read.sheets;
    let idx = sheets.findIndex(s => s.headerRow >= 0 && !s.hidden);
    if (idx < 0) idx = sheets.reduce((best, s, i) => (s.rows.length > sheets[best].rows.length ? i : best), 0);
    selectSheet(idx);
  };

  const selectSheet = (idx) => {
    st.sheet = idx;
    st.headerRow = sheet().headerRow;
    st.mapping = sheet().mapping.slice();
    renderMapping();
  };

  const width = () => Math.max(0, ...sheet().rows.slice(0, 500).map(r => r.length));
  const dataRows = () => sheet().rows.slice(st.headerRow + 1);
  const headerLabels = () => (st.headerRow >= 0 ? sheet().rows[st.headerRow] : []);

  const renderMapping = () => {
    st.step = 'map';
    const s = sheet();
    const rows = s.rows;
    const header = headerLabels();
    const data = dataRows();

    const sheetSelect = st.read.sheets.length > 1
      ? h('label.inline-field', null, 'Лист ', select(st.read.sheets.map((x, i) => ({
        value: i, label: `${x.name} (${x.rows.length} реда)`, selected: i === st.sheet,
      })), { onchange: (e) => selectSheet(Number(e.target.value)) }))
      : null;
    const headerSelect = h('label.inline-field', null, 'Заглавен ред ', select([
      { value: -1, label: 'няма — данните са от първия ред', selected: st.headerRow < 0 },
      ...rows.slice(0, 25).map((r, i) => ({
        value: i, selected: i === st.headerRow,
        label: `ред ${i + 1}: ${r.filter(Boolean).slice(0, 4).join(' | ').slice(0, 60) || '(празен)'}`,
      })),
    ], {
      onchange: (e) => {
        st.headerRow = Number(e.target.value);
        st.mapping = guessMapping(rows, st.headerRow);
        renderMapping();
      },
    }));

    const cols = [];
    for (let c = 0; c < width(); c++) {
      const samples = data.map(r => r[c]).filter(v => v !== undefined && v !== '').slice(0, 3);
      if (!samples.length && !header[c]) continue;
      const sel = select([
        { value: '', label: '— не се внася —' },
        ...TARGET_ORDER.map(t => ({ value: t, label: TARGETS[t].label, selected: st.mapping[c] === t })),
      ], {
        class: st.mapping[c] ? 'mapped' : '',
        onchange: (e) => {
          const t = e.target.value || null;
          // Полетата за една колона не могат да се повтарят.
          if (t && !TARGETS[t].multi) st.mapping = st.mapping.map((m, i) => (m === t && i !== c ? null : m));
          st.mapping[c] = t;
          renderMapping();
        },
      });
      cols.push(h('div.map-row' + (st.mapping[c] ? '.on' : ''), null,
        h('div.map-src', null,
          h('span.col-letter', null, columnLetter(c)),
          h('div', null,
            h('strong', null, header[c] || h('span.dim', null, '(без заглавие)')),
            h('div.tiny.dim.samples', null, samples.join(' · ') || '—'))),
        sel));
    }

    const m = st.mapping;
    const missing = [];
    if (!m.some(x => ['fullName', 'firstName', 'lastName'].includes(x))) missing.push('името');
    if (!m.includes('egn') && !m.includes('birthDate')) missing.push('ЕГН или датата на раждане');

    const radio = (name, value, label, hint) => h('label.check', null,
      h('input', { type: 'radio', name, value, checked: st.options[name] === value, onchange: () => { st.options[name] = value; refresh(); } }),
      h('span', null, h('strong', null, label), hint ? h('div.tiny.dim', null, hint) : null));
    const check = (name, label, hint) => h('label.check', null,
      h('input', { type: 'checkbox', checked: st.options[name], onchange: (e) => { st.options[name] = e.target.checked; refresh(); } }),
      h('span', null, label, hint ? h('div.tiny.dim', null, hint) : null));

    const options = h('div.import-options', null,
      h('h3', null, 'Досегашна профилактика и имунизации'),
      radio('baseline', 'assume', 'Приеми за направено до днес',
        'Ваксините и прегледите със срок досега се отбелязват като „прието при внасяне“, а напомнянията започват от следващия срок. Подходящо, когато досегашната програма е водила всичко.'),
      radio('baseline', 'missed', 'Покажи всичко неотбелязано като дължимо',
        'Всяка ваксина и всеки преглед без запис излизат като просрочени — за преглед на всеки пациент.'),
      h('h3', null, 'Пациенти, които вече са в програмата'),
      radio('existing', 'fill', 'Допълни липсващите данни', 'Нищо въведено досега не се презаписва; добавят се телефон, адрес, заболявания и др.'),
      radio('existing', 'skip', 'Остави ги без промяна'),
      h('h3', null, 'Други'),
      h('label.field', null, h('span.lbl', null, 'Личен лекар на внесените'),
        select([{ value: '', label: '— без —' }, ...state.doctors.filter(d => d.active).map(d => ({
          value: d.id, label: d.name, selected: st.options.doctorId === d.id,
        }))], { onchange: (e) => { st.options.doctorId = e.target.value; refresh(); } }),
        h('div.field-hint', null, 'Ако във файла има колона „Лекар“, тя е с предимство.')),
      check('fixCase', 'Имена с главни букви → нормални', '„ИВАН ПЕТРОВ“ става „Иван Петров“.'),
      check('extraToNotes', 'Останалите колони — в бележките', 'Всичко, което не е избрано горе, се записва в бележките на досието.'));

    const preview = h('div#importPreview', null, h('div.loading', null, h('div.spinner'), 'Проверка…'));

    mount(body, 
      h('div.import-bar', null,
        h('div', null, h('strong', null, st.source), h('span.small.muted', null,
          ` · ${st.read.formatLabel}${st.read.encoding && st.read.encoding !== 'UTF-8' ? ' · ' + st.read.encoding : ''} · ${data.length} реда`)),
        h('div.row', null, sheetSelect, headerSelect)),
      missing.length ? h('div.alert-strip.warn', null, `Изберете колоната с ${missing.join(' и ')}.`) : null,
      h('div.import-map-grid', null,
        h('div', null, h('h3', null, 'Кое какво е'), h('div.map-list', null, cols)),
        options),
      preview);

    setFoot(
      h('button.btn', { type: 'button', onclick: renderSource }, '← Друг файл'),
      h('div.grow'),
      h('button.btn#importProblems', { type: 'button', onclick: downloadProblems, disabled: true }, '⭳ Проблемните редове'),
      h('button.btn.primary#importGo', { type: 'button', onclick: commit, disabled: true }, 'Внеси'));

    if (missing.length) {
      mount(preview);
      return;
    }
    refresh();
  };

  let timer = null;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(runDry, 250);
  };

  const payload = (dryRun) => ({
    rows: dataRows(),
    header: headerLabels(),
    mapping: st.mapping,
    firstRow: st.headerRow + 2,
    options: st.options,
    source: st.source,
    dryRun,
  });

  const runDry = async () => {
    const seq = ++st.seq;
    try {
      const res = await api.importPatients(payload(true));
      if (seq !== st.seq || st.step !== 'map') return;
      st.dry = res;
      renderPreview();
    } catch (err) {
      if (seq !== st.seq) return;
      const box = document.getElementById('importPreview');
      if (box) mount(box, h('div.alert-strip', null, err.message));
      const go = document.getElementById('importGo');
      if (go) go.disabled = true;
    }
  };

  const renderPreview = () => {
    const box = document.getElementById('importPreview');
    if (!box) return;
    const { summary: sm, preview, problems } = st.dry;
    const chip = (key, label, n) => (n || key === 'all'
      ? h('button.chip' + (st.filter === key ? '.active' : ''), { type: 'button', onclick: () => { st.filter = key; renderPreview(); } },
        label, h('span.count', null, ` (${n})`))
      : null);
    const list = st.filter === 'all' ? preview
      : st.filter === 'problems' ? problems
        : preview.filter(r => (st.filter === 'create' ? r.action === 'create' : r.action === 'update'));
    const rows = list.slice(0, 300).map(r => {
      const [cls, label] = ACTION[r.action] || ['', r.action];
      return h('tr' + (r.action === 'error' ? '.attention' : ''), null,
        h('td.small.dim.nowrap', null, r.line),
        h('td', null, h('strong', null, r.name || '—'), r.matchName && r.matchName !== r.name ? h('div.tiny.dim', null, 'в програмата: ' + r.matchName) : null),
        h('td.mono.small.nowrap', null, r.egn || '—'),
        h('td.small.nowrap', null, r.birthDate ? formatDate(r.birthDate) : '—', r.sex ? (r.sex === 'f' ? ' ♀' : ' ♂') : ''),
        h('td.small', null, r.chronic.map(c => CONDITIONS[c]?.name).join(', '),
          r.other.length ? h('div.tiny.dim', null, r.other.slice(0, 3).join('; ') + (r.other.length > 3 ? '…' : '')) : null),
        h('td', null, badge(cls, label), r.changes.length ? h('div.tiny.dim', null, 'ще се добави: ' + r.changes.join(', ')) : null),
        h('td.small', null, r.messages.map(m => h('div', { class: m.level === 'error' ? 'msg-error' : 'msg-warn' }, m.text))));
    });

    mount(box, 
      h('div.import-summary', null,
        stat(sm.create, 'нови досиета', 'ok'),
        stat(sm.update, 'за допълване', ''),
        stat(sm.same, 'вече въведени', 'muted'),
        stat(sm.error + sm.duplicate, 'не се внасят', sm.error + sm.duplicate ? 'danger' : 'muted'),
        stat(sm.chronic, 'с хронично заболяване', '')),
      sm.children && st.options.baseline === 'assume'
        ? h('p.small.muted', null, `${sm.children} от новите са деца — имунизациите им до днес се приемат за направени по календара.`) : null,
      h('div.chips', { style: { margin: '10px 0' } },
        chip('all', 'Всички', sm.rows),
        chip('create', 'Нови', sm.create),
        chip('update', 'За допълване', sm.update),
        chip('problems', 'Грешки и предупреждения', problems.length)),
      rows.length
        ? h('div.table-wrap.import-table', null, h('table', null,
          h('thead', null, h('tr', null, ['Ред', 'Пациент', 'ЕГН', 'Роден(а)', 'Заболявания', 'Какво ще стане', 'Бележки'].map(x => h('th', null, x)))),
          h('tbody', null, rows)))
        : h('p.muted', null, 'Няма редове в този изглед.'),
      list.length > 300 ? h('p.tiny.muted', null, `Показани са първите 300 от ${list.length}.`) : null);

    const go = document.getElementById('importGo');
    if (go) {
      const n = sm.create + sm.update;
      go.disabled = !n;
      go.textContent = !n ? 'Няма какво да се внесе'
        : `Внеси ${sm.create} ${sm.create === 1 ? 'нов пациент' : 'нови пациенти'}${sm.update ? ` и допълни ${sm.update}` : ''}`;
    }
    const pr = document.getElementById('importProblems');
    if (pr) pr.disabled = !problems.length;
  };

  const stat = (value, label, kind) => h('div.mini-stat.' + (kind || 'plain'), null, h('div.v', null, value), h('div.l', null, label));

  /* ------------------------------ 3. внасяне ------------------------------ */

  const commit = async () => {
    const sm = st.dry.summary;
    const ok = await confirmDialog({
      title: 'Внасяне на пациенти',
      message: `Ще бъдат създадени ${sm.create} досиета${sm.update ? ` и допълнени ${sm.update}` : ''}. `
        + 'Преди това програмата прави копие на досегашните данни, от което те могат да се възстановят.',
      confirmLabel: 'Внеси',
    });
    if (!ok) return;
    busy('Внасяне…');
    try {
      st.done = await api.importPatients(payload(false));
      renderDone();
    } catch (err) {
      toast(err.message, 'error');
      renderMapping();
    }
  };

  const renderDone = () => {
    st.step = 'done';
    const { done, summary: sm, problems, backup } = st.done;
    mount(body, h('div.import-done', null,
      h('div.big-check', null, '✓'),
      h('h2', null, `Внесени са ${done.created} ${done.created === 1 ? 'нов пациент' : 'нови пациенти'}`),
      done.updated ? h('p', null, `Допълнени са данните на ${done.updated} вече въведени.`) : null,
      sm.error + sm.duplicate ? h('p', null, `${sm.error + sm.duplicate} реда не са внесени — изтеглете ги, поправете и ги внесете отново.`) : null,
      h('p.small.muted', null, `Копие на данните преди внасянето: ${backup} (в папката backups).`),
      st.options.baseline === 'assume'
        ? h('p.small.muted', null, 'Досегашната профилактика е приета за направена към днес. Проследяването на хроничните заболявания започва от днес.')
        : null));
    setFoot(
      problems.length ? h('button.btn', { type: 'button', onclick: downloadProblems }, '⭳ Невнесените редове') : null,
      h('div.grow'),
      h('button.btn.primary', { type: 'button', onclick: () => { closeDialog(); location.hash = '#/patients'; } }, 'Към пациентите'));
  };

  /* --------------------------------- файлове --------------------------------- */

  function downloadProblems() {
    const res = st.step === 'done' ? st.done : st.dry;
    if (!res || !res.problems.length) return;
    const rows = sheet().rows;
    const header = headerLabels().length ? headerLabels() : Array.from({ length: width() }, (_, i) => `Колона ${columnLetter(i)}`);
    const out = [['Ред', 'Проблем', ...header]];
    for (const p of res.problems) {
      out.push([String(p.line), p.messages.map(m => m.text).join('; '), ...(rows[p.line - 1] || [])]);
    }
    downloadFile(makeXlsx([{ name: 'За поправка', rows: out, widths: [6, 50, ...header.map(() => 18)] }]),
      `za-popravka-${today()}.xlsx`);
  }

  renderSource();
}

/** Образец за попълване на ръка. Примерите са в листа „Указания“, за да не се внесат по невнимание. */
export function downloadTemplate() {
  const header = ['Име', 'Презиме', 'Фамилия', 'ЕГН', 'Дата на раждане', 'Пол', 'Телефон', 'Адрес', 'Алергии', 'Диагнози (МКБ)', 'Бележки'];
  const help = [
    ['Как се попълва листът „Пациенти“'],
    [''],
    ['Всеки ред е един пациент. Първият ред със заглавията не се изтрива.'],
    ['Задължителни са името и ЕГН (или датата на раждане, ако няма ЕГН).'],
    ['При валидно ЕГН датата на раждане и полът се попълват сами — тези колони могат да останат празни.'],
    ['Дата на раждане: 14.03.1958 или като дата в Excel. Пол: м или ж.'],
    ['Диагнози: кодове по МКБ-10, разделени с „;“, например I10; E11.9; J45. Хипертонията, диабетът, астмата и'],
    ['другите хронични заболявания се разпознават и за тях започва диспансерното проследяване.'],
    ['Алергии: разделени със запетая.'],
    [''],
    ['Пример:'],
    header,
    ['Иван', 'Петров', 'Георгиев', '5803140426', '14.03.1958', 'м', '0888 123 456', 'гр. София, ул. Родопи 12', 'пеницилин', 'I10; E11.9', ''],
    ['Ема', 'Георгиева', 'Колева', '1941250899', '25.01.2019', 'ж', '0899 765 432', 'гр. София', '', 'J45', 'майка: Мария, 0887 555 111'],
  ];
  downloadFile(makeXlsx([
    { name: 'Пациенти', rows: [header], widths: [14, 14, 16, 13, 15, 6, 15, 30, 16, 20, 30], dateColumns: [4] },
    { name: 'Указания', rows: help, widths: [14, 14, 16, 13, 15, 6, 15, 30, 16, 20, 30], header: false },
  ]), 'obrazec-pacienti.xlsx');
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
