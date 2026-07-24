import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
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

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
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

export default router;
