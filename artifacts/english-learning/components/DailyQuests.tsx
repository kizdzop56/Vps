// ─────────────────────────────────────────────────────────────────────────────
// Цель дня: кольцо прогресса и список из 2–4 задач.
//
// Заменяет DailyGoalBar. Что было не так:
//   • Задача была одна — «время в приложении». Её закрывает открытая вкладка,
//     то есть цель не требовала ничего сделать.
//   • Заголовок «ЦЕЛЬ ДНЯ» стоял и над карточкой, и внутри неё.
//   • Прогресс рисовался полосой. На маленьких значениях (2 из 15 минут)
//     полоса выглядит почти пустой и не читается как «13 осталось».
//
// Здесь: кольцо с процентом, под ним задачи с галочками. Сами задачи собирает
// utils/dailyQuests.ts — там же объяснено, почему набор детерминированный.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton } from "@/components/ui/GameKit";
import { accents, gradients, radii } from "@/constants/theme";
import { type Quest, questSummary } from "@/utils/dailyQuests";

/** Варианты личной цели по времени. Совпадают с валидацией на сервере. */
const GOAL_OPTIONS = [10, 15, 20, 30];

export interface DailyQuestsProps {
  quests: Quest[];
  /** Текущая цель по минутам — показывается в окне настройки. */
  goalMinutes: number;
  onGoalChange?: (minutes: number) => void;
}

export function DailyQuests({ quests, goalMinutes, onGoalChange }: DailyQuestsProps) {
  const colors = useColors();
  const [editing, setEditing] = useState(false);
  const sum = questSummary(quests);

  const RING = 66;
  const STROKE = 7;
  const r = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  const s = StyleSheet.create({
    card: {
      borderRadius: radii.lg, padding: 16, overflow: "hidden",
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 9 },
      shadowOpacity: 0.34, shadowRadius: 22, elevation: 8,
    },
    // Световое пятно: даёт объём без второй тени, которой в RN всё равно нет.
    blob: {
      position: "absolute", width: 200, height: 200, borderRadius: 100,
      top: -120, right: -60, backgroundColor: "rgba(255,255,255,0.09)",
    },

    top: { flexDirection: "row", alignItems: "center", gap: 13 },
    ring: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
    ringText: {
      position: "absolute", fontSize: 15, fontWeight: "900", color: "#fff",
      fontVariant: ["tabular-nums"], letterSpacing: -0.4,
    },

    head: { flex: 1, minWidth: 0 },
    lbl: {
      fontSize: 9.5, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase",
      color: "rgba(255,255,255,0.7)",
    },
    title: { fontSize: 16, fontWeight: "900", color: "#fff", letterSpacing: -0.3, marginTop: 5 },
    sub: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.82)", marginTop: 4 },

    pts: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill,
      alignSelf: "flex-start",
    },
    ptsText: { fontSize: 11.5, fontWeight: "900", color: "#42200a" },

    list: { marginTop: 14, gap: 7 },
    row: {
      flexDirection: "row", alignItems: "center", gap: 10,
      paddingVertical: 9, paddingHorizontal: 11, borderRadius: radii.sm,
      backgroundColor: "rgba(255,255,255,0.13)",
      borderWidth: 1, borderColor: "rgba(255,255,255,0.17)",
    },
    rowDone: { backgroundColor: "rgba(255,255,255,0.2)", borderColor: "rgba(255,255,255,0.3)" },
    box: {
      width: 20, height: 20, borderRadius: 7, alignItems: "center", justifyContent: "center",
      borderWidth: 2, borderColor: "rgba(255,255,255,0.5)",
    },
    boxDone: { backgroundColor: "#fff", borderColor: "#fff" },
    rowText: { flex: 1, fontSize: 12.5, fontWeight: "700", color: "#fff" },
    rowTextDone: { color: "rgba(255,255,255,0.6)", textDecorationLine: "line-through" },
    rowCount: {
      fontSize: 11, fontWeight: "800", color: "rgba(255,255,255,0.72)",
      fontVariant: ["tabular-nums"],
    },

    edit: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
      marginTop: 12, paddingVertical: 9, borderRadius: radii.sm,
      backgroundColor: "rgba(255,255,255,0.14)",
      borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    },
    editText: { fontSize: 12, fontWeight: "800", color: "#fff" },

    // ── Окно настройки цели ──
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
    sheetSub: { fontSize: 12.5, fontWeight: "600", color: colors.mutedForeground, marginTop: 5, marginBottom: 18, lineHeight: 18 },
    opts: { flexDirection: "row", gap: 8, marginBottom: 18 },
    opt: {
      flex: 1, paddingVertical: 14, borderRadius: radii.sm, alignItems: "center",
      backgroundColor: colors.muted, borderWidth: 2, borderColor: "transparent",
    },
    optOn: { backgroundColor: colors.primary + "18", borderColor: colors.primary },
    optNum: { fontSize: 19, fontWeight: "900", color: colors.foreground, fontVariant: ["tabular-nums"] },
    optNumOn: { color: colors.primary },
    optCap: { fontSize: 10.5, fontWeight: "700", color: colors.mutedForeground, marginTop: 3 },
  });

  return (
    <>
      <LinearGradient
        colors={sum.allDone
          ? ([accents.gold, accents.amber] as unknown as string[])
          : (gradients.action as unknown as string[])}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={s.card}
      >
        <View pointerEvents="none" style={s.blob} />

        <View style={s.top}>
          <View style={s.ring}>
            <Svg width={RING} height={RING}>
              <Circle
                cx={RING / 2} cy={RING / 2} r={r}
                stroke="rgba(255,255,255,0.24)" strokeWidth={STROKE} fill="none"
              />
              <Circle
                cx={RING / 2} cy={RING / 2} r={r}
                stroke="#ffffff" strokeWidth={STROKE} fill="none" strokeLinecap="round"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={circumference * (1 - sum.percent / 100)}
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
            </Svg>
            {sum.allDone
              ? <View style={{ position: "absolute" }}><Glyph name="check" size={26} color="#fff" /></View>
              : <Text style={s.ringText}>{sum.percent}%</Text>}
          </View>

          <View style={s.head}>
            <Text style={s.lbl}>Цель дня</Text>
            <Text style={s.title}>
              {sum.allDone ? "Все задачи закрыты" : `${sum.done} из ${sum.total} сделано`}
            </Text>
            <Text style={s.sub}>
              {sum.allDone
                ? `Отличная работа · +${sum.earnedPoints} очков`
                : `За все задачи +${sum.totalPoints} очков`}
            </Text>
          </View>

          {!sum.allDone && (
            <LinearGradient
              colors={[accents.gold, accents.amber]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.pts}
            >
              <Text style={s.ptsText}>+{sum.totalPoints}</Text>
            </LinearGradient>
          )}
        </View>

        <View style={s.list}>
          {quests.map((q) => (
            <View key={q.kind} style={[s.row, q.done && s.rowDone]}>
              <View style={[s.box, q.done && s.boxDone]}>
                {q.done && <Glyph name="check" size={11} color={accents.violetDeep} />}
              </View>
              {/* Значок типа задачи: время, задание, слова, разговор — по нему
                  видно характер задачи раньше, чем прочитан текст. */}
              <Glyph name={q.icon} size={14} color="rgba(255,255,255,0.85)" />
              <Text style={[s.rowText, q.done && s.rowTextDone]} numberOfLines={1}>
                {q.title}
              </Text>
              <Text style={s.rowCount}>{q.done ? `+${q.points}` : q.counter}</Text>
            </View>
          ))}
        </View>

        {!!onGoalChange && (
          <Pressable style={s.edit} onPress={() => setEditing(true)}>
            <Glyph name="pen" size={13} color="#fff" />
            <Text style={s.editText}>Изменить цель по времени</Text>
          </Pressable>
        )}
      </LinearGradient>

      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <Pressable style={s.overlay} onPress={() => setEditing(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Сколько заниматься в день</Text>
            <Text style={s.sheetSub}>
              Меняется только задача про время. Остальные задачи дня приложение подбирает само.
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
                  </Pressable>
                );
              })}
            </View>

            <ChunkyButton label="Готово" icon="check" onPress={() => setEditing(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default DailyQuests;
