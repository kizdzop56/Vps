// Seed script: creates a ready-to-use teacher and students, linked together,
// with verified email — so you can log in under all roles without registering.
//
// Run:  pnpm seed        (from repo root, after `pnpm db:push`)
//
// Idempotent: safe to run multiple times (upserts by username).
import "./load-env";
import bcrypt from "bcryptjs";
import { eq, and, asc } from "drizzle-orm";
import {
  db, pool,
  usersTable, teacherStudentsTable, parentChildrenTable, friendshipsTable,
  assignmentsTable, submissionsTable,
  wordsTable, userCardStateTable, flashcardSettingsTable,
} from "@workspace/db";
import { seedFlashcards } from "./seed-flashcards";

const TEACHER = {
  username: "teacher",
  password: "teacher123",
  name: "Мария",
  surname: "Иванова",
  email: "teacher@example.com",
  avatarEmoji: "👩‍🏫",
  avatarColor: "#7c3aed",
};

const STUDENT = {
  username: "student",
  password: "student123",
  name: "Алекс",
  surname: "Петров",
  email: "student@example.com",
  avatarEmoji: "🦊",
  avatarColor: "#6366f1",
};

// Второй ученик. Нужен, чтобы проверять то, что в одиночку не проверишь:
// чужой профиль, рейтинг, заявки в друзья, отправку колод разным ученикам.
// Привязан к тому же учителю и дружит с первым учеником, поэтому обе стороны
// сразу видят друг друга без ручных действий.
const STUDENT2 = {
  username: "student2",
  password: "student2123",
  name: "Даша",
  surname: "Круглова",
  email: "student2@example.com",
  avatarEmoji: "🐬",
  avatarColor: "#ec4899",
};

// Тестовый родитель: связан со студентом как ребёнком и добавлен в друзья к
// учителю и ученику, чтобы у обоих в разделе «Друзья» появилась кнопка чата.
const PARENT = {
  username: "parent",
  password: "parent123",
  name: "Ольга",
  surname: "Петрова",
  email: "parent@example.com",
  avatarEmoji: "👩",
  avatarColor: "#0ea5e9",
};

type KnowledgeLevel =
  | "starter"
  | "beginner"
  | "elementary"
  | "intermediate"
  | "upper_intermediate";

async function upsertUser(
  u: typeof TEACHER,
  role: "teacher" | "student" | "parent",
  knowledgeLevel?: KnowledgeLevel,
): Promise<number> {
  const passwordHash = await bcrypt.hash(u.password, 12);
  const [row] = await db
    .insert(usersTable)
    .values({
      username: u.username,
      passwordHash,
      name: u.name,
      surname: u.surname,
      role,
      email: u.email,
      emailVerified: "true",
      avatarEmoji: u.avatarEmoji,
      avatarColor: u.avatarColor,
      knowledgeLevel,
    })
    .onConflictDoUpdate({
      target: usersTable.username,
      set: { passwordHash, role, emailVerified: "true" },
    })
    .returning({ id: usersTable.id });
  return row.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Тестовые ученики «как настоящие»
//
// Зачем. Чужой профиль (app/(main)/friend/[id].tsx) показывает уровень, серию
// входов, выученные слова, срезы успеваемости по периодам и витрину наград.
// Проверить это было не на ком: и Алекс, и Даша заводятся с нулями, поэтому
// любой профиль выглядел одинаково пусто. Эти трое дают три разные картинки —
// крепкий середняк, новичок и «звезда» с максимумом медалей.
//
// Данные пишутся ровно в те таблицы, откуда их читает приложение:
//   users.total_points / total_time_minutes / login_streak → шапка и награды;
//   user_card_state (memory_level ≥ 4)                     → «слов выучено»;
//   submissions                                            → «Успеваемость»
//                                                             и кольца заданий;
//   flashcard_settings.placement_level                     → CEFR у учителя.
// ─────────────────────────────────────────────────────────────────────────────

type DemoStudent = {
  username: string;
  password: string;
  name: string;
  surname: string;
  email: string;
  avatarEmoji: string;
  avatarColor: string;
  knowledgeLevel: KnowledgeLevel;
  dateOfBirth: string;
  age: number;
  bio: string;
  interests: string[];
  totalPoints: number;
  totalTimeMinutes: number;
  loginStreak: number;
  /** Сколько слов довести до уровня «выучено». */
  wordsLearned: number;
  placementLevel: string;
  /** Сколько сдач сгенерировать за последние 45 дней. */
  submissions: number;
  /** Границы оценок: [минимум, максимум]. */
  scoreRange: [number, number];
  dailyGoalMinutes: number;
};

const DEMO_STUDENTS: DemoStudent[] = [
  {
    username: "kira",
    password: "kira123",
    name: "Кира",
    surname: "Соколова",
    email: "kira@example.com",
    avatarEmoji: "🦄",
    avatarColor: "#a855f7",
    knowledgeLevel: "intermediate",
    dateOfBirth: "2013-04-18",
    age: 13,
    bio: "Учу английский, чтобы смотреть сериалы без субтитров. Разбираю песни по строчкам и веду словарик любимых фраз.",
    interests: ["Кино", "Музыка", "Путешествия", "Рисование"],
    totalPoints: 2480,
    totalTimeMinutes: 1840,
    loginStreak: 21,
    wordsLearned: 180,
    placementLevel: "B1",
    submissions: 24,
    scoreRange: [70, 100],
    dailyGoalMinutes: 20,
  },
  {
    username: "timur",
    password: "timur123",
    name: "Тимур",
    surname: "Ахметов",
    email: "timur@example.com",
    avatarEmoji: "🐲",
    avatarColor: "#6366f1",
    knowledgeLevel: "elementary",
    dateOfBirth: "2015-09-02",
    age: 10,
    bio: "Играю в игры на английском и стараюсь понимать без перевода. Пока трудно с временами, но я не сдаюсь.",
    interests: ["Игры", "Футбол", "Космос"],
    totalPoints: 1120,
    totalTimeMinutes: 760,
    loginStreak: 9,
    wordsLearned: 95,
    placementLevel: "A2",
    submissions: 12,
    scoreRange: [52, 92],
    dailyGoalMinutes: 15,
  },
  {
    username: "liya",
    password: "liya123",
    name: "Лия",
    surname: "Новак",
    email: "liya@example.com",
    avatarEmoji: "🦋",
    avatarColor: "#d946ef",
    knowledgeLevel: "upper_intermediate",
    dateOfBirth: "2011-01-27",
    age: 15,
    bio: "Готовлюсь к экзамену и веду дневник на английском. Больше всего люблю аудирование — там слышно живую речь.",
    interests: ["Книги", "Наука", "Театр", "Животные", "Кулинария"],
    totalPoints: 5300,
    totalTimeMinutes: 3620,
    loginStreak: 47,
    wordsLearned: 340,
    placementLevel: "B2",
    submissions: 41,
    scoreRange: [80, 100],
    dailyGoalMinutes: 30,
  },
];

// Пороги уровней — копия XP_THRESHOLDS из routes/gamification.ts. Держим
// xp_level согласованным с очками, иначе рейтинг и профиль разойдутся.
const XP_THRESHOLDS = [
  0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200,
  4100, 5200, 6500, 8000, 9800, 11800, 14000, 16500, 19500, 23000,
  27000, 31500, 36500, 42000, 48000, 55000, 63000, 72000, 82000, 93000,
  105000, 118000, 132000, 147000, 163000, 180000, 198000, 217000, 237000, 258000,
  280000, 303000, 327000, 352000, 378000, 405000, 433000, 462000, 492000, 523000,
];

function computeLevel(xp: number): number {
  let level = 1;
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]!) level = i + 1;
    else break;
  }
  return Math.min(level, 50);
}

/** Детерминированный генератор: повторный запуск сида даёт те же цифры. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Задания, по которым генерируются сдачи. Нужны как «подложка»: кольца на
// профиле рисуются по типам сдач, поэтому типов должно быть больше одного.
// Черновиками их делать нельзя — черновики ученику не видны.
const DEMO_ASSIGNMENTS: {
  title: string;
  description: string;
  type: "text_test" | "audio" | "reading" | "video" | "free_form";
  points: number;
}[] = [
  { title: "Present Simple: тренировка", description: "Короткий тест на времена.", type: "text_test", points: 20 },
  { title: "Аудирование: в кафе", description: "Послушай диалог и ответь на вопросы.", type: "audio", points: 25 },
  { title: "Чтение: история о щенке", description: "Прочитай текст и найди ответы.", type: "reading", points: 20 },
  { title: "Видео: школьный день", description: "Посмотри ролик и ответь на вопросы.", type: "video", points: 30 },
  { title: "Расскажи о своих выходных", description: "Свободный ответ: 5-7 предложений.", type: "free_form", points: 35 },
];

/** Создаёт демо-задания учителя один раз и возвращает их id. */
async function ensureDemoAssignments(teacherId: number): Promise<number[]> {
  const ids: number[] = [];
  for (const a of DEMO_ASSIGNMENTS) {
    const [existing] = await db
      .select({ id: assignmentsTable.id })
      .from(assignmentsTable)
      .where(and(eq(assignmentsTable.title, a.title), eq(assignmentsTable.createdBy, teacherId)));
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const [created] = await db
      .insert(assignmentsTable)
      .values({
        title: a.title,
        description: a.description,
        type: a.type,
        source: "teacher_created",
        createdBy: teacherId,
        points: a.points,
        isDraft: false,
      })
      .returning({ id: assignmentsTable.id });
    ids.push(created.id);
  }
  return ids;
}

/** Заводит демо-ученика со всеми цифрами, которые рисует профиль. */
async function upsertDemoStudent(demo: DemoStudent): Promise<number> {
  const passwordHash = await bcrypt.hash(demo.password, 12);
  const today = todayKey();
  const profile = {
    passwordHash,
    name: demo.name,
    surname: demo.surname,
    role: "student" as const,
    email: demo.email,
    emailVerified: "true",
    avatarEmoji: demo.avatarEmoji,
    avatarColor: demo.avatarColor,
    knowledgeLevel: demo.knowledgeLevel,
    dateOfBirth: demo.dateOfBirth,
    age: demo.age,
    bio: demo.bio,
    interests: demo.interests,
    totalPoints: demo.totalPoints,
    totalTimeMinutes: demo.totalTimeMinutes,
    loginStreak: demo.loginStreak,
    lastLoginDate: today,
    xpLevel: computeLevel(demo.totalPoints),
    dailyGoalMinutes: demo.dailyGoalMinutes,
    nextDailyGoalMinutes: demo.dailyGoalMinutes,
    dailyGoalAppliedDate: today,
  };

  const [row] = await db
    .insert(usersTable)
    .values({ username: demo.username, ...profile })
    .onConflictDoUpdate({ target: usersTable.username, set: profile })
    .returning({ id: usersTable.id });

  return row.id;
}

/** Доводит N слов до уровня «выучено» — так в шапке появляется счётчик слов. */
async function seedLearnedWords(studentId: number, howMany: number, placementLevel: string) {
  const words = await db
    .select({ id: wordsTable.id })
    .from(wordsTable)
    .orderBy(asc(wordsTable.id))
    .limit(howMany);

  if (words.length > 0) {
    // memory_level 4 и выше = выучено (см. WORDS.md и lib/srs.ts).
    // Часть слов кладём на 5, чтобы «точность» у учителя тоже ожила.
    await db
      .insert(userCardStateTable)
      .values(
        words.map((w, i) => ({
          userId: studentId,
          wordId: w.id,
          memoryLevel: i % 3 === 0 ? 5 : 4,
          introduced: true,
          timesSeen: 6 + (i % 5),
          timesCorrect: 5 + (i % 4),
          dueAt: new Date(Date.now() + (7 + (i % 21)) * 86_400_000),
        })),
      )
      .onConflictDoNothing();
  }

  await db
    .insert(flashcardSettingsTable)
    .values({ userId: studentId, placementLevel, placementDone: true })
    .onConflictDoUpdate({
      target: flashcardSettingsTable.userId,
      set: { placementLevel, placementDone: true, updatedAt: new Date() },
    });
}

/**
 * История сдач за последние 45 дней. Ровно ради неё в «Успеваемости» есть
 * смысл у переключателя Неделя / Месяц / Всё время: цифры в трёх режимах
 * должны отличаться.
 */
async function seedSubmissions(demo: DemoStudent, studentId: number, assignmentIds: number[]) {
  if (assignmentIds.length === 0) return;

  const [existing] = await db
    .select({ id: submissionsTable.id })
    .from(submissionsTable)
    .where(eq(submissionsTable.studentId, studentId))
    .limit(1);
  if (existing) return; // сдачи уже есть — второй раз не плодим

  const rnd = makeRandom(demo.username.length * 7919 + demo.submissions);
  const [minScore, maxScore] = demo.scoreRange;
  const rows = [] as {
    studentId: number;
    assignmentId: number;
    score: number;
    correctCount: number;
    totalQuestions: number;
    pointsEarned: number;
    status: string;
    submittedAt: Date;
  }[];

  for (let i = 0; i < demo.submissions; i++) {
    // Свежие работы плотнее: последняя неделя выглядит живой.
    const daysAgo = Math.floor(Math.pow(rnd(), 1.7) * 45);
    const score = Math.round(minScore + rnd() * (maxScore - minScore));
    const assignmentId = assignmentIds[i % assignmentIds.length]!;
    const totalQuestions = 10;
    rows.push({
      studentId,
      assignmentId,
      score,
      correctCount: Math.round((score / 100) * totalQuestions),
      totalQuestions,
      pointsEarned: Math.max(5, Math.round((score / 100) * 25)),
      status: "graded",
      submittedAt: new Date(Date.now() - daysAgo * 86_400_000 - Math.floor(rnd() * 12) * 3_600_000),
    });
  }

  await db.insert(submissionsTable).values(rows);
}

async function main() {
  const teacherId = await upsertUser(TEACHER, "teacher");
  const studentId = await upsertUser(STUDENT, "student", "beginner");
  const student2Id = await upsertUser(STUDENT2, "student", "elementary");

  // Оба ученика — у одного учителя (accepted). Unique on (teacherId, studentId).
  await db
    .insert(teacherStudentsTable)
    .values([
      { teacherId, studentId, status: "accepted" },
      { teacherId, studentId: student2Id, status: "accepted" },
    ])
    .onConflictDoNothing();

  const parentId = await upsertUser(PARENT, "parent");

  // Родитель ↔ ребёнок (первый студент): даёт доступ к прогрессу ученика.
  await db
    .insert(parentChildrenTable)
    .values({ parentId, studentId })
    .onConflictDoNothing();

  // Дружба: родитель с учителем и учеником, плюс ученики между собой —
  // так чужой профиль открывается сразу, без отправки и подтверждения заявки.
  await db
    .insert(friendshipsTable)
    .values([
      { requesterId: parentId, addresseeId: teacherId, status: "accepted" },
      { requesterId: parentId, addresseeId: studentId, status: "accepted" },
      { requesterId: studentId, addresseeId: student2Id, status: "accepted" },
    ])
    .onConflictDoNothing();

  // Готовые колоды флеш-карточек (идемпотентно). Обязательно ДО демо-учеников:
  // им нужны настоящие word_id, иначе выученные слова считать не из чего.
  await seedFlashcards();

  // ── Демо-ученики с активным профилем ──
  const assignmentIds = await ensureDemoAssignments(teacherId);
  const demoIds: { demo: DemoStudent; id: number }[] = [];

  for (const demo of DEMO_STUDENTS) {
    const id = await upsertDemoStudent(demo);
    demoIds.push({ demo, id });

    // Ученики того же учителя — видны в «Все ученики» и в его рейтинге.
    await db
      .insert(teacherStudentsTable)
      .values({ teacherId, studentId: id, status: "accepted" })
      .onConflictDoNothing();

    // Друзья основного ученика: чужой профиль открывается из «Друзей» одним
    // тапом, без поиска по коду и подтверждения заявки.
    await db
      .insert(friendshipsTable)
      .values({ requesterId: id, addresseeId: studentId, status: "accepted" })
      .onConflictDoNothing();

    await seedLearnedWords(id, demo.wordsLearned, demo.placementLevel);
    await seedSubmissions(demo, id, assignmentIds);
  }

  console.log("\n✅ Seed complete. Test accounts (login = username):\n");
  console.log(`  👩‍🏫  Teacher   →  username: ${TEACHER.username}    password: ${TEACHER.password}   (id ${teacherId})`);
  console.log(`  🦊  Student   →  username: ${STUDENT.username}    password: ${STUDENT.password}   (id ${studentId})`);
  console.log(`  🐬  Student 2 →  username: ${STUDENT2.username}   password: ${STUDENT2.password}  (id ${student2Id})`);
  console.log(`  👩  Parent    →  username: ${PARENT.username}     password: ${PARENT.password}    (id ${parentId})`);
  console.log("\n  Активные ученики (для проверки чужого профиля):");
  for (const { demo, id } of demoIds) {
    console.log(
      `  ${demo.avatarEmoji}  ${demo.name} ${demo.surname} →  username: ${demo.username}   password: ${demo.password}  (id ${id})` +
      `  · ${demo.totalPoints} очков · серия ${demo.loginStreak} · слов ${demo.wordsLearned} · сдач ${demo.submissions}`,
    );
  }
  console.log("\n  Оба ученика привязаны к учителю (status: accepted) и дружат между собой.");
  console.log("  Родитель связан с первым учеником и дружит с учителем и учеником.");
  console.log("  Кира, Тимур и Лия — друзья аккаунта student и ученики аккаунта teacher.");
  console.log("  Совет: учитель в обычном окне, ученик — в приватном.\n");
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌ Seed failed:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
