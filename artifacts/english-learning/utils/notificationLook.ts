// ─────────────────────────────────────────────────────────────────────────────
// Как выглядит и как называется уведомление.
//
// Сервер присылает готовый текст для всего, кроме медалей: у медали он знает
// только achievementId. Название, описание и картинку подставляет каталог
// constants/achievements.ts — тот же, по которому рисуется витрина наград.
// Копия каталога из пятидесяти позиций на сервере разъехалась бы с этой при
// первой же правке текста.
//
// Дата и время форматируются здесь, а не на сервере: часовой пояс знает
// устройство, а сервер живёт в UTC.
// ─────────────────────────────────────────────────────────────────────────────

import { ACHIEVEMENTS } from "@/constants/achievements";
import { accents, gradients } from "@/constants/theme";
import type { GlyphName } from "@/components/ui/Glyph";
import type { AppNotification, NotificationKind } from "@/hooks/useNotifications";

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export interface NotificationLook {
  icon: GlyphName;
  gradient: readonly string[];
  /** Нижняя грань плашки: тёмная версия градиента. */
  edge: string;
  title: string;
  body: string;
  detail: string;
  /** Рендер медали, если событие — награда. */
  image?: any;
}

/**
 * Значок и цвет по типу события.
 *
 * Цвета не случайные: задача дня — фиолетовый бренда, цель дня и задание —
 * тёплые (это про награду и про срок), медаль — маджента, как у сложных медалей,
 * заявки — фиолетовый градиент наград. Так тип события считывается ещё до
 * чтения текста.
 *
 * Три последних вида — учительские: сданная работа, запись в календаре и
 * принятое приглашение. У них своя гамма, чтобы события «про учеников» не
 * путались с событиями «про меня».
 */
const KIND_LOOK: Record<NotificationKind, { icon: GlyphName; gradient: readonly string[]; edge: string }> = {
  quest:           { icon: "check",    gradient: gradients.action,     edge: accents.indigoDeep },
  goal:            { icon: "trophy",   gradient: gradients.medalEasy,  edge: "#b45309" },
  achievement:     { icon: "medal",    gradient: gradients.medalHard,  edge: "#581c87" },
  friend_request:  { icon: "userPlus", gradient: gradients.reward,     edge: accents.violetDeep },
  teacher_request: { icon: "cap",      gradient: gradients.reward,     edge: accents.violetDeep },
  assignment:      { icon: "book",     gradient: gradients.fire,       edge: "#b45309" },
  submission:      { icon: "check",    gradient: gradients.progress,   edge: accents.violetDeep },
  booking:         { icon: "calendar", gradient: gradients.action,     edge: accents.indigoDeep },
  student_joined:  { icon: "users",    gradient: gradients.reward,     edge: accents.violetDeep },
};

const FALLBACK_LOOK = { icon: "spark" as GlyphName, gradient: gradients.action, edge: accents.indigoDeep };

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Когда пришло уведомление: «Сегодня, 16:45», «Вчера, 09:12», «3 августа, 20:30».
 *
 * «Сегодня» и «вчера» вместо даты не для красоты: свежие события в ленте
 * составляют большинство, и сравнивать «7 августа» с сегодняшним числом
 * читателю приходилось бы в уме.
 */
export function formatNotificationTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (sameDay(d, now)) return `Сегодня, ${hhmm(d)}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return `Вчера, ${hhmm(d)}`;

  const year = d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${hhmm(d)}`;
}

/** Срок сдачи задания одной строкой. Пусто, если срока нет. */
export function formatDueDate(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (sameDay(d, now)) return `Сдать сегодня до ${hhmm(d)}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(d, tomorrow)) return `Сдать завтра до ${hhmm(d)}`;
  const year = d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `Сдать до ${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${hhmm(d)}`;
}

/** Текст и оформление одного события. */
export function describeNotification(n: AppNotification): NotificationLook {
  const base = KIND_LOOK[n.kind] ?? FALLBACK_LOOK;

  if (n.kind === "achievement") {
    const id = typeof n.meta?.achievementId === "string" ? n.meta.achievementId : "";
    const medal = ACHIEVEMENT_BY_ID.get(id);
    if (medal) {
      return {
        ...base,
        title: n.title,
        body: medal.title,
        detail: medal.description,
        image: medal.image,
      };
    }
  }

  if (n.kind === "assignment") {
    const due = formatDueDate(n.meta?.dueAt);
    return {
      ...base,
      title: n.title,
      body: n.body,
      detail: due ? `${n.detail}\n${due}` : n.detail,
    };
  }

  // Работа ждёт проверки — не рядовая сдача, а дело: тёплая гамма, как у
  // метки «на проверке» в списке ответов.
  if (n.kind === "submission" && n.title.includes("ждёт проверки")) {
    return {
      ...base,
      icon: "clock",
      gradient: gradients.fire,
      edge: "#b45309",
      title: n.title,
      body: n.body,
      detail: n.detail,
    };
  }

  return { ...base, title: n.title, body: n.body, detail: n.detail };
}
