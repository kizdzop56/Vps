// ─────────────────────────────────────────────────────────────────────────────
// Рекомендации для учителя на экране «Анализ».
//
// Экран показывал проценты и оставлял вывод учителю: пять полос на ученика,
// шесть учеников — тридцать чисел, которые надо сравнить глазами. Здесь эти
// числа превращаются в короткие фразы: что не так и что с этим делать.
//
// Почему правила, а не языковая модель:
//   • считается мгновенно и локально, без ключей, счетов и сети;
//   • вывод воспроизводим — на одних данных всегда один совет, учитель может
//     ему доверять и перепроверить по цифрам рядом;
//   • модель на таких данных всё равно пересказывала бы проценты словами.
// Если понадобится живой текст, слой подключается поверх: правила остаются
// как источник фактов.
//
// Пороги подобраны под школьную шкалу проекта (см. scoreTint в assignments.tsx):
// 70 и выше — хорошо, 50-69 — средне, ниже 50 — плохо.
// ─────────────────────────────────────────────────────────────────────────────

/** Насколько срочно. Задаёт цвет и порядок: urgent всегда наверху. */
export type InsightTone = "urgent" | "attention" | "good" | "info";

export interface Insight {
  tone: InsightTone;
  /** Короткая фраза: что происходит. */
  text: string;
  /** Что сделать. Отдельной строкой, чтобы совет не сливался с диагнозом. */
  action?: string;
}

/** Строка статистики по одному виду заданий (ответ /students/:id/category-stats). */
export interface CategoryStat {
  type: string;
  avgScore: number | null;
  count: number;
  /** Сдано, но ещё не проверено. Для free_form это обычное состояние. */
  pending?: number;
}

/** Что известно про ученика помимо статистики по видам. */
export interface StudentSignals {
  /** Просроченные назначения: считается по dueAt на экране. */
  overdue?: number;
  /** Дней с последнего захода. undefined — неизвестно. */
  daysSinceSeen?: number;
}

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

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Средний балл ученика по всем видам, взвешенный по числу работ.
 *
 * Именно взвешенный, а не среднее из пяти процентов: иначе одна случайная
 * работа по видео весит столько же, сколько двенадцать тестов.
 */
export function overallScore(stats: CategoryStat[]): number | null {
  const scored = stats.filter((s) => s.count > 0 && s.avgScore !== null);
  const total = scored.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;
  return Math.round(scored.reduce((sum, s) => sum + (s.avgScore ?? 0) * s.count, 0) / total);
}

/** Самый слабый вид работ из тех, по которым есть оценки. */
export function weakestType(stats: CategoryStat[]): CategoryStat | null {
  const scored = stats.filter((s) => s.count > 0 && s.avgScore !== null);
  if (scored.length === 0) return null;
  return scored.reduce((worst, s) => ((s.avgScore ?? 100) < (worst.avgScore ?? 100) ? s : worst));
}

/**
 * Рекомендации по одному ученику. Отсортированы по срочности, максимум три:
 * список из семи советов никто не читает, а первые три — читает.
 */
export function studentInsights(stats: CategoryStat[], signals: StudentSignals = {}): Insight[] {
  const out: Insight[] = [];

  const graded = stats.reduce((sum, s) => sum + s.count, 0);
  const pending = stats.reduce((sum, s) => sum + (s.pending ?? 0), 0);
  const overall = overallScore(stats);

  // 1. Работы на проверке. Блокирует всё остальное: пока учитель не проверил,
  //    у ученика нет обратной связи, а цифры на экране неполные.
  if (pending > 0) {
    out.push({
      tone: "urgent",
      text: `${pending} ${pluralRu(pending, "работа ждёт", "работы ждут", "работ ждут")} вашей проверки`,
      action: "Проверьте, чтобы ученик увидел результат",
    });
  }

  // 2. Просроченные задания.
  if (signals.overdue && signals.overdue > 0) {
    out.push({
      tone: "urgent",
      text: `Просрочено ${signals.overdue} ${pluralRu(signals.overdue, "задание", "задания", "заданий")}`,
      action: "Напомните или сдвиньте срок",
    });
  }

  // 3. Совсем нет работ. Дальше анализировать нечего — выходим сразу.
  if (graded === 0 && pending === 0) {
    out.push({
      tone: "info",
      text: "Ещё не выполнил ни одного задания",
      action: signals.daysSinceSeen !== undefined && signals.daysSinceSeen > 7
        ? "И давно не заходил — стоит написать"
        : "Назначьте первое задание, чтобы увидеть уровень",
    });
    return out.slice(0, 3);
  }

  // 4. Пропал из приложения. Отдельно от успеваемости: балл может быть
  //    отличным, но если ученик две недели не заходит, это важнее балла.
  if (signals.daysSinceSeen !== undefined && signals.daysSinceSeen >= 7) {
    out.push({
      tone: "attention",
      text: `Не заходил ${signals.daysSinceSeen} ${pluralRu(signals.daysSinceSeen, "день", "дня", "дней")}`,
      action: "Короткое задание вернёт в ритм лучше, чем длинное",
    });
  }

  const weakest = weakestType(stats);

  // 5. Диагноз по успеваемости. Либо всё плохо, либо просадка в одном виде —
  //    одновременно эти два совета противоречат друг другу, поэтому else.
  if (overall !== null && overall < 50) {
    out.push({
      tone: "attention",
      text: `Общая просадка: ${overall}% по всем видам работ`,
      action: "Разберите основы и дайте задания попроще, иначе копится отставание",
    });
  } else if (
    weakest && weakest.avgScore !== null && overall !== null &&
    weakest.avgScore < 60 && overall - weakest.avgScore >= 15
  ) {
    out.push({
      tone: "attention",
      text: `${capitalize(typeLabel(weakest.type))}: ${weakest.avgScore}% при среднем ${overall}%`,
      action: `Дайте 2-3 коротких задания на ${typeLabel(weakest.type)} на этой неделе`,
    });
  }

  // 6. Пробел в покрытии: по виду вообще нет работ, хотя по остальным есть.
  //    Мешает доверять среднему баллу — он посчитан не по всей картине.
  const missing = stats.filter((s) => s.count === 0 && (s.pending ?? 0) === 0);
  if (missing.length > 0 && missing.length <= 2 && graded >= 3) {
    out.push({
      tone: "info",
      text: `Нет данных: ${missing.map((s) => typeLabel(s.type)).join(", ")}`,
      action: "Назначьте такое задание, чтобы картина была полной",
    });
  }

  // 7. Ученик перерос уровень. Хорошая новость тоже требует действия:
  //    без неё сильный ученик тихо скучает.
  if (overall !== null && overall >= 85 && graded >= 5) {
    out.push({
      tone: "good",
      text: `Стабильно ${overall}% на ${graded} ${pluralRu(graded, "работе", "работах", "работах")}`,
      action: "Пора давать сложнее или поднимать уровень",
    });
  }

  return out.slice(0, 3);
}

/** Сводка по классу для шапки экрана. */
export interface ClassSummary {
  /** Средний балл класса, взвешенный по числу работ. null — работ ещё нет. */
  average: number | null;
  /** Самый слабый вид работ по классу и его процент. */
  weakest: { type: string; score: number } | null;
  /** Учеников со средним ниже 60%. */
  behind: number;
  /** Учеников без единой проверенной работы. */
  noData: number;
  /** Работ на проверке суммарно. */
  pending: number;
  /** Рекомендации по классу целиком. */
  insights: Insight[];
}

/**
 * Сводка и рекомендации по всем ученикам сразу.
 *
 * Смысл в том, чтобы отделить личную проблему от общей: если аудирование
 * проседает у одного — это работа с учеником, если у всего класса — значит
 * дело в подаче темы, и решается это одним общим заданием, а не шестью
 * личными.
 */
export function classSummary(
  students: { stats: CategoryStat[]; signals?: StudentSignals }[],
): ClassSummary {
  const withStats = students.filter((s) => s.stats.length > 0);

  // Средний балл класса: взвешиваем по числу работ, а не по числу учеников,
  // иначе ученик с одной работой влияет так же, как ученик с двадцатью.
  let totalWeighted = 0;
  let totalCount = 0;
  for (const s of withStats) {
    for (const stat of s.stats) {
      if (stat.count > 0 && stat.avgScore !== null) {
        totalWeighted += stat.avgScore * stat.count;
        totalCount += stat.count;
      }
    }
  }
  const average = totalCount > 0 ? Math.round(totalWeighted / totalCount) : null;

  // Слабейший вид по классу.
  const byType = new Map<string, { sum: number; count: number }>();
  for (const s of withStats) {
    for (const stat of s.stats) {
      if (stat.count === 0 || stat.avgScore === null) continue;
      const acc = byType.get(stat.type) ?? { sum: 0, count: 0 };
      acc.sum += stat.avgScore * stat.count;
      acc.count += stat.count;
      byType.set(stat.type, acc);
    }
  }
  let weakest: { type: string; score: number } | null = null;
  byType.forEach((acc, type) => {
    const score = Math.round(acc.sum / acc.count);
    if (!weakest || score < weakest.score) weakest = { type, score };
  });

  const scores = withStats.map((s) => overallScore(s.stats));
  const behind = scores.filter((v) => v !== null && v < 60).length;
  const noData = scores.filter((v) => v === null).length;
  const pending = withStats.reduce(
    (sum, s) => sum + s.stats.reduce((acc, stat) => acc + (stat.pending ?? 0), 0), 0,
  );
  const overdue = students.reduce((sum, s) => sum + (s.signals?.overdue ?? 0), 0);

  const insights: Insight[] = [];

  if (pending > 0) {
    insights.push({
      tone: "urgent",
      text: `${pending} ${pluralRu(pending, "работа ждёт", "работы ждут", "работ ждут")} проверки`,
      action: "Начните с них: без оценки ученик не знает результата",
    });
  }

  if (overdue > 0) {
    insights.push({
      tone: "urgent",
      text: `${overdue} ${pluralRu(overdue, "задание просрочено", "задания просрочено", "заданий просрочено")}`,
      action: "Напомните ученикам или сдвиньте сроки",
    });
  }

  // Общая тема, а не личная: слабый вид просел заметно ниже среднего.
  const weak = weakest as { type: string; score: number } | null;
  if (weak && average !== null && weak.score < 65 && average - weak.score >= 10) {
    insights.push({
      tone: "attention",
      text: `${capitalize(typeLabel(weak.type))} проседает у класса: ${weak.score}% при среднем ${average}%`,
      action: "Похоже на пробел в теме, а не в отдельных учениках. Разберите на уроке",
    });
  }

  if (behind > 0) {
    insights.push({
      tone: "attention",
      text: `${behind} ${pluralRu(behind, "ученик отстаёт", "ученика отстают", "учеников отстают")} (ниже 60%)`,
      action: "Они подняты наверх списка",
    });
  }

  if (noData > 0) {
    insights.push({
      tone: "info",
      text: `${noData} ${pluralRu(noData, "ученик", "ученика", "учеников")} без единой работы`,
      action: "Назначьте задание, иначе прогресс не с чем сравнивать",
    });
  }

  // Хвалить есть за что только когда всё остальное в порядке.
  if (insights.length === 0 && average !== null && average >= 75) {
    insights.push({
      tone: "good",
      text: `Класс держит ${average}%, отстающих нет`,
      action: "Можно поднимать сложность",
    });
  }

  return { average, weakest: weak, behind, noData, pending, insights };
}
