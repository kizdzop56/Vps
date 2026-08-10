// ─────────────────────────────────────────────────────────────────────────────
// Банк заданий раздела «Составлять».
//
// Три вида, все на одном движке (см. engine.ts):
//   verbGap  — вставить нужную форму неправильного глагола;
//   tenseGap — поставить глагол в заданное время;
//   assemble — собрать предложение по русскому переводу.
//
// ── Соответствие уровню ─────────────────────────────────────────────────────
// Четыре правила, и каждое проверяется тестом, а не обещанием в комментарии:
//
//   1. длина предложения не больше лимита уровня (MAX_WORDS). На A1 длинная
//      фраза непонятна сама по себе, сколько бы простой ни была грамматика;
//   2. глагол задания не выше уровня задания: в задании A1 не может стоять
//      withdraw;
//   3. третья форма (для Present Perfect) появляется только с B1 — там, где
//      это время и вводится программой;
//   4. время задания не выше уровня задания.
//
// ── Почему у verbGap нет поля с ответом ─────────────────────────────────────
// Ответ вычисляется из таблицы форм по базовому глаголу. Если продублировать
// его здесь, рано или поздно таблица и задание разойдутся — и ученик получит
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

  // B2
  { id: "vg-b2-1", level: "B2", text: `The judge has ${GAP} him to leave the country.`, base: "forbid", form: "participle", ru: "Судья запретил ему покидать страну." },
  { id: "vg-b2-2", level: "B2", text: `She has ${GAP} me for everything I said.`, base: "forgive", form: "participle", ru: "Она простила меня за всё, что я сказал." },
  { id: "vg-b2-3", level: "B2", text: `The police ${GAP} the missing boy for two weeks.`, base: "seek", form: "past", ru: "Полиция искала пропавшего мальчика две недели." },
  { id: "vg-b2-4", level: "B2", text: `The news ${GAP} quickly across the whole town.`, base: "spread", form: "past", ru: "Новость быстро разлетелась по всему городу." },
  { id: "vg-b2-5", level: "B2", text: `He ${GAP} that he had never seen the man before.`, base: "swear", form: "past", ru: "Он клялся, что никогда раньше не видел этого человека." },
  { id: "vg-b2-6", level: "B2", text: `A bee ${GAP} my hand while I was in the garden.`, base: "sting", form: "past", ru: "Пчела ужалила мою руку, когда я был в саду." },
];

// ── Времена ─────────────────────────────────────────────────────────────────

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

  // Present Continuous (A1)
  { id: "pc-1", level: "A1", tense: "present_continuous", text: `Look! The baby ${GAP}.`, base: "sleep", accept: ["is sleeping"], ru: "Смотри! Малыш спит." },
  { id: "pc-2", level: "A1", tense: "present_continuous", text: `I ${GAP} a book right now.`, base: "read", accept: ["am reading", "'m reading"], ru: "Я читаю книгу прямо сейчас." },
  { id: "pc-3", level: "A1", tense: "present_continuous", text: `They ${GAP} in the garden now.`, base: "run", accept: ["are running"], ru: "Они бегают в саду сейчас." },
  { id: "pc-4", level: "A1", tense: "present_continuous", text: `She ${GAP} a letter at the moment.`, base: "write", accept: ["is writing"], ru: "Она пишет письмо в данный момент." },
  { id: "pc-5", level: "A1", tense: "present_continuous", text: `Listen! The birds ${GAP}.`, base: "sing", accept: ["are singing"], ru: "Слушай! Птицы поют." },
  { id: "pc-6", level: "A1", tense: "present_continuous", text: `We ${GAP} dinner now.`, base: "make", accept: ["are making"], ru: "Мы готовим ужин сейчас." },
  { id: "pc-7", level: "A1", tense: "present_continuous", text: `My brother ${GAP} his room today.`, base: "clean", accept: ["is cleaning"], ru: "Мой брат убирает свою комнату сегодня." },
  { id: "pc-8", level: "A1", tense: "present_continuous", text: `I ${GAP} to school right now.`, base: "go", accept: ["am going", "'m going"], ru: "Я иду в школу прямо сейчас." },

  // Past Simple (A2)
  { id: "pst-1", level: "A2", tense: "past_simple", text: `We ${GAP} to the cinema last night.`, base: "go", accept: ["went"], ru: "Мы ходили в кино вчера вечером." },
  { id: "pst-2", level: "A2", tense: "past_simple", text: `She ${GAP} a new dress yesterday.`, base: "buy", accept: ["bought"], ru: "Она купила новое платье вчера." },
  { id: "pst-3", level: "A2", tense: "past_simple", text: `I ${GAP} football two days ago.`, base: "play", accept: ["played"], ru: "Я играл в футбол два дня назад." },
  { id: "pst-4", level: "A2", tense: "past_simple", text: `He ${GAP} his keys last week.`, base: "lose", accept: ["lost"], ru: "Он потерял свои ключи на прошлой неделе." },
  { id: "pst-5", level: "A2", tense: "past_simple", text: `They ${GAP} in London in 2019.`, base: "live", accept: ["lived"], ru: "Они жили в Лондоне в 2019 году." },
  { id: "pst-6", level: "A2", tense: "past_simple", text: `My mother ${GAP} a cake yesterday.`, base: "make", accept: ["made"], ru: "Моя мама сделала торт вчера." },
  { id: "pst-7", level: "A2", tense: "past_simple", text: `We ${GAP} our friends last Saturday.`, base: "meet", accept: ["met"], ru: "Мы встретили наших друзей в прошлую субботу." },
  { id: "pst-8", level: "A2", tense: "past_simple", text: `I ${GAP} that book two years ago.`, base: "read", accept: ["read"], ru: "Я читал ту книгу два года назад." },

  // Future Simple (A2)
  { id: "fs-1", level: "A2", tense: "future_simple", text: `I ${GAP} you tomorrow.`, base: "call", accept: ["will call", "'ll call"], ru: "Я позвоню тебе завтра." },
  { id: "fs-2", level: "A2", tense: "future_simple", text: `She ${GAP} the answer soon.`, base: "know", accept: ["will know", "'ll know"], ru: "Она скоро узнает ответ." },
  { id: "fs-3", level: "A2", tense: "future_simple", text: `We ${GAP} to the sea next summer.`, base: "go", accept: ["will go", "'ll go"], ru: "Мы поедем на море следующим летом." },
  { id: "fs-4", level: "A2", tense: "future_simple", text: `I think it ${GAP} tomorrow.`, base: "rain", accept: ["will rain", "'ll rain"], ru: "Я думаю, завтра будет дождь." },
  { id: "fs-5", level: "A2", tense: "future_simple", text: `He ${GAP} me with my homework.`, base: "help", accept: ["will help", "'ll help"], ru: "Он поможет мне с домашней работой." },
  { id: "fs-6", level: "A2", tense: "future_simple", text: `They ${GAP} a new house next year.`, base: "buy", accept: ["will buy", "'ll buy"], ru: "Они купят новый дом в следующем году." },

  // Present Perfect (B1)
  { id: "pp-1", level: "B1", tense: "present_perfect", text: `I ${GAP} my homework already.`, base: "finish", accept: ["have finished", "'ve finished"], ru: "Я уже закончил домашнюю работу." },
  { id: "pp-2", level: "B1", tense: "present_perfect", text: `She ${GAP} this book three times.`, base: "read", accept: ["has read"], ru: "Она читала эту книгу три раза." },
  { id: "pp-3", level: "B1", tense: "present_perfect", text: `We ${GAP} here since 2015.`, base: "live", accept: ["have lived", "'ve lived"], ru: "Мы живём здесь с 2015 года." },
  { id: "pp-4", level: "B1", tense: "present_perfect", text: `He ${GAP} his passport again.`, base: "lose", accept: ["has lost"], ru: "Он снова потерял свой паспорт." },
  { id: "pp-5", level: "B1", tense: "present_perfect", text: `They ${GAP} never ${GAP} to Japan.`, base: "be", accept: ["have been", "'ve been"], ru: "Они никогда не были в Японии." },
  { id: "pp-6", level: "B1", tense: "present_perfect", text: `I ${GAP} just ${GAP} the news.`, base: "hear", accept: ["have heard", "'ve heard"], ru: "Я только что услышал новость." },

  // Past Continuous (B1)
  { id: "pcn-1", level: "B1", tense: "past_continuous", text: `I ${GAP} when the phone rang.`, base: "sleep", accept: ["was sleeping"], ru: "Я спал, когда зазвонил телефон." },
  { id: "pcn-2", level: "B1", tense: "past_continuous", text: `They ${GAP} football at five o'clock.`, base: "play", accept: ["were playing"], ru: "Они играли в футбол в пять часов." },
  { id: "pcn-3", level: "B1", tense: "past_continuous", text: `She ${GAP} dinner when I came home.`, base: "cook", accept: ["was cooking"], ru: "Она готовила ужин, когда я пришёл домой." },
  { id: "pcn-4", level: "B1", tense: "past_continuous", text: `We ${GAP} while it was raining.`, base: "walk", accept: ["were walking"], ru: "Мы шли, пока шёл дождь." },
  { id: "pcn-5", level: "B1", tense: "past_continuous", text: `The sun ${GAP} all day yesterday.`, base: "shine", accept: ["was shining"], ru: "Солнце светило весь день вчера." },
  { id: "pcn-6", level: "B1", tense: "past_continuous", text: `He ${GAP} a book at that moment.`, base: "read", accept: ["was reading"], ru: "Он читал книгу в тот момент." },
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

  // A2
  { id: "as-a2-1", level: "A2", ru: "Вчера я ходил в кино с другом.", en: "Yesterday I went to the cinema with my friend.", extra: ["go", "goes"] },
  { id: "as-a2-2", level: "A2", ru: "Она купила новое платье на прошлой неделе.", en: "She bought a new dress last week.", extra: ["buys", "buy"] },
  { id: "as-a2-3", level: "A2", ru: "Мы не смотрели этот фильм.", en: "We did not watch this film.", extra: ["does", "watched"] },
  { id: "as-a2-4", level: "A2", ru: "Завтра он позвонит своей маме.", en: "Tomorrow he will call his mother.", extra: ["calls", "called"] },
  { id: "as-a2-5", level: "A2", ru: "Я умею плавать очень хорошо.", en: "I can swim very well.", extra: ["swims", "swimming"] },
  { id: "as-a2-6", level: "A2", ru: "Дети играли в парке весь день.", en: "The children played in the park all day.", extra: ["play", "plays"] },
  { id: "as-a2-7", level: "A2", ru: "Ты когда-нибудь был в Лондоне?", en: "Have you ever been to London?", extra: ["has", "was"] },
  { id: "as-a2-8", level: "A2", ru: "Этот дом больше, чем наш.", en: "This house is bigger than ours.", extra: ["big", "more"] },

  // B1
  { id: "as-b1-1", level: "B1", ru: "Я живу в этом городе уже десять лет.", en: "I have lived in this city for ten years.", extra: ["live", "since"] },
  { id: "as-b1-2", level: "B1", ru: "Она читала книгу, когда зазвонил телефон.", en: "She was reading a book when the phone rang.", extra: ["read", "ringing"] },
  { id: "as-b1-3", level: "B1", ru: "Если будет дождь, мы останемся дома.", en: "If it rains, we will stay at home.", extra: ["will rain", "stayed"] },
  { id: "as-b1-4", level: "B1", ru: "Он сказал, что уже закончил работу.", en: "He said that he had already finished the work.", extra: ["has", "finish"] },
  { id: "as-b1-5", level: "B1", ru: "Мне нужно больше времени, чтобы всё понять.", en: "I need more time to understand everything.", extra: ["needs", "understood"] },
  { id: "as-b1-6", level: "B1", ru: "Этот мост был построен сто лет назад.", en: "This bridge was built a hundred years ago.", extra: ["is", "build"] },

  // B2
  { id: "as-b2-1", level: "B2", ru: "Если бы я знал раньше, я бы тебе помог.", en: "If I had known earlier, I would have helped you.", extra: ["knew", "will"] },
  { id: "as-b2-2", level: "B2", ru: "Дом ремонтируют уже два месяца.", en: "The house has been repaired for two months.", extra: ["is", "repairing"] },
  { id: "as-b2-3", level: "B2", ru: "Она не только пела, но и играла на пианино.", en: "She not only sang but also played the piano.", extra: ["sings", "playing"] },
  { id: "as-b2-4", level: "B2", ru: "Чем больше ты читаешь, тем лучше пишешь.", en: "The more you read, the better you write.", extra: ["much", "good"] },
];
