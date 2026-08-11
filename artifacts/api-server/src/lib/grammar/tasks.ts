// ─────────────────────────────────────────────────────────────────────────────
// Банки заданий раздела «Составлять»: написанные руками плюс сгенерированные.
//
// Виды заданий, все на одном движке (см. engine.ts):
//   forms    — сама форма неправильного глагола (см. forms.ts, банк вычисляется);
//   verbGap  — вставить нужную форму неправильного глагола в предложение;
//   tenseGap — поставить глагол в заданное время (банк в tenseTasks.ts);
//   assemble — собрать предложение по русскому переводу.
//
// ── Две половины банка ──────────────────────────────────────────────────────
// Написанное руками идёт первым: эти задания вычитаны, и в них ровно тот смысл,
// который задумывался. Сгенерированное (см. generate.ts) добавляется следом:
// одна заготовка предложения даёт утверждение, отрицание, вопрос и сборку, и
// именно это позволило вырастить банк в разы, не занимаясь переписыванием одной
// и той же механики руками.
//
// Номера сгенерированных заданий начинаются с «g-», поэтому пересечься с
// ручными они не могут — и это проверяется тестом на уникальность номеров.
//
// ── Объём: не меньше двух полных заходов ────────────────────────────────────
// Первая версия банка была маленькой: 28 предложений в сборке на все уровни,
// то есть ученику A2 доступно 18 при заходе в 12. Второй день подряд он собирал
// те же самые фразы. Ротация (см. rotateBatch в engine.ts) этого не лечит: из
// восемнадцати нельзя набрать два непересекающихся десятка.
//
// Поэтому объём — тоже правило, и оно проверяется тестом.
//
// ── Соответствие уровню ─────────────────────────────────────────────────────
// Правила и лимиты живут в core.ts, здесь только данные. Каждое правило
// проверяется тестом, а не обещанием в комментарии:
//
//   1. ГОТОВАЯ фраза не длиннее лимита уровня (MAX_WORDS). Считается именно
//      готовая, с подставленным ответом: в отрицании на месте одного слова
//      встают три («does not watch»), и фраза с пропуском о своей длине врёт;
//   2. глагол задания не выше уровня задания;
//   3. время задания не выше уровня задания;
//   4. в задании РОВНО ОДИН пропуск.
//
// ── Почему у verbGap нет поля с ответом ─────────────────────────────────────
// Ответ вычисляется из таблицы форм по базовому глаголу. Если продублировать
// его здесь, рано или поздно таблица и задания разойдутся — и ученик получит
// «неверно» на верном ответе. Один источник правды на все формы.
// ─────────────────────────────────────────────────────────────────────────────

import { GAP, type AssembleTask, type VerbGapTask } from "./core";
import { generateAssembleTasks, generateVerbGapTasks } from "./generate";

// Типы и правила живут в core.ts (иначе генератор и банки ссылались бы друг на
// друга по кругу), но импортируют их отсюда — так сложилось исторически, и
// ломать половину импортов ради переезда незачем.
export {
  GAP,
  MAX_WORDS,
  PARTICIPLE_FROM,
  type AssembleTask,
  type TenseGapTask,
  type VerbForm,
  type VerbGapTask,
} from "./core";

// ── Неправильные глаголы: написанное руками ─────────────────────────────────

const HAND_VERB_GAP_TASKS: VerbGapTask[] = [
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

  // B1
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

// ── Сборка предложений: написанное руками ───────────────────────────────────
// Лишние слова (extra) — не «побольше плиток», а именно те формы, которые
// ученик перепутает: goes рядом с go, was рядом с is. Случайное лишнее слово
// отбрасывается по смыслу и ничему не учит.

const HAND_ASSEMBLE_TASKS: AssembleTask[] = [
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

// ── Итоговые банки ──────────────────────────────────────────────────────────
// Ручное впереди: если банк вдруг окажется меньше захода, ученик увидит
// вычитанные задания, а не сгенерированные.

export const VERB_GAP_TASKS: VerbGapTask[] = [
  ...HAND_VERB_GAP_TASKS,
  ...generateVerbGapTasks(),
];

export const ASSEMBLE_TASKS: AssembleTask[] = [
  ...HAND_ASSEMBLE_TASKS,
  ...generateAssembleTasks(),
];
