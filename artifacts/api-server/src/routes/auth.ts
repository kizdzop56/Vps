// ─────────────────────────────────────────────────────────────────────────────
// Регистрация, вход, подтверждение почты и восстановление пароля.
//
// Здесь собраны правки после разбора безопасности. Коротко, что изменилось и
// почему — детали у каждого места.
//
//   1. Код учителя больше не в коде, а в переменной окружения (lib/teacherCode).
//   2. Регистрация НИКОГДА не удаляет существующий аккаунт.
//   3. parentId от клиента не принимается вовсе.
//   4. Коды подтверждения — из crypto, а не из Math.random.
//   5. На вход, регистрацию, отправку кодов и восстановление стоят лимиты.
//   6. Смена пароля гасит и прежние ссылки восстановления, и выданные токены.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, authTokensTable } from "@workspace/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import { generateToken, requireAuth, getUser } from "../lib/auth";
import { generateInviteCode } from "../lib/inviteCode";
import { sendVerificationCode, sendPasswordResetEmail } from "../lib/email";
import { teacherCodeMatches, teacherSignupEnabled } from "../lib/teacherCode";
import { clearRateLimit, rateLimit } from "../lib/rateLimit";
import { revokeSessions } from "../lib/sessionEpoch";

const router = Router();

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Шестизначный код подтверждения.
 *
 * crypto.randomInt, а не Math.random: второй — быстрый генератор для игр и
 * анимаций, его поток предсказуем по предыдущим значениям. Для кода, который
 * открывает доступ к аккаунту, это негодный источник.
 */
function makeCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function minutesFromNow(m: number) {
  return new Date(Date.now() + m * 60 * 1000);
}

function hoursFromNow(h: number) {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

// ── Лимиты ──────────────────────────────────────────────────────────────────
// Окна короткие и щедрые: задача не наказать человека, забывшего пароль, а
// сделать перебор бессмысленным по времени. Ключ входа включает логин, поэтому
// класс за общим адресом не блокирует друг друга (см. lib/rateLimit.ts).
const loginLimit = rateLimit("login", {
  windowMs: 10 * 60_000,
  max: 10,
  message: "Слишком много попыток входа. Подождите несколько минут.",
  keyOf: (req) => String((req.body as { username?: unknown })?.username ?? ""),
});

const registerLimit = rateLimit("register", {
  windowMs: 60 * 60_000,
  max: 10,
  message: "Слишком много регистраций с этого устройства. Попробуйте позже.",
});

const codeCheckLimit = rateLimit("verify-code", {
  windowMs: 10 * 60_000,
  max: 10,
  message: "Слишком много попыток. Запросите новый код через несколько минут.",
});

const codeSendLimit = rateLimit("resend-code", {
  windowMs: 15 * 60_000,
  max: 3,
  message: "Код уже отправлен. Проверьте почту и подождите 15 минут.",
});

const forgotLimit = rateLimit("forgot-password", {
  windowMs: 15 * 60_000,
  max: 3,
  message: "Письмо уже отправлено. Проверьте почту и подождите 15 минут.",
  keyOf: (req) => String((req.body as { email?: unknown })?.email ?? ""),
});

const resetLimit = rateLimit("reset-password", {
  windowMs: 15 * 60_000,
  max: 10,
  message: "Слишком много попыток. Попробуйте позже.",
});

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
});

// ── LOGIN ──────────────────────────────────────────────────────────────
router.post("/auth/login", loginLimit, async (req, res) => {
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

  // Пароль верный — счётчик попыток по этому логину больше не нужен: человек
  // вошёл, и следующая опечатка не должна упираться в остаток лимита.
  clearRateLimit("login", req, String(username));

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

// ── REGISTER ───────────────────────────────────────────────────────────
router.post("/auth/register", registerLimit, async (req, res) => {
  const { username, password, name, surname, role, teacherCode, email, dateOfBirth, age } = req.body;

  if (!username || !password || !name || !role) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Пароль должен содержать не менее 6 символов" });
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

  // ── Роль учителя ──
  // Код сверяется ТОЛЬКО здесь и берётся из окружения. Если переменной нет,
  // учителей на этом сервере не создать: роль видит персональные данные
  // учеников, поэтому поведение по умолчанию — «нельзя».
  if (role === "teacher") {
    if (!teacherSignupEnabled()) {
      res.status(503).json({
        error: "Регистрация учителей на этом сервере отключена. Обратитесь к администратору.",
      });
      return;
    }
    if (!teacherCodeMatches(teacherCode)) {
      res.status(403).json({ error: "Неверный код учителя" });
      return;
    }
  }

  // ── Занятый email ──
  // РАНЬШЕ ЗДЕСЬ УДАЛЯЛСЯ ЧУЖОЙ АККАУНТ. Если email принадлежал пользователю,
  // не успевшему подтвердить почту, регистрация сносила его запись вместе с
  // токенами — и никакого подтверждения владения адресом при этом не
  // требовалось. То есть любой человек, знающий чужой email, стирал аккаунт
  // (а с ним, по каскадам, работы, связи и прогресс) простой отправкой формы.
  //
  // Теперь занятый адрес всегда означает отказ. Владелец неподтверждённого
  // аккаунта заходит своим паролем и запрашивает новый код, а если пароль
  // забыт — восстанавливает его по этой же почте.
  const [existingEmail] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.email, emailTrimmed));
  if (existingEmail) {
    res.status(400).json({
      error: "Этот email уже используется. Войдите в аккаунт или восстановите пароль.",
    });
    return;
  }

  const [existingUser] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.username, username));
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

  // parentId НЕ принимается от клиента. Раньше поле приходило в теле запроса и
  // записывалось как есть: любой регистрирующийся мог назначить себе родителем
  // произвольного пользователя и получить его в свою карточку, а тот — чужого
  // ребёнка в списке «Мои дети». Связь родителя с ребёнком создаётся только по
  // коду приглашения (routes/connections.ts), где обе стороны подтверждают её.
  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash,
    name,
    surname: surname?.trim() || null,
    email: emailTrimmed,
    role: dbRole,
    emailVerified: "false",
    parentId: null,
    totalPoints: 0,
    inviteCode,
    dateOfBirth: dateOfBirth ? String(dateOfBirth) : null,
    age: age ? Number(age) : null,
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

// ── VERIFY CODE (6-digit OTP) ──────────────────────────────────────────
// Лимит здесь обязателен: шестизначный код — это миллион вариантов, и без
// ограничения он подбирается скриптом за считанные минуты.
router.post("/auth/verify-code", requireAuth, codeCheckLimit, async (req, res) => {
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

// ── RESEND CODE ────────────────────────────────────────────────────────
// Лимит по адресу запроса: без него кнопка «отправить снова» превращается в
// рассылку писем на чужой ящик и в счёт от почтового провайдера.
router.post("/auth/resend-code", requireAuth, codeSendLimit, async (req, res) => {
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

  // Прежние коды гасим: одновременно живых кодов быть не должно — иначе
  // «запросил новый» не отменяет старый, и подбирать можно любой из них.
  await db.update(authTokensTable)
    .set({ usedAt: new Date() })
    .where(and(
      eq(authTokensTable.userId, user.id),
      eq(authTokensTable.type, "email_verification"),
      isNull(authTokensTable.usedAt),
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

// ── FORGOT PASSWORD ────────────────────────────────────────────────────
router.post("/auth/forgot-password", forgotLimit, async (req, res) => {
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

// ── RESET PASSWORD ─────────────────────────────────────────────────────
router.post("/auth/reset-password", resetLimit, async (req, res) => {
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

  // Гасим ВСЕ ссылки восстановления этого пользователя, а не только
  // использованную. Раньше оставались живыми прежние письма: попросил ссылку
  // трижды, сменил пароль по последней — две предыдущие ещё час позволяли
  // сменить его снова, в том числе тому, кто читал чужую почту.
  await db.update(authTokensTable)
    .set({ usedAt: new Date() })
    .where(and(
      eq(authTokensTable.userId, row.userId),
      eq(authTokensTable.type, "password_reset"),
      isNull(authTokensTable.usedAt),
    ));

  // И выкидываем все устройства, вошедшие до смены пароля: смысл
  // восстановления в том, чтобы отобрать доступ, а не поделиться им.
  await revokeSessions(row.userId);

  res.json({ ok: true });
});

// ── ME ─────────────────────────────────────────────────────────────────
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
