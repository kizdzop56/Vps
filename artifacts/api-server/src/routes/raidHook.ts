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
// Практика ВНУТРИ рейда (POST /raid/answer) сюда не попадает: она сама вызывает
// recordRaidHit, потому что там урон это смысл ответа, а не побочный эффект.
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
import { recordRaidHit } from "../lib/raid";
import { grammarTaskKind, wordTaskKind } from "../lib/raidTags";

/** Ответ тренажёра → удар. null, если этот ответ ударом не считается. */
async function damageFor(
  path: string,
  body: Record<string, unknown>,
  payload: Record<string, unknown>,
  userId: number,
): Promise<unknown> {
  if (path.endsWith("/flashcards/review")) {
    const kind = wordTaskKind(body["mode"]);
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
    const taskId = body["taskId"];
    const found = typeof taskId === "string" ? findTask(taskId) : null;
    const kind = grammarTaskKind(
      found ? String((found as { kind?: unknown }).kind ?? "") : "",
      body["input"],
    );
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
