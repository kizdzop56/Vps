// ─────────────────────────────────────────────────────────────────────────────
// РАЗГОВОР СО СНЕЖЕЙ: практика речи голосом или письмом.
//
// ── Почему это не «тьютор» ──────────────────────────────────────────────────
// Раньше собеседник назывался тьютором и никак не выглядел: реплики подписаны
// «ТЬЮТОР», и всё. Для ребёнка это переписка с настройкой, а не разговор.
//
// Снежа в приложении уже есть — она встречает, хвалит и подсказывает. Логично,
// что и говорить ученик будет с ней. Поэтому наверху сидит живая Снежа
// (components/SnezhaLive.tsx), и по ней ВИДНО, что происходит: слушает, думает,
// говорит или просто дышит. Подписи-состояния при этом тоже остались: картинка
// сообщает быстрее, но текст надёжнее.
//
// ── ОШИБКА ОСТАНАВЛИВАЕТ РАЗГОВОР ──────────────────────────────────────────
// Снежа проверяет каждую реплику ученика. Ошиблась фраза — под ней появляется
// разбор (что не так и как правильно), Снежа просит повторить, и над кнопкой
// висит полоса «повтори правильно». Разговор дальше не идёт, пока фраза не
// прозвучит верно.
//
// Полоса нужна отдельно от реплики: ленту прокрутили — и просьба уехала вверх,
// а руки ученика внизу, у кнопки. Там же ей и место.
//
// Больше двух заходов на одну фразу не бывает: на третьей попытке сервер
// принимает как есть (см. MAX_RETRIES в routes/voiceChat.ts). Ребёнок, который
// не понимает, чего от него хотят, иначе застревает навсегда.
//
// ── ПЕРЕВОД ПО СТРЕЛОЧКЕ ───────────────────────────────────────────────────
// У каждой реплики Снежи справа стрелка. Нажал — под текстом раскрылся перевод
// на русский; нажал ещё раз — свернулся.
//
// Свёрнут ПО УМОЛЧАНИЮ, и это главное решение здесь. Перевод, который висит
// рядом всегда, убивает смысл упражнения: глаз читает русское и до английского
// просто не доходит. Стрелка делает перевод осознанным выбором — «я попробовал
// понять, не вышло, показывай».
//
// Перевод приходит с сервера один раз и остаётся в реплике: свернуть и
// развернуть заново можно сколько угодно, второго запроса не будет.
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
// ── ПЕРВЫМ ГОВОРИТ УЧЕНИК ───────────────────────────────────────────────────
// Тут было готовое приветствие Снежи, вписанное в код. Оно выглядело как
// разговор, которого не было: реплика висела в ленте до всякого соединения с
// сервером, и по ней нельзя было понять, работает раздел или нет.
//
// Теперь лента начинается пустой, а вместо приветствия — приглашение сказать
// первое слово. Первая реплика Снежи в разговоре ВСЕГДА настоящая, из модели.
//
// ── ЛЮБУЮ РЕПЛИКУ СНЕЖИ МОЖНО ОЗВУЧИТЬ НАЖАТИЕМ ────────────────────────────
// Озвучка приходит вместе с ответом, но не всегда: у синтезаторов бывают лимиты
// и квоты. Раньше это был приговор — звука у реплики не появлялось уже никогда,
// и выглядело как «озвучивает через раз».
//
// Теперь нажатие на реплику либо играет готовый звук, либо просит сервер
// синтезировать его сейчас (POST /voice-chat/speak).
//
// ── ГРАБЛИ: ЗАПРЕТ АВТОЗАПУСКА ЗВУКА ───────────────────────────────────────
// Ответ приходит через несколько секунд после нажатия, и к этому моменту Safari
// уже не считает проигрывание следствием действия человека — play() отвечает
// отказом. Лечится в utils/voiceRecorder.ts: плеер один и разблокируется в
// момент нажатия (primeAudio), поэтому primeAudio ОБЯЗАН вызываться синхронно
// в обработчике, до любого await.
//
// Если звук всё-таки заблокирован, экран об этом говорит: подсказка меняется на
// «нажми, чтобы включить звук». Молчать нельзя — иначе это снова выглядит как
// поломка озвучки.
//
// ── СВОЯ РЕПЛИКА ПОКАЗЫВАЕТСЯ СРАЗУ ────────────────────────────────────────
// Раньше она добавлялась в ленту ВМЕСТЕ с ответом, одним куском. Пока всё
// работало, разницы не было. Стоило ответу не прийти — и сказанное исчезало
// совсем, то есть разговор выглядел так, будто ученик ничего и не говорил.
//
// Теперь реплика встаёт в ленту немедленно, а по ответу сервера либо уточняется
// расшифровкой (в голосовом режиме важно видеть, КАК тебя услышали), либо
// помечается «не доставлено».
//
// ── Запись живёт не здесь ───────────────────────────────────────────────────
// Первая версия писала звук через Audio.Recording из expo-av — и на вебе не
// работала вовсе: в expo-av записи для веба нет, только проигрывание. Теперь
// запись за общей ручкой (utils/voiceRecorder.ts).
//
// ── ГРАБЛИ: НИКАКОГО position: absolute ДЛЯ НИЖНЕЙ ПАНЕЛИ ───────────────────
// Кнопка «Говорить» стояла так:
//
//   position: "absolute", bottom: screenBottom(insets) - 60
//
// screenBottom — это отступ ДЛЯ СОДЕРЖИМОГО: он уже включает высоту панели
// вкладок, её подъём и воздух. Вычитая из него шестьдесят, кнопка оказывалась
// ВНУТРИ полосы панели и уходила под неё наполовину.
//
// Теперь абсолютного позиционирования нет вовсе: лента и панель ввода — два
// элемента одного flex-столбца, а screenBottom применяется к нижнему целиком.
//
// Эмодзи не используются: значки — глифы из своего набора.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/hooks/useFlashcards";
import {
  MicDeniedError,
  createVoiceRecorder,
  playSpeech,
  primeAudio,
  type StopPlayback,
  type VoiceRecorder,
} from "@/utils/voiceRecorder";
import { SnezhaLive, type SnezhaState } from "@/components/SnezhaLive";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Tile } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";

/** Как зовут собеседницу. Одно место на весь экран. */
const NAME = "Снежа";

/** Реплика в ленте разговора. */
type Line = {
  id: string;
  role: "student" | "ai";
  text: string;
  /** Готовая озвучка: data-URL. Нет — можно запросить нажатием. */
  audio?: string | null;
  /** Реплика ещё в пути: показываем её приглушённой. */
  pending?: boolean;
  /** Ответ не пришёл. Реплика остаётся в ленте, но помечена. */
  failed?: boolean;
  /** Озвучить не удалось. Показываем на самой реплике, а не плашкой. */
  voiceFailed?: boolean;
  /** Перевод на русский. Приходит один раз и остаётся. */
  ru?: string;
  /** Перевод раскрыт. По умолчанию нет: см. шапку файла. */
  ruOpen?: boolean;
  /** Перевести не удалось. */
  ruFailed?: boolean;
  // ── Разбор своей реплики (только у role === "student") ──
  /** Как надо было сказать. Пусто — сказано верно. */
  fixed?: string;
  /** Что было не так, по-русски. */
  issue?: string;
};

type SessionResponse = { id: number };
type StatusResponse = { ready?: boolean; reason?: string };
type SpeakResponse = { audioUrl?: string | null };
type TranslateResponse = { text?: string | null };

type MessagesResponse = {
  studentMessage?: { id?: number; transcript?: string };
  aiMessage?: { id?: number; transcript?: string; audioUrl?: string | null };
  pointsEarned?: number;
  correction?: {
    ok?: boolean;
    fixed?: string;
    issue?: string;
    needsRetry?: boolean;
  };
};

/** Как ученик отвечает. */
type Mode = "voice" | "text";

const MODES: { key: Mode; label: string }[] = [
  { key: "voice", label: "Говорить" },
  { key: "text", label: "Писать" },
];

/** Заглушка на месте расшифровки, пока запись едет на сервер. */
const VOICE_PLACEHOLDER = "…";

/**
 * Страховка на случай, если конец звука не придёт событием: рот перестанет
 * двигаться сам. Больше минуты реплика Снежи не длится никогда.
 */
const SPEECH_CAP_MS = 60_000;

/** Что Снежа делает — словами. Картинка быстрее, но подпись надёжнее. */
const STATUS: Record<SnezhaState, string> = {
  idle: "жду, что скажешь",
  listen: "слушаю тебя",
  think: "думаю над ответом",
  speak: "говорю",
};

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
  const { width: W } = useWindowDimensions();

  // Лента начинается ПУСТОЙ: первым говорит ученик (см. шапку файла).
  const [lines, setLines] = React.useState<Line[]>([]);
  const [sessionId, setSessionId] = React.useState<number | null>(null);
  const [mode, setMode] = React.useState<Mode>("voice");
  const [typed, setTyped] = React.useState("");
  const [recording, setRecording] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  /** Снежа сейчас говорит: этим двигается рот. */
  const [voicing, setVoicing] = React.useState(false);
  const [points, setPoints] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [denied, setDenied] = React.useState(false);
  /** Какую реплику озвучиваем по нажатию: у неё вместо подсказки «озвучиваю…». */
  const [asking, setAsking] = React.useState<string | null>(null);
  /** Какую реплику переводим прямо сейчас. */
  const [translating, setTranslating] = React.useState<string | null>(null);
  /** Браузер не дал играть без нажатия. Подсказка на репликах меняется. */
  const [audioBlocked, setAudioBlocked] = React.useState(false);
  /**
   * Сколько раз подряд ученик ошибся на текущей фразе. Уходит на сервер: по
   * нему он решает, просить повтор снова или принять фразу как есть.
   */
  const [retry, setRetry] = React.useState(0);
  /** Правильный вариант последней неверной фразы: его и просим повторить. */
  const [awaited, setAwaited] = React.useState<string | null>(null);
  /** null — ещё не спросили; false — разговор не настроен на сервере. */
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

  // Уход с экрана обязан оборвать и запись, и звук: иначе Снежа продолжает
  // говорить с другой вкладки, а в браузере горит индикатор микрофона.
  React.useEffect(() => () => {
    stopPlayback.current?.();
    void recorder.current?.cancel();
  }, []);

  // Рот не должен шевелиться вечно, если событие конца потерялось.
  React.useEffect(() => {
    if (!voicing) return;
    const t = setTimeout(() => setVoicing(false), SPEECH_CAP_MS);
    return () => clearTimeout(t);
  }, [voicing]);

  /** Проиграть звук: рот двигается ровно пока он звучит. */
  const play = React.useCallback(async (uri: string) => {
    try {
      stopPlayback.current?.();
      setVoicing(true);
      const playback = await playSpeech(uri, { onEnd: () => setVoicing(false) });
      stopPlayback.current = () => { playback.stop(); setVoicing(false); };
      setAudioBlocked(playback.blocked);
      if (playback.blocked) setVoicing(false);
    } catch {
      setVoicing(false);
      setAudioBlocked(true);
    }
  }, []);

  /**
   * Озвучить реплику Снежи по нажатию.
   *
   * Звук уже есть — играем. Нет — просим сервер синтезировать сейчас: ответ мог
   * прийти без озвучки, и второй попытки раньше не было.
   */
  const speakLine = React.useCallback(async (line: Line) => {
    // Строго до await: этим нажатием разблокируется звук (см. шапку файла).
    primeAudio();
    if (line.audio) { void play(line.audio); return; }
    if (asking) return;

    setAsking(line.id);
    setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, voiceFailed: false } : l)));
    try {
      const data = await apiFetch<SpeakResponse>("/api/voice-chat/speak", {
        method: "POST",
        body: JSON.stringify({ text: line.text }),
      });
      const url = data?.audioUrl;
      if (!url) throw new Error("Звук не пришёл");
      setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, audio: url } : l)));
      await play(url);
    } catch {
      // Тихо и на самой реплике: плашка с ошибкой тут слишком громкая для того,
      // что текст ответа уже прочитан.
      setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, voiceFailed: true } : l)));
    } finally {
      setAsking(null);
    }
  }, [play, asking]);

  /**
   * Развернуть или свернуть перевод реплики.
   *
   * Перевод запрашивается только в первый раз: дальше он лежит в самой реплике,
   * и стрелка работает мгновенно.
   */
  const toggleTranslation = React.useCallback(async (line: Line) => {
    const open = !line.ruOpen;
    setLines((prev) =>
      prev.map((l) => (l.id === line.id ? { ...l, ruOpen: open, ruFailed: false } : l)),
    );
    // Сворачиваем, уже переведено или перевод в пути — сети не нужно.
    if (!open || line.ru || translating) return;

    setTranslating(line.id);
    try {
      const data = await apiFetch<TranslateResponse>("/api/voice-chat/translate", {
        method: "POST",
        body: JSON.stringify({ text: line.text }),
      });
      const ru = data?.text?.trim();
      if (!ru) throw new Error("Перевод не пришёл");
      setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, ru } : l)));
    } catch {
      setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, ruFailed: true } : l)));
    } finally {
      setTranslating(null);
    }
  }, [translating]);

  /**
   * Отправить реплику: либо запись, либо текст.
   *
   * Обе ветки сходятся здесь, потому что дальше всё одинаково — сессия, разбор,
   * ответ Снежи, очки, лента. Две копии этого кода разъехались бы на первой
   * правке.
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
        // retry едет вместе с репликой: сервер по нему понимает, сколько раз
        // ученик уже пробовал эту фразу.
        { method: "POST", body: JSON.stringify({ ...payload, retry }) },
      );

      const mine = data.studentMessage?.transcript?.trim();
      const reply = data.aiMessage?.transcript?.trim();
      const replyAudio = data.aiMessage?.audioUrl ?? null;
      const correction = data.correction;
      const mistake = correction?.ok === false;

      setLines((prev) => [
        // Уточняем свою реплику расшифровкой: в голосовом режиме по ней видно,
        // как ученика услышали, и половина «отвечает невпопад» объясняется ей.
        // Заодно вешаем разбор — он показывается прямо под сказанным.
        ...prev.map((l) => (l.id === localId
          ? {
              ...l,
              text: mine || l.text,
              pending: false,
              fixed: mistake ? (correction?.fixed || "") : "",
              issue: mistake ? (correction?.issue || "") : "",
            }
          : l)),
        {
          id: `a-${data.aiMessage?.id ?? Date.now()}`,
          role: "ai" as const,
          text: reply || "…",
          audio: replyAudio,
        },
      ]);

      // Ошиблись — счётчик попыток растёт, и над кнопкой появляется просьба.
      // Сказали верно — всё сбрасывается, разговор идёт дальше.
      if (correction?.needsRetry) {
        setRetry((n) => n + 1);
        setAwaited(correction?.fixed?.trim() || null);
      } else {
        setRetry(0);
        setAwaited(null);
      }

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
  }, [sessionId, play, qc, retry]);

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

  /** Остановить запись и отправить её Снеже. */
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
    // Поле чистим сразу: реплика уже видна в ленте, и оставлять её ещё и в поле
    // значит показывать одно и то же дважды.
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
  const needsRetry = retry > 0;

  // Состояние Снежи. Порядок проверок — это приоритет: пока идёт запись, она
  // слушает, чем бы там ни занимался сервер.
  const snezhaState: SnezhaState =
    recording ? "listen" : sending ? "think" : voicing ? "speak" : "idle";

  /** Ростом Снежа занимает четверть ширины экрана: рядом с ней ещё текст. */
  const mascotW = Math.min(112, Math.max(88, Math.round(W * 0.26)));

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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Pressable
            onPress={exit}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Назад"
            style={{ transform: [{ rotate: "180deg" }], padding: 4 }}
          >
            <Glyph name="chevron" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 23, fontWeight: "900", letterSpacing: -0.7, color: colors.foreground }}>
            {`Разговор со ${NAME}й`}
          </Text>
          {points > 0 && (
            <Text style={{ fontSize: 15, fontWeight: "900", color: accents.magenta, fontVariant: ["tabular-nums"] }}>
              {`+${points}`}
            </Text>
          )}
        </View>

        {/* ── Сама Снежа ──
            Слева зверь, справа имя и состояние словами. Нажатие на неё
            переозвучивает последний ответ: по персонажу хочется потыкать, и
            это самое ожидаемое, что может произойти. */}
        <Pressable
          onPress={() => {
            const last = [...lines].reverse().find((l) => l.role === "ai");
            if (last) void speakLine(last);
            else primeAudio();
          }}
          accessibilityRole="button"
          accessibilityLabel={`${NAME}: ${STATUS[snezhaState]}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 }}
        >
          <SnezhaLive state={snezhaState} width={mascotW} still={blocked} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 18, fontWeight: "900", color: colors.foreground, letterSpacing: -0.3 }}>
              {NAME}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
              <View style={{
                width: 7, height: 7, borderRadius: 4,
                backgroundColor: snezhaState === "idle" ? colors.mutedForeground : colors.primary,
              }} />
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.mutedForeground }}>
                {STATUS[snezhaState]}
              </Text>
            </View>
            <Text style={{ fontSize: 11.5, lineHeight: 16, color: colors.mutedForeground, marginTop: 5 }}>
              {mode === "voice"
                ? "Говори по-английски вслух. Ошибёшься — Снежа поправит и попросит повторить"
                : "Пиши по-английски. Ошибёшься — Снежа поправит и попросит повторить"}
            </Text>
          </View>
        </Pressable>

        {/* Переключатель режима. Тот же вид, что у вкладок неправильных
            глаголов: выбранная кнопка приподнята и залита цветом карточки. */}
        <View style={{
          flexDirection: "row",
          backgroundColor: colors.primary + "14",
          borderRadius: radii.pill,
          padding: 4,
          marginBottom: 14,
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

        {/* Раздел не настроен на сервере — говорим это сразу, а не после
            потраченной впустую записи. */}
        {blocked && (
          <Tile glow={colors.destructive} style={{ padding: 15, marginBottom: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.destructive }}>
              {`${NAME} пока не может говорить`}
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginTop: 6 }}>
              {notReadyReason ?? "На сервере не задан ключ доступа к языковой модели."}
            </Text>
          </Tile>
        )}

        {/* Приглашение вместо вписанного приветствия: пока ученик не сказал
            ничего, разговора нет. */}
        {lines.length === 0 && !blocked && (
          <Text style={{
            fontSize: 13.5, lineHeight: 20, color: colors.mutedForeground,
            textAlign: "center", paddingVertical: 22, paddingHorizontal: 12,
          }}>
            {mode === "voice"
              ? `Начни разговор: нажми «Говорить» и скажи что-нибудь по-английски. Хоть «Hi!» — ${NAME} ответит.`
              : `Начни разговор: напиши что-нибудь по-английски. Хоть «Hi!» — ${NAME} ответит.`}
          </Text>
        )}

        {/* Лента разговора. Свои реплики справа, ответы слева — как в обычной
            переписке, чтобы не читать подписи «кто сказал». */}
        {lines.map((line) => {
          const mine = line.role === "student";
          // Реплику Снежи можно послушать и перевести всегда: звук либо готов,
          // либо синтезируется по нажатию.
          const listenable = !mine && !line.pending && line.text !== VOICE_PLACEHOLDER;
          const busy = asking === line.id;
          const ruBusy = translating === line.id;
          const hasFix = mine && (!!line.fixed || !!line.issue);

          const hint = busy
            ? "озвучиваю…"
            : line.voiceFailed
              ? "озвучить не вышло, попробуй ещё раз"
              : audioBlocked && line.audio
                ? "нажми, чтобы включить звук"
                : line.audio
                  ? "нажми, чтобы послушать ещё раз"
                  : "нажми, чтобы послушать";

          return (
            <Pressable
              key={line.id}
              onPress={() => { if (listenable) void speakLine(line); }}
              disabled={!listenable}
              accessibilityRole={listenable ? "button" : undefined}
              accessibilityLabel={listenable ? `Послушать ответ ${NAME}` : undefined}
              style={{
                alignSelf: mine ? "flex-end" : "flex-start",
                maxWidth: "88%",
                backgroundColor: mine ? colors.primary + "1f" : colors.card,
                borderWidth: 1,
                // Не доставленная реплика обведена красным, ошибочная — жёлтым.
                // Цвет ошибки НЕ красный намеренно: ошибка в упражнении это не
                // поломка, а нормальная часть учёбы.
                borderColor: line.failed
                  ? colors.destructive + "88"
                  : hasFix
                    ? colors.warning + "99"
                    : mine ? colors.primary + "44" : colors.border,
                borderRadius: radii.md,
                paddingVertical: 11,
                paddingHorizontal: 14,
                marginBottom: 10,
                opacity: line.pending ? 0.6 : 1,
              }}
            >
              {/* Шапка реплики: кто сказал и стрелка перевода. Стрелка только у
                  Снежи — свою реплику ученик переводить не станет. */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <Text style={{
                  flex: 1,
                  fontSize: 10, fontWeight: "900", letterSpacing: 1,
                  textTransform: "uppercase",
                  color: mine ? colors.primary : colors.mutedForeground,
                }}>
                  {mine ? "ты" : NAME}
                </Text>
                {listenable && (
                  <Pressable
                    onPress={(e: any) => {
                      // Гасим всплытие: на вебе нажатие иначе дойдёт до
                      // пузыря и заодно включит озвучку.
                      e?.stopPropagation?.();
                      void toggleTranslation(line);
                    }}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={line.ruOpen ? "Скрыть перевод" : "Показать перевод"}
                    accessibilityState={{ expanded: !!line.ruOpen }}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 4,
                      paddingHorizontal: 7, paddingVertical: 3,
                      borderRadius: radii.pill,
                      backgroundColor: line.ruOpen ? colors.primary + "1f" : "transparent",
                    }}
                  >
                    <Text style={{ fontSize: 9.5, fontWeight: "900", letterSpacing: 0.6, color: colors.primary }}>
                      RU
                    </Text>
                    {ruBusy
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : (
                        // Шеврон из набора смотрит вправо: вниз — «раскрыть»,
                        // вверх — «свернуть».
                        <View style={{ transform: [{ rotate: line.ruOpen ? "270deg" : "90deg" }] }}>
                          <Glyph name="chevron" size={13} color={colors.primary} />
                        </View>
                      )}
                  </Pressable>
                )}
              </View>

              <Text style={{ fontSize: 15, lineHeight: 22, color: colors.foreground }}>
                {line.text}
              </Text>

              {/* Перевод под текстом, за тонкой линией: он поясняет реплику, а
                  не спорит с ней за внимание. */}
              {line.ruOpen && (line.ru || line.ruFailed || ruBusy) && (
                <View style={{
                  marginTop: 9, paddingTop: 8,
                  borderTopWidth: 1, borderTopColor: colors.border,
                }}>
                  {line.ru ? (
                    <Text style={{ fontSize: 14, lineHeight: 20, color: colors.mutedForeground }}>
                      {line.ru}
                    </Text>
                  ) : line.ruFailed ? (
                    <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.destructive }}>
                      Перевод не пришёл. Нажми стрелку ещё раз.
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 12.5, color: colors.mutedForeground }}>
                      перевожу…
                    </Text>
                  )}
                </View>
              )}

              {/* ── Разбор своей реплики ──
                  Сначала КАК ПРАВИЛЬНО, потом что было не так. Именно в таком
                  порядке: повторять ученик будет верный вариант, и он должен
                  быть первым, что попадается глазу. */}
              {hasFix && (
                <View style={{
                  marginTop: 9, paddingTop: 8,
                  borderTopWidth: 1, borderTopColor: colors.warning + "55",
                }}>
                  {!!line.fixed && (
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 7 }}>
                      <Glyph name="check" size={13} color={colors.warning} />
                      <Text style={{
                        flex: 1, fontSize: 14.5, lineHeight: 21,
                        fontWeight: "800", color: colors.foreground,
                      }}>
                        {line.fixed}
                      </Text>
                    </View>
                  )}
                  {!!line.issue && (
                    <Text style={{
                      fontSize: 12.5, lineHeight: 18,
                      color: colors.mutedForeground, marginTop: line.fixed ? 6 : 0,
                    }}>
                      {line.issue}
                    </Text>
                  )}
                </View>
              )}

              {line.failed && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 7 }}>
                  <Glyph name="alert" size={13} color={colors.destructive} />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.destructive }}>
                    не доставлено
                  </Text>
                </View>
              )}
              {listenable && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 7 }}>
                  {busy
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Glyph name="sound" size={13} color={line.voiceFailed ? colors.destructive : colors.primary} />}
                  <Text style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: line.voiceFailed ? colors.destructive : colors.primary,
                  }}>
                    {hint}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}

        {/* Ждём ответ. Без подписи: и кружок, и сама Снежа уже показывают это. */}
        {sending && (
          <ActivityIndicator color={colors.primary} style={{ alignSelf: "flex-start", marginTop: 4 }} />
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
        {/* Просьба повторить. Живёт у кнопки, а не в ленте: ленту прокрутили —
            и просьба уехала вверх, а руки ученика здесь. */}
        {needsRetry && !blocked && (
          <View style={{
            flexDirection: "row", alignItems: "flex-start", gap: 8,
            backgroundColor: colors.warning + "1f",
            borderWidth: 1, borderColor: colors.warning + "66",
            borderRadius: radii.sm,
            paddingVertical: 9, paddingHorizontal: 12,
            marginBottom: 10,
          }}>
            <Glyph name="repeat" size={14} color={colors.warning} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 12.5, fontWeight: "800", color: colors.foreground }}>
                {mode === "voice" ? "Скажи это ещё раз, правильно" : "Напиши это ещё раз, правильно"}
              </Text>
              {!!awaited && (
                <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginTop: 3 }}>
                  {awaited}
                </Text>
              )}
            </View>
          </View>
        )}

        {mode === "voice" ? (
          <ChunkyButton
            label={recording
              ? "Стоп и отправить"
              : sending ? "Секунду…" : needsRetry ? "Повторить" : "Говорить"}
            sublabel={recording
              ? `${NAME} слушает`
              : needsRetry ? "скажи исправленную фразу" : "нажми, скажи фразу, нажми ещё раз"}
            icon={recording ? "check" : needsRetry ? "repeat" : "sound"}
            tone={recording || needsRetry ? "warm" : "primary"}
            center
            disabled={sending || blocked}
            onPress={() => {
              // Разблокировка звука — первым делом, синхронно: ответ придёт
              // через несколько секунд, и тогда браузер играть уже не даст.
              primeAudio();
              void (recording ? stopAndSend() : startRecording());
            }}
          />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder={needsRetry ? "Напиши правильно" : "Напиши по-английски"}
              placeholderTextColor={colors.mutedForeground}
              editable={!sending && !blocked}
              multiline
              maxLength={500}
              onSubmitEditing={() => { primeAudio(); void sendTyped(); }}
              returnKeyType="send"
              style={{
                flex: 1,
                minHeight: 52,
                maxHeight: 120,
                backgroundColor: colors.card,
                borderRadius: radii.md,
                borderWidth: 2,
                borderColor: needsRetry ? colors.warning + "aa" : colors.border,
                paddingHorizontal: 14,
                paddingVertical: Platform.OS === "web" ? 14 : 12,
                fontSize: 16,
                fontWeight: "600",
                color: colors.foreground,
              }}
            />
            <Pressable
              onPress={() => { primeAudio(); void sendTyped(); }}
              disabled={sending || blocked || typed.trim().length === 0}
              accessibilityRole="button"
              accessibilityLabel="Отправить"
              style={{
                width: 52, height: 52, borderRadius: radii.md,
                alignItems: "center", justifyContent: "center",
                backgroundColor: needsRetry ? colors.warning : colors.primary,
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
