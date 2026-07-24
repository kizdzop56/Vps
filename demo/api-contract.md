# API Contract (mounted under /api)

Base: all routes below are relative to `/api`. Auth via `Authorization: Bearer <jwt>`.
JWT verified with `SESSION_SECRET` (fallback `dev-secret-key`), HS256, expires in 30d.

Column types come from `lib/db/src/schema/*.ts` (Drizzle/Postgres). Dates from `timestamp` columns
serialize as ISO 8601 strings in the JSON response (e.g. `"2026-07-22T10:00:00.000Z"`); `date` columns
(`dateOfBirth`, `lastLoginDate`) are plain `"YYYY-MM-DD"` strings.

---

## auth.ts

### POST /api/auth/login
- Auth: none
- Req body: { username: string, password: string }
- 200: { token: string, user: PUBLIC_USER_FIELDS }
- Errors: [400: "Missing username or password"] [401: "Invalid credentials" (bad username OR bad password, same message both cases)]
- Effects: if user.inviteCode is null, generates+persists a unique invite code (backfill) before responding.
- Notes: user object is full PUBLIC_USER_FIELDS shape (see bottom of file). No nested tables embedded.

### POST /api/auth/register
- Auth: none
- Req body: { username: string, password: string, name: string, surname?: string, role: "student"|"parent"|"teacher", parentId?: number, teacherCode?: string, email: string, dateOfBirth?: string, age?: number }
- 201: { token: string, user: PUBLIC_USER_FIELDS }
- Errors:
  - 400: "Missing required fields" (username/password/name/role missing)
  - 400: "Введите email" (email missing/blank)
  - 400: "Некорректный формат email" (regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` fails, tested against lowercased+trimmed email)
  - 400: "Invalid role. Must be student, parent, or teacher." (role not in student/parent/teacher)
  - 403: "Неверный код учителя" (role="teacher" and teacherCode !== "422668")
  - 400: "Этот email уже используется" (email exists AND emailVerified==="true")
  - 400: "Этот псевдоним уже занят" (username taken)
- Effects:
  - email is lowercased+trimmed before storage/lookup.
  - If email exists but unverified (emailVerified !== "true"): deletes that user's authTokens rows and the user row itself, freeing the email for reuse.
  - Generates unique inviteCode (10 attempts against collisions, using `generateInviteCode()`).
  - passwordHash = bcrypt.hash(password, 12).
  - Inserts user: emailVerified="false", parentId = (role==="student" && parentId given) ? parentId : null (so parentId is IGNORED for non-student roles), totalPoints=0, dateOfBirth stored as String(dateOfBirth) or null, age = Number(age) or null.
  - teacherCode is validated but NEVER stored on the user row.
  - Inserts an authTokens row: type="email_verification", token=6-digit numeric string, expiresAt = now+15min.
  - Fires sendVerificationCode(email, code) — errors swallowed (`.catch(() => {})`), does not block response.
- Notes: response user is full PUBLIC_USER_FIELDS of the newly created row (emailVerified will be false).

### GET /api/auth/me
- Auth: Bearer
- Req: none
- 200: PUBLIC_USER_FIELDS (NOT wrapped in `{user: ...}` — top-level object, unlike /login and /register)
- Errors: [404: "User not found"]

### POST /api/auth/verify-code
- Auth: Bearer
- Req body: { code: string } — must match `/^\d{6}$/`
- 200: { ok: true } — normal success
- 200: { ok: true, alreadyVerified: true } — if user.emailVerified is already "true" (returned immediately, code not checked)
- Errors:
  - 400: "Неверный формат кода" (code missing or not 6 digits)
  - 404: "Пользователь не найден"
  - 400: "Неверный или устаревший код. Запросите новый." (no matching non-expired authTokens row of type email_verification for this user+code)
  - 400: "Этот код уже был использован" (row found but usedAt is set)
- Effects: marks the authTokens row usedAt=now; sets user.emailVerified="true".

### POST /api/auth/resend-code
- Auth: Bearer
- Req: none (body ignored)
- 200: { ok: true }
- Errors: [400: "Email не найден" (no email on account)] [400: "Email уже подтверждён"]
- Effects: inserts new authTokens row (type="email_verification", new 6-digit code, expiresAt=+15min); calls sendVerificationCode (fire-and-forget).

### POST /api/auth/forgot-password
- Auth: none
- Req body: { email: string }
- 200: { ok: true } — ALWAYS returned even if email not found (anti-enumeration); no-op in that case (no token created, no email sent).
- Errors: [400: "Введите email"]
- Effects (only if user found by lowercased+trimmed email): inserts authTokens row (type="password_reset", token=64-char hex via crypto.randomBytes(32).toString("hex"), expiresAt=+1 hour); calls sendPasswordResetEmail (fire-and-forget).

### POST /api/auth/reset-password
- Auth: none
- Req body: { token: string, password: string } — password must be length >= 6
- 200: { ok: true }
- Errors:
  - 400: "Некорректные данные" (token/password missing or password < 6 chars)
  - 400: "Ссылка недействительна или истекла" (no matching non-expired authTokens row of type password_reset)
  - 400: "Ссылка уже была использована" (row found but usedAt set)
- Effects: passwordHash = bcrypt.hash(password, 12), updates user.passwordHash; marks token row usedAt=now.

---

## users.ts

### GET /api/users (not in requested list but exists)
- Auth: Bearer
- Req query: { role?: string, parentId?: number }
- 200: Array<{id, username, name, surname, role, age, knowledgeLevel, avatarEmoji, avatarColor, avatarUrl, totalPoints, totalTimeMinutes, createdAt}>

### GET /api/users/:id
- Auth: Bearer
- Req params: { id: number }
- 200: { id, username, name, surname, role, age, dateOfBirth, knowledgeLevel, avatarEmoji, avatarColor, avatarUrl, bio, totalPoints, totalTimeMinutes: number, completedAssignments: number, averageScore: number|null, createdAt, lastSeenAt, isOnline: boolean }
- Errors: [404: "User not found"]
- Notes (computed, student role only — non-students get raw `user.totalTimeMinutes ?? 0`, completedAssignments=0, averageScore=null):
  - totalTimeMinutes = user.totalTimeMinutes + minutes elapsed on the CURRENTLY OPEN timeSessions row (if any), computed as `Math.floor((now - openSession.startedAt) / 60000)`.
  - completedAssignments = count of ALL submissions rows for this student (status not filtered here — differs from other endpoints that filter status="graded").
  - averageScore = Math.round(avg of submissions.score) over all of the student's submissions, or null if none.
  - isOnline = `user.lastSeenAt && (Date.now() - lastSeenAt) < 90_000` (90-second threshold — this is the canonical threshold; some other endpoints in connections.ts use 180_000 instead, see notes there).

### POST /api/users/ping
- Auth: Bearer
- Req: none
- 200: { ok: true }
- Effects: sets caller's usersTable.lastSeenAt = now(). Heartbeat for online-status; intended to be called periodically (every ~60s per code comment).

### POST /api/users/offline
- Auth: Bearer
- Req: none
- 200: { ok: true }
- Effects: sets caller's usersTable.lastSeenAt = null (marks offline immediately, used on logout).

### PATCH /api/users/:id/profile
- Auth: Bearer (self, OR isTeacher(caller.role) can edit anyone)
- Method is PATCH (not PUT/PATCH ambiguous — confirmed PATCH in code)
- Req body: { bio?: string, avatarEmoji?: string, avatarColor?: string, avatarUrl?: string, name?: string, username?: string } — all optional, only provided keys are updated
- 200: { id, username, name, bio, avatarEmoji, avatarColor, avatarUrl, role } — NOTE: this is a SUBSET, not full PUBLIC_USER_FIELDS (no age, email, totalPoints, etc.)
- Errors:
  - 403: "Forbidden" (caller is neither the target user nor a teacher/admin)
  - 413: "Изображение слишком большое" (avatarUrl string length > 500,000 chars)
  - 400: "Никнейм не может быть пустым" (username provided but empty after trim)
  - 400: "Никнейм: 3-20 символов, только латиница, цифры и _" (username fails `/^[a-zA-Z0-9_]{3,20}$/`)
  - 409: "Этот никнейм уже занят" (username taken by a different user id)
- Effects: updatedAt=now always set. `name` only updated if non-empty after trim. `username` trimmed and validated as above before persisting.

### GET /api/users/:id/children
- Auth: Bearer
- 200: Array<{id, username, name, role, age, knowledgeLevel, avatarEmoji, avatarColor, totalPoints, createdAt}> — children where usersTable.parentId = :id (the LEGACY parentId column, distinct from the parentChildrenTable join table used by connections.ts).

### GET /api/students/:id/submissions
- Auth: Bearer (isTeacher OR admin OR self only)
- 200: Array<{ submissionId, score, correctCount, totalQuestions, pointsEarned, submittedAt, assignmentId, title, type, points }> sorted DESC by submittedAt.
- Errors: [403: "Forbidden"]
- Notes: filtered to submissions.status === "graded" only. `type`/`points`/`title` come from a leftJoin on assignmentsTable (assignment fields, NOT submission fields — `points` here is the assignment's max points, not pointsEarned).
- NOTE: there is a SECOND, DIFFERENT route with the identical path `GET /students/:id/submissions` defined in submissions.ts (see "submissions.ts" section below) with a richer response shape (includes `answers[]`, `studentName`, `recordingUrl`, etc., and does NOT filter by status). Because both users.ts and submissions.ts routers are mounted via routes/index.ts, and users.ts is mounted BEFORE submissions.ts, **Express matches the FIRST-registered handler**, so users.ts's version (documented here) is the one that actually responds. The submissions.ts duplicate route is dead code / unreachable.

### GET /api/students/:id/category-stats
- Auth: Bearer (any authenticated user — no ownership check, deliberately public-ish per code comment)
- 200: Array<{ type: "text_test"|"audio"|"reading"|"video", avgScore: number|null, count: number }> — always exactly 4 entries, one per category, in this fixed order: text_test, audio, reading, video. (free_form is excluded from this fixed category list.)
- Notes: avgScore = Math.round(avg of submissions.score) for graded submissions of that type; null if count=0.

### DELETE /api/users/:id
- Auth: Bearer + isTeacher(role) required
- 200: { ok: true, deletedId: number }
- Errors:
  - 403: "Только учитель может удалять пользователей" (caller not teacher/admin)
  - 400: "Неверный ID" (id is NaN)
  - 400: "Нельзя удалить свой собственный аккаунт" (self-delete attempt)
  - 404: "Пользователь не найден"
  - 403: "Нельзя удалить другого учителя" (target is teacher/admin)
- Effects (cascading manual deletes, in order): deletes voiceChatMessagesTable rows for the target's voiceChatSessions, then voiceChatSessionsTable rows, then submissionsTable rows (studentId), then timeSessionsTable rows (studentId), then the usersTable row itself. Does NOT explicitly clean up teacherStudentsTable / parentChildrenTable / friendshipsTable / assignedTasksTable rows referencing this user (may rely on DB-level cascade or leave orphans — check schema `onDelete` — teacherStudentsTable/parentChildrenTable/friendshipsTable/assignedTasksTable all have `onDelete: "cascade"` on their FKs per schema files, so DB cascade handles those).

---

## connections.ts

### GET /api/connections/by-code/:code
- Auth: Bearer
- Params: code (uppercased server-side before lookup)
- 200: { id, name, username, role, knowledgeLevel, avatarEmoji, avatarColor, avatarUrl, inviteCode }
- Errors: [404: "Пользователь с таким кодом не найден"] [400: "Нельзя добавить самого себя" (matched user.id === caller.userId)]

### GET /api/connections/by-username/:username
- Auth: Bearer
- Params: username (lowercased+trimmed; SQL `lower(username) = :username` match)
- 200: same shape as by-code: { id, name, username, role, knowledgeLevel, avatarEmoji, avatarColor, avatarUrl, inviteCode }
- Errors: [404: "Пользователь с таким псевдонимом не найден"] [400: "Нельзя добавить самого себя"]

### POST /api/connections/teacher/add-student
- Auth: Bearer + isTeacher(role)
- Req body: { code: string } (invite code, uppercased before lookup)
- 201: { id, name, username, avatarEmoji, avatarColor, avatarUrl, knowledgeLevel, status: "pending" }
- Errors:
  - 403: "Только учитель может добавлять учеников"
  - 400: "Код обязателен"
  - 404: "Ученик с таким кодом не найден"
  - 400: "Этот пользователь не является учеником" (target role !== "student")
  - 400: "Запрос уже отправлен, ожидается подтверждение ученика" (existing teacherStudents row, status="pending")
  - 400: "Этот ученик уже прикреплён к вам" (existing row, status="accepted")
- Effects: inserts teacherStudentsTable row {teacherId: caller, studentId, status: "pending"}.

### GET /api/connections/teacher/students
- Auth: Bearer + isTeacher(role)
- 200: Array<{ id, name, surname, username, role, knowledgeLevel, avatarEmoji, avatarColor, avatarUrl, totalPoints, inviteCode, lastSeenAt, isOnline: boolean }>
- Notes: only teacherStudentsTable status="accepted" links. isOnline threshold = 3 minutes (180,000ms) — DIFFERS from users.ts's 90s threshold. Empty array short-circuit if no links (no user query issued).

### POST /api/connections/teacher/add-student (dup avoid) — see above. 

### GET /api/connections/teacher/pending
- Auth: Bearer + isTeacher(role)
- 200: Array<{ requestId: number, student: {id, name, surname, username, avatarEmoji, avatarColor, avatarUrl, knowledgeLevel} | undefined, status: "pending" }>
- Notes: requestId = teacherStudentsTable.id (the link row id, NOT the student id). `student` field is looked up via in-memory map; theoretically undefined if student row vanished (no null-guard in code).

### DELETE /api/connections/teacher/students/:studentId
- Auth: Bearer + isTeacher(role)
- 200: { ok: true }
- Effects: deletes the teacherStudentsTable row (teacherId=caller, studentId=:studentId), AND deletes all assignedTasksTable rows where teacherId=caller AND studentId=:studentId (cleans up that teacher's assigned tasks for this student). No 404 if link doesn't exist — always 200.

### GET /api/connections/student/teachers
- Auth: Bearer
- 200: Array<{ id, name, username, avatarEmoji, avatarColor, avatarUrl, role, totalPoints, lastSeenAt, isOnline: boolean }>
- Notes: only status="accepted" links (caller as student). isOnline threshold = 3 minutes (180,000ms).

### GET /api/connections/student/teacher-requests
- Auth: Bearer
- 200: Array<{ requestId: number, teacher: {id, name, username, avatarEmoji, avatarColor, avatarUrl, role} | undefined }>
- Notes: requestId = teacherStudentsTable.id; only status="pending" links where caller is the student.

### PATCH /api/connections/student/teacher-requests/:id/accept
- Auth: Bearer
- Req params: id = teacherStudentsTable row id
- 200: { ok: true }
- Errors: [404: "Запрос не найден"] [403: "Нельзя принять чужой запрос" (link.studentId !== caller.userId)]
- Effects: sets link.status = "accepted".

### DELETE /api/connections/student/teacher-requests/:id
- Auth: Bearer
- 200: { ok: true }
- Errors: [404: "Запрос не найден"] [403: "Нельзя отклонить чужой запрос"]
- Effects: deletes the teacherStudentsTable row.

### POST /api/connections/parent/add-child
- Auth: Bearer + role==="parent"
- Req body: { code: string } (uppercased before lookup)
- 201: { id, name, username, avatarEmoji, avatarColor, avatarUrl, knowledgeLevel, totalPoints }
- Errors:
  - 403: "Только родитель может добавлять детей"
  - 400: "Код обязателен"
  - 404: "Ученик с таким кодом не найден"
  - 400: "Этот пользователь не является учеником"
  - 400: "Этот ребёнок уже добавлен" (existing parentChildrenTable row)
- Effects: inserts parentChildrenTable row {parentId: caller, studentId}. NOTE: unlike teacher/add-student, this is instantly linked (no pending/accepted status — parentChildrenTable has no status column).

### GET /api/connections/parent/children
- Auth: Bearer + role==="parent"
- 200: Array<{ id, name, username, role, knowledgeLevel, avatarEmoji, avatarColor, avatarUrl, totalPoints, inviteCode }>
- Notes: sourced from parentChildrenTable join table (NOT the legacy usersTable.parentId column used by GET /users/:id/children).

### DELETE /api/connections/parent/children/:studentId
- Auth: Bearer + role==="parent"
- 200: { ok: true }
- Effects: deletes parentChildrenTable row (parentId=caller, studentId=:studentId). Always 200 even if no row existed.

### POST /api/connections/friends/request
- Auth: Bearer + role==="student"
- Req body: { code: string } (invite code, uppercased)
- 201: { id, name, username, avatarEmoji, avatarColor, avatarUrl, status: "pending" }
- Errors:
  - 403: "Только ученики могут добавлять друзей"
  - 400: "Код обязателен"
  - 404: "Ученик с таким кодом не найден"
  - 400: "Этот пользователь не является учеником"
  - 400: "Нельзя добавить самого себя"
  - 400: "Вы уже друзья" (existing friendshipsTable row, status="accepted")
  - 400: "Запрос уже отправлен" (existing row, any other status)
- Effects: inserts friendshipsTable row {requesterId: caller, addresseeId: friend.id, status: "pending"}.

### GET /api/connections/friends
- Auth: Bearer
- 200: Array<{ friendshipId: number, user: {id, name, username, avatarEmoji, avatarColor, avatarUrl, totalPoints, knowledgeLevel, lastSeenAt, isOnline: boolean}, status: "pending"|"accepted", direction: "sent"|"received" }>
- Notes: includes BOTH accepted friends AND pending (sent+received) requests — caller must filter client-side by status/direction. isOnline threshold = 90 seconds (matches users.ts, comment explicitly says "must match users.ts").

### PATCH /api/connections/friends/:id/accept
- Auth: Bearer
- Req params: id = friendshipsTable row id
- 200: { ok: true }
- Errors: [404: "Запрос не найден"] [403: "Нельзя принять чужой запрос" (caller is not the addressee)]
- Effects: sets friendship.status = "accepted".

### DELETE /api/connections/friends/:id
- Auth: Bearer
- 200: { ok: true }
- Errors: [404: "Запрос не найден"] [403: "Forbidden" (caller is neither requester nor addressee)]
- Effects: deletes the friendshipsTable row. Used both to decline a pending request and to remove an existing friend.

### GET /api/connections/friends/list — NOT PRESENT
- The task mentions "friends/... list" but the actual list endpoint is `GET /connections/friends` (documented above); there is no separate `/friends/list` path in the code.

### GET /api/connections/friends/status/:userId
- Auth: Bearer
- 200: { status: "none" } — no friendship row exists
- 200: { status: "friends", friendshipId: number } — accepted
- 200: { status: "pending_sent"|"pending_received", friendshipId: number } — pending, direction relative to caller
- Notes: never errors (always 200); status is derived, never a raw DB enum value passed straight through except "friends"/"pending_sent"/"pending_received"/"none" are all app-level strings (friendshipsTable.status DB enum itself only has "pending"|"accepted").

### POST /api/connections/friends/request-by-id
- Auth: Bearer + role==="student"
- Req body: { userId: number } — target's numeric user id (no invite code needed)
- 201: { status: "pending_sent" } — NOTE: minimal response, unlike /friends/request which returns the full friend object.
- Errors:
  - 403: "Только ученики могут добавлять друзей"
  - 400: "userId обязателен"
  - 404: "Пользователь не найден"
  - 400: "Этот пользователь не является учеником"
  - 400: "Нельзя добавить самого себя"
  - 400: "Вы уже друзья" / "Запрос уже отправлен" (same dedupe logic as /friends/request)
- Effects: inserts friendshipsTable row, same as /friends/request.

### GET /api/connections/friends/:userId/profile
- Auth: Bearer (must be accepted friends with :userId)
- 200: { id, name, username, avatarEmoji, avatarColor, avatarUrl, knowledgeLevel, totalPoints, totalTimeMinutes, bio, age, role, lastSeenAt, completedAssignments: number, isOnline: boolean }
- Errors: [403: "Профиль доступен только друзьям" (no accepted friendship)] [404: "Пользователь не найден"]
- Notes: completedAssignments = raw count of ALL submissionsTable rows for target (no status filter, unlike students/:id/submissions). isOnline threshold = 3 minutes (180,000ms).

---

## calendar.ts

All calendar routes set `Cache-Control: no-store` on GETs (slots, bookings, custom-requests, history).

### GET /api/calendar/slots?date=YYYY-MM-DD
- Auth: Bearer
- Req query: { date?: string } — optional "YYYY-MM-DD"
- 200 (teacher/admin — isTeacher(role)): Array<CalendarSlot & { bookings: Array<{id, slotId, studentId, status, note, studentName}> }> where CalendarSlot = {id, teacherId, date, startTime, endTime, createdAt}. If `date` omitted, returns ALL of caller's slots (not just future); if provided, filters to that exact date.
- 200 (student): Array<{ id, teacherId, date, startTime, endTime, teacherName, status: "confirmed_me"|"unavailable"|"pending"|"available", myBookingId: number|null }>. Only slots belonging to teachers the student has an "accepted" teacherStudentsTable connection with. If `date` omitted, filters to `date >= today (UTC, YYYY-MM-DD)`; if provided, filters to exact date (any date, past included). Returns `[]` immediately if student has zero accepted teacher connections.
- Notes on student `status` computation: "confirmed_me" if there's a confirmed booking by the caller; "unavailable" if there's a confirmed booking by someone else; else "pending" if caller has a (non-confirmed, i.e. pending) booking; else "available".

### POST /api/calendar/slots
- Auth: Bearer + isTeacher(role)
- Req body: { date: string, startTime: string, endTime: string }
- 201: { ...CalendarSlot, bookings: [] } (CalendarSlot = {id, teacherId, date, startTime, endTime, createdAt})
- Errors:
  - 403: "Только учитель"
  - 400: "Укажите дату и время" (any of date/startTime/endTime missing)
  - 400: "Конец должен быть позже начала" (endTime <= startTime, STRING comparison)
  - 400: "Нельзя создать слот в прошедшем времени" (date+endTime resolves to before now, treated as UTC)
  - 409: "Слот уже существует" (onConflictDoNothing hit the unique constraint on teacherId+date+startTime)
  - 500: {error: e.message} on unexpected DB error
- Effects: inserts calendarSlotsTable row.

### DELETE /api/calendar/slots/:id
- Auth: Bearer + isTeacher(role)
- 200: { ok: true } (always, even if slot didn't exist or belonged to another teacher — delete is scoped by id AND teacherId=caller, silently no-ops)
- Errors: [403: "Только учитель"]

### POST /api/calendar/slots/:slotId/book
- Auth: Bearer + role==="student"
- Req body: { note?: string }
- 201: SlotBooking = {id, slotId, studentId, status: "pending", note, createdAt}
- Errors:
  - 403: "Только ученик"
  - 404: "Слот не найден"
  - 400: "Нельзя записаться на уже прошедший слот"
  - 409: "Слот уже занят" (a confirmed booking already exists on this slot)
  - 409: "Вы уже записались на этот слот" (onConflictDoNothing hit unique(slotId,studentId) constraint)
  - 500: {error: e.message}
- Effects: inserts slotBookingsTable row with default status "pending" (booking status column default is "pending" per schema).

### PATCH /api/calendar/bookings/:id
- Auth: Bearer + isTeacher(role)
- Req body: { status: "confirmed"|"rejected" }
- 200: updated SlotBooking row {id, slotId, studentId, status, note, createdAt}
- Errors: [403: "Только учитель"] [400: "Неверный статус" (status not in confirmed/rejected)] [404: "Запрос не найден"]
- Effects: if status="confirmed", first sets ALL OTHER pending bookings on the same slot to "rejected" (auto-reject competing requests), then updates the target booking.

### DELETE /api/calendar/bookings/:id
- Auth: Bearer (student — implicitly scoped by studentId=caller, no explicit role check)
- 200: { ok: true } (always; delete scoped by id AND studentId=caller, no-ops silently if mismatch)

### GET /api/calendar/bookings
- Auth: Bearer
- 200 (teacher/admin): Array<{ id, slotId, studentId, status: "pending", note, createdAt, studentName, date, startTime, endTime }> — ONLY pending bookings across all of caller's slots. Returns [] if caller has zero slots.
- 200 (student): Array<{ id, slotId, status, note, createdAt, teacherName, date, startTime, endTime }> — ALL of caller's own bookings regardless of status.

### POST /api/calendar/custom-requests
- Auth: Bearer + role==="student"
- Req body: { teacherId: number, date: string, startTime: string, endTime: string, note?: string }
- 201: CustomBookingRequest = {id, studentId, teacherId, date, startTime, endTime, note, status: "pending", createdAt}
- Errors:
  - 403: "Только ученик"
  - 400: "Укажите учителя, дату и время"
  - 400: "Конец должен быть позже начала"
  - 400: "Нельзя предложить прошедшее время"
  - 403: "Нет связи с этим учителем" (no accepted teacherStudentsTable link to teacherId)
- Effects: inserts customBookingRequestsTable row.

### GET /api/calendar/custom-requests
- Auth: Bearer
- 200 (teacher/admin): Array<{ id, studentId, teacherId, date, startTime, endTime, note, status: "pending", createdAt, studentName }> — only status="pending" rows for caller as teacher.
- 200 (student): Array<{ id, studentId, teacherId, date, startTime, endTime, note, status, createdAt, teacherName }> — ALL of caller's own requests, any status.

### PATCH /api/calendar/custom-requests/:id
- Auth: Bearer + isTeacher(role)
- Req body: { status: "confirmed"|"rejected" }
- 200: updated CustomBookingRequest row
- Errors: [403: "Только учитель"] [400: "Неверный статус"] [404: "Запрос не найден" (row not found OR not owned by caller as teacherId)]
- Effects (if status="confirmed"): finds-or-creates a calendarSlotsTable row matching (teacherId, date, startTime) [endTime taken from the request if creating]; then inserts a slotBookingsTable row with status="confirmed" for that student on that slot (onConflictDoNothing, so if a booking already exists for slot+student it is silently NOT updated to confirmed — potential edge case bug). Always updates customBookingRequestsTable.status regardless.

### GET /api/calendar/history
- Auth: Bearer + isTeacher(role)
- 200: Array<CalendarSlot & { confirmedBookings: Array<{ bookingId, slotId, studentId, note, studentName, studentSurname, studentUsername, studentEmoji, studentColor }> }>, filtered to slots where `date <= today (UTC)`, sorted DESC by date then by startTime (both string `.localeCompare`).
- Errors: [403: "Только учитель"]
- Notes: despite the route comment saying "past + upcoming", the actual filter (`slot.date <= todayUTC`) EXCLUDES future-dated slots — only today-or-earlier slots are returned. Returns [] immediately if teacher has zero slots at all.

### POST /api/calendar/slots/:slotId/assign
- Auth: Bearer + isTeacher(role)
- Req body: { studentId: number, note?: string }
- 201: SlotBooking row {id, slotId, studentId, status: "confirmed", note, createdAt}
- Errors: [403: "Только учитель"] [400: "Укажите ученика"] [404: "Слот не найден" (slot doesn't exist or isn't owned by caller)]
- Effects: rejects all pending bookings on that slot; then upserts (update-if-exists else insert) a slotBookingsTable row for studentId with status="confirmed". If a booking row for (slotId, studentId) already existed, its note is preserved unless a new note is passed.

---

## assignments.ts

### Question object shape (via GET /assignments/:id and submit flow)
- questionsTable row: { id, assignmentId, text, options: string[] (jsonb), correctAnswer: string, orderIndex: number, createdAt }
- `options` is a plain array of option strings (or [] for open-answer / free-text questions — presence of >=2 options = multiple choice per `hasChoiceOptions()`).
- `correctAnswer` is a plain string (exact match, case-insensitive/trim on grading — see submit below). It is HIDDEN (returned as `null`) from students on GET /assignments/:id; visible only to teacher/admin.
- Assignment `type` enum values (assignmentTypeEnum): "text_test" | "audio" | "reading" | "video" | "free_form".
- `imageUrl`/`mediaUrl` are plain nullable text URLs on the assignment row (not per-question).
- `points` on assignmentsTable = the assignment's MAX possible points, auto-computed server-side at create/update time via `computeMaxPoints()` — NEVER settable by client directly (client-sent `points` in POST body is ignored). free_form assignments always have points=0 (graded later, ad hoc).
- Points formula (lib/points.ts): perCorrect = 2 (base) × typeDifficulty (audio 2.5, video 1.8, free_form 1.5, reading 1.2, text_test 1.0) × formatMult (1.0 if question has >=2 options, else 1.5 for open-answer) × timeMult (1.3 if assignment.timeLimitMinutes > 0, else 1.0). computeMaxPoints = round(sum of perCorrect over all questions, assuming no options i.e. worst-case difficulty... actually uses each question's own hasChoiceOptions()).

### GET /api/assignments
- Auth: Bearer
- Req query: { type?: string, ageMin?: number, ageMax?: number }
- 200: Array<Assignment> full assignmentsTable rows: {id, title, description, type, source, createdBy, ageMin, ageMax, points, mediaUrl, content, isDraft, timeLimitMinutes, imageUrl, deletedAt, createdAt, updatedAt} — NOTE: does not filter out soft-deleted (deletedAt) rows, and does NOT include nested `questions` (that's only on the :id detail route).
- Notes: students see only isDraft=false rows. Teachers/admins see all published rows PLUS their own drafts (`!a.isDraft || a.createdBy === caller.userId`). `ageMin` filter: keeps assignment if `assignment.ageMin <= ageMin` (i.e. filters for assignments that START at or below the given ageMin — slightly counter-intuitive, not a range-overlap check). `ageMax` filter: keeps if `assignment.ageMax >= ageMax`.

### GET /api/assignments/my-assignments
- Auth: Bearer + (isTeacher(role) || role==="admin")
- 200: Array<Assignment> (full rows) — caller's own assignments (createdBy=caller) excluding soft-deleted (deletedAt IS NULL). Includes drafts.
- Errors: [403: "Forbidden"]

### GET /api/assignments/my-tasks
- Auth: Bearer (student)
- 200: Array<{ assignedTaskId, assignedAt, teacherId, teacherName, assignmentId, title, description, type, points, ageMin, ageMax, content, mediaUrl, createdAt }>
- Notes: "active" tasks only — excludes tasks where a submission exists with submittedAt > assignedAt (i.e. already submitted since being (re-)assigned); excludes soft-deleted and draft assignments.

### GET /api/assignments/teacher-results
- Auth: Bearer + isTeacher(role)
- 200: Array<{ assignedTaskId, assignedAt, studentId, studentName, studentAvatarEmoji, studentAvatarColor, studentAvatarUrl, assignmentId, assignmentTitle, assignmentType, assignmentPoints, assignmentMediaUrl, assignmentImageUrl, submission: SubmissionSummary|null, answers: Array<{id, questionId, studentAnswer, isCorrect, correctAnswer, questionText}> }>
  - SubmissionSummary = { id, score, correctCount, totalQuestions, pointsEarned, textAnswer, attachmentUrl, status, teacherFeedback, submittedAt }
- Errors: [403: "Forbidden"]
- Notes: ALL assignedTasksTable rows for this teacher (not just "active" ones — includes already-submitted tasks), each enriched with its matching submission (found by studentId+assignmentId, NOT scoped to assignedAt, so if a student has multiple historical submissions for the same assignment, only ONE non-deterministic match is returned via `[submission] = ...`) and that submission's answers (empty array if no submission yet).

### GET /api/assignments/my-submissions
- Auth: Bearer (student — implicitly scoped to caller, no role check)
- 200: Array<{ submissionId, score, correctCount, totalQuestions, pointsEarned, submittedAt, assignmentId, title, description, type, points }> sorted DESC by submittedAt.
- Notes: ALL submissions (no status filter — includes "pending" free_form submissions awaiting grading). `points` = assignment's max points (not pointsEarned).

### GET /api/assignments/:id
- Auth: Bearer
- 200: { ...full Assignment row fields, questions: Array<{ id, text, options, correctAnswer: string|null, orderIndex }> } — questions sorted by orderIndex ASC.
- Errors: [404: "Assignment not found"]
- Notes: correctAnswer is null unless caller isTeacher(role) or role==="admin".

### POST /api/assignments
- Auth: Bearer + (isTeacher(role) || role==="admin")
- Req body: { title: string, description?: string, type: AssignmentType, ageMin?: number, ageMax?: number, mediaUrl?: string, content?: string, questions?: Array<{text, options?, correctAnswer?, orderIndex?}>, isDraft?: boolean, timeLimitMinutes?: number, imageUrl?: string }
- 201: full Assignment row (WITHOUT nested questions in the response, even though questions were just inserted)
- Errors: [403: "Forbidden"] [400: "Введите название задания" (title blank)] [400: "Выберите тип задания" (type missing)]
- Effects: `points` is SERVER-COMPUTED (see formula above) — client-supplied points ignored entirely. `isDraft` defaults to true unless explicitly `false` is sent (`isDraft !== false`). `ageMin`/`ageMax` default to 5/18 if falsy. Inserts questionsTable rows for each item in `questions` (if any), each with `options: q.options ?? []`, `correctAnswer: q.correctAnswer ?? ""`, `orderIndex: q.orderIndex ?? i` (array index fallback).

### POST /api/assignments/:id/publish
- Auth: Bearer + (isTeacher(role) || role==="admin")
- 200: updated Assignment row (isDraft=false)
- Errors: [403: "Forbidden"] [404: "Not found" (id doesn't exist or createdBy !== caller.userId)]

### POST /api/assignments/:id/assign
- Auth: Bearer + isTeacher(role)
- Req body: { studentIds: number[] }
- 200: { ok: true, assigned: number, skipped: number } — assigned/skipped are COUNTS, not lists.
- Errors: [403: "Forbidden"] [400: "studentIds required" (not array or empty)] [404: "Assignment not found"] [400: "Нет принятых учеников из списка" (none of studentIds have an accepted teacherStudentsTable link to caller)]
- Effects: auto-publishes the assignment if it was a draft (sets isDraft=false). Filters studentIds down to only those with accepted connection to caller. Among those, SKIPS students who already have an active (unsubmitted-since-assignment) assignedTasksTable row for this assignment — these count toward `skipped`. For the rest, deletes any existing assignedTasksTable row (same assignment+teacher+student) then inserts a fresh one (assignedAt=now via default).

### PATCH /api/assignments/:id
- Auth: Bearer + (isTeacher(role) || role==="admin"), AND createdBy must equal caller.userId (enforced in WHERE clause, manifests as 404 if not owner)
- Req body: { title?, description?, ageMin?, ageMax?, mediaUrl?, content?, type?, questions? } — only provided keys update (spread with `!== undefined` guards); NOTE `imageUrl` and `timeLimitMinutes` are NOT among the patchable fields here despite being settable on create.
- 200: updated Assignment row (points recomputed & included if `questions` or `type` changed; otherwise the plain `updated` row from the first UPDATE)
- Errors: [403: "Forbidden"] [404: "Not found"]
- Effects: if `questions` provided, deletes all existing questionsTable rows for this assignment and re-inserts the new list (orderIndex = array index, ignoring any q.orderIndex sent). If `questions` OR `type` changed, recomputes `points` via computeMaxPoints — using the NEW questions if questions changed, otherwise re-fetching the assignment's EXISTING stored questions (just their `options`) to combine with the new `type`.

### DELETE /api/assigned-tasks/:assignedTaskId
- Auth: Bearer + (isTeacher(role) || role==="admin")
- 204 No Content (empty body)
- Errors: [403: "Forbidden"]
- Effects: deletes the assignedTasksTable row scoped by id AND teacherId=caller (silent no-op / still 204 if not found or not owned).
- Notes: lives in assignments.ts (not submissions.ts).

### DELETE /api/assignments/:id
- Auth: Bearer + (isTeacher(role) || role==="admin")
- 204 No Content
- Errors: [403: "Forbidden"] [404: "Задание не найдено" (not found, not owned by caller, or already soft-deleted)]
- Effects: SOFT delete — sets `deletedAt = now()` (does not remove the row). Students who already have this assignment in assignedTasksTable keep it (per code comment); the assignment simply disappears from the teacher's my-assignments list and from GET /assignments generic listing filters that exclude/hide deleted... (Note: GET /assignments itself does not explicitly filter deletedAt, but /my-assignments and /my-tasks do via `isNull(assignmentsTable.deletedAt)`).

---

## submissions.ts (+ POST /assignments/:id/submit which lives in this file)

### POST /api/assignments/:id/submit
- Auth: Bearer
- Req body (question-based types): { answers: Array<{ questionId: number, answer: string }>, recordingUrl?: string }
- Req body (free_form type): { textAnswer?: string, attachmentUrl?: string }
- 200 (free_form): { submissionId, pending: true, score: 0, totalQuestions: 0, correctCount: 0, pointsEarned: 0, results: [] }
- 200 (question-based): { submissionId, score: number, totalQuestions: number, correctCount: number, pointsEarned: number, results: Array<{ questionId, isCorrect: boolean, studentAnswer: string, correctAnswer: string }> }
- Errors: [404: "Assignment not found"] [400: "Добавьте текст ответа или прикрепите файл" (free_form with neither textAnswer nor attachmentUrl, both trimmed-empty)]
- Effects:
  - free_form: inserts submissionsTable row with score/correctCount/totalQuestions/pointsEarned all 0, status="pending" (awaiting teacher grading), textAnswer/attachmentUrl trimmed-or-null. NO points awarded yet, NO submissionAnswersTable rows created.
  - question-based: grading is exact string match, case-insensitive + trimmed: `question.correctAnswer.toLowerCase().trim() === answer.answer.toLowerCase().trim()`. Any answer.questionId not matching a real question for this assignment is silently skipped (not counted in totalQuestions either — totalQuestions = ALL questions for the assignment, not just answered ones). score = `Math.round(correctCount / totalQuestions * 100)`, or 0 if zero questions. pointsEarned = sum over correct answers of `pointsPerCorrect(assignment.type, hasChoiceOptions(question), isTimeLimited(assignment.timeLimitMinutes))`, rounded. Inserts submissionsTable row with status="graded". Inserts one submissionAnswersTable row per evaluated answer (only for questionIds that matched a real question). If pointsEarned > 0, increments usersTable.totalPoints by pointsEarned (read-then-write, not atomic SQL increment — differs from time-tracking.ts's atomic `sql` increment).

### PATCH /api/submissions/:id/grade
- Auth: Bearer — allowed if role==="admin", OR ( isTeacher(role) AND (caller created the parent assignment OR caller is the teacher who assigned this specific task via assignedTasksTable) )
- Req body: { correctCount: number, totalQuestions: number, feedback?: string }
- 200: updated Submission row (full submissionsTable row: {id, studentId, assignmentId, score, correctCount, totalQuestions, pointsEarned, recordingUrl, textAnswer, attachmentUrl, status: "graded", teacherFeedback, submittedAt})
- Errors: [404: "Submission not found"] [404: "Assignment not found"] [403: "Forbidden"]
- Notes/Effects: this is the ONLY grading mutation route (method confirmed PATCH, not POST). `total` is clamped to >= 1 (`Math.max(1, round(totalQuestions||1))`); `correct` clamped to [0, total]. `score = round(correct/total*100)`. Points: `perCorrect = pointsPerCorrect(assignment.type, false, isTimeLimited(...))` — hasOptions is HARDCODED false here (free_form answers are always open-ended), `points = round(perCorrect * correct)`. `teacherFeedback` = feedback trimmed or null. Sets status="graded". If points > 0, increments the STUDENT's (submission.studentId, not caller's) usersTable.totalPoints (read-then-write).

### GET /api/submissions/:submissionId/review
- Auth: Bearer (self student, or any teacher/admin — `isTeacher(caller.role) || submission.studentId === caller.userId`)
- Lives in assignments.ts (registered there, not submissions.ts) but documented here per task grouping.
- 200: { id, score, correctCount, totalQuestions, pointsEarned, submittedAt, studentId, assignmentId, textAnswer, attachmentUrl, status, teacherFeedback, assignment: {id, title, type, points, mediaUrl, imageUrl} | null, answers: Array<{id, questionId, studentAnswer, isCorrect, correctAnswer, questionText}> }
- Errors: [404: "Submission not found"] [403: "Forbidden"]

### GET /api/assignments/:id/submissions
- Auth: Bearer (no explicit role/ownership check — any authenticated user can view any assignment's submissions)
- 200: Array<{ id, studentId, studentName, assignmentId, assignmentTitle, score, correctCount, totalQuestions, pointsEarned, recordingUrl, textAnswer, attachmentUrl, status, teacherFeedback, submittedAt, answers: Array<{questionId, isCorrect, studentAnswer, correctAnswer}> }>
- Notes: not in the requested endpoint list but exists; ALL submissions for the assignment id (no status filter).

### GET /api/students/:id/submissions (submissions.ts version — UNREACHABLE, see users.ts note above)
- Same response shape as /assignments/:id/submissions but filtered by studentId instead of assignmentId, and includes assignmentTitle via join. This route is shadowed by the identically-pathed route registered earlier in users.ts; document the users.ts version as authoritative.

### GET /api/students/:id/errors
- Auth: Bearer (no explicit role check)
- 200: Array<{ assignmentId, assignmentTitle, questionText, studentAnswer, correctAnswer, occurredAt }>
- Notes: not in requested list but exists; only isCorrect=false submissionAnswersTable rows for this student, across all assignments.

---

## gamification.ts

### GET /api/gamification/stats
- Auth: Bearer
- 200: {
    totalPoints: number,
    xpLevel: number (1-50, computed live via computeLevel(totalPoints), NOT read from usersTable.xpLevel column),
    dailyGoalMinutes: number,
    loginStreak: number,
    lastLoginDate: string|null ("YYYY-MM-DD"),
    todayMinutes: number,
    todayCompletions: number,
    todayVoiceSessions: number,
    voiceChatSessions: number (all-time count),
    perfectScoreCount: number (graded submissions with score===100),
    completedAssignments: number (all-time graded submissions count),
    earlyBirdSessions: number (timeSessions started before 9am server-local hour),
    unlockedAchievementIds: string[] (from userAchievementsTable.achievementId),
    totalTimeMinutes: number,
    mascotName: string
  }
- Errors: [404: "User not found"]
- Notes on XP_THRESHOLDS (50 levels, index 0 = level 1 requires 0 XP): [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4100, 5200, 6500, 8000, 9800, 11800, 14000, 16500, 19500, 23000, 27000, 31500, 36500, 42000, 48000, 55000, 63000, 72000, 82000, 93000, 105000, 118000, 132000, 147000, 163000, 180000, 198000, 217000, 237000, 258000, 280000, 303000, 327000, 352000, 378000, 405000, 433000, 462000, 492000, 523000]. computeLevel(xp): highest level i+1 such that xp >= XP_THRESHOLDS[i], capped at 50.
- `mascotName` fallback logic: if userData.mascotName is null/undefined OR literally equals "Оливер" (the DB column default), returns "Снежа" instead; otherwise returns the stored value verbatim.
- `todayMinutes`/`totalTimeMinutes` include elapsed time from a currently-open timeSessions row (not yet persisted to totalTimeMinutes column).
- `earlyBirdSessions` computation wrapped in try/catch, silently returns 0 on any SQL error (e.g. driver incompatibility with EXTRACT).

### POST /api/gamification/daily-login
- Auth: Bearer
- Req: none
- 200 (already claimed today): { alreadyClaimed: true, loginStreak: number, totalPoints: number, xpLevel: number, pointsAwarded: 0 }
- 200 (new claim): { alreadyClaimed: false, loginStreak: number (new streak), totalPoints: number (new total), xpLevel: number (new level), pointsAwarded: number, bonusPoints: number, leveledUp: boolean }
- Errors: [404: "User not found"]
- Notes: DAILY_LOGIN_POINTS = 30 (flat, always awarded on a new-day claim). STREAK_BONUS_POINTS indexed by streak day = [0, 0, 5, 10, 15, 20, 25, 50] (index clamped to array length-1, so day 7+ = index 7 = +50 bonus always). pointsAwarded = 30 + bonus. Streak logic: if lastLoginDate is exactly yesterday (diffDays===1), streak = old+1; otherwise (including first-ever login, or diffDays>1 gap) streak resets to 1. `leveledUp` = newXpLevel > userData.xpLevel (the STORED xpLevel column, which may be stale vs. the live-computed value used elsewhere). Effects: updates usersTable totalPoints, loginStreak, lastLoginDate=today, xpLevel=newXpLevel.

### PATCH /api/gamification/daily-goal
- Auth: Bearer
- Req body: { minutes: 10 | 15 | 20 | 30 } (must be exactly one of these 4 values)
- 200: { dailyGoalMinutes: number }
- Errors: [400: "Invalid goal. Must be 10, 15, 20, or 30 minutes."]

### POST /api/gamification/achievements/unlock
- Auth: Bearer
- Req body: { achievementIds: string[] }
- 200: { unlocked: string[] (newly-inserted ids), alreadyHad: string[] (ids from the input that were already present) }
- Errors: [400: "achievementIds required" (not array or empty)]
- Effects: inserts userAchievementsTable rows only for ids not already present for this user (idempotent).

### PATCH /api/gamification/mascot-name
- Auth: Bearer
- Req body: { name: string } (max length 20)
- 200: { mascotName: string } (trimmed)
- Errors: [400: "Invalid name" (missing, non-string, or length > 20)]

### POST /api/gamification/sync-xp-level (not in requested list but exists)
- Auth: Bearer
- 200: { xpLevel: number, totalPoints: number }
- Errors: [404: "User not found"]
- Effects: recomputes level from totalPoints and persists to usersTable.xpLevel only if it changed.

---

## timeTracking.ts

### POST /api/time-tracking/start
- Auth: Bearer
- Req: none
- 200: full TimeSession row: { id, studentId, startedAt, endedAt: null, durationMinutes: null } (the NEWLY created open session)
- Effects: first, closes any/all PRE-EXISTING open sessions for this student (there should normally be at most one, but code handles multiple defensively): for each, computes `rawMinutes = round((now - startedAt)/60000)`, clamps to `min(rawMinutes, 240)` (MAX_ORPHAN_MINUTES — caps credit for abandoned/never-closed sessions), sets that session's endedAt=now + durationMinutes=clamped value, and accumulates the clamped minutes. If any accumulated minutes > 0, atomically increments usersTable.totalTimeMinutes via SQL `totalTimeMinutes + accumulatedMinutes` (race-safe, unlike the read-then-write pattern used for totalPoints elsewhere). THEN inserts a fresh timeSessionsTable row (studentId=caller, startedAt=now via default, endedAt=null).

### POST /api/time-tracking/end
- Auth: Bearer
- Req: none
- 200: { ok: true, durationMinutes: number } — normal case
- 200: { message: "No open session" } — DIFFERENT SHAPE if no open session exists (no `ok`/`durationMinutes` keys at all)
- Effects: durationMinutes = `round((now - openSession.startedAt)/60000)` (NOT clamped to 240 here, unlike /start's orphan-closing path). Sets endedAt=now, durationMinutes on the session row. Atomically increments usersTable.totalTimeMinutes by durationMinutes via SQL expression (if > 0).

### GET /api/students/:id/time
- Auth: Bearer (no ownership/role check — any authenticated user can query any student's time)
- 200: { totalMinutes: number, todayMinutes: number, weekMinutes: number, sessions: TimeSession[] (ALL sessions for the student, full rows: {id, studentId, startedAt, endedAt, durationMinutes}) }
- Notes: `totalMinutes` = usersTable.totalTimeMinutes + elapsed minutes of currently-open session (if any) via `Math.floor`. `todayMinutes`/`weekMinutes` sum CLOSED sessions' durationMinutes starting on/after local-midnight-today / local-week-start (week starts Sunday: `date - now.getDay()`), PLUS the open session's elapsed minutes if its startedAt falls in that window. `sessions` array is returned RAW/UNFILTERED (includes the open session with endedAt=null, durationMinutes=null).

---

## leaderboard.ts

### GET /api/leaderboard
- Auth: Bearer
- 200: Array<{ userId, name, surname, username, totalPoints, avatarEmoji, avatarColor, avatarUrl, completedAssignments: number, rank: number }>
- Notes: all users with role="student", sorted DESC by totalPoints (ties broken by DB return order, no secondary sort key), rank = 1-based array index+1. completedAssignments = raw count of ALL submissionsTable rows for that student (no status filter — N+1 query pattern, one count query per student).

### GET /api/leaderboard/categories?scope=&ageMin=&ageMax=
- Auth: Bearer
- Req query: { scope?: "all"|"friends" (default "all" if omitted/anything else defaults to the "all" behavior since only "friends" is special-cased), ageMin?: number, ageMax?: number }
- 200: { points: Entry[], time: Entry[], assignments: Entry[] } where Entry = { userId, name, surname, username, avatarEmoji, avatarColor, avatarUrl, value: number, rank: number }
  - `points` list: value = totalPoints, sorted DESC.
  - `time` list: value = totalTimeMinutes (0 if null), sorted DESC.
  - `assignments` list: value = Math.round(avg score) across ALL of that student's status="graded" submissions (computed ONCE globally via a single GROUP BY query, then looked up per student; 0 if the student has no graded submissions), sorted DESC.
  - Each of the 3 lists is independently sorted and ranked (a student's rank differs per list).
- Notes on `scope=friends`: filters the student pool to (caller's accepted friendshipsTable connections) UNION (caller themself) — so the caller always appears in their own friends leaderboard even if they have zero friends.
- Notes on age filtering: `age = calcAgeFromDOB(dateOfBirth) ?? user.age` (prefers computed age from dateOfBirth, falls back to the stored `age` integer column); students with no resolvable age are EXCLUDED entirely when any age filter is active. calcAgeFromDOB uses standard "has birthday occurred yet this year" logic.
- All 3 category pools start from the SAME filtered student set (role=student, then scope filter, then age filter) — filters are NOT independent per category.

---

## upload.ts

### POST /api/upload/image
- Auth: Bearer
- Content-Type: multipart/form-data
- Multipart field name: `file` (single file, `upload.single("file")`)
- 200: { url: string, filename: string }
- Errors: [400: "No file uploaded" (no file attached / wrong field name)]
- Notes: `url` = `${protocol}://${host}/api/uploads/${filename}` where protocol reads `x-forwarded-proto` header (default "https") and host reads `host` header. `filename` on disk = `${Date.now()}-${random base36}${ext}` (ext taken from original filename). Size limit: 100MB (multer `limits.fileSize`). Files stored to `../../uploads` relative to server cwd, falling back to `/tmp/uploads` if that path can't be created.
- Sibling routes with IDENTICAL response shape/logic exist for other media: POST /upload/audio, POST /upload/video, POST /upload/student-recording (all also use field name `file`, same {url, filename} response, same errors) — not explicitly requested but relevant since a mock should stub all 4 identically.

### GET /api/uploads/:filename
- Auth: none (public, no requireAuth)
- 200: raw file bytes via `res.sendFile(filepath)` — NOT JSON. Content-Type inferred by Express from file extension.
- Errors: [404: {error: "File not found"} JSON, if file doesn't exist on disk]

---

## storage.ts

### POST /api/storage/request-upload-url
- Auth: Bearer
- Req body: { name: string, size: number, contentType: string } (validated via zod; all 3 required)
- 200: { uploadURL: string, objectPath: string } — uploadURL is a presigned direct-upload URL from ObjectStorageService (external object storage, e.g. GCS/S3-style signed URL); objectPath is the normalized internal path (`/objects/...`) the client should reference afterward.
- Errors: [400: "Missing or invalid required fields" (zod validation failure)] [500: "Failed to generate upload URL"]
- Notes: this is a SEPARATE upload mechanism from upload.ts's multer-based `/upload/image` — this one is for direct-to-object-storage presigned uploads; the actual file bytes never pass through this Express server for this flow.

### GET /api/storage/objects/*path (not explicitly requested, but is the counterpart read endpoint)
- Auth: none (public)
- 200: streamed object bytes from storage, with headers forwarded from the storage response.
- Errors: [404: {error: "Object not found"}] [500: {error: "Failed to serve object"}]

---

## JWT

Payload (signed with `SESSION_SECRET` env var, fallback `"dev-secret-key"`; HS256; 30-day expiry):
```
{
  userId: number,
  role: "student" | "parent" | "admin" | "teacher"
}
```
- No `iat`/`exp` documented explicitly in payload type but jwt.sign adds standard `iat`/`exp` claims automatically (expiresIn: "30d").
- `requireAuth` middleware: reads `Authorization` header, requires exact prefix `"Bearer "` (case-sensitive, one space) else 401 `{error: "Unauthorized"}` (missing/malformed header). If token present but `jwt.verify` throws (bad signature/expired/malformed) → 401 `{error: "Invalid token"}`. On success, attaches decoded payload to `req.user` (via `(req as any).user`), accessible through `getUser(req)`.
- `requireRole(...roles)`: 403 `{error: "Forbidden"}` if `req.user.role` not in the given list (used less often than the ad hoc `isTeacher()` checks sprinkled through routes).
- `isTeacher(role)`: returns true for role === "admin" OR role === "teacher" (so "admin" is treated as teacher-equivalent almost everywhere `isTeacher()` is used; some routes additionally OR in an explicit `caller.role === "admin"` check redundantly).

## PUBLIC_USER_FIELDS

Defined in `routes/auth.ts` as a mapping function `(u: usersTable row) => ({...})`, applied to the full DB row. Exact fields returned:
```
{
  id: number,
  username: string,
  name: string,
  surname: string | null,
  role: "student" | "parent" | "admin" | "teacher",
  age: number | null,
  dateOfBirth: string | null,        // "YYYY-MM-DD" (date column)
  knowledgeLevel: "starter" | "beginner" | "elementary" | "intermediate" | "upper_intermediate" | null,
  email: string | null,
  emailVerified: boolean,            // NOTE: converted from DB text "true"/"false" to a real boolean here (u.emailVerified === "true")
  totalPoints: number,
  totalTimeMinutes: number,
  avatarEmoji: string | null,        // DB default "🦁" if never set
  avatarColor: string | null,        // DB default "#6366f1" if never set
  avatarUrl: string | null,
  bio: string | null,
  inviteCode: string | null,
  createdAt: string,                 // ISO timestamp
}
```
- Used by: POST /auth/login (`user` field), POST /auth/register (`user` field), GET /auth/me (top-level, unwrapped).
- IMPORTANT: this mapping does NOT include `xpLevel`, `dailyGoalMinutes`, `loginStreak`, `lastLoginDate`, `mascotName`, `lastSeenAt`, `updatedAt`, `parentId`, or `passwordHash` — despite the task prompt's example listing fields like `xpLevel`/`dailyGoalMinutes`/`loginStreak`/`parentId`/`mascotName` as part of a hypothetical PUBLIC_USER_FIELDS, the ACTUAL implementation in this codebase does not include them. Those gamification fields are only obtainable via GET /gamification/stats, and `parentId` is not exposed by any documented endpoint's user object (it's used only in filtering, e.g. GET /users?parentId=).
- Other endpoints construct their OWN partial user-shaped objects inline (see per-endpoint sections above) rather than reusing PUBLIC_USER_FIELDS — e.g. GET /users/:id builds its own object with `completedAssignments`/`isOnline`/`lastSeenAt` added and `inviteCode` omitted; connections.ts endpoints each select their own minimal field lists (typically a subset like {id, name, username, avatarEmoji, avatarColor, avatarUrl, ...}) rather than calling PUBLIC_USER_FIELDS at all.
