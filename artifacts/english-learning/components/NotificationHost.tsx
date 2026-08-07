// ─────────────────────────────────────────────────────────────────────────────
// Всплывающее окно события.
//
// Живёт в макете вкладок (app/(main)/_layout.tsx), а не на конкретном экране:
// медаль или заявка должны догнать ученика там, где он есть, а не ждать, пока
// он зайдёт в профиль.
//
// ── Три правила, из которых собрано поведение ───────────────────────────────
// 1. Окно уходит само. Уведомление — не диалог, оно ничего не спрашивает.
//    Закрывать его руками каждый раз — работа, которую мы придумали читателю.
// 2. Не больше трёх подряд. Если за раз пришло восемь событий, восемь окон
//    подряд — это уже не уведомление, а блокировка экрана. Лишние сразу
//    помечаются показанными и остаются только в истории.
// 3. «Показано» ставится при ПОЯВЛЕНИИ, а не при закрытии. Иначе перезагрузка
//    страницы в середине показа вернула бы то же самое окно снова.
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

/** Сколько окон показываем подряд. Остальное — только в истории. */
const MAX_IN_A_ROW = 3;

export function NotificationHost() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { unseen, markSeen } = useNotifications(true);

  const [current, setCurrent] = React.useState<AppNotification | null>(null);
  const [centerOpen, setCenterOpen] = React.useState(false);
  const [focusId, setFocusId] = React.useState<number | null>(null);

  const queue = React.useRef<AppNotification[]>([]);
  /** Что уже забрали в очередь: страховка от повторного попадания. */
  const taken = React.useRef<Set<number>>(new Set());
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const slide = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (nextTimer.current) clearTimeout(nextTimer.current);
  }, []);

  // Новые события → в очередь. Лишние гасим сразу: они уже в истории.
  React.useEffect(() => {
    const fresh = unseen.filter((n) => !taken.current.has(n.id));
    if (fresh.length === 0) return;

    for (const n of fresh) taken.current.add(n.id);

    const free = Math.max(0, MAX_IN_A_ROW - queue.current.length - (current ? 1 : 0));
    const show = fresh.slice(0, free);
    const skip = fresh.slice(free);

    queue.current.push(...show);
    if (skip.length > 0) markSeen(skip.map((n) => n.id));
    if (show.length > 0) markSeen(show.map((n) => n.id));
  }, [unseen, current, markSeen]);

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
    if (queue.current.length === 0) return;

    if (nextTimer.current) clearTimeout(nextTimer.current);
    nextTimer.current = setTimeout(() => {
      const next = queue.current.shift();
      if (!next) return;
      setCurrent(next);
      slide.setValue(0);
      Animated.timing(slide, {
        toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER,
      }).start();
      hideTimer.current = setTimeout(() => hide(), SHOW_MS);
    }, GAP_MS);
  }, [current, unseen, slide, hide]);

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
