// Распознавание речи для упражнения «произнеси слово».
//
// Web uses the browser Web Speech API and needs no native dependency. The
// optional native speech package is not installed in this Expo Go project, so
// native devices report "unavailable" and fall back to the written answer.
import { Platform } from "react-native";

/** Предельная длительность одной записи. Дальше закрываем сами. */
export const SESSION_MAX_MS = 60_000;
const MAX_RESTARTS = 24;
const FAST_FAIL_MS = 350;
const MAX_FAST_FAILS = 6;
const STOP_GRACE_MS = 1500;
const RESTART_DELAY_MS = 250;

export type SpeechFailure = "no-speech" | "denied" | "unavailable" | "error";
export type SpeechResult =
  | { ok: true; transcript: string }
  | { ok: false; reason: SpeechFailure };

export interface SpeechSession {
  stop(): void;
  cancel(): void;
}

export interface ListenOptions {
  lang?: string;
  onPartial?: (text: string) => void;
  onDone: (result: SpeechResult) => void;
}

const NOOP_SESSION: SpeechSession = { stop() {}, cancel() {} };

export function isSpeechInputAvailable(): boolean {
  if (Platform.OS === "web") {
    const w = globalThis as any;
    return Boolean(w?.SpeechRecognition || w?.webkitSpeechRecognition);
  }
  // No native speech-recognition package is installed in this project.
  return false;
}

let _current: SpeechSession | null = null;

export function cancelListening(): void {
  const session = _current;
  _current = null;
  if (session) {
    try { session.cancel(); } catch { /* session may already be closed */ }
  }
}

export function startListening(options: ListenOptions): SpeechSession {
  cancelListening();
  const session = Platform.OS === "web" ? webSession(options) : nativeUnavailable(options);
  _current = session;
  return session;
}

export const LISTEN_TIMEOUT_MS = 7000;

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

function webSession({ lang = "en-US", onPartial, onDone }: ListenOptions): SpeechSession {
  const w = globalThis as any;
  const Recognition = w?.SpeechRecognition || w?.webkitSpeechRecognition;
  if (!Recognition) {
    setTimeout(() => onDone({ ok: false, reason: "unavailable" }), 0);
    return NOOP_SESSION;
  }

  const recognition = new Recognition();
  let settled = false;
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
    } catch { /* recognition may already be released */ }
    try { recognition.abort?.(); } catch { /* already stopped */ }
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
    if (text) settle({ ok: true, transcript: text });
    else settle({ ok: false, reason: lastError === "audio-capture" ? "error" : "no-speech" });
  };

  const start = () => {
    lastStart = Date.now();
    try { recognition.start(); }
    catch { settleFromBuffer(); }
  };

  recognition.lang = lang;
  recognition.maxAlternatives = 1;
  recognition.interimResults = true;
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
    fastFails = 0;
    onPartial?.([finalText, interim].filter(Boolean).join(" "));
  };

  recognition.onerror = (event: any) => {
    const code = String(event?.error ?? "");
    lastError = code;
    if (code === "not-allowed" || code === "service-not-allowed") {
      settle({ ok: false, reason: "denied" });
    }
  };

  recognition.onend = () => {
    if (settled) return;
    if (stopping) {
      settleFromBuffer();
      return;
    }
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
      try { recognition.stop(); }
      catch { settleFromBuffer(); return; }
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
    try { recognition.stop(); } catch { /* settle from the buffer */ }
    settleFromBuffer();
  }, SESSION_MAX_MS);

  start();
  return session;
}

function nativeUnavailable({ onDone }: ListenOptions): SpeechSession {
  // Deliberately do not import an uninstalled native module: Metro must still
  // be able to bundle the web app. The UI can use written input on native.
  setTimeout(() => onDone({ ok: false, reason: "unavailable" }), 0);
  return NOOP_SESSION;
}
