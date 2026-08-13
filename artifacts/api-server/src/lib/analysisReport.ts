// ─────────────────────────────────────────────────────────────────────────────
// Разбор успеваемости нейросетью: задание для модели и разбор её ответа.
//
// ── Зачем он рядом с правилами, а не вместо них ─────────────────────────────
// На экране «Анализ» уже есть рекомендации по правилам
// (english-learning/utils/insights.ts). Они считаются мгновенно, работают без
// ключей и всегда одинаковы на одних данных. Но они умеют только то, что в них
// заложено: «аудирование просело», «работа ждёт проверки».
//
// Модель видит другое — САМИ ОШИБКИ. Не «чтение 54%», а «путает past simple и
// present perfect в трёх работах подряд». Такое правилом не опишешь, потому
// что для этого надо читать ответы.
//
// Поэтому здесь именно то, чего правилам не хватает: связь между ошибками,
// причина и что с ней делать. Цифры остаются на экране рядом.
//
// ── Ответ обязан быть JSON ──────────────────────────────────────────────────
// Экран раскладывает разбор по блокам: сводка, что делать классу, разбор по
// каждому ученику. Из свободного текста это не собрать, поэтому модель отвечает
// объектом. Если формат поехал — весь текст показывается как сводка: потерять
// разбор целиком хуже, чем показать его одним куском.
// ─────────────────────────────────────────────────────────────────────────────

/** Что знаем про одного ученика. Всё, что уходит модели. */
export interface StudentBrief {
  id: number;
  name: string;
  level: string | null;
  /** Средний балл по проверенным работам. null — работ нет. */
  average: number | null;
  graded: number;
  pending: number;
  overdue: number;
  /** Средний балл по видам работ: «Тест 72%». */
  byType: { type: string; average: number | null; count: number }[];
  /** Неверные ответы: вопрос, что ответил, как правильно. */
  mistakes: { question: string; answer: string; correct: string }[];
  /** Ошибки из диалогов со Снежей: короткая формулировка по-русски. */
  dialogIssues: string[];
  /** Дней с последнего захода. null — неизвестно. */
  daysSinceSeen: number | null;
}

export interface AnalysisAdvice {
  studentId: number;
  name: string;
  /** Одна фраза: что происходит с учеником. */
  verdict: string;
  /** Что делать. Две-три коротких строки. */
  advice: string[];
}

export interface AnalysisReport {
  /** Общая картина по классу, 2-4 предложения. */
  summary: string;
  /** Что делать со всем классом. */
  focus: string[];
  students: AnalysisAdvice[];
}

/** Названия видов работ по-русски: модель не должна угадывать наши ключи. */
const TYPE_LABELS: Record<string, string> = {
  text_test: "тесты",
  audio: "аудирование",
  reading: "чтение",
  video: "видео",
  free_form: "свободные ответы",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

/**
 * Задание для модели.
 *
 * Требования жёсткие намеренно. Без них модель пересказывает проценты словами
 * («у Ани 64%, это средний результат») — учитель это и так видит на экране, а
 * значит разбор бесполезен.
 */
export function analysisSystemPrompt(): string {
  return [
    "Ты методист по английскому языку. Тебе дают выгрузку успеваемости класса: средние баллы, работы на проверке, просрочки и САМИ ОШИБКИ учеников.",
    "Твоя работа — объяснить, ЧТО ИМЕННО не получается, и сказать, что с этим делать.",
    "",
    "Отвечай ОДНИМ объектом JSON и ничем больше. Без markdown, без пояснений, без блоков кода:",
    '{"summary": "...", "focus": ["..."], "students": [{"studentId": 1, "verdict": "...", "advice": ["..."]}]}',
    "",
    "- summary: 2-4 предложения про класс целиком. Назови главную проблему и её причину, а не список процентов.",
    "- focus: 2-4 совета классу. Каждый — конкретное действие на ближайшую неделю.",
    "- students: по одному объекту на КАЖДОГО ученика из выгрузки, studentId бери из неё.",
    "- verdict: одна фраза про этого ученика. Что происходит и почему.",
    "- advice: 1-3 совета. Что задать, что разобрать, на что обратить внимание.",
    "",
    "Правила:",
    "1. Пиши ПО-РУССКИ, для взрослого учителя, простым языком без канцелярита.",
    "2. Опирайся на ошибки: называй тему (времена, предлоги, порядок слов, лексика, артикли), а не только проценты.",
    "3. Не пересказывай цифры — учитель видит их рядом. Цифра уместна как довод, а не как содержание.",
    "4. Совет должен быть выполнимым на этой неделе: «дать 3 коротких задания на past simple», а не «повысить мотивацию».",
    "5. Не выдумывай данных. Нет работ у ученика — так и скажи и посоветуй, с чего начать.",
    "6. Не хвали без повода. Если результат слабый, скажи прямо.",
    "7. Коротко: verdict до 20 слов, каждый совет до 20 слов.",
  ].join("\n");
}

/** Выгрузка для модели: плоский текст, а не JSON — так дешевле по токенам. */
export function buildAnalysisInput(students: StudentBrief[]): string {
  const lines: string[] = [`Учеников в классе: ${students.length}.`, ""];

  for (const s of students) {
    lines.push(`# Ученик id=${s.id}, имя: ${s.name}${s.level ? `, уровень: ${s.level}` : ""}`);
    lines.push(
      s.average === null
        ? "Проверенных работ нет."
        : `Средний балл: ${s.average}% по ${s.graded} работам.`,
    );
    if (s.pending > 0) lines.push(`Ждут проверки учителем: ${s.pending}.`);
    if (s.overdue > 0) lines.push(`Просрочено заданий: ${s.overdue}.`);
    if (s.daysSinceSeen !== null && s.daysSinceSeen >= 7) {
      lines.push(`Не заходил в приложение ${s.daysSinceSeen} дней.`);
    }

    const scored = s.byType.filter((t) => t.count > 0 && t.average !== null);
    if (scored.length > 0) {
      lines.push(
        "По видам работ: " +
        scored.map((t) => `${typeLabel(t.type)} ${t.average}% (${t.count})`).join(", "),
      );
    }

    if (s.mistakes.length > 0) {
      lines.push("Ошибки в заданиях:");
      for (const m of s.mistakes) {
        lines.push(`- вопрос: ${m.question} | ответил: ${m.answer} | правильно: ${m.correct}`);
      }
    }

    if (s.dialogIssues.length > 0) {
      lines.push("Ошибки в разговоре: " + s.dialogIssues.join("; "));
    }

    lines.push("");
  }

  return lines.join("\n");
}

/** Строка из ответа модели: обрезаем, чтобы одна фраза не растянулась на экран. */
function str(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function strList(value: unknown, limit: number, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => str(v, limit)).filter(Boolean).slice(0, max);
}

/**
 * Разобрать ответ модели.
 *
 * Берём подстроку от первой «{» до последней «}»: модели то и дело добавляют
 * ```json и пояснения, о чём их не просили. Не разобралось — отдаём весь текст
 * сводкой: пусть учитель прочитает его как есть.
 */
export function parseAnalysisReport(raw: string, students: StudentBrief[]): AnalysisReport {
  const nameById = new Map(students.map((s) => [s.id, s.name]));
  const fallback: AnalysisReport = {
    summary: raw.trim().slice(0, 1500),
    focus: [],
    students: [],
  };

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return fallback;

  try {
    const data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const summary = str(data["summary"], 1200);
    const focus = strList(data["focus"], 220, 5);

    const rows = Array.isArray(data["students"]) ? data["students"] : [];
    const perStudent: AnalysisAdvice[] = [];
    for (const row of rows) {
      const obj = row as Record<string, unknown>;
      const id = Number(obj["studentId"]);
      // Ученик не из выгрузки — модель его придумала. Такое встречается, и
      // показывать выдуманного ученика учителю нельзя.
      if (!Number.isInteger(id) || !nameById.has(id)) continue;
      const verdict = str(obj["verdict"], 300);
      const advice = strList(obj["advice"], 220, 3);
      if (!verdict && advice.length === 0) continue;
      perStudent.push({ studentId: id, name: nameById.get(id)!, verdict, advice });
    }

    if (!summary && focus.length === 0 && perStudent.length === 0) return fallback;
    return { summary, focus, students: perStudent };
  } catch {
    return fallback;
  }
}
