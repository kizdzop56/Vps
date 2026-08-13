// Клиентский слой ситуаций от учителя.
//
// apiFetch берётся из useFlashcards: авторизация и разбор ошибок должны быть
// общими на всё приложение — две копии этой функции неизбежно разъедутся.
//
// Ситуация — ЗАДАНИЕ, а не свободный разговор со Снежей: свои маршруты, свой
// разбор ошибок и отчёт учителю (см. api-server/src/routes/scenarios.ts).
import { apiFetch } from "@/hooks/useFlashcards";

/**
 * Подпись условия завершения. Приходит с сервера и НЕ выбирается учителем:
 * сервер выводит её из самого задания (см. finishModeFor в routes/scenarios.ts).
 */
export type FinishMode = "turns" | "goal" | "both";
export type Strictness = "gentle" | "normal" | "strict";

export interface Scenario {
  id: number;
  title: string;
  situation: string;
  role: string;
  goal: string | null;
  finishMode: FinishMode;
  /** Сколько реплик нужно сказать. НОЛЬ — учитель не ограничивал. */
  turnsTarget: number;
  criteria: string[];
  strictness: Strictness;
  level: string | null;
  opener: string | null;
  archived: boolean;
  createdAt: string;
}

/** Ситуация в списке учителя: со счётчиками выдачи и разборов. */
export interface TeacherScenario extends Scenario {
  assigned: number;
  attempts: number;
  /** Закрытые попытки, которые учитель ещё не открывал. */
  fresh: number;
}

export interface ScenarioAttemptBrief {
  id: number;
  status: "active" | "done" | "stopped";
  turns: number;
  mistakes: number;
  goalReached: boolean;
  startedAt: string;
  finishedAt: string | null;
}

/** Ситуация в списке ученика. */
export interface StudentScenario extends Scenario {
  teacherName: string | null;
  attempt: ScenarioAttemptBrief | null;
  done: number;
}

export interface ScenarioMessage {
  id: number;
  role: "student" | "ai";
  text: string;
  correct?: boolean | null;
  fixed?: string | null;
  issue?: string | null;
  at: string;
}

export interface ScenarioRun {
  scenario: Scenario;
  attempt: ScenarioAttemptBrief & { summary?: string | null };
  messages: ScenarioMessage[];
}

export interface ScenarioReply {
  student: ScenarioMessage;
  reply: ScenarioMessage;
  attempt: {
    id: number;
    status: string;
    turns: number;
    turnsTarget: number;
    mistakes: number;
    goalReached: boolean;
    summary: string | null;
  };
  finished: boolean;
  /** Итоговый разбор для учителя ещё считается на сервере. */
  summaryPending?: boolean;
  pointsEarned: number;
}

export interface ScenarioReport {
  scenario: Scenario;
  student: { id: number; name: string; avatarEmoji: string | null; avatarColor: string | null } | null;
  attempt: ScenarioAttemptBrief & { summary: string | null };
  messages: ScenarioMessage[];
}

export interface ScenarioStudent {
  id: number;
  name: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  knowledgeLevel: string | null;
}

export interface ScenarioDetails {
  scenario: Scenario;
  students: { id: number; name: string; avatarEmoji: string | null; avatarColor: string | null }[];
  attempts: (ScenarioAttemptBrief & {
    studentId: number;
    studentName: string | null;
    seenAt: string | null;
    fresh: boolean;
  })[];
}

/** Что учитель заполняет при создании. */
export interface ScenarioDraft {
  title: string;
  situation: string;
  role: string;
  goal?: string;
  /** 0 — без ограничения по репликам. */
  turnsTarget: number;
  criteria: string[];
  strictness: Strictness;
  level?: string | null;
  opener?: string;
  /** Выдать сразу всем своим ученикам. */
  assignAll?: boolean;
  studentIds?: number[];
}

export const scenarios = {
  // ── Учитель ──
  list: () => apiFetch<TeacherScenario[]>("/api/scenarios"),
  students: () => apiFetch<ScenarioStudent[]>("/api/scenarios/students"),
  details: (id: number) => apiFetch<ScenarioDetails>(`/api/scenarios/${id}`),
  create: (draft: ScenarioDraft) =>
    apiFetch<Scenario & { assignedTo: number[] }>("/api/scenarios", {
      method: "POST",
      body: JSON.stringify(draft),
    }),
  update: (id: number, patch: Partial<ScenarioDraft> & { archived?: boolean }) =>
    apiFetch<Scenario>(`/api/scenarios/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  assign: (id: number, target: { studentIds?: number[]; assignAll?: boolean }) =>
    apiFetch<{ assigned: number[]; rejected: number[] }>(`/api/scenarios/${id}/assign`, {
      method: "POST",
      body: JSON.stringify(target),
    }),
  unassign: (id: number, studentId: number) =>
    apiFetch<null>(`/api/scenarios/${id}/assign/${studentId}`, { method: "DELETE" }),
  attempts: () =>
    apiFetch<Array<{
      id: number;
      scenarioId: number;
      scenarioTitle: string;
      studentId: number;
      studentName: string | null;
      status: string;
      turns: number;
      mistakes: number;
      goalReached: boolean;
      startedAt: string;
      finishedAt: string | null;
      fresh: boolean;
    }>>("/api/scenario-attempts"),

  // ── Ученик ──
  mine: () => apiFetch<StudentScenario[]>("/api/scenarios/mine"),
  start: (id: number) => apiFetch<ScenarioRun>(`/api/scenarios/${id}/start`, { method: "POST" }),
  reply: (attemptId: number, body: { text?: string; audioBase64?: string; mimeType?: string }) =>
    apiFetch<ScenarioReply>(`/api/scenario-attempts/${attemptId}/reply`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  finish: (attemptId: number) =>
    apiFetch<{ status: string; summary: string | null; summaryPending?: boolean }>(
      `/api/scenario-attempts/${attemptId}/finish`,
      { method: "POST" },
    ),

  // ── Оба ──
  report: (attemptId: number) => apiFetch<ScenarioReport>(`/api/scenario-attempts/${attemptId}`),
};

/**
 * Условие завершения человеческим языком.
 *
 * Считается по самому заданию, а не по finishMode: так подпись не разъедется с
 * поведением сервера, если у старой ситуации в базе осталось прежнее значение.
 */
export function finishText(s: { goal: string | null; turnsTarget: number }): string {
  if (s.goal && s.turnsTarget > 0) return `${s.turnsTarget} реплик и цель`;
  if (s.goal) return "до достижения цели";
  if (s.turnsTarget > 0) return `${s.turnsTarget} реплик`;
  return "без условия завершения";
}

/**
 * Сколько заданий ждёт ученика: по этому числу горит метка у «Разговора со
 * Снежей».
 *
 * Считается только незаконченное: ситуация без единой попытки и попытка в
 * состоянии active. Пройденное и прерванное («вышел на середине») метку не
 * зажигают — ученик своё уже сделал, а решать, засчитывать ли, будет учитель.
 */
export function freshScenarioCount(list: StudentScenario[]): number {
  return list.filter((s) => !s.attempt || s.attempt.status === "active").length;
}

/** Строгость проверки словами. */
export function strictnessText(value: Strictness): string {
  if (value === "gentle") return "мягко";
  if (value === "strict") return "строго";
  return "обычно";
}

export default scenarios;
