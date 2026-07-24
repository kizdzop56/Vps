---
name: Avatar photo (avatarUrl) rendering coverage
description: Adding a new user field (e.g. avatarUrl) requires auditing every backend select and every frontend render site individually — no central source of truth exists.
---

When a user-facing field like `avatarUrl` is added to the schema, it does not automatically propagate:

- Backend: every hand-written `db.select({...})` that picks specific columns (as opposed to `db.select()` for the full row) must explicitly list the new field. This app has many such partial selects across `connections.ts`, `users.ts`, `leaderboard.ts`, `assignments.ts` — one per screen/relationship (friends, teachers, students, parent/children, leaderboard categories, teacher-results, etc).
- Frontend: raw inline `<View style={{ backgroundColor: avatarColor }}><Text>{avatarEmoji}</Text></View>` circles do NOT fall back to a photo even if the API now returns `avatarUrl` — each render site must be swapped to check `avatarUrl` first.

**Why:** A prior fix only added `avatarUrl` to the login/register response, but avatars still appeared missing for *other* users (friends, students, teachers) because ~15 separate backend selects and ~10 separate frontend render sites all needed the same field added independently.

**How to apply:** This app has a shared `components/AnimatedAvatar.tsx` that already handles `avatarUrl` → `avatarEmoji` fallback correctly. When adding avatar display anywhere, always use this component instead of hand-rolling a circle+emoji view — it eliminates this whole class of bug. When grep'ing for stale renders, search for `avatarColor` combined with inline `backgroundColor:` styles (not `AnimatedAvatar`).
