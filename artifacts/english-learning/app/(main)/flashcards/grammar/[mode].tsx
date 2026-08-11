// ─────────────────────────────────────────────────────────────────────────────
// Тренажёр раздела «Учёба». Один экран на три режима:
//
//   verbs — вставить форму неправильного глагола;
//   tense — поставить глагол в заданное время (?tense=present_perfect);
//   build — собрать предложение по русскому переводу.
//
// Отличается только способ ответа: написать, выбрать вариант, собрать плитками.
// Три почти одинаковых экрана означали бы, что одну и ту же ошибку придётся
// починить три раза.
//
// ── ПОЧЕМУ ЭКРАН МОНТИРУЕТСЯ ЗАНОВО ─────────────────────────────────────────
// Все три режима живут на одном маршруте. Уход через панель вкладок экран не
// размонтирует, а вход в другой режим меняет только параметр — тот же компонент,
// то же состояние. Однажды это дало мешанину на экране: предложение из сборки
// предложений, перевод и подсказка из времён, разбор ошибки из третьего места и
// счётчик «2 из 8» от прошлого захода. Загрузка заданий висела на [mode, tense]
// и приносила новую подборку, а вердикт, номер карточки и счётчики оставались
// прежними.
//
// Дописать сброс девяти переменных в тот же эффект — решение на один раз: оно
// работает до следующей добавленной переменной, о которой забудут. Поэтому
// маршрут разделён на два компонента: внешний читает параметры и монтирует
// тренажёр с key, внутренний ничего о параметрах не знает. Другой режим, другое
// время или повторный вход — другой key, и React выбрасывает состояние целиком.
//
// ── «ЕЩЁ ЗАХОД» — ЭТО ЗАПРОС, А НЕ СБРОС ────────────────────────────────────
// Раньше кнопка просто ставила счётчики в ноль и показывала ТЕ ЖЕ карточки.
// Ученик закрывал двенадцать заданий и получал предложение пройти ровно их же.
// Теперь у захода есть номер, он уходит на сервер, и приходит следующая порция
// банка. Номер живёт здесь, а не в key маршрута: экран остаётся тем же самым,
// меняется только подборка, и незачем ради этого пересобирать компонент.
//
// ── Что перенесено из тренажёра слов ────────────────────────────────────────
// 1. Верный ответ листается сам, ошибка НЕ листается никогда. Разбор ошибки —
//    самая полезная секунда занятия, отмерять её таймером нельзя.
// 2. Разбор стоит ВНУТРИ карточки, под заданием: туда смотрит ученик.
// 3. Правило показывается сразу и целиком, без «подробнее». Объяснение за
//    нажатием — это объяснение, которого нет.
// 4. «Не знаю» есть всегда: иначе единственный выход из незнакомого задания —
//    набить наугад и получить ошибку.
//
// ── Очки показаны в трёх местах, и это не дублирование ──────────────────────
// Начисление без обратной связи не работает: очки, которых не видно, для ребёнка
// не существуют. Каждое место отвечает на свой вопрос:
//   шапка   — сколько я уже взял за этот заход;
//   вердикт — за что дали именно сейчас («+2»);
//   итоги   — сколько вышло всего.
//
// Дневной потолок показывается ТОЛЬКО когда он достигнут, и формулировкой «на
// сегодня достаточно», а не отказом. Постоянная строка «12 из 30» превратила бы
// занятие в выработку нормы, а упёршийся в потолок без объяснения решит, что
// что-то сломалось.
//
// ── Панель вкладок остаётся ─────────────────────────────────────────────────
// Экран не полноэкранный (его нет в FULLSCREEN_ROUTES): панель видна, и уйти по
// вкладкам можно не ища выход. Поэтому отступы берутся из screenTop/screenBottom
// — панель плавает ПОВЕРХ содержимого, и без запаса она накрыла бы поле ответа и
// кнопку «Проверить». Ровно так на итогах тренировки слов пропадала «Готово».
//
// ── ГРАБЛИ ──────────────────────────────────────────────────────────────────
// Предложение рисуется ОДНИМ Text с подставленным прочерком, а не строкой из
// кусков. Причины две: вложенный Text роняет Safari (см. шапку flashcards.tsx),
// а перенос длинной фразы по словам пришлось бы верстать вручную.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, TextInput, Platform,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { grammar, type GrammarCard, type GrammarMode, type GrammarSession, type GrammarVerdict } from "@/hooks/useGrammar";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Tile, XpBar } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";

/** Пауза перед автопереходом после ВЕРНОГО ответа. */
const NEXT_DELAY_OK = 1200;

/** Прочерк на месте пропуска: длиннее, чем «___», иначе его не видно. */
const BLANK = "______";

const TITLES: Record<GrammarMode, string> = {
  verbs: "Неправильные глаголы",
  tense: "Времена",
  build: "Собери предложение",
};

/**
 * Падение этого экрана иначе выглядело бы как «кнопка не работает»: навигатор
 * остался бы на предыдущем экране. Такую ловушку мы уже ставили на марафон по
 * той же причине.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "900", color: "#e11d48" }}>Тренажёр не открылся</Text>
      <Text style={{ fontSize: 13, lineHeight: 20, color: "#5b4f8e" }}>
        {error?.message ?? "Неизвестная ошибка"}
      </Text>
      {!!error?.stack && (
        <Text style={{ fontSize: 10, lineHeight: 15, color: "#8b7fb0" }}>{error.stack}</Text>
      )}
      <ChunkyButton label="Попробовать снова" icon="repeat" center onPress={() => { void retry(); }} />
    </ScrollView>
  );
}

/**
 * Маршрут: читает параметры и монтирует тренажёр заново на каждый заход.
 *
 * Вся работа этого компонента — key. Он и есть исправление мешанины на экране:
 * состояние прошлого захода физически не может дожить до следующего.
 */
export default function GrammarTrainerRoute() {
  const params = useLocalSearchParams<{ mode?: string; tense?: string }>();

  const mode: GrammarMode =
    params.mode === "tense" || params.mode === "build" ? params.mode : "verbs";
  const tense = typeof params.tense === "string" ? params.tense : undefined;

  // Счётчик заходов. Нужен для возврата в ТОТ ЖЕ режим: параметры не изменились,
  // key без него остался бы прежним, и ученик снова увидел бы разбор ошибки, с
  // которого ушёл. Он пришёл заниматься, а не перечитывать свой прошлый промах.
  const [visit, setVisit] = React.useState(0);
  const mounted = React.useRef(false);
  useFocusEffect(
    React.useCallback(() => {
      // Первый фокус — это и есть монтирование, второй раз стартовать не нужно:
      // иначе задания грузились бы дважды на каждом открытии.
      if (!mounted.current) {
        mounted.current = true;
        return;
      }
      setVisit((v) => v + 1);
    }, []),
  );

  return <GrammarTrainer key={`${mode}:${tense ?? ""}:${visit}`} mode={mode} tense={tense} />;
}

function GrammarTrainer({ mode, tense }: { mode: GrammarMode; tense?: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [session, setSession] = React.useState<GrammarSession | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pos, setPos] = React.useState(0);
  const [done, setDone] = React.useState(false);
  /** Номер захода: с ним сервер отдаёт следующую порцию банка. */
  const [round, setRound] = React.useState(0);

  // Ответ ученика: строка для письма, выбранный индекс для варианта, список
  // слов для сборки.
  const [typed, setTyped] = React.useState("");
  const [picked, setPicked] = React.useState<number | null>(null);
  const [built, setBuilt] = React.useState<number[]>([]);

  const [verdict, setVerdict] = React.useState<GrammarVerdict | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [answered, setAnswered] = React.useState(0);
  const [correctCount, setCorrectCount] = React.useState(0);
  const [points, setPoints] = React.useState(0);
  /** Потолок дня достигнут: сообщаем один раз, а не считаем норму вслух. */
  const [capped, setCapped] = React.useState(false);

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Загрузка висит на режиме, времени и номере захода. Режим и время меняться
  // не могут — при их смене компонент монтируется заново (см. key в маршруте),
  // а вот номер захода меняется кнопкой «Ещё заход» и приносит новую порцию.
  React.useEffect(() => {
    let alive = true;
    grammar.getSession(mode, tense, round)
      .then((s) => {
        if (!alive) return;
        setSession(s);
        setDone((s.cards ?? []).length === 0);
      })
      .catch((e) => alive && setError(e?.message ?? "Не удалось загрузить задания."));
    return () => { alive = false; };
  }, [mode, tense, round]);

  const cards: GrammarCard[] = session?.cards ?? [];
  const card = cards[pos];

  /** Сколько заходов подряд идут без повторов. Дальше банк идёт по второму кругу. */
  const batches = session?.batches ?? 1;
  const hasFresh = round + 1 < batches;

  // Выход задан явным адресом: router.back() в навигации по вкладкам возвращает
  // на ПЕРВУЮ вкладку, а не на экран, откуда пришли. Из режима времён уходим на
  // выбор времени — уводить сразу в корень раздела значит поставить ученика на
  // два шага дальше того места, откуда он пришёл.
  const exit = React.useCallback(() => {
    // Очки ушли в общий счёт, а статистика тем изменилась: экраны, которые их
    // показывают, обязаны перечитать данные.
    qc.invalidateQueries({ queryKey: ["grammar-overview"] });
    qc.invalidateQueries({ queryKey: ["grammar-stats"] });
    qc.invalidateQueries({ queryKey: ["gamification-stats"] });
    router.replace(mode === "tense" ? "/flashcards/tenses" : "/flashcards");
  }, [router, mode, qc]);

  const resetCard = React.useCallback(() => {
    setTyped("");
    setPicked(null);
    setBuilt([]);
    setVerdict(null);
  }, []);

  const goNext = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    resetCard();
    setPos((prev) => {
      const next = prev + 1;
      if (next >= cards.length) {
        setDone(true);
        return prev;
      }
      return next;
    });
  }, [cards.length, resetCard]);

  /**
   * Следующий заход: запрос за новой порцией, а не сброс счётчиков.
   *
   * session обнуляется намеренно — пока идёт загрузка, на экране крутится
   * ожидание. Оставить старые карточки значило бы показать ученику прежний
   * заход, который через секунду подменится другим прямо под руками.
   */
  const nextRound = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setSession(null);
    setError(null);
    setPos(0);
    setDone(false);
    setAnswered(0);
    setCorrectCount(0);
    setPoints(0);
    resetCard();
    setRound((r) => r + 1);
  }, [resetCard]);

  /** Отправить ответ на проверку. Эталон знает только сервер. */
  const submit = React.useCallback(async (given: string) => {
    if (!card || checking || verdict) return;
    setChecking(true);
    try {
      // Способ ответа влияет на ставку очков: письмо дороже выбора.
      const v = await grammar.check(card.id, given, card.input);
      setVerdict(v);
      setAnswered((n) => n + 1);
      setPoints((n) => n + (v.pointsEarned ?? 0));
      // Потолок: верный ответ есть, а очков за него нет.
      if (v.correct && (v.pointsEarned ?? 0) === 0) setCapped(true);
      if (v.correct) {
        setCorrectCount((n) => n + 1);
        // Верный ответ уходит сам. Ошибка ждёт, пока ученик прочитает разбор.
        timer.current = setTimeout(goNext, NEXT_DELAY_OK);
      }
    } catch (e: any) {
      // Сеть мигнула — это не ошибка ученика, поэтому в счётчики не идёт.
      setVerdict({
        correct: false,
        typo: false,
        expected: [],
        mistake: { headline: "Не удалось проверить", detail: e?.message ?? "Проверь соединение." },
      });
    } finally {
      setChecking(false);
    }
  }, [card, checking, verdict, goNext]);

  const giveUp = React.useCallback(() => {
    // Пустая строка — честный «не знаю»: сервер вернёт верный ответ и разбор.
    void submit("");
  }, [submit]);

  // ── экраны состояния ──
  if (error) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: screenTop(insets) }}>
        <Tile glow={colors.destructive} style={{ padding: 18 }}>
          <Text style={{ fontSize: 15, fontWeight: "900", color: colors.destructive, marginBottom: 8 }}>
            Задания не загрузились
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginBottom: 14 }}>{error}</Text>
          <ChunkyButton label="Назад" icon="chevron" center onPress={exit} />
        </Tile>
      </ScrollView>
    );
  }

  if (!session) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (done) {
    const accuracy = answered > 0 ? Math.round((correctCount / answered) * 100) : 0;
    return (
      <ScrollView contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: screenTop(insets),
        paddingBottom: screenBottom(insets),
      }}>
        <Text style={{ fontSize: 26, fontWeight: "900", color: colors.foreground, marginBottom: 16 }}>
          {answered > 0 ? "Заход закончен" : "Пока нет заданий"}
        </Text>

        {answered > 0 ? (
          <>
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
              <Tile glow={colors.primary} style={{ flex: 1, alignItems: "center", paddingVertical: 18 }}>
                <Text style={{ fontSize: 28, fontWeight: "900", color: colors.foreground }}>{answered}</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>заданий</Text>
              </Tile>
              <Tile glow={accents.amber} style={{ flex: 1, alignItems: "center", paddingVertical: 18 }}>
                <Text style={{ fontSize: 28, fontWeight: "900", color: colors.foreground }}>{accuracy}%</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>с первого раза</Text>
              </Tile>
            </View>

            {/* Плитка очков — только когда они есть. Ноль в наградной плитке —
                это не награда, тот же приём, что на итогах тренировки слов. */}
            {points > 0 && (
              <Tile glow={accents.magenta} style={{ alignItems: "center", paddingVertical: 18, marginBottom: 12 }}>
                <Text style={{ fontSize: 28, fontWeight: "900", color: colors.foreground }}>{`+${points}`}</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>очков</Text>
              </Tile>
            )}

            {capped && (
              <Text style={{ fontSize: 12.5, lineHeight: 19, color: colors.mutedForeground, marginBottom: 12 }}>
                Очки за грамматику на сегодня закончились — дальше занятие идёт без
                них. Это не ограничение занятий, а защита от накрутки: завтра
                счётчик начнётся заново.
              </Text>
            )}

            {/* Кнопка ведёт на СЛЕДУЮЩУЮ порцию банка. Когда новых заданий
                больше нет, подпись предупреждает об этом честно: обещать
                бесконечную новизну нельзя, банк конечен. */}
            <ChunkyButton
              label="Ещё заход"
              sublabel={hasFresh ? "дальше новые задания" : "новые кончились, пойдёт второй круг"}
              icon="repeat"
              onPress={nextRound}
              style={{ marginBottom: 12 }}
            />
          </>
        ) : (
          <Text style={{ fontSize: 14, lineHeight: 21, color: colors.mutedForeground, marginBottom: 18 }}>
            Для твоего уровня в этом режиме заданий пока нет. Они появятся, когда уровень подрастёт.
          </Text>
        )}

        <ChunkyButton label="Выйти" icon="chevron" tone="dark" onPress={exit} />
      </ScrollView>
    );
  }

  if (!card) return null;

  // Предложение с прочерком или с ответом: одним Text, см. ГРАБЛИ в шапке.
  const shown = verdict?.full && verdict.correct === false
    ? verdict.full
    : card.text.replace("___", BLANK);

  const canSubmit =
    card.input === "type" ? typed.trim().length > 0
      : card.input === "choice" ? picked !== null
      : built.length > 0;

  const builtText = built.map((i) => card.tiles?.[i] ?? "").join(" ");

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: screenTop(insets),
        paddingBottom: screenBottom(insets),
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Шапка: выход, название режима, прогресс, очки за заход */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <Pressable onPress={exit} hitSlop={10} accessibilityRole="button" accessibilityLabel="Выйти">
          <Glyph name="close" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground }} numberOfLines={1}>
            {TITLES[mode]}
          </Text>
          <Text style={{ fontSize: 11, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
            {pos + 1} из {cards.length} · уровень {card.level}
          </Text>
        </View>
        {/* Счётчик очков за заход. Появляется с первым начислением: нулевой
            счётчик в шапке — это обещание, которое пока не выполнено. */}
        {points > 0 && (
          <Text style={{ fontSize: 15, fontWeight: "900", color: colors.primary, fontVariant: ["tabular-nums"] }}>
            {`+${points}`}
          </Text>
        )}
      </View>
      <XpBar progress={cards.length > 0 ? (pos + 1) / cards.length : 0} height={8} shine={false} />

      {/* Карточка задания */}
      <Tile glow={accents.violetDeep} style={{ padding: 18, marginTop: 16 }}>
        <Text style={{
          fontSize: 11, fontWeight: "800", color: colors.mutedForeground,
          textTransform: "uppercase", letterSpacing: 1.2, textAlign: "center",
        }}>
          {card.input === "assemble" ? "собери предложение" : card.input === "choice" ? "выбери форму" : "напиши форму"}
        </Text>

        {/* Задание. В сборке главное — русский перевод, в остальных — фраза. */}
        {card.input === "assemble" ? (
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, textAlign: "center", marginTop: 12, lineHeight: 28 }}>
            {card.ru}
          </Text>
        ) : (
          <>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, textAlign: "center", marginTop: 12, lineHeight: 30 }}>
              {shown}
            </Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", marginTop: 8, lineHeight: 19 }}>
              {card.ru}
            </Text>
          </>
        )}

        {/* Что именно требуется: время или форма. Без этой строки задание
            становится угадыванием — по одному предложению форму не выбрать. */}
        {!!card.hint && (
          <View style={{ alignSelf: "center", marginTop: 12, backgroundColor: colors.primary + "18", borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary }}>
              {card.base ? `${card.hint} · ${card.base}` : card.hint}
            </Text>
          </View>
        )}

        {/* Разбор ответа */}
        {verdict && (
          <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" }}>
              <Glyph
                name={verdict.correct ? "check" : "close"}
                size={18}
                color={verdict.correct ? colors.success : colors.destructive}
              />
              <Text style={{ fontSize: 16, fontWeight: "900", color: verdict.correct ? colors.success : colors.destructive }}>
                {verdict.correct ? (verdict.typo ? "Верно, но с опечаткой" : "Верно!") : "Неверно"}
              </Text>
              {/* За что дали именно сейчас. Рядом с вердиктом, а не в шапке:
                  связь «ответил верно → получил» должна быть видна сразу. */}
              {!!verdict.pointsEarned && verdict.pointsEarned > 0 && (
                <Text style={{ fontSize: 15, fontWeight: "900", color: accents.magenta, fontVariant: ["tabular-nums"] }}>
                  {`+${verdict.pointsEarned}`}
                </Text>
              )}
            </View>

            {!verdict.correct && verdict.expected.length > 0 && (
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, textAlign: "center", marginTop: 8 }}>
                {`Правильно: ${verdict.expected[0]}`}
              </Text>
            )}

            {/* Разбор именно ЭТОЙ ошибки. Правило идёт следом, как обоснование. */}
            {!!verdict.mistake && (
              <View style={{ marginTop: 12, backgroundColor: colors.warning + "14", borderRadius: radii.sm, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>
                  {verdict.mistake.headline}
                </Text>
                <Text style={{ fontSize: 13, lineHeight: 20, color: colors.mutedForeground, marginTop: 6 }}>
                  {verdict.mistake.detail}
                </Text>
              </View>
            )}

            {!!verdict.rule && (
              <View style={{ marginTop: 10, backgroundColor: colors.accent, borderRadius: radii.sm, padding: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: "900", color: colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                  {verdict.rule.title}
                </Text>
                <Text style={{ fontSize: 13, lineHeight: 20, color: colors.foreground, marginTop: 6 }}>
                  {verdict.rule.text}
                </Text>
                {verdict.rule.markers.length > 0 && (
                  <Text style={{ fontSize: 12, lineHeight: 18, color: colors.mutedForeground, marginTop: 8 }}>
                    {`Слова-подсказки: ${verdict.rule.markers.join(", ")}`}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}
      </Tile>

      {/* Ответ */}
      {!verdict && card.input === "type" && (
        <View style={{ marginTop: 16 }}>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder="ответ"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            onSubmitEditing={() => canSubmit && submit(typed)}
            returnKeyType="done"
            style={{
              backgroundColor: colors.card,
              borderRadius: radii.md,
              borderWidth: 2,
              borderColor: colors.border,
              paddingHorizontal: 16,
              paddingVertical: Platform.OS === "web" ? 14 : 12,
              fontSize: 18,
              fontWeight: "700",
              color: colors.foreground,
            }}
          />
          <ChunkyButton
            label={checking ? "Проверяю…" : "Проверить"}
            icon="check"
            center
            disabled={!canSubmit || checking}
            onPress={() => submit(typed)}
            style={{ marginTop: 12 }}
          />
        </View>
      )}

      {!verdict && card.input === "choice" && (
        <View style={{ marginTop: 16, gap: 10 }}>
          {(card.options ?? []).map((o, i) => (
            <Pressable
              key={`${o}-${i}`}
              onPress={() => { setPicked(i); void submit(o); }}
              accessibilityRole="button"
              style={{
                backgroundColor: picked === i ? colors.primary + "22" : colors.card,
                borderRadius: radii.md,
                borderWidth: 2,
                borderColor: picked === i ? colors.primary : colors.border,
                paddingVertical: 15,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground }}>{o}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!verdict && card.input === "assemble" && (
        <View style={{ marginTop: 16 }}>
          {/* Строка сборки: то, что уже собрано. Пустая — с подсказкой, иначе
              непонятно, что это за полоса. */}
          <View style={{
            minHeight: 58, backgroundColor: colors.card, borderRadius: radii.md,
            borderWidth: 2, borderColor: colors.border, padding: 12, justifyContent: "center",
          }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: built.length > 0 ? colors.foreground : colors.mutedForeground, lineHeight: 24 }}>
              {built.length > 0 ? builtText : "нажимай слова по порядку"}
            </Text>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {(card.tiles ?? []).map((w, i) => {
              const used = built.includes(i);
              return (
                <Pressable
                  key={`${w}-${i}`}
                  onPress={() => setBuilt((prev) => (prev.includes(i) ? prev : [...prev, i]))}
                  disabled={used}
                  accessibilityRole="button"
                  style={{
                    backgroundColor: used ? colors.accent : colors.card,
                    opacity: used ? 0.45 : 1,
                    borderRadius: radii.sm,
                    borderWidth: 2,
                    borderColor: colors.border,
                    paddingHorizontal: 13,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>{w}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <Pressable
              onPress={() => setBuilt((prev) => prev.slice(0, -1))}
              disabled={built.length === 0}
              accessibilityRole="button"
              style={{
                flexDirection: "row", alignItems: "center", gap: 7,
                backgroundColor: colors.accent, borderRadius: radii.pill,
                paddingHorizontal: 15, paddingVertical: 11, opacity: built.length === 0 ? 0.5 : 1,
              }}
            >
              <Glyph name="backspace" size={16} color={colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary }}>Стереть</Text>
            </Pressable>
          </View>

          <ChunkyButton
            label={checking ? "Проверяю…" : "Проверить"}
            icon="check"
            center
            disabled={!canSubmit || checking}
            onPress={() => submit(builtText)}
            style={{ marginTop: 12 }}
          />
        </View>
      )}

      {/* «Не знаю» — всегда, пока нет разбора. Без неё единственный выход из
          незнакомого задания — набить наугад и получить ошибку. */}
      {!verdict && (
        <Pressable
          onPress={giveUp}
          disabled={checking}
          accessibilityRole="button"
          style={{ alignSelf: "center", marginTop: 16, paddingVertical: 10, paddingHorizontal: 18 }}
        >
          <Text style={{ fontSize: 13, fontWeight: "800", color: colors.mutedForeground }}>Не знаю</Text>
        </Pressable>
      )}

      {/* Ошибка листается только вручную: разбор нельзя отмерять таймером. */}
      {verdict && !verdict.correct && (
        <ChunkyButton label="Дальше" icon="arrowRight" chevron onPress={goNext} style={{ marginTop: 16 }} />
      )}
    </ScrollView>
  );
}
