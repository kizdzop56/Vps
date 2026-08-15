// ─────────────────────────────────────────────────────────────────────────────
// РАЗГОВОР СО СНЕЖЕЙ: практика речи голосом или письмом.
//
// ── Почему это не «тьютор» ──────────────────────────────────────────────────
// Раньше собеседник назывался тьютором и никак не выглядел: реплики подписаны
// «ТЬЮТОР», и всё. Для ребёнка это переписка с настройкой, а не разговор.
//
// Теперь наверху сидит сама Снежа (components/SnezhaFrames.tsx): статичная
// картинка, а когда отвечает — покадровая мимика из готовых кадров. Что
// происходит, видно и по ней, и по подписи рядом: картинка сообщает быстрее,
// текст надёжнее.
//
// ── ДВЕ ВКЛАДКИ: РАЗГОВОР И ЗАДАНИЯ ОТ УЧИТЕЛЯ ─────────────────────────────
// Ситуации от учителя раньше были отдельным пунктом в оглавлении «Учёбы», рядом
// с этим экраном. Два соседних входа в один и тот же разговор ученик читает как
// «одно и то же дважды»: он открывал то одно, то другое и не понимал, где
// задание.
//
// Теперь они здесь, второй вкладкой, и на кнопке горит счётчик: пришла ситуация
// — цифра видна, не заходя внутрь. Ленты не смешаны намеренно: свободный
// разговор ничего не проверяет, а ситуация — задание с целью, концом и отчётом
// учителю. Одна лента на двоих превратила бы болтовню в экзамен.
//
// ── РАЗГОВОР ПРОДОЛЖАЕТСЯ ПОСЛЕ ПЕРЕЗАГРУЗКИ ───────────────────────────────
// Реплики всегда лежали на сервере, но экран о них не спрашивал: обновил
// страницу — и лента пустая, как будто ничего не было.
//
// Теперь при открытии экран забирает последний разговор (GET /voice-chat/latest)
// и продолжает с того же места. Номер сессии оттуда же, поэтому следующая
// реплика дописывается в ТОТ ЖЕ разговор, а не начинает новый — иначе модель
// теряла бы контекст, а очки считались бы по новой сессии.
//
// Пока разговор грузится, экран не пустой: на месте ленты кружок. Пустота здесь
// неотличима от «всё пропало», а именно этого мы и не хотим.
//
// ── ГРАБЛИ: СНЕЖА УЕЗЖАЛА ВМЕСТЕ С ЛЕНТОЙ ──────────────────────────────────
// Экран был одним большим ScrollView, и после пяти реплик Снежа оставалась выше
// края. Теперь экран — ТРИ элемента одного flex-столбца: шапка (не
// прокручивается), лента (flex: 1, прокручивается она одна) и панель ввода (не
// прокручивается). Снежа видна ВСЕГДА.
//
// ── ГРАБЛИ: ЗВУК В ОТВЕТЕ РВАЛ ЗАПРОС НА МОБИЛЬНОЙ СЕТИ ────────────────────
// Ответ на реплику приходил вместе с озвучкой — сотни килобайт base64 в JSON.
// На 3G запрос обрывался, и Safari сообщал ровно «Load failed».
//
// Теперь сервер отдаёт только текст, а звук экран просит отдельно, сразу после
// появления реплики: текст виден немедленно, голос догоняет через секунду.
//
// ── ОШИБКА СЕТИ ОБЪЯСНЯЕТСЯ ПО-ЧЕЛОВЕЧЕСКИ ─────────────────────────────────
// «Load failed» и «Failed to fetch» переводятся в одну понятную фразу про
// интернет, а сама реплика получает кнопку «Отправить ещё раз». Кнопка важнее
// текста: без неё недоставленная реплика оставалась мёртвым грузом.
//
// ── ОШИБКА В ЯЗЫКЕ ОСТАНАВЛИВАЕТ РАЗГОВОР ──────────────────────────────────
// Ошиблась фраза — под ней разбор (как правильно и что не так), Снежа просит
// повторить, и над кнопкой висит полоса «повтори правильно». Русская реплика —
// такой же случай: в разборе приходит её английский перевод.
//
// Больше двух заходов на одну фразу не бывает: на третьей попытке сервер
// принимает как есть (см. MAX_RETRIES в routes/voiceChat.ts).
//
// ── ПЕРЕВОД ПО СТРЕЛОЧКЕ ───────────────────────────────────────────────────
// У каждой реплики Снежи справа стрелка. Свёрнуто ПО УМОЛЧАНИЮ: перевод,
// который висит рядом всегда, убивает смысл упражнения.
//
// ── ГРАБЛИ: ЗАПРЕТ АВТОЗАПУСКА ЗВУКА ───────────────────────────────────────
// Ответ приходит через несколько секунд после нажатия, и Safari уже не считает
// проигрывание следствием действия человека. Лечится в utils/voiceRecorder.ts:
// плеер один и разблокируется в момент нажатия (primeAudio), поэтому primeAudio
// ОБЯЗАН вызываться синхронно в обработчике, до любого await.
//
// ── Очки НЕ показываются во время разговора ─────────────────────────────────
// Раньше в шапке рос счётчик «+N» с каждым ответом Снежи — то же самое, что уже
// признали лишним в тренажёре слов и в грамматике (см. «Опыт не мелькает во
// время тренировки» в components/WordTrainer.tsx). У этого экрана в отличие от
// тренажёров нет итогового экрана «сессия закончена» — разговор продолжается
// сколько угодно и переживает перезагрузку (см. блок выше), поэтому копить очки
// молча и показать один раз «в конце» здесь буквально негде. Раз мелькать во
// время занятия им нельзя нигде, счётчик просто убран из шапки: state points
// по-прежнему считается (пригодится, если разговору однажды добавят итоговый
// экран), но нигде не отображается.
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { SnezhaFrames, type SnezhaState } from "@/components/SnezhaFrames";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, Tile } from "@/components/ui/GameKit";
import {
  finishText, freshScenarioCount, scenarios as scenarioApi,
  type StudentScenario,
} from "@/hooks/useScenarios";
import { accents, radii } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";

/** Как зовут собеседницу. Одно место на весь экран. */
const NAME = "Снежа";

/** Реплика в ленте разговора. */
type Line = {
  id: string;
  role: "student" | "ai";
  text: string;
  /** Готовая озвучка: data-URL. Приходит вторым запросом. */
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

/** Последний разговор: им экран восстанавливается после перезагрузки. */
type LatestResponse = {
  session?: { id?: number; pointsEarned?: number } | null;
  messages?: Array<{ id?: number; role?: string; transcript?: string }>;
};

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

/** Что открыто: свободный разговор или задания от учителя. */
type Tab = "talk" | "tasks";

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
 * Понятная причина вместо браузерной.
 *
 * «Load failed», «Failed to fetch», «Network request failed» — это одно и то же
 * событие: запрос не дошёл. Показывать эти слова ребёнку бессмысленно, а главное
 * — по ним не догадаться, что делать. Всё остальное (ответы сервера про модель,
 * квоту, формат записи) оставляем как есть: там текст осмысленный.
 */
function humanError(message: string, detail: string): string {
  const raw = `${message} ${detail}`.toLowerCase();
  const networkish =
    raw.includes("load failed") ||
    raw.includes("failed to fetch") ||
    raw.includes("network request failed") ||
    raw.includes("networkerror") ||
    raw.includes("typeerror: fetch");

  if (networkish) {
    return "Сообщение не дошло до сервера. Проверь интернет и отправь ещё раз.";
  }
  return [message, detail].filter(Boolean).join(" ");
}

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

/** Состояние задания одной меткой: по нему понятно, что делать дальше. */
function taskState(s: StudentScenario): { text: string; color: string } {
  if (s.attempt?.status === "active") return { text: "идёт", color: accents.amber };
  if (s.done > 0) return { text: "пройдено", color: accents.violetDeep };
  return { text: "новое", color: "#e11d48" };
}

export default function TutorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { width: W } = useWindowDimensions();

  const [tab, setTab] = React.useState<Tab>("talk");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [sessionId, setSessionId] = React.useState<number | null>(null);
  const [mode, setMode] = React.useState<Mode>("voice");
  const [typed, setTyped] = React.useState("");
  const [recording, setRecording] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  /** Снежа сейчас говорит: этим двигается рот. */
  const [voicing, setVoicing] = React.useState(false);
  // Копится молча, нигде не отображается — см. «Очки НЕ показываются во время
  // разговора» в шапке файла.
  const [points, setPoints] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [denied, setDenied] = React.useState(false);
  /** Какую реплику озвучиваем прямо сейчас. */
  const [asking, setAsking] = React.useState<string | null>(null);
  /** Какую реплику переводим прямо сейчас. */
  const [translating, setTranslating] = React.useState<string | null>(null);
  /** Браузер не дал играть без нажатия. Подсказка на репликах меняется. */
  const [audioBlocked, setAudioBlocked] = React.useState(false);
  /** Идёт восстановление прошлого разговора. */
  const [resuming, setResuming] = React.useState(true);
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
  /**
   * Что отправляли последним и что при этом показали в ленте.
   *
   * Нужно для кнопки «Отправить ещё раз»: запись голоса набрать заново нельзя,
   * а её base64 уже не восстановить из ленты — там только текст-заглушка.
   */
  const lastSend = React.useRef<{ payload: Record<string, unknown>; shown: string } | null>(null);

  // Задания от учителя. Тот же ключ, что в оглавлении «Учёбы»: счётчик на
  // карточке разговора и эта вкладка обязаны показывать одно и то же.
  const tasksQ = useQuery({
    queryKey: ["scenarios-mine"],
    queryFn: scenarioApi.mine,
    refetchOnMount: "always",
    staleTime: 15_000,
  });
  const tasks = tasksQ.data ?? [];
  const waiting = freshScenarioCount(tasks);

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

  // Восстановление прошлого разговора. Отдельным запросом от статуса: он про
  // настройки сервера, а этот про содержимое ленты.
  React.useEffect(() => {
    let alive = true;
    apiFetch<LatestResponse>("/api/voice-chat/latest")
      .then((data) => {
        if (!alive) return;
        const id = data?.session?.id;
        const restored = (data?.messages ?? [])
          .filter((m) => typeof m?.transcript === "string" && m.transcript.trim())
          .map((m, i) => ({
            // Номер сообщения из базы плюс порядок: id обязан быть уникальным,
            // а у восстановленных реплик он единственный признак.
            id: `db-${m.id ?? i}-${i}`,
            role: m.role === "student" ? ("student" as const) : ("ai" as const),
            text: (m.transcript ?? "").trim(),
            audio: null,
          }));

        if (id) setSessionId(id);
        if (restored.length > 0) setLines(restored);
        if (data?.session?.pointsEarned) setPoints(data.session.pointsEarned);
      })
      // Не смогли восстановить — начинаем новый разговор. Показывать ошибку
      // незачем: экран полностью работоспособен.
      .catch(() => { /* silent */ })
      .finally(() => { if (alive) setResuming(false); });
    return () => { alive = false; };
  }, []);

  // Уход с экрана обязан оборвать и запись, и звук.
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
   * Озвучить реплику Снежи.
   *
   * Звук уже есть — играем сразу. Нет — просим сервер: озвучка в ответе больше
   * не приезжает, и это единственный путь к голосу.
   *
   * @param silentFail не показывать пометку об ошибке. Нужно для автоматической
   *        озвучки: если голос не пришёл сам, ученик всё равно может нажать на
   *        реплику, и вот тогда отказ стоит показать.
   */
  const speakLine = React.useCallback(async (line: Line, silentFail = false) => {
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
      if (!silentFail) {
        setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, voiceFailed: true } : l)));
      }
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
   * ответ Снежи, очки, лента.
   */
  const send = React.useCallback(async (payload: Record<string, unknown>, shown: string) => {
    // Запоминаем отправку целиком: по ней работает «Отправить ещё раз».
    lastSend.current = { payload, shown };

    // Своя реплика появляется в ленте ДО запроса.
    const localId = `mine-${Date.now()}`;
    setLines((prev) => [...prev, { id: localId, role: "student", text: shown, pending: true }]);

    setSending(true);
    setError(null);
    try {
      // Сессия либо восстановлена из прошлого разговора, либо создаётся сейчас:
      // пустой заход на экран разговором не считается.
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
      const correction = data.correction;
      const mistake = correction?.ok === false;
      const replyId = `a-${data.aiMessage?.id ?? Date.now()}`;
      const replyText = reply || "…";

      setLines((prev) => [
        // Уточняем свою реплику расшифровкой: в голосовом режиме по ней видно,
        // как ученика услышали. Заодно вешаем разбор.
        ...prev.map((l) => (l.id === localId
          ? {
              ...l,
              text: mine || l.text,
              pending: false,
              fixed: mistake ? (correction?.fixed || "") : "",
              issue: mistake ? (correction?.issue || "") : "",
            }
          : l)),
        { id: replyId, role: "ai" as const, text: replyText, audio: null },
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
      lastSend.current = null;

      // Голос догоняет текст: звук приходит отдельным запросом, чтобы ответ не
      // рвался на слабой связи. Молча — если не выйдет, реплику всегда можно
      // нажать руками.
      void speakLine({ id: replyId, role: "ai", text: replyText }, true);

      // Очки ушли в общий счёт: экраны, где они видны, обязаны перечитать данные.
      qc.invalidateQueries({ queryKey: ["gamification-stats"] });
      return true;
    } catch (e: any) {
      // Реплика остаётся в ленте, но помеченной: она сказана, просто не дошла.
      setLines((prev) =>
        prev.map((l) => (l.id === localId ? { ...l, pending: false, failed: true } : l)),
      );
      const detail = typeof e?.detail === "string" ? e.detail : "";
      setError(humanError(e?.message ?? "Не удалось отправить реплику", detail));
      return false;
    } finally {
      setSending(false);
    }
  }, [sessionId, qc, retry, speakLine]);

  /** Отправить последнюю реплику заново — она не дошла до сервера. */
  const resend = React.useCallback(async () => {
    const last = lastSend.current;
    if (!last || sending) return;
    // Прошлую попытку убираем из ленты: две одинаковые реплики подряд, одна из
    // которых мёртвая, читаются как «я это дважды сказал».
    setLines((prev) => prev.filter((l) => !l.failed));
    await send(last.payload, last.shown);
  }, [send, sending]);

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

    await send(
      { audioBase64: recorded.base64, mimeType: recorded.mimeType },
      VOICE_PLACEHOLDER,
    );
  }, [send]);

  /** Отправить написанную реплику. */
  const sendTyped = React.useCallback(async () => {
    const value = typed.trim();
    if (!value) return;
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

  /** Уйти в задание. Запись и звук обрываем: там свой микрофон. */
  const openTask = React.useCallback((id: number) => {
    stopPlayback.current?.();
    void recorder.current?.cancel();
    router.push(`/flashcards/scenario/${id}` as any);
  }, [router]);

  const blocked = ready === false;
  const needsRetry = retry > 0;
  /** Есть недоставленная реплика — покажем кнопку повтора. */
  const canResend = !!lastSend.current && lines.some((l) => l.failed);
  /** Разговор начался — шапку ужимаем, место отдаём ленте. */
  const started = lines.length > 0;
  const onTasks = tab === "tasks";

  // Состояние Снежи. Порядок проверок — это приоритет: пока идёт запись, она
  // слушает, чем бы там ни занимался сервер.
  const snezhaState: SnezhaState =
    recording ? "listen" : sending ? "think" : voicing ? "speak" : "idle";

  /**
   * Рост Снежи. До первой реплики — крупнее (знакомимся), дальше меньше: она
   * остаётся на экране навсегда, и каждый десяток пикселей ленты на счету.
   */
  const mascotW = started
    ? Math.min(84, Math.max(68, Math.round(W * 0.2)))
    : Math.min(112, Math.max(88, Math.round(W * 0.26)));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ═══ ШАПКА: не прокручивается ═══ */}
      <View style={{ paddingHorizontal: 16, paddingTop: screenTop(insets) }}>
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
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: started || onTasks ? 19 : 23,
              fontWeight: "900",
              letterSpacing: -0.6,
              color: colors.foreground,
            }}
          >
            {`Разговор со ${NAME}й`}
          </Text>
        </View>

        {/* ── Что открыто: разговор или задания от учителя ──
            Счётчик на кнопке — единственный способ узнать о задании, не заходя
            внутрь, поэтому он красный и с цифрой. */}
        <View style={{
          flexDirection: "row",
          backgroundColor: colors.primary + "14",
          borderRadius: radii.pill,
          padding: 4,
          marginBottom: 10,
        }}>
          {(["talk", "tasks"] as Tab[]).map((key) => {
            const active = tab === key;
            const label = key === "talk" ? "Свободный разговор" : "Задания учителя";
            return (
              <Pressable
                key={key}
                onPress={() => {
                  if (recording || sending) return;
                  setTab(key);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={key === "tasks" && waiting > 0
                  ? `${label}. Новых: ${waiting}`
                  : label}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 9,
                  borderRadius: radii.pill,
                  backgroundColor: active ? colors.card : "transparent",
                  shadowColor: accents.violetDeep,
                  shadowOffset: { width: 0, height: active ? 3 : 0 },
                  shadowOpacity: active ? 0.18 : 0,
                  shadowRadius: active ? 8 : 0,
                  elevation: active ? 2 : 0,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12.5,
                    fontWeight: active ? "900" : "700",
                    color: active ? colors.primary : colors.mutedForeground,
                  }}
                >
                  {label}
                </Text>
                {key === "tasks" && waiting > 0 && (
                  <View style={{
                    backgroundColor: "#e11d48", borderRadius: 9,
                    minWidth: 18, height: 18, paddingHorizontal: 4,
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <Text style={{ color: "#fff", fontSize: 10.5, fontWeight: "900", lineHeight: 13 }}>
                      {waiting > 9 ? "9+" : waiting}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {!onTasks && (
          <>
            {/* ── Сама Снежа ──
                Нажатие на неё переозвучивает последний ответ: по персонажу хочется
                потыкать, и это самое ожидаемое, что может произойти. */}
            <Pressable
              onPress={() => {
                const last = [...lines].reverse().find((l) => l.role === "ai");
                if (last) void speakLine(last);
                else primeAudio();
              }}
              accessibilityRole="button"
              accessibilityLabel={`${NAME}: ${STATUS[snezhaState]}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}
            >
              <SnezhaFrames state={snezhaState} width={mascotW} still={blocked} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{
                  fontSize: started ? 16 : 18,
                  fontWeight: "900",
                  color: colors.foreground,
                  letterSpacing: -0.3,
                }}>
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
                {!started && (
                  <Text style={{ fontSize: 11.5, lineHeight: 16, color: colors.mutedForeground, marginTop: 5 }}>
                    {mode === "voice"
                      ? "Говори по-английски вслух. Ошибёшься — Снежа поправит и попросит повторить"
                      : "Пиши по-английски. Ошибёшься — Снежа поправит и попросит повторить"}
                  </Text>
                )}
              </View>
            </Pressable>

            {/* Переключатель режима ответа. */}
            <View style={{
              flexDirection: "row",
              backgroundColor: colors.primary + "14",
              borderRadius: radii.pill,
              padding: 4,
              marginBottom: 10,
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
                      paddingVertical: started ? 8 : 10,
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

            {blocked && (
              <Tile glow={colors.destructive} style={{ padding: 15, marginBottom: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: "900", color: colors.destructive }}>
                  {`${NAME} пока не может говорить`}
                </Text>
                <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginTop: 6 }}>
                  {notReadyReason ?? "На сервере не задан ключ доступа к языковой модели."}
                </Text>
              </Tile>
            )}
          </>
        )}
      </View>

      {/* ═══ ЗАДАНИЯ ОТ УЧИТЕЛЯ ═══ */}
      {onTasks ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: screenBottom(insets) }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.mutedForeground, marginBottom: 12 }}>
            Разговор в заданной обстановке: Снежа играет роль и не подсказывает, о чём спросить. Ошибку
            назовёт по ходу, но разговор из-за неё не остановится, а после задания весь диалог с разбором
            уйдёт учителю.
          </Text>

          {tasksQ.isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

          {!tasksQ.isLoading && tasks.length === 0 && (
            <View style={{
              backgroundColor: colors.card, borderRadius: radii.md,
              borderWidth: 1, borderColor: colors.border, padding: 15,
            }}>
              <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>Заданий пока нет</Text>
              <Text style={{ fontSize: 13, lineHeight: 20, color: colors.mutedForeground, marginTop: 6 }}>
                Когда учитель выдаст ситуацию, она появится здесь и рядом с этой вкладкой загорится метка.
                А поговорить просто так можно на соседней вкладке — там без проверки и отчёта.
              </Text>
            </View>
          )}

          {tasks.map((s) => {
            const badge = taskState(s);
            return (
              <View
                key={s.id}
                style={{
                  backgroundColor: colors.card, borderRadius: radii.md,
                  borderWidth: 1, borderColor: colors.border, padding: 15,
                  marginBottom: 12,
                  shadowColor: accents.violetDeep,
                  shadowOffset: { width: 0, height: 5 },
                  shadowOpacity: 0.12,
                  shadowRadius: 14,
                  elevation: 3,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <View style={{
                    width: 42, height: 42, borderRadius: radii.sm,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: "rgba(236,72,153,0.14)",
                  }}>
                    <Glyph name="handshake" size={21} color="#db2777" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground }}>{s.title}</Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                      {s.teacherName ? `от ${s.teacherName} · ` : ""}{finishText(s)}
                    </Text>
                  </View>
                  <Pill text={badge.text} tone="soft" color={badge.color} />
                </View>

                <Text style={{ fontSize: 13.5, lineHeight: 20, color: colors.foreground, marginTop: 11 }}>
                  {s.situation}
                </Text>
                <Text style={{ fontSize: 12.5, lineHeight: 19, color: colors.mutedForeground, marginTop: 6 }}>
                  {NAME}: {s.role}
                </Text>
                {!!s.goal && (
                  <View style={{
                    flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 8,
                    backgroundColor: "rgba(99,102,241,0.1)", borderRadius: radii.sm, padding: 10,
                  }}>
                    <Glyph name="target" size={16} color={colors.primary} />
                    <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.foreground }}>
                      Цель: {s.goal}
                    </Text>
                  </View>
                )}

                <ChunkyButton
                  label={s.attempt?.status === "active"
                    ? "Продолжить разговор"
                    : s.done > 0 ? "Пройти ещё раз" : "Начать разговор"}
                  sublabel={s.attempt?.status === "active"
                    ? (s.turnsTarget > 0
                      ? `сказано ${s.attempt.turns} из ${s.turnsTarget}`
                      : `сказано реплик: ${s.attempt.turns}`)
                    : undefined}
                  icon="sound"
                  chevron
                  onPress={() => openTask(s.id)}
                  style={{ marginTop: 12 }}
                />

                {/* Свой разбор ученику показываем тем же экраном, что и учителю:
                    данные одни, и прятать от ученика его собственные ошибки
                    бессмысленно. */}
                {!!s.attempt && s.attempt.status !== "active" && (
                  <Pressable
                    onPress={() => router.push(`/scenario-review/${s.attempt!.id}` as any)}
                    style={{ paddingVertical: 10, alignItems: "center" }}
                    accessibilityRole="button"
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: "800", color: colors.primary }}>
                      Посмотреть разбор прошлой попытки
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <>
          {/* ═══ ЛЕНТА: прокручивается только она ═══ */}
          <ScrollView
            ref={(r) => { scroller.current = r; }}
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Пока разговор грузится — кружок, а не пустота: пустота здесь
                неотличима от «всё пропало». */}
            {resuming && lines.length === 0 && (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 28 }} />
            )}

            {!resuming && lines.length === 0 && !blocked && (
              <Text style={{
                fontSize: 13.5, lineHeight: 20, color: colors.mutedForeground,
                textAlign: "center", paddingVertical: 22, paddingHorizontal: 12,
              }}>
                {mode === "voice"
                  ? `Начни разговор: нажми «Говорить» и скажи что-нибудь по-английски. Хоть «Hi!» — ${NAME} ответит.`
                  : `Начни разговор: напиши что-нибудь по-английски. Хоть «Hi!» — ${NAME} ответит.`}
              </Text>
            )}

            {lines.map((line) => {
              const mine = line.role === "student";
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
                    marginTop: 10,
                    opacity: line.pending ? 0.6 : 1,
                  }}
                >
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
                          // Гасим всплытие: на вебе нажатие иначе дойдёт до пузыря
                          // и заодно включит озвучку.
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
                      Сначала КАК ПРАВИЛЬНО, потом что было не так: повторять ученик
                      будет верный вариант, и он должен первым попадаться глазу. */}
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

            {sending && (
              <ActivityIndicator color={colors.primary} style={{ alignSelf: "flex-start", marginTop: 12 }} />
            )}

            {denied && (
              <Tile glow={colors.warning} style={{ padding: 15, marginTop: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>
                  Нужен доступ к микрофону
                </Text>
                <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginTop: 6 }}>
                  Без него говорить не получится. Разреши доступ в окне браузера и нажми
                  кнопку записи ещё раз — или переключись на «Писать».
                </Text>
              </Tile>
            )}

            {/* Ошибка отправки. Вместе с ней — кнопка повтора: без неё
                недоставленная реплика остаётся мёртвым грузом. */}
            {!!error && (
              <Tile glow={colors.destructive} style={{ padding: 15, marginTop: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: "900", color: colors.destructive }}>
                  Не получилось
                </Text>
                <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginTop: 6 }}>
                  {error}
                </Text>
                {canResend && (
                  <ChunkyButton
                    label="Отправить ещё раз"
                    icon="repeat"
                    center
                    tone="warm"
                    disabled={sending}
                    onPress={() => { primeAudio(); void resend(); }}
                    style={{ marginTop: 12 }}
                  />
                )}
              </Tile>
            )}
          </ScrollView>

          {/* ═══ ПАНЕЛЬ ВВОДА: не прокручивается ═══ */}
          <View style={{ paddingHorizontal: 16, paddingBottom: screenBottom(insets) }}>
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
                  // Разблокировка звука — первым делом, синхронно.
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
        </>
      )}
    </KeyboardAvoidingView>
  );
}
