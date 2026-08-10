// ─────────────────────────────────────────────────────────────────────────────
// Всплывающее окно события.
//
// Живёт в макете вкладок (app/(main)/_layout.tsx), а не на конкретном экране:
// медаль или заявка должны догнать ученика там, где он есть, а не ждать, пока
// он зайдёт в профиль.
//
// ── Четыре правила, из которых собрано поведение ────────────────────────────
// 1. Окно уходит само. Уведомление — не диалог, оно ничего не спрашивает.
//    Закрывать его руками каждый раз — работа, которую мы придумали читателю.
//
// 2. Подряд не больше трёх. Восемь окон друг за другом — это не уведомление, а
//    блокировка экрана.
//
// 3. НО лишние не выбрасываются. Раньше всё сверх трёх помечалось показанным и
//    не показывалось никогда: ученик получал пять медалей, видел две, а три
//    молча оказывались только в истории. Ровно это и выглядело как «уведомления
//    не приходят». Теперь лишние остаются непоказанными и всплывают позже —
//    после паузы или при следующем открытии приложения.
//
// 4. «Показано» ставится в момент ПОЯВЛЕНИЯ окна. Не при закрытии — иначе
//    перезагрузка страницы вернула бы то же окно снова. И не при постановке в
//    очередь — иначе перезагрузка между постановкой и показом теряет
//    уведомление совсем.
//
// ── Очередь в состоянии, а не в ref ─────────────────────────────────────────
// Изменение ref не вызывает перерисовку, поэтому эффект показа не запускался бы
// сам — раньше он срабатывал только потому, что рядом менялся unseen от
// преждевременной отметки. Это работало по совпадению; стоило убрать
// преждевременную отметку, и очередь перестала бы разбираться вовсе.
//
// Панель вкладок плавает поверх содержимого, поэтому и окно тоже абсолютное:
// сдвигать содержимое экрана ради временной плашки нельзя — вёрстка прыгнет.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { View, Text, Pressable, Animated, Easing, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { EventPlate, NotificationCenter } from "@/components/NotificationCenter";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { describeNotification } from "@/utils/notificationLook";
import { accents, radii } from "@/constants/theme";

const NATIVE_DRIVER = Platform.OS !== "web";

/** Сколько окно висит на экране. */
const SHOW_MS = 4500;

/** Пауза между окнами: без неё второе выезжает раньше, чем ушло первое. */
const GAP_MS = 350;

/** Сколько окон показываем подряд, прежде чем взять паузу. */
const MAX_IN_A_ROW = 3;

/**
 * Пауза после серии из MAX_IN_A_ROW окон.
 *
 * Нужна, чтобы «не больше трёх подряд» не превратилось в «остальное потеряли»:
 * очередь не выбрасывается, а ждёт. Сорок пять секунд — достаточно, чтобы
 * ученик успел вернуться к своему делу, и мало, чтобы новость не устарела.
 */
const BURST_PAUSE_MS = 45_000;

/**
 * Потолок очереди. Всё сверх остаётся непоказанным и придёт при следующем
 * открытии: держать в памяти сотню окон незачем, а терять их нельзя.
 */
const QUEUE_LIMIT = 8;

export function NotificationHost() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { unseen, markSeen } = useNotifications(true);

  const [queue, setQueue] = React.useState<AppNotification[]>([]);
  const [current, setCurrent] = React.useState<AppNotification | null>(null);
  const [centerOpen, setCenterOpen] = React.useState(false);
  const [focusId, setFocusId] = React.useState<number | null>(null);

  /** Что уже забрали в очередь: страховка от повторного попадания. */
  const taken = React.useRef<Set<number>>(new Set());
  /** Сколько окон показано в текущей серии. Дошло до предела — пауза. */
  const burst = React.useRef(0);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const slide = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  // Новые события → в очередь. Лишние НЕ помечаем показанными: они всплывут
  // позже, а не исчезнут (см. правило 3 в шапке).
  React.useEffect(() => {
    const free = QUEUE_LIMIT - queue.length - (current ? 1 : 0);
    if (free <= 0) return;

    const fresh = unseen.filter((n) => !taken.current.has(n.id)).slice(0, free);
    if (fresh.length === 0) return;

    for (const n of fresh) taken.current.add(n.id);
    setQueue((q) => [...q, ...fresh]);
  }, [unseen, queue.length, current]);

  const hide = React.useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.timing(slide, {
      toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE_DRIVER,
    }).start(() => setCurrent(null));
  }, [slide]);

  // Очередь → экран. Эффект срабатывает и когда окно закрылось (current стал
  // null), поэтому отдельного «показать следующее» не нужно.
  React.useEffect(() => {
    if (current) return;
    const next = queue[0];
    if (!next) return;

    // Серия закончилась — ждём дольше, а не выбрасываем остаток.
    const pause = burst.current >= MAX_IN_A_ROW;
    const timer = setTimeout(() => {
      if (pause) burst.current = 0;
      burst.current += 1;

      setQueue((q) => q.slice(1));
      setCurrent(next);
      // Отметка ровно в момент появления: см. правило 4 в шапке.
      markSeen([next.id]);

      slide.setValue(0);
      Animated.timing(slide, {
        toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER,
      }).start();
      hideTimer.current = setTimeout(() => hide(), SHOW_MS);
    }, pause ? BURST_PAUSE_MS : GAP_MS);

    return () => clearTimeout(timer);
  }, [current, queue, slide, hide, markSeen]);

  const openDetails = React.useCallback(() => {
    if (!current) return;
    setFocusId(current.id);
    setCenterOpen(true);
    hide();
  }, [current, hide]);

  const look = current ? describeNotification(current) : null;

  return (
    <>
      <NotificationCenter
        visible={centerOpen}
        focusId={focusId}
        onClose={() => { setCenterOpen(false); setFocusId(null); }}
      />

      {current && look && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: Math.max(insets.top, 10) + 8,
            left: 14,
            right: 14,
            zIndex: 900,
          }}
        >
          <Animated.View
            style={{
              opacity: slide,
              transform: [{
                translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-140, 0] }),
              }],
            }}
          >
            {/* Нижняя грань: та же физика, что у кнопок и панели вкладок. */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute", left: 0, right: 0, top: 6, bottom: -6,
                borderRadius: radii.lg, backgroundColor: look.edge, opacity: 0.5,
              }}
            />
            <Pressable
              onPress={openDetails}
              accessibilityRole="button"
              accessibilityLabel={`${look.title}. ${look.body}. Открыть подробности`}
              style={{
                flexDirection: "row", alignItems: "center", gap: 12,
                backgroundColor: colors.card,
                borderRadius: radii.lg,
                paddingVertical: 12, paddingHorizontal: 14,
                borderWidth: 1.5, borderColor: "rgba(99,102,241,0.22)",
                shadowColor: accents.indigoDeep,
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.3, shadowRadius: 22, elevation: 14,
              }}
            >
              <EventPlate notification={current} size={42} />

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 11.5, fontWeight: "800", color: colors.primary }} numberOfLines={1}>
                  {look.title}
                </Text>
                <Text
                  style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, marginTop: 2 }}
                  numberOfLines={2}
                >
                  {look.body}
                </Text>
              </View>

              {/* Крестик — для тех, кому окно мешает прямо сейчас. Отдельная
                  область нажатия, иначе закрытие открывало бы подробности. */}
              <Pressable
                onPress={hide}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Скрыть уведомление"
                style={{ padding: 4 }}
              >
                <Glyph name="close" size={18} color={colors.mutedForeground} />
              </Pressable>
            </Pressable>
          </Animated.View>
        </View>
      )}
    </>
  );
}

export default NotificationHost;
