// ─────────────────────────────────────────────────────────────────────────────
// Предложения-заготовки: из них генератор собирает задания.
//
// ── Зачем ───────────────────────────────────────────────────────────────────
// Претензия была прямая: заданий мало, ученик проходит раздел за одно занятие,
// и дальше раздел для него мёртв. Причина не в лени, а в способе: каждое
// предложение писалось руками — отдельно утверждение, отдельно отрицание,
// отдельно вопрос. Такой банк растёт по строке в минуту и упирается в терпение
// того, кто его пишет.
//
// Здесь лежит другое. Одна заготовка — одно осмысленное предложение, разобранное
// на части: подлежащее, глагол, хвост и русский перевод. Из неё генератор
// (generate.ts) делает СЕМЬ заданий:
//
//   вставить глагол в утверждение   He ___ milk.        → likes
//   вставить глагол в отрицание     He ___ milk.        → does not like
//   выбрать вспомогательный         ___ he like milk?   → Does
//   поставить глагол в вопросе      Does he ___ milk?   → like
//   собрать утверждение, отрицание и вопрос из слов
//
// Вся английская механика — do/does/did, окончание -s, be + -ing, have + третья
// форма — выводится из времени и лица. Это ровно та часть языка, которая
// механическая: писать её руками сто раз подряд бессмысленно и чревато опечатками.
//
// А вот сами предложения написаны руками и остаются осмысленными. Генерировать
// ещё и их (подставляя случайные глаголы в шаблон «{кто} {что делает} {что}»)
// было бы шагом в пропасть: получилось бы «The shop drinks milk», и никакой
// объём этого не оправдывает.
//
// ── РАЗМНОЖЕНИЕ ПО ЛИЦАМ ────────────────────────────────────────────────────
// Семи заданий с заготовки всё равно оказалось мало: 120 заготовок дают около
// 58 заходов на времена и 30 на сборку, то есть две недели при пяти заходах в
// день.
//
// Поэтому заготовка, помеченная `swap`, разворачивается по ШЕСТИ лицам (I, you,
// he, she, we, they): «He goes to bed at ten» даёт ещё «I go to bed at ten», «We
// go to bed at ten» и так далее. Английскую часть считает генератор, русскую
// берёт из таблицы форм (ruForms.ts) по ключу `ruVerbKey`. Банк вырастает в
// четыре с лишним раза, и ни одно предложение при этом не придумано машиной:
// меняется только лицо.
//
// Что нужно заготовке для размножения:
//   ruSubject  — русское подлежащее, с которого НАЧИНАЕТСЯ перевод. Его и
//                подменяет генератор;
//   ruVerbKey  — ключ в таблице русских форм;
//   swap: true — разрешение. Ставится не всем, см. ниже.
//
// ── Кому размножение НЕ ставится, и это важнее самого размножения ───────────
// 1. Подлежащее — не человек: «The shop opens at nine», «Cats sleep a lot», «It
//    rains in autumn». «Я открываюсь в девять» — бессмыслица.
// 2. В хвосте объектное местоимение того же лица: «I call you tomorrow» при
//    подстановке you даёт «You will call you», а «He helps me with my homework» —
//    «I will help me with my homework». Формально верно, по смыслу мусор.
// 3. Русский перевод не начинается с подлежащего: «Ему будет шестнадцать»,
//    «Тебе понравится эта книга». Там подлежащее в дативе, подменять нечего.
// 4. Взаимное действие: «We know each other well» в единственном лице
//    невозможно.
//
// Правило простое: если подстановка любого из шести лиц даёт фразу, которую
// стыдно показать ученику, размножение не ставится вовсе. Одно кривое
// предложение обесценивает сотню правильных.
//
// ── Притяжательное в хвосте: {poss} ─────────────────────────────────────────
// «She does her homework» при смене лица обязана стать «I do my homework», а не
// «I do her homework» — иначе английская фраза расходится с русским переводом
// («свою домашнюю работу»). Поэтому в хвосте стоит метка {poss}, и генератор
// подставляет my/your/his/her/our/their по лицу. Для родного лица заготовки
// получается ровно то, что было написано раньше, — это проверяется тестом.
//
// ВАЖНО: {poss} ставится только там, где притяжательное относится к
// ПОДЛЕЖАЩЕМУ. В «You know my name» слово «my» — про говорящего, и меняться
// оно не должно.
//
// ── Русский перевод — шаблон, а не куски ────────────────────────────────────
// ru хранится целиком, с {} на месте глагола: «Моя кошка очень {} молоко».
// Склеить перевод из подлежащего, глагола и хвоста нельзя — в русском глагол
// сплошь и рядом стоит в середине, а порядок слов свободный.
//
// Из шаблона получаются все три вида:
//   утверждение — подставить глагол;
//   отрицание   — подставить «не» + глагол;
//   вопрос      — то же утверждение со знаком вопроса. В русском общий вопрос
//                 отличается от утверждения только интонацией, и «Он любит
//                 молоко?» — нормальный, живой перевод для «Does he like milk?».
//
// Отсюда требование к шаблону: «не» встаёт ПЕРЕД {}, поэтому глагол в переводе
// должен стоять там, где отрицание звучит естественно. «Кошки много {}» дало бы
// «Кошки много не спят», поэтому написано «Кошки {} много».
//
// ── ГРАБЛИ: счётчики в хвосте ───────────────────────────────────────────────
// «She has read this book three times» — прекрасное утверждение и негодный
// вопрос: «Has she read this book three times?» звучит странно, а по-русски
// вопрос вообще получался про другое. Чинить это отдельным переводом на каждый
// вид предложения значит завести третий шаблон, о котором обязательно забудут.
//
// Проще не ставить счётчик в заготовку вовсе. К грамматике, ради которой
// задание написано, «три раза» ничего не добавляет.
//
// ── Хвост для отрицания ─────────────────────────────────────────────────────
// Остался ровно один вид особого хвоста: already в отрицании и вопросе меняется
// на yet. Перевод утверждения при этом работает и как вопрос («Я уже закончил
// домашнюю работу?»), поэтому третий шаблон не нужен и тут. С «наконец» это не
// работало, и в двух заготовках оно заменено на «уже».
//
// ── Правила, которые надо держать в голове, добавляя заготовку ──────────────
// 1. Длина. Считается ГОТОВАЯ фраза, а отрицание длиннее утверждения на два
//    слова («does not like» вместо «likes»). На A1 лимит восемь слов, значит
//    утверждение должно укладываться в шесть. Задания, которые не влезли,
//    генератор молча не выпускает, а тест на объём поймает, если из-за этого
//    какой-то вид предложений исчезнет.
// 2. Никаких наречий между подлежащим и глаголом («He often goes»): пропуск
//    стоит на месте глагола, и наречие оказалось бы не с той стороны.
// 3. Подлежащее — обычное слово или местоимение, без имён собственных: в
//    вопросе оно уходит с заглавной буквы на строчную («Does my cat …»).
// 4. Никаких счётчиков в хвосте, см. ГРАБЛИ выше.
// 5. Ставя swap, прочитать список из «кому размножение НЕ ставится» и мысленно
//    подставить все шесть лиц.
// ─────────────────────────────────────────────────────────────────────────────

import type { CefrLevel } from "./verbs";
import type { TenseId } from "./tenses";
import type { RuTense } from "./ruForms";

/** Лицо и число подлежащего: от них зависит вспомогательный глагол и -s. */
export type Person = "I" | "you" | "he" | "she" | "it" | "we" | "they";

export type SentenceUnit = {
  /** Короткий уникальный номер. Из него строятся номера всех заданий. */
  id: string;
  level: CefrLevel;
  tense: TenseId;
  person: Person;
  /** Подлежащее как оно стоит в начале предложения: «My cat», «I». */
  subject: string;
  /** Глагол в первой форме. */
  verb: string;
  /** Хвост предложения после глагола. Может быть пустым. Метка {poss} — притяжательное подлежащего. */
  rest: string;
  /** Русский перевод целиком, с {} на месте глагола. */
  ru: string;
  /** Русская форма глагола для этого времени и лица. */
  ruVerb: string;
  /** Хвост для отрицания и вопроса, если он отличается: already → yet. */
  restNeg?: string;
  /** Перевод для отрицания, если он отличается вслед за хвостом. */
  ruNeg?: string;

  // ── Размножение по лицам ──
  /** Разрешение размножать. Требует ruSubject и ruVerbKey. */
  swap?: boolean;
  /** Русское подлежащее: с него начинается ru, его и подменяет генератор. */
  ruSubject?: string;
  /** Ключ в таблице русских форм (ruForms.ts). */
  ruVerbKey?: string;
  /**
   * Русское время перевода, если оно не выводится из английского.
   *
   * Нужно только для Present Perfect с since и for: «Мы живём здесь с 2015
   * года» — по-русски настоящее, хотя по-английски перфект.
   */
  ruTense?: RuTense;
};

export const SENTENCE_UNITS: SentenceUnit[] = [
  // ── Present Simple (A1) ───────────────────────────────────────────────────
  { id: "u-ps-1", level: "A1", tense: "present_simple", person: "he", subject: "He", verb: "go", rest: "to bed at ten", ru: "Он {} спать в десять", ruVerb: "ложится", swap: true, ruSubject: "Он", ruVerbKey: "ложиться спать" },
  { id: "u-ps-2", level: "A1", tense: "present_simple", person: "I", subject: "I", verb: "drink", rest: "tea every morning", ru: "Я {} чай каждое утро", ruVerb: "пью", swap: true, ruSubject: "Я", ruVerbKey: "пить" },
  { id: "u-ps-3", level: "A1", tense: "present_simple", person: "she", subject: "She", verb: "do", rest: "{poss} homework", ru: "Она {} свою домашнюю работу", ruVerb: "делает", swap: true, ruSubject: "Она", ruVerbKey: "делать" },
  { id: "u-ps-4", level: "A1", tense: "present_simple", person: "they", subject: "My friends", verb: "play", rest: "football on Sundays", ru: "Мои друзья {} в футбол по воскресеньям", ruVerb: "играют", swap: true, ruSubject: "Мои друзья", ruVerbKey: "играть" },
  { id: "u-ps-5", level: "A1", tense: "present_simple", person: "it", subject: "The shop", verb: "open", rest: "at nine", ru: "Магазин {} в девять", ruVerb: "открывается" },
  { id: "u-ps-6", level: "A1", tense: "present_simple", person: "we", subject: "We", verb: "eat", rest: "at home", ru: "Мы {} дома", ruVerb: "едим", swap: true, ruSubject: "Мы", ruVerbKey: "есть" },
  { id: "u-ps-7", level: "A1", tense: "present_simple", person: "he", subject: "My father", verb: "work", rest: "in a bank", ru: "Мой папа {} в банке", ruVerb: "работает", swap: true, ruSubject: "Мой папа", ruVerbKey: "работать" },
  { id: "u-ps-8", level: "A1", tense: "present_simple", person: "she", subject: "My sister", verb: "read", rest: "funny books", ru: "Моя сестра {} смешные книги", ruVerb: "читает", swap: true, ruSubject: "Моя сестра", ruVerbKey: "читать" },
  { id: "u-ps-9", level: "A1", tense: "present_simple", person: "it", subject: "It", verb: "rain", rest: "in autumn", ru: "Осенью {} дождь", ruVerb: "идёт" },
  { id: "u-ps-10", level: "A1", tense: "present_simple", person: "they", subject: "Cats", verb: "sleep", rest: "a lot", ru: "Кошки {} много", ruVerb: "спят" },
  { id: "u-ps-11", level: "A1", tense: "present_simple", person: "I", subject: "I", verb: "live", rest: "in a big house", ru: "Я {} в большом доме", ruVerb: "живу", swap: true, ruSubject: "Я", ruVerbKey: "жить" },
  { id: "u-ps-12", level: "A1", tense: "present_simple", person: "you", subject: "You", verb: "know", rest: "my name", ru: "Ты {} моё имя", ruVerb: "знаешь" },
  { id: "u-ps-13", level: "A1", tense: "present_simple", person: "we", subject: "We", verb: "watch", rest: "TV every evening", ru: "Мы {} телевизор каждый вечер", ruVerb: "смотрим", swap: true, ruSubject: "Мы", ruVerbKey: "смотреть" },
  { id: "u-ps-14", level: "A1", tense: "present_simple", person: "he", subject: "My brother", verb: "like", rest: "cold water", ru: "Мой брат {} холодную воду", ruVerb: "любит", swap: true, ruSubject: "Мой брат", ruVerbKey: "любить" },
  { id: "u-ps-15", level: "A1", tense: "present_simple", person: "she", subject: "My mother", verb: "cook", rest: "very good soup", ru: "Моя мама {} очень вкусный суп", ruVerb: "готовит", swap: true, ruSubject: "Моя мама", ruVerbKey: "готовить" },
  { id: "u-ps-16", level: "A1", tense: "present_simple", person: "they", subject: "Birds", verb: "fly", rest: "in the sky", ru: "Птицы {} в небе", ruVerb: "летают" },
  { id: "u-ps-17", level: "A1", tense: "present_simple", person: "I", subject: "I", verb: "go", rest: "to school", ru: "Я {} в школу", ruVerb: "хожу", swap: true, ruSubject: "Я", ruVerbKey: "ходить" },
  { id: "u-ps-18", level: "A1", tense: "present_simple", person: "it", subject: "The bus", verb: "come", rest: "at eight", ru: "Автобус {} в восемь", ruVerb: "приходит" },
  { id: "u-ps-19", level: "A1", tense: "present_simple", person: "we", subject: "We", verb: "study", rest: "English at school", ru: "Мы {} английский в школе", ruVerb: "учим", swap: true, ruSubject: "Мы", ruVerbKey: "учить" },
  { id: "u-ps-20", level: "A1", tense: "present_simple", person: "she", subject: "She", verb: "clean", rest: "{poss} room", ru: "Она {} свою комнату", ruVerb: "убирает", swap: true, ruSubject: "Она", ruVerbKey: "убирать" },

  // ── Present Continuous (A1) ───────────────────────────────────────────────
  { id: "u-pc-1", level: "A1", tense: "present_continuous", person: "it", subject: "The baby", verb: "sleep", rest: "now", ru: "Малыш сейчас {}", ruVerb: "спит" },
  { id: "u-pc-2", level: "A1", tense: "present_continuous", person: "I", subject: "I", verb: "read", rest: "a book now", ru: "Я сейчас {} книгу", ruVerb: "читаю", swap: true, ruSubject: "Я", ruVerbKey: "читать" },
  { id: "u-pc-3", level: "A1", tense: "present_continuous", person: "they", subject: "They", verb: "run", rest: "in the garden", ru: "Они {} в саду", ruVerb: "бегают", swap: true, ruSubject: "Они", ruVerbKey: "бегать" },
  { id: "u-pc-4", level: "A1", tense: "present_continuous", person: "she", subject: "She", verb: "write", rest: "a letter now", ru: "Она сейчас {} письмо", ruVerb: "пишет", swap: true, ruSubject: "Она", ruVerbKey: "писать" },
  { id: "u-pc-5", level: "A1", tense: "present_continuous", person: "they", subject: "The birds", verb: "sing", rest: "outside", ru: "Птицы {} на улице", ruVerb: "поют" },
  { id: "u-pc-6", level: "A1", tense: "present_continuous", person: "we", subject: "We", verb: "make", rest: "dinner now", ru: "Мы сейчас {} ужин", ruVerb: "готовим", swap: true, ruSubject: "Мы", ruVerbKey: "готовить" },
  { id: "u-pc-7", level: "A1", tense: "present_continuous", person: "he", subject: "My brother", verb: "clean", rest: "{poss} room", ru: "Мой брат {} свою комнату", ruVerb: "убирает", swap: true, ruSubject: "Мой брат", ruVerbKey: "убирать" },
  { id: "u-pc-8", level: "A1", tense: "present_continuous", person: "I", subject: "I", verb: "go", rest: "to school now", ru: "Я сейчас {} в школу", ruVerb: "иду", swap: true, ruSubject: "Я", ruVerbKey: "идти" },
  { id: "u-pc-9", level: "A1", tense: "present_continuous", person: "it", subject: "It", verb: "rain", rest: "now", ru: "Сейчас {} дождь", ruVerb: "идёт" },
  { id: "u-pc-10", level: "A1", tense: "present_continuous", person: "we", subject: "We", verb: "have", rest: "lunch now", ru: "Мы сейчас {}", ruVerb: "обедаем", swap: true, ruSubject: "Мы", ruVerbKey: "обедать" },
  { id: "u-pc-11", level: "A1", tense: "present_continuous", person: "he", subject: "He", verb: "play", rest: "football now", ru: "Он сейчас {} в футбол", ruVerb: "играет", swap: true, ruSubject: "Он", ruVerbKey: "играть" },
  { id: "u-pc-12", level: "A1", tense: "present_continuous", person: "they", subject: "They", verb: "watch", rest: "TV now", ru: "Они сейчас {} телевизор", ruVerb: "смотрят", swap: true, ruSubject: "Они", ruVerbKey: "смотреть" },
  { id: "u-pc-13", level: "A1", tense: "present_continuous", person: "I", subject: "I", verb: "do", rest: "{poss} homework now", ru: "Я сейчас {} домашнюю работу", ruVerb: "делаю", swap: true, ruSubject: "Я", ruVerbKey: "делать" },
  { id: "u-pc-14", level: "A1", tense: "present_continuous", person: "she", subject: "She", verb: "drink", rest: "coffee now", ru: "Она сейчас {} кофе", ruVerb: "пьёт", swap: true, ruSubject: "Она", ruVerbKey: "пить" },
  { id: "u-pc-15", level: "A1", tense: "present_continuous", person: "it", subject: "The dog", verb: "eat", rest: "now", ru: "Собака сейчас {}", ruVerb: "ест" },
  { id: "u-pc-16", level: "A1", tense: "present_continuous", person: "we", subject: "We", verb: "wait", rest: "for the bus", ru: "Мы {} автобус", ruVerb: "ждём", swap: true, ruSubject: "Мы", ruVerbKey: "ждать" },
  { id: "u-pc-17", level: "A1", tense: "present_continuous", person: "she", subject: "My mother", verb: "cook", rest: "in the kitchen", ru: "Моя мама {} на кухне", ruVerb: "готовит", swap: true, ruSubject: "Моя мама", ruVerbKey: "готовить" },
  { id: "u-pc-18", level: "A1", tense: "present_continuous", person: "they", subject: "The children", verb: "swim", rest: "in the pool", ru: "Дети {} в бассейне", ruVerb: "плавают" },
  { id: "u-pc-19", level: "A1", tense: "present_continuous", person: "I", subject: "I", verb: "learn", rest: "a new song", ru: "Я {} новую песню", ruVerb: "учу", swap: true, ruSubject: "Я", ruVerbKey: "учить" },
  { id: "u-pc-20", level: "A1", tense: "present_continuous", person: "you", subject: "You", verb: "speak", rest: "too fast now", ru: "Ты сейчас {} слишком быстро", ruVerb: "говоришь", swap: true, ruSubject: "Ты", ruVerbKey: "говорить" },

  // ── Past Simple (A2) ──────────────────────────────────────────────────────
  { id: "u-pst-1", level: "A2", tense: "past_simple", person: "we", subject: "We", verb: "go", rest: "to the cinema last night", ru: "Мы {} в кино вчера вечером", ruVerb: "ходили", swap: true, ruSubject: "Мы", ruVerbKey: "ходить" },
  { id: "u-pst-2", level: "A2", tense: "past_simple", person: "she", subject: "She", verb: "buy", rest: "a new dress yesterday", ru: "Она {} новое платье вчера", ruVerb: "купила", swap: true, ruSubject: "Она", ruVerbKey: "купить" },
  { id: "u-pst-3", level: "A2", tense: "past_simple", person: "I", subject: "I", verb: "play", rest: "football yesterday", ru: "Я {} в футбол вчера", ruVerb: "играл", swap: true, ruSubject: "Я", ruVerbKey: "играть" },
  { id: "u-pst-4", level: "A2", tense: "past_simple", person: "he", subject: "He", verb: "lose", rest: "{poss} keys last week", ru: "Он {} свои ключи на прошлой неделе", ruVerb: "потерял", swap: true, ruSubject: "Он", ruVerbKey: "потерять" },
  { id: "u-pst-5", level: "A2", tense: "past_simple", person: "they", subject: "They", verb: "live", rest: "in London last year", ru: "Они {} в Лондоне в прошлом году", ruVerb: "жили", swap: true, ruSubject: "Они", ruVerbKey: "жить" },
  { id: "u-pst-6", level: "A2", tense: "past_simple", person: "she", subject: "My mother", verb: "make", rest: "a cake yesterday", ru: "Моя мама {} торт вчера", ruVerb: "сделала", swap: true, ruSubject: "Моя мама", ruVerbKey: "сделать" },
  { id: "u-pst-7", level: "A2", tense: "past_simple", person: "we", subject: "We", verb: "meet", rest: "{poss} friends on Saturday", ru: "Мы {} наших друзей в субботу", ruVerb: "встретили", swap: true, ruSubject: "Мы", ruVerbKey: "встретить" },
  { id: "u-pst-8", level: "A2", tense: "past_simple", person: "I", subject: "I", verb: "read", rest: "that book last summer", ru: "Я {} ту книгу прошлым летом", ruVerb: "читал", swap: true, ruSubject: "Я", ruVerbKey: "читать" },
  { id: "u-pst-9", level: "A2", tense: "past_simple", person: "she", subject: "She", verb: "visit", rest: "{poss} grandmother on Sunday", ru: "Она {} бабушку в воскресенье", ruVerb: "навещала", swap: true, ruSubject: "Она", ruVerbKey: "навещать" },
  { id: "u-pst-10", level: "A2", tense: "past_simple", person: "we", subject: "We", verb: "eat", rest: "a big pizza yesterday", ru: "Мы {} большую пиццу вчера", ruVerb: "съели", swap: true, ruSubject: "Мы", ruVerbKey: "съесть" },
  { id: "u-pst-11", level: "A2", tense: "past_simple", person: "he", subject: "He", verb: "open", rest: "the window an hour ago", ru: "Он {} окно час назад", ruVerb: "открыл", swap: true, ruSubject: "Он", ruVerbKey: "открыть" },
  { id: "u-pst-12", level: "A2", tense: "past_simple", person: "they", subject: "They", verb: "come", rest: "home very late", ru: "Они {} домой очень поздно", ruVerb: "пришли", swap: true, ruSubject: "Они", ruVerbKey: "прийти" },
  { id: "u-pst-13", level: "A2", tense: "past_simple", person: "I", subject: "I", verb: "help", rest: "{poss} grandfather last summer", ru: "Я {} дедушке прошлым летом", ruVerb: "помогал", swap: true, ruSubject: "Я", ruVerbKey: "помогать" },
  { id: "u-pst-14", level: "A2", tense: "past_simple", person: "it", subject: "The film", verb: "start", rest: "at eight yesterday", ru: "Фильм {} в восемь вчера", ruVerb: "начался" },
  { id: "u-pst-15", level: "A2", tense: "past_simple", person: "she", subject: "She", verb: "sing", rest: "a beautiful song", ru: "Она {} красивую песню", ruVerb: "спела", swap: true, ruSubject: "Она", ruVerbKey: "спеть" },
  { id: "u-pst-16", level: "A2", tense: "past_simple", person: "we", subject: "We", verb: "swim", rest: "in the sea last July", ru: "Мы {} в море в прошлом июле", ruVerb: "плавали", swap: true, ruSubject: "Мы", ruVerbKey: "плавать" },
  { id: "u-pst-17", level: "A2", tense: "past_simple", person: "he", subject: "My brother", verb: "break", rest: "{poss} bike last week", ru: "Мой брат {} велосипед на прошлой неделе", ruVerb: "сломал", swap: true, ruSubject: "Мой брат", ruVerbKey: "сломать" },
  { id: "u-pst-18", level: "A2", tense: "past_simple", person: "I", subject: "I", verb: "call", rest: "you yesterday", ru: "Я {} тебе вчера", ruVerb: "звонил" },
  { id: "u-pst-19", level: "A2", tense: "past_simple", person: "they", subject: "They", verb: "buy", rest: "a new flat in May", ru: "Они {} новую квартиру в мае", ruVerb: "купили", swap: true, ruSubject: "Они", ruVerbKey: "купить" },
  { id: "u-pst-20", level: "A2", tense: "past_simple", person: "she", subject: "She", verb: "write", rest: "me a long letter", ru: "Она {} мне длинное письмо", ruVerb: "написала" },

  // ── Past Continuous (A2) ──────────────────────────────────────────────────
  { id: "u-pcn-1", level: "A2", tense: "past_continuous", person: "I", subject: "I", verb: "sleep", rest: "at ten yesterday", ru: "Я {} в десять вчера", ruVerb: "спал", swap: true, ruSubject: "Я", ruVerbKey: "спать" },
  { id: "u-pcn-2", level: "A2", tense: "past_continuous", person: "they", subject: "They", verb: "play", rest: "football at five", ru: "Они {} в футбол в пять", ruVerb: "играли", swap: true, ruSubject: "Они", ruVerbKey: "играть" },
  { id: "u-pcn-3", level: "A2", tense: "past_continuous", person: "she", subject: "She", verb: "cook", rest: "dinner at that moment", ru: "Она {} ужин в тот момент", ruVerb: "готовила", swap: true, ruSubject: "Она", ruVerbKey: "готовить" },
  { id: "u-pcn-4", level: "A2", tense: "past_continuous", person: "we", subject: "We", verb: "walk", rest: "home in the rain", ru: "Мы {} домой под дождём", ruVerb: "шли", swap: true, ruSubject: "Мы", ruVerbKey: "идти" },
  { id: "u-pcn-5", level: "A2", tense: "past_continuous", person: "it", subject: "The sun", verb: "shine", rest: "all day yesterday", ru: "Солнце {} весь день вчера", ruVerb: "светило" },
  { id: "u-pcn-6", level: "A2", tense: "past_continuous", person: "he", subject: "He", verb: "read", rest: "a book at that moment", ru: "Он {} книгу в тот момент", ruVerb: "читал", swap: true, ruSubject: "Он", ruVerbKey: "читать" },
  { id: "u-pcn-7", level: "A2", tense: "past_continuous", person: "we", subject: "We", verb: "have", rest: "dinner at eight", ru: "Мы {} в восемь", ruVerb: "ужинали", swap: true, ruSubject: "Мы", ruVerbKey: "ужинать" },
  { id: "u-pcn-8", level: "A2", tense: "past_continuous", person: "she", subject: "She", verb: "listen", rest: "to music all evening", ru: "Она {} музыку весь вечер", ruVerb: "слушала", swap: true, ruSubject: "Она", ruVerbKey: "слушать" },
  { id: "u-pcn-9", level: "A2", tense: "past_continuous", person: "they", subject: "They", verb: "watch", rest: "TV at nine", ru: "Они {} телевизор в девять", ruVerb: "смотрели", swap: true, ruSubject: "Они", ruVerbKey: "смотреть" },
  { id: "u-pcn-10", level: "A2", tense: "past_continuous", person: "I", subject: "I", verb: "do", rest: "{poss} homework at six", ru: "Я {} домашнюю работу в шесть", ruVerb: "делал", swap: true, ruSubject: "Я", ruVerbKey: "делать" },
  { id: "u-pcn-11", level: "A2", tense: "past_continuous", person: "they", subject: "The children", verb: "play", rest: "in the yard", ru: "Дети {} во дворе", ruVerb: "играли" },
  { id: "u-pcn-12", level: "A2", tense: "past_continuous", person: "he", subject: "He", verb: "write", rest: "a letter all morning", ru: "Он {} письмо всё утро", ruVerb: "писал", swap: true, ruSubject: "Он", ruVerbKey: "писать" },
  { id: "u-pcn-13", level: "A2", tense: "past_continuous", person: "you", subject: "You", verb: "sleep", rest: "at that moment", ru: "Ты {} в тот момент", ruVerb: "спал", swap: true, ruSubject: "Ты", ruVerbKey: "спать" },
  { id: "u-pcn-14", level: "A2", tense: "past_continuous", person: "he", subject: "My father", verb: "wash", rest: "the car yesterday", ru: "Мой папа {} машину вчера", ruVerb: "мыл", swap: true, ruSubject: "Мой папа", ruVerbKey: "мыть" },
  { id: "u-pcn-15", level: "A2", tense: "past_continuous", person: "it", subject: "It", verb: "rain", rest: "all day yesterday", ru: "Дождь {} весь день вчера", ruVerb: "шёл" },
  { id: "u-pcn-16", level: "A2", tense: "past_continuous", person: "we", subject: "We", verb: "talk", rest: "about you yesterday", ru: "Мы {} о тебе вчера", ruVerb: "говорили" },
  { id: "u-pcn-17", level: "A2", tense: "past_continuous", person: "he", subject: "He", verb: "ride", rest: "a bike at that moment", ru: "Он {} на велосипеде в тот момент", ruVerb: "ехал", swap: true, ruSubject: "Он", ruVerbKey: "ехать" },
  { id: "u-pcn-18", level: "A2", tense: "past_continuous", person: "they", subject: "The birds", verb: "sing", rest: "outside my window", ru: "Птицы {} за моим окном", ruVerb: "пели" },
  { id: "u-pcn-19", level: "A2", tense: "past_continuous", person: "she", subject: "She", verb: "wait", rest: "for me near the shop", ru: "Она {} меня возле магазина", ruVerb: "ждала" },
  { id: "u-pcn-20", level: "A2", tense: "past_continuous", person: "I", subject: "I", verb: "watch", rest: "a film at nine", ru: "Я {} фильм в девять", ruVerb: "смотрел", swap: true, ruSubject: "Я", ruVerbKey: "смотреть" },

  // ── Future Simple (A2) ────────────────────────────────────────────────────
  { id: "u-fs-1", level: "A2", tense: "future_simple", person: "I", subject: "I", verb: "call", rest: "you tomorrow", ru: "Я {} тебе завтра", ruVerb: "позвоню" },
  { id: "u-fs-2", level: "A2", tense: "future_simple", person: "she", subject: "She", verb: "know", rest: "the answer soon", ru: "Она скоро {} ответ", ruVerb: "узнает", swap: true, ruSubject: "Она", ruVerbKey: "узнать" },
  { id: "u-fs-3", level: "A2", tense: "future_simple", person: "we", subject: "We", verb: "go", rest: "to the sea next summer", ru: "Мы {} на море следующим летом", ruVerb: "поедем", swap: true, ruSubject: "Мы", ruVerbKey: "поехать" },
  { id: "u-fs-4", level: "A2", tense: "future_simple", person: "he", subject: "He", verb: "help", rest: "me with my homework", ru: "Он {} мне с домашней работой", ruVerb: "поможет" },
  { id: "u-fs-5", level: "A2", tense: "future_simple", person: "they", subject: "They", verb: "buy", rest: "a new house next year", ru: "Они {} новый дом в следующем году", ruVerb: "купят", swap: true, ruSubject: "Они", ruVerbKey: "купить" },
  { id: "u-fs-6", level: "A2", tense: "future_simple", person: "we", subject: "We", verb: "meet", rest: "at the station tomorrow", ru: "Мы {} на вокзале завтра", ruVerb: "встретимся" },
  { id: "u-fs-7", level: "A2", tense: "future_simple", person: "she", subject: "She", verb: "pass", rest: "the exam next week", ru: "Она {} экзамен на следующей неделе", ruVerb: "сдаст", swap: true, ruSubject: "Она", ruVerbKey: "сдать" },
  { id: "u-fs-8", level: "A2", tense: "future_simple", person: "I", subject: "I", verb: "tell", rest: "you the truth later", ru: "Я {} тебе правду позже", ruVerb: "скажу" },
  { id: "u-fs-9", level: "A2", tense: "future_simple", person: "they", subject: "They", verb: "build", rest: "a new school here", ru: "Они {} здесь новую школу", ruVerb: "построят", swap: true, ruSubject: "Они", ruVerbKey: "построить" },
  { id: "u-fs-10", level: "A2", tense: "future_simple", person: "he", subject: "He", verb: "be", rest: "sixteen next year", ru: "Ему {} шестнадцать в следующем году", ruVerb: "будет" },
  { id: "u-fs-11", level: "A2", tense: "future_simple", person: "she", subject: "She", verb: "come", rest: "soon", ru: "Она скоро {}", ruVerb: "придёт", swap: true, ruSubject: "Она", ruVerbKey: "прийти" },
  { id: "u-fs-12", level: "A2", tense: "future_simple", person: "we", subject: "We", verb: "watch", rest: "this film tomorrow", ru: "Мы {} этот фильм завтра", ruVerb: "посмотрим", swap: true, ruSubject: "Мы", ruVerbKey: "посмотреть" },
  { id: "u-fs-13", level: "A2", tense: "future_simple", person: "I", subject: "I", verb: "clean", rest: "{poss} room after lunch", ru: "Я {} свою комнату после обеда", ruVerb: "уберу", swap: true, ruSubject: "Я", ruVerbKey: "убрать" },
  { id: "u-fs-14", level: "A2", tense: "future_simple", person: "it", subject: "The train", verb: "leave", rest: "in ten minutes", ru: "Поезд {} через десять минут", ruVerb: "отправится" },
  { id: "u-fs-15", level: "A2", tense: "future_simple", person: "you", subject: "You", verb: "like", rest: "this book", ru: "Тебе {} эта книга", ruVerb: "понравится" },
  { id: "u-fs-16", level: "A2", tense: "future_simple", person: "they", subject: "They", verb: "visit", rest: "us next summer", ru: "Они {} нас следующим летом", ruVerb: "навестят" },
  { id: "u-fs-17", level: "A2", tense: "future_simple", person: "I", subject: "I", verb: "send", rest: "this letter tomorrow", ru: "Я {} это письмо завтра", ruVerb: "отправлю", swap: true, ruSubject: "Я", ruVerbKey: "отправить" },
  { id: "u-fs-18", level: "A2", tense: "future_simple", person: "he", subject: "He", verb: "do", rest: "{poss} homework in the evening", ru: "Он {} домашнюю работу вечером", ruVerb: "сделает", swap: true, ruSubject: "Он", ruVerbKey: "сделать" },
  { id: "u-fs-19", level: "A2", tense: "future_simple", person: "she", subject: "She", verb: "stay", rest: "at home tomorrow", ru: "Она {} дома завтра", ruVerb: "останется", swap: true, ruSubject: "Она", ruVerbKey: "остаться" },
  { id: "u-fs-20", level: "A2", tense: "future_simple", person: "it", subject: "Our team", verb: "win", rest: "the next match", ru: "Наша команда {} следующий матч", ruVerb: "выиграет" },

  // ── Present Perfect (B1) ──────────────────────────────────────────────────
  // Единственное место, где нужен свой хвост для отрицания: already живёт в
  // утверждении, а в отрицании и вопросе на его месте стоит yet.
  //
  // И единственное, где русское время расходится с английским: с since и for
  // перфект переводится настоящим («Мы живём здесь с 2015 года»), поэтому у
  // таких заготовок стоит ruTense.
  { id: "u-pp-1", level: "B1", tense: "present_perfect", person: "I", subject: "I", verb: "finish", rest: "{poss} homework already", ru: "Я уже {} домашнюю работу", ruVerb: "закончил", restNeg: "{poss} homework yet", ruNeg: "Я ещё {} домашнюю работу", swap: true, ruSubject: "Я", ruVerbKey: "закончить" },
  { id: "u-pp-2", level: "B1", tense: "present_perfect", person: "she", subject: "She", verb: "read", rest: "this book", ru: "Она {} эту книгу", ruVerb: "читала", swap: true, ruSubject: "Она", ruVerbKey: "читать" },
  { id: "u-pp-3", level: "B1", tense: "present_perfect", person: "we", subject: "We", verb: "live", rest: "here since 2015", ru: "Мы {} здесь с 2015 года", ruVerb: "живём", swap: true, ruSubject: "Мы", ruVerbKey: "жить", ruTense: "present" },
  { id: "u-pp-4", level: "B1", tense: "present_perfect", person: "he", subject: "He", verb: "lose", rest: "{poss} passport", ru: "Он {} свой паспорт", ruVerb: "потерял", swap: true, ruSubject: "Он", ruVerbKey: "потерять" },
  { id: "u-pp-5", level: "B1", tense: "present_perfect", person: "they", subject: "They", verb: "be", rest: "to Japan", ru: "Они {} в Японии", ruVerb: "были", swap: true, ruSubject: "Они", ruVerbKey: "быть" },
  { id: "u-pp-6", level: "B1", tense: "present_perfect", person: "I", subject: "I", verb: "hear", rest: "the news already", ru: "Я уже {} эту новость", ruVerb: "слышал", restNeg: "the news yet", ruNeg: "Я ещё {} эту новость", swap: true, ruSubject: "Я", ruVerbKey: "слышать" },
  { id: "u-pp-7", level: "B1", tense: "present_perfect", person: "we", subject: "We", verb: "do", rest: "{poss} homework already", ru: "Мы уже {} домашнюю работу", ruVerb: "сделали", restNeg: "{poss} homework yet", ruNeg: "Мы ещё {} домашнюю работу", swap: true, ruSubject: "Мы", ruVerbKey: "сделать" },
  { id: "u-pp-8", level: "B1", tense: "present_perfect", person: "he", subject: "He", verb: "study", rest: "here since 2020", ru: "Он {} здесь с 2020 года", ruVerb: "учится", swap: true, ruSubject: "Он", ruVerbKey: "учиться", ruTense: "present" },
  { id: "u-pp-9", level: "B1", tense: "present_perfect", person: "I", subject: "I", verb: "clean", rest: "{poss} room today", ru: "Я {} свою комнату сегодня", ruVerb: "убрал", swap: true, ruSubject: "Я", ruVerbKey: "убрать" },
  { id: "u-pp-10", level: "B1", tense: "present_perfect", person: "she", subject: "She", verb: "ride", rest: "a horse before", ru: "Она {} на лошади раньше", ruVerb: "каталась", swap: true, ruSubject: "Она", ruVerbKey: "кататься" },
  { id: "u-pp-11", level: "B1", tense: "present_perfect", person: "we", subject: "We", verb: "know", rest: "each other well", ru: "Мы {} друг друга хорошо", ruVerb: "знаем" },
  { id: "u-pp-12", level: "B1", tense: "present_perfect", person: "it", subject: "The rain", verb: "stop", rest: "already", ru: "Дождь уже {}", ruVerb: "прекратился", restNeg: "yet", ruNeg: "Дождь ещё {}" },
  { id: "u-pp-13", level: "B1", tense: "present_perfect", person: "he", subject: "He", verb: "leave", rest: "{poss} phone at home", ru: "Он {} свой телефон дома", ruVerb: "оставил", swap: true, ruSubject: "Он", ruVerbKey: "оставить" },
  { id: "u-pp-14", level: "B1", tense: "present_perfect", person: "you", subject: "You", verb: "make", rest: "mistakes today", ru: "Ты {} ошибки сегодня", ruVerb: "сделал", swap: true, ruSubject: "Ты", ruVerbKey: "сделать" },
  { id: "u-pp-15", level: "B1", tense: "present_perfect", person: "I", subject: "I", verb: "see", rest: "this word before", ru: "Я {} это слово раньше", ruVerb: "видел", swap: true, ruSubject: "Я", ruVerbKey: "видеть" },
  { id: "u-pp-16", level: "B1", tense: "present_perfect", person: "she", subject: "She", verb: "work", rest: "in Moscow since April", ru: "Она {} в Москве с апреля", ruVerb: "работает", swap: true, ruSubject: "Она", ruVerbKey: "работать", ruTense: "present" },
  { id: "u-pp-17", level: "B1", tense: "present_perfect", person: "we", subject: "We", verb: "sell", rest: "all the tickets already", ru: "Мы уже {} все билеты", ruVerb: "продали", restNeg: "all the tickets yet", ruNeg: "Мы ещё {} все билеты", swap: true, ruSubject: "Мы", ruVerbKey: "продать" },
  { id: "u-pp-18", level: "B1", tense: "present_perfect", person: "he", subject: "He", verb: "write", rest: "to me this week", ru: "Он {} мне на этой неделе", ruVerb: "написал" },
  { id: "u-pp-19", level: "B1", tense: "present_perfect", person: "they", subject: "They", verb: "build", rest: "the new bridge already", ru: "Они уже {} новый мост", ruVerb: "построили", restNeg: "the new bridge yet", ruNeg: "Они ещё {} новый мост", swap: true, ruSubject: "Они", ruVerbKey: "построить" },
  { id: "u-pp-20", level: "B1", tense: "present_perfect", person: "I", subject: "I", verb: "eat", rest: "{poss} breakfast already", ru: "Я уже {} свой завтрак", ruVerb: "съел", restNeg: "{poss} breakfast yet", ruNeg: "Я ещё {} свой завтрак", swap: true, ruSubject: "Я", ruVerbKey: "съесть" },
];
