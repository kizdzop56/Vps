// ─────────────────────────────────────────────────────────────────────────────
// Голос ученика и голос Снежи: запись и проигрывание.
//
// ── Зачем отдельный файл ────────────────────────────────────────────────────
// Первая версия экрана разговора писала звук через Audio.Recording из expo-av.
// На телефоне это работает, а НА ВЕБЕ ЗАПИСИ В expo-av НЕТ ВООБЩЕ:
// проигрывание есть, записи нет. Кнопка «Говорить» просто падала, и раздел
// выглядел неработающим — притом что сервер был полностью готов.
//
// Поэтому реализации две, и выбираются они по платформе:
//   web    — MediaRecorder из самого браузера, без expo-av;
//   мобилы — Audio.Recording из expo-av.
//
// expo-av подключается ЛЕНИВО, внутри мобильной ветки. Обычный import сверху
// тянул бы модуль и в веб-сборку: пакет там бесполезен, а любая его поломка
// роняла бы экран целиком ещё до первого нажатия.
//
// ── ГРАБЛИ: SAFARI ВРЁТ О ФОРМАТЕ ───────────────────────────────────────────
// MediaRecorder.isTypeSupported("audio/webm") в Safari на iPhone отвечает true,
// recorder.mimeType тоже говорит webm — а на выходе получается mp4/aac. Запись
// уезжала на сервер под именем audio.webm, распознаватель смотрит на расширение
// и отказывался её читать. Наружу это выходило как «не удалось разобрать
// запись», и так на каждой попытке.
//
// Лечится с двух сторон. Здесь — просим у Safari сразу mp4, чтобы заявленный
// тип совпадал с настоящим. На сервере — формат определяется по сигнатуре
// файла, а не по названию (см. sniffAudioExt в lib/ai.ts). Одной стороны мало:
// браузеры врут по-разному, и вторая проверка ловит остальных.
//
// ── Слишком короткая запись ─────────────────────────────────────────────────
// Распознаватель на файле в десяток миллисекунд отвечает ошибкой, и это
// выглядело как «речь не распознана», хотя речи там и не было. Такие записи не
// отправляются.
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

/** Записи короче этого не отправляем: распознаватель на них падает. */
const MIN_RECORDING_MS = 400;

/** И не отправляем совсем маленькие файлы: та же причина, другая мера. */
const MIN_RECORDING_BYTES = 1200;

const TOO_SHORT =
  "Слишком коротко. Нажми «Говорить», скажи целую фразу и только потом «Стоп».";

/**
 * Safari (в том числе весь браузер на iPhone: там любой браузер — это Safari).
 *
 * Проверяем по строке агента, а не по фактам: узнать, что MediaRecorder соврёт,
 * можно только уже записав файл, а решение о формате нужно принять до записи.
 */
function isSafari(): boolean {
  const ua = String((navigator as any)?.userAgent ?? "");
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua);
  return iOS || safari;
}

/**
 * Форматы в порядке предпочтения.
 *
 * На Safari первым идёт mp4: webm он «поддерживает» только на словах. В
 * остальных браузерах webm/opus — самый компактный и родной для Chrome.
 * Пустая строка в конце значит «пусть браузер решает сам»: неизвестный формат
 * лучше, чем отказ записывать.
 */
function webMimeCandidates(): string[] {
  return isSafari()
    ? ["audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/aac", ""]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""];
}

function pickWebMime(): string {
  const MR: any = (globalThis as any).MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== "function") return "";
  for (const candidate of webMimeCandidates()) {
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
  private startedAt = 0;

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
    // Верить ему до конца всё равно нельзя — формат перепроверяет сервер.
    this.mimeType = this.recorder.mimeType || preferred || "audio/webm";
    this.chunks = [];
    this.startedAt = Date.now();
    this.recorder.ondataavailable = (e: any) => {
      if (e?.data?.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
  }

  async stop(): Promise<Recorded> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("Запись не начиналась");
    const elapsed = Date.now() - this.startedAt;

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
    if (elapsed < MIN_RECORDING_MS || blob.size < MIN_RECORDING_BYTES) throw new Error(TOO_SHORT);
    return { base64: await blobToBase64(blob), mimeType: blob.type || this.mimeType };
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
  private startedAt = 0;

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
    this.startedAt = Date.now();
  }

  async stop(): Promise<Recorded> {
    if (!this.recording) throw new Error("Запись не начиналась");
    const elapsed = Date.now() - this.startedAt;
    await this.recording.stopAndUnloadAsync();
    const uri: string | null = this.recording.getURI();
    this.recording = null;
    if (!uri) throw new Error(TOO_SHORT);

    // Файл читаем через fetch: expo-file-system в проект не подключён, а этот
    // путь одинаково работает с file:// на обеих мобильных платформах.
    const res = await fetch(uri);
    const blob = await res.blob();
    if (elapsed < MIN_RECORDING_MS || blob.size < MIN_RECORDING_BYTES) throw new Error(TOO_SHORT);

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

// ─────────────────────────────────────────────────────────────────────────────
// ПРОИГРЫВАНИЕ ОТВЕТА
//
// ── ГРАБЛИ, ИЗ-ЗА КОТОРЫХ ОТВЕТ ОЗВУЧИВАЛСЯ ЧЕРЕЗ РАЗ ──────────────────────
// Было так: на каждый ответ создавался НОВЫЙ Audio, и play() вызывался после
// того, как запрос вернулся с сервера — то есть через несколько секунд после
// нажатия кнопки.
//
// Safari (а на iPhone это любой браузер) разрешает звук только элементу,
// который уже начинал играть ПО ДЕЙСТВИЮ ЧЕЛОВЕКА. Свежесозданный элемент
// таким не считается: play() отвечает NotAllowedError. Ошибку глотал
// .catch(() => {}), поэтому наружу это выходило как «иногда озвучивает, иногда
// нет» — без единого следа.
//
// Отсюда два правила, и оба обязательны:
//
//   1. ПЛЕЕР ОДИН на весь экран, и его «разблокировывают» (primeAudio) прямо в
//      обработчике нажатия — он проигрывает 40 мс тишины. Дальше этому же
//      элементу можно менять src и звать play() когда угодно.
//
//   2. ЗВУК ОТДАЁТСЯ ЧЕРЕЗ blob:, а не data:. Ответ приходит как
//      data:audio/wav;base64,... на несколько сотен килобайт, и Safari такие
//      ссылки читает неохотно (иногда просто не начинает играть). Blob-ссылка
//      для него — обычный файл.
//
// Если звук всё же заблокирован, это ВОЗВРАЩАЕТСЯ наружу (blocked: true), а не
// проглатывается: экран показывает подсказку «нажми, чтобы послушать», и
// нажатие уже идёт от человека — тогда играет всегда.
//
// ── ЗАЧЕМ onEnd ────────────────────────────────────────────────────────────
// Снежа двигает ртом, пока звучит её реплика (components/SnezhaLive.tsx). Ни
// длительности, ни размера звука клиент не знает: приходит готовый файл. Гадать
// по длине текста нельзя — рот либо замолкает посреди фразы, либо продолжает
// шевелиться в тишине, и оба случая выглядят поломкой.
//
// Поэтому конец воспроизведения приходит СОБЫТИЕМ: onended в браузере,
// didJustFinish на телефоне.
// ─────────────────────────────────────────────────────────────────────────────

/** Остановить и забыть текущий звук. */
export type StopPlayback = () => void;

export type Playback = {
  stop: StopPlayback;
  /** true — браузер не дал играть без нажатия. Текст ответа уже на экране. */
  blocked: boolean;
};

export type PlayOptions = {
  /** Позвать, когда звук доиграл сам. При остановке руками не вызывается. */
  onEnd?: () => void;
};

/** 40 мс тишины: этим разблокируется плеер. */
const SILENCE =
  "data:audio/wav;base64,UklGRqQCAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YYACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** Единственный плеер веб-версии и его состояние. */
let webPlayer: HTMLAudioElement | null = null;
let webUnlocked = false;
let webBlobUrl: string | null = null;

function ensureWebPlayer(): HTMLAudioElement | null {
  const Ctor: any = (globalThis as any).Audio;
  if (typeof Ctor !== "function") return null;
  if (!webPlayer) {
    webPlayer = new Ctor() as HTMLAudioElement;
    webPlayer.preload = "auto";
    // Без playsinline iOS открывает звук в своём полноэкранном плеере.
    (webPlayer as any).playsInline = true;
    webPlayer.setAttribute?.("playsinline", "true");
  }
  return webPlayer;
}

/**
 * Разблокировать звук. Вызывать СИНХРОННО в обработчике нажатия — до любого
 * await, иначе браузер уже не считает вызов следствием действия человека.
 *
 * Вызывать можно сколько угодно: после успеха работа не повторяется.
 */
export function primeAudio(): void {
  if (Platform.OS !== "web" || webUnlocked) return;
  const el = ensureWebPlayer();
  if (!el) return;
  try {
    // Тишину доигрывать до конца не нужно, и её конец не должен уехать в onEnd
    // прошлой реплики.
    el.onended = null;
    el.src = SILENCE;
    const started = el.play() as unknown as Promise<void> | undefined;
    const done = () => {
      webUnlocked = true;
      try { el.pause(); el.currentTime = 0; } catch { /* уже остановлен */ }
    };
    if (started?.then) started.then(done).catch(() => { /* нажатие не в счёт */ });
    else done();
  } catch {
    /* нет звука в этом браузере — ответ всё равно виден текстом */
  }
}

/** Освободить прошлую blob-ссылку: иначе они копятся в памяти вкладки. */
function revokeWebBlob(): void {
  if (!webBlobUrl) return;
  try { (globalThis as any).URL?.revokeObjectURL?.(webBlobUrl); } catch { /* и так уйдёт */ }
  webBlobUrl = null;
}

/**
 * data:…base64 → blob:… (см. ГРАБЛИ выше). Не получилось — отдаём как было:
 * прямая ссылка хуже, но лучше тишины.
 */
async function toPlayableUrl(uri: string): Promise<string> {
  if (!uri.startsWith("data:")) return uri;
  const createUrl = (globalThis as any).URL?.createObjectURL;
  if (typeof createUrl !== "function") return uri;
  try {
    const blob = await (await fetch(uri)).blob();
    revokeWebBlob();
    webBlobUrl = createUrl.call((globalThis as any).URL, blob) as string;
    return webBlobUrl;
  } catch {
    return uri;
  }
}

async function playOnWeb(uri: string, opts?: PlayOptions): Promise<Playback> {
  const el = ensureWebPlayer();
  if (!el) return { stop: () => {}, blocked: false };

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    opts?.onEnd?.();
  };

  const stop = () => {
    // Ручная остановка — не конец реплики: onEnd не зовём, но и повесить его
    // на будущее событие нельзя, иначе рот дёрнется на следующем звуке.
    done = true;
    el.onended = null;
    try { el.pause(); } catch { /* уже остановлен */ }
  };

  el.onended = finish;
  // Ошибка загрузки тоже завершает реплику: иначе рот будет шевелиться, пока
  // экран не закроют.
  el.onerror = finish;

  el.src = await toPlayableUrl(uri);
  try {
    el.load?.();
  } catch {
    /* не все браузеры это любят, но play() ниже всё равно попробует */
  }

  try {
    await el.play();
    webUnlocked = true;
    return { stop, blocked: false };
  } catch {
    // NotAllowedError — запрет автозапуска, а не поломка: ученик нажмёт на
    // реплику и услышит ответ. Остальные ошибки (битый файл, нет кодека)
    // выглядят так же, и разделять их незачем: снаружи действие одно.
    el.onended = null;
    done = true;
    return { stop, blocked: true };
  }
}

async function playOnNative(uri: string, opts?: PlayOptions): Promise<Playback> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Audio } = require("expo-av");

  // ГРАБЛИ: запись оставляет iOS в режиме микрофона (allowsRecordingIOS), и в
  // нём динамик почти не слышно — ответ «не озвучивался» ровно после того, как
  // ученик поговорил вслух. Режим обязан вернуться к проигрыванию.
  try {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
  } catch {
    /* не вышло — пробуем играть как есть */
  }

  let done = false;
  const { sound } = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: true },
    (status: any) => {
      if (done || !status?.didJustFinish) return;
      done = true;
      opts?.onEnd?.();
    },
  );
  return {
    stop: () => { done = true; void sound.unloadAsync(); },
    blocked: false,
  };
}

/**
 * Проиграть реплику и рассказать, вышло ли.
 *
 * Возвращает ручку остановки: звук не должен продолжать говорить после того,
 * как ученик ушёл с экрана.
 */
export async function playSpeech(uri: string, opts?: PlayOptions): Promise<Playback> {
  return Platform.OS === "web" ? playOnWeb(uri, opts) : playOnNative(uri, opts);
}

/** Прежняя ручка: только остановка, без ответа «получилось ли». */
export async function playAudio(uri: string): Promise<StopPlayback> {
  return (await playSpeech(uri)).stop;
}
