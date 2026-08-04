// ─────────────────────────────────────────────────────────────────────────────
// Срок сдачи задания: пресеты, человеческий формат, сортировка.
//
// Срок хранится на назначении (assigned_tasks.due_at) и приходит клиенту
// ISO-строкой в UTC либо null. Всё преобразование в местное время и в текст
// живёт здесь, чтобы «сегодня до 20:00» на всех экранах считалось одинаково.
//
// Почему пресеты, а не полноценный date picker: срок ставит учитель на ходу,
// прямо в модалке отправки. «Сегодня / завтра / 3 дня / неделя» закрывают почти
// все случаи в один тап, а WheelDatePicker в проекте заточен под дату рождения
// (год-месяц-день с прокруткой лет) и для этого сценария избыточен.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Насколько срок горит. Используется для выбора цвета и значка:
 *   none     — срока нет, спокойная серая метка
 *   overdue  — просрочено, красный
 *   today    — сегодня, янтарный
 *   soon     — до недели, янтарный поспокойнее
 *   later    — дальше недели, нейтральный
 */
export type DueUrgency = "none" | "overdue" | "today" | "soon" | "later";

export interface DueInfo {
  /** Готовая подпись: «сегодня до 20:00», «через 3 дня», «просрочено на день». */
  text: string;
  urgency: DueUrgency;
  /** true — срок есть и он не прошёл. Удобно для «горит / не горит». */
  active: boolean;
}

/** Варианты срока в модалке отправки. days = null означает «без срока». */
export const DUE_PRESETS = [
  { key: "none", label: "Без срока", days: null },
  { key: "today", label: "Сегодня", days: 0 },
  { key: "tomorrow", label: "Завтра", days: 1 },
  { key: "days3", label: "3 дня", days: 3 },
  { key: "week", label: "Неделя", days: 7 },
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

/** Полночь указанной даты по местному времени: база для счёта «в днях». */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * ISO-строка срока по выбранному пресету.
 *
 * Время ставим на 23:59 местных: «сегодня» должно означать весь сегодняшний
 * день, а не момент нажатия кнопки — иначе задание становится просроченным
 * сразу после отправки.
 */
export function dueDateFromPreset(key: DuePresetKey, now: Date = new Date()): string | null {
  const preset = DUE_PRESETS.find((p) => p.key === key);
  if (!preset || preset.days === null) return null;
  const date = new Date(now);
  date.setDate(date.getDate() + preset.days);
  date.setHours(23, 59, 0, 0);
  return date.toISOString();
}

/** Разбор значения из API. Мусор и пустая строка считаются «срока нет». */
function parseDue(dueAt?: string | Date | null): Date | null {
  if (!dueAt) return null;
  const date = dueAt instanceof Date ? dueAt : new Date(dueAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Человеческая подпись срока.
 *
 * Считаем разницу в календарных днях, а не в часах: «завтра» должно оставаться
 * «завтра» и в 9 утра, и в 11 вечера. Само сравнение «просрочено или нет» идёт
 * по точному времени, иначе срок «сегодня 23:59» посреди дня выглядел бы
 * пропущенным.
 */
export function formatDue(dueAt?: string | Date | null, now: Date = new Date()): DueInfo {
  const due = parseDue(dueAt);
  if (!due) return { text: "без срока", urgency: "none", active: false };

  const diffDays = Math.round((startOfDay(due) - startOfDay(now)) / 86400000);

  if (due.getTime() < now.getTime()) {
    if (diffDays === 0) return { text: "просрочено сегодня", urgency: "overdue", active: false };
    const late = Math.abs(diffDays);
    return {
      text: `просрочено на ${late} ${pluralRu(late, "день", "дня", "дней")}`,
      urgency: "overdue",
      active: false,
    };
  }

  const time = `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`;
  if (diffDays === 0) return { text: `сегодня до ${time}`, urgency: "today", active: true };
  if (diffDays === 1) return { text: "завтра", urgency: "soon", active: true };
  if (diffDays <= 7) {
    return { text: `через ${diffDays} ${pluralRu(diffDays, "день", "дня", "дней")}`, urgency: "soon", active: true };
  }
  return { text: `до ${due.getDate()} ${MONTHS_SHORT[due.getMonth()]}`, urgency: "later", active: true };
}

/**
 * Ключ сортировки: чем меньше, тем выше в списке. Задания без срока уходят
 * в конец — они никогда не горят, и держать их сверху бессмысленно.
 */
export function dueSortKey(dueAt?: string | Date | null): number {
  const due = parseDue(dueAt);
  return due ? due.getTime() : Number.MAX_SAFE_INTEGER;
}

/**
 * Сортировка списка по сроку: просроченное сверху, затем ближайшее, в конце —
 * без срока. Исходный массив не меняется: он приходит прямо из состояния.
 */
export function sortByDue<T>(items: T[], getDue: (item: T) => string | Date | null | undefined): T[] {
  return [...items].sort((a, b) => dueSortKey(getDue(a)) - dueSortKey(getDue(b)));
}

/** Сколько заданий в списке просрочено или горит сегодня. Для сводки в шапке. */
export function countUrgent<T>(items: T[], getDue: (item: T) => string | Date | null | undefined, now: Date = new Date()): number {
  return items.filter((item) => {
    const { urgency } = formatDue(getDue(item), now);
    return urgency === "overdue" || urgency === "today";
  }).length;
}
