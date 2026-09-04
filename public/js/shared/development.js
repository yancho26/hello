/* Нервно-психическо развитие.
 *
 * Списъците с етапи на развитието следват ревизираните през 2022 г. контролни
 * листове на CDC „Learn the Signs. Act Early.“, изготвени съвместно с
 * Американската академия по педиатрия (Zubler et al., „Evidence-Informed
 * Milestones for Developmental Surveillance Tools“, Pediatrics 2022;149(3)).
 *
 * Съществената промяна от 2022 г.: етапите вече са поставени на 75-и
 * персентил — това, което правят повечето деца (75% и повече) на дадената
 * възраст. Дотогава се ползваше медианата (50-и персентил), при която
 * половината деца по определение не покриват етапа, което насърчаваше
 * изчакването. Затова непокрит етап тук НЕ значи диагноза, а основание да
 * се направи стандартизиран скрининг, вместо да се чака.
 *
 * Текстовете са работен превод на български на материала на CDC (обществено
 * достояние). Оригиналът е запазен до всеки етап, за да може да се сверява.
 * Това е инструмент за наблюдение, а не психометрично валидиран тест.
 */

import { growthAge } from './growth.js';

export const DEV_SOURCE = 'CDC/AAP „Learn the Signs. Act Early.“, ревизия 2022 г.';

export const DEV_DOMAINS = {
  social: { key: 'social', label: 'Социално-емоционално', short: 'Социално', icon: '🫂' },
  language: { key: 'language', label: 'Реч и общуване', short: 'Реч', icon: '💬' },
  cognitive: { key: 'cognitive', label: 'Познавателно (учене, мислене, решаване)', short: 'Познавателно', icon: '🧩' },
  motor: { key: 'motor', label: 'Моторика и движение', short: 'Моторика', icon: '🤸' },
};

export const DOMAIN_ORDER = ['social', 'language', 'cognitive', 'motor'];

/* Скринингите, препоръчани от Американската академия по педиатрия на
 * определени възрасти, независимо дали има притеснение. */
export const SCREENING_AT = {
  9: ['general'],
  18: ['general', 'autism'],
  24: ['autism'],
  30: ['general'],
};

export const SCREENING_LABELS = {
  general: 'Общ скрининг на развитието (напр. ASQ-3, PEDS)',
  autism: 'Скрининг за аутистичен спектър (M-CHAT-R/F)',
};

/** Инструменти, чиито резултати се записват. Самите въпросници не се
 *  възпроизвеждат тук — те се ползват от оригиналния си източник. */
export const SCREENING_TOOLS = [
  { id: 'asq3', label: 'ASQ-3', kind: 'general' },
  { id: 'peds', label: 'PEDS', kind: 'general' },
  { id: 'denver2', label: 'Денвър II', kind: 'general' },
  { id: 'mchat', label: 'M-CHAT-R/F', kind: 'autism' },
  { id: 'other', label: 'Друг инструмент', kind: 'general' },
];

export const SCREENING_RESULTS = {
  negative: { label: 'отрицателен — без данни за отклонение', severity: 0 },
  borderline: { label: 'граничен — контрол след 1–3 месеца', severity: 1 },
  positive: { label: 'положителен — насочване за оценка', severity: 2 },
};

/* ------------------------------ етапи по възраст ------------------------------ */

const M = (bg, en) => ({ bg, en });

/** Етапите по възраст и област. Редът е като в контролните листове на CDC. */
export const CHECKPOINTS = [
  {
    ageMonths: 2,
    milestones: {
      social: [
        M('Успокоява се, когато му говорят или го вземат на ръце', 'Calms down when spoken to or picked up'),
        M('Гледа лицето ви', 'Looks at your face'),
        M('Изглежда зарадвано, когато се приближите', 'Seems happy to see you when you walk up to her'),
        M('Усмихва се, когато му говорите или му се усмихнете', 'Smiles when you talk to or smile at her'),
      ],
      language: [
        M('Издава звуци, различни от плач', 'Makes sounds other than crying'),
        M('Реагира на силни звуци', 'Reacts to loud sounds'),
      ],
      cognitive: [
        M('Следи ви с поглед, докато се движите', 'Watches you as you move'),
        M('Задържа поглед върху играчка няколко секунди', 'Looks at a toy for several seconds'),
      ],
      motor: [
        M('Държи главата си изправена, легнало по коремче', 'Holds head up when on tummy'),
        M('Движи и двете ръце, и двата крака', 'Moves both arms and both legs'),
        M('Отваря дланите си за кратко', 'Opens hands briefly'),
      ],
    },
  },
  {
    ageMonths: 4,
    milestones: {
      social: [
        M('Усмихва се самò, за да привлече вниманието ви', 'Smiles on his own to get your attention'),
        M('Похихиква (още не е пълен смях), когато го разсмивате', 'Chuckles (not yet a full laugh) when you try to make her laugh'),
        M('Гледа ви, движи се или издава звуци, за да привлече или задържи вниманието ви', 'Looks at you, moves, or makes sounds to get or keep your attention'),
      ],
      language: [
        M('Издава звуци като „ооо“ и „аах“ (гукане)', 'Makes sounds like „oooo“, „aahh“ (cooing)'),
        M('Отговаря със звуци, когато му говорите', 'Makes sounds back when you talk to him'),
        M('Обръща глава към гласа ви', 'Turns head towards the sound of your voice'),
      ],
      cognitive: [
        M('Когато е гладно, отваря уста при вида на гърдата или шишето', 'If hungry, opens mouth when she sees breast or bottle'),
        M('Разглежда ръцете си с интерес', 'Looks at his hands with interest'),
      ],
      motor: [
        M('Държи главата си стабилно, без опора, когато го носите', 'Holds head steady without support when you are holding her'),
        M('Задържа играчка, поставена в ръката му', 'Holds a toy when you put it in his hand'),
        M('Замахва с ръка към играчки', 'Uses her arm to swing at toys'),
        M('Поднася ръцете си към устата', 'Brings hands to mouth'),
        M('Повдига се на лакти и предмишници, легнало по коремче', 'Pushes up onto elbows/forearms when on tummy'),
      ],
    },
  },
  {
    ageMonths: 6,
    milestones: {
      social: [
        M('Разпознава познати хора', 'Knows familiar people'),
        M('Обича да се гледа в огледало', 'Likes to look at himself in a mirror'),
        M('Смее се', 'Laughs'),
      ],
      language: [
        M('Редува се с вас в издаването на звуци', 'Takes turns making sounds with you'),
        M('Прави „пръцкащи“ звуци с устни (изплезва език и духа)', 'Blows „raspberries“ (sticks tongue out and blows)'),
        M('Издава пискливи звуци', 'Makes squealing noises'),
      ],
      cognitive: [
        M('Слага предмети в устата си, за да ги изследва', 'Puts things in her mouth to explore them'),
        M('Пресяга се, за да хване играчка, която иска', 'Reaches to grab a toy he wants'),
        M('Стиска устни, за да покаже, че не иска повече храна', 'Closes lips to show she doesn’t want more food'),
      ],
      motor: [
        M('Обръща се от коремче по гръб', 'Rolls from tummy to back'),
        M('Повдига се на изпънати ръце, легнало по коремче', 'Pushes up with straight arms when on tummy'),
        M('Опира се на ръце, за да се задържи седнало', 'Leans on hands to support himself when sitting'),
      ],
    },
  },
  {
    ageMonths: 9,
    milestones: {
      social: [
        M('Става срамежливо, вкопчва се или се плаши от непознати', 'Is shy, clingy, or fearful around strangers'),
        M('Показва различни изражения — радост, тъга, гняв, изненада', 'Shows several facial expressions, like happy, sad, angry, and surprised'),
        M('Обръща се, когато го повикате по име', 'Looks when you call her name'),
        M('Реагира, когато си тръгвате (гледа, протяга ръце или плаче)', 'Reacts when you leave (looks, reaches for you, or cries)'),
        M('Усмихва се или се смее при игра на „ку-ку“', 'Smiles or laughs when you play peek-a-boo'),
      ],
      language: [
        M('Издава различни срички като „мамамама“ и „бабабаба“', 'Makes different sounds like „mamamama“ and „babababa“'),
        M('Вдига ръце, за да го вземете', 'Lifts arms up to be picked up'),
      ],
      cognitive: [
        M('Търси предмет, паднал извън полезрението му (лъжичка, играчка)', 'Looks for objects when dropped out of sight (like his spoon or toy)'),
        M('Удря два предмета един в друг', 'Bangs two things together'),
      ],
      motor: [
        M('Само сяда от друга поза', 'Gets to a sitting position by herself'),
        M('Прехвърля предмет от едната ръка в другата', 'Moves things from one hand to her other hand'),
        M('Загребва храна с пръсти към себе си', 'Uses fingers to „rake“ food towards himself'),
        M('Седи без опора', 'Sits without support'),
      ],
    },
  },
  {
    ageMonths: 12,
    milestones: {
      social: [
        M('Играе с вас игри с пляскане на ръчички', 'Plays games with you, like pat-a-cake'),
      ],
      language: [
        M('Маха с ръка за „чао“', 'Waves „bye-bye“'),
        M('Нарича родител „мама“, „тати“ или с друго специално име', 'Calls a parent „mama“ or „dada“ or another special name'),
        M('Разбира „не“ — спира за момент или прекратява действието', 'Understands „no“ (pauses briefly or stops when you say it)'),
      ],
      cognitive: [
        M('Слага предмет в съд — например кубче в чаша', 'Puts something in a container, like a block in a cup'),
        M('Търси предмет, който е видяло да скривате (играчка под одеяло)', 'Looks for things he sees you hide, like a toy under a blanket'),
      ],
      motor: [
        M('Изправя се, като се набира нагоре', 'Pulls up to stand'),
        M('Ходи, като се държи за мебели', 'Walks, holding on to furniture'),
        M('Пие от чаша без капак, докато вие я държите', 'Drinks from a cup without a lid, as you hold it'),
        M('Хваща дребни предмети с палец и показалец (трошички храна)', 'Picks things up between thumb and pointer finger, like small bits of food'),
      ],
    },
  },
  {
    ageMonths: 15,
    milestones: {
      social: [
        M('Подражава на други деца в играта — вади играчки от кутия, когато друго дете го прави', 'Copies other children while playing, like taking toys out of a container when another child does'),
        M('Показва ви предмет, който харесва', 'Shows you an object she likes'),
        M('Пляска с ръце, когато се радва', 'Claps when excited'),
        M('Прегръща кукла или плюшена играчка', 'Hugs stuffed doll or other toy'),
        M('Проявява обич към вас — прегръща, гушка се, целува', 'Shows you affection (hugs, cuddles, or kisses you)'),
      ],
      language: [
        M('Опитва да казва една-две думи освен „мама“ и „тати“ — например „ба“ за балон', 'Tries to say one or two words besides „mama“ or „dada,“ like „ba“ for ball or „da“ for dog'),
        M('Поглежда към познат предмет, когато го назовете', 'Looks at a familiar object when you name it'),
        M('Изпълнява указание, дадено с жест и думи едновременно — подава играчка, когато протегнете ръка и кажете „Дай ми играчката“', 'Follows directions given with both a gesture and words. For example, he gives you a toy when you hold out your hand and say, „Give me the toy.“'),
        M('Сочи, за да поиска нещо или помощ', 'Points to ask for something or to get help'),
      ],
      cognitive: [
        M('Опитва да използва предметите по предназначение — телефон, чаша, книжка', 'Tries to use things the right way, like a phone, cup, or book'),
        M('Нарежда поне два малки предмета един върху друг (кубчета)', 'Stacks at least two small objects, like blocks'),
      ],
      motor: [
        M('Прави няколко самостоятелни крачки', 'Takes a few steps on his own'),
        M('Само се храни с пръсти', 'Uses fingers to feed herself some food'),
      ],
    },
  },
  {
    ageMonths: 18,
    milestones: {
      social: [
        M('Отдалечава се от вас, но поглежда да се увери, че сте наблизо', 'Moves away from you, but looks to make sure you are close by'),
        M('Сочи, за да ви покаже нещо интересно', 'Points to show you something interesting'),
        M('Протяга ръце, за да ги измиете', 'Puts hands out for you to wash them'),
        M('Разглежда няколко страници от книжка заедно с вас', 'Looks at a few pages in a book with you'),
        M('Помага при обличане — провира ръка в ръкава или вдига краче', 'Helps you dress him by pushing arm through sleeve or lifting up foot'),
      ],
      language: [
        M('Опитва да казва три или повече думи освен „мама“ и „тати“', 'Tries to say three or more words besides „mama“ or „dada“'),
        M('Изпълнява едностъпкови указания без жест — подава играчката, когато кажете „Дай ми я“', 'Follows one-step directions without any gestures, like giving you the toy when you say, „Give it to me.“'),
      ],
      cognitive: [
        M('Подражава ви в домакинска работа — например мете', 'Copies you doing chores, like sweeping with a broom'),
        M('Играе с играчките по прост начин — например бута количка', 'Plays with toys in a simple way, like pushing a toy car'),
      ],
      motor: [
        M('Ходи, без да се държи за нищо и никого', 'Walks without holding on to anyone or anything'),
        M('Драска', 'Scribbles'),
        M('Пие от чаша без капак, като понякога разлива', 'Drinks from a cup without a lid and may spill sometimes'),
        M('Само се храни с пръсти', 'Feeds herself with her fingers'),
        M('Опитва да си служи с лъжица', 'Tries to use a spoon'),
        M('Качва се и слиза от диван или стол без помощ', 'Climbs on and off a couch or chair without help'),
      ],
    },
  },
  {
    ageMonths: 24,
    milestones: {
      social: [
        M('Забелязва, когато някой е наранен или разстроен — спира или се натъжава, когато някой плаче', 'Notices when others are hurt or upset, like pausing or looking sad when someone is crying'),
        M('Поглежда лицето ви, за да разбере как да реагира в нова ситуация', 'Looks at your face to see how to react in a new situation'),
      ],
      language: [
        M('Сочи предмети в книжка при въпрос — „Къде е мечето?“', 'Points to things in a book when you ask, like „Where is the bear?“'),
        M('Свързва поне две думи — например „Още мляко“', 'Says at least two words together, like „More milk.“'),
        M('Показва поне две части на тялото при поискване', 'Points to at least two body parts when you ask him to show you'),
        M('Използва и други жестове освен махане и сочене — въздушна целувка, кимане за „да“', 'Uses more gestures than just waving and pointing, like blowing a kiss or nodding yes'),
      ],
      cognitive: [
        M('Държи предмет с едната ръка и действа с другата — държи кутия и сваля капака', 'Holds something in one hand while using the other hand; for example, holding a container and taking the lid off'),
        M('Опитва да борави с ключета, копчета и бутони на играчка', 'Tries to use switches, knobs, or buttons on a toy'),
        M('Играе едновременно с повече от една играчка — слага играчка-храна в чинийка', 'Plays with more than one toy at the same time, like putting toy food on a toy plate'),
      ],
      motor: [
        M('Ритва топка', 'Kicks a ball'),
        M('Тича', 'Runs'),
        M('Изкачва няколко стъпала с ходене (не пълзене), със или без помощ', 'Walks (not climbs) up a few stairs with or without help'),
        M('Храни се с лъжица', 'Eats with a spoon'),
      ],
    },
  },
  {
    ageMonths: 30,
    milestones: {
      social: [
        M('Играе до други деца, а понякога и с тях', 'Plays next to other children and sometimes plays with them'),
        M('Показва ви какво може, като казва „Виж ме!“', 'Shows you what she can do by saying, „Look at me!“'),
        M('Следва прости правила при подсещане — помага да приберете играчките', 'Follows simple routines when told, like helping to pick up toys when you say, „It’s clean-up time.“'),
      ],
      language: [
        M('Използва около 50 думи', 'Says about 50 words'),
        M('Свързва две или повече думи, едната от които е действие — „Кучето тича“', 'Says two or more words together, with one action word, like „Doggie run“'),
        M('Назовава предмети в книжка, когато посочите и попитате „Какво е това?“', 'Names things in a book when you point and ask, „What is this?“'),
        M('Използва думи като „аз“, „мен“, „ние“', 'Says words like „I,“ „me,“ or „we“'),
      ],
      cognitive: [
        M('Играе на „уж“ — например храни кукла с кубче вместо храна', 'Uses things to pretend, like feeding a block to a doll as if it were food'),
        M('Решава прости задачи — качва се на столче, за да стигне нещо', 'Shows simple problem-solving skills, like standing on a small stool to reach something'),
        M('Изпълнява двустъпкови указания — „Остави играчката и затвори вратата“', 'Follows two-step instructions like „Put the toy down and close the door.“'),
        M('Познава поне един цвят — посочва червения молив при въпрос', 'Shows he knows at least one color, like pointing to a red crayon when you ask, „Which one is red?“'),
      ],
      motor: [
        M('Върти предмети с ръце — дръжки на врати, капачки', 'Uses hands to twist things, like turning doorknobs or unscrewing lids'),
        M('Само сваля част от дрехите си — широк панталон или разкопчано яке', 'Takes some clothes off by himself, like loose pants or an open jacket'),
        M('Отскача от земята с двата крака', 'Jumps off the ground with both feet'),
        M('Обръща страниците на книжка една по една, докато четете', 'Turns book pages, one at a time, when you read to her'),
      ],
    },
  },
  {
    ageMonths: 36,
    milestones: {
      social: [
        M('Успокоява се до 10 минути, след като си тръгнете — например в детската градина', 'Calms down within 10 minutes after you leave her, like at a childcare drop off'),
        M('Забелязва други деца и се присъединява към играта им', 'Notices other children and joins them to play'),
      ],
      language: [
        M('Води разговор с вас с поне две размени на реплики', 'Talks with you in conversation using at least two back-and-forth exchanges'),
        M('Задава въпроси „кой“, „какво“, „къде“, „защо“ — например „Къде е мама?“', 'Asks „who,“ „what,“ „where,“ or „why“ questions, like „Where is mommy/daddy?“'),
        M('Казва какво действие се случва на картинка при въпрос — „тича“, „яде“, „играе“', 'Says what action is happening in a picture or book when asked, like „running,“ „eating,“ or „playing“'),
        M('Казва собственото си име при поискване', 'Says first name, when asked'),
        M('Говори достатъчно ясно, за да го разбират и външни хора през повечето време', 'Talks well enough for others to understand, most of the time'),
      ],
      cognitive: [
        M('Нарисува кръг, след като му покажете как', 'Draws a circle, when you show him how'),
        M('Избягва да пипа горещи предмети, когато го предупредите', 'Avoids touching hot objects, like a stove, when you warn her'),
      ],
      motor: [
        M('Нанизва предмети — едри мъниста или макарони', 'Strings items together, like large beads or macaroni'),
        M('Само облича част от дрехите си — широк панталон или яке', 'Puts on some clothes by himself, like loose pants or a jacket'),
        M('Използва вилица', 'Uses a fork'),
      ],
    },
  },
  {
    ageMonths: 48,
    milestones: {
      social: [
        M('Играе на роли — учител, супергерой, куче', 'Pretends to be something else during play (teacher, superhero, dog)'),
        M('Иска да отиде да играе с деца, когато наоколо няма — „Може ли да играя с Алекс?“', 'Asks to go play with children if none are around, like „Can I play with Alex?“'),
        M('Утешава наранен или тъжен — прегръща плачещо приятелче', 'Comforts others who are hurt or sad, like hugging a crying friend'),
        M('Избягва опасност — например не скача от високо на площадката', 'Avoids danger, like not jumping from tall heights at the playground'),
        M('Обича да е „помощник“', 'Likes to be a „helper“'),
        M('Променя поведението си според мястото — библиотека, площадка, храм', 'Changes behavior based on where she is (place of worship, library, playground)'),
      ],
      language: [
        M('Говори с изречения от четири и повече думи', 'Says sentences with four or more words'),
        M('Повтаря думи от песничка, приказка или стихче', 'Says some words from a song, story, or nursery rhyme'),
        M('Разказва поне едно нещо, случило се през деня — „Играх футбол“', 'Talks about at least one thing that happened during his day, like „I played soccer.“'),
        M('Отговаря на прости въпроси — „За какво служи палтото?“', 'Answers simple questions like „What is a coat for?“ or „What is a crayon for?“'),
      ],
      cognitive: [
        M('Назовава няколко цвята на предмети', 'Names a few colors of items'),
        M('Казва какво следва в позната приказка', 'Tells what comes next in a well-known story'),
        M('Рисува човек с три или повече части на тялото', 'Draws a person with three or more body parts'),
      ],
      motor: [
        M('Хваща голяма топка през повечето пъти', 'Catches a large ball most of the time'),
        M('Само си сипва храна или налива вода под надзор на възрастен', 'Serves himself food or pours water, with adult supervision'),
        M('Разкопчава някои копчета', 'Unbuttons some buttons'),
        M('Държи молив между пръстите и палеца, а не в юмрук', 'Holds crayon or pencil between fingers and thumb (not a fist)'),
      ],
    },
  },
  {
    ageMonths: 60,
    milestones: {
      social: [
        M('Спазва правила и се редува при игра с други деца', 'Follows rules or takes turns when playing games with other children'),
        M('Пее, танцува или играе представление пред вас', 'Sings, dances, or acts for you'),
        M('Върши прости домакински задачи — подрежда чорапи, разчиства масата', 'Does simple chores at home, like matching socks or clearing the table after eating'),
      ],
      language: [
        M('Разказва чута или измислена история с поне две събития', 'Tells a story she heard or made up with at least two events. For example, a cat was stuck in a tree and a firefighter saved it'),
        M('Отговаря на прости въпроси за приказка, след като му я прочетете', 'Answers simple questions about a book or story after you read or tell it to him'),
        M('Поддържа разговор с повече от три размени на реплики', 'Keeps a conversation going with more than three back-and-forth exchanges'),
        M('Използва или разпознава прости рими', 'Uses or recognizes simple rhymes (bat-cat, ball-tall)'),
      ],
      cognitive: [
        M('Брои до 10', 'Counts to 10'),
        M('Назовава някои числа от 1 до 5, когато ги посочите', 'Names some numbers between 1 and 5 when you point to them'),
      ],
      motor: [
        M('Закопчава някои копчета', 'Buttons some buttons'),
        M('Скача на един крак', 'Hops on one foot'),
      ],
    },
  },
];

/* Присвояваме устойчиви кодове на всеки етап — по тях се пазят отговорите. */
const DOMAIN_CODE = { social: 'soc', language: 'lang', cognitive: 'cog', motor: 'mot' };
for (const cp of CHECKPOINTS) {
  cp.items = [];
  for (const domain of DOMAIN_ORDER) {
    (cp.milestones[domain] || []).forEach((m, i) => {
      const item = { id: `d${cp.ageMonths}-${DOMAIN_CODE[domain]}-${i + 1}`, domain, ...m };
      cp.items.push(item);
    });
  }
  cp.screening = SCREENING_AT[cp.ageMonths] || [];
}

export const CHECKPOINT_AGES = CHECKPOINTS.map(c => c.ageMonths);
export const CHECKPOINT_BY_AGE = new Map(CHECKPOINTS.map(c => [c.ageMonths, c]));

/** Общият брой етапи — ползва се в справките. */
export const TOTAL_MILESTONES = CHECKPOINTS.reduce((n, c) => n + c.items.length, 0);

/* -------------------------- тревожни признаци -------------------------- */

/* Универсалното правило на CDC/AAP: не се изчаква, ако детето не покрива
 * един или повече етапи, ако е загубило вече придобито умение или ако
 * родителят има притеснение. Загубата на умение е най-тежкият признак и
 * налага незабавно насочване, независимо от възрастта. */
export const RED_FLAGS = [
  {
    id: 'loss',
    label: 'Загуба на вече придобито умение',
    detail: 'Регресът в говора, социалния контакт или моториката налага незабавно '
      + 'насочване за специализирана оценка, без изчакване на следващия преглед.',
    severity: 2,
  },
  {
    id: 'parent_concern',
    label: 'Изразено притеснение от родителя',
    detail: 'Притеснението на родителя е самостоятелно основание за стандартизиран '
      + 'скрининг, дори когато всички етапи изглеждат покрити.',
    severity: 1,
  },
];

/* ------------------------------ оценка ------------------------------ */

export const MILESTONE_ANSWERS = {
  yes: { label: 'да', short: '✓' },
  not_yet: { label: 'още не', short: '—' },
  unsure: { label: 'не се знае', short: '?' },
};

/**
 * Възрастта, по която се преценява развитието. При недоносеност се ползва
 * коригирана възраст до 24 месеца — както при растежа.
 */
export function developmentAge(chronologicalMonths, gestWeeks) {
  return growthAge(chronologicalMonths, gestWeeks);
}

/** Контролната възраст, която се пада на дете на дадена възраст. */
export function checkpointFor(ageMonths) {
  let chosen = null;
  for (const cp of CHECKPOINTS) {
    if (cp.ageMonths <= ageMonths + 0.5) chosen = cp;
  }
  return chosen;
}

/** Следващата контролна възраст след дадената. */
export function nextCheckpointAfter(ageMonths) {
  return CHECKPOINTS.find(cp => cp.ageMonths > ageMonths + 0.5) || null;
}

/**
 * Оценява един запис от досието.
 * @returns {{met, notMet, unsure, total, missing, status, action}}
 */
export function assessRecord(record) {
  const cp = CHECKPOINT_BY_AGE.get(record.checkpoint);
  const answers = record.answers || {};
  const missing = [];
  let met = 0, notMet = 0, unsure = 0, unanswered = 0;

  for (const item of (cp ? cp.items : [])) {
    const a = answers[item.id];
    if (a === 'yes') met++;
    else if (a === 'not_yet') { notMet++; missing.push(item); }
    else if (a === 'unsure') { unsure++; missing.push(item); }
    else unanswered++;
  }

  const screening = record.screening || null;
  const screeningSeverity = screening && SCREENING_RESULTS[screening.result]
    ? SCREENING_RESULTS[screening.result].severity : 0;

  let status = 'ok';
  if (record.lostSkills) status = 'red_flag';
  else if (screeningSeverity === 2) status = 'refer';
  else if (notMet > 0) status = 'screen';
  else if (screeningSeverity === 1 || unsure > 0 || record.parentConcern) status = 'watch';

  return {
    checkpoint: cp,
    met, notMet, unsure, unanswered,
    total: cp ? cp.items.length : 0,
    missing,
    status,
    action: ACTIONS[status],
  };
}

export const ACTIONS = {
  ok: {
    label: 'Развитие по възраст',
    detail: 'Всички етапи за възрастта са покрити. Наблюдението продължава на следващия профилактичен преглед.',
    severity: 0,
  },
  watch: {
    label: 'Проследяване',
    detail: 'Има несигурни отговори или гранични находки. Уточнете на следващия преглед и обсъдете с родителя '
      + 'какво да наблюдава у дома.',
    severity: 1,
  },
  screen: {
    label: 'Стандартизиран скрининг',
    detail: 'Непокрит етап на 75-и персентил е основание да се направи скрининг с валидиран инструмент '
      + '(ASQ-3, PEDS), а не да се изчаква до следващия преглед.',
    severity: 2,
  },
  refer: {
    label: 'Насочване за специализирана оценка',
    detail: 'Положителен скрининг налага насочване за детско развитие и към ранна интервенция, '
      + 'успоредно с уточняващата диагностика.',
    severity: 2,
  },
  red_flag: {
    label: 'Незабавно насочване',
    detail: 'Загуба на вече придобито умение. Насочете без изчакване, независимо от останалите находки.',
    severity: 2,
  },
};

/**
 * Обобщение на развитието за досието.
 * @param {object} patient  дете (birthDate, sex, birth.gestWeeks)
 * @param {Array}  records  записите от раздела
 * @param {string} asOf     дата, към която се смята
 */
export function developmentSummary(patient, records, ageMonthsNow) {
  const gestWeeks = patient.birth ? Number(patient.birth.gestWeeks) : null;
  const age = developmentAge(ageMonthsNow, gestWeeks);
  const sorted = [...(records || [])].sort((a, b) => (a.date < b.date ? -1 : 1));

  const byCheckpoint = new Map();
  for (const r of sorted) byCheckpoint.set(r.checkpoint, r);

  const assessments = sorted.map(r => ({ record: r, ...assessRecord(r) }));
  const latest = assessments.length ? assessments[assessments.length - 1] : null;

  // Контролната възраст, която се пада сега и още не е попълнена.
  const dueCheckpoint = checkpointFor(age.months);
  const dueDone = dueCheckpoint ? byCheckpoint.has(dueCheckpoint.ageMonths) : false;

  const asConcern = (a) => ({
    type: 'development',
    severity: a.action.severity,
    title: `Развитие (${labelForAge(a.record.checkpoint)}): ${a.action.label}`,
    detail: a.status === 'red_flag'
      ? ACTIONS.red_flag.detail
      : a.missing.length
        ? 'Непокрити етапи: ' + a.missing.slice(0, 3).map(m => m.bg).join('; ')
          + (a.missing.length > 3 ? ` и още ${a.missing.length - 3}` : '')
        : a.action.detail,
    date: a.record.date,
  });

  const NOTABLE = new Set(['red_flag', 'refer', 'screen']);

  /* Активна находка е тази от последната оценка: ако на 4 години всичко е
   * покрито, находка от 18-месечна възраст вече не бива да маркира детето.
   * Изключение е загубата на умение — тя остава видима завинаги, защото
   * променя цялата картина, независимо какво показва по-късната оценка. */
  const concerns = [];
  if (latest && NOTABLE.has(latest.status)) concerns.push(asConcern(latest));
  for (const a of assessments) {
    if (a !== latest && a.status === 'red_flag') concerns.push(asConcern(a));
  }

  /* Всички минали находки — показват се като история в раздела. */
  const history = assessments.filter(a => a !== latest && NOTABLE.has(a.status)).map(asConcern);

  return {
    age,
    assessments,
    latest,
    dueCheckpoint,
    dueDone,
    concerns,
    history,
    coverage: {
      done: byCheckpoint.size,
      expected: CHECKPOINTS.filter(c => c.ageMonths <= age.months + 0.5).length,
    },
  };
}

/** „9 мес.“ / „3 г.“ — за заглавия. */
export function labelForAge(months) {
  if (months < 12) return `${months} мес.`;
  const y = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${y} г. ${rest} мес.` : `${y} г.`;
}
