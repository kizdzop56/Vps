// ─────────────────────────────────────────────────────────────────────────────
// Разговор с тьютором: голосовая практика речи.
//
// ── Почему экран появился только сейчас ─────────────────────────────────────
// Сервер умел это давно (api-server/src/routes/voice-chat): расшифровка речи
// через whisper, ответ языковой модели, озвучка ответа и начисление очков. Не
// было ТОЛЬКО экрана. Раздел existовал в наградах («провести N разговоров») и в
// статистике профиля — то есть ученик видел награду, которую физически не мог
// получить.
//
// ── Как устроен разговор ────────────────────────────────────────────────────
// Ученик держит кнопку и говорит, отпускает — запись уходит на сервер. Оттуда
// приходит расшифровка его же реплики (это важно: видно, КАК его услышали) и
// ответ тьютора текстом и голосом. Ответ проигрывается сам, повторить можно
// нажатием на реплику.
//
// Сессия создаётся не при открытии экрана, а перед ПЕРВОЙ записью. Иначе каждый
// случайный заход плодил бы пустую сессию, и «разговоров» в статистике
// становилось больше, чем разговоров на самом деле.
//
// ── Запись ──────────────────────────────────────────────────────────────────
// expo-av: на вебе он берёт MediaRecorder, на телефоне — системный рекордер.
// Файл читается через fetch + FileReader, потому что expo-file-system в проект
// не подключён, а этот путь работает на обеих платформах одинаково.
//
// Тип файла отправляем НАСТОЯЩИЙ (на вебе это чаще webm, на iOS — m4a): whisper
// разбирает оба, но по неверно названному типу отказывается.
//
// ── Разрешение на микрофон ──────────────────────────────────────────────────
// Отказ — это не ошибка приложения, поэтому вместо красного экрана спокойное
// объяснение и кнопка «Попробовать снова»: на вебе браузер спрашивает заново
// только по действию пользователя.
//
// Эмодзи не используются: значки — глифы из своего набора.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/hooks/useFlashcards";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, Tile } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";

/** Реплика в ленте разговора. */
type Line = {
  id: string;
  role: "student" | "ai";
  text: string;
  /** Озвучка ответа тьютора: data-URL с mp3. У реплики ученика её нет. */
  audio?: string | null;
};

type SessionResponse = { id: number };

type MessagesResponse = {
  studentMessage?: { id?: number; transcript?: string };
  aiMessage?: { id?: number; transcript?: string; audioUrl?: string | null };
  pointsEarned?: number;
};

/** С чего начинается разговор: тьютор здоровается первым. */
const GREETING =
  "Hi! I am your English tutor. Tell me about your day - what did you do today?";

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

/**
 * Файл записи в base64.
 *
 * Через fetch и FileReader, а не через expo-file-system: его в проекте нет, а
 * этот путь одинаково работает и с blob-адресом на вебе, и с file:// на
 * телефоне. Возвращаем и сам тип файла: whisper отказывается разбирать запись,
 * названную не своим типом.
 */
async function readRecording(uri: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(uri);
  const blob = await res.blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать запись"));
    reader.onloadend = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(",");
  const head = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mimeType = head.replace(/^data:/, "").replace(/;base64$/, "") || blob.type || "audio/m4a";
  return { base64, mimeType };
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
  const [recording, setRecording] = React.useState<Audio.Recording | null>(null);
  const [sending, setSending] = React.useState(false);
  const [points, setPoints] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [denied, setDenied] = React.useState(false);

  const scroller = React.useRef<ScrollView | null>(null);
  const sound = React.useRef<Audio.Sound | null>(null);

  // Звук живёт дольше экрана, если его не выгрузить: уйдёшь на другую вкладку, а
  // тьютор продолжает говорить.
  React.useEffect(() => () => {
    void sound.current?.unloadAsync();
    void recording?.stopAndUnloadAsync().catch(() => {});
  }, [recording]);

  const play = React.useCallback(async (uri: string) => {
    try {
      await sound.current?.unloadAsync();
      const { sound: next } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      sound.current = next;
    } catch {
      /* не проигралось — текст ответа всё равно на экране */
    }
  }, []);

  /** Начать запись. Разрешение спрашиваем здесь: браузер даёт его по действию. */
  const startRecording = React.useCallback(async () => {
    setError(null);
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { setDenied(true); return; }
      setDenied(false);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecording(rec);
    } catch (e: any) {
      setError(e?.message ?? "Микрофон не запустился");
    }
  }, []);

  /** Остановить запись и отправить её тьютору. */
  const stopAndSend = React.useCallback(async () => {
    if (!recording) return;
    setSending(true);
    setError(null);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) throw new Error("Запись пустая");

      const { base64, mimeType } = await readRecording(uri);

      // Сессия создаётся перед первой отправкой, а не при открытии экрана:
      // иначе каждый случайный заход считался бы разговором.
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
        { method: "POST", body: JSON.stringify({ audioBase64: base64, mimeType }) },
      );

      const mine = data.studentMessage?.transcript?.trim();
      const reply = data.aiMessage?.transcript?.trim();
      const replyAudio = data.aiMessage?.audioUrl ?? null;

      setLines((prev) => [
        ...prev,
        // Расшифровку своей реплики показываем всегда: по ней видно, как ученика
        // услышали, и половина «тьютор отвечает невпопад» объясняется именно ей.
        { id: `s-${data.studentMessage?.id ?? Date.now()}`, role: "student", text: mine || "…" },
        { id: `a-${data.aiMessage?.id ?? Date.now()}`, role: "ai", text: reply || "…", audio: replyAudio },
      ]);
      setPoints((p) => p + (data.pointsEarned ?? 0));
      if (replyAudio) void play(replyAudio);

      // Очки ушли в общий счёт: экраны, где они видны, обязаны перечитать данные.
      qc.invalidateQueries({ queryKey: ["gamification-stats"] });
    } catch (e: any) {
      setError(e?.message ?? "Не удалось отправить запись");
    } finally {
      setSending(false);
    }
  }, [recording, sessionId, play, qc]);

  const exit = React.useCallback(() => {
    void sound.current?.unloadAsync();
    router.replace("/flashcards");
  }, [router]);

  const busy = sending;
  const isRecording = !!recording;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={(r) => { scroller.current = r; }}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: screenTop(insets),
          paddingBottom: screenBottom(insets) + 150,
        }}
        showsVerticalScrollIndicator={false}
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

        <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.mutedForeground, marginBottom: 16 }}>
          Говори по-английски вслух. Тьютор поймёт, ответит голосом и мягко
          поправит ошибки. Под своей репликой видно, как тебя услышали.
        </Text>

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
                borderColor: mine ? colors.primary + "44" : colors.border,
                borderRadius: radii.md,
                paddingVertical: 11,
                paddingHorizontal: 14,
                marginBottom: 10,
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
              Слушаю и думаю над ответом…
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
              кнопку записи ещё раз. Если окно не появилось, проверь настройки сайта.
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

      {/* Кнопка записи прижата к низу: до неё не нужно долистывать ленту.
          Панель вкладок плавает поверх содержимого, поэтому отступ снизу берётся
          из screenBottom. */}
      <View style={{
        position: "absolute", left: 16, right: 16,
        bottom: screenBottom(insets) - 60,
      }}>
        <ChunkyButton
          label={isRecording ? "Стоп и отправить" : busy ? "Секунду…" : "Говорить"}
          sublabel={isRecording ? "идёт запись" : "нажми, скажи фразу, нажми ещё раз"}
          icon={isRecording ? "check" : "sound"}
          tone={isRecording ? "warm" : "primary"}
          center
          disabled={busy}
          onPress={() => { void (isRecording ? stopAndSend() : startRecording()); }}
        />
        {Platform.OS === "web" && !isRecording && !busy && (
          <Text style={{
            fontSize: 11, color: colors.mutedForeground,
            textAlign: "center", marginTop: 7,
          }}>
            Говори целыми фразами — так тьютор понимает точнее
          </Text>
        )}
      </View>
    </View>
  );
}
