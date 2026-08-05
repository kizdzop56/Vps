// ─────────────────────────────────────────────────────────────────────────────
// Демо-активность для тестового ученика (student2).
//
// Зачем: пустой профиль нечего смотреть. Средний балл «—», кольца заданий
// пустые, витрина наград без медалей, график времени по нулям — по такому
// экрану нельзя судить ни о вёрстке, ни о том, как всё выглядит «в жизни».
//
// Скрипт наполняет ОДНОГО ученика правдоподобной историей за последние две
// недели: сдачи заданий разных типов с разными баллами, учебные сессии,
// повторения слов и, как следствие, очки и медали.
//
// Всё идемпотентно: повторный запуск не плодит дубликаты (проверяем, есть ли
// уже данные), поэтому его безопасно звать при каждом деплое из seed.ts.
//
// ВАЖНО: трогаем только student2. Первый ученик остаётся чистым — на нём
// удобно смотреть пустые состояния экранов.
// ─────────────────────────────────────────────────────────────────────────────
import {
  db,
  usersTable,
  assignmentsTable,
  assignedTasksTable,
  submissionsTable,
  timeSessionsTable,
  userAchievementsTable,
  decksTable,
  wordsTable,
  userCardStateTable,
  reviewLogTable,
  flashcardSettingsTable,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";

/** Сколько дней истории рисуем. Ровно две недели: столько показывает график. */
const DAYS = 14;

/** Начало дня N дней назад, плюс смещение в часах. */
function daysAgo(days: number, hour = 12): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/**
 * Демо-задания. Типы намеренно разные: кольца на профиле рисуются по типам,
 * и с одним типом график выглядит сломанным.
 *
 * Баллы подобраны так, чтобы средний вышел «живым» (не 100% и не 0):
 * есть отличные работы, есть средние, есть одна проваленная.
 */
const DEMO_ASSIGNMENTS: {
  title: string;
  description: string;
  type: "text_test" | "audio" | "reading" | "video" | "free_form";
  points: number;
  score: number;
  daysAgo: number;
}[] = [
  { title: "Present Simple: базовый тест", description: "Утверждения, вопросы и отрицания.", type: "text_test", points: 20, score: 95, daysAgo: 13 },
  { title: "Аудирование: в кафе", description: "Диалог с официантом, вопросы на понимание.", type: "audio", points: 25, score: 80, daysAgo: 12 },
  { title: "Чтение: My Family", description: "Короткий текст и вопросы к нему.", type: "reading", points: 15, score: 100, daysAgo: 11 },
  { title: "Неправильные глаголы", description: "Три формы: 20 самых частых глаголов.", type: "text_test", points: 30, score: 65, daysAgo: 9 },
  { title: "Видео: About My Day", description: "Ролик и задания на понимание речи.", type: "video", points: 25, score: 88, daysAgo: 8 },
  { title: "Расскажи о выходных", description: "Свободный ответ, 5–7 предложений.", type: "free_form", points: 20, score: 75, daysAgo: 6 },
  { title: "Чтение: The Lost Cat", description: "Рассказ уровня A2 и вопросы.", type: "reading", points: 20, score: 90, daysAgo: 5 },
  { title: "Артикли a / an / the", description: "Выбор артикля в предложениях.", type: "text_test", points: 20, score: 45, daysAgo: 4 },
  { title: "Аудирование: расписание", description: "Объявления на вокзале, числа и время.", type: "audio", points: 25, score: 100, daysAgo: 2 },
  { title: "Present Continuous", description: "Что происходит прямо сейчас.", type: "text_test", points: 20, score: 85, daysAgo: 1 },
];

/** Минуты занятий по дням: не ровная линия, есть пропуски и всплески. */
const MINUTES_BY_DAY = [35, 20, 0, 45, 25, 30, 0, 15, 50, 40, 20, 0, 35, 28];

/** Награды, которые ученик заслужил своей историей. Условия проверены ниже. */
const DEMO_ACHIEVEMENTS = [
  "welcome", "tasks_1", "tasks_3", "tasks_5", "tasks_10",
  "points_10", "points_50", "points_100", "points_500",
  "perfect_1", "time_30", "time_120", "xp_5", "streak_3", "streak_7",
];

/**
 * Наполняет профиль ученика активностью.
 * @param username логин ученика, которому рисуем историю
 * @param teacherUsername учитель, от чьего имени выданы задания
 */
export async function seedDemoActivity(username: string, teacherUsername: string) {
  const [student] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.username, username));
  const [teacher] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.username, teacherUsername));

  if (!student || !teacher) {
    console.log(`[demo] пропуск: нет пользователя ${username} или ${teacherUsername}`);
    return;
  }

  const studentId = student.id;
  const teacherId = teacher.id;

  // Уже наполняли — второй раз не нужно. Проверяем по сдачам: это то, ради
  // чего скрипт и существует.
  const [existing] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(submissionsTable)
    .where(eq(submissionsTable.studentId, studentId));
  if ((existing?.n ?? 0) > 0) {
    console.log(`[demo] у ${username} уже есть активность — пропускаю`);
    return;
  }

  // ── 1. Задания и сдачи ────────────────────────────────────────────────
  let totalPoints = 0;

  for (const item of DEMO_ASSIGNMENTS) {
    const createdAt = daysAgo(item.daysAgo + 1, 10);

    // Задание может уже существовать от прошлых запусков — ищем по названию
    // и автору, чтобы не плодить копии в списке заданий учителя.
    const [found] = await db.select({ id: assignmentsTable.id })
      .from(assignmentsTable)
      .where(and(
        eq(assignmentsTable.title, item.title),
        eq(assignmentsTable.createdBy, teacherId),
      ));

    let assignmentId = found?.id;
    if (!assignmentId) {
      const [row] = await db.insert(assignmentsTable).values({
        title: item.title,
        description: item.description,
        type: item.type,
        source: "teacher_created",
        createdBy: teacherId,
        points: item.points,
        isDraft: false,
        createdAt,
        updatedAt: createdAt,
      }).returning({ id: assignmentsTable.id });
      assignmentId = row!.id;
    }

    await db.insert(assignedTasksTable).values({
      assignmentId,
      studentId,
      teacherId,
      assignedAt: createdAt,
    }).onConflictDoNothing();

    // Очки за работу пропорциональны баллу: 100% — вся стоимость задания.
    const earned = Math.round((item.points * item.score) / 100);
    totalPoints += earned;

    await db.insert(submissionsTable).values({
      studentId,
      assignmentId,
      score: item.score,
      correctCount: Math.round(item.score / 10),
      totalQuestions: 10,
      pointsEarned: earned,
      // free_form проверяет учитель вручную — оставляем одну работу «на
      // проверке», чтобы это состояние тоже было видно на графике.
      status: item.type === "free_form" ? "pending" : "graded",
      submittedAt: daysAgo(item.daysAgo, 17),
    });
  }

  // ── 2. Время в приложении ─────────────────────────────────────────────
  let totalMinutes = 0;
  const sessions: { studentId: number; startedAt: Date; endedAt: Date; durationMinutes: number }[] = [];

  for (let i = 0; i < DAYS; i++) {
    const minutes = MINUTES_BY_DAY[i] ?? 0;
    if (minutes === 0) continue;
    // Часть занятий утренние: они дают награду «Жаворонок» и оживляют
    // статистику по времени суток.
    const hour = i % 4 === 0 ? 8 : 17;
    const startedAt = daysAgo(DAYS - 1 - i, hour);
    const endedAt = new Date(startedAt.getTime() + minutes * 60_000);
    sessions.push({ studentId, startedAt, endedAt, durationMinutes: minutes });
    totalMinutes += minutes;
  }

  if (sessions.length > 0) {
    await db.insert(timeSessionsTable).values(sessions);
  }

  // ── 3. Слова: прогресс по карточкам ───────────────────────────────────
  // Берём слова из готовых колод — они уже засеяны seed-flashcards.
  const words = await db
    .select({ id: wordsTable.id })
    .from(wordsTable)
    .innerJoin(decksTable, eq(decksTable.id, wordsTable.deckId))
    .where(eq(decksTable.isSystem, true))
    .limit(40);

  if (words.length > 0) {
    const states = words.map((w, i) => {
      // Первые 22 слова выучены (уровень 5), остальные в работе.
      const learned = i < 22;
      const level = learned ? 5 : (i % 4) + 1;
      const seen = learned ? 6 + (i % 3) : 2 + (i % 3);
      const createdAt = daysAgo(DAYS - Math.min(i, DAYS - 1), 18);
      return {
        userId: studentId,
        wordId: w.id,
        memoryLevel: level,
        // Выученные всплывут нескоро, остальные — на днях.
        dueAt: new Date(Date.now() + (learned ? 6 : 1) * 86_400_000),
        introduced: true,
        timesSeen: seen,
        timesCorrect: learned ? seen : Math.max(1, seen - 1),
        lapses: learned ? 0 : (i % 3 === 0 ? 1 : 0),
        lastResult: "know",
        createdAt,
        updatedAt: createdAt,
      };
    });

    await db.insert(userCardStateTable).values(states).onConflictDoNothing();

    // Журнал повторений: по нему строится график «слова по дням» и считается
    // цель дня. Раскидываем по последним двум неделям.
    const logs = words.flatMap((w, i) => {
      const day = i % DAYS;
      const learned = i < 22;
      return [{
        userId: studentId,
        wordId: w.id,
        result: "know" as const,
        memoryLevelAfter: learned ? 5 : (i % 4) + 1,
        reviewedAt: daysAgo(day, 18),
      }];
    });
    await db.insert(reviewLogTable).values(logs);

    // Настройки карточек: без строки цель дня по словам покажет ноль.
    await db.insert(flashcardSettingsTable).values({
      userId: studentId,
      dailyNewLimit: 12,
      dailyWordGoal: 10,
      placementLevel: "A2",
      placementDone: true,
    }).onConflictDoNothing();
  }

  // ── 4. Очки, серия, уровень ───────────────────────────────────────────
  // Очки: за задания плюс ежедневные заходы. Серия 8 дней подряд — этого
  // хватает на награды streak_3 и streak_7.
  const loginPoints = 8 * 30 + 105; // 8 дней входа + бонусы за серию
  const finalPoints = totalPoints + loginPoints;
  const today = new Date().toISOString().split("T")[0]!;

  await db.update(usersTable).set({
    totalPoints: finalPoints,
    totalTimeMinutes: totalMinutes,
    loginStreak: 8,
    lastLoginDate: today,
    // Уровень пересчитает сервер при первом заходе (sync-xp-level),
    // но ставим сразу, чтобы профиль не выглядел первым уровнем.
    xpLevel: 6,
    bio: "Люблю сериалы на английском и мечтаю поехать в Лондон.",
    interests: ["Кино", "Музыка", "Путешествия", "Животные"],
    updatedAt: new Date(),
  }).where(eq(usersTable.id, studentId));

  // ── 5. Медали ─────────────────────────────────────────────────────────
  // Записываем только те, чьи условия реально выполнены накрученной историей:
  // сервер при следующем заходе проверит их заново (см. ACHIEVEMENT_CONDITIONS
  // в routes/gamification.ts), и лишние всё равно не удержались бы.
  const rows = DEMO_ACHIEVEMENTS.map((achievementId, i) => ({
    userId: studentId,
    achievementId,
    unlockedAt: daysAgo(DAYS - i, 19),
  }));
  await db.insert(userAchievementsTable).values(rows).onConflictDoNothing();

  console.log(
    `[demo] ${username}: ${DEMO_ASSIGNMENTS.length} работ, ${totalMinutes} мин, ` +
    `${finalPoints} очков, ${DEMO_ACHIEVEMENTS.length} наград`,
  );
}
