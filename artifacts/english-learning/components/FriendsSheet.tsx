// ─────────────────────────────────────────────────────────────────────────────
// Лист «Друзья»: учитель, родители и друзья ученика + добавление по коду.
//
// Раньше это была плоская модалка внутри profile.tsx: крестик в углу, семь
// одинаковых строк подряд и «0 очков» у половины списка. Разобрать, кто здесь
// учитель, а кто одноклассник, можно было только по мелкой подписи.
//
// ── Группы вместо ровного списка ────────────────────────────────────────────
// Учитель, родители, входящие запросы и друзья — разные отношения, а не «семь
// контактов». Учитель и родитель появляются без запроса и их нельзя удалить
// отсюда, запрос требует ответа прямо сейчас, друг — просто друг. Поэтому
// список разбит заголовками. Входящие идут первыми: это единственное, что
// ждёт действия.
//
// Родителей ученик раньше не видел вообще: связь создаёт родитель по коду, и в
// списке связей его просто не было — как будто он не в приложении, хотя он
// смотрит прогресс. Теперь у него своя ветка, как у учителя
// (GET /connections/student/parents).
//
// ── Псевдоним у всех, кто не набирает очки ──────────────────────────────────
// Под именем учителя и родителя стоит @псевдоним. Раньше у родителя там была
// фраза «Видит твой прогресс» — она объясняла роль, которую и так объявляет
// плашка «Родитель», а по-настоящему полезного (как его найти и не спутать с
// однофамильцем) в строке не оставалось. Псевдоним уникален, поэтому он и
// стоит в строке; у друзей его место занимают очки.
//
// ── Один человек — одна строка ──────────────────────────────────────────────
// Родитель или учитель может вдобавок числиться в друзьях: /connections/friends
// отдаёт все дружбы независимо от роли. Из-за этого Ольга-родитель попадала в
// список дважды — отдельной веткой и среди друзей. Роль важнее дружбы, поэтому
// такие люди показываются только в своей ветке, а из «Друзей» вычитаются.
//
// ── Очки шкалой ─────────────────────────────────────────────────────────────
// «2480 очков» само по себе ничего не значит: непонятно, это много или мало.
// Шкала считается от лидера списка, поэтому своё место в ряду видно раньше,
// чем прочитаны цифры. У тех, кто ещё не начинал, шкалы нет вовсе: пустая
// полоска выглядит как поражение, а человек просто новенький.
//
// Очки есть только у друзей. У учителя и родителя их не бывает — они не учат
// язык, и строка про очки в их карточке была бы неправдой.
//
// ── Пол неизвестен ──────────────────────────────────────────────────────────
// В базе пола нет, а «Ещё не начинал заниматься» про Дашу читается как ошибка.
// Поэтому все подписи о людях — в форме «начинал(а)»: скобка некрасива, но
// честнее, чем угаданный род.
//
// ── Заголовок листа ─────────────────────────────────────────────────────────
// Рядом с «Друзья» стоит счётчик людей — и только на вкладке списка. На
// вкладке добавления там раньше висело слово «добавить», дублировавшее
// подсвеченную кнопку переключателя под заголовком: одно и то же слово в двух
// строках подряд, причём в позиции, где ждёшь количество.
//
// ── Кнопка чата на каждой строке ─────────────────────────────────────────────
// Раньше нажатие на строку открывало только профиль человека — написать ему
// можно было лишь зайдя в профиль и разыскивая там кнопку сообщения. Теперь
// рядом с учителем, родителем и каждым принятым другом стоит своя кнопка чата,
// а точка на ней загорается, если этот человек написал что-то ещё не открытое
// (MessagesBadgeContext — тот же источник, что у вкладки «Друзья» и списка
// учеников на стороне учителя). У входящих и исходящих заявок кнопки нет:
// переписываться пока не с кем, дружба ещё не подтверждена.
//
// ── Удаление ────────────────────────────────────────────────────────────────
// Кнопка удаления — красный кружок в строке друга, а не серый значок рядом с
// шевроном: серый терялся, и было непонятно, чем вообще убирают из друзей.
// Подтверждение раскрывается прямо под строкой: отдельное окно поверх окна —
// лишний слой ради одного вопроса, а удаление без вопроса слишком легко задеть
// пальцем при прокрутке.
//
// ── Карточка кода ───────────────────────────────────────────────────────────
// Код набран белым по фиолетовой заливке. Прошлый вариант был бледной
// подложкой с тёмными буквами: код сливался с фоном листа и не читался как
// главное на экране. Здесь он единственное, ради чего вкладку открывают, —
// значит, должен быть самым контрастным пятном.
//
// ── Закрытие ────────────────────────────────────────────────────────────────
// Одна липкая кнопка «Закрыть» поверх листа, прижата к низу. Крестика нет.
// Под кнопкой не белая полоса-подвал, а затухание в фон: полоса перекрывала
// последнюю строку списка.
//
// ── ГРАБЛИ ──────────────────────────────────────────────────────────────────
// 1. НЕ вкладывать <Text> в <Text>: в Safari это роняет весь экран целиком
//    («Cannot set indexed properties on this object»). Имя и плашка роли —
//    два соседних Text во View с flexDirection: "row".
// 2. useNativeDriver только не в вебе: там нативного драйвера нет, и
//    свёрнутая вкладка замораживает requestAnimationFrame.
// 3. Шкала растёт ШИРИНОЙ в процентах с useNativeDriver: false — так же, как
//    во всех остальных карточках проекта. Вариант со scaleX выглядит
//    заманчивее (нативный драйвер), но требует transformOrigin, который в
//    react-native-web ведёт себя непредсказуемо: полоса растёт от центра.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, Modal, Pressable, ScrollView, TextInput, Platform, StyleSheet,
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Clipboard,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton } from "@/components/ui/GameKit";
import authStorage from "@/utils/authStorage";
import { accents, radii, timing } from "@/constants/theme";
import { useMessagesBadge } from "@/contexts/MessagesBadgeContext";

const NATIVE_DRIVER = Platform.OS !== "web";

/** Нижняя грань строки и глубина проседания. */
const EDGE = 4;
/** Грань переключателя: он мельче строк. */
const SEG_EDGE = 4;

/** Липкая кнопка: высота вместе с гранью и растяжка над ней. */
const STICKY_H = 62;
const STICKY_FADE = 28;

/** Ступенька появления строк. Суммарно не длиннее полусекунды. */
const STEP_MS = 55;
const RISE_MS = 420;
const GROW_MS = 780;

/** Длина кода приглашения. */
const CODE_LEN = 6;

/** Пол в базе не хранится, поэтому род не угадываем. */
const NOT_STARTED = "Ещё не начинал(а) заниматься";

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Ошибка сервера");
  return data;
}

export type FriendRow = {
  friendshipId: number;
  user: {
    id: number; name: string; username: string;
    avatarEmoji: string | null; avatarColor: string | null; avatarUrl?: string | null;
    totalPoints: number; isOnline?: boolean;
  };
  status: "pending" | "accepted";
  direction: "sent" | "received";
};

/** Учитель или родитель: связь без подтверждения и без очков. */
export type ConnectionItem = {
  id: number; name: string; username: string;
  avatarEmoji: string | null; avatarColor: string | null; avatarUrl?: string | null;
  role: string; isOnline?: boolean;
};

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/**
 * Подпись под именем человека без очков: псевдоним, а при наличии — ещё и «в
 * сети». Псевдоним нужен, чтобы человека можно было найти и не спутать с
 * однофамильцем; роль объявляет плашка рядом с именем.
 */
function handleNote(username: string, online?: boolean): string {
  const at = `@${username}`;
  return online ? `${at} · в сети` : at;
}

// ── Заголовок группы ────────────────────────────────────────────────────────

function GroupLabel({ title, count }: { title: string; count?: number }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginTop: 20, marginBottom: 10 }}>
      <Text style={{
        fontSize: 10.5, fontWeight: "900", letterSpacing: 1.1,
        textTransform: "uppercase", color: colors.mutedForeground,
      }}>
        {title}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      {count !== undefined && (
        <Text style={{
          fontSize: 10.5, fontWeight: "900", color: colors.primary,
          fontVariant: ["tabular-nums"],
        }}>
          {count}
        </Text>
      )}
    </View>
  );
}

// ── Шкала очков ─────────────────────────────────────────────────────────────

/**
 * Полоса, растущая от нуля.
 *
 * Ширина в процентах и useNativeDriver: false — тот же приём, что во всех
 * остальных карточках. Нативный драйвер ширину не анимирует ни на одной
 * платформе, а трюк со scaleX требует transformOrigin, который в вебе
 * отрабатывает не везде и растягивает полосу от центра.
 */
function GrowBar({ ratio, color, delay }: { ratio: number; color: string; delay: number }) {
  const colors = useColors();
  const grow = useRef(new Animated.Value(0)).current;
  const percent = Math.max(4, Math.min(100, Math.round(ratio * 100)));

  useEffect(() => {
    grow.setValue(0);
    const anim = Animated.timing(grow, {
      toValue: 1, duration: GROW_MS, delay,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [percent, delay, grow]);

  return (
    <View style={{
      height: 5, borderRadius: radii.pill, backgroundColor: colors.muted,
      marginTop: 7, overflow: "hidden",
    }}>
      <Animated.View style={{
        height: "100%", borderRadius: radii.pill, backgroundColor: color,
        width: grow.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${percent}%`] }),
      }} />
    </View>
  );
}

// ── Кнопка чата ─────────────────────────────────────────────────────────────
//
// Отдельная от шеврона/удаления: тап по ней открывает переписку, тап по
// остальной строке — профиль. Точка непрочитанного — тот же приём, что на
// кнопке «Чат» вкладки «Друзья» учителя (app/(main)/friends.tsx).
function ChatButton({ onPress, unread }: { onPress: () => void; unread?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ position: "relative" }}>
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Открыть чат"
        style={({ pressed }) => ({
          width: 34, height: 34, borderRadius: 12,
          alignItems: "center", justifyContent: "center",
          backgroundColor: colors.primary + "14",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Glyph name="chat" size={16} color={colors.primary} />
      </Pressable>
      {unread && (
        <View style={{
          position: "absolute", top: -3, right: -3,
          width: 11, height: 11, borderRadius: 6,
          backgroundColor: "#e11d48",
          borderWidth: 2, borderColor: colors.card,
        }} />
      )}
    </View>
  );
}

// ── Строка человека ─────────────────────────────────────────────────────────

type PillTone = "friend" | "tutor" | "parent";

function PersonRow({
  name, emoji, color, avatarUrl, online, note, points, ratio,
  pill, pillTone = "friend", index, onPress, onRemove, removeOpen, leader,
  onChat, chatUnread,
}: {
  name: string;
  emoji: string | null;
  color: string;
  avatarUrl?: string | null;
  online?: boolean;
  note: string;
  /** Очки. undefined или 0 — строка без шкалы (учитель, родитель, новичок). */
  points?: number;
  /** Доля от лидера 0…1. */
  ratio?: number;
  pill?: string;
  pillTone?: PillTone;
  index: number;
  onPress?: () => void;
  onRemove?: () => void;
  /** Подтверждение раскрыто: кнопка подсвечена, чтобы связь была видна. */
  removeOpen?: boolean;
  /** Первое место: шкала золотая. */
  leader?: boolean;
  /** Открыть чат с этим человеком. Нет — кнопки чата на строке не будет
      (входящие/исходящие заявки: переписываться пока не с кем). */
  onChat?: () => void;
  /** Есть непрочитанное от этого человека — точка на кнопке чата. */
  chatUnread?: boolean;
}) {
  const colors = useColors();
  const rise = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(rise, {
      toValue: 1, duration: RISE_MS, delay: index * STEP_MS,
      easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER,
    });
    anim.start();
    return () => anim.stop();
  }, [index, rise]);

  const setPress = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: timing.press,
      easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER,
    }).start();

  const pillBg =
    pillTone === "tutor" ? colors.primary + "18"
      : pillTone === "parent" ? accents.magenta + "1a"
        : accents.gold + "33";
  const pillFg =
    pillTone === "tutor" ? colors.primary
      : pillTone === "parent" ? accents.magenta
        : "#8a5a00";
  const edgeColor =
    pillTone === "tutor" ? "#c9bdf0"
      : pillTone === "parent" ? accents.magenta + "4d"
        : colors.border;

  return (
    <Animated.View
      style={{
        marginBottom: 9,
        opacity: rise,
        transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
      <View style={{ paddingBottom: EDGE }}>
        <View style={{
          position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
          borderRadius: radii.md, backgroundColor: edgeColor,
        }} />

        <Animated.View style={{ transform: [{ translateY: press }] }}>
          <Pressable
            onPress={onPress}
            onPressIn={onPress ? () => setPress(EDGE) : undefined}
            onPressOut={onPress ? () => setPress(0) : undefined}
            disabled={!onPress}
            accessibilityRole={onPress ? "button" : undefined}
            accessibilityLabel={onPress ? `Открыть профиль: ${name}` : undefined}
            style={{
              flexDirection: "row", alignItems: "center", gap: 11,
              backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
              borderRadius: radii.md, paddingVertical: 11, paddingLeft: 12, paddingRight: 10,
            }}
          >
            <View style={{ position: "relative" }}>
              <AnimatedAvatar size={46} avatarColor={color} avatarEmoji={emoji} avatarUrl={avatarUrl} />
              {online && (
                <View style={{
                  position: "absolute", right: -2, bottom: -2,
                  width: 13, height: 13, borderRadius: 7,
                  backgroundColor: colors.success,
                  borderWidth: 2.5, borderColor: colors.card,
                }} />
              )}
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              {/* Имя и плашка — ДВА соседних Text, не вложенных. */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 15, fontWeight: "900", letterSpacing: -0.2, color: colors.foreground, flexShrink: 1 }}
                >
                  {name}
                </Text>
                {!!pill && (
                  <View style={{
                    backgroundColor: pillBg, borderRadius: radii.pill,
                    paddingHorizontal: 7, paddingVertical: 2,
                  }}>
                    <Text style={{
                      fontSize: 9.5, fontWeight: "900", letterSpacing: 0.5,
                      textTransform: "uppercase", color: pillFg,
                    }}>
                      {pill}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12, fontWeight: "700", marginTop: 2,
                  color: colors.mutedForeground, fontVariant: ["tabular-nums"],
                }}
              >
                {note}
              </Text>

              {points !== undefined && points > 0 && (
                <GrowBar
                  ratio={ratio ?? 0}
                  color={leader ? accents.gold : colors.primary}
                  delay={index * STEP_MS + 260}
                />
              )}
            </View>

            {/* Кнопка чата — своё касание, независимое от строки целиком. */}
            {onChat && (
              <ChatButton onPress={onChat} unread={chatUnread} />
            )}

            {/* Шеврон только там, где нет удаления: два значка подряд
                читались как один составной элемент. */}
            {onPress && !onRemove && (
              <Glyph name="chevron" size={16} color={colors.mutedForeground} />
            )}

            {/* Удаление: красный кружок, а не серый значок в ряду с шевроном.
                Серый терялся, и было непонятно, чем убирают из друзей. */}
            {onRemove && (
              <Pressable
                onPress={onRemove}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Убрать из друзей: ${name}`}
                style={({ pressed }) => ({
                  width: 34, height: 34, borderRadius: 12,
                  alignItems: "center", justifyContent: "center",
                  backgroundColor: removeOpen
                    ? colors.destructive
                    : colors.destructive + "14",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Glyph
                  name="userX"
                  size={17}
                  color={removeOpen ? "#ffffff" : colors.destructive}
                />
              </Pressable>
            )}
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// ── Подтверждение удаления ──────────────────────────────────────────────────

function RemoveConfirm({
  name, busy, onKeep, onDrop,
}: {
  name: string;
  busy: boolean;
  onKeep: () => void;
  onDrop: () => void;
}) {
  const colors = useColors();
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1, duration: 260, easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [rise]);

  return (
    <Animated.View style={{
      marginBottom: 9,
      opacity: rise,
      transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
    }}>
      <View style={{ paddingBottom: EDGE }}>
        <View style={{
          position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
          borderRadius: radii.md, backgroundColor: colors.destructive + "55",
        }} />
        <View style={{
          backgroundColor: colors.destructive + "0f",
          borderWidth: 1, borderColor: colors.destructive + "33",
          borderRadius: radii.md, padding: 14,
        }}>
          <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>
            Убрать {name} из друзей?
          </Text>
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.mutedForeground, marginTop: 3 }}>
            Вы перестанете видеть очки друг друга. Запрос можно отправить заново.
          </Text>

          <View style={{ flexDirection: "row", gap: 9, marginTop: 12 }}>
            <ChunkyButton label="Оставить" tone="dark" center onPress={onKeep} style={{ flex: 1 }} />
            {busy ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={colors.destructive} />
              </View>
            ) : (
              <ChunkyButton label="Убрать" tone="danger" center onPress={onDrop} style={{ flex: 1 }} />
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ── Переключатель с гранью ──────────────────────────────────────────────────

function Segmented<T extends string>({
  options, value, onChange, style,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  style?: any;
}) {
  const colors = useColors();
  return (
    <View style={[{ paddingBottom: SEG_EDGE }, style]}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: SEG_EDGE, bottom: 0,
        borderRadius: radii.sm + 2, backgroundColor: colors.border,
      }} />
      <View style={{
        flexDirection: "row", gap: 3, padding: 3,
        backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
        borderRadius: radii.sm + 2,
      }}>
        {options.map((o) => {
          const active = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                {
                  flex: 1, paddingVertical: 9, borderRadius: radii.sm,
                  alignItems: "center", justifyContent: "center",
                },
                active && {
                  backgroundColor: colors.card,
                  shadowColor: accents.violetDeep,
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.22, shadowRadius: 7, elevation: 4,
                },
                pressed && !active && { opacity: 0.7 },
              ]}
            >
              <Text style={{
                fontSize: 13.5,
                fontWeight: active ? "900" : "800",
                color: active ? colors.foreground : colors.mutedForeground,
              }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Поле кода ───────────────────────────────────────────────────────────────

/**
 * Ввод шестизначного кода ячейками.
 *
 * Раньше это был обычный TextInput с подсказкой «_ _ _ _ _ _». Подсказка —
 * это placeholder, поэтому от первой же буквы все шесть чёрточек исчезали, и
 * на месте кода оставалась одинокая «F» по центру: сколько символов ещё
 * вводить, поле больше не сообщало. Плюс между чёрточек мигала системная
 * каретка — синяя полоска, которую видно на скриншоте и которую легко принять
 * за ещё одну, седьмую метку.
 *
 * Теперь чёрточек всегда шесть. Введённый символ встаёт над своей чёрточкой, а
 * она подсвечивается цветом бренда: остаток видно, не считая буквы.
 *
 * Каретки нет вовсе: настоящее поле лежит поверх ячеек невидимым слоем
 * (прозрачный текст, caretHidden, прозрачное выделение), а рисуем мы своё.
 * Позиция ввода и так читается по последней заполненной ячейке. Тап в любое
 * место поля попадает в этот слой, поэтому клавиатура открывается как обычно.
 */
function CodeField({
  value, onChange, invalid, ok,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Код не нашёлся: рамка красная. */
  invalid?: boolean;
  /** Человек найден: рамка в цвете бренда. */
  ok?: boolean;
}) {
  const colors = useColors();
  const chars = value.split("");

  return (
    <View
      style={{
        backgroundColor: colors.muted,
        borderRadius: radii.sm + 2,
        borderWidth: 1.5,
        borderColor: invalid ? colors.destructive : ok ? colors.primary : colors.border,
        paddingVertical: 14,
        paddingHorizontal: 12,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
        {Array.from({ length: CODE_LEN }, (_, i) => {
          const ch = chars[i];
          return (
            <View key={i} style={{ width: 34, alignItems: "center" }}>
              {/* Символ-заполнитель под прозрачным цветом держит высоту строки
                  постоянной: без него ряд подпрыгивал на первой букве. */}
              <Text
                style={{
                  fontSize: 25, fontWeight: "900", lineHeight: 31, height: 31,
                  color: ch ? colors.foreground : "transparent",
                }}
              >
                {ch ?? "0"}
              </Text>
              <View style={{
                height: 3, width: 22, borderRadius: 2, marginTop: 2,
                backgroundColor: ch ? colors.primary : colors.mutedForeground + "4d",
              }} />
            </View>
          );
        })}
      </View>

      {/* Настоящее поле: невидимое, во всю площадь. */}
      <TextInput
        value={value}
        onChangeText={onChange}
        maxLength={CODE_LEN}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        caretHidden
        selectionColor="transparent"
        accessibilityLabel="Код приглашения"
        style={[
          StyleSheet.absoluteFillObject,
          {
            color: "transparent",
            backgroundColor: "transparent",
            textAlign: "center",
            fontSize: 25,
          },
          // В вебе у сфокусированного поля своя рамка и своя каретка: и то и
          // другое здесь лишнее, рисуем всё сами.
          Platform.OS === "web"
            ? ({ outlineStyle: "none", caretColor: "transparent" } as any)
            : null,
        ]}
      />
    </View>
  );
}

// ── Карточка своего кода ────────────────────────────────────────────────────

/**
 * Код набран белым по фиолетовой заливке.
 *
 * Прошлый вариант был бледной подложкой с тёмными буквами: на светлом листе
 * код терялся, хотя ради него вкладку и открывают. Заливка делает его самым
 * контрастным пятном экрана, а кнопка копирования на ней — белая, чтобы не
 * спорить с самим кодом за внимание.
 */
function CodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <View style={{ paddingBottom: 6, marginTop: 4 }}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: 6, bottom: 0,
        borderRadius: radii.md, backgroundColor: accents.indigoDeep,
      }} />
      <LinearGradient
        colors={["#7c3aed", "#6d28d9", "#5b21b6"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{
          borderRadius: radii.md, padding: 16, overflow: "hidden",
          shadowColor: "#6d28d9", shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.32, shadowRadius: 18, elevation: 7,
        }}
      >
        {/* Блик сверху: без него заливка выглядит наклейкой. */}
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]}
          style={{ position: "absolute", left: 0, right: 0, top: 0, height: "55%" }}
        />

        <Text style={{
          fontSize: 10, fontWeight: "900", letterSpacing: 1.2,
          textTransform: "uppercase", color: "rgba(255,255,255,0.72)",
        }}>
          Мой код
        </Text>
        <Text style={{
          fontSize: 32, fontWeight: "900", letterSpacing: 7, marginTop: 6,
          color: "#ffffff", fontVariant: ["tabular-nums"],
        }}>
          {code}
        </Text>
        <Text style={{
          fontSize: 12.5, fontWeight: "700", color: "rgba(255,255,255,0.82)",
          marginTop: 6, maxWidth: 230, lineHeight: 17,
        }}>
          Назови его другу, учителю или родителю, чтобы они нашли тебя.
        </Text>

        <Pressable
          onPress={() => {
            Clipboard.setString(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
          accessibilityRole="button"
          accessibilityLabel="Скопировать код"
          style={({ pressed }) => ({
            position: "absolute", top: 14, right: 14,
            flexDirection: "row", alignItems: "center", gap: 6,
            backgroundColor: copied ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.22)",
            borderRadius: 13, paddingHorizontal: 13, paddingVertical: 9,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Glyph name={copied ? "check" : "copy"} size={15} color={copied ? "#5b21b6" : "#ffffff"} />
          <Text style={{ fontSize: 13, fontWeight: "900", color: copied ? "#5b21b6" : "#ffffff" }}>
            {copied ? "Готово" : "Копировать"}
          </Text>
        </Pressable>
      </LinearGradient>
    </View>
  );
}

// ── Лист ────────────────────────────────────────────────────────────────────

export interface FriendsSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenFriend: (id: number) => void;
  /** Открыть переписку с этим человеком — отдельно от профиля, см. ChatButton. */
  onOpenChat: (id: number) => void;
  inviteCode?: string | null;
}

export function FriendsSheet({ visible, onClose, onOpenFriend, onOpenChat, inviteCode }: FriendsSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { unreadByUser } = useMessagesBadge();

  const [tab, setTab] = useState<"list" | "add">("list");
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [teachers, setTeachers] = useState<ConnectionItem[]>([]);
  const [parents, setParents] = useState<ConnectionItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [addMode, setAddMode] = useState<"code" | "username">("code");
  const [code, setCode] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [found, setFound] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [addError, setAddError] = useState("");

  // Подтверждение удаления раскрывается в самой строке.
  const [removing, setRemoving] = useState<number | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchIdRef = useRef(0);

  const loadFriends = useCallback(async () => {
    setLoadingList(true);
    try {
      // Три списка одним заходом. allSettled, а не all: если родителей вдруг
      // не отдали (старый сервер без эндпоинта), друзья всё равно покажутся.
      const [fr, tc, pr] = await Promise.allSettled([
        apiFetch("/api/connections/friends"),
        apiFetch("/api/connections/student/teachers"),
        apiFetch("/api/connections/student/parents"),
      ]);
      if (fr.status === "fulfilled") setFriends(Array.isArray(fr.value) ? fr.value : []);
      if (tc.status === "fulfilled") setTeachers(Array.isArray(tc.value) ? tc.value : []);
      if (pr.status === "fulfilled") setParents(Array.isArray(pr.value) ? pr.value : []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadFriends();
      pollerRef.current = setInterval(loadFriends, 30_000);
    } else if (pollerRef.current) {
      clearInterval(pollerRef.current);
      pollerRef.current = null;
    }
    return () => {
      if (pollerRef.current) { clearInterval(pollerRef.current); pollerRef.current = null; }
    };
  }, [visible, loadFriends]);

  const resetAddForm = () => { setCode(""); setUsernameInput(""); setFound(null); setAddError(""); };

  const handleCodeChange = async (raw: string) => {
    const t = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setCode(t);
    setFound(null);
    setAddError("");
    if (t.length !== CODE_LEN) return;

    setSearching(true);
    try {
      const data = await apiFetch(`/api/connections/by-code/${t}`);
      if (data.role !== "student") setAddError("Это не ученик");
      else setFound(data);
    } catch {
      setAddError("Никого с таким кодом нет");
    } finally {
      setSearching(false);
    }
  };

  const handleUsernameSearch = async (raw: string) => {
    const val = raw.replace(/\s/g, "");
    setUsernameInput(val);
    setFound(null);
    setAddError("");
    if (val.length < 2) return;

    // Ответы приходят вразнобой: считается только последний запрос.
    const reqId = ++searchIdRef.current;
    setSearching(true);
    try {
      const data = await apiFetch(`/api/connections/by-username/${encodeURIComponent(val)}`);
      if (searchIdRef.current !== reqId) return;
      if (data.role !== "student") setAddError("Это не ученик");
      else setFound(data);
    } catch (e: any) {
      if (searchIdRef.current !== reqId) return;
      setAddError(e?.message || "Никого с таким псевдонимом нет");
    } finally {
      if (searchIdRef.current === reqId) setSearching(false);
    }
  };

  const sendRequest = async () => {
    if (!found) return;
    setSending(true);
    setAddError("");
    try {
      await apiFetch("/api/connections/friends/request", {
        method: "POST",
        body: JSON.stringify({ code: found.inviteCode ?? code }),
      });
      await loadFriends();
      setTab("list");
      resetAddForm();
    } catch (e: any) {
      setAddError(e.message ?? "Не удалось отправить запрос");
    } finally {
      setSending(false);
    }
  };

  const acceptRequest = async (id: number) => {
    await apiFetch(`/api/connections/friends/${id}/accept`, { method: "PATCH" });
    await loadFriends();
  };

  const dropFriendship = async (id: number) => {
    setRemoveBusy(true);
    try {
      await apiFetch(`/api/connections/friends/${id}`, { method: "DELETE" });
    } catch { /* убираем из списка в любом случае: связи уже нет */ }
    setFriends((prev) => prev.filter((f) => f.friendshipId !== id));
    setRemoving(null);
    setRemoveBusy(false);
  };

  // Кто уже показан своей веткой. Роль важнее дружбы: родитель-друг должен
  // остаться родителем, а не встретиться в списке дважды.
  const claimedIds = new Set<number>([
    ...teachers.map((t) => t.id),
    ...parents.map((p) => p.id),
  ]);

  const accepted = friends.filter(
    (f) => f.status === "accepted" && !claimedIds.has(f.user.id),
  );
  const incoming = friends.filter((f) => f.status === "pending" && f.direction === "received");
  const outgoing = friends.filter((f) => f.status === "pending" && f.direction === "sent");

  // Лидер задаёт масштаб шкал: доля считается от него, а не от абстрактной
  // сотни очков — иначе у всех полоски были бы одинаково пустыми.
  const topPoints = Math.max(1, ...accepted.map((f) => f.user.totalPoints ?? 0));
  const sortedFriends = [...accepted].sort(
    (a, b) => (b.user.totalPoints ?? 0) - (a.user.totalPoints ?? 0),
  );

  const total = accepted.length + teachers.length + parents.length;
  const nothingYet =
    accepted.length === 0 && teachers.length === 0 &&
    parents.length === 0 && incoming.length === 0;

  const stickyBottom = 16 + insets.bottom;
  const scrollPad = stickyBottom + STICKY_H + STICKY_FADE;

  // Индекс для ступеньки появления: сквозной по всему списку.
  let rowIndex = -1;
  const nextIndex = () => ++rowIndex;

  const openChat = (id: number) => { onClose(); onOpenChat(id); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={{ flex: 1, backgroundColor: "#00000070", justifyContent: "flex-end" }} onPress={onClose}>
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
              paddingTop: 12, paddingHorizontal: 20,
              maxHeight: "88%",
            }}
          >
            <View style={{
              width: 42, height: 4, borderRadius: 2,
              backgroundColor: colors.border, alignSelf: "center",
            }} />

            {/* Рядом с заголовком — только счётчик людей. На вкладке
                добавления здесь ничего нет: слово «добавить» дублировало
                кнопку переключателя строкой ниже. */}
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, paddingTop: 14, paddingBottom: 12 }}>
              <Text style={{ fontSize: 22, fontWeight: "900", letterSpacing: -0.5, color: colors.foreground }}>
                Друзья
              </Text>
              {tab === "list" && (
                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
                  {total === 0 ? "пока никого" : `${total} ${plural(total, ["человек", "человека", "человек"])}`}
                </Text>
              )}
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: scrollPad }}
            >
              <Segmented
                options={[{ key: "list", label: "Мои друзья" }, { key: "add", label: "Добавить" }]}
                value={tab}
                onChange={(k) => { setTab(k); setRemoving(null); }}
              />

              {tab === "list" ? (
                loadingList && nothingYet ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : (
                  <>
                    {/* Входящие запросы наверху: это единственное, что требует
                        действия прямо сейчас. */}
                    {incoming.length > 0 && (
                      <>
                        <GroupLabel title="Хотят дружить" count={incoming.length} />
                        {incoming.map((f) => (
                          <View key={f.friendshipId} style={{ paddingBottom: EDGE, marginBottom: 9 }}>
                            <View style={{
                              position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
                              borderRadius: radii.md, backgroundColor: accents.magenta + "44",
                            }} />
                            <View style={{
                              backgroundColor: accents.magenta + "12",
                              borderWidth: 1, borderColor: accents.magenta + "33",
                              borderRadius: radii.md, padding: 12,
                            }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
                                <AnimatedAvatar
                                  size={46}
                                  avatarColor={f.user.avatarColor ?? "#6366f1"}
                                  avatarEmoji={f.user.avatarEmoji}
                                  avatarUrl={f.user.avatarUrl}
                                />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>
                                    {f.user.name}
                                  </Text>
                                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground, marginTop: 2 }}>
                                    Входящий запрос на дружбу
                                  </Text>
                                </View>
                              </View>
                              <View style={{ flexDirection: "row", gap: 9, marginTop: 12 }}>
                                <ChunkyButton
                                  label="Принять" icon="check" center
                                  onPress={() => acceptRequest(f.friendshipId)}
                                  style={{ flex: 1 }}
                                />
                                <ChunkyButton
                                  label="Отклонить" tone="dark" center
                                  onPress={() => dropFriendship(f.friendshipId)}
                                  style={{ flex: 1 }}
                                />
                              </View>
                            </View>
                          </View>
                        ))}
                      </>
                    )}

                    {teachers.length > 0 && (
                      <>
                        <GroupLabel title={teachers.length > 1 ? "Учителя" : "Учитель"} />
                        {teachers.map((t) => (
                          <PersonRow
                            key={t.id}
                            index={nextIndex()}
                            name={t.name}
                            emoji={t.avatarEmoji}
                            color={t.avatarColor ?? "#6366f1"}
                            avatarUrl={t.avatarUrl}
                            online={t.isOnline}
                            note={handleNote(t.username, t.isOnline)}
                            pill="Учитель"
                            pillTone="tutor"
                            onPress={() => { onClose(); onOpenFriend(t.id); }}
                            onChat={() => openChat(t.id)}
                            chatUnread={(unreadByUser[t.id] ?? 0) > 0}
                          />
                        ))}
                      </>
                    )}

                    {/* Родители: своя ветка, как у учителя. Очков у них нет —
                        они не учат язык, а следят за ребёнком. Под именем
                        стоит псевдоним: роль уже написана в плашке. */}
                    {parents.length > 0 && (
                      <>
                        <GroupLabel title={parents.length > 1 ? "Родители" : "Родитель"} />
                        {parents.map((p) => (
                          <PersonRow
                            key={p.id}
                            index={nextIndex()}
                            name={p.name}
                            emoji={p.avatarEmoji}
                            color={p.avatarColor ?? "#ec4899"}
                            avatarUrl={p.avatarUrl}
                            online={p.isOnline}
                            note={handleNote(p.username, p.isOnline)}
                            pill="Родитель"
                            pillTone="parent"
                            onPress={() => { onClose(); onOpenFriend(p.id); }}
                            onChat={() => openChat(p.id)}
                            chatUnread={(unreadByUser[p.id] ?? 0) > 0}
                          />
                        ))}
                      </>
                    )}

                    {sortedFriends.length > 0 && (
                      <>
                        <GroupLabel title="Друзья" count={sortedFriends.length} />
                        {sortedFriends.map((f, i) => {
                          const pts = f.user.totalPoints ?? 0;
                          const note = pts > 0
                            ? `${pts.toLocaleString("ru-RU")} очков`
                            : NOT_STARTED;
                          return (
                            <React.Fragment key={f.friendshipId}>
                              <PersonRow
                                index={nextIndex()}
                                name={f.user.name}
                                emoji={f.user.avatarEmoji}
                                color={f.user.avatarColor ?? "#6366f1"}
                                avatarUrl={f.user.avatarUrl}
                                online={f.user.isOnline}
                                note={f.user.isOnline ? `${note} · в сети` : note}
                                points={pts}
                                ratio={pts / topPoints}
                                leader={i === 0 && pts > 0}
                                pill={i === 0 && pts > 0 ? "1 место" : undefined}
                                onPress={() => { onClose(); onOpenFriend(f.user.id); }}
                                onChat={() => openChat(f.user.id)}
                                chatUnread={(unreadByUser[f.user.id] ?? 0) > 0}
                                removeOpen={removing === f.friendshipId}
                                onRemove={() => setRemoving(
                                  removing === f.friendshipId ? null : f.friendshipId,
                                )}
                              />
                              {removing === f.friendshipId && (
                                <RemoveConfirm
                                  name={f.user.name}
                                  busy={removeBusy}
                                  onKeep={() => setRemoving(null)}
                                  onDrop={() => dropFriendship(f.friendshipId)}
                                />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </>
                    )}

                    {outgoing.length > 0 && (
                      <>
                        <GroupLabel title="Ждут ответа" count={outgoing.length} />
                        {outgoing.map((f) => (
                          <View key={f.friendshipId} style={{ opacity: 0.62 }}>
                            <PersonRow
                              index={nextIndex()}
                              name={f.user.name}
                              emoji={f.user.avatarEmoji}
                              color={f.user.avatarColor ?? "#6366f1"}
                              avatarUrl={f.user.avatarUrl}
                              note="Запрос отправлен"
                              removeOpen={removing === f.friendshipId}
                              onRemove={() => setRemoving(
                                removing === f.friendshipId ? null : f.friendshipId,
                              )}
                            />
                            {removing === f.friendshipId && (
                              <RemoveConfirm
                                name={f.user.name}
                                busy={removeBusy}
                                onKeep={() => setRemoving(null)}
                                onDrop={() => dropFriendship(f.friendshipId)}
                              />
                            )}
                          </View>
                        ))}
                      </>
                    )}

                    {/* Пусто: экран объясняет обмен кодами, а не сообщает,
                        что друзей нет. */}
                    {nothingYet && (
                      <View style={{ alignItems: "center", paddingTop: 30, paddingBottom: 8 }}>
                        <View style={{
                          width: 74, height: 74, borderRadius: 26, marginBottom: 16,
                          backgroundColor: colors.primary + "14",
                          alignItems: "center", justifyContent: "center",
                        }}>
                          <Glyph name="handshake" size={34} color={colors.primary} />
                        </View>
                        <Text style={{ fontSize: 18, fontWeight: "900", letterSpacing: -0.3, color: colors.foreground }}>
                          Здесь пока пусто
                        </Text>
                        <Text style={{
                          fontSize: 13.5, fontWeight: "700", color: colors.mutedForeground,
                          textAlign: "center", marginTop: 7, maxWidth: 260, lineHeight: 19,
                        }}>
                          С друзьями видно, кто сколько занимался, и догонять веселее.
                        </Text>

                        <View style={{ alignSelf: "stretch", marginTop: 22, gap: 11 }}>
                          {[
                            "Открой «Добавить» и скопируй свой код",
                            "Отправь его другу любым мессенджером",
                            "Он введёт код у себя, ты подтвердишь запрос",
                          ].map((step, i) => (
                            <View key={step} style={{ flexDirection: "row", gap: 11, alignItems: "flex-start" }}>
                              <View style={{
                                width: 25, height: 25, borderRadius: 9,
                                backgroundColor: colors.primary,
                                alignItems: "center", justifyContent: "center",
                              }}>
                                <Text style={{ fontSize: 13, fontWeight: "900", color: "#fff" }}>{i + 1}</Text>
                              </View>
                              <Text style={{
                                flex: 1, fontSize: 13, fontWeight: "700",
                                color: colors.mutedForeground, lineHeight: 19,
                              }}>
                                {step}
                              </Text>
                            </View>
                          ))}
                        </View>

                        <ChunkyButton
                          label="Добавить друга"
                          icon="userPlus"
                          onPress={() => setTab("add")}
                          style={{ alignSelf: "stretch", marginTop: 20 }}
                        />
                      </View>
                    )}
                  </>
                )
              ) : (
                <>
                  {/* Свой код и поиск чужого — одна задача: поменяться кодами. */}
                  {!!inviteCode && <CodeCard code={inviteCode} />}

                  <GroupLabel title="Найти человека" />

                  <Segmented
                    options={[{ key: "code", label: "По коду" }, { key: "username", label: "По имени" }]}
                    value={addMode}
                    onChange={(m) => { setAddMode(m); resetAddForm(); }}
                    style={{ marginBottom: 14 }}
                  />

                  {/* Подписи «поиск произойдёт автоматически» нет: он и так
                      идёт сам, а объяснять очевидное — шум. */}
                  <View style={{ position: "relative", marginBottom: 4 }}>
                    {addMode === "code" ? (
                      <CodeField
                        value={code}
                        onChange={handleCodeChange}
                        invalid={!!addError}
                        ok={!!found}
                      />
                    ) : (
                      <TextInput
                        style={{
                          backgroundColor: colors.muted,
                          borderRadius: radii.sm + 2, borderWidth: 1.5,
                          borderColor: addError
                            ? colors.destructive
                            : found ? colors.primary : colors.border,
                          paddingHorizontal: 16, paddingVertical: 14,
                          color: colors.foreground,
                          fontSize: 16, fontWeight: "700",
                        }}
                        placeholder="@псевдоним"
                        placeholderTextColor={colors.mutedForeground + "80"}
                        value={usernameInput}
                        onChangeText={handleUsernameSearch}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    )}
                    {searching && (
                      <View style={{ position: "absolute", right: 16, top: 0, bottom: 0, justifyContent: "center" }}>
                        <ActivityIndicator color={colors.primary} size="small" />
                      </View>
                    )}
                  </View>

                  {!!addError && (
                    <View style={{
                      flexDirection: "row", alignItems: "center", gap: 9, marginTop: 10,
                      backgroundColor: colors.destructive + "12",
                      borderWidth: 1, borderColor: colors.destructive + "33",
                      borderRadius: radii.sm, padding: 12,
                    }}>
                      <Glyph name="alert" size={16} color={colors.destructive} />
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: colors.destructive }}>
                        {addError}
                      </Text>
                    </View>
                  )}

                  {found && (
                    <View style={{ paddingBottom: 5, marginTop: 14 }}>
                      <View style={{
                        position: "absolute", left: 0, right: 0, top: 5, bottom: 0,
                        borderRadius: radii.md, backgroundColor: colors.border,
                      }} />
                      <View style={{
                        backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                        borderRadius: radii.md, padding: 16,
                      }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                          <AnimatedAvatar
                            size={54}
                            avatarColor={found.avatarColor ?? "#6366f1"}
                            avatarEmoji={found.avatarEmoji}
                            avatarUrl={found.avatarUrl}
                          />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: "900", letterSpacing: -0.3, color: colors.foreground }}>
                              {found.name}
                            </Text>
                            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "700", color: colors.mutedForeground }}>
                              @{found.username}
                            </Text>
                          </View>
                        </View>

                        {sending ? (
                          <View style={{ paddingVertical: 18, alignItems: "center" }}>
                            <ActivityIndicator color={colors.primary} />
                          </View>
                        ) : (
                          <ChunkyButton
                            label="Отправить запрос"
                            icon="userPlus"
                            center
                            onPress={sendRequest}
                            style={{ marginTop: 13 }}
                          />
                        )}
                      </View>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            {/* Затухание под кнопкой: содержимое уезжает не обрывом. */}
            <LinearGradient
              pointerEvents="none"
              colors={[colors.card + "00", colors.card]}
              style={{
                position: "absolute", left: 0, right: 0,
                bottom: stickyBottom + STICKY_H - 6, height: STICKY_FADE + 6,
              }}
            />

            <View style={{ position: "absolute", left: 20, right: 20, bottom: stickyBottom }}>
              <ChunkyButton label="Закрыть" tone="dark" center onPress={onClose} />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default FriendsSheet;
