---
name: Gamification system
description: XP levels, achievements, daily goal, mascot — architecture and gotchas for the English Learning App gamification feature.
---

# Gamification System

## Architecture
- **DB**: `xpLevel`, `dailyGoalMinutes`, `loginStreak`, `lastLoginDate`, `mascotName` added to `usersTable`; `userAchievementsTable` in `lib/db/src/schema/gamification.ts`.
- **Backend**: `artifacts/api-server/src/routes/gamification.ts` — routes under `/api/gamification/*`
- **Frontend hook**: `artifacts/english-learning/hooks/useGamification.ts` — single source of truth for stats
- **Constants**: `constants/xpLevels.ts` (50 levels), `constants/achievements.ts` (35+ achievements)

## AchievementStats interface (must keep in sync)
Required fields: `completedAssignments`, `totalPoints`, `knowledgeLevel`, `totalTimeMinutes`, `voiceChatSessions`, `loginStreak`, `perfectScoreCount`, `xpLevel`, `earlyBirdSessions`.

**Why:** Any screen that uses `getUnlockedAchievements()` must pass all 9 fields — TypeScript will error otherwise. Friend profile `[id].tsx` uses zeroed-out defaults for new fields since we don't have friend gamification data.

## DB column names (gotcha)
- `timeSessionsTable` uses `studentId` (not `userId`) and `durationMinutes` (not `durationSeconds`).

**Why:** Mismatch caused runtime errors in the gamification route when computing `todayMinutes`.

## XP thresholds
Must match between `constants/xpLevels.ts` (frontend) and `gamification.ts` backend `XP_THRESHOLDS` array.

## Daily login
Awards 30 points + streak bonus. Claimed once per calendar day, tracked via `lastLoginDate` on `usersTable`.

## Screens using gamification
- `profile.tsx` — full: XpLevelBar, DailyGoalBar, LevelBadgesShowcase, AchievementToast, FloatingMascot, MascotNamePicker
- `assignments.tsx` — DailyGoalBar (student only, shown under level banner)
- `friend/[id].tsx` — uses `getUnlockedAchievements` with zeroed new fields
