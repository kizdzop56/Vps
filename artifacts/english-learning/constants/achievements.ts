// ─────────────────────────────────────────────────────────────────────────────
// Система наград (медали / ачивки).
//
// В приложении 73 медали, распределённые по сложности:
//   • easy   — 22 медали  — быстрые победы, ≈1–24 ч в приложении
//   • medium — 35 медалей — устойчивая активность, ≈24–80 ч
//   • hard   — 16 медалей — долгосрочное мастерство, ≈80 ч+
//
// «Часы» — приблизительная шкала сложности; фактические условия построены на
// реальных статах пользователя (AchievementStats), которые считает сервер.
// Дизайн медали зависит от `difficulty`: меняются только контур (ободок) и
// внутренний символ (easy — простой, medium — детальнее, hard — насыщенный).
//
// ── Медали рейда живут в отдельном файле ────────────────────────────────────
// Десять наград за событие рейда лежат в constants/raidAchievements.ts и
// подмешиваются в конец этого массива. Каталог и без того велик, а тема там
// одна: боссы, урон, комбо.
//
// Важно, что они именно ЗДЕСЬ, в общем массиве: витрина наград одна на весь
// профиль. Раньше у рейда был свой блок медалей во вкладке события — коллекция
// делилась надвое, общий счётчик перестал быть общим, а оформление рейдовых
// медалей было второй реализацией того же самого.
//
// ── Картинка не обязательна ─────────────────────────────────────────────────
// Поле image необязательное: витрина (components/AchievementsShowcase.tsx,
// MedalFace) рисует глиф по сложности, если рендера нет или он не загрузился.
// У медалей раздела «Учёба» и рейда рендеров пока нет — появятся, достаточно
// положить файл в assets/badges/medals и дописать строку в BADGE_IMAGES.
//
// ── id — это ещё и формула ──────────────────────────────────────────────────
// Схема `метрика_число` не косметическая: utils/achievementProgress.ts достаёт
// из id порог и по префиксу понимает, какой показатель сравнивать. Поэтому у
// новой медали id обязан быть в этой схеме, а префикс — знаком METRICS, иначе
// полоса прогресса просто не нарисуется.
//
// Исключение — медали за конкретных боссов (raidboss_golem и остальные): у них
// нет порога, потому что нет и счётчика. Полоса для них не рисуется намеренно.
//
// ВАЖНО: условия продублированы на сервере (api-server/src/routes/gamification.ts,
// ACHIEVEMENT_CONDITIONS). Клиент показывает медаль, сервер решает, записать ли
// её в базу, — и проверяет условие сам. Расхождение выглядит как «медаль
// показалась и пропала после перезахода».
// ─────────────────────────────────────────────────────────────────────────────

import { RAID_ACHIEVEMENTS, type RaidAchievementFields } from "./raidAchievements";

export type AchievementDifficulty = "easy" | "medium" | "hard";

export interface Achievement {
  id: string;
  emoji: string;
  image?: any;
  title: string;
  description: string;
  requirement: string;
  /** Уровень сложности — задаёт дизайн медали (контур + символ). */
  difficulty: AchievementDifficulty;
  color: string;
  bgColor: string;
  check: (stats: AchievementStats) => boolean;
}

// Индивидуальные изображения медалей. Ключ = id награды.
// Все рендеры лежат в assets/badges/medals и подготовлены в едином стиле
// (золотой ободок + фиолетовая сердцевина, символ на всю медаль, без надписей).
const BADGE_IMAGES: Record<string, any> = {
  // easy
  welcome:      require("../assets/badges/medals/welcome.png"),
  tasks_1:      require("../assets/badges/medals/tasks_1.png"),
  tasks_3:      require("../assets/badges/medals/tasks_3.png"),
  tasks_5:      require("../assets/badges/medals/tasks_5.png"),
  points_10:    require("../assets/badges/medals/points_10.png"),
  points_50:    require("../assets/badges/medals/points_50.png"),
  points_100:   require("../assets/badges/medals/points_100.png"),
  perfect_1:    require("../assets/badges/medals/perfect_1.png"),
  streak_3:     require("../assets/badges/medals/streak_3.png"),
  time_30:      require("../assets/badges/medals/time_30.png"),
  time_120:     require("../assets/badges/medals/time_120.png"),
  voice_1:      require("../assets/badges/medals/voice_1.png"),
  voice_3:      require("../assets/badges/medals/voice_3.png"),
  xp_5:         require("../assets/badges/medals/xp_5.png"),
  early_1:      require("../assets/badges/medals/early_1.png"),
  // medium
  tasks_10:     require("../assets/badges/medals/tasks_10.png"),
  tasks_25:     require("../assets/badges/medals/tasks_25.png"),
  tasks_50:     require("../assets/badges/medals/tasks_50.png"),
  points_500:   require("../assets/badges/medals/points_500.png"),
  points_1000:  require("../assets/badges/medals/points_1000.png"),
  points_2000:  require("../assets/badges/medals/points_2000.png"),
  perfect_5:    require("../assets/badges/medals/perfect_5.png"),
  perfect_10:   require("../assets/badges/medals/perfect_10.png"),
  streak_7:     require("../assets/badges/medals/streak_7.png"),
  streak_14:    require("../assets/badges/medals/streak_14.png"),
  streak_30:    require("../assets/badges/medals/streak_30.png"),
  time_600:     require("../assets/badges/medals/time_600.png"),
  time_1200:    require("../assets/badges/medals/time_1200.png"),
  time_1800:    require("../assets/badges/medals/time_1800.png"),
  time_2400:    require("../assets/badges/medals/time_2400.png"),
  voice_5:      require("../assets/badges/medals/voice_5.png"),
  voice_10:     require("../assets/badges/medals/voice_10.png"),
  voice_20:     require("../assets/badges/medals/voice_20.png"),
  voice_50:     require("../assets/badges/medals/voice_50.png"),
  xp_10:        require("../assets/badges/medals/xp_10.png"),
  xp_20:        require("../assets/badges/medals/xp_20.png"),
  xp_30:        require("../assets/badges/medals/xp_30.png"),
  early_5:      require("../assets/badges/medals/early_5.png"),
  early_15:     require("../assets/badges/medals/early_15.png"),
  early_30:     require("../assets/badges/medals/early_30.png"),
  // hard
  tasks_100:    require("../assets/badges/medals/tasks_100.png"),
  tasks_200:    require("../assets/badges/medals/tasks_200.png"),
  points_5000:  require("../assets/badges/medals/points_5000.png"),
  points_10000: require("../assets/badges/medals/points_10000.png"),
  time_3600:    require("../assets/badges/medals/time_3600.png"),
  time_6000:    require("../assets/badges/medals/time_6000.png"),
  streak_60:    require("../assets/badges/medals/streak_60.png"),
  streak_100:   require("../assets/badges/medals/streak_100.png"),
  perfect_25:   require("../assets/badges/medals/perfect_25.png"),
  xp_50:        require("../assets/badges/medals/xp_50.png"),
};

/**
 * Показатели ученика, по которым проверяются условия.
 *
 * Наследует поля рейда (RaidAchievementFields): они необязательные по той же
 * причине, что и показатели раздела «Учёба» — чужому профилю сервер их не
 * отдаёт.
 */
export interface AchievementStats extends RaidAchievementFields {
  completedAssignments: number;
  totalPoints: number;
  knowledgeLevel: string | null;
  totalTimeMinutes: number;
  voiceChatSessions: number;
  loginStreak: number;
  perfectScoreCount: number;
  xpLevel: number;
  earlyBirdSessions: number;

  // ── Раздел «Учёба» ──
  // Необязательные: чужому профилю сервер их не отдаёт (см. studentProfile.ts),
  // и там эти медали остаются закрытыми без полосы прогресса. Показывать «0 из
  // 100» вместо «данных нет» было бы враньём в обе стороны.
  /** Верных ответов во всех режимах раздела. */
  grammarSolved?: number;
  /** Глаголов, чьи три формы ученик знает наизусть. */
  verbFormsMastered?: number;
  /** Времён, отработанных до устойчивого результата. */
  tensesMastered?: number;
  /** Верно собранных предложений. */
  sentencesBuilt?: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ═══════════════════════════════════════════════════════════════════
  // ЛЁГКИЕ — быстрые победы, ≈1–24 ч
  // ═══════════════════════════════════════════════════════════════════

  // ─── Регистрация ───────────────────────────────────────────────
  {
    id: "welcome",
    emoji: "🎉",
    image: BADGE_IMAGES.welcome,
    title: "Старт!",
    description: "Ты создал аккаунт и сделал первый шаг в изучении английского. Добро пожаловать!",
    requirement: "Зарегистрируйся в приложении — эта награда выдаётся автоматически всем.",
    difficulty: "easy",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: () => true,
  },

  // ─── Задания (лёгкие) ──────────────────────────────────────────
  {
    id: "tasks_1",
    emoji: "👣",
    image: BADGE_IMAGES.tasks_1,
    title: "Первый шаг",
    description: "Ты выполнил своё первое задание — это лучшее начало пути!",
    requirement: "Выполни хотя бы 1 задание от учителя.",
    difficulty: "easy",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
    check: ({ completedAssignments }) => completedAssignments >= 1,
  },
  {
    id: "tasks_3",
    emoji: "📚",
    image: BADGE_IMAGES.tasks_3,
    title: "Втягиваюсь",
    description: "Три выполненных задания — ты уверенно втягиваешься в учёбу!",
    requirement: "Выполни 3 задания суммарно.",
    difficulty: "easy",
    color: "#9333ea",
    bgColor: "#f3e8ff",
    check: ({ completedAssignments }) => completedAssignments >= 3,
  },
  {
    id: "tasks_5",
    emoji: "📖",
    image: BADGE_IMAGES.tasks_5,
    title: "Любитель знаний",
    description: "Ты выполнил 5 заданий — настоящий любитель знаний!",
    requirement: "Выполни 5 заданий суммарно.",
    difficulty: "easy",
    color: "#9333ea",
    bgColor: "#f3e8ff",
    check: ({ completedAssignments }) => completedAssignments >= 5,
  },

  // ─── Очки (лёгкие) ─────────────────────────────────────────────
  {
    id: "points_10",
    emoji: "⭐",
    image: BADGE_IMAGES.points_10,
    title: "Первые очки",
    description: "Ты заработал свои первые 10 очков — начало положено!",
    requirement: "Набери 10 очков, выполняя задания.",
    difficulty: "easy",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ totalPoints }) => totalPoints >= 10,
  },
  {
    id: "points_50",
    emoji: "✨",
    image: BADGE_IMAGES.points_50,
    title: "Полсотни",
    description: "50 очков в копилке — ты набираешь обороты!",
    requirement: "Набери 50 очков суммарно.",
    difficulty: "easy",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ totalPoints }) => totalPoints >= 50,
  },
  {
    id: "points_100",
    emoji: "🌟",
    image: BADGE_IMAGES.points_100,
    title: "Коллекционер очков",
    description: "100 очков в копилке — ты собираешь их как настоящий коллекционер!",
    requirement: "Набери 100 очков суммарно.",
    difficulty: "easy",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ totalPoints }) => totalPoints >= 100,
  },

  // ─── Идеальный результат (лёгкий) ──────────────────────────────
  {
    id: "perfect_1",
    emoji: "💯",
    image: BADGE_IMAGES.perfect_1,
    title: "Идеально!",
    description: "Ты получил 100% в задании — безупречный результат!",
    requirement: "Получи 100% в любом задании хотя бы 1 раз.",
    difficulty: "easy",
    color: "#7c3aed",
    bgColor: "#ede9fe",
    check: ({ perfectScoreCount }) => perfectScoreCount >= 1,
  },

  // ─── Стрик (лёгкий) ────────────────────────────────────────────
  {
    id: "streak_3",
    emoji: "🔥",
    image: BADGE_IMAGES.streak_3,
    title: "Огонь!",
    description: "3 дня подряд в приложении — ты горишь желанием учиться!",
    requirement: "Заходи в приложение 3 дня подряд.",
    difficulty: "easy",
    color: "#d946ef",
    bgColor: "#fae8ff",
    check: ({ loginStreak }) => loginStreak >= 3,
  },

  // ─── Время (лёгкое) ────────────────────────────────────────────
  {
    id: "time_30",
    emoji: "⏱️",
    image: BADGE_IMAGES.time_30,
    title: "Начало пути",
    description: "30 минут в приложении — путь в тысячу миль начинается с одного шага!",
    requirement: "Проведи в приложении суммарно 30 минут.",
    difficulty: "easy",
    color: "#6366f1",
    bgColor: "#ede9fe",
    check: ({ totalTimeMinutes }) => totalTimeMinutes >= 30,
  },
  {
    id: "time_120",
    emoji: "⏰",
    image: BADGE_IMAGES.time_120,
    title: "Усердный ученик",
    description: "2 часа учёбы — ты усерден и целеустремлён!",
    requirement: "Проведи в приложении суммарно 2 часа (120 минут).",
    difficulty: "easy",
    color: "#6366f1",
    bgColor: "#ede9fe",
    check: ({ totalTimeMinutes }) => totalTimeMinutes >= 120,
  },

  // ─── Голосовой чат (лёгкий) ────────────────────────────────────
  {
    id: "voice_1",
    emoji: "🎤",
    image: BADGE_IMAGES.voice_1,
    title: "Первый диалог",
    description: "Ты провёл первый разговор с AI-тьютором — смелость похвальна!",
    requirement: "Проведи хотя бы 1 разговор с AI-тьютором.",
    difficulty: "easy",
    color: "#ec4899",
    bgColor: "#fce7f3",
    check: ({ voiceChatSessions }) => voiceChatSessions >= 1,
  },
  {
    id: "voice_3",
    emoji: "💬",
    image: BADGE_IMAGES.voice_3,
    title: "Разговорчивый",
    description: "3 голосовых разговора — общение даётся тебе всё легче!",
    requirement: "Проведи 3 разговора с AI-тьютором.",
    difficulty: "easy",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ voiceChatSessions }) => voiceChatSessions >= 3,
  },

  // ─── XP-уровень (лёгкий) ───────────────────────────────────────
  {
    id: "xp_5",
    emoji: "🌟",
    image: BADGE_IMAGES.xp_5,
    title: "Уровень 5",
    description: "Ты достиг 5 уровня опыта — отличный старт!",
    requirement: "Набирай XP, выполняя задания и заходя каждый день — достигни 5 уровня.",
    difficulty: "easy",
    color: "#4f46e5",
    bgColor: "#e0e7ff",
    check: ({ xpLevel }) => xpLevel >= 5,
  },

  // ─── Ранняя пташка (лёгкая) ────────────────────────────────────
  {
    id: "early_1",
    emoji: "🐦",
    image: BADGE_IMAGES.early_1,
    title: "Ранняя пташка",
    description: "Ты позанимался до 9 утра — ранние птицы добиваются большего!",
    requirement: "Хотя бы 1 раз зайди в приложение и поучись до 9:00 утра.",
    difficulty: "easy",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ earlyBirdSessions }) => earlyBirdSessions >= 1,
  },

  // ─── Раздел «Учёба» (лёгкие) ───────────────────────────────────
  {
    id: "grammar_10",
    emoji: "✏️",
    title: "Грамматика на старте",
    description: "10 верных ответов в разделе «Учёба» — правила начинают складываться!",
    requirement: "Ответь верно 10 раз в любом режиме раздела «Учёба»: слова, формы, времена или сборка предложений.",
    difficulty: "easy",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
    check: ({ grammarSolved }) => (grammarSolved ?? 0) >= 10,
  },
  {
    id: "forms_5",
    emoji: "🔁",
    title: "Пять глаголов",
    description: "Формы пяти неправильных глаголов ты знаешь наизусть — по ним вопросы идут уже письмом.",
    requirement: "Выучи три формы у 5 неправильных глаголов в режиме «Формы глаголов».",
    difficulty: "easy",
    color: "#f59e0b",
    bgColor: "#fef3c7",
    check: ({ verbFormsMastered }) => (verbFormsMastered ?? 0) >= 5,
  },
  {
    id: "phrases_10",
    emoji: "🧩",
    title: "Первые фразы",
    description: "10 предложений собрано правильно — порядок слов в английском начинает слушаться.",
    requirement: "Собери верно 10 предложений в режиме «Собери предложение».",
    difficulty: "easy",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    check: ({ sentencesBuilt }) => (sentencesBuilt ?? 0) >= 10,
  },
  {
    id: "tenses_1",
    emoji: "🕐",
    title: "Первое время",
    description: "Одно время английского отработано как следует: и утверждение, и отрицание, и вопрос.",
    requirement: "Ответь верно 24 раза по одному времени в режиме «Времена» — это два полных захода.",
    difficulty: "easy",
    color: "#d946ef",
    bgColor: "#fae8ff",
    check: ({ tensesMastered }) => (tensesMastered ?? 0) >= 1,
  },

  // ═══════════════════════════════════════════════════════════════════
  // СРЕДНИЕ — устойчивая активность, ≈24–80 ч
  // ═══════════════════════════════════════════════════════════════════

  // ─── Задания (средние) ─────────────────────────────────────────
  {
    id: "tasks_10",
    emoji: "🏆",
    image: BADGE_IMAGES.tasks_10,
    title: "Отличник",
    description: "Целых 10 выполненных заданий — ты настоящий отличник!",
    requirement: "Выполни 10 заданий суммарно.",
    difficulty: "medium",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ completedAssignments }) => completedAssignments >= 10,
  },
  {
    id: "tasks_25",
    emoji: "💎",
    image: BADGE_IMAGES.tasks_25,
    title: "Мастер заданий",
    description: "25 заданий позади — ты настоящий мастер учёбы!",
    requirement: "Выполни 25 заданий суммарно.",
    difficulty: "medium",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
    check: ({ completedAssignments }) => completedAssignments >= 25,
  },
  {
    id: "tasks_50",
    emoji: "🚀",
    image: BADGE_IMAGES.tasks_50,
    title: "Покоритель высот",
    description: "50 заданий! Ты покоряешь академические вершины!",
    requirement: "Выполни 50 заданий суммарно.",
    difficulty: "medium",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    check: ({ completedAssignments }) => completedAssignments >= 50,
  },

  // ─── Очки (средние) ────────────────────────────────────────────
  {
    id: "points_500",
    emoji: "💫",
    image: BADGE_IMAGES.points_500,
    title: "Звёздный ученик",
    description: "500 очков! Ты сияешь как звезда на небосводе знаний.",
    requirement: "Набери 500 очков суммарно.",
    difficulty: "medium",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ totalPoints }) => totalPoints >= 500,
  },
  {
    id: "points_1000",
    emoji: "💰",
    image: BADGE_IMAGES.points_1000,
    title: "Богатый опытом",
    description: "1000 очков — ты богат опытом и знаниями!",
    requirement: "Набери 1 000 очков суммарно.",
    difficulty: "medium",
    color: "#c026d3",
    bgColor: "#f5d0fe",
    check: ({ totalPoints }) => totalPoints >= 1000,
  },
  {
    id: "points_2000",
    emoji: "👑",
    image: BADGE_IMAGES.points_2000,
    title: "Царь очков",
    description: "2000 очков — ты правишь бал в мире знаний!",
    requirement: "Набери 2 000 очков суммарно.",
    difficulty: "medium",
    color: "#d946ef",
    bgColor: "#fae8ff",
    check: ({ totalPoints }) => totalPoints >= 2000,
  },

  // ─── Идеальные результаты (средние) ────────────────────────────
  {
    id: "perfect_5",
    emoji: "🎯",
    image: BADGE_IMAGES.perfect_5,
    title: "5 идеальных тестов",
    description: "Пять раз идеальный результат — ты невероятно точен!",
    requirement: "Получи 100% в заданиях 5 раз.",
    difficulty: "medium",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    check: ({ perfectScoreCount }) => perfectScoreCount >= 5,
  },
  {
    id: "perfect_10",
    emoji: "🏅",
    image: BADGE_IMAGES.perfect_10,
    title: "Перфекционист",
    description: "10 идеальных тестов — ты настоящий перфекционист!",
    requirement: "Получи 100% в заданиях 10 раз.",
    difficulty: "medium",
    color: "#db2777",
    bgColor: "#fce7f3",
    check: ({ perfectScoreCount }) => perfectScoreCount >= 10,
  },

  // ─── Стрики (средние) ──────────────────────────────────────────
  {
    id: "streak_7",
    emoji: "⚡",
    image: BADGE_IMAGES.streak_7,
    title: "Неделя без пауз",
    description: "7 дней без единого пропуска — железная дисциплина!",
    requirement: "Заходи в приложение 7 дней подряд без перерыва.",
    difficulty: "medium",
    color: "#c026d3",
    bgColor: "#f5d0fe",
    check: ({ loginStreak }) => loginStreak >= 7,
  },
  {
    id: "streak_14",
    emoji: "📅",
    image: BADGE_IMAGES.streak_14,
    title: "Две недели подряд",
    description: "14 дней без пропусков — привычка учиться закрепилась!",
    requirement: "Заходи в приложение 14 дней подряд без перерыва.",
    difficulty: "medium",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ loginStreak }) => loginStreak >= 14,
  },
  {
    id: "streak_30",
    emoji: "🔥",
    image: BADGE_IMAGES.streak_30,
    title: "Месяц силы",
    description: "30 дней подряд — невероятная сила воли и преданность учёбе!",
    requirement: "Заходи в приложение 30 дней подряд без перерыва.",
    difficulty: "medium",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ loginStreak }) => loginStreak >= 30,
  },

  // ─── Время (среднее) ───────────────────────────────────────────
  {
    id: "time_600",
    emoji: "🕰️",
    image: BADGE_IMAGES.time_600,
    title: "Марафонец",
    description: "10 часов в приложении — ты настоящий марафонец знаний!",
    requirement: "Проведи в приложении суммарно 10 часов (600 минут).",
    difficulty: "medium",
    color: "#6366f1",
    bgColor: "#ede9fe",
    check: ({ totalTimeMinutes }) => totalTimeMinutes >= 600,
  },
  {
    id: "time_1200",
    emoji: "🦾",
    image: BADGE_IMAGES.time_1200,
    title: "Неутомимый",
    description: "20 часов учёбы — ты неутомимый ученик, который никогда не сдаётся!",
    requirement: "Проведи в приложении суммарно 20 часов (1200 минут).",
    difficulty: "medium",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    check: ({ totalTimeMinutes }) => totalTimeMinutes >= 1200,
  },
  {
    id: "time_1800",
    emoji: "⏳",
    image: BADGE_IMAGES.time_1800,
    title: "Тридцать часов",
    description: "30 часов в приложении — твоё упорство впечатляет!",
    requirement: "Проведи в приложении суммарно 30 часов (1800 минут).",
    difficulty: "medium",
    color: "#6366f1",
    bgColor: "#ede9fe",
    check: ({ totalTimeMinutes }) => totalTimeMinutes >= 1800,
  },
  {
    id: "time_2400",
    emoji: "⌛",
    image: BADGE_IMAGES.time_2400,
    title: "Сорок часов",
    description: "40 часов учёбы — это уровень настоящего профи!",
    requirement: "Проведи в приложении суммарно 40 часов (2400 минут).",
    difficulty: "medium",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    check: ({ totalTimeMinutes }) => totalTimeMinutes >= 2400,
  },

  // ─── Голосовой чат (средний) ───────────────────────────────────
  {
    id: "voice_5",
    emoji: "🗣️",
    image: BADGE_IMAGES.voice_5,
    title: "Болтун",
    description: "5 голосовых разговоров — ты уже настоящий болтун на английском!",
    requirement: "Проведи 5 разговоров с AI-тьютором.",
    difficulty: "medium",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ voiceChatSessions }) => voiceChatSessions >= 5,
  },
  {
    id: "voice_10",
    emoji: "🎙️",
    image: BADGE_IMAGES.voice_10,
    title: "Оратор",
    description: "10 голосовых сессий — ты говоришь как настоящий оратор!",
    requirement: "Проведи 10 разговоров с AI-тьютором.",
    difficulty: "medium",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
    check: ({ voiceChatSessions }) => voiceChatSessions >= 10,
  },
  {
    id: "voice_20",
    emoji: "📢",
    image: BADGE_IMAGES.voice_20,
    title: "Мастер речи",
    description: "20 голосовых сессий — твоя разговорная практика на высоте!",
    requirement: "Проведи 20 разговоров с AI-тьютором.",
    difficulty: "medium",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
    check: ({ voiceChatSessions }) => voiceChatSessions >= 20,
  },
  {
    id: "voice_50",
    emoji: "🎧",
    image: BADGE_IMAGES.voice_50,
    title: "Голос платформы",
    description: "50 голосовых сессий — ты один из самых активных собеседников!",
    requirement: "Проведи 50 разговоров с AI-тьютором.",
    difficulty: "medium",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ voiceChatSessions }) => voiceChatSessions >= 50,
  },

  // ─── XP-уровни (средние) ───────────────────────────────────────
  {
    id: "xp_10",
    emoji: "🏅",
    image: BADGE_IMAGES.xp_10,
    title: "Уровень 10",
    description: "10 уровень опыта — ты в первых рядах!",
    requirement: "Продолжай учиться и достигни 10 уровня XP.",
    difficulty: "medium",
    color: "#ec4899",
    bgColor: "#fce7f3",
    check: ({ xpLevel }) => xpLevel >= 10,
  },
  {
    id: "xp_20",
    emoji: "💎",
    image: BADGE_IMAGES.xp_20,
    title: "Уровень 20",
    description: "20 уровень — ты уже опытный мастер нашей платформы!",
    requirement: "Достигни 20 уровня XP.",
    difficulty: "medium",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
    check: ({ xpLevel }) => xpLevel >= 20,
  },
  {
    id: "xp_30",
    emoji: "🌠",
    image: BADGE_IMAGES.xp_30,
    title: "Уровень 30",
    description: "30 уровень опыта — до вершины уже рукой подать!",
    requirement: "Достигни 30 уровня XP.",
    difficulty: "medium",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
    check: ({ xpLevel }) => xpLevel >= 30,
  },

  // ─── Ранняя пташка (средняя) ───────────────────────────────────
  {
    id: "early_5",
    emoji: "🌅",
    image: BADGE_IMAGES.early_5,
    title: "Жаворонок",
    description: "5 утренних занятий до 9 утра — ты настоящий жаворонок!",
    requirement: "Занимайся в приложении до 9:00 утра 5 раз.",
    difficulty: "medium",
    color: "#d946ef",
    bgColor: "#fae8ff",
    check: ({ earlyBirdSessions }) => earlyBirdSessions >= 5,
  },
  {
    id: "early_15",
    emoji: "☀️",
    image: BADGE_IMAGES.early_15,
    title: "Утренний чемпион",
    description: "15 утренних занятий — рассвет застаёт тебя за учёбой!",
    requirement: "Занимайся в приложении до 9:00 утра 15 раз.",
    difficulty: "medium",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ earlyBirdSessions }) => earlyBirdSessions >= 15,
  },
  {
    id: "early_30",
    emoji: "🌄",
    image: BADGE_IMAGES.early_30,
    title: "Хозяин рассвета",
    description: "30 утренних занятий — раннее утро принадлежит тебе!",
    requirement: "Занимайся в приложении до 9:00 утра 30 раз.",
    difficulty: "medium",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ earlyBirdSessions }) => earlyBirdSessions >= 30,
  },

  // ─── Раздел «Учёба» (средние) ──────────────────────────────────
  {
    id: "grammar_100",
    emoji: "📐",
    title: "Сто верных",
    description: "100 верных ответов по грамматике — правила уже не приходится вспоминать по одному.",
    requirement: "Ответь верно 100 раз в разделе «Учёба».",
    difficulty: "medium",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
    check: ({ grammarSolved }) => (grammarSolved ?? 0) >= 100,
  },
  {
    id: "grammar_500",
    emoji: "📘",
    title: "Полтысячи правил",
    description: "500 верных ответов. Грамматика перестала быть препятствием и стала инструментом.",
    requirement: "Ответь верно 500 раз в разделе «Учёба».",
    difficulty: "medium",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    check: ({ grammarSolved }) => (grammarSolved ?? 0) >= 500,
  },
  {
    id: "forms_25",
    emoji: "📗",
    title: "Четверть таблицы",
    description: "25 неправильных глаголов выучены целиком — это уже основа разговорной речи.",
    requirement: "Выучи три формы у 25 неправильных глаголов.",
    difficulty: "medium",
    color: "#f59e0b",
    bgColor: "#fef3c7",
    check: ({ verbFormsMastered }) => (verbFormsMastered ?? 0) >= 25,
  },
  {
    id: "forms_60",
    emoji: "📙",
    title: "Больше половины",
    description: "60 неправильных глаголов! Таблица в конце учебника тебе больше почти не нужна.",
    requirement: "Выучи три формы у 60 неправильных глаголов.",
    difficulty: "medium",
    color: "#d97706",
    bgColor: "#fef3c7",
    check: ({ verbFormsMastered }) => (verbFormsMastered ?? 0) >= 60,
  },
  {
    id: "phrases_100",
    emoji: "🧱",
    title: "Сто предложений",
    description: "100 собранных фраз — порядок слов в английском ты чувствуешь без правил.",
    requirement: "Собери верно 100 предложений в режиме «Собери предложение».",
    difficulty: "medium",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    check: ({ sentencesBuilt }) => (sentencesBuilt ?? 0) >= 100,
  },
  {
    id: "tenses_3",
    emoji: "⌚",
    title: "Три времени",
    description: "Три времени английского отработаны как следует — прошлое, настоящее и будущее слушаются.",
    requirement: "Отработай по 24 верных ответа в трёх разных временах.",
    difficulty: "medium",
    color: "#d946ef",
    bgColor: "#fae8ff",
    check: ({ tensesMastered }) => (tensesMastered ?? 0) >= 3,
  },

  // ═══════════════════════════════════════════════════════════════════
  // СЛОЖНЫЕ — долгосрочное мастерство, ≈80 ч+
  // ═══════════════════════════════════════════════════════════════════

  // ─── Задания (сложные) ─────────────────────────────────────────
  {
    id: "tasks_100",
    emoji: "🌟",
    image: BADGE_IMAGES.tasks_100,
    title: "Легенда учёбы",
    description: "100 заданий! Ты — настоящая легенда нашей платформы!",
    requirement: "Выполни 100 заданий суммарно.",
    difficulty: "hard",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ completedAssignments }) => completedAssignments >= 100,
  },
  {
    id: "tasks_200",
    emoji: "🛡️",
    image: BADGE_IMAGES.tasks_200,
    title: "Титан знаний",
    description: "200 заданий позади — твоей выносливости позавидует каждый!",
    requirement: "Выполни 200 заданий суммарно.",
    difficulty: "hard",
    color: "#6d28d9",
    bgColor: "#ede9fe",
    check: ({ completedAssignments }) => completedAssignments >= 200,
  },

  // ─── Очки (сложные) ────────────────────────────────────────────
  {
    id: "points_5000",
    emoji: "💎",
    image: BADGE_IMAGES.points_5000,
    title: "Бриллиантовый ученик",
    description: "5000 очков! Ты бриллиант среди учеников!",
    requirement: "Набери 5 000 очков суммарно.",
    difficulty: "hard",
    color: "#4f46e5",
    bgColor: "#e0e7ff",
    check: ({ totalPoints }) => totalPoints >= 5000,
  },
  {
    id: "points_10000",
    emoji: "🏆",
    image: BADGE_IMAGES.points_10000,
    title: "Легенда очков",
    description: "10 000 очков — эта вершина покоряется единицам. Ты среди них!",
    requirement: "Набери 10 000 очков суммарно.",
    difficulty: "hard",
    color: "#4338ca",
    bgColor: "#e0e7ff",
    check: ({ totalPoints }) => totalPoints >= 10000,
  },

  // ─── Время (сложное) ───────────────────────────────────────────
  {
    id: "time_3600",
    emoji: "⏲️",
    image: BADGE_IMAGES.time_3600,
    title: "Повелитель времени",
    description: "60 часов в приложении — время работает на тебя!",
    requirement: "Проведи в приложении суммарно 60 часов (3600 минут).",
    difficulty: "hard",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    check: ({ totalTimeMinutes }) => totalTimeMinutes >= 3600,
  },
  {
    id: "time_6000",
    emoji: "♾️",
    image: BADGE_IMAGES.time_6000,
    title: "Вечный ученик",
    description: "100 часов учёбы — твоя жажда знаний поистине безгранична!",
    requirement: "Проведи в приложении суммарно 100 часов (6000 минут).",
    difficulty: "hard",
    color: "#4f46e5",
    bgColor: "#e0e7ff",
    check: ({ totalTimeMinutes }) => totalTimeMinutes >= 6000,
  },

  // ─── Стрики (сложные) ──────────────────────────────────────────
  {
    id: "streak_60",
    emoji: "🔥",
    image: BADGE_IMAGES.streak_60,
    title: "Два месяца силы",
    description: "60 дней подряд — твоей дисциплине можно только аплодировать!",
    requirement: "Заходи в приложение 60 дней подряд без перерыва.",
    difficulty: "hard",
    color: "#c026d3",
    bgColor: "#f5d0fe",
    check: ({ loginStreak }) => loginStreak >= 60,
  },
  {
    id: "streak_100",
    emoji: "🦅",
    image: BADGE_IMAGES.streak_100,
    title: "Несокрушимый",
    description: "100 дней подряд! Ты возрождаешься каждый день как феникс — ничто тебя не остановит!",
    requirement: "Заходи в приложение 100 дней подряд без перерыва.",
    difficulty: "hard",
    color: "#a21caf",
    bgColor: "#f5d0fe",
    check: ({ loginStreak }) => loginStreak >= 100,
  },

  // ─── Идеальные результаты (сложные) ────────────────────────────
  {
    id: "perfect_25",
    emoji: "🎯",
    image: BADGE_IMAGES.perfect_25,
    title: "Абсолютный перфекционист",
    description: "25 идеальных результатов — безупречность стала твоим стилем!",
    requirement: "Получи 100% в заданиях 25 раз.",
    difficulty: "hard",
    color: "#db2777",
    bgColor: "#fce7f3",
    check: ({ perfectScoreCount }) => perfectScoreCount >= 25,
  },

  // ─── XP-уровень (максимальный) ─────────────────────────────────
  {
    id: "xp_50",
    emoji: "👑",
    image: BADGE_IMAGES.xp_50,
    title: "Бог знаний",
    description: "Максимальный 50 уровень! Ты достиг вершины — ты бог знаний!",
    requirement: "Достигни максимального 50 уровня XP.",
    difficulty: "hard",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ xpLevel }) => xpLevel >= 50,
  },

  // ─── Раздел «Учёба» (сложные) ──────────────────────────────────
  {
    id: "grammar_2000",
    emoji: "🧠",
    title: "Мастер грамматики",
    description: "2000 верных ответов по грамматике. Столько не решают случайно — это годы привычки заниматься.",
    requirement: "Ответь верно 2 000 раз в разделе «Учёба».",
    difficulty: "hard",
    color: "#6d28d9",
    bgColor: "#ede9fe",
    check: ({ grammarSolved }) => (grammarSolved ?? 0) >= 2000,
  },
  {
    id: "forms_100",
    emoji: "📚",
    title: "Вся таблица глаголов",
    description: "100 неправильных глаголов выучены целиком. Та самая таблица, которую все зубрят и никто не доучивает.",
    requirement: "Выучи три формы у 100 неправильных глаголов.",
    difficulty: "hard",
    color: "#b45309",
    bgColor: "#fef3c7",
    check: ({ verbFormsMastered }) => (verbFormsMastered ?? 0) >= 100,
  },
  {
    id: "tenses_6",
    emoji: "🕰️",
    title: "Все времена",
    description: "Все шесть времён отработаны: утверждение, отрицание и вопрос в каждом. Английское время тебе больше не страшно.",
    requirement: "Отработай по 24 верных ответа в каждом из шести времён.",
    difficulty: "hard",
    color: "#a21caf",
    bgColor: "#f5d0fe",
    check: ({ tensesMastered }) => (tensesMastered ?? 0) >= 6,
  },

  // ═══════════════════════════════════════════════════════════════════
  // РЕЙД — событие недели: боссы, урон, комбо
  // Каталог живёт в constants/raidAchievements.ts (см. шапку файла).
  // ═══════════════════════════════════════════════════════════════════
  ...RAID_ACHIEVEMENTS,
];

export function getUnlockedAchievements(stats: AchievementStats): Achievement[] {
  return ACHIEVEMENTS.filter((a) => a.check(stats));
}

export function getLockedAchievements(stats: AchievementStats): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !a.check(stats));
}
