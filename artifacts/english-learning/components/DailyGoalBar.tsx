// ─────────────────────────────────────────────────────────────────────────────
// Цель дня в шапке «Заданий» — компактная версия карточки из профиля.
//
// Раньше здесь жила отдельная реализация: свой список «целей дня» (время в
// приложении, марафон заданий, AI-разговор), выбираемый по дню года, со своими
// захардкоженными наградами и своим определением выполнения — только по
// минутам. Профиль в это же время считал день через utils/dailyQuests.ts.
//
// Два разных счёта в одном приложении давали прямое противоречие: «Задания»
// показывали «Цель на сегодня выполнена! +20 очков получено», а профиль в ту же
// секунду — 100% по времени, невыполненные задачи дня и +15 очков за цель.
//
// Теперь источник один: buildDailyPlan. Здесь он только показан плотнее —
// кольцо, строка времени, счётчик задач и золотая пилюля с очками ЗА ЦЕЛЬ
// (ровно та цифра, что подписана в окне выбора цели). Праздничное состояние
// включается, когда закрыто и время, и все задачи дня, — как в профиле.
//
// Выбор цели из шапки убран намеренно. Он применял новую цель мгновенно, а по
// правилу она вступает в силу со следующего дня (иначе набор задач можно
// подобрать под себя). Цель меняется в профиле, где рядом стоит подпись об
// этом.
//
// Прогресс задач компонент догружает сам (gamification/stats + flashcards/stats):
// шапка «Заданий» не знает о словах и разговорах, а тащить эти счётчики через
// весь экран ради одной полоски не стоит.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, AppState, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import authStorage from "@/utils/authStorage";
import { Glyph } from "@/components/ui/Glyph";
import { accents, gradients, radii } from "@/constants/theme";
import { buildDailyPlan, plural } from "@/utils/dailyQuests";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string, options?: RequestInit) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Ошибка сервера");
  return data;
}

export interface DailyGoalBarProps {
  /** Минут сегодня по данным экрана. Берётся максимум с серверным значением. */
  todayMinutes: number;
  /** Цель, которая действует СЕГОДНЯ. */
  goalMinutes: number;
  /**
   * Оставлено ради совместимости с прежними местами вызова. Цель меняется в
   * профиле: там же объяснено, что новая цель начнёт действовать завтра.
   */
  onGoalChange?: (minutes: number) => void;
}

/** Как часто подтягивать прогресс задач, пока вкладка открыта. */
const REFRESH_MS = 60_000;

/** Тот же фиолетовый, что у карточки цели в профиле. */
const CARD_GRADIENT = ["#8b5cf6", "#7c3aed", "#6d28d9"] as const;

const RING = 54;
const STROKE = 7;

interface ProgressInput {
  todayMinutes: number;
  todayCompletions: number;
  todayVoiceSessions: number;
  wordsToday: number;
  learnedToday: number;
  dailyWordGoal: number;
}

const EMPTY: ProgressInput = {
  todayMinutes: 0,
  todayCompletions: 0,
  todayVoiceSessions: 0,
  wordsToday: 0,
  learnedToday: 0,
  dailyWordGoal: 10,
};

export function DailyGoalBar({ todayMinutes, goalMinutes }: DailyGoalBarProps) {
  const [live, setLive] = useState<ProgressInput>(EMPTY);

  const load = useCallback(async () => {
    const [gam, words] = await Promise.all([
      apiFetch("/api/gamification/stats").catch(() => null),
      apiFetch("/api/flashcards/stats").catch(() => null),
    ]);
    setLive({
      todayMinutes: Number(gam?.todayMinutes) || 0,
      todayCompletions: Number(gam?.todayCompletions) || 0,
      todayVoiceSessions: Number(gam?.todayVoiceSessions) || 0,
      wordsToday: Number(words?.wordsToday) || 0,
      learnedToday: Number(words?.learnedToday) || 0,
      dailyWordGoal: Number(words?.dailyWordGoal) || 10,
    });
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);

    // Возврат во вкладку браузера или в приложение — повод обновиться сразу:
    // за время отсутствия ученик мог закрыть задачу в другом месте.
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const onVisibility = () => { if (!document.hidden) load(); };
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        clearInterval(interval);
      };
    }

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [load]);

  const plan = buildDailyPlan({
    todayMinutes: Math.max(todayMinutes || 0, live.todayMinutes),
    activeGoalMinutes: goalMinutes,
    selectedGoalMinutes: goalMinutes,
    todayCompletions: live.todayCompletions,
    todayVoiceSessions: live.todayVoiceSessions,
    wordsToday: live.wordsToday,
    learnedToday: live.learnedToday,
    dailyWordGoal: live.dailyWordGoal,
  });

  const { time, quests, doneCount, allDone } = plan;
  const total = quests.length;

  const r = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  const minutesWord = plural(time.target, ["минута", "минуты", "минут"]);
  const remainingWord = plural(time.remaining, ["минута", "минуты", "минут"]);
  const taskWord = plural(total, ["задача", "задачи", "задач"]);

  // Заголовок и подпись повторяют профиль слово в слово: одинаковый день не
  // должен читаться как два разных.
  const title = allDone
    ? "Цель дня выполнена!"
    : time.done
      ? `${time.target} ${minutesWord} есть`
      : `${time.current} из ${time.target} ${minutesWord}`;

  const sub = allDone
    ? `Время и все ${total} ${taskWord} закрыты`
    : time.done
      ? `Время закрыто · задачи ${doneCount} из ${total}`
      : `Ещё ${time.remaining} ${remainingWord} · задачи ${doneCount} из ${total}`;

  return (
    <LinearGradient
      colors={(allDone ? gradients.reward : CARD_GRADIENT) as unknown as string[]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={s.card}
    >
      <View pointerEvents="none" style={s.blob} />

      <View style={s.row}>
        {allDone ? (
          <View style={s.trophy}>
            <Glyph name="trophy" size={26} color="#ffffff" />
          </View>
        ) : (
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
        )}

        <View style={s.mid}>
          <Text style={s.lbl}>Цель дня</Text>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <Text style={s.sub} numberOfLines={1}>{sub}</Text>
        </View>

        {/* Ровно та награда за цель, что подписана в окне выбора в профиле. */}
        <LinearGradient
          colors={[accents.gold, accents.amber]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.pts}
        >
          <Text style={s.ptsText}>+{time.points}</Text>
        </LinearGradient>
      </View>

      {/* Задачи дня сегментами: сколько закрыто, видно до перехода в профиль. */}
      <View style={s.pips}>
        {quests.map((q) => (
          <View key={q.kind} style={[s.pip, q.done && s.pipDone]} />
        ))}
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: radii.md, padding: 14, marginBottom: 12, overflow: "hidden",
    shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.3, shadowRadius: 18, elevation: 7,
  },
  blob: {
    position: "absolute", width: 170, height: 170, borderRadius: 85,
    top: -95, right: -55, backgroundColor: "rgba(255,255,255,0.10)",
  },

  row: { flexDirection: "row", alignItems: "center", gap: 13 },

  ring: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  ringText: {
    position: "absolute", fontSize: 13, fontWeight: "900", color: "#fff",
    fontVariant: ["tabular-nums"], letterSpacing: -0.3,
  },
  trophy: {
    width: RING, height: RING, borderRadius: radii.sm,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },

  mid: { flex: 1, minWidth: 0, paddingRight: 46 },
  lbl: {
    fontSize: 9.5, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase",
    color: "rgba(255,255,255,0.72)",
  },
  title: {
    fontSize: 17, fontWeight: "900", color: "#fff",
    letterSpacing: -0.4, marginTop: 3,
  },
  sub: {
    fontSize: 11.5, fontWeight: "600", color: "rgba(255,255,255,0.82)",
    marginTop: 3, fontVariant: ["tabular-nums"],
  },

  pts: {
    position: "absolute", top: 0, right: 0,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill,
  },
  ptsText: { fontSize: 11.5, fontWeight: "900", color: "#42200a", fontVariant: ["tabular-nums"] },

  pips: { flexDirection: "row", gap: 5, marginTop: 12 },
  pip: {
    flex: 1, height: 5, borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  pipDone: { backgroundColor: accents.gold },
});

export default DailyGoalBar;
