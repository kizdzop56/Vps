export interface XpLevel {
  level: number;
  xpRequired: number;
  title: string;
  emoji: string;
  color: string;
  bgColor: string;
  reward: string;
}

// Cumulative XP needed to reach each level
export const XP_LEVELS: XpLevel[] = [
  { level: 1,  xpRequired: 0,     title: "Новичок",       emoji: "🌱", color: "#94a3b8", bgColor: "#f1f5f9", reward: "Значок Новичка" },
  { level: 2,  xpRequired: 100,   title: "Любопытный",    emoji: "🐣", color: "#84cc16", bgColor: "#f7fee7", reward: "Значок Любопытного" },
  { level: 3,  xpRequired: 250,   title: "Искатель",      emoji: "🔍", color: "#22c55e", bgColor: "#dcfce7", reward: "Значок Искателя" },
  { level: 4,  xpRequired: 450,   title: "Ученик",        emoji: "📖", color: "#10b981", bgColor: "#d1fae5", reward: "Значок Ученика" },
  { level: 5,  xpRequired: 700,   title: "Старатель",     emoji: "⭐", color: "#06b6d4", bgColor: "#cffafe", reward: "Значок Старателя" },
  { level: 6,  xpRequired: 1000,  title: "Знаток",        emoji: "🎯", color: "#3b82f6", bgColor: "#dbeafe", reward: "Значок Знатока" },
  { level: 7,  xpRequired: 1400,  title: "Мыслитель",     emoji: "🧠", color: "#6366f1", bgColor: "#e0e7ff", reward: "Значок Мыслителя" },
  { level: 8,  xpRequired: 1900,  title: "Мастер",        emoji: "🔥", color: "#8b5cf6", bgColor: "#ede9fe", reward: "Значок Мастера" },
  { level: 9,  xpRequired: 2500,  title: "Эксперт",       emoji: "💡", color: "#a855f7", bgColor: "#f3e8ff", reward: "Значок Эксперта" },
  { level: 10, xpRequired: 3200,  title: "Профессионал",  emoji: "🏅", color: "#ec4899", bgColor: "#fce7f3", reward: "Значок Профессионала" },
  { level: 11, xpRequired: 4100,  title: "Виртуоз",       emoji: "🎸", color: "#f43f5e", bgColor: "#ffe4e6", reward: "Значок Виртуоза" },
  { level: 12, xpRequired: 5200,  title: "Чемпион",       emoji: "🥇", color: "#ef4444", bgColor: "#fee2e2", reward: "Значок Чемпиона" },
  { level: 13, xpRequired: 6500,  title: "Герой",         emoji: "🦸", color: "#f97316", bgColor: "#ffedd5", reward: "Значок Героя" },
  { level: 14, xpRequired: 8000,  title: "Легенда",       emoji: "⚡", color: "#f59e0b", bgColor: "#fef3c7", reward: "Значок Легенды" },
  { level: 15, xpRequired: 9800,  title: "Супергерой",    emoji: "🦄", color: "#eab308", bgColor: "#fefce8", reward: "Значок Супергероя" },
  { level: 16, xpRequired: 11800, title: "Волшебник",     emoji: "🧙", color: "#84cc16", bgColor: "#f7fee7", reward: "Значок Волшебника" },
  { level: 17, xpRequired: 14000, title: "Рыцарь",        emoji: "⚔️", color: "#22c55e", bgColor: "#dcfce7", reward: "Значок Рыцаря" },
  { level: 18, xpRequired: 16500, title: "Страж",         emoji: "🛡️", color: "#10b981", bgColor: "#d1fae5", reward: "Значок Стража" },
  { level: 19, xpRequired: 19500, title: "Адмирал",       emoji: "⚓", color: "#06b6d4", bgColor: "#cffafe", reward: "Значок Адмирала" },
  { level: 20, xpRequired: 23000, title: "Гений",         emoji: "🌟", color: "#3b82f6", bgColor: "#dbeafe", reward: "Значок Гения" },
  { level: 21, xpRequired: 27000, title: "Архимаг",       emoji: "🔮", color: "#6366f1", bgColor: "#e0e7ff", reward: "Значок Архимага" },
  { level: 22, xpRequired: 31500, title: "Дракон",        emoji: "🐉", color: "#8b5cf6", bgColor: "#ede9fe", reward: "Значок Дракона" },
  { level: 23, xpRequired: 36500, title: "Феникс",        emoji: "🦅", color: "#a855f7", bgColor: "#f3e8ff", reward: "Значок Феникса" },
  { level: 24, xpRequired: 42000, title: "Повелитель",    emoji: "👑", color: "#ec4899", bgColor: "#fce7f3", reward: "Значок Повелителя" },
  { level: 25, xpRequired: 48000, title: "Воин света",    emoji: "✨", color: "#f43f5e", bgColor: "#ffe4e6", reward: "Значок Воина Света" },
  { level: 26, xpRequired: 55000, title: "Оракул",        emoji: "🌙", color: "#ef4444", bgColor: "#fee2e2", reward: "Значок Оракула" },
  { level: 27, xpRequired: 63000, title: "Провидец",      emoji: "🔭", color: "#f97316", bgColor: "#ffedd5", reward: "Значок Провидца" },
  { level: 28, xpRequired: 72000, title: "Бессмертный",   emoji: "💎", color: "#f59e0b", bgColor: "#fef3c7", reward: "Значок Бессмертного" },
  { level: 29, xpRequired: 82000, title: "Полубог",       emoji: "⚡", color: "#eab308", bgColor: "#fefce8", reward: "Значок Полубога" },
  { level: 30, xpRequired: 93000, title: "Титан",         emoji: "🌋", color: "#6366f1", bgColor: "#e0e7ff", reward: "Значок Титана" },
  { level: 31, xpRequired: 105000, title: "Колосс",       emoji: "🗿", color: "#8b5cf6", bgColor: "#ede9fe", reward: "Значок Колосса" },
  { level: 32, xpRequired: 118000, title: "Нептун",       emoji: "🌊", color: "#06b6d4", bgColor: "#cffafe", reward: "Значок Нептуна" },
  { level: 33, xpRequired: 132000, title: "Громовержец",  emoji: "⚡", color: "#3b82f6", bgColor: "#dbeafe", reward: "Значок Громовержца" },
  { level: 34, xpRequired: 147000, title: "Солнечный",    emoji: "☀️", color: "#f59e0b", bgColor: "#fef3c7", reward: "Значок Солнечного" },
  { level: 35, xpRequired: 163000, title: "Звёздный",     emoji: "🌠", color: "#ec4899", bgColor: "#fce7f3", reward: "Значок Звёздного" },
  { level: 36, xpRequired: 180000, title: "Космический",  emoji: "🚀", color: "#a855f7", bgColor: "#f3e8ff", reward: "Значок Космического" },
  { level: 37, xpRequired: 198000, title: "Галактический", emoji: "🌌", color: "#8b5cf6", bgColor: "#ede9fe", reward: "Значок Галактического" },
  { level: 38, xpRequired: 217000, title: "Межзвёздный",  emoji: "💫", color: "#6366f1", bgColor: "#e0e7ff", reward: "Значок Межзвёздного" },
  { level: 39, xpRequired: 237000, title: "Вселенский",   emoji: "🌍", color: "#3b82f6", bgColor: "#dbeafe", reward: "Значок Вселенского" },
  { level: 40, xpRequired: 258000, title: "Создатель",    emoji: "🎨", color: "#10b981", bgColor: "#d1fae5", reward: "Значок Создателя" },
  { level: 41, xpRequired: 280000, title: "Хранитель",    emoji: "🏰", color: "#22c55e", bgColor: "#dcfce7", reward: "Значок Хранителя" },
  { level: 42, xpRequired: 303000, title: "Избранный",    emoji: "🎖️", color: "#84cc16", bgColor: "#f7fee7", reward: "Значок Избранного" },
  { level: 43, xpRequired: 327000, title: "Пророк",       emoji: "📜", color: "#eab308", bgColor: "#fefce8", reward: "Значок Пророка" },
  { level: 44, xpRequired: 352000, title: "Олимпиец",     emoji: "🏛️", color: "#f59e0b", bgColor: "#fef3c7", reward: "Значок Олимпийца" },
  { level: 45, xpRequired: 378000, title: "Мифический",   emoji: "🦁", color: "#f97316", bgColor: "#ffedd5", reward: "Значок Мифического" },
  { level: 46, xpRequired: 405000, title: "Эпический",    emoji: "⚔️", color: "#ef4444", bgColor: "#fee2e2", reward: "Значок Эпического" },
  { level: 47, xpRequired: 433000, title: "Легендарный",  emoji: "🔱", color: "#f43f5e", bgColor: "#ffe4e6", reward: "Значок Легендарного" },
  { level: 48, xpRequired: 462000, title: "Мифический",   emoji: "🌟", color: "#ec4899", bgColor: "#fce7f3", reward: "Значок Мифического" },
  { level: 49, xpRequired: 492000, title: "Абсолют",      emoji: "♾️", color: "#a855f7", bgColor: "#f3e8ff", reward: "Значок Абсолюта" },
  { level: 50, xpRequired: 523000, title: "Бог знаний",   emoji: "🏆", color: "#f59e0b", bgColor: "#fef3c7", reward: "Корона Бога Знаний" },
];

export function getLevelForXp(xp: number): XpLevel {
  let current = XP_LEVELS[0]!;
  for (const lvl of XP_LEVELS) {
    if (xp >= lvl.xpRequired) current = lvl;
    else break;
  }
  return current;
}

export function getNextLevel(currentLevel: number): XpLevel | null {
  return XP_LEVELS.find(l => l.level === currentLevel + 1) ?? null;
}

export function getXpProgress(xp: number): { current: XpLevel; next: XpLevel | null; progressPercent: number } {
  const current = getLevelForXp(xp);
  const next = getNextLevel(current.level);
  if (!next) return { current, next: null, progressPercent: 100 };
  const xpInLevel = xp - current.xpRequired;
  const xpNeeded = next.xpRequired - current.xpRequired;
  const progressPercent = Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));
  return { current, next, progressPercent };
}
