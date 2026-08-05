import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
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
import messagingRouter from "./messaging";
import ttsRouter from "./tts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
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
router.use(messagingRouter);
router.use(ttsRouter);

export default router;
