export type KnowledgeLevel =
  | "starter"
  | "beginner"
  | "elementary"
  | "intermediate"
  | "upper_intermediate";

export interface LevelInfo {
  level: KnowledgeLevel;
  label: string;
  labelRu: string;
  ageMin: number;
  ageMax: number;
  description: string;
}

export const LEVELS: LevelInfo[] = [
  {
    level: "starter",
    label: "Starter",
    labelRu: "Стартовый",
    ageMin: 5,
    ageMax: 6,
    description: "First steps in English — letters, simple words and colors.",
  },
  {
    level: "beginner",
    label: "Beginner",
    labelRu: "Начинающий",
    ageMin: 7,
    ageMax: 9,
    description: "Basic vocabulary, simple sentences and greetings.",
  },
  {
    level: "elementary",
    label: "Elementary",
    labelRu: "Элементарный",
    ageMin: 10,
    ageMax: 12,
    description: "Everyday topics, present tenses and short texts.",
  },
  {
    level: "intermediate",
    label: "Intermediate",
    labelRu: "Средний",
    ageMin: 13,
    ageMax: 15,
    description: "Grammar structures, reading comprehension and dialogues.",
  },
  {
    level: "upper_intermediate",
    label: "Upper Intermediate",
    labelRu: "Продвинутый",
    ageMin: 16,
    ageMax: 18,
    description: "Complex grammar, essays and advanced vocabulary.",
  },
];

export function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const dob = new Date(dateOfBirth);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export function getKnowledgeLevel(age: number): KnowledgeLevel {
  if (age <= 6) return "starter";
  if (age <= 9) return "beginner";
  if (age <= 12) return "elementary";
  if (age <= 15) return "intermediate";
  return "upper_intermediate";
}

export function getLevelInfo(level: KnowledgeLevel): LevelInfo {
  return LEVELS.find((l) => l.level === level) ?? LEVELS[0];
}
