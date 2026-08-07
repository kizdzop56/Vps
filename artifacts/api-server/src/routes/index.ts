import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import studentProfileRouter from "./studentProfile";
import interestsRouter from "./interests";
import assignmentsRouter from "./assignments";
import submissionsRouter from "./submissions";
import voiceChatRouter from "./voiceChat";
import timeTrackingRouter from "./timeTracking";
import leaderboardRouter from "./leaderboard";
import uploadRouter from "./upload";
import storageRouter from "./storage";
import connectionsRouter from "./connections";
import calendarRouter from "./calendar";
import gamificationRouter from "./gamification";
import flashcardsRouter from "./flashcards";
import flashcardsAnswerRouter from "./flashcardsAnswer";
import messagingRouter from "./messaging";
import ttsRouter from "./tts";
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
router.use(voiceChatRouter);
router.use(timeTrackingRouter);
router.use(leaderboardRouter);
router.use(uploadRouter);
router.use(storageRouter);
router.use(connectionsRouter);
router.use(calendarRouter);
router.use(gamificationRouter);
router.use(flashcardsRouter);
// Проверка свободного ответа (письмо и произношение): /flashcards/check-answer.
// Путь не пересекается с маршрутами flashcardsRouter, поэтому порядок роли не
// играет; вынесен отдельно, чтобы не растить flashcards.ts дальше.
router.use(flashcardsAnswerRouter);
router.use(messagingRouter);
router.use(ttsRouter);
// Обслуживание данных — не часть приложения, поэтому последним: инструмент не
// должен перехватывать пути у обычных маршрутов. Без MAINTENANCE_KEY в
// окружении он отвечает 404 на всё, что бы ни спросили.
router.use(maintenanceRouter);

export default router;
