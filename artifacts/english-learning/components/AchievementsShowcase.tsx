// Витрина наград.
//
// Медали рисуются готовыми рендерами из assets/badges/medals (поле image в
// constants/achievements.ts). Если картинка не найдена, показываем глиф из
// своего набора, подобранный по сложности. Файл данных не меняется.
//
// ── Компактный вид ──────────────────────────────────────────────────────────
// Раньше блок занимал пол-экрана: карточка следующей награды, сетка полученных
// и раскрытый по умолчанию список из ~36 закрытых медалей. Три десятка
// одинаковых замков висели постоянно и не сообщали ничего сверх счётчика.
//
// Сейчас сверху: веер из САМЫХ ЦЕННЫХ медалей, счётчик «14 / 50», разбивка по
// сложности и строка ближайшей цели. Полный список свёрнут.
//
// ── Про веер ────────────────────────────────────────────────────────────────
// В веере лежат не последние по времени медали, а самые труднодостижимые:
// сначала hard, потом medium, потом easy. Витрина — это то, чем хвастаются, и
// «Бог знаний» там нужнее, чем «Первые очки», полученные пять минут назад.
//
// Медалей ровно пять (FAN_COUNT). Раскрытый веер занимает всю ширину блока:
// шаг между медалями считается от реальной ширины через onLayout, поэтому
// пятая медаль встаёт вровень с правым краем на любом экране, а не вылезает
// за него на узких.
//
// Нажатие раскрывает веер, повторное — складывает обратно. Анимация идёт по
// одному значению fan (0…1), позиции считаются трансформами: layout при этом
// не пересчитывается и на слабых телефонах ничего не дёргается.
//
// ── ГРАБЛИ: вложенный Text ──────────────────────────────────────────────────
// Счётчик сначала был сделан так:
//
//   <Text style={count}>14<Text style={countTotal}> / 50</Text></Text>
//
// В Safari это роняло ВЕСЬ экран профиля с ошибкой «Cannot set indexed
// properties on this object». Три подряд белых экрана были из-за одной строки.
// Правило: НЕ вкладывать Text в Text. Разные кегли — два отдельных Text в
// строке с flexDirection: "row" и alignItems: "baseline".
import React, { useState } from "react";
import {
  View, Text, Image, TouchableOpacity, Pressable, Modal, StyleSheet, Animated, Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import type { Achievement, AchievementDifficulty, AchievementStats } from "@/constants/achievements";
import { achievementProgress, nextAchievement } from "@/utils/achievementProgress";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { ChunkyButton } from "@/components/ui/GameKit";
import { accents, radii, chunky, timing } from "@/constants/theme";

interface AchievementsShowcaseProps {
  unlocked: Achievement[];
  locked?: Achievement[];
  showLocked?: boolean;
  title?: string;
  /** Показатели ученика. Без них прогресс посчитать нечем. */
  stats?: AchievementStats;
}

/** Фолбэк-глиф: лёгкая — вспышка, средняя — медаль, сложная — трофей. */
function fallbackGlyph(difficulty: AchievementDifficulty): GlyphName {
  if (difficulty === "hard") return "trophy";
  if (difficulty === "medium") return "medal";
  return "spark";
}

/** Вес сложности: по нему медали в веере сортируются от ценных к простым. */
const DIFFICULTY_WEIGHT: Record<AchievementDifficulty, number> = {
  hard: 3, medium: 2, easy: 1,
};

/** Полоса прогресса в цвете награды. */
function ProgressTrack({
  percent, color, height = 8,
}: { percent: number; color: string; height?: number }) {
  return (
    <View style={{
      height,
      borderRadius: radii.pill,
      backgroundColor: color + "22",
      overflow: "hidden",
    }}>
      <LinearGradient
        colors={[color + "cc", color]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ height: "100%", width: `${Math.max(percent, 3)}%`, borderRadius: radii.pill }}
      />
    </View>
  );
}

// ── Веер ────────────────────────────────────────────────────────────────────

const FAN_COUNT = 5;      // сколько медалей показываем
const FAN_SIZE = 52;      // диаметр медали
const FAN_STACKED = 15;   // сдвиг соседней медали в сложенном виде

/**
 * Одна медаль веера. Позиция интерполируется из общего значения fan:
 * 0 — сложено (нахлёст, лёгкий наклон), 1 — раскрыто (ряд по всей ширине).
 */
function FanMedal({
  achievement, index, fan, step, onPress,
}: {
  achievement: Achievement;
  index: number;
  fan: Animated.Value;
  /** Шаг между медалями в раскрытом виде. Считается от ширины блока. */
  step: number;
  onPress: () => void;
}) {
  return (
    <Animated.View
      style={[
        styles.fanItem,
        {
          zIndex: 10 - index,
          transform: [
            {
              translateX: fan.interpolate({
                inputRange: [0, 1],
                outputRange: [index * FAN_STACKED, index * step],
              }),
            },
            // Небольшой наклон в сложенном виде — из-за него стопка читается
            // как веер карт, а не как ряд слипшихся кружков.
            {
              rotate: fan.interpolate({
                inputRange: [0, 1],
                outputRange: [`${(index - 2) * 4}deg`, "0deg"],
              }),
            },
          ],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Награда «${achievement.title}»`}
        style={[
          styles.fanMedal,
          {
            borderColor: achievement.color + "66",
            backgroundColor: achievement.bgColor,
            shadowColor: achievement.color,
          },
        ]}
      >
        {achievement.image ? (
          <Image source={achievement.image} style={styles.fanImg} resizeMode="cover" />
        ) : (
          <Glyph name={fallbackGlyph(achievement.difficulty)} size={24} color={achievement.color} />
        )}
      </Pressable>
    </Animated.View>
  );
}

function BadgeCard({
  achievement,
  isLocked = false,
  percent,
  onPress,
}: {
  achievement: Achievement;
  isLocked?: boolean;
  /** Заполнение 0…100 для закрытой медали. undefined — полосу не рисуем. */
  percent?: number;
  onPress: () => void;
}) {
  // Медали статичные. Живёт только нажатие: медаль проседает на подставке.
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: chunky.duration, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => set(3)}
      onPressOut={() => set(0)}
      style={styles.badgeWrap}
      accessibilityRole="button"
      accessibilityLabel={isLocked ? `Награда «${achievement.title}» ещё не получена` : `Награда «${achievement.title}» получена`}
    >
      <View>
        {/* Подставка видна только у полученной — закрытая ещё не «на полке». */}
        {!isLocked && (
          <View style={{
            position: "absolute", left: 0, right: 0, top: 4, height: 60,
            borderRadius: 30, backgroundColor: achievement.color, opacity: 0.55,
          }} />
        )}
        <Animated.View style={{ transform: [{ translateY: press }] }}>
          <View
            style={[
              styles.badgeRing,
              isLocked
                ? {
                    borderColor: "rgba(139,92,246,0.42)",
                    borderStyle: "dashed",
                    backgroundColor: "rgba(160,140,220,0.12)",
                  }
                : {
                    borderColor: achievement.color + "66",
                    backgroundColor: achievement.bgColor,
                    shadowColor: achievement.color,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.4,
                    shadowRadius: 10,
                    elevation: 5,
                  },
            ]}
          >
            {isLocked ? (
              <Glyph name="lock" size={22} color="rgba(91,79,142,0.5)" />
            ) : achievement.image ? (
              <Image source={achievement.image} style={styles.badgeImg} resizeMode="cover" />
            ) : (
              <Glyph name={fallbackGlyph(achievement.difficulty)} size={28} color={achievement.color} />
            )}
          </View>
        </Animated.View>
        <View style={{ height: 4 }} />
      </View>

      {isLocked && percent !== undefined && (
        <View style={{ alignSelf: "stretch", marginTop: 4 }}>
          <ProgressTrack percent={percent} color={achievement.color} height={4} />
        </View>
      )}

      <Text
        style={[styles.badgeTitle, { color: isLocked ? "#9b8ec4" : achievement.color }]}
        numberOfLines={2}
      >
        {achievement.title}
      </Text>
    </Pressable>
  );
}

function BadgeDetailModal({
  achievement,
  isLocked,
  stats,
  onClose,
}: {
  achievement: Achievement | null;
  isLocked: boolean;
  stats?: AchievementStats;
  onClose: () => void;
}) {
  const colors = useColors();
  if (!achievement) return null;

  const progress = isLocked && stats ? achievementProgress(achievement, stats) : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalCard, { backgroundColor: colors.card }]}
          onPress={() => {}}
        >
          <View
            style={[
              styles.modalBadgeOuter,
              isLocked
                ? {
                    borderColor: "rgba(139,92,246,0.4)",
                    borderStyle: "dashed",
                    backgroundColor: "rgba(160,140,220,0.14)",
                  }
                : {
                    borderColor: achievement.color + "55",
                    backgroundColor: achievement.bgColor,
                    shadowColor: achievement.color,
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.42,
                    shadowRadius: 22,
                    elevation: 9,
                  },
            ]}
          >
            {isLocked ? (
              <Glyph name="lock" size={40} color="rgba(91,79,142,0.6)" />
            ) : achievement.image ? (
              <Image source={achievement.image} style={styles.modalBadgeImg} resizeMode="cover" />
            ) : (
              <Glyph name={fallbackGlyph(achievement.difficulty)} size={52} color={achievement.color} />
            )}
          </View>

          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: isLocked ? "rgba(160,140,220,0.2)" : achievement.color + "18",
                borderColor: isLocked ? "rgba(160,140,220,0.4)" : achievement.color + "55",
              },
            ]}
          >
            <Glyph
              name={isLocked ? "lock" : "check"}
              size={12}
              color={isLocked ? "#7c6db8" : achievement.color}
            />
            <Text style={[styles.statusPillText, { color: isLocked ? "#7c6db8" : achievement.color }]}>
              {isLocked ? "Ещё не получена" : "Получена"}
            </Text>
          </View>

          <Text style={[styles.modalTitle, { color: colors.foreground }]}>{achievement.title}</Text>

          {progress && (
            <View style={[
              styles.modalProgress,
              { backgroundColor: achievement.bgColor, borderColor: achievement.color + "33" },
            ]}>
              <View style={styles.modalProgressHead}>
                <Text style={[styles.modalProgressText, { color: achievement.color }]}>
                  {progress.remainingText}
                </Text>
                <Text style={[styles.modalProgressPercent, { color: achievement.color }]}>
                  {progress.percent}%
                </Text>
              </View>
              <ProgressTrack percent={progress.percent} color={achievement.color} height={10} />
              <Text style={[styles.modalProgressCounter, { color: colors.mutedForeground }]}>
                {progress.counterText}
              </Text>
            </View>
          )}

          <View
            style={[
              styles.infoBlock,
              {
                backgroundColor: isLocked ? "rgba(160,140,220,0.14)" : achievement.bgColor,
                borderColor: isLocked ? "rgba(160,140,220,0.32)" : achievement.color + "30",
              },
            ]}
          >
            <View style={styles.infoRow}>
              <Glyph
                name={isLocked ? "target" : "star"}
                size={13}
                color={isLocked ? "#7c6db8" : achievement.color}
              />
              <Text style={[styles.infoLabel, { color: isLocked ? "#7c6db8" : achievement.color }]}>
                {isLocked ? "Как получить" : "За что получена"}
              </Text>
            </View>
            <Text style={[styles.infoText, { color: colors.foreground }]}>
              {isLocked ? achievement.requirement : achievement.description}
            </Text>
          </View>

          <ChunkyButton
            label="Закрыть"
            icon="close"
            onPress={onClose}
            style={{ alignSelf: "stretch" }}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export function AchievementsShowcase({
  unlocked,
  locked = [],
  showLocked = false,
  title = "Витрина наград",
  stats,
}: AchievementsShowcaseProps) {
  const colors = useColors();
  const [selected, setSelected] = useState<{ achievement: Achievement; isLocked: boolean } | null>(null);
  // Полный список свёрнут: ради этого блок и переделывали.
  const [expanded, setExpanded] = useState(false);
  // Веер сложен. Раскрывается по нажатию на сам веер, а не на стрелку.
  const [fanOpen, setFanOpen] = useState(false);
  // Ширина блока: нужна, чтобы раскрытый веер занял её целиком.
  const [boxWidth, setBoxWidth] = useState(0);
  const fan = React.useRef(new Animated.Value(0)).current;

  const total = unlocked.length + locked.length;

  // Ближайшая цель. Пересчитывается только при смене статов или списка.
  const next = React.useMemo(
    () => (stats ? nextAchievement(locked, stats) : null),
    [locked, stats],
  );

  /**
   * Медали веера: самые труднодостижимые, а не самые свежие. Сортируем по
   * сложности, внутри одной сложности сохраняем порядок каталога (он идёт от
   * простых условий к сложным, поэтому «100 заданий» окажется впереди «10»).
   */
  const showcase = React.useMemo(() => {
    const order = new Map(unlocked.map((a, i) => [a.id, i]));
    return [...unlocked]
      .sort((a, b) => {
        const byValue = DIFFICULTY_WEIGHT[b.difficulty] - DIFFICULTY_WEIGHT[a.difficulty];
        if (byValue !== 0) return byValue;
        return (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0);
      })
      .slice(0, FAN_COUNT);
  }, [unlocked]);

  // Шаг раскрытия: медали распределяются по всей ширине блока, последняя
  // упирается в правый край. Пока ширина не измерена — запасное значение.
  const openStep = showcase.length > 1 && boxWidth > 0
    ? Math.max(FAN_STACKED + 4, (boxWidth - FAN_SIZE) / (showcase.length - 1))
    : FAN_SIZE + 6;

  const toggleFan = () => {
    const to = fanOpen ? 0 : 1;
    setFanOpen(!fanOpen);
    Animated.timing(fan, {
      toValue: to,
      duration: timing.panel,
      easing: Easing.out(Easing.cubic),
      // Позиции считаются трансформами, поэтому нативный драйвер уместен и на
      // вебе даёт плавность без пересчёта layout.
      useNativeDriver: true,
    }).start();
  };

  // Разбивка по сложности отвечает на вопрос «куда расти»: по общему счётчику
  // не видно, что лёгкие почти собраны, а сложных нет вовсе.
  const tiers = React.useMemo(() => {
    const count = (list: Achievement[], d: AchievementDifficulty) =>
      list.filter((a) => a.difficulty === d).length;
    return [
      { key: "easy", label: "Лёгкие", got: count(unlocked, "easy"), total: count(unlocked, "easy") + count(locked, "easy") },
      { key: "medium", label: "Средние", got: count(unlocked, "medium"), total: count(unlocked, "medium") + count(locked, "medium") },
      { key: "hard", label: "Сложные", got: count(unlocked, "hard"), total: count(unlocked, "hard") + count(locked, "hard") },
    ];
  }, [unlocked, locked]);

  // Ширина сложенного веера. В раскрытом виде он растягивается на всю строку,
  // поэтому там ширину задаёт flex, а не это число.
  const stackedWidth = showcase.length > 0
    ? FAN_SIZE + (showcase.length - 1) * FAN_STACKED
    : FAN_SIZE;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: accents.violetDeep,
        },
      ]}
      onLayout={(e) => {
        // Внутренняя ширина блока без паддингов: по ней раскладывается веер.
        const w = e.nativeEvent.layout.width - 30;
        if (w > 0 && Math.abs(w - boxWidth) > 1) setBoxWidth(w);
      }}
    >
      {/* ── Веер ценных медалей и счётчик ── */}
      <View style={styles.lead}>
        {showcase.length === 0 ? (
          <View style={styles.fanEmpty}>
            <Glyph name="trophy" size={22} color="rgba(139,92,246,0.45)" />
          </View>
        ) : (
          <Pressable
            onPress={toggleFan}
            style={[
              styles.fanBox,
              fanOpen ? { flex: 1 } : { width: stackedWidth },
            ]}
            accessibilityRole="button"
            accessibilityLabel={fanOpen ? "Сложить лучшие награды" : "Раскрыть лучшие награды"}
          >
            {showcase.map((a, i) => (
              <FanMedal
                key={a.id}
                achievement={a}
                index={i}
                fan={fan}
                step={openStep}
                // В сложенном виде тап по медали раскрывает веер, в раскрытом —
                // складывает обратно. Карточка награды открывается из полного
                // списка ниже: иначе одно и то же нажатие делало бы разное.
                onPress={toggleFan}
              />
            ))}
          </Pressable>
        )}

        {/* Счётчик прячем, когда веер раскрыт: строка занята медалями. */}
        {!fanOpen && (
          <View style={styles.leadText}>
            <View style={styles.countRow}>
              <Text style={[styles.count, { color: colors.foreground }]}>{unlocked.length}</Text>
              <Text style={[styles.countTotal, { color: colors.mutedForeground }]}>/ {total}</Text>
            </View>
            <Text style={[styles.countCap, { color: colors.mutedForeground }]}>наград получено</Text>
          </View>
        )}

        {!fanOpen && (
          <TouchableOpacity
            style={[styles.openBtn, { backgroundColor: colors.primary + "14" }]}
            onPress={() => setExpanded((v) => !v)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Свернуть список наград" : "Показать все награды"}
          >
            <View style={{ transform: [{ rotate: expanded ? "-90deg" : "90deg" }] }}>
              <Glyph name="chevron" size={15} color={colors.primary} />
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Названия появляются только у раскрытого веера: в сложенном виде
          подписывать нечего, медали перекрывают друг друга. */}
      {fanOpen && showcase.length > 0 && (
        <View style={styles.fanLabels}>
          {showcase.map((a) => (
            <Text
              key={a.id}
              style={[styles.fanLabel, { color: a.color }]}
              numberOfLines={2}
            >
              {a.title}
            </Text>
          ))}
        </View>
      )}

      {/* ── Разбивка по сложности ── */}
      <View style={styles.tiers}>
        {tiers.map((t) => {
          const complete = t.total > 0 && t.got === t.total;
          const tint = t.got === 0
            ? colors.mutedForeground
            : complete ? accents.amber : colors.primary;
          return (
            <View
              key={t.key}
              style={[styles.tier, { backgroundColor: colors.muted, borderColor: colors.border }]}
            >
              <Text style={[styles.tierLabel, { color: colors.mutedForeground }]}>{t.label}</Text>
              <Text style={[styles.tierValue, { color: tint }]}>{t.got}/{t.total}</Text>
            </View>
          );
        })}
      </View>

      {/* ── Ближайшая награда ── */}
      {next && (
        <TouchableOpacity
          style={[styles.goal, { borderTopColor: colors.border }]}
          activeOpacity={0.75}
          onPress={() => setSelected({ achievement: next.achievement, isLocked: true })}
        >
          <View style={[styles.goalMedal, {
            borderColor: next.achievement.color + "66",
            backgroundColor: next.achievement.bgColor,
          }]}>
            {next.achievement.image ? (
              <Image source={next.achievement.image} style={styles.goalMedalImg} resizeMode="cover" />
            ) : (
              <Glyph name={fallbackGlyph(next.achievement.difficulty)} size={16} color={next.achievement.color} />
            )}
          </View>
          <View style={styles.goalText}>
            <Text style={[styles.goalTitle, { color: colors.foreground }]} numberOfLines={1}>
              {next.progress.remainingText}
            </Text>
            <View style={{ marginTop: 5 }}>
              <ProgressTrack percent={next.progress.percent} color={next.achievement.color} height={5} />
            </View>
          </View>
          <Text style={[styles.goalPercent, { color: next.achievement.color }]}>
            {next.progress.percent}%
          </Text>
        </TouchableOpacity>
      )}

      {/* Пустое состояние объясняет, что делать, а не констатирует пустоту. */}
      {unlocked.length === 0 && !next && (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>
          Выполни первое задание — первая медаль придёт сразу
        </Text>
      )}

      {/* ── Полный список: раскрывается на месте ── */}
      {expanded && (
        <View style={[styles.listBox, { borderTopColor: colors.border }]}>
          {unlocked.length > 0 && (
            <>
              <Text style={[styles.listLabel, { color: colors.mutedForeground }]}>
                Получено · {unlocked.length}
              </Text>
              <View style={styles.grid}>
                {unlocked.map((a) => (
                  <BadgeCard
                    key={a.id}
                    achievement={a}
                    isLocked={false}
                    onPress={() => setSelected({ achievement: a, isLocked: false })}
                  />
                ))}
              </View>
            </>
          )}

          {showLocked && locked.length > 0 && (
            <>
              <Text style={[styles.listLabel, { color: colors.mutedForeground, marginTop: 18 }]}>
                Ещё не получены · {locked.length}
              </Text>
              <View style={styles.grid}>
                {locked.map((a) => (
                  <BadgeCard
                    key={a.id}
                    achievement={a}
                    isLocked={true}
                    percent={stats ? achievementProgress(a, stats)?.percent : undefined}
                    onPress={() => setSelected({ achievement: a, isLocked: true })}
                  />
                ))}
              </View>
            </>
          )}
        </View>
      )}

      <BadgeDetailModal
        achievement={selected?.achievement ?? null}
        isLocked={selected?.isLocked ?? false}
        stats={stats}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.md, padding: 15, marginBottom: 16, borderWidth: 1,
    marginHorizontal: 20,
    shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.13, shadowRadius: 15, elevation: 3,
  },

  // ── Веер ──
  lead: { flexDirection: "row", alignItems: "center", gap: 14 },
  fanBox: { height: FAN_SIZE + 8, justifyContent: "center" },
  fanItem: { position: "absolute" },
  fanMedal: {
    width: FAN_SIZE, height: FAN_SIZE, borderRadius: FAN_SIZE / 2, borderWidth: 2,
    overflow: "hidden", alignItems: "center", justifyContent: "center",
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.32, shadowRadius: 8, elevation: 4,
  },
  fanImg: { width: FAN_SIZE, height: FAN_SIZE },
  fanEmpty: {
    width: FAN_SIZE, height: FAN_SIZE, borderRadius: FAN_SIZE / 2,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(139,92,246,0.35)",
    backgroundColor: "rgba(160,140,220,0.1)",
  },
  fanLabels: { flexDirection: "row", marginTop: 8 },
  fanLabel: {
    flex: 1, fontSize: 8, fontWeight: "800",
    textAlign: "center", lineHeight: 10.5, paddingHorizontal: 1,
  },

  leadText: { flex: 1, minWidth: 0 },
  countRow: { flexDirection: "row", alignItems: "baseline", gap: 5 },
  count: { fontSize: 27, fontWeight: "900", letterSpacing: -0.9, fontVariant: ["tabular-nums"] },
  countTotal: { fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  countCap: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  openBtn: {
    width: 34, height: 34, borderRadius: 12, marginLeft: "auto",
    alignItems: "center", justifyContent: "center",
  },

  // ── Уровни ──
  tiers: { flexDirection: "row", gap: 6, marginTop: 14 },
  tier: {
    flex: 1, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 6,
    alignItems: "center", borderWidth: 1,
  },
  tierLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase" },
  tierValue: { fontSize: 15, fontWeight: "900", marginTop: 3, fontVariant: ["tabular-nums"] },

  // ── Ближайшая награда ──
  goal: {
    flexDirection: "row", alignItems: "center", gap: 11,
    marginTop: 13, paddingTop: 13, borderTopWidth: 1,
  },
  goalMedal: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 2,
    overflow: "hidden", alignItems: "center", justifyContent: "center",
  },
  goalMedalImg: { width: 34, height: 34 },
  goalText: { flex: 1, minWidth: 0 },
  goalTitle: { fontSize: 12.5, fontWeight: "800" },
  goalPercent: { fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },

  empty: { fontSize: 12.5, marginTop: 13, lineHeight: 18 },

  // ── Полный список ──
  listBox: { marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  listLabel: {
    fontSize: 10, fontWeight: "900", letterSpacing: 1,
    textTransform: "uppercase", marginBottom: 10,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badgeWrap: { width: "22%", alignItems: "center" },
  badgeRing: {
    width: 60, height: 60, borderRadius: 30, borderWidth: 2,
    overflow: "hidden", justifyContent: "center", alignItems: "center",
  },
  badgeImg: { width: 60, height: 60 },
  badgeTitle: { fontSize: 9, fontWeight: "800", textAlign: "center", marginTop: 5, lineHeight: 12 },

  // ── Карточка награды ──
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,12,40,0.55)", justifyContent: "center", alignItems: "center", padding: 28 },
  modalCard: {
    borderRadius: radii.lg, padding: 28, width: "100%",
    alignItems: "center", shadowColor: "#6366f1", shadowOpacity: 0.2,
    shadowRadius: 26, shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  modalBadgeOuter: {
    width: 104, height: 104, borderRadius: 52, borderWidth: 2.5,
    overflow: "hidden", justifyContent: "center", alignItems: "center",
    marginBottom: 14,
  },
  modalBadgeImg: { width: 104, height: 104 },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.pill, borderWidth: 1, marginBottom: 10,
  },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  modalTitle: { fontSize: 21, fontWeight: "900", letterSpacing: -0.4, textAlign: "center", marginBottom: 14 },

  modalProgress: { width: "100%", borderRadius: radii.sm + 2, padding: 14, borderWidth: 1, marginBottom: 12 },
  modalProgressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  modalProgressText: { fontSize: 13, fontWeight: "800", flex: 1 },
  modalProgressPercent: { fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
  modalProgressCounter: { fontSize: 11.5, marginTop: 7, fontVariant: ["tabular-nums"] },

  infoBlock: { width: "100%", borderRadius: radii.sm + 2, padding: 14, borderWidth: 1, marginBottom: 18, gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  infoText: { fontSize: 13, lineHeight: 19 },
});
