// Многозначные слова: учим только словосочетаниями, одиночной карточки нет.
//
// Проблема. У chest два равно ходовых значения — грудь и сундук. Карточка в
// каталоге одна, поэтому одно значение назначается «главным», а второе не
// учится вообще. Завести вторую карточку с тем же english нельзя:
//
//   1. сид дедуплицирует слова внутри колоды по lower(english) — вторая строка
//      молча не попадёт в базу (см. seed-flashcards.ts);
//   2. даже если бы попала, упражнение choiceRu показало бы «chest» и два
//      верных варианта («грудь» и «сундук»): buildExercise прячет от
//      дистракторов только переводы ТОЙ ЖЕ строки (word.translationsRu),
//      про однофамильца в соседней строке он не знает. Вышла бы ловушка.
//
// Решение. Одиночную карточку такого слова убираем совсем, а каждый смысл
// заводим отдельным словосочетанием: a treasure chest и chest pain. У целой
// фразы значение одно, поэтому двусмысленность исчезает физически, а не по
// договорённости, и выбирать «главный» перевод не приходится — это ровно то
// главное решение, которое описано в WORDS.md.
//
// Что важно помнить:
//   • слово выносится сюда только если оба смысла реально ходовые. Редкое
//     второе значение (lemon как «плохая машина») — не повод убирать карточку;
//   • смыслов должно быть минимум два, иначе слово просто потеряется;
//   • фраза живая и короткая, по ней сразу виден нужный смысл;
//   • ru — перевод фразы целиком, а не отдельного слова;
//   • theme — существующая колода, её уровень должен совпадать с cefr фразы;
//   • ipa у фраз не заполняем: в каталоге у словосочетаний она пустая;
//   • ФРАЗЫ НЕ ДОЛЖНО БЫТЬ В КАТАЛОГЕ отдельной карточкой — сид отбросит
//     дубликат, и смысл снова не будет учиться. Именно на этом спотыкался
//     present: «at present» уже лежит в каталоге как самостоятельная карточка,
//     поэтому здесь стоит «at the present moment»;
//   • перечислять фразы для КАЖДОГО уровня, где слово встречается, не нужно:
//     недостающие уровни закрываются зеркалированием (см. applyPolysemous).
//
// Проверка: pnpm validate:examples

import type { SeedDeck } from "./flashcards-data";

export type SensePhrase = {
  /** Тема колоды, в которую добавляется карточка. */
  theme: string;
  en: string;
  ru: string[];
  exEn: string;
  exRu: string;
  cefr: string;
};

export type PolysemousWord = {
  /** Слово, у которого убирается одиночная карточка. */
  word: string;
  /** Его ходовые смыслы — каждый отдельным словосочетанием (минимум два). */
  phrases: SensePhrase[];
};

// ── A1 ───────────────────────────────────────────────────────────────────────
const A1: PolysemousWord[] = [
  {
    word: "glass",
    phrases: [
      { theme: "food_drink_a1", en: "a glass of water", ru: ["стакан воды"], exEn: "Could you bring me a glass of water?", exRu: "Не мог бы ты принести мне стакан воды?", cefr: "A1" },
      { theme: "food_drink_a1", en: "a glass door", ru: ["стеклянная дверь"], exEn: "The shop has a big glass door.", exRu: "У магазина большая стеклянная дверь.", cefr: "A1" },
    ],
  },
  {
    word: "date",
    phrases: [
      { theme: "daily_life_a1", en: "an important date", ru: ["важная дата"], exEn: "The first of September is an important date for us.", exRu: "Первое сентября — важная дата для нас.", cefr: "A1" },
      { theme: "food_drink_a1", en: "dried dates", ru: ["сушёные финики"], exEn: "We bought dried dates at the market.", exRu: "Мы купили сушёные финики на рынке.", cefr: "A1" },
      { theme: "family_people_a1", en: "go on a date", ru: ["пойти на свидание"], exEn: "My sister went on a date yesterday.", exRu: "Моя сестра вчера пошла на свидание.", cefr: "A1" },
    ],
  },
  {
    word: "match",
    phrases: [
      { theme: "leisure_culture_a1", en: "a football match", ru: ["футбольный матч"], exEn: "The football match starts at six.", exRu: "Футбольный матч начинается в шесть.", cefr: "A1" },
      { theme: "leisure_culture_a1", en: "a box of matches", ru: ["коробка спичек"], exEn: "There is a box of matches near the cooker.", exRu: "Рядом с плитой лежит коробка спичек.", cefr: "A1" },
      { theme: "leisure_culture_a1", en: "these socks do not match", ru: ["эти носки не подходят друг другу"], exEn: "These socks do not match, one is blue.", exRu: "Эти носки не подходят друг другу, один синий.", cefr: "A1" },
    ],
  },
  {
    word: "order",
    phrases: [
      { theme: "appearance_qualities_a1", en: "in the right order", ru: ["в правильном порядке"], exEn: "Put the pictures in the right order.", exRu: "Разложи картинки в правильном порядке.", cefr: "A1" },
      { theme: "appearance_qualities_a1", en: "order a pizza", ru: ["заказать пиццу"], exEn: "Let's order a pizza tonight.", exRu: "Давай закажем пиццу сегодня вечером.", cefr: "A1" },
    ],
  },
  {
    word: "spring",
    phrases: [
      { theme: "daily_life_a1", en: "in spring", ru: ["весной"], exEn: "In spring the garden is full of flowers.", exRu: "Весной сад полон цветов.", cefr: "A1" },
      { theme: "daily_life_a1", en: "a metal spring", ru: ["металлическая пружина"], exEn: "A metal spring inside the chair is broken.", exRu: "Металлическая пружина внутри стула сломана.", cefr: "A1" },
    ],
  },
  {
    word: "watch",
    phrases: [
      { theme: "appearance_qualities_a1", en: "look at your watch", ru: ["посмотреть на свои часы"], exEn: "Look at your watch, we are late.", exRu: "Посмотри на свои часы, мы опаздываем.", cefr: "A1" },
      { theme: "appearance_qualities_a1", en: "watch a film", ru: ["смотреть фильм"], exEn: "We watch a film every Friday.", exRu: "Мы смотрим фильм каждую пятницу.", cefr: "A1" },
    ],
  },
  {
    word: "light",
    phrases: [
      { theme: "appearance_qualities_a1", en: "turn on the light", ru: ["включить свет"], exEn: "Turn on the light, it is dark here.", exRu: "Включи свет, здесь темно.", cefr: "A1" },
      { theme: "appearance_qualities_a1", en: "a light bag", ru: ["лёгкая сумка"], exEn: "Take a light bag for the trip.", exRu: "Возьми в поездку лёгкую сумку.", cefr: "A1" },
    ],
  },
  {
    word: "play",
    phrases: [
      { theme: "leisure_culture_a1", en: "play football", ru: ["играть в футбол"], exEn: "They play football after school.", exRu: "Они играют в футбол после школы.", cefr: "A1" },
      { theme: "leisure_culture_a1", en: "a school play", ru: ["школьная пьеса"], exEn: "Our class is preparing a school play.", exRu: "Наш класс готовит школьную пьесу.", cefr: "A1" },
    ],
  },
  {
    word: "point",
    phrases: [
      { theme: "leisure_culture_a1", en: "win a point", ru: ["выиграть очко"], exEn: "Our team won a point in the last minute.", exRu: "Наша команда выиграла очко в последнюю минуту.", cefr: "A1" },
      { theme: "leisure_culture_a1", en: "the main point", ru: ["главная мысль"], exEn: "The main point of the text is simple.", exRu: "Главная мысль текста проста.", cefr: "A1" },
    ],
  },
  {
    word: "bank",
    phrases: [
      { theme: "work_money_a1", en: "money in the bank", ru: ["деньги в банке"], exEn: "He keeps his money in the bank.", exRu: "Он держит свои деньги в банке.", cefr: "A1" },
      { theme: "work_money_a1", en: "the river bank", ru: ["берег реки"], exEn: "We sat on the river bank and watched the boats.", exRu: "Мы сидели на берегу реки и смотрели на лодки.", cefr: "A1" },
    ],
  },
  {
    word: "present",
    phrases: [
      { theme: "work_money_a1", en: "a birthday present", ru: ["подарок на день рождения"], exEn: "She opened her birthday present at once.", exRu: "Она сразу открыла свой подарок на день рождения.", cefr: "A1" },
      // «at present» здесь стоять не может: точно такая карточка уже есть в
      // каталоге, и сид отбросил бы дубликат — смысл «в настоящее время» снова
      // не учился бы. Фраза длиннее, зато она своя.
      { theme: "work_money_a1", en: "at the present moment", ru: ["в настоящий момент"], exEn: "At the present moment she lives in London.", exRu: "В настоящий момент она живёт в Лондоне.", cefr: "A1" },
    ],
  },
  {
    word: "capital",
    phrases: [
      { theme: "daily_life_a1", en: "the capital of the country", ru: ["столица страны"], exEn: "Paris is the capital of France.", exRu: "Париж — столица Франции.", cefr: "A1" },
      { theme: "daily_life_a1", en: "a capital letter", ru: ["заглавная буква"], exEn: "Write your name with a capital letter.", exRu: "Напиши своё имя с заглавной буквы.", cefr: "A1" },
    ],
  },
  {
    word: "class",
    phrases: [
      { theme: "work_money_a1", en: "the whole class", ru: ["весь класс"], exEn: "The whole class went to the museum.", exRu: "Весь класс пошёл в музей.", cefr: "A1" },
      { theme: "work_money_a1", en: "first class seats", ru: ["места первого класса"], exEn: "First class seats are more expensive.", exRu: "Места первого класса дороже.", cefr: "A1" },
    ],
  },
  {
    word: "change",
    phrases: [
      { theme: "travel_movement_a1", en: "change the plan", ru: ["изменить план"], exEn: "We changed the plan at the last minute.", exRu: "Мы изменили план в последнюю минуту.", cefr: "A1" },
      { theme: "travel_movement_a1", en: "keep the change", ru: ["оставить сдачу"], exEn: "Keep the change, thank you.", exRu: "Оставьте сдачу, спасибо.", cefr: "A1" },
    ],
  },
  {
    word: "cook",
    phrases: [
      { theme: "food_drink_a1", en: "cook dinner", ru: ["готовить ужин"], exEn: "I cook dinner for the family every day.", exRu: "Я готовлю ужин для семьи каждый день.", cefr: "A1" },
      { theme: "food_drink_a1", en: "work as a cook", ru: ["работать поваром"], exEn: "His mother works as a cook in a hotel.", exRu: "Его мама работает поваром в отеле.", cefr: "A1" },
    ],
  },
  {
    word: "park",
    phrases: [
      { theme: "daily_life_a1", en: "walk in the park", ru: ["гулять в парке"], exEn: "We walk in the park every Sunday.", exRu: "Мы гуляем в парке каждое воскресенье.", cefr: "A1" },
      { theme: "daily_life_a1", en: "park the car", ru: ["припарковать машину"], exEn: "You can park the car behind the house.", exRu: "Ты можешь припарковать машину за домом.", cefr: "A1" },
    ],
  },
  {
    word: "right",
    phrases: [
      { theme: "appearance_qualities_a1", en: "the right answer", ru: ["верный ответ"], exEn: "Only one pupil knew the right answer.", exRu: "Только один ученик знал верный ответ.", cefr: "A1" },
      { theme: "appearance_qualities_a1", en: "turn right", ru: ["повернуть направо"], exEn: "Turn right at the traffic lights.", exRu: "Поверни направо на светофоре.", cefr: "A1" },
    ],
  },
  {
    word: "kind",
    phrases: [
      { theme: "emotions_character_a1", en: "a kind person", ru: ["добрый человек"], exEn: "Our neighbour is a very kind person.", exRu: "Наш сосед — очень добрый человек.", cefr: "A1" },
      { theme: "emotions_character_a1", en: "a kind of fish", ru: ["вид рыбы"], exEn: "This is a kind of fish that lives in rivers.", exRu: "Это вид рыбы, которая живёт в реках.", cefr: "A1" },
    ],
  },
  {
    word: "interest",
    phrases: [
      { theme: "emotions_character_a1", en: "an interest in music", ru: ["интерес к музыке"], exEn: "She has a great interest in music.", exRu: "У неё большой интерес к музыке.", cefr: "A1" },
      { theme: "emotions_character_a1", en: "pay interest", ru: ["платить проценты"], exEn: "You pay interest on the money you borrow.", exRu: "Ты платишь проценты за деньги, которые берёшь в долг.", cefr: "A1" },
    ],
  },
  {
    word: "fine",
    phrases: [
      { theme: "appearance_qualities_a1", en: "I feel fine", ru: ["я чувствую себя хорошо"], exEn: "I feel fine today, thank you.", exRu: "Я чувствую себя хорошо сегодня, спасибо.", cefr: "A1" },
      { theme: "appearance_qualities_a1", en: "pay a fine", ru: ["заплатить штраф"], exEn: "He had to pay a fine for parking here.", exRu: "Ему пришлось заплатить штраф за парковку здесь.", cefr: "A1" },
    ],
  },
  {
    word: "sound",
    phrases: [
      { theme: "appearance_qualities_a1", en: "a strange sound", ru: ["странный звук"], exEn: "I heard a strange sound in the garden.", exRu: "Я услышал странный звук в саду.", cefr: "A1" },
      { theme: "appearance_qualities_a1", en: "that sounds good", ru: ["это звучит хорошо"], exEn: "A picnic on Sunday? That sounds good.", exRu: "Пикник в воскресенье? Это звучит хорошо.", cefr: "A1" },
    ],
  },
  {
    word: "just",
    phrases: [
      { theme: "appearance_qualities_a1", en: "I have just finished", ru: ["я только что закончил"], exEn: "I have just finished my homework.", exRu: "Я только что закончил домашнее задание.", cefr: "A1" },
      { theme: "appearance_qualities_a1", en: "just one more", ru: ["только ещё один"], exEn: "Just one more question, please.", exRu: "Только ещё один вопрос, пожалуйста.", cefr: "A1" },
    ],
  },
];

// ── A2 ───────────────────────────────────────────────────────────────────────
const A2: PolysemousWord[] = [
  {
    word: "jam",
    phrases: [
      { theme: "food_drink_a2", en: "strawberry jam", ru: ["клубничное варенье"], exEn: "I like strawberry jam on my bread.", exRu: "Я люблю клубничное варенье на хлебе.", cefr: "A2" },
      { theme: "food_drink_a2", en: "a traffic jam", ru: ["дорожная пробка"], exEn: "We were late because of a traffic jam.", exRu: "Мы опоздали из-за дорожной пробки.", cefr: "A2" },
    ],
  },
  {
    word: "season",
    phrases: [
      { theme: "food_drink_a2", en: "my favourite season", ru: ["мой любимый сезон"], exEn: "Summer is my favourite season.", exRu: "Лето — мой любимый сезон.", cefr: "A2" },
      { theme: "food_drink_a2", en: "season the soup", ru: ["приправить суп"], exEn: "Season the soup with salt and pepper.", exRu: "Приправь суп солью и перцем.", cefr: "A2" },
    ],
  },
  {
    word: "tie",
    phrases: [
      { theme: "appearance_qualities_a2", en: "a blue tie", ru: ["синий галстук"], exEn: "My father wears a blue tie to work.", exRu: "Мой папа носит на работу синий галстук.", cefr: "A2" },
      { theme: "appearance_qualities_a2", en: "end in a tie", ru: ["закончиться ничьёй"], exEn: "The game ended in a tie.", exRu: "Игра закончилась ничьёй.", cefr: "A2" },
    ],
  },
  {
    word: "ring",
    phrases: [
      { theme: "appearance_qualities_a2", en: "a gold ring", ru: ["золотое кольцо"], exEn: "She wears a gold ring.", exRu: "Она носит золотое кольцо.", cefr: "A2" },
      { theme: "appearance_qualities_a2", en: "ring the bell", ru: ["позвонить в звонок"], exEn: "Ring the bell and wait at the gate.", exRu: "Позвони в звонок и подожди у ворот.", cefr: "A2" },
    ],
  },
  {
    word: "suit",
    phrases: [
      { theme: "appearance_qualities_a2", en: "a black suit", ru: ["чёрный костюм"], exEn: "He wore a black suit to the concert.", exRu: "Он надел на концерт чёрный костюм.", cefr: "A2" },
      { theme: "appearance_qualities_a2", en: "this hat suits you", ru: ["эта шляпа тебе подходит"], exEn: "This hat suits you very well.", exRu: "Эта шляпа тебе очень подходит.", cefr: "A2" },
    ],
  },
  {
    word: "fair",
    phrases: [
      { theme: "appearance_qualities_a2", en: "it is not fair", ru: ["это несправедливо"], exEn: "It is not fair to take her toys.", exRu: "Это несправедливо — забирать её игрушки.", cefr: "A2" },
      { theme: "appearance_qualities_a2", en: "a book fair", ru: ["книжная ярмарка"], exEn: "We bought two novels at the book fair.", exRu: "Мы купили два романа на книжной ярмарке.", cefr: "A2" },
    ],
  },
  {
    word: "cover",
    phrases: [
      { theme: "appearance_qualities_a2", en: "the cover of the book", ru: ["обложка книги"], exEn: "The cover of the book is dark blue.", exRu: "Обложка книги тёмно-синяя.", cefr: "A2" },
      { theme: "appearance_qualities_a2", en: "cover the pan", ru: ["накрыть кастрюлю"], exEn: "Cover the pan and wait ten minutes.", exRu: "Накрой кастрюлю и подожди десять минут.", cefr: "A2" },
    ],
  },
  {
    word: "lock",
    phrases: [
      { theme: "home_life_a2", en: "lock the door", ru: ["запереть дверь"], exEn: "Lock the door when you leave.", exRu: "Запри дверь, когда уходишь.", cefr: "A2" },
      { theme: "home_life_a2", en: "the lock is broken", ru: ["замок сломан"], exEn: "The lock is broken, we cannot get in.", exRu: "Замок сломан, мы не можем войти.", cefr: "A2" },
    ],
  },
  {
    word: "flat",
    phrases: [
      { theme: "home_life_a2", en: "a two-room flat", ru: ["двухкомнатная квартира"], exEn: "They rent a two-room flat near the park.", exRu: "Они снимают двухкомнатную квартиру рядом с парком.", cefr: "A2" },
      { theme: "home_life_a2", en: "a flat road", ru: ["плоская дорога"], exEn: "The road here is flat and straight.", exRu: "Дорога здесь плоская и прямая.", cefr: "A2" },
    ],
  },
  {
    word: "fan",
    phrases: [
      { theme: "leisure_culture_a2", en: "a football fan", ru: ["футбольный болельщик"], exEn: "My uncle is a football fan.", exRu: "Мой дядя — футбольный болельщик.", cefr: "A2" },
      { theme: "leisure_culture_a2", en: "turn on the fan", ru: ["включить вентилятор"], exEn: "Turn on the fan, it is hot in here.", exRu: "Включи вентилятор, здесь жарко.", cefr: "A2" },
    ],
  },
  {
    word: "race",
    phrases: [
      { theme: "leisure_culture_a2", en: "win the race", ru: ["победить в гонке"], exEn: "She won the race by two seconds.", exRu: "Она победила в гонке на две секунды.", cefr: "A2" },
      { theme: "leisure_culture_a2", en: "people of every race", ru: ["люди всех рас"], exEn: "People of every race live in this city.", exRu: "В этом городе живут люди всех рас.", cefr: "A2" },
    ],
  },
  {
    word: "coach",
    phrases: [
      { theme: "leisure_culture_a2", en: "our football coach", ru: ["наш футбольный тренер"], exEn: "Our football coach teaches us every day.", exRu: "Наш футбольный тренер учит нас каждый день.", cefr: "A2" },
      { theme: "leisure_culture_a2", en: "a coach trip", ru: ["поездка на автобусе"], exEn: "The school organized a coach trip to the sea.", exRu: "Школа организовала поездку на автобусе к морю.", cefr: "A2" },
    ],
  },
  {
    word: "character",
    phrases: [
      { theme: "emotions_character_a2", en: "a strong character", ru: ["сильный характер"], exEn: "She has a strong character.", exRu: "У неё сильный характер.", cefr: "A2" },
      { theme: "emotions_character_a2", en: "the main character", ru: ["главный персонаж"], exEn: "The main character of the book is a young doctor.", exRu: "Главный персонаж книги — молодой врач.", cefr: "A2" },
    ],
  },
  {
    word: "stage",
    phrases: [
      { theme: "daily_life_a2", en: "the first stage", ru: ["первый этап"], exEn: "We finished the first stage of the work.", exRu: "Мы закончили первый этап работы.", cefr: "A2" },
      { theme: "daily_life_a2", en: "on the stage", ru: ["на сцене"], exEn: "The singer came out on the stage.", exRu: "Певец вышел на сцену.", cefr: "A2" },
    ],
  },
  {
    word: "square",
    phrases: [
      { theme: "daily_life_a2", en: "the town square", ru: ["городская площадь"], exEn: "There is a market on the town square.", exRu: "На городской площади есть рынок.", cefr: "A2" },
      { theme: "daily_life_a2", en: "a square box", ru: ["квадратная коробка"], exEn: "He put the gift in a square box.", exRu: "Он положил подарок в квадратную коробку.", cefr: "A2" },
    ],
  },
  {
    word: "fall",
    phrases: [
      { theme: "daily_life_a2", en: "fall on the ice", ru: ["упасть на льду"], exEn: "Be careful, you can fall on the ice.", exRu: "Осторожно, ты можешь упасть на льду.", cefr: "A2" },
      { theme: "daily_life_a2", en: "in the fall", ru: ["осенью"], exEn: "In the fall the leaves turn yellow.", exRu: "Осенью листья становятся жёлтыми.", cefr: "A2" },
    ],
  },
  {
    word: "second",
    phrases: [
      { theme: "daily_life_a2", en: "the second time", ru: ["второй раз"], exEn: "This is the second time I have read the book.", exRu: "Я читаю эту книгу второй раз.", cefr: "A2" },
      { theme: "daily_life_a2", en: "just a second", ru: ["одну секунду"], exEn: "Just a second, I am looking for my keys.", exRu: "Одну секунду, я ищу свои ключи.", cefr: "A2" },
    ],
  },
  {
    word: "run",
    phrases: [
      { theme: "leisure_culture_a2", en: "run fast", ru: ["быстро бегать"], exEn: "He can run faster than me.", exRu: "Он может бегать быстрее меня.", cefr: "A2" },
      { theme: "leisure_culture_a2", en: "run a shop", ru: ["управлять магазином"], exEn: "Her parents run a small shop.", exRu: "Её родители управляют небольшим магазином.", cefr: "A2" },
    ],
  },
  {
    word: "term",
    phrases: [
      { theme: "appearance_qualities_a2", en: "the summer term", ru: ["летний семестр"], exEn: "The summer term ends in June.", exRu: "Летний семестр заканчивается в июне.", cefr: "A2" },
      { theme: "appearance_qualities_a2", en: "a medical term", ru: ["медицинский термин"], exEn: "He explained the medical term simply.", exRu: "Он просто объяснил медицинский термин.", cefr: "A2" },
    ],
  },
];

// ── B1 ───────────────────────────────────────────────────────────────────────
const B1: PolysemousWord[] = [
  {
    word: "chest",
    phrases: [
      { theme: "health_body_b1", en: "chest pain", ru: ["боль в груди"], exEn: "He felt chest pain and sat down.", exRu: "Он почувствовал боль в груди и сел.", cefr: "B1" },
      { theme: "health_body_b1", en: "a treasure chest", ru: ["сундук с сокровищами"], exEn: "The pirates buried a treasure chest on the island.", exRu: "Пираты закопали сундук с сокровищами на острове.", cefr: "B1" },
    ],
  },
  {
    word: "court",
    phrases: [
      { theme: "leisure_culture_b1", en: "a tennis court", ru: ["теннисная площадка"], exEn: "The tennis court is behind the school.", exRu: "Теннисная площадка за школой.", cefr: "B1" },
      { theme: "leisure_culture_b1", en: "go to court", ru: ["пойти в суд"], exEn: "They went to court to solve the argument.", exRu: "Они пошли в суд, чтобы решить спор.", cefr: "B1" },
    ],
  },
  {
    word: "deal",
    phrases: [
      { theme: "work_money_b1", en: "make a deal", ru: ["заключить сделку"], exEn: "The two companies made a deal in May.", exRu: "Две компании заключили сделку в мае.", cefr: "B1" },
      { theme: "work_money_b1", en: "deal with a problem", ru: ["иметь дело с проблемой"], exEn: "I will deal with this problem tomorrow.", exRu: "Я разберусь с этой проблемой завтра.", cefr: "B1" },
    ],
  },
  {
    word: "shift",
    phrases: [
      { theme: "work_money_b1", en: "the night shift", ru: ["ночная смена"], exEn: "My father works the night shift at the factory.", exRu: "Мой отец работает в ночную смену на заводе.", cefr: "B1" },
      { theme: "work_money_b1", en: "a shift in prices", ru: ["сдвиг в ценах"], exEn: "There was a sudden shift in prices.", exRu: "Произошёл внезапный сдвиг в ценах.", cefr: "B1" },
    ],
  },
  {
    word: "value",
    phrases: [
      { theme: "appearance_qualities_b1", en: "the value of the coin", ru: ["ценность монеты"], exEn: "The value of this old coin is high.", exRu: "Ценность этой старой монеты высока.", cefr: "B1" },
      { theme: "appearance_qualities_b1", en: "value your advice", ru: ["ценить твой совет"], exEn: "I value your advice very much.", exRu: "Я очень ценю твой совет.", cefr: "B1" },
    ],
  },
  {
    word: "block",
    phrases: [
      { theme: "daily_life_b1", en: "a block of ice", ru: ["глыба льда"], exEn: "A block of ice was floating in the river.", exRu: "Глыба льда плыла по реке.", cefr: "B1" },
      { theme: "daily_life_b1", en: "block the road", ru: ["заблокировать дорогу"], exEn: "Police blocked the road after the accident.", exRu: "Полиция заблокировала дорогу после аварии.", cefr: "B1" },
    ],
  },
  {
    word: "treat",
    phrases: [
      { theme: "health_body_b1", en: "treat a patient", ru: ["лечить пациента"], exEn: "The doctor treats ten patients a day.", exRu: "Врач лечит десять пациентов в день.", cefr: "B1" },
      { theme: "health_body_b1", en: "treat sb well", ru: ["хорошо обращаться с кем-л."], exEn: "He treats his little brother very well.", exRu: "Он очень хорошо обращается со своим младшим братом.", cefr: "B1" },
    ],
  },
  {
    word: "rise",
    phrases: [
      { theme: "work_money_b1", en: "a rise in prices", ru: ["рост цен"], exEn: "There was a sharp rise in prices last year.", exRu: "В прошлом году был резкий рост цен.", cefr: "B1" },
      { theme: "work_money_b1", en: "the sun rises", ru: ["солнце встаёт"], exEn: "The sun rises in the east.", exRu: "Солнце встаёт на востоке.", cefr: "B1" },
    ],
  },
  {
    word: "set",
    phrases: [
      { theme: "appearance_qualities_b1", en: "a set of brushes", ru: ["набор кистей"], exEn: "He bought a set of new brushes.", exRu: "Он купил набор новых кистей.", cefr: "B1" },
      { theme: "appearance_qualities_b1", en: "set the table", ru: ["накрыть на стол"], exEn: "Please set the table before dinner.", exRu: "Пожалуйста, накрой на стол до ужина.", cefr: "B1" },
    ],
  },
  {
    word: "key",
    phrases: [
      { theme: "home_life_b1", en: "the key to the door", ru: ["ключ от двери"], exEn: "I cannot find the key to the door.", exRu: "Я не могу найти ключ от двери.", cefr: "B1" },
      { theme: "home_life_b1", en: "the key to success", ru: ["ключ к успеху"], exEn: "Hard work is the key to success.", exRu: "Тяжёлый труд — ключ к успеху.", cefr: "B1" },
    ],
  },
  {
    word: "property",
    phrases: [
      { theme: "home_life_b1", en: "private property", ru: ["частная собственность"], exEn: "This land is private property.", exRu: "Эта земля — частная собственность.", cefr: "B1" },
      { theme: "home_life_b1", en: "a useful property of water", ru: ["полезное свойство воды"], exEn: "Ice floating is a useful property of water.", exRu: "То, что лёд плавает, — полезное свойство воды.", cefr: "B1" },
    ],
  },
  {
    word: "pot",
    phrases: [
      { theme: "home_life_b1", en: "a pot of soup", ru: ["кастрюля супа"], exEn: "There is a pot of soup on the cooker.", exRu: "На плите стоит кастрюля супа.", cefr: "B1" },
      { theme: "home_life_b1", en: "a flower pot", ru: ["цветочный горшок"], exEn: "She put the plant in a new flower pot.", exRu: "Она посадила растение в новый цветочный горшок.", cefr: "B1" },
    ],
  },
];

// ── B2 ───────────────────────────────────────────────────────────────────────
const B2: PolysemousWord[] = [
  {
    word: "concrete",
    phrases: [
      { theme: "appearance_qualities_b2", en: "a concrete wall", ru: ["бетонная стена"], exEn: "A concrete wall runs along the road.", exRu: "Бетонная стена идёт вдоль дороги.", cefr: "B2" },
      { theme: "appearance_qualities_b2", en: "a concrete example", ru: ["конкретный пример"], exEn: "Give me a concrete example, please.", exRu: "Дай мне конкретный пример, пожалуйста.", cefr: "B2" },
    ],
  },
  {
    word: "firm",
    phrases: [
      { theme: "appearance_qualities_b2", en: "a firm handshake", ru: ["твёрдое рукопожатие"], exEn: "He greeted me with a firm handshake.", exRu: "Он приветствовал меня твёрдым рукопожатием.", cefr: "B2" },
      { theme: "appearance_qualities_b2", en: "a law firm", ru: ["юридическая фирма"], exEn: "She works for a small law firm.", exRu: "Она работает в небольшой юридической фирме.", cefr: "B2" },
    ],
  },
  {
    word: "pitch",
    phrases: [
      { theme: "leisure_culture_b2", en: "a football pitch", ru: ["футбольное поле"], exEn: "The football pitch was wet after the rain.", exRu: "Футбольное поле было мокрым после дождя.", cefr: "B2" },
      { theme: "leisure_culture_b2", en: "a sales pitch", ru: ["рекламная речь"], exEn: "His sales pitch lasted ten minutes.", exRu: "Его рекламная речь длилась десять минут.", cefr: "B2" },
    ],
  },
  {
    word: "counter",
    phrases: [
      { theme: "appearance_qualities_b2", en: "the shop counter", ru: ["прилавок магазина"], exEn: "He put the money on the shop counter.", exRu: "Он положил деньги на прилавок магазина.", cefr: "B2" },
      { theme: "appearance_qualities_b2", en: "counter an argument", ru: ["возразить на аргумент"], exEn: "She countered his argument at once.", exRu: "Она сразу возразила на его аргумент.", cefr: "B2" },
    ],
  },
  {
    word: "rank",
    phrases: [
      { theme: "appearance_qualities_b2", en: "the rank of captain", ru: ["звание капитана"], exEn: "He reached the rank of captain.", exRu: "Он достиг звания капитана.", cefr: "B2" },
      { theme: "appearance_qualities_b2", en: "rank the answers", ru: ["расположить ответы по порядку"], exEn: "Rank the answers from best to worst.", exRu: "Расположи ответы по порядку от лучшего к худшему.", cefr: "B2" },
    ],
  },
  {
    word: "scale",
    phrases: [
      { theme: "appearance_qualities_b2", en: "a scale from one to ten", ru: ["шкала от одного до десяти"], exEn: "Rate the film on a scale from one to ten.", exRu: "Оцени фильм по шкале от одного до десяти.", cefr: "B2" },
      { theme: "appearance_qualities_b2", en: "on a large scale", ru: ["в большом масштабе"], exEn: "They grow wheat on a large scale.", exRu: "Они выращивают пшеницу в большом масштабе.", cefr: "B2" },
    ],
  },
  {
    word: "plain",
    phrases: [
      { theme: "appearance_qualities_b2", en: "a plain white shirt", ru: ["простая белая рубашка"], exEn: "He wore a plain white shirt.", exRu: "Он надел простую белую рубашку.", cefr: "B2" },
      { theme: "appearance_qualities_b2", en: "it is plain to see", ru: ["это очевидно"], exEn: "It is plain to see that he is tired.", exRu: "Очевидно, что он устал.", cefr: "B2" },
    ],
  },
  {
    word: "minor",
    phrases: [
      { theme: "appearance_qualities_b2", en: "a minor problem", ru: ["незначительная проблема"], exEn: "It was only a minor problem.", exRu: "Это была только незначительная проблема.", cefr: "B2" },
      { theme: "appearance_qualities_b2", en: "sold to minors", ru: ["продано несовершеннолетним"], exEn: "These drinks cannot be sold to minors.", exRu: "Эти напитки нельзя продавать несовершеннолетним.", cefr: "B2" },
    ],
  },
  {
    word: "stable",
    phrases: [
      { theme: "appearance_qualities_b2", en: "a stable job", ru: ["стабильная работа"], exEn: "He is looking for a stable job.", exRu: "Он ищет стабильную работу.", cefr: "B2" },
      { theme: "appearance_qualities_b2", en: "clean the stable", ru: ["чистить конюшню"], exEn: "She cleans the stable every morning.", exRu: "Она чистит конюшню каждое утро.", cefr: "B2" },
    ],
  },
  {
    word: "tough",
    phrases: [
      { theme: "appearance_qualities_b2", en: "a tough decision", ru: ["трудное решение"], exEn: "It was a tough decision for the family.", exRu: "Это было трудное решение для семьи.", cefr: "B2" },
      { theme: "appearance_qualities_b2", en: "tough meat", ru: ["жёсткое мясо"], exEn: "The meat was tough and dry.", exRu: "Мясо было жёстким и сухим.", cefr: "B2" },
    ],
  },
  {
    word: "loose",
    phrases: [
      { theme: "appearance_qualities_b2", en: "a loose tooth", ru: ["шатающийся зуб"], exEn: "The boy has a loose tooth.", exRu: "У мальчика шатающийся зуб.", cefr: "B2" },
      { theme: "appearance_qualities_b2", en: "loose trousers", ru: ["свободные брюки"], exEn: "He prefers loose trousers in summer.", exRu: "Летом он предпочитает свободные брюки.", cefr: "B2" },
    ],
  },
  {
    word: "comic",
    phrases: [
      { theme: "leisure_culture_b2", en: "read a comic", ru: ["читать комикс"], exEn: "He reads a comic every evening.", exRu: "Он читает комикс каждый вечер.", cefr: "B2" },
      { theme: "leisure_culture_b2", en: "a comic effect", ru: ["комический эффект"], exEn: "The hat created a comic effect.", exRu: "Шляпа создала комический эффект.", cefr: "B2" },
    ],
  },
  {
    word: "arms",
    phrases: [
      { theme: "health_body_b2", en: "in her arms", ru: ["в её руках"], exEn: "She held the baby in her arms.", exRu: "Она держала малыша в своих руках.", cefr: "B2" },
      { theme: "health_body_b2", en: "give up arms", ru: ["сдать оружие"], exEn: "The soldiers agreed to give up arms.", exRu: "Солдаты согласились сдать оружие.", cefr: "B2" },
    ],
  },
  {
    word: "organ",
    phrases: [
      { theme: "health_body_b2", en: "an internal organ", ru: ["внутренний орган"], exEn: "The heart is an internal organ.", exRu: "Сердце — внутренний орган.", cefr: "B2" },
      { theme: "health_body_b2", en: "play the organ", ru: ["играть на органе"], exEn: "She plays the organ in church.", exRu: "Она играет на органе в церкви.", cefr: "B2" },
    ],
  },
  {
    word: "model",
    phrases: [
      { theme: "appearance_qualities_b2", en: "a fashion model", ru: ["модель на подиуме"], exEn: "The fashion model walked slowly.", exRu: "Модель на подиуме шла медленно.", cefr: "B2" },
      { theme: "appearance_qualities_b2", en: "the latest model", ru: ["последняя модель"], exEn: "This is the latest model of the phone.", exRu: "Это последняя модель телефона.", cefr: "B2" },
    ],
  },
];

// ── C1 ───────────────────────────────────────────────────────────────────────
const C1: PolysemousWord[] = [
  {
    word: "dynamic",
    phrases: [
      { theme: "appearance_qualities_c1", en: "a dynamic speaker", ru: ["энергичный оратор"], exEn: "She is a dynamic speaker and holds attention.", exRu: "Она энергичный оратор и держит внимание.", cefr: "C1" },
      { theme: "appearance_qualities_c1", en: "the family dynamic", ru: ["расстановка сил в семье"], exEn: "His arrival changed the family dynamic.", exRu: "Его приезд изменил расстановку сил в семье.", cefr: "C1" },
    ],
  },
  {
    word: "craft",
    phrases: [
      { theme: "leisure_culture_c1", en: "a traditional craft", ru: ["традиционное ремесло"], exEn: "Pottery is a traditional craft here.", exRu: "Гончарное дело здесь традиционное ремесло.", cefr: "C1" },
      { theme: "leisure_culture_c1", en: "a small craft", ru: ["небольшое судно"], exEn: "A small craft crossed the bay.", exRu: "Небольшое судно пересекло бухту.", cefr: "C1" },
    ],
  },
  {
    word: "novel",
    phrases: [
      { theme: "leisure_culture_c1", en: "read a novel", ru: ["читать роман"], exEn: "She is reading a long novel.", exRu: "Она читает длинный роман.", cefr: "C1" },
      { theme: "leisure_culture_c1", en: "a novel idea", ru: ["новая идея"], exEn: "He suggested a novel idea for the project.", exRu: "Он предложил новую идею для проекта.", cefr: "C1" },
    ],
  },
  {
    word: "charm",
    phrases: [
      { theme: "emotions_character_c1", en: "personal charm", ru: ["личное очарование"], exEn: "His personal charm won everyone over.", exRu: "Его личное очарование покорило всех.", cefr: "C1" },
      { theme: "emotions_character_c1", en: "a lucky charm", ru: ["талисман на удачу"], exEn: "She keeps a lucky charm in her bag.", exRu: "Она держит талисман на удачу в сумке.", cefr: "C1" },
    ],
  },
  {
    word: "gravity",
    phrases: [
      { theme: "appearance_qualities_c1", en: "the force of gravity", ru: ["сила гравитации"], exEn: "The force of gravity holds us on the ground.", exRu: "Сила гравитации держит нас на земле.", cefr: "C1" },
      { theme: "appearance_qualities_c1", en: "the gravity of the situation", ru: ["серьёзность ситуации"], exEn: "Nobody understood the gravity of the situation.", exRu: "Никто не понимал серьёзности ситуации.", cefr: "C1" },
    ],
  },
  {
    word: "vein",
    phrases: [
      { theme: "health_body_c1", en: "a vein in his arm", ru: ["вена на его руке"], exEn: "The nurse found a vein in his arm.", exRu: "Медсестра нашла вену на его руке.", cefr: "C1" },
      { theme: "health_body_c1", en: "in the same vein", ru: ["в том же духе"], exEn: "He continued in the same vein for an hour.", exRu: "Он продолжал в том же духе целый час.", cefr: "C1" },
    ],
  },
];

export const POLYSEMOUS: PolysemousWord[] = [...A1, ...A2, ...B1, ...B2, ...C1];

/** Слова, у которых одиночной карточки быть не должно. */
export const AMBIGUOUS_WORDS: ReadonlySet<string> = new Set(
  POLYSEMOUS.map((p) => p.word.trim().toLowerCase()),
);

export function isAmbiguous(en: string): boolean {
  return AMBIGUOUS_WORDS.has(en.trim().toLowerCase());
}

const BY_WORD = new Map(POLYSEMOUS.map((p) => [p.word.trim().toLowerCase(), p]));

/**
 * Убирает одиночные карточки многозначных слов и добавляет вместо них карточки
 * со словосочетаниями.
 *
 * Зеркалирование. Слово удаляется из ВСЕХ колод (ключ — english), а фразы
 * добавляются только туда, где указано в phrases. Каталог же держит одно слово
 * на нескольких уровнях: craft есть в B2 и C1, value в B1 и B2, light в A1 и A2.
 * Без зеркалирования ученик одного уровня получал бы замену, а другого — терял
 * слово вовсе. Поэтому если у слова нет ни одной фразы уровня той колоды, где
 * оно лежало, его смыслы клонируются в эту же колоду с её уровнем: текст тот же,
 * меняются theme и cefr. Дублирование english между колодами для каталога
 * нормально — downstairs так лежит и в A1, и в A2.
 *
 * Тихо потерянная карточка здесь хуже шумной ошибки: если тема названа с
 * опечаткой или фраза уже есть в каталоге, сид просто ничего не добавит, и
 * смысл снова не будет учиться. Поэтому такие случаи возвращаются списком
 * проблем, а вызывающий решает, ругаться или падать (сид пишет предупреждение,
 * pnpm validate:examples — падает).
 */
export function applyPolysemous(decks: SeedDeck[]): {
  decks: SeedDeck[];
  problems: string[];
  removed: number;
  added: number;
  mirrored: number;
} {
  const problems: string[] = [];
  let removed = 0;
  let added = 0;
  let mirrored = 0;

  const byTheme = new Map<string, SensePhrase[]>();
  for (const entry of POLYSEMOUS) {
    if (entry.phrases.length < 2) {
      problems.push(`"${entry.word}": указан только один смысл — слово потерялось бы совсем`);
      continue;
    }
    for (const phrase of entry.phrases) {
      const list = byTheme.get(phrase.theme) ?? [];
      list.push(phrase);
      byTheme.set(phrase.theme, list);
    }
  }

  const known = new Set(decks.map((d) => d.theme));
  for (const theme of byTheme.keys()) {
    if (!known.has(theme)) {
      problems.push(`колоды "${theme}" нет в датасете — карточки этой темы не попадут в базу`);
    }
  }

  const out = decks.map((deck) => {
    const kept = deck.words.filter((w) => !isAmbiguous(w.en));
    const dropped = deck.words.filter((w) => isAmbiguous(w.en));
    removed += dropped.length;

    const extra: SensePhrase[] = [...(byTheme.get(deck.theme) ?? [])];

    // Уровень колоды: у тематических колод cefrLevel есть всегда, но подстрахуемся
    // уровнем самой карточки — иначе зеркало ушло бы с пустым cefr.
    for (const w of dropped) {
      const entry = BY_WORD.get(w.en.trim().toLowerCase());
      if (!entry || entry.phrases.length < 2) continue;
      const level = deck.cefrLevel ?? w.cefr;
      if (!level) continue;
      if (entry.phrases.some((p) => p.cefr === level)) continue; // уровень уже закрыт
      for (const p of entry.phrases) {
        extra.push({ ...p, theme: deck.theme, cefr: level });
        mirrored++;
      }
    }

    if (extra.length === 0) {
      return kept.length === deck.words.length ? deck : { ...deck, words: kept };
    }

    const have = new Set(kept.map((w) => w.en.trim().toLowerCase()));
    const words = [...kept];
    for (const p of extra) {
      const key = p.en.trim().toLowerCase();
      if (have.has(key)) {
        problems.push(`"${p.en}" уже есть в колоде "${deck.theme}" — сид отбросит дубликат`);
        continue;
      }
      if (deck.cefrLevel && p.cefr !== deck.cefrLevel) {
        problems.push(`"${p.en}": уровень ${p.cefr} не совпадает с уровнем колоды "${deck.theme}" (${deck.cefrLevel})`);
        continue;
      }
      have.add(key);
      words.push({ en: p.en, pos: "phrase", ru: p.ru, ipa: "", exEn: p.exEn, exRu: p.exRu, cefr: p.cefr });
      added++;
    }
    return { ...deck, words };
  });

  return { decks: out, problems, removed, added, mirrored };
}
