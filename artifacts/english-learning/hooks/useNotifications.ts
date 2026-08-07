// ─────────────────────────────────────────────────────────────────────────────
// Лента уведомлений: загрузка и отметки.
//
// ОДИН ЗАПРОС НА ВСЁ ПРИЛОЖЕНИЕ. Ключ react-query общий, поэтому колокольчик в
// профиле и всплывающие окна в макете вкладок делят одну загрузку. Иначе два
// компонента опрашивали бы сервер каждый по разу, и счётчики у них разъезжались
// бы на время между опросами.
//
// ПОКАЗ И ПРОЧТЕНИЕ — РАЗНЫЕ ВЕЩИ.
//   seen — всплывающее окно уже показывали. Ставится автоматически, как только
//          окно появилось на экране;
//   read — ученик открыл уведомление. Гасит счётчик у колокольчика.
// Одним флагом это не описать: либо окно всплывает при каждом обновлении
// экрана, либо счётчик гаснет сам собой, ничего не показав.
//
// Отметки применяются к локальному кэшу СРАЗУ, не дожидаясь ответа: счётчик
// обязан гаснуть в момент нажатия. Пришедший ответ заменяет ленту целиком — он
// и есть источник правды.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useFlashcards";

export type NotificationKind =
  | "quest"
  | "goal"
  | "achievement"
  | "friend_request"
  | "teacher_request"
  | "assignment";

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  detail: string;
  /** ISO-строка. Форматируется на устройстве: оно знает часовой пояс. */
  createdAt: string;
  read: boolean;
  seen: boolean;
  meta: Record<string, any>;
}

export interface NotificationFeed {
  items: AppNotification[];
  unreadCount: number;
  /** Уведомления, для которых всплывающее окно ещё не показывали. */
  unseen: AppNotification[];
}

const EMPTY: NotificationFeed = { items: [], unreadCount: 0, unseen: [] };

/** Как часто спрашивать ленту, пока приложение открыто. */
const POLL_MS = 60_000;

export const NOTIFICATIONS_KEY = ["notifications"] as const;

export function useNotifications(enabled = true) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => apiFetch<NotificationFeed>("/api/notifications"),
    enabled,
    refetchInterval: enabled ? POLL_MS : false,
    // Переход между вкладками не должен дёргать сервер: события не настолько
    // срочные, чтобы перезапрашивать их каждые несколько секунд.
    staleTime: 20_000,
  });

  const feed: NotificationFeed = query.data ?? EMPTY;

  /** Ответ сервера — источник правды, кладём его целиком. */
  const apply = React.useCallback((next: NotificationFeed) => {
    if (!next || !Array.isArray(next.items)) return;
    qc.setQueryData(NOTIFICATIONS_KEY, next);
  }, [qc]);

  /** Мгновенная отметка в кэше: интерфейс не ждёт сеть. */
  const patchLocal = React.useCallback(
    (hit: (n: AppNotification) => boolean, change: { read?: boolean; seen?: boolean }) => {
      qc.setQueryData<NotificationFeed>(NOTIFICATIONS_KEY, (old) => {
        if (!old) return old;
        const items = old.items.map((n) => (hit(n) ? { ...n, ...change } : n));
        return {
          items,
          unreadCount: items.filter((n) => !n.read).length,
          unseen: items.filter((n) => !n.seen),
        };
      });
    },
    [qc],
  );

  const markSeen = React.useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    const set = new Set(ids);
    patchLocal((n) => set.has(n.id), { seen: true });
    apiFetch<NotificationFeed>("/api/notifications/seen", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }).then(apply).catch(() => { /* отметка не критична: покажем окно ещё раз */ });
  }, [patchLocal, apply]);

  const markRead = React.useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    const set = new Set(ids);
    patchLocal((n) => set.has(n.id), { read: true, seen: true });
    apiFetch<NotificationFeed>("/api/notifications/read", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }).then(apply).catch(() => { /* счётчик вернётся при следующей загрузке */ });
  }, [patchLocal, apply]);

  const markAllRead = React.useCallback(() => {
    patchLocal(() => true, { read: true, seen: true });
    apiFetch<NotificationFeed>("/api/notifications/read", {
      method: "POST",
      body: JSON.stringify({ all: true }),
    }).then(apply).catch(() => { /* см. выше */ });
  }, [patchLocal, apply]);

  return {
    items: feed.items,
    unreadCount: feed.unreadCount,
    unseen: feed.unseen,
    loading: query.isLoading,
    refresh: query.refetch,
    markSeen,
    markRead,
    markAllRead,
  };
}

export default useNotifications;
