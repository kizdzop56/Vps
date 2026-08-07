// Второе значение многозначного слова — отдельной карточкой-фразой.
//
// Проблема. У chest два равно ходовых значения: грудь и сундук. В каталоге
// карточка одна, поэтому второе значение не учится вообще. Добавить вторую
// карточку с тем же english нельзя по двум причинам:
//
//   1. сид дедуплицирует слова внутри колоды по lower(english) — вторая строка
//      молча не попадёт в базу (см. seed-flashcards.ts);
//   2. даже если бы попала, упражнение choiceRu показало бы «chest» и два
//      верных варианта («грудь» и «сундук»): buildExercise прячет от
//      дистракторов только переводы ТОЙ ЖЕ строки (word.translationsRu),
//      про однофамильца в соседней строке он не знает. Получилась бы ловушка.
//
// Решение. Второе значение заводим коллокацией: treasure chest, a glass of
// water, a traffic jam. У целой фразы значение одно, поэтому двусмысленность
// исчезает физически, а не по договорённости — это ровно тот вывод, который
// WORDS.md объявляет главным решением раздела. Схема БД не меняется, а
// дистракторы уже умеют подбирать фразу против фразы (sameShape).
//
// Правила заполнения:
//   • фраза живая и короткая, по ней сразу виден нужный смысл;
//   • ru — перевод фразы целиком, а не отдельного слова;
//   • theme — существующая колода того же уровня, что и cefr карточки;
//   • pos: "phrase" — по нему валидатор считает словосочетания в колоде;
//   • sense — для человека: какое слово и какой его смысл раскрывает карточка;
//   • ipa у фраз не заполняем: в каталоге у словосочетаний она пустая.
//
// Проверка (тема существует, фраза не дублирует каталог): pnpm validate:examples

import type { SeedDeck } from "./flashcards-data";

export type SensePhrase = {
  /** Тема колоды, в которую добавляется карточка. */
  theme: string;
  en: string;
  ru: string[];
  pos: string;
  exEn: string;
  exRu: string;
  cefr: string;
  /** Пояснение для человека: чей это второй смысл. */
  sense: string;
};

export const SENSE_PHRASES: SensePhrase[] = [
  // ── еда и посуда ─────────────────────────────────────────────────────────
  { theme: "food_drink_a1", en: "a glass of water", ru: ["стакан воды"], pos: "phrase", exEn: "Could you bring me a glass of water?", exRu: "Не мог бы ты принести мне стакан воды?", cefr: "A1", sense: "glass — стакан, а не материал стекло" },
  { theme: "food_drink_a1", en: "dried dates", ru: ["сушёные финики"], pos: "phrase", exEn: "We bought dried dates at the market.", exRu: "Мы купили сушёные финики на рынке.", cefr: "A1", sense: "date — финик, а не дата" },
  { theme: "food_drink_a2", en: "season the soup", ru: ["приправить суп"], pos: "phrase", exEn: "Season the soup with salt and pepper.", exRu: "Приправь суп солью и перцем.", cefr: "A2", sense: "season — приправлять, а не сезон" },

  // ── дом и быт ────────────────────────────────────────────────────────────
  { theme: "home_life_a1", en: "a box of matches", ru: ["коробка спичек"], pos: "phrase", exEn: "There is a box of matches near the cooker.", exRu: "Рядом с плитой лежит коробка спичек.", cefr: "A1", sense: "match — спичка, а не соответствовать" },
  { theme: "home_life_a1", en: "put sth in order", ru: ["привести что-л. в порядок"], pos: "phrase", exEn: "Put your books in order before dinner.", exRu: "Приведи свои книги в порядок до ужина.", cefr: "A1", sense: "order — порядок, а не заказ" },
  { theme: "home_life_a1", en: "a metal spring", ru: ["металлическая пружина"], pos: "phrase", exEn: "A metal spring inside the chair is broken.", exRu: "Металлическая пружина внутри стула сломана.", cefr: "A1", sense: "spring — пружина, а не весна" },
  { theme: "home_life_a2", en: "lock the door", ru: ["запереть дверь"], pos: "phrase", exEn: "Lock the door when you leave.", exRu: "Запри дверь, когда уходишь.", cefr: "A2", sense: "lock — запирать, а не замок" },
  { theme: "home_life_a2", en: "ring the bell", ru: ["позвонить в звонок"], pos: "phrase", exEn: "Ring the bell and wait at the gate.", exRu: "Позвони в звонок и подожди у ворот.", cefr: "A2", sense: "ring — звонить, а не кольцо" },
  { theme: "home_life_a2", en: "a two-room flat", ru: ["двухкомнатная квартира"], pos: "phrase", exEn: "They rent a two-room flat near the park.", exRu: "Они снимают двухкомнатную квартиру рядом с парком.", cefr: "A2", sense: "flat — квартира, а не плоский" },
  { theme: "home_life_b1", en: "a treasure chest", ru: ["сундук с сокровищами"], pos: "phrase", exEn: "The pirates buried a treasure chest on the island.", exRu: "Пираты закопали сундук с сокровищами на острове.", cefr: "B1", sense: "chest — сундук, а не грудь" },

  // ── город, время, места ──────────────────────────────────────────────────
  { theme: "daily_life_a1", en: "the capital of the country", ru: ["столица страны"], pos: "phrase", exEn: "Paris is the capital of France.", exRu: "Париж — столица Франции.", cefr: "A1", sense: "capital — столица, а не капитал" },
  { theme: "daily_life_a1", en: "the river bank", ru: ["берег реки"], pos: "phrase", exEn: "We sat on the river bank and watched the boats.", exRu: "Мы сидели на берегу реки и смотрели на лодки.", cefr: "A1", sense: "bank — берег, а не банк" },
  { theme: "daily_life_a1", en: "at present", ru: ["в настоящее время"], pos: "phrase", exEn: "At present she lives in London.", exRu: "В настоящее время она живёт в Лондоне.", cefr: "A1", sense: "present — настоящее время, а не подарок" },
  { theme: "daily_life_a2", en: "just a second", ru: ["одну секунду"], pos: "phrase", exEn: "Just a second, I am looking for my keys.", exRu: "Одну секунду, я ищу свои ключи.", cefr: "A2", sense: "second — секунда, а не второй" },
  { theme: "daily_life_a2", en: "in the fall", ru: ["осенью"], pos: "phrase", exEn: "In the fall the leaves turn yellow.", exRu: "Осенью листья становятся жёлтыми.", cefr: "A2", sense: "fall — осень, а не падать" },

  // ── одежда и описания ───────────────────────────────────────────────────
  { theme: "appearance_qualities_a1", en: "look at your watch", ru: ["посмотреть на свои часы"], pos: "phrase", exEn: "Look at your watch, we are late.", exRu: "Посмотри на свои часы, мы опаздываем.", cefr: "A1", sense: "watch — часы, а не смотреть" },
  { theme: "appearance_qualities_a1", en: "a light bag", ru: ["лёгкая сумка"], pos: "phrase", exEn: "Take a light bag for the trip.", exRu: "Возьми в поездку лёгкую сумку.", cefr: "A1", sense: "light — лёгкий, а не свет" },
  { theme: "appearance_qualities_a2", en: "a black suit", ru: ["чёрный костюм"], pos: "phrase", exEn: "He wore a black suit to the concert.", exRu: "Он надел на концерт чёрный костюм.", cefr: "A2", sense: "suit — костюм, а не подходить" },

  // ── спорт, хобби, культура ──────────────────────────────────────────────
  { theme: "leisure_culture_a1", en: "a school play", ru: ["школьная пьеса"], pos: "phrase", exEn: "Our class is preparing a school play.", exRu: "Наш класс готовит школьную пьесу.", cefr: "A1", sense: "play — пьеса, а не играть" },
  { theme: "leisure_culture_a1", en: "win a point", ru: ["выиграть очко"], pos: "phrase", exEn: "Our team won a point in the last minute.", exRu: "Наша команда выиграла очко в последнюю минуту.", cefr: "A1", sense: "point — очко, а не точка" },
  { theme: "leisure_culture_a1", en: "a football match", ru: ["футбольный матч"], pos: "phrase", exEn: "The football match starts at six.", exRu: "Футбольный матч начинается в шесть.", cefr: "A1", sense: "match — матч, а не соответствовать" },
  { theme: "leisure_culture_a2", en: "end in a tie", ru: ["закончиться ничьёй"], pos: "phrase", exEn: "The game ended in a tie.", exRu: "Игра закончилась ничьёй.", cefr: "A2", sense: "tie — ничья, а не галстук" },
  { theme: "leisure_culture_a2", en: "a football fan", ru: ["футбольный болельщик"], pos: "phrase", exEn: "My uncle is a football fan.", exRu: "Мой дядя — футбольный болельщик.", cefr: "A2", sense: "fan — болельщик, а не вентилятор" },
  { theme: "leisure_culture_a2", en: "win the race", ru: ["победить в гонке"], pos: "phrase", exEn: "She won the race by two seconds.", exRu: "Она победила в гонке на две секунды.", cefr: "A2", sense: "race — гонка, а не раса" },
  { theme: "leisure_culture_a2", en: "a book fair", ru: ["книжная ярмарка"], pos: "phrase", exEn: "We bought two novels at the book fair.", exRu: "Мы купили два романа на книжной ярмарке.", cefr: "A2", sense: "fair — ярмарка, а не справедливый" },
  { theme: "leisure_culture_a2", en: "the main character", ru: ["главный персонаж"], pos: "phrase", exEn: "The main character of the book is a young doctor.", exRu: "Главный персонаж книги — молодой врач.", cefr: "A2", sense: "character — персонаж, а не характер" },
  { theme: "leisure_culture_b1", en: "a tennis court", ru: ["теннисная площадка"], pos: "phrase", exEn: "The tennis court is behind the school.", exRu: "Теннисная площадка за школой.", cefr: "B1", sense: "court — площадка, а не суд" },

  // ── дорога и движение ───────────────────────────────────────────────────
  { theme: "travel_movement_a1", en: "turn right", ru: ["повернуть направо"], pos: "phrase", exEn: "Turn right at the traffic lights.", exRu: "Поверни направо на светофоре.", cefr: "A1", sense: "right — направо, а не верно" },
  { theme: "travel_movement_a1", en: "park the car", ru: ["припарковать машину"], pos: "phrase", exEn: "You can park the car behind the house.", exRu: "Ты можешь припарковать машину за домом.", cefr: "A1", sense: "park — парковать, а не парк" },
  { theme: "travel_movement_a2", en: "a traffic jam", ru: ["дорожная пробка"], pos: "phrase", exEn: "We were late because of a traffic jam.", exRu: "Мы опоздали из-за дорожной пробки.", cefr: "A2", sense: "jam — пробка, а не варенье" },
  { theme: "travel_movement_a2", en: "a coach trip", ru: ["поездка на автобусе"], pos: "phrase", exEn: "The school organized a coach trip to the sea.", exRu: "Школа организовала поездку на автобусе к морю.", cefr: "A2", sense: "coach — автобус, а не тренер" },

  // ── школа, работа, деньги ───────────────────────────────────────────────
  { theme: "work_money_a1", en: "work as a cook", ru: ["работать поваром"], pos: "phrase", exEn: "His mother works as a cook in a hotel.", exRu: "Его мама работает поваром в отеле.", cefr: "A1", sense: "cook — повар, а не готовить" },
  { theme: "work_money_a1", en: "keep the change", ru: ["оставить сдачу"], pos: "phrase", exEn: "Keep the change, thank you.", exRu: "Оставьте сдачу, спасибо.", cefr: "A1", sense: "change — сдача, а не изменять" },
  { theme: "work_money_a1", en: "the whole class", ru: ["весь класс"], pos: "phrase", exEn: "The whole class went to the museum.", exRu: "Весь класс пошёл в музей.", cefr: "A1", sense: "class — класс (группа учеников), а не сорт" },
  { theme: "work_money_a2", en: "run a shop", ru: ["управлять магазином"], pos: "phrase", exEn: "Her parents run a small shop.", exRu: "Её родители управляют небольшим магазином.", cefr: "A2", sense: "run — управлять, а не бегать" },
  { theme: "work_money_b1", en: "make a deal", ru: ["заключить сделку"], pos: "phrase", exEn: "The two companies made a deal in May.", exRu: "Две компании заключили сделку в мае.", cefr: "B1", sense: "deal — сделка, а не иметь дело" },
  { theme: "work_money_b1", en: "the night shift", ru: ["ночная смена"], pos: "phrase", exEn: "My father works the night shift at the factory.", exRu: "Мой отец работает в ночную смену на заводе.", cefr: "B1", sense: "shift — смена, а не сдвиг" },
  { theme: "work_money_b1", en: "pay interest", ru: ["платить проценты"], pos: "phrase", exEn: "You pay interest on the money you borrow.", exRu: "Ты платишь проценты за деньги, которые берёшь в долг.", cefr: "B1", sense: "interest — проценты, а не интерес" },

  // ── семья ───────────────────────────────────────────────────────────────
  { theme: "family_people_a1", en: "go on a date", ru: ["пойти на свидание"], pos: "phrase", exEn: "My sister went on a date yesterday.", exRu: "Моя сестра вчера пошла на свидание.", cefr: "A1", sense: "date — свидание, а не дата" },
];

/**
 * Добавляет карточки-фразы в колоды датасета.
 *
 * Тихо потерянная карточка здесь хуже шумной ошибки: если тема названа с
 * опечаткой или фраза уже есть в каталоге, сид просто ничего не добавит, и
 * второе значение снова не будет учиться. Поэтому такие случаи возвращаются
 * списком проблем, а вызывающий решает, ругаться или падать (сид пишет
 * предупреждение, pnpm validate:examples — падает).
 */
export function applySensePhrases(decks: SeedDeck[]): { decks: SeedDeck[]; problems: string[] } {
  const problems: string[] = [];
  const byTheme = new Map<string, SensePhrase[]>();
  for (const phrase of SENSE_PHRASES) {
    const list = byTheme.get(phrase.theme) ?? [];
    list.push(phrase);
    byTheme.set(phrase.theme, list);
  }

  const known = new Set(decks.map((d) => d.theme));
  for (const theme of byTheme.keys()) {
    if (!known.has(theme)) {
      problems.push(`колоды "${theme}" нет в датасете — карточки этой темы не попадут в базу`);
    }
  }

  const out = decks.map((deck) => {
    const extra = byTheme.get(deck.theme);
    if (!extra || extra.length === 0) return deck;

    const have = new Set(deck.words.map((w) => w.en.trim().toLowerCase()));
    const words = [...deck.words];
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
      words.push({ en: p.en, pos: p.pos, ru: p.ru, ipa: "", exEn: p.exEn, exRu: p.exRu, cefr: p.cefr });
    }
    return { ...deck, words };
  });

  return { decks: out, problems };
}
