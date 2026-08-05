// ─────────────────────────────────────────────────────────────────────────────
// Цель дня: кольцо времени в шапке и чек-лист учебных задач.
//
// Карточка собрана по утверждённому референсу (profile-blocks-preview):
//   • слева кольцо с процентом, дуга золотая на светлой канавке;
//   • справа «СЕГОДНЯ», крупное «6 из 20 минут» и строка «Ещё 14 минут — и
//     цель закрыта»: главное число дня читается раньше всего остального;
//   • золотая пилюля с очками ЗА САМУ ЦЕЛЬ в правом верхнем углу;
//   • ниже задачи с квадратными галочками, выполненные — зачёркнуты;
//   • внизу кнопка «Изменить цель».
//
// В пилюле раньше стояла сумма за весь день (цель + все задачи): в окне выбора
// у цели «20 минут» написано +40, а на карточке светилось +160 — цифры
// выглядели враньём. Теперь пилюля показывает ровно ту награду, которая
// подписана у выбранной цели, а очки за задачи видны у самих задач.
//
// Смена цели применяется со СЛЕДУЮЩЕГО дня (см. PATCH /gamification/daily-goal):
// набор задач зависит от тяжести цели, и мгновенная смена позволяла бы
// подбирать себе удобные задачи. Поэтому после выбора карточка показывает
// строку «С завтра: N минут», а сегодняшняя цель остаётся прежней.
//
// Сами задачи собирает utils/dailyQuests.ts — там же объяснено, почему набор
// детерминированный и почему в нём нет пункта «зайти в приложение».
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { plural, pointsForGoal, type DailyPlan } from "@/utils/dailyQuests";

/** Варианты личной цели по времени. Совпадают с валидацией на сервере. */
const GOAL_OPTIONS = [10, 15, 20, 30];

/** Градиент карточки. Тот же фиолетовый, что у шапки профиля и «Рейтинга». */
const CARD_GRADIENT = ["#8b5cf6", "#7c3aed", "#6d28d9"] as const;

const RING = 78;
const STROKE = 9;

export interface DailyQuestsProps {
  plan: DailyPlan;
  /** Цель, выбранная на завтра — она подсвечивается в окне настройки. */
  goalMinutes: number;
  onGoalChange?: (minutes: number) => void;
}

export function DailyQuests({ plan, goalMinutes, onGoalChange }: DailyQuestsProps) {
  const colors = useColors();
  const [editing, setEditing] = useState(false);
  const { time, quests } = plan;

  const r = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  // Цель на завтра отличается от сегодняшней — значит выбор уже сделан и ждёт.
  const pendingGoal = time.nextTarget !== time.target ? time.nextTarget : null;

  const s = StyleSheet.create({
    card: {
      borderRadius: radii.lg, padding: 16, overflow: "hidden",
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 9 },
      shadowOpacity: 0.34, shadowRadius: 22, elevation: 8,
    },
    blob: {
      position: "absolute", width: 210, height: 210, borderRadius: 105,
      top: -110, right: -70, backgroundColor: "rgba(255,255,255,0.10)",
    },

    head: { flexDirection: "row", alignItems: "center", gap: 15 },
    ring: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
    ringText: {
      position: "absolute", fontSize: 17, fontWeight: "900", color: "#fff",
      fontVariant: ["tabular-nums"], letterSpacing: -0.5,
    },

    headText: { flex: 1, minWidth: 0, paddingRight: 52 },
    lbl: {
      fontSize: 10, fontWeight: "800", letterSpacing: 1.3, textTransform: "uppercase",
      color: "rgba(255,255,255,0.72)",
    },
    title: {
      fontSize: 21, fontWeight: "900", color: "#fff",
      letterSpacing: -0.5, marginTop: 5, lineHeight: 25,
    },
    sub: { fontSize: 12.5, fontWeight: "600", color: "rgba(255,255,255,0.82)", marginTop: 6, lineHeight: 17 },

    pts: {
      position: "absolute", top: 14, right: 14,
      paddingHorizontal: 11, paddingVertical: 5, borderRadius: radii.pill,
    },
    ptsText: { fontSize: 12, fontWeight: "900", color: "#42200a" },

    list: { marginTop: 15, gap: 8 },
    row: {
      flexDirection: "row", alignItems: "center", gap: 12,
      paddingVertical: 11, paddingHorizontal: 12, borderRadius: radii.sm,
      backgroundColor: "rgba(255,255,255,0.14)",
      borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    },
    rowDone: { backgroundColor: "rgba(255,255,255,0.2)", borderColor: "rgba(255,255,255,0.3)" },
    box: {
      width: 23, height: 23, borderRadius: 8, alignItems: "center", justifyContent: "center",
      borderWidth: 2, borderColor: "rgba(255,255,255,0.55)",
    },
    boxDone: { backgroundColor: "#fff", borderColor: "#fff" },
    rowText: { flex: 1, fontSize: 14, fontWeight: "700", color: "#fff" },
    rowTextDone: { color: "rgba(255,255,255,0.6)", textDecorationLine: "line-through" },
    rowCount: {
      fontSize: 12.5, fontWeight: "800", color: "rgba(255,255,255,0.72)",
      fontVariant: ["tabular-nums"],
    },

    // Ждущая своего часа цель: не кнопка, а тихая подпись.
    pending: {
      flexDirection: "row", alignItems: "center", gap: 7,
      marginTop: 10, paddingVertical: 8, paddingHorizontal: 11,
      borderRadius: radii.sm, backgroundColor: "rgba(255,255,255,0.1)",
      borderWidth: 1, borderColor: "rgba(255,255,255,0.16)",
    },
    pendingText: { flex: 1, fontSize: 11.5, fontWeight: "700", color: "rgba(255,255,255,0.86)" },

    edit: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      marginTop: 10, paddingVertical: 11, borderRadius: radii.sm,
      backgroundColor: "rgba(255,255,255,0.16)",
      borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
    },
    editText: { fontSize: 13.5, fontWeight: "800", color: "#fff" },

    overlay: { flex: 1, backgroundColor: "#00000070", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
      paddingTop: 12, paddingHorizontal: 20, paddingBottom: 30,
    },
    handle: {
      width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
      alignSelf: "center", marginBottom: 16,
    },
    sheetTitle: { fontSize: 19, fontWeight: "900", color: colors.foreground, letterSpacing: -0.4 },
    sheetSub: {
      fontSize: 12.5, fontWeight: "600", color: colors.mutedForeground,
      marginTop: 5, marginBottom: 16, lineHeight: 18,
    },
    opts: { flexDirection: "row", gap: 8, marginBottom: 14 },
    opt: {
      flex: 1, paddingVertical: 12, borderRadius: radii.sm, alignItems: "center",
      backgroundColor: colors.muted, borderWidth: 2, borderColor: "transparent",
    },
    optOn: { backgroundColor: colors.primary + "18", borderColor: colors.primary },
    optNum: { fontSize: 19, fontWeight: "900", color: colors.foreground, fontVariant: ["tabular-nums"] },
    optNumOn: { color: colors.primary },
    optCap: { fontSize: 10.5, fontWeight: "700", color: colors.mutedForeground, marginTop: 2 },
    optPts: {
      marginTop: 7, paddingHorizontal: 7, paddingVertical: 3,
      borderRadius: radii.pill, backgroundColor: accents.gold + "2e",
    },
    optPtsText: { fontSize: 10.5, fontWeight: "900", color: "#8a5a00", fontVariant: ["tabular-nums"] },
    note: {
      flexDirection: "row", gap: 8, alignItems: "flex-start",
      backgroundColor: colors.muted, borderRadius: radii.sm,
      padding: 11, marginBottom: 16,
    },
    noteText: { flex: 1, fontSize: 11.5, fontWeight: "600", color: colors.mutedForeground, lineHeight: 16 },
  });

  const minutesWord = plural(time.target, ["минута", "минуты", "минут"]);
  const remainingWord = plural(time.remaining, ["минута", "минуты", "минут"]);

  return (
    <>
      <SectionLabel>Цель дня</SectionLabel>

      <LinearGradient
        colors={CARD_GRADIENT as unknown as string[]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={s.card}
      >
        <View pointerEvents="none" style={s.blob} />

        <View style={s.head}>
          <View style={s.ring}>
            <Svg width={RING} height={RING}>
              <Circle
                cx={RING / 2} cy={RING / 2} r={r}
                stroke="rgba(255,255,255,0.26)" strokeWidth={STROKE} fill="none"
              />
              <Circle
                cx={RING / 2} cy={RING / 2} r={r}
                stroke={accents.gold} strokeWidth={STROKE} fill="none" strokeLinecap="round"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={circumference * (1 - time.percent / 100)}
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
            </Svg>
            <Text style={s.ringText}>{time.percent}%</Text>
          </View>

          <View style={s.headText}>
            <Text style={s.lbl}>Сегодня</Text>
            <Text style={s.title}>
              {time.done
                ? `${time.target} ${minutesWord} есть`
                : `${time.current} из ${time.target} ${minutesWord}`}
            </Text>
            <Text style={s.sub}>
              {time.done
                ? "Цель по времени закрыта"
                : `Ещё ${time.remaining} ${remainingWord} — и цель закрыта`}
            </Text>
          </View>
        </View>

        {/* Ровно та награда, что подписана у выбранной цели в окне настройки. */}
        <LinearGradient
          colors={[accents.gold, accents.amber]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.pts}
        >
          <Text style={s.ptsText}>+{time.points}</Text>
        </LinearGradient>

        <View style={s.list}>
          {quests.map((q) => (
            <View key={q.kind} style={[s.row, q.done && s.rowDone]}>
              <View style={[s.box, q.done && s.boxDone]}>
                {q.done && <Glyph name="check" size={12} color={accents.violetDeep} />}
              </View>
              <Text style={[s.rowText, q.done && s.rowTextDone]} numberOfLines={1}>
                {q.title}
              </Text>
              <Text style={s.rowCount}>{q.done ? `+${q.points}` : q.counter}</Text>
            </View>
          ))}
        </View>

        {!!pendingGoal && (
          <View style={s.pending}>
            <Glyph name="clock" size={13} color="rgba(255,255,255,0.86)" />
            <Text style={s.pendingText}>
              Новая цель {pendingGoal} {plural(pendingGoal, ["минута", "минуты", "минут"])} начнёт
              действовать завтра
            </Text>
          </View>
        )}

        {!!onGoalChange && (
          <Pressable style={s.edit} onPress={() => setEditing(true)}>
            <Glyph name="pen" size={13} color="#fff" />
            <Text style={s.editText}>Изменить цель</Text>
          </Pressable>
        )}
      </LinearGradient>

      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <Pressable style={s.overlay} onPress={() => setEditing(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Сколько заниматься в день</Text>
            <Text style={s.sheetSub}>
              Чем длиннее занятие, тем больше очков за закрытую цель и тем сложнее задачи дня.
            </Text>

            <View style={s.opts}>
              {GOAL_OPTIONS.map((m) => {
                const on = m === goalMinutes;
                return (
                  <Pressable
                    key={m}
                    style={[s.opt, on && s.optOn]}
                    onPress={() => { onGoalChange?.(m); setEditing(false); }}
                  >
                    <Text style={[s.optNum, on && s.optNumOn]}>{m}</Text>
                    <Text style={s.optCap}>минут</Text>
                    <View style={s.optPts}>
                      <Text style={s.optPtsText}>+{pointsForGoal(m)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={s.note}>
              <Glyph name="alert" size={14} color={colors.mutedForeground} />
              <Text style={s.noteText}>
                Новая цель начнёт действовать завтра. Сегодняшний день уже собран, и менять его
                на ходу нельзя — иначе задачи можно было бы подбирать под себя.
              </Text>
            </View>

            <ChunkyButton label="Готово" icon="check" onPress={() => setEditing(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default DailyQuests;
