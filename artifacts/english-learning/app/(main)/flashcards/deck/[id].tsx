// Детальная страница колоды.
//
// Что здесь важно и почему так сделано:
//  1. Колода запрашивается отдельным эндпоинтом (fc.getDeck). Раньше страница
//     искала колоду в полном списке всех колод, а список читал на сервере всю
//     таблицу слов — пока он грузился, колода считалась ненайденной: учитель
//     видел вместо названия «Колода», а форма добавления слов не появлялась.
//  2. Право на правку берём с сервера (canEdit), а не выводим из !isSystem:
//     у ненайденной колоды прежняя проверка молча давала запрет.
//  3. Ошибки загрузки показываем с кнопкой «Повторить», а не бесконечным
//     спиннером.
//  4. Учителю/админу вместо «Начать учить» — «Предпросмотр»: тренировка ведёт
//     учёт прогресса, а учителю нужно просто посмотреть колоду глазами ученика.
//     Ученику в его собственной колоде «Предпросмотр» не нужен — это функция
//     учителя, поэтому ветка зависит от canAssign (роль), а не от canEdit
//     (владение колодой): ученик — владелец своей колоды, но не учитель.
//  5. Эмодзи на экране не используются: значок колоды рисует DeckGlyph, у слов
//     показываем метку из первой буквы (поле word.emoji приходит из словаря и
//     на разных платформах выглядит по-разному). Данные при этом не меняются.
//
// ── Единая порода поверхностей ──────────────────────────────────────────────
// Экран приведён к тому же языку, что «Слова», статистика и марафон: у каждой
// белой карточки НИЖНЯЯ ГРАНЬ — отдельный слой под корпусом (см. Chunky/
// ChunkyTap), проседающий при нажатии там, где нажатие что-то открывает.
// Значки — из общего набора Glyph (components/ui/Glyph.tsx), а не системные
// Feather: у Glyph одна толщина штриха на весь продукт и он красится темой.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from "react";
import {
  View, Text, TouchableOpacity, Pressable, ScrollView, TextInput, ActivityIndicator,
  Alert, Platform, Modal, Dimensions, Animated, Easing,
  type ViewStyle, type StyleProp,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc, apiFetch, speak, speakWord, speechAvailable, type ManualWordInput, type FlashcardWordWithEmoji } from "@/hooks/useFlashcards";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import WordPicker from "@/components/WordPicker";
import { DeckGlyph } from "@/components/ui/DeckGlyph";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { ChunkyButton, SectionLabel } from "@/components/ui/GameKit";
import { accents, gradients, radii, chunky, timing } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";

type StudentItem = { id: number; name: string; surname?: string | null; username: string };

const NATIVE_DRIVER = Platform.OS !== "web";

/** Толщина нижней грани и её цвет под светлой карточкой — как на «Словах». */
const EDGE = 5;
const EDGE_DECK_ROW = 6;
const EDGE_LIGHT = "#c9bdf0";

/** Размер ведущего значка строки — единый на весь экран. */
const ICON = 46;

// Подтверждение: на web — window.confirm, на нативе — Alert.
function confirmAction(title: string, message: string, onYes: () => void) {
  if (Platform.OS === "web") {
    if ((globalThis as any).confirm?.(message)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: "Отмена", style: "cancel" },
    { text: "Удалить", style: "destructive", onPress: onYes },
  ]);
}

// ── Объёмные оболочки (тот же приём, что на «Словах»/статистике/марафоне) ──

/** Грань без проседания: для того, что не нажимается. */
function Chunky({
  color = EDGE_LIGHT, edge = EDGE, radius = radii.md, style, children,
}: {
  color?: string; edge?: number; radius?: number;
  style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  return (
    <View style={[{ paddingBottom: edge }, style]}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: edge, bottom: 0,
        borderRadius: radius, backgroundColor: color,
      }} />
      {children}
    </View>
  );
}

/** Грань + проседание: только там, где нажатие что-то открывает. */
function ChunkyTap({
  color = EDGE_LIGHT, edge = EDGE, radius = radii.md, onPress, disabled, style, accessibilityLabel, children,
}: {
  color?: string; edge?: number; radius?: number;
  onPress?: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string; children: React.ReactNode;
}) {
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: timing.press,
      easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER,
    }).start();

  return (
    <View style={[{ paddingBottom: edge, opacity: disabled ? 0.6 : 1 }, style]}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: edge, bottom: 0,
        borderRadius: radius, backgroundColor: color,
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={disabled ? undefined : onPress}
          onPressIn={() => !disabled && set(edge)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ disabled: !!disabled }}
        >
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** Корпус светлой карточки: общий вид для всех блоков экрана. */
function cardBody(colors: any, extra?: ViewStyle): ViewStyle {
  return {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    shadowColor: accents.violetDeep,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
    ...extra,
  };
}

/**
 * Кнопка отправки формы с градиентом и просадкой — та же физика, что у
 * ChunkyButton из GameKit, но с собственным индикатором загрузки (busy):
 * общий компонент такого пропа не поддерживает, а здесь он нужен и на «Добавить
 * слово», и на «Добавить все слова».
 */
function GradientSubmitButton({
  label, icon, busy, disabled, onPress,
}: { label: string; icon?: GlyphName; busy: boolean; disabled: boolean; onPress: () => void }) {
  const press = React.useRef(new Animated.Value(0)).current;
  const inactive = disabled || busy;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: chunky.duration,
      easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER,
    }).start();

  return (
    <View>
      <View style={{
        position: "absolute", left: 0, right: 0, top: chunky.edge, bottom: 0,
        borderRadius: radii.md, backgroundColor: inactive ? "#c7c3d4" : accents.indigoDeep,
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={inactive ? undefined : onPress}
          onPressIn={() => !inactive && set(chunky.pressDepth)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: inactive }}
        >
          <LinearGradient
            colors={(inactive ? ["#ddd9e8", "#cfcadc"] : gradients.action) as unknown as string[]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{
              borderRadius: radii.md, paddingVertical: 14, minHeight: 50,
              alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                {icon && <Glyph name={icon} size={18} color="#fff" />}
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>{label}</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </Animated.View>
      <View style={{ height: chunky.edge }} />
    </View>
  );
}

export default function DeckDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  // Битый номер в адресе раньше уходил в запрос как NaN и заканчивался
  // «вечной загрузкой» без объяснений.
  const validId = Number.isInteger(deckId) && deckId > 0;

  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const deckQ = useQuery({
    queryKey: ["fc-deck", deckId],
    queryFn: () => fc.getDeck(deckId),
    enabled: validId,
  });
  const wordsQ = useQuery({
    queryKey: ["fc-words", deckId],
    queryFn: () => fc.getDeckWords(deckId),
    enabled: validId,
  });

  const deck = deckQ.data;
  const words = wordsQ.data ?? [];
  const canEdit = !!deck?.canEdit;
  const { user } = useAuth();
  // Отправлять колоду ученикам может только учитель или админ. canEdit значит
  // лишь «колода моя»: ученик, создавший свою колоду, тоже владелец, но
  // рассылать её другим он не должен.
  const canAssign = canEdit && isTeacherOrAdmin(user?.role ?? "");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["fc-words", deckId] });
    qc.invalidateQueries({ queryKey: ["fc-deck", deckId] });
    qc.invalidateQueries({ queryKey: ["fc-decks"] });
    qc.invalidateQueries({ queryKey: ["fc-my-decks"] });
  };

  // ── добавление слов ───────────────────────────────────────────────────────
  // Блок наполнения колоды свёрнут по умолчанию — большинство заходов на
  // страницу колоды это просто «посмотреть слова», а не редактировать.
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"one" | "many">("one");
  const [newEn, setNewEn] = useState("");
  const [newRu, setNewRu] = useState("");
  const [bulk, setBulk] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const addWord = async () => {
    const english = newEn.trim();
    const russian = newRu.trim();
    if (!english && !russian) return;
    setAdding(true);
    setNotice(null);
    try {
      // Режим «английское слово»: перевод берём из поля перевода или автоматом.
      // Режим «русское слово»: поле перевода пустое, system определяет английское.
      const body = english
        ? {
            english,
            translationsRu: russian
              ? russian.split(/[,;/]/).map((s) => s.trim()).filter(Boolean)
              : undefined,
          }
        : { russian };
      const added = await apiFetch<FlashcardWordWithEmoji>(
        `/api/flashcards/decks/${deckId}/words`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setNewEn("");
      setNewRu("");
      const suffix = english
        ? (russian ? "" : " (перевод подобран автоматически)")
        : " (английское слово определено автоматически)";
      setNotice({
        type: "success",
        text: `Добавлено: ${added.english} — ${added.translationsRu.join(", ")}${suffix}`,
      });
      refresh();
    } catch (e: any) {
      setNotice({ type: "error", text: e?.message ?? "Не удалось добавить слово." });
    } finally {
      setAdding(false);
    }
  };

  const addBulk = async () => {
    const content = bulk.trim();
    if (!content) return;
    setAdding(true);
    setNotice(null);
    try {
      const result = await fc.importWords(deckId, "lines", content);
      const skipped = result.skippedWords ?? [];
      setBulk("");
      setNotice({
        type: result.added > 0 ? "success" : "error",
        text: result.added > 0
          ? `Добавлено слов: ${result.added}.`
            + (skipped.length ? ` Пропущено: ${skipped.join(", ")} — уже есть в колоде или не удалось перевести.` : "")
          : "Ни одно слово не добавилось. Проверьте формат: одна строка — одно слово, перевод после тире.",
      });
      refresh();
    } catch (e: any) {
      setNotice({ type: "error", text: e?.message ?? "Не удалось добавить слова." });
    } finally {
      setAdding(false);
    }
  };

  const [removingWord, setRemovingWord] = useState<number | null>(null);
  const removeWord = (wordId: number, english: string) => {
    confirmAction("Удалить слово", `Удалить «${english}» из колоды?`, async () => {
      setRemovingWord(wordId);
      try {
        await fc.deleteWord(deckId, wordId);
        refresh();
      } catch (e: any) {
        setNotice({ type: "error", text: e?.message ?? "Не удалось удалить слово." });
      } finally {
        setRemovingWord(null);
      }
    });
  };

  // ── удаление колоды ───────────────────────────────────────────────────────
  const [deleting, setDeleting] = useState(false);
  // expo-router на web переиспользует экран deck/[id] для следующей колоды.
  // Сбрасываем индикатор, иначе спиннер «залипает» на новой колоде.
  useEffect(() => { setDeleting(false); }, [deckId]);

  const removeDeck = () => {
    confirmAction(
      "Удалить колоду",
      `Удалить колоду «${deck?.title ?? ""}»? Все слова и прогресс будут потеряны.`,
      async () => {
        setDeleting(true);
        try {
          await fc.deleteDeck(deckId);
          qc.invalidateQueries({ queryKey: ["fc-decks"] });
          qc.invalidateQueries({ queryKey: ["fc-my-decks"] });
          setDeleting(false);
          router.back();
        } catch (e: any) {
          setDeleting(false);
          Alert.alert("Ошибка", e?.message ?? "Не удалось удалить колоду.");
        }
      },
    );
  };

  const [sendOpen, setSendOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  // ── экран ошибки: раньше вместо него был спиннер без конца ───────────────
  if (!validId) {
    return (
      <ErrorScreen
        colors={colors}
        insets={insets}
        title="Колода не открывается"
        text="В адресе страницы нет номера колоды. Вернитесь назад и откройте колоду из списка."
        onBack={() => router.back()}
      />
    );
  }
  if (deckQ.isError) {
    return (
      <ErrorScreen
        colors={colors}
        insets={insets}
        title="Не удалось загрузить колоду"
        text={(deckQ.error as any)?.message ?? "Проверьте соединение и попробуйте ещё раз."}
        onBack={() => router.back()}
        onRetry={() => deckQ.refetch()}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: screenTop(insets), paddingBottom: screenBottom(insets) }}>
      {/* шапка: та же стрелка-chevron, что на статистике и марафоне, вместо
          системной Feather-стрелки. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={10}
          style={{ transform: [{ rotate: "180deg" }], padding: 4 }}
        >
          <Glyph name="chevron" size={24} color={colors.foreground} />
        </Pressable>
        {/* Значок колоды: тот же компонент, что и в списке, — колода узнаётся
            по одному и тому же глифу и цвету на всех экранах. */}
        <DeckGlyph title={deck?.title ?? "Колода"} emoji={deck?.emoji} size={ICON} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {deckQ.isLoading ? (
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.mutedForeground }}>Загрузка…</Text>
          ) : (
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>{deck?.title ?? "Колода"}</Text>
          )}
          <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
            {words.length} слов{deck ? ` · выучено ${deck.learnedCount}` : ""}
            {canAssign && deck?.assignedCount ? ` · отправлена ${deck.assignedCount} ученикам` : ""}
          </Text>
        </View>
        {canEdit && (
          <Pressable
            onPress={removeDeck}
            disabled={deleting}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Удалить колоду"
            style={{ padding: 6 }}
          >
            {deleting
              ? <ActivityIndicator color={colors.destructive} />
              : <Glyph name="trash" size={22} color={colors.destructive} />}
          </Pressable>
        )}
      </View>

      {/* главное действие: предпросмотр — только учителю/админу (canAssign),
          ученику в любой колоде (своей или назначенной) — тренировка */}
      {canAssign ? (
        <>
          <ChunkyButton
            label="Предпросмотр колоды"
            icon="book"
            chevron
            disabled={words.length === 0}
            onPress={() => router.push(`/flashcards/preview/${deckId}`)}
            style={{ marginBottom: 12 }}
          />
          <ChunkyTap
            onPress={() => setSendOpen(true)}
            style={{ marginBottom: 18 }}
            accessibilityLabel="Отправить ученикам"
          >
            <View style={cardBody(colors, { flexDirection: "row", alignItems: "center", gap: 13, borderColor: colors.primary + "44" })}>
              <View style={{
                width: ICON, height: ICON, borderRadius: radii.sm + 3,
                alignItems: "center", justifyContent: "center",
                backgroundColor: colors.primary + "14",
              }}>
                <Glyph name="send" size={Math.round(ICON * 0.46)} color={colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>Отправить ученикам</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                  Разослать колоду выбранным ученикам
                </Text>
              </View>
              <Glyph name="chevron" size={20} color={colors.mutedForeground} />
            </View>
          </ChunkyTap>
        </>
      ) : (
        <ChunkyButton
          label="Начать учить"
          icon="play"
          chevron
          disabled={words.length === 0}
          onPress={() => router.push(`/flashcards/study/${deckId}`)}
          style={{ marginBottom: 18 }}
        />
      )}

      {/* добавление слов — только в своей колоде, свёрнуто аккордеоном */}
      {canEdit && (
        <ChunkyTap
          onPress={() => setAddOpen((v) => !v)}
          style={{ marginBottom: 12 }}
          accessibilityLabel={addOpen ? "Свернуть добавление слов" : "Добавить или изменить слова"}
        >
          <View style={cardBody(colors, { flexDirection: "row", alignItems: "center", gap: 13 })}>
            <LinearGradient
              colors={gradients.action as unknown as string[]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={{ width: ICON, height: ICON, borderRadius: radii.sm + 3, alignItems: "center", justifyContent: "center" }}
            >
              <Glyph name="plus" size={Math.round(ICON * 0.5)} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
                Добавить или изменить слова
              </Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                Из каталога готовых слов или вручную
              </Text>
            </View>
            <View style={{ transform: [{ rotate: addOpen ? "-90deg" : "90deg" }] }}>
              <Glyph name="chevron" size={20} color={colors.mutedForeground} />
            </View>
          </View>
        </ChunkyTap>
      )}
      {canEdit && addOpen && (
        <Chunky style={{ marginBottom: 18 }}>
          <View style={cardBody(colors, { padding: 16 })}>
            {/* Основной способ наполнить колоду — отметить готовые слова в каталоге
                (системные колоды по темам и уровням A1–C2). Раньше слова можно было
                только набирать руками, поэтому колода собиралась долго. */}
            <ChunkyButton
              label="Выбрать слова из каталога"
              icon="cards"
              center
              onPress={() => setCatalogOpen(true)}
              style={{ marginBottom: 10 }}
            />
            <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center", marginBottom: 12 }}>
              или наберите свои слова
            </Text>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {(([["one", "Одно слово"], ["many", "Списком"]] as const)).map(([key, label]) => {
                const active = addMode === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => { setAddMode(key); setNotice(null); }}
                    style={{
                      flex: 1, paddingVertical: 9, borderRadius: radii.sm, alignItems: "center", borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary + "14" : "transparent",
                    }}
                  >
                    <Text style={{ fontWeight: "800", fontSize: 13, color: active ? colors.primary : colors.mutedForeground }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {addMode === "one" ? (
              <>
                <TextInput
                  value={newEn}
                  onChangeText={(v) => { setNewEn(v); setNotice(null); }}
                  placeholder="Английское слово или фраза (или русское во второй строке)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholderTextColor={colors.mutedForeground}
                  style={{
                    backgroundColor: colors.background === "transparent" ? "#fff" : colors.background,
                    borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
                    paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, marginBottom: 8,
                  }}
                />
                <TextInput
                  value={newRu}
                  onChangeText={(v) => { setNewRu(v); setNotice(null); }}
                  placeholder="Перевод или русское слово (по нему система найдёт английское)"
                  placeholderTextColor={colors.mutedForeground}
                  style={{
                    backgroundColor: colors.background === "transparent" ? "#fff" : colors.background,
                    borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
                    paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, marginBottom: 8,
                  }}
                />
                <Hint colors={colors} text="Заполните любое поле: по английскому подберётся перевод, по русскому — английское слово и транскрипция. Свой перевод во втором поле всегда важнее автоматического." />
                <GradientSubmitButton
                  label="Добавить слово"
                  icon="plus"
                  busy={adding}
                  disabled={!newEn.trim() && !newRu.trim()}
                  onPress={addWord}
                />
              </>
            ) : (
              <>
                <TextInput
                  value={bulk}
                  onChangeText={(v) => { setBulk(v); setNotice(null); }}
                  placeholder={"hello — привет\nbook — книга\nrun — бежать"}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholderTextColor={colors.mutedForeground}
                  style={{
                    backgroundColor: colors.background === "transparent" ? "#fff" : colors.background,
                    borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
                    paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground,
                    marginBottom: 8, minHeight: 120, textAlignVertical: "top",
                  }}
                />
                <Hint colors={colors} text="Одна строка — одно слово. Перевод после тире, двоеточия или табуляции. Строку без перевода переведёт сервер." />
                <GradientSubmitButton
                  label="Добавить все слова"
                  icon="plus"
                  busy={adding}
                  disabled={!bulk.trim()}
                  onPress={addBulk}
                />
              </>
            )}

            {notice && (
              <View style={{
                flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 10,
                backgroundColor: (notice.type === "success" ? colors.success : colors.destructive) + "14",
                borderWidth: 1, borderColor: (notice.type === "success" ? colors.success : colors.destructive) + "45",
                borderRadius: radii.sm, padding: 10,
              }}>
                <Glyph
                  name={notice.type === "success" ? "check" : "alert"}
                  size={16}
                  color={notice.type === "success" ? colors.success : colors.destructive}
                />
                <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: notice.type === "success" ? colors.success : colors.destructive }}>
                  {notice.text}
                </Text>
              </View>
            )}
          </View>
        </Chunky>
      )}

      {/* список слов */}
      <SectionLabel>Слова</SectionLabel>
      {wordsQ.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : wordsQ.isError ? (
        <InlineError
          colors={colors}
          text={(wordsQ.error as any)?.message ?? "Не удалось загрузить слова."}
          onRetry={() => wordsQ.refetch()}
        />
      ) : words.length === 0 ? (
        <Text style={{ color: colors.mutedForeground }}>
          {canEdit ? "Пока нет слов — добавьте первое слово выше." : "Пока нет слов."}
        </Text>
      ) : (
        words.map((w) => (
          <Chunky key={w.id} edge={EDGE_DECK_ROW} style={{ marginBottom: 10 }}>
            <View style={cardBody(colors, { padding: 15, flexDirection: "row", alignItems: "center", gap: 10 })}>
              {/* Метка слова: первая буква английского написания в фирменной
                  плашке. Поле w.emoji приходит из словаря и на каждой платформе
                  выглядит по-своему, поэтому на экран оно не выводится. */}
              <WordMark colors={colors} english={w.english} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>{w.english}</Text>
                  {!!w.ipa && <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{w.ipa}</Text>}
                </View>
                <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 2 }}>{w.translationsRu.join(", ")}</Text>
              </View>
              {speechAvailable() && (
                <Pressable onPress={() => speakWord(w.id, w.english)} hitSlop={8} accessibilityLabel={`Прослушать: ${w.english}`} style={{ padding: 6 }}>
                  <Glyph name="sound" size={18} color={colors.primary} />
                </Pressable>
              )}
              {canEdit && (
                <Pressable
                  onPress={() => removeWord(w.id, w.english)}
                  disabled={removingWord === w.id}
                  hitSlop={8}
                  accessibilityLabel={`Удалить слово: ${w.english}`}
                  style={{ padding: 6 }}
                >
                  {removingWord === w.id
                    ? <ActivityIndicator color={colors.destructive} />
                    : <Glyph name="close" size={18} color={colors.destructive} />}
                </Pressable>
              )}
            </View>
          </Chunky>
        ))
      )}

      {canEdit && (
        <CatalogPickerModal
          visible={catalogOpen}
          onClose={() => setCatalogOpen(false)}
          deckId={deckId}
          alreadyIn={words.map((w) => w.english)}
          colors={colors}
          onSaved={(text, type) => { setNotice({ type, text }); refresh(); }}
        />
      )}

      {canAssign && (
        <SendDeckModal
          visible={sendOpen}
          onClose={() => {
            setSendOpen(false);
            qc.invalidateQueries({ queryKey: ["fc-deck", deckId] });
            // Учитель может сразу перейти в «Задания» → «Колоды» — счётчик
            // «отправлена N ученикам» там должен быть свежим без перезаходов.
            qc.invalidateQueries({ queryKey: ["fc-my-decks"] });
          }}
          deckId={deckId}
          deckTitle={deck?.title ?? ""}
          wordCount={words.length}
          colors={colors}
        />
      )}
    </ScrollView>
  );
}

// ── мелкие переиспользуемые куски ──────────────────────────────────────────

/**
 * Метка слова: первая буква в мягкой плашке. Заменяет w.emoji из словаря —
 * он на iOS, Android и в вебе рисуется тремя разными шрифтами и не красится
 * темой. Само поле в данных остаётся нетронутым.
 */
function WordMark({ colors, english }: { colors: any; english: string }) {
  const letter = (english.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();
  return (
    <View style={{
      width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center",
      backgroundColor: colors.primary + "14", borderWidth: 1, borderColor: colors.primary + "33",
    }}>
      <Text style={{ fontSize: 15, fontWeight: "900", color: colors.primary }}>{letter}</Text>
    </View>
  );
}

function Hint({ colors, text }: { colors: any; text: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", marginBottom: 10 }}>
      <Glyph name="spark" size={14} color={colors.primary} />
      <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: colors.mutedForeground }}>{text}</Text>
    </View>
  );
}

function InlineError({ colors, text, onRetry }: { colors: any; text: string; onRetry: () => void }) {
  return (
    <Chunky color={colors.destructive + "55"}>
      <View style={cardBody(colors, {
        backgroundColor: colors.destructive + "12",
        borderColor: colors.destructive + "40",
        gap: 12,
      })}>
        <Text style={{ fontSize: 14, lineHeight: 19, color: colors.destructive, fontWeight: "600" }}>{text}</Text>
        <ChunkyButton label="Повторить" icon="repeat" center onPress={onRetry} />
      </View>
    </Chunky>
  );
}

function ErrorScreen({ colors, insets, title, text, onBack, onRetry }: {
  colors: any; insets: any; title: string; text: string; onBack: () => void; onRetry?: () => void;
}) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: screenTop(insets), paddingBottom: screenBottom(insets) }}
    >
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Назад"
        hitSlop={10}
        style={{ alignSelf: "flex-start", padding: 4, marginBottom: 24, transform: [{ rotate: "180deg" }] }}
      >
        <Glyph name="chevron" size={24} color={colors.foreground} />
      </Pressable>
      <View style={{ alignItems: "center", gap: 12, marginTop: 30 }}>
        <Glyph name="alert" size={44} color={colors.destructive} />
        <Text style={{ fontSize: 18, fontWeight: "900", color: colors.foreground, textAlign: "center" }}>{title}</Text>
        <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 }}>{text}</Text>
        {onRetry && (
          <ChunkyButton label="Повторить" icon="repeat" center onPress={onRetry} style={{ marginTop: 8, minWidth: 220 }} />
        )}
      </View>
    </ScrollView>
  );
}

// ── «Выбрать слова из каталога» ────────────────────────────────────────────
// Обёртка над WordPicker: сам компонент только ведёт выбор, записывает подборку
// этот экран одним запросом words/bulk. Слова каталога копируются в колоду
// учителя — прогресс ученика висит на конкретной карточке, поэтому у колоды
// должен быть свой независимый набор слов (см. api-server/src/lib/deckWords.ts).
function CatalogPickerModal({ visible, onClose, deckId, alreadyIn, colors, onSaved }: {
  visible: boolean;
  onClose: () => void;
  deckId: number;
  alreadyIn: string[];
  colors: any;
  onSaved: (text: string, type: "success" | "error") => void;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [manualWords, setManualWords] = useState<ManualWordInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // При каждом открытии начинаем с чистой подборки.
  useEffect(() => {
    if (visible) { setSelectedIds([]); setManualWords([]); setError(null); }
  }, [visible]);

  const total = selectedIds.length + manualWords.length;

  const save = async () => {
    if (total === 0) return;
    setSaving(true);
    setError(null);
    try {
      const result = await fc.addWordsBulk(deckId, {
        wordIds: selectedIds.length ? selectedIds : undefined,
        words: manualWords.length ? manualWords : undefined,
      });
      // Частичный успех — не ошибка: сообщаем, что именно не прошло, но
      // добавленное остаётся в колоде.
      const parts: string[] = [];
      if (result.added > 0) parts.push(`Добавлено слов: ${result.added}.`);
      if (result.skipped > 0) parts.push(`Пропущено (уже в колоде): ${result.skipped}.`);
      if (result.failed.length > 0) {
        parts.push(`Не добавились: ${result.failed.map((f) => `${f.english} — ${f.reason}`).join("; ")}`);
      }
      if (result.added === 0) {
        setError(parts.join(" ") || "Ни одно слово не добавилось.");
        setSaving(false);
        return;
      }
      onSaved(parts.join(" "), "success");
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Не удалось добавить слова.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.background === "transparent" ? "#fff" : colors.background,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, height: "92%",
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>Слова для колоды</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                Отметьте готовые слова или добавьте свои
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Закрыть" style={{ padding: 6 }}>
              <Glyph name="close" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* WordPicker не скроллится сам — оборачиваем в свой ScrollView. */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
            <WordPicker
              selectedIds={selectedIds}
              onChangeSelected={(ids) => { setSelectedIds(ids); setError(null); }}
              manualWords={manualWords}
              onChangeManual={(w) => { setManualWords(w); setError(null); }}
              excludeDeckId={deckId}
              alreadyIn={alreadyIn}
            />
          </ScrollView>

          {error && (
            <View style={{
              flexDirection: "row", gap: 8, alignItems: "flex-start", marginBottom: 10,
              backgroundColor: colors.destructive + "14", borderWidth: 1,
              borderColor: colors.destructive + "45", borderRadius: radii.sm, padding: 10,
            }}>
              <Glyph name="alert" size={16} color={colors.destructive} />
              <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: colors.destructive }}>{error}</Text>
            </View>
          )}

          <GradientSubmitButton
            label={total === 0 ? "Выберите слова" : `Добавить в колоду (${total})`}
            icon="check"
            busy={saving}
            disabled={total === 0}
            onPress={save}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── «Отправить ученикам» ───────────────────────────────────────────────────
// Несколько учеников отмечаются галочками и отправляются одним запросом.
// Кто уже получил колоду, приходит одним запросом assignees, а не опросом
// по каждому ученику.
function SendDeckModal({ visible, onClose, deckId, deckTitle, wordCount, colors }: {
  visible: boolean; onClose: () => void; deckId: number; deckTitle: string; wordCount: number; colors: any;
}) {
  const insets = useSafeAreaInsets();
  const studentsQ = useQuery({
    queryKey: ["teacher-students-for-deck"],
    queryFn: () => apiFetch<StudentItem[]>("/api/connections/teacher/students"),
    enabled: visible,
  });
  const assigneesQ = useQuery({
    queryKey: ["fc-assignees", deckId],
    queryFn: () => fc.getAssignees(deckId),
    enabled: visible,
  });

  const students = studentsQ.data ?? [];
  const already = useMemo(() => new Set(assigneesQ.data ?? []), [assigneesQ.data]);

  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // При каждом открытии начинаем с чистого выбора.
  useEffect(() => {
    if (visible) { setPicked(new Set()); setResult(null); }
  }, [visible]);

  const toggle = (studentId: number) => {
    setResult(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  };

  const send = async () => {
    if (picked.size === 0) return;
    setSending(true);
    setResult(null);
    try {
      await fc.assignDeckMany(deckId, [...picked]);
      await assigneesQ.refetch();
      setPicked(new Set());
      setResult({ type: "success", text: `Колода «${deckTitle}» отправлена. Она появилась у учеников в разделе «Слова».` });
    } catch (e: any) {
      setResult({ type: "error", text: e?.message ?? "Не удалось отправить колоду." });
    } finally {
      setSending(false);
    }
  };

  const revoke = async (studentId: number) => {
    setSending(true);
    setResult(null);
    try {
      await fc.unassignDeck(deckId, studentId);
      await assigneesQ.refetch();
    } catch (e: any) {
      setResult({ type: "error", text: e?.message ?? "Не удалось отозвать колоду." });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Собственный оверлей: непрозрачный фон контента ниже + затемнение фона
          страницы, чтобы содержимое экрана не просвечивало сквозь модалку. */}
      <View style={{ flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, maxHeight: "85%",
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.foreground }}>Отправить ученикам</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Закрыть" style={{ padding: 6 }}>
              <Glyph name="close" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 14 }}>
            Колода «{deckTitle}» · {wordCount} слов
          </Text>

          {wordCount === 0 && (
            <View style={{ backgroundColor: colors.destructive + "12", borderWidth: 1, borderColor: colors.destructive + "40", borderRadius: radii.sm, padding: 12, marginBottom: 14 }}>
              <Text style={{ color: colors.destructive, fontSize: 13, lineHeight: 18 }}>
                В колоде пока нет слов. Отправить её можно, но учить ученику будет нечего — сначала добавьте слова.
              </Text>
            </View>
          )}

          {studentsQ.isLoading ? (
            <ActivityIndicator color={colors.primary} size="large" style={{ marginVertical: 40 }} />
          ) : studentsQ.isError ? (
            <InlineError colors={colors} text="Не удалось загрузить список учеников." onRetry={() => studentsQ.refetch()} />
          ) : students.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 26, gap: 10 }}>
              {/* Пустое состояние учит и предлагает действие, а не извиняется. */}
              <Glyph name="users" size={40} color={colors.primary} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>Учеников пока нет</Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 19 }}>
                Добавьте учеников в разделе «Ученики», и колоду можно будет им отправить.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: Dimensions.get("window").height * 0.5 }}>
              {students.map((s) => {
                const has = already.has(s.id);
                const on = picked.has(s.id);
                const fullName = [s.name, s.surname].filter(Boolean).join(" ");
                return (
                  <View key={s.id} style={{
                    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card,
                    borderRadius: radii.md, padding: 14, borderWidth: 1,
                    borderColor: on ? colors.primary : colors.border, marginBottom: 10,
                  }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{fullName || s.username}</Text>
                      <Text style={{ fontSize: 12, color: has ? colors.success : colors.mutedForeground, marginTop: 2 }}>
                        {has ? "Колода уже отправлена" : `@${s.username}`}
                      </Text>
                    </View>
                    {has ? (
                      <TouchableOpacity onPress={() => revoke(s.id)} disabled={sending} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.destructive }}>
                        <Text style={{ color: colors.destructive, fontWeight: "700", fontSize: 12 }}>Отозвать</Text>
                      </TouchableOpacity>
                    ) : (
                      <Pressable
                        onPress={() => toggle(s.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        style={{
                          width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center",
                          borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent",
                        }}
                      >
                        {on && <Glyph name="check" size={16} color="#fff" />}
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {result && (
            <View style={{
              flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 10,
              backgroundColor: (result.type === "success" ? colors.success : colors.destructive) + "14",
              borderWidth: 1, borderColor: (result.type === "success" ? colors.success : colors.destructive) + "45",
              borderRadius: radii.sm, padding: 10,
            }}>
              <Glyph
                name={result.type === "success" ? "check" : "alert"}
                size={16}
                color={result.type === "success" ? colors.success : colors.destructive}
              />
              <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: result.type === "success" ? colors.success : colors.destructive }}>
                {result.text}
              </Text>
            </View>
          )}

          {students.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <GradientSubmitButton
                label={picked.size === 0 ? "Выберите учеников" : `Отправить (${picked.size})`}
                icon="send"
                busy={sending}
                disabled={picked.size === 0}
                onPress={send}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
