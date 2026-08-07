// ─────────────────────────────────────────────────────────────────────────────
// История уведомлений: лист, который открывается по колокольчику.
//
// Один лист работает в двух режимах — список и подробности. Отдельный экран для
// подробностей заводить незачем: из него всегда возвращаются назад в список,
// а лист умеет это без навигации и без нового маршрута.
//
// ── Как устроена строка ─────────────────────────────────────────────────────
// Сверху мелким цветным текстом — ТИП события («Новая медаль», «Новое задание»),
// под ним крупно — СУТЬ («Первый шаг», название задания). Наоборот было бы
// хуже: тип у соседних строк часто повторяется, и одинаковые жирные заголовки
// подряд не дают отличить одно событие от другого.
//
// Дата и время стоят у каждой строки, а не только в подробностях: «когда это
// было» — первый вопрос к любой истории.
//
// Непрочитанное помечено точкой и светлой подложкой. Открытие строки гасит
// счётчик у колокольчика.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import {
  View, Text, Modal, Pressable, ScrollView, Image, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { describeNotification, formatNotificationTime } from "@/utils/notificationLook";
import { accents, radii } from "@/constants/theme";

/** Значок события в градиентной плашке с нижней гранью — как везде в продукте. */
function EventPlate({
  notification, size = 44,
}: { notification: AppNotification; size?: number }) {
  const look = describeNotification(notification);
  const edge = Math.max(3, Math.round(size * 0.11));

  return (
    <View style={{ width: size, height: size + edge }}>
      <View style={{
        position: "absolute", left: 0, top: edge, width: size, height: size,
        borderRadius: radii.sm, backgroundColor: look.edge, opacity: 0.55,
      }} />
      <LinearGradient
        colors={look.gradient as unknown as string[]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{
          width: size, height: size, borderRadius: radii.sm,
          alignItems: "center", justifyContent: "center",
          borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)",
          overflow: "hidden",
        }}
      >
        {look.image
          ? <Image source={look.image} style={{ width: size, height: size }} resizeMode="contain" />
          : <Glyph name={look.icon} size={Math.round(size * 0.46)} color="#ffffff" />}
      </LinearGradient>
    </View>
  );
}

function Row({
  notification, colors, onPress,
}: { notification: AppNotification; colors: any; onPress: () => void }) {
  const look = describeNotification(notification);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${look.title}. ${look.body}`}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "flex-start", gap: 12,
        paddingVertical: 13, paddingHorizontal: 14,
        borderRadius: radii.md,
        backgroundColor: notification.read ? colors.card : colors.primary + "12",
        borderWidth: 1,
        borderColor: notification.read ? colors.border : colors.primary + "33",
        marginBottom: 10,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <EventPlate notification={notification} size={42} />

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
        <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 5 }}>
          {formatNotificationTime(notification.createdAt)}
        </Text>
      </View>

      {!notification.read && (
        <View style={{
          width: 9, height: 9, borderRadius: 5, marginTop: 6,
          backgroundColor: colors.primary,
        }} />
      )}
    </Pressable>
  );
}

function Details({
  notification, colors,
}: { notification: AppNotification; colors: any }) {
  const look = describeNotification(notification);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
      <View style={{ alignItems: "center", marginTop: 6, marginBottom: 18 }}>
        <EventPlate notification={notification} size={92} />
      </View>

      <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary, textAlign: "center" }}>
        {look.title}
      </Text>
      <Text style={{
        fontSize: 21, fontWeight: "900", letterSpacing: -0.5,
        color: colors.foreground, textAlign: "center", marginTop: 6,
      }}>
        {look.body}
      </Text>
      <Text style={{ fontSize: 12.5, color: colors.mutedForeground, textAlign: "center", marginTop: 8 }}>
        {formatNotificationTime(notification.createdAt)}
      </Text>

      {!!look.detail && (
        <View style={{
          marginTop: 18, padding: 16, borderRadius: radii.md,
          backgroundColor: colors.accent,
          borderWidth: 1, borderColor: colors.border,
        }}>
          <Text style={{ fontSize: 15, lineHeight: 23, color: colors.foreground }}>
            {look.detail}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

export interface NotificationCenterProps {
  visible: boolean;
  onClose: () => void;
  /** Открыть сразу подробности этого уведомления (переход из всплывающего окна). */
  focusId?: number | null;
}

export function NotificationCenter({ visible, onClose, focusId }: NotificationCenterProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { items, unreadCount, loading, markRead, markAllRead } = useNotifications(visible);
  const [openId, setOpenId] = React.useState<number | null>(null);

  // Открыли из всплывающего окна — сразу показываем подробности этого события.
  React.useEffect(() => {
    if (!visible) return;
    setOpenId(focusId ?? null);
  }, [visible, focusId]);

  const selected = React.useMemo(
    () => items.find((n) => n.id === openId) ?? null,
    [items, openId],
  );

  const open = React.useCallback((n: AppNotification) => {
    setOpenId(n.id);
    if (!n.read) markRead([n.id]);
  }, [markRead]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }}>
        {/* Тап по затемнению закрывает лист: так ведут себя все листы в проекте. */}
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Закрыть" />

        <View style={{
          backgroundColor: colors.background,
          borderTopLeftRadius: radii.lg,
          borderTopRightRadius: radii.lg,
          paddingHorizontal: 18,
          paddingTop: 16,
          paddingBottom: Math.max(insets.bottom, 14) + 10,
          maxHeight: "86%",
        }}>
          {/* Шапка: назад из подробностей, заголовок, «прочитать все», закрыть. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
            {selected ? (
              <Pressable
                onPress={() => setOpenId(null)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Назад к списку"
                style={{ transform: [{ rotate: "180deg" }], padding: 2 }}
              >
                <Glyph name="chevron" size={22} color={colors.foreground} />
              </Pressable>
            ) : null}

            <Text style={{ flex: 1, fontSize: 19, fontWeight: "900", color: colors.foreground }}>
              {selected ? "Уведомление" : "Уведомления"}
            </Text>

            {!selected && unreadCount > 0 && (
              <Pressable onPress={markAllRead} hitSlop={8} accessibilityRole="button">
                <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary }}>
                  Прочитать все
                </Text>
              </Pressable>
            )}

            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Закрыть">
              <Glyph name="close" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {selected ? (
            <Details notification={selected} colors={colors} />
          ) : loading && items.length === 0 ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
          ) : items.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 44, gap: 12 }}>
              <Glyph name="tray" size={42} color={colors.mutedForeground} />
              <Text style={{
                fontSize: 14, color: colors.mutedForeground,
                textAlign: "center", lineHeight: 20, paddingHorizontal: 20,
              }}>
                Пока пусто. Здесь будут медали, задачи дня, задания от учителя и заявки в друзья.
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              {items.map((n) => (
                <Row key={n.id} notification={n} colors={colors} onPress={() => open(n)} />
              ))}
              <Text style={{
                fontSize: 11.5, color: colors.mutedForeground,
                textAlign: "center", marginTop: 4, marginBottom: 8,
              }}>
                Показаны последние события
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

export { EventPlate };
export default NotificationCenter;
