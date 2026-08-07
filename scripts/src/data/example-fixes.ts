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
//   • у конструкций (sth, sb, …) плейсхолдер в примере раскрыт реальным словом:
//     «give sth up» без предмета остаётся абстракцией;
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

// Батч 1 — уровень A2, отдельные слова.
const A2_WORDS: Record<string, ExampleFix> = {
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

// Батч 2 — уровень A2, словосочетания и фразы (pos: "phrase" и родственные).
// Примеров у них не было вообще: карточка показывала «in the end — в конце
// концов», и куда это вставлять в речь, ученик не узнавал. Плейсхолдеры (sth,
// sb, …) в примере раскрыты конкретным словом.
const A2_PHRASES: Record<string, ExampleFix> = {
  // время и место
  "at the time": { exEn: "I was at school at the time.", exRu: "В то время я был в школе." },
  "at the time of sth": { exEn: "At the time of the storm we stayed at home.", exRu: "Во время шторма мы оставались дома." },
  "per hour": { exEn: "The car goes ninety kilometres per hour.", exRu: "Машина едет девяносто километров в час." },
  "a long time ago": { exEn: "This castle was built a long time ago.", exRu: "Этот замок построили давным-давно." },
  "a long way": { exEn: "It is a long way from here to the station.", exRu: "Отсюда до станции долгий путь." },
  "at first": { exEn: "At first the task looked difficult.", exRu: "Сначала задание казалось сложным." },
  "at the age of…": { exEn: "She started school at the age of six.", exRu: "Она пошла в школу в возрасте шести лет." },
  "by the end of sth": { exEn: "By the end of the week I will finish the book.", exRu: "К концу недели я закончу книгу." },
  "at the start of sth": { exEn: "We met at the start of the year.", exRu: "Мы познакомились в начале года." },
  "in the end": { exEn: "In the end we decided to stay at home.", exRu: "В конце концов мы решили остаться дома." },
  "in the middle": { exEn: "A big table stands in the middle.", exRu: "Большой стол стоит в середине." },
  "all the time": { exEn: "He talks about football all the time.", exRu: "Он всё время говорит о футболе." },
  "again and again": { exEn: "She read the letter again and again.", exRu: "Она читала письмо снова и снова." },
  "on the wall": { exEn: "There is a big map on the wall.", exRu: "На стене большая карта." },
  "in the air": { exEn: "The smell of coffee was in the air.", exRu: "В воздухе стоял запах кофе." },
  "on top of sth/sb": { exEn: "The cat sleeps on top of the box.", exRu: "Кот спит поверх коробки." },
  "on the other side": { exEn: "The bus stop is on the other side.", exRu: "Автобусная остановка с другой стороны." },
  "the other side of sth": { exEn: "They live on the other side of the town.", exRu: "Они живут на другой стороне города." },

  // чувства и оценки
  "feel good": { exEn: "I feel good after a long walk.", exRu: "Я чувствую себя хорошо после долгой прогулки." },
  "feel like sth": { exEn: "I feel like a new person after the holiday.", exRu: "После отпуска я чувствую себя новым человеком." },
  "happy with sb/sth": { exEn: "The teacher is happy with my work.", exRu: "Учитель доволен моей работой." },
  "i'm afraid…": { exEn: "I'm afraid we are late.", exRu: "Боюсь, мы опоздали." },
  "sound like sb/sth": { exEn: "That sounds like a good idea.", exRu: "Это звучит как хорошая идея." },
  "worried about sb/sth": { exEn: "She is worried about her exam.", exRu: "Она беспокоится о своём экзамене." },
  "would love to do sth": { exEn: "I would love to visit London.", exRu: "Я хотел бы посетить Лондон." },
  "in love": { exEn: "They are in love and want to marry.", exRu: "Они влюблены и хотят пожениться." },
  "in danger": { exEn: "The animals in this forest are in danger.", exRu: "Животные в этом лесу в опасности." },
  "much better": { exEn: "I feel much better today.", exRu: "Сегодня я чувствую себя намного лучше." },

  // здоровье и части целого
  "health problems": { exEn: "Smoking causes serious health problems.", exRu: "Курение вызывает серьёзные проблемы со здоровьем." },
  "in hospital": { exEn: "My uncle is in hospital after the accident.", exRu: "Мой дядя в больнице после аварии." },
  "the rest of sth": { exEn: "I will eat the rest of the cake tomorrow.", exRu: "Остальную часть пирога я съем завтра." },
  "for the rest of sth": { exEn: "He stayed in bed for the rest of the day.", exRu: "Он остался в постели на остальную часть дня." },
  "as part of sth": { exEn: "We visited a farm as part of the trip.", exRu: "Мы посетили ферму как часть поездки." },

  // количество и перечисление
  "a couple of sth": { exEn: "I need a couple of days to finish the work.", exRu: "Мне нужна пара дней, чтобы закончить работу." },
  "a number of sth": { exEn: "A number of students were late.", exRu: "Ряд учеников опоздал." },
  "one or two": { exEn: "I have one or two questions.", exRu: "У меня один или два вопроса." },
  "quite a lot": { exEn: "She knows quite a lot about music.", exRu: "Она знает довольно много о музыке." },
  "less than…": { exEn: "The trip takes less than an hour.", exRu: "Поездка занимает меньше, чем час." },
  "even more…": { exEn: "He wants even more sweets.", exRu: "Он хочет даже больше конфет." },
  "each one": { exEn: "There are five boxes, and each one is full.", exRu: "Здесь пять коробок, и каждая полная." },
  "everyone else": { exEn: "Everyone else went home early.", exRu: "Все остальные ушли домой рано." },
  "all kinds of…": { exEn: "The shop sells all kinds of bread.", exRu: "В магазине продают все виды хлеба." },
  "all sorts of…": { exEn: "We saw all sorts of animals at the zoo.", exRu: "Мы видели всяких животных в зоопарке." },
  "all over…": { exEn: "Toys were all over the floor.", exRu: "Игрушки были повсюду на полу." },
  "all about…": { exEn: "This book is all about space.", exRu: "Эта книга вся о космосе." },
  "sort of sth": { exEn: "It is a sort of soup with fish.", exRu: "Это что-то типа супа с рыбой." },
  "such a/an…": { exEn: "It was such a nice day.", exRu: "Это был такой хороший день." },

  // порядок мысли и связки
  "first of all": { exEn: "First of all, wash your hands.", exRu: "Прежде всего, вымой руки." },
  "the first thing": { exEn: "The first thing I do is drink water.", exRu: "Первое, что я делаю, — пью воду." },
  "the best thing": { exEn: "The best thing about summer is the sea.", exRu: "Лучшая вещь в лете — это море." },
  "the important thing": { exEn: "The important thing is to try again.", exRu: "Важная вещь — попробовать снова." },
  "the following…": { exEn: "Read the following text.", exRu: "Прочитай следующий текст." },
  "in some cases": { exEn: "In some cases the train is late.", exRu: "В некоторых случаях поезд опаздывает." },
  "in the same way": { exEn: "Do it in the same way as yesterday.", exRu: "Сделай это таким же образом, как вчера." },
  "in this way": { exEn: "In this way you save a lot of time.", exRu: "Таким образом ты экономишь много времени." },
  "instead of": { exEn: "Let's walk instead of taking the bus.", exRu: "Давай пойдём пешком вместо автобуса." },
  "except for": { exEn: "The shop is open every day except for Sunday.", exRu: "Магазин открыт каждый день, за исключением воскресенья." },
  "if necessary": { exEn: "Call me again if necessary.", exRu: "Позвони мне снова, если необходимо." },
  "if you want to": { exEn: "You can come with us if you want to.", exRu: "Ты можешь пойти с нами, если хочешь." },
  "come on!": { exEn: "Come on! We are late.", exRu: "Ну давай же! Мы опаздываем." },

  // люди, жизнь, работа
  "old friend": { exEn: "I met an old friend from school.", exRu: "Я встретил старого друга из школы." },
  "ordinary people": { exEn: "The film is about ordinary people.", exRu: "Фильм об обычных людях." },
  "in business": { exEn: "Her family has been in business for years.", exRu: "Её семья в бизнесе уже много лет." },
  "in history": { exEn: "It was the coldest winter in history.", exRu: "Это была самая холодная зима в истории." },
  "in prison": { exEn: "The thief spent two years in prison.", exRu: "Вор провёл два года в тюрьме." },
  "make money": { exEn: "He makes money by selling bread.", exRu: "Он зарабатывает деньги, продавая хлеб." },
  "do well": { exEn: "She did well in her exams.", exRu: "Она преуспела на экзаменах." },
  "take part": { exEn: "Ten schools took part in the competition.", exRu: "В соревновании приняли участие десять школ." },

  // действия и конструкции с глаголом
  "used to": { exEn: "I am used to getting up early.", exRu: "Я привык вставать рано." },
  "able to do sth": { exEn: "She is able to swim very well.", exRu: "Она способна плавать очень хорошо." },
  "be allowed to do sth": { exEn: "Children are allowed to play here.", exRu: "Детям разрешено играть здесь." },
  "be made of sth": { exEn: "This box is made of wood.", exRu: "Эта коробка сделана из дерева." },
  "add to sth": { exEn: "Add some salt to the soup.", exRu: "Добавь немного соли к супу." },
  "carry sth out": { exEn: "The doctors carried out a simple test.", exRu: "Врачи осуществили простой тест." },
  "end with sth": { exEn: "The film ends with a song.", exRu: "Фильм заканчивается песней." },
  "start with sb/sth": { exEn: "The lesson starts with a short song.", exRu: "Урок начинается с короткой песни." },
  "followed by sb/sth": { exEn: "Dinner was followed by a long walk.", exRu: "За ужином последовала долгая прогулка." },
  "lead to sth": { exEn: "This path leads to the river.", exRu: "Эта дорожка ведёт к реке." },
  "fill sth in": { exEn: "Please fill in this form.", exRu: "Пожалуйста, заполните эту форму." },
  "look sth up": { exEn: "Look the new word up in the dictionary.", exRu: "Поищи новое слово в словаре." },
  "write sth down": { exEn: "Write down the new words in your notebook.", exRu: "Запиши новые слова в тетрадь." },
  "give sth up": { exEn: "He gave up sweets for a month.", exRu: "Он бросил сладкое на месяц." },
  "throw sth away": { exEn: "Do not throw away this box.", exRu: "Не выбрасывай эту коробку." },
  "pick sb/sth up": { exEn: "My father picks me up after school.", exRu: "Мой папа забирает меня после школы." },
  "put sth on": { exEn: "Put on your coat, it is cold outside.", exRu: "Надень пальто, на улице холодно." },
  "take sth off": { exEn: "Take off your shoes at the door.", exRu: "Сними обувь у двери." },
  "turn sth on": { exEn: "Turn on the radio, please.", exRu: "Включи радио, пожалуйста." },
  "turn sth off": { exEn: "Turn off the light before you leave.", exRu: "Выключи свет перед уходом." },
  "take care of sb/sth/yourself": { exEn: "Take care of your little sister.", exRu: "Позаботься о своей младшей сестре." },
  "go and…": { exEn: "Go and wash your hands.", exRu: "Иди и вымой руки." },
  "go away": { exEn: "Go away and leave me alone.", exRu: "Уходите и оставьте меня в покое." },
  "go down sth": { exEn: "Go down this street to the bridge.", exRu: "Спуститесь вниз по этой улице до моста." },
  "go for sth": { exEn: "Let's go for a walk after lunch.", exRu: "Пойдём на прогулку после обеда." },
};

export const EXAMPLE_FIXES: Record<string, ExampleFix> = { ...A2_WORDS, ...A2_PHRASES };

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
