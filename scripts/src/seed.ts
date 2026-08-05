// Seed script: creates a ready-to-use teacher and students, linked together,
// with verified email — so you can log in under all roles without registering.
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

  // Готовые колоды флеш-карточек (идемпотентно)
  await seedFlashcards();

  console.log("\n✅ Seed complete. Test accounts (login = username):\n");
  console.log(`  👩‍🏫  Teacher   →  username: ${TEACHER.username}    password: ${TEACHER.password}   (id ${teacherId})`);
  console.log(`  🦊  Student   →  username: ${STUDENT.username}    password: ${STUDENT.password}   (id ${studentId})`);
  console.log(`  🐬  Student 2 →  username: ${STUDENT2.username}   password: ${STUDENT2.password}  (id ${student2Id})`);
  console.log(`  👩  Parent    →  username: ${PARENT.username}     password: ${PARENT.password}    (id ${parentId})`);
  console.log("\n  Оба ученика привязаны к учителю (status: accepted) и дружат между собой.");
  console.log("  Родитель связан с первым учеником и дружит с учителем и учеником.");
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
