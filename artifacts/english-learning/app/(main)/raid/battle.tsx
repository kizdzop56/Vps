// ─────────────────────────────────────────────────────────────────────────────
// Бой рейда: практика, по которой бьют босса.
//
// ── Почему это отдельный экран, а не переход в «Учёбу» ──────────────────────
// «Учёба» учит: знакомство со словом, интервальное повторение, разбор ошибки с
// правилом, дневные нормы, очки. Бой практикует: применяешь то, что уже знаешь,
// быстро и подряд. Кнопка «бить босса», уводившая в «Учёбу», была неправильной в
// обе стороны: рейд начинал гнать темп обучению, а обучение тормозило рейд
// разборами.
//
// Здесь НЕТ объяснений ошибок. Ответил неверно — увидел правильный ответ одной
// строкой и пошёл дальше. Ни правил, ни разбора: за этим ходят в «Учёбу».
//
// Задания приходят с сервера уже готовыми и БЕЗ правильного ответа: и проверка,
// и способ ответа (от него зависит ставка урона) живут на сервере, а клиент
// отправляет только номер выданного задания и сам ответ. Повторов в подборке
// нет: сервер помнит, что уже спрашивал (см. lib/raidSession.ts).
//
// ── Босс занимает почти половину экрана ─────────────────────────────────────
// Он здесь не украшение: это единственная обратная связь боя. Цифра урона
// вылетает поверх него (слой в раскладке вкладок), шкала под ним ползёт вниз,
// фигура вздрагивает от каждого попадания. Маленькая картинка всё это съедала,
// поэтому размер считается от РЕАЛЬНОЙ высоты окна, а не задан числом: на
// маленьком телефоне босс не выдавит задание за край, на большом не потеряется.
//
// Выход — router.replace("/raid"), а не router.back(): внутри вкладок back
// возвращает на ПЕРВУЮ вкладку, а не на предыдущий экран.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, TextInput, ActivityIndicator,
  useWindowDimensions, type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Pill } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { screenTop } from "@/constants/layout";
import { BossArt } from "@/components/raid/BossArt";
import { speakWord } from "@/hooks/useFlashcards";
import { damageTitle, raid, type RaidAnswer } from "@/hooks/useRaid";

/** Доля высоты окна под фигуру босса. Почти половина — так и просили. */
const BOSS_HEIGHT_SHARE = 0.44;
/** Шире этого фигура не растёт: на планшете иначе распухает до нелепого. */
const BOSS_WIDTH_SHARE = 0.92;

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "900", color: "#e11d48" }}>Бой не открылся</Text>
      <Text style={{ fontSize: 13, lineHeight: 20, color: "#5b4f8e" }}>
        {error?.message ?? "Неизвестная ошибка"}
      </Text>
      <ChunkyButton label="Попробовать снова" icon="repeat" center onPress={() => { void retry(); }} />
    </ScrollView>
  );
}

/** Итог одного захода: по нему рисуется финальный экран. */
interface Tally {
  damage: number;
  correct: number;
  total: number;
  coins: number;
  bestCombo: number;
}

export default function RaidBattle() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { width, height } = useWindowDimensions();

  const battleQ = useQuery({
    queryKey: ["raid-battle"],
    queryFn: raid.battle,
    // Заход одноразовый: каждый вход в бой — новая подборка с сервера.
    staleTime: 0,
    gcTime: 0,
  });
  const stateQ = useQuery({ queryKey: ["raid"], queryFn: raid.current, staleTime: 15_000 });

  const [index, setIndex] = React.useState(0);
  const [given, setGiven] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);
  const [verdict, setVerdict] = React.useState<RaidAnswer | null>(null);
  const [sending, setSending] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [hitToken, setHitToken] = React.useState(0);
  const [tally, setTally] = React.useState<Tally>({ damage: 0, correct: 0, total: 0, coins: 0, bestCombo: 0 });

  /** Живые цифры босса: обновляются ответами, не запросами. */
  const [hp, setHp] = React.useState<{ left: number; total: number; phase: string } | null>(null);
  const [stamina, setStamina] = React.useState<number | null>(null);
  const [combo, setCombo] = React.useState(0);

  const tasks = battleQ.data?.tasks ?? [];
  const task = tasks[index];
  const snapshot = stateQ.data;

  // Первый показ: цифры берём из состояния рейда, дальше их двигают ответы.
  React.useEffect(() => {
    if (!snapshot || hp) return;
    setHp({ left: snapshot.event.hpLeft, total: snapshot.event.hpTotal, phase: snapshot.event.phase });
    setStamina(snapshot.me.stamina);
    setCombo(snapshot.me.combo);
  }, [snapshot, hp]);

  // Аудирование: слово проигрывается само, иначе задание невыполнимо.
  const listenId = task?.listen ? task.taskId : null;
  const listenWordId = task?.wordId;
  const listenPrompt = task?.prompt;
  React.useEffect(() => {
    if (!listenId || !listenWordId || !listenPrompt) return;
    speakWord(listenWordId, listenPrompt);
  }, [listenId, listenWordId, listenPrompt]);

  const reset = () => {
    setGiven("");
    setPicked([]);
    setVerdict(null);
  };

  const send = async (answer: string) => {
    if (!task || sending || verdict) return;
    setSending(true);
    try {
      const res = await raid.answer(task.taskId, answer);
      setVerdict(res);
      setHitToken((t) => t + 1);
      const hit = res.raid;
      if (hit) {
        setHp({ left: hit.hpLeft, total: hit.hpTotal, phase: hit.phase });
        setStamina(hit.stamina);
        setCombo(hit.combo);
        setTally((cur) => ({
          damage: cur.damage + hit.damage,
          correct: cur.correct + (res.correct ? 1 : 0),
          total: cur.total + 1,
          coins: cur.coins + hit.coinsEarned,
          bestCombo: Math.max(cur.bestCombo, hit.combo),
        }));
      } else {
        setTally((cur) => ({ ...cur, correct: cur.correct + (res.correct ? 1 : 0), total: cur.total + 1 }));
      }
      // Табло рейда пересчитается само: у него свой ключ запроса.
      void qc.invalidateQueries({ queryKey: ["raid"] });
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Ответ не отправился");
      setTimeout(() => setProblem(null), 2600);
    } finally {
      setSending(false);
    }
  };

  const next = () => {
    reset();
    setIndex((i) => i + 1);
  };

  const again = () => {
    reset();
    setIndex(0);
    setTally({ damage: 0, correct: 0, total: 0, coins: 0, bestCombo: 0 });
    void battleQ.refetch();
  };

  const leave = () => router.replace("/raid" as any);

  if (battleQ.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (tasks.length === 0) {
    return (
      <View style={{ flex: 1, padding: 24, paddingTop: screenTop(insets, 40), gap: 14 }}>
        <Text style={{ fontSize: 22, fontWeight: "900", color: colors.foreground }}>Заданий пока нет</Text>
        <Text style={{ fontSize: 13.5, lineHeight: 21, color: colors.mutedForeground }}>
          Бой берёт задания из твоих колод и банка грамматики. Пройди тест уровня или добавь
          колоду слов, и босс получит по зубам.
        </Text>
        <ChunkyButton label="К боссу" icon="arrowRight" center onPress={leave} />
      </View>
    );
  }

  // ── Итог захода ──────────────────────────────────────────────────────────
  if (!task) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: screenTop(insets, 20), gap: 14 }}>
        <Text style={{ fontSize: 27, fontWeight: "900", letterSpacing: -0.8, color: colors.foreground }}>
          Заход закрыт
        </Text>

        <LinearGradient
          colors={["#1e1b4b", "#6d28d9"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={{ borderRadius: radii.lg, padding: 18, gap: 4 }}
        >
          <Text style={{ fontSize: 11, fontWeight: "900", color: "rgba(255,255,255,0.7)", letterSpacing: 1.2 }}>
            НАНЕСЕНО УРОНА
          </Text>
          <Text style={{ fontSize: 42, fontWeight: "900", color: "#fff", letterSpacing: -1.6 }}>
            {tally.damage.toLocaleString("ru-RU")}
          </Text>
          <Text style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)" }}>
            {tally.correct} из {tally.total} верно · лучшее комбо {tally.bestCombo} · +{tally.coins} монет
          </Text>
        </LinearGradient>

        <Text style={{ fontSize: 12.5, lineHeight: 19, color: colors.mutedForeground }}>
          Следующий заход будет из других заданий: то, что уже спрашивали, вернётся не раньше чем
          через несколько дней и другим вопросом.
        </Text>

        <ChunkyButton label="Ещё заход" icon="repeat" center onPress={again} />
        <ChunkyButton label="К боссу" icon="arrowRight" center tone="dark" onPress={leave} />
      </ScrollView>
    );
  }

  const ratio = hp && hp.total > 0 ? Math.max(0, hp.left / hp.total) : 1;
  const assembled = picked.join(task.kind === "word" ? "" : " ");
  const bossSize = Math.round(Math.min(width * BOSS_WIDTH_SHARE, height * BOSS_HEIGHT_SHARE));

  return (
    <View style={{ flex: 1, paddingTop: screenTop(insets) }}>
      {/* ── Шапка: выход, шкала здоровья, энергия ─────────────────────── */}
      <View style={{ paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPress={leave}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Выйти из боя"
          style={{ padding: 4 }}
        >
          <Glyph name="close" size={22} color={colors.mutedForeground} />
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 12.5, fontWeight: "900", color: colors.foreground }}>
              {snapshot?.event.bossShort ?? "Босс"}
              {hp ? ` · ${hp.left.toLocaleString("ru-RU")} HP` : ""}
            </Text>
            <Text style={{ fontSize: 11.5, fontWeight: "700", color: colors.mutedForeground }}>
              {index + 1} / {tasks.length}
            </Text>
          </View>
          <View style={{
            height: 10, borderRadius: 10, marginTop: 4, overflow: "hidden",
            backgroundColor: "rgba(109,40,217,0.16)",
          }}>
            <View style={{ width: `${Math.round(ratio * 100)}%`, height: "100%" }}>
              <LinearGradient
                colors={hp?.phase === "berserk" ? ["#fb7185", "#e11d48"] : ["#f472b6", "#a855f7"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1, borderRadius: 10 }}
              />
            </View>
          </View>
        </View>

        <View style={{ alignItems: "center" }}>
          <Glyph name="spark" size={16} color={accents.amber} />
          <Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground }}>
            {stamina ?? "—"}
          </Text>
        </View>
      </View>

      {/* ── Босс: почти половина экрана ───────────────────────────────── */}
      <View style={{ height: bossSize, alignItems: "center", justifyContent: "center" }}>
        <BossArt
          boss={snapshot?.event.boss ?? "golem"}
          colors={snapshot?.event.colors ?? ["#818cf8", "#4338ca"]}
          phase={hp?.phase ?? "normal"}
          hitToken={hitToken}
          size={bossSize}
          defeated={!!hp && hp.left <= 0}
        />
      </View>

      {/* ── Задание ──────────────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 12) + 20,
          gap: 10,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}>
          <Pill text={damageTitle(task.damage)} tone="soft" color={colors.primary} />
          {combo >= 3 && <Pill text={`комбо ${combo}`} tone="soft" color={accents.amber} />}
          {task.listen && <Pill text="на слух" tone="soft" color={accents.magenta} />}
        </View>

        <View style={cardStyle(colors)}>
          {task.listen ? (
            <Pressable
              onPress={() => { if (task.wordId) speakWord(task.wordId, task.prompt); }}
              style={{ alignItems: "center", gap: 6, paddingVertical: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Прослушать снова"
            >
              <Glyph name="sound" size={34} color={colors.primary} />
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.mutedForeground }}>
                Нажми, чтобы прослушать снова
              </Text>
            </Pressable>
          ) : (
            <Text style={{
              fontSize: task.prompt.length > 40 ? 18 : 24,
              fontWeight: "900",
              letterSpacing: -0.6,
              color: colors.foreground,
              textAlign: "center",
            }}>
              {task.prompt}
            </Text>
          )}
          {!!task.hint && (
            <Text style={{
              fontSize: 13, lineHeight: 19, color: colors.mutedForeground,
              textAlign: "center", marginTop: 6,
            }}>
              {task.hint}
            </Text>
          )}
        </View>

        {/* Варианты */}
        {task.input === "choice" && (task.options ?? []).map((option) => {
          const chosen = given === option;
          const wrongPick = !!verdict && chosen && !verdict.correct;
          const rightAnswer = !!verdict && verdict.expected.some(
            (e) => e.trim().toLowerCase() === option.trim().toLowerCase(),
          );
          return (
            <Pressable
              key={option}
              disabled={!!verdict || sending}
              onPress={() => { setGiven(option); void send(option); }}
              style={cardStyle(colors, {
                paddingVertical: 13,
                borderWidth: 2,
                borderColor: rightAnswer
                  ? colors.primary
                  : wrongPick ? "#e11d48" : colors.border,
                backgroundColor: rightAnswer
                  ? "rgba(139,92,246,0.12)"
                  : wrongPick ? "rgba(225,29,72,0.09)" : colors.card,
              })}
            >
              <Text style={{ fontSize: 15.5, fontWeight: "800", color: colors.foreground, textAlign: "center" }}>
                {option}
              </Text>
            </Pressable>
          );
        })}

        {/* Ввод */}
        {task.input === "type" && (
          <View style={{ gap: 10 }}>
            <TextInput
              value={given}
              onChangeText={setGiven}
              editable={!verdict && !sending}
              placeholder={task.answerLang === "ru" ? "Ответ по-русски" : "Ответ по-английски"}
              placeholderTextColor="#a99fce"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => { if (given.trim()) void send(given); }}
              style={{
                backgroundColor: colors.card,
                borderRadius: radii.md,
                borderWidth: 2,
                borderColor: verdict
                  ? (verdict.correct ? colors.primary : "#e11d48")
                  : colors.border,
                paddingHorizontal: 15,
                paddingVertical: 13,
                fontSize: 17,
                fontWeight: "700",
                color: colors.foreground,
              }}
            />
            {!verdict && (
              <ChunkyButton
                label="Ударить"
                icon="flame"
                center
                onPress={() => { if (given.trim()) void send(given); }}
                style={{ opacity: given.trim() ? 1 : 0.45 }}
              />
            )}
          </View>
        )}

        {/* Сборка из плиток */}
        {task.input === "assemble" && (
          <View style={{ gap: 10 }}>
            <View style={cardStyle(colors, { minHeight: 54, justifyContent: "center" })}>
              <Text style={{
                fontSize: 18, fontWeight: "900", color: colors.foreground, textAlign: "center",
              }}>
                {assembled || "…"}
              </Text>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {(task.tiles ?? []).map((tile, i) => {
                const used = picked.filter((p) => p === tile).length;
                const total = (task.tiles ?? []).filter((t) => t === tile).length;
                const spent = used >= total;
                return (
                  <Pressable
                    key={`${tile}-${i}`}
                    disabled={spent || !!verdict || sending}
                    onPress={() => setPicked((cur) => [...cur, tile])}
                    style={{
                      paddingHorizontal: 13,
                      paddingVertical: 10,
                      borderRadius: radii.sm,
                      backgroundColor: spent ? "rgba(120,110,170,0.1)" : colors.card,
                      borderWidth: 1.5,
                      borderColor: spent ? "transparent" : "rgba(139,92,246,0.35)",
                      opacity: spent ? 0.4 : 1,
                    }}
                  >
                    <Text style={{ fontSize: 15.5, fontWeight: "800", color: colors.foreground }}>
                      {tile}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {!verdict && (
              <View style={{ flexDirection: "row", gap: 9 }}>
                <Pressable
                  onPress={() => setPicked((cur) => cur.slice(0, -1))}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 13, borderRadius: radii.md,
                    backgroundColor: "rgba(120,110,170,0.12)", alignItems: "center",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Стереть последнее"
                >
                  <Glyph name="backspace" size={20} color={colors.mutedForeground} />
                </Pressable>
                <ChunkyButton
                  label="Ударить"
                  icon="flame"
                  center
                  onPress={() => { if (picked.length > 0) void send(assembled); }}
                  style={{ flex: 1, opacity: picked.length > 0 ? 1 : 0.45 }}
                />
              </View>
            )}
          </View>
        )}

        {/* Итог ответа: верно или правильный ответ. Без разбора и правил. */}
        {!!verdict && (
          <View style={cardStyle(colors, {
            backgroundColor: verdict.correct ? "rgba(139,92,246,0.1)" : "rgba(225,29,72,0.08)",
            borderColor: verdict.correct ? "rgba(139,92,246,0.4)" : "rgba(225,29,72,0.35)",
            gap: 4,
          })}>
            <Text style={{
              fontSize: 16, fontWeight: "900",
              color: verdict.correct ? colors.primary : "#e11d48",
            }}>
              {verdict.correct
                ? verdict.typo
                  ? "Верно, но с опечаткой"
                  : `Попадание${verdict.raid ? ` −${verdict.raid.damage}` : ""}`
                : "Мимо"}
            </Text>
            {(!verdict.correct || verdict.typo) && verdict.expected.length > 0 && (
              <Text style={{ fontSize: 13.5, lineHeight: 20, color: colors.foreground }}>
                Правильно: {verdict.expected.slice(0, 3).join(" / ")}
              </Text>
            )}
            {verdict.raid?.blocked === "stamina" && (
              <Text style={{ fontSize: 12.5, lineHeight: 19, color: colors.mutedForeground }}>
                Энергия кончилась: ответ принят, но урон не пошёл. Восстановится сама, или купи
                полную энергию за монеты.
              </Text>
            )}
            <ChunkyButton
              label={index + 1 >= tasks.length ? "Итог захода" : "Дальше"}
              icon="arrowRight"
              center
              onPress={next}
              style={{ marginTop: 8 }}
            />
          </View>
        )}
      </ScrollView>

      {!!problem && (
        <View style={{
          position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 12,
          backgroundColor: "#3b1d4d", borderRadius: radii.md, padding: 12,
        }}>
          <Text style={{ color: "#fff", fontSize: 12.5, fontWeight: "700" }}>{problem}</Text>
        </View>
      )}
    </View>
  );
}

/** Корпус карточки: как на остальных экранах раздела. */
function cardStyle(colors: any, extra?: ViewStyle): ViewStyle {
  return {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
    shadowColor: accents.violetDeep,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
    ...extra,
  };
}
