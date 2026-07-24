// ── Automatic points calculation ─────────────────────────────────────
// Points a student earns are computed by the app, not chosen by the teacher.
// The value of a single correct answer depends on:
//   1. Assignment type difficulty (audio hardest → text_test easiest)
//   2. Answer format (writing your own answer is harder than picking an option)
//   3. Whether the assignment has a time limit (time pressure = harder)
// The number of questions and number of correct answers then scale the total.

// Difficulty multiplier per assignment type.
// audio (hardest) > video > reading > text_test (easiest); free_form is open writing.
const TYPE_DIFFICULTY: Record<string, number> = {
  audio: 2.5,
  video: 1.8,
  free_form: 1.5,
  reading: 1.2,
  text_test: 1.0,
};

const BASE_PER_CORRECT = 2; // easiest correct answer (multiple-choice test, no timer)
const OPEN_ANSWER_MULT = 1.5; // student writes the answer themselves
const CHOICE_MULT = 1.0; // answer options are provided
const TIME_LIMIT_MULT = 1.3; // assignment is under a time limit

/** Points awarded for a single correct answer given the assignment's factors. */
export function pointsPerCorrect(
  type: string,
  hasOptions: boolean,
  hasTimeLimit: boolean,
): number {
  const typeMult = TYPE_DIFFICULTY[type] ?? 1.0;
  const formatMult = hasOptions ? CHOICE_MULT : OPEN_ANSWER_MULT;
  const timeMult = hasTimeLimit ? TIME_LIMIT_MULT : 1.0;
  return BASE_PER_CORRECT * typeMult * formatMult * timeMult;
}

/** A question is multiple-choice when it ships with 2+ answer options. */
export function hasChoiceOptions(q: { options?: unknown }): boolean {
  return Array.isArray(q.options) && (q.options as unknown[]).length >= 2;
}

/** Whether a time-limit value counts as an actual limit. */
export function isTimeLimited(timeLimitMinutes: number | null | undefined): boolean {
  return typeof timeLimitMinutes === "number" && timeLimitMinutes > 0;
}

/** Maximum points for a question-based assignment (every answer correct). */
export function computeMaxPoints(
  type: string,
  questions: Array<{ options?: unknown }>,
  hasTimeLimit: boolean,
): number {
  const total = questions.reduce(
    (sum, q) => sum + pointsPerCorrect(type, hasChoiceOptions(q), hasTimeLimit),
    0,
  );
  return Math.round(total);
}
