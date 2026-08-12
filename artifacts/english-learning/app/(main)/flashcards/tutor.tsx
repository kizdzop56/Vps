// ─────────────────────────────────────────────────────────────────────────────
// Разговор с тьютором: голосовая практика речи.
//
// ── Почему экран появился позже сервера ─────────────────────────────────────
// Сервер умел это давно (api-server/src/routes/voiceChat.ts): расшифровка речи
// через whisper, ответ языковой модели, озвучка ответа и начисление очков. Не
// было ТОЛЬКО экрана. Раздел жил в наградах («провести N разговоров») и в
// статистике профиля — то есть ученик видел награду, которую физически не мог
// получить.
//
// ── Запись живёт не здесь ───────────────────────────────────────────────────
// Первая версия писала звук через Audio.Recording из expo-av — и на вебе не
// работала вовсе: в expo-av записи для веба нет, только проигрывание. Кнопка
// падала, и раздел выглядел неработающим.
//
// Теперь запись за общей ручкой (utils/voiceRecorder.ts): на вебе MediaRecorder
// из браузера, на телефоне expo-av. Экрану всё равно, чем именно записано, и
// вторая платформа больше не ломает первую.
//
// ── Готовность спрашивается заранее ─────────────────────────────────────────
// GET /voice-chat/status отвечает, настроен ли тьютор на сервере. Спрашиваем ДО
// первой записи: иначе ученик собирается с духом, говорит вслух и только потом
// узнаёт, что говорить было некому.
//
// ── Как устроен разговор ────────────────────────────────────────────────────
// Ученик нажимает кнопку и говорит, нажимает снова — запись уходит на сервер.
// Оттуда приходит расшифровка его же реплики (это важно: видно, КАК его
// услышали) и ответ тьютора текстом и голосом. Ответ проигрывается сам,
// повторить можно нажатием на реплику.
//
// Сессия создаётся не при открытии экрана, а перед ПЕРВОЙ удачной записью.
// Иначе каждый случайный заход плодил бы пустую сессию, и «разговоров» в
// статистике становилось больше, чем разговоров на самом деле.
//
// Эмодзи не используются: значки — глифы из своего набора.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, ActivityIndicator,
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
};

type SessionResponse = { id: number };
type StatusResponse = { ready?: boolean };

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

export default function TutorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [lines, setLines] = React.useState<Line[]>([
    { id: "greeting", role: "ai", text: GREETING },
  ]);
  const [sessionId, setSessionId] = React.useState<number | null>(null);
  const [recording, setRecording] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [points, setPoints] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [denied, setDenied] = React.useState(false);
  /** null — ещё не спросили; false — тьютор не настроен на сервере. */
  const [ready, setReady] = React.useState<boolean | null>(null);

  const scroller = React.useRef<ScrollView | null>(null);
  const recorder = React.useRef<VoiceRecorder | null>(null);
  const stopPlayback = React.useRef<StopPlayback | null>(null);

  // Настроен ли раздел. Спрашиваем один раз при открытии: ответ не меняется без
  // перезапуска сервера.
  React.useEffect(() => {
    let alive = true;
    apiFetch<StatusResponse>("/api/voice-chat/status")
      .then((s) => { if (alive) setReady(s?.ready !== false); })
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
    setSending(true);
    setError(null);
    try {
      const { base64, mimeType } = await rec.stop();
      recorder.current = null;

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
      recorder.current = null;
      setError(e?.message ?? "Не удалось отправить запись");
    } finally {
      setSending(false);
    }
  }, [sessionId, play, qc]);

  const exit = React.useCallback(() => {
    stopPlayback.current?.();
    void recorder.current?.cancel();
    router.replace("/flashcards");
  }, [router]);

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

        {/* Раздел не настроен на сервере — говорим это сразу, а не после
            потраченной впустую записи. */}
        {ready === false && (
          <Tile glow={colors.destructive} style={{ padding: 15, marginBottom: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.destructive }}>
              Тьютор пока недоступен
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginTop: 6 }}>
              На сервере не задан ключ доступа к распознаванию речи. Остальные
              разделы работают как обычно.
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
          label={recording ? "Стоп и отправить" : sending ? "Секунду…" : "Говорить"}
          sublabel={recording ? "идёт запись" : "нажми, скажи фразу, нажми ещё раз"}
          icon={recording ? "check" : "sound"}
          tone={recording ? "warm" : "primary"}
          center
          disabled={sending || ready === false}
          onPress={() => { void (recording ? stopAndSend() : startRecording()); }}
        />
      </View>
    </View>
  );
}
