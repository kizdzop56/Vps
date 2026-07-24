import { Component, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import Leaderboard from "./components/mockups/Leaderboard";
import { FreeForm } from "./components/mockups/quiz-flow/FreeForm";
import { MultipleChoice } from "./components/mockups/quiz-flow/MultipleChoice";
import { WithImage } from "./components/mockups/quiz-flow/WithImage";

type MockupEntry = {
  id: string;
  label: string;
  group: string;
  Component: React.ComponentType;
};

const MOCKUPS: MockupEntry[] = [
  { id: "leaderboard", label: "Leaderboard", group: "Рейтинг", Component: Leaderboard },
  { id: "quiz-multiple", label: "Multiple Choice", group: "Quiz flow", Component: MultipleChoice },
  { id: "quiz-freeform", label: "Free Form", group: "Quiz flow", Component: FreeForm },
  { id: "quiz-withimage", label: "With Image", group: "Quiz flow", Component: WithImage },
];

class ErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }
  render() {
    if (this.state.error) {
      return (
        <pre
          style={{
            color: "#f87171",
            padding: 24,
            fontFamily: "ui-monospace, monospace",
            fontSize: 13,
            whiteSpace: "pre-wrap",
          }}
        >
          {String(this.state.error.message || this.state.error)}
        </pre>
      );
    }
    return this.props.children;
  }
}

function Gallery() {
  const [active, setActive] = useState(MOCKUPS[0].id);
  const current = MOCKUPS.find((m) => m.id === active) ?? MOCKUPS[0];
  const Current = current.Component;

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 600px at 50% -10%, #23233a 0%, #14141c 55%, #0c0c12 100%)",
        color: "#e5e7eb",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "28px 16px 56px",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div
        style={{
          width: "100%",
          maxWidth: 920,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              boxShadow: "0 6px 18px rgba(124,58,237,.45)",
            }}
          >
            📱
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>
              mockup-sandbox — предпросмотр
            </div>
            <div style={{ fontSize: 12.5, color: "#8b8ba7" }}>
              kizdzop56/V1 · интерактивный мокап
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#8b8ba7",
            border: "1px solid #2a2a3d",
            borderRadius: 999,
            padding: "6px 12px",
            background: "rgba(255,255,255,.02)",
          }}
        >
          {MOCKUPS.length} экрана
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
          marginBottom: 26,
          maxWidth: 920,
        }}
      >
        {MOCKUPS.map((m) => {
          const isActive = m.id === active;
          return (
            <button
              key={m.id}
              onClick={() => setActive(m.id)}
              style={{
                cursor: "pointer",
                border: isActive ? "1px solid #7c3aed" : "1px solid #2a2a3d",
                background: isActive
                  ? "linear-gradient(135deg,#7c3aed,#4f46e5)"
                  : "rgba(255,255,255,.03)",
                color: isActive ? "#fff" : "#c7c7d9",
                borderRadius: 999,
                padding: "9px 16px",
                fontSize: 13.5,
                fontWeight: 600,
                transition: "all .15s ease",
                boxShadow: isActive ? "0 6px 16px rgba(124,58,237,.4)" : "none",
              }}
            >
              <span style={{ opacity: 0.7, fontWeight: 500 }}>{m.group}</span>
              {"  "}
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Phone stage */}
      <div
        style={{
          position: "relative",
          width: 402,
          maxWidth: "100%",
          borderRadius: 44,
          padding: 10,
          background: "linear-gradient(160deg,#2a2a3d,#16161f)",
          boxShadow:
            "0 30px 80px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06)",
        }}
      >
        <div
          style={{
            borderRadius: 36,
            overflow: "hidden",
            background: "#fff",
            height: "min(80vh, 874px)",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <ErrorBoundary resetKey={active}>
            <Current />
          </ErrorBoundary>
        </div>
      </div>

      <div style={{ marginTop: 22, fontSize: 12, color: "#6f6f8a" }}>
        Переключайте экраны кнопками выше · данные в мокапах демонстрационные
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Gallery />);
