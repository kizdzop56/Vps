import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import studentProfileRouter from "./studentProfile";
import interestsRouter from "./interests";
import assignmentsRouter from "./assignments";
import submissionsRouter from "./submissions";
import analysisRouter from "./analysis";
import voiceChatRouter from "./voiceChat";
import scenariosRouter from "./scenarios";
import timeTrackingRouter from "./timeTracking";
import leaderboardRouter from "./leaderboard";
import uploadRouter from "./upload";
import storageRouter from "./storage";
import connectionsRouter from "./connections";
import calendarRouter from "./calendar";
import gamificationRouter from "./gamification";
import notificationsRouter from "./notifications";
import flashcardsRouter from "./flashcards";
import flashcardsLearnRouter from "./flashcardsLearn";
import flashcardsAnswerRouter from "./flashcardsAnswer";
import grammarRouter from "./grammar";
import messagingRouter from "./messaging";
import ttsRouter from "./tts";
import raidRouter from "./raid";
import maintenanceRouter from "./maintenance";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
// Цифры для чужого профиля ученика: /students/:id/profile-stats.
// Путь не пересекается с маршрутами usersRouter (/students/:id/submissions и
// /students/:id/category-stats), порядок значения не имеет.
router.use(studentProfileRouter);
// Интересы живут отдельным маршрутом: /users/:id/interests не пересекается
// с /users/:id, поэтому порядок здесь роли не играет.
router.use(interestsRouter);
router.use(assignmentsRouter);
router.use(submissionsRouter);
// Разбор успеваемости нейросетью: /analysis/ai. Своё пространство путей.
// Тяжёлый и платный, поэтому с кэшем внутри — см. шапку файла.
router.use(analysisRouter);
router.use(voiceChatRouter);
// Ситуации от учителя: роль-плей как задание (/scenarios/*,
// /scenario-attempts/*). Со свободным разговором общего только слой ИИ:
// у ситуаций свои таблицы, свой разбор ошибок и свой отчёт учителю.
router.use(scenariosRouter);
router.use(timeTrackingRouter);
router.use(leaderboardRouter);
router.use(uploadRouter);
router.use(storageRouter);
router.use(connectionsRouter);
router.use(calendarRouter);
router.use(gamificationRouter);
// Лента событий: /notifications. Своё пространство путей, ни с чем не
// пересекается — вынесено отдельно, чтобы не растить gamification.ts дальше.
router.use(notificationsRouter);
// Перехватчик routes/raidHook.ts, который раньше стоял здесь, снят: урон по
// боссу теперь наносится ТОЛЬКО из заданий самого рейда (POST /raid/answer,
// см. routes/raid.ts — он сам вызывает recordRaidHit). Раньше любой верный
// ответ в «Учёбе» (слова, формы глаголов, времена) тоже бил босса, даже если
// ученик вкладку «Рейд» не открывал — см. историю routes/raidHook.ts.
// Раздел «Слова» разделён надвое: колоды, каталог, импорт и назначения — в
// flashcards, сам тренажёр (очередь, ответы, статистика, марафон) — в
// flashcardsLearn. Пути не пересекаются, поэтому порядок значения не имеет.
// Общее для обеих половин лежит в lib/flashcardsCore.ts.
router.use(flashcardsRouter);
router.use(flashcardsLearnRouter);
// Проверка свободного ответа (письмо и произношение): /flashcards/check-answer.
// Путь не пересекается с остальными; вынесен отдельно по той же причине.
router.use(flashcardsAnswerRouter);
// Раздел «Составлять»: неправильные глаголы, времена, сборка предложений.
// Своё пространство путей /grammar/*, порядок значения не имеет.
router.use(grammarRouter);
router.use(messagingRouter);
router.use(ttsRouter);
// Экран рейда: /raid/*. Своё пространство путей.
router.use(raidRouter);
// Обслуживание данных — не часть приложения, поэтому последним: инструмент не
// должен перехватывать пути у обычных маршрутов. Без MAINTENANCE_KEY в
// окружении он отвечает 404 на всё, что бы ни спросили.
router.use(maintenanceRouter);

export default router;
