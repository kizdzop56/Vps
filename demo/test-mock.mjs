// Functional test of mock-backend.js in Node (simulates browser globals).
import { readFileSync } from "node:fs";

// --- browser-ish globals ---
var mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};
globalThis.location = { hash: "", origin: "http://localhost", href: "http://localhost/" };
globalThis.window = globalThis;
globalThis.FileReader = class { readAsDataURL() { this.onload && this.onload(); } get result() { return "data:image/png;base64,AA=="; } };
window.fetch = async () => { throw new Error("real fetch called unexpectedly"); };

// --- load the mock ---
eval(readFileSync("/agent/workspace/webapp-build/mock-backend.js", "utf8").replace("__SEED_VIDEO_DATAURL__", "data:video/mp4;base64,AAAAGGZ0eXBtcDQy"));

const api = (path, opts = {}, token) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  return window.fetch(path, { ...opts, headers: { ...headers, ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
};

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("✅ " + name); }
  else { fail++; console.log("❌ " + name + (extra !== undefined ? " — " + JSON.stringify(extra).slice(0, 300) : "")); }
}

const j = (r) => r.json();

// ============ TESTS ============
// login
let r = await api("/api/auth/login", { method: "POST", body: { username: "teacher", password: "teacher123" } });
let teacher = await j(r);
check("login teacher 200", r.status === 200 && teacher.token && teacher.user.role === "teacher", teacher);

r = await api("/api/auth/login", { method: "POST", body: { username: "student", password: "student123" } });
let student = await j(r);
check("login student 200", r.status === 200 && student.user.role === "student" && student.user.totalPoints === 2850, student.user);

r = await api("/api/auth/login", { method: "POST", body: { username: "student", password: "wrong" } });
check("login wrong password 401", r.status === 401);

const T = teacher.token, S = student.token;

// me
r = await api("/api/auth/me", {}, S);
let me = await j(r);
check("auth/me student", me.username === "student" && me.emailVerified === true && me.inviteCode === "ALEX42", me);

// unauthorized
r = await api("/api/gamification/stats", {});
check("no token -> 401", r.status === 401);

// teacher students
r = await api("/api/connections/teacher/students", {}, T);
let sts = await j(r);
check("teacher/students has 3 accepted", Array.isArray(sts) && sts.length === 3 && sts.some((s) => s.name === "Алекс"), sts.map && sts.map((s) => s.name));
check("students have isOnline field", sts[0] && typeof sts[0].isOnline === "boolean");

// teacher pending
r = await api("/api/connections/teacher/pending", {}, T);
let pend = await j(r);
check("teacher/pending 1 (Сэм)", pend.length === 1 && pend[0].student && pend[0].student.name === "Сэм", pend);

// student teachers
r = await api("/api/connections/student/teachers", {}, S);
let tchs = await j(r);
check("student/teachers 1 (Мария, online)", tchs.length === 1 && tchs[0].name === "Мария" && tchs[0].isOnline === true, tchs);

// friends
r = await api("/api/connections/friends", {}, S);
let frs = await j(r);
check("friends list: 4 rows (2 accepted, 1 recv pending, 1 sent pending)",
  frs.length === 4 &&
  frs.filter((f) => f.status === "accepted").length === 2 &&
  frs.some((f) => f.status === "pending" && f.direction === "received" && f.user.name === "Феникс") &&
  frs.some((f) => f.status === "pending" && f.direction === "sent" && f.user.name === "СтарКвин"),
  frs.map((f) => f.user.name + ":" + f.status + ":" + f.direction));

// accept friend request from Феникс
const recvReq = frs.find((f) => f.direction === "received" && f.status === "pending");
r = await api("/api/connections/friends/" + recvReq.friendshipId + "/accept", { method: "PATCH" }, S);
check("accept friend request", r.status === 200);
r = await api("/api/connections/friends/status/4", {}, S); // PHNX id=4
let fst = await j(r);
check("friend status now friends", fst.status === "friends", fst);

// leaderboard
r = await api("/api/leaderboard/categories?scope=all", {}, S);
let lb = await j(r);
check("leaderboard: points top = СтарКвин 4820", lb.points[0].name === "СтарКвин" && lb.points[0].value === 4820 && lb.points[0].rank === 1, lb.points[0]);
check("leaderboard: 3 independent lists", Array.isArray(lb.time) && Array.isArray(lb.assignments));
r = await api("/api/leaderboard/categories?scope=friends", {}, S);
let lbf = await j(r);
check("friends leaderboard includes self + 3 friends", lbf.points.length === 4, lbf.points.map((e) => e.name));

// my-tasks (student): expect Цвета и числа + Чтение (A1 submitted, A3 submitted)
r = await api("/api/assignments/my-tasks", {}, S);
let tasks = await j(r);
check("my-tasks: 3 active (incl seed video)", tasks.length === 3 && tasks.some((t) => t.title === "Цвета и числа") && tasks.some((t) => t.title.indexOf("Чтение") === 0) && tasks.some((t) => t.title.indexOf("Видео") === 0), tasks.map((t) => t.title));

// assignment detail as student: correctAnswer hidden
r = await api("/api/assignments/" + tasks.find((t) => t.title === "Цвета и числа").assignmentId, {}, S);
let a4 = await j(r);
check("assignment detail: 4 questions, answers hidden", a4.questions.length === 4 && a4.questions.every((q) => q.correctAnswer === null), a4.questions && a4.questions[0]);

// submit A4 with 3/4 correct
const ans = [
  { questionId: a4.questions[0].id, answer: "red" },
  { questionId: a4.questions[1].id, answer: "five" },
  { questionId: a4.questions[2].id, answer: "yellow" },
  { questionId: a4.questions[3].id, answer: "six" }, // wrong
];
r = await api("/api/assignments/" + a4.id + "/submit", { method: "POST", body: { answers: ans } }, S);
let subres = await j(r);
check("submit: 3/4, score 75, points 6", subres.correctCount === 3 && subres.score === 75 && subres.pointsEarned === 6 && subres.results.length === 4, subres);

// points awarded
r = await api("/api/auth/me", {}, S);
me = await j(r);
check("student points increased by 6", me.totalPoints === 2856, me.totalPoints);

// my-tasks now excludes A4
r = await api("/api/assignments/my-tasks", {}, S);
tasks = await j(r);
check("my-tasks now 2 (Чтение + Видео)", tasks.length === 2, tasks.map((t) => t.title));

// my-submissions
r = await api("/api/assignments/my-submissions", {}, S);
let msubs = await j(r);
check("my-submissions: 3 rows (A4 new, A3 pending, A1 graded)", msubs.length === 3, msubs.map((s) => s.title + ":" + s.score));

// teacher-results: has pending free_form from Алекс
r = await api("/api/assignments/teacher-results", {}, T);
let tres = await j(r);
const ffRow = tres.find((x) => x.assignmentType === "free_form" && x.submission && x.submission.status === "pending");
check("teacher-results: pending free_form exists", !!ffRow, tres.map((x) => x.assignmentTitle + ":" + (x.submission ? x.submission.status : "none")));
check("teacher-results: graded A1 has 5 answers", tres.some((x) => x.assignmentTitle.indexOf("Животные") === 0 && x.studentName === "Алекс" && x.answers.length === 5));

// grade the free_form
r = await api("/api/submissions/" + ffRow.submission.id + "/grade", { method: "PATCH", body: { correctCount: 5, totalQuestions: 5, feedback: "Отличный рассказ!" } }, T);
let graded = await j(r);
check("grade free_form: score 100, points 23", graded.score === 100 && graded.pointsEarned === 23 && graded.status === "graded", graded);
r = await api("/api/auth/me", {}, S);
me = await j(r);
check("student points +23 after grading", me.totalPoints === 2879, me.totalPoints);

// review screen (student view)
r = await api("/api/submissions/" + ffRow.submission.id + "/review", {}, S);
let rev = await j(r);
check("review: assignment nested + feedback", rev.assignment && rev.assignment.type === "free_form" && rev.teacherFeedback === "Отличный рассказ!", rev);

// gamification stats
r = await api("/api/gamification/stats", {}, S);
let stats = await j(r);
check("stats: level from points, streak 4, mascot Снежа", stats.xpLevel === computeLvl(me.totalPoints) && stats.loginStreak === 4 && stats.mascotName === "Снежа", stats);
function computeLvl(xp) { const X = [0,100,250,450,700,1000,1400,1900,2500,3200,4100]; let l = 1; for (let i = 0; i < X.length; i++) if (xp >= X[i]) l = i + 1; return l; }

// daily login (lastLoginDate = yesterday -> claim works, streak 5)
r = await api("/api/gamification/daily-login", { method: "POST" }, S);
let dl = await j(r);
check("daily-login: +50 (30+20 bonus day5), streak 5", dl.alreadyClaimed === false && dl.loginStreak === 5 && dl.pointsAwarded === 50 && dl.bonusPoints === 20, dl);
r = await api("/api/gamification/daily-login", { method: "POST" }, S);
dl = await j(r);
check("daily-login again: alreadyClaimed", dl.alreadyClaimed === true);

// calendar: student view
r = await api("/api/calendar/slots", {}, S);
let slots = await j(r);
check("calendar slots student: 3 future, statuses", slots.length === 3 && slots.some((s) => s.status === "confirmed_me") && slots.some((s) => s.status === "unavailable" || s.status === "available" || s.status === "pending"), slots.map((s) => s.date + ":" + s.status));

// teacher slots with bookings
r = await api("/api/calendar/slots", {}, T);
let tslots = await j(r);
check("calendar slots teacher: 4 with bookings[]", tslots.length === 4 && tslots.every((s) => Array.isArray(s.bookings)), tslots.map((s) => s.date + ":" + s.bookings.length));

// teacher bookings (pending only)
r = await api("/api/calendar/bookings", {}, T);
let tbk = await j(r);
check("teacher bookings: 1 pending (Луна)", tbk.length === 1 && tbk[0].studentName === "Луна", tbk);

// confirm Луна's booking
r = await api("/api/calendar/bookings/" + tbk[0].id, { method: "PATCH", body: { status: "confirmed" } }, T);
check("confirm booking", r.status === 200);

// custom requests teacher
r = await api("/api/calendar/custom-requests", {}, T);
let crq = await j(r);
check("custom-requests teacher: 1 pending (Алекс)", crq.length === 1 && crq[0].studentName === "Алекс", crq);
r = await api("/api/calendar/custom-requests/" + crq[0].id, { method: "PATCH", body: { status: "confirmed" } }, T);
let crc = await j(r);
check("confirm custom request creates slot+booking", crc.status === "confirmed");

// calendar history (teacher)
r = await api("/api/calendar/history", {}, T);
let hist = await j(r);
check("calendar history: past slot with confirmed booking", hist.length >= 1 && hist[0].confirmedBookings.length >= 1, hist);

// student books a slot
r = await api("/api/calendar/slots", {}, S);
slots = await j(r);
const freeSlot = slots.find((s) => s.status === "available");
if (freeSlot) {
  r = await api("/api/calendar/slots/" + freeSlot.id + "/book", { method: "POST", body: { note: "тест" } }, S);
  check("book slot 201", r.status === 201);
} else check("book slot (no free slot to test)", true);

// create assignment (teacher) + assign
r = await api("/api/assignments", { method: "POST", body: { title: "Тестовое задание", type: "text_test", isDraft: false, questions: [{ text: "One?", options: ["1", "2"], correctAnswer: "1" }] } }, T);
let na = await j(r);
check("create assignment 201, points 2", r.status === 201 && na.points === 2, na);
r = await api("/api/assignments/" + na.id + "/assign", { method: "POST", body: { studentIds: [2] } }, T);
let asg = await j(r);
check("assign to student", asg.ok === true && asg.assigned === 1, asg);

// student sees new task
r = await api("/api/assignments/my-tasks", {}, S);
tasks = await j(r);
check("student sees new task", tasks.some((t) => t.title === "Тестовое задание"), tasks.map((t) => t.title));

// category stats + time + users/:id
r = await api("/api/students/2/category-stats", {}, T);
let cs = await j(r);
check("category-stats: 4 fixed categories", cs.length === 4 && cs[0].type === "text_test" && cs[0].count === 2, cs);
r = await api("/api/students/2/time", {}, T);
let tst = await j(r);
check("time stats shape", typeof tst.totalMinutes === "number" && Array.isArray(tst.sessions), tst);
r = await api("/api/users/2", {}, T);
let u2 = await j(r);
check("users/:id computed fields", typeof u2.completedAssignments === "number" && typeof u2.averageScore === "number", u2);

// profile PATCH
r = await api("/api/users/2/profile", { method: "PATCH", body: { bio: "Новое био" } }, S);
let prof = await j(r);
check("profile patch bio", prof.bio === "Новое био", prof);

// register new student
r = await api("/api/auth/register", { method: "POST", body: { username: "newkid", password: "pass123", name: "Новичок", role: "student", email: "new@example.com" } });
let reg = await j(r);
check("register 201, verified, has code", r.status === 201 && reg.user.emailVerified === true && reg.user.inviteCode, reg.user);

// time tracking (seconds-precise)
r = await api("/api/time-tracking/start", { method: "POST" }, S);
let sess = await j(r);
check("time start: open session", sess.endedAt === null, sess);
// simulate a 90-second session by shifting startedAt back
mem["elmock_db_v4"] && (() => {})();
{
  const dbObj = JSON.parse(mem["elmock_db_v4"]);
  const open = dbObj.timeSessions.find((s) => s.studentId === 2 && !s.endedAt);
  open.startedAt = new Date(Date.now() - 90 * 1000).toISOString();
  mem["elmock_db_v4"] = JSON.stringify(dbObj);
}
// reload mock so it picks the shifted session, then close it
eval(readFileSync("/agent/workspace/webapp-build/mock-backend.js", "utf8").replace("__SEED_VIDEO_DATAURL__", "data:video/mp4;base64,AAAAGGZ0eXBtcDQy"));
localStorage.setItem("auth_user", JSON.stringify({ id: 2 }));
const todayMsBefore = window.__elmockTodayMs();
check("todayMs bridge counts open 90s session", todayMsBefore >= 88000 && todayMsBefore <= 95000 + 20 * 60000, todayMsBefore);
r = await api("/api/time-tracking/end", { method: "POST" }, S);
let te = await j(r);
check("time end: ok shape", te.ok === true && typeof te.durationMinutes === "number", te);
{
  const dbObj2 = JSON.parse(mem["elmock_db_v4"]);
  const closed = dbObj2.timeSessions.filter((s) => s.studentId === 2 && s.endedAt).pop();
  check("session duration stored with seconds precision (~1.5 min)", closed.durationMinutes > 1.4 && closed.durationMinutes < 1.7, closed.durationMinutes);
}

// voice chat 503
r = await api("/api/voice-chat/sessions", { method: "POST" }, S);
check("voice-chat 503", r.status === 503);

// ===== video upload flow (presigned emulation) =====
r = await api("/api/storage/request-upload-url", { method: "POST", body: { name: "clip.mp4", size: 1024, contentType: "video/mp4" } }, T);
let pres = await j(r);
check("request-upload-url returns uploadURL+objectPath", r.status === 200 && pres.uploadURL && pres.objectPath && pres.objectPath.indexOf("/objects/") === 0, pres);

const fakeVideo = new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], { type: "video/mp4" });
r = await window.fetch(pres.uploadURL, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: fakeVideo });
check("PUT presigned upload 200", r.status === 200);

const serveUrl = "/api/storage" + pres.objectPath + "?kind=video";
r = await api("/api/assignments", { method: "POST", body: { title: "Видео-урок", type: "video", isDraft: false, mediaUrl: serveUrl, questions: [{ text: "What did you see?", options: [], correctAnswer: "cat" }] } }, T);
let va = await j(r);
check("create video assignment", r.status === 201, va);

r = await api("/api/assignments/" + va.id, {}, S);
let vaGet = await j(r);
check("assignment mediaUrl mapped to blob: URL", typeof vaGet.mediaUrl === "string" && vaGet.mediaUrl.indexOf("blob:") === 0, vaGet.mediaUrl);

r = await window.fetch("/api/storage" + pres.objectPath, { headers: { Authorization: "Bearer " + T } });
check("GET storage object serves blob", r.status === 200 && (r.headers.get("content-type") || "").indexOf("video/mp4") === 0);

r = await api("/api/storage/request-upload-url", { method: "POST", body: { name: "big.mp4", size: 999 * 1024 * 1024, contentType: "video/mp4" } }, T);
check("oversize upload rejected", r.status === 400);

// mapped URL keeps kind marker (fragment trick for the app's isVideoUrl detection)
check("mapped mediaUrl carries kind=video marker", vaGet.mediaUrl.indexOf("kind=video") !== -1, vaGet.mediaUrl);

// ===== reload survival (no IndexedDB, fresh module, same localStorage) =====
eval(readFileSync("/agent/workspace/webapp-build/mock-backend.js", "utf8").replace("__SEED_VIDEO_DATAURL__", "data:video/mp4;base64,AAAAGGZ0eXBtcDQy"));
r = await api("/api/assignments/" + va.id, {}, S);
let vaGet2 = await j(r);
check("after reload: video URL playable (blob:/data:) with kind marker", typeof vaGet2.mediaUrl === "string" && (vaGet2.mediaUrl.indexOf("blob:") === 0 || vaGet2.mediaUrl.indexOf("data:") === 0) && vaGet2.mediaUrl.indexOf("kind=video") !== -1, (vaGet2.mediaUrl || "").slice(0, 60));
r = await window.fetch("/api/storage" + pres.objectPath);
check("after reload: GET object decodes from dataUrl", r.status === 200);

// seed video assignment visible to student with playable media
r = await api("/api/assignments/my-tasks", {}, S);
let stTasks = await j(r);
const seedVideoTask = stTasks.find((t) => t.title === "Видео: посмотри и ответь");
check("seed video task assigned to student", !!seedVideoTask, stTasks.map((t) => t.title));
if (seedVideoTask) {
  r = await api("/api/assignments/" + seedVideoTask.assignmentId, {}, S);
  let seedVa = await j(r);
  check("seed video task media is playable URL with kind marker",
    typeof seedVa.mediaUrl === "string" && (seedVa.mediaUrl.indexOf("blob:") === 0 || seedVa.mediaUrl.indexOf("data:video/mp4") === 0) && seedVa.mediaUrl.indexOf("kind=video") !== -1,
    (seedVa.mediaUrl || "").slice(0, 40));
  r = await window.fetch("/api/storage/objects/seedvid1");
  check("seed video object served", r.status === 200 && (r.headers.get("content-type") || "").indexOf("video/mp4") === 0);
}

// persistence: db saved (v4)
check("db persisted to localStorage", !!mem["elmock_db_v4"] && mem["elmock_db_v4"].length > 5000);

console.log("\n===== " + pass + " passed, " + fail + " failed =====");
process.exit(fail ? 1 : 0);
