// Seed script: creates a ready-to-use teacher and student, linked together,
// with verified email — so you can log in under both roles without registering.
//
// Run:  pnpm seed        (from repo root, after `pnpm db:push`)
//
// Idempotent: safe to run multiple times (upserts by username).
import "./load-env";
import bcrypt from "bcryptjs";
import { db, pool, usersTable, teacherStudentsTable, parentChildrenTable, friendshipsTable } from "@workspace/db";
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

async function main() {
  const teacherId = await upsertUser(TEACHER, "teacher");
  const studentId = await upsertUser(STUDENT, "student", "beginner");

  // Link teacher <-> student (accepted). Unique on (teacherId, studentId).
  await db
    .insert(teacherStudentsTable)
    .values({ teacherId, studentId, status: "accepted" })
    .onConflictDoNothing();

  const parentId = await upsertUser(PARENT, "parent");

  // Родитель ↔ ребёнок (студент): даёт родителю доступ к прогрессу ученика.
  await db
    .insert(parentChildrenTable)
    .values({ parentId, studentId })
    .onConflictDoNothing();

  // Дружба родителя с учителем и учеником (accepted), чтобы у всех появилась
  // кнопка чата в разделе «Друзья». Unique on (requesterId, addresseeId).
  await db
    .insert(friendshipsTable)
    .values([
      { requesterId: parentId, addresseeId: teacherId, status: "accepted" },
      { requesterId: parentId, addresseeId: studentId, status: "accepted" },
    ])
    .onConflictDoNothing();

  // Готовые колоды флеш-карточек (идемпотентно)
  await seedFlashcards();

  console.log("\n✅ Seed complete. Test accounts (login = username):\n");
  console.log(`  👩‍🏫  Teacher  →  username: ${TEACHER.username}   password: ${TEACHER.password}  (id ${teacherId})`);
  console.log(`  🦊  Student  →  username: ${STUDENT.username}   password: ${STUDENT.password}  (id ${studentId})`);
  console.log(`  👩  Parent   →  username: ${PARENT.username}   password: ${PARENT.password}  (id ${parentId})`);
  console.log("\n  Teacher and student are linked (status: accepted).");
  console.log("  Parent is linked to the student and is friends with teacher & student.");
  console.log("  Tip: log in as teacher in one browser, student in an incognito window.\n");
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
