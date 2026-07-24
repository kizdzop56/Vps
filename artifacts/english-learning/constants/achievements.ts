export interface Achievement {
  id: string;
  emoji: string;
  image?: any;
  title: string;
  description: string;
  requirement: string;
  color: string;
  bgColor: string;
  check: (stats: AchievementStats) => boolean;
}

const BADGE_IMAGES = {
  start:           require("../assets/badges/start.jpeg"),
  firstStep:       require("../assets/badges/first-step.jpeg"),
  firstPoints:     require("../assets/badges/first-points.jpeg"),
  loverOfKnowledge:require("../assets/badges/lover-of-knowledge.jpeg"),
  champion:        require("../assets/badges/champion.png"),
  scholar:         require("../assets/badges/scholar.png"),
  streak:          require("../assets/badges/streak.png"),
  lightning:       require("../assets/badges/lightning.png"),
  voice:           require("../assets/badges/voice.png"),
  master:          require("../assets/badges/master.png"),
  perfect:         require("../assets/badges/perfect.png"),
  time:            require("../assets/badges/time.png"),
  diamond:         require("../assets/badges/diamond.png"),
  earlyBird:       require("../assets/badges/early-bird.png"),
};

export interface AchievementStats {
  completedAssignments: number;
  totalPoints: number;
  knowledgeLevel: string | null;
  totalTimeMinutes: number;
  voiceChatSessions: number;
  loginStreak: number;
  perfectScoreCount: number;
  xpLevel: number;
  earlyBirdSessions: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ─── Регистрация ───────────────────────────────────────────────
  {
    id: "welcome",
    emoji: "🎉",
    image: BADGE_IMAGES.start,
    title: "Старт!",
    description: "Ты создал аккаунт и сделал первый шаг в изучении английского. Добро пожаловать!",
    requirement: "Зарегистрируйся в приложении — эта награда выдаётся автоматически всем.",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: () => true,
  },

  // ─── Задания ───────────────────────────────────────────────────
  {
    id: "first_task",
    emoji: "👣",
    image: BADGE_IMAGES.firstStep,
    title: "Первый шаг",
    description: "Ты выполнил своё первое задание — это лучшее начало пути!",
    requirement: "Выполни хотя бы 1 задание от учителя.",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
    check: ({ completedAssignments }) => completedAssignments >= 1,
  },
  {
    id: "five_tasks",
    emoji: "📖",
    image: BADGE_IMAGES.loverOfKnowledge,
    title: "Любитель знаний",
    description: "Ты выполнил 5 заданий — настоящий любитель знаний!",
    requirement: "Выполни 5 заданий суммарно.",
    color: "#9333ea",
    bgColor: "#f3e8ff",
    check: ({ completedAssignments }) => completedAssignments >= 5,
  },
  {
    id: "ten_tasks",
    emoji: "🏆",
    image: BADGE_IMAGES.champion,
    title: "Отличник",
    description: "Целых 10 выполненных заданий — ты настоящий отличник!",
    requirement: "Выполни 10 заданий суммарно.",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ completedAssignments }) => completedAssignments >= 10,
  },
  {
    id: "twenty_five_tasks",
    emoji: "💎",
    image: BADGE_IMAGES.master,
    title: "Мастер заданий",
    description: "25 заданий позади — ты настоящий мастер учёбы!",
    requirement: "Выполни 25 заданий суммарно.",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
    check: ({ completedAssignments }) => completedAssignments >= 25,
  },
  {
    id: "fifty_tasks",
    emoji: "🚀",
    image: BADGE_IMAGES.scholar,
    title: "Покоритель высот",
    description: "50 заданий! Ты покоряешь академические вершины!",
    requirement: "Выполни 50 заданий суммарно.",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    check: ({ completedAssignments }) => completedAssignments >= 50,
  },
  {
    id: "hundred_tasks",
    emoji: "🌟",
    image: BADGE_IMAGES.diamond,
    title: "Легенда учёбы",
    description: "100 заданий! Ты — настоящая легенда нашей платформы!",
    requirement: "Выполни 100 заданий суммарно.",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ completedAssignments }) => completedAssignments >= 100,
  },

  // ─── Идеальные результаты ──────────────────────────────────────
  {
    id: "perfect_test",
    emoji: "💯",
    image: BADGE_IMAGES.perfect,
    title: "Идеально!",
    description: "Ты получил 100% в задании — безупречный результат!",
    requirement: "Получи 100% в любом задании хотя бы 1 раз.",
    color: "#7c3aed",
    bgColor: "#ede9fe",
    check: ({ perfectScoreCount }) => perfectScoreCount >= 1,
  },
  {
    id: "five_perfect",
    emoji: "🎯",
    image: BADGE_IMAGES.perfect,
    title: "5 идеальных тестов",
    description: "Пять раз подряд идеальный результат — ты невероятно точен!",
    requirement: "Получи 100% в заданиях 5 раз.",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    check: ({ perfectScoreCount }) => perfectScoreCount >= 5,
  },
  {
    id: "ten_perfect",
    emoji: "🏅",
    image: BADGE_IMAGES.perfect,
    title: "Перфекционист",
    description: "10 идеальных тестов — ты настоящий перфекционист!",
    requirement: "Получи 100% в заданиях 10 раз.",
    color: "#db2777",
    bgColor: "#fce7f3",
    check: ({ perfectScoreCount }) => perfectScoreCount >= 10,
  },

  // ─── Очки ──────────────────────────────────────────────────────
  {
    id: "points_10",
    emoji: "⭐",
    image: BADGE_IMAGES.firstPoints,
    title: "Первые очки",
    description: "Ты заработал свои первые 10 очков — начало положено!",
    requirement: "Набери 10 очков, выполняя задания.",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ totalPoints }) => totalPoints >= 10,
  },
  {
    id: "points_100",
    emoji: "🌟",
    title: "Коллекционер очков",
    description: "100 очков в копилке — ты собираешь их как настоящий коллекционер!",
    requirement: "Набери 100 очков суммарно.",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ totalPoints }) => totalPoints >= 100,
  },
  {
    id: "points_500",
    emoji: "💫",
    title: "Звёздный ученик",
    description: "500 очков! Ты сияешь как звезда на небосводе знаний.",
    requirement: "Набери 500 очков суммарно.",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ totalPoints }) => totalPoints >= 500,
  },
  {
    id: "points_1000",
    emoji: "💰",
    title: "Богатый опытом",
    description: "1000 очков — ты богат опытом и знаниями!",
    requirement: "Набери 1 000 очков суммарно.",
    color: "#c026d3",
    bgColor: "#f5d0fe",
    check: ({ totalPoints }) => totalPoints >= 1000,
  },
  {
    id: "points_2000",
    emoji: "👑",
    title: "Царь очков",
    description: "2000 очков — ты правишь бал в мире знаний!",
    requirement: "Набери 2 000 очков суммарно.",
    color: "#d946ef",
    bgColor: "#fae8ff",
    check: ({ totalPoints }) => totalPoints >= 2000,
  },
  {
    id: "points_5000",
    emoji: "💎",
    title: "Бриллиантовый ученик",
    description: "5000 очков! Ты бриллиант среди учеников!",
    requirement: "Набери 5 000 очков суммарно.",
    color: "#4f46e5",
    bgColor: "#e0e7ff",
    check: ({ totalPoints }) => totalPoints >= 5000,
  },

  // ─── Стрики ────────────────────────────────────────────────────
  {
    id: "streak_3",
    emoji: "🔥",
    image: BADGE_IMAGES.streak,
    title: "Огонь!",
    description: "3 дня подряд в приложении — ты горишь желанием учиться!",
    requirement: "Заходи в приложение 3 дня подряд.",
    color: "#d946ef",
    bgColor: "#fae8ff",
    check: ({ loginStreak }) => loginStreak >= 3,
  },
  {
    id: "streak_7",
    emoji: "⚡",
    image: BADGE_IMAGES.lightning,
    title: "Неделя без пауз",
    description: "7 дней без единого пропуска — железная дисциплина!",
    requirement: "Заходи в приложение 7 дней подряд без перерыва.",
    color: "#c026d3",
    bgColor: "#f5d0fe",
    check: ({ loginStreak }) => loginStreak >= 7,
  },
  {
    id: "streak_30",
    emoji: "🏆",
    image: BADGE_IMAGES.champion,
    title: "Месяц силы",
    description: "30 дней подряд — невероятная сила воли и преданность учёбе!",
    requirement: "Заходи в приложение 30 дней подряд без перерыва.",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ loginStreak }) => loginStreak >= 30,
  },

  // ─── Ранняя пташка ────────────────────────────────────────────
  {
    id: "early_bird",
    emoji: "🐦",
    image: BADGE_IMAGES.earlyBird,
    title: "Ранняя пташка",
    description: "Ты позанимался до 9 утра — ранние птицы добиваются большего!",
    requirement: "Хотя бы 1 раз зайди в приложение и поучись до 9:00 утра.",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ earlyBirdSessions }) => earlyBirdSessions >= 1,
  },
  {
    id: "early_bird_5",
    emoji: "🌅",
    image: BADGE_IMAGES.earlyBird,
    title: "Жаворонок",
    description: "5 утренних занятий до 9 утра — ты настоящий жаворонок!",
    requirement: "Занимайся в приложении до 9:00 утра 5 раз.",
    color: "#d946ef",
    bgColor: "#fae8ff",
    check: ({ earlyBirdSessions }) => earlyBirdSessions >= 5,
  },

  // ─── Голосовой чат ─────────────────────────────────────────────
  {
    id: "voice_first",
    emoji: "🎤",
    image: BADGE_IMAGES.voice,
    title: "Первый диалог",
    description: "Ты провёл первый разговор с AI-тьютором — смелость похвальна!",
    requirement: "Проведи хотя бы 1 разговор с AI-тьютором.",
    color: "#ec4899",
    bgColor: "#fce7f3",
    check: ({ voiceChatSessions }) => voiceChatSessions >= 1,
  },
  {
    id: "voice_5",
    emoji: "🗣️",
    image: BADGE_IMAGES.voice,
    title: "Болтун",
    description: "5 голосовых разговоров — ты уже настоящий болтун на английском!",
    requirement: "Проведи 5 разговоров с AI-тьютором.",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ voiceChatSessions }) => voiceChatSessions >= 5,
  },
  {
    id: "voice_10",
    emoji: "🎙️",
    image: BADGE_IMAGES.voice,
    title: "Оратор",
    description: "10 голосовых сессий — ты говоришь как настоящий оратор!",
    requirement: "Проведи 10 разговоров с AI-тьютором.",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
    check: ({ voiceChatSessions }) => voiceChatSessions >= 10,
  },

  // ─── XP Уровни ────────────────────────────────────────────────
  {
    id: "xp_level_5",
    emoji: "🌟",
    image: BADGE_IMAGES.lightning,
    title: "Уровень 5",
    description: "Ты достиг 5 уровня опыта — отличный старт!",
    requirement: "Набирай XP, выполняя задания и заходя каждый день — достигни 5 уровня.",
    color: "#4f46e5",
    bgColor: "#e0e7ff",
    check: ({ xpLevel }) => xpLevel >= 5,
  },
  {
    id: "xp_level_10",
    emoji: "🏅",
    image: BADGE_IMAGES.scholar,
    title: "Уровень 10",
    description: "10 уровень опыта — ты в первых рядах!",
    requirement: "Продолжай учиться и достигни 10 уровня XP.",
    color: "#ec4899",
    bgColor: "#fce7f3",
    check: ({ xpLevel }) => xpLevel >= 10,
  },
  {
    id: "xp_level_20",
    emoji: "💎",
    image: BADGE_IMAGES.master,
    title: "Уровень 20",
    description: "20 уровень — ты уже опытный мастер нашей платформы!",
    requirement: "Достигни 20 уровня XP.",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
    check: ({ xpLevel }) => xpLevel >= 20,
  },
  {
    id: "xp_level_50",
    emoji: "👑",
    image: BADGE_IMAGES.diamond,
    title: "Бог знаний",
    description: "Максимальный 50 уровень! Ты достиг вершины — ты бог знаний!",
    requirement: "Достигни максимального 50 уровня XP.",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    check: ({ xpLevel }) => xpLevel >= 50,
  },

  // ─── Время ─────────────────────────────────────────────────────
  {
    id: "time_30",
    emoji: "⏱️",
    image: BADGE_IMAGES.time,
    title: "Начало пути",
    description: "30 минут в приложении — путь в тысячу миль начинается с одного шага!",
    requirement: "Проведи в приложении суммарно 30 минут.",
    color: "#6366f1",
    bgColor: "#ede9fe",
    check: ({ totalTimeMinutes }) => totalTimeMinutes >= 30,
  },
  {
    id: "time_120",
    emoji: "⏰",
    image: BADGE_IMAGES.time,
    title: "Усердный ученик",
    description: "2 часа учёбы — ты усерден и целеустремлён!",
    requirement: "Проведи в приложении суммарно 2 часа (120 минут).",
    color: "#6366f1",
    bgColor: "#ede9fe",
    check: ({ totalTimeMinutes }) => totalTimeMinutes >= 120,
  },
  {
    id: "time_600",
    emoji: "🕰️",
    image: BADGE_IMAGES.time,
    title: "Настоящий марафонец",
    description: "10 часов в приложении — ты настоящий марафонец знаний!",
    requirement: "Проведи в приложении суммарно 10 часов (600 минут).",
    color: "#6366f1",
    bgColor: "#ede9fe",
    check: ({ totalTimeMinutes }) => totalTimeMinutes >= 600,
  },
  {
    id: "time_1200",
    emoji: "🦾",
    image: BADGE_IMAGES.time,
    title: "Неутомимый",
    description: "20 часов учёбы — ты неутомимый ученик, который никогда не сдаётся!",
    requirement: "Проведи в приложении суммарно 20 часов (1200 минут).",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    check: ({ totalTimeMinutes }) => totalTimeMinutes >= 1200,
  },
];

export function getUnlockedAchievements(stats: AchievementStats): Achievement[] {
  return ACHIEVEMENTS.filter((a) => a.check(stats));
}

export function getLockedAchievements(stats: AchievementStats): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !a.check(stats));
}
