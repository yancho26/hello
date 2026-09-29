/* Проверки на лекарствения лист.
 *
 *   • взаимодействия между лекарства;
 *   • дублиране на терапевтични групи;
 *   • дозиране при намалена бъбречна функция (eGFR, а за НОАК — CrCl по Cockcroft–Gault);
 *   • потенциално неподходящи лекарства при 65+ г. (Beers 2023, STOPP/START v3);
 *   • противопоказания при заболявания;
 *   • съмнение за алергия по записаните алергии;
 *   • липсваща терапия с доказана полза (подсказки, не предписания);
 *   • изследвания, които лекарствата изискват, и подновяване на рецепти.
 *
 * Правилата са подбрани за най-честите и най-опасните ситуации в общата
 * практика. Те не заместват кратката характеристика на продукта и
 * преценката на лекаря — липсата на предупреждение не означава, че
 * комбинацията е безопасна.
 */

import { CLASSES, DRUGS, classesOf, componentsOf, drugName } from './drugs.js';
import { addDays, addMonths, daysBetween, today } from './dates.js';
import { table } from './table.js';

export const SEVERITY = table({
  contra: { label: 'противопоказано', order: 0 },
  major: { label: 'сериозно', order: 1 },
  moderate: { label: 'внимание', order: 2 },
  info: { label: 'сведение', order: 3 },
});

/* --------------------------------- взаимодействия --------------------------------- */

/* Всеки ред: [група или INN, група или INN, тежест, какво се случва, какво да се направи]. */
const PAIRS = [
  ['ACEI', 'ARB', 'major', 'Двойна блокада на системата ренин-ангиотензин: хиперкалиемия, хипотония, остро бъбречно увреждане.', 'Комбинацията не се препоръчва (ESC, KDIGO).'],
  ['ACEI', 'ARNI', 'contra', 'Висок риск от ангиоедем.', 'АСЕ-инхибиторът се спира поне 36 часа преди сакубитрил/валсартан.'],
  ['ACEI', 'MRA', 'moderate', 'Риск от хиперкалиемия.', 'Калий и креатинин след 1 седмица и на 1, 2, 3 и 6 месец, после периодично.'],
  ['ARB', 'MRA', 'moderate', 'Риск от хиперкалиемия.', 'Калий и креатинин след започване и периодично.'],
  ['ACEI', 'FINERENONE', 'moderate', 'Риск от хиперкалиемия.', 'Калий след 4 седмици и периодично; не започвайте при калий >5,0.'],
  ['ARB', 'FINERENONE', 'moderate', 'Риск от хиперкалиемия.', 'Калий след 4 седмици и периодично; не започвайте при калий >5,0.'],
  ['ACEI', 'K_SUPPLEMENT', 'major', 'Хиперкалиемия.', 'Калиеви добавки само при документирана хипокалиемия и с контрол на калия.'],
  ['ARB', 'K_SUPPLEMENT', 'major', 'Хиперкалиемия.', 'Калиеви добавки само при документирана хипокалиемия и с контрол на калия.'],
  ['MRA', 'K_SUPPLEMENT', 'major', 'Хиперкалиемия.', 'Избягвайте комбинацията.'],
  ['FINERENONE', 'MRA', 'contra', 'Два минералкортикоидни антагониста — тежка хиперкалиемия.', 'Финеренонът не се комбинира със спиронолактон или еплеренон.'],
  ['FINERENONE', 'K_SUPPLEMENT', 'major', 'Хиперкалиемия.', 'Избягвайте комбинацията.'],
  ['FINERENONE', 'CYP3A4_STRONG', 'contra', 'Силните CYP3A4 инхибитори повишават многократно нивото на финеренон.', 'Спрете финеренона за времето на лечението.'],
  ['FINERENONE', 'TMP_SMX', 'major', 'Хиперкалиемия.', 'Изберете друг антибиотик или изследвайте калия.'],
  ['ACEI', 'TMP_SMX', 'major', 'Триметопримът задържа калий — хиперкалиемия, особено при възрастни и ХБЗ.', 'Изберете друг антибиотик или изследвайте калия.'],
  ['ARB', 'TMP_SMX', 'major', 'Триметопримът задържа калий — хиперкалиемия.', 'Изберете друг антибиотик или изследвайте калия.'],
  ['MRA', 'TMP_SMX', 'major', 'Хиперкалиемия.', 'Изберете друг антибиотик.'],
  ['NSAID', 'ACEI', 'moderate', 'НСПВС отслабват антихипертензивния ефект и увреждат бъбреците.', 'Възможно най-кратко; при ХБЗ или възраст над 65 г. — избягвайте.'],
  ['NSAID', 'ARB', 'moderate', 'НСПВС отслабват антихипертензивния ефект и увреждат бъбреците.', 'Възможно най-кратко; при ХБЗ или възраст над 65 г. — избягвайте.'],
  ['NSAID', 'VKA', 'major', 'Висок риск от кървене, включително от стомашно-чревния тракт.', 'Избягвайте; при болка — парацетамол.'],
  ['NSAID', 'DOAC', 'major', 'Висок риск от кървене.', 'Избягвайте; при болка — парацетамол.'],
  ['NSAID', 'P2Y12', 'major', 'Висок риск от кървене.', 'Избягвайте или добавете ИПП.'],
  ['NSAID', 'ASPIRIN', 'moderate', 'Стомашно-чревно кървене; ибупрофенът може да отслаби антиагрегантния ефект на аспирина.', 'Избягвайте продължителна употреба; добавете ИПП.'],
  ['NSAID', 'CORTICOSTEROID', 'moderate', 'Висок риск от пептична язва и кървене.', 'Гастропротекция с ИПП.'],
  ['NSAID', 'LITHIUM', 'major', 'Повишаване на нивото на литий — токсичност.', 'Избягвайте; ако е нужно — контрол на литиевото ниво.'],
  ['NSAID', 'METHOTREXATE', 'moderate', 'Намалено излъчване на метотрексат.', 'При ниски седмични дози — контрол на кръвна картина и креатинин.'],
  ['SSRI', 'NSAID', 'moderate', 'Повишен риск от стомашно-чревно кървене.', 'Обмислете ИПП.'],
  ['SNRI', 'NSAID', 'moderate', 'Повишен риск от кървене.', 'Обмислете ИПП.'],
  ['SSRI', 'VKA', 'moderate', 'Повишен риск от кървене; някои SSRI повишават INR.', 'По-чест контрол на INR.'],
  ['SSRI', 'DOAC', 'moderate', 'Повишен риск от кървене.', 'Следете за кървене.'],
  ['SSRI', 'P2Y12', 'moderate', 'Повишен риск от кървене.', 'Следете за кървене; обмислете ИПП.'],
  ['VKA', 'DOAC', 'contra', 'Двойна антикоагулация.', 'Използва се само един антикоагулант.'],
  ['VKA', 'ASPIRIN', 'major', 'Антикоагулант с антиагрегант — висок риск от кървене.', 'Само с ясно показание и за определен период.'],
  ['VKA', 'P2Y12', 'major', 'Антикоагулант с антиагрегант — висок риск от кървене.', 'Само с ясно показание и за определен период.'],
  ['DOAC', 'ASPIRIN', 'major', 'Антикоагулант с антиагрегант — висок риск от кървене.', 'Само с ясно показание и за определен период (ESC 2024).'],
  ['DOAC', 'P2Y12', 'major', 'Антикоагулант с антиагрегант — висок риск от кървене.', 'Само с ясно показание и за определен период.'],
  ['ASPIRIN', 'P2Y12', 'moderate', 'Двойна антиагрегантна терапия — повишен риск от кървене.', 'Само след ОКС/стент и за определената продължителност; обмислете ИПП.'],
  ['VKA', 'AMIODARONE', 'major', 'Амиодаронът повишава INR значително.', 'Намалете дозата на антикоагуланта и изследвайте INR ежеседмично в началото.'],
  ['VKA', 'AZOLE', 'major', 'Флуконазолът повишава INR — риск от кървене.', 'INR след 3–5 дни; обмислете намаляване на дозата.'],
  ['VKA', 'METRONIDAZOLE', 'major', 'Метронидазолът повишава INR значително.', 'Избягвайте или контролирайте INR след 3–5 дни.'],
  ['VKA', 'TMP_SMX', 'major', 'Ко-тримоксазолът повишава INR значително.', 'Изберете друг антибиотик или контролирайте INR.'],
  ['VKA', 'MACROLIDE', 'moderate', 'Макролидите могат да повишат INR.', 'INR след няколко дни.'],
  ['VKA', 'QUINOLONE', 'moderate', 'Флуорохинолоните могат да повишат INR.', 'INR след няколко дни.'],
  ['DOAC', 'INDUCER', 'major', 'Карбамазепинът намалява значително нивото на НОАК — риск от тромбоза.', 'Комбинацията се избягва.'],
  ['VKA', 'INDUCER', 'major', 'Ензимният индуктор намалява ефекта на антикоагуланта.', 'Чест контрол на INR, особено при започване и спиране.'],
  ['DOAC', 'CYP3A4_STRONG', 'moderate', 'Кларитромицинът повишава нивото на апиксабан/ривароксабан — риск от кървене.', 'Предпочетете друг антибиотик (напр. азитромицин).'],
  ['simvastatin', 'CYP3A4_STRONG', 'contra', 'Рабдомиолиза.', 'Спрете симвастатина за времето на лечението.'],
  ['atorvastatin', 'CYP3A4_STRONG', 'major', 'Повишен риск от миопатия.', 'Временно спиране или доза до 20 мг.'],
  ['simvastatin', 'AMIODARONE', 'major', 'Миопатия и рабдомиолиза.', 'Симвастатин до 20 мг дневно или смяна с розувастатин/правастатин.'],
  ['simvastatin', 'CCB_NDHP', 'major', 'Миопатия.', 'Симвастатин до 10 мг (с верапамил/дилтиазем) или друг статин.'],
  ['COLCHICINE', 'CYP3A4_STRONG', 'contra', 'Тежка, дори фатална токсичност от колхицин.', 'Не комбинирайте; при нужда от антибиотик — азитромицин.'],
  ['COLCHICINE', 'STATIN', 'moderate', 'Повишен риск от миопатия.', 'Следете за мускулни болки.'],
  ['clopidogrel', 'omeprazole', 'moderate', 'Омепразолът намалява активирането на клопидогрела.', 'Предпочетете пантопразол.'],
  ['clopidogrel', 'esomeprazole', 'moderate', 'Езомепразолът намалява активирането на клопидогрела.', 'Предпочетете пантопразол.'],
  ['tramadol', 'SSRI', 'major', 'Серотонинов синдром и гърчове.', 'Избягвайте; при болка — алтернативен аналгетик.'],
  ['tramadol', 'SNRI', 'major', 'Серотонинов синдром и гърчове.', 'Избягвайте.'],
  ['tramadol', 'TCA', 'major', 'Серотонинов синдром и гърчове.', 'Избягвайте.'],
  ['tramadol', 'TRAZODONE', 'moderate', 'Серотонинов синдром.', 'Внимание, особено при повишаване на дозите.'],
  ['BENZO', 'OPIOID', 'major', 'Потискане на дишането, седация, смърт (предупреждение на FDA).', 'Избягвайте комбинацията; ако е неизбежна — най-ниски дози.'],
  ['ZDRUG', 'OPIOID', 'major', 'Потискане на дишането и седация.', 'Избягвайте.'],
  ['GABAPENTINOID', 'OPIOID', 'major', 'Потискане на дишането (предупреждение на FDA и EMA).', 'Най-ниски дози и наблюдение.'],
  ['BENZO', 'ZDRUG', 'major', 'Два хипнотика — седация, падания.', 'Избягвайте.'],
  ['LITHIUM', 'ACEI', 'major', 'Повишено ниво на литий.', 'Контрол на литиевото ниво след 5–7 дни.'],
  ['LITHIUM', 'ARB', 'major', 'Повишено ниво на литий.', 'Контрол на литиевото ниво след 5–7 дни.'],
  ['LITHIUM', 'THIAZIDE', 'major', 'Тиазидите повишават нивото на литий с 25–40%.', 'Избягвайте или намалете дозата на лития и контролирайте нивото.'],
  ['LITHIUM', 'LOOP', 'moderate', 'Възможно повишаване на нивото на литий.', 'Контрол на литиевото ниво.'],
  ['METHOTREXATE', 'TMP_SMX', 'contra', 'Тежко потискане на костния мозък.', 'Не комбинирайте.'],
  ['METHOTREXATE', 'METAMIZOLE', 'major', 'Риск от агранулоцитоза и потискане на костния мозък.', 'Избягвайте.'],
  ['ALLOPURINOL', 'AZATHIOPRINE', 'contra', 'Тежка миелотоксичност.', 'Ако е наложително — азатиоприн до 25% от дозата и контрол на кръвната картина.'],
  ['DIGOXIN', 'AMIODARONE', 'major', 'Амиодаронът удвоява нивото на дигоксин.', 'Намалете дозата на дигоксин наполовина.'],
  ['DIGOXIN', 'CCB_NDHP', 'moderate', 'Брадикардия и повишено ниво на дигоксин.', 'Контрол на пулса.'],
  ['DIGOXIN', 'CYP3A4_STRONG', 'major', 'Кларитромицинът повишава нивото на дигоксин.', 'Изберете друг антибиотик.'],
  ['DIGOXIN', 'LOOP', 'moderate', 'Хипокалиемията засилва токсичността на дигоксина.', 'Контрол на калия.'],
  ['DIGOXIN', 'THIAZIDE', 'moderate', 'Хипокалиемията засилва токсичността на дигоксина.', 'Контрол на калия.'],
  ['BB', 'CCB_NDHP', 'major', 'Брадикардия, AV блок, влошаване на сърдечната недостатъчност.', 'Избягвайте, освен при специализирано наблюдение.'],
  ['PDE5', 'NITRATE', 'contra', 'Тежка хипотония.', 'Не се комбинират.'],
  ['PDE5', 'ALPHA', 'moderate', 'Ортостатична хипотония.', 'Започнете с ниска доза.'],
  ['PDE5', 'ALPHA_BPH', 'moderate', 'Ортостатична хипотония.', 'Започнете с ниска доза.'],
  ['LEVOTHYROXINE', 'CALCIUM', 'moderate', 'Калцият намалява усвояването на левотироксина.', 'Поне 4 часа разлика.'],
  ['LEVOTHYROXINE', 'IRON', 'moderate', 'Желязото намалява усвояването на левотироксина.', 'Поне 4 часа разлика.'],
  ['LEVOTHYROXINE', 'PPI', 'info', 'ИПП могат да намалят усвояването на левотироксина.', 'Проверете TSH след започване на ИПП.'],
  ['BISPHOSPHONATE', 'CALCIUM', 'moderate', 'Калцият пречи на усвояването на бифосфоната.', 'Бифосфонатът на гладно с вода; калций — по-късно през деня.'],
  ['QUINOLONE', 'CALCIUM', 'moderate', 'Хелатиране — по-слаб антибиотичен ефект.', 'Антибиотикът 2 часа преди или 6 часа след калций/желязо.'],
  ['QUINOLONE', 'IRON', 'moderate', 'Хелатиране — по-слаб антибиотичен ефект.', 'Антибиотикът 2 часа преди или 6 часа след желязо.'],
  ['TETRACYCLINE', 'CALCIUM', 'moderate', 'Хелатиране.', 'Поне 2–3 часа разлика.'],
  ['TETRACYCLINE', 'IRON', 'moderate', 'Хелатиране.', 'Поне 2–3 часа разлика.'],
  ['SU', 'AZOLE', 'moderate', 'Хипогликемия.', 'Самоконтрол на кръвната захар.'],
  ['SU', 'CYP3A4_STRONG', 'moderate', 'Хипогликемия.', 'Самоконтрол на кръвната захар.'],
  ['DPP4', 'GLP1', 'moderate', 'Няма допълнителна полза от комбинацията.', 'Спрете DPP-4 инхибитора при започване на GLP-1 агонист (ADA, ESC).'],
  ['SGLT2', 'LOOP', 'info', 'По-силна диуреза — риск от обезводняване, особено при възрастни.', 'Преценете дозата на диуретика.'],
  ['ACHEI', 'ANTICHOLINERGIC', 'moderate', 'Противоположни ефекти — антихолинергичното влошава когницията.', 'Предпочетете мирабегрон при нужда от лечение на хиперактивен мехур.'],
  ['ACHEI', 'ANTICHOL_BURDEN', 'moderate', 'Антихолинергичните лекарства противодействат на лечението на деменцията.', 'Потърсете алтернатива.'],
  ['LEVODOPA', 'metoclopramide', 'contra', 'Влошаване на паркинсоновите симптоми.', 'При гадене — домперидон.'],
  ['LEVODOPA', 'ANTIPSYCHOTIC', 'moderate', 'Противоположни ефекти, влошаване на паркинсонизма.', 'Ако е нужно — кветиапин в ниска доза.'],
];

/* Групи, от които две лекарства едновременно са дублиране. */
const DUPLICATE_GROUPS = [
  ['NSAID', 'Две НСПВС — повече нежелани ефекти без по-добро обезболяване.'],
  ['ACEI', 'Два АСЕ-инхибитора.'],
  ['ARB', 'Два сартана.'],
  ['BB', 'Два бета-блокера.'],
  ['CCB_DHP', 'Два дихидропиридинови калциеви антагониста.'],
  ['STATIN', 'Два статина.'],
  ['PPI', 'Два инхибитора на протонната помпа.'],
  ['DOAC', 'Два НОАК.'],
  ['VKA', 'Два витамин К антагониста.'],
  ['SU', 'Две сулфанилурейни.'],
  ['DPP4', 'Два DPP-4 инхибитора.'],
  ['SGLT2', 'Два SGLT2-инхибитора.'],
  ['GLP1', 'Два GLP-1 агониста.'],
  ['BENZO', 'Два бензодиазепина — седация, падания, зависимост.'],
  ['ANTIPSYCHOTIC', 'Два антипсихотика.'],
  ['OPIOID', 'Два опиоида.'],
  ['SSRI', 'Два SSRI — риск от серотонинов синдром.'],
  ['MRA', 'Два минералкортикоидни антагониста.'],
  ['P2Y12', 'Два P2Y12-инхибитора.'],
];

/* ---------------------------- бъбречна функция ---------------------------- */

/* [INN или група, праг, 'egfr'|'crcl', тежест, съвет]. Първото правило, чийто праг е
 * над стойността, печели — затова по-строгите прагове са отпред. */
const RENAL = [
  ['metformin', 30, 'egfr', 'contra', 'Противопоказан при eGFR <30.'],
  ['metformin', 45, 'egfr', 'moderate', 'eGFR 30–44: до 1000 мг дневно; не започвайте ново лечение.'],
  ['glibenclamide', 60, 'egfr', 'major', 'Висок риск от продължителна хипогликемия — сменете с друго средство.'],
  ['glimepiride', 30, 'egfr', 'major', 'Избягвайте при eGFR <30 — хипогликемия.'],
  ['glimepiride', 60, 'egfr', 'moderate', 'Започнете с 1 мг; риск от хипогликемия.'],
  ['gliclazide', 30, 'egfr', 'major', 'При тежка бъбречна недостатъчност — избягвайте.'],
  ['sitagliptin', 30, 'egfr', 'moderate', 'eGFR <30: 25 мг дневно.'],
  ['sitagliptin', 45, 'egfr', 'moderate', 'eGFR 30–44: 50 мг дневно.'],
  ['vildagliptin', 50, 'egfr', 'moderate', 'eGFR <50: 50 мг веднъж дневно.'],
  ['dapagliflozin', 25, 'egfr', 'moderate', 'Не започвайте при eGFR <25; вече започнато лечение може да продължи за бъбречна и сърдечна защита.'],
  ['empagliflozin', 20, 'egfr', 'moderate', 'Не започвайте при eGFR <20; вече започнато лечение може да продължи.'],
  ['SGLT2', 45, 'egfr', 'info', 'При eGFR <45 понижаването на глюкозата е слабо — ползата е бъбречна и сърдечна.'],
  ['GLP1', 15, 'egfr', 'major', 'Не се препоръчва при терминална бъбречна недостатъчност.'],
  ['NSAID', 30, 'egfr', 'contra', 'Избягвайте НСПВС при eGFR <30.'],
  ['NSAID', 60, 'egfr', 'moderate', 'eGFR <60: възможно най-кратко, с контрол на креатинина.'],
  ['finerenone', 25, 'egfr', 'moderate', 'Не започвайте при eGFR <25; вече започнато лечение може да продължи до диализа.'],
  ['MRA', 30, 'egfr', 'major', 'eGFR <30: висок риск от хиперкалиемия — избягвайте.'],
  ['MRA', 45, 'egfr', 'moderate', 'eGFR 30–44: по-ниска доза и чест контрол на калия.'],
  ['K_SUPPLEMENT', 45, 'egfr', 'major', 'Хиперкалиемия при намалена бъбречна функция.'],
  ['dabigatran', 30, 'crcl', 'contra', 'Противопоказан при CrCl <30 mL/min.'],
  ['dabigatran', 50, 'crcl', 'moderate', 'CrCl 30–50: обмислете 110 мг два пъти дневно.'],
  ['rivaroxaban', 15, 'crcl', 'contra', 'Не се препоръчва при CrCl <15.'],
  ['rivaroxaban', 50, 'crcl', 'moderate', 'При предсърдно мъждене и CrCl 15–49: 15 мг веднъж дневно.'],
  ['edoxaban', 15, 'crcl', 'contra', 'Не се препоръчва при CrCl <15.'],
  ['edoxaban', 51, 'crcl', 'moderate', 'CrCl 15–50: 30 мг веднъж дневно.'],
  ['apixaban', 15, 'crcl', 'contra', 'Не се препоръчва при CrCl <15.'],
  ['apixaban', 30, 'crcl', 'moderate', 'CrCl 15–29: 2,5 мг два пъти дневно.'],
  ['rosuvastatin', 30, 'crcl', 'contra', 'Противопоказан при CrCl <30.'],
  ['rosuvastatin', 60, 'crcl', 'moderate', 'CrCl 30–59: начало с 5 мг, до 20 мг дневно.'],
  ['fenofibrate', 30, 'egfr', 'contra', 'Противопоказан при eGFR <30.'],
  ['fenofibrate', 60, 'egfr', 'moderate', 'eGFR 30–59: намалена доза.'],
  ['moxonidine', 30, 'egfr', 'contra', 'Противопоказан при eGFR <30.'],
  ['moxonidine', 60, 'egfr', 'moderate', 'eGFR 30–60: до 0,4 мг дневно.'],
  ['trimetazidine', 30, 'crcl', 'contra', 'Противопоказан при CrCl <30.'],
  ['trimetazidine', 60, 'crcl', 'moderate', 'CrCl 30–60: 35 мг веднъж дневно.'],
  ['atenolol', 35, 'crcl', 'moderate', 'CrCl 15–35: до 50 мг дневно.'],
  ['digoxin', 60, 'egfr', 'moderate', 'Намалена доза и контрол на нивото; внимание при хипокалиемия.'],
  ['allopurinol', 60, 'egfr', 'moderate', 'Начална доза 50–100 мг с постепенно покачване според пикочната киселина.'],
  ['colchicine', 30, 'egfr', 'major', 'eGFR <30: избягвайте или значително намалена доза.'],
  ['gabapentin', 60, 'crcl', 'moderate', 'CrCl <60: намалена доза.'],
  ['pregabalin', 60, 'crcl', 'moderate', 'CrCl <60: намалена доза.'],
  ['levetiracetam', 50, 'crcl', 'moderate', 'CrCl <50: намалена доза.'],
  ['memantine', 30, 'crcl', 'moderate', 'CrCl 5–29: до 10 мг дневно.'],
  ['alendronate', 35, 'crcl', 'contra', 'Не се препоръчва при CrCl <35.'],
  ['risedronate', 30, 'crcl', 'contra', 'Не се препоръчва при CrCl <30.'],
  ['ibandronate', 30, 'crcl', 'contra', 'Не се препоръчва при CrCl <30.'],
  ['tramadol', 30, 'crcl', 'moderate', 'CrCl <30: интервал 12 часа, до 200 мг дневно.'],
  ['morphine', 30, 'egfr', 'major', 'Натрупване на активни метаболити — предпочетете друг опиоид.'],
  ['lithium', 60, 'egfr', 'major', 'Нефротоксичност и натрупване — консултация с психиатър.'],
  ['methotrexate', 30, 'crcl', 'contra', 'Противопоказан при CrCl <30.'],
  ['methotrexate', 60, 'crcl', 'major', 'CrCl 30–59: намалена доза и чест контрол.'],
  ['cotrimoxazole', 15, 'crcl', 'contra', 'Не се препоръчва при CrCl <15.'],
  ['cotrimoxazole', 30, 'crcl', 'moderate', 'CrCl 15–30: половин доза.'],
  ['ciprofloxacin', 50, 'crcl', 'moderate', 'CrCl <50: намалена доза.'],
  ['levofloxacin', 50, 'crcl', 'moderate', 'CrCl <50: намалена доза.'],
];

/* ------------------------------- възрастни 65+ ------------------------------- */

const ELDERLY = [
  ['BENZO', 'major', 'Beers 2023: повишен риск от падания, фрактури, когнитивно влошаване и пътни инциденти.'],
  ['ZDRUG', 'major', 'Beers 2023: падания, фрактури, объркване — избягвайте.'],
  ['ANTIHISTAMINE1', 'major', 'Beers 2023: силно антихолинергично — объркване, запек, задръжка на урина. Изберете антихистамин II поколение.'],
  ['TCA', 'major', 'Beers 2023: силно антихолинергично, ортостатична хипотония, седация.'],
  ['paroxetine', 'moderate', 'Beers 2023: най-антихолинергичният SSRI — изберете сертралин или есциталопрам.'],
  ['ANTICHOLINERGIC', 'major', 'Beers 2023: антихолинергично — когнитивно влошаване. Обмислете мирабегрон.'],
  ['glibenclamide', 'major', 'Beers 2023: тежка и продължителна хипогликемия — избягвайте.'],
  ['glimepiride', 'moderate', 'Beers 2023: сулфанилурейните носят висок риск от хипогликемия при възрастни.'],
  ['gliclazide', 'info', 'Сулфанилурейно: риск от хипогликемия при възрастни — обмислете средства без такъв риск.'],
  ['NSAID', 'major', 'Beers 2023: кървене от ГИТ, бъбречно увреждане, задръжка на течности. Ако е наложително — кратко и с ИПП.'],
  ['metoclopramide', 'major', 'Beers 2023: екстрапирамидни ефекти, включително късна дискинезия.'],
  ['doxazosin', 'moderate', 'Beers 2023: ортостатична хипотония — не като лечение на хипертония.'],
  ['digoxin', 'moderate', 'Beers 2023: не е първа линия за контрол на честотата; при eGFR <30 — дози над 0,125 мг се избягват.'],
  ['rivaroxaban', 'info', 'Beers 2023: при дългосрочно лечение апиксабанът е с по-нисък риск от кървене.'],
  ['VKA', 'info', 'Beers 2023: при ново започване предпочитайте НОАК, ако няма противопоказания.'],
  ['ANTIPSYCHOTIC', 'moderate', 'Beers 2023: избягвайте освен при шизофрения, биполярно разстройство или тежки поведенчески симптоми.'],
  ['tramadol', 'moderate', 'Beers 2023: хипонатриемия (SIADH) и гърчове — контрол на натрия.'],
  ['CORTICOSTEROID', 'info', 'Продължителен прием: костна защита (калций, витамин D, бифосфонат) и контрол на кръвната захар.'],
];

/* ------------------------------ при заболявания ------------------------------ */

const DISEASE = [
  ['hf', 'NSAID', 'major', 'НСПВС задържат течности и влошават сърдечната недостатъчност.'],
  ['hf', 'CCB_NDHP', 'major', 'Верапамил/дилтиазем влошават сърдечната недостатъчност с намалена фракция на изтласкване.'],
  ['hf', 'PIOGLITAZONE', 'contra', 'Пиоглитазонът е противопоказан при сърдечна недостатъчност.'],
  ['ckd', 'NSAID', 'major', 'НСПВС ускоряват спада на бъбречната функция.'],
  ['asthma', 'BB_NONSEL', 'contra', 'Неселективните бета-блокери могат да предизвикат тежък бронхоспазъм.'],
  ['copd', 'BB_NONSEL', 'moderate', 'Предпочетете кардиоселективен бета-блокер (бизопролол, небиволол).'],
  ['dementia', 'ANTICHOL_BURDEN', 'major', 'Антихолинергичните лекарства влошават когницията при деменция.'],
  ['dementia', 'BENZO', 'major', 'Бензодиазепините влошават когницията и увеличават паданията.'],
  ['dementia', 'ANTIPSYCHOTIC', 'major', 'Повишен риск от инсулт и смърт при деменция — само при тежки симптоми и за кратко.'],
  ['gout', 'THIAZIDE', 'moderate', 'Тиазидите повишават пикочната киселина и честотата на пристъпите.'],
  ['gout', 'LOOP', 'moderate', 'Бримковите диуретици повишават пикочната киселина.'],
  ['dm2', 'CORTICOSTEROID', 'moderate', 'Кортикостероидите повишават кръвната захар — по-чест самоконтрол.'],
  ['dm1', 'CORTICOSTEROID', 'moderate', 'Кортикостероидите повишават кръвната захар — корекция на инсулина.'],
  ['osteoporosis', 'CORTICOSTEROID', 'moderate', 'Кортикостероидите ускоряват костната загуба — костна защита.'],
  ['depression', 'MONTELUKAST', 'moderate', 'Монтелукаст — съобщения за невропсихиатрични нежелани реакции.'],
];

/* ------------------------------- алергии ------------------------------- */

/* Ключова дума в записаните алергии → групи или INN, при които да се предупреди. */
const ALLERGY_KEYS = [
  [['пеницилин', 'penicillin', 'амоксицилин', 'аугментин'], ['PENICILLIN'], 'contra', 'Записана алергия към пеницилини.'],
  [['пеницилин', 'penicillin'], ['CEPHALOSPORIN'], 'moderate', 'Алергия към пеницилини — рядка кръстосана реакция с цефалоспорини.'],
  [['цефалоспорин', 'цефуроксим', 'зинат'], ['CEPHALOSPORIN'], 'contra', 'Записана алергия към цефалоспорини.'],
  [['сулфонамид', 'сулфа', 'бисептол', 'котримоксазол', 'ко-тримоксазол'], ['TMP_SMX'], 'contra', 'Записана алергия към сулфонамиди.'],
  [['аспирин', 'ацетилсалицил', 'нспвс', 'ибупрофен', 'диклофенак', 'нестероидн'], ['NSAID', 'ASPIRIN'], 'contra', 'Записана непоносимост към аспирин/НСПВС — възможна кръстосана реакция.'],
  [['метамизол', 'аналгин'], ['METAMIZOLE'], 'contra', 'Записана алергия към метамизол.'],
  [['кодеин', 'морфин', 'опиоид', 'трамадол'], ['OPIOID'], 'major', 'Записана реакция към опиоиди.'],
  [['макролид', 'кларитромицин', 'азитромицин', 'клацид', 'сумамед'], ['MACROLIDE'], 'contra', 'Записана алергия към макролиди.'],
  [['хинолон', 'ципрофлоксацин', 'левофлоксацин'], ['QUINOLONE'], 'contra', 'Записана алергия към флуорохинолони.'],
  [['ангиоедем', 'иаф', 'ace', 'асе'], ['ACEI', 'ARNI'], 'contra', 'Записан ангиоедем/реакция към АСЕ-инхибитор.'],
  [['статин'], ['STATIN'], 'major', 'Записана непоносимост към статини.'],
];

/* ------------------------- изследвания заради лекарства ------------------------- */

/* [група или INN, изискване от chronic.js REQUIREMENTS, месеци]. */
const MONITORING = [
  ['ACEI', 'renal', 12], ['ACEI', 'k', 12],
  ['ARB', 'renal', 12], ['ARB', 'k', 12],
  ['MRA', 'renal', 6], ['MRA', 'k', 6],
  ['FINERENONE', 'renal', 12], ['FINERENONE', 'k', 4],
  ['THIAZIDE', 'renal', 12], ['THIAZIDE', 'k', 12], ['THIAZIDE', 'na', 12],
  ['LOOP', 'renal', 12], ['LOOP', 'k', 12],
  ['DIGOXIN', 'renal', 12], ['DIGOXIN', 'k', 12],
  ['STATIN', 'lipids', 12], ['EZETIMIBE', 'lipids', 12], ['PCSK9', 'lipids', 12],
  ['PCSK9_SIRNA', 'lipids', 12], ['BEMPEDOIC', 'lipids', 12],
  ['FIBRATE', 'renal', 12], ['FIBRATE', 'liver', 12],
  ['METFORMIN', 'renal', 12], ['METFORMIN', 'b12', 24],
  ['SGLT2', 'renal', 12],
  ['LEVOTHYROXINE', 'tsh', 12],
  ['ANTITHYROID', 'tsh', 3], ['ANTITHYROID', 'cbc', 6],
  ['AMIODARONE', 'tsh', 6], ['AMIODARONE', 'liver', 6],
  ['LITHIUM', 'lithium', 3], ['LITHIUM', 'renal', 6], ['LITHIUM', 'tsh', 6],
  ['METHOTREXATE', 'cbc', 3], ['METHOTREXATE', 'liver', 3], ['METHOTREXATE', 'renal', 3],
  ['AZATHIOPRINE', 'cbc', 3], ['AZATHIOPRINE', 'liver', 3],
  ['VKA', 'inr', 1],
  ['DOAC', 'renal', 12], ['DOAC', 'cbc', 12],
  ['ANTIPSYCHOTIC', 'glycemia', 12], ['ANTIPSYCHOTIC', 'lipids', 12],
  ['valproate', 'cbc', 6], ['valproate', 'liver', 6],
  ['carbamazepine', 'cbc', 6], ['carbamazepine', 'na', 6], ['carbamazepine', 'liver', 6],
  ['ALLOPURINOL', 'urate', 6],
  ['FEBUXOSTAT', 'urate', 6], ['FEBUXOSTAT', 'liver', 12],
  ['agomelatine', 'liver', 6],
  ['NSAID', 'renal', 12],
];

/* --------------------------------- помощни --------------------------------- */

export const activeMeds = (patient, asOf = today()) =>
  (patient.meds || []).filter(m => !m.end || m.end > asOf);

const matches = (key, drugId, classes) => key === drugId || componentsOf(drugId).includes(key) || classes.has(key);

export const medLabel = (m) => m.name || drugName(m.drug);

/**
 * Всички проверки. ctx: { age, sex, egfr, crcl, weight, creat, conditions: Set, allergies: [],
 * cha2ds2va, ldlAboveTarget, uacr }.
 */
export function checkMedications(patient, ctx = {}, asOf = today()) {
  const meds = activeMeds(patient, asOf).filter(m => m.drug && DRUGS[m.drug]);
  const entries = meds.map(m => ({ med: m, classes: classesOf(m.drug) }));
  const alerts = [];
  const add = (a) => alerts.push(a);

  // Взаимодействия.
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const A = entries[i], B = entries[j];
      for (const [x, y, sev, text, advice] of PAIRS) {
        const ab = matches(x, A.med.drug, A.classes) && matches(y, B.med.drug, B.classes);
        const ba = matches(x, B.med.drug, B.classes) && matches(y, A.med.drug, A.classes);
        if (!ab && !ba) continue;
        // Всички съвпадащи правила — една двойка може да има няколко отделни риска
        // (напр. АСЕ-инхибитор + сакубитрил/валсартан: ангиоедем и двойна блокада).
        add({ type: 'interaction', severity: sev, title: `${medLabel(A.med)} + ${medLabel(B.med)}`, text, advice, meds: [A.med.id, B.med.id] });
      }
    }
  }

  // „Тройният удар“ върху бъбреците: ACEi/ARB + диуретик + НСПВС.
  const has = (cls) => entries.filter(e => e.classes.has(cls));
  const raas = [...has('ACEI'), ...has('ARB')];
  const diur = [...has('THIAZIDE'), ...has('LOOP'), ...has('MRA')];
  const nsaid = has('NSAID');
  if (raas.length && diur.length && nsaid.length) {
    add({
      type: 'interaction', severity: 'major', title: 'ACEi/сартан + диуретик + НСПВС',
      text: '„Троен удар“ — висок риск от остро бъбречно увреждане.',
      advice: 'Спрете НСПВС или временно диуретика; контрол на креатинина.',
      meds: [raas[0].med.id, diur[0].med.id, nsaid[0].med.id],
    });
  }

  // Удължаване на QT при две или повече такива лекарства.
  const qt = has('QT');
  if (qt.length >= 2) {
    add({
      type: 'interaction', severity: 'major', title: 'Няколко лекарства, удължаващи QT',
      text: `${qt.map(e => medLabel(e.med)).join(', ')} — риск от камерни аритмии (torsades de pointes).`,
      advice: 'ЕКГ с измерване на QTc; избягвайте комбинацията, особено при хипокалиемия или брадикардия.',
      meds: qt.map(e => e.med.id),
    });
  }

  // Натоварване на ЦНС при възрастни (Beers: ≥3 лекарства, действащи върху ЦНС).
  const cns = has('CNS');
  if ((ctx.age || 0) >= 65 && cns.length >= 3) {
    add({
      type: 'elderly', severity: 'major', title: `${cns.length} лекарства, действащи върху ЦНС`,
      text: 'Beers 2023: три или повече такива лекарства повишават риска от падания и фрактури.',
      advice: 'Намалете броя им.', meds: cns.map(e => e.med.id),
    });
  }

  // Дублиране.
  for (const [cls, text] of DUPLICATE_GROUPS) {
    const list = has(cls);
    const distinct = new Set(list.map(e => e.med.drug));
    if (distinct.size >= 2) {
      add({ type: 'duplicate', severity: 'major', title: `Дублиране: ${CLASSES[cls]}`, text, advice: 'Проверете дали и двете са нужни.', meds: list.map(e => e.med.id) });
    }
  }

  // Бъбречна функция.
  for (const e of entries) {
    const seen = new Set();
    for (const [key, limit, measure, sev, advice] of RENAL) {
      if (!matches(key, e.med.drug, e.classes)) continue;
      const value = measure === 'crcl' ? ctx.crcl : ctx.egfr;
      if (value === null || value === undefined || value >= limit) continue;
      // Правилата са подредени от най-строгото — за всяко лекарство се показва само то.
      if (seen.has(e.med.drug + measure)) continue;
      seen.add(e.med.drug + measure);
      add({
        type: 'renal', severity: sev,
        title: `${medLabel(e.med)} при ${measure === 'crcl' ? 'CrCl' : 'eGFR'} ${Math.round(value)}`,
        text: advice, advice: '', meds: [e.med.id],
      });
    }
  }

  // Апиксабан при предсърдно мъждене: 2,5 мг при 2 от 3 критерия.
  const apix = entries.find(e => componentsOf(e.med.drug).includes('apixaban'));
  if (apix) {
    const crit = [(ctx.age || 0) >= 80, ctx.weight > 0 && ctx.weight <= 60, ctx.creat >= 133].filter(Boolean).length;
    if (crit >= 2) {
      add({
        type: 'renal', severity: 'moderate', title: 'Апиксабан: критерии за намалена доза',
        text: 'Изпълнени са поне 2 от: възраст ≥80 г., тегло ≤60 кг, креатинин ≥133 µmol/L.',
        advice: 'При предсърдно мъждене дозата е 2,5 мг два пъти дневно.', meds: [apix.med.id],
      });
    }
  }

  // Възрастни 65+.
  if ((ctx.age || 0) >= 65) {
    for (const e of entries) {
      const rule = ELDERLY.find(([key]) => matches(key, e.med.drug, e.classes));
      if (rule) add({ type: 'elderly', severity: rule[1], title: `${medLabel(e.med)} при 65+ г.`, text: rule[2], advice: '', meds: [e.med.id] });
    }
    // ИПП над 8 седмици.
    for (const e of has('PPI')) {
      if (e.med.start && daysBetween(e.med.start, asOf) > 56) {
        add({
          type: 'elderly', severity: 'info', title: `${medLabel(e.med)} над 8 седмици`,
          text: 'Beers 2023: избягвайте продължителен прием без ясно показание (C. difficile, фрактури, ниски B12 и магнезий).',
          advice: 'Преценете показанието или постепенно спиране.', meds: [e.med.id],
        });
      }
    }
    // Аспирин за първична профилактика.
    const ascvd = ['chd', 'pad', 'stroke'].some(c => ctx.conditions?.has(c));
    for (const e of has('ASPIRIN')) {
      if (!ascvd) {
        add({
          type: 'elderly', severity: 'moderate', title: 'Аспирин без сърдечно-съдово заболяване',
          text: 'Beers 2023 и ESC: аспиринът не се препоръчва за първична профилактика при възрастни — рискът от кървене надвишава ползата.',
          advice: 'Преценете дали има показание.', meds: [e.med.id],
        });
      }
    }
    // НСПВС без гастропротекция.
    if (nsaid.length && !has('PPI').length) {
      add({
        type: 'elderly', severity: 'moderate', title: 'НСПВС без ИПП при 65+ г.',
        text: 'STOPP: висок риск от кървене от горния ГИТ.', advice: 'Добавете ИПП или спрете НСПВС.',
        meds: nsaid.map(e => e.med.id),
      });
    }
  }

  // Заболявания.
  for (const [cond, key, sev, text] of DISEASE) {
    if (!ctx.conditions?.has(cond)) continue;
    for (const e of entries) {
      if (matches(key, e.med.drug, e.classes)) {
        add({ type: 'disease', severity: sev, title: `${medLabel(e.med)} при заболяване`, text, advice: '', meds: [e.med.id] });
      }
    }
  }

  // Алергии.
  const allergyText = (ctx.allergies || []).join(' ').toLowerCase();
  if (allergyText) {
    for (const [words, keys, sev, text] of ALLERGY_KEYS) {
      if (!words.some(w => allergyText.includes(w))) continue;
      for (const e of entries) {
        if (keys.some(k => matches(k, e.med.drug, e.classes))) {
          add({ type: 'allergy', severity: sev, title: `${medLabel(e.med)} — алергия`, text, advice: 'Проверете анамнезата.', meds: [e.med.id] });
        }
      }
    }
    // Пряко съвпадение на име.
    for (const e of entries) {
      const names = [DRUGS[e.med.drug].bg, ...DRUGS[e.med.drug].brands].map(n => n.toLowerCase());
      if (names.some(n => n.length > 3 && allergyText.includes(n))) {
        add({ type: 'allergy', severity: 'contra', title: `${medLabel(e.med)} — записана алергия`, text: 'Лекарството е вписано в алергиите.', advice: '', meds: [e.med.id] });
      }
    }
  }

  // Липсваща терапия с доказана полза — подсказки.
  const cond = ctx.conditions || new Set();
  const hasAny = (...cls) => cls.some(c => has(c).length);
  if (cond.has('af') && (ctx.cha2ds2va ?? 0) >= 2 && !hasAny('VKA', 'DOAC')) {
    add({ type: 'missing', severity: 'major', title: 'Предсърдно мъждене без антикоагулант', text: `CHA2DS2-VA ${ctx.cha2ds2va}: препоръчва се перорална антикоагулация (ESC 2024).`, advice: 'Обмислете НОАК.', meds: [] });
  }
  if (['chd', 'pad', 'stroke'].some(c => cond.has(c)) && !hasAny('STATIN')) {
    add({ type: 'missing', severity: 'moderate', title: 'Атеросклеротично ССЗ без статин', text: 'Високоефективен статин е показан при всички без противопоказания.', advice: 'Обмислете статин.', meds: [] });
  }
  if (['chd', 'pad'].some(c => cond.has(c)) && !hasAny('ASPIRIN', 'P2Y12', 'VKA', 'DOAC')) {
    add({ type: 'missing', severity: 'moderate', title: 'Без антитромботично лечение', text: 'При исхемична болест или периферна артериална болест е показан антиагрегант.', advice: 'Проверете дали има противопоказание.', meds: [] });
  }
  const dmCkd = cond.has('dm2') && ((ctx.egfr >= 20 && ctx.egfr < 60) || ctx.uacr >= 3);
  if ((dmCkd || (cond.has('dm2') && (cond.has('hf') || cond.has('chd')))) && !hasAny('SGLT2')) {
    add({ type: 'missing', severity: 'moderate', title: 'Диабет с ХБЗ/ССЗ без SGLT2-инхибитор', text: 'SGLT2-инхибиторът намалява прогресията на ХБЗ и хоспитализациите за СН (ESC 2023, KDIGO 2024, ESC 2026 ССЗ и ХБЗ).', advice: 'Обмислете дапаглифлозин или емпаглифлозин.', meds: [] });
  }
  if (cond.has('ckd') && ctx.uacr >= 3 && !hasAny('ACEI', 'ARB')) {
    add({ type: 'missing', severity: 'moderate', title: 'Албуминурия без ACEi/сартан', text: 'KDIGO 2024: ACEi или сартан в максимално поносима доза при албуминурия.', advice: 'Обмислете.', meds: [] });
  }
  if (ctx.ldlAboveTarget && !hasAny('STATIN', 'EZETIMIBE')) {
    add({ type: 'missing', severity: 'info', title: 'LDL над целта без липидопонижаващо лечение', text: 'LDL-холестеролът е над целта за категорията на риска.', advice: 'Обсъдете промени в начина на живот и статин.', meds: [] });
  }

  // Подреждане и премахване на повторения.
  const seen = new Set();
  return alerts
    .filter(a => { const k = a.type + a.title + a.text; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => SEVERITY[a.severity].order - SEVERITY[b.severity].order);
}

/** Изследвания, които изискват лекарствата: [{ req, months, reason, start }]. */
export function medMonitoring(patient, ctx = {}, asOf = today()) {
  const out = [];
  for (const m of activeMeds(patient, asOf)) {
    if (!m.drug || !DRUGS[m.drug]) continue;
    const classes = classesOf(m.drug);
    for (const [key, req, months] of MONITORING) {
      if (!matches(key, m.drug, classes)) continue;
      let mo = months;
      // НОАК: бъбречна функция на CrCl/10 месеца при CrCl <60 (EHRA).
      if (classes.has('DOAC') && req === 'renal' && ctx.crcl > 0 && ctx.crcl < 60) {
        mo = Math.max(1, Math.floor(ctx.crcl / 10));
      }
      out.push({ req, months: mo, reason: medLabel(m), start: m.start || asOf, added: (m.addedAt || '').slice(0, 10) });
    }
  }
  return out;
}

/**
 * Рецепти и протоколи за подновяване. Рецептата свършва на prescribedOn +
 * supplyDays; протоколът по НЗОК — на protocolUntil.
 */
export function renewals(patient, { asOf = today(), rxDays = 7, protocolDays = 30 } = {}) {
  const out = [];
  for (const m of activeMeds(patient, asOf)) {
    if (m.prescribedOn && m.supplyDays > 0) {
      const runsOut = addDays(m.prescribedOn, Number(m.supplyDays));
      const days = daysBetween(asOf, runsOut);
      if (days <= rxDays) {
        out.push({ kind: 'rx', medId: m.id, name: medLabel(m), date: runsOut, days, status: days < 0 ? 'overdue' : 'due' });
      }
    }
    if (m.protocolUntil) {
      const days = daysBetween(asOf, m.protocolUntil);
      if (days <= protocolDays) {
        out.push({ kind: 'protocol', medId: m.id, name: medLabel(m), date: m.protocolUntil, days, status: days < 0 ? 'overdue' : 'due' });
      }
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

/** Разписание на приема за печат: сутрин / обед / вечер / преди сън. */
export const SCHEDULE_SLOTS = [['m', 'сутрин'], ['n', 'обед'], ['e', 'вечер'], ['b', 'преди сън']];

/** Храни и напитки, които имат значение при приема (ползва се от хранителния режим). */
export const FOOD_INTERACTIONS = table({
  VKA: 'Витамин К (зелени листни зеленчуци) — не ги избягвайте, но ги яжте в постоянни количества; ограничете алкохола и сока от червена боровинка.',
  rivaroxaban: 'Ривароксабан 15 и 20 мг се приема с храна.',
  simvastatin: 'Без грейпфрут и сок от грейпфрут.',
  atorvastatin: 'Големи количества сок от грейпфрут (над 1 литър дневно) да се избягват.',
  METFORMIN: 'Приема се по време на или след хранене; ограничете алкохола.',
  SU: 'Не пропускайте хранения — риск от хипогликемия; алкохолът я засилва.',
  INSULIN: 'Редовни хранения с постоянно количество въглехидрати; носете глюкоза при хипогликемия.',
  SGLT2: 'Достатъчно течности; да се избягват диети с много ниско съдържание на въглехидрати (кетогенни) — риск от кетоацидоза.',
  GLP1: 'По-малки порции и бавно хранене намаляват гаденето; избягвайте много мазни храни.',
  ACEI: 'Без солеви заместители с калий (KCl) — риск от хиперкалиемия.',
  ARB: 'Без солеви заместители с калий (KCl) — риск от хиперкалиемия.',
  MRA: 'Без солеви заместители с калий; внимание с храни, много богати на калий.',
  FINERENONE: 'Без солеви заместители с калий и без грейпфрут и сок от грейпфрут.',
  THIAZIDE: 'Храни, богати на калий (ако няма ограничение), компенсират загубата му.',
  LOOP: 'Храни, богати на калий (ако няма ограничение), компенсират загубата му.',
  LEVOTHYROXINE: 'На гладно с вода, 30–60 минути преди закуска; кафе, мляко, соя, калций и желязо — поне 4 часа по-късно.',
  BISPHOSPHONATE: 'Сутрин на гладно с чаша обикновена вода, изправено положение 30 минути; без храна, кафе и калций през това време.',
  QUINOLONE: 'Без мляко, кисело мляко, калций и желязо 2 часа преди и 6 часа след дозата.',
  TETRACYCLINE: 'Без мляко и млечни продукти около приема.',
  IRON: 'С витамин C (плод, сок) за по-добро усвояване; без чай, кафе и мляко в рамките на 1–2 часа.',
  LITHIUM: 'Постоянно количество сол и течности всеки ден — рязка промяна променя нивото на лития.',
  LEVODOPA: 'Богатите на белтък храни намаляват ефекта — приемайте 30–60 мин преди хранене.',
  METRONIDAZOLE: 'Без алкохол по време на лечението и 48 часа след него.',
  BENZO: 'Без алкохол.',
  ZDRUG: 'Без алкохол.',
  OPIOID: 'Без алкохол; повече фибри и течности срещу запек.',
  ALLOPURINOL: 'Поне 2 литра течности дневно, ако няма ограничение.',
  CORTICOSTEROID: 'Ограничете солта и простите захари; калций и витамин D.',
  MAOI: 'Храни с тирамин (отлежали сирена, колбаси) — опасни.',
});

/** Кои от записите за храни засягат пациента. */
export function foodNotes(patient, asOf = today()) {
  const out = [];
  const seen = new Set();
  for (const m of activeMeds(patient, asOf)) {
    if (!m.drug || !DRUGS[m.drug]) continue;
    const classes = classesOf(m.drug);
    for (const [key, text] of Object.entries(FOOD_INTERACTIONS)) {
      if (seen.has(text)) continue;
      if (matches(key, m.drug, classes)) {
        seen.add(text);
        out.push({ med: medLabel(m), text });
      }
    }
  }
  return out;
}

/* ------------------------------ числова доза ------------------------------ */

const FRACTIONS = table({ '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 });

/** Брой таблетки (единици) в едно поле на приема: „1“, „½“, „1/2“, „0,5“, „1½“. */
export function parseCount(value) {
  const s = String(value ?? '').trim().replace(',', '.');
  if (!s || s === '-' || s === '—') return 0;
  let m = /^(\d+)?\s*([½¼¾⅓⅔])$/.exec(s);
  if (m) return (m[1] ? Number(m[1]) : 0) + FRACTIONS[m[2]];
  m = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (m && Number(m[2]) > 0) return Number(m[1]) / Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Количеството в един прием от полето „Доза“: число и единица.
 * „5 мг“ → 5 mg; „2,5mg“ → 2,5 mg; „49/51 мг“ → 49 mg (първата съставка);
 * „75 мкг“ → 75 µg; „18 ед.“ → 18 U. Без число → null.
 */
export function parseDose(text) {
  const s = String(text ?? '').toLowerCase().replace(/\s+/g, ' ');
  const m = /(\d+(?:[.,]\d+)?)/.exec(s);
  if (!m) return null;
  const amount = Number(m[1].replace(',', '.'));
  if (!(amount > 0)) return null;
  // Мерната единица е веднага след числото (или след „/51“ при комбинация).
  const rest = s.slice(m.index + m[0].length).replace(/^\s*(?:\/\s*\d+(?:[.,]\d+)?\s*)*/, '');
  if (/^(мкг|mcg|µg|μg|ug)/.test(rest)) return { amount, unit: 'µg' };
  if (/^(ед|iu|u\b|unit|единиц|e\.)/.test(rest)) return { amount, unit: 'U' };
  if (/^(g\b|гр?(?![а-я]))/.test(rest)) return { amount: amount * 1000, unit: 'mg' };
  return { amount, unit: 'mg' };
}

/**
 * Дневното количество на лекарство: доза × брой приеми от разписанието.
 * Когато в „Доза“ няма число, а в полетата на приема има (обичайно за
 * инсулин: 10 – 0 – 8), числата от приема се приемат за единици.
 * Връща { perIntake, unit, intakes, daily } или null, ако не може да се изчисли.
 */
export function dailyDose(m) {
  if (!m || m.prn) return null;
  const counts = SCHEDULE_SLOTS.map(([k]) => parseCount(m.schedule?.[k]));
  if (counts.some(c => c === null)) return null;
  const sum = counts.reduce((a, b) => a + b, 0);
  const dose = parseDose(m.dose);
  if (dose && sum > 0) {
    const intakes = counts.filter(c => c > 0).length;
    return { perIntake: dose.amount * Math.max(...counts), unit: dose.unit, intakes, daily: round6(dose.amount * sum) };
  }
  if (!dose && sum > 0 && m.drug && classesOf(m.drug).has('INSULIN')) {
    return { perIntake: Math.max(...counts), unit: 'U', intakes: counts.filter(c => c > 0).length, daily: round6(sum) };
  }
  return null;
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;

export const monthsLeft = (m, asOf = today()) =>
  m.protocolUntil ? Math.round(daysBetween(asOf, m.protocolUntil) / 30.44) : null;

export { addMonths };
