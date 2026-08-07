// Ручные правки карточек-слов: примеры употребления, части речи, транскрипция.
//
// Зачем отдельный файл. Каталог слов (vocabulary-{level}.ts) автогенерирован
// (repack-vocabulary.ts / reclassify-vocabulary.ts), поэтому любая правка внутри
// него живёт до следующего прогона генератора. Примеры там взяты из Викисловаря
// по значению, которое не всегда совпадает со значением карточки — ровно та
// проблема, о которой предупреждает WORDS.md: перевод от одного значения,
// пример от другого. Отсюда три вида брака:
//
//   1. примера нет вовсе (exEn/exRu — пустые строки);
//   2. пример не про то значение: jam «варенье» → пример про пробку,
//      lemon «лимон» → про плохую машину, tie «галстук» → про ничью;
//   3. пример нельзя показывать ребёнку (downstairs → про поднятую ветром юбку).
//
// Правки собираются руками, батчами, и накладываются поверх датасета при
// сидинге (см. seed-flashcards.ts). Генератор их не затирает.
//
// Правила заполнения:
//   • ключ — слово ровно как в датасете, в нижнем регистре;
//   • пример показывает ИМЕННО то значение, которое написано в переводе
//     карточки, иначе ученик выучит не то;
//   • одно короткое предложение, лексика уровня карточки или ниже;
//   • exRu — перевод этого же предложения, а не пересказ;
//   • pos/ipa указываются только когда в датасете они явно битые
//     (curly помечено noun, транскрипция вида «/-i/»).
//
// Проверка покрытия: pnpm validate:examples

import type { SeedDeck } from "./flashcards-data";

export type ExampleFix = {
  exEn?: string;
  exRu?: string;
  pos?: string;
  ipa?: string;
};

// Батч 1 — уровень A2 (слова; словосочетания и фразы идут отдельным батчем).
export const EXAMPLE_FIXES: Record<string, ExampleFix> = {
  // ── пример был не про то значение или не для детей ───────────────────────
  downstairs: { exEn: "My parents are downstairs in the kitchen.", exRu: "Мои родители внизу, на кухне.", pos: "adverb" },
  worse: { exEn: "The weather today is worse than yesterday.", exRu: "Погода сегодня хуже, чем вчера." },
  worst: { exEn: "This is the worst film I have ever seen.", exRu: "Это худший фильм, который я когда-либо видел." },
  bean: { exEn: "Beans are a cheap and healthy food.", exRu: "Бобы — дешёвая и полезная еда." },
  jam: { exEn: "I like strawberry jam on my bread.", exRu: "Я люблю клубничное варенье на хлебе." },
  lemon: { exEn: "She put a slice of lemon in her tea.", exRu: "Она положила ломтик лимона в чай." },
  tie: { exEn: "My father wears a blue tie to work.", exRu: "Мой папа носит на работу синий галстук." },
  cooker: { exEn: "Mum is heating the soup on the cooker.", exRu: "Мама разогревает суп на плите." },
  curly: { exEn: "She has long curly hair.", exRu: "У неё длинные кудрявые волосы.", pos: "adjective" },
  crowded: { exEn: "The bus was crowded this morning.", exRu: "Утром автобус был переполнен.", pos: "adjective" },
  polite: { pos: "adjective" },
  brain: { exEn: "The brain controls the whole body.", exRu: "Мозг управляет всем телом." },
  thin: { exEn: "The ice on the lake is still thin.", exRu: "Лёд на озере ещё тонкий.", pos: "adjective" },
  fat: { exEn: "The cat is too fat to jump on the shelf.", exRu: "Кот слишком толстый, чтобы прыгнуть на полку.", pos: "adjective" },
  better: { exEn: "I feel better today, thank you.", exRu: "Сегодня мне лучше, спасибо.", ipa: "/ˈbɛtə/" },
  badly: { exEn: "He sings badly, but he enjoys it.", exRu: "Он плохо поёт, но ему это нравится.", pos: "adverb" },
  lovely: { exEn: "What a lovely day!", exRu: "Какой прекрасный день!", pos: "adjective" },
  pants: { exEn: "He bought new black pants.", exRu: "Он купил новые чёрные брюки." },
  guy: { exEn: "He is a nice guy.", exRu: "Он хороший парень." },
  hero: { exEn: "The hero of the book saves the city.", exRu: "Герой книги спасает город." },
  race: { exEn: "People of every race live in this city.", exRu: "В этом городе живут люди всех рас." },
  fan: { exEn: "Turn on the fan, it is hot in here.", exRu: "Включи вентилятор, здесь жарко." },
  coach: { exEn: "Our coach teaches us to play football.", exRu: "Наш тренер учит нас играть в футбол." },
  film: { exEn: "We watched a funny film yesterday.", exRu: "Вчера мы смотрели смешной фильм." },
  novel: { exEn: "She is reading a long novel.", exRu: "Она читает длинный роман.", pos: "noun" },
  passenger: { exEn: "Every passenger must have a ticket.", exRu: "У каждого пассажира должен быть билет." },
  patient: { exEn: "The doctor is talking to a patient.", exRu: "Врач разговаривает с пациентом." },
  season: { exEn: "Summer is my favourite season.", exRu: "Лето — мой любимый сезон." },
  fork: { exEn: "Eat your salad with a fork.", exRu: "Ешь салат вилкой." },
  oil: { exEn: "Add a little oil to the pan.", exRu: "Добавь немного масла на сковороду." },
  home: { exEn: "I go home after school.", exRu: "После школы я иду домой." },
  flat: { exEn: "The road here is flat and straight.", exRu: "Дорога здесь плоская и прямая.", pos: "adjective" },
  tidy: { exEn: "Her room is always tidy.", exRu: "Её комната всегда аккуратная.", pos: "adjective" },
  bone: { exEn: "The dog is chewing a bone.", exRu: "Собака грызёт кость." },
  stomach: { exEn: "Cold water is bad for your stomach.", exRu: "Холодная вода вредна для желудка." },
  shoulder: { exEn: "He carries the bag on his shoulder.", exRu: "Он несёт сумку на плече." },
  skin: { exEn: "The sun is bad for your skin.", exRu: "Солнце вредно для кожи." },
  ill: { exEn: "She is ill and stays in bed.", exRu: "Она больна и лежит в постели.", pos: "adjective" },
  deep: { exEn: "The river is very deep here.", exRu: "Река здесь очень глубокая.", pos: "adjective" },
  narrow: { exEn: "The street is too narrow for two cars.", exRu: "Улица слишком узкая для двух машин.", pos: "adjective" },
  empty: { exEn: "The box is empty.", exRu: "Коробка пустая.", pos: "adjective" },
  heavy: { exEn: "This bag is too heavy for me.", exRu: "Эта сумка слишком тяжёлая для меня.", pos: "adjective" },
  high: { exEn: "The mountain is very high.", exRu: "Гора очень высокая.", pos: "adjective" },
  low: { exEn: "The chair is too low for this table.", exRu: "Стул слишком низкий для этого стола.", pos: "adjective" },
  clear: { exEn: "The water in the lake is clear.", exRu: "Вода в озере прозрачная.", pos: "adjective" },
  fair: { exEn: "It is not fair to take her toys.", exRu: "Несправедливо забирать её игрушки.", pos: "adjective" },
  typical: { exEn: "It was a typical winter day.", exRu: "Это был типичный зимний день.", pos: "adjective" },
  onto: { exEn: "The cat jumped onto the table.", exRu: "Кот прыгнул на стол.", pos: "preposition" },
  round: { exEn: "The moon is round tonight.", exRu: "Сегодня луна круглая.", pos: "adjective" },
  since: { exEn: "I have lived here since 2019.", exRu: "Я живу здесь с 2019 года.", pos: "preposition" },
  shut: { exEn: "Please shut the door.", exRu: "Пожалуйста, закрой дверь.", pos: "verb" },
  suit: { exEn: "This hat suits you.", exRu: "Эта шляпа тебе подходит.", pos: "verb" },
  cover: { exEn: "Put the cover back on the box.", exRu: "Положи крышку обратно на коробку." },
  ring: { exEn: "She wears a gold ring.", exRu: "Она носит золотое кольцо." },
  jewellery: { exEn: "She keeps her jewellery in a small box.", exRu: "Она хранит свои ювелирные изделия в маленькой шкатулке." },
  washing: { exEn: "There is a lot of washing today.", exRu: "Сегодня много стирки.", pos: "noun" },
  missing: { exEn: "One page is missing from the book.", exRu: "В книге отсутствует одна страница.", pos: "adjective" },
  understanding: { exEn: "She showed real understanding of the problem.", exRu: "Она показала настоящее понимание проблемы.", pos: "noun" },
  surprised: { exEn: "I was surprised to see her here.", exRu: "Я был удивлён увидеть её здесь.", pos: "adjective" },
  scared: { exEn: "The dog looks scared.", exRu: "Собака выглядит испуганной.", pos: "adjective" },
  connected: { exEn: "The printer is connected to my laptop.", exRu: "Принтер подключён к моему ноутбуку.", pos: "adjective" },
  wedding: { exEn: "They invited us to their wedding.", exRu: "Они пригласили нас на свою свадьбу.", pos: "noun" },
  clothing: { exEn: "Take warm clothing with you.", exRu: "Возьми с собой тёплую одежду.", pos: "noun" },
  broken: { exEn: "The window is broken.", exRu: "Окно сломано.", pos: "adjective" },
  closed: { exEn: "The shop is closed on Sunday.", exRu: "В воскресенье магазин закрыт.", pos: "adjective" },
  lost: { exEn: "My keys are lost again.", exRu: "Мои ключи снова потеряны.", pos: "adjective" },
  drawing: { exEn: "Her drawing of a horse is beautiful.", exRu: "Её рисунок лошади прекрасен.", pos: "noun" },
  singing: { exEn: "Her singing woke up the whole house.", exRu: "Её пение разбудило весь дом.", pos: "noun" },
  running: { exEn: "Running is good for your health.", exRu: "Бег полезен для здоровья.", pos: "noun" },
  driving: { exEn: "Driving in the city is difficult.", exRu: "Вождение в городе сложное.", pos: "noun" },
  camping: { exEn: "We love camping by the lake.", exRu: "Мы любим кемпинг у озера.", pos: "noun" },
  sailing: { exEn: "Sailing is his favourite sport.", exRu: "Парусный спорт — его любимый вид спорта.", pos: "noun" },
  smoking: { exEn: "Smoking is bad for your health.", exRu: "Курение вредно для здоровья.", pos: "noun" },
  following: { exEn: "We met again the following day.", exRu: "Мы встретились снова на следующий день.", pos: "adjective" },
  surprising: { exEn: "The result was surprising.", exRu: "Результат был удивительным.", pos: "adjective" },
  personality: { ipa: "/ˌpɜːsəˈnælɪti/" },
  actually: { ipa: "/ˈæktʃuəli/" },
  nut: { ipa: "/nʌt/" },
  mirror: { ipa: "/ˈmɪɹə/" },
  individual: { ipa: "/ˌɪndɪˈvɪdʒuəl/" },

  // ── примера не было вовсе ────────────────────────────────────────────────
  castle: { exEn: "The old castle stands on a hill.", exRu: "Старый замок стоит на холме." },
  palace: { exEn: "The king lives in a big palace.", exRu: "Король живёт в большом дворце." },
  site: { exEn: "You can read the news on our site.", exRu: "Новости можно прочитать на нашем сайте." },
  stair: { exEn: "She sat down on the bottom stair.", exRu: "Она села на нижнюю ступеньку лестницы." },
  tower: { exEn: "We climbed to the top of the tower.", exRu: "Мы поднялись на верх башни." },
  daily: { exEn: "I learn new English words daily.", exRu: "Я ежедневно учу новые английские слова.", pos: "adverb" },
  secondly: { exEn: "Firstly, it is cheap; secondly, it is fast.", exRu: "Во-первых, это дёшево; во-вторых, быстро." },
  fridge: { exEn: "Put the milk in the fridge.", exRu: "Поставь молоко в холодильник." },
  oven: { exEn: "The cake is in the oven.", exRu: "Пирог в печи." },
  lamp: { exEn: "Turn on the lamp, I want to read.", exRu: "Включи лампу, я хочу почитать." },
  knife: { exEn: "Cut the bread with this knife.", exRu: "Разрежь хлеб этим ножом." },
  boil: { exEn: "Boil the eggs for five minutes.", exRu: "Вари яйца пять минут.", pos: "verb" },
  queen: { exEn: "The queen lives in London.", exRu: "Королева живёт в Лондоне." },
  nervous: { exEn: "She is nervous before the exam.", exRu: "Она нервная перед экзаменом." },
  uniform: { exEn: "Our school uniform is blue.", exRu: "Наша школьная униформа синяя." },
  celebrity: { exEn: "The celebrity arrived in a black car.", exRu: "Знаменитость приехала на чёрной машине." },
  sock: { exEn: "I cannot find my other sock.", exRu: "Я не могу найти второй носок." },
  simple: { exEn: "This exercise is very simple.", exRu: "Это упражнение очень простое.", pos: "adjective" },
  baseball: { exEn: "American children often play baseball.", exRu: "Американские дети часто играют в бейсбол." },
  golf: { exEn: "My grandfather plays golf every Sunday.", exRu: "Мой дедушка играет в гольф каждое воскресенье." },
  hockey: { exEn: "In winter we play hockey on the ice.", exRu: "Зимой мы играем в хоккей на льду." },
  ski: { exEn: "New skis are expensive.", exRu: "Новые лыжи дорогие." },
  skiing: { exEn: "Skiing in the mountains is fun.", exRu: "Катание на лыжах в горах — это весело.", pos: "noun" },
  soccer: { exEn: "They play soccer after school.", exRu: "Они играют в футбол после школы." },
  basketball: { exEn: "Basketball players are usually tall.", exRu: "Баскетболисты обычно высокие." },
  trainer: { exEn: "My trainer helps me at the gym.", exRu: "Мой тренер помогает мне в спортзале." },
  cartoon: { exEn: "The children are watching a cartoon.", exRu: "Дети смотрят мультфильм." },
  director: { exEn: "The director of our school is strict.", exRu: "Директор нашей школы строгий." },
  drama: { exEn: "We saw a drama about a young doctor.", exRu: "Мы смотрели драму о молодом враче." },
  musician: { exEn: "My sister is a talented musician.", exRu: "Моя сестра — талантливый музыкант." },
  tradition: { exEn: "It is a family tradition to cook together.", exRu: "Готовить вместе — семейная традиция." },
  vehicle: { exEn: "This vehicle is too big for our garage.", exRu: "Это транспортное средство слишком большое для нашего гаража." },
  equipment: { exEn: "The gym has new equipment.", exRu: "В спортзале новое оборудование." },
  solution: { exEn: "We found a simple solution to the problem.", exRu: "Мы нашли простое решение проблемы." },
  leader: { exEn: "She is the leader of our team.", exRu: "Она лидер нашей команды." },
  ending: { exEn: "The film has a happy ending.", exRu: "У фильма счастливое окончание." },
  arrangement: { exEn: "We made an arrangement to meet on Friday.", exRu: "Мы достигли договорённости встретиться в пятницу." },
  compete: { exEn: "Small shops compete with big supermarkets.", exRu: "Маленькие магазины конкурируют с большими супермаркетами." },
  disappear: { exEn: "The sun disappeared behind the clouds.", exRu: "Солнце пропало за облаками." },
  exist: { exEn: "Dinosaurs do not exist any more.", exRu: "Динозавры больше не существуют." },
  pass: { exEn: "We pass the school on the way home.", exRu: "По дороге домой мы проходим школу." },
  refer: { exEn: "The teacher referred to page ten.", exRu: "Учитель ссылался на десятую страницу." },
  refuse: { exEn: "The refuse is collected on Mondays.", exRu: "Мусор вывозят по понедельникам." },
  correctly: { exEn: "You answered the question correctly.", exRu: "Ты правильно ответил на вопрос." },
  differently: { exEn: "My brother and I think differently.", exRu: "Мой брат и я думаем по-другому." },
  extremely: { exEn: "It is extremely cold today.", exRu: "Сегодня очень сильно холодно." },
  enormous: { exEn: "They live in an enormous house.", exRu: "Они живут в громадном доме." },
  happily: { exEn: "The children played happily in the garden.", exRu: "Дети счастливо играли в саду." },
  helpful: { exEn: "Your advice was very helpful.", exRu: "Твой совет был очень полезным." },
  possibility: { exEn: "We discussed the possibility of a trip.", exRu: "Мы обсудили возможность поездки." },
  quietly: { exEn: "Please close the door quietly.", exRu: "Пожалуйста, закрой дверь тихо." },
  slowly: { exEn: "My grandmother walks slowly.", exRu: "Моя бабушка идёт медленно." },
  unfortunately: { exEn: "Unfortunately, the shop was closed.", exRu: "К сожалению, магазин был закрыт." },
  "good luck": { exEn: "Good luck with your exam!", exRu: "Удачи на экзамене!" },
  "art gallery": { exEn: "We saw old paintings in the art gallery.", exRu: "Мы видели старые картины в художественной галерее." },
  "any more": { exEn: "I do not want any more soup.", exRu: "Я больше не хочу супа." },
};

export function fixFor(en: string): ExampleFix | undefined {
  return EXAMPLE_FIXES[en.trim().toLowerCase()];
}

// Накладывает правки на датасет. Возвращает новые объекты: исходные литералы
// из vocabulary-{level}.ts не мутируются, чтобы генератор и тесты видели файлы
// такими, какие они на диске.
export function applyExampleFixes(decks: SeedDeck[]): SeedDeck[] {
  return decks.map((deck) => ({
    ...deck,
    words: deck.words.map((w) => {
      const fix = fixFor(w.en);
      if (!fix) return w;
      return {
        ...w,
        pos: fix.pos ?? w.pos,
        ipa: fix.ipa ?? w.ipa,
        exEn: fix.exEn ?? w.exEn,
        exRu: fix.exRu ?? w.exRu,
      };
    }),
  }));
}
