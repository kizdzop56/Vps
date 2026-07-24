import { useState } from "react";

const questions = [
  {
    id: 1,
    text: "What does the word 'peculiar' mean?",
    options: ["Strange or unusual", "Very fast", "Extremely loud", "Quite ordinary"],
    correct: 0,
  },
  {
    id: 2,
    text: "Which sentence uses the past perfect tense correctly?",
    options: [
      "She had finished her work before he arrived.",
      "She finished her work before he arrives.",
      "She has finish her work before he arrived.",
      "She have finished her work before he arrive.",
    ],
    correct: 0,
  },
  {
    id: 3,
    text: "Choose the correct preposition: 'She is interested ___ learning English.'",
    options: ["at", "in", "on", "by"],
    correct: 1,
  },
];

export function MultipleChoice() {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState<boolean[]>(Array(questions.length).fill(false));
  const [confirmed, setConfirmed] = useState(false);

  const q = questions[current];
  const progress = answered.filter(Boolean).length;

  const handleSelect = (i: number) => {
    if (confirmed) return;
    setSelected(i);
  };

  const handleNext = () => {
    if (selected === null) return;
    const newAnswered = [...answered];
    newAnswered[current] = true;
    setAnswered(newAnswered);
    setConfirmed(true);
    setTimeout(() => {
      if (current < questions.length - 1) {
        setCurrent(current + 1);
        setSelected(null);
        setConfirmed(false);
      }
    }, 700);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f5f3ff" }}>
      {/* Top bar */}
      <div className="w-full flex items-center justify-between px-5 pt-8 pb-2">
        <button className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "rgba(0,0,0,0.07)" }}>
          <svg width="16" height="16" fill="none" stroke="#64748b" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <span className="text-slate-400 text-sm font-medium">{current + 1} / {questions.length}</span>
        <button className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "rgba(0,0,0,0.07)" }}>
          <svg width="16" height="16" fill="none" stroke="#64748b" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>
        </button>
      </div>

      <div className="w-full px-5 mt-1">
        <p className="text-violet-400 text-xs font-semibold tracking-widest uppercase">Аудирование</p>
      </div>

      {/* Audio player card */}
      <div className="w-full px-5 mt-3">
        <div className="rounded-2xl p-4 bg-white" style={{ boxShadow: "0 4px 24px rgba(139,92,246,0.12)" }}>
          <div className="flex items-center gap-3">
            <button className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
              <svg width="18" height="18" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-0.5 h-8">
                {Array.from({ length: 32 }).map((_, i) => (
                  <div key={i} className="rounded-full" style={{ width: 3, height: 4 + Math.sin(i * 0.7) * 10 + (i % 3) * 3, background: i < 12 ? "#f97316" : "#e2e8f0" }} />
                ))}
              </div>
            </div>
            <span className="text-xs text-slate-400 font-medium">0:15</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-slate-700 text-sm font-semibold leading-snug">{q.text}</p>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 bg-slate-100">1×</button>
            <button className="p-1.5 rounded-lg bg-slate-100">
              <svg width="14" height="14" fill="none" stroke="#64748b" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" /></svg>
            </button>
            <div className="flex-1" />
            <button className="px-4 py-1.5 rounded-full text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
              Слушать ещё раз
            </button>
          </div>
        </div>
      </div>

      {/* Options */}
      <div className="w-full px-5 mt-4 flex-1">
        <div className="flex flex-col gap-2.5">
          {q.options.map((opt, i) => {
            const isSelected = selected === i;
            const isCorrect = confirmed && i === q.correct;
            const isWrong = confirmed && isSelected && i !== q.correct;
            return (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                className="w-full text-left px-4 py-3.5 rounded-2xl flex items-center gap-3 transition-all bg-white"
                style={{
                  border: `2px solid ${isCorrect ? "#22c55e" : isWrong ? "#ef4444" : isSelected ? "#8b5cf6" : "#e2e8f0"}`,
                  background: isCorrect ? "#f0fdf4" : isWrong ? "#fef2f2" : isSelected ? "#f5f3ff" : "white",
                  boxShadow: isSelected && !confirmed ? "0 2px 12px rgba(139,92,246,0.15)" : "0 1px 4px rgba(0,0,0,0.05)",
                }}
              >
                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center" style={{
                  background: isCorrect ? "#22c55e" : isWrong ? "#ef4444" : isSelected ? "#8b5cf6" : "transparent",
                  border: `2px solid ${isCorrect ? "#22c55e" : isWrong ? "#ef4444" : isSelected ? "#8b5cf6" : "#cbd5e1"}`,
                }}>
                  {(isSelected || isCorrect) && <svg width="12" height="12" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" /></svg>}
                  {isWrong && <svg width="10" height="10" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" /></svg>}
                </div>
                <span className="text-sm font-medium" style={{ color: isCorrect ? "#16a34a" : isWrong ? "#dc2626" : isSelected ? "#6d28d9" : "#374151" }}>{opt}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleNext}
          disabled={selected === null}
          className="w-full mt-4 py-4 rounded-2xl font-bold text-base transition-all"
          style={{
            background: selected !== null ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "#e2e8f0",
            color: selected !== null ? "white" : "#94a3b8",
            boxShadow: selected !== null ? "0 4px 20px rgba(139,92,246,0.3)" : "none",
          }}
        >
          {current === questions.length - 1 ? "Завершить" : "Следующий вопрос →"}
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full px-5 pb-8 mt-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-lg">📚</span>
            <span className="text-slate-500 text-xs font-semibold">Урок 3</span>
          </div>
          <span className="text-slate-400 text-xs font-medium">{Math.round((progress / questions.length) * 100)}%</span>
        </div>
        <div className="w-full h-3 rounded-full bg-slate-200">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(progress / questions.length) * 100}%`, background: "linear-gradient(90deg, #f97316, #fb923c)" }} />
        </div>
      </div>
    </div>
  );
}
