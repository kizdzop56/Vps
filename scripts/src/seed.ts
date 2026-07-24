// Seed script: creates a ready-to-use teacher and student, linked together,
// with verified email — so you can log in under both roles without registering.
//
// Run:  pnpm seed        (from repo root, after `pnpm db:push`)
//
// Idempotent: safe to run multiple times (upserts by username).
import "./load-env";
import bcrypt from "bcryptjs";
import { db, pool, usersTable, teacherStudentsTable } from "@workspace/db";

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

type KnowledgeLevel =
  | "starter"
  | "beginner"
  | "elementary"
  | "intermediate"
  | "upper_intermediate";

async function upsertUser(
  u: typeof TEACHER,
  role: "teacher" | "student",
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

  console.log("\n✅ Seed complete. Test accounts (login = username):\n");
  console.log(`  👩‍🏫  Teacher  →  username: ${TEACHER.username}   password: ${TEACHER.password}  (id ${teacherId})`);
  console.log(`  🦊  Student  →  username: ${STUDENT.username}   password: ${STUDENT.password}  (id ${studentId})`);
  console.log("\n  Teacher and student are linked (status: accepted).");
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
