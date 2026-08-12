// ─────────────────────────────────────────────────────────────────────────────
// Медали рейдов.
//
// ── Почему они живут отдельно от витрины наград профиля ─────────────────────
// В профиле медали считаются по показателям, которые сервер отдаёт каждому
// экрану (задания, очки, время, серия). Рейд — событие со своей экономикой:
// урон, комбо, криты, добивающие удары. Тащить эти четыре величины во все
// запросы профиля ради одного блока значит платить лишним запросом на каждом
// открытии вкладки у всех ролей, включая учителя и родителя, которым рейд не
// показывается вовсе.
//
// Поэтому медали рейда отдаются вместе с картиной рейда (raidSnapshot) и
// показываются во вкладке «Рейд».
//
// ── Ничего не хранится ──────────────────────────────────────────────────────
// Медаль ВЫВОДИТСЯ из итогов за всё время (raid_participants + raid_events), а
// не записывается отдельной строкой. Причина простая: все величины уже есть в
// базе и меняются только вверх, значит отдельная таблица «выданных медалей» —
// это вторая копия правды, которая обязательно разъедется с первой. Ровно так
// разъезжались серия дней и счётчик в профиле.
//
// Следствие: медаль нельзя «потерять», и её не нужно выдавать вручную.
// ─────────────────────────────────────────────────────────────────────────────

/** Итоги ученика по всем рейдам за всё время. */
export interface RaidLifetime {
  /** Урон по всем боссам. */
  damage: number;
  /** Ударов (ответов, которые дошли до босса). */
  hits: number;
  /** Критических ударов. */
  crits: number;
  /** Лучшее комбо за всю историю. */
  bestCombo: number;
  /** В скольких рейдах участвовал. */
  raids: number;
  /** Сколько из них закончились победой сообщества. */
  wins: number;
  /** Сколько раз добивающий удар был его. */
  lastHits: number;
}

export const EMPTY_LIFETIME: RaidLifetime = {
  damage: 0, hits: 0, crits: 0, bestCombo: 0, raids: 0, wins: 0, lastHits: 0,
};

/** Ключ показателя, по которому считается медаль. */
type Metric = keyof RaidLifetime;

interface MedalDef {
  id: string;
  title: string;
  /** За что даётся — одной фразой, без канцелярита. */
  about: string;
  metric: Metric;
  target: number;
  /** Глиф из набора приложения. */
  icon: string;
  /** easy | medium | hard — от неё зависит вид медали. */
  tier: "easy" | "medium" | "hard";
}

/**
 * Каталог медалей рейда.
 *
 * Пороги подобраны от реального темпа: один заход боя это примерно 300–500
 * урона, неделя занятий — несколько тысяч. Поэтому первая медаль берётся в
 * первый же вечер, а последняя — за несколько месяцев участия.
 */
const MEDALS: readonly MedalDef[] = [
  {
    id: "raid_first",
    title: "Первый удар",
    about: "Ты ударил босса — теперь ты в рейде.",
    metric: "hits", target: 1, icon: "flame", tier: "easy",
  },
  {
    id: "raid_damage_1000",
    title: "Тысяча урона",
    about: "1000 урона по боссам суммарно.",
    metric: "damage", target: 1000, icon: "spark", tier: "easy",
  },
  {
    id: "raid_win_1",
    title: "Босс повержен",
    about: "Ты был в рейде, который добил босса.",
    metric: "wins", target: 1, icon: "trophy", tier: "easy",
  },
  {
    id: "raid_combo_10",
    title: "Серия из десяти",
    about: "Десять верных ответов подряд — комбо ×2.",
    metric: "bestCombo", target: 10, icon: "rank", tier: "easy",
  },
  {
    id: "raid_damage_10000",
    title: "Десять тысяч",
    about: "10 000 урона по боссам — это уже вклад, который видно на шкале.",
    metric: "damage", target: 10000, icon: "chart", tier: "medium",
  },
  {
    id: "raid_crit_25",
    title: "Безжалостный критик",
    about: "25 критических ударов мощной атакой.",
    metric: "crits", target: 25, icon: "star", tier: "medium",
  },
  {
    id: "raid_combo_25",
    title: "Двадцать пять подряд",
    about: "Комбо из 25 ответов без единой ошибки.",
    metric: "bestCombo", target: 25, icon: "medal", tier: "medium",
  },
  {
    id: "raid_win_5",
    title: "Пять боссов",
    about: "Пять недель, которые закончились победой сообщества.",
    metric: "wins", target: 5, icon: "crown", tier: "medium",
  },
  {
    id: "raid_last_1",
    title: "Последний герой",
    about: "Добивающий удар по боссу был твоим.",
    metric: "lastHits", target: 1, icon: "cup", tier: "hard",
  },
  {
    id: "raid_damage_100000",
    title: "Сто тысяч",
    about: "100 000 урона за всё время. Столько не набивают случайно.",
    metric: "damage", target: 100000, icon: "globe", tier: "hard",
  },
];

/** Медаль в том виде, в котором её показывает клиент. */
export interface RaidMedalView {
  id: string;
  title: string;
  about: string;
  icon: string;
  tier: "easy" | "medium" | "hard";
  /** Медаль получена. */
  got: boolean;
  current: number;
  target: number;
  /** Заполнение 0…100 — по нему рисуется полоса у неполученной. */
  percent: number;
}

/**
 * Медали по итогам за всё время: полученные первыми, затем ближайшие.
 *
 * Порядок именно такой, потому что блок узкий: сверху то, чем можно похвастаться,
 * сразу под ним — то, до чего осталось меньше всего.
 */
export function raidMedals(life: RaidLifetime): RaidMedalView[] {
  const rows = MEDALS.map((m) => {
    const current = Math.max(0, Number(life[m.metric] ?? 0));
    const got = current >= m.target;
    return {
      id: m.id,
      title: m.title,
      about: m.about,
      icon: m.icon,
      tier: m.tier,
      got,
      current: Math.min(current, m.target),
      target: m.target,
      percent: Math.max(0, Math.min(100, Math.round((current / m.target) * 100))),
    };
  });

  return rows.sort((a, b) => {
    if (a.got !== b.got) return a.got ? -1 : 1;
    return b.percent - a.percent;
  });
}

/** Сколько медалей уже получено и сколько их всего. */
export function raidMedalCount(medals: RaidMedalView[]): { got: number; total: number } {
  return { got: medals.filter((m) => m.got).length, total: medals.length };
}
