import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, authTokensTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { generateToken, requireAuth, getUser } from "../lib/auth";
import { generateInviteCode } from "../lib/inviteCode";
import { sendVerificationCode, sendPasswordResetEmail } from "../lib/email";
import { purgeUser } from "../lib/accountDeletion";
import {
  PRIVACY_VERSION,
  TERMS_VERSION,
  isConsentBy,
  needsParentConsent,
  type ConsentBy,
} from "../lib/legal";

const router = Router();

// Код, по которому выдаётся роль учителя.
//
// Раньше значение было вписано прямо здесь. Репозиторий публичный, то есть код
// знал любой, кто открыл этот файл, и роль учителя вместе с доступом к данным
// учеников получал кто угодно. Теперь значение живёт только в окружении, а
// прежнее считается скомпрометированным и должно быть заменено.
//
// Переменная не задана — регистрация учителя недоступна в принципе. Это
// осознанный выбор: молча пускать всех желающих хуже, чем не пускать никого.
const TEACHER_CODE = process.env["TEACHER_CODE"]?.trim() || null;

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Коды подтверждения — через crypto, а не Math.random: это защита доступа к
// аккаунту, а не выбор случайной картинки.
function makeCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function minutesFromNow(m: number) {
  return new Date(Date.now() + m * 60 * 1000);
}

function hoursFromNow(h: number) {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

const PUBLIC_USER_FIELDS = (u: typeof usersTable.$inferSelect) => ({
  id: u.id,
  username: u.username,
  name: u.name,
  surname: u.surname,
  role: u.role,
  age: u.age,
  dateOfBirth: u.dateOfBirth,
  knowledgeLevel: u.knowledgeLevel,
  email: u.email,
  emailVerified: u.emailVerified === "true",
  totalPoints: u.totalPoints,
  totalTimeMinutes: u.totalTimeMinutes,
  avatarEmoji: u.avatarEmoji,
  avatarColor: u.avatarColor,
  avatarUrl: u.avatarUrl,
  bio: u.bio,
  inviteCode: u.inviteCode,
  createdAt: u.createdAt,
  // ── Согласия ──
  // Клиент по этим полям решает, надо ли показать экран согласия: у аккаунтов,
  // заведённых до появления документов, согласия нет вовсе, и его надо взять.
  termsAcceptedAt: u.termsAcceptedAt,
  termsVersion: u.termsVersion,
  privacyAcceptedAt: u.privacyAcceptedAt,
  privacyVersion: u.privacyVersion,
  consentBy: u.consentBy,
  /** true — согласие есть И оно на текущие редакции документов. */
  consentCurrent: !!u.termsAcceptedAt
    && u.termsVersion === TERMS_VERSION
    && !!u.privacyAcceptedAt
    && u.privacyVersion === PRIVACY_VERSION,
  termsVersionRequired: TERMS_VERSION,
  privacyVersionRequired: PRIVACY_VERSION,
});

// ── LOGIN ──────────────────────────────────────────────────────────
router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Missing username or password" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Backfill invite code if missing
  if (!user.inviteCode) {
    let code = generateInviteCode();
    let attempts = 0;
    while (attempts < 10) {
      const [clash] = await db.select({ id: usersTable.id })
        .from(usersTable).where(eq(usersTable.inviteCode, code));
      if (!clash) break;
      code = generateInviteCode();
      attempts++;
    }
    await db.update(usersTable).set({ inviteCode: code }).where(eq(usersTable.id, user.id));
    user.inviteCode = code;
  }

  const token = generateToken({ userId: user.id, role: user.role });
  res.json({ token, user: PUBLIC_USER_FIELDS(user) });
});

// ── REGISTER ─────────────────────────────────────────────────────
router.post("/auth/register", async (req, res) => {
  const {
    username, password, name, surname, role, parentId, teacherCode, email, dateOfBirth, age,
    acceptedTerms, consentBy,
  } = req.body;

  if (!username || !password || !name || !role) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  if (!email || !email.trim()) {
    res.status(400).json({ error: "Введите email" });
    return;
  }

  const emailTrimmed = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    res.status(400).json({ error: "Некорректный формат email" });
    return;
  }

  if (!["student", "parent", "teacher"].includes(role)) {
    res.status(400).json({ error: "Invalid role. Must be student, parent, or teacher." });
    return;
  }

  // ── СОГЛАСИЕ ─────────────────────────────────────────────────────────
  // Без принятых документов аккаунта не будет. Проверка именно здесь, а не
  // только галочкой на клиенте: галочку на клиенте можно обойти, а доказывать
  // согласие придётся записью в базе.
  if (acceptedTerms !== true) {
    res.status(400).json({
      error: "Для регистрации нужно принять условия и политику конфиденциальности",
    });
    return;
  }

  const numericAge = age !== undefined && age !== null && String(age).trim() !== ""
    ? Number(age)
    : null;

  // Кто именно соглашается. У младших учеников собственное согласие юридической
  // силы не имеет (GDPR ст. 8), поэтому требуем явно указать родителя.
  const who: ConsentBy = isConsentBy(consentBy) ? consentBy : "self";
  if (needsParentConsent(role, numericAge) && who === "self") {
    res.status(400).json({
      error: "За ученика младше 16 лет условия должен принять родитель или законный представитель",
      needsParentConsent: true,
    });
    return;
  }

  if (role === "teacher") {
    if (!TEACHER_CODE) {
      res.status(403).json({ error: "Регистрация учителя недоступна" });
      return;
    }
    if (!teacherCode || teacherCode !== TEACHER_CODE) {
      res.status(403).json({ error: "Неверный код учителя" });
      return;
    }
  }

  // Email занят — отказываем, независимо от того, подтверждён он или нет.
  //
  // Раньше неподтверждённый аккаунт с таким email УДАЛЯЛСЯ вместе с токенами,
  // чтобы адрес можно было переиспользовать. Владение адресом при этом никто
  // не проверял: зная чужой email, можно было снести профиль и весь прогресс.
  // Застрявшему на подтверждении помогает переотправка кода, а не удаление.
  const [existingEmail] = await db.select({ id: usersTable.id, emailVerified: usersTable.emailVerified })
    .from(usersTable).where(eq(usersTable.email, emailTrimmed));
  if (existingEmail) {
    res.status(400).json({
      error: existingEmail.emailVerified === "true"
        ? "Этот email уже используется"
        : "Этот email уже зарегистрирован, но не подтверждён. Войдите и запросите новый код.",
    });
    return;
  }

  // Username check
  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existingUser) {
    res.status(400).json({ error: "Этот псевдоним уже занят" });
    return;
  }

  // Generate unique invite code
  let inviteCode = generateInviteCode();
  let attempts = 0;
  while (attempts < 10) {
    const [clash] = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.inviteCode, inviteCode));
    if (!clash) break;
    inviteCode = generateInviteCode();
    attempts++;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const dbRole = role as "student" | "parent" | "teacher";
  const consentAt = new Date();

  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash,
    name,
    surname: surname?.trim() || null,
    email: emailTrimmed,
    role: dbRole,
    emailVerified: "false",
    parentId: role === "student" && parentId ? parentId : null,
    totalPoints: 0,
    inviteCode,
    dateOfBirth: dateOfBirth ? String(dateOfBirth) : null,
    age: numericAge,
    // Согласие фиксируется вместе с версией документов и тем, кто его дал.
    termsAcceptedAt: consentAt,
    termsVersion: TERMS_VERSION,
    privacyAcceptedAt: consentAt,
    privacyVersion: PRIVACY_VERSION,
    consentBy: who,
  }).returning();

  // Send email verification code
  const verificationCode = makeCode();
  await db.insert(authTokensTable).values({
    userId: user.id,
    token: verificationCode,
    type: "email_verification",
    expiresAt: minutesFromNow(15),
  });
  sendVerificationCode(emailTrimmed, verificationCode).catch(() => {});

  const jwtToken = generateToken({ userId: user.id, role: user.role });
  res.status(201).json({ token: jwtToken, user: PUBLIC_USER_FIELDS(user) });
});

// ── СОГЛАСИЕ ДЛЯ УЖЕ СОЗДАННЫХ АККАУНТОВ ──────────────────────────────────
//
// Два случая, когда согласия нет, а аккаунт есть:
//   • аккаунт заведён до того, как документы вообще появились;
//   • документы обновились, и старое согласие их больше не покрывает.
// В обоих клиент видит consentCurrent = false и показывает экран согласия.
router.post("/auth/accept-terms", requireAuth, async (req, res) => {
  const { userId } = getUser(req);
  const { consentBy } = req.body as { consentBy?: unknown };

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }

  const who: ConsentBy = isConsentBy(consentBy)
    ? consentBy
    : (user.consentBy && isConsentBy(user.consentBy) ? user.consentBy : "self");

  if (needsParentConsent(user.role, user.age) && who === "self") {
    res.status(400).json({
      error: "За ученика младше 16 лет условия должен принять родитель или законный представитель",
      needsParentConsent: true,
    });
    return;
  }

  const now = new Date();
  const [updated] = await db.update(usersTable)
    .set({
      termsAcceptedAt: now,
      termsVersion: TERMS_VERSION,
      privacyAcceptedAt: now,
      privacyVersion: PRIVACY_VERSION,
      consentBy: who,
      updatedAt: now,
    })
    .where(eq(usersTable.id, userId))
    .returning();

  res.json({ ok: true, user: PUBLIC_USER_FIELDS(updated) });
});

// ── УДАЛЕНИЕ СВОЕГО АККАУНТА ───────────────────────────────────────────
//
// Требование сторов: если в приложении можно завести аккаунт, в нём же должно
// быть и его удаление (Apple — с 30 июня 2022, Google Play — User Data policy).
//
// Пароль спрашивается намеренно: удаление необратимо, а токен может остаться на
// чужом устройстве. Учителя с учениками не удаляем молча: вместе с его аккаунтом
// уйдут его задания и расписание, и об этом надо сказать вслух — см. confirm.
router.delete("/auth/account", requireAuth, async (req, res) => {
  const { userId } = getUser(req);
  const { password, confirm } = req.body as { password?: unknown; confirm?: unknown };

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }

  if (typeof password !== "string" || !password) {
    res.status(400).json({ error: "Введите пароль, чтобы подтвердить удаление" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(403).json({ error: "Неверный пароль" });
    return;
  }

  // Второй барьер от случайного нажатия: клиент обязан прислать confirm: true
  // вместе с паролем — то есть показать окно, а не удалить одним тапом.
  if (confirm !== true) {
    res.status(400).json({ error: "Удаление не подтверждено" });
    return;
  }

  try {
    const report = await purgeUser(userId);
    res.json({ ok: true, deletedId: userId, cleared: report.cleared });
  } catch {
    res.status(500).json({
      error: "Не удалось удалить аккаунт. Попробуйте позже или напишите нам.",
    });
  }
});

// ── VERIFY CODE (6-digit OTP) ─────────────────────────────────────────
router.post("/auth/verify-code", requireAuth, async (req, res) => {
  const { userId } = getUser(req);
  const { code } = req.body;

  if (!code || !/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "Неверный формат кода" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }
  if (user.emailVerified === "true") {
    res.json({ ok: true, alreadyVerified: true });
    return;
  }

  const [row] = await db.select().from(authTokensTable).where(
    and(
      eq(authTokensTable.userId, userId),
      eq(authTokensTable.token, code),
      eq(authTokensTable.type, "email_verification"),
      gt(authTokensTable.expiresAt, new Date()),
    )
  );

  if (!row) {
    res.status(400).json({ error: "Неверный или устаревший код. Запросите новый." });
    return;
  }
  if (row.usedAt) {
    res.status(400).json({ error: "Этот код уже был использован" });
    return;
  }

  await db.update(authTokensTable).set({ usedAt: new Date() }).where(eq(authTokensTable.id, row.id));
  await db.update(usersTable).set({ emailVerified: "true" }).where(eq(usersTable.id, userId));

  res.json({ ok: true });
});

// ── RESEND CODE ──────────────────────────────────────────────────
router.post("/auth/resend-code", requireAuth, async (req, res) => {
  const { userId } = getUser(req);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || !user.email) {
    res.status(400).json({ error: "Email не найден" });
    return;
  }
  if (user.emailVerified === "true") {
    res.status(400).json({ error: "Email уже подтверждён" });
    return;
  }

  // Прежние коды гасим: каждый неиспользованный код — ещё одна попытка
  // угадать шестизначное число, и раньше они копились без ограничений.
  await db.update(authTokensTable)
    .set({ usedAt: new Date() })
    .where(and(
      eq(authTokensTable.userId, user.id),
      eq(authTokensTable.type, "email_verification"),
    ));

  const newCode = makeCode();
  await db.insert(authTokensTable).values({
    userId: user.id,
    token: newCode,
    type: "email_verification",
    expiresAt: minutesFromNow(15),
  });

  sendVerificationCode(user.email, newCode).catch(() => {});
  res.json({ ok: true });
});

// ── FORGOT PASSWORD ──────────────────────────────────────────────
router.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Введите email" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));

  // Always respond OK to avoid email enumeration
  if (!user) {
    res.json({ ok: true });
    return;
  }

  const resetToken = makeToken();
  await db.insert(authTokensTable).values({
    userId: user.id,
    token: resetToken,
    type: "password_reset",
    expiresAt: hoursFromNow(1),
  });

  sendPasswordResetEmail(user.email!, resetToken).catch(() => {});
  res.json({ ok: true });
});

// ── RESET PASSWORD ──────────────────────────────────────────────
router.post("/auth/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 6) {
    res.status(400).json({ error: "Некорректные данные" });
    return;
  }

  const [row] = await db.select().from(authTokensTable).where(
    and(
      eq(authTokensTable.token, token),
      eq(authTokensTable.type, "password_reset"),
      gt(authTokensTable.expiresAt, new Date()),
    )
  );

  if (!row) {
    res.status(400).json({ error: "Ссылка недействительна или истекла" });
    return;
  }
  if (row.usedAt) {
    res.status(400).json({ error: "Ссылка уже была использована" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, row.userId));

  // Гасим ВСЕ ссылки сброса этого пользователя, а не только использованную:
  // остальные иначе работают до истечения часа.
  await db.update(authTokensTable)
    .set({ usedAt: new Date() })
    .where(and(
      eq(authTokensTable.userId, row.userId),
      eq(authTokensTable.type, "password_reset"),
    ));

  res.json({ ok: true });
});

// ── ME ────────────────────────────────────────────────────────────
router.get("/auth/me", requireAuth, async (req, res) => {
  const { userId } = getUser(req);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(PUBLIC_USER_FIELDS(user));
});

export default router;
