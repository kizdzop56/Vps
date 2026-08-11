// ─────────────────────────────────────────────────────────────────────────────
// Банк заданий на времена: утверждение, отрицание, вопрос.
//
// ── Почему видов три ────────────────────────────────────────────────────────
// Сначала здесь были только утвердительные предложения. Это ровно один случай из
// трёх, причём самый простой: в утверждении смысловой глагол и несёт время. Вся
// трудность английских времён — в двух остальных.
//
// В отрицании и вопросе появляется ВСПОМОГАТЕЛЬНЫЙ глагол, и время переезжает на
// него, а смысловой возвращается в первую форму: I went, но I did not go и did
// you go. «Did you went» — самая частая школьная ошибка, и при банке из одних
// утверждений её негде было даже совершить, не то что разобрать.
//
// ── Поровну, а не «немного добавим» ─────────────────────────────────────────
// По 12 заданий каждого вида на время. Состав именно такой, чтобы в заход из
// двенадцати заданий попадали все три вида: при перекосе 24/6/6 вопросы
// выпадали бы через раз, и раздел снова выглядел бы «только утвердительным».
//
// ── Вопросы двух видов, и оба нужны ─────────────────────────────────────────
//   «___ he like milk?»      — выбрать вспомогательный (do/does/did/is/will/has);
//   «Does he ___ milk?»      — поставить смысловой глагол в первую форму.
// Первое проверяет согласование с подлежащим и временем, второе — то самое
// правило, на котором школьник спотыкается. Оставить только первый вид значило
// бы не проверить главное.
//
// ── Как ученик понимает, утверждение это или отрицание ──────────────────────
// По РУССКОМУ ПЕРЕВОДУ: он стоит под заданием и говорит прямо — «Он не любит
// молоко». Без перевода фраза «He ___ milk» допускала бы и «likes», и «does not
// like», то есть задание было бы нерешаемым. Плюс вид предложения назван в
// подсказке над карточкой.
//
// ── Правила банка ───────────────────────────────────────────────────────────
// Те же, что и у остальных банков (см. tasks.ts), и проверяются тестами:
// один пропуск на задание, длина ГОТОВОЙ фразы в пределах уровня, время не выше
// уровня задания. Длина считается по готовой фразе именно из-за этого файла:
// «does not watch» занимает три слова там, где в утверждении стояло одно.
//
// ── Сокращения ──────────────────────────────────────────────────────────────
// Полная форма идёт первой (её показываем как эталон), сокращённая принимается
// наравне: «does not like» и «doesn't like» — один ответ. Спорить с ребёнком,
// который написал живую форму, незачем.
// ─────────────────────────────────────────────────────────────────────────────

import { GAP, type TenseGapTask } from "./tasks";

export const TENSE_GAP_TASKS: TenseGapTask[] = [
  // ── Present Simple (A1) ───────────────────────────────────────────────────
  // Утверждение
  { id: "ps-1", level: "A1", tense: "present_simple", form: "affirmative", text: `He ${GAP} to bed at ten.`, base: "go", accept: ["goes"], ru: "Он ложится спать в десять." },
  { id: "ps-2", level: "A1", tense: "present_simple", form: "affirmative", text: `I ${GAP} tea every morning.`, base: "drink", accept: ["drink"], ru: "Я пью чай каждое утро." },
  { id: "ps-3", level: "A1", tense: "present_simple", form: "affirmative", text: `She ${GAP} her homework after school.`, base: "do", accept: ["does"], ru: "Она делает домашнюю работу после школы." },
  { id: "ps-4", level: "A1", tense: "present_simple", form: "affirmative", text: `My friends ${GAP} football on Sundays.`, base: "play", accept: ["play"], ru: "Мои друзья играют в футбол по воскресеньям." },
  { id: "ps-5", level: "A1", tense: "present_simple", form: "affirmative", text: `The shop ${GAP} at nine every day.`, base: "open", accept: ["opens"], ru: "Магазин открывается в девять каждый день." },
  { id: "ps-6", level: "A1", tense: "present_simple", form: "affirmative", text: `My cat ${GAP} milk very much.`, base: "like", accept: ["likes"], ru: "Моя кошка очень любит молоко." },
  { id: "ps-7", level: "A1", tense: "present_simple", form: "affirmative", text: `We usually ${GAP} at home.`, base: "eat", accept: ["eat"], ru: "Мы обычно едим дома." },
  { id: "ps-8", level: "A1", tense: "present_simple", form: "affirmative", text: `She never ${GAP} to music.`, base: "listen", accept: ["listens"], ru: "Она никогда не слушает музыку." },
  { id: "ps-9", level: "A1", tense: "present_simple", form: "affirmative", text: `We ${GAP} English at school.`, base: "study", accept: ["study"], ru: "Мы учим английский в школе." },
  { id: "ps-10", level: "A1", tense: "present_simple", form: "affirmative", text: `My mother ${GAP} very good soup.`, base: "cook", accept: ["cooks"], ru: "Моя мама готовит очень вкусный суп." },
  { id: "ps-11", level: "A1", tense: "present_simple", form: "affirmative", text: `The bus ${GAP} at eight.`, base: "come", accept: ["comes"], ru: "Автобус приходит в восемь." },
  { id: "ps-12", level: "A1", tense: "present_simple", form: "affirmative", text: `Cats ${GAP} a lot.`, base: "sleep", accept: ["sleep"], ru: "Кошки много спят." },
  // Отрицание
  { id: "ps-n1", level: "A1", tense: "present_simple", form: "negative", text: `He ${GAP} milk.`, base: "like", accept: ["does not like", "doesn't like"], ru: "Он не любит молоко." },
  { id: "ps-n2", level: "A1", tense: "present_simple", form: "negative", text: `I ${GAP} coffee.`, base: "drink", accept: ["do not drink", "don't drink"], ru: "Я не пью кофе." },
  { id: "ps-n3", level: "A1", tense: "present_simple", form: "negative", text: `She ${GAP} TV in the morning.`, base: "watch", accept: ["does not watch", "doesn't watch"], ru: "Она не смотрит телевизор утром." },
  { id: "ps-n4", level: "A1", tense: "present_simple", form: "negative", text: `We ${GAP} on Sundays.`, base: "work", accept: ["do not work", "don't work"], ru: "Мы не работаем по воскресеньям." },
  { id: "ps-n5", level: "A1", tense: "present_simple", form: "negative", text: `My brother ${GAP} football.`, base: "play", accept: ["does not play", "doesn't play"], ru: "Мой брат не играет в футбол." },
  { id: "ps-n6", level: "A1", tense: "present_simple", form: "negative", text: `They ${GAP} near the school.`, base: "live", accept: ["do not live", "don't live"], ru: "Они не живут рядом со школой." },
  { id: "ps-n7", level: "A1", tense: "present_simple", form: "negative", text: `It ${GAP} here in summer.`, base: "rain", accept: ["does not rain", "doesn't rain"], ru: "Летом здесь не идёт дождь." },
  { id: "ps-n8", level: "A1", tense: "present_simple", form: "negative", text: `I ${GAP} this song.`, base: "know", accept: ["do not know", "don't know"], ru: "Я не знаю эту песню." },
  { id: "ps-n9", level: "A1", tense: "present_simple", form: "negative", text: `My sister ${GAP} at school.`, base: "study", accept: ["does not study", "doesn't study"], ru: "Моя сестра не учится в школе." },
  { id: "ps-n10", level: "A1", tense: "present_simple", form: "negative", text: `You ${GAP} your room.`, base: "clean", accept: ["do not clean", "don't clean"], ru: "Ты не убираешь свою комнату." },
  { id: "ps-n11", level: "A1", tense: "present_simple", form: "negative", text: `The shop ${GAP} on Monday.`, base: "open", accept: ["does not open", "doesn't open"], ru: "Магазин не открывается в понедельник." },
  { id: "ps-n12", level: "A1", tense: "present_simple", form: "negative", text: `We ${GAP} meat.`, base: "eat", accept: ["do not eat", "don't eat"], ru: "Мы не едим мясо." },
  // Вопрос
  { id: "ps-q1", level: "A1", tense: "present_simple", form: "question", text: `${GAP} he like milk?`, base: "like", accept: ["Does"], ru: "Он любит молоко?" },
  { id: "ps-q2", level: "A1", tense: "present_simple", form: "question", text: `${GAP} you drink tea?`, base: "drink", accept: ["Do"], ru: "Ты пьёшь чай?" },
  { id: "ps-q3", level: "A1", tense: "present_simple", form: "question", text: `Does she ${GAP} English?`, base: "speak", accept: ["speak"], ru: "Она говорит по-английски?" },
  { id: "ps-q4", level: "A1", tense: "present_simple", form: "question", text: `Do they ${GAP} football?`, base: "play", accept: ["play"], ru: "Они играют в футбол?" },
  { id: "ps-q5", level: "A1", tense: "present_simple", form: "question", text: `${GAP} your father work here?`, base: "work", accept: ["Does"], ru: "Твой папа работает здесь?" },
  { id: "ps-q6", level: "A1", tense: "present_simple", form: "question", text: `Where ${GAP} you live?`, base: "live", accept: ["do"], ru: "Где ты живёшь?" },
  { id: "ps-q7", level: "A1", tense: "present_simple", form: "question", text: `What ${GAP} she do after school?`, base: "do", accept: ["does"], ru: "Что она делает после школы?" },
  { id: "ps-q8", level: "A1", tense: "present_simple", form: "question", text: `${GAP} we need this book?`, base: "need", accept: ["Do"], ru: "Нам нужна эта книга?" },
  { id: "ps-q9", level: "A1", tense: "present_simple", form: "question", text: `Does your brother ${GAP} TV?`, base: "watch", accept: ["watch"], ru: "Твой брат смотрит телевизор?" },
  { id: "ps-q10", level: "A1", tense: "present_simple", form: "question", text: `${GAP} the shop open at nine?`, base: "open", accept: ["Does"], ru: "Магазин открывается в девять?" },
  { id: "ps-q11", level: "A1", tense: "present_simple", form: "question", text: `Do you ${GAP} my name?`, base: "know", accept: ["know"], ru: "Ты знаешь моё имя?" },
  { id: "ps-q12", level: "A1", tense: "present_simple", form: "question", text: `When ${GAP} the bus come?`, base: "come", accept: ["does"], ru: "Когда приходит автобус?" },

  // ── Present Continuous (A1) ───────────────────────────────────────────────
  // Утверждение
  { id: "pc-1", level: "A1", tense: "present_continuous", form: "affirmative", text: `Look! The baby ${GAP}.`, base: "sleep", accept: ["is sleeping"], ru: "Смотри! Малыш спит." },
  { id: "pc-2", level: "A1", tense: "present_continuous", form: "affirmative", text: `I ${GAP} a book right now.`, base: "read", accept: ["am reading", "'m reading"], ru: "Я читаю книгу прямо сейчас." },
  { id: "pc-3", level: "A1", tense: "present_continuous", form: "affirmative", text: `They ${GAP} in the garden now.`, base: "run", accept: ["are running"], ru: "Они бегают в саду сейчас." },
  { id: "pc-4", level: "A1", tense: "present_continuous", form: "affirmative", text: `She ${GAP} a letter at the moment.`, base: "write", accept: ["is writing"], ru: "Она пишет письмо в данный момент." },
  { id: "pc-5", level: "A1", tense: "present_continuous", form: "affirmative", text: `Listen! The birds ${GAP}.`, base: "sing", accept: ["are singing"], ru: "Слушай! Птицы поют." },
  { id: "pc-6", level: "A1", tense: "present_continuous", form: "affirmative", text: `We ${GAP} dinner now.`, base: "make", accept: ["are making"], ru: "Мы готовим ужин сейчас." },
  { id: "pc-7", level: "A1", tense: "present_continuous", form: "affirmative", text: `My brother ${GAP} his room today.`, base: "clean", accept: ["is cleaning"], ru: "Мой брат убирает свою комнату сегодня." },
  { id: "pc-8", level: "A1", tense: "present_continuous", form: "affirmative", text: `I ${GAP} to school right now.`, base: "go", accept: ["am going", "'m going"], ru: "Я иду в школу прямо сейчас." },
  { id: "pc-9", level: "A1", tense: "present_continuous", form: "affirmative", text: `Look! It ${GAP} outside.`, base: "rain", accept: ["is raining"], ru: "Смотри! На улице идёт дождь." },
  { id: "pc-10", level: "A1", tense: "present_continuous", form: "affirmative", text: `We ${GAP} lunch right now.`, base: "have", accept: ["are having"], ru: "Мы обедаем прямо сейчас." },
  { id: "pc-11", level: "A1", tense: "present_continuous", form: "affirmative", text: `He ${GAP} football in the yard.`, base: "play", accept: ["is playing"], ru: "Он играет в футбол во дворе." },
  { id: "pc-12", level: "A1", tense: "present_continuous", form: "affirmative", text: `They ${GAP} TV at the moment.`, base: "watch", accept: ["are watching"], ru: "Они смотрят телевизор в данный момент." },
  // Отрицание
  { id: "pc-n1", level: "A1", tense: "present_continuous", form: "negative", text: `She ${GAP} now.`, base: "sleep", accept: ["is not sleeping", "isn't sleeping"], ru: "Она сейчас не спит." },
  { id: "pc-n2", level: "A1", tense: "present_continuous", form: "negative", text: `I ${GAP} now.`, base: "work", accept: ["am not working", "'m not working"], ru: "Я сейчас не работаю." },
  { id: "pc-n3", level: "A1", tense: "present_continuous", form: "negative", text: `They ${GAP} football now.`, base: "play", accept: ["are not playing", "aren't playing"], ru: "Они сейчас не играют в футбол." },
  { id: "pc-n4", level: "A1", tense: "present_continuous", form: "negative", text: `He ${GAP} TV now.`, base: "watch", accept: ["is not watching", "isn't watching"], ru: "Он сейчас не смотрит телевизор." },
  { id: "pc-n5", level: "A1", tense: "present_continuous", form: "negative", text: `We ${GAP} dinner now.`, base: "cook", accept: ["are not cooking", "aren't cooking"], ru: "Мы сейчас не готовим ужин." },
  { id: "pc-n6", level: "A1", tense: "present_continuous", form: "negative", text: `It ${GAP} outside.`, base: "rain", accept: ["is not raining", "isn't raining"], ru: "На улице не идёт дождь." },
  { id: "pc-n7", level: "A1", tense: "present_continuous", form: "negative", text: `I ${GAP} this book now.`, base: "read", accept: ["am not reading", "'m not reading"], ru: "Я сейчас не читаю эту книгу." },
  { id: "pc-n8", level: "A1", tense: "present_continuous", form: "negative", text: `The children ${GAP} now.`, base: "run", accept: ["are not running", "aren't running"], ru: "Дети сейчас не бегают." },
  { id: "pc-n9", level: "A1", tense: "present_continuous", form: "negative", text: `She ${GAP} a letter.`, base: "write", accept: ["is not writing", "isn't writing"], ru: "Она не пишет письмо." },
  { id: "pc-n10", level: "A1", tense: "present_continuous", form: "negative", text: `You ${GAP} to me.`, base: "listen", accept: ["are not listening", "aren't listening"], ru: "Ты меня не слушаешь." },
  { id: "pc-n11", level: "A1", tense: "present_continuous", form: "negative", text: `The dog ${GAP} now.`, base: "eat", accept: ["is not eating", "isn't eating"], ru: "Собака сейчас не ест." },
  { id: "pc-n12", level: "A1", tense: "present_continuous", form: "negative", text: `We ${GAP} TV now.`, base: "watch", accept: ["are not watching", "aren't watching"], ru: "Мы сейчас не смотрим телевизор." },
  // Вопрос
  { id: "pc-q1", level: "A1", tense: "present_continuous", form: "question", text: `${GAP} she sleeping now?`, base: "sleep", accept: ["Is"], ru: "Она сейчас спит?" },
  { id: "pc-q2", level: "A1", tense: "present_continuous", form: "question", text: `${GAP} you reading a book?`, base: "read", accept: ["Are"], ru: "Ты читаешь книгу?" },
  { id: "pc-q3", level: "A1", tense: "present_continuous", form: "question", text: `Is he ${GAP} football now?`, base: "play", accept: ["playing"], ru: "Он сейчас играет в футбол?" },
  { id: "pc-q4", level: "A1", tense: "present_continuous", form: "question", text: `Are they ${GAP} TV now?`, base: "watch", accept: ["watching"], ru: "Они сейчас смотрят телевизор?" },
  { id: "pc-q5", level: "A1", tense: "present_continuous", form: "question", text: `What ${GAP} you doing now?`, base: "do", accept: ["are"], ru: "Что ты сейчас делаешь?" },
  { id: "pc-q6", level: "A1", tense: "present_continuous", form: "question", text: `Why ${GAP} the baby crying?`, base: "cry", accept: ["is"], ru: "Почему малыш плачет?" },
  { id: "pc-q7", level: "A1", tense: "present_continuous", form: "question", text: `${GAP} it raining outside?`, base: "rain", accept: ["Is"], ru: "На улице идёт дождь?" },
  { id: "pc-q8", level: "A1", tense: "present_continuous", form: "question", text: `Am I ${GAP} too fast?`, base: "speak", accept: ["speaking"], ru: "Я говорю слишком быстро?" },
  { id: "pc-q9", level: "A1", tense: "present_continuous", form: "question", text: `${GAP} we going home now?`, base: "go", accept: ["Are"], ru: "Мы сейчас идём домой?" },
  { id: "pc-q10", level: "A1", tense: "present_continuous", form: "question", text: `Is your mother ${GAP} dinner?`, base: "cook", accept: ["cooking"], ru: "Твоя мама готовит ужин?" },
  { id: "pc-q11", level: "A1", tense: "present_continuous", form: "question", text: `Where ${GAP} they playing?`, base: "play", accept: ["are"], ru: "Где они играют?" },
  { id: "pc-q12", level: "A1", tense: "present_continuous", form: "question", text: `${GAP} your brother sleeping?`, base: "sleep", accept: ["Is"], ru: "Твой брат спит?" },

  // ── Past Simple (A2) ──────────────────────────────────────────────────────
  // Утверждение
  { id: "pst-1", level: "A2", tense: "past_simple", form: "affirmative", text: `We ${GAP} to the cinema last night.`, base: "go", accept: ["went"], ru: "Мы ходили в кино вчера вечером." },
  { id: "pst-2", level: "A2", tense: "past_simple", form: "affirmative", text: `She ${GAP} a new dress yesterday.`, base: "buy", accept: ["bought"], ru: "Она купила новое платье вчера." },
  { id: "pst-3", level: "A2", tense: "past_simple", form: "affirmative", text: `I ${GAP} football two days ago.`, base: "play", accept: ["played"], ru: "Я играл в футбол два дня назад." },
  { id: "pst-4", level: "A2", tense: "past_simple", form: "affirmative", text: `He ${GAP} his keys last week.`, base: "lose", accept: ["lost"], ru: "Он потерял свои ключи на прошлой неделе." },
  { id: "pst-5", level: "A2", tense: "past_simple", form: "affirmative", text: `They ${GAP} in London in 2019.`, base: "live", accept: ["lived"], ru: "Они жили в Лондоне в 2019 году." },
  { id: "pst-6", level: "A2", tense: "past_simple", form: "affirmative", text: `My mother ${GAP} a cake yesterday.`, base: "make", accept: ["made"], ru: "Моя мама сделала торт вчера." },
  { id: "pst-7", level: "A2", tense: "past_simple", form: "affirmative", text: `We ${GAP} our friends last Saturday.`, base: "meet", accept: ["met"], ru: "Мы встретили наших друзей в прошлую субботу." },
  { id: "pst-8", level: "A2", tense: "past_simple", form: "affirmative", text: `I ${GAP} that book two years ago.`, base: "read", accept: ["read"], ru: "Я читал ту книгу два года назад." },
  { id: "pst-9", level: "A2", tense: "past_simple", form: "affirmative", text: `She ${GAP} her grandmother last Sunday.`, base: "visit", accept: ["visited"], ru: "Она навещала бабушку в прошлое воскресенье." },
  { id: "pst-10", level: "A2", tense: "past_simple", form: "affirmative", text: `We ${GAP} a big pizza yesterday.`, base: "eat", accept: ["ate"], ru: "Мы съели большую пиццу вчера." },
  { id: "pst-11", level: "A2", tense: "past_simple", form: "affirmative", text: `He ${GAP} the window an hour ago.`, base: "open", accept: ["opened"], ru: "Он открыл окно час назад." },
  { id: "pst-12", level: "A2", tense: "past_simple", form: "affirmative", text: `They ${GAP} home very late.`, base: "come", accept: ["came"], ru: "Они пришли домой очень поздно." },
  // Отрицание
  { id: "pst-n1", level: "A2", tense: "past_simple", form: "negative", text: `We ${GAP} to the cinema yesterday.`, base: "go", accept: ["did not go", "didn't go"], ru: "Мы не ходили в кино вчера." },
  { id: "pst-n2", level: "A2", tense: "past_simple", form: "negative", text: `She ${GAP} a new dress.`, base: "buy", accept: ["did not buy", "didn't buy"], ru: "Она не покупала новое платье." },
  { id: "pst-n3", level: "A2", tense: "past_simple", form: "negative", text: `I ${GAP} football yesterday.`, base: "play", accept: ["did not play", "didn't play"], ru: "Я не играл в футбол вчера." },
  { id: "pst-n4", level: "A2", tense: "past_simple", form: "negative", text: `He ${GAP} his keys.`, base: "lose", accept: ["did not lose", "didn't lose"], ru: "Он не терял свои ключи." },
  { id: "pst-n5", level: "A2", tense: "past_simple", form: "negative", text: `They ${GAP} in London.`, base: "live", accept: ["did not live", "didn't live"], ru: "Они не жили в Лондоне." },
  { id: "pst-n6", level: "A2", tense: "past_simple", form: "negative", text: `My mother ${GAP} a cake yesterday.`, base: "make", accept: ["did not make", "didn't make"], ru: "Моя мама не делала торт вчера." },
  { id: "pst-n7", level: "A2", tense: "past_simple", form: "negative", text: `We ${GAP} our friends on Saturday.`, base: "meet", accept: ["did not meet", "didn't meet"], ru: "Мы не встретили наших друзей в субботу." },
  { id: "pst-n8", level: "A2", tense: "past_simple", form: "negative", text: `I ${GAP} that book.`, base: "read", accept: ["did not read", "didn't read"], ru: "Я не читал ту книгу." },
  { id: "pst-n9", level: "A2", tense: "past_simple", form: "negative", text: `She ${GAP} me the truth.`, base: "tell", accept: ["did not tell", "didn't tell"], ru: "Она не сказала мне правду." },
  { id: "pst-n10", level: "A2", tense: "past_simple", form: "negative", text: `The film ${GAP} at eight.`, base: "start", accept: ["did not start", "didn't start"], ru: "Фильм не начался в восемь." },
  { id: "pst-n11", level: "A2", tense: "past_simple", form: "negative", text: `We ${GAP} pizza yesterday.`, base: "eat", accept: ["did not eat", "didn't eat"], ru: "Мы не ели пиццу вчера." },
  { id: "pst-n12", level: "A2", tense: "past_simple", form: "negative", text: `He ${GAP} me yesterday.`, base: "call", accept: ["did not call", "didn't call"], ru: "Он не звонил мне вчера." },
  // Вопрос
  { id: "pst-q1", level: "A2", tense: "past_simple", form: "question", text: `${GAP} you go to school yesterday?`, base: "go", accept: ["Did"], ru: "Ты ходил в школу вчера?" },
  { id: "pst-q2", level: "A2", tense: "past_simple", form: "question", text: `Did she ${GAP} a new dress?`, base: "buy", accept: ["buy"], ru: "Она купила новое платье?" },
  { id: "pst-q3", level: "A2", tense: "past_simple", form: "question", text: `Where ${GAP} you go last summer?`, base: "go", accept: ["did"], ru: "Куда вы ездили прошлым летом?" },
  { id: "pst-q4", level: "A2", tense: "past_simple", form: "question", text: `Did they ${GAP} the match?`, base: "win", accept: ["win"], ru: "Они выиграли матч?" },
  { id: "pst-q5", level: "A2", tense: "past_simple", form: "question", text: `${GAP} he call you yesterday?`, base: "call", accept: ["Did"], ru: "Он звонил тебе вчера?" },
  { id: "pst-q6", level: "A2", tense: "past_simple", form: "question", text: `What ${GAP} you eat for breakfast?`, base: "eat", accept: ["did"], ru: "Что ты ел на завтрак?" },
  { id: "pst-q7", level: "A2", tense: "past_simple", form: "question", text: `Did your father ${GAP} this house?`, base: "build", accept: ["build"], ru: "Твой папа построил этот дом?" },
  { id: "pst-q8", level: "A2", tense: "past_simple", form: "question", text: `${GAP} the film start at eight?`, base: "start", accept: ["Did"], ru: "Фильм начался в восемь?" },
  { id: "pst-q9", level: "A2", tense: "past_simple", form: "question", text: `Why ${GAP} she leave so early?`, base: "leave", accept: ["did"], ru: "Почему она ушла так рано?" },
  { id: "pst-q10", level: "A2", tense: "past_simple", form: "question", text: `Did you ${GAP} my letter?`, base: "read", accept: ["read"], ru: "Ты прочитал моё письмо?" },
  { id: "pst-q11", level: "A2", tense: "past_simple", form: "question", text: `${GAP} they meet at the station?`, base: "meet", accept: ["Did"], ru: "Они встретились на вокзале?" },
  { id: "pst-q12", level: "A2", tense: "past_simple", form: "question", text: `When ${GAP} you lose your keys?`, base: "lose", accept: ["did"], ru: "Когда ты потерял свои ключи?" },

  // ── Future Simple (A2) ────────────────────────────────────────────────────
  // Утверждение
  { id: "fs-1", level: "A2", tense: "future_simple", form: "affirmative", text: `I ${GAP} you tomorrow.`, base: "call", accept: ["will call", "'ll call"], ru: "Я позвоню тебе завтра." },
  { id: "fs-2", level: "A2", tense: "future_simple", form: "affirmative", text: `She ${GAP} the answer soon.`, base: "know", accept: ["will know", "'ll know"], ru: "Она скоро узнает ответ." },
  { id: "fs-3", level: "A2", tense: "future_simple", form: "affirmative", text: `We ${GAP} to the sea next summer.`, base: "go", accept: ["will go", "'ll go"], ru: "Мы поедем на море следующим летом." },
  { id: "fs-4", level: "A2", tense: "future_simple", form: "affirmative", text: `I think it ${GAP} tomorrow.`, base: "rain", accept: ["will rain", "'ll rain"], ru: "Я думаю, завтра будет дождь." },
  { id: "fs-5", level: "A2", tense: "future_simple", form: "affirmative", text: `He ${GAP} me with my homework.`, base: "help", accept: ["will help", "'ll help"], ru: "Он поможет мне с домашней работой." },
  { id: "fs-6", level: "A2", tense: "future_simple", form: "affirmative", text: `They ${GAP} a new house next year.`, base: "buy", accept: ["will buy", "'ll buy"], ru: "Они купят новый дом в следующем году." },
  { id: "fs-7", level: "A2", tense: "future_simple", form: "affirmative", text: `We ${GAP} at the station tomorrow.`, base: "meet", accept: ["will meet", "'ll meet"], ru: "Мы встретимся на вокзале завтра." },
  { id: "fs-8", level: "A2", tense: "future_simple", form: "affirmative", text: `She ${GAP} the exam next week.`, base: "pass", accept: ["will pass", "'ll pass"], ru: "Она сдаст экзамен на следующей неделе." },
  { id: "fs-9", level: "A2", tense: "future_simple", form: "affirmative", text: `I ${GAP} you the truth later.`, base: "tell", accept: ["will tell", "'ll tell"], ru: "Я скажу тебе правду позже." },
  { id: "fs-10", level: "A2", tense: "future_simple", form: "affirmative", text: `They ${GAP} a new school here.`, base: "build", accept: ["will build", "'ll build"], ru: "Они построят здесь новую школу." },
  { id: "fs-11", level: "A2", tense: "future_simple", form: "affirmative", text: `He ${GAP} sixteen next year.`, base: "be", accept: ["will be", "'ll be"], ru: "Ему исполнится шестнадцать в следующем году." },
  { id: "fs-12", level: "A2", tense: "future_simple", form: "affirmative", text: `I think she ${GAP} soon.`, base: "come", accept: ["will come", "'ll come"], ru: "Думаю, она скоро придёт." },
  // Отрицание
  { id: "fs-n1", level: "A2", tense: "future_simple", form: "negative", text: `I ${GAP} you tomorrow.`, base: "call", accept: ["will not call", "won't call"], ru: "Я не позвоню тебе завтра." },
  { id: "fs-n2", level: "A2", tense: "future_simple", form: "negative", text: `She ${GAP} the answer.`, base: "know", accept: ["will not know", "won't know"], ru: "Она не узнает ответ." },
  { id: "fs-n3", level: "A2", tense: "future_simple", form: "negative", text: `We ${GAP} to the sea next summer.`, base: "go", accept: ["will not go", "won't go"], ru: "Мы не поедем на море следующим летом." },
  { id: "fs-n4", level: "A2", tense: "future_simple", form: "negative", text: `I think it ${GAP} tomorrow.`, base: "rain", accept: ["will not rain", "won't rain"], ru: "Я думаю, завтра не будет дождя." },
  { id: "fs-n5", level: "A2", tense: "future_simple", form: "negative", text: `He ${GAP} me with my homework.`, base: "help", accept: ["will not help", "won't help"], ru: "Он не поможет мне с домашней работой." },
  { id: "fs-n6", level: "A2", tense: "future_simple", form: "negative", text: `They ${GAP} a new house.`, base: "buy", accept: ["will not buy", "won't buy"], ru: "Они не купят новый дом." },
  { id: "fs-n7", level: "A2", tense: "future_simple", form: "negative", text: `I ${GAP} anyone about it.`, base: "tell", accept: ["will not tell", "won't tell"], ru: "Я никому об этом не скажу." },
  { id: "fs-n8", level: "A2", tense: "future_simple", form: "negative", text: `She ${GAP} the exam next week.`, base: "pass", accept: ["will not pass", "won't pass"], ru: "Она не сдаст экзамен на следующей неделе." },
  { id: "fs-n9", level: "A2", tense: "future_simple", form: "negative", text: `We ${GAP} late tomorrow.`, base: "be", accept: ["will not be", "won't be"], ru: "Мы не опоздаем завтра." },
  { id: "fs-n10", level: "A2", tense: "future_simple", form: "negative", text: `The train ${GAP} on time.`, base: "arrive", accept: ["will not arrive", "won't arrive"], ru: "Поезд не приедет вовремя." },
  { id: "fs-n11", level: "A2", tense: "future_simple", form: "negative", text: `I ${GAP} this film again.`, base: "watch", accept: ["will not watch", "won't watch"], ru: "Я не буду смотреть этот фильм снова." },
  { id: "fs-n12", level: "A2", tense: "future_simple", form: "negative", text: `He ${GAP} his homework tonight.`, base: "do", accept: ["will not do", "won't do"], ru: "Он не сделает домашнюю работу сегодня вечером." },
  // Вопрос
  { id: "fs-q1", level: "A2", tense: "future_simple", form: "question", text: `${GAP} you call me tomorrow?`, base: "call", accept: ["Will"], ru: "Ты позвонишь мне завтра?" },
  { id: "fs-q2", level: "A2", tense: "future_simple", form: "question", text: `Will she ${GAP} the answer soon?`, base: "know", accept: ["know"], ru: "Она скоро узнает ответ?" },
  { id: "fs-q3", level: "A2", tense: "future_simple", form: "question", text: `When ${GAP} they arrive?`, base: "arrive", accept: ["will"], ru: "Когда они приедут?" },
  { id: "fs-q4", level: "A2", tense: "future_simple", form: "question", text: `Will you ${GAP} me with this?`, base: "help", accept: ["help"], ru: "Ты поможешь мне с этим?" },
  { id: "fs-q5", level: "A2", tense: "future_simple", form: "question", text: `${GAP} it rain tomorrow?`, base: "rain", accept: ["Will"], ru: "Завтра будет дождь?" },
  { id: "fs-q6", level: "A2", tense: "future_simple", form: "question", text: `What ${GAP} you do next summer?`, base: "do", accept: ["will"], ru: "Что ты будешь делать следующим летом?" },
  { id: "fs-q7", level: "A2", tense: "future_simple", form: "question", text: `Will your team ${GAP} the match?`, base: "win", accept: ["win"], ru: "Твоя команда выиграет матч?" },
  { id: "fs-q8", level: "A2", tense: "future_simple", form: "question", text: `${GAP} we be late?`, base: "be", accept: ["Will"], ru: "Мы опоздаем?" },
  { id: "fs-q9", level: "A2", tense: "future_simple", form: "question", text: `Where ${GAP} you live next year?`, base: "live", accept: ["will"], ru: "Где ты будешь жить в следующем году?" },
  { id: "fs-q10", level: "A2", tense: "future_simple", form: "question", text: `Will he ${GAP} a new car?`, base: "buy", accept: ["buy"], ru: "Он купит новую машину?" },
  { id: "fs-q11", level: "A2", tense: "future_simple", form: "question", text: `${GAP} she come to the party?`, base: "come", accept: ["Will"], ru: "Она придёт на вечеринку?" },
  { id: "fs-q12", level: "A2", tense: "future_simple", form: "question", text: `How ${GAP} they get home?`, base: "get", accept: ["will"], ru: "Как они доберутся домой?" },

  // ── Present Perfect (B1) ──────────────────────────────────────────────────
  // Утверждение
  { id: "pp-1", level: "B1", tense: "present_perfect", form: "affirmative", text: `I ${GAP} my homework already.`, base: "finish", accept: ["have finished", "'ve finished"], ru: "Я уже закончил домашнюю работу." },
  { id: "pp-2", level: "B1", tense: "present_perfect", form: "affirmative", text: `She ${GAP} this book three times.`, base: "read", accept: ["has read"], ru: "Она читала эту книгу три раза." },
  { id: "pp-3", level: "B1", tense: "present_perfect", form: "affirmative", text: `We ${GAP} here since 2015.`, base: "live", accept: ["have lived", "'ve lived"], ru: "Мы живём здесь с 2015 года." },
  { id: "pp-4", level: "B1", tense: "present_perfect", form: "affirmative", text: `He ${GAP} his passport again.`, base: "lose", accept: ["has lost"], ru: "Он снова потерял свой паспорт." },
  { id: "pp-5", level: "B1", tense: "present_perfect", form: "affirmative", text: `They ${GAP} to Japan twice.`, base: "be", accept: ["have been", "'ve been"], ru: "Они были в Японии дважды." },
  { id: "pp-6", level: "B1", tense: "present_perfect", form: "affirmative", text: `I ${GAP} the news already.`, base: "hear", accept: ["have heard", "'ve heard"], ru: "Я уже слышал эту новость." },
  { id: "pp-7", level: "B1", tense: "present_perfect", form: "affirmative", text: `We ${GAP} our homework already.`, base: "do", accept: ["have done", "'ve done"], ru: "Мы уже сделали домашнюю работу." },
  { id: "pp-8", level: "B1", tense: "present_perfect", form: "affirmative", text: `He ${GAP} in this school since 2020.`, base: "study", accept: ["has studied"], ru: "Он учится в этой школе с 2020 года." },
  { id: "pp-9", level: "B1", tense: "present_perfect", form: "affirmative", text: `I ${GAP} my room today.`, base: "clean", accept: ["have cleaned", "'ve cleaned"], ru: "Я убрал свою комнату сегодня." },
  { id: "pp-10", level: "B1", tense: "present_perfect", form: "affirmative", text: `She ${GAP} a horse before.`, base: "ride", accept: ["has ridden"], ru: "Она каталась на лошади раньше." },
  { id: "pp-11", level: "B1", tense: "present_perfect", form: "affirmative", text: `We ${GAP} each other for ten years.`, base: "know", accept: ["have known", "'ve known"], ru: "Мы знаем друг друга десять лет." },
  { id: "pp-12", level: "B1", tense: "present_perfect", form: "affirmative", text: `The rain ${GAP} at last.`, base: "stop", accept: ["has stopped"], ru: "Дождь наконец прекратился." },
  // Отрицание
  { id: "pp-n1", level: "B1", tense: "present_perfect", form: "negative", text: `I ${GAP} my homework yet.`, base: "finish", accept: ["have not finished", "haven't finished"], ru: "Я ещё не закончил домашнюю работу." },
  { id: "pp-n2", level: "B1", tense: "present_perfect", form: "negative", text: `She ${GAP} this book.`, base: "read", accept: ["has not read", "hasn't read"], ru: "Она не читала эту книгу." },
  { id: "pp-n3", level: "B1", tense: "present_perfect", form: "negative", text: `We ${GAP} him since 2015.`, base: "see", accept: ["have not seen", "haven't seen"], ru: "Мы не видели его с 2015 года." },
  { id: "pp-n4", level: "B1", tense: "present_perfect", form: "negative", text: `He ${GAP} his passport.`, base: "lose", accept: ["has not lost", "hasn't lost"], ru: "Он не терял свой паспорт." },
  { id: "pp-n5", level: "B1", tense: "present_perfect", form: "negative", text: `They ${GAP} to Japan.`, base: "be", accept: ["have not been", "haven't been"], ru: "Они не были в Японии." },
  { id: "pp-n6", level: "B1", tense: "present_perfect", form: "negative", text: `I ${GAP} the news yet.`, base: "hear", accept: ["have not heard", "haven't heard"], ru: "Я ещё не слышал эту новость." },
  { id: "pp-n7", level: "B1", tense: "present_perfect", form: "negative", text: `The rain ${GAP} yet.`, base: "stop", accept: ["has not stopped", "hasn't stopped"], ru: "Дождь ещё не прекратился." },
  { id: "pp-n8", level: "B1", tense: "present_perfect", form: "negative", text: `We ${GAP} our homework yet.`, base: "do", accept: ["have not done", "haven't done"], ru: "Мы ещё не сделали домашнюю работу." },
  { id: "pp-n9", level: "B1", tense: "present_perfect", form: "negative", text: `She ${GAP} me yet.`, base: "call", accept: ["has not called", "hasn't called"], ru: "Она мне ещё не звонила." },
  { id: "pp-n10", level: "B1", tense: "present_perfect", form: "negative", text: `I ${GAP} breakfast yet.`, base: "have", accept: ["have not had", "haven't had"], ru: "Я ещё не завтракал." },
  { id: "pp-n11", level: "B1", tense: "present_perfect", form: "negative", text: `They ${GAP} the bridge yet.`, base: "build", accept: ["have not built", "haven't built"], ru: "Они ещё не построили мост." },
  { id: "pp-n12", level: "B1", tense: "present_perfect", form: "negative", text: `He ${GAP} to me this week.`, base: "write", accept: ["has not written", "hasn't written"], ru: "Он не писал мне на этой неделе." },
  // Вопрос
  { id: "pp-q1", level: "B1", tense: "present_perfect", form: "question", text: `${GAP} you ever been to London?`, base: "be", accept: ["Have"], ru: "Ты когда-нибудь был в Лондоне?" },
  { id: "pp-q2", level: "B1", tense: "present_perfect", form: "question", text: `Has she ${GAP} this film?`, base: "see", accept: ["seen"], ru: "Она смотрела этот фильм?" },
  { id: "pp-q3", level: "B1", tense: "present_perfect", form: "question", text: `${GAP} he lost his keys again?`, base: "lose", accept: ["Has"], ru: "Он снова потерял ключи?" },
  { id: "pp-q4", level: "B1", tense: "present_perfect", form: "question", text: `Have you ${GAP} your homework yet?`, base: "do", accept: ["done"], ru: "Ты уже сделал домашнюю работу?" },
  { id: "pp-q5", level: "B1", tense: "present_perfect", form: "question", text: `How long ${GAP} you lived here?`, base: "live", accept: ["have"], ru: "Как долго ты здесь живёшь?" },
  { id: "pp-q6", level: "B1", tense: "present_perfect", form: "question", text: `${GAP} they finished the work yet?`, base: "finish", accept: ["Have"], ru: "Они уже закончили работу?" },
  { id: "pp-q7", level: "B1", tense: "present_perfect", form: "question", text: `Has the rain ${GAP} yet?`, base: "stop", accept: ["stopped"], ru: "Дождь уже прекратился?" },
  { id: "pp-q8", level: "B1", tense: "present_perfect", form: "question", text: `${GAP} she read this book before?`, base: "read", accept: ["Has"], ru: "Она читала эту книгу раньше?" },
  { id: "pp-q9", level: "B1", tense: "present_perfect", form: "question", text: `Have you ever ${GAP} a horse?`, base: "ride", accept: ["ridden"], ru: "Ты когда-нибудь катался на лошади?" },
  { id: "pp-q10", level: "B1", tense: "present_perfect", form: "question", text: `Why ${GAP} he not come yet?`, base: "come", accept: ["has"], ru: "Почему он ещё не пришёл?" },
  { id: "pp-q11", level: "B1", tense: "present_perfect", form: "question", text: `${GAP} we met before?`, base: "meet", accept: ["Have"], ru: "Мы встречались раньше?" },
  { id: "pp-q12", level: "B1", tense: "present_perfect", form: "question", text: `Has your team ${GAP} a match?`, base: "win", accept: ["won"], ru: "Твоя команда выиграла хоть один матч?" },

  // ── Past Continuous (A2) ──────────────────────────────────────────────────
  // Утверждение
  { id: "pcn-1", level: "A2", tense: "past_continuous", form: "affirmative", text: `I ${GAP} when the phone rang.`, base: "sleep", accept: ["was sleeping"], ru: "Я спал, когда зазвонил телефон." },
  { id: "pcn-2", level: "A2", tense: "past_continuous", form: "affirmative", text: `They ${GAP} football at five o'clock.`, base: "play", accept: ["were playing"], ru: "Они играли в футбол в пять часов." },
  { id: "pcn-3", level: "A2", tense: "past_continuous", form: "affirmative", text: `She ${GAP} dinner when I came home.`, base: "cook", accept: ["was cooking"], ru: "Она готовила ужин, когда я пришёл домой." },
  { id: "pcn-4", level: "A2", tense: "past_continuous", form: "affirmative", text: `We ${GAP} while it was raining.`, base: "walk", accept: ["were walking"], ru: "Мы шли, пока шёл дождь." },
  { id: "pcn-5", level: "A2", tense: "past_continuous", form: "affirmative", text: `The sun ${GAP} all day yesterday.`, base: "shine", accept: ["was shining"], ru: "Солнце светило весь день вчера." },
  { id: "pcn-6", level: "A2", tense: "past_continuous", form: "affirmative", text: `He ${GAP} a book at that moment.`, base: "read", accept: ["was reading"], ru: "Он читал книгу в тот момент." },
  { id: "pcn-7", level: "A2", tense: "past_continuous", form: "affirmative", text: `We ${GAP} dinner at eight yesterday.`, base: "have", accept: ["were having"], ru: "Мы ужинали в восемь вчера." },
  { id: "pcn-8", level: "A2", tense: "past_continuous", form: "affirmative", text: `She ${GAP} to music all evening.`, base: "listen", accept: ["was listening"], ru: "Она слушала музыку весь вечер." },
  { id: "pcn-9", level: "A2", tense: "past_continuous", form: "affirmative", text: `They ${GAP} TV when I came.`, base: "watch", accept: ["were watching"], ru: "Они смотрели телевизор, когда я пришёл." },
  { id: "pcn-10", level: "A2", tense: "past_continuous", form: "affirmative", text: `I ${GAP} my homework at six.`, base: "do", accept: ["was doing"], ru: "Я делал домашнюю работу в шесть." },
  { id: "pcn-11", level: "A2", tense: "past_continuous", form: "affirmative", text: `The children ${GAP} in the yard.`, base: "play", accept: ["were playing"], ru: "Дети играли во дворе." },
  { id: "pcn-12", level: "A2", tense: "past_continuous", form: "affirmative", text: `He ${GAP} a letter all morning.`, base: "write", accept: ["was writing"], ru: "Он писал письмо всё утро." },
  // Отрицание
  { id: "pcn-n1", level: "A2", tense: "past_continuous", form: "negative", text: `I ${GAP} when you called.`, base: "sleep", accept: ["was not sleeping", "wasn't sleeping"], ru: "Я не спал, когда ты позвонил." },
  { id: "pcn-n2", level: "A2", tense: "past_continuous", form: "negative", text: `They ${GAP} football at five.`, base: "play", accept: ["were not playing", "weren't playing"], ru: "Они не играли в футбол в пять." },
  { id: "pcn-n3", level: "A2", tense: "past_continuous", form: "negative", text: `She ${GAP} dinner then.`, base: "cook", accept: ["was not cooking", "wasn't cooking"], ru: "Она тогда не готовила ужин." },
  { id: "pcn-n4", level: "A2", tense: "past_continuous", form: "negative", text: `We ${GAP} at that moment.`, base: "work", accept: ["were not working", "weren't working"], ru: "Мы не работали в тот момент." },
  { id: "pcn-n5", level: "A2", tense: "past_continuous", form: "negative", text: `The sun ${GAP} yesterday.`, base: "shine", accept: ["was not shining", "wasn't shining"], ru: "Солнце не светило вчера." },
  { id: "pcn-n6", level: "A2", tense: "past_continuous", form: "negative", text: `He ${GAP} a book then.`, base: "read", accept: ["was not reading", "wasn't reading"], ru: "Он тогда не читал книгу." },
  { id: "pcn-n7", level: "A2", tense: "past_continuous", form: "negative", text: `It ${GAP} all day yesterday.`, base: "rain", accept: ["was not raining", "wasn't raining"], ru: "Вчера весь день не было дождя." },
  { id: "pcn-n8", level: "A2", tense: "past_continuous", form: "negative", text: `You ${GAP} to me.`, base: "listen", accept: ["were not listening", "weren't listening"], ru: "Ты меня не слушал." },
  { id: "pcn-n9", level: "A2", tense: "past_continuous", form: "negative", text: `I ${GAP} for you.`, base: "wait", accept: ["was not waiting", "wasn't waiting"], ru: "Я тебя не ждал." },
  { id: "pcn-n10", level: "A2", tense: "past_continuous", form: "negative", text: `The children ${GAP} in the yard.`, base: "play", accept: ["were not playing", "weren't playing"], ru: "Дети не играли во дворе." },
  { id: "pcn-n11", level: "A2", tense: "past_continuous", form: "negative", text: `She ${GAP} TV at eight.`, base: "watch", accept: ["was not watching", "wasn't watching"], ru: "Она не смотрела телевизор в восемь." },
  { id: "pcn-n12", level: "A2", tense: "past_continuous", form: "negative", text: `We ${GAP} home then.`, base: "walk", accept: ["were not walking", "weren't walking"], ru: "Мы тогда не шли домой." },
  // Вопрос
  { id: "pcn-q1", level: "A2", tense: "past_continuous", form: "question", text: `${GAP} you sleeping when I called?`, base: "sleep", accept: ["Were"], ru: "Ты спал, когда я позвонил?" },
  { id: "pcn-q2", level: "A2", tense: "past_continuous", form: "question", text: `Was she ${GAP} dinner then?`, base: "cook", accept: ["cooking"], ru: "Она тогда готовила ужин?" },
  { id: "pcn-q3", level: "A2", tense: "past_continuous", form: "question", text: `What ${GAP} you doing at five?`, base: "do", accept: ["were"], ru: "Что ты делал в пять?" },
  { id: "pcn-q4", level: "A2", tense: "past_continuous", form: "question", text: `Were they ${GAP} football?`, base: "play", accept: ["playing"], ru: "Они играли в футбол?" },
  { id: "pcn-q5", level: "A2", tense: "past_continuous", form: "question", text: `${GAP} it raining yesterday?`, base: "rain", accept: ["Was"], ru: "Вчера шёл дождь?" },
  { id: "pcn-q6", level: "A2", tense: "past_continuous", form: "question", text: `Why ${GAP} he waiting outside?`, base: "wait", accept: ["was"], ru: "Почему он ждал на улице?" },
  { id: "pcn-q7", level: "A2", tense: "past_continuous", form: "question", text: `Was the sun ${GAP} then?`, base: "shine", accept: ["shining"], ru: "Солнце тогда светило?" },
  { id: "pcn-q8", level: "A2", tense: "past_continuous", form: "question", text: `${GAP} we walking too fast?`, base: "walk", accept: ["Were"], ru: "Мы шли слишком быстро?" },
  { id: "pcn-q9", level: "A2", tense: "past_continuous", form: "question", text: `Where ${GAP} she going at nine?`, base: "go", accept: ["was"], ru: "Куда она шла в девять?" },
  { id: "pcn-q10", level: "A2", tense: "past_continuous", form: "question", text: `Were you ${GAP} to me?`, base: "listen", accept: ["listening"], ru: "Ты меня слушал?" },
  { id: "pcn-q11", level: "A2", tense: "past_continuous", form: "question", text: `${GAP} the children playing outside?`, base: "play", accept: ["Were"], ru: "Дети играли на улице?" },
  { id: "pcn-q12", level: "A2", tense: "past_continuous", form: "question", text: `What ${GAP} they watching then?`, base: "watch", accept: ["were"], ru: "Что они смотрели тогда?" },
];
