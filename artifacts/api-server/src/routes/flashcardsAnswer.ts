// Проверка свободного ответа: письмом и голосом.
//
// Упражнения с выбором клиент проверяет сам — правильный вариант известен по
// answerIndex, спорить не о чем. Со свободным ответом иначе: «Кот.» и «кот» —
// один ответ, «кудрявй» — опечатка, а не ошибка, и решать это должно одно
// место, иначе веб и натив разойдутся в трактовке, а ребёнок получит разные
// оценки за один и тот же ответ на разных устройствах.
//
// Маршрут ничего не пишет в БД. Он отвечает на единственный вопрос «засчитано
// ли», а оценку, интервалы и очки по-прежнему считает POST /flashcards/review:
// клиент шлёт туда итог (correct + attempts), как для любого упражнения.
//
// Отдельный файл, а не строчка в flashcards.ts: тот уже на 2000 строк, и класть
// туда независимый маршрут — только затруднять чтение обоим.
import { Router } from "express";
import { db } from "@workspace/db";
import { wordsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { SPEAK_MAX_ATTEMPTS, checkSpoken, checkWritten } from "../lib/answerCheck";

const router = Router();

/** Ответ длиннее этого — не ответ, а вставленный текст. */
const MAX_ANSWER_LEN = 200;

// ── POST /flashcards/check-answer ───────────────────────────────────────────
//
// Тело запроса:
//   wordId  — какое слово проверяем;
//   mode    — "typeRu" | "typeEn" | "speak";
//   given   — что написал или сказал ученик (для speak — расшифровка);
//   attempt — номер попытки, начиная с 1 (нужен только для speak).
//
// Эталон берём из базы по wordId, а не из тела запроса: иначе клиент мог бы
// прислать свой «правильный ответ» и засчитать себе что угодно.
router.post("/flashcards/check-answer", requireAuth, async (req, res) => {
  const body = req.body as { wordId?: unknown; mode?: unknown; given?: unknown; attempt?: unknown };
  const wordId = Number(body.wordId);
  const mode = String(body.mode ?? "");
  const given = typeof body.given === "string" ? body.given.slice(0, MAX_ANSWER_LEN) : "";
  const attempt = Math.max(1, Math.round(Number(body.attempt) || 1));

  if (!Number.isInteger(wordId) || wordId <= 0) {
    res.status(400).json({ error: "Некорректный номер слова" });
    return;
  }
  if (mode !== "typeRu" && mode !== "typeEn" && mode !== "speak") {
    res.status(400).json({ error: "mode: ожидается typeRu, typeEn или speak" });
    return;
  }

  const [word] = await db
    .select({
      english: wordsTable.english,
      translationsRu: wordsTable.translationsRu,
    })
    .from(wordsTable)
    .where(eq(wordsTable.id, wordId));
  if (!word) {
    res.status(404).json({ error: "Слово не найдено" });
    return;
  }

  // Для перевода на русский принимаем ЛЮБОЙ перевод карточки: ребёнок,
  // написавший второй по списку, ответил правильно.
  const expected =
    mode === "typeRu"
      ? (word.translationsRu as string[]).map((t) => String(t).trim()).filter(Boolean)
      : [word.english.trim()];

  if (expected.length === 0) {
    // Карточка без перевода — не повод засчитывать ошибку ребёнку.
    res.json({ correct: true, typo: false, expected: [], degraded: true });
    return;
  }

  if (mode === "speak") {
    const verdict = checkSpoken(given, expected, attempt, SPEAK_MAX_ATTEMPTS);
    res.json({
      correct: verdict.correct,
      typo: verdict.typo,
      // Попытки ещё есть — клиент просит повторить и НЕ отправляет /review.
      retry: verdict.retry,
      attemptsLeft: verdict.attemptsLeft,
      maxAttempts: SPEAK_MAX_ATTEMPTS,
      expected,
      matched: verdict.matched,
    });
    return;
  }

  const verdict = checkWritten(given, expected);
  res.json({
    correct: verdict.correct,
    typo: verdict.typo,
    expected,
    matched: verdict.matched,
  });
});

export default router;
