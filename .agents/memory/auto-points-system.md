---
name: Automatic points system
description: Points a student earns are app-computed, never teacher-chosen; where the shared formula lives and the rules any new create/edit/grade path must follow.
---

# Automatic points

Points a student earns for an assignment are computed by the app, never chosen by the teacher. The single source of truth for the formula is `artifacts/api-server/src/lib/points.ts` (`pointsPerCorrect`, `hasChoiceOptions`, `isTimeLimited`, `computeMaxPoints`).

**Rule:** any mutation path that creates/edits an assignment or grades a submission must (a) reject/ignore client-supplied `points`, and (b) derive points via the `points.ts` helpers. Do not add a `points` field back to any request body or form.

**Why:** teacher-supplied points were removed both to enforce the product rule and to close an arbitrary point-inflation avenue. A create/edit/grade route that forgets this silently reintroduces the vulnerability and the inconsistency.

**How to apply:**
- Question-based assignments store the max points (`computeMaxPoints`) at create time; the submit route must sum `pointsPerCorrect` per correct question so a perfect score equals the stored max (sum unrounded, round once).
- `free_form` stores `points = 0` at create (total unknown until grading); its grade route computes `pointsPerCorrect(type, /*hasOptions*/ false, hasTimeLimit) * correctCount`.
- On PATCH, recompute points whenever `questions` **or** `type` change; when only `type` changed, reload the existing questions from the DB before recomputing.
- Student-facing displays show "по проверке" / "Баллы по проверке" when `points === 0` (free_form) instead of "0 очков".
- Legacy assignments keep their old teacher-set points badge until edited (no backfill); the submit route ignores the stored value and pays out via the formula, so old cards can display a stale number.
