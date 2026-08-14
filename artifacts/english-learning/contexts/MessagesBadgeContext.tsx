// Значок непрочитанных сообщений на кнопке чата.
//
// Раньше о новом сообщении узнавали, только открыв конкретную переписку —
// никакого сигнала снаружи не было. Учителю приходилось «тыкать и искать»,
// кто написал, по каждому ученику и другу по очереди. Сервер при этом уже
// считал непрочитанные на каждую беседу отдельно (GET /api/messages/
// conversations → unread) — просто это нигде не показывалось.
//
// Здесь тот же приём, что у CalendarBadgeContext: контекст один на всё
// приложение, опрашивает сервер сам, а экраны просто читают готовое число —
// вместо того чтобы каждый список (Друзья, Ученики) заново дёргал сервер.
//
// Беседы с друзьями и с учениками лежат в одной и той же conversationsTable
// (см. api-server/src/routes/messaging.ts — chat разрешён между любыми
// связанными пользователями), поэтому один и тот же счётчик покрывает оба
// списка сразу: сообщение от ученика так же засветит значок, как и от друга.
//
// Своего «прочитано/непрочитано» состояния контекст не хранит и не обязан:
// как только собеседника открывают (GET /messages/with/:id помечает его
// сообщения readAt), следующий опрос сам вернёт ноль. refresh() существует
// только для того, чтобы не ждать эти до 15 секунд опроса — экран чата
// вызывает его сразу после открытия переписки.
import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import authStorage from "@/utils/authStorage";

const POLL_MS = 15_000;

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

type ConversationSummary = {
  conversationId: number;
  user: { id: number };
  unread: number;
};

async function fetchConversations(): Promise<ConversationSummary[]> {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE_URL}/api/messages/conversations`, {
    headers: { Authorization: `Bearer ${token ?? ""}` },
    // Без no-store веб-сборка может отдать закэшированный ответ на повторный
    // опрос, и новое сообщение не засветит значок — тот же приём, что в
    // apiFetch чата (app/(main)/chat/[userId].tsx).
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

interface MessagesBadgeContextValue {
  /** Сумма непрочитанных по всем беседам сразу — число на иконке вкладки. */
  unreadTotal: number;
  /** Непрочитанные по каждому собеседнику — точка на конкретной карточке. */
  unreadByUser: Record<number, number>;
  /** Обновить сейчас же, не дожидаясь опроса — вызывает экран чата при открытии. */
  refresh: () => void;
}

const MessagesBadgeContext = createContext<MessagesBadgeContextValue>({
  unreadTotal: 0,
  unreadByUser: {},
  refresh: () => {},
});

export function MessagesBadgeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Вкладка «Друзья» — единственная точка входа с этим значком — видна
  // только учителю/админу (см. app/(main)/_layout.tsx); опрашивать сервер
  // для остальных ролей незачем, у них нет экрана, который бы это показал.
  const enabled = isTeacherOrAdmin(user?.role ?? "");

  const [unreadByUser, setUnreadByUser] = useState<Record<number, number>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!enabled) { setUnreadByUser({}); return; }
    const rows = await fetchConversations().catch(() => []);
    const map: Record<number, number> = {};
    for (const row of rows) {
      if (row.unread > 0) map[row.user.id] = row.unread;
    }
    setUnreadByUser(map);
  }, [enabled]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  const unreadTotal = Object.values(unreadByUser).reduce((sum, n) => sum + n, 0);

  return (
    <MessagesBadgeContext.Provider value={{ unreadTotal, unreadByUser, refresh: load }}>
      {children}
    </MessagesBadgeContext.Provider>
  );
}

export function useMessagesBadge() {
  return useContext(MessagesBadgeContext);
}
