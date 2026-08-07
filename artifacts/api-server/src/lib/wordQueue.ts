// Кто в какой режим попадает: «Учить слова» против «Марафона слов».
//
// Раньше оба режима отбирали карточки по одному признаку — «наступил срок
// повторения». Из-за этого выученное слово с подошедшим dueAt приходило и туда,
// и туда, а разница между разделами была неочевидна: в «Учить слова» вперемешку
// шли и новые слова, и давно освоенные.
//
// Граница проходит по уровню памяти (LEARNED_LEVEL из srs.ts):
//
//   уровень < LEARNED_LEVEL → «Учить слова»: новые и плохо усвоенные;
//   уровень ≥ LEARNED_LEVEL → «Марафон слов»: зал повторений выученного.
//
// Граница живая в обе стороны. Слово, дошедшее до 4-го уровня, уходит из
// «Учить слова» в марафон само. Слово, на котором ученик срывается (оценка
// again роняет уровень), падает ниже порога и возвращается доучиваться.
//
// Про «чем чаще отвечаешь верно, тем реже слово попадается»: отдельная механика
// для этого не нужна — её уже даёт интервальное повторение. Верный ответ
// поднимает уровень, а вместе с ним интервал (1 неделя на 4-м уровне, 30 дней
// на 5-м), и dueAt уезжает дальше. Марафон отдаёт только те слова, чей срок
// НАСТУПИЛ, и сортирует их по dueAt: впереди то, что созрело раньше всех.
//
// Модуль без БД и express — тесты в wordQueue.test.ts.
import { LEARNED_LEVEL } from "./srs";

/** Минимальный уровень памяти для попадания в марафон. */
export const MARATHON_MIN_LEVEL = LEARNED_LEVEL;

/**
 * Сколько выученных слов отдаём за один заход в марафон.
 *
 * Раньше марафон присылал разом все слова уровня — на старших уровнях это
 * сотни карточек в одном ответе. Ребёнок столько не проходит, а трафик и время
 * ответа платит целиком.
 */
export const MARATHON_MAX_CARDS = 30;

/** Состояние карточки в объёме, который нужен для отбора. */
export type QueueState = {
  memoryLevel: number;
  dueAt: Date;
};

/** Слово выучено и должно жить в марафоне, а не в «Учить слова». */
export function belongsToMarathon(state: QueueState | undefined): boolean {
  return !!state && state.memoryLevel >= MARATHON_MIN_LEVEL;
}

/** Срок повторения наступил. */
export function isDue(state: QueueState | undefined, now: Date): boolean {
  return !!state && state.dueAt.getTime() <= now.getTime();
}

/**
 * Слово нужно доучивать: оно введено, ещё не выучено и срок повторения подошёл.
 *
 * Новые слова сюда НЕ входят: у них нет состояния, и добираются они отдельно —
 * с учётом дневной нормы и уровня подготовки (см. buildTrainerQueue).
 */
export function needsMoreStudy(state: QueueState | undefined, now: Date): boolean {
  if (!state) return false;
  if (belongsToMarathon(state)) return false;
  return isDue(state, now);
}

/**
 * Порядок марафона: сначала то, чей срок наступил раньше всех.
 *
 * Сортировка по dueAt и есть «реже спрашиваем то, что знаем лучше»: интервал
 * растёт с уровнем памяти, поэтому свежеотвеченное слово уезжает в хвост
 * самостоятельно, без отдельного счётчика.
 */
export function compareByDue<T>(getState: (item: T) => QueueState | undefined) {
  return (a: T, b: T): number => {
    const da = getState(a)?.dueAt.getTime() ?? Number.POSITIVE_INFINITY;
    const db = getState(b)?.dueAt.getTime() ?? Number.POSITIVE_INFINITY;
    return da - db;
  };
}

/**
 * Отбор карточек марафона: выученные слова, У КОТОРЫХ НАСТУПИЛ СРОК, по
 * возрастанию dueAt и не больше лимита.
 *
 * Условие срока здесь принципиальное. Без него, пока выученных слов меньше
 * лимита, в порцию попадало всё подряд — включая слово, отвеченное пять минут
 * назад. Интервальное повторение при этом переставало что-либо значить.
 *
 * Возвращает ещё два счётчика: сколько всего слов в зале повторений
 * (learnedCount) и сколько из них созрело прямо сейчас (dueNow). По ним клиент
 * объясняет пустой марафон: «всё повторено, приходи позже» — это нормальное
 * состояние, а не ошибка.
 */
export function pickMarathonCards<T>(
  items: T[],
  getState: (item: T) => QueueState | undefined,
  now: Date,
  limit: number = MARATHON_MAX_CARDS,
): { picked: T[]; learnedCount: number; dueNow: number } {
  const learned = items.filter((item) => belongsToMarathon(getState(item)));
  const due = learned.filter((item) => isDue(getState(item), now));
  const picked = [...due].sort(compareByDue(getState)).slice(0, Math.max(0, limit));
  return { picked, learnedCount: learned.length, dueNow: due.length };
}
