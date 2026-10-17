// ─────────────────────────────────────────────────────────────────────────────
// Срок сдачи задания: без срока или введённые учителем дата и время.
//
// Срок хранится на назначении (assigned_tasks.due_at) в UTC. Учитель вводит
// дедлайн в своём местном времени; ученику показывается локальная дата и время.
// ─────────────────────────────────────────────────────────────────────────────

export type DueUrgency = "none" | "overdue" | "today" | "soon" | "later";

export interface DueInfo {
  text: string;
  urgency: DueUrgency;
  active: boolean;
}

/** Сроки в форме: без срока или ввод своего дедлайна. */
export const DUE_PRESETS = [
  { key: "none", label: "Без срока", days: null },
  { key: "custom", label: "Указать дату и время", days: null },
] as const;

export type DuePresetKey = typeof DUE_PRESETS[number]["key"];

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

let customDueDate: string | null = null;
let customDueDatePrompted = false;

function clearCustomDueDate(): void {
  customDueDate = null;
  customDueDatePrompted = false;
}

/** Parse a local date and time strictly, rejecting impossible dates and past deadlines. */
function parseLocalDeadline(dateText: string, timeText: string, now: Date): Date | null {
  const dateMatch = dateText.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeText.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
    date.getHours() !== hour || date.getMinutes() !== minute || date.getTime() <= now.getTime()
  ) return null;
  return date;
}

/**
 * Browser input for the custom deadline. The function caches the response because
 * the assignments screen also calls dueDateFromPreset while rendering its
 * preview text. Closing/reopening the assignment modal asks for a fresh value.
 */
function promptForCustomDeadline(now: Date): string | null {
  if (customDueDatePrompted) return customDueDate;
  customDueDatePrompted = true;

  const prompt = (globalThis as any).prompt as ((message: string, defaultValue?: string) => string | null) | undefined;
  const alert = (globalThis as any).alert as ((message: string) => void) | undefined;
  if (!prompt) return null;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

  while (true) {
    const dateText = prompt("Срок сдачи: введите дату в формате ГГГГ-ММ-ДД", defaultDate);
    if (dateText === null) return null;
    const timeText = prompt("Введите время в формате ЧЧ:ММ (24-часовой формат)", "23:59");
    if (timeText === null) return null;
    const date = parseLocalDeadline(dateText, timeText, now);
    if (date) {
      customDueDate = date.toISOString();
      return customDueDate;
    }
    alert?.("Проверьте дату и время: дата должна быть реальной и находиться в будущем. Пример: 2026-10-20 и 18:30.");
  }
}

/** Get the deadline selected in the form as an ISO timestamp, or null. */
export function dueDateFromPreset(key: DuePresetKey, now: Date = new Date()): string | null {
  if (key === "none") {
    clearCustomDueDate();
    return null;
  }
  if (key === "custom") return promptForCustomDeadline(now);
  return null;
}

/** Legacy default-due field is no longer offered; open each send dialog without a deadline. */
export function presetFromDays(_days: number | null | undefined): DuePresetKey {
  clearCustomDueDate();
  return "none";
}

function parseDue(dueAt?: string | Date | null): Date | null {
  if (!dueAt) return null;
  const date = dueAt instanceof Date ? dueAt : new Date(dueAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Human-readable local deadline, including its exact time. */
export function formatDue(dueAt?: string | Date | null, now: Date = new Date()): DueInfo {
  const due = parseDue(dueAt);
  if (!due) return { text: "без срока", urgency: "none", active: false };

  const diffDays = Math.round((startOfDay(due) - startOfDay(now)) / 86400000);
  const dateLabel = `${String(due.getDate()).padStart(2, "0")} ${MONTHS_SHORT[due.getMonth()]} ${due.getFullYear()}`;
  const time = `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`;

  if (due.getTime() < now.getTime()) {
    if (diffDays === 0) return { text: `срок истёк сегодня в ${time}`, urgency: "overdue", active: false };
    const late = Math.abs(diffDays);
    return {
      text: `срок истёк ${dateLabel} в ${time} · ${pluralRu(late, "день", "дня", "дней")} назад`,
      urgency: "overdue",
      active: false,
    };
  }

  if (diffDays === 0) return { text: `сегодня до ${time}`, urgency: "today", active: true };
  if (diffDays === 1) return { text: `завтра до ${time}`, urgency: "soon", active: true };
  if (diffDays <= 7) {
    return { text: `${dateLabel} до ${time}`, urgency: "soon", active: true };
  }
  return { text: `${dateLabel} до ${time}`, urgency: "later", active: true };
}

export function dueSortKey(dueAt?: string | Date | null): number {
  const due = parseDue(dueAt);
  return due ? due.getTime() : Number.MAX_SAFE_INTEGER;
}

export function sortByDue<T>(items: T[], getDue: (item: T) => string | Date | null | undefined): T[] {
  return [...items].sort((a, b) => dueSortKey(getDue(a)) - dueSortKey(getDue(b)));
}

export function countUrgent<T>(items: T[], getDue: (item: T) => string | Date | null | undefined, now: Date = new Date()): number {
  return items.filter((item) => {
    const { urgency } = formatDue(getDue(item), now);
    return urgency === "overdue" || urgency === "today";
  }).length;
}
