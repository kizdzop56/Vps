// ─────────────────────────────────────────────────────────────────────────────
// Перехват ответов тренажёров: раньше превращал любой верный ответ ученика (в
// разделе «Учёба») в удар по рейд-боссу, независимо от того, где ученик
// отвечал.
//
// ОТКЛЮЧЕНО. Урон по боссу теперь наносится ТОЛЬКО из заданий самого рейда
// (POST /raid/answer, см. routes/raid.ts — он сам вызывает recordRaidHit).
// Раньше любой верный ответ в словах, формах глаголов или временах ВНЕ вкладки
// «Рейд» тоже засчитывался как удар — ученик заходил учить слова, а на экране
// прилетал урон по боссу, будто он в бою. Это путало: «Учёба» и «Рейд» —
// разные занятия, и очки одного не должны молча перетекать в другой.
//
// Файл и механизм оставлены НЕ УДАЛЁННЫМИ намеренно: если понадобится другая
// форма побочного урона (например, только по явной кнопке внутри «Учёбы»),
// перехватчик не придётся писать заново. HOOKED пуст — middleware, даже если
// его случайно смонтируют снова (routes/index.ts), не сделает ничего.
//
// Чтобы вернуть старое поведение полностью: верните пути в HOOKED и
// раскомментируйте router.use(raidHook) в routes/index.ts.
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

/**
 * Пути, которые перехватываются. Пуст намеренно — см. шапку файла: удар по
 * боссу теперь наносится только из POST /raid/answer, а не отсюда.
 */
const HOOKED: string[] = [];

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
