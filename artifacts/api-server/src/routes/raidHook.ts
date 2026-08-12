// ─────────────────────────────────────────────────────────────────────────────
// Перехват ответов тренажёров: превращает верный ответ в удар по боссу.
//
// ── Почему перехватчик, а не правка тренажёров ──────────────────────────────
// Урон нужно снимать со ВСЕХ упражнений приложения: слова, формы глаголов,
// времена, сборка предложений, и дальше со всех, которые появятся. Вписать
// вызов рейда в каждый обработчик ответа — значит размазать одну механику по
// пяти файлам и обязать каждый следующий тренажёр помнить про рейд.
//
// Здесь рейд подключается снаружи, одним слоем: он читает уже готовый ответ
// сервера, дописывает к нему поле raid и на этом всё. Тренажёры о рейде не
// знают вовсе — выключить событие можно снятием одной строки в routes/index.ts.
//
// ── Как это работает ────────────────────────────────────────────────────────
// res.json подменяется на свою версию. Тело ответа к этому моменту уже
// посчитано, поэтому отправку можно на мгновение отложить: сначала считаем
// урон, потом отдаём ответ с полем raid. Любая ошибка внутри — отдаём исходный
// ответ как есть: рейд не имеет права ломать проверку ответа ученика.
//
// Слой обязан стоять ДО тренажёров в routes/index.ts, иначе подменять будет
// уже нечего.
// ─────────────────────────────────────────────────────────────────────────────
import type { RequestHandler } from "express";
import { findTask } from "../lib/grammar/engine";
import { recordRaidHit, type RaidDifficulty, type RaidTag } from "../lib/raid";

/** Что за упражнение пришло из раздела «Слова». */
function wordExercise(mode: unknown): { difficulty: RaidDifficulty; tags: RaidTag[] } | null {
  switch (mode) {
    // Знакомство — не задание: там нет верного и неверного.
    case "intro":
      return null;
    case "choiceRu":
    case "choiceEn":
      return { difficulty: "easy", tags: ["vocab"] };
    case "listen":
      return { difficulty: "easy", tags: ["listening", "vocab"] };
    case "build":
      return { difficulty: "medium", tags: ["vocab", "wordorder"] };
    case "typeRu":
    case "typeEn":
      return { difficulty: "medium", tags: ["vocab", "synonyms"] };
    case "speak":
      return { difficulty: "hard", tags: ["pronunciation", "vocab"] };
    default:
      // Режим не пришёл: считаем самым дешёвым. Завысить сложность подделкой
      // нельзя — тот же принцип, что у ставок очков в грамматике.
      return { difficulty: "easy", tags: ["vocab"] };
  }
}

/** Что за задание пришло из раздела «Составлять». */
function grammarExercise(
  taskId: unknown,
  input: unknown,
): { difficulty: RaidDifficulty; tags: RaidTag[] } {
  const difficulty: RaidDifficulty =
    input === "assemble" ? "hard" : input === "type" ? "medium" : "easy";

  // Вид задания читаем строкой, а не сравнением с литералами движка: формат
  // номеров заданий — внутреннее дело банка, и рейд не должен от него зависеть.
  const found = typeof taskId === "string" ? findTask(taskId) : null;
  const kind = found ? String((found as { kind?: unknown }).kind ?? "") : "";

  const tags: RaidTag[] =
    kind === "tense" || kind === "verbs"
      ? ["grammar", "tenses"]
      : kind === "build"
        ? ["grammar", "wordorder", "phrasal"]
        : ["grammar"];

  return { difficulty, tags };
}

/** Ответ тренажёра → удар. null, если этот ответ ударом не считается. */
async function damageFor(
  path: string,
  body: Record<string, unknown>,
  payload: Record<string, unknown>,
  userId: number,
): Promise<unknown> {
  if (path.endsWith("/flashcards/review")) {
    const kind = wordExercise(body["mode"]);
    if (!kind) return null;
    // Оценку ставит сервер, поэтому верность берём из ОТВЕТА, а не из запроса.
    const grade = payload["grade"];
    if (typeof grade !== "string") return null;
    return await recordRaidHit({
      userId,
      correct: grade !== "again",
      difficulty: kind.difficulty,
      tags: kind.tags,
    });
  }

  if (path.endsWith("/grammar/check")) {
    const correct = payload["correct"];
    if (typeof correct !== "boolean") return null;
    const kind = grammarExercise(body["taskId"], body["input"]);
    return await recordRaidHit({
      userId,
      correct,
      difficulty: kind.difficulty,
      tags: kind.tags,
    });
  }

  return null;
}

const HOOKED = ["/flashcards/review", "/grammar/check"];

export const raidHook: RequestHandler = (req, res, next) => {
  if (req.method !== "POST" || !HOOKED.some((p) => req.path.endsWith(p))) {
    next();
    return;
  }

  const original = res.json.bind(res);
  let done = false;

  res.json = ((payload: unknown) => {
    if (done) return res;
    done = true;

    // Пользователя в запрос кладёт requireAuth, и к этому моменту он уже там:
    // подмена срабатывает после обработчика, а не до него.
    const userId = (req as unknown as { user?: { userId?: number } }).user?.userId;

    // Ошибки, не-объекты и неавторизованные ответы уходят как есть.
    if (res.statusCode >= 400 || !payload || typeof payload !== "object" || !userId) {
      original(payload);
      return res;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    void damageFor(req.path, body, payload as Record<string, unknown>, userId)
      .then((raid) => {
        original(raid ? { ...(payload as Record<string, unknown>), raid } : payload);
      })
      .catch(() => {
        original(payload);
      });

    return res;
  }) as typeof res.json;

  next();
};

export default raidHook;
