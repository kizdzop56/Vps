import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable, submissionsTable, friendshipsTable,
} from "@workspace/db";
import { eq, desc, count, avg, and, or } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";

const router = Router();

function calcAgeFromDOB(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

router.get("/leaderboard", requireAuth, async (req, res) => {
  const students = await db.select({
    userId: usersTable.id,
    name: usersTable.name,
    surname: usersTable.surname,
    username: usersTable.username,
    totalPoints: usersTable.totalPoints,
    avatarEmoji: usersTable.avatarEmoji,
    avatarColor: usersTable.avatarColor,
    avatarUrl: usersTable.avatarUrl,
  }).from(usersTable)
    .where(eq(usersTable.role, "student"))
    .orderBy(desc(usersTable.totalPoints));

  const withCounts = await Promise.all(students.map(async (s) => {
    const [result] = await db.select({ count: count() }).from(submissionsTable)
      .where(eq(submissionsTable.studentId, s.userId));
    return { ...s, completedAssignments: result?.count || 0 };
  }));

  res.json(withCounts.map((s, i) => ({ ...s, rank: i + 1 })));
});

router.get("/leaderboard/categories", requireAuth, async (req, res) => {
  const caller = getUser(req);
  const scope = (req.query["scope"] as string) || "all";
  const ageMin = req.query["ageMin"] !== undefined ? Number(req.query["ageMin"]) : null;
  const ageMax = req.query["ageMax"] !== undefined ? Number(req.query["ageMax"]) : null;

  let students = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    surname: usersTable.surname,
    username: usersTable.username,
    avatarEmoji: usersTable.avatarEmoji,
    avatarColor: usersTable.avatarColor,
    avatarUrl: usersTable.avatarUrl,
    totalPoints: usersTable.totalPoints,
    totalTimeMinutes: usersTable.totalTimeMinutes,
    age: usersTable.age,
    dateOfBirth: usersTable.dateOfBirth,
  }).from(usersTable).where(eq(usersTable.role, "student"));

  if (scope === "friends") {
    const rows = await db.select({
      requesterId: friendshipsTable.requesterId,
      addresseeId: friendshipsTable.addresseeId,
    }).from(friendshipsTable).where(
      and(
        or(
          eq(friendshipsTable.requesterId, caller.userId),
          eq(friendshipsTable.addresseeId, caller.userId),
        ),
        eq(friendshipsTable.status, "accepted"),
      )
    );
    const friendIds = new Set<number>(rows.map(r =>
      r.requesterId === caller.userId ? r.addresseeId : r.requesterId
    ));
    friendIds.add(caller.userId);
    students = students.filter(s => friendIds.has(s.id));
  }

  if (ageMin !== null || ageMax !== null) {
    students = students.filter(s => {
      const age = calcAgeFromDOB(s.dateOfBirth) ?? s.age;
      if (age === null) return false;
      if (ageMin !== null && age < ageMin) return false;
      if (ageMax !== null && age > ageMax) return false;
      return true;
    });
  }

  const studentIds = students.map(s => s.id);

  // Average completion percentage across ALL graded assignments
  const assignmentScoresRaw = studentIds.length === 0
    ? []
    : await db.select({
        studentId: submissionsTable.studentId,
        avgScore: avg(submissionsTable.score),
      }).from(submissionsTable)
        .where(eq(submissionsTable.status, "graded"))
        .groupBy(submissionsTable.studentId);

  const assignmentMap: Record<number, number> = {};
  for (const a of assignmentScoresRaw) assignmentMap[a.studentId] = Math.round(Number(a.avgScore) || 0);

  type Entry = {
    userId: number; name: string; surname: string | null; username: string;
    avatarEmoji: string | null; avatarColor: string | null; avatarUrl: string | null;
    value: number; rank: number;
  };

  const rank = (arr: typeof students, getValue: (s: typeof students[0]) => number): Entry[] =>
    [...arr]
      .sort((a, b) => getValue(b) - getValue(a))
      .map((s, i) => ({
        userId: s.id,
        name: s.name,
        surname: s.surname,
        username: s.username,
        avatarEmoji: s.avatarEmoji,
        avatarColor: s.avatarColor,
        avatarUrl: s.avatarUrl,
        value: getValue(s),
        rank: i + 1,
      }));

  res.json({
    points:      rank(students, s => s.totalPoints),
    time:        rank(students, s => s.totalTimeMinutes ?? 0),
    assignments: rank(students, s => assignmentMap[s.id] ?? 0),
  });
});

export default router;
