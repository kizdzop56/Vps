// ─────────────────────────────────────────────────────────────────────────────
// Запись голоса ученика: одна ручка на две несовместимые платформы.
//
// ── Зачем отдельный файл ────────────────────────────────────────────────────
// Первая версия экрана тьютора писала звук через Audio.Recording из expo-av. На
// телефоне это работает, а НА ВЕБЕ ЗАПИСИ В expo-av НЕТ ВООБЩЕ: проигрывание
// есть, записи нет. Кнопка «Говорить» просто падала, и раздел выглядел
// неработающим — притом что сервер был полностью готов.
//
// Поэтому реализации две, и выбираются они по платформе:
//   web    — MediaRecorder из самого браузера, без expo-av;
//   мобилы — Audio.Recording из expo-av.
//
// expo-av подключается ЛЕНИВО, внутри мобильной ветки. Обычный import сверху
// тянул бы модуль и в веб-сборку: пакет там бесполезен, а любая его поломка
// роняла бы экран целиком ещё до первого нажатия.
//
// ── Тип файла возвращается настоящий ────────────────────────────────────────
// Браузеры пишут в разное: Chrome обычно webm/opus, Safari — mp4/aac. Whisper
// разбирает и то и другое, НО формат он определяет по расширению имени файла,
// а не по содержимому. Поэтому mimeType едет на сервер как есть, и сервер по
// нему собирает имя (см. routes/voiceChat.ts). Раньше имя было прошито как
// «audio.m4a», и запись из браузера отвергалась как битая.
// ─────────────────────────────────────────────────────────────────────────────
import { Platform } from "react-native";

/** Готовая запись: содержимое в base64 и её настоящий тип. */
export type Recorded = { base64: string; mimeType: string };

export interface VoiceRecorder {
  /** Запросить доступ к микрофону и начать запись. */
  start(): Promise<void>;
  /** Остановить запись и отдать её содержимое. */
  stop(): Promise<Recorded>;
  /** Бросить запись, ничего не отдавая: уход с экрана, отмена. */
  cancel(): Promise<void>;
}

/** Отказ в микрофоне — это не поломка, и экран объясняет его отдельно. */
export class MicDeniedError extends Error {
  constructor() {
    super("Нет доступа к микрофону");
    this.name = "MicDeniedError";
  }
}

/**
 * Форматы в порядке предпочтения.
 *
 * webm/opus — самый компактный и родной для Chrome. mp4 нужен Safari: он webm
 * не пишет вовсе. Пустая строка в конце — «пусть браузер решает сам»: лучше
 * неизвестный формат, чем отказ записывать.
 */
const WEB_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "",
];

function pickWebMime(): string {
  const MR: any = (globalThis as any).MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== "function") return "";
  for (const candidate of WEB_MIME_CANDIDATES) {
    if (!candidate) return "";
    if (MR.isTypeSupported(candidate)) return candidate;
  }
  return "";
}

/** Blob → base64 без префикса data:. */
async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать запись"));
    reader.onloadend = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : "";
}

// ── Веб ─────────────────────────────────────────────────────────────────────

class WebRecorder implements VoiceRecorder {
  private recorder: any = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private mimeType = "";

  async start(): Promise<void> {
    const media = (navigator as any)?.mediaDevices;
    if (!media?.getUserMedia || !(globalThis as any).MediaRecorder) {
      throw new Error("Браузер не умеет записывать звук. Попробуй Chrome или Safari посвежее.");
    }

    try {
      this.stream = await media.getUserMedia({ audio: true });
    } catch (e: any) {
      // Отказ и «микрофона нет» приходят одним исключением, но означают разное.
      if (e?.name === "NotAllowedError" || e?.name === "SecurityError") throw new MicDeniedError();
      throw new Error("Микрофон не запустился. Проверь, не занят ли он другой программой.");
    }

    const MR: any = (globalThis as any).MediaRecorder;
    const preferred = pickWebMime();
    this.recorder = preferred ? new MR(this.stream, { mimeType: preferred }) : new MR(this.stream!);
    // Тип берём у самого рекордера: браузер мог выбрать не то, что мы просили.
    this.mimeType = this.recorder.mimeType || preferred || "audio/webm";
    this.chunks = [];
    this.recorder.ondataavailable = (e: any) => {
      if (e?.data?.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
  }

  async stop(): Promise<Recorded> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("Запись не начиналась");

    const blob: Blob = await new Promise((resolve, reject) => {
      recorder.onstop = () => {
        resolve(new Blob(this.chunks, { type: this.mimeType.split(";")[0] }));
      };
      recorder.onerror = () => reject(new Error("Запись прервалась"));
      try {
        recorder.stop();
      } catch {
        reject(new Error("Запись прервалась"));
      }
    });

    this.release();
    if (blob.size === 0) throw new Error("Запись получилась пустой — скажи фразу вслух и нажми ещё раз.");
    return { base64: await blobToBase64(blob), mimeType: blob.type || "audio/webm" };
  }

  async cancel(): Promise<void> {
    try { this.recorder?.stop(); } catch { /* уже остановлен */ }
    this.release();
  }

  /** Микрофон обязательно отпустить: иначе в браузере горит индикатор записи. */
  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}

// ── Телефон ─────────────────────────────────────────────────────────────────

class NativeRecorder implements VoiceRecorder {
  private recording: any = null;

  /** expo-av подключается только здесь: в веб-сборке он не нужен вовсе. */
  private audio(): any {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("expo-av");
    if (!mod?.Audio) throw new Error("Модуль записи звука недоступен");
    return mod.Audio;
  }

  async start(): Promise<void> {
    const Audio = this.audio();
    const perm = await Audio.requestPermissionsAsync();
    if (!perm?.granted) throw new MicDeniedError();

    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    this.recording = recording;
  }

  async stop(): Promise<Recorded> {
    if (!this.recording) throw new Error("Запись не начиналась");
    await this.recording.stopAndUnloadAsync();
    const uri: string | null = this.recording.getURI();
    this.recording = null;
    if (!uri) throw new Error("Запись получилась пустой");

    // Файл читаем через fetch: expo-file-system в проект не подключён, а этот
    // путь одинаково работает с file:// на обеих мобильных платформах.
    const res = await fetch(uri);
    const blob = await res.blob();
    if (blob.size === 0) throw new Error("Запись получилась пустой — скажи фразу вслух и нажми ещё раз.");

    // Пресет HIGH_QUALITY даёт m4a и на iOS, и на Android.
    const mimeType = blob.type && blob.type !== "application/octet-stream" ? blob.type : "audio/m4a";
    return { base64: await blobToBase64(blob), mimeType };
  }

  async cancel(): Promise<void> {
    try { await this.recording?.stopAndUnloadAsync(); } catch { /* уже остановлена */ }
    this.recording = null;
  }
}

export function createVoiceRecorder(): VoiceRecorder {
  return Platform.OS === "web" ? new WebRecorder() : new NativeRecorder();
}

// ── Проигрывание ответа ─────────────────────────────────────────────────────

/** Остановить и забыть текущий звук. Возвращается новая ручка остановки. */
export type StopPlayback = () => void;

/**
 * Проиграть ответ тьютора.
 *
 * На вебе — обычный Audio из браузера: expo-av здесь ничего не добавляет, а
 * тянуть его ради проигрывания data-URL незачем. На телефоне — expo-av.
 *
 * Возвращает функцию остановки: звук не должен продолжать говорить после того,
 * как ученик ушёл с экрана.
 */
export async function playAudio(uri: string): Promise<StopPlayback> {
  if (Platform.OS === "web") {
    const el = new ((globalThis as any).Audio)(uri) as HTMLAudioElement;
    await el.play().catch(() => { /* автозапуск мог быть запрещён — не беда */ });
    return () => { try { el.pause(); } catch { /* уже остановлен */ } };
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Audio } = require("expo-av");
  const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
  return () => { void sound.unloadAsync(); };
}
