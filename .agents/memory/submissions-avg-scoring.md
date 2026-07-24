---
name: Averaging submissions.score
description: Why any average over submissions.score must filter to graded submissions
---

Any leaderboard/analytics metric that averages `submissionsTable.score` must filter to
`status = "graded"` before aggregating.

**Why:** Manually-graded submissions (text answers, recordings) are inserted with
`score: 0, status: "pending"` and only receive a real score once a teacher grades them.
An unfiltered `avg(score)` counts every pending submission as 0%, which unfairly tanks a
student's ranking until grading happens.

**How to apply:** When building any avg/sum over `submissions.score` (e.g. the leaderboard
"Задания" category = average completion % across all submissions), add
`.where(eq(submissionsTable.status, "graded"))` to the aggregate query. Status values in
use: `"pending"` (ungraded) and `"graded"`.
