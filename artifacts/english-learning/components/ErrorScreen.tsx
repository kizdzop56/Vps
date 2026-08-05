// ─────────────────────────────────────────────────────────────────────────────
// Экран ошибки вместо белого экрана.
//
// Зачем: когда React падает при отрисовке, дерево размонтируется целиком и
// пользователь видит просто белый лист. На телефоне консоли нет, а без текста
// ошибки причина ищется вслепую — так мы трижды подряд «чинили» не то место.
//
// Здесь два перехватчика:
//   • ErrorBoundary — ловит падения при отрисовке (самый частый случай);
//   • глобальные слушатели error / unhandledrejection на вебе — ловят то, что
//     падает вне рендера: битый импорт, ошибка в промисе, отсутствующий модуль.
//
// Сообщение можно скопировать одной кнопкой: это ровно та строка, которую
// иначе пришлось бы искать в консоли браузера.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { View, Text, ScrollView, Pressable, Platform, Clipboard, StyleSheet } from "react-native";

/** Короткая выжимка из любой ошибки: сообщение + начало стека. */
function describe(error: unknown, info?: string): string {
  const err = error as { message?: string; stack?: string } | null;
  const message = err?.message ?? String(error);
  const stack = (err?.stack ?? "").split("\n").slice(0, 6).join("\n");
  return [message, info, stack].filter(Boolean).join("\n\n");
}

function Fallback({ text, onReload }: { text: string; onReload: () => void }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Что-то сломалось</Text>
      <Text style={s.sub}>
        Покажите этот текст разработчику — по нему сразу видно, что чинить.
      </Text>

      <ScrollView style={s.box} contentContainerStyle={{ padding: 14 }}>
        <Text style={s.code} selectable>{text}</Text>
      </ScrollView>

      <View style={s.row}>
        <Pressable
          style={[s.btn, s.btnGhost]}
          onPress={() => {
            try {
              Clipboard.setString(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch { /* буфер может быть недоступен — текст всё равно выделяется */ }
          }}
        >
          <Text style={s.btnGhostText}>{copied ? "Скопировано" : "Скопировать"}</Text>
        </Pressable>

        <Pressable style={[s.btn, s.btnMain]} onPress={onReload}>
          <Text style={s.btnMainText}>Перезагрузить</Text>
        </Pressable>
      </View>
    </View>
  );
}

function reload() {
  if (Platform.OS === "web" && typeof window !== "undefined") window.location.reload();
}

interface Props { children: React.ReactNode }
interface State { text: string | null }

export class ErrorScreen extends React.Component<Props, State> {
  state: State = { text: null };

  static getDerivedStateFromError(error: unknown): State {
    return { text: describe(error) };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    // Стек компонентов показывает, ГДЕ именно упало: имя экрана и блока.
    const stack = (info?.componentStack ?? "").split("\n").slice(0, 8).join("\n");
    this.setState({ text: describe(error, stack) });
  }

  componentDidMount() {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    // Падения вне отрисовки: битый импорт, ошибка в промисе, чужой скрипт.
    // ErrorBoundary их не видит, а белый экран они дают такой же.
    window.addEventListener("error", this.onWindowError);
    window.addEventListener("unhandledrejection", this.onRejection);
  }

  componentWillUnmount() {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    window.removeEventListener("error", this.onWindowError);
    window.removeEventListener("unhandledrejection", this.onRejection);
  }

  onWindowError = (e: ErrorEvent) => {
    if (this.state.text) return;
    this.setState({ text: describe(e.error ?? e.message, `${e.filename ?? ""}:${e.lineno ?? ""}`) });
  };

  onRejection = (e: PromiseRejectionEvent) => {
    if (this.state.text) return;
    this.setState({ text: describe(e.reason) });
  };

  render() {
    if (this.state.text) return <Fallback text={this.state.text} onReload={reload} />;
    return this.props.children;
  }
}

const s = StyleSheet.create({
  wrap: {
    flex: 1, backgroundColor: "#faf7ff",
    paddingHorizontal: 20, paddingTop: 72, paddingBottom: 28,
  },
  title: { fontSize: 22, fontWeight: "900", color: "#2a1d4d", letterSpacing: -0.4 },
  sub: { fontSize: 13, color: "#5f5480", marginTop: 6, lineHeight: 19 },
  box: {
    flex: 1, marginTop: 16, borderRadius: 14,
    backgroundColor: "#1e1533", maxHeight: "60%",
  },
  code: { fontSize: 12, lineHeight: 18, color: "#ffd9d9", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  row: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  btnGhost: { backgroundColor: "#ece5ff" },
  btnGhostText: { fontSize: 14, fontWeight: "800", color: "#5b21b6" },
  btnMain: { backgroundColor: "#7c3aed" },
  btnMainText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});

export default ErrorScreen;
