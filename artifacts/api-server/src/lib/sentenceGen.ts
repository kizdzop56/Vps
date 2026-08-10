// ─────────────────────────────────────────────────────────────────────────────
// Откуда берутся предложения для режима «Собери предложение».
//
// Две части, и порядок между ними важен.
//
// 1. ЗАПАС (SEED_TASKS) — предложения, написанные и вычитанные вручную, по
//    шесть на уровень. Это не затычка на время разработки, а страховка
//    навсегда: ключа OpenAI может не быть в окружении, провайдер может лежать,
//    модель может вернуть пустой ответ. В любом из этих случаев режим обязан
//    работать. Пустой тренажёр — это сломанное приложение; шесть знакомых
//    предложений — просто повторение.
//
// 2. ГЕНЕРАЦИЯ — модель выдаёт новые предложения пачками, каждое проходит
//    validateTask (см. sentenceTask.ts) и при малейшем сомнении
//    выбрасывается. Отсев считается и пишется в лог: если модель начнёт
//    систематически врать, это будет видно по цифрам, а не по жалобам.
//
// ── Почему пул в памяти, а не таблица в базе ────────────────────────────────
// Задание живёт один показ и как данные ничего не стоит. Таблица потребовала бы
// миграции на живой базе и ещё одного места, где схема может разойтись с кодом,
// а взамен дала бы только экономию на запросах к модели. Перезапуск сервера
// теряет пул — это стоит одного лишнего обращения, не больше.
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import { logger } from "./logger";
import {
  CEFR_LEVELS,
  LEVEL_RULES,
  buildTokens,
  tokenize,
  validateTask,
  type Cefr,
  type SentenceTask,
} from "./sentenceTask";

/** Предложение до сборки плиток: только текст. */
type RawTask = { ru: string; en: string; note?: string };

// ── Проверенный запас ───────────────────────────────────────────────────────
//
// Требования к каждому предложению здесь ровно те же, что к сгенерированному:
// длина по уровню, разрешённая грамматика, школьная тема. Проверяются они тем
// же validateTask — тест на это стоит в sentenceGen.test.ts, чтобы запас не
// разошёлся с правилами при правке уровней.

const SEED_TASKS: Record<Cefr, RawTask[]> = {
  A1: [
    { ru: "Я люблю красные яблоки", en: "I like red apples", note: "Present Simple: после I глагол без окончания." },
    { ru: "Моя сестра читает книгу", en: "My sister reads a book", note: "He, she, it — к глаголу добавляется -s." },
    { ru: "Мы играем в футбол", en: "We play football today", note: "После we глагол без -s." },
    { ru: "Кошка спит на столе", en: "The cat sleeps on the table", note: "Предлог on — «на поверхности»." },
    { ru: "Я не пью кофе", en: "I do not drink coffee", note: "Отрицание в Present Simple: do not + глагол." },
    { ru: "Ты говоришь по-английски", en: "You speak English very well", note: "Наречие very well стоит после глагола." },
  ],
  A2: [
    { ru: "Вчера я ходил в школу пешком", en: "Yesterday I walked to school", note: "Past Simple: к правильному глаголу добавляется -ed." },
    { ru: "Она купила новое платье в магазине", en: "She bought a new dress in the shop", note: "buy — неправильный глагол, вторая форма bought." },
    { ru: "Завтра мы поедем к бабушке", en: "Tomorrow we will visit our grandmother", note: "Будущее время: will + глагол без частицы to." },
    { ru: "Мой брат выше меня", en: "My brother is taller than me", note: "Сравнительная степень: короткое прилагательное + -er и than." },
    { ru: "Я не смог найти свои ключи", en: "I could not find my keys", note: "could not — прошедшее от can not." },
    { ru: "Дети рисуют картину прямо сейчас", en: "The children are drawing a picture now", note: "Present Continuous: to be + глагол с -ing." },
  ],
  B1: [
    { ru: "Я уже закончил домашнюю работу", en: "I have already finished my homework", note: "Present Perfect: have + третья форма, already стоит перед глаголом." },
    { ru: "Она живёт в этом городе с детства", en: "She has lived in this city since childhood", note: "since — точка начала, с Present Perfect." },
    { ru: "Когда я вернулся домой, шёл дождь", en: "When I came home it was raining", note: "Past Continuous описывает фон для события в Past Simple." },
    { ru: "Если ты позвонишь мне, я приду", en: "If you call me I will come", note: "First conditional: в части с if — Present Simple, во второй — will." },
    { ru: "Мне нравится читать книги по вечерам", en: "I enjoy reading books in the evening", note: "После enjoy глагол ставится с -ing." },
    { ru: "Он никогда не был в Лондоне", en: "He has never been to London", note: "never с Present Perfect, been to — «бывал в»." },
  ],
  B2: [
    { ru: "Это письмо было написано моей сестрой", en: "This letter was written by my sister", note: "Пассив: to be + третья форма, автор действия после by." },
    { ru: "Если бы у меня было больше времени, я бы помог", en: "If I had more time I would help you", note: "Second conditional: past + would для нереального настоящего." },
    { ru: "Учитель сказал, что задание было сложным", en: "The teacher said that the task had been difficult", note: "Косвенная речь сдвигает время на шаг назад." },
    { ru: "Дом, который мы купили, очень старый", en: "The house which we bought is very old", note: "which вводит определение к предмету." },
    { ru: "К тому времени поезд уже ушёл", en: "By that time the train had already left", note: "Past Perfect: действие до другого действия в прошлом." },
    { ru: "Работа должна быть закончена до пятницы", en: "The work must be finished before Friday", note: "Модальный глагол в пассиве: must be + третья форма." },
  ],
  C1: [
    { ru: "Несмотря на дождь, мы решили продолжить поездку", en: "Despite the rain we decided to continue our trip", note: "Despite — предлог, после него существительное без that." },
    { ru: "Чем больше он читал, тем лучше понимал тему", en: "The more he read the better he understood the topic", note: "Конструкция the more … the better со сравнительной степенью." },
    { ru: "Только позже я понял, насколько важен был тот разговор", en: "Only later did I realise how important that talk was", note: "После only later идёт инверсия: did + подлежащее." },
    { ru: "Если бы он подготовился, экзамен прошёл бы легче", en: "Had he prepared the exam would have been easier", note: "Third conditional без if: Had he prepared вместо If he had prepared." },
    { ru: "Его объяснение оказалось гораздо яснее, чем я ожидал", en: "His explanation turned out to be much clearer than I expected", note: "turn out to be — «оказаться»; much усиливает сравнение." },
    { ru: "Проект был завершён раньше, чем кто-либо предполагал", en: "The project was completed earlier than anyone had expected", note: "Пассив в прошедшем плюс Past Perfect в сравнении." },
  ],
};

/**
 * Слова для лишних плиток: берутся из соседних предложений ТОГО ЖЕ уровня.
 *
 * Так лишняя плитка выглядит как своя. Слово из словаря наугад отсекается на
 * глаз — оно другой темы, другого регистра или заметно длиннее, — и перестаёт
 * работать отвлекающим.
 */
function decoyPool(level: Cefr, exceptEn: string): string[] {
  const out: string[] = [];
  for (const t of SEED_TASKS[level]) {
    if (t.en === exceptEn) continue;
    for (const w of tokenize(t.en)) {
      const clean = w.replace(/[^A-Za-z'\-]/g, "");
      if (clean.length >= 2) out.push(clean.toLowerCase());
    }
  }
  return [...new Set(out)];
}

/** Собрать готовое задание: текст + перемешанные плитки. */
function dress(raw: RawTask, level: Cefr, seed: number): SentenceTask {
  return {
    ru: raw.ru,
    en: raw.en,
    tokens: buildTokens(raw.en, decoyPool(level, raw.en), seed),
    ...(raw.note ? { note: raw.note } : {}),
  };
}

// ── Генерация ───────────────────────────────────────────────────────────────

function getOpenAI(): OpenAI | null {
  const apiKey = process.env["OPENAI_API_KEY"] || process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  const baseURL = process.env["OPENAI_API_BASE"] || process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

/** Сколько предложений просим за один раз. */
const BATCH = 10;

/**
 * Указание модели.
 *
 * Запреты сформулированы списком и повторяют то, что проверяет фильтр. Дублируем
 * намеренно: просьба уменьшает долю брака, а фильтр гарантирует результат.
 * Полагаться только на просьбу нельзя — модель её нарушает; полагаться только
 * на фильтр дорого — половина пачки уйдёт в отсев.
 */
function systemPrompt(level: Cefr): string {
  const rule = LEVEL_RULES[level];
  return [
    "Ты составляешь упражнения по английскому языку для школьников.",
    `Уровень: ${level} по шкале CEFR.`,
    `Разрешённая грамматика: ${rule.allow}`,
    `Длина предложения: от ${rule.minWords} до ${rule.maxWords} слов. Это жёсткое требование.`,
    "",
    "СТРОГО ЗАПРЕЩЕНО в предложениях:",
    "- алкоголь, курение, наркотики;",
    "- оружие, война, драки, насилие, кровь;",
    "- смерть, болезни, похороны;",
    "- политика, выборы, религия;",
    "- азартные игры, преступления, тюрьма;",
    "- romantic и интимные темы, свидания, развод;",
    "- оскорбления и любые обидные оценки человека;",
    "- имена реальных людей, названия брендов и компаний.",
    "",
    "Темы: школа, семья, друзья, еда, животные, погода, спорт, путешествия,",
    "хобби, распорядок дня, дом, покупки, природа, учёба.",
    "",
    "Формат ответа — JSON-объект вида",
    '{"items":[{"ru":"русский перевод","en":"English sentence","note":"правило одной фразой по-русски"}]}',
    "",
    "Требования к полям:",
    "- en: только латиница, первое слово с заглавной буквы, в конце точка или знак вопроса;",
    "- ru: только кириллица, естественный русский перевод того же смысла;",
    "- note: одно короткое пояснение правила по-русски, без английских терминов кроме названий времён;",
    "- предложения в пачке должны быть про разное, не повторяй одну тему.",
  ].join("\n");
}

/**
 * Спросить у модели пачку предложений и оставить только прошедшие проверку.
 *
 * Ошибки сети и разбора не пробрасываются: вызывающий обходится запасом, а
 * причина уходит в лог. Экран не должен ломаться из-за чужого сервиса.
 */
async function generate(level: Cefr, avoid: string[]): Promise<RawTask[]> {
  const openai = getOpenAI();
  if (!openai) return [];

  try {
    const skip = avoid.slice(-30);
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      // Разнообразие здесь важнее предсказуемости: одинаковые предложения в
      // тренажёре хуже, чем неожиданные.
      temperature: 1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt(level) },
        {
          role: "user",
          content: [
            `Составь ${BATCH} предложений уровня ${level}.`,
            skip.length > 0
              ? `Не повторяй эти предложения: ${skip.join(" | ")}`
              : "",
          ].filter(Boolean).join("\n"),
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";
    if (!text) return [];

    const parsed = JSON.parse(text) as { items?: unknown };
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    const good: RawTask[] = [];
    const rejected: string[] = [];
    for (const item of items) {
      const raw = item as RawTask;
      const check = validateTask({ ru: raw?.ru, en: raw?.en }, level);
      if (!check.ok) { rejected.push(check.reason); continue; }
      good.push({
        ru: String(raw.ru).trim(),
        en: String(raw.en).trim(),
        ...(typeof raw.note === "string" && raw.note.trim() ? { note: raw.note.trim() } : {}),
      });
    }

    // Отсев — не мелочь: по нему видно, что модель делает не так, и когда пора
    // менять подсказку. Без этих цифр остаётся только гадать.
    if (rejected.length > 0) {
      logger.warn(
        { level, kept: good.length, dropped: rejected.length, reasons: rejected.slice(0, 5) },
        "Часть сгенерированных предложений не прошла проверку",
      );
    }
    return good;
  } catch (err) {
    logger.error({ err, level }, "Не удалось получить предложения от модели");
    return [];
  }
}

// ── Пул ─────────────────────────────────────────────────────────────────────

/** Готовые к выдаче предложения по уровням. */
const pool: Map<Cefr, RawTask[]> = new Map(CEFR_LEVELS.map((l) => [l, []]));
/** Что уже выдавали: не просим модель повторяться. */
const seen: Map<Cefr, string[]> = new Map(CEFR_LEVELS.map((l) => [l, []]));
/** Идущая генерация: два одновременных запроса за одну пачку не нужны. */
const inFlight: Map<Cefr, Promise<void>> = new Map();

/** Ниже этого порога пул пополняется заранее, не дожидаясь пустоты. */
const REFILL_AT = 4;
/** Дальше этого история не растёт: она нужна только как список «не повторяй». */
const SEEN_LIMIT = 60;

function refill(level: Cefr): Promise<void> {
  const running = inFlight.get(level);
  if (running) return running;

  const task = generate(level, seen.get(level) ?? [])
    .then((fresh) => {
      const list = pool.get(level)!;
      const known = new Set([...(seen.get(level) ?? []), ...list.map((t) => t.en)]);
      for (const item of fresh) {
        if (known.has(item.en)) continue;
        known.add(item.en);
        list.push(item);
      }
    })
    .finally(() => { inFlight.delete(level); });

  inFlight.set(level, task);
  return task;
}

/**
 * Выдать count заданий уровня.
 *
 * Пустой пул — ждём генерацию: показывать нечего, значит и торопиться некуда.
 * Полупустой — пополняем в фоне, чтобы следующий заход не ждал.
 * Ничего не пришло — берём из запаса. Экран пустым не остаётся никогда.
 */
export async function takeTasks(level: Cefr, count: number): Promise<SentenceTask[]> {
  const list = pool.get(level)!;

  if (list.length === 0) await refill(level);
  else if (list.length < REFILL_AT) void refill(level);

  const out: RawTask[] = [];
  while (out.length < count && list.length > 0) out.push(list.shift()!);

  // Запас: и когда модель недоступна, и когда пачки не хватило на count.
  if (out.length < count) {
    const seeds = SEED_TASKS[level];
    for (let i = 0; out.length < count; i++) {
      out.push(seeds[i % seeds.length]!);
      if (i > seeds.length * 2) break; // не крутим бесконечно на пустом уровне
    }
  }

  const history = seen.get(level)!;
  for (const t of out) history.push(t.en);
  if (history.length > SEEN_LIMIT) history.splice(0, history.length - SEEN_LIMIT);

  // Сид плиток свой у каждого задания, но детерминированный: одно и то же
  // задание раскладывается одинаково при повторном запросе.
  return out.map((raw, i) => dress(raw, level, hashSeed(raw.en) + i));
}

/** Число из строки: нужен стабильный сид на предложение. */
function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Доступна ли генерация. Клиенту знать не нужно, а в логах старта полезно. */
export function generationAvailable(): boolean {
  return getOpenAI() !== null;
}

/** Запас — для тестов: он обязан соответствовать тем же правилам уровня. */
export const SEEDS_FOR_TESTS = SEED_TASKS;
