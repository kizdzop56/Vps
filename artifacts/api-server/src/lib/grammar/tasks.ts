// ─────────────────────────────────────────────────────────────────────────────
// Банк заданий раздела «Составлять».
//
// Три вида, все на одном движке (см. engine.ts):
//   verbGap  — вставить нужную форму неправильного глагола;
//   tenseGap — поставить глагол в заданное время;
//   assemble — собрать предложение по русскому переводу.
//
// ── Объём: не меньше двух полных заходов ────────────────────────────────────
// Первая версия банка была маленькой: 28 предложений в сборке на все уровни,
// то есть ученику A2 доступно 18 при заходе в 12. Второй день подряд он собирал
// те же самые фразы. Ротация (см. rotateBatch в engine.ts) этого не лечит: из
// восемнадцати нельзя набрать два непересекающихся десятка.
//
// Поэтому объём — тоже правило, и оно проверяется тестом: на КАЖДОМ уровне и в
// КАЖДОМ времени заданий не меньше двух полных заходов. Добавляя новый уровень
// или новое время, придётся сразу написать и запас, а не одну показательную
// фразу.
//
// ── Соответствие уровню ─────────────────────────────────────────────────────
// Пять правил, и каждое проверяется тестом, а не обещанием в комментарии:
//
//   1. длина предложения не больше лимита уровня (MAX_WORDS). На A1 длинная
//      фраза непонятна сама по себе, сколько бы простой ни была грамматика;
//   2. глагол задания не выше уровня задания: в задании A1 не может стоять
//      withdraw;
//   3. третья форма (для Present Perfect) появляется только с B1 — там, где
//      это время и вводится программой;
//   4. время задания не выше уровня задания;
//   5. в задании РОВНО ОДИН пропуск. Движок подставляет ответ в один пропуск, и
//      второй прочерк означал бы, что ученик видит одно, а проверяется другое.
//
// ── Почему у verbGap нет поля с ответом ─────────────────────────────────────
// Ответ вычисляется из таблицы форм по базовому глаголу. Если продублировать
// его здесь, рано или поздно таблица и задания разойдутся — и ученик получит
// «неверно» на верном ответе. Один источник правды на все формы.
// ─────────────────────────────────────────────────────────────────────────────

import type { CefrLevel } from "./verbs";
import type { TenseId } from "./tenses";

/** Метка пропуска в предложении. Одна на весь банк. */
export const GAP = "___";

/** Предел длины предложения по уровню, в словах. */
export const MAX_WORDS: Record<CefrLevel, number> = {
  A1: 8,
  A2: 11,
  B1: 14,
  B2: 18,
  C1: 24,
};

/** С какого уровня допустима третья форма: раньше Present Perfect не изучают. */
export const PARTICIPLE_FROM: CefrLevel = "B1";

export type VerbForm = "past" | "participle";

/** Вставить форму неправильного глагола. */
export type VerbGapTask = {
  id: string;
  level: CefrLevel;
  /** Предложение с GAP на месте пропуска. */
  text: string;
  /** Первая форма: показывается в скобках как подсказка. */
  base: string;
  /** Какая форма нужна. Ответы берутся из таблицы глаголов. */
  form: VerbForm;
  /** Перевод всего предложения — нужен и до ответа, и в разборе. */
  ru: string;
};

/** Поставить глагол в заданное время. */
export type TenseGapTask = {
  id: string;
  level: CefrLevel;
  tense: TenseId;
  text: string;
  /** Первая форма глагола — она же подсказка в скобках. */
  base: string;
  /** Допустимые ответы целиком: «is reading», «have seen». */
  accept: string[];
  ru: string;
};

/** Собрать предложение из слов по русскому переводу. */
export type AssembleTask = {
  id: string;
  level: CefrLevel;
  /** Русский перевод — единственное, что видно до сборки. */
  ru: string;
  /** Верное предложение. Плитки нарезаются из него. */
  en: string;
  /**
   * Лишние слова-ловушки. Не «побольше слов», а именно те формы, которые
   * ученик перепутает: goes рядом с go, was рядом с is.
   *
   * Ровно по одному слову: плитки нарезаются по словам, и ловушка из двух слов
   * была бы вдвое шире остальных — то есть выдавала бы себя без знания языка.
   */
  extra?: string[];
};

// ── Неправильные глаголы ────────────────────────────────────────────────────
// До B1 — только вторая форма: Present Perfect в программе ещё нет.

export const VERB_GAP_TASKS: VerbGapTask[] = [
  // A1
  { id: "vg-a1-1", level: "A1", text: `I ${GAP} to school yesterday.`, base: "go", form: "past", ru: "Я ходил в школу вчера." },
  { id: "vg-a1-2", level: "A1", text: `She ${GAP} a letter last night.`, base: "write", form: "past", ru: "Она написала письмо вчера вечером." },
  { id: "vg-a1-3", level: "A1", text: `We ${GAP} pizza yesterday.`, base: "eat", form: "past", ru: "Мы ели пиццу вчера." },
  { id: "vg-a1-4", level: "A1", text: `Yesterday he ${GAP} my new bike.`, base: "see", form: "past", ru: "Вчера он видел мой новый велосипед." },
  { id: "vg-a1-5", level: "A1", text: `They ${GAP} home late yesterday.`, base: "come", form: "past", ru: "Они пришли домой поздно вчера." },
  { id: "vg-a1-6", level: "A1", text: `I ${GAP} my homework two hours ago.`, base: "do", form: "past", ru: "Я сделал домашнюю работу два часа назад." },
  { id: "vg-a1-7", level: "A1", text: `She ${GAP} me a book last week.`, base: "give", form: "past", ru: "Она дала мне книгу на прошлой неделе." },
  { id: "vg-a1-8", level: "A1", text: `The children ${GAP} in the park yesterday.`, base: "run", form: "past", ru: "Дети бегали в парке вчера." },
  { id: "vg-a1-9", level: "A1", text: `I ${GAP} a big cake on Sunday.`, base: "make", form: "past", ru: "Я сделал большой торт в воскресенье." },
  { id: "vg-a1-10", level: "A1", text: `He ${GAP} cold water this morning.`, base: "drink", form: "past", ru: "Он пил холодную воду сегодня утром." },
  { id: "vg-a1-11", level: "A1", text: `I ${GAP} well last night.`, base: "sleep", form: "past", ru: "Я хорошо спал вчера ночью." },
  { id: "vg-a1-12", level: "A1", text: `She ${GAP} the book on the table.`, base: "put", form: "past", ru: "Она положила книгу на стол." },
  { id: "vg-a1-13", level: "A1", text: `He ${GAP} me the truth yesterday.`, base: "tell", form: "past", ru: "Он сказал мне правду вчера." },
  { id: "vg-a1-14", level: "A1", text: `I ${GAP} very tired yesterday.`, base: "be", form: "past", ru: "Я был очень уставшим вчера." },
  { id: "vg-a1-15", level: "A1", text: `We ${GAP} a new game last month.`, base: "have", form: "past", ru: "У нас была новая игра в прошлом месяце." },
  { id: "vg-a1-16", level: "A1", text: `She ${GAP} my keys under the chair.`, base: "find", form: "past", ru: "Она нашла мои ключи под стулом." },
  { id: "vg-a1-17", level: "A1", text: `I ${GAP} a nice present yesterday.`, base: "get", form: "past", ru: "Я получил хороший подарок вчера." },
  { id: "vg-a1-18", level: "A1", text: `He ${GAP} my pen this morning.`, base: "take", form: "past", ru: "Он взял мою ручку сегодня утром." },
  { id: "vg-a1-19", level: "A1", text: `They ${GAP} the right answer.`, base: "know", form: "past", ru: "Они знали правильный ответ." },
  { id: "vg-a1-20", level: "A1", text: `She ${GAP} nothing about it.`, base: "say", form: "past", ru: "Она ничего об этом не сказала." },
  { id: "vg-a1-21", level: "A1", text: `We ${GAP} near the window.`, base: "sit", form: "past", ru: "Мы сидели у окна." },
  { id: "vg-a1-22", level: "A1", text: `I ${GAP} this book last week.`, base: "read", form: "past", ru: "Я читал эту книгу на прошлой неделе." },
  { id: "vg-a1-23", level: "A1", text: `The dog ${GAP} my sandwich.`, base: "eat", form: "past", ru: "Собака съела мой бутерброд." },
  { id: "vg-a1-24", level: "A1", text: `My friends ${GAP} to the zoo.`, base: "go", form: "past", ru: "Мои друзья ходили в зоопарк." },

  // A2
  { id: "vg-a2-1", level: "A2", text: `My father ${GAP} a new phone last week.`, base: "buy", form: "past", ru: "Мой папа купил новый телефон на прошлой неделе." },
  { id: "vg-a2-2", level: "A2", text: `The concert ${GAP} at seven o'clock yesterday.`, base: "begin", form: "past", ru: "Концерт начался в семь часов вчера." },
  { id: "vg-a2-3", level: "A2", text: `He ${GAP} his glasses this morning.`, base: "break", form: "past", ru: "Он разбил свои очки сегодня утром." },
  { id: "vg-a2-4", level: "A2", text: `She ${GAP} me an interesting story.`, base: "bring", form: "past", ru: "Она принесла мне интересную историю." },
  { id: "vg-a2-5", level: "A2", text: `They ${GAP} the red car in the shop.`, base: "choose", form: "past", ru: "Они выбрали красную машину в магазине." },
  { id: "vg-a2-6", level: "A2", text: `I ${GAP} very happy after the game.`, base: "feel", form: "past", ru: "Я чувствовал себя очень счастливым после игры." },
  { id: "vg-a2-7", level: "A2", text: `We ${GAP} to Spain last summer.`, base: "fly", form: "past", ru: "Мы летали в Испанию прошлым летом." },
  { id: "vg-a2-8", level: "A2", text: `He ${GAP} his umbrella at school again.`, base: "forget", form: "past", ru: "Он снова забыл свой зонт в школе." },
  { id: "vg-a2-9", level: "A2", text: `I ${GAP} a strange noise in the garden.`, base: "hear", form: "past", ru: "Я услышал странный шум в саду." },
  { id: "vg-a2-10", level: "A2", text: `She ${GAP} the party very early.`, base: "leave", form: "past", ru: "Она ушла с вечеринки очень рано." },
  { id: "vg-a2-11", level: "A2", text: `We ${GAP} our new teacher on Monday.`, base: "meet", form: "past", ru: "Мы встретили нашего нового учителя в понедельник." },
  { id: "vg-a2-12", level: "A2", text: `My sister ${GAP} a beautiful song yesterday.`, base: "sing", form: "past", ru: "Моя сестра пела красивую песню вчера." },
  { id: "vg-a2-13", level: "A2", text: `They ${GAP} all their money on books.`, base: "spend", form: "past", ru: "Они потратили все свои деньги на книги." },
  { id: "vg-a2-14", level: "A2", text: `He ${GAP} in the sea last summer.`, base: "swim", form: "past", ru: "Он плавал в море прошлым летом." },
  { id: "vg-a2-15", level: "A2", text: `Our team ${GAP} the match last Sunday.`, base: "win", form: "past", ru: "Наша команда победила в матче в прошлое воскресенье." },
  { id: "vg-a2-16", level: "A2", text: `She ${GAP} a warm coat because it was cold.`, base: "wear", form: "past", ru: "Она надела тёплое пальто, потому что было холодно." },
  { id: "vg-a2-17", level: "A2", text: `He ${GAP} the ball with one hand.`, base: "catch", form: "past", ru: "Он поймал мяч одной рукой." },
  { id: "vg-a2-18", level: "A2", text: `My uncle ${GAP} us to the airport.`, base: "drive", form: "past", ru: "Мой дядя отвёз нас в аэропорт." },
  { id: "vg-a2-19", level: "A2", text: `She ${GAP} off her bike yesterday.`, base: "fall", form: "past", ru: "Она упала с велосипеда вчера." },
  { id: "vg-a2-20", level: "A2", text: `I ${GAP} your letter for many years.`, base: "keep", form: "past", ru: "Я хранил твоё письмо много лет." },
  { id: "vg-a2-21", level: "A2", text: `We ${GAP} for the tickets online.`, base: "pay", form: "past", ru: "Мы заплатили за билеты онлайн." },
  { id: "vg-a2-22", level: "A2", text: `They ${GAP} their old car last month.`, base: "sell", form: "past", ru: "Они продали свою старую машину в прошлом месяце." },
  { id: "vg-a2-23", level: "A2", text: `Our neighbour ${GAP} me to swim.`, base: "teach", form: "past", ru: "Наш сосед научил меня плавать." },
  { id: "vg-a2-24", level: "A2", text: `His father ${GAP} this house himself.`, base: "build", form: "past", ru: "Его папа построил этот дом сам." },

  // B1 — здесь появляется третья форма
  { id: "vg-b1-1", level: "B1", text: `I have ${GAP} my keys again.`, base: "lose", form: "participle", ru: "Я снова потерял свои ключи." },
  { id: "vg-b1-2", level: "B1", text: `She has ${GAP} this film three times.`, base: "see", form: "participle", ru: "Она смотрела этот фильм три раза." },
  { id: "vg-b1-3", level: "B1", text: `They have ${GAP} to Italy twice.`, base: "be", form: "participle", ru: "Они были в Италии дважды." },
  { id: "vg-b1-4", level: "B1", text: `He has just ${GAP} the letter.`, base: "write", form: "participle", ru: "Он только что написал письмо." },
  { id: "vg-b1-5", level: "B1", text: `We have already ${GAP} lunch.`, base: "have", form: "participle", ru: "Мы уже пообедали." },
  { id: "vg-b1-6", level: "B1", text: `The thief ${GAP} her bag near the station.`, base: "steal", form: "past", ru: "Вор украл её сумку рядом с вокзалом." },
  { id: "vg-b1-7", level: "B1", text: `She ${GAP} the ball over the high fence.`, base: "throw", form: "past", ru: "Она бросила мяч через высокий забор." },
  { id: "vg-b1-8", level: "B1", text: `I ${GAP} up at six o'clock this morning.`, base: "wake", form: "past", ru: "Я проснулся в шесть часов сегодня утром." },
  { id: "vg-b1-9", level: "B1", text: `He has ${GAP} his phone in the car.`, base: "hide", form: "participle", ru: "Он спрятал свой телефон в машине." },
  { id: "vg-b1-10", level: "B1", text: `The lake ${GAP} completely last winter.`, base: "freeze", form: "past", ru: "Озеро полностью замёрзло прошлой зимой." },
  { id: "vg-b1-11", level: "B1", text: `She ${GAP} a picture of her old house.`, base: "draw", form: "past", ru: "Она нарисовала картину своего старого дома." },
  { id: "vg-b1-12", level: "B1", text: `Nobody ${GAP} what the sign really meant.`, base: "understand", form: "past", ru: "Никто не понял, что на самом деле значил знак." },
  { id: "vg-b1-13", level: "B1", text: `The bell ${GAP} exactly at eight.`, base: "ring", form: "past", ru: "Звонок прозвенел ровно в восемь." },
  { id: "vg-b1-14", level: "B1", text: `She has ${GAP} the same job for years.`, base: "hold", form: "participle", ru: "Она занимает одну и ту же должность много лет." },
  { id: "vg-b1-15", level: "B1", text: `I ${GAP} a horse for the first time.`, base: "ride", form: "past", ru: "Я впервые прокатился верхом на лошади." },
  { id: "vg-b1-16", level: "B1", text: `I never ${GAP} to hurt your feelings.`, base: "mean", form: "past", ru: "Я никогда не хотел задеть твои чувства." },

  // B2
  { id: "vg-b2-1", level: "B2", text: `The judge has ${GAP} him to leave the country.`, base: "forbid", form: "participle", ru: "Судья запретил ему покидать страну." },
  { id: "vg-b2-2", level: "B2", text: `She has ${GAP} me for everything I said.`, base: "forgive", form: "participle", ru: "Она простила меня за всё, что я сказал." },
  { id: "vg-b2-3", level: "B2", text: `The police ${GAP} the missing boy for two weeks.`, base: "seek", form: "past", ru: "Полиция искала пропавшего мальчика две недели." },
  { id: "vg-b2-4", level: "B2", text: `The news ${GAP} quickly across the whole town.`, base: "spread", form: "past", ru: "Новость быстро разлетелась по всему городу." },
  { id: "vg-b2-5", level: "B2", text: `He ${GAP} that he had never seen the man before.`, base: "swear", form: "past", ru: "Он клялся, что никогда раньше не видел этого человека." },
  { id: "vg-b2-6", level: "B2", text: `A bee ${GAP} my hand while I was in the garden.`, base: "sting", form: "past", ru: "Пчела ужалила мою руку, когда я был в саду." },
  { id: "vg-b2-7", level: "B2", text: `He ${GAP} the metal bar with his hands.`, base: "bend", form: "past", ru: "Он согнул металлический прут руками." },
  { id: "vg-b2-8", level: "B2", text: `She has ${GAP} the floor twice today.`, base: "sweep", form: "participle", ru: "Она подмела пол дважды за сегодня." },
  { id: "vg-b2-9", level: "B2", text: `The box ${GAP} across the wet floor.`, base: "slide", form: "past", ru: "Коробка проскользила по мокрому полу." },
  { id: "vg-b2-10", level: "B2", text: `The children ${GAP} on the old gate.`, base: "swing", form: "past", ru: "Дети качались на старых воротах." },
];

// ── Времена ─────────────────────────────────────────────────────────────────
// В пропуск встаёт ВСЯ форма целиком: «is reading», «have been». Поэтому
// пропуск один, а служебные слова (never, just, already) стоят рядом с ним
// открытым текстом — ученик видит их и понимает, какое время требуется.
//
// По 24 задания на время: это два полных захода без единого повтора, то есть
// два дня подряд. Меньше — и ротация упирается в размер банка.

export const TENSE_GAP_TASKS: TenseGapTask[] = [
  // Present Simple (A1)
  { id: "ps-1", level: "A1", tense: "present_simple", text: `He ${GAP} to bed at ten.`, base: "go", accept: ["goes"], ru: "Он ложится спать в десять." },
  { id: "ps-2", level: "A1", tense: "present_simple", text: `I ${GAP} tea every morning.`, base: "drink", accept: ["drink"], ru: "Я пью чай каждое утро." },
  { id: "ps-3", level: "A1", tense: "present_simple", text: `She ${GAP} her homework after school.`, base: "do", accept: ["does"], ru: "Она делает домашнюю работу после школы." },
  { id: "ps-4", level: "A1", tense: "present_simple", text: `My friends ${GAP} football on Sundays.`, base: "play", accept: ["play"], ru: "Мои друзья играют в футбол по воскресеньям." },
  { id: "ps-5", level: "A1", tense: "present_simple", text: `The shop ${GAP} at nine every day.`, base: "open", accept: ["opens"], ru: "Магазин открывается в девять каждый день." },
  { id: "ps-6", level: "A1", tense: "present_simple", text: `My cat ${GAP} milk very much.`, base: "like", accept: ["likes"], ru: "Моя кошка очень любит молоко." },
  { id: "ps-7", level: "A1", tense: "present_simple", text: `We usually ${GAP} at home.`, base: "eat", accept: ["eat"], ru: "Мы обычно едим дома." },
  { id: "ps-8", level: "A1", tense: "present_simple", text: `She never ${GAP} to music.`, base: "listen", accept: ["listens"], ru: "Она никогда не слушает музыку." },
  { id: "ps-9", level: "A1", tense: "present_simple", text: `We ${GAP} English at school.`, base: "study", accept: ["study"], ru: "Мы учим английский в школе." },
  { id: "ps-10", level: "A1", tense: "present_simple", text: `My mother ${GAP} very good soup.`, base: "cook", accept: ["cooks"], ru: "Моя мама готовит очень вкусный суп." },
  { id: "ps-11", level: "A1", tense: "present_simple", text: `The bus ${GAP} at eight.`, base: "come", accept: ["comes"], ru: "Автобус приходит в восемь." },
  { id: "ps-12", level: "A1", tense: "present_simple", text: `Cats ${GAP} a lot.`, base: "sleep", accept: ["sleep"], ru: "Кошки много спят." },
  { id: "ps-13", level: "A1", tense: "present_simple", text: `He always ${GAP} his teeth.`, base: "brush", accept: ["brushes"], ru: "Он всегда чистит зубы." },
  { id: "ps-14", level: "A1", tense: "present_simple", text: `I ${GAP} in a big house.`, base: "live", accept: ["live"], ru: "Я живу в большом доме." },
  { id: "ps-15", level: "A1", tense: "present_simple", text: `She ${GAP} to school by bus.`, base: "go", accept: ["goes"], ru: "Она ездит в школу на автобусе." },
  { id: "ps-16", level: "A1", tense: "present_simple", text: `We ${GAP} TV every evening.`, base: "watch", accept: ["watch"], ru: "Мы смотрим телевизор каждый вечер." },
  { id: "ps-17", level: "A1", tense: "present_simple", text: `My father ${GAP} in a bank.`, base: "work", accept: ["works"], ru: "Мой папа работает в банке." },
  { id: "ps-18", level: "A1", tense: "present_simple", text: `They ${GAP} football very well.`, base: "play", accept: ["play"], ru: "Они играют в футбол очень хорошо." },
  { id: "ps-19", level: "A1", tense: "present_simple", text: `It often ${GAP} in autumn.`, base: "rain", accept: ["rains"], ru: "Осенью часто идёт дождь." },
  { id: "ps-20", level: "A1", tense: "present_simple", text: `My sister ${GAP} funny books.`, base: "read", accept: ["reads"], ru: "Моя сестра читает смешные книги." },
  { id: "ps-21", level: "A1", tense: "present_simple", text: `We ${GAP} our homework together.`, base: "do", accept: ["do"], ru: "Мы делаем домашнюю работу вместе." },
  { id: "ps-22", level: "A1", tense: "present_simple", text: `He ${GAP} milk every morning.`, base: "drink", accept: ["drinks"], ru: "Он пьёт молоко каждое утро." },
  { id: "ps-23", level: "A1", tense: "present_simple", text: `Birds ${GAP} in the sky.`, base: "fly", accept: ["fly"], ru: "Птицы летают в небе." },
  { id: "ps-24", level: "A1", tense: "present_simple", text: `She ${GAP} her room on Sunday.`, base: "clean", accept: ["cleans"], ru: "Она убирает свою комнату в воскресенье." },

  // Present Continuous (A1)
  { id: "pc-1", level: "A1", tense: "present_continuous", text: `Look! The baby ${GAP}.`, base: "sleep", accept: ["is sleeping"], ru: "Смотри! Малыш спит." },
  { id: "pc-2", level: "A1", tense: "present_continuous", text: `I ${GAP} a book right now.`, base: "read", accept: ["am reading", "'m reading"], ru: "Я читаю книгу прямо сейчас." },
  { id: "pc-3", level: "A1", tense: "present_continuous", text: `They ${GAP} in the garden now.`, base: "run", accept: ["are running"], ru: "Они бегают в саду сейчас." },
  { id: "pc-4", level: "A1", tense: "present_continuous", text: `She ${GAP} a letter at the moment.`, base: "write", accept: ["is writing"], ru: "Она пишет письмо в данный момент." },
  { id: "pc-5", level: "A1", tense: "present_continuous", text: `Listen! The birds ${GAP}.`, base: "sing", accept: ["are singing"], ru: "Слушай! Птицы поют." },
  { id: "pc-6", level: "A1", tense: "present_continuous", text: `We ${GAP} dinner now.`, base: "make", accept: ["are making"], ru: "Мы готовим ужин сейчас." },
  { id: "pc-7", level: "A1", tense: "present_continuous", text: `My brother ${GAP} his room today.`, base: "clean", accept: ["is cleaning"], ru: "Мой брат убирает свою комнату сегодня." },
  { id: "pc-8", level: "A1", tense: "present_continuous", text: `I ${GAP} to school right now.`, base: "go", accept: ["am going", "'m going"], ru: "Я иду в школу прямо сейчас." },
  { id: "pc-9", level: "A1", tense: "present_continuous", text: `Look! It ${GAP} outside.`, base: "rain", accept: ["is raining"], ru: "Смотри! На улице идёт дождь." },
  { id: "pc-10", level: "A1", tense: "present_continuous", text: `We ${GAP} lunch right now.`, base: "have", accept: ["are having"], ru: "Мы обедаем прямо сейчас." },
  { id: "pc-11", level: "A1", tense: "present_continuous", text: `He ${GAP} football in the yard.`, base: "play", accept: ["is playing"], ru: "Он играет в футбол во дворе." },
  { id: "pc-12", level: "A1", tense: "present_continuous", text: `They ${GAP} TV at the moment.`, base: "watch", accept: ["are watching"], ru: "Они смотрят телевизор в данный момент." },
  { id: "pc-13", level: "A1", tense: "present_continuous", text: `I ${GAP} my homework now.`, base: "do", accept: ["am doing", "'m doing"], ru: "Я делаю домашнюю работу сейчас." },
  { id: "pc-14", level: "A1", tense: "present_continuous", text: `She ${GAP} coffee right now.`, base: "drink", accept: ["is drinking"], ru: "Она пьёт кофе прямо сейчас." },
  { id: "pc-15", level: "A1", tense: "present_continuous", text: `Look! The dog ${GAP} fast.`, base: "run", accept: ["is running"], ru: "Смотри! Собака быстро бежит." },
  { id: "pc-16", level: "A1", tense: "present_continuous", text: `We ${GAP} for the bus now.`, base: "wait", accept: ["are waiting"], ru: "Мы ждём автобус сейчас." },
  { id: "pc-17", level: "A1", tense: "present_continuous", text: `My mother ${GAP} in the kitchen.`, base: "cook", accept: ["is cooking"], ru: "Моя мама готовит на кухне." },
  { id: "pc-18", level: "A1", tense: "present_continuous", text: `The children ${GAP} in the pool.`, base: "swim", accept: ["are swimming"], ru: "Дети плавают в бассейне." },
  { id: "pc-19", level: "A1", tense: "present_continuous", text: `I ${GAP} a new song now.`, base: "learn", accept: ["am learning", "'m learning"], ru: "Я учу новую песню сейчас." },
  { id: "pc-20", level: "A1", tense: "present_continuous", text: `Listen! Somebody ${GAP} outside.`, base: "sing", accept: ["is singing"], ru: "Слушай! Кто-то поёт на улице." },
  { id: "pc-21", level: "A1", tense: "present_continuous", text: `You ${GAP} too fast now.`, base: "speak", accept: ["are speaking"], ru: "Ты говоришь слишком быстро сейчас." },
  { id: "pc-22", level: "A1", tense: "present_continuous", text: `He ${GAP} a picture at the moment.`, base: "draw", accept: ["is drawing"], ru: "Он рисует картину в данный момент." },
  { id: "pc-23", level: "A1", tense: "present_continuous", text: `They ${GAP} a new house now.`, base: "build", accept: ["are building"], ru: "Они строят новый дом сейчас." },
  { id: "pc-24", level: "A1", tense: "present_continuous", text: `I ${GAP} my best friend today.`, base: "meet", accept: ["am meeting", "'m meeting"], ru: "Я встречаюсь с лучшим другом сегодня." },

  // Past Simple (A2)
  { id: "pst-1", level: "A2", tense: "past_simple", text: `We ${GAP} to the cinema last night.`, base: "go", accept: ["went"], ru: "Мы ходили в кино вчера вечером." },
  { id: "pst-2", level: "A2", tense: "past_simple", text: `She ${GAP} a new dress yesterday.`, base: "buy", accept: ["bought"], ru: "Она купила новое платье вчера." },
  { id: "pst-3", level: "A2", tense: "past_simple", text: `I ${GAP} football two days ago.`, base: "play", accept: ["played"], ru: "Я играл в футбол два дня назад." },
  { id: "pst-4", level: "A2", tense: "past_simple", text: `He ${GAP} his keys last week.`, base: "lose", accept: ["lost"], ru: "Он потерял свои ключи на прошлой неделе." },
  { id: "pst-5", level: "A2", tense: "past_simple", text: `They ${GAP} in London in 2019.`, base: "live", accept: ["lived"], ru: "Они жили в Лондоне в 2019 году." },
  { id: "pst-6", level: "A2", tense: "past_simple", text: `My mother ${GAP} a cake yesterday.`, base: "make", accept: ["made"], ru: "Моя мама сделала торт вчера." },
  { id: "pst-7", level: "A2", tense: "past_simple", text: `We ${GAP} our friends last Saturday.`, base: "meet", accept: ["met"], ru: "Мы встретили наших друзей в прошлую субботу." },
  { id: "pst-8", level: "A2", tense: "past_simple", text: `I ${GAP} that book two years ago.`, base: "read", accept: ["read"], ru: "Я читал ту книгу два года назад." },
  { id: "pst-9", level: "A2", tense: "past_simple", text: `She ${GAP} her grandmother last Sunday.`, base: "visit", accept: ["visited"], ru: "Она навещала бабушку в прошлое воскресенье." },
  { id: "pst-10", level: "A2", tense: "past_simple", text: `We ${GAP} a big pizza yesterday.`, base: "eat", accept: ["ate"], ru: "Мы съели большую пиццу вчера." },
  { id: "pst-11", level: "A2", tense: "past_simple", text: `He ${GAP} the window an hour ago.`, base: "open", accept: ["opened"], ru: "Он открыл окно час назад." },
  { id: "pst-12", level: "A2", tense: "past_simple", text: `They ${GAP} home very late.`, base: "come", accept: ["came"], ru: "Они пришли домой очень поздно." },
  { id: "pst-13", level: "A2", tense: "past_simple", text: `I ${GAP} my grandfather last summer.`, base: "help", accept: ["helped"], ru: "Я помогал дедушке прошлым летом." },
  { id: "pst-14", level: "A2", tense: "past_simple", text: `The film ${GAP} at eight yesterday.`, base: "start", accept: ["started"], ru: "Фильм начался в восемь вчера." },
  { id: "pst-15", level: "A2", tense: "past_simple", text: `She ${GAP} a beautiful song at the party.`, base: "sing", accept: ["sang"], ru: "Она спела красивую песню на вечеринке." },
  { id: "pst-16", level: "A2", tense: "past_simple", text: `We ${GAP} in the sea last July.`, base: "swim", accept: ["swam"], ru: "Мы плавали в море в прошлом июле." },
  { id: "pst-17", level: "A2", tense: "past_simple", text: `My brother ${GAP} his bike last week.`, base: "break", accept: ["broke"], ru: "Мой брат сломал велосипед на прошлой неделе." },
  { id: "pst-18", level: "A2", tense: "past_simple", text: `I ${GAP} you three times yesterday.`, base: "call", accept: ["called"], ru: "Я звонил тебе три раза вчера." },
  { id: "pst-19", level: "A2", tense: "past_simple", text: `He ${GAP} the door and went out.`, base: "close", accept: ["closed"], ru: "Он закрыл дверь и вышел." },
  { id: "pst-20", level: "A2", tense: "past_simple", text: `They ${GAP} a new flat in May.`, base: "buy", accept: ["bought"], ru: "Они купили новую квартиру в мае." },
  { id: "pst-21", level: "A2", tense: "past_simple", text: `She ${GAP} me a long letter.`, base: "write", accept: ["wrote"], ru: "Она написала мне длинное письмо." },
  { id: "pst-22", level: "A2", tense: "past_simple", text: `We ${GAP} the bus and walked home.`, base: "miss", accept: ["missed"], ru: "Мы опоздали на автобус и пошли домой пешком." },
  { id: "pst-23", level: "A2", tense: "past_simple", text: `The children ${GAP} a snowman yesterday.`, base: "make", accept: ["made"], ru: "Дети слепили снеговика вчера." },
  { id: "pst-24", level: "A2", tense: "past_simple", text: `I ${GAP} my keys in the car.`, base: "leave", accept: ["left"], ru: "Я оставил ключи в машине." },

  // Future Simple (A2)
  { id: "fs-1", level: "A2", tense: "future_simple", text: `I ${GAP} you tomorrow.`, base: "call", accept: ["will call", "'ll call"], ru: "Я позвоню тебе завтра." },
  { id: "fs-2", level: "A2", tense: "future_simple", text: `She ${GAP} the answer soon.`, base: "know", accept: ["will know", "'ll know"], ru: "Она скоро узнает ответ." },
  { id: "fs-3", level: "A2", tense: "future_simple", text: `We ${GAP} to the sea next summer.`, base: "go", accept: ["will go", "'ll go"], ru: "Мы поедем на море следующим летом." },
  { id: "fs-4", level: "A2", tense: "future_simple", text: `I think it ${GAP} tomorrow.`, base: "rain", accept: ["will rain", "'ll rain"], ru: "Я думаю, завтра будет дождь." },
  { id: "fs-5", level: "A2", tense: "future_simple", text: `He ${GAP} me with my homework.`, base: "help", accept: ["will help", "'ll help"], ru: "Он поможет мне с домашней работой." },
  { id: "fs-6", level: "A2", tense: "future_simple", text: `They ${GAP} a new house next year.`, base: "buy", accept: ["will buy", "'ll buy"], ru: "Они купят новый дом в следующем году." },
  { id: "fs-7", level: "A2", tense: "future_simple", text: `We ${GAP} at the station tomorrow.`, base: "meet", accept: ["will meet", "'ll meet"], ru: "Мы встретимся на вокзале завтра." },
  { id: "fs-8", level: "A2", tense: "future_simple", text: `She ${GAP} the exam next week.`, base: "pass", accept: ["will pass", "'ll pass"], ru: "Она сдаст экзамен на следующей неделе." },
  { id: "fs-9", level: "A2", tense: "future_simple", text: `I ${GAP} you the truth later.`, base: "tell", accept: ["will tell", "'ll tell"], ru: "Я скажу тебе правду позже." },
  { id: "fs-10", level: "A2", tense: "future_simple", text: `They ${GAP} a new school here.`, base: "build", accept: ["will build", "'ll build"], ru: "Они построят здесь новую школу." },
  { id: "fs-11", level: "A2", tense: "future_simple", text: `He ${GAP} sixteen next year.`, base: "be", accept: ["will be", "'ll be"], ru: "Ему исполнится шестнадцать в следующем году." },
  { id: "fs-12", level: "A2", tense: "future_simple", text: `I think she ${GAP} soon.`, base: "come", accept: ["will come", "'ll come"], ru: "Думаю, она скоро придёт." },
  { id: "fs-13", level: "A2", tense: "future_simple", text: `We ${GAP} this film tomorrow evening.`, base: "watch", accept: ["will watch", "'ll watch"], ru: "Мы посмотрим этот фильм завтра вечером." },
  { id: "fs-14", level: "A2", tense: "future_simple", text: `Nobody ${GAP} about our secret.`, base: "know", accept: ["will know", "'ll know"], ru: "Никто не узнает о нашем секрете." },
  { id: "fs-15", level: "A2", tense: "future_simple", text: `I ${GAP} my room after lunch.`, base: "clean", accept: ["will clean", "'ll clean"], ru: "Я уберу свою комнату после обеда." },
  { id: "fs-16", level: "A2", tense: "future_simple", text: `The train ${GAP} in ten minutes.`, base: "leave", accept: ["will leave", "'ll leave"], ru: "Поезд отправится через десять минут." },
  { id: "fs-17", level: "A2", tense: "future_simple", text: `You ${GAP} this book very much.`, base: "like", accept: ["will like", "'ll like"], ru: "Тебе очень понравится эта книга." },
  { id: "fs-18", level: "A2", tense: "future_simple", text: `They ${GAP} us next summer.`, base: "visit", accept: ["will visit", "'ll visit"], ru: "Они навестят нас следующим летом." },
  { id: "fs-19", level: "A2", tense: "future_simple", text: `I ${GAP} this letter tomorrow morning.`, base: "send", accept: ["will send", "'ll send"], ru: "Я отправлю это письмо завтра утром." },
  { id: "fs-20", level: "A2", tense: "future_simple", text: `He ${GAP} his homework in the evening.`, base: "do", accept: ["will do", "'ll do"], ru: "Он сделает домашнюю работу вечером." },
  { id: "fs-21", level: "A2", tense: "future_simple", text: `I hope the weather ${GAP} fine.`, base: "be", accept: ["will be", "'ll be"], ru: "Надеюсь, погода будет хорошей." },
  { id: "fs-22", level: "A2", tense: "future_simple", text: `She ${GAP} at home tomorrow.`, base: "stay", accept: ["will stay", "'ll stay"], ru: "Она останется дома завтра." },
  { id: "fs-23", level: "A2", tense: "future_simple", text: `We ${GAP} the tickets tonight.`, base: "buy", accept: ["will buy", "'ll buy"], ru: "Мы купим билеты сегодня вечером." },
  { id: "fs-24", level: "A2", tense: "future_simple", text: `Our team ${GAP} the next match.`, base: "win", accept: ["will win", "'ll win"], ru: "Наша команда выиграет следующий матч." },

  // Present Perfect (B1)
  { id: "pp-1", level: "B1", tense: "present_perfect", text: `I ${GAP} my homework already.`, base: "finish", accept: ["have finished", "'ve finished"], ru: "Я уже закончил домашнюю работу." },
  { id: "pp-2", level: "B1", tense: "present_perfect", text: `She ${GAP} this book three times.`, base: "read", accept: ["has read"], ru: "Она читала эту книгу три раза." },
  { id: "pp-3", level: "B1", tense: "present_perfect", text: `We ${GAP} here since 2015.`, base: "live", accept: ["have lived", "'ve lived"], ru: "Мы живём здесь с 2015 года." },
  { id: "pp-4", level: "B1", tense: "present_perfect", text: `He ${GAP} his passport again.`, base: "lose", accept: ["has lost"], ru: "Он снова потерял свой паспорт." },
  { id: "pp-5", level: "B1", tense: "present_perfect", text: `They ${GAP} to Japan twice.`, base: "be", accept: ["have been", "'ve been"], ru: "Они были в Японии дважды." },
  { id: "pp-6", level: "B1", tense: "present_perfect", text: `I ${GAP} the news already.`, base: "hear", accept: ["have heard", "'ve heard"], ru: "Я уже слышал эту новость." },
  { id: "pp-7", level: "B1", tense: "present_perfect", text: `We ${GAP} our homework already.`, base: "do", accept: ["have done", "'ve done"], ru: "Мы уже сделали домашнюю работу." },
  { id: "pp-8", level: "B1", tense: "present_perfect", text: `He ${GAP} in this school since 2020.`, base: "study", accept: ["has studied"], ru: "Он учится в этой школе с 2020 года." },
  { id: "pp-9", level: "B1", tense: "present_perfect", text: `I ${GAP} my room today.`, base: "clean", accept: ["have cleaned", "'ve cleaned"], ru: "Я убрал свою комнату сегодня." },
  { id: "pp-10", level: "B1", tense: "present_perfect", text: `She ${GAP} a horse before.`, base: "ride", accept: ["has ridden"], ru: "Она каталась на лошади раньше." },
  { id: "pp-11", level: "B1", tense: "present_perfect", text: `We ${GAP} each other for ten years.`, base: "know", accept: ["have known", "'ve known"], ru: "Мы знаем друг друга десять лет." },
  { id: "pp-12", level: "B1", tense: "present_perfect", text: `He ${GAP} his phone somewhere.`, base: "leave", accept: ["has left"], ru: "Он где-то оставил свой телефон." },
  { id: "pp-13", level: "B1", tense: "present_perfect", text: `You ${GAP} a lot of mistakes today.`, base: "make", accept: ["have made", "'ve made"], ru: "Ты сегодня сделал много ошибок." },
  { id: "pp-14", level: "B1", tense: "present_perfect", text: `The rain ${GAP} at last.`, base: "stop", accept: ["has stopped"], ru: "Дождь наконец прекратился." },
  { id: "pp-15", level: "B1", tense: "present_perfect", text: `I ${GAP} this word before.`, base: "see", accept: ["have seen", "'ve seen"], ru: "Я видел это слово раньше." },
  { id: "pp-16", level: "B1", tense: "present_perfect", text: `She ${GAP} in Moscow since April.`, base: "work", accept: ["has worked"], ru: "Она работает в Москве с апреля." },
  { id: "pp-17", level: "B1", tense: "present_perfect", text: `We ${GAP} all the tickets already.`, base: "sell", accept: ["have sold", "'ve sold"], ru: "Мы уже продали все билеты." },
  { id: "pp-18", level: "B1", tense: "present_perfect", text: `He ${GAP} to me twice this week.`, base: "write", accept: ["has written"], ru: "Он писал мне дважды на этой неделе." },
  { id: "pp-19", level: "B1", tense: "present_perfect", text: `They ${GAP} the new bridge at last.`, base: "build", accept: ["have built", "'ve built"], ru: "Они наконец построили новый мост." },
  { id: "pp-20", level: "B1", tense: "present_perfect", text: `I ${GAP} my breakfast already.`, base: "eat", accept: ["have eaten", "'ve eaten"], ru: "Я уже позавтракал." },
  { id: "pp-21", level: "B1", tense: "present_perfect", text: `The children ${GAP} their grandmother today.`, base: "visit", accept: ["have visited", "'ve visited"], ru: "Дети сегодня навестили бабушку." },
  { id: "pp-22", level: "B1", tense: "present_perfect", text: `She ${GAP} a new dress for the party.`, base: "buy", accept: ["has bought"], ru: "Она купила новое платье к вечеринке." },
  { id: "pp-23", level: "B1", tense: "present_perfect", text: `Our team ${GAP} three matches this year.`, base: "win", accept: ["has won"], ru: "Наша команда выиграла три матча в этом году." },
  { id: "pp-24", level: "B1", tense: "present_perfect", text: `Somebody ${GAP} the window.`, base: "break", accept: ["has broken"], ru: "Кто-то разбил окно." },

  // Past Continuous (A2)
  // Прошедшее длительное идёт сразу за Past Simple, задолго до Present Perfect,
  // поэтому и время, и его задания стоят на A2.
  { id: "pcn-1", level: "A2", tense: "past_continuous", text: `I ${GAP} when the phone rang.`, base: "sleep", accept: ["was sleeping"], ru: "Я спал, когда зазвонил телефон." },
  { id: "pcn-2", level: "A2", tense: "past_continuous", text: `They ${GAP} football at five o'clock.`, base: "play", accept: ["were playing"], ru: "Они играли в футбол в пять часов." },
  { id: "pcn-3", level: "A2", tense: "past_continuous", text: `She ${GAP} dinner when I came home.`, base: "cook", accept: ["was cooking"], ru: "Она готовила ужин, когда я пришёл домой." },
  { id: "pcn-4", level: "A2", tense: "past_continuous", text: `We ${GAP} while it was raining.`, base: "walk", accept: ["were walking"], ru: "Мы шли, пока шёл дождь." },
  { id: "pcn-5", level: "A2", tense: "past_continuous", text: `The sun ${GAP} all day yesterday.`, base: "shine", accept: ["was shining"], ru: "Солнце светило весь день вчера." },
  { id: "pcn-6", level: "A2", tense: "past_continuous", text: `He ${GAP} a book at that moment.`, base: "read", accept: ["was reading"], ru: "Он читал книгу в тот момент." },
  { id: "pcn-7", level: "A2", tense: "past_continuous", text: `We ${GAP} dinner at eight yesterday.`, base: "have", accept: ["were having"], ru: "Мы ужинали в восемь вчера." },
  { id: "pcn-8", level: "A2", tense: "past_continuous", text: `She ${GAP} to music all evening.`, base: "listen", accept: ["was listening"], ru: "Она слушала музыку весь вечер." },
  { id: "pcn-9", level: "A2", tense: "past_continuous", text: `They ${GAP} TV when I came.`, base: "watch", accept: ["were watching"], ru: "Они смотрели телевизор, когда я пришёл." },
  { id: "pcn-10", level: "A2", tense: "past_continuous", text: `I ${GAP} my homework at six.`, base: "do", accept: ["was doing"], ru: "Я делал домашнюю работу в шесть." },
  { id: "pcn-11", level: "A2", tense: "past_continuous", text: `The children ${GAP} in the yard.`, base: "play", accept: ["were playing"], ru: "Дети играли во дворе." },
  { id: "pcn-12", level: "A2", tense: "past_continuous", text: `He ${GAP} a letter all morning.`, base: "write", accept: ["was writing"], ru: "Он писал письмо всё утро." },
  { id: "pcn-13", level: "A2", tense: "past_continuous", text: `We ${GAP} to school when it started raining.`, base: "walk", accept: ["were walking"], ru: "Мы шли в школу, когда начался дождь." },
  { id: "pcn-14", level: "A2", tense: "past_continuous", text: `My father ${GAP} the car at that moment.`, base: "wash", accept: ["was washing"], ru: "Мой папа мыл машину в тот момент." },
  { id: "pcn-15", level: "A2", tense: "past_continuous", text: `You ${GAP} when I called you.`, base: "sleep", accept: ["were sleeping"], ru: "Ты спал, когда я тебе звонил." },
  { id: "pcn-16", level: "A2", tense: "past_continuous", text: `It ${GAP} all day yesterday.`, base: "rain", accept: ["was raining"], ru: "Дождь шёл весь день вчера." },
  { id: "pcn-17", level: "A2", tense: "past_continuous", text: `She ${GAP} dinner while I was reading.`, base: "cook", accept: ["was cooking"], ru: "Она готовила ужин, пока я читал." },
  { id: "pcn-18", level: "A2", tense: "past_continuous", text: `They ${GAP} in the sea at noon.`, base: "swim", accept: ["were swimming"], ru: "Они плавали в море в полдень." },
  { id: "pcn-19", level: "A2", tense: "past_continuous", text: `I ${GAP} for the bus at seven.`, base: "wait", accept: ["was waiting"], ru: "Я ждал автобус в семь." },
  { id: "pcn-20", level: "A2", tense: "past_continuous", text: `We ${GAP} about you yesterday evening.`, base: "talk", accept: ["were talking"], ru: "Мы говорили о тебе вчера вечером." },
  { id: "pcn-21", level: "A2", tense: "past_continuous", text: `He ${GAP} a bike when he fell.`, base: "ride", accept: ["was riding"], ru: "Он ехал на велосипеде, когда упал." },
  { id: "pcn-22", level: "A2", tense: "past_continuous", text: `The birds ${GAP} outside my window.`, base: "sing", accept: ["were singing"], ru: "Птицы пели за моим окном." },
  { id: "pcn-23", level: "A2", tense: "past_continuous", text: `She ${GAP} a book when the light went out.`, base: "read", accept: ["was reading"], ru: "Она читала книгу, когда погас свет." },
  { id: "pcn-24", level: "A2", tense: "past_continuous", text: `My friends ${GAP} for me near the shop.`, base: "wait", accept: ["were waiting"], ru: "Мои друзья ждали меня возле магазина." },
];

// ── Сборка предложений ──────────────────────────────────────────────────────
// Лишние слова (extra) — не «побольше плиток», а именно те формы, которые
// ученик перепутает: goes рядом с go, was рядом с is. Случайное лишнее слово
// отбрасывается по смыслу и ничему не учит.

export const ASSEMBLE_TASKS: AssembleTask[] = [
  // A1
  { id: "as-a1-1", level: "A1", ru: "Я каждый день хожу в школу.", en: "I go to school every day.", extra: ["goes", "went"] },
  { id: "as-a1-2", level: "A1", ru: "Она любит красные яблоки.", en: "She likes red apples.", extra: ["like", "apple"] },
  { id: "as-a1-3", level: "A1", ru: "Мой брат играет в футбол.", en: "My brother plays football.", extra: ["play", "playing"] },
  { id: "as-a1-4", level: "A1", ru: "У нас дома есть большая собака.", en: "We have a big dog at home.", extra: ["has", "dogs"] },
  { id: "as-a1-5", level: "A1", ru: "Он пьёт чай утром.", en: "He drinks tea in the morning.", extra: ["drink", "drank"] },
  { id: "as-a1-6", level: "A1", ru: "Книга лежит на столе.", en: "The book is on the table.", extra: ["are", "was"] },
  { id: "as-a1-7", level: "A1", ru: "Я не люблю холодную воду.", en: "I do not like cold water.", extra: ["does", "likes"] },
  { id: "as-a1-8", level: "A1", ru: "Мои друзья живут рядом.", en: "My friends live near me.", extra: ["lives", "lived"] },
  { id: "as-a1-9", level: "A1", ru: "Она читает книгу сейчас.", en: "She is reading a book now.", extra: ["reads", "read"] },
  { id: "as-a1-10", level: "A1", ru: "Где твоя сестра?", en: "Where is your sister?", extra: ["are", "you"] },
  { id: "as-a1-11", level: "A1", ru: "Мы живём в маленьком городе.", en: "We live in a small town.", extra: ["lives", "big"] },
  { id: "as-a1-12", level: "A1", ru: "Он не любит молоко.", en: "He does not like milk.", extra: ["do", "likes"] },
  { id: "as-a1-13", level: "A1", ru: "У меня есть две сестры.", en: "I have two sisters.", extra: ["has", "sister"] },
  { id: "as-a1-14", level: "A1", ru: "Она моя лучшая подруга.", en: "She is my best friend.", extra: ["are", "am"] },
  { id: "as-a1-15", level: "A1", ru: "Они играют в саду.", en: "They play in the garden.", extra: ["plays", "played"] },
  { id: "as-a1-16", level: "A1", ru: "Я люблю яблоки и апельсины.", en: "I like apples and oranges.", extra: ["likes", "orange"] },
  { id: "as-a1-17", level: "A1", ru: "Кошка спит на диване.", en: "The cat sleeps on the sofa.", extra: ["sleep", "sleeping"] },
  { id: "as-a1-18", level: "A1", ru: "Мой папа работает в школе.", en: "My father works at a school.", extra: ["work", "working"] },
  { id: "as-a1-19", level: "A1", ru: "Сегодня холодно.", en: "It is cold today.", extra: ["are", "was"] },
  { id: "as-a1-20", level: "A1", ru: "Мы не смотрим телевизор утром.", en: "We do not watch TV in the morning.", extra: ["does", "watches"] },
  { id: "as-a1-21", level: "A1", ru: "Сколько тебе лет?", en: "How old are you?", extra: ["is", "many"] },
  { id: "as-a1-22", level: "A1", ru: "Она пьёт кофе каждое утро.", en: "She drinks coffee every morning.", extra: ["drink", "drank"] },
  { id: "as-a1-23", level: "A1", ru: "Мои книги в сумке.", en: "My books are in the bag.", extra: ["is", "book"] },
  { id: "as-a1-24", level: "A1", ru: "Он умеет играть на гитаре.", en: "He can play the guitar.", extra: ["plays", "playing"] },
  { id: "as-a1-25", level: "A1", ru: "Мы идём домой сейчас.", en: "We are going home now.", extra: ["is", "go"] },
  { id: "as-a1-26", level: "A1", ru: "У неё длинные тёмные волосы.", en: "She has long dark hair.", extra: ["have", "hairs"] },

  // A2
  { id: "as-a2-1", level: "A2", ru: "Вчера я ходил в кино с другом.", en: "Yesterday I went to the cinema with my friend.", extra: ["go", "goes"] },
  { id: "as-a2-2", level: "A2", ru: "Она купила новое платье на прошлой неделе.", en: "She bought a new dress last week.", extra: ["buys", "buy"] },
  { id: "as-a2-3", level: "A2", ru: "Мы не смотрели этот фильм.", en: "We did not watch this film.", extra: ["does", "watched"] },
  { id: "as-a2-4", level: "A2", ru: "Завтра он позвонит своей маме.", en: "Tomorrow he will call his mother.", extra: ["calls", "called"] },
  { id: "as-a2-5", level: "A2", ru: "Я умею плавать очень хорошо.", en: "I can swim very well.", extra: ["swims", "swimming"] },
  { id: "as-a2-6", level: "A2", ru: "Дети играли в парке весь день.", en: "The children played in the park all day.", extra: ["play", "plays"] },
  { id: "as-a2-7", level: "A2", ru: "Ты когда-нибудь был в Лондоне?", en: "Have you ever been to London?", extra: ["has", "was"] },
  { id: "as-a2-8", level: "A2", ru: "Этот дом больше, чем наш.", en: "This house is bigger than ours.", extra: ["big", "more"] },
  { id: "as-a2-9", level: "A2", ru: "Он не пошёл в школу вчера.", en: "He did not go to school yesterday.", extra: ["went", "does"] },
  { id: "as-a2-10", level: "A2", ru: "Мы были в зоопарке в прошлое воскресенье.", en: "We were at the zoo last Sunday.", extra: ["was", "is"] },
  { id: "as-a2-11", level: "A2", ru: "Она собирается купить новый телефон.", en: "She is going to buy a new phone.", extra: ["buys", "are"] },
  { id: "as-a2-12", level: "A2", ru: "Вчера дождь шёл весь день.", en: "It rained all day yesterday.", extra: ["rain", "rains"] },
  { id: "as-a2-13", level: "A2", ru: "Я никогда не был в Париже.", en: "I have never been to Paris.", extra: ["was", "has"] },
  { id: "as-a2-14", level: "A2", ru: "Он лучший ученик в классе.", en: "He is the best student in the class.", extra: ["better", "good"] },
  { id: "as-a2-15", level: "A2", ru: "Ты должен закончить домашнюю работу.", en: "You must finish your homework.", extra: ["finished", "have"] },
  { id: "as-a2-16", level: "A2", ru: "Мы не смогли открыть дверь.", en: "We could not open the door.", extra: ["can", "opened"] },
  { id: "as-a2-17", level: "A2", ru: "Сколько стоит этот билет?", en: "How much does this ticket cost?", extra: ["many", "costs"] },
  { id: "as-a2-18", level: "A2", ru: "Она играла на пианино два часа назад.", en: "She played the piano two hours ago.", extra: ["plays", "play"] },
  { id: "as-a2-19", level: "A2", ru: "Мой брат старше меня.", en: "My brother is older than me.", extra: ["old", "more"] },
  { id: "as-a2-20", level: "A2", ru: "Завтра мы навестим бабушку.", en: "Tomorrow we will visit our grandmother.", extra: ["visited", "visits"] },
  { id: "as-a2-21", level: "A2", ru: "В комнате нет стульев.", en: "There are no chairs in the room.", extra: ["is", "chair"] },
  { id: "as-a2-22", level: "A2", ru: "Я потерял свой ключ вчера утром.", en: "I lost my key yesterday morning.", extra: ["lose", "loses"] },
  { id: "as-a2-23", level: "A2", ru: "Дети смотрели фильм, когда я пришёл.", en: "The children were watching a film when I came.", extra: ["was", "come"] },
  { id: "as-a2-24", level: "A2", ru: "Он никогда не ест мясо.", en: "He never eats meat.", extra: ["eat", "ate"] },
  { id: "as-a2-25", level: "A2", ru: "Мы должны быть дома в семь.", en: "We have to be at home at seven.", extra: ["has", "been"] },
  { id: "as-a2-26", level: "A2", ru: "Это самая интересная книга.", en: "This is the most interesting book.", extra: ["more", "books"] },

  // B1
  { id: "as-b1-1", level: "B1", ru: "Я живу в этом городе уже десять лет.", en: "I have lived in this city for ten years.", extra: ["live", "since"] },
  { id: "as-b1-2", level: "B1", ru: "Она читала книгу, когда зазвонил телефон.", en: "She was reading a book when the phone rang.", extra: ["read", "ringing"] },
  { id: "as-b1-3", level: "B1", ru: "Если будет дождь, мы останемся дома.", en: "If it rains, we will stay at home.", extra: ["rain", "stayed"] },
  { id: "as-b1-4", level: "B1", ru: "Он сказал, что уже закончил работу.", en: "He said that he had already finished the work.", extra: ["has", "finish"] },
  { id: "as-b1-5", level: "B1", ru: "Мне нужно больше времени, чтобы всё понять.", en: "I need more time to understand everything.", extra: ["needs", "understood"] },
  { id: "as-b1-6", level: "B1", ru: "Этот мост был построен сто лет назад.", en: "This bridge was built a hundred years ago.", extra: ["is", "build"] },
  { id: "as-b1-7", level: "B1", ru: "Я не знаю, где он живёт.", en: "I do not know where he lives.", extra: ["live", "does"] },
  { id: "as-b1-8", level: "B1", ru: "Она спросила, почему я опоздал.", en: "She asked why I was late.", extra: ["am", "were"] },
  { id: "as-b1-9", level: "B1", ru: "Если бы у меня было время, я бы тебе помог.", en: "If I had time, I would help you.", extra: ["have", "helped"] },
  { id: "as-b1-10", level: "B1", ru: "Это книга, которую я купил вчера.", en: "This is the book that I bought yesterday.", extra: ["buy", "buys"] },
  { id: "as-b1-11", level: "B1", ru: "Мне не разрешают гулять поздно.", en: "I am not allowed to walk late.", extra: ["allow", "was"] },
  { id: "as-b1-12", level: "B1", ru: "Он работает здесь с прошлого года.", en: "He has worked here since last year.", extra: ["for", "work"] },
  { id: "as-b1-13", level: "B1", ru: "Чем ты занимался вчера вечером?", en: "What were you doing yesterday evening?", extra: ["was", "did"] },
  { id: "as-b1-14", level: "B1", ru: "Дом был построен моим дедушкой.", en: "The house was built by my grandfather.", extra: ["is", "build"] },
  { id: "as-b1-15", level: "B1", ru: "Она сказала, что придёт позже.", en: "She said that she would come later.", extra: ["will", "came"] },
  { id: "as-b1-16", level: "B1", ru: "Я никогда не видел ничего подобного.", en: "I have never seen anything like this.", extra: ["saw", "has"] },
  { id: "as-b1-17", level: "B1", ru: "Тебе следует больше отдыхать.", en: "You should rest more.", extra: ["shall", "rested"] },
  { id: "as-b1-18", level: "B1", ru: "Мы ждём автобус уже двадцать минут.", en: "We have been waiting for the bus for twenty minutes.", extra: ["wait", "since"] },
  { id: "as-b1-19", level: "B1", ru: "Он спросил меня, где находится вокзал.", en: "He asked me where the station was.", extra: ["is", "were"] },
  { id: "as-b1-20", level: "B1", ru: "Чем раньше ты начнёшь, тем лучше.", en: "The sooner you start, the better.", extra: ["soon", "good"] },

  // B2
  { id: "as-b2-1", level: "B2", ru: "Если бы я знал раньше, я бы тебе помог.", en: "If I had known earlier, I would have helped you.", extra: ["knew", "will"] },
  { id: "as-b2-2", level: "B2", ru: "Дом ремонтируют уже два месяца.", en: "The house has been repaired for two months.", extra: ["is", "repairing"] },
  { id: "as-b2-3", level: "B2", ru: "Она не только пела, но и играла на пианино.", en: "She not only sang but also played the piano.", extra: ["sings", "playing"] },
  { id: "as-b2-4", level: "B2", ru: "Чем больше ты читаешь, тем лучше пишешь.", en: "The more you read, the better you write.", extra: ["much", "good"] },
  { id: "as-b2-5", level: "B2", ru: "Если бы она училась усерднее, она сдала бы экзамен.", en: "If she had studied harder, she would have passed the exam.", extra: ["study", "hard"] },
  { id: "as-b2-6", level: "B2", ru: "Жаль, что ты не сказал мне раньше.", en: "I wish you had told me earlier.", extra: ["tell", "have"] },
  { id: "as-b2-7", level: "B2", ru: "Работа должна быть закончена к пятнице.", en: "The work must be finished by Friday.", extra: ["finish", "is"] },
  { id: "as-b2-8", level: "B2", ru: "Он не только опоздал, но и забыл документы.", en: "He was not only late but also forgot the documents.", extra: ["forget", "too"] },
  { id: "as-b2-9", level: "B2", ru: "Чем больше я об этом думаю, тем меньше понимаю.", en: "The more I think about it, the less I understand.", extra: ["much", "little"] },
  { id: "as-b2-10", level: "B2", ru: "Говорят, что этот замок очень старый.", en: "It is said that this castle is very old.", extra: ["says", "was"] },
  { id: "as-b2-11", level: "B2", ru: "Ему пришлось извиниться, хотя он не был виноват.", en: "He had to apologize although he was not guilty.", extra: ["has", "apologized"] },
  { id: "as-b2-12", level: "B2", ru: "Без твоей помощи я бы не справился.", en: "Without your help I would not have managed.", extra: ["will", "manage"] },
  { id: "as-b2-13", level: "B2", ru: "Она делает вид, что ничего не произошло.", en: "She pretends that nothing has happened.", extra: ["pretend", "have"] },
  { id: "as-b2-14", level: "B2", ru: "Не успел я войти, как зазвонил телефон.", en: "Hardly had I come in when the phone rang.", extra: ["have", "ringing"] },
];
