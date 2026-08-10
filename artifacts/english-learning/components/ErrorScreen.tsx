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
// ── Отчёт не обрезаем ───────────────────────────────────────────────────────
// Раньше стек компонентов резался до восьми строк, а стек ошибки до шести. Это
// выглядело разумно («не вываливать простыню»), а на деле убивало весь смысл:
// первыми в стеке компонентов идут САМЫЕ ВНУТРЕННИЕ узлы — span, div, — а имя
// экрана стоит дальше и попадало ровно под нож. Отчёт приходил в виде
//
//     span@unknown:0:0
//     @https://…/entry-17d808….js:1421:900
//
// и не отвечал на единственный важный вопрос: ГДЕ упало.
//
// Поэтому теперь сверху стоят две выжимки — адрес экрана и цепочка имён
// компонентов, — а под ними полный текст. Имена компонентов в сборке
// сохраняются намеренно, см. metro.config.js (keep_fnames).
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { View, Text, ScrollView, Pressable, Platform, Clipboard, StyleSheet } from "react-native";

/** Сколько строк стека оставляем. Больше — уже нечитаемо даже разработчику. */
const MAX_STACK_LINES = 40;

/**
 * Теги разметки. В стеке компонентов они есть всегда и не значат ничего:
 * каждое падение происходит «внутри div», знать это бесполезно.
 */
const HOST_TAGS = new Set([
  "div", "span", "p", "a", "img", "button", "input", "textarea", "form",
  "ul", "ol", "li", "svg", "path", "g", "rect", "circle", "line", "text",
  "picture", "source", "video", "canvas", "br", "hr", "label", "select",
]);

/** Текущий адрес: по нему экран понятен сразу, без разбора стека. */
function currentRoute(): string {
  if (Platform.OS !== "web" || typeof window === "undefined") return "";
  try {
    const { pathname, search, hash } = window.location;
    return `${pathname}${search}${hash}`;
  } catch {
    return "";
  }
}

/**
 * Имена компонентов из стека, от внутреннего к внешнему.
 *
 * Строка стека выглядит как «MarathonScreen@https://…» или «span@unknown:0:0».
 * Берём то, что стоит до собаки, и выбрасываем теги разметки и дубликаты
 * подряд — иначе цепочка состоит из двадцати одинаковых Text.
 */
function componentChain(componentStack: string): string {
  const names: string[] = [];
  for (const raw of componentStack.split("\n")) {
    const line = raw.trim().replace(/^in\s+/, "");
    const name = line.split("@")[0]?.split(" ")[0]?.trim() ?? "";
    if (!name || !/^[A-Za-z][\w$.]*$/.test(name)) continue;
    if (HOST_TAGS.has(name.toLowerCase())) continue;
    if (names[names.length - 1] === name) continue;
    names.push(name);
  }
  return names.slice(0, 8).join(" ← ");
}

function cut(text: string): string {
  return text.split("\n").slice(0, MAX_STACK_LINES).join("\n");
}

/** Полный текст отчёта: сначала выжимка, потом всё остальное. */
function describe(error: unknown, componentStack?: string): string {
  const err = error as { message?: string; stack?: string } | null;
  const parts: string[] = [err?.message ?? String(error)];

  const route = currentRoute();
  if (route) parts.push(`Экран: ${route}`);

  if (componentStack) {
    const chain = componentChain(componentStack);
    if (chain) parts.push(`Цепочка: ${chain}`);
  }

  if (componentStack) parts.push(`Компоненты:\n${cut(componentStack.trim())}`);
  if (err?.stack) parts.push(`Стек:\n${cut(err.stack)}`);

  return parts.join("\n\n");
}

function Fallback({ text, onReload }: { text: string; onReload: () => void }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Что-то сломалось</Text>
      <Text style={s.sub}>
        Нажмите «Скопировать» и пришлите текст целиком — по нему сразу видно, что чинить.
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
    // Приходит он вторым вызовом, уже после getDerivedStateFromError, поэтому
    // текст здесь пересобирается целиком — с цепочкой имён.
    this.setState({ text: describe(error, info?.componentStack ?? "") });
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
    const where = [e.filename, e.lineno].filter(Boolean).join(":");
    this.setState({ text: describe(e.error ?? e.message, where ? `${where}\n` : "") });
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
