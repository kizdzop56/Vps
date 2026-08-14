import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable, conversationsTable, messagesTable,
  teacherStudentsTable, friendshipsTable, parentChildrenTable,
} from "@workspace/db";
import { eq, and, or, inArray, desc, sql, isNull, ne } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";

const router = Router();

// ── Are two users allowed to chat? ────────────────────────────────────
// Chat is permitted between any *connected* users: accepted friendships,
// accepted teacher↔student links, or parent↔child links (either direction).
async function areConnected(a: number, b: number): Promise<boolean> {
  if (a === b) return false;

  const [friend] = await db.select({ id: friendshipsTable.id }).from(friendshipsTable).where(and(
    eq(friendshipsTable.status, "accepted"),
    or(
      and(eq(friendshipsTable.requesterId, a), eq(friendshipsTable.addresseeId, b)),
      and(eq(friendshipsTable.requesterId, b), eq(friendshipsTable.addresseeId, a)),
    ),
  ));
  if (friend) return true;

  const [ts] = await db.select({ id: teacherStudentsTable.id }).from(teacherStudentsTable).where(and(
    eq(teacherStudentsTable.status, "accepted"),
    or(
      and(eq(teacherStudentsTable.teacherId, a), eq(teacherStudentsTable.studentId, b)),
      and(eq(teacherStudentsTable.teacherId, b), eq(teacherStudentsTable.studentId, a)),
    ),
  ));
  if (ts) return true;

  const [pc] = await db.select({ id: parentChildrenTable.id }).from(parentChildrenTable).where(or(
    and(eq(parentChildrenTable.parentId, a), eq(parentChildrenTable.studentId, b)),
    and(eq(parentChildrenTable.parentId, b), eq(parentChildrenTable.studentId, a)),
  ));
  if (pc) return true;

  return false;
}

// Canonical pair order: userAId is always the smaller id.
function pair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

async function getOrCreateConversation(a: number, b: number): Promise<number> {
  const [lo, hi] = pair(a, b);
  const [existing] = await db.select({ id: conversationsTable.id }).from(conversationsTable).where(and(
    eq(conversationsTable.userAId, lo),
    eq(conversationsTable.userBId, hi),
  ));
  if (existing) return existing.id;

  await db.insert(conversationsTable)
    .values({ userAId: lo, userBId: hi })
    .onConflictDoNothing();

  const [row] = await db.select({ id: conversationsTable.id }).from(conversationsTable).where(and(
    eq(conversationsTable.userAId, lo),
    eq(conversationsTable.userBId, hi),
  ));
  return row.id;
}

// ── List my conversations (with last message + unread count) ─────────
router.get("/messages/conversations", requireAuth, async (req, res) => {
  const me = getUser(req).userId;

  const convos = await db.select().from(conversationsTable).where(or(
    eq(conversationsTable.userAId, me),
    eq(conversationsTable.userBId, me),
  )).orderBy(desc(conversationsTable.lastMessageAt));

  if (convos.length === 0) { res.json([]); return; }

  const otherIds = convos.map((c) => (c.userAId === me ? c.userBId : c.userAId));
  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    username: usersTable.username,
    role: usersTable.role,
    avatarEmoji: usersTable.avatarEmoji,
    avatarColor: usersTable.avatarColor,
    avatarUrl: usersTable.avatarUrl,
  }).from(usersTable).where(inArray(usersTable.id, otherIds));
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const result = await Promise.all(convos.map(async (c) => {
    const otherId = c.userAId === me ? c.userBId : c.userAId;
    const [last] = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, c.id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(and(
        eq(messagesTable.conversationId, c.id),
        ne(messagesTable.senderId, me),
        isNull(messagesTable.readAt),
      ));
    return {
      conversationId: c.id,
      user: userMap[otherId],
      lastMessage: last
        ? { text: last.text, attachmentType: last.attachmentType, senderId: last.senderId, createdAt: last.createdAt }
        : null,
      unread: count ?? 0,
      lastMessageAt: c.lastMessageAt,
    };
  }));

  res.json(result);
});

// ── Open a conversation with a user: history + mark incoming as read ──
router.get("/messages/with/:userId", requireAuth, async (req, res) => {
  const me = getUser(req).userId;
  const otherId = Number(req.params["userId"]);

  if (!(await areConnected(me, otherId))) {
    res.status(403).json({ error: "Чат доступен только связанным пользователям" });
    return;
  }

  const [otherUser] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    username: usersTable.username,
    role: usersTable.role,
    avatarEmoji: usersTable.avatarEmoji,
    avatarColor: usersTable.avatarColor,
    avatarUrl: usersTable.avatarUrl,
    lastSeenAt: usersTable.lastSeenAt,
  }).from(usersTable).where(eq(usersTable.id, otherId));
  if (!otherUser) { res.status(404).json({ error: "Пользователь не найден" }); return; }

  const conversationId = await getOrCreateConversation(me, otherId);

  // Mark messages sent BY the other user as read now that I'm viewing them.
  await db.update(messagesTable)
    .set({ readAt: new Date() })
    .where(and(
      eq(messagesTable.conversationId, conversationId),
      eq(messagesTable.senderId, otherId),
      isNull(messagesTable.readAt),
    ));

  const messages = await db.select().from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(messagesTable.createdAt);

  const ONLINE_MS = 90 * 1000;
  const isOnline = otherUser.lastSeenAt
    ? Date.now() - new Date(otherUser.lastSeenAt).getTime() < ONLINE_MS
    : false;

  res.json({ conversationId, otherUser: { ...otherUser, isOnline }, messages });
});

// ── Send a message (text and/or attachment) ──────────────────────────
router.post("/messages/with/:userId", requireAuth, async (req, res) => {
  const me = getUser(req).userId;
  const otherId = Number(req.params["userId"]);

  if (!(await areConnected(me, otherId))) {
    res.status(403).json({ error: "Чат доступен только связанным пользователям" });
    return;
  }

  const { text, attachmentUrl, attachmentType } = req.body as {
    text?: string;
    attachmentUrl?: string;
    attachmentType?: "image" | "audio" | "video";
  };

  const trimmed = (text ?? "").trim();
  if (!trimmed && !attachmentUrl) {
    res.status(400).json({ error: "Сообщение не может быть пустым" });
    return;
  }
  if (attachmentUrl && attachmentType !== "image" && attachmentType !== "audio" && attachmentType !== "video") {
    res.status(400).json({ error: "Некорректный тип вложения" });
    return;
  }

  const conversationId = await getOrCreateConversation(me, otherId);

  const [message] = await db.insert(messagesTable).values({
    conversationId,
    senderId: me,
    text: trimmed || null,
    attachmentUrl: attachmentUrl ?? null,
    attachmentType: attachmentUrl ? (attachmentType as "image" | "audio" | "video") : null,
  }).returning();

  // Bump the conversation so it sorts to the top of both users' lists.
  await db.update(conversationsTable)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversationsTable.id, conversationId));

  res.status(201).json(message);
});

export default router;
