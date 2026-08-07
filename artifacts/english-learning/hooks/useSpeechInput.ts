// Распознавание речи для упражнения «произнеси слово».
//
// Один вход для двух платформ:
//   web    — Web Speech API (SpeechRecognition). Есть в Chrome и Safari,
//            работает без ключей, без сервера и без установки пакетов;
//   native — @react-native-voice/voice через динамический импорт. Пакета может
//            не быть в сборке, поэтому его отсутствие — обычный сценарий, а не
//            ошибка: тренажёр в этом случае покажет письменный ответ.
//
// Почему не через сервер. Отправлять аудио на бэкенд ради проверки одного слова
// — это лишняя задержка, трафик и стоимость на каждое упражнение. Расшифровку
// делает устройство, а сервер сравнивает её с эталоном
// (POST /flashcards/check-answer) — там же, где живут все прочие правила
// проверки ответа.
//
// ── Запись заканчивает ученик, а не тишина ──────────────────────────────────
//
// Раньше здесь была одна функция listenOnce: запустить распознавание и ждать,
// пока оно само решит, что фраза закончилась. Для ребёнка это не работает. Он
// читает задание, набирает воздух, примеряется — и всё это время микрофон уже
// слушает. В Web Speech API событие onend прилетает на любой паузе, а в Safari
// сессия обрывается почти сразу; попытка закрывалась пустой расшифровкой ещё до
// того, как слово было произнесено.
//
// Теперь распознавание — сессия под управлением ученика: он жмёт «Стоп», когда
// сказал. Пауза не заканчивает запись: onend без запроса на остановку
// перезапускает распознавание, а накопленная расшифровка сохраняется.
//
// Бесконечную карусель перезапусков держат три предохранителя:
//   MAX_RESTARTS   — потолок числа перезапусков за сессию;
//   MAX_FAST_FAILS — распознавание падает быстрее FAST_FAIL_MS, то есть дело не
//                    в паузе, а в поломке (нет микрофона, вкладка в фоне);
//   SESSION_MAX_MS — общий лимит: телефон, забытый в кармане, не пишет вечно.
import { Platform } from "react-native";

/** Предельная длительность одной записи. Дальше закрываем сами. */
export const SESSION_MAX_MS = 60_000;

/** Потолок перезапусков распознавания внутри одной записи. */
const MAX_RESTARTS = 24;

/** Распознавание, оборвавшееся быстрее этого, — не пауза, а сбой. */
const FAST_FAIL_MS = 350;

/** Сколько подряд быстрых сбоев считаем поломкой и закрываем запись. */
const MAX_FAST_FAILS = 6;

/**
 * Сколько ждём финальную расшифровку после нажатия «Стоп».
 *
 * Браузер и нативный движок отдают последний кусок текста уже после команды на
 * остановку. Без этой паузы последнее слово ученика терялось бы.
 */
const STOP_GRACE_MS = 1500;

/** Задержка перед перезапуском: без неё движок отвечает InvalidState. */
const RESTART_DELAY_MS = 250;

export type SpeechFailure = "no-speech" | "denied" | "unavailable" | "error";

export type SpeechResult =
  | { ok: true; transcript: string }
  | { ok: false; reason: SpeechFailure };

/** Управление идущей записью. */
export interface SpeechSession {
  /** Закончить запись и отдать расшифровку в onDone. */
  stop(): void;
  /** Прервать запись молча: onDone не вызовется. */
  cancel(): void;
}

export interface ListenOptions {
  /** Язык распознавания. */
  lang?: string;
  /** Живая расшифровка: то, что движок слышит прямо сейчас. */
  onPartial?: (text: string) => void;
  /** Итог записи. Вызывается ровно один раз. */
  onDone: (result: SpeechResult) => void;
}

/** Заглушка на случай, когда распознавания нет: stop и cancel ничего не делают. */
const NOOP_SESSION: SpeechSession = { stop() {}, cancel() {} };

/** Доступно ли распознавание речи на этом устройстве. */
export function isSpeechInputAvailable(): boolean {
  if (Platform.OS === "web") {
    const w = globalThis as any;
    return Boolean(w?.SpeechRecognition || w?.webkitSpeechRecognition);
  }
  // На нативе честно ответить нельзя без загрузки пакета, а импорт здесь
  // синхронный. Считаем доступным: первая же попытка вернёт "unavailable",
  // и тренажёр переключится на письменный ответ.
  return true;
}

/** Активная запись — чтобы прервать её при уходе с экрана или смене карточки. */
let _current: SpeechSession | null = null;

/** Прервать запись, если она идёт. Итог не придёт. */
export function cancelListening(): void {
  const session = _current;
  _current = null;
  if (session) {
    try { session.cancel(); } catch { /* сессия могла закрыться сама */ }
  }
}

/**
 * Начать запись. Итог придёт в onDone только после stop() (или когда сработает
 * один из предохранителей).
 */
export function startListening(options: ListenOptions): SpeechSession {
  cancelListening();
  const session = Platform.OS === "web" ? webSession(options) : nativeSession(options);
  _current = session;
  return session;
}

/** Сколько слушаем в режиме автоостановки (используется только listenOnce). */
export const LISTEN_TIMEOUT_MS = 7000;

/**
 * Старый режим «послушать один раз» с автоостановкой по таймеру.
 *
 * В тренажёре не используется — там запись останавливает ученик. Оставлено для
 * мест, где ручной кнопки нет и нужен простой одноразовый вызов.
 */
export function listenOnce(lang = "en-US"): Promise<SpeechResult> {
  return new Promise<SpeechResult>((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: SpeechResult) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    const session = startListening({ lang, onDone: finish });
    timer = setTimeout(() => session.stop(), LISTEN_TIMEOUT_MS);
  });
}

// ── web ─────────────────────────────────────────────────────────────────────

function webSession({ lang = "en-US", onPartial, onDone }: ListenOptions): SpeechSession {
  const w = globalThis as any;
  const Recognition = w?.SpeechRecognition || w?.webkitSpeechRecognition;
  if (!Recognition) {
    // Асинхронно: вызывающий код ещё не получил сессию и не готов к итогу.
    setTimeout(() => onDone({ ok: false, reason: "unavailable" }), 0);
    return NOOP_SESSION;
  }

  const recognition = new Recognition();

  let settled = false;
  /** Ученик нажал «Стоп»: следующий onend закрывает запись, а не перезапускает. */
  let stopping = false;
  let finalText = "";
  let restarts = 0;
  let fastFails = 0;
  let lastStart = 0;
  let lastError = "";
  let hardTimer: ReturnType<typeof setTimeout> | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;

  const teardown = () => {
    if (hardTimer) clearTimeout(hardTimer);
    if (graceTimer) clearTimeout(graceTimer);
    hardTimer = null;
    graceTimer = null;
    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    } catch { /* объект мог уже освободиться */ }
    try { recognition.abort?.(); } catch { /* уже остановлено */ }
    if (_current === session) _current = null;
  };

  const settle = (result: SpeechResult) => {
    if (settled) return;
    settled = true;
    teardown();
    onDone(result);
  };

  /** Закрыть запись тем, что успели накопить. */
  const settleFromBuffer = () => {
    const text = finalText.trim();
    if (text) settle({ ok: true, transcript: text });
    // audio-capture — микрофон занят или отсутствует, это не молчание ученика.
    else settle({ ok: false, reason: lastError === "audio-capture" ? "error" : "no-speech" });
  };

  const start = () => {
    lastStart = Date.now();
    try {
      recognition.start();
    } catch {
      // Движок ещё не отпустил предыдущую сессию — дальше ждать нечего.
      settleFromBuffer();
    }
  };

  recognition.lang = lang;
  recognition.maxAlternatives = 1;
  // interimResults — чтобы показывать ученику живую расшифровку: без неё
  // экран молчит, и непонятно, слышит его микрофон или нет.
  recognition.interimResults = true;
  // continuous — не завершать распознавание после первой фразы. Safari этот
  // флаг игнорирует, поэтому ниже есть ещё и перезапуск по onend.
  recognition.continuous = true;

  recognition.onresult = (event: any) => {
    let interim = "";
    const results = event?.results ?? [];
    for (let i = Number(event?.resultIndex ?? 0); i < results.length; i++) {
      const item = results[i];
      const chunk = String(item?.[0]?.transcript ?? "").trim();
      if (!chunk) continue;
      if (item?.isFinal) finalText = finalText ? `${finalText} ${chunk}` : chunk;
      else interim = interim ? `${interim} ${chunk}` : chunk;
    }
    // Пришёл звук — значит, микрофон жив, счётчик поломок обнуляем.
    fastFails = 0;
    onPartial?.([finalText, interim].filter(Boolean).join(" "));
  };

  recognition.onerror = (event: any) => {
    const code = String(event?.error ?? "");
    lastError = code;
    if (code === "not-allowed" || code === "service-not-allowed") {
      settle({ ok: false, reason: "denied" });
      return;
    }
    // no-speech и aborted — обычная пауза. Ничего не решаем: следом придёт
    // onend, он и перезапустит распознавание.
  };

  recognition.onend = () => {
    if (settled) return;
    if (stopping) {
      settleFromBuffer();
      return;
    }
    // Пауза в речи. Ученик ещё не нажал «Стоп» — продолжаем слушать.
    if (Date.now() - lastStart < FAST_FAIL_MS) fastFails++;
    else fastFails = 0;
    if (fastFails >= MAX_FAST_FAILS || restarts >= MAX_RESTARTS) {
      settleFromBuffer();
      return;
    }
    restarts++;
    start();
  };

  const session: SpeechSession = {
    stop() {
      if (settled || stopping) return;
      stopping = true;
      try {
        recognition.stop();
      } catch {
        settleFromBuffer();
        return;
      }
      // Последний кусок расшифровки приходит уже после stop(). Если движок
      // промолчит — закроем запись сами.
      graceTimer = setTimeout(settleFromBuffer, STOP_GRACE_MS);
    },
    cancel() {
      if (settled) return;
      settled = true;
      teardown();
    },
  };

  hardTimer = setTimeout(() => {
    stopping = true;
    try { recognition.stop(); } catch { /* закроем по буферу */ }
    settleFromBuffer();
  }, SESSION_MAX_MS);

  start();
  return session;
}

// ── native ──────────────────────────────────────────────────────────────────

function nativeSession({ lang = "en-US", onPartial, onDone }: ListenOptions): SpeechSession {
  let Voice: any = null;
  let settled = false;
  let stopping = false;
  let finalText = "";
  let restarts = 0;
  let hardTimer: ReturnType<typeof setTimeout> | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;

  const teardown = () => {
    if (hardTimer) clearTimeout(hardTimer);
    if (graceTimer) clearTimeout(graceTimer);
    hardTimer = null;
    graceTimer = null;
    if (Voice) {
      try {
        Voice.onSpeechResults = null;
        Voice.onSpeechPartialResults = null;
        Voice.onSpeechError = null;
        Voice.onSpeechEnd = null;
      } catch { /* no-op */ }
      try { Voice.destroy?.()?.then?.(() => Voice.removeAllListeners?.())?.catch?.(() => {}); } catch { /* no-op */ }
    }
    if (_current === session) _current = null;
  };

  const settle = (result: SpeechResult) => {
    if (settled) return;
    settled = true;
    teardown();
    onDone(result);
  };

  const settleFromBuffer = () => {
    const text = finalText.trim();
    settle(text ? { ok: true, transcript: text } : { ok: false, reason: "no-speech" });
  };

  const restart = () => {
    if (settled || stopping) return;
    if (restarts >= MAX_RESTARTS) {
      settleFromBuffer();
      return;
    }
    restarts++;
    setTimeout(() => {
      if (settled || stopping || !Voice) return;
      try { Voice.start(lang); } catch { settleFromBuffer(); }
    }, RESTART_DELAY_MS);
  };

  const attach = () => {
    Voice.onSpeechPartialResults = (event: any) => {
      const chunk = String(event?.value?.[0] ?? "").trim();
      if (!chunk) return;
      onPartial?.([finalText, chunk].filter(Boolean).join(" "));
    };
    Voice.onSpeechResults = (event: any) => {
      const chunk = String(event?.value?.[0] ?? "").trim();
      if (chunk) finalText = finalText ? `${finalText} ${chunk}` : chunk;
      if (stopping) settleFromBuffer();
    };
    Voice.onSpeechError = (event: any) => {
      const code = String(event?.error?.code ?? event?.error?.message ?? "");
      if (/permission|denied/i.test(code)) {
        settle({ ok: false, reason: "denied" });
        return;
      }
      if (stopping) settleFromBuffer();
      else restart();
    };
    Voice.onSpeechEnd = () => {
      if (settled) return;
      if (stopping) {
        // Результат приходит отдельным событием и может опоздать.
        graceTimer = setTimeout(settleFromBuffer, STOP_GRACE_MS);
        return;
      }
      restart();
    };
  };

  const session: SpeechSession = {
    stop() {
      if (settled || stopping) return;
      stopping = true;
      if (!Voice) {
        settleFromBuffer();
        return;
      }
      try {
        Voice.stop?.()?.catch?.(() => {});
      } catch {
        settleFromBuffer();
        return;
      }
      graceTimer = setTimeout(settleFromBuffer, STOP_GRACE_MS);
    },
    cancel() {
      if (settled) return;
      settled = true;
      teardown();
    },
  };

  const pkg = "@react-native-voice/voice";
  (import(pkg) as Promise<any>)
    .then((module: any) => {
      if (settled) return;
      const mod = module?.default ?? module;
      if (!mod?.start) {
        settle({ ok: false, reason: "unavailable" });
        return;
      }
      Voice = mod;
      attach();
      // Ученик мог нажать «Стоп», пока грузился пакет.
      if (stopping) {
        settleFromBuffer();
        return;
      }
      try { Voice.start(lang); } catch { settle({ ok: false, reason: "error" }); }
    })
    .catch(() => settle({ ok: false, reason: "unavailable" }));

  hardTimer = setTimeout(() => {
    stopping = true;
    try { Voice?.stop?.()?.catch?.(() => {}); } catch { /* закроем по буферу */ }
    settleFromBuffer();
  }, SESSION_MAX_MS);

  return session;
}
