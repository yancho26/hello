/* Плана на английски (версия 4.11): имената на храните, групите за пазаруване и подправките.
 * Всяка храна: [име, състояние след готвене] — „brown rice“, „cooked“. */

export const EN_FOODS = {
  oats: ['rolled oats'], muesli: ['muesli, no added sugar'], buckwheat: ['buckwheat', 'cooked'], quinoa: ['quinoa', 'cooked'],
  bread: ['whole-wheat bread'], ryebread: ['rye bread'], gfbread: ['gluten-free bread'], pita: ['whole-wheat pita'],
  rice: ['brown rice', 'cooked'], whiterice: ['white rice', 'cooked'], bulgur: ['bulgur', 'cooked'], couscous: ['couscous', 'cooked'],
  pasta: ['whole-wheat pasta', 'cooked'], potato: ['potatoes', 'boiled'], sweetpotato: ['sweet potato', 'baked'],
  lentils: ['lentils', 'cooked'], beans: ['beans', 'cooked'], chickpeas: ['chickpeas', 'cooked'], peas: ['green peas'],
  hummus: ['hummus'], tofu: ['tofu'],
  chicken: ['chicken breast', 'roasted'], chickenthigh: ['skinless chicken thigh', 'roasted'], turkey: ['turkey breast', 'roasted'],
  turkeymince: ['ground turkey'], beef: ['lean beef', 'cooked'], beefmince: ['lean ground beef'], pork: ['pork tenderloin', 'roasted'],
  hake: ['hake', 'baked'], trout: ['trout', 'baked'], mackerel: ['mackerel', 'baked'], salmon: ['salmon', 'baked'],
  sardines: ['sardines in olive oil, canned'], tuna: ['tuna in water, canned'], shrimp: ['shrimp', 'cooked'], egg: ['eggs'],
  milk: ['milk 1.5%'], lfmilk: ['lactose-free milk'], oatmilk: ['oat drink with calcium'], yogurt: ['yogurt 2%'],
  lfyogurt: ['lactose-free yogurt'], soyyogurt: ['plant-based yogurt (soy)'], oatyogurt: ['plant-based yogurt (oat)'],
  greekyogurt: ['strained (Greek) yogurt 2%'], kefir: ['kefir'], cottage: ['cottage cheese'],
  whitecheese: ['white brined cheese (feta type)'], kashkaval: ['kashkaval (yellow cheese)'], mozzarella: ['mozzarella'],
  walnuts: ['walnuts'], almonds: ['almonds'], hazelnuts: ['hazelnuts'], peanutbutter: ['peanut butter, no added sugar'],
  pumpkinseeds: ['pumpkin seeds'], sunflower: ['sunflower seeds, shelled'], tahini: ['tahini'], flax: ['flaxseed'],
  oil: ['olive oil'], avocado: ['avocado'], olives: ['olives'],
  tomato: ['tomatoes'], tomatosauce: ['tomato passata'], cucumber: ['cucumbers'], pepper: ['bell peppers'], lettuce: ['lettuce'],
  arugula: ['arugula'], spinach: ['spinach'], broccoli: ['broccoli'], zucchini: ['zucchini'], eggplant: ['eggplant'],
  carrot: ['carrots'], cabbage: ['cabbage'], greenbeans: ['green beans'], cauliflower: ['cauliflower'],
  mushrooms: ['button mushrooms'], onion: ['onion'], leek: ['leek'], beetroot: ['beetroot', 'cooked'], pumpkin: ['pumpkin', 'roasted'],
  radish: ['radishes'],
  apple: ['apple'], pear: ['pear'], orange: ['orange'], banana: ['banana'], peach: ['peach'], kiwi: ['kiwi'],
  berries: ['strawberries / berries'], plum: ['plums'], grapes: ['grapes'], watermelon: ['watermelon'],
  driedfruit: ['dried fruit (prunes, apricots)'], honey: ['honey'], darkchoc: ['dark chocolate 70%'],
  celery: ['celery (stalks)'], asparagus: ['asparagus'], kale: ['kale'], corn: ['corn (kernels)'],
  tomatopaste: ['tomato paste, no salt added'], mango: ['mango'], pineapple: ['pineapple'], tortilla: ['whole-wheat tortilla'],
  breadcrumbs: ['whole-wheat breadcrumbs'], flour: ['whole-wheat flour'], graham: ['whole-wheat (graham) crackers'],
  tunasteak: ['fresh tuna', 'grilled'], whitefish: ['white fish (cod, tilapia, sea bass)', 'baked'], eggwhite: ['egg white'],
  parmesan: ['parmesan'], sourcream: ['fat-free sour cream'], evapmilk: ['fat-free evaporated milk, unsweetened'],
  butter: ['butter'], mayo: ['reduced-fat mayonnaise'], coconutmilk: ['light coconut milk'], mustard: ['mustard'],
  soysauce: ['reduced-sodium soy sauce'], ketchup: ['ketchup'], sugar: ['sugar'], cornstarch: ['cornstarch'],
  hoisin: ['hoisin sauce'], cheddar: ['reduced-fat cheddar'], turkeysausage: ['reduced-fat turkey sausage'],
  phyllo: ['phyllo dough'], corntortilla: ['corn tortilla'], edamame: ['edamame (green soybeans)'],
  melon: ['cantaloupe'], plantain: ['plantain'], cereal: ['whole-grain oat rings (cereal)'], cornflakes: ['cornflakes'],
  cornbread: ['cornbread (muffin)'],
};

/** Пълното име: „brown rice, cooked“. */
export const enFoodName = (id) => (EN_FOODS[id] ? EN_FOODS[id].filter(Boolean).join(', ') : id);
/** Името без състоянието: „brown rice“. */
export const enBaseName = (id) => (EN_FOODS[id] ? EN_FOODS[id][0] : id);

export const EN_CATS = {
  veg: 'Vegetables', fruit: 'Fruit', grain: 'Grains and potatoes', legume: 'Legumes', protein: 'Meat, fish, eggs, tofu',
  dairy: 'Milk and dairy', nuts: 'Nuts and seeds', fat: 'Fats and olives', other: 'Other',
};

export const EN_FLAVOR = {
  'анасон': 'anise', 'балсамов оцет': 'balsamic vinegar', 'бахар': 'allspice', 'босилек': 'basil', 'бял пипер': 'white pepper',
  'бяло вино': 'white wine', 'ванилия': 'vanilla', 'горчица': 'mustard', 'горчица на прах': 'dry mustard', 'градински чай': 'sage',
  'дафинов лист': 'bay leaf', 'джинджифил': 'ginger', 'джоджен': 'spearmint', 'дижонска горчица': 'Dijon mustard',
  'естрагон': 'tarragon', 'зелен лук': 'green onion', 'зелено къри': 'green curry paste', 'зехтин': 'olive oil',
  'индийско орехче': 'nutmeg', 'кайен': 'cayenne', 'какао': 'cocoa', 'канела': 'cinnamon', 'каперси': 'capers',
  'карамфил': 'cloves', 'кардамон': 'cardamom', 'кимион': 'cumin', 'копър': 'dill', 'кориандър': 'coriander',
  'куркума': 'turmeric', 'къри': 'curry', 'лайм': 'lime', 'лимон': 'lemon', 'лимонена трева': 'lemongrass',
  'лимонова кора': 'lemon zest', 'лимонова трева': 'lemongrass', 'лук на прах': 'onion powder', 'лют пипер': 'hot pepper',
  'лют сос': 'hot sauce', 'лют червен пипер': 'chili powder', 'лют чили сос': 'hot chili sauce', 'люта чушка': 'chili pepper',
  'люти люспи': 'red pepper flakes', 'люти чушки': 'chili peppers', 'магданоз': 'parsley', 'майорана': 'marjoram',
  'малинов винегрет': 'raspberry vinaigrette', 'масло на върха на ножа': 'a little butter', 'мащерка': 'thyme', 'мента': 'mint',
  'мускатово орехче': 'nutmeg', 'оризов оцет': 'rice vinegar', 'оцет': 'vinegar', 'печени чушки': 'roasted peppers',
  'пикантна подправка без сол': 'salt-free spicy seasoning', 'портокал': 'orange', 'портокалова кора': 'orange zest',
  'пресен лук': 'scallions', 'пушен червен пипер': 'smoked paprika', 'рибен сос': 'fish sauce', 'риган': 'oregano',
  'розмарин': 'rosemary', 'салса': 'salsa', 'соев сос': 'soy sauce', 'сусам': 'sesame', 'сусамово олио': 'sesame oil',
  'халапеньо': 'jalapeño', 'червен винен оцет': 'red wine vinegar', 'червен лук': 'red onion', 'червен пипер': 'paprika',
  'червено вино': 'red wine', 'черен пипер': 'black pepper', 'чесън': 'garlic', 'чесън на прах': 'garlic powder', 'чили': 'chili',
  'чубрица': 'savory', 'ябълков оцет': 'cider vinegar',
};
