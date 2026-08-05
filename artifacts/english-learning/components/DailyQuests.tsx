// ─────────────────────────────────────────────────────────────────────────────
// Цель дня: кольцо времени в шапке и чек-лист учебных задач.
//
// Карточка собрана по утверждённому референсу (profile-blocks-preview):
//   • слева кольцо с процентом, дуга золотая на светлой канавке;
//   • справа «СЕГОДНЯ», крупное «6 из 20 минут» и строка «Ещё 14 минут — и
//     цель закрыта»: главное число дня читается раньше всего остального;
//   • золотая пилюля с наградой ЗА ВЕСЬ ДЕНЬ в правом верхнем углу;
//   • ниже задачи с квадратными галочками, выполненные — зачёркнуты;
//   • внизу кнопка «Изменить цель».
//
// ── Отметка выполнения ──────────────────────────────────────────────────────
// Незакрытая задача — пустой квадрат: это обещание, что её можно закрыть.
// Закрытая — просто галочка без рамки. Белый квадрат с галочкой внутри читался
// как ЕЩЁ ОДИН элемент управления (флажок, который можно снять), хотя снять
// выполнение нельзя, да и рамка вокруг галочки уже ничего не сообщает: строка
// и так зачёркнута и подписана «готово». Галочка крупнее прежней: без рамки
// место освободилось.
//
// ── Объём и анимация ────────────────────────────────────────────────────────
// Под карточкой тёмная нижняя грань — та же порода поверхности, что у
// остальных блоков профиля. Проседания при нажатии нет: сама карточка не
// открывается, нажимаются только кнопки внутри неё.
//
// Кольцо вычерчивается от нуля при каждом входе на экран (prop replay) и при
// изменении процента. Растущая дуга читается как величина, готовая — как
// картинка.
//
// ── Награда одна на день ────────────────────────────────────────────────────
// У каждой задачи была своя цена, и выполненная задача показывала «+35». Это
// читалось как «мне начислили 35 очков за эту задачу», хотя награда задумана за
// цель дня целиком. Хуже того: ни одна из этих цифр никому не начислялась — они
// были нарисованы и всё.
//
// Теперь очки одни: сумма за ПОЛНОСТЬЮ закрытый день (время + все задачи). Пока
// день не закрыт, у пилюли подпись «за весь день», чтобы цифра не выглядела
// уже полученной. Начисляет сервер, один раз в сутки:
// POST /gamification/daily-goal/claim.
//
// Строка итога появляется ТОЛЬКО когда день закрыт. Раньше на её месте висело
// «Очки придут, когда закроешь всё: осталось N пунктов» — пересказ чек-листа,
// который и так висит выше со счётчиками и галочками. Незакрытый день и без
// напоминаний виден по незачёркнутым строкам.
//
// Смена цели применяется со СЛЕДУЮЩЕГО дня (см. PATCH /gamification/daily-goal):
// набор задач зависит от тяжести цели, и мгновенная смена позволяла бы
// подбирать себе удобные задачи. В интерфейсе про это сказано одной строкой —
// объяснять ребёнку причину («иначе можно подобрать задачи под себя») не нужно:
// это подсказка, как обойти правило, а не полезная информация.
//
// Сами задачи собирает utils/dailyQuests.ts — там же объяснено, почему набор
// детерминированный и почему в нём нет пункта «зайти в приложение».
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet, Animated, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { plural, pointsForGoal, type DailyPlan } from "@/utils/dailyQuests";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Варианты личной цели по времени. Совпадают с валидацией на сервере. */
const GOAL_OPTIONS = [10, 15, 20, 30];

/** Градиент карточки. Тот же фиолетовый, что у шапки профиля и «Рейтинга». */
const CARD_GRADIENT = ["#8b5cf6", "#7c3aed", "#6d28d9"] as const;

/** Высота нижней грани. Совпадает с остальными карточками профиля. */
const EDGE = 6;

/** Место под отметку выполнения: пустой квадрат и галочка занимают одинаково. */
const MARK = 23;

const RING = 78;
const STROKE = 9;
const DRAW_MS = 900;

export interface DailyQuestsProps {
  plan: DailyPlan;
  /** Цель, выбранная на завтра — она подсвечивается в окне настройки. */
  goalMinutes: number;
  /** Награда за сегодня уже получена. */
  claimed?: boolean;
  /** Растёт при каждом входе на экран — кольцо вычерчивается заново. */
  replay?: number;
  onGoalChange?: (minutes: number) => void;
  /**
   * Забрать награду за закрытый день. Вызывается сама, как только план
   * сходится: отдельная кнопка «получить» была бы лишним шагом, ребёнок и так
   * всё сделал.
   */
  onClaim?: () => void;
}

export function DailyQuests({
  plan, goalMinutes, claimed, replay = 0, onGoalChange, onClaim,
}: DailyQuestsProps) {
  const colors = useColors();
  const [editing, setEditing] = useState(false);
  const { time, quests, allDone } = plan;

  // День сошёлся — просим очки. Сервер сам решит, выдавать ли: повторный вызов
  // безопасен и отвечает alreadyClaimed.
  useEffect(() => {
    if (allDone && !claimed) onClaim?.();
  }, [allDone, claimed, onClaim]);

  const r = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const target = circumference * (Math.max(0, Math.min(100, time.percent)) / 100);

  // Кольцо: вычерчивается при входе на экран и при смене процента.
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: DRAW_MS,
      easing: Easing.out(Easing.cubic),
      // SVG-атрибуты нативным драйвером не анимируются.
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [replay, target, progress]);

  const offset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, circumference - target],
  });

  // Цель на завтра отличается от сегодняшней — значит выбор уже сделан и ждёт.
  const pendingGoal = time.nextTarget !== time.target ? time.nextTarget : null;

  const s = StyleSheet.create({
    wrap: { paddingBottom: EDGE },
    edge: {
      position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
      borderRadius: radii.lg, backgroundColor: "#4c1d95",
    },
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

    // Пилюля награды. Подпись под ней объясняет, за что цифра, — иначе она
    // читается как уже начисленные очки.
    ptsWrap: { position: "absolute", top: 14, right: 14, alignItems: "flex-end" },
    pts: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: radii.pill },
    ptsText: { fontSize: 12, fontWeight: "900", color: "#42200a" },
    ptsCap: {
      fontSize: 8.5, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase",
      color: "rgba(255,255,255,0.66)", marginTop: 3,
    },

    list: { marginTop: 15, gap: 8 },
    row: {
      flexDirection: "row", alignItems: "center", gap: 12,
      paddingVertical: 11, paddingHorizontal: 12, borderRadius: radii.sm,
      backgroundColor: "rgba(255,255,255,0.14)",
      borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    },
    rowDone: { backgroundColor: "rgba(255,255,255,0.2)", borderColor: "rgba(255,255,255,0.3)" },
    // Пустой квадрат: задачу ещё можно закрыть.
    box: {
      width: MARK, height: MARK, borderRadius: 8, alignItems: "center", justifyContent: "center",
      borderWidth: 2, borderColor: "rgba(255,255,255,0.55)",
    },
    // Выполнено: только галочка, без рамки и подложки. Рамка читалась как
    // флажок, который можно снять, а снять выполнение нельзя.
    mark: { width: MARK, height: MARK, alignItems: "center", justifyContent: "center" },
    rowText: { flex: 1, fontSize: 14, fontWeight: "700", color: "#fff" },
    rowTextDone: { color: "rgba(255,255,255,0.6)", textDecorationLine: "line-through" },
    rowCount: {
      fontSize: 12.5, fontWeight: "800", color: "rgba(255,255,255,0.72)",
      fontVariant: ["tabular-nums"],
    },

    // Итог дня. Показывается только когда день закрыт: до этого он пересказывал
    // чек-лист, который висит прямо над ним.
    total: {
      flexDirection: "row", alignItems: "center", gap: 8,
      marginTop: 10, paddingVertical: 9, paddingHorizontal: 11,
      borderRadius: radii.sm,
      backgroundColor: accents.gold + "33", borderWidth: 1, borderColor: accents.gold + "88",
    },
    totalText: { flex: 1, fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.88)", lineHeight: 16 },

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
      flexDirection: "row", gap: 8, alignItems: "center",
      backgroundColor: colors.muted, borderRadius: radii.sm,
      padding: 11, marginBottom: 16,
    },
    noteText: { flex: 1, fontSize: 12, fontWeight: "700", color: colors.mutedForeground, lineHeight: 16 },
  });

  const minutesWord = plural(time.target, ["минута", "минуты", "минут"]);
  const remainingWord = plural(time.remaining, ["минута", "минуты", "минут"]);

  return (
    <>
      <SectionLabel>Цель дня</SectionLabel>

      <View style={s.wrap}>
        <View style={s.edge} />
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
              {time.percent > 0 && (
                <AnimatedCircle
                  cx={RING / 2} cy={RING / 2} r={r}
                  stroke={accents.gold} strokeWidth={STROKE} fill="none" strokeLinecap="round"
                  strokeDasharray={`${circumference}`}
                  strokeDashoffset={offset as unknown as number}
                  transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
                />
              )}
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

        {/* Одна награда на весь день. Подпись объясняет, за что она. */}
        <View style={s.ptsWrap}>
          <LinearGradient
            colors={[accents.gold, accents.amber]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.pts}
          >
            <Text style={s.ptsText}>+{plan.reward}</Text>
          </LinearGradient>
          <Text style={s.ptsCap}>{claimed ? "получено" : "за весь день"}</Text>
        </View>

        <View style={s.list}>
          {quests.map((q) => (
            <View key={q.kind} style={[s.row, q.done && s.rowDone]}>
              {/* Выполнено — просто галочка. Не выполнено — пустой квадрат. */}
              {q.done ? (
                <View style={s.mark}>
                  <Glyph name="check" size={19} color="#fff" />
                </View>
              ) : (
                <View style={s.box} />
              )}
              <Text style={[s.rowText, q.done && s.rowTextDone]} numberOfLines={1}>
                {q.title}
              </Text>
              {/* У выполненной задачи цены нет: очки платят за день целиком. */}
              <Text style={s.rowCount}>{q.done ? "готово" : q.counter}</Text>
            </View>
          ))}
        </View>

        {/* Итог — только когда день закрыт: это событие, а не напоминание. */}
        {(allDone || claimed) && (
          <View style={s.total}>
            <Glyph name="star" size={14} color={accents.gold} />
            <Text style={s.totalText}>
              {claimed
                ? `День закрыт полностью. Начислено ${plan.reward} ${plural(plan.reward, ["очко", "очка", "очков"])}`
                : "День закрыт полностью — начисляем очки"}
            </Text>
          </View>
        )}

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
      </View>

      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <Pressable style={s.overlay} onPress={() => setEditing(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Сколько заниматься в день</Text>
            <Text style={s.sheetSub}>
              Чем длиннее занятие, тем больше очков за полностью закрытый день и тем сложнее задачи.
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
              <Text style={s.noteText}>Новая цель начнёт действовать завтра</Text>
            </View>

            <ChunkyButton label="Готово" icon="check" onPress={() => setEditing(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default DailyQuests;
