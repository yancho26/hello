/* Заболявания по МКБ-10 в хранителния режим.
 *
 * Лекарят въвежда всички диагнози на човека с кодовете им. Всеки код се свързва с
 * профил: какво се променя в режима (цел, енергия, белтък, течности, калий, ограничения,
 * храни, които се изключват или избягват) и защо — с насоката. Кодовете без хранителни
 * правила също се показват, за да е ясно, че са взети предвид.
 * Общо за сървъра и интерфейса. */

import { normIcd } from './icd.js';
import { CONDITIONS } from './chronic.js';

/** Кодът е буква + 2 цифри (+ точка и 1–2 цифри). */
export const ICD_RE = /^[A-Z]\d{2}(\.\d{1,2})?$/;
export const validIcd = (code) => ICD_RE.test(normIcd(code));

/* Чести диагнози с кратко име — за търсене при въвеждане. Може да се въведе и всеки друг код. */
export const DX = [
  // Сърце, съдове, бъбреци
  ['I10', 'Артериална хипертония'], ['I11', 'Хипертонична болест на сърцето'], ['I20', 'Стенокардия'],
  ['I21', 'Остър миокарден инфаркт'], ['I25', 'Хронична исхемична болест на сърцето'], ['I48', 'Предсърдно мъждене'],
  ['I50', 'Сърдечна недостатъчност'], ['I63', 'Мозъчен инфаркт'], ['I69', 'Последици от мозъчно-съдова болест'],
  ['I70', 'Атеросклероза'], ['I73.9', 'Периферна артериална болест'], ['I83', 'Разширени вени на краката'],
  ['N18.1', 'ХБЗ, стадий 1'], ['N18.2', 'ХБЗ, стадий 2'], ['N18.3', 'ХБЗ, стадий 3'], ['N18.4', 'ХБЗ, стадий 4'],
  ['N18.5', 'ХБЗ, стадий 5'], ['N18.9', 'Хронично бъбречно заболяване, неуточнено'], ['Z99.2', 'Хемодиализа'],
  ['N20', 'Камъни в бъбреците и уретера'], ['N39.0', 'Инфекция на пикочните пътища'],
  // Обмяна, ендокринни
  ['E10', 'Захарен диабет тип 1'], ['E11', 'Захарен диабет тип 2'], ['R73.0', 'Нарушен глюкозен толеранс'],
  ['O24.4', 'Гестационен диабет'], ['E66', 'Затлъстяване'], ['E78.0', 'Хиперхолестеролемия'],
  ['E78.1', 'Хипертриглицеридемия'], ['E78.2', 'Смесена хиперлипидемия'], ['E79.0', 'Хиперурикемия'],
  ['M10', 'Подагра'], ['E03', 'Хипотиреоидизъм'], ['E06.3', 'Автоимунен тиреоидит'], ['E05', 'Хипертиреоидизъм'],
  ['E28.2', 'Синдром на поликистозните яйчници'], ['E55', 'Недостиг на витамин D'], ['E83.1', 'Хемохроматоза'],
  ['E87.5', 'Хиперкалиемия'], ['E87.6', 'Хипокалиемия'], ['E87.1', 'Хипонатриемия'], ['E73', 'Непоносимост към лактоза'],
  ['E70.0', 'Фенилкетонурия'], ['E74.1', 'Непоносимост към фруктоза'],
  ['E44', 'Белтъчно-енергийно недохранване'], ['E46', 'Недохранване, неуточнено'], ['R63.4', 'Необяснима загуба на тегло'],
  ['R64', 'Кахексия'], ['M62.5', 'Мускулна загуба (саркопения)'],
  // Храносмилане и черен дроб
  ['K21', 'Гастроезофагеална рефлуксна болест'], ['K29', 'Гастрит'], ['K25', 'Язва на стомаха'], ['K26', 'Язва на дванадесетопръстника'],
  ['K58', 'Синдром на раздразненото черво'], ['K57', 'Дивертикулоза на червата'], ['K59.0', 'Запек'],
  ['K50', 'Болест на Крон'], ['K51', 'Улцерозен колит'], ['K90.0', 'Цьолиакия'],
  ['K76.0', 'Стеатоза на черния дроб (MASLD)'], ['K70', 'Алкохолна болест на черния дроб'], ['K74', 'Фиброза и цироза на черния дроб'],
  ['K80', 'Жлъчнокаменна болест'], ['K81', 'Холецистит'], ['K86.1', 'Хроничен панкреатит'], ['R13', 'Затруднено преглъщане (дисфагия)'],
  ['Z98.8', 'Състояние след бариатрична операция'],
  // Кръв
  ['D50', 'Желязодефицитна анемия'], ['D51', 'Анемия от недостиг на витамин B12'], ['D52', 'Анемия от недостиг на фолат'],
  // Опорно-двигателни, белодробни, нервни, психични
  ['M80', 'Остеопороза с фрактура'], ['M81', 'Остеопороза'], ['M05', 'Ревматоиден артрит'], ['M17', 'Гонартроза'],
  ['J44', 'ХОББ'], ['J45', 'Бронхиална астма'], ['G40', 'Епилепсия'], ['G43', 'Мигрена'], ['G20', 'Болест на Паркинсон'],
  ['F00', 'Деменция при болест на Алцхаймер'], ['F03', 'Деменция'], ['F32', 'Депресивен епизод'], ['F41', 'Тревожно разстройство'],
  ['F10', 'Психични разстройства от употреба на алкохол'], ['F50', 'Хранително разстройство'],
  // Онкологични
  ['C18', 'Рак на дебелото черво'], ['C34', 'Рак на белия дроб'], ['C50', 'Рак на млечната жлеза'], ['C61', 'Рак на простатата'],
  ['C16', 'Рак на стомаха'], ['C25', 'Рак на панкреаса'],
  // Бременност, кърмене, алергии, други
  ['Z33', 'Бременност'], ['Z34', 'Наблюдение на нормална бременност'], ['Z39.1', 'Кърмене'],
  // Менструален цикъл и менопауза
  ['N91', 'Липса на менструация, оскъдна и рядка менструация'], ['N92.0', 'Обилна и честа менструация при редовен цикъл'],
  ['N92.1', 'Обилна и честа менструация при нередовен цикъл'], ['N94.3', 'Предменструален синдром'],
  ['N94.6', 'Дисменорея (болезнена менструация)'], ['N80', 'Ендометриоза'], ['N95.1', 'Менопауза и климактериум'],
  ['T78.1', 'Хранителна непоносимост или алергия'], ['Z91.0', 'Алергия, различна от лекарствена'],
  ['Z92.1', 'Продължително лечение с антикоагуланти'],
  // Кожа, стави, нерви, бъбреци и други (версия 4.11)
  ['L40', 'Псориазис'], ['L40.5', 'Артропатичен псориазис (псориатичен артрит)'], ['M07', 'Псориатични и ентеропатични артропатии'],
  ['M06', 'Друг ревматоиден артрит'], ['M45', 'Анкилозиращ спондилит'], ['M32', 'Системен лупус еритематозус'],
  ['M15', 'Полиартроза'], ['M16', 'Коксартроза'], ['M19', 'Други артрози'],
  ['L20', 'Атопичен дерматит'], ['L73.2', 'Супуративен хидраденит'], ['L89', 'Декубитална язва'],
  ['G35', 'Множествена склероза'], ['G47.3', 'Сънна апнея'],
  ['N04', 'Нефротичен синдром'], ['N03', 'Хроничен нефритен синдром'], ['N02', 'Рецидивираща и персистираща хематурия (IgA нефропатия)'],
  ['Q61.2', 'Поликистоза на бъбреците, автозомно-доминантен тип'],
  ['K64', 'Хемороиди'], ['K60.2', 'Фисура на ануса'], ['K31.8', 'Гастропареза'],
  ['Z94.0', 'Състояние след бъбречна трансплантация'], ['Z94.4', 'Състояние след чернодробна трансплантация'],
  ['N40', 'Хиперплазия на простатата'], ['N39.3', 'Стрес инконтиненция на урината'], ['R32', 'Неуточнена инконтиненция на урината'],
].map(([code, name]) => ({ code, name }));

const DX_BY_CODE = new Map(DX.map(d => [d.code, d.name]));

/** Името на кода от списъка (по най-дългото съвпадение: „E11.9“ → „E11“). */
export function dxName(code) {
  const c = normIcd(code);
  for (let n = c.length; n >= 3; n--) {
    const name = DX_BY_CODE.get(c.slice(0, n));
    if (name) return name;
  }
  return '';
}

/** Търсене по код или по име — за полето за въвеждане. */
export function searchDx(q, limit = 12) {
  const s = String(q || '').trim();
  if (!s) return [];
  const code = normIcd(s);
  const low = s.toLowerCase();
  return DX.filter(d => d.code.startsWith(code) || d.name.toLowerCase().includes(low)).slice(0, limit);
}

/* ------------------------------------ профили ------------------------------------ */

/*
 * Полета на профила:
 *   re — шаблон на кода; keys — ключовете на обясненията и правилата в diet-advice.js;
 *   label — кратко име; src — насоката;
 *   cond — заболявания в програмата, които режимът вече познава (htn, dm2, ckd, gout …);
 *   prefs — задължителни ограничения (glutenFree, lactoseFree);
 *   noLose — без отслабване; proteinMin / proteinCap — най-малко / най-много г/кг; energyAdd — kcal дневно;
 *   fluidsMin / fluidsMax — мл дневно; fiberMin — г дневно; limitK — калий; egfr — подразбиране,
 *   ако няма резултат; dialysis — хемодиализа;
 *   exclude — храни от каталога, които не влизат в менюто; penalize — по-рядко в менюто;
 *   dietitian — нужен е диетолог; lowSalt — сол под 5 г и по-малко солени ястия в менюто;
 *   focus — ястия с повече желязо (iron) или калций (calcium) всеки ден; amenorrhea — без
 *   дефицит при ИТМ под 25; menopause, lactation — без фази на менструалния цикъл.
 * Текстовете за човека (защо, предпочитайте, ограничете, избягвайте) са в diet-advice.js по ключа (версия 4.17).
 */
const PROFILES = [
  // ---- от хроничните заболявания на програмата (правилата им вече са в режима)
  { re: /^I11\.0/, keys: ['hf', 'htn'], cond: ['htn', 'hf'], label: 'хипертонично сърце със сърдечна недостатъчност', src: 'ESC 2024, ESC 2021 СН' },
  { re: /^I1[0-5]/, keys: ['htn'], cond: ['htn'], label: 'хипертония', src: 'ESC 2024, DASH' },
  { re: /^E10/, keys: ['dm1'], cond: ['dm1'], label: 'диабет тип 1', src: 'ADA 2026' },
  { re: /^E1[1-4]/, keys: ['dm2'], cond: ['dm2'], label: 'диабет тип 2', src: 'ADA 2026, ESC/EASD 2023' },
  { re: /^R73/, keys: ['prediabetes'], cond: ['prediabetes'], label: 'предиабет', src: 'ADA 2026' },
  { re: /^E78\.1/, keys: ['tg'], cond: ['dyslip'], label: 'хипертриглицеридемия', src: 'ESC/EAS 2019' },
  { re: /^E78/, keys: ['dyslip'], cond: ['dyslip'], label: 'дислипидемия', src: 'ESC/EAS 2025' },
  { re: /^I2[0-5]/, keys: ['chd'], cond: ['chd'], label: 'исхемична болест на сърцето', src: 'ESC 2021 профилактика' },
  { re: /^I70|^I73\.9|^I74/, keys: ['pad'], cond: ['pad'], label: 'атеросклероза', src: 'ESC 2024' },
  { re: /^I6[0-9]|^G45/, keys: ['stroke'], cond: ['stroke'], label: 'мозъчно-съдова болест', src: 'ESO, AHA/ASA' },
  { re: /^I50/, keys: ['hf'], cond: ['hf'], label: 'сърдечна недостатъчност', src: 'ESC 2026 СН' },
  { re: /^I48/, keys: ['af'], cond: ['af'], label: 'предсърдно мъждене', src: 'ESC 2024 ПМ' },
  { re: /^E66/, keys: ['obesity'], cond: ['obesity'], label: 'затлъстяване', src: 'NICE NG246' },
  { re: /^M1A|^M10|^E79\.0/, keys: ['gout'], cond: ['gout'], label: 'подагра или хиперурикемия', src: 'EULAR 2016, ACR 2020' },
  { re: /^M8[01]/, keys: ['osteoporosis'], cond: ['osteoporosis'], focus: ['calcium'], label: 'остеопороза', src: 'ESCEO/IOF 2019' },
  { re: /^E0[23]|^E89\.0/, keys: ['hypothyroid'], cond: ['hypothyroid'], label: 'хипотиреоидизъм', src: 'ETA, ATA 2014' },
  { re: /^K76\.0|^K75\.8/, keys: ['masld'], cond: ['masld'], label: 'стеатоза на черния дроб', src: 'EASL–EASD–EASO 2024' },
  { re: /^D50/, keys: ['anemia'], cond: ['anemia'], focus: ['iron'], label: 'желязодефицитна анемия', src: 'BSG 2021' },
  { re: /^J44/, keys: ['copd'], cond: ['copd'], label: 'ХОББ', src: 'GOLD 2026' },
  { re: /^F0[0-3]|^G30/, keys: ['dementia'], cond: ['dementia'], label: 'деменция', src: 'ESPEN 2015 деменция' },
  { re: /^F3[23]/, keys: ['depression'], cond: ['depression'], label: 'депресия', src: 'средиземноморски тип (SMILES)' },

  // ---- бъбреци
  { re: /^Z99\.2|^N18\.6/, keys: ['dialysis'], cond: ['ckd'], dialysis: true, label: 'хемодиализа', src: 'KDOQI 2020', dietitian: true },
  { re: /^N18\.[45]/, keys: ['ckd45'], cond: ['ckd'], egfr: 20, label: 'ХБЗ стадий 4–5', src: 'KDIGO 2024', dietitian: true },
  { re: /^N18\.3/, keys: ['ckd3'], cond: ['ckd'], egfr: 45, label: 'ХБЗ стадий 3', src: 'KDIGO 2024' },
  { re: /^N18\.[12]/, keys: ['ckd12'], lowSalt: true, proteinCap: 1.3, label: 'ХБЗ стадий 1–2', src: 'KDIGO 2024' },
  { re: /^N18/, keys: ['ckd'], cond: ['ckd'], egfr: 45, label: 'хронично бъбречно заболяване', src: 'KDIGO 2024' },
  { re: /^N2[0-3]/, keys: ['stones'], label: 'камъни в бъбреците', src: 'EAU 2024 уролитиаза', fluidsMin: 2500, lowSalt: true, proteinCap: 1.0, focus: ['calcium'],
    penalize: ['spinach', 'beetroot', 'almonds', 'darkchoc'] },
  { re: /^E87\.5/, keys: ['hyperk'], limitK: true, label: 'хиперкалиемия', src: 'KDIGO 2024' },
  { re: /^E87\.6/, keys: ['hypok'], label: 'хипокалиемия', src: 'ESC' },
  { re: /^E87\.1/, keys: ['hypona'], label: 'хипонатриемия', src: 'ESE 2014' },

  // ---- храносмилане и черен дроб
  { re: /^K90\.0/, keys: ['celiac'], prefs: ['glutenFree'], label: 'цьолиакия', src: 'ESsCD 2019, ACG 2023' },
  { re: /^E73/, keys: ['lactose'], prefs: ['lactoseFree'], label: 'непоносимост към лактоза', src: 'EFSA 2010 лактоза' },
  { re: /^K21/, keys: ['gerd'], label: 'рефлуксна болест', src: 'ACG 2022', penalize: ['darkchoc'] },
  { re: /^K2[5-9]/, keys: ['ulcer'], label: 'гастрит или язва', src: 'Maastricht VI 2022' },
  { re: /^K58/, keys: ['ibs'], label: 'синдром на раздразненото черво', src: 'NICE CG61 2017, ACG 2021', penalize: ['beans', 'lentils', 'chickpeas', 'onion', 'cabbage'] },
  { re: /^K57/, keys: ['diverticula'], label: 'дивертикулоза', src: 'AGA 2021', fiberMin: 30 },
  { re: /^K59\.0/, keys: ['constipation'], label: 'запек', src: 'NICE CKS запек', fiberMin: 30, fluidsMin: 2000 },
  { re: /^K5[01]/, keys: ['ibd'], label: 'възпалително заболяване на червата', src: 'ESPEN 2023 ВЗЧ', dietitian: true },
  { re: /^K70|^K72|^K74|^K76\.6/, keys: ['cirrhosis'], label: 'цироза или чернодробна недостатъчност', src: 'ESPEN 2019 черен дроб, EASL 2019', proteinMin: 1.2, dietitian: true, noLose: true, lowSalt: true },
  { re: /^K8[01]/, keys: ['gallstones'], label: 'жлъчнокаменна болест', src: 'EASL 2016' },
  { re: /^K86\.[01]|^K86\.8/, keys: ['pancreatitis'], label: 'хроничен панкреатит', src: 'ESPEN 2020 панкреас', dietitian: true },
  { re: /^R13/, keys: ['dysphagia'], label: 'дисфагия', src: 'ESPEN 2022 гериатрия, IDDSI', dietitian: true },
  { re: /^Z98\.8|^Z98\.84/, keys: ['bariatric'], label: 'след бариатрична операция', src: 'ASMBS 2019', dietitian: true },

  // ---- обмяна, кръв, недохранване
  { re: /^E28\.2/, keys: ['pcos'], cond: ['prediabetes'], label: 'поликистозни яйчници', src: 'Международна насока PCOS 2023' },
  { re: /^E05/, keys: ['hyperthyroid'], label: 'хипертиреоидизъм', src: 'ETA 2018' },
  { re: /^E06\.3/, keys: ['hashimoto'], label: 'автоимунен тиреоидит', src: 'ETA' },
  { re: /^E55/, keys: ['vitd'], label: 'недостиг на витамин D', src: 'ESCEO' },
  { re: /^D51|^E53\.8/, keys: ['b12'], label: 'недостиг на витамин B12', src: 'NICE NG239 2024' },
  { re: /^D52/, keys: ['folate'], label: 'недостиг на фолат', src: 'NICE CKS' },
  { re: /^E83\.1/, keys: ['hemochromatosis'], label: 'хемохроматоза', src: 'EASL 2022', exclude: ['shrimp', 'mussels', 'squid', 'octopus'] },
  { re: /^E4[0-6]|^R64|^R63\.4|^M62\.5|^M62\.84/, keys: ['malnutrition'], label: 'недохранване или саркопения', src: 'ESPEN 2022 гериатрия, GLIM', proteinMin: 1.2, noLose: true },
  { re: /^C(?:[0-8]\d|9[0-7])/, keys: ['cancer'], label: 'онкологично заболяване', src: 'ESPEN 2021 онкология', proteinMin: 1.2, dietitian: true, noLose: true },
  { re: /^E70\.0|^E74\.1|^E72/, keys: ['iem'], label: 'вродено нарушение на обмяната', src: 'специализирана насока', dietitian: true },
  { re: /^F50/, keys: ['eating'], label: 'хранително разстройство', src: 'NICE NG69', dietitian: true, noLose: true },
  { re: /^F10/, keys: ['alcohol'], label: 'алкохолна зависимост', src: 'NICE CG100' },

  // ---- кожа, стави, нерви, бъбреци и други (версия 4.11)
  { re: /^L40\.5|^M07/, keys: ['psa'], label: 'псориатичен артрит', src: 'NPF 2018, EULAR 2021' },
  { re: /^L40/, keys: ['psoriasis'], label: 'псориазис', src: 'NPF 2018' },
  { re: /^M0[56]|^M32|^M45/, keys: ['rheum'], label: 'възпалителен ставен ревматизъм', src: 'EULAR 2021' },
  { re: /^M1[5-9]/, keys: ['oa'], label: 'остеоартроза', src: 'ACR/AF 2019, EULAR 2021' },
  { re: /^L20/, keys: ['atopic'], label: 'атопичен дерматит', src: 'AAD 2014' },
  { re: /^L73\.2/, keys: ['hs'], label: 'супуративен хидраденит', src: 'Северноамерикански насоки за HS 2019' },
  { re: /^L89/, keys: ['pressure'], label: 'декубитална язва', src: 'ESPEN 2022 гериатрия', proteinMin: 1.2, noLose: true },
  { re: /^G20/, keys: ['parkinson'], label: 'болест на Паркинсон', src: 'ESPEN 2018 неврология' },
  { re: /^G35/, keys: ['ms'], label: 'множествена склероза', src: 'ESPEN 2018 неврология' },
  { re: /^G47\.3/, keys: ['osa'], label: 'сънна апнея', src: 'ATS 2018' },
  { re: /^N0[0-8]/, keys: ['gn'], label: 'гломерулна болест', src: 'KDIGO 2021 гломерулни болести', lowSalt: true, proteinCap: 1.0, dietitian: true },
  { re: /^Q61\.[23]/, keys: ['adpkd'], label: 'поликистоза на бъбреците', src: 'KDIGO 2025 ADPKD', lowSalt: true, fluidsMin: 2000, proteinCap: 1.0 },
  { re: /^K64|^I84/, keys: ['hemorrhoids'], label: 'хемороиди', src: 'ASCRS 2018 хемороиди', fiberMin: 30 },
  { re: /^K60\.[0-2]/, keys: ['fissure'], label: 'анална фисура', src: 'ASCRS 2017 анална фисура', fiberMin: 30 },
  { re: /^K31\.8/, keys: ['gastroparesis'], label: 'гастропареза', src: 'ACG 2022 гастропареза', dietitian: true },
  { re: /^Z94/, keys: ['transplant'], label: 'трансплантиран орган', src: 'КХП на такролимус и циклоспорин', exclude: ['grapefruit'] },
  { re: /^N40/, keys: ['bph'], label: 'хиперплазия на простатата', src: 'EAU мъжки LUTS' },
  { re: /^N39\.[34]|^R32|^N32\.8/, keys: ['incontinence'], label: 'инконтиненция на урината', src: 'EAU женски LUTS' },
  // Версия 4.17: и останалите заболявания от списъка имат обяснение.
  { re: /^N39\.0|^N30/, keys: ['uti'], label: 'инфекции на пикочните пътища', src: 'EAU 2024' },
  { re: /^J45/, keys: ['asthma'], label: 'бронхиална астма', src: 'GINA 2026' },
  { re: /^G40/, keys: ['epilepsy'], label: 'епилепсия', src: 'ILAE' },
  { re: /^G43/, keys: ['migraine'], label: 'мигрена', src: 'NICE CKS' },
  { re: /^F41/, keys: ['anxiety'], label: 'тревожно разстройство', src: '' },
  { re: /^I83/, keys: ['varicose'], label: 'разширени вени', src: 'NICE CG168' },
  { re: /^N80/, keys: ['endometriosis'], label: 'ендометриоза', src: 'ESHRE 2022' },

  // ---- бременност и кърмене
  { re: /^O24\.4/, keys: ['gdm', 'pregnancy'], cond: ['dm2'], pregnancy: true, label: 'гестационен диабет', src: 'ADA 2026, NICE NG3' },
  { re: /^O|^Z3[3-6]/, keys: ['pregnancy'], pregnancy: true, label: 'бременност', src: 'EFSA 2013, СЗО' },
  { re: /^Z39\.1/, keys: ['lactation'], energyAdd: 500, label: 'кърмене', src: 'EFSA 2013', fluidsMin: 2500, lactation: true, noLose: true },

  // ---- менструален цикъл и менопауза
  { re: /^N91/, keys: ['amenorrhea'], amenorrhea: true, label: 'липса на или рядка менструация', src: 'Endocrine Society 2017, ASRM 2024' },
  { re: /^N92/, keys: ['heavy'], focus: ['iron'], label: 'обилна менструация', src: 'NICE NG88, EFSA 2015' },
  { re: /^N94\.3/, keys: ['pms'], focus: ['calcium'], label: 'предменструален синдром', src: 'ACOG 2023' },
  { re: /^N94\.[4-6]/, keys: ['dysmenorrhea'], label: 'болезнена менструация', src: 'Cochrane 2016' },
  { re: /^N95\.1|^Z78\.0/, keys: ['menopause'], menopause: true, label: 'менопауза', src: 'EFSA 2015' },

  // ---- алергии и лекарства
  { re: /^T78\.[01]|^Z91\.0/, keys: ['allergy'], label: 'хранителна алергия', src: 'EAACI 2014' },
  { re: /^Z92\.1|^Z79\.01/, keys: ['anticoag'], label: 'антикоагулант', src: 'EHRA' },
];

/** Кой профил отговаря на кода (първото съвпадение печели). */
/* Имената на изключените храни в „взети предвид“. */
const EXCLUDED_NAMES = {
  tunasteak: 'прясна риба тон', shrimp: 'морски дарове', mussels: 'морски дарове', squid: 'морски дарове',
  octopus: 'морски дарове', chickenliver: 'черен дроб', beefliver: 'черен дроб', grapefruit: 'грейпфрут',
};

export function profileFor(code) {
  const c = normIcd(code);
  return PROFILES.find(pr => pr.re.test(c)) || null;
}

/** Бременност: тримесечие от гестационната седмица (ако е въведена). */
function pregnancyEffects(week) {
  const tri = week >= 27 ? 3 : week >= 14 ? 2 : week >= 1 ? 1 : null;
  const add = tri === 3 ? 500 : tri === 2 ? 260 : tri === 1 ? 70 : 260;
  return { energyAdd: add, trimester: tri, noLose: true, exclude: ['tunasteak', 'chickenliver', 'beefliver'] };
}

/**
 * Всички профили за диагнозите на човека.
 * @param {{code: string, name?: string}[]} diagnoses
 * @param {{ pregnancyWeek?: number }} opts
 */
export function dietProfiles(diagnoses = [], opts = {}) {
  const out = {
    cond: new Set(), prefs: new Set(), exclude: new Set(), penalize: new Set(), keys: new Set(),
    noLose: null, proteinMin: 0, proteinCap: 0, energyAdd: 0, fluidsMin: 0, fluidsMax: 0, fiberMin: 0,
    limitK: false, lowSalt: false, egfr: null, dialysis: false, pregnancy: false, trimester: null, dietitian: false,
    focus: new Set(), amenorrhea: false, menopause: false, lactation: false,
    considered: [],
  };
  const seen = new Set();
  for (const d of diagnoses || []) {
    const code = normIcd(d.code);
    if (!ICD_RE.test(code) || seen.has(code)) continue;
    seen.add(code);
    const name = String(d.name || '').trim() || dxName(code);
    let pr = profileFor(code);
    if (pr?.pregnancy) pr = { ...pr, ...pregnancyEffects(Number(opts.pregnancyWeek)), cond: pr.cond };
    if (!pr) { out.considered.push({ code, name, label: '', keys: [], effects: [], src: '' }); continue; }
    const effects = [];
    for (const k of pr.keys || []) out.keys.add(k);
    for (const c of pr.cond || []) { out.cond.add(c); }
    for (const p of pr.prefs || []) { out.prefs.add(p); effects.push(p === 'glutenFree' ? 'без глутен' : 'без лактоза'); }
    for (const f of pr.exclude || []) out.exclude.add(f);
    for (const f of pr.penalize || []) out.penalize.add(f);
    if (pr.noLose) { out.noLose = out.noLose || pr.keys[0]; effects.push('без отслабване'); }
    if (pr.proteinMin) { out.proteinMin = Math.max(out.proteinMin, pr.proteinMin); effects.push(`белтък поне ${String(pr.proteinMin).replace('.', ',')} г/кг`); }
    if (pr.proteinCap) { out.proteinCap = out.proteinCap ? Math.min(out.proteinCap, pr.proteinCap) : pr.proteinCap; effects.push(`белтък до ${String(pr.proteinCap.toFixed(1)).replace('.', ',')} г/кг`); }
    if (pr.energyAdd) { out.energyAdd = Math.max(out.energyAdd, pr.energyAdd); effects.push(`+${pr.energyAdd} kcal`); }
    if (pr.trimester) out.trimester = pr.trimester;
    if (pr.fluidsMin) { out.fluidsMin = Math.max(out.fluidsMin, pr.fluidsMin); effects.push(`течности поне ${String(pr.fluidsMin / 1000).replace('.', ',')} л`); }
    if (pr.fiberMin) { out.fiberMin = Math.max(out.fiberMin, pr.fiberMin); effects.push(`фибри поне ${pr.fiberMin} г`); }
    if (pr.limitK) { out.limitK = true; effects.push('ограничен калий'); }
    if (pr.lowSalt) { out.lowSalt = true; effects.push('сол под 5 г'); }
    if (pr.egfr && !(out.egfr && out.egfr < pr.egfr)) out.egfr = pr.egfr;
    if (pr.egfr) effects.push(`без резултат се приема eGFR около ${pr.egfr}`);
    if (pr.dialysis) { out.dialysis = true; out.limitK = true; effects.push('хемодиализа: белтък 1,0–1,2 г/кг, калий'); }
    if (pr.pregnancy) out.pregnancy = true;
    if (pr.dietitian) out.dietitian = true;
    for (const f of pr.focus || []) { out.focus.add(f); effects.push(f === 'iron' ? 'ястия с повече желязо' : 'ястия с повече калций'); }
    if (pr.amenorrhea) { out.amenorrhea = true; effects.push('без дефицит при ИТМ под 25'); }
    if (pr.menopause) { out.menopause = true; effects.push('без фази на цикъла'); }
    if (pr.lactation) out.lactation = true;
    if (pr.exclude?.length) effects.push('изключени: ' + [...new Set(pr.exclude.map(f => EXCLUDED_NAMES[f] || f))].join(', '));
    if (pr.cond?.length && !effects.length) effects.push('правилата за ' + pr.label);
    if (!effects.length) effects.push('съвети в режима');
    out.considered.push({ code, name, label: pr.label, keys: [...(pr.keys || [])], effects, src: pr.src || '', dietitian: !!pr.dietitian });
  }
  return out;
}

/* -------------------------- диагнозите от досието -------------------------- */

const CODE_IN_TEXT = /(^|[^A-Za-zА-Яа-я0-9])([A-ZАВСЕНКМОРТХУ]\s?\d{2}(?:\.\d{1,2})?)(?![0-9])/g;

/** Кодовете в свободен текст („K21.0 Рефлукс; E55“) с текста след всеки. */
export function icdInText(text) {
  const src = String(text || '');
  const hits = [...src.toUpperCase().matchAll(CODE_IN_TEXT)].map(m => ({ index: m.index + m[1].length, code: m[2] }));
  return hits.map((h, i) => {
    const seg = src.slice(h.index + h.code.length, i + 1 < hits.length ? hits[i + 1].index : undefined)
      .replace(/^[\s:–-]+|[;,|/\s]+$/g, '').trim();
    const code = normIcd(h.code);
    return { code, name: seg || dxName(code) };
  }).filter(d => ICD_RE.test(d.code) && d.code[0] !== 'U');
}

/**
 * Диагнозите, които досието вече съдържа: хроничните заболявания (с кода им),
 * кодовете в „Други заболявания“ и в прегледите при специалист.
 */
export function dossierDiagnoses(p) {
  const out = [];
  const add = (code, name, from) => {
    const c = normIcd(code);
    if (ICD_RE.test(c) && !out.some(d => d.code === c)) out.push({ code: c, name: name || dxName(c), from });
  };
  for (const c of p.chronic || []) {
    if (c.status && c.status !== 'active') continue;
    const def = CONDITIONS[c.code];
    const first = def?.icd ? String(def.icd).match(/[A-Z]\d{2}(?:\.\d{1,2})?/)?.[0] : null;
    if (first) add(first, def.name, 'хронично заболяване');
  }
  for (const t of p.conditions || []) for (const d of icdInText(t)) add(d.code, d.name, 'досие');
  // Диагнозите от прегледите при специалист (основна и придружаващи), най-новите първи.
  const exams = (p.visits || []).filter(v => v.simp).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  for (const v of exams) {
    if (v.icd) add(v.icd, v.diagnosis, 'преглед');
    for (const s of v.extraDx || []) if (s.icd) add(s.icd, s.text, 'преглед');
  }
  return out;
}
