// ============================================================================
// In-browser mock backend for English Learning App demo.
// Intercepts window.fetch for /api/* and serves responses from a localStorage
// database, faithfully reproducing artifacts/api-server behavior
// (see /agent/workspace/api-contract.md).
// Reset: open with #reset in URL or call window.__resetDemo().
// ============================================================================
(function () {
  "use strict";

  var DB_KEY = "elmock_db_v4";
  var now = function () { return Date.now(); };
  var iso = function (t) { return new Date(t).toISOString(); };
  var ymd = function (t) {
    var d = new Date(t);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  var DAY = 86400000, HOUR = 3600000, MIN = 60000;

  // ---------------- points formula (lib/points.ts) ----------------
  var DIFF = { audio: 2.5, video: 1.8, free_form: 1.5, reading: 1.2, text_test: 1.0 };
  function perCorrect(type, hasOptions, timeLimited) {
    return 2 * (DIFF[type] || 1) * (hasOptions ? 1.0 : 1.5) * (timeLimited ? 1.3 : 1.0);
  }
  function hasChoiceOptions(q) { return Array.isArray(q.options) && q.options.length >= 2; }
  function computeMaxPoints(type, questions, timeLimitMinutes) {
    if (type === "free_form") return 0;
    var s = 0;
    for (var i = 0; i < questions.length; i++) s += perCorrect(type, hasChoiceOptions(questions[i]), (timeLimitMinutes || 0) > 0);
    return Math.round(s);
  }

  var XP = [0,100,250,450,700,1000,1400,1900,2500,3200,4100,5200,6500,8000,9800,11800,14000,16500,19500,23000,27000,31500,36500,42000,48000,55000,63000,72000,82000,93000,105000,118000,132000,147000,163000,180000,198000,217000,237000,258000,280000,303000,327000,352000,378000,405000,433000,462000,492000,523000];
  function computeLevel(xp) {
    var lvl = 1;
    for (var i = 0; i < XP.length; i++) if (xp >= XP[i]) lvl = i + 1;
    return Math.min(lvl, 50);
  }

  // ---------------- seed ----------------
  function seed() {
    var t = now();
    var id = { u: 0, a: 0, q: 0, ts: 0, at: 0, sub: 0, sa: 0, fr: 0, sl: 0, bk: 0, cr: 0, sess: 0 };
    function U(o) {
      return Object.assign({
        id: ++id.u, surname: null, role: "student", age: null, dateOfBirth: null,
        knowledgeLevel: null, parentId: null, totalPoints: 0, inviteCode: null, bio: null,
        avatarEmoji: "🦁", avatarColor: "#6366f1", avatarUrl: null, totalTimeMinutes: 0,
        xpLevel: 1, dailyGoalMinutes: 15, loginStreak: 0, lastLoginDate: null,
        email: null, emailVerified: "true", mascotName: "Оливер", lastSeenAt: null,
        createdAt: iso(t - 40 * DAY), updatedAt: iso(t - DAY), password: "demo",
      }, o);
    }
    var users = [
      U({ username: "teacher", password: "teacher123", name: "Мария", surname: "Иванова", role: "teacher", email: "teacher@example.com", inviteCode: "TEACH1", avatarEmoji: "👩‍🏫", avatarColor: "#7c3aed", bio: "Преподаю английский с любовью 💜" }),
      U({ username: "student", password: "student123", name: "Алекс", surname: "Петров", email: "student@example.com", inviteCode: "ALEX42", avatarEmoji: "🦊", avatarColor: "#6366f1", age: 10, knowledgeLevel: "beginner", totalPoints: 2850, totalTimeMinutes: 340, xpLevel: computeLevel(2850), loginStreak: 4, lastLoginDate: ymd(t - DAY), bio: "Люблю английский и котиков!", dailyGoalMinutes: 15 }),
      U({ username: "starqueen", name: "СтарКвин", inviteCode: "STAR01", avatarEmoji: "👑", avatarColor: "#7c3aed", age: 11, knowledgeLevel: "elementary", totalPoints: 4820, totalTimeMinutes: 610, xpLevel: computeLevel(4820) }),
      U({ username: "phoenixboy", name: "Феникс", inviteCode: "PHNX02", avatarEmoji: "🦅", avatarColor: "#6366f1", age: 12, knowledgeLevel: "elementary", totalPoints: 4315, totalTimeMinutes: 540, xpLevel: computeLevel(4315) }),
      U({ username: "lunagirl", name: "Луна", inviteCode: "LUNA03", avatarEmoji: "🌙", avatarColor: "#a855f7", age: 10, knowledgeLevel: "beginner", totalPoints: 3990, totalTimeMinutes: 480, xpLevel: computeLevel(3990), bio: "Читаю книги на английском 🌙" }),
      U({ username: "tigermike", name: "Тигр Майк", inviteCode: "TIGR04", avatarEmoji: "🐯", avatarColor: "#8b5cf6", age: 9, knowledgeLevel: "starter", totalPoints: 3740, totalTimeMinutes: 420, xpLevel: computeLevel(3740) }),
      U({ username: "rocketkid", name: "Ракета", inviteCode: "RCKT05", avatarEmoji: "🚀", avatarColor: "#6d28d9", age: 11, knowledgeLevel: "beginner", totalPoints: 3510, totalTimeMinutes: 380, xpLevel: computeLevel(3510) }),
      U({ username: "diamondsam", name: "Сэм", inviteCode: "DMND06", avatarEmoji: "💎", avatarColor: "#9333ea", age: 12, knowledgeLevel: "elementary", totalPoints: 2870, totalTimeMinutes: 300, xpLevel: computeLevel(2870) }),
    ];
    var TEACHER = 1, ALEX = 2, STAR = 3, PHNX = 4, LUNA = 5, TIGR = 6, RCKT = 7, DMND = 8;

    function A(o, qs) {
      var a = Object.assign({
        id: ++id.a, title: "", description: null, type: "text_test", source: "teacher_created",
        createdBy: TEACHER, ageMin: 5, ageMax: 18, points: 0, mediaUrl: null, content: null,
        isDraft: false, timeLimitMinutes: null, imageUrl: null, deletedAt: null,
        createdAt: iso(t - 6 * DAY), updatedAt: iso(t - 6 * DAY),
      }, o);
      var questions = (qs || []).map(function (q, i) {
        return { id: ++id.q, assignmentId: a.id, text: q.t, options: q.o || [], correctAnswer: q.c || "", orderIndex: i, createdAt: a.createdAt };
      });
      a.points = computeMaxPoints(a.type, questions, a.timeLimitMinutes);
      return { a: a, qs: questions };
    }
    var assignments = [], questions = [];
    function pushA(x) { assignments.push(x.a); questions = questions.concat(x.qs); return x.a; }

    var a1 = pushA(A({ title: "Животные — Animals", description: "Выбери правильный перевод слова.", type: "text_test", content: "Вспомни названия животных на английском и выбери правильные ответы." }, [
      { t: "Как по-английски «кошка»?", o: ["cat", "dog", "fox", "cow"], c: "cat" },
      { t: "Как по-английски «собака»?", o: ["mouse", "dog", "bird", "fish"], c: "dog" },
      { t: "Как по-английски «лиса»?", o: ["wolf", "bear", "fox", "hare"], c: "fox" },
      { t: "Как по-английски «медведь»?", o: ["bear", "deer", "goat", "lion"], c: "bear" },
      { t: "Как по-английски «птица»?", o: ["frog", "snake", "bird", "duck"], c: "bird" },
    ]));
    var a2 = pushA(A({ title: "Чтение: My Family", description: "Прочитай текст и ответь на вопросы (впиши ответ по-английски).", type: "reading", content: "My name is Tom. I have a big family. My mother is a doctor. My father is a driver. I have a little sister. Her name is Kate. She is five. We have a cat. The cat is black." }, [
      { t: "What is the mother's job? (одно слово)", o: [], c: "doctor" },
      { t: "What is the sister's name?", o: [], c: "Kate" },
      { t: "What colour is the cat?", o: [], c: "black" },
    ]));
    var a3 = pushA(A({ title: "Расскажи о себе — About me", description: "Напиши 4–5 предложений о себе на английском.", type: "free_form", content: "Напиши небольшой рассказ о себе: имя, возраст, что любишь делать, любимое животное." }, []));
    var a4 = pushA(A({ title: "Цвета и числа", description: "Выбери правильный ответ.", type: "text_test", createdAt: iso(t - 2 * DAY) }, [
      { t: "Как по-английски «красный»?", o: ["blue", "red", "green", "black"], c: "red" },
      { t: "Как по-английски «пять»?", o: ["four", "six", "five", "nine"], c: "five" },
      { t: "Как по-английски «жёлтый»?", o: ["yellow", "white", "brown", "pink"], c: "yellow" },
      { t: "Сколько будет two + three?", o: ["four", "five", "six", "seven"], c: "five" },
    ]));
    var a5 = pushA(A({ title: "Черновик: Неправильные глаголы", description: "Ещё в работе", type: "text_test", isDraft: true, createdAt: iso(t - HOUR * 5) }, [
      { t: "Past simple of «go»?", o: ["goed", "went", "gone", "goes"], c: "went" },
    ]));
    // Готовое видео-задание с встроенным видео (data URL встраивается на сборке)
    var a6 = pushA(A({ title: "Видео: посмотри и ответь", description: "Посмотри короткое видео и ответь на вопрос.", type: "video", createdAt: iso(t - 4 * HOUR), mediaUrl: "/api/storage/objects/seedvid1?kind=video" }, [
      { t: "Опиши одним словом, что ты увидел в видео.", o: [], c: "цвета" },
    ]));

    var teacherStudents = [
      { id: 1, teacherId: TEACHER, studentId: ALEX, status: "accepted", createdAt: iso(t - 30 * DAY) },
      { id: 2, teacherId: TEACHER, studentId: LUNA, status: "accepted", createdAt: iso(t - 25 * DAY) },
      { id: 3, teacherId: TEACHER, studentId: TIGR, status: "accepted", createdAt: iso(t - 20 * DAY) },
      { id: 4, teacherId: TEACHER, studentId: DMND, status: "pending", createdAt: iso(t - 2 * HOUR) },
    ];
    var friendships = [
      { id: 1, requesterId: ALEX, addresseeId: LUNA, status: "accepted", createdAt: iso(t - 12 * DAY) },
      { id: 2, requesterId: RCKT, addresseeId: ALEX, status: "accepted", createdAt: iso(t - 9 * DAY) },
      { id: 3, requesterId: PHNX, addresseeId: ALEX, status: "pending", createdAt: iso(t - 3 * HOUR) },
      { id: 4, requesterId: ALEX, addresseeId: STAR, status: "pending", createdAt: iso(t - DAY) },
    ];

    var assignedTasks = [
      { id: 1, assignmentId: a1.id, studentId: ALEX, teacherId: TEACHER, assignedAt: iso(t - 3 * DAY) },
      { id: 2, assignmentId: a3.id, studentId: ALEX, teacherId: TEACHER, assignedAt: iso(t - 1 * DAY) },
      { id: 3, assignmentId: a4.id, studentId: ALEX, teacherId: TEACHER, assignedAt: iso(t - 5 * HOUR) },
      { id: 4, assignmentId: a1.id, studentId: LUNA, teacherId: TEACHER, assignedAt: iso(t - 3 * DAY) },
      { id: 5, assignmentId: a2.id, studentId: ALEX, teacherId: TEACHER, assignedAt: iso(t - 2 * DAY) },
      { id: 6, assignmentId: a6.id, studentId: ALEX, teacherId: TEACHER, assignedAt: iso(t - 3 * HOUR) },
    ];

    var submissions = [], subAnswers = [];
    function SUB(o) { var s = Object.assign({ id: ++id.sub, recordingUrl: null, textAnswer: null, attachmentUrl: null, status: "graded", teacherFeedback: null }, o); submissions.push(s); return s; }
    function SA(subId, q, ans, ok) { subAnswers.push({ id: ++id.sa, submissionId: subId, questionId: q.id, studentAnswer: ans, isCorrect: ok, correctAnswer: q.correctAnswer, questionText: q.text }); }

    // Алекс: A1 — 4/5, graded (submitted after assignedAt)
    var qa1 = questions.filter(function (q) { return q.assignmentId === a1.id; });
    var s1 = SUB({ studentId: ALEX, assignmentId: a1.id, score: 80, correctCount: 4, totalQuestions: 5, pointsEarned: 8, submittedAt: iso(t - 2 * DAY), teacherFeedback: "Молодец! Повтори слово «медведь» 🐻" });
    SA(s1.id, qa1[0], "cat", true); SA(s1.id, qa1[1], "dog", true); SA(s1.id, qa1[2], "fox", true); SA(s1.id, qa1[3], "lion", false); SA(s1.id, qa1[4], "bird", true);
    // Алекс: A3 free_form — pending review
    SUB({ studentId: ALEX, assignmentId: a3.id, score: 0, correctCount: 0, totalQuestions: 0, pointsEarned: 0, status: "pending", textAnswer: "My name is Alex. I am ten years old. I like to play football and read books. My favourite animal is a fox. I want to visit London!", submittedAt: iso(t - 3 * HOUR) });
    // Луна: A1 — 5/5
    var s3 = SUB({ studentId: LUNA, assignmentId: a1.id, score: 100, correctCount: 5, totalQuestions: 5, pointsEarned: 10, submittedAt: iso(t - 2 * DAY - 3 * HOUR), teacherFeedback: "Идеально! ⭐" });
    qa1.forEach(function (q) { SA(s3.id, q, q.correctAnswer, true); });

    var d1 = ymd(t + DAY), d2 = ymd(t + 2 * DAY), d3 = ymd(t + 3 * DAY), dp = ymd(t - 2 * DAY);
    var slots = [
      { id: 1, teacherId: TEACHER, date: d1, startTime: "10:00", endTime: "11:00", createdAt: iso(t - 2 * DAY) },
      { id: 2, teacherId: TEACHER, date: d2, startTime: "15:00", endTime: "16:00", createdAt: iso(t - 2 * DAY) },
      { id: 3, teacherId: TEACHER, date: d3, startTime: "12:00", endTime: "13:00", createdAt: iso(t - DAY) },
      { id: 4, teacherId: TEACHER, date: dp, startTime: "10:00", endTime: "11:00", createdAt: iso(t - 5 * DAY) },
    ];
    var bookings = [
      { id: 1, slotId: 1, studentId: ALEX, status: "confirmed", note: "Хочу разобрать задание про животных", createdAt: iso(t - DAY) },
      { id: 2, slotId: 2, studentId: LUNA, status: "pending", note: "Можно мне это время?", createdAt: iso(t - 5 * HOUR) },
      { id: 3, slotId: 4, studentId: ALEX, status: "confirmed", note: null, createdAt: iso(t - 4 * DAY) },
    ];
    var customRequests = [
      { id: 1, studentId: ALEX, teacherId: TEACHER, date: ymd(t + 4 * DAY), startTime: "17:00", endTime: "18:00", note: "После школы удобнее", status: "pending", createdAt: iso(t - 2 * HOUR) },
    ];

    var timeSessions = [
      { id: 1, studentId: ALEX, startedAt: iso(t - DAY - 2 * HOUR), endedAt: iso(t - DAY - 95 * MIN), durationMinutes: 25 },
      { id: 2, studentId: ALEX, startedAt: iso(t - 3 * HOUR), endedAt: iso(t - 3 * HOUR + 15 * MIN), durationMinutes: 15 },
    ];

    return {
      v: 4, seq: { u: users.length, a: assignments.length, q: id.q, at: assignedTasks.length, sub: id.sub, sa: id.sa, fr: friendships.length, ts: teacherStudents.length, sl: slots.length, bk: bookings.length, cr: customRequests.length, sess: timeSessions.length },
      users: users, assignments: assignments, questions: questions, teacherStudents: teacherStudents,
      friendships: friendships, assignedTasks: assignedTasks, submissions: submissions, subAnswers: subAnswers,
      slots: slots, bookings: bookings, customRequests: customRequests, timeSessions: timeSessions,
      achievements: { 2: ["start", "firstStep", "firstPoints"] }, parentChildren: [],
      storage: { seedvid1: { contentType: "video/mp4", name: "intro.mp4", dataUrl: "__SEED_VIDEO_DATAURL__" } },
      botsOnline: [LUNA, RCKT, TEACHER],
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) { var d = JSON.parse(raw); if (d && d.v === 4) return d; }
    } catch (e) {}
    return null;
  }
  var db;
  if (location.hash === "#reset") { try { localStorage.removeItem(DB_KEY); } catch (e) {} }
  db = load() || seed();
  function trySet() {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }
  function save() {
    // Quota-safe persistence: if localStorage rejects the payload, shed the
    // largest inline blobs step by step (media dataUrls first, then oversized
    // avatar dataUrls) so the CORE demo state (progress, time, logins) always
    // survives. Without this, one big write failure silently disabled ALL
    // persistence (avatars "disappearing", today's time resetting).
    for (var attempt = 0; attempt < 24; attempt++) {
      try { trySet(); return; } catch (e) {
        var shed = false;
        try {
          var ids = Object.keys(db.storage || {}).filter(function (k) { return db.storage[k] && db.storage[k].dataUrl; });
          if (ids.length) {
            ids.sort(function (a, b) { return (db.storage[b].dataUrl || "").length - (db.storage[a].dataUrl || "").length; });
            delete db.storage[ids[0]].dataUrl;
            db.storage[ids[0]].memoryOnly = true;
            shed = true;
          } else {
            var us = (db.users || []).filter(function (u) { return u.avatarUrl && String(u.avatarUrl).indexOf("data:") === 0; });
            if (us.length) {
              us.sort(function (a, b) { return String(b.avatarUrl).length - String(a.avatarUrl).length; });
              us[0].avatarUrl = null;
              shed = true;
            }
          }
        } catch (e2) {}
        if (!shed) return; // nothing left to shed — give up silently
      }
    }
  }
  save();
  window.__resetDemo = function () { try { localStorage.removeItem(DB_KEY); } catch (e) {} location.reload(); };

  // ---------------- helpers ----------------
  function J(data, status) {
    return new Response(JSON.stringify(data), { status: status || 200, headers: { "content-type": "application/json" } });
  }
  function ERR(status, msg) { return J({ error: msg }, status); }
  function NC() { return new Response(null, { status: 204 }); }
  function userById(uid) { return db.users.find(function (u) { return u.id === uid; }); }
  function isTeacher(role) { return role === "teacher" || role === "admin"; }
  function tokenFor(u) { return "mock." + u.id + "." + u.role; }
  function authOf(headers) {
    var h = headers.get ? headers.get("authorization") : null;
    if (!h || h.indexOf("Bearer ") !== 0) return null;
    var tk = h.slice(7).split(".");
    if (tk[0] !== "mock") return null;
    var u = userById(Number(tk[1]));
    return u ? { userId: u.id, role: u.role, user: u } : null;
  }
  function lastSeen(u) {
    if (db.botsOnline.indexOf(u.id) !== -1) return iso(now() - 30000);
    return u.lastSeenAt;
  }
  function isOnline(u, thresholdMs) {
    var ls = lastSeen(u);
    return !!(ls && now() - new Date(ls).getTime() < thresholdMs);
  }
  function PUB(u) {
    return { id: u.id, username: u.username, name: u.name, surname: u.surname, role: u.role, age: u.age, dateOfBirth: u.dateOfBirth, knowledgeLevel: u.knowledgeLevel, email: u.email, emailVerified: u.emailVerified === "true", totalPoints: u.totalPoints, totalTimeMinutes: Math.round(u.totalTimeMinutes || 0), avatarEmoji: u.avatarEmoji, avatarColor: u.avatarColor, avatarUrl: u.avatarUrl, bio: u.bio, inviteCode: u.inviteCode, createdAt: u.createdAt };
  }
  function genCode() {
    var s = "";
    var abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    for (var i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }
  function openSession(uid) { return db.timeSessions.find(function (s) { return s.studentId === uid && !s.endedAt; }); }
  // Exact elapsed minutes (float) — seconds matter for the live "today" timer;
  // values are rounded only at the API-serialization edge.
  function elapsedMin(s) { return Math.max(0, (now() - new Date(s.startedAt).getTime()) / MIN); }
  // Precise milliseconds spent today by the logged-in student (closed sessions
  // + the currently open one). Used by the prelude to shift the app's
  // timer_session_start so the live "Сегодня" counter continues from the
  // day's accumulated total instead of resetting on every re-entry.
  window.__elmockTodayMs = function () {
    try {
      var raw = localStorage.getItem("auth_user");
      if (!raw) return 0;
      var uid = (JSON.parse(raw) || {}).id;
      if (!uid) return 0;
      var d0 = new Date(); d0.setHours(0, 0, 0, 0);
      var ms = 0;
      (db.timeSessions || []).forEach(function (s) {
        if (s.studentId !== uid) return;
        var st = new Date(s.startedAt).getTime();
        if (st < d0.getTime()) return;
        ms += s.endedAt ? (s.durationMinutes || 0) * MIN : Math.max(0, now() - st);
      });
      return Math.round(ms);
    } catch (e) { return 0; }
  };

  // ---------------- media storage (video/audio uploads) ----------------
  // Uploaded files are kept as Blobs in IndexedDB (survives reloads, large
  // quota) and exposed to the app as blob: object URLs. Falls back to
  // in-memory-only when IndexedDB is unavailable.
  var MEDIA = {};        // id -> object URL (usable directly in <video>/<audio> src)
  var MEDIA_BLOB = {};   // id -> Blob (for fetch-served GET /api/storage/objects/:id)
  if (!db.storage) db.storage = {}; // id -> { contentType, name } (metadata only)
  function idbOpen() {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open("elmock_media", 1);
        req.onupgradeneeded = function () { req.result.createObjectStore("files"); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }
  function idbPut(id, blob) {
    return idbOpen().then(function (d) {
      if (!d) return false;
      return new Promise(function (resolve) {
        try {
          var tx = d.transaction("files", "readwrite");
          tx.objectStore("files").put(blob, id);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }
  var mediaReady = idbOpen().then(function (d) {
    if (!d) return;
    return new Promise(function (resolve) {
      try {
        var tx = d.transaction("files", "readonly");
        var store = tx.objectStore("files");
        var kreq = store.getAllKeys();
        var vreq = store.getAll();
        tx.oncomplete = function () {
          try {
            var keys = kreq.result || [], vals = vreq.result || [];
            for (var i = 0; i < keys.length; i++) {
              MEDIA_BLOB[keys[i]] = vals[i];
              try { MEDIA[keys[i]] = URL.createObjectURL(vals[i]); } catch (e) {}
            }
          } catch (e2) {}
          resolve();
        };
        tx.onerror = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  }).catch(function () {});
  function mediaIdFromUrl(u) {
    if (typeof u !== "string") return null;
    var m = u.match(/\/api\/storage\/objects\/([^/?#]+)/);
    return m ? m[1] : null;
  }
  function dataUrlToBlob(du) {
    try {
      var parts = du.split(",");
      var mime = (parts[0].match(/^data:([^;]+)/) || [])[1] || "application/octet-stream";
      var bin = atob(parts[1]);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    } catch (e) { return null; }
  }
  function mediaUrlById(id) {
    if (!id) return null;
    if (MEDIA[id]) return MEDIA[id];
    if (!MEDIA_BLOB[id]) {
      // Hydrate from inline-persisted data URL (small files) if available.
      var meta = db.storage && db.storage[id];
      if (meta && meta.dataUrl) {
        var b = dataUrlToBlob(meta.dataUrl);
        if (b) { MEDIA_BLOB[id] = b; idbPut(id, b); }
      }
    }
    if (MEDIA_BLOB[id]) {
      // blob: URLs play reliably everywhere (iOS Safari rejects data: <video> sources)
      try { MEDIA[id] = URL.createObjectURL(MEDIA_BLOB[id]); return MEDIA[id]; } catch (e2) {}
    }
    var meta2 = db.storage && db.storage[id];
    if (meta2 && meta2.dataUrl) return meta2.dataUrl; // last-resort fallback
    return null;
  }
  window.__elmockMediaUrl = mediaUrlById; // used by the prelude's <video>/<audio> src fixer

  // Bridge for per-tab onboarding flags: they live INSIDE the demo DB so they
  // survive exactly as long as the rest of the demo state (login, assignments).
  // Each key = the app's own localStorage key "tab_first_visit_v2_<uid>_<tab>".
  if (!db.guides || typeof db.guides !== "object") db.guides = {};
  window.__elmockGuides = {
    has: function (k) { return !!(db.guides && db.guides[k]); },
    add: function (k) { if (!db.guides) db.guides = {}; if (!db.guides[k]) { db.guides[k] = 1; save(); } },
  };
  function mapMedia(u) {
    var id = mediaIdFromUrl(u);
    if (!id) return u;
    var mapped = mediaUrlById(id);
    if (!mapped) return u;
    // Preserve the original path+query as a fragment: the app detects media
    // kind via substrings like "kind=video" / "/api/storage/objects/".
    var tail = u.slice(u.indexOf("/api/storage"));
    return mapped + (mapped.indexOf("#") === -1 ? "#" + tail : "");
  }
  function withMedia(a) {
    if (!a) return a;
    var out = Object.assign({}, a);
    if (out.mediaUrl) out.mediaUrl = mapMedia(out.mediaUrl);
    if (out.imageUrl) out.imageUrl = mapMedia(out.imageUrl);
    return out;
  }

  async function bodyOf(input, init) {
    var b = init && init.body != null ? init.body : (input && typeof input !== "string" && input.body ? input : null);
    if (b == null) return {};
    if (typeof b === "string") { try { return JSON.parse(b); } catch (e) { return {}; } }
    if (typeof Blob !== "undefined" && b instanceof Blob) return b; // raw file upload (presigned PUT)
    if (typeof FormData !== "undefined" && b instanceof FormData) return b;
    if (input && typeof input.json === "function") { try { return await input.clone().json(); } catch (e2) { return {}; } }
    return {};
  }
  function fileToDataUrl(file) {
    return new Promise(function (resolve) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { resolve(null); };
      r.readAsDataURL(file);
    });
  }
  async function compressImageBlob(blob) {
    try {
      if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
      var bmp = await createImageBitmap(blob);
      var MAX = 512;
      var scale = Math.min(1, MAX / Math.max(bmp.width || 1, bmp.height || 1));
      var w = Math.max(1, Math.round((bmp.width || 1) * scale));
      var h = Math.max(1, Math.round((bmp.height || 1) * scale));
      var cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      var ctx = cv.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bmp, 0, 0, w, h);
      var out = cv.toDataURL("image/jpeg", 0.82);
      return out && out.indexOf("data:image") === 0 ? out : null;
    } catch (e) { return null; }
  }

  // ---------------- route handling ----------------
  async function handle(method, path, query, auth, body) {
    var m, u, i, arr;
    try { await mediaReady; } catch (e) {}

    // ===== AUTH =====
    if (method === "POST" && path === "/api/auth/login") {
      if (!body.username || !body.password) return ERR(400, "Missing username or password");
      u = db.users.find(function (x) { return x.username === body.username; });
      if (!u || u.password !== body.password) return ERR(401, "Invalid credentials");
      if (!u.inviteCode) { u.inviteCode = genCode(); save(); }
      return J({ token: tokenFor(u), user: PUB(u) });
    }
    if (method === "POST" && path === "/api/auth/register") {
      if (!body.username || !body.password || !body.name || !body.role) return ERR(400, "Missing required fields");
      var email = String(body.email || "").toLowerCase().trim();
      if (!email) return ERR(400, "Введите email");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ERR(400, "Некорректный формат email");
      if (["student", "parent", "teacher"].indexOf(body.role) === -1) return ERR(400, "Invalid role. Must be student, parent, or teacher.");
      if (body.role === "teacher" && body.teacherCode !== "422668") return ERR(403, "Неверный код учителя");
      if (db.users.some(function (x) { return x.email === email && x.emailVerified === "true"; })) return ERR(400, "Этот email уже используется");
      if (db.users.some(function (x) { return x.username === body.username; })) return ERR(400, "Этот псевдоним уже занят");
      u = {
        id: ++db.seq.u, username: body.username, password: body.password, name: body.name,
        surname: body.surname || null, role: body.role, age: body.age ? Number(body.age) : null,
        dateOfBirth: body.dateOfBirth ? String(body.dateOfBirth) : null, knowledgeLevel: null,
        parentId: body.role === "student" && body.parentId ? body.parentId : null,
        totalPoints: 0, inviteCode: genCode(), bio: null, avatarEmoji: "🦁", avatarColor: "#6366f1",
        avatarUrl: null, totalTimeMinutes: 0, xpLevel: 1, dailyGoalMinutes: 15, loginStreak: 0,
        lastLoginDate: null, email: email, emailVerified: "true" /* demo: auto-verified (prod server auto-verifies on boot) */,
        mascotName: "Оливер", lastSeenAt: null, createdAt: iso(now()), updatedAt: iso(now()),
      };
      db.users.push(u); save();
      return J({ token: tokenFor(u), user: PUB(u) }, 201);
    }
    // Presigned upload endpoints are auth-free by design (like real GCS signed URLs)
    if ((m = path.match(/^\/api\/storage\/put\/([^/?#]+)$/)) && method === "PUT") {
      var putId = m[1];
      if (!(body instanceof Blob)) return ERR(400, "No file body");
      var meta = db.storage[putId] || (db.storage[putId] = {});
      var typedBlob = meta.contentType && body.type !== meta.contentType ? body.slice(0, body.size, meta.contentType) : body;
      MEDIA_BLOB[putId] = typedBlob;
      try { MEDIA[putId] = URL.createObjectURL(typedBlob); } catch (e) {}
      idbPut(putId, typedBlob); // best-effort persistence (IndexedDB)
      // Small files also persist inline (survives reloads even without IndexedDB)
      if (typedBlob.size <= 2.5 * 1024 * 1024) {
        try {
          var fr = new FileReader();
          var dataUrlP = new Promise(function (resolve) {
            fr.onload = function () { resolve(String(fr.result)); };
            fr.onerror = function () { resolve(null); };
          });
          fr.readAsDataURL(typedBlob);
          var du = await dataUrlP;
          if (du) { meta.dataUrl = du; }
        } catch (e3) {}
      }
      save();
      return new Response(null, { status: 200 });
    }
    if ((m = path.match(/^\/api\/storage\/objects\/([^/?#]+)$/)) && method === "GET") {
      var getBlob = MEDIA_BLOB[m[1]];
      if (getBlob) return new Response(getBlob, { status: 200, headers: { "content-type": getBlob.type || "application/octet-stream" } });
      var gm = db.storage && db.storage[m[1]];
      if (gm && gm.dataUrl) {
        try {
          var parts = gm.dataUrl.split(",");
          var mime = (parts[0].match(/^data:([^;]+)/) || [])[1] || "application/octet-stream";
          var bin = atob(parts[1]);
          var bytes = new Uint8Array(bin.length);
          for (var bi = 0; bi < bin.length; bi++) bytes[bi] = bin.charCodeAt(bi);
          return new Response(new Blob([bytes], { type: mime }), { status: 200, headers: { "content-type": mime } });
        } catch (e4) {}
      }
      return ERR(404, "Object not found");
    }

    if (!auth) return ERR(401, "Unauthorized");
    var me = auth.user;

    if (method === "GET" && path === "/api/auth/me") return J(PUB(me));
    if (method === "POST" && path === "/api/auth/verify-code") return J({ ok: true, alreadyVerified: true });
    if (method === "POST" && path === "/api/auth/resend-code") return J({ ok: true });
    if (method === "POST" && path === "/api/auth/forgot-password") return J({ ok: true });
    if (method === "POST" && path === "/api/auth/reset-password") return J({ ok: true });

    // ===== USERS =====
    if (method === "POST" && path === "/api/users/ping") { me.lastSeenAt = iso(now()); save(); return J({ ok: true }); }
    if (method === "POST" && path === "/api/users/offline") { me.lastSeenAt = null; save(); return J({ ok: true }); }

    if ((m = path.match(/^\/api\/users\/(\d+)\/profile$/)) && method === "PATCH") {
      var target = userById(Number(m[1]));
      if (!target) return ERR(404, "User not found");
      if (target.id !== me.id && !isTeacher(me.role)) return ERR(403, "Forbidden");
      if (body.avatarUrl && String(body.avatarUrl).length > 500000) return ERR(413, "Изображение слишком большое");
      if (body.username !== undefined) {
        var un = String(body.username).trim();
        if (!un) return ERR(400, "Никнейм не может быть пустым");
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(un)) return ERR(400, "Никнейм: 3-20 символов, только латиница, цифры и _");
        if (db.users.some(function (x) { return x.username === un && x.id !== target.id; })) return ERR(409, "Этот никнейм уже занят");
        target.username = un;
      }
      ["bio", "avatarEmoji", "avatarColor", "avatarUrl"].forEach(function (k) { if (body[k] !== undefined) target[k] = body[k]; });
      if (body.name !== undefined && String(body.name).trim()) target.name = String(body.name).trim();
      target.updatedAt = iso(now()); save();
      return J({ id: target.id, username: target.username, name: target.name, bio: target.bio, avatarEmoji: target.avatarEmoji, avatarColor: target.avatarColor, avatarUrl: target.avatarUrl, role: target.role });
    }

    if ((m = path.match(/^\/api\/users\/(\d+)$/)) && method === "GET") {
      u = userById(Number(m[1]));
      if (!u) return ERR(404, "User not found");
      var subs = db.submissions.filter(function (s) { return s.studentId === u.id; });
      var totalMin = u.totalTimeMinutes, comp = 0, avg = null;
      if (u.role === "student") {
        var os = openSession(u.id);
        if (os) totalMin += elapsedMin(os);
        comp = subs.length;
        if (subs.length) avg = Math.round(subs.reduce(function (s, x) { return s + x.score; }, 0) / subs.length);
      }
      return J({ id: u.id, username: u.username, name: u.name, surname: u.surname, role: u.role, age: u.age, dateOfBirth: u.dateOfBirth, knowledgeLevel: u.knowledgeLevel, avatarEmoji: u.avatarEmoji, avatarColor: u.avatarColor, avatarUrl: u.avatarUrl, bio: u.bio, totalPoints: u.totalPoints, totalTimeMinutes: Math.round(totalMin), completedAssignments: comp, averageScore: avg, createdAt: u.createdAt, lastSeenAt: lastSeen(u), isOnline: isOnline(u, 90000) });
    }
    if ((m = path.match(/^\/api\/users\/(\d+)$/)) && method === "DELETE") {
      if (!isTeacher(me.role)) return ERR(403, "Только учитель может удалять пользователей");
      var did = Number(m[1]);
      if (did === me.id) return ERR(400, "Нельзя удалить свой собственный аккаунт");
      var du = userById(did);
      if (!du) return ERR(404, "Пользователь не найден");
      if (isTeacher(du.role)) return ERR(403, "Нельзя удалить другого учителя");
      db.users = db.users.filter(function (x) { return x.id !== did; });
      db.submissions = db.submissions.filter(function (x) { return x.studentId !== did; });
      db.timeSessions = db.timeSessions.filter(function (x) { return x.studentId !== did; });
      db.teacherStudents = db.teacherStudents.filter(function (x) { return x.studentId !== did; });
      db.friendships = db.friendships.filter(function (x) { return x.requesterId !== did && x.addresseeId !== did; });
      db.assignedTasks = db.assignedTasks.filter(function (x) { return x.studentId !== did; });
      db.bookings = db.bookings.filter(function (x) { return x.studentId !== did; });
      db.customRequests = db.customRequests.filter(function (x) { return x.studentId !== did; });
      save();
      return J({ ok: true, deletedId: did });
    }

    if ((m = path.match(/^\/api\/students\/(\d+)\/submissions$/)) && method === "GET") {
      var sid = Number(m[1]);
      if (!isTeacher(me.role) && me.id !== sid) return ERR(403, "Forbidden");
      arr = db.submissions.filter(function (s) { return s.studentId === sid && s.status === "graded"; })
        .sort(function (a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); })
        .map(function (s) {
          var a = db.assignments.find(function (x) { return x.id === s.assignmentId; }) || {};
          return { submissionId: s.id, score: s.score, correctCount: s.correctCount, totalQuestions: s.totalQuestions, pointsEarned: s.pointsEarned, submittedAt: s.submittedAt, assignmentId: s.assignmentId, title: a.title, type: a.type, points: a.points };
        });
      return J(arr);
    }
    if ((m = path.match(/^\/api\/students\/(\d+)\/category-stats$/)) && method === "GET") {
      var sid2 = Number(m[1]);
      arr = ["text_test", "audio", "reading", "video"].map(function (tp) {
        var ss = db.submissions.filter(function (s) {
          if (s.studentId !== sid2 || s.status !== "graded") return false;
          var a = db.assignments.find(function (x) { return x.id === s.assignmentId; });
          return a && a.type === tp;
        });
        return { type: tp, avgScore: ss.length ? Math.round(ss.reduce(function (s, x) { return s + x.score; }, 0) / ss.length) : null, count: ss.length };
      });
      return J(arr);
    }
    if ((m = path.match(/^\/api\/students\/(\d+)\/time$/)) && method === "GET") {
      var sid3 = Number(m[1]);
      var su = userById(sid3);
      var total = su ? su.totalTimeMinutes : 0;
      var os2 = openSession(sid3);
      if (os2) total += elapsedMin(os2);
      var d0 = new Date(); d0.setHours(0, 0, 0, 0);
      var w0 = new Date(d0.getTime() - d0.getDay() * DAY);
      var today = 0, week = 0;
      db.timeSessions.forEach(function (s) {
        if (s.studentId !== sid3) return;
        var st = new Date(s.startedAt).getTime();
        var mins = s.endedAt ? (s.durationMinutes || 0) : elapsedMin(s);
        if (st >= d0.getTime()) today += mins;
        if (st >= w0.getTime()) week += mins;
      });
      return J({ totalMinutes: Math.round(total), todayMinutes: Math.round(today * 100) / 100, weekMinutes: Math.round(week), sessions: db.timeSessions.filter(function (s) { return s.studentId === sid3; }) });
    }
    if ((m = path.match(/^\/api\/students\/(\d+)\/errors$/)) && method === "GET") {
      var sid4 = Number(m[1]);
      arr = [];
      db.subAnswers.forEach(function (sa) {
        if (sa.isCorrect) return;
        var sub = db.submissions.find(function (s) { return s.id === sa.submissionId; });
        if (!sub || sub.studentId !== sid4) return;
        var a = db.assignments.find(function (x) { return x.id === sub.assignmentId; }) || {};
        arr.push({ assignmentId: sub.assignmentId, assignmentTitle: a.title, questionText: sa.questionText, studentAnswer: sa.studentAnswer, correctAnswer: sa.correctAnswer, occurredAt: sub.submittedAt });
      });
      return J(arr);
    }

    // ===== TIME TRACKING =====
    if (method === "POST" && path === "/api/time-tracking/start") {
      var acc = 0;
      db.timeSessions.forEach(function (s) {
        if (s.studentId === me.id && !s.endedAt) {
          var mins = Math.min((now() - new Date(s.startedAt).getTime()) / MIN, 240);
          if (mins < 0) mins = 0;
          s.endedAt = iso(now()); s.durationMinutes = mins; acc += mins;
        }
      });
      if (acc > 0) me.totalTimeMinutes += acc;
      var ns = { id: ++db.seq.sess, studentId: me.id, startedAt: iso(now()), endedAt: null, durationMinutes: null };
      db.timeSessions.push(ns); save();
      return J(ns);
    }
    if (method === "POST" && path === "/api/time-tracking/end") {
      var os3 = openSession(me.id);
      if (!os3) return J({ message: "No open session" });
      var dm = Math.max(0, (now() - new Date(os3.startedAt).getTime()) / MIN);
      os3.endedAt = iso(now()); os3.durationMinutes = dm;
      if (dm > 0) me.totalTimeMinutes += dm;
      save();
      return J({ ok: true, durationMinutes: Math.round(dm) });
    }

    // ===== GAMIFICATION =====
    if (method === "GET" && path === "/api/gamification/stats") {
      var d0g = new Date(); d0g.setHours(0, 0, 0, 0);
      var todayMin = 0, totalMin2 = me.totalTimeMinutes, early = 0;
      db.timeSessions.forEach(function (s) {
        if (s.studentId !== me.id) return;
        var st = new Date(s.startedAt);
        var mins = s.endedAt ? (s.durationMinutes || 0) : elapsedMin(s);
        if (!s.endedAt) totalMin2 += mins;
        if (st.getTime() >= d0g.getTime()) todayMin += mins;
        if (st.getHours() < 9) early++;
      });
      var mySubs = db.submissions.filter(function (s) { return s.studentId === me.id && s.status === "graded"; });
      var todayComp = mySubs.filter(function (s) { return new Date(s.submittedAt).getTime() >= d0g.getTime(); }).length;
      return J({
        totalPoints: me.totalPoints, xpLevel: computeLevel(me.totalPoints), dailyGoalMinutes: me.dailyGoalMinutes,
        loginStreak: me.loginStreak, lastLoginDate: me.lastLoginDate, todayMinutes: Math.floor(todayMin),
        todayCompletions: todayComp, todayVoiceSessions: 0, voiceChatSessions: 0,
        perfectScoreCount: mySubs.filter(function (s) { return s.score === 100; }).length,
        completedAssignments: mySubs.length, earlyBirdSessions: early,
        unlockedAchievementIds: db.achievements[me.id] || [], totalTimeMinutes: Math.round(totalMin2),
        mascotName: (!me.mascotName || me.mascotName === "Оливер") ? "Снежа" : me.mascotName,
      });
    }
    if (method === "POST" && path === "/api/gamification/daily-login") {
      var today2 = ymd(now());
      if (me.lastLoginDate === today2) return J({ alreadyClaimed: true, loginStreak: me.loginStreak, totalPoints: me.totalPoints, xpLevel: computeLevel(me.totalPoints), pointsAwarded: 0 });
      var yesterday = ymd(now() - DAY);
      var streak = me.lastLoginDate === yesterday ? me.loginStreak + 1 : 1;
      var BONUS = [0, 0, 5, 10, 15, 20, 25, 50];
      var bonus = BONUS[Math.min(streak, BONUS.length - 1)];
      var award = 30 + bonus;
      var oldLvl = me.xpLevel;
      me.totalPoints += award; me.loginStreak = streak; me.lastLoginDate = today2;
      me.xpLevel = computeLevel(me.totalPoints); save();
      return J({ alreadyClaimed: false, loginStreak: streak, totalPoints: me.totalPoints, xpLevel: me.xpLevel, pointsAwarded: award, bonusPoints: bonus, leveledUp: me.xpLevel > oldLvl });
    }
    if (method === "PATCH" && path === "/api/gamification/daily-goal") {
      if ([10, 15, 20, 30].indexOf(body.minutes) === -1) return ERR(400, "Invalid goal. Must be 10, 15, 20, or 30 minutes.");
      me.dailyGoalMinutes = body.minutes; save();
      return J({ dailyGoalMinutes: me.dailyGoalMinutes });
    }
    if (method === "POST" && path === "/api/gamification/achievements/unlock") {
      if (!Array.isArray(body.achievementIds) || !body.achievementIds.length) return ERR(400, "achievementIds required");
      var have = db.achievements[me.id] || (db.achievements[me.id] = []);
      var newly = [], already = [];
      body.achievementIds.forEach(function (aid) { (have.indexOf(aid) === -1 ? (have.push(aid), newly) : already).push(aid); });
      save();
      return J({ unlocked: newly, alreadyHad: already });
    }
    if (method === "PATCH" && path === "/api/gamification/mascot-name") {
      if (!body.name || typeof body.name !== "string" || body.name.length > 20) return ERR(400, "Invalid name");
      me.mascotName = body.name.trim(); save();
      return J({ mascotName: me.mascotName });
    }
    if (method === "POST" && path === "/api/gamification/sync-xp-level") {
      me.xpLevel = computeLevel(me.totalPoints); save();
      return J({ xpLevel: me.xpLevel, totalPoints: me.totalPoints });
    }

    // ===== LEADERBOARD =====
    if (method === "GET" && path === "/api/leaderboard") {
      arr = db.users.filter(function (x) { return x.role === "student"; })
        .sort(function (a, b) { return b.totalPoints - a.totalPoints; })
        .map(function (x, idx) {
          return { userId: x.id, name: x.name, surname: x.surname, username: x.username, totalPoints: x.totalPoints, avatarEmoji: x.avatarEmoji, avatarColor: x.avatarColor, avatarUrl: x.avatarUrl, completedAssignments: db.submissions.filter(function (s) { return s.studentId === x.id; }).length, rank: idx + 1 };
        });
      return J(arr);
    }
    if (method === "GET" && path === "/api/leaderboard/categories") {
      var pool = db.users.filter(function (x) { return x.role === "student"; });
      if (query.scope === "friends") {
        var fids = [me.id];
        db.friendships.forEach(function (f) {
          if (f.status !== "accepted") return;
          if (f.requesterId === me.id) fids.push(f.addresseeId);
          if (f.addresseeId === me.id) fids.push(f.requesterId);
        });
        pool = pool.filter(function (x) { return fids.indexOf(x.id) !== -1; });
      }
      function entry(x, val) { return { userId: x.id, name: x.name, surname: x.surname, username: x.username, avatarEmoji: x.avatarEmoji, avatarColor: x.avatarColor, avatarUrl: x.avatarUrl, value: val, rank: 0 }; }
      function ranked(vals) {
        vals.sort(function (a, b) { return b.value - a.value; });
        vals.forEach(function (e, idx) { e.rank = idx + 1; });
        return vals;
      }
      var pts = ranked(pool.map(function (x) { return entry(x, x.totalPoints); }));
      var tm = ranked(pool.map(function (x) { return entry(x, Math.round(x.totalTimeMinutes || 0)); }));
      var asg = ranked(pool.map(function (x) {
        var g = db.submissions.filter(function (s) { return s.studentId === x.id && s.status === "graded"; });
        return entry(x, g.length ? Math.round(g.reduce(function (s, y) { return s + y.score; }, 0) / g.length) : 0);
      }));
      return J({ points: pts, time: tm, assignments: asg });
    }

    // ===== CONNECTIONS =====
    function miniUser(x, extra) {
      var base = { id: x.id, name: x.name, username: x.username, avatarEmoji: x.avatarEmoji, avatarColor: x.avatarColor, avatarUrl: x.avatarUrl };
      return Object.assign(base, extra || {});
    }
    if ((m = path.match(/^\/api\/connections\/by-code\/([^/]+)$/)) && method === "GET") {
      var code = decodeURIComponent(m[1]).toUpperCase();
      u = db.users.find(function (x) { return x.inviteCode === code; });
      if (!u) return ERR(404, "Пользователь с таким кодом не найден");
      if (u.id === me.id) return ERR(400, "Нельзя добавить самого себя");
      return J({ id: u.id, name: u.name, username: u.username, role: u.role, knowledgeLevel: u.knowledgeLevel, avatarEmoji: u.avatarEmoji, avatarColor: u.avatarColor, avatarUrl: u.avatarUrl, inviteCode: u.inviteCode });
    }
    if ((m = path.match(/^\/api\/connections\/by-username\/([^/]+)$/)) && method === "GET") {
      var un2 = decodeURIComponent(m[1]).toLowerCase().trim();
      u = db.users.find(function (x) { return x.username.toLowerCase() === un2; });
      if (!u) return ERR(404, "Пользователь с таким псевдонимом не найден");
      if (u.id === me.id) return ERR(400, "Нельзя добавить самого себя");
      return J({ id: u.id, name: u.name, username: u.username, role: u.role, knowledgeLevel: u.knowledgeLevel, avatarEmoji: u.avatarEmoji, avatarColor: u.avatarColor, avatarUrl: u.avatarUrl, inviteCode: u.inviteCode });
    }
    if (method === "POST" && path === "/api/connections/teacher/add-student") {
      if (!isTeacher(me.role)) return ERR(403, "Только учитель может добавлять учеников");
      if (!body.code) return ERR(400, "Код обязателен");
      u = db.users.find(function (x) { return x.inviteCode === String(body.code).toUpperCase(); });
      if (!u) return ERR(404, "Ученик с таким кодом не найден");
      if (u.role !== "student") return ERR(400, "Этот пользователь не является учеником");
      var ex = db.teacherStudents.find(function (x) { return x.teacherId === me.id && x.studentId === u.id; });
      if (ex && ex.status === "pending") return ERR(400, "Запрос уже отправлен, ожидается подтверждение ученика");
      if (ex) return ERR(400, "Этот ученик уже прикреплён к вам");
      db.teacherStudents.push({ id: ++db.seq.ts, teacherId: me.id, studentId: u.id, status: "pending", createdAt: iso(now()) }); save();
      return J(miniUser(u, { knowledgeLevel: u.knowledgeLevel, status: "pending" }), 201);
    }
    if (method === "GET" && path === "/api/connections/teacher/students") {
      if (!isTeacher(me.role)) return ERR(403, "Forbidden");
      arr = db.teacherStudents.filter(function (x) { return x.teacherId === me.id && x.status === "accepted"; })
        .map(function (l) { return userById(l.studentId); }).filter(Boolean)
        .map(function (x) { return { id: x.id, name: x.name, surname: x.surname, username: x.username, role: x.role, knowledgeLevel: x.knowledgeLevel, avatarEmoji: x.avatarEmoji, avatarColor: x.avatarColor, avatarUrl: x.avatarUrl, totalPoints: x.totalPoints, inviteCode: x.inviteCode, lastSeenAt: lastSeen(x), isOnline: isOnline(x, 180000) }; });
      return J(arr);
    }
    if (method === "GET" && path === "/api/connections/teacher/pending") {
      if (!isTeacher(me.role)) return ERR(403, "Forbidden");
      arr = db.teacherStudents.filter(function (x) { return x.teacherId === me.id && x.status === "pending"; })
        .map(function (l) {
          var s = userById(l.studentId);
          return { requestId: l.id, student: s ? { id: s.id, name: s.name, surname: s.surname, username: s.username, avatarEmoji: s.avatarEmoji, avatarColor: s.avatarColor, avatarUrl: s.avatarUrl, knowledgeLevel: s.knowledgeLevel } : undefined, status: "pending" };
        });
      return J(arr);
    }
    if ((m = path.match(/^\/api\/connections\/teacher\/students\/(\d+)$/)) && method === "DELETE") {
      if (!isTeacher(me.role)) return ERR(403, "Forbidden");
      var rsid = Number(m[1]);
      db.teacherStudents = db.teacherStudents.filter(function (x) { return !(x.teacherId === me.id && x.studentId === rsid); });
      db.assignedTasks = db.assignedTasks.filter(function (x) { return !(x.teacherId === me.id && x.studentId === rsid); });
      save();
      return J({ ok: true });
    }
    if (method === "GET" && path === "/api/connections/student/teachers") {
      arr = db.teacherStudents.filter(function (x) { return x.studentId === me.id && x.status === "accepted"; })
        .map(function (l) { return userById(l.teacherId); }).filter(Boolean)
        .map(function (x) { return { id: x.id, name: x.name, username: x.username, avatarEmoji: x.avatarEmoji, avatarColor: x.avatarColor, avatarUrl: x.avatarUrl, role: x.role, totalPoints: x.totalPoints, lastSeenAt: lastSeen(x), isOnline: isOnline(x, 180000) }; });
      return J(arr);
    }
    if (method === "GET" && path === "/api/connections/student/teacher-requests") {
      arr = db.teacherStudents.filter(function (x) { return x.studentId === me.id && x.status === "pending"; })
        .map(function (l) {
          var tch = userById(l.teacherId);
          return { requestId: l.id, teacher: tch ? { id: tch.id, name: tch.name, username: tch.username, avatarEmoji: tch.avatarEmoji, avatarColor: tch.avatarColor, avatarUrl: tch.avatarUrl, role: tch.role } : undefined };
        });
      return J(arr);
    }
    if ((m = path.match(/^\/api\/connections\/student\/teacher-requests\/(\d+)\/accept$/))) {
      var lr = db.teacherStudents.find(function (x) { return x.id === Number(m[1]); });
      if (!lr) return ERR(404, "Запрос не найден");
      if (lr.studentId !== me.id) return ERR(403, "Нельзя принять чужой запрос");
      lr.status = "accepted"; save();
      return J({ ok: true });
    }
    if ((m = path.match(/^\/api\/connections\/student\/teacher-requests\/(\d+)$/)) && method === "DELETE") {
      var lr2 = db.teacherStudents.find(function (x) { return x.id === Number(m[1]); });
      if (!lr2) return ERR(404, "Запрос не найден");
      if (lr2.studentId !== me.id) return ERR(403, "Нельзя отклонить чужой запрос");
      db.teacherStudents = db.teacherStudents.filter(function (x) { return x.id !== lr2.id; }); save();
      return J({ ok: true });
    }
    if (method === "POST" && path === "/api/connections/parent/add-child") {
      if (me.role !== "parent") return ERR(403, "Только родитель может добавлять детей");
      if (!body.code) return ERR(400, "Код обязателен");
      u = db.users.find(function (x) { return x.inviteCode === String(body.code).toUpperCase(); });
      if (!u) return ERR(404, "Ученик с таким кодом не найден");
      if (u.role !== "student") return ERR(400, "Этот пользователь не является учеником");
      if (db.parentChildren.some(function (x) { return x.parentId === me.id && x.studentId === u.id; })) return ERR(400, "Этот ребёнок уже добавлен");
      db.parentChildren.push({ parentId: me.id, studentId: u.id }); save();
      return J(miniUser(u, { knowledgeLevel: u.knowledgeLevel, totalPoints: u.totalPoints }), 201);
    }
    if (method === "GET" && path === "/api/connections/parent/children") {
      arr = db.parentChildren.filter(function (x) { return x.parentId === me.id; })
        .map(function (l) { return userById(l.studentId); }).filter(Boolean)
        .map(function (x) { return { id: x.id, name: x.name, username: x.username, role: x.role, knowledgeLevel: x.knowledgeLevel, avatarEmoji: x.avatarEmoji, avatarColor: x.avatarColor, avatarUrl: x.avatarUrl, totalPoints: x.totalPoints, inviteCode: x.inviteCode }; });
      return J(arr);
    }
    if ((m = path.match(/^\/api\/connections\/parent\/children\/(\d+)$/)) && method === "DELETE") {
      db.parentChildren = db.parentChildren.filter(function (x) { return !(x.parentId === me.id && x.studentId === Number(m[1])); }); save();
      return J({ ok: true });
    }
    if (method === "POST" && path === "/api/connections/friends/request") {
      if (me.role !== "student") return ERR(403, "Только ученики могут добавлять друзей");
      if (!body.code) return ERR(400, "Код обязателен");
      u = db.users.find(function (x) { return x.inviteCode === String(body.code).toUpperCase(); });
      if (!u) return ERR(404, "Ученик с таким кодом не найден");
      if (u.role !== "student") return ERR(400, "Этот пользователь не является учеником");
      if (u.id === me.id) return ERR(400, "Нельзя добавить самого себя");
      var exf = db.friendships.find(function (f) { return (f.requesterId === me.id && f.addresseeId === u.id) || (f.requesterId === u.id && f.addresseeId === me.id); });
      if (exf && exf.status === "accepted") return ERR(400, "Вы уже друзья");
      if (exf) return ERR(400, "Запрос уже отправлен");
      db.friendships.push({ id: ++db.seq.fr, requesterId: me.id, addresseeId: u.id, status: "pending", createdAt: iso(now()) }); save();
      return J(miniUser(u, { status: "pending" }), 201);
    }
    if (method === "POST" && path === "/api/connections/friends/request-by-id") {
      if (me.role !== "student") return ERR(403, "Только ученики могут добавлять друзей");
      if (!body.userId) return ERR(400, "userId обязателен");
      u = userById(Number(body.userId));
      if (!u) return ERR(404, "Пользователь не найден");
      if (u.role !== "student") return ERR(400, "Этот пользователь не является учеником");
      if (u.id === me.id) return ERR(400, "Нельзя добавить самого себя");
      var exf2 = db.friendships.find(function (f) { return (f.requesterId === me.id && f.addresseeId === u.id) || (f.requesterId === u.id && f.addresseeId === me.id); });
      if (exf2 && exf2.status === "accepted") return ERR(400, "Вы уже друзья");
      if (exf2) return ERR(400, "Запрос уже отправлен");
      db.friendships.push({ id: ++db.seq.fr, requesterId: me.id, addresseeId: u.id, status: "pending", createdAt: iso(now()) }); save();
      return J({ status: "pending_sent" }, 201);
    }
    if (method === "GET" && path === "/api/connections/friends") {
      arr = db.friendships.filter(function (f) { return f.requesterId === me.id || f.addresseeId === me.id; })
        .map(function (f) {
          var other = userById(f.requesterId === me.id ? f.addresseeId : f.requesterId);
          if (!other) return null;
          return { friendshipId: f.id, user: { id: other.id, name: other.name, username: other.username, avatarEmoji: other.avatarEmoji, avatarColor: other.avatarColor, avatarUrl: other.avatarUrl, totalPoints: other.totalPoints, knowledgeLevel: other.knowledgeLevel, lastSeenAt: lastSeen(other), isOnline: isOnline(other, 90000) }, status: f.status, direction: f.requesterId === me.id ? "sent" : "received" };
        }).filter(Boolean);
      return J(arr);
    }
    if ((m = path.match(/^\/api\/connections\/friends\/(\d+)\/accept$/)) && method === "PATCH") {
      var fr = db.friendships.find(function (f) { return f.id === Number(m[1]); });
      if (!fr) return ERR(404, "Запрос не найден");
      if (fr.addresseeId !== me.id) return ERR(403, "Нельзя принять чужой запрос");
      fr.status = "accepted"; save();
      return J({ ok: true });
    }
    if ((m = path.match(/^\/api\/connections\/friends\/status\/(\d+)$/)) && method === "GET") {
      var oid = Number(m[1]);
      var fr2 = db.friendships.find(function (f) { return (f.requesterId === me.id && f.addresseeId === oid) || (f.requesterId === oid && f.addresseeId === me.id); });
      if (!fr2) return J({ status: "none" });
      if (fr2.status === "accepted") return J({ status: "friends", friendshipId: fr2.id });
      return J({ status: fr2.requesterId === me.id ? "pending_sent" : "pending_received", friendshipId: fr2.id });
    }
    if ((m = path.match(/^\/api\/connections\/friends\/(\d+)\/profile$/)) && method === "GET") {
      var pid = Number(m[1]);
      var fr3 = db.friendships.find(function (f) { return f.status === "accepted" && ((f.requesterId === me.id && f.addresseeId === pid) || (f.requesterId === pid && f.addresseeId === me.id)); });
      if (!fr3) return ERR(403, "Профиль доступен только друзьям");
      u = userById(pid);
      if (!u) return ERR(404, "Пользователь не найден");
      return J({ id: u.id, name: u.name, username: u.username, avatarEmoji: u.avatarEmoji, avatarColor: u.avatarColor, avatarUrl: u.avatarUrl, knowledgeLevel: u.knowledgeLevel, totalPoints: u.totalPoints, totalTimeMinutes: Math.round(u.totalTimeMinutes || 0), bio: u.bio, age: u.age, role: u.role, lastSeenAt: lastSeen(u), completedAssignments: db.submissions.filter(function (s) { return s.studentId === u.id; }).length, isOnline: isOnline(u, 180000) });
    }
    if ((m = path.match(/^\/api\/connections\/friends\/(\d+)$/)) && method === "DELETE") {
      var fr4 = db.friendships.find(function (f) { return f.id === Number(m[1]); });
      if (!fr4) return ERR(404, "Запрос не найден");
      if (fr4.requesterId !== me.id && fr4.addresseeId !== me.id) return ERR(403, "Forbidden");
      db.friendships = db.friendships.filter(function (f) { return f.id !== fr4.id; }); save();
      return J({ ok: true });
    }

    // ===== CALENDAR =====
    function slotById(sid) { return db.slots.find(function (s) { return s.id === sid; }); }
    if (method === "GET" && path === "/api/calendar/slots") {
      if (isTeacher(me.role)) {
        arr = db.slots.filter(function (s) { return s.teacherId === me.id && (!query.date || s.date === query.date); })
          .map(function (s) {
            return Object.assign({}, s, { bookings: db.bookings.filter(function (b) { return b.slotId === s.id; }).map(function (b) { var st = userById(b.studentId); return { id: b.id, slotId: b.slotId, studentId: b.studentId, status: b.status, note: b.note, studentName: st ? st.name : "?" }; }) });
          });
        return J(arr);
      }
      var myTeachers = db.teacherStudents.filter(function (x) { return x.studentId === me.id && x.status === "accepted"; }).map(function (x) { return x.teacherId; });
      if (!myTeachers.length) return J([]);
      var today3 = ymd(now());
      arr = db.slots.filter(function (s) {
        if (myTeachers.indexOf(s.teacherId) === -1) return false;
        return query.date ? s.date === query.date : s.date >= today3;
      }).map(function (s) {
        var bs = db.bookings.filter(function (b) { return b.slotId === s.id; });
        var mine = bs.find(function (b) { return b.studentId === me.id; });
        var confirmedMine = mine && mine.status === "confirmed";
        var confirmedOther = bs.some(function (b) { return b.status === "confirmed" && b.studentId !== me.id; });
        var tch2 = userById(s.teacherId);
        var status = confirmedMine ? "confirmed_me" : confirmedOther ? "unavailable" : mine ? "pending" : "available";
        return { id: s.id, teacherId: s.teacherId, date: s.date, startTime: s.startTime, endTime: s.endTime, teacherName: tch2 ? tch2.name : "?", status: status, myBookingId: mine ? mine.id : null };
      });
      return J(arr);
    }
    if (method === "POST" && path === "/api/calendar/slots") {
      if (!isTeacher(me.role)) return ERR(403, "Только учитель");
      if (!body.date || !body.startTime || !body.endTime) return ERR(400, "Укажите дату и время");
      if (body.endTime <= body.startTime) return ERR(400, "Конец должен быть позже начала");
      if (db.slots.some(function (s) { return s.teacherId === me.id && s.date === body.date && s.startTime === body.startTime; })) return ERR(409, "Слот уже существует");
      var slot = { id: ++db.seq.sl, teacherId: me.id, date: body.date, startTime: body.startTime, endTime: body.endTime, createdAt: iso(now()) };
      db.slots.push(slot); save();
      return J(Object.assign({}, slot, { bookings: [] }), 201);
    }
    if ((m = path.match(/^\/api\/calendar\/slots\/(\d+)$/)) && method === "DELETE") {
      if (!isTeacher(me.role)) return ERR(403, "Только учитель");
      var dsid = Number(m[1]);
      db.slots = db.slots.filter(function (s) { return !(s.id === dsid && s.teacherId === me.id); });
      db.bookings = db.bookings.filter(function (b) { return b.slotId !== dsid; });
      save();
      return J({ ok: true });
    }
    if ((m = path.match(/^\/api\/calendar\/slots\/(\d+)\/book$/)) && method === "POST") {
      if (me.role !== "student") return ERR(403, "Только ученик");
      var bslot = slotById(Number(m[1]));
      if (!bslot) return ERR(404, "Слот не найден");
      if (db.bookings.some(function (b) { return b.slotId === bslot.id && b.status === "confirmed"; })) return ERR(409, "Слот уже занят");
      if (db.bookings.some(function (b) { return b.slotId === bslot.id && b.studentId === me.id; })) return ERR(409, "Вы уже записались на этот слот");
      var bk = { id: ++db.seq.bk, slotId: bslot.id, studentId: me.id, status: "pending", note: body.note || null, createdAt: iso(now()) };
      db.bookings.push(bk); save();
      return J(bk, 201);
    }
    if ((m = path.match(/^\/api\/calendar\/slots\/(\d+)\/assign$/)) && method === "POST") {
      if (!isTeacher(me.role)) return ERR(403, "Только учитель");
      if (!body.studentId) return ERR(400, "Укажите ученика");
      var aslot = slotById(Number(m[1]));
      if (!aslot || aslot.teacherId !== me.id) return ERR(404, "Слот не найден");
      db.bookings.forEach(function (b) { if (b.slotId === aslot.id && b.status === "pending") b.status = "rejected"; });
      var exb = db.bookings.find(function (b) { return b.slotId === aslot.id && b.studentId === Number(body.studentId); });
      if (exb) { exb.status = "confirmed"; if (body.note) exb.note = body.note; save(); return J(exb, 201); }
      var nb = { id: ++db.seq.bk, slotId: aslot.id, studentId: Number(body.studentId), status: "confirmed", note: body.note || null, createdAt: iso(now()) };
      db.bookings.push(nb); save();
      return J(nb, 201);
    }
    if ((m = path.match(/^\/api\/calendar\/bookings\/(\d+)$/)) && method === "PATCH") {
      if (!isTeacher(me.role)) return ERR(403, "Только учитель");
      if (["confirmed", "rejected"].indexOf(body.status) === -1) return ERR(400, "Неверный статус");
      var pb = db.bookings.find(function (b) { return b.id === Number(m[1]); });
      if (!pb) return ERR(404, "Запрос не найден");
      if (body.status === "confirmed") db.bookings.forEach(function (b) { if (b.slotId === pb.slotId && b.id !== pb.id && b.status === "pending") b.status = "rejected"; });
      pb.status = body.status; save();
      return J(pb);
    }
    if ((m = path.match(/^\/api\/calendar\/bookings\/(\d+)$/)) && method === "DELETE") {
      db.bookings = db.bookings.filter(function (b) { return !(b.id === Number(m[1]) && b.studentId === me.id); }); save();
      return J({ ok: true });
    }
    if (method === "GET" && path === "/api/calendar/bookings") {
      if (isTeacher(me.role)) {
        var mySlotIds = db.slots.filter(function (s) { return s.teacherId === me.id; }).map(function (s) { return s.id; });
        arr = db.bookings.filter(function (b) { return mySlotIds.indexOf(b.slotId) !== -1 && b.status === "pending"; })
          .map(function (b) { var s = slotById(b.slotId); var st = userById(b.studentId); return { id: b.id, slotId: b.slotId, studentId: b.studentId, status: b.status, note: b.note, createdAt: b.createdAt, studentName: st ? st.name : "?", date: s.date, startTime: s.startTime, endTime: s.endTime }; });
        return J(arr);
      }
      arr = db.bookings.filter(function (b) { return b.studentId === me.id; })
        .map(function (b) { var s = slotById(b.slotId); if (!s) return null; var tch3 = userById(s.teacherId); return { id: b.id, slotId: b.slotId, status: b.status, note: b.note, createdAt: b.createdAt, teacherName: tch3 ? tch3.name : "?", date: s.date, startTime: s.startTime, endTime: s.endTime }; }).filter(Boolean);
      return J(arr);
    }
    if (method === "POST" && path === "/api/calendar/custom-requests") {
      if (me.role !== "student") return ERR(403, "Только ученик");
      if (!body.teacherId || !body.date || !body.startTime || !body.endTime) return ERR(400, "Укажите учителя, дату и время");
      if (body.endTime <= body.startTime) return ERR(400, "Конец должен быть позже начала");
      if (!db.teacherStudents.some(function (x) { return x.studentId === me.id && x.teacherId === Number(body.teacherId) && x.status === "accepted"; })) return ERR(403, "Нет связи с этим учителем");
      var cr = { id: ++db.seq.cr, studentId: me.id, teacherId: Number(body.teacherId), date: body.date, startTime: body.startTime, endTime: body.endTime, note: body.note || null, status: "pending", createdAt: iso(now()) };
      db.customRequests.push(cr); save();
      return J(cr, 201);
    }
    if (method === "GET" && path === "/api/calendar/custom-requests") {
      if (isTeacher(me.role)) {
        arr = db.customRequests.filter(function (c) { return c.teacherId === me.id && c.status === "pending"; })
          .map(function (c) { var st = userById(c.studentId); return Object.assign({}, c, { studentName: st ? st.name : "?" }); });
        return J(arr);
      }
      arr = db.customRequests.filter(function (c) { return c.studentId === me.id; })
        .map(function (c) { var tch4 = userById(c.teacherId); return Object.assign({}, c, { teacherName: tch4 ? tch4.name : "?" }); });
      return J(arr);
    }
    if ((m = path.match(/^\/api\/calendar\/custom-requests\/(\d+)$/)) && method === "PATCH") {
      if (!isTeacher(me.role)) return ERR(403, "Только учитель");
      if (["confirmed", "rejected"].indexOf(body.status) === -1) return ERR(400, "Неверный статус");
      var creq = db.customRequests.find(function (c) { return c.id === Number(m[1]) && c.teacherId === me.id; });
      if (!creq) return ERR(404, "Запрос не найден");
      if (body.status === "confirmed") {
        var cslot = db.slots.find(function (s) { return s.teacherId === me.id && s.date === creq.date && s.startTime === creq.startTime; });
        if (!cslot) { cslot = { id: ++db.seq.sl, teacherId: me.id, date: creq.date, startTime: creq.startTime, endTime: creq.endTime, createdAt: iso(now()) }; db.slots.push(cslot); }
        if (!db.bookings.some(function (b) { return b.slotId === cslot.id && b.studentId === creq.studentId; })) {
          db.bookings.push({ id: ++db.seq.bk, slotId: cslot.id, studentId: creq.studentId, status: "confirmed", note: creq.note, createdAt: iso(now()) });
        }
      }
      creq.status = body.status; save();
      return J(creq);
    }
    if (method === "GET" && path === "/api/calendar/history") {
      if (!isTeacher(me.role)) return ERR(403, "Только учитель");
      var today4 = ymd(now());
      arr = db.slots.filter(function (s) { return s.teacherId === me.id && s.date <= today4; })
        .sort(function (a, b) { return b.date === a.date ? b.startTime.localeCompare(a.startTime) : b.date.localeCompare(a.date); })
        .map(function (s) {
          return Object.assign({}, s, {
            confirmedBookings: db.bookings.filter(function (b) { return b.slotId === s.id && b.status === "confirmed"; })
              .map(function (b) { var st = userById(b.studentId) || {}; return { bookingId: b.id, slotId: b.slotId, studentId: b.studentId, note: b.note, studentName: st.name, studentSurname: st.surname, studentUsername: st.username, studentEmoji: st.avatarEmoji, studentColor: st.avatarColor }; }),
          });
        });
      return J(arr);
    }

    // ===== ASSIGNMENTS =====
    function fullAssignment(a) { return withMedia(a); }
    if (method === "GET" && path === "/api/assignments") {
      arr = db.assignments.filter(function (a) { return isTeacher(me.role) ? (!a.isDraft || a.createdBy === me.id) : !a.isDraft; });
      if (query.type) arr = arr.filter(function (a) { return a.type === query.type; });
      return J(arr.map(fullAssignment));
    }
    if (method === "GET" && path === "/api/assignments/my-assignments") {
      if (!isTeacher(me.role) && me.role !== "admin") return ERR(403, "Forbidden");
      return J(db.assignments.filter(function (a) { return a.createdBy === me.id && !a.deletedAt; }).map(fullAssignment));
    }
    if (method === "GET" && path === "/api/assignments/my-tasks") {
      arr = db.assignedTasks.filter(function (tk) {
        if (tk.studentId !== me.id) return false;
        var a = db.assignments.find(function (x) { return x.id === tk.assignmentId; });
        if (!a || a.deletedAt || a.isDraft) return false;
        var submitted = db.submissions.some(function (s) { return s.studentId === me.id && s.assignmentId === tk.assignmentId && new Date(s.submittedAt) > new Date(tk.assignedAt); });
        return !submitted;
      }).map(function (tk) {
        var a = db.assignments.find(function (x) { return x.id === tk.assignmentId; });
        var tch5 = userById(tk.teacherId);
        return { assignedTaskId: tk.id, assignedAt: tk.assignedAt, teacherId: tk.teacherId, teacherName: tch5 ? tch5.name : "?", assignmentId: a.id, title: a.title, description: a.description, type: a.type, points: a.points, ageMin: a.ageMin, ageMax: a.ageMax, content: a.content, mediaUrl: mapMedia(a.mediaUrl), createdAt: a.createdAt };
      });
      return J(arr);
    }
    if (method === "GET" && path === "/api/assignments/teacher-results") {
      if (!isTeacher(me.role)) return ERR(403, "Forbidden");
      arr = db.assignedTasks.filter(function (tk) { return tk.teacherId === me.id; }).map(function (tk) {
        var a = db.assignments.find(function (x) { return x.id === tk.assignmentId; }) || {};
        var st = userById(tk.studentId) || {};
        var sub = db.submissions.find(function (s) { return s.studentId === tk.studentId && s.assignmentId === tk.assignmentId; });
        var answers = sub ? db.subAnswers.filter(function (sa) { return sa.submissionId === sub.id; }).map(function (sa) { return { id: sa.id, questionId: sa.questionId, studentAnswer: sa.studentAnswer, isCorrect: sa.isCorrect, correctAnswer: sa.correctAnswer, questionText: sa.questionText }; }) : [];
        return {
          assignedTaskId: tk.id, assignedAt: tk.assignedAt, studentId: tk.studentId, studentName: st.name,
          studentAvatarEmoji: st.avatarEmoji, studentAvatarColor: st.avatarColor, studentAvatarUrl: st.avatarUrl,
          assignmentId: a.id, assignmentTitle: a.title, assignmentType: a.type, assignmentPoints: a.points,
          assignmentMediaUrl: mapMedia(a.mediaUrl), assignmentImageUrl: mapMedia(a.imageUrl),
          submission: sub ? { id: sub.id, score: sub.score, correctCount: sub.correctCount, totalQuestions: sub.totalQuestions, pointsEarned: sub.pointsEarned, textAnswer: sub.textAnswer, attachmentUrl: sub.attachmentUrl, status: sub.status, teacherFeedback: sub.teacherFeedback, submittedAt: sub.submittedAt } : null,
          answers: answers,
        };
      });
      return J(arr);
    }
    if (method === "GET" && path === "/api/assignments/my-submissions") {
      arr = db.submissions.filter(function (s) { return s.studentId === me.id; })
        .sort(function (a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); })
        .map(function (s) {
          var a = db.assignments.find(function (x) { return x.id === s.assignmentId; }) || {};
          return { submissionId: s.id, score: s.score, correctCount: s.correctCount, totalQuestions: s.totalQuestions, pointsEarned: s.pointsEarned, submittedAt: s.submittedAt, assignmentId: s.assignmentId, title: a.title, description: a.description, type: a.type, points: a.points };
        });
      return J(arr);
    }
    if (method === "POST" && path === "/api/assignments") {
      if (!isTeacher(me.role) && me.role !== "admin") return ERR(403, "Forbidden");
      if (!body.title || !String(body.title).trim()) return ERR(400, "Введите название задания");
      if (!body.type) return ERR(400, "Выберите тип задания");
      var na = {
        id: ++db.seq.a, title: body.title, description: body.description || null, type: body.type,
        source: "teacher_created", createdBy: me.id, ageMin: body.ageMin || 5, ageMax: body.ageMax || 18,
        points: 0, mediaUrl: body.mediaUrl || null, content: body.content || null,
        isDraft: body.isDraft !== false, timeLimitMinutes: body.timeLimitMinutes || null,
        imageUrl: body.imageUrl || null, deletedAt: null, createdAt: iso(now()), updatedAt: iso(now()),
      };
      var nqs = (body.questions || []).map(function (q, idx) {
        return { id: ++db.seq.q, assignmentId: na.id, text: q.text, options: q.options || [], correctAnswer: q.correctAnswer || "", orderIndex: q.orderIndex != null ? q.orderIndex : idx, createdAt: iso(now()) };
      });
      na.points = computeMaxPoints(na.type, nqs, na.timeLimitMinutes);
      db.assignments.push(na); db.questions = db.questions.concat(nqs); save();
      return J(na, 201);
    }
    if ((m = path.match(/^\/api\/assignments\/(\d+)\/publish$/)) && method === "POST") {
      var pa = db.assignments.find(function (a) { return a.id === Number(m[1]) && a.createdBy === me.id; });
      if (!pa) return ERR(404, "Not found");
      pa.isDraft = false; save();
      return J(pa);
    }
    if ((m = path.match(/^\/api\/assignments\/(\d+)\/assign$/)) && method === "POST") {
      if (!isTeacher(me.role)) return ERR(403, "Forbidden");
      if (!Array.isArray(body.studentIds) || !body.studentIds.length) return ERR(400, "studentIds required");
      var aa = db.assignments.find(function (a) { return a.id === Number(m[1]); });
      if (!aa) return ERR(404, "Assignment not found");
      if (aa.isDraft) aa.isDraft = false;
      var accepted = body.studentIds.filter(function (sid5) { return db.teacherStudents.some(function (x) { return x.teacherId === me.id && x.studentId === Number(sid5) && x.status === "accepted"; }); });
      if (!accepted.length) return ERR(400, "Нет принятых учеников из списка");
      var assigned = 0, skipped = 0;
      accepted.forEach(function (sid6) {
        sid6 = Number(sid6);
        var existing = db.assignedTasks.find(function (tk) { return tk.assignmentId === aa.id && tk.teacherId === me.id && tk.studentId === sid6; });
        if (existing) {
          var active = !db.submissions.some(function (s) { return s.studentId === sid6 && s.assignmentId === aa.id && new Date(s.submittedAt) > new Date(existing.assignedAt); });
          if (active) { skipped++; return; }
          db.assignedTasks = db.assignedTasks.filter(function (tk) { return tk !== existing; });
        }
        db.assignedTasks.push({ id: ++db.seq.at, assignmentId: aa.id, studentId: sid6, teacherId: me.id, assignedAt: iso(now()) });
        assigned++;
      });
      save();
      return J({ ok: true, assigned: assigned, skipped: skipped });
    }
    if ((m = path.match(/^\/api\/assignments\/(\d+)\/submit$/)) && method === "POST") {
      var sa2 = db.assignments.find(function (a) { return a.id === Number(m[1]); });
      if (!sa2) return ERR(404, "Assignment not found");
      if (sa2.type === "free_form") {
        var txt = (body.textAnswer || "").trim() || null;
        var att = (body.attachmentUrl || "").trim() || null;
        if (!txt && !att) return ERR(400, "Добавьте текст ответа или прикрепите файл");
        var fsub = { id: ++db.seq.sub, studentId: me.id, assignmentId: sa2.id, score: 0, correctCount: 0, totalQuestions: 0, pointsEarned: 0, recordingUrl: null, textAnswer: txt, attachmentUrl: att, status: "pending", teacherFeedback: null, submittedAt: iso(now()) };
        db.submissions.push(fsub); save();
        return J({ submissionId: fsub.id, pending: true, score: 0, totalQuestions: 0, correctCount: 0, pointsEarned: 0, results: [] });
      }
      var qs2 = db.questions.filter(function (q) { return q.assignmentId === sa2.id; });
      var totalQ = qs2.length, correct = 0, pts2 = 0, results = [];
      var newSubId = ++db.seq.sub;
      (body.answers || []).forEach(function (ans) {
        var q = qs2.find(function (x) { return x.id === Number(ans.questionId); });
        if (!q) return;
        var ok = q.correctAnswer.toLowerCase().trim() === String(ans.answer).toLowerCase().trim();
        if (ok) { correct++; pts2 += perCorrect(sa2.type, hasChoiceOptions(q), (sa2.timeLimitMinutes || 0) > 0); }
        results.push({ questionId: q.id, isCorrect: ok, studentAnswer: String(ans.answer), correctAnswer: q.correctAnswer });
        db.subAnswers.push({ id: ++db.seq.sa, submissionId: newSubId, questionId: q.id, studentAnswer: String(ans.answer), isCorrect: ok, correctAnswer: q.correctAnswer, questionText: q.text });
      });
      var score = totalQ ? Math.round((correct / totalQ) * 100) : 0;
      pts2 = Math.round(pts2);
      db.submissions.push({ id: newSubId, studentId: me.id, assignmentId: sa2.id, score: score, correctCount: correct, totalQuestions: totalQ, pointsEarned: pts2, recordingUrl: body.recordingUrl || null, textAnswer: null, attachmentUrl: null, status: "graded", teacherFeedback: null, submittedAt: iso(now()) });
      if (pts2 > 0) me.totalPoints += pts2;
      save();
      return J({ submissionId: newSubId, score: score, totalQuestions: totalQ, correctCount: correct, pointsEarned: pts2, results: results });
    }
    if ((m = path.match(/^\/api\/assignments\/(\d+)\/submissions$/)) && method === "GET") {
      arr = db.submissions.filter(function (s) { return s.assignmentId === Number(m[1]); }).map(function (s) {
        var st = userById(s.studentId) || {};
        var a = db.assignments.find(function (x) { return x.id === s.assignmentId; }) || {};
        return Object.assign({}, s, { studentName: st.name, assignmentTitle: a.title, answers: db.subAnswers.filter(function (x) { return x.submissionId === s.id; }).map(function (x) { return { questionId: x.questionId, isCorrect: x.isCorrect, studentAnswer: x.studentAnswer, correctAnswer: x.correctAnswer }; }) });
      });
      return J(arr);
    }
    if ((m = path.match(/^\/api\/assignments\/(\d+)$/)) && method === "GET") {
      var ga = db.assignments.find(function (a) { return a.id === Number(m[1]); });
      if (!ga) return ERR(404, "Assignment not found");
      var gqs = db.questions.filter(function (q) { return q.assignmentId === ga.id; })
        .sort(function (a, b) { return a.orderIndex - b.orderIndex; })
        .map(function (q) { return { id: q.id, text: q.text, options: q.options, correctAnswer: isTeacher(me.role) || me.role === "admin" ? q.correctAnswer : null, orderIndex: q.orderIndex }; });
      return J(Object.assign({}, withMedia(ga), { questions: gqs }));
    }
    if ((m = path.match(/^\/api\/assignments\/(\d+)$/)) && method === "PATCH") {
      if (!isTeacher(me.role) && me.role !== "admin") return ERR(403, "Forbidden");
      var ua = db.assignments.find(function (a) { return a.id === Number(m[1]) && a.createdBy === me.id; });
      if (!ua) return ERR(404, "Not found");
      ["title", "description", "ageMin", "ageMax", "mediaUrl", "content", "type"].forEach(function (k) { if (body[k] !== undefined) ua[k] = body[k]; });
      if (body.questions !== undefined) {
        db.questions = db.questions.filter(function (q) { return q.assignmentId !== ua.id; });
        var uqs = body.questions.map(function (q, idx) { return { id: ++db.seq.q, assignmentId: ua.id, text: q.text, options: q.options || [], correctAnswer: q.correctAnswer || "", orderIndex: idx, createdAt: iso(now()) }; });
        db.questions = db.questions.concat(uqs);
      }
      ua.points = computeMaxPoints(ua.type, db.questions.filter(function (q) { return q.assignmentId === ua.id; }), ua.timeLimitMinutes);
      ua.updatedAt = iso(now()); save();
      return J(ua);
    }
    if ((m = path.match(/^\/api\/assignments\/(\d+)$/)) && method === "DELETE") {
      if (!isTeacher(me.role) && me.role !== "admin") return ERR(403, "Forbidden");
      var da = db.assignments.find(function (a) { return a.id === Number(m[1]) && a.createdBy === me.id && !a.deletedAt; });
      if (!da) return ERR(404, "Задание не найдено");
      da.deletedAt = iso(now()); save();
      return NC();
    }
    if ((m = path.match(/^\/api\/assigned-tasks\/(\d+)$/)) && method === "DELETE") {
      if (!isTeacher(me.role) && me.role !== "admin") return ERR(403, "Forbidden");
      db.assignedTasks = db.assignedTasks.filter(function (tk) { return !(tk.id === Number(m[1]) && tk.teacherId === me.id); }); save();
      return NC();
    }

    // ===== SUBMISSIONS =====
    if ((m = path.match(/^\/api\/submissions\/(\d+)\/review$/)) && method === "GET") {
      var rsub = db.submissions.find(function (s) { return s.id === Number(m[1]); });
      if (!rsub) return ERR(404, "Submission not found");
      if (!isTeacher(me.role) && rsub.studentId !== me.id) return ERR(403, "Forbidden");
      var ra = db.assignments.find(function (x) { return x.id === rsub.assignmentId; });
      return J({
        id: rsub.id, score: rsub.score, correctCount: rsub.correctCount, totalQuestions: rsub.totalQuestions,
        pointsEarned: rsub.pointsEarned, submittedAt: rsub.submittedAt, studentId: rsub.studentId,
        assignmentId: rsub.assignmentId, textAnswer: rsub.textAnswer, attachmentUrl: rsub.attachmentUrl,
        status: rsub.status, teacherFeedback: rsub.teacherFeedback,
        assignment: ra ? { id: ra.id, title: ra.title, type: ra.type, points: ra.points, mediaUrl: mapMedia(ra.mediaUrl), imageUrl: mapMedia(ra.imageUrl) } : null,
        answers: db.subAnswers.filter(function (x) { return x.submissionId === rsub.id; }).map(function (x) { return { id: x.id, questionId: x.questionId, studentAnswer: x.studentAnswer, isCorrect: x.isCorrect, correctAnswer: x.correctAnswer, questionText: x.questionText }; }),
      });
    }
    if ((m = path.match(/^\/api\/submissions\/(\d+)\/grade$/)) && method === "PATCH") {
      var gsub = db.submissions.find(function (s) { return s.id === Number(m[1]); });
      if (!gsub) return ERR(404, "Submission not found");
      var gaa = db.assignments.find(function (x) { return x.id === gsub.assignmentId; });
      if (!gaa) return ERR(404, "Assignment not found");
      if (!(me.role === "admin" || (isTeacher(me.role) && (gaa.createdBy === me.id || db.assignedTasks.some(function (tk) { return tk.teacherId === me.id && tk.studentId === gsub.studentId && tk.assignmentId === gsub.assignmentId; }))))) return ERR(403, "Forbidden");
      var total = Math.max(1, Math.round(body.totalQuestions || 1));
      var correct2 = Math.min(Math.max(0, Math.round(body.correctCount || 0)), total);
      gsub.totalQuestions = total; gsub.correctCount = correct2;
      gsub.score = Math.round((correct2 / total) * 100);
      var pc = perCorrect(gaa.type, false, (gaa.timeLimitMinutes || 0) > 0);
      gsub.pointsEarned = Math.round(pc * correct2);
      gsub.teacherFeedback = (body.feedback || "").trim() || null;
      gsub.status = "graded";
      var stud = userById(gsub.studentId);
      if (stud && gsub.pointsEarned > 0) stud.totalPoints += gsub.pointsEarned;
      save();
      return J(gsub);
    }

    // ===== UPLOADS / STORAGE / VOICE =====
    if (method === "POST" && /^\/api\/upload\/(image|audio|video|student-recording)$/.test(path)) {
      if (body && typeof FormData !== "undefined" && body instanceof FormData) {
        var f = body.get("file");
        if (f && typeof f !== "string") {
          // Images are downscaled (max 512px, JPEG) so avatars/pictures stay a
          // few dozen KB instead of multi-MB data URLs that blow the storage
          // quota and break ALL persistence.
          if (/image/.test(String(f.type || ""))) {
            var compressed = await compressImageBlob(f);
            if (compressed) return J({ url: compressed, filename: "demo-" + now() + ".jpg" });
          }
          var dataUrl = await fileToDataUrl(f);
          if (dataUrl) return J({ url: dataUrl, filename: "demo-" + now() });
        }
      }
      return ERR(400, "No file uploaded");
    }
    if (method === "POST" && path === "/api/storage/request-upload-url") {
      if (!body || !body.name || !body.size || !body.contentType) return ERR(400, "Missing or invalid required fields");
      if (Number(body.size) > 60 * 1024 * 1024) return ERR(400, "Файл больше 60 МБ — слишком большой для демо");
      var upId = "m" + now().toString(36) + Math.random().toString(36).slice(2, 8);
      db.storage[upId] = { contentType: String(body.contentType), name: String(body.name) };
      save();
      return J({ uploadURL: "/api/storage/put/" + upId, objectPath: "/objects/" + upId });
    }
    if (path.indexOf("/api/voice-chat") === 0) {
      return ERR(503, "Голосовой чат недоступен в демо-версии (нужен OpenAI API)");
    }
    if (method === "GET" && path === "/api/healthz") return J({ status: "ok" });
    if (method === "GET" && path === "/api/users") {
      arr = db.users;
      if (query.role) arr = arr.filter(function (x) { return x.role === query.role; });
      return J(arr.map(function (x) { return { id: x.id, username: x.username, name: x.name, surname: x.surname, role: x.role, age: x.age, knowledgeLevel: x.knowledgeLevel, avatarEmoji: x.avatarEmoji, avatarColor: x.avatarColor, avatarUrl: x.avatarUrl, totalPoints: x.totalPoints, totalTimeMinutes: Math.round(x.totalTimeMinutes || 0), createdAt: x.createdAt }; }));
    }

    return ERR(404, "Not found: " + method + " " + path);
  }

  // ---------------- fetch patch ----------------
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url;
    try {
      url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input && input.url ? input.url : String(input);
    } catch (e) { url = String(input); }
    var path = null;
    if (url.indexOf("/api/") === 0 || url === "/api") path = url;
    else {
      try {
        var pu = new URL(url, location.href);
        if (pu.origin === location.origin && pu.pathname.indexOf("/api/") === 0) path = pu.pathname + pu.search;
      } catch (e2) {}
    }
    if (path == null) return realFetch(input, init);

    var qIdx = path.indexOf("?");
    var query = {};
    var purePath = path;
    if (qIdx !== -1) {
      purePath = path.slice(0, qIdx);
      path.slice(qIdx + 1).split("&").forEach(function (kv) {
        var p = kv.split("=");
        if (p[0]) query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
      });
    }
    var method = ((init && init.method) || (input && typeof input !== "string" && input.method) || "GET").toUpperCase();
    var headers = new Headers((init && init.headers) || (input && typeof input !== "string" && input.headers) || {});
    var auth = authOf(headers);

    return bodyOf(input, init).then(function (body) {
      return handle(method, purePath, query, auth, body);
    }).catch(function (e) {
      return J({ error: "Mock error: " + (e && e.message ? e.message : String(e)) }, 500);
    });
  };
})();
