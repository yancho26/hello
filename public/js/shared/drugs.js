/* Каталог на често предписваните лекарства в общата практика.
 *
 * Ключът е международното непатентно наименование (INN) на латиница.
 * За всяко: българско наименование, фармакологични групи (за проверките),
 * търговски имена (за търсене), ATC код.
 * Комбинациите с фиксирани дози имат `components` — проверките се правят
 * по всяка съставка.
 *
 * Каталогът не е изчерпателен. Лекарство, което го няма, може да се въведе
 * със свободен текст — то се записва в листа, но не участва в проверките.
 */

import { table } from './table.js';

/** Фармакологични групи — етикетите се показват в интерфейса. */
export const CLASSES = table({
  ACEI: 'АСЕ-инхибитор',
  ARB: 'сартан (ARB)',
  ARNI: 'ARNI',
  BB: 'бета-блокер',
  BB_NONSEL: 'неселективен бета-блокер',
  CCB_DHP: 'дихидропиридинов калциев антагонист',
  CCB_NDHP: 'верапамил/дилтиазем',
  THIAZIDE: 'тиазиден диуретик',
  LOOP: 'бримков диуретик',
  MRA: 'минералкортикоиден антагонист',
  CENTRAL: 'централно действащ антихипертензивен',
  ALPHA: 'алфа-блокер',
  NITRATE: 'нитрат',
  STATIN: 'статин',
  EZETIMIBE: 'езетимиб',
  FIBRATE: 'фибрат',
  ASPIRIN: 'ацетилсалицилова киселина',
  P2Y12: 'P2Y12-инхибитор',
  VKA: 'витамин К антагонист',
  DOAC: 'НОАК',
  DIGOXIN: 'дигоксин',
  AMIODARONE: 'амиодарон',
  ANTIARRHYTHMIC: 'антиаритмично',
  METFORMIN: 'метформин',
  SU: 'сулфанилурейно',
  DPP4: 'DPP-4 инхибитор',
  SGLT2: 'SGLT2-инхибитор',
  GLP1: 'GLP-1 агонист',
  INSULIN: 'инсулин',
  PIOGLITAZONE: 'пиоглитазон',
  PPI: 'инхибитор на протонната помпа',
  NSAID: 'НСПВС',
  METAMIZOLE: 'метамизол',
  PARACETAMOL: 'парацетамол',
  OPIOID: 'опиоид',
  SSRI: 'SSRI',
  SNRI: 'SNRI',
  TCA: 'трицикличен антидепресант',
  MIRTAZAPINE: 'миртазапин',
  TRAZODONE: 'тразодон',
  BENZO: 'бензодиазепин',
  ZDRUG: 'Z-хипнотик',
  ANTIPSYCHOTIC: 'антипсихотик',
  LITHIUM: 'литий',
  AED: 'антиепилептично',
  INDUCER: 'силен ензимен индуктор',
  GABAPENTINOID: 'габапентиноид',
  ACHEI: 'ацетилхолинестеразен инхибитор',
  LEVODOPA: 'леводопа',
  LEVOTHYROXINE: 'левотироксин',
  ANTITHYROID: 'тиреостатик',
  CORTICOSTEROID: 'системен кортикостероид',
  ALLOPURINOL: 'алопуринол',
  FEBUXOSTAT: 'фебуксостат',
  COLCHICINE: 'колхицин',
  BISPHOSPHONATE: 'бифосфонат',
  METHOTREXATE: 'метотрексат',
  AZATHIOPRINE: 'азатиоприн',
  SABA: 'бързодействащ бета-агонист',
  ICS: 'инхалаторен кортикостероид',
  LABA: 'дългодействащ бета-агонист',
  LAMA: 'дългодействащ антихолинергик',
  MONTELUKAST: 'монтелукаст',
  ALPHA_BPH: 'алфа-блокер (простата)',
  ARI5: '5-алфа-редуктазен инхибитор',
  ANTICHOLINERGIC: 'антихолинергично (пикочен мехур)',
  PDE5: 'PDE-5 инхибитор',
  ANTIHISTAMINE1: 'антихистамин I поколение',
  ANTIHISTAMINE2: 'антихистамин II поколение',
  MACROLIDE: 'макролид',
  CYP3A4_STRONG: 'силен CYP3A4 инхибитор',
  QUINOLONE: 'флуорохинолон',
  TMP_SMX: 'ко-тримоксазол',
  METRONIDAZOLE: 'метронидазол',
  AZOLE: 'азолов антимикотик',
  PENICILLIN: 'пеницилин',
  CEPHALOSPORIN: 'цефалоспорин',
  TETRACYCLINE: 'тетрациклин',
  IRON: 'желязо',
  CALCIUM: 'калций',
  VITD: 'витамин D',
  K_SUPPLEMENT: 'калиев препарат',
  PROKINETIC: 'прокинетик',
  QT: 'удължава QT',
  SEROTONERGIC: 'серотонинергично',
  CNS: 'действа върху ЦНС',
  ANTICHOL_BURDEN: 'антихолинергично натоварване',
});

const d = (bg, classes, atc, brands = [], extra = {}) => ({ bg, classes, atc, brands, ...extra });

export const DRUGS = table({
  /* ---------------------------- сърдечно-съдови ---------------------------- */
  perindopril: d('Периндоприл', ['ACEI'], 'C09AA04', ['Престариум', 'Prestarium']),
  ramipril: d('Рамиприл', ['ACEI'], 'C09AA05', ['Тритейс', 'Tritace', 'Амприлан', 'Ampril']),
  lisinopril: d('Лизиноприл', ['ACEI'], 'C09AA03', ['Диротон', 'Diroton']),
  enalapril: d('Еналаприл', ['ACEI'], 'C09AA02', ['Енап', 'Enap']),
  zofenopril: d('Зофеноприл', ['ACEI'], 'C09AA15', ['Зокардис', 'Zocardis']),
  losartan: d('Лозартан', ['ARB'], 'C09CA01', ['Лориста', 'Lorista', 'Козаар', 'Cozaar']),
  valsartan: d('Валсартан', ['ARB'], 'C09CA03', ['Диован', 'Diovan', 'Валсакор', 'Valsacor']),
  telmisartan: d('Телмисартан', ['ARB'], 'C09CA07', ['Микардис', 'Micardis', 'Тезео', 'Tezeo']),
  candesartan: d('Кандесартан', ['ARB'], 'C09CA06', ['Атаканд', 'Atacand']),
  irbesartan: d('Ирбесартан', ['ARB'], 'C09CA04', ['Апровел', 'Aprovel']),
  olmesartan: d('Олмесартан', ['ARB'], 'C09CA08', ['Олметек', 'Olmetec']),
  'sacubitril+valsartan': d('Сакубитрил/валсартан', ['ARNI', 'ARB'], 'C09DX04', ['Ентресто', 'Entresto']),
  bisoprolol: d('Бизопролол', ['BB'], 'C07AB07', ['Конкор', 'Concor', 'Бисогама', 'Bisogamma']),
  metoprolol: d('Метопролол', ['BB'], 'C07AB02', ['Беталок ЗОК', 'Betaloc ZOK', 'Егилок', 'Egilok']),
  nebivolol: d('Небиволол', ['BB'], 'C07AB12', ['Небилет', 'Nebilet']),
  carvedilol: d('Карведилол', ['BB', 'BB_NONSEL'], 'C07AG02', ['Кориол', 'Coryol', 'Дилатренд', 'Dilatrend']),
  propranolol: d('Пропранолол', ['BB', 'BB_NONSEL'], 'C07AA05', ['Анаприлин', 'Anaprilin']),
  atenolol: d('Атенолол', ['BB'], 'C07AB03', ['Тенормин', 'Tenormin']),
  amlodipine: d('Амлодипин', ['CCB_DHP'], 'C08CA01', ['Норваск', 'Norvasc', 'Амлодипин']),
  lercanidipine: d('Лерканидипин', ['CCB_DHP'], 'C08CA13', ['Лерканидипин', 'Занидип', 'Zanidip']),
  nifedipine: d('Нифедипин', ['CCB_DHP'], 'C08CA05', ['Кордафлекс', 'Cordaflex']),
  verapamil: d('Верапамил', ['CCB_NDHP'], 'C08DA01', ['Изоптин', 'Isoptin']),
  diltiazem: d('Дилтиазем', ['CCB_NDHP'], 'C08DB01', ['Дилтиазем']),
  indapamide: d('Индапамид', ['THIAZIDE'], 'C03BA11', ['Тертензиф', 'Tertensif', 'Индапрес']),
  hydrochlorothiazide: d('Хидрохлоротиазид', ['THIAZIDE'], 'C03AA03', ['Хипотиазид', 'Hypothiazid']),
  chlortalidone: d('Хлорталидон', ['THIAZIDE'], 'C03BA04', ['Хигротон', 'Hygroton']),
  furosemide: d('Фуроземид', ['LOOP'], 'C03CA01', ['Фуроземид', 'Lasix', 'Ласикс']),
  torasemide: d('Торасемид', ['LOOP'], 'C03CA04', ['Диувер', 'Diuver']),
  spironolactone: d('Спиронолактон', ['MRA'], 'C03DA01', ['Вероспирон', 'Verospiron']),
  eplerenone: d('Еплеренон', ['MRA'], 'C03DA04', ['Инспра', 'Inspra']),
  moxonidine: d('Моксонидин', ['CENTRAL'], 'C02AC05', ['Физиотенс', 'Physiotens']),
  doxazosin: d('Доксазозин', ['ALPHA'], 'C02CA04', ['Кардура', 'Cardura']),
  isosorbide_mononitrate: d('Изосорбид мононитрат', ['NITRATE'], 'C01DA14', ['Моносан', 'Monosan', 'Оликард', 'Olicard']),
  nitroglycerin: d('Нитроглицерин', ['NITRATE'], 'C01DA02', ['Нитролингвал', 'Nitrolingual']),
  ivabradine: d('Ивабрадин', [], 'C01EB17', ['Кораксан', 'Coraxan', 'Прокоралан', 'Procoralan']),
  trimetazidine: d('Триметазидин', [], 'C01EB15', ['Предуктал', 'Preductal']),
  digoxin: d('Дигоксин', ['DIGOXIN'], 'C01AA05', ['Дигоксин']),
  amiodarone: d('Амиодарон', ['AMIODARONE', 'ANTIARRHYTHMIC', 'QT'], 'C01BD01', ['Кордарон', 'Cordarone']),
  propafenone: d('Пропафенон', ['ANTIARRHYTHMIC'], 'C01BC03', ['Ритмонорм', 'Rytmonorm']),
  atorvastatin: d('Аторвастатин', ['STATIN'], 'C10AA05', ['Аторис', 'Atoris', 'Сортис', 'Sortis', 'Липитор', 'Lipitor']),
  rosuvastatin: d('Розувастатин', ['STATIN'], 'C10AA07', ['Роксера', 'Roxera', 'Розукард', 'Rosucard', 'Крестор', 'Crestor']),
  simvastatin: d('Симвастатин', ['STATIN'], 'C10AA01', ['Вазилип', 'Vasilip', 'Зокор', 'Zocor']),
  pravastatin: d('Правастатин', ['STATIN'], 'C10AA03', ['Правастатин']),
  ezetimibe: d('Езетимиб', ['EZETIMIBE'], 'C10AX09', ['Езетрол', 'Ezetrol']),
  fenofibrate: d('Фенофибрат', ['FIBRATE'], 'C10AB05', ['Липантил', 'Lipanthyl', 'Трайкор', 'Tricor']),
  acetylsalicylic_acid: d('Ацетилсалицилова киселина', ['ASPIRIN'], 'B01AC06', ['Аспирин Протект', 'Aspirin Protect', 'Аспирин Кардио', 'Кардиопирин', 'Кардиомагнил']),
  clopidogrel: d('Клопидогрел', ['P2Y12'], 'B01AC04', ['Плавикс', 'Plavix', 'Зилт', 'Zyllt']),
  ticagrelor: d('Тикагрелор', ['P2Y12'], 'B01AC24', ['Брилик', 'Brilique']),
  warfarin: d('Варфарин', ['VKA'], 'B01AA03', ['Варфарин Орион', 'Warfarin']),
  acenocoumarol: d('Аценокумарол', ['VKA'], 'B01AA07', ['Синтром', 'Sintrom']),
  apixaban: d('Апиксабан', ['DOAC'], 'B01AF02', ['Еликвис', 'Eliquis']),
  rivaroxaban: d('Ривароксабан', ['DOAC'], 'B01AF01', ['Ксарелто', 'Xarelto']),
  dabigatran: d('Дабигатран', ['DOAC'], 'B01AE07', ['Прадакса', 'Pradaxa']),
  edoxaban: d('Едоксабан', ['DOAC'], 'B01AF03', ['Ликсиана', 'Lixiana']),

  /* Комбинации с фиксирани дози */
  'perindopril+indapamide': d('Периндоприл/индапамид', [], 'C09BA04', ['Нолипрел', 'Noliprel'], { components: ['perindopril', 'indapamide'] }),
  'perindopril+amlodipine': d('Периндоприл/амлодипин', [], 'C09BB04', ['Престанс', 'Prestance'], { components: ['perindopril', 'amlodipine'] }),
  'perindopril+indapamide+amlodipine': d('Периндоприл/индапамид/амлодипин', [], 'C09BX01', ['Трипликсам', 'Triplixam'], { components: ['perindopril', 'indapamide', 'amlodipine'] }),
  'valsartan+hydrochlorothiazide': d('Валсартан/хидрохлоротиазид', [], 'C09DA03', ['Ко-Диован', 'Co-Diovan'], { components: ['valsartan', 'hydrochlorothiazide'] }),
  'valsartan+amlodipine': d('Валсартан/амлодипин', [], 'C09DB01', ['Ексфорж', 'Exforge'], { components: ['valsartan', 'amlodipine'] }),
  'telmisartan+hydrochlorothiazide': d('Телмисартан/хидрохлоротиазид', [], 'C09DA07', ['Микардис Плюс', 'Micardis Plus'], { components: ['telmisartan', 'hydrochlorothiazide'] }),
  'telmisartan+amlodipine': d('Телмисартан/амлодипин', [], 'C09DB04', ['Туинста', 'Twynsta'], { components: ['telmisartan', 'amlodipine'] }),
  'losartan+hydrochlorothiazide': d('Лозартан/хидрохлоротиазид', [], 'C09DA01', ['Лориста Н', 'Lorista H'], { components: ['losartan', 'hydrochlorothiazide'] }),
  'bisoprolol+hydrochlorothiazide': d('Бизопролол/хидрохлоротиазид', [], 'C07BB07', ['Лодоз', 'Lodoz'], { components: ['bisoprolol', 'hydrochlorothiazide'] }),
  'bisoprolol+amlodipine': d('Бизопролол/амлодипин', [], 'C07FB07', ['Конкор АМ', 'Concor AM'], { components: ['bisoprolol', 'amlodipine'] }),

  /* ---------------------------------- диабет ---------------------------------- */
  metformin: d('Метформин', ['METFORMIN'], 'A10BA02', ['Глюкофаж', 'Glucophage', 'Сиофор', 'Siofor']),
  gliclazide: d('Гликлазид', ['SU'], 'A10BB09', ['Диапрел', 'Diaprel']),
  glimepiride: d('Глимепирид', ['SU'], 'A10BB12', ['Амарил', 'Amaryl']),
  glibenclamide: d('Глибенкламид', ['SU'], 'A10BB01', ['Манинил', 'Maninil']),
  sitagliptin: d('Ситаглиптин', ['DPP4'], 'A10BH01', ['Янувия', 'Januvia']),
  vildagliptin: d('Вилдаглиптин', ['DPP4'], 'A10BH02', ['Галвус', 'Galvus']),
  linagliptin: d('Линаглиптин', ['DPP4'], 'A10BH05', ['Траджента', 'Trajenta']),
  dapagliflozin: d('Дапаглифлозин', ['SGLT2'], 'A10BK01', ['Форксига', 'Forxiga']),
  empagliflozin: d('Емпаглифлозин', ['SGLT2'], 'A10BK03', ['Джардианс', 'Jardiance']),
  semaglutide: d('Семаглутид', ['GLP1'], 'A10BJ06', ['Оземпик', 'Ozempic', 'Рибелсус', 'Rybelsus', 'Уеговий', 'Wegovy']),
  dulaglutide: d('Дулаглутид', ['GLP1'], 'A10BJ05', ['Трулисити', 'Trulicity']),
  liraglutide: d('Лираглутид', ['GLP1'], 'A10BJ02', ['Виктоза', 'Victoza', 'Саксенда', 'Saxenda']),
  tirzepatide: d('Тирзепатид', ['GLP1'], 'A10BX16', ['Мунджаро', 'Mounjaro']),
  pioglitazone: d('Пиоглитазон', ['PIOGLITAZONE'], 'A10BG03', ['Актос', 'Actos']),
  insulin_glargine: d('Инсулин гларжин', ['INSULIN'], 'A10AE04', ['Лантус', 'Lantus', 'Тужео', 'Toujeo', 'Абасаглар']),
  insulin_degludec: d('Инсулин деглудек', ['INSULIN'], 'A10AE06', ['Трезиба', 'Tresiba']),
  insulin_aspart: d('Инсулин аспарт', ['INSULIN'], 'A10AB05', ['НовоРапид', 'NovoRapid', 'Фиасп', 'Fiasp']),
  insulin_lispro: d('Инсулин лиспро', ['INSULIN'], 'A10AB04', ['Хумалог', 'Humalog']),
  insulin_human: d('Човешки инсулин', ['INSULIN'], 'A10AB01', ['Хумулин', 'Humulin', 'Инсуман', 'Insuman', 'Актрапид']),
  'sitagliptin+metformin': d('Ситаглиптин/метформин', [], 'A10BD07', ['Янумет', 'Janumet'], { components: ['sitagliptin', 'metformin'] }),
  'vildagliptin+metformin': d('Вилдаглиптин/метформин', [], 'A10BD08', ['Галвус Мет', 'Galvus Met'], { components: ['vildagliptin', 'metformin'] }),
  'dapagliflozin+metformin': d('Дапаглифлозин/метформин', [], 'A10BD15', ['Ксигдуо', 'Xigduo'], { components: ['dapagliflozin', 'metformin'] }),
  'empagliflozin+metformin': d('Емпаглифлозин/метформин', [], 'A10BD20', ['Синджарди', 'Synjardy'], { components: ['empagliflozin', 'metformin'] }),

  /* --------------------------------- стомашни --------------------------------- */
  pantoprazole: d('Пантопразол', ['PPI'], 'A02BC02', ['Контролок', 'Controloc', 'Нолпаза', 'Nolpaza']),
  omeprazole: d('Омепразол', ['PPI'], 'A02BC01', ['Лосек', 'Losec', 'Омепразол']),
  esomeprazole: d('Езомепразол', ['PPI'], 'A02BC05', ['Нексиум', 'Nexium']),
  rabeprazole: d('Рабепразол', ['PPI'], 'A02BC04', ['Париет', 'Pariet']),
  lansoprazole: d('Лансопразол', ['PPI'], 'A02BC03', ['Ланзап']),
  domperidone: d('Домперидон', ['PROKINETIC', 'QT'], 'A03FA03', ['Мотилиум', 'Motilium']),
  metoclopramide: d('Метоклопрамид', ['PROKINETIC'], 'A03FA01', ['Реглан', 'Метоклопрамид']),

  /* ----------------------------- болка и възпаление ----------------------------- */
  ibuprofen: d('Ибупрофен', ['NSAID'], 'M01AE01', ['Нурофен', 'Nurofen', 'Ибупрофен']),
  diclofenac: d('Диклофенак', ['NSAID'], 'M01AB05', ['Волтарен', 'Voltaren', 'Диклак', 'Diclac']),
  naproxen: d('Напроксен', ['NSAID'], 'M01AE02', ['Налгезин', 'Nalgesin']),
  ketoprofen: d('Кетопрофен', ['NSAID'], 'M01AE03', ['Кетонал', 'Ketonal']),
  dexketoprofen: d('Декскетопрофен', ['NSAID'], 'M01AE17', ['Дексофен', 'Кетесе']),
  meloxicam: d('Мелоксикам', ['NSAID'], 'M01AC06', ['Мовалис', 'Movalis']),
  nimesulide: d('Нимезулид', ['NSAID'], 'M01AX17', ['Аулин', 'Aulin']),
  etoricoxib: d('Еторикоксиб', ['NSAID'], 'M01AH05', ['Аркоксия', 'Arcoxia']),
  celecoxib: d('Целекоксиб', ['NSAID'], 'M01AH01', ['Целебрекс', 'Celebrex']),
  metamizole: d('Метамизол', ['METAMIZOLE'], 'N02BB02', ['Аналгин', 'Analgin', 'Новалгин']),
  paracetamol: d('Парацетамол', ['PARACETAMOL'], 'N02BE01', ['Панадол', 'Panadol', 'Парацетамол']),
  tramadol: d('Трамадол', ['OPIOID', 'SEROTONERGIC', 'CNS'], 'N02AX02', ['Трамал', 'Tramal']),
  'tramadol+paracetamol': d('Трамадол/парацетамол', [], 'N02AJ13', ['Залдиар', 'Zaldiar'], { components: ['tramadol', 'paracetamol'] }),
  morphine: d('Морфин', ['OPIOID', 'CNS'], 'N02AA01', ['Морфин']),
  oxycodone: d('Оксикодон', ['OPIOID', 'CNS'], 'N02AA05', ['Оксиконтин', 'OxyContin']),
  fentanyl: d('Фентанил (пластир)', ['OPIOID', 'CNS'], 'N02AB03', ['Дурогезик', 'Durogesic']),

  /* ------------------------------- психиатрия и ЦНС ------------------------------- */
  sertraline: d('Сертралин', ['SSRI', 'SEROTONERGIC'], 'N06AB06', ['Золофт', 'Zoloft', 'Асентра', 'Asentra']),
  escitalopram: d('Есциталопрам', ['SSRI', 'SEROTONERGIC', 'QT'], 'N06AB10', ['Ципралекс', 'Cipralex', 'Елицея', 'Elicea']),
  citalopram: d('Циталопрам', ['SSRI', 'SEROTONERGIC', 'QT'], 'N06AB04', ['Ципрамил', 'Cipramil']),
  fluoxetine: d('Флуоксетин', ['SSRI', 'SEROTONERGIC'], 'N06AB03', ['Прозак', 'Prozac']),
  paroxetine: d('Пароксетин', ['SSRI', 'SEROTONERGIC', 'ANTICHOL_BURDEN'], 'N06AB05', ['Сероксат', 'Seroxat']),
  venlafaxine: d('Венлафаксин', ['SNRI', 'SEROTONERGIC'], 'N06AX16', ['Велаксин', 'Velaxin', 'Ефектин', 'Efectin']),
  duloxetine: d('Дулоксетин', ['SNRI', 'SEROTONERGIC'], 'N06AX21', ['Симбалта', 'Cymbalta']),
  amitriptyline: d('Амитриптилин', ['TCA', 'SEROTONERGIC', 'ANTICHOL_BURDEN', 'CNS'], 'N06AA09', ['Амитриптилин']),
  mirtazapine: d('Миртазапин', ['MIRTAZAPINE', 'CNS'], 'N06AX11', ['Миртазен', 'Mirzaten', 'Ремерон', 'Remeron']),
  trazodone: d('Тразодон', ['TRAZODONE', 'SEROTONERGIC', 'CNS'], 'N06AX05', ['Тритико', 'Trittico']),
  agomelatine: d('Агомелатин', [], 'N06AX22', ['Валдоксан', 'Valdoxan']),
  alprazolam: d('Алпразолам', ['BENZO', 'CNS'], 'N05BA12', ['Ксанакс', 'Xanax', 'Золдак']),
  diazepam: d('Диазепам', ['BENZO', 'CNS'], 'N05BA01', ['Диазепам', 'Valium']),
  bromazepam: d('Бромазепам', ['BENZO', 'CNS'], 'N05BA08', ['Лексотан', 'Lexotan']),
  lorazepam: d('Лоразепам', ['BENZO', 'CNS'], 'N05BA06', ['Лоразепам']),
  clonazepam: d('Клоназепам', ['BENZO', 'CNS'], 'N03AE01', ['Ривотрил', 'Rivotril']),
  zolpidem: d('Золпидем', ['ZDRUG', 'CNS'], 'N05CF02', ['Стилнокс', 'Stilnox']),
  zopiclone: d('Зопиклон', ['ZDRUG', 'CNS'], 'N05CF01', ['Имован', 'Imovane']),
  quetiapine: d('Кветиапин', ['ANTIPSYCHOTIC', 'CNS', 'QT'], 'N05AH04', ['Сероквел', 'Seroquel', 'Кветиаксил', 'Кветиапин']),
  olanzapine: d('Оланзапин', ['ANTIPSYCHOTIC', 'CNS', 'ANTICHOL_BURDEN'], 'N05AH03', ['Зипрекса', 'Zyprexa']),
  risperidone: d('Рисперидон', ['ANTIPSYCHOTIC', 'CNS'], 'N05AX08', ['Рисполепт', 'Rispolept']),
  haloperidol: d('Халоперидол', ['ANTIPSYCHOTIC', 'CNS', 'QT'], 'N05AD01', ['Халоперидол']),
  aripiprazole: d('Арипипразол', ['ANTIPSYCHOTIC', 'CNS'], 'N05AX12', ['Абилифай', 'Abilify']),
  lithium: d('Литиев карбонат', ['LITHIUM'], 'N05AN01', ['Литиум', 'Литий']),
  valproate: d('Валпроат', ['AED', 'CNS'], 'N03AG01', ['Депакин', 'Depakine', 'Конвулекс', 'Convulex']),
  carbamazepine: d('Карбамазепин', ['AED', 'INDUCER', 'CNS'], 'N03AF01', ['Тегретол', 'Tegretol', 'Финлепсин']),
  lamotrigine: d('Ламотрижин', ['AED'], 'N03AX09', ['Ламиктал', 'Lamictal']),
  levetiracetam: d('Леветирацетам', ['AED'], 'N03AX14', ['Кепра', 'Keppra']),
  pregabalin: d('Прегабалин', ['GABAPENTINOID', 'CNS'], 'N03AX16', ['Лирика', 'Lyrica']),
  gabapentin: d('Габапентин', ['GABAPENTINOID', 'CNS'], 'N03AX12', ['Неуронтин', 'Neurontin']),
  donepezil: d('Донепезил', ['ACHEI'], 'N06DA02', ['Арисепт', 'Aricept']),
  rivastigmine: d('Ривастигмин', ['ACHEI'], 'N06DA03', ['Екселон', 'Exelon']),
  memantine: d('Мемантин', [], 'N06DX01', ['Ебикса', 'Ebixa']),
  levodopa: d('Леводопа/карбидопа', ['LEVODOPA'], 'N04BA02', ['Наком', 'Nakom', 'Мадопар', 'Madopar']),
  betahistine: d('Бетахистин', [], 'N07CA01', ['Бетасерк', 'Betaserc']),

  /* -------------------------------- ендокринни -------------------------------- */
  levothyroxine: d('Левотироксин', ['LEVOTHYROXINE'], 'H03AA01', ['Еутирокс', 'Euthyrox', 'L-Тироксин', 'L-Thyroxin']),
  thiamazole: d('Тиамазол', ['ANTITHYROID'], 'H03BB02', ['Тиамазол', 'Метизол', 'Metizol']),
  methylprednisolone: d('Метилпреднизолон', ['CORTICOSTEROID'], 'H02AB04', ['Медрол', 'Medrol']),
  prednisolone: d('Преднизолон', ['CORTICOSTEROID'], 'H02AB06', ['Преднизолон']),
  dexamethasone: d('Дексаметазон', ['CORTICOSTEROID'], 'H02AB02', ['Дексаметазон']),

  /* ----------------------------- опорно-двигателни ----------------------------- */
  allopurinol: d('Алопуринол', ['ALLOPURINOL'], 'M04AA01', ['Милурит', 'Milurit']),
  febuxostat: d('Фебуксостат', ['FEBUXOSTAT'], 'M04AA03', ['Аденурик', 'Adenuric']),
  colchicine: d('Колхицин', ['COLCHICINE'], 'M04AC01', ['Колхикум диспер', 'Colchicum-Dispert']),
  alendronate: d('Алендронат', ['BISPHOSPHONATE'], 'M05BA04', ['Фозамакс', 'Fosamax']),
  risedronate: d('Ризедронат', ['BISPHOSPHONATE'], 'M05BA07', ['Актонел', 'Actonel']),
  ibandronate: d('Ибандронат', ['BISPHOSPHONATE'], 'M05BA06', ['Бонвива', 'Bonviva']),
  methotrexate: d('Метотрексат', ['METHOTREXATE'], 'L04AX03', ['Метотрексат', 'Методжект']),
  azathioprine: d('Азатиоприн', ['AZATHIOPRINE'], 'L04AX01', ['Имуран', 'Imuran']),

  /* --------------------------------- дихателни --------------------------------- */
  salbutamol: d('Салбутамол', ['SABA'], 'R03AC02', ['Вентолин', 'Ventolin']),
  'budesonide+formoterol': d('Будезонид/формотерол', ['ICS', 'LABA'], 'R03AK07', ['Симбикорт', 'Symbicort']),
  'fluticasone+salmeterol': d('Флутиказон/салметерол', ['ICS', 'LABA'], 'R03AK06', ['Серетид', 'Seretide']),
  tiotropium: d('Тиотропиум', ['LAMA'], 'R03BB04', ['Спирива', 'Spiriva']),
  montelukast: d('Монтелукаст', ['MONTELUKAST'], 'R03DC03', ['Сингулер', 'Singulair']),

  /* -------------------------------- урология -------------------------------- */
  tamsulosin: d('Тамсулозин', ['ALPHA_BPH'], 'G04CA02', ['Омник', 'Omnic']),
  finasteride: d('Финастерид', ['ARI5'], 'G04CB01', ['Проскар', 'Proscar']),
  dutasteride: d('Дутастерид', ['ARI5'], 'G04CB02', ['Аводарт', 'Avodart']),
  oxybutynin: d('Оксибутинин', ['ANTICHOLINERGIC', 'ANTICHOL_BURDEN'], 'G04BD04', ['Дриптан', 'Driptane']),
  solifenacin: d('Солифенацин', ['ANTICHOLINERGIC', 'ANTICHOL_BURDEN'], 'G04BD08', ['Везикер', 'Vesicare']),
  tolterodine: d('Толтеродин', ['ANTICHOLINERGIC', 'ANTICHOL_BURDEN'], 'G04BD07', ['Детрузитол', 'Detrusitol']),
  mirabegron: d('Мирабегрон', [], 'G04BD12', ['Бетмига', 'Betmiga']),
  sildenafil: d('Силденафил', ['PDE5'], 'G04BE03', ['Виагра', 'Viagra']),
  tadalafil: d('Тадалафил', ['PDE5'], 'G04BE08', ['Сиалис', 'Cialis']),

  /* ------------------------------ антихистамини ------------------------------ */
  hydroxyzine: d('Хидроксизин', ['ANTIHISTAMINE1', 'ANTICHOL_BURDEN', 'QT', 'CNS'], 'N05BB01', ['Атаракс', 'Atarax']),
  promethazine: d('Прометазин', ['ANTIHISTAMINE1', 'ANTICHOL_BURDEN', 'CNS'], 'R06AD02', ['Прометазин']),
  cetirizine: d('Цетиризин', ['ANTIHISTAMINE2'], 'R06AE07', ['Зиртек', 'Zyrtec']),
  loratadine: d('Лоратадин', ['ANTIHISTAMINE2'], 'R06AX13', ['Кларитин', 'Claritine']),
  desloratadine: d('Деслоратадин', ['ANTIHISTAMINE2'], 'R06AX27', ['Ериус', 'Aerius']),
  bilastine: d('Биластин', ['ANTIHISTAMINE2'], 'R06AX29', ['Никситин', 'Билакстен']),

  /* -------------------------------- антибиотици -------------------------------- */
  clarithromycin: d('Кларитромицин', ['MACROLIDE', 'CYP3A4_STRONG', 'QT'], 'J01FA09', ['Клацид', 'Klacid']),
  azithromycin: d('Азитромицин', ['MACROLIDE', 'QT'], 'J01FA10', ['Сумамед', 'Sumamed', 'Азатрил']),
  ciprofloxacin: d('Ципрофлоксацин', ['QUINOLONE', 'QT'], 'J01MA02', ['Ципронекс', 'Ciprinol', 'Ципринол']),
  levofloxacin: d('Левофлоксацин', ['QUINOLONE', 'QT'], 'J01MA12', ['Таваник', 'Tavanic']),
  cotrimoxazole: d('Ко-тримоксазол', ['TMP_SMX'], 'J01EE01', ['Бисептол', 'Biseptol']),
  metronidazole: d('Метронидазол', ['METRONIDAZOLE'], 'J01XD01', ['Флагил', 'Flagyl', 'Метронидазол']),
  fluconazole: d('Флуконазол', ['AZOLE', 'QT'], 'J02AC01', ['Дифлукан', 'Diflucan', 'Флуканол']),
  amoxicillin: d('Амоксицилин', ['PENICILLIN'], 'J01CA04', ['Амоксицилин', 'Оспамокс', 'Ospamox']),
  'amoxicillin+clavulanate': d('Амоксицилин/клавуланова к-на', ['PENICILLIN'], 'J01CR02', ['Аугментин', 'Augmentin', 'Амоксиклав', 'Amoksiklav']),
  cefuroxime: d('Цефуроксим', ['CEPHALOSPORIN'], 'J01DC02', ['Зинат', 'Zinnat']),
  doxycycline: d('Доксициклин', ['TETRACYCLINE'], 'J01AA02', ['Доксициклин', 'Юнидокс']),

  /* ---------------------------- добавки и минерали ---------------------------- */
  ferrous_sulfate: d('Железен сулфат', ['IRON'], 'B03AA07', ['Тардиферон', 'Tardyferon', 'Сорбифер', 'Sorbifer']),
  calcium_carbonate: d('Калциев карбонат', ['CALCIUM'], 'A12AA04', ['Калций']),
  cholecalciferol: d('Холекалциферол (витамин D3)', ['VITD'], 'A11CC05', ['Вигантол', 'Vigantol', 'Д3 капки']),
  potassium_chloride: d('Калиев хлорид', ['K_SUPPLEMENT'], 'A12BA01', ['Калинор', 'Kalinor']),
  folic_acid: d('Фолиева киселина', [], 'B03BB01', ['Фолиева киселина']),
  cyanocobalamin: d('Витамин B12', [], 'B03BA01', ['Витамин B12']),
});

/** Всички групи на лекарство, включително на съставките на комбинации. */
export function classesOf(drugId) {
  const drug = DRUGS[drugId];
  if (!drug) return new Set();
  const out = new Set(drug.classes);
  for (const c of drug.components || []) for (const k of DRUGS[c].classes) out.add(k);
  return out;
}

/** Съставките (INN) на лекарство — самото то или компонентите на комбинацията. */
export const componentsOf = (drugId) =>
  (DRUGS[drugId]?.components || (DRUGS[drugId] ? [drugId] : []));

export const drugName = (drugId) => DRUGS[drugId]?.bg || drugId;

const norm = (s) => String(s || '').toLowerCase().replace(/[\s\-/.,()]+/g, '');

/** Търсене по българско име, INN или търговско име. */
export function searchDrugs(query, limit = 12) {
  const q = norm(query);
  if (q.length < 2) return [];
  const hits = [];
  for (const [id, drug] of Object.entries(DRUGS)) {
    const names = [drug.bg, id.replace(/_/g, ' '), ...drug.brands];
    let best = null;
    for (const n of names) {
      const nn = norm(n);
      if (nn.startsWith(q)) { best = Math.min(best ?? 9, n === drug.bg ? 0 : 1); }
      else if (nn.includes(q)) { best = Math.min(best ?? 9, 2); }
    }
    if (best !== null) {
      const brand = drug.brands.find(b => norm(b).includes(q));
      hits.push({ id, name: drug.bg, brand: brand && !norm(drug.bg).includes(q) ? brand : null, rank: best });
    }
  }
  return hits.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'bg')).slice(0, limit);
}
