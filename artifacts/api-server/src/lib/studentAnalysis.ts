/**
 * Правила «на что обратить внимание на следующем уроке».
 *
 * Зачем отдельный модуль:
 * вкладка «Анализ» у учителя показывала только средний балл по типам заданий за
 * всё время. По четырём процентам нельзя понять, что делать на уроке: 68% по
 * чтению — это стабильно 68% или падение с 85%? Слова ученик повторяет или
 * забросил месяц назад? Здесь сырые метрики превращаются в короткий список
 * приоритетов, который учитель читает за пять секунд.
 *
 * Модуль намеренно без внешних зависимостей и без обращений к БД — чистая
 * функция от метрик. Так его легко тестировать (node:test, как timeStats) и
 * невозможно случайно замедлить запросом в цикле. Никаких обращений к ИИ:
 * правила детерминированы, работают мгновенно и одинаково объясняются учителю.
 *
 * Пороги вынесены в экспортируемые константы — на них ссылаются и тесты, и
 * подсказки в интерфейсе, чтобы текст «слабый навык — ниже 60%» не разъехался
 * с реальной логикой.
 */

/** Типы заданий, по которым считаем навыки (совпадает с assignmentTypeEnum). */
export const SKILL_TYPES = ["text_test", "audio", "reading", "video", "free_form"] as const;
export type SkillType = (typeof SKILL_TYPES)[number];

/** Ниже этого среднего балла навык считаем слабым. */
export const WEAK_SKILL_SCORE = 60;

/** Балл, с которого навык считаем уверенно освоенным. */
export const STRONG_SKILL_SCORE = 85;

/**
 * Минимум работ, без которых процент ничего не значит. Одна случайная двойка не
 * должна попадать в «слабые навыки» — учитель пойдёт разбирать несуществующую
 * проблему.
 */
export const MIN_SKILL_SAMPLE = 3;

/** Падение среднего балла (в пунктах), которое считаем значимым. */
export const SKILL_DROP_POINTS = 10;

/** Столько дней без входа — уже повод спросить, что случилось. */
export const INACTIVE_DAYS = 5;

/** Просроченных слов больше — пора повторять лексику на уроке. */
export const DUE_WORDS_ALERT = 20;

/** Столько забытых слов (уровень памяти упал в ноль) уже нужно разбирать. */
export const LAPSED_WORDS_ALERT = 10;

/** Задание не начато дольше этого срока — напомнить или разобрать причину. */
export const STALE_ASSIGNMENT_DAYS = 7;

/** Одна и та же ошибка столько раз — это не случайность, а пробел. */
export const MISTAKE_REPEAT_ALERT = 3;

/** Сколько пунктов фокуса отдаём максимум: больше учитель не прочитает. */
export const MAX_FOCUS_ITEMS = 5;

export type SkillStat = {
  type: SkillType;
  /** Средний балл за всё время, null — нет проверенных работ. */
  avgScore: number | null;
  /** Сколько проверенных работ учтено. */
  count: number;
  /** Средний балл по последним работам. */
  recentAvg: number | null;
  /** Средний балл по предыдущему окну — с ним сравниваем recentAvg. */
  prevAvg: number | null;
  /** recentAvg - prevAvg, null если сравнивать не с чем. */
  delta: number | null;
  trend: "up" | "down" | "flat" | "unknown";
  /** Когда сдана последняя работа этого типа (ISO). */
  lastAt: string | null;
};

export type MistakeStat = {
  questionText: string;
  assignmentTitle: string | null;
  count: number;
  correctAnswer: string | null;
  lastStudentAnswer: string | null;
  lastAt: string | null;
};

export type ActivityMetrics = {
  /** Дней с последней активности; null — активности не было вообще. */
  daysSinceActive: number | null;
  minutesToday: number;
  minutesWeek: number;
  minutesPrevWeek: number;
  loginStreak: number;
  dailyGoalMinutes: number;
};

export type VocabularyMetrics = {
  /** Слов во всех доступных ученику колодах. */
  totalWords: number;
  /** Слов, которые ученик хотя бы раз увидел. */
  introduced: number;
  learned: number;
  /** Слов с наступившим сроком повторения. */
  dueNow: number;
  /** Слов, откатившихся на нулевой уровень памяти. */
  lapsed: number;
  /** Доля верных ответов при повторениях, 0-100; null — не было повторений. */
  accuracy: number | null;
  learnedLast7: number;
  reviewsLast7: number;
};

export type AssignmentMetrics = {
  /** Всего назначено заданий. */
  total: number;
  /** Назначено, но ученик не начал. */
  notStarted: number;
  /** Сколько дней висит самое старое неначатое задание. */
  oldestNotStartedDays: number | null;
  /** Сдано, но ещё не проверено учителем. */
  awaitingReview: number;
  gradedLast14: number;
  avgScoreLast14: number | null;
};

export type AnalysisMetrics = {
  cefrLevel: string | null;
  activity: ActivityMetrics;
  skills: SkillStat[];
  vocabulary: VocabularyMetrics;
  assignments: AssignmentMetrics;
  mistakes: MistakeStat[];
};

/**
 * Насколько свежая картина по ученику:
 * - active   — занимался недавно;
 * - slowing  — активность заметно просела относительно прошлой недели;
 * - inactive — давно не заходил, данные устарели;
 * - unknown  — активности не было вовсе.
 */
export type FreshnessStatus = "active" | "slowing" | "inactive" | "unknown";

export type FocusSeverity = "high" | "medium" | "low" | "good" | "info";

export type FocusItem = {
  /** Стабильный ключ правила — удобно для тестов и для key в списке. */
  id: string;
  severity: FocusSeverity;
  /** Имя иконки Feather на клиенте. */
  icon: string;
  title: string;
  /** Пояснение: что именно в цифрах и что с этим делать. */
  detail: string;
};

const SKILL_LABELS: Record<SkillType, string> = {
  text_test: "Тест",
  audio: "Аудирование",
  reading: "Чтение",
  video: "Видео",
  free_form: "Свободный ответ",
};

export function skillLabel(type: SkillType | string): string {
  return SKILL_LABELS[type as SkillType] ?? type;
}

/** Русское склонение: 1 слово / 2 слова / 5 слов. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function daysWord(n: number): string {
  return plural(n, "день", "дня", "дней");
}

/** Насколько свежие данные по ученику — считается отдельно, показывается плашкой. */
export function freshnessStatus(activity: ActivityMetrics): FreshnessStatus {
  const { daysSinceActive, minutesWeek, minutesPrevWeek } = activity;
  if (daysSinceActive === null) return "unknown";
  if (daysSinceActive >= INACTIVE_DAYS) return "inactive";
  // Сравниваем с прошлой неделей только если тогда реально занимались —
  // иначе «просело» покажется на любом старте с нуля.
  if (minutesPrevWeek >= 30 && minutesWeek < minutesPrevWeek / 2) return "slowing";
  return "active";
}

/** Навык с самым низким средним баллом среди тех, где хватает работ. */
function weakestSkill(skills: SkillStat[]): SkillStat | null {
  const rated = skills.filter((s) => s.avgScore !== null && s.count >= MIN_SKILL_SAMPLE);
  if (rated.length === 0) return null;
  return rated.reduce((worst, s) => ((s.avgScore ?? 100) < (worst.avgScore ?? 100) ? s : worst));
}

/** Навык, просевший сильнее всех. */
function fallingSkill(skills: SkillStat[]): SkillStat | null {
  const falling = skills.filter((s) => s.delta !== null && s.delta <= -SKILL_DROP_POINTS);
  if (falling.length === 0) return null;
  return falling.reduce((worst, s) => ((s.delta ?? 0) < (worst.delta ?? 0) ? s : worst));
}

const SEVERITY_RANK: Record<FocusSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  good: 3,
  info: 4,
};

/**
 * Собирает список приоритетов для следующего урока.
 * Порядок: сначала то, что блокирует прогресс (учитель должен что-то сделать),
 * потом просадки, потом лексика и хвосты, в конце — похвала и справка.
 */
export function buildFocus(m: AnalysisMetrics): FocusItem[] {
  const items: FocusItem[] = [];
  const { activity, vocabulary, assignments, mistakes, skills } = m;

  const hasAnyWork = skills.some((s) => s.count > 0);
  const hasAnyVocab = vocabulary.introduced > 0;

  // Совсем нет данных — учителю нужен не диагноз, а первый шаг.
  if (!hasAnyWork && !hasAnyVocab) {
    items.push({
      id: "no-data",
      severity: "info",
      icon: "inbox",
      title: "Пока нет данных",
      detail:
        "Ученик ещё не выполнял заданий и не повторял слова. Назначьте первое задание или колоду — после этого здесь появится анализ.",
    });
    return items;
  }

  // 1. Работы, ждущие проверки: это задача самого учителя, и без неё
  //    статистика по навыкам остаётся неполной.
  if (assignments.awaitingReview > 0) {
    const n = assignments.awaitingReview;
    items.push({
      id: "awaiting-review",
      severity: "high",
      icon: "clipboard",
      title: `${n} ${plural(n, "работа", "работы", "работ")} ждёт проверки`,
      detail:
        "Пока работа не проверена, её балл не попадает в статистику. Проверьте до урока — разбор ошибок будет предметным.",
    });
  }

  // 2. Пропал из приложения.
  const freshness = freshnessStatus(activity);
  if (freshness === "inactive" && activity.daysSinceActive !== null) {
    const d = activity.daysSinceActive;
    items.push({
      id: "inactive",
      severity: "high",
      icon: "user-x",
      title: `Не заходил ${d} ${daysWord(d)}`,
      detail:
        "Данные ниже устарели, по ним нельзя судить об уровне. Начните урок с разговорной разминки и выясните причину пропуска.",
    });
  } else if (freshness === "slowing") {
    items.push({
      id: "slowing",
      severity: "medium",
      icon: "trending-down",
      title: "Активность просела",
      detail: `За эту неделю ${activity.minutesWeek} мин против ${activity.minutesPrevWeek} мин на прошлой. Стоит вернуть регулярность: короткие задания каждый день работают лучше редких больших.`,
    });
  }

  // 3. Просадка по навыку — важнее низкого, но стабильного балла.
  const falling = fallingSkill(skills);
  if (falling && falling.delta !== null) {
    const drop = Math.abs(Math.round(falling.delta));
    items.push({
      id: `falling-${falling.type}`,
      severity: "high",
      icon: "arrow-down-right",
      title: `${skillLabel(falling.type)}: минус ${drop}%`,
      detail: `Последние работы в среднем на ${drop}% хуже предыдущих (${falling.recentAvg}% против ${falling.prevAvg}%). Разберите на уроке именно этот формат, пока откат не закрепился.`,
    });
  }

  // 4. Стабильно слабый навык.
  const weakest = weakestSkill(skills);
  if (weakest && weakest.avgScore !== null && weakest.avgScore < WEAK_SKILL_SCORE && weakest.type !== falling?.type) {
    items.push({
      id: `weak-${weakest.type}`,
      severity: "high",
      icon: "alert-triangle",
      title: `${skillLabel(weakest.type)} — ${weakest.avgScore}%`,
      detail: `Самый слабый навык за ${weakest.count} ${plural(weakest.count, "работу", "работы", "работ")}. Возьмите его основой урока: ниже ${WEAK_SKILL_SCORE}% материал не усвоен, а не «почти получилось».`,
    });
  }

  // 5. Повторяющаяся ошибка — самый конкретный материал для урока.
  const repeated = mistakes.find((mi) => mi.count >= MISTAKE_REPEAT_ALERT);
  if (repeated) {
    items.push({
      id: "repeated-mistake",
      severity: "medium",
      icon: "repeat",
      title: `Одна ошибка ${repeated.count} ${plural(repeated.count, "раз", "раза", "раз")}`,
      detail: `«${truncate(repeated.questionText, 90)}»${repeated.correctAnswer ? ` — верно: ${truncate(repeated.correctAnswer, 40)}` : ""}. Это не описка, а пробел в правиле: объясните заново и дайте 2-3 однотипных примера.`,
    });
  }

  // 6. Лексика: просроченные повторения и забытые слова.
  if (vocabulary.dueNow >= DUE_WORDS_ALERT) {
    const n = vocabulary.dueNow;
    items.push({
      id: "words-due",
      severity: "medium",
      icon: "clock",
      title: `${n} ${plural(n, "слово", "слова", "слов")} просрочено`,
      detail:
        "Срок повторения прошёл — без него слова уходят из памяти. Начните урок с быстрого прогона этих карточек.",
    });
  } else if (vocabulary.lapsed >= LAPSED_WORDS_ALERT) {
    const n = vocabulary.lapsed;
    items.push({
      id: "words-lapsed",
      severity: "medium",
      icon: "rotate-ccw",
      title: `${n} ${plural(n, "слово", "слова", "слов")} забыто`,
      detail:
        "Эти слова откатились на нулевой уровень: ученик отвечал «не знаю». Проговорите их вслух и в контексте, одних карточек уже не хватит.",
    });
  }

  // 7. Задания, до которых ученик не дошёл.
  if (assignments.notStarted > 0 && (assignments.oldestNotStartedDays ?? 0) >= STALE_ASSIGNMENT_DAYS) {
    const n = assignments.notStarted;
    const d = assignments.oldestNotStartedDays ?? 0;
    items.push({
      id: "not-started",
      severity: "medium",
      icon: "pause-circle",
      title: `${n} ${plural(n, "задание", "задания", "заданий")} не начато`,
      detail: `Самое старое висит ${d} ${daysWord(d)}. Спросите, что помешало: непонятная формулировка и нехватка времени лечатся по-разному.`,
    });
  }

  // 8. Ученик ни разу не трогал слова, хотя колоды есть.
  if (vocabulary.totalWords > 0 && vocabulary.introduced === 0) {
    items.push({
      id: "vocab-untouched",
      severity: "low",
      icon: "layers",
      title: "Слова не начаты",
      detail:
        "Колоды доступны, но ученик не открывал карточки. Покажите на уроке, как работает повторение — сам он до вкладки может не дойти.",
    });
  }

  // 9. Всё хорошо — тоже вывод: значит, можно усложнять.
  const rated = skills.filter((s) => s.avgScore !== null && s.count >= MIN_SKILL_SAMPLE);
  const allStrong = rated.length > 0 && rated.every((s) => (s.avgScore ?? 0) >= STRONG_SKILL_SCORE);
  if (items.length === 0 && allStrong) {
    items.push({
      id: "ready-to-level-up",
      severity: "good",
      icon: "trending-up",
      title: "Готов к усложнению",
      detail: `Все навыки выше ${STRONG_SKILL_SCORE}%${m.cefrLevel ? `, уровень ${m.cefrLevel}` : ""}. Дайте задание на шаг сложнее — на текущем материале рост остановился.`,
    });
  }

  // 10. Данных мало — предупреждаем, чтобы проценты не читали как диагноз.
  if (items.length === 0) {
    const totalWorks = skills.reduce((sum, s) => sum + s.count, 0);
    if (totalWorks > 0 && totalWorks < MIN_SKILL_SAMPLE) {
      items.push({
        id: "low-sample",
        severity: "info",
        icon: "help-circle",
        title: "Мало данных для выводов",
        detail: `Всего ${totalWorks} ${plural(totalWorks, "работа", "работы", "работ")}: проценты пока случайны. Назначьте ещё несколько заданий разных типов.`,
      });
    } else {
      items.push({
        id: "stable",
        severity: "good",
        icon: "check-circle",
        title: "Идёт ровно",
        detail: "Явных провалов нет, просроченных повторений мало. Держите текущий темп и добавляйте новую лексику.",
      });
    }
  }

  return items
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, MAX_FOCUS_ITEMS);
}

function truncate(value: string, max: number): string {
  const text = value.trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

// ── Расчёт метрик по навыкам ────────────────────────────────────────────────

export type GradedWork = {
  type: string | null;
  score: number | null;
  submittedAt: Date;
};

/**
 * Сколько последних работ берём в «свежее» окно при сравнении динамики.
 * Меньше трёх — шум, больше пяти — тренд размывается.
 */
export const TREND_WINDOW = 5;

/**
 * Считает статистику по каждому типу задания: средний балл за всё время и
 * динамику последних работ против предыдущих.
 *
 * Важно: сравниваем не «месяц к месяцу», а последние N работ к предыдущим N.
 * У ученика, который сдаёт задания неравномерно, календарные окна дают пустоту
 * и ложные «падения».
 */
export function computeSkillStats(works: GradedWork[]): SkillStat[] {
  return SKILL_TYPES.map((type) => {
    const rows = works
      .filter((w) => w.type === type)
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());

    if (rows.length === 0) {
      return { type, avgScore: null, count: 0, recentAvg: null, prevAvg: null, delta: null, trend: "unknown", lastAt: null };
    }

    const scores = rows.map((r) => r.score ?? 0);
    const avgScore = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);

    const recent = scores.slice(-TREND_WINDOW);
    const prev = scores.slice(Math.max(0, scores.length - TREND_WINDOW * 2), scores.length - TREND_WINDOW);

    const recentAvg = recent.length > 0 ? Math.round(recent.reduce((s, v) => s + v, 0) / recent.length) : null;
    const prevAvg = prev.length > 0 ? Math.round(prev.reduce((s, v) => s + v, 0) / prev.length) : null;
    const delta = recentAvg !== null && prevAvg !== null ? recentAvg - prevAvg : null;

    let trend: SkillStat["trend"] = "unknown";
    if (delta !== null) {
      if (delta >= SKILL_DROP_POINTS) trend = "up";
      else if (delta <= -SKILL_DROP_POINTS) trend = "down";
      else trend = "flat";
    }

    const last = rows[rows.length - 1];
    return {
      type,
      avgScore,
      count: rows.length,
      recentAvg,
      prevAvg,
      delta,
      trend,
      lastAt: last ? last.submittedAt.toISOString() : null,
    };
  });
}

/**
 * Группирует неверные ответы по тексту вопроса: одна и та же ошибка, сделанная
 * трижды, важнее трёх разных единичных промахов.
 */
export type WrongAnswer = {
  questionText: string;
  assignmentTitle: string | null;
  studentAnswer: string | null;
  correctAnswer: string | null;
  occurredAt: Date;
};

export function groupMistakes(rows: WrongAnswer[], limit = 5): MistakeStat[] {
  const byQuestion = new Map<string, MistakeStat>();

  for (const row of rows) {
    const key = row.questionText.trim().toLowerCase();
    if (!key) continue;
    const at = row.occurredAt.toISOString();
    const existing = byQuestion.get(key);
    if (!existing) {
      byQuestion.set(key, {
        questionText: row.questionText.trim(),
        assignmentTitle: row.assignmentTitle,
        count: 1,
        correctAnswer: row.correctAnswer,
        lastStudentAnswer: row.studentAnswer,
        lastAt: at,
      });
      continue;
    }
    existing.count += 1;
    // Держим самый свежий ответ ученика: по нему видно, ушла ошибка или нет.
    if (existing.lastAt === null || at > existing.lastAt) {
      existing.lastAt = at;
      existing.lastStudentAnswer = row.studentAnswer;
    }
  }

  return [...byQuestion.values()]
    .sort((a, b) => b.count - a.count || (b.lastAt ?? "").localeCompare(a.lastAt ?? ""))
    .slice(0, limit);
}
