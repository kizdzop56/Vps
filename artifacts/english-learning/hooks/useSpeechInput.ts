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
import { Platform } from "react-native";

/** Сколько ждём ответа от распознавания, прежде чем считать попытку неудачной. */
export const LISTEN_TIMEOUT_MS = 7000;

export type SpeechResult =
  | { ok: true; transcript: string }
  | { ok: false; reason: "no-speech" | "denied" | "unavailable" | "error" };

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

/** Активная сессия распознавания — чтобы прервать её при уходе с экрана. */
let _stopCurrent: (() => void) | null = null;

/** Прервать распознавание, если оно идёт. */
export function cancelListening(): void {
  const stop = _stopCurrent;
  _stopCurrent = null;
  if (stop) {
    try { stop(); } catch { /* сессия могла уже закрыться сама */ }
  }
}

/**
 * Послушать ученика и вернуть расшифровку.
 *
 * Обещание разрешается ровно один раз: и распознавание, и таймаут ведут к
 * одному и тому же завершению. Флаг settled здесь не перестраховка — onend в
 * Web Speech API приходит и после успешного результата тоже, поэтому без него
 * одна попытка засчитывалась бы дважды, и три попытки ученика сгорали бы за
 * полторы.
 */
export async function listenOnce(lang = "en-US"): Promise<SpeechResult> {
  cancelListening();
  return Platform.OS === "web" ? listenWeb(lang) : listenNative(lang);
}

function listenWeb(lang: string): Promise<SpeechResult> {
  const w = globalThis as any;
  const Recognition = w?.SpeechRecognition || w?.webkitSpeechRecognition;
  if (!Recognition) return Promise.resolve({ ok: false, reason: "unavailable" });

  return new Promise<SpeechResult>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const recognition = new Recognition();

    const finish = (result: SpeechResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      _stopCurrent = null;
      try { recognition.onresult = null; recognition.onerror = null; recognition.onend = null; } catch { /* no-op */ }
      try { recognition.abort?.(); } catch { /* уже остановлено */ }
      resolve(result);
    };

    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    // continuous: false — останавливаемся после первой фразы. Ребёнок называет
    // одно слово, ждать дальше нечего.
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript ?? "").trim();
      finish(transcript ? { ok: true, transcript } : { ok: false, reason: "no-speech" });
    };
    recognition.onerror = (event: any) => {
      const code = String(event?.error ?? "");
      if (code === "not-allowed" || code === "service-not-allowed") finish({ ok: false, reason: "denied" });
      else if (code === "no-speech" || code === "aborted") finish({ ok: false, reason: "no-speech" });
      else finish({ ok: false, reason: "error" });
    };
    recognition.onend = () => finish({ ok: false, reason: "no-speech" });

    _stopCurrent = () => finish({ ok: false, reason: "no-speech" });
    // Браузер может не прислать ни result, ни end: отказ в доступе к микрофону
    // на iOS, свёрнутая вкладка. Без таймаута упражнение зависло бы навсегда.
    timer = setTimeout(() => finish({ ok: false, reason: "no-speech" }), LISTEN_TIMEOUT_MS);

    try {
      recognition.start();
    } catch {
      finish({ ok: false, reason: "error" });
    }
  });
}

async function listenNative(lang: string): Promise<SpeechResult> {
  const pkg = "@react-native-voice/voice";
  const module = await (import(pkg) as Promise<any>).catch(() => null);
  const Voice = module?.default ?? module;
  if (!Voice?.start) return { ok: false, reason: "unavailable" };

  return new Promise<SpeechResult>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: SpeechResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      _stopCurrent = null;
      try { Voice.onSpeechResults = null; Voice.onSpeechError = null; Voice.onSpeechEnd = null; } catch { /* no-op */ }
      try { Voice.stop?.()?.catch?.(() => {}); } catch { /* no-op */ }
      try { Voice.destroy?.()?.then?.(() => Voice.removeAllListeners?.())?.catch?.(() => {}); } catch { /* no-op */ }
      resolve(result);
    };

    Voice.onSpeechResults = (event: any) => {
      const transcript = String(event?.value?.[0] ?? "").trim();
      finish(transcript ? { ok: true, transcript } : { ok: false, reason: "no-speech" });
    };
    Voice.onSpeechError = (event: any) => {
      const code = String(event?.error?.code ?? "");
      finish({ ok: false, reason: code.includes("permission") ? "denied" : "no-speech" });
    };
    Voice.onSpeechEnd = () => {
      // Результат приходит отдельным событием и может опоздать: даём ему шанс,
      // а не закрываем попытку сразу.
      timer = setTimeout(() => finish({ ok: false, reason: "no-speech" }), 1200);
    };

    _stopCurrent = () => finish({ ok: false, reason: "no-speech" });
    timer = setTimeout(() => finish({ ok: false, reason: "no-speech" }), LISTEN_TIMEOUT_MS);

    try {
      Voice.start(lang);
    } catch {
      finish({ ok: false, reason: "error" });
    }
  });
}
