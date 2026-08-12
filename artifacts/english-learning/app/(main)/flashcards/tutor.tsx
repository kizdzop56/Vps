// ─────────────────────────────────────────────────────────────────────────────
// Разговор с тьютором: практика речи голосом или письмом.
//
// ── Почему экран появился позже сервера ─────────────────────────────────────
// Сервер умел это давно (api-server/src/routes/voiceChat.ts): расшифровка речи
// через whisper, ответ языковой модели, озвучка ответа и начисление очков. Не
// было ТОЛЬКО экрана. Раздел жил в наградах («провести N разговоров») и в
// статистике профиля — то есть ученик видел награду, которую физически не мог
// получить.
//
// ── Два способа сказать ─────────────────────────────────────────────────────
// ГОЛОСОМ — то, ради чего раздел и нужен: говорить вслух страшнее и полезнее
// всего остального в приложении.
//
// ПИСЬМОМ — рядом, переключателем. Это не подпорка «на случай поломки», а
// полноценный режим: в транспорте и в классе вслух не поговоришь, а часть детей
// стесняется собственного голоса больше, чем ошибок. Заодно письмо обходит
// распознавание речи целиком, и по нему видно, работает ли остальной раздел,
// когда микрофон подводит.
//
// Ответ тьютора озвучивается в обоих режимах: услышать, как звучит фраза,
// полезно и тому, кто её напечатал.
//
// ── СВОЯ РЕПЛИКА ПОКАЗЫВАЕТСЯ СРАЗУ ────────────────────────────────────────
// Раньше она добавлялась в ленту ВМЕСТЕ с ответом тьютора, одним куском. Пока
// всё работало, разницы не было. Стоило ответу не прийти — и сказанное
// исчезало совсем: на экране оставались приветствие тьютора и красная плашка,
// то есть разговор выглядел так, будто ученик ничего и не говорил.
//
// Теперь реплика встаёт в ленту немедленно, а по ответу сервера либо уточняется
// расшифровкой (в голосовом режиме важно видеть, КАК тебя услышали), либо
// помечается «не доставлено». Пометка нужна: молча оставить реплику в ленте
// значило бы соврать, что тьютор её получил.
//
// ── Запись живёт не здесь ───────────────────────────────────────────────────
// Первая версия писала звук через Audio.Recording из expo-av — и на вебе не
// работала вовсе: в expo-av записи для веба нет, только проигрывание.
//
// Теперь запись за общей ручкой (utils/voiceRecorder.ts): на вебе MediaRecorder
// из браузера, на телефоне expo-av. Экрану всё равно, чем именно записано.
//
// ── ГРАБЛИ: НИКАКОГО position: absolute ДЛЯ НИЖНЕЙ ПАНЕЛИ ───────────────────
// Кнопка «Говорить» стояла так:
//
//   position: "absolute", bottom: screenBottom(insets) - 60
//
// screenBottom — это отступ ДЛЯ СОДЕРЖИМОГО: он уже включает высоту панели
// вкладок, её подъём и воздух. Вычитая из него шестьдесят, кнопка оказывалась
// ВНУТРИ полосы, которую занимает панель, и уходила под неё наполовину.
//
// Теперь абсолютного позиционирования нет вовсе: лента и панель ввода — два
// элемента одного flex-столбца, а screenBottom применяется к нижнему из них
// целиком, без арифметики.
//
// ── Клавиатура ──────────────────────────────────────────────────────────────
// В режиме письма поле ввода прижато к низу, и на телефоне клавиатура накрыла
// бы его вместе с кнопкой. KeyboardAvoidingView поднимает весь столбец; на вебе
// он не нужен и не включается — там клавиатура часть окна браузера.
//
// Эмодзи не используются: значки — глифы из своего набора.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/hooks/useFlashcards";
import {
  MicDeniedError,
  createVoiceRecorder,
  playAudio,
  type StopPlayback,
  type VoiceRecorder,
} from "@/utils/voiceRecorder";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Tile } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";

/** Реплика в ленте разговора. */
type Line = {
  id: string;
  role: "student" | "ai";
  text: string;
  /** Озвучка ответа тьютора: data-URL с mp3. У реплики ученика её нет. */
  audio?: string | null;
  /** Реплика ещё в пути: показываем её приглушённой. */
  pending?: boolean;
  /** Ответ не пришёл. Реплика остаётся в ленте, но помечена. */
  failed?: boolean;
};

type SessionResponse = { id: number };
type StatusResponse = { ready?: boolean; reason?: string };

type MessagesResponse = {
  studentMessage?: { id?: number; transcript?: string };
  aiMessage?: { id?: number; transcript?: string; audioUrl?: string | null };
  pointsEarned?: number;
};

/** Как ученик отвечает. */
type Mode = "voice" | "text";

const MODES: { key: Mode; label: string }[] = [
  { key: "voice", label: "Говорить" },
  { key: "text", label: "Писать" },
];

/** С чего начинается разговор: тьютор здоровается первым. */
const GREETING =
  "Hi! I am your English tutor. Tell me about your day - what did you do today?";

/** Заглушка на месте расшифровки, пока запись едет на сервер. */
const VOICE_PLACEHOLDER = "…";

/**
 * Падение экрана иначе выглядело бы как «кнопка не работает»: навигатор остался
 * бы на оглавлении. Такую же ловушку мы ставим на все экраны раздела.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "900", color: "#e11d48" }}>Экран не открылся</Text>
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

export default function TutorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [lines, setLines] = React.useState<Line[]>([
    { id: "greeting", role: "ai", text: GREETING },
  ]);
  const [sessionId, setSessionId] = React.useState<number | null>(null);
  const [mode, setMode] = React.useState<Mode>("voice");
  const [typed, setTyped] = React.useState("");
  const [recording, setRecording] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [points, setPoints] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [denied, setDenied] = React.useState(false);
  /** null — ещё не спросили; false — тьютор не настроен на сервере. */
  const [ready, setReady] = React.useState<boolean | null>(null);
  const [notReadyReason, setNotReadyReason] = React.useState<string | null>(null);

  const scroller = React.useRef<ScrollView | null>(null);
  const recorder = React.useRef<VoiceRecorder | null>(null);
  const stopPlayback = React.useRef<StopPlayback | null>(null);

  // Настроен ли раздел. Спрашиваем один раз при открытии: ответ не меняется без
  // перезапуска сервера.
  React.useEffect(() => {
    let alive = true;
    apiFetch<StatusResponse>("/api/voice-chat/status")
      .then((s) => {
        if (!alive) return;
        setReady(s?.ready !== false);
        setNotReadyReason(s?.reason ?? null);
      })
      // Не смогли спросить — считаем, что готов: лучше дать попробовать, чем
      // закрыть раздел из-за одного неудачного запроса.
      .catch(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  // Уход с экрана обязан оборвать и запись, и звук: иначе тьютор продолжает
  // говорить с другой вкладки, а в браузере горит индикатор микрофона.
  React.useEffect(() => () => {
    stopPlayback.current?.();
    void recorder.current?.cancel();
  }, []);

  const play = React.useCallback(async (uri: string) => {
    try {
      stopPlayback.current?.();
      stopPlayback.current = await playAudio(uri);
    } catch {
      /* не проигралось — текст ответа всё равно на экране */
    }
  }, []);

  /**
   * Отправить реплику: либо запись, либо текст.
   *
   * @param payload что уходит на сервер
   * @param shown   что сразу показать в ленте как свою реплику
   *
   * Обе ветки сходятся здесь, потому что дальше всё одинаково — сессия, ответ
   * тьютора, очки, лента. Две копии этого кода разъехались бы на первой правке.
   */
  const send = React.useCallback(async (payload: Record<string, unknown>, shown: string) => {
    // Своя реплика появляется в ленте ДО запроса: см. шапку файла.
    const localId = `mine-${Date.now()}`;
    setLines((prev) => [...prev, { id: localId, role: "student", text: shown, pending: true }]);

    setSending(true);
    setError(null);
    try {
      // Сессия создаётся только теперь: пустой заход на экран разговором не
      // считается.
      let id = sessionId;
      if (id === null) {
        const created = await apiFetch<SessionResponse>("/api/voice-chat/sessions", {
          method: "POST",
          body: JSON.stringify({}),
        });
        id = created.id;
        setSessionId(id);
      }

      const data = await apiFetch<MessagesResponse>(
        `/api/voice-chat/sessions/${id}/messages`,
        { method: "POST", body: JSON.stringify(payload) },
      );

      const mine = data.studentMessage?.transcript?.trim();
      const reply = data.aiMessage?.transcript?.trim();
      const replyAudio = data.aiMessage?.audioUrl ?? null;

      setLines((prev) => [
        // Уточняем свою реплику расшифровкой: в голосовом режиме по ней видно,
        // как ученика услышали, и половина «отвечает невпопад» объясняется ей.
        ...prev.map((l) =>
          l.id === localId
            ? { ...l, text: mine || l.text, pending: false }
            : l,
        ),
        { id: `a-${data.aiMessage?.id ?? Date.now()}`, role: "ai" as const, text: reply || "…", audio: replyAudio },
      ]);
      setPoints((p) => p + (data.pointsEarned ?? 0));
      if (replyAudio) void play(replyAudio);

      // Очки ушли в общий счёт: экраны, где они видны, обязаны перечитать данные.
      qc.invalidateQueries({ queryKey: ["gamification-stats"] });
      return true;
    } catch (e: any) {
      // Реплика остаётся в ленте, но помеченной: она сказана, просто не дошла.
      setLines((prev) =>
        prev.map((l) => (l.id === localId ? { ...l, pending: false, failed: true } : l)),
      );
      // detail — то, что ответил сервер на самом деле («model not found»,
      // «insufficient quota»). Без него все отказы выглядят одинаково.
      const detail = typeof e?.detail === "string" ? e.detail : "";
      setError([e?.message ?? "Не удалось отправить реплику", detail].filter(Boolean).join(" "));
      return false;
    } finally {
      setSending(false);
    }
  }, [sessionId, play, qc]);

  /** Начать запись. Разрешение спрашивается здесь: браузер даёт его по действию. */
  const startRecording = React.useCallback(async () => {
    setError(null);
    try {
      const rec = createVoiceRecorder();
      await rec.start();
      recorder.current = rec;
      setDenied(false);
      setRecording(true);
    } catch (e: any) {
      recorder.current = null;
      if (e instanceof MicDeniedError) { setDenied(true); return; }
      setError(e?.message ?? "Микрофон не запустился");
    }
  }, []);

  /** Остановить запись и отправить её тьютору. */
  const stopAndSend = React.useCallback(async () => {
    const rec = recorder.current;
    if (!rec) return;
    setRecording(false);

    let recorded;
    try {
      recorded = await rec.stop();
    } catch (e: any) {
      // Слишком короткая запись и обрыв — это ошибки самой записи, до сервера
      // дело не доходит, и в ленте показывать нечего.
      recorder.current = null;
      setError(e?.message ?? "Запись не получилась");
      return;
    }
    recorder.current = null;

    // Расшифровки ещё нет, поэтому в ленте стоит заглушка: сервер вернёт текст
    // и она заменится.
    await send(
      { audioBase64: recorded.base64, mimeType: recorded.mimeType },
      VOICE_PLACEHOLDER,
    );
  }, [send]);

  /** Отправить написанную реплику. */
  const sendTyped = React.useCallback(async () => {
    const value = typed.trim();
    if (!value) return;
    // Поле чистим сразу: реплика уже видна в ленте, и оставлять её ещё и в
    // поле — значит показывать одно и то же дважды. При неудаче она остаётся
    // в ленте с пометкой, и её можно скопировать оттуда.
    setTyped("");
    await send({ text: value }, value);
  }, [typed, send]);

  const exit = React.useCallback(() => {
    stopPlayback.current?.();
    void recorder.current?.cancel();
    router.replace("/flashcards");
  }, [router]);

  /** Переключение режима. Во время записи менять нельзя — сначала остановись. */
  const switchMode = React.useCallback((next: Mode) => {
    if (recording || sending) return;
    setError(null);
    setMode(next);
  }, [recording, sending]);

  const blocked = ready === false;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      // На вебе клавиатура — часть окна браузера, и поведение здесь только
      // мешает: столбец начинает прыгать при фокусе поля.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={(r) => { scroller.current = r; }}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: screenTop(insets),
          paddingBottom: 16,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <Pressable
            onPress={exit}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Назад"
            style={{ transform: [{ rotate: "180deg" }], padding: 4 }}
          >
            <Glyph name="chevron" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 24, fontWeight: "900", letterSpacing: -0.7, color: colors.foreground }}>
            Разговор с тьютором
          </Text>
          {points > 0 && (
            <Text style={{ fontSize: 15, fontWeight: "900", color: accents.magenta, fontVariant: ["tabular-nums"] }}>
              {`+${points}`}
            </Text>
          )}
        </View>

        {/* Переключатель режима. Тот же вид, что у вкладок неправильных
            глаголов: выбранная кнопка приподнята и залита цветом карточки. */}
        <View style={{
          flexDirection: "row",
          backgroundColor: colors.primary + "14",
          borderRadius: radii.pill,
          padding: 4,
          marginBottom: 12,
        }}>
          {MODES.map((m) => {
            const active = mode === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => switchMode(m.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={m.label}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: radii.pill,
                  alignItems: "center",
                  backgroundColor: active ? colors.card : "transparent",
                  shadowColor: accents.violetDeep,
                  shadowOffset: { width: 0, height: active ? 3 : 0 },
                  shadowOpacity: active ? 0.18 : 0,
                  shadowRadius: active ? 8 : 0,
                  elevation: active ? 2 : 0,
                }}
              >
                <Text style={{
                  fontSize: 13.5,
                  fontWeight: active ? "900" : "700",
                  color: active ? colors.primary : colors.mutedForeground,
                }}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.mutedForeground, marginBottom: 16 }}>
          {mode === "voice"
            ? "Говори по-английски вслух. Тьютор поймёт, ответит голосом и мягко поправит ошибки. Под своей репликой видно, как тебя услышали."
            : "Пиши по-английски. Тьютор ответит текстом и голосом и мягко поправит ошибки — удобно, когда вслух говорить негде."}
        </Text>

        {/* Раздел не настроен на сервере — говорим это сразу, а не после
            потраченной впустую записи. */}
        {blocked && (
          <Tile glow={colors.destructive} style={{ padding: 15, marginBottom: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.destructive }}>
              Тьютор пока недоступен
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginTop: 6 }}>
              {notReadyReason
                ? notReadyReason
                : "На сервере не задан ключ доступа к языковой модели."}
            </Text>
          </Tile>
        )}

        {/* Лента разговора. Свои реплики справа, ответы тьютора слева — как в
            обычной переписке, чтобы не читать подписи «кто сказал». */}
        {lines.map((line) => {
          const mine = line.role === "student";
          return (
            <Pressable
              key={line.id}
              onPress={() => { if (line.audio) void play(line.audio); }}
              disabled={!line.audio}
              accessibilityRole={line.audio ? "button" : undefined}
              accessibilityLabel={line.audio ? "Прослушать ответ ещё раз" : undefined}
              style={{
                alignSelf: mine ? "flex-end" : "flex-start",
                maxWidth: "88%",
                backgroundColor: mine ? colors.primary + "1f" : colors.card,
                borderWidth: 1,
                // Не доставленная реплика обведена красным: она сказана, но
                // тьютор её не получил, и это должно быть видно.
                borderColor: line.failed
                  ? colors.destructive + "88"
                  : mine ? colors.primary + "44" : colors.border,
                borderRadius: radii.md,
                paddingVertical: 11,
                paddingHorizontal: 14,
                marginBottom: 10,
                opacity: line.pending ? 0.6 : 1,
              }}
            >
              <Text style={{
                fontSize: 10, fontWeight: "900", letterSpacing: 1,
                textTransform: "uppercase",
                color: mine ? colors.primary : colors.mutedForeground,
                marginBottom: 4,
              }}>
                {mine ? "ты" : "тьютор"}
              </Text>
              <Text style={{ fontSize: 15, lineHeight: 22, color: colors.foreground }}>
                {line.text}
              </Text>
              {line.failed && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 7 }}>
                  <Glyph name="alert" size={13} color={colors.destructive} />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.destructive }}>
                    не доставлено
                  </Text>
                </View>
              )}
              {!!line.audio && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 7 }}>
                  <Glyph name="sound" size={13} color={colors.primary} />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
                    нажми, чтобы послушать ещё раз
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}

        {sending && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginTop: 4 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
              {mode === "voice" ? "Слушаю и думаю над ответом…" : "Читаю и думаю над ответом…"}
            </Text>
          </View>
        )}

        {denied && (
          <Tile glow={colors.warning} style={{ padding: 15, marginTop: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>
              Нужен доступ к микрофону
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginTop: 6 }}>
              Без него говорить не получится. Разреши доступ в окне браузера и нажми
              кнопку записи ещё раз — или переключись на «Писать».
            </Text>
          </Tile>
        )}

        {!!error && (
          <Tile glow={colors.destructive} style={{ padding: 15, marginTop: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.destructive }}>
              Не получилось
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginTop: 6 }}>
              {error}
            </Text>
          </Tile>
        )}
      </ScrollView>

      {/* Панель ввода. НЕ absolute: она обычный элемент столбца, поэтому лента
          сама отдаёт ей место, а screenBottom честно уводит её выше панели
          вкладок. См. ГРАБЛИ в шапке файла. */}
      <View style={{ paddingHorizontal: 16, paddingBottom: screenBottom(insets) }}>
        {mode === "voice" ? (
          <ChunkyButton
            label={recording ? "Стоп и отправить" : sending ? "Секунду…" : "Говорить"}
            sublabel={recording ? "идёт запись" : "нажми, скажи фразу, нажми ещё раз"}
            icon={recording ? "check" : "sound"}
            tone={recording ? "warm" : "primary"}
            center
            disabled={sending || blocked}
            onPress={() => { void (recording ? stopAndSend() : startRecording()); }}
          />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder="Напиши по-английски"
              placeholderTextColor={colors.mutedForeground}
              editable={!sending && !blocked}
              multiline
              maxLength={500}
              onSubmitEditing={() => { void sendTyped(); }}
              returnKeyType="send"
              style={{
                flex: 1,
                minHeight: 52,
                maxHeight: 120,
                backgroundColor: colors.card,
                borderRadius: radii.md,
                borderWidth: 2,
                borderColor: colors.border,
                paddingHorizontal: 14,
                paddingVertical: Platform.OS === "web" ? 14 : 12,
                fontSize: 16,
                fontWeight: "600",
                color: colors.foreground,
              }}
            />
            <Pressable
              onPress={() => { void sendTyped(); }}
              disabled={sending || blocked || typed.trim().length === 0}
              accessibilityRole="button"
              accessibilityLabel="Отправить"
              style={{
                width: 52, height: 52, borderRadius: radii.md,
                alignItems: "center", justifyContent: "center",
                backgroundColor: colors.primary,
                opacity: sending || blocked || typed.trim().length === 0 ? 0.45 : 1,
              }}
            >
              <Glyph name="arrowRight" size={22} color="#fff" />
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
