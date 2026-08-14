// Тренажёр слов: одно упражнение на экран, мгновенная реакция, итоги в конце.
//
// Раньше тренировка была одна — перевернуть карточку и самому нажать «знаю» или
// «учить». Ребёнок видел перевод и был уверен, что знал слово, хотя вспомнить сам
// не мог. Теперь упражнение подбирает сервер по уровню памяти слова
// (api-server/src/lib/wordExercise.ts), а здесь оно показывается:
//
//   знакомство — карточка с картинкой, переводом, примером и озвучкой;
//   выбор перевода (EN→RU) — узнавание;
//   выбор слова (RU→EN) — припоминание;
//   аудирование — только озвучка, выбрать перевод;
//   собери слово — буквы тапом, без клавиатуры (детям так проще);
//   напиши перевод / напиши слово — свободный ответ с клавиатуры;
//   произнеси слово — микрофон, три попытки.
//
// Оценку ученик не выставляет: на сервер уходит сам ответ (верно/неверно, число
// попыток, время, была ли подсказка), а оценку по нему считает srs.ts.
//
// ── Ошибка возвращается В ЭТОЙ ЖЕ СЕССИИ ────────────────────────────────────
// Ошибся — слово встаёт обратно в очередь через RETRY_GAP карточек. Раньше оно
// уходило в интервальное повторение и всплывало через день: единственный
// момент, когда ребёнок точно помнит верный ответ (только что прочитал его),
// не использовался никак.
//
// Три ограничения, без которых стало бы хуже:
//   • один возврат на слово за сессию (RETRY_LIMIT_PER_WORD) — иначе на трудном
//     слове можно застрять в петле и не дойти до конца;
//   • повтор НЕ идёт в счётчики итогов: точность считается по первым попыткам,
//     иначе цифра перестаёт что-либо значить;
//   • на сервер повтор уходит обычным ответом — это настоящее повторение.
//
// ── Слово звучит ОДИН раз за карточку ───────────────────────────────────────
// Автоматическая озвучка запускается ровно в одном месте — при появлении
// карточки. После ответа звук сам не играет: для этого на обратной стороне
// карточки есть кнопка «Прослушать».
//
// ── Карточка переворачивается ЦЕЛИКОМ ───────────────────────────────────────
// И в знакомстве (показ перевода), и при любом окончательном ответе крутится
// САМА карточка — весь белый прямоугольник с фоном, рамкой и тенью, — а не
// текст где-то внутри неё. Технически это значит, что rotateY/scaleY/
// perspective висят на самом внешнем Animated.View карточки; то, что видно на
// экране (слово или перевод, вопрос или итог ответа), — это просто РАЗНОЕ
// СОДЕРЖИМОЕ одного и того же вращающегося контейнера, подставляемое ровно в
// момент, когда карточка повёрнута к экрану ребром (см. эффекты-слушатели flip
// и answerFlip ниже). Раньше вращался только внутренний блок с текстом, а сам
// белый прямоугольник карточки стоял неподвижно — выглядело так, будто
// переворачивается не карточка, а буквы внутри неё.
//
// rotateY прыгает с 90° на −90° ровно в момент разворота ребром (проекция по
// ширине ~0, скачок незаметен) — поворот ни разу не проходит через 180° и не
// выглядит зеркальным.
//
// ── Карточка достаточно большая, а не жмётся к верху экрана ─────────────────
// У карточки есть minHeight — доля высоты экрана (см. CARD_MIN_HEIGHT). Без
// него на упражнениях с короткой карточкой (например «Напиши слово по-
// английски») под клавиатурными кнопками оставалась пустая нижняя половина
// экрана — сама карточка занимала едва ли треть доступного места. justify
// Content: "center" на карточке — чтобы при увеличенной высоте её содержимое
// стояло по центру, а не лепилось к верхнему краю с пустотой снизу внутри
// самой карточки.
//
// ── Итог ответа живёт НА ОБРАТНОЙ СТОРОНЕ карточки ──────────────────────────
// Как только ученик отвечает ОКОНЧАТЕЛЬНО (выбрал вариант, собрал слово,
// написал перевод, произнёс, дослушал аудирование, или проверка не удалась из
// -за сети), карточка разворачивается, и на обратной стороне сразу вся
// информация о слове (эмодзи, слово, транскрипция, перевод, часть речи,
// пример) вместе с итогом ответа (верно/неверно, что было правильно, кнопка
// «Прослушать»).
//
// Исключение — первая ошибка в сборке слова (retryBuild): это приглашение
// собрать заново, а не окончательный ответ, и карточка за него не
// переворачивается — короткая надпись остаётся на лицевой стороне рядом со
// собранными буквами.
//
// Варианты ответа, буквы, поле ввода и кнопки под карточкой (микрофон,
// «Дальше», «Не знаю») не переворачиваются вместе с ней: они и раньше жили
// под белой карточкой, а не на ней, и флип их не касается.
//
// ── Шрифт слова на КАРТОЧКЕ подстраивается под его длину ────────────────────
// fitFontSize(text, base) сравнивает с порогами БОЛЬШЕЕ из двух чисел: длину
// самого длинного слова фразы и длину всей фразы целиком (слова + пробелы).
//
// Раньше учитывалось только самое длинное слово: «have breakfast» и «make
// yourself at home» с этой меркой выглядели одинаково безобидно — оба слова
// в них короче порога, — но вторая фраза из ЧЕТЫРЁХ слов на двух строках
// физически не помещается, а первая из ДВУХ вполне. adjustsFontSizeToFit,
// который должен был досжать шрифт дальше сам, на вебе (react-native-web)
// ненадёжен именно для многострочного текста — и фраза обрезалась
// многоточием вместо уменьшения кегля.
//
// Для ОДНОГО слова оба числа совпадают, поэтому подбор размера для
// одиночных слов и переводов не изменился ни на пиксель — правило добавляет
// шринк только многословным фразам. У однословных длинных ответов
// («выздоравливать») по-прежнему переносить нечем — единственный способ
// вписать их в карточку — уменьшить сам шрифт.
//
// ВАЖНО: эта «по всей фразе» проверка — только для карточки (единственный
// текст, без переноса на много строк). Для вариантов ответа своя функция —
// см. fitOptionFontSize ниже.
//
// ── Пустая очередь объясняет ПРИЧИНУ, а не просто «нечего повторять» ────────
// «Пока нечего повторять» — одна и та же фраза раньше пряталась за тремя
// разными причинами:
//   capped — дневной лимит новых слов на сегодня исчерпан;
//   waiting — новых слов ждать некому, но одно из уже введённых вернётся по
//             расписанию совсем скоро (у только что провального или только
//             что введённого слова интервал — 1–10 минут, см. INTERVAL_MIN в
//             lib/srs.ts);
//   done — в колоде/сессии действительно нечего показать прямо сейчас.
// Раньше это было неразличимо, и «waiting» выглядело как баг: ушёл с экрана
// «нечего повторять», вернулся через пару минут — а слово тут как тут.
// Сервер (routes/flashcardsLearn.ts) присылает emptyReason и, для waiting,
// nextDueAt — SessionSummary показывает разное сообщение под каждую причину.
//
// ── Верное листается само, ошибка — нет ─────────────────────────────────────
// Верный ответ не требует разбора: карточка уходит сама через NEXT_DELAY_OK, и
// кнопка «Дальше» для этого не нужна.
//
// Ошибка — наоборот, самая полезная секунда тренировки, и отмерять её таймером
// нельзя: одному хватит взгляда, другому надо перечитать и проговорить.
// Поэтому после ошибки карточка стоит, пока ученик сам не нажмёт «Дальше».
//
// ── Свободный ответ проверяет сервер ────────────────────────────────────────
// Для письма и произношения ответ не сравнивается здесь: этим занимается
// POST /flashcards/check-answer. Иначе веб и натив разойдутся в трактовке
// («Кот.» против «кот», опечатка против ошибки), и один и тот же ответ получит
// разные оценки на разных устройствах.
//
// ── Запись речи заканчивает ученик ──────────────────────────────────────────
// Кнопка микрофона — переключатель: нажал, сказал, нажал «Стоп». Автоматическая
// остановка по тишине здесь не работает: ребёнок читает задание, примеряется,
// набирает воздух — и всё это время распознавание уже считает, что фраза
// закончилась. Попытка сгорала до того, как он открывал рот.
//
// Пока идёт запись, под микрофоном едет живая дорожка (components/ui/VoiceWave):
// расшифровка приходит с задержкой, и без дорожки экран выглядел мёртвым —
// непонятно, ловит микрофон голос или нет.
//
// Пустая расшифровка попытку НЕ тратит: это не ошибка ученика, а неудачная
// запись. Тратятся только попытки, где действительно что-то прозвучало.
//
// ── Тупиков быть не должно ──────────────────────────────────────────────────
// В каждом упражнении со свободным ответом есть выход: «Не знаю» в письме и
// сборке, «Не получается» в произношении. Незнакомое слово — нормальная часть
// учёбы, и признаться в этом должно быть проще, чем наугад набивать буквы.
// Такой ответ засчитывается как полный промах: слово вернётся скоро.
//
// ── Цвет состояния не трогает текст ─────────────────────────────────────────
// Клавиша ответа НИКОГДА не заливается цветом состояния целиком. Раньше
// заливка шла на всю площадь, и под красным или фиолетовым терялся сам текст
// ответа — то единственное, что ученик должен прочитать в этот момент. Особенно
// это било по верному ответу после ошибки: его надо запомнить, а он лежал под
// пятном.
//
// Состояние показывают три вещи по краям: рамка, нижняя грань и круглый значок
// справа. Корпус остаётся светлым, текст — всегда colors.foreground. Контраст
// не зависит от того, верно ответил ученик или нет.
//
// «Верно» окрашено фирменным фиолетовым (зелёного в палитре нет намеренно).
// Эмодзи в интерфейсе не используются; card.emoji приходит из данных слова
// и остаётся как иллюстрация к слову, это не иконка интерфейса.
//
// ── Опыт не мелькает во время тренировки ────────────────────────────────────
// Раньше в шапке экрана при каждом верном ответе прыгал счётчик «+N очков» —
// он менялся посреди упражнения и отвлекал от самого задания. Теперь очки во
// время сессии нигде не показываются: они по-прежнему копятся молча (state
// points не убран — он нужен для итогового экрана), а видно их становится
// РОВНО ОДИН РАЗ — на SessionSummary, когда колода или марафон закончены.
//
// ── Варианты ответа делят ОДИН размер шрифта на вопрос ──────────────────────
// Раньше каждый вариант считал fitOptionFontSize сам по себе: у «window /
// address / furniture / table» «furniture» — самое длинное — мельчало, а три
// соседних коротких слова рисовались полным кеглем. По отдельности каждое
// решение верно, но внутри ОДНОГО вопроса это выглядит как случайный разнобой
// шрифта, а не как аккуратная подгонка под длину. Теперь один размер
// считается на весь набор вариантов вопроса — по самому длинному среди них —
// и передаётся в каждый OptionKey явным пропом; кегль внутри вопроса больше
// не прыгает от строки к строке.
//
// ГРАБЛИ. Общий размер для вариантов считается ЧЕРЕЗ fitOptionFontSize, А НЕ
// через fitFontSize с его учётом длины ВСЕЙ ФРАЗЫ: варианты ответа переносятся
// на несколько строк (numberOfLines=2) и прекрасно вмещают длинную фразу без
// уменьшения кегля, а «фраза целиком не влезает» — это мерка для ОДНОЙ строки
// на карточке, где переносить особо некуда. Однажды это уже перепутали: общий
// размер вариантов посчитали через fitFontSize, и «делать резервную копию»
// (22 символа общей длины — уже за порогом «>20») утащила размер ВСЕХ четырёх
// вариантов вопроса до нечитаемых ~7px, хотя переносить эту фразу было незачем.
//
// ── Аудирование выглядит как дорожка плеера, а не кружок-кнопка ─────────────
// Раньше упражнение «Послушай и выбери перевод» показывало на карточке одну
// круглую кнопку со значком динамика посреди пустого пространства — по форме
// это ничем не напоминало проигрыватель звука, и не сразу читалось, что вообще
// здесь можно послушать. Теперь это AudioTrackCard: та же порода, что у
// components/InlineMediaPlayer — слева круглая кнопка play/pause в градиенте
// бренда, справа столбики дорожки. Нажимать можно по всей карточке, а не
// только по кнопке — под капотом всё тот же playWord(). Состояние «playing»
// на кнопке и дорожке — короткий таймер, а не точное событие конца звука
// (speakWord ничего не сообщает об этом наружу, см. hooks/useFlashcards.ts):
// секунды с небольшим хватает дать понятную обратную связь «сейчас звучит»,
// не обещая точности настоящего плеера.
import React from "react";
import { View, Text, TextInput, TouchableOpacity, Pressable, Animated, Easing, ActivityIndicator, ScrollView, Platform, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { fc, speakWord, speechAvailable, stopSpeaking } from "@/hooks/useFlashcards";
import type { AnswerCheck, Exercise, ExerciseType, Grade, TrainerCard, TrainerQueue } from "@/hooks/useFlashcards";
import {
  cancelListening,
  isSpeechInputAvailable,
  startListening,
  type SpeechResult,
  type SpeechSession,
} from "@/hooks/useSpeechInput";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { VoiceWave } from "@/components/ui/VoiceWave";
import { ChunkyButton, XpBar, GoalPips } from "@/components/ui/GameKit";
import { accents, gradients, radii, chunky } from "@/constants/theme";

// Пауза после верного ответа: карточка не улетает мгновенно, ученик успевает
// увидеть «Верно!» и заметить, какой вариант был правильным.
const NEXT_DELAY_OK = 1200;
// Опечатку показываем дольше верного ответа: ребёнок должен успеть прочитать,
// как слово пишется правильно.
const NEXT_DELAY_TYPO = 2200;
// Технический пропуск (мигнула сеть): в оценку не идёт, держать нечего.
const NEXT_DELAY_INFO = 1600;

/**
 * Через сколько карточек вернуть слово, на котором ошиблись.
 *
 * Три — не «поскорее» и не «когда-нибудь». Сразу следующей карточкой ответ
 * ещё стоит перед глазами, и это проверка памяти длиной в две секунды. Через
 * десяток — след уже остыл, а до конца короткой сессии слово может и не
 * дожить.
 */
const RETRY_GAP = 3;

/** Сколько раз одно слово может вернуться за сессию. */
const RETRY_LIMIT_PER_WORD = 1;

/**
 * Запас под последней кнопкой экрана.
 *
 * Кнопка вплотную к нижнему краю нажимается через раз: на айфонах там живёт
 * жест «домой», и первое касание уходит системе. Плюс на вебе адресная строка
 * Safari то появляется, то исчезает, и «низ экрана» — величина плавающая.
 */
const BOTTOM_SAFE_SPACE = 40;

/** Толщина нижней грани у поверхностей итогового экрана. */
const EDGE = 6;

/**
 * Минимальная высота карточки — доля высоты экрана.
 *
 * Без неё карточка занимала ровно столько места, сколько требовал её текст, и
 * на коротких упражнениях (например «Напиши слово по-английски», где под
 * карточкой всего поле ввода и пара кнопок) экран заканчивался на середине,
 * а ниже висела пустая безжизненная область до самого низа. Доля от высоты
 * экрана — тот же приём, что уже используется в проекте для похожих величин
 * (см. Dimensions.get("window").height в SendDeckModal).
 *
 * НЕ реагирует на поворот экрана или ресайз окна на вебе — Dimensions.get
 * читает размер один раз при монтировании модуля. Это осознанный компромисс:
 * тренажёр открывается заново на каждую сессию, так что актуальное значение
 * подхватится при следующем заходе.
 */
const CARD_MIN_HEIGHT = Math.round(Dimensions.get("window").height * 0.42);

// В вебе трансформации через нативный драйвер не проходят — анимация просто
// не запускается. Правило по всему проекту одно и то же.
const NATIVE_DRIVER = Platform.OS !== "web";

type Phase = "loading" | "run" | "done";

/**
 * Место в очереди сессии.
 *
 * retry — это повторный показ слова, на котором ученик только что ошибся.
 * Отдельный флаг, а не пометка на самой карточке: одно и то же слово стоит в
 * очереди дважды, и различать показы нужно по месту, а не по слову.
 */
type QueueItem = { card: TrainerCard; retry: boolean };

/**
 * Итог ответа по текущей карточке.
 *
 * again  — первая ошибка в сборке слова: даём собрать заново, поэтому верный
 *          ответ показывать нельзя (поле retryBuild);
 * gaveUp — ученик нажал «Не знаю»: промах засчитан, но ругать не за что;
 * info   — ответ не проверен (мигнула сеть). В оценку не идёт.
 */
type Feedback = {
  correct: boolean;
  picked?: number;
  /** Промежуточная реакция на первую ошибку в сборке слова. */
  retryBuild?: boolean;
  typo?: boolean;
  gaveUp?: boolean;
  info?: boolean;
  note?: string;
} | null;

/** Что сейчас делает микрофон. */
type SpeakState = "idle" | "listening" | "checking";

/** Почему очередь оказалась пустой — см. api-server routes/flashcardsLearn.ts. */
type EmptyInfo = { reason?: "capped" | "waiting" | "done"; nextDueAt?: string } | null;

/**
 * Размер шрифта под длину текста на КАРТОЧКЕ (одна строка/фраза, ограниченное
 * число строк, перенос по сути невозможен без потери смысла).
 *
 * Сравнивает с порогами БОЛЬШЕЕ из двух чисел: длину самого длинного слова и
 * длину всей фразы целиком (слова + по одному пробелу между ними).
 *
 * Для ОДНОГО слова оба числа равны — поведение для одиночных слов и коротких
 * переводов не меняется. Для ФРАЗЫ длина всей строки часто больше длины
 * любого отдельного слова: «make yourself at home» состоит из слов короче
 * порога (max 8 букв), но на карточку целиком не влезает — переносится по
 * границам слов на две строки, и большая часть каждой строки простаивает
 * впустую, потому что следующее слово в неё уже не помещается целиком.
 * Раньше это оставалось незамеченным: сравнивался только «выздоравливать»
 * -подобный случай (одно длинное слово), а «фраза из нескольких коротких
 * слов, которая всё равно не влезает» проходила проверку и рисовалась полным
 * кеглем — a то, что не досжал JS, должен был доужать adjustsFontSizeToFit,
 * но на react-native-web (веб-сборка) это многострочное сжатие ненадёжно, и
 * лишний текст просто обрезался многоточием.
 *
 * НЕ используется для вариантов ответа — там своя функция, см.
 * fitOptionFontSize ниже: у вариантов перенос строки не проблема, а нормальный
 * сценарий, и мерить их по длине ВСЕЙ ФРАЗЫ значит зря мельчить короткие слова
 * из-за одного длинного соседа в наборе.
 */
function fitFontSize(text: string, base: number): number {
  const words = text.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((max, token) => Math.max(max, token.length), 0);
  // Слова плюс по одному пробелу между ними — оценка того, сколько места
  // реально просит фраза, если её вообще ничем не переносить.
  const wholePhrase = words.join(" ").length;
  const effective = Math.max(longestWord, wholePhrase);

  let scale = 1;
  if (effective > 26) scale = 0.38;
  else if (effective > 20) scale = 0.44;
  else if (effective > 15) scale = 0.56;
  else if (effective > 11) scale = 0.7;
  else if (effective > 8) scale = 0.85;
  return Math.round(base * scale);
}

/**
 * Размер шрифта для ВАРИАНТА ОТВЕТА (умещается в несколько строк, перенос —
 * нормальный сценарий, а не потеря смысла).
 *
 * Учитывает только длину самого длинного слова, а не всей фразы: вариант
 * рисуется в отдельной клавише с numberOfLines={2}, и фраза вроде «делать
 * резервную копию» прекрасно переносится на вторую строку при обычном
 * размере — сжимать шрифт под её ОБЩУЮ длину, как для карточки, не нужно и
 * только портит читаемость. Единый размер на весь набор вариантов вопроса
 * считает вызывающий код (см. блок isChoice) — эта функция вызывается для
 * каждого варианта отдельно, а наименьший результат берётся общим.
 */
function fitOptionFontSize(text: string, base: number): number {
  const longestWord = text
    .split(/\s+/)
    .reduce((max, token) => Math.max(max, token.length), 0);
  let scale = 1;
  if (longestWord > 26) scale = 0.38;
  else if (longestWord > 20) scale = 0.44;
  else if (longestWord > 15) scale = 0.56;
  else if (longestWord > 11) scale = 0.7;
  else if (longestWord > 8) scale = 0.85;
  return Math.round(base * scale);
}

/** Межстрочный интервал, согласованный с fitFontSize. */
function fitLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.22);
}

/** Момент из ISO-строки как «в 14:32» — местное время устройства. */
function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Карточка аудирования — визуально дорожка аудиоплеера (та же порода, что у
 * components/InlineMediaPlayer): круглая кнопка воспроизведения слева и
 * столбики дорожки справа, а не одинокая кнопка-кружок посреди пустой
 * карточки. Нажать можно в любом месте карточки, а не только по кнопке —
 * тап по дорожке так же логично воспринимается как «включить звук».
 *
 * Настоящего события «озвучка началась/закончилась» наружу не прокинуто —
 * speakWord() «выстрелил и забыл» (см. hooks/useFlashcards.ts), поэтому
 * состояние playing — не более чем оценка по времени: сбрасывается коротким
 * таймером после тапа, чтобы кнопка на секунду показала «пауза», а дорожка —
 * «ожила», вместо статичной картинки без обратной связи.
 */
function AudioTrackCard({ colors, onPress }: { colors: any; onPress: () => void }) {
  const [playing, setPlaying] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePress = React.useCallback(() => {
    onPress();
    setPlaying(true);
    if (timer.current) clearTimeout(timer.current);
    // Слово короткое — секунды с небольшим достаточно, чтобы дорожка успела
    // «отыграть» визуально, не превращая это в точный таймер плеера.
    timer.current = setTimeout(() => setPlaying(false), 1300);
  }, [onPress]);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Высоты столбиков считаются один раз при монтировании: дорожка одного
  // слова не должна «перестраиваться» на каждый ре-рендер карточки.
  const bars = React.useMemo(
    () => Array.from({ length: 24 }, (_, i) => 5 + Math.abs(Math.sin(i * 0.85 + 1)) * 24),
    [],
  );

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Прослушать слово"
      style={{
        width: "100%", flexDirection: "row", alignItems: "center", gap: 14,
        backgroundColor: colors.accent, borderRadius: radii.lg,
        borderWidth: 1, borderColor: colors.primary + "33",
        paddingVertical: 16, paddingHorizontal: 16,
      }}
    >
      <LinearGradient
        colors={gradients.action as unknown as string[]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{
          width: 54, height: 54, borderRadius: 27,
          alignItems: "center", justifyContent: "center",
          shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35, shadowRadius: 14, elevation: 6,
        }}
      >
        <Glyph name={playing ? "pause" : "play"} size={22} color="#ffffff" />
      </LinearGradient>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 3, height: 34 }}>
        {bars.map((h, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: playing ? h : Math.max(5, h * 0.55),
              borderRadius: radii.pill,
              backgroundColor: playing ? colors.primary : colors.primary + "55",
            }}
          />
        ))}
      </View>
    </Pressable>
  );
}

export function WordTrainer({
  loader,
  title,
  onExit,
  onFinished,
}: {
  loader: () => Promise<TrainerQueue>;
  title?: string;
  onExit: () => void;
  /** Вызывается один раз после завершения сессии — обновить экраны со статистикой. */
  onFinished?: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // Фон тренажёра берём из палитры: экран открывается поверх общего градиента,
  // поэтому собственный оттенок должен совпадать с фирменным светлым.
  const background = colors.background;
  // «Верно» — фиолетовый success из палитры. Зелёного в продукте нет намеренно.
  const okColor = colors.success;

  const [queue, setQueue] = React.useState<TrainerQueue | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [items, setItems] = React.useState<QueueItem[]>([]);
  const [pos, setPos] = React.useState(0);
  /** Почему очередь пуста, если пуста — см. заголовок файла. */
  const [emptyInfo, setEmptyInfo] = React.useState<EmptyInfo>(null);

  // знакомство: перевод скрыт до нажатия
  const [revealed, setRevealed] = React.useState(false);
  // Что сейчас нарисовано на карточке знакомства: слово или перевод.
  // Отдельно от revealed — иначе перевод появлялся бы мгновенно, а не в
  // момент, когда карточка развёрнута к ученику ребром (середина поворота,
  // см. эффект-слушатель flip ниже).
  const [showTranslation, setShowTranslation] = React.useState(false);
  // Та же логика для карточки С ОТВЕТОМ: что сейчас показано — вопрос (буквы,
  // варианты, кнопка звука) или обратная сторона с итогом и полной
  // информацией о слове. См. эффект-слушатель answerFlip.
  const [showBack, setShowBack] = React.useState(false);
  // выбор варианта / сборка слова
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [built, setBuilt] = React.useState<number[]>([]);
  const [hintUsed, setHintUsed] = React.useState(false);
  const [attempts, setAttempts] = React.useState(1);

  // свободный ответ: письмо и произношение
  const [typed, setTyped] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [speakState, setSpeakState] = React.useState<SpeakState>("idle");
  /** Живая расшифровка во время записи: видно, что микрофон слышит. */
  const [partial, setPartial] = React.useState("");
  /** Итоговая расшифровка последней попытки. */
  const [heard, setHeard] = React.useState<string | null>(null);
  /** Подсказка под микрофоном: ничего не услышали, нет доступа и т. п. */
  const [micHint, setMicHint] = React.useState<string | null>(null);
  /** Микрофон недоступен или запрещён — карточка переходит на письменный ответ. */
  const [micBlocked, setMicBlocked] = React.useState(false);

  // итоги сессии
  const [answered, setAnswered] = React.useState(0);
  const [correctCount, setCorrectCount] = React.useState(0);
  // Копится молча в течение всей сессии, на экране не отображается ни разу —
  // видно его будет только на SessionSummary, когда сессия завершится.
  const [points, setPoints] = React.useState(0);
  const [learned, setLearned] = React.useState(0);
  const [progress, setProgress] = React.useState<{ wordsToday: number; dailyWordGoal: number } | null>(null);

  const shownAt = React.useRef<number>(Date.now());
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = React.useRef(false);
  /** Идущая запись речи: нужна, чтобы остановить её по кнопке «Стоп». */
  const speechRef = React.useRef<SpeechSession | null>(null);

  /**
   * Живая очередь.
   *
   * ГРАБЛИ. goNext раньше сравнивал позицию с items.length из замыкания. Стоит
   * вставить карточку в очередь — и замыкание держит старую длину: сессия
   * завершается на одну карточку раньше, а вставленный повтор никто не видит.
   * Поэтому длину и содержимое очереди читаем через ref, а состояние остаётся
   * только для отрисовки.
   */
  const itemsRef = React.useRef<QueueItem[]>([]);
  /** Слова, уже возвращённые за эту сессию: петля повторов недопустима. */
  const retriedRef = React.useRef<Map<number, number>>(new Map());

  // Лёгкий «вдох» карточки при появлении: только opacity и scale, чтобы
  // анимация ушла в нативный драйвер и не грузила JS-поток.
  const cardIn = React.useRef(new Animated.Value(0)).current;
  // Переворот карточки знакомства при показе перевода: 0 — лицом к ученику
  // (слово), 1 — тоже лицом (уже перевод), между ними карточка развёрнута
  // ребром.
  const flip = React.useRef(new Animated.Value(0)).current;
  // Тот же переворот, но для итога ответа во всех остальных упражнениях: 0 —
  // лицом к ученику (вопрос), 1 — тоже лицом (уже итог и полная информация о
  // слове).
  const answerFlip = React.useRef(new Animated.Value(0)).current;

  const item = items[pos];
  const card = item?.card;
  const isRetryCard = Boolean(item?.retry);
  const exercise: Exercise = card?.exercise ?? { type: "intro", prompt: card?.english ?? "" };
  const total = items.length;

  // Распознавание речи проверяем один раз: результат не меняется в течение
  // сессии, а вызов лезет в globalThis.
  const speechInput = React.useMemo(() => isSpeechInputAvailable(), []);

  /** Проиграть слово текущей карточки. Только по явному действию ученика. */
  const playWord = React.useCallback(() => {
    if (!card) return;
    speakWord(card.id, card.english);
  }, [card]);

  /**
   * Показать перевод — карточка знакомства переворачивается ЦЕЛИКОМ, а не
   * просто дорисовывает блок снизу. Слово меняется на перевод ровно в момент,
   * когда анимация доходит до середины (см. эффект-слушатель flip ниже): до
   * этого момента ученик видит слово, после — перевод, и одно не должно на
   * миг наложиться на другое.
   */
  const revealTranslation = React.useCallback(() => {
    if (revealed) return;
    setRevealed(true);
    flip.setValue(0);
    Animated.timing(flip, {
      toValue: 1,
      duration: 480,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: NATIVE_DRIVER,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  /**
   * Запустить переворот карточки к обратной стороне — итогу ответа и полной
   * информации о слове. Вызывается ТОЛЬКО при окончательном ответе:
   * промежуточная реакция на первую ошибку в сборке слова (retryBuild)
   * карточку не переворачивает — это ещё не ответ, а приглашение попробовать
   * заново, и собранные буквы должны остаться на виду.
   */
  const triggerAnswerFlip = React.useCallback(() => {
    answerFlip.setValue(0);
    Animated.timing(answerFlip, {
      toValue: 1,
      duration: 480,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: NATIVE_DRIVER,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Обновить очередь сразу и в ref, и в состоянии. */
  const applyItems = React.useCallback((next: QueueItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  // ── загрузка очереди ──
  React.useEffect(() => {
    let alive = true;
    loader()
      .then((q) => {
        if (!alive) return;
        setQueue(q);
        const next = (q.cards ?? []).map((c) => ({ card: c, retry: false }));
        itemsRef.current = next;
        retriedRef.current = new Map();
        setItems(next);
        if (q.wordsToday !== undefined && q.dailyWordGoal !== undefined) {
          setProgress({ wordsToday: q.wordsToday, dailyWordGoal: q.dailyWordGoal });
        }
        setEmptyInfo(next.length === 0 ? { reason: q.emptyReason, nextDueAt: q.nextDueAt } : null);
        setPhase(next.length === 0 ? "done" : "run");
      })
      .catch(() => alive && setError("Не удалось загрузить слова."));
    return () => { alive = false; };
  }, [loader]);

  // Уходя с тренажёра, обрываем таймер перелистывания, звук и микрофон: иначе
  // слово продолжает звучать (или запись идёт) уже на другом экране.
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    stopSpeaking();
    cancelListening();
  }, []);

  // Появление новой карточки.
  React.useEffect(() => {
    cardIn.setValue(0);
    Animated.timing(cardIn, {
      toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [pos, phase]);

  // Слово меняется на перевод в тот момент, когда карточка знакомства
  // развёрнута к ученику ребром (середина поворота) — не раньше, иначе
  // перевод было бы видно ДО того, как карточка перевернулась.
  React.useEffect(() => {
    const id = flip.addListener(({ value }) => {
      if (value >= 0.5) setShowTranslation(true);
    });
    return () => flip.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Тот же приём для итога ответа: обратная сторона появляется ровно в
  // середине поворота, не раньше.
  React.useEffect(() => {
    const id = answerFlip.addListener(({ value }) => {
      if (value >= 0.5) setShowBack(true);
    });
    return () => answerFlip.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ЕДИНСТВЕННАЯ автоматическая озвучка: показ карточки. Слово ребёнок должен
  // услышать, а в аудировании это вообще единственная подсказка.
  //
  // В typeEn, build и speak озвучки НЕТ намеренно: там ребёнок сам вспоминает,
  // как слово звучит и пишется, — подсказка убила бы упражнение.
  React.useEffect(() => {
    if (phase !== "run" || !card) return;
    shownAt.current = Date.now();
    if (!speechAvailable()) return;
    if (exercise.type === "intro" || exercise.type === "choiceRu" || exercise.type === "listen" || exercise.type === "typeRu") {
      speakWord(card.id, card.english);
    }
    // Смена карточки обрывает её озвучку — новое слово не должно накладываться
    // на предыдущее, даже если mp3 предыдущего ещё качается.
    return () => stopSpeaking();
  }, [phase, pos, card?.id]);

  React.useEffect(() => {
    if (phase === "done" && !finishedRef.current) {
      finishedRef.current = true;
      onFinished?.();
    }
  }, [phase, onFinished]);

  const resetCardState = React.useCallback(() => {
    setRevealed(false);
    setShowTranslation(false);
    flip.setValue(0);
    setShowBack(false);
    answerFlip.setValue(0);
    setFeedback(null);
    setBuilt([]);
    setHintUsed(false);
    setAttempts(1);
    setTyped("");
    setChecking(false);
    setSpeakState("idle");
    setPartial("");
    setHeard(null);
    setMicHint(null);
    setMicBlocked(false);
    speechRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goNext = React.useCallback(() => {
    stopSpeaking(); // звук предыдущей карточки не тянем на следующую
    cancelListening();
    resetCardState();
    setPos((prev) => {
      const next = prev + 1;
      // Длину берём из ref: в состоянии она могла ещё не обновиться после
      // вставки повтора.
      if (next >= itemsRef.current.length) {
        setPhase("done");
        return prev;
      }
      return next;
    });
  }, [resetCardState]);

  /**
   * Поставить слово обратно в очередь — через RETRY_GAP карточек.
   *
   * Возврат ровно один на слово: иначе на трудном слове сессия закольцуется.
   * Упражнение берём то же самое: смысл повтора в том, чтобы ребёнок сделал
   * ровно то, что не получилось, пока помнит верный ответ.
   */
  const scheduleRetry = React.useCallback((wordId: number) => {
    const used = retriedRef.current.get(wordId) ?? 0;
    if (used >= RETRY_LIMIT_PER_WORD) return;

    const queueNow = itemsRef.current;
    const current = queueNow[pos];
    if (!current) return;

    retriedRef.current.set(wordId, used + 1);
    const at = Math.min(queueNow.length, pos + 1 + RETRY_GAP);
    const next = [
      ...queueNow.slice(0, at),
      { card: current.card, retry: true },
      ...queueNow.slice(at),
    ];
    applyItems(next);
  }, [pos, applyItems]);

  /**
   * Тап по «Дальше»: обрываем звук и листаем сразу, не дожидаясь таймера (он
   * есть только у верного ответа).
   */
  const skipToNext = React.useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    goNext();
  }, [goNext]);

  /**
   * Отправить результат карточки на сервер.
   *
   * delay = null означает «карточку не листать»: так работает разбор ошибки —
   * ученик уходит дальше сам, когда прочитал верный ответ.
   *
   * СЧЁТЧИКИ ИТОГОВ НЕ ВИДЯТ ПОВТОРОВ. Точность — это доля верных ответов с
   * первого раза. Если засчитывать вторую попытку, цифра перестанет что-либо
   * значить, а «слов пройдено» превратится в «показов карточек». На сервер
   * повтор при этом уходит как обычный ответ: для интервального повторения он
   * настоящий.
   */
  const submit = React.useCallback(
    (
      payload: { correct: boolean } | { grade: Grade },
      mode: ExerciseType,
      delay: number | null,
      attemptsOverride?: number,
    ) => {
      if (!card) return;
      const isCorrect = "correct" in payload ? payload.correct : payload.grade !== "again";

      if (!isRetryCard) {
        setAnswered((n) => n + 1);
        if (isCorrect) setCorrectCount((n) => n + 1);
        // Ошибку возвращаем в эту же сессию, пока верный ответ на экране.
        if (!isCorrect) scheduleRetry(card.id);
      }

      const body = "correct" in payload
        ? {
          answer: {
            correct: payload.correct,
            attempts: attemptsOverride ?? attempts,
            elapsedMs: Date.now() - shownAt.current,
            hintUsed,
          },
          mode,
        }
        : { grade: payload.grade, mode };

      fc.review(card.id, body)
        .then((out) => {
          setPoints((p) => p + (out.pointsEarned ?? 0));
          if (out.justLearned) setLearned((n) => n + 1);
          if (out.dailyWordGoal !== undefined) {
            setProgress({ wordsToday: out.wordsToday, dailyWordGoal: out.dailyWordGoal });
          }
        })
        .catch(() => { /* сеть могла мигнуть — тренировку не прерываем */ });

      if (timer.current) clearTimeout(timer.current);
      timer.current = delay === null ? null : setTimeout(goNext, delay);
    },
    [card, isRetryCard, attempts, hintUsed, goNext, scheduleRetry],
  );

  // ── обработчики упражнений ──
  //
  // Ни один из них НЕ озвучивает слово: автоматический звук в приложении
  // ровно один — при появлении карточки. Услышать верное слово после ответа
  // можно кнопкой «Прослушать» на обратной стороне карточки.
  //
  // Каждый обработчик, который завершает ответ ОКОНЧАТЕЛЬНО (не промежуточная
  // реакция вроде retryBuild), сразу после setFeedback запускает
  // triggerAnswerFlip() — карточка переворачивается к итогу.
  const pickOption = React.useCallback((index: number) => {
    if (feedback || !card) return;
    const correct = index === exercise.answerIndex;
    setFeedback({ correct, picked: index });
    triggerAnswerFlip();
    // Ошибка ждёт ученика: карточку не листаем.
    submit({ correct }, exercise.type, correct ? NEXT_DELAY_OK : null);
  }, [feedback, card, exercise, submit, triggerAnswerFlip]);

  const answerLetters = React.useMemo(() => (exercise.answer ?? "").toLowerCase().split(""), [exercise.answer]);
  const builtWord = built.map((i) => exercise.letters?.[i] ?? "").join("");

  const tapLetter = React.useCallback((index: number) => {
    if (feedback) return;
    const letters = exercise.letters ?? [];
    const next = [...built, index];
    setBuilt(next);
    if (next.length < answerLetters.length) return;

    const word = next.map((i) => letters[i] ?? "").join("");
    const correct = word === answerLetters.join("");
    if (!correct && attempts < 2) {
      // первая ошибка в сборке — даём собрать заново, оценка станет «трудно».
      // Это НЕ окончательный ответ: карточка не переворачивается, короткая
      // надпись остаётся на лицевой стороне рядом со собранными буквами.
      setAttempts(2);
      setBuilt([]);
      setFeedback({ correct: false, retryBuild: true });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setFeedback(null), 900);
      return;
    }
    setFeedback({ correct });
    triggerAnswerFlip();
    submit({ correct }, "build", correct ? NEXT_DELAY_OK : null);
  }, [feedback, exercise.letters, built, answerLetters, attempts, submit, triggerAnswerFlip]);

  const undoLetter = React.useCallback(() => {
    if (feedback) return;
    setBuilt((b) => b.slice(0, -1));
  }, [feedback]);

  const showHint = React.useCallback(() => {
    setHintUsed(true);
    setAttempts((a) => Math.max(a, 2));
  }, []);

  /**
   * «Не знаю»: ученик честно признаётся, что не помнит слово.
   *
   * Показываем верный ответ и засчитываем полный промах — попыток отдаём
   * максимум, чтобы система повторений вернула слово скоро. Карточку не
   * листаем: ученик впервые видит ответ, ему нужно время. Звук не запускаем —
   * на обратной стороне рядом с ответом стоит кнопка «Прослушать».
   */
  const giveUp = React.useCallback((mode: ExerciseType) => {
    if (!card || feedback) return;
    cancelListening();
    speechRef.current = null;
    const expected = exercise.answer ?? exercise.options?.[exercise.answerIndex ?? 0] ?? "";
    setFeedback({ correct: false, gaveUp: true, note: `Правильный ответ: ${expected}` });
    triggerAnswerFlip();
    submit({ correct: false }, mode, null, 3);
  }, [card, feedback, exercise.answer, exercise.options, exercise.answerIndex, submit, triggerAnswerFlip]);

  /** Показать вердикт сервера по свободному ответу. */
  const applyVerdict = React.useCallback(
    (verdict: AnswerCheck, mode: ExerciseType, usedAttempts: number, wrongNote?: string) => {
      const expected = verdict.expected?.[0] ?? exercise.answer ?? "";
      setFeedback({
        correct: verdict.correct,
        typo: verdict.typo,
        // Опечатку показываем отдельной строкой: ответ принят, но написание надо
        // запомнить правильное.
        note: verdict.correct
          ? (verdict.typo ? `Правильно пишется: ${expected}` : undefined)
          : wrongNote ?? `Правильный ответ: ${expected}`,
      });
      triggerAnswerFlip();
      submit(
        { correct: verdict.correct },
        mode,
        verdict.correct ? (verdict.typo ? NEXT_DELAY_TYPO : NEXT_DELAY_OK) : null,
        usedAttempts,
      );
    },
    [exercise.answer, submit, triggerAnswerFlip],
  );

  /** Ответ не проверен: сеть мигнула. В оценку не идёт, листается сам. */
  const skipUnchecked = React.useCallback(() => {
    setFeedback({ correct: true, info: true, note: `Правильный ответ: ${exercise.answer ?? ""}` });
    triggerAnswerFlip();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(goNext, NEXT_DELAY_INFO);
  }, [exercise.answer, goNext, triggerAnswerFlip]);

  /**
   * Письменный ответ: отправляем на проверку серверу.
   *
   * Режим считаем от языка ответа, а не «typeEn или иначе typeRu»: у запасного
   * сценария произношения (микрофон недоступен) тип упражнения speak, но пишет
   * ученик по-английски. Со старым условием сервер сверял английское слово со
   * списком русских переводов и всегда возвращал ошибку.
   */
  const submitTyped = React.useCallback(async () => {
    if (!card || feedback || checking) return;
    const value = typed.trim();
    if (!value) return;
    const mode: "typeRu" | "typeEn" = exercise.type === "typeRu" ? "typeRu" : "typeEn";
    setChecking(true);
    try {
      const verdict = await fc.checkAnswer(card.id, mode, value);
      applyVerdict(verdict, mode, attempts);
    } catch {
      // Сеть могла мигнуть. Засчитывать ошибку за это нельзя: ребёнок не виноват.
      skipUnchecked();
    } finally {
      setChecking(false);
    }
  }, [card, feedback, checking, typed, exercise.type, attempts, applyVerdict, skipUnchecked]);

  /** Итог записи: пришёл после того, как ученик нажал «Стоп». */
  const handleSpeechResult = React.useCallback(async (result: SpeechResult) => {
    speechRef.current = null;
    setPartial("");

    // Микрофона нет или браузер не дал доступ. Это не ошибка ученика и не повод
    // засчитывать промах: карточка переходит на письменный ответ.
    if (!result.ok && (result.reason === "unavailable" || result.reason === "denied")) {
      setSpeakState("idle");
      setMicBlocked(true);
      setHeard(null);
      setMicHint(result.reason === "denied"
        ? "Нет доступа к микрофону. Напиши слово по-английски."
        : "Микрофон недоступен на этом устройстве. Напиши слово по-английски.");
      return;
    }

    const transcript = result.ok ? result.transcript : "";
    if (!transcript) {
      // Ничего не прозвучало. Попытку НЕ тратим: сгоревшие «за молчание»
      // попытки — ровно то, из-за чего упражнение было непроходимым.
      setSpeakState("idle");
      setHeard(null);
      setMicHint("Ничего не услышал. Нажми на микрофон, скажи слово и нажми «Стоп».");
      return;
    }

    if (!card) {
      setSpeakState("idle");
      return;
    }

    setHeard(transcript);
    setMicHint(null);
    setSpeakState("checking");

    try {
      const verdict = await fc.checkAnswer(card.id, "speak", transcript, attempts);
      if (!verdict.correct && verdict.retry) {
        // Попытки ещё есть: это не ошибка, а просьба повторить.
        setAttempts((a) => a + 1);
        setSpeakState("idle");
        setMicHint("Пока не то. Послушай слово и попробуй ещё раз.");
        return;
      }
      applyVerdict(
        verdict,
        "speak",
        attempts,
        `Верное произношение: ${exercise.answer ?? ""}`,
      );
    } catch {
      skipUnchecked();
    } finally {
      setSpeakState((s) => (s === "checking" ? "idle" : s));
    }
  }, [card, attempts, exercise.answer, applyVerdict, skipUnchecked]);

  /** Начать запись. Останавливает её сам ученик кнопкой «Стоп». */
  const beginListening = React.useCallback(() => {
    if (!card || feedback || speakState !== "idle") return;
    // Озвучка не должна попасть в микрофон.
    stopSpeaking();
    setHeard(null);
    setMicHint(null);
    setPartial("");
    setSpeakState("listening");
    speechRef.current = startListening({
      lang: "en-US",
      onPartial: setPartial,
      onDone: (result) => { void handleSpeechResult(result); },
    });
  }, [card, feedback, speakState, handleSpeechResult]);

  /** «Стоп»: закончить запись и отправить услышанное на проверку. */
  const finishListening = React.useCallback(() => {
    const session = speechRef.current;
    if (!session) return;
    // Последний кусок расшифровки приходит уже после stop() — до него держим
    // «Проверяю…», чтобы кнопку нельзя было нажать дважды.
    setSpeakState("checking");
    session.stop();
  }, []);

  /** Не получается произнести — показываем ответ и ждём ученика. */
  const skipSpeaking = React.useCallback(() => {
    if (!card || feedback) return;
    cancelListening();
    speechRef.current = null;
    setFeedback({
      correct: false,
      gaveUp: true,
      note: `Верное произношение: ${exercise.answer ?? ""}`,
    });
    triggerAnswerFlip();
    submit({ correct: false }, "speak", null, exercise.maxAttempts ?? 3);
  }, [card, feedback, exercise.answer, exercise.maxAttempts, submit, triggerAnswerFlip]);

  // ── экраны состояний ──
  if (error) {
    return (
      <Centered background={background}>
        <Glyph name="alert" size={40} color={colors.destructive} />
        <Text style={{ color: colors.foreground, textAlign: "center", marginTop: 12, fontSize: 15 }}>{error}</Text>
        <ChunkyButton label="Закрыть" icon="close" onPress={onExit} style={{ alignSelf: "stretch", marginTop: 20 }} />
      </Centered>
    );
  }

  if (phase === "loading") {
    return <Centered background={background}><ActivityIndicator size="large" color={colors.primary} /></Centered>;
  }

  if (phase === "done") {
    return (
      <SessionSummary
        colors={colors}
        insets={insets}
        background={background}
        answered={answered}
        correctCount={correctCount}
        points={points}
        learned={learned}
        progress={progress}
        emptyQueue={total === 0}
        emptyInfo={emptyInfo}
        onExit={onExit}
      />
    );
  }

  const isIntro = exercise.type === "intro";
  const isBuild = exercise.type === "build";
  const isListen = exercise.type === "listen";
  const isTyping = exercise.type === "typeRu" || exercise.type === "typeEn";
  const isSpeak = exercise.type === "speak";
  const isChoice = !isIntro && !isBuild && !isTyping && !isSpeak;
  const promptLabel = PROMPT_LABEL[exercise.type];
  /** Микрофон в этой карточке рабочий: есть в системе и не запрещён. */
  const micUsable = speechInput && !micBlocked;
  const maxSpeakAttempts = exercise.maxAttempts ?? 3;

  /**
   * Как показать итог ответа. Пять состояний, и каждое должно звучать по-своему:
   * «неверно» и «ты не знал» — разные вещи, а несостоявшаяся проверка вообще не
   * оценка.
   *
   * Для retryBuild этот вариант вычисляется, но не используется в разметке
   * ниже: за него карточка не переворачивается (см. triggerAnswerFlip), а
   * короткая надпись на лицевой стороне рисуется отдельно, без иконки.
   */
  const verdict = !feedback ? null
    : feedback.retryBuild
      ? { color: colors.warning, icon: "repeat" as GlyphName, title: "Почти! Собери ещё раз", detail: undefined as string | undefined }
    : feedback.info
      ? { color: colors.warning, icon: "alert" as GlyphName, title: "Не удалось проверить", detail: feedback.note }
    : feedback.gaveUp
      ? { color: colors.warning, icon: "help" as GlyphName, title: "Запомни это слово", detail: feedback.note }
    : feedback.correct
      ? (feedback.typo
        ? { color: colors.warning, icon: "check" as GlyphName, title: "Почти верно", detail: feedback.note }
        : { color: okColor, icon: "check" as GlyphName, title: "Верно!", detail: undefined as string | undefined })
    : {
        color: colors.destructive,
        icon: "close" as GlyphName,
        title: "Неверно",
        detail: feedback.note ?? `Правильный ответ: ${exercise.options?.[exercise.answerIndex ?? 0] ?? exercise.answer ?? ""}`,
      };

  /**
   * Кнопка «Дальше» есть только там, где карточка сама не листается: после
   * ошибки и после «Не знаю». Верный ответ разбирать нечего — он уходит сам,
   * и кнопка под ним была мебелью.
   */
  const needsNextButton = Boolean(feedback && !feedback.retryBuild && !feedback.info && !feedback.correct);

  /**
   * Кнопка «Прослушать» на обратной стороне карточки.
   *
   * Заменяет автоматическую озвучку после ответа: слово звучит, только когда
   * ученик сам этого захотел. У промежуточной подсказки в сборке её нет — там
   * карточка вообще не переворачивается (см. triggerAnswerFlip).
   */
  const canReplayAnswer = Boolean(feedback && !feedback.retryBuild) && speechAvailable();

  /** Поле письменного ответа: используется и в typeRu/typeEn, и как запасной
      сценарий произношения. */
  const typingBlock = (placeholder: string) => (
    <>
      <TextInput
        value={typed}
        onChangeText={setTyped}
        onSubmitEditing={submitTyped}
        editable={!checking}
        autoCapitalize="none"
        autoCorrect={false}
        // Автоподсказки клавиатуры сделали бы упражнение бессмысленным:
        // телефон допишет слово за ребёнка.
        autoComplete="off"
        spellCheck={false}
        returnKeyType="done"
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel="Поле ответа"
        style={{
          backgroundColor: colors.card,
          borderWidth: 2, borderColor: typed.trim() ? colors.primary : colors.border,
          borderRadius: radii.md, paddingHorizontal: 16, paddingVertical: 15,
          fontSize: 19, fontWeight: "700", color: colors.foreground,
        }}
      />
      <ChunkyButton
        label={checking ? "Проверяем…" : "Проверить"}
        icon="check"
        onPress={submitTyped}
        disabled={checking || !typed.trim()}
        style={{ marginTop: 12 }}
      />
      {/* Выход из незнакомого слова: честное «не знаю» вместо набитых наугад
          букв. Ответ показывается, а услышать его можно кнопкой рядом. */}
      <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "flex-start", marginTop: 4 }}>
        <SmallButton
          icon="help"
          label="Не знаю"
          onPress={() => giveUp(exercise.type)}
          colors={colors}
          disabled={checking}
        />
      </View>
    </>
  );

  /** Лицевая сторона карточки знакомства: слово, транскрипция, звук. */
  const introFront = (
    <>
      {!!card?.emoji && <Text style={{ fontSize: 64 }}>{card.emoji}</Text>}
      <Text
        style={{
          fontSize: fitFontSize(exercise.prompt, 34),
          lineHeight: fitLineHeight(fitFontSize(exercise.prompt, 34)),
          fontWeight: "900", letterSpacing: -0.5,
          color: colors.foreground, textAlign: "center", marginTop: card?.emoji ? 6 : 0,
          width: "100%", flexShrink: 1,
        }}
        numberOfLines={3}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {exercise.prompt}
      </Text>
      {!!card?.ipa && (
        <Text style={{ fontSize: 16, color: colors.mutedForeground, marginTop: 6 }}>{card.ipa}</Text>
      )}
      {speechAvailable() && (
        <TouchableOpacity
          onPress={playWord}
          activeOpacity={0.8}
          style={{
            flexDirection: "row", alignItems: "center", gap: 7,
            backgroundColor: colors.primary + "18", borderRadius: radii.pill,
            paddingHorizontal: 15, paddingVertical: 9, marginTop: 12,
          }}
        >
          <Glyph name="sound" size={18} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "800" }}>Прослушать</Text>
        </TouchableOpacity>
      )}
    </>
  );

  /** Обратная сторона карточки знакомства: перевод, часть речи, пример. */
  const introTranslationText = card?.translationsRu?.join(", ") ?? "";
  const introBack = (
    <View style={{ width: "100%", alignItems: "center" }}>
      {!!card?.emoji && <Text style={{ fontSize: 44 }}>{card.emoji}</Text>}
      <Text
        style={{
          fontSize: fitFontSize(exercise.prompt, 34),
          lineHeight: fitLineHeight(fitFontSize(exercise.prompt, 34)),
          fontWeight: "900", letterSpacing: -0.5,
          color: colors.foreground, textAlign: "center", marginTop: card?.emoji ? 6 : 0,
          width: "100%", flexShrink: 1,
        }}
        numberOfLines={3}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {exercise.prompt}
      </Text>
      {!!introTranslationText && (
        <Text
          style={{
            fontSize: fitFontSize(introTranslationText, 24),
            lineHeight: fitLineHeight(fitFontSize(introTranslationText, 24)),
            fontWeight: "900", color: colors.primary, textAlign: "center", marginTop: 12,
            width: "100%", flexShrink: 1,
          }}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {introTranslationText}
        </Text>
      )}
      {!!card?.partOfSpeech && (
        <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", marginTop: 4, textTransform: "capitalize" }}>
          {card.partOfSpeech}
        </Text>
      )}
      {!!card?.exampleEn && (
        <View style={{ marginTop: 14, width: "100%", backgroundColor: colors.accent, borderRadius: radii.sm + 2, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 15, color: colors.foreground, fontStyle: "italic" }}>{card.exampleEn}</Text>
            {speechAvailable() && (
              // У примера-предложения нет своего wordId — озвучиваем текст
              // напрямую через /api/tts?text=... (см. speakWord).
              <Pressable onPress={() => speakWord(undefined, card.exampleEn!)} hitSlop={8} accessibilityLabel="Прослушать пример">
                <Glyph name="sound" size={18} color={colors.primary} />
              </Pressable>
            )}
          </View>
          {!!card.exampleRu && <Text style={{ marginTop: 6, fontSize: 14, color: colors.mutedForeground }}>{card.exampleRu}</Text>}
        </View>
      )}
    </View>
  );

  /** Лицевая сторона белой карточки для всех упражнений, кроме знакомства. */
  const answerFront = (
    <>
      {isListen ? (
        // Карточка выглядит как дорожка аудиоплеера (AudioTrackCard выше), а не
        // одинокая кнопка-кружок. Тап работает по всей карточке, не только по
        // кнопке слева — под капотом всё тот же playWord().
        <AudioTrackCard colors={colors} onPress={playWord} />
      ) : (
        <>
          <Text
            style={{
              fontSize: fitFontSize(exercise.prompt, 34),
              lineHeight: fitLineHeight(fitFontSize(exercise.prompt, 34)),
              fontWeight: "900", letterSpacing: -0.5,
              color: colors.foreground, textAlign: "center",
              width: "100%", flexShrink: 1,
            }}
            numberOfLines={3}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {exercise.prompt}
          </Text>
          {(exercise.type === "choiceRu" || isSpeak) && !!card?.ipa && (
            <Text style={{ fontSize: 16, color: colors.mutedForeground, marginTop: 6 }}>{card.ipa}</Text>
          )}
          {exercise.type === "choiceRu" && speechAvailable() && (
            <TouchableOpacity
              onPress={playWord}
              activeOpacity={0.8}
              style={{
                flexDirection: "row", alignItems: "center", gap: 7,
                backgroundColor: colors.primary + "18", borderRadius: radii.pill,
                paddingHorizontal: 15, paddingVertical: 9, marginTop: 12,
              }}
            >
              <Glyph name="sound" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "800" }}>Прослушать</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* сборка слова: что уже собрано */}
      {isBuild && (
        <View style={{ width: "100%", marginTop: 18, alignItems: "center" }}>
          <View
            style={{
              minHeight: 54, width: "100%", borderRadius: radii.sm + 2, borderWidth: 2, borderStyle: "dashed",
              borderColor: verdict?.color ?? "rgba(99,102,241,0.35)",
              alignItems: "center", justifyContent: "center", paddingHorizontal: 10,
            }}
          >
            <Text
              style={{
                fontSize: fitFontSize(builtWord || answerLetters.join(""), 26),
                fontWeight: "900", letterSpacing: 2,
                color: colors.foreground,
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {builtWord || "…"}
            </Text>
          </View>
          {hintUsed && !feedback && (
            <Text style={{ marginTop: 8, fontSize: 15, color: colors.mutedForeground, letterSpacing: 2 }}>
              {answerLetters.map((l, i) => (i === 0 ? l : "•")).join(" ")}
            </Text>
          )}
          {/* Первая ошибка в сборке — карточка НЕ переворачивается (это ещё не
              окончательный ответ), поэтому короткая реакция остаётся здесь же,
              на лицевой стороне, рядом со собранными буквами. */}
          {feedback?.retryBuild && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }}>
              <Glyph name="repeat" size={16} color={colors.warning} />
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.warning }}>
                Почти! Собери ещё раз
              </Text>
            </View>
          )}
        </View>
      )}
    </>
  );

  /**
   * Обратная сторона белой карточки: полная информация о слове + итог ответа.
   * Появляется для любого ОКОНЧАТЕЛЬНОГО ответа (verdict есть и это не
   * промежуточная реакция retryBuild — за неё карточка не переворачивается).
   */
  const answerBack = verdict && !feedback?.retryBuild ? (
    <>
      {!!card?.emoji && <Text style={{ fontSize: 44 }}>{card.emoji}</Text>}
      <Text
        style={{
          fontSize: fitFontSize(card?.english ?? "", 26),
          lineHeight: fitLineHeight(fitFontSize(card?.english ?? "", 26)),
          fontWeight: "900", letterSpacing: -0.5,
          color: colors.foreground, textAlign: "center", marginTop: card?.emoji ? 6 : 0,
          width: "100%", flexShrink: 1,
        }}
        numberOfLines={3}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {card?.english}
      </Text>
      {!!card?.ipa && (
        <Text style={{ fontSize: 15, color: colors.mutedForeground, marginTop: 4 }}>{card.ipa}</Text>
      )}
      {!!card?.translationsRu?.length && (
        <Text
          style={{
            fontSize: fitFontSize(card.translationsRu.join(", "), 20),
            lineHeight: fitLineHeight(fitFontSize(card.translationsRu.join(", "), 20)),
            fontWeight: "900", color: colors.primary, textAlign: "center", marginTop: 8,
            width: "100%", flexShrink: 1,
          }}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {card.translationsRu.join(", ")}
        </Text>
      )}
      {!!card?.partOfSpeech && (
        <Text style={{ fontSize: 12.5, color: colors.mutedForeground, textAlign: "center", marginTop: 3, textTransform: "capitalize" }}>
          {card.partOfSpeech}
        </Text>
      )}
      {!!card?.exampleEn && (
        <View style={{ marginTop: 12, width: "100%", backgroundColor: colors.accent, borderRadius: radii.sm + 2, padding: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 14, color: colors.foreground, fontStyle: "italic" }}>{card.exampleEn}</Text>
            {speechAvailable() && (
              // У примера-предложения нет своего wordId — озвучиваем текст
              // напрямую через /api/tts?text=... (см. speakWord).
              <Pressable onPress={() => speakWord(undefined, card.exampleEn!)} hitSlop={8} accessibilityLabel="Прослушать пример">
                <Glyph name="sound" size={17} color={colors.primary} />
              </Pressable>
            )}
          </View>
          {!!card.exampleRu && <Text style={{ marginTop: 5, fontSize: 13, color: colors.mutedForeground }}>{card.exampleRu}</Text>}
        </View>
      )}

      {/* ИТОГ ОТВЕТА — теперь на обратной стороне карточки, вместе с полной
          информацией о слове: перевернул — и сразу видно и что ответил, и что
          было правильно. */}
      <View style={{
        width: "100%", marginTop: 16, paddingTop: 14,
        borderTopWidth: 1, borderTopColor: colors.border,
        alignItems: "center",
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          {/* Цвет состояния — в круглом значке, а не заливкой под текстом:
              контраст заголовка не должен зависеть от исхода ответа. */}
          <View style={{
            width: 28, height: 28, borderRadius: 14,
            alignItems: "center", justifyContent: "center",
            backgroundColor: verdict.color,
          }}>
            <Glyph name={verdict.icon} size={17} color="#ffffff" />
          </View>
          <Text style={{ fontSize: 18, fontWeight: "900", color: verdict.color, flexShrink: 1 }}>
            {verdict.title}
          </Text>
        </View>
        {!!verdict.detail && (
          <Text style={{
            marginTop: 9, fontSize: 15, fontWeight: "800", lineHeight: 22,
            color: colors.foreground, textAlign: "center",
          }}>
            {verdict.detail}
          </Text>
        )}
        {/* Обещание вернуть слово: ребёнок должен знать, что промах не
            «списан», а отработается прямо сейчас. */}
        {!feedback?.correct && !feedback?.info && !isRetryCard && (
          <Text style={{ marginTop: 8, fontSize: 12.5, color: colors.mutedForeground, textAlign: "center" }}>
            Это слово вернётся через пару карточек
          </Text>
        )}
        {/* Звук после ответа — только по нажатию. Автоматически слово
            больше не проигрывается: см. шапку файла. */}
        {canReplayAnswer && (
          <TouchableOpacity
            onPress={playWord}
            activeOpacity={0.8}
            accessibilityLabel="Прослушать слово"
            style={{
              flexDirection: "row", alignItems: "center", gap: 7,
              backgroundColor: colors.primary + "18", borderRadius: radii.pill,
              paddingHorizontal: 15, paddingVertical: 9, marginTop: 12,
            }}
          >
            <Glyph name="sound" size={17} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 13.5 }}>Прослушать</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  ) : null;

  // Какое анимированное значение крутит карточку в этом кадре: у знакомства —
  // свой flip (слово ↔ перевод), у всех остальных упражнений — answerFlip
  // (вопрос ↔ итог ответа). Ровно ОДНО из двух активно в любой момент — второе
  // всегда стоит на 0 (см. resetCardState), поэтому подставлять именно нужное
  // значение безопасно.
  const activeFlip = isIntro ? flip : answerFlip;
  const cardRotateY = activeFlip.interpolate({
    inputRange: [0, 0.5, 0.5001, 1],
    outputRange: ["0deg", "90deg", "-90deg", "0deg"],
  });
  // Небольшое сжатие по вертикали на пике поворота — без него в вебе (там нет
  // настоящей перспективы камеры) переворот на миг выглядит плоским.
  const cardFlipScaleY = activeFlip.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.94, 1],
  });

  return (
    <View style={{ flex: 1, backgroundColor: background, paddingTop: insets.top + 8 }}>
      {/* шапка: выход, счётчик, прогресс. Опыт здесь НЕ показывается — см.
          комментарий в шапке файла: копится молча, виден только на итогах. */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <Pressable onPress={onExit} hitSlop={10} style={{ padding: 8 }} accessibilityLabel="Закрыть тренировку">
          <Glyph name="close" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: colors.mutedForeground, fontWeight: "800", fontSize: 13, fontVariant: ["tabular-nums"] }}>
            {title ?? queue?.deckTitle ?? "Слова"} · {Math.min(pos + 1, total)}/{total}
          </Text>
          {/* Прогресс сессии — та же полоса, что у XP: один язык на весь продукт. */}
          <XpBar
            progress={total > 0 ? Math.min(1, pos / total) : 0}
            height={7}
            shine={false}
            style={{ width: 150, marginTop: 6 }}
          />
        </View>
        {/* Пустой спейсер той же ширины, что и кнопка закрытия слева: заголовок
            остаётся по центру. Раньше здесь стоял живой счётчик «+N очков». */}
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: Math.max(insets.bottom, 12) + BOTTOM_SAFE_SPACE,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Метка повтора: без неё непонятно, почему слово вернулось так скоро. */}
        {isRetryCard ? (
          <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 8 }}>
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 6,
              backgroundColor: colors.warning + "1f",
              borderRadius: radii.pill,
              paddingHorizontal: 12, paddingVertical: 5,
            }}>
              <Glyph name="repeat" size={13} color={colors.warning} />
              <Text style={{ fontSize: 11.5, fontWeight: "900", color: colors.warning }}>
                Повтор — это слово только что не получилось
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={{ fontSize: 11, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 1.2, textAlign: "center" }}>
          {promptLabel}
        </Text>

        {/* задание: КАРТОЧКА ЦЕЛИКОМ — фон, рамка и тень — крутится по Y. То, что
            внутри (введение/вопрос против перевода/итога), просто подставляется
            в момент, когда карточка развёрнута ребром — см. cardRotateY выше и
            эффекты-слушатели flip/answerFlip. Раньше вращался только текст
            внутри неподвижной белой плашки.

            minHeight + justifyContent: "center" — карточка занимает заметную
            долю экрана даже на коротких упражнениях (см. CARD_MIN_HEIGHT выше),
            а её содержимое стоит по центру, а не жмётся к верхнему краю. */}
        <Animated.View
          style={{
            backgroundColor: colors.card, borderRadius: radii.lg,
            borderWidth: 1, borderColor: colors.border,
            padding: 24, marginTop: 12, alignItems: "center", justifyContent: "center",
            minHeight: CARD_MIN_HEIGHT,
            // Цветная тень вместо серой: карточка «висит» над фоном.
            shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.16, shadowRadius: 22, elevation: 6,
            opacity: cardIn,
            transform: [
              { perspective: 900 },
              { rotateY: cardRotateY },
              { scaleY: cardFlipScaleY },
              { scale: cardIn.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
            ],
          }}
        >
          {isIntro ? (
            !showTranslation ? introFront : introBack
          ) : (
            !showBack ? answerFront : answerBack
          )}
        </Animated.View>

        {/* «Дальше» стоит сразу под карточкой, а не в конце экрана: после ошибки
            это единственное действие, и до него не должно быть скролла. */}
        {needsNextButton && (
          <ChunkyButton
            label="Дальше"
            icon="arrowRight"
            center
            onPress={skipToNext}
            style={{ marginTop: 16 }}
          />
        )}

        {/* варианты ответа: один общий кегль на весь набор — считаем через
            fitOptionFontSize (по длине слова, не всей фразы) — см. шапку файла */}
        {isChoice && (
          <View style={{ marginTop: 18, gap: 12 }}>
            {(() => {
              const options = exercise.options ?? [];
              const optionFontSize = options.reduce(
                (min, o) => Math.min(min, fitOptionFontSize(o, 17)),
                17,
              );
              return options.map((option, index) => {
                const isAnswer = index === exercise.answerIndex;
                const picked = feedback?.picked === index;
                const showCorrect = Boolean(feedback) && isAnswer;
                const showWrong = Boolean(feedback) && picked && !isAnswer;
                return (
                  <OptionKey
                    key={`${option}-${index}`}
                    label={option}
                    fontSize={optionFontSize}
                    colors={colors}
                    okColor={okColor}
                    state={showCorrect ? "correct" : showWrong ? "wrong" : "idle"}
                    dimmed={Boolean(feedback) && !showCorrect && !showWrong}
                    disabled={Boolean(feedback)}
                    onPress={() => pickOption(index)}
                  />
                );
              });
            })()}
          </View>
        )}

        {/* письменный ответ */}
        {isTyping && !feedback && (
          <View style={{ marginTop: 18 }}>
            {typingBlock(exercise.answerLang === "en" ? "Напиши по-английски" : "Напиши перевод")}
          </View>
        )}

        {/* произношение */}
        {isSpeak && !feedback && (
          <View style={{ marginTop: 18, alignItems: "center" }}>
            {micUsable ? (
              <>
                {/* Одна кнопка на два состояния: начать запись и остановить её.
                    Автоматическая остановка по тишине здесь не работает — см.
                    комментарий в hooks/useSpeechInput.ts. */}
                <TouchableOpacity
                  onPress={speakState === "listening" ? finishListening : beginListening}
                  disabled={speakState === "checking"}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={speakState === "listening" ? "Остановить запись" : "Начать запись"}
                >
                  <LinearGradient
                    colors={(speakState === "listening" ? gradients.fire : gradients.action) as unknown as string[]}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={{
                      alignItems: "center", justifyContent: "center",
                      width: 116, height: 116, borderRadius: 58,
                      opacity: speakState === "checking" ? 0.65 : 1,
                      shadowColor: speakState === "listening" ? accents.amber : colors.primary,
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: 0.4, shadowRadius: 20, elevation: 9,
                    }}
                  >
                    {speakState === "checking" ? (
                      <ActivityIndicator size="large" color="#ffffff" />
                    ) : speakState === "listening" ? (
                      // Квадрат «стоп»: рисуем прямо здесь, отдельного глифа для
                      // одной кнопки заводить незачем.
                      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: "#ffffff" }} />
                    ) : (
                      <Glyph name="mic" size={44} color="#ffffff" />
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <Text style={{ marginTop: 14, fontSize: 16, fontWeight: "900", color: colors.foreground, textAlign: "center" }}>
                  {speakState === "listening" ? "Идёт запись" : speakState === "checking" ? "Проверяю…" : "Нажми и произнеси слово"}
                </Text>

                {speakState === "listening" && (
                  <>
                    <Text style={{ marginTop: 4, fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
                      Скажи слово и нажми «Стоп»
                    </Text>

                    {/* Дорожка громкости: видно, что микрофон ловит голос, ещё
                        до того как придёт расшифровка. */}
                    <View style={{
                      width: "100%", marginTop: 12,
                      backgroundColor: colors.card,
                      borderRadius: radii.md,
                      borderWidth: 1, borderColor: colors.border,
                      paddingVertical: 8, paddingHorizontal: 10,
                    }}>
                      <VoiceWave active />
                    </View>

                    {/* Живая расшифровка: ребёнок должен видеть, что его слышат,
                        иначе он не понимает, работает микрофон или нет. */}
                    <Text
                      numberOfLines={2}
                      style={{
                        marginTop: 10, minHeight: 22, fontSize: 16, fontWeight: "800",
                        color: partial ? colors.primary : colors.mutedForeground, textAlign: "center",
                      }}
                    >
                      {partial || "…"}
                    </Text>
                  </>
                )}

                {/* Что именно услышало распознавание. Без этого ребёнок не
                    понимает, ошибся он или микрофон, и следующая попытка
                    превращается в лотерею. */}
                {!!heard && speakState === "idle" && (
                  <Text style={{ marginTop: 6, fontSize: 14, color: colors.mutedForeground, textAlign: "center" }}>
                    Услышал: «{heard}»
                  </Text>
                )}

                {!!micHint && speakState === "idle" && (
                  <Text style={{ marginTop: 8, fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 19 }}>
                    {micHint}
                  </Text>
                )}

                <Text style={{ marginTop: 10, fontSize: 13, fontWeight: "800", color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
                  Попытка {Math.min(attempts, maxSpeakAttempts)} из {maxSpeakAttempts}
                </Text>

                {speakState === "idle" && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start", gap: 10, marginTop: 14 }}>
                    {speechAvailable() && (
                      <SmallButton
                        icon="sound"
                        label="Послушать"
                        onPress={playWord}
                        colors={colors}
                      />
                    )}
                    <SmallButton icon="close" label="Не получается" onPress={skipSpeaking} colors={colors} />
                  </View>
                )}
              </>
            ) : (
              // Микрофона нет или доступ запрещён — вместо тупика предлагаем
              // написать слово.
              <View style={{ width: "100%" }}>
                <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20, marginBottom: 12 }}>
                  {micHint ?? "Микрофон недоступен на этом устройстве. Напиши слово по-английски."}
                </Text>
                {typingBlock("Напиши по-английски")}
              </View>
            )}
          </View>
        )}

        {/* буквы */}
        {isBuild && (
          <>
            <View style={{ marginTop: 18, flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {(exercise.letters ?? []).map((letter, index) => (
                <LetterKey
                  key={`${letter}-${index}`}
                  letter={letter}
                  colors={colors}
                  used={built.includes(index)}
                  disabled={built.includes(index) || Boolean(feedback)}
                  onPress={() => tapLetter(index)}
                />
              ))}
            </View>
            {!feedback && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16, justifyContent: "center", alignItems: "flex-start" }}>
                <SmallButton icon="backspace" label="Стереть" onPress={undoLetter} colors={colors} disabled={built.length === 0} />
                {!hintUsed && <SmallButton icon="help" label="Подсказка" onPress={showHint} colors={colors} />}
                <SmallButton icon="close" label="Не знаю" onPress={() => giveUp("build")} colors={colors} />
              </View>
            )}
          </>
        )}

        {/* знакомство: кнопки внизу */}
        {isIntro && (
          <View style={{ marginTop: 20 }}>
            {!revealed ? (
              <ChunkyButton label="Показать перевод" icon="face" onPress={revealTranslation} />
            ) : (
              <>
                <ChunkyButton label="Понятно, запомнил" icon="check" onPress={() => submit({ grade: "good" }, "intro", 250)} />
                <TouchableOpacity
                  onPress={() => submit({ grade: "again" }, "intro", 250)}
                  activeOpacity={0.85}
                  style={{
                    borderRadius: radii.md, paddingVertical: 14, alignItems: "center",
                    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginTop: 4,
                  }}
                >
                  <Text style={{ color: colors.mutedForeground, fontWeight: "800", fontSize: 15 }}>Показать ещё раз позже</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const PROMPT_LABEL: Record<ExerciseType, string> = {
  intro: "Новое слово",
  choiceRu: "Выбери перевод",
  choiceEn: "Выбери слово",
  listen: "Послушай и выбери перевод",
  build: "Собери слово из букв",
  typeRu: "Напиши перевод",
  typeEn: "Напиши слово по-английски",
  speak: "Произнеси слово вслух",
};

// ── физические клавиши ──────────────────────────────────────────────────────

/**
 * Вариант ответа как клавиша: у неё есть нижняя грань, и при нажатии корпус
 * проседает. Тот же приём, что у ChunkyButton, но плоский и светлый — вариантов
 * на экране четыре, и все они не могут кричать цветом бренда.
 *
 * ЦВЕТ СОСТОЯНИЯ НЕ ЗАЛИВАЕТ КОРПУС. Раньше клавиша красилась целиком (accent +
 * "1f" по всей площади плюс жирная рамка), и текст ответа читался сквозь пятно.
 * Теперь состояние живёт по краям: рамка, нижняя грань и круглый значок справа.
 * Корпус остаётся colors.card, текст — colors.foreground, контраст одинаковый
 * в любом состоянии.
 *
 * Остальные варианты после ответа притушены (dimmed): внимание должно уйти на
 * верный ответ, а не делиться поровну между четырьмя строками.
 *
 * fontSize — ОБЯЗАТЕЛЬНЫЙ проп, а не собственный fitOptionFontSize(label): один
 * и тот же размер шрифта должен применяться КО ВСЕМ вариантам ОДНОГО вопроса
 * разом, иначе внутри одного набора длинное слово мельчает рядом с тремя
 * короткими, которые остаются полного размера, — выглядит как разъехавшаяся
 * вёрстка. Общий размер на весь набор считает вызывающий код (см. блок
 * isChoice выше), через fitOptionFontSize — НЕ через fitFontSize (см. ГРАБЛИ
 * в шапке файла: последняя мерит по длине всей фразы, что для переносимых на
 * несколько строк вариантов ответа только зря мельчит текст).
 */
function OptionKey({
  label, fontSize, colors, okColor, state, dimmed, disabled, onPress,
}: {
  label: string;
  fontSize: number;
  colors: any;
  okColor: string;
  state: "idle" | "correct" | "wrong";
  dimmed?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: chunky.duration, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();

  const accent = state === "correct" ? okColor : state === "wrong" ? colors.destructive : null;
  const edge = accent ?? "rgba(160,140,220,0.35)";

  return (
    <View style={{ opacity: dimmed ? 0.45 : 1 }}>
      {/* Нижняя грань клавиши: отдельный слой под корпусом. */}
      <View style={{
        position: "absolute", left: 0, right: 0, top: 5, bottom: 0,
        borderRadius: radii.md, backgroundColor: edge,
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={disabled ? undefined : onPress}
          onPressIn={() => !disabled && set(4)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={{
            // Корпус всегда светлый: цвет состояния не должен лежать под текстом.
            backgroundColor: colors.card,
            borderColor: accent ?? colors.border,
            borderWidth: accent ? 2 : 1,
            borderRadius: radii.md, paddingVertical: 16, paddingHorizontal: 16,
            flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56,
          }}
        >
          <Text
            style={{ flex: 1, fontSize, fontWeight: "800", color: colors.foreground }}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {label}
          </Text>
          {/* Значок состояния — единственное цветное пятно, и оно стоит рядом с
              текстом, а не под ним. */}
          {!!accent && (
            <View style={{
              width: 26, height: 26, borderRadius: 13,
              alignItems: "center", justifyContent: "center",
              backgroundColor: accent,
            }}>
              <Glyph name={state === "correct" ? "check" : "close"} size={16} color="#ffffff" />
            </View>
          )}
        </Pressable>
      </Animated.View>
      <View style={{ height: 5 }} />
    </View>
  );
}

/** Буква в сборке слова — та же клавиша, только квадратная. */
function LetterKey({
  letter, colors, used, disabled, onPress,
}: {
  letter: string;
  colors: any;
  used: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: chunky.duration, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();

  if (used) {
    // Использованная буква оставляет «дырку» в ряду: видно, сколько осталось.
    return (
      <View style={{
        width: 46, height: 54, borderRadius: radii.sm,
        backgroundColor: "rgba(99,102,241,0.08)",
      }} />
    );
  }

  return (
    <View>
      <View style={{
        position: "absolute", left: 0, right: 0, top: 4, bottom: 0,
        borderRadius: radii.sm, backgroundColor: "rgba(160,140,220,0.4)",
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={disabled ? undefined : onPress}
          onPressIn={() => !disabled && set(4)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={`Буква ${letter}`}
          style={{
            width: 46, height: 54, borderRadius: radii.sm,
            alignItems: "center", justifyContent: "center",
            backgroundColor: colors.card,
            borderWidth: 1, borderColor: colors.border,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: "900", color: colors.foreground }}>{letter}</Text>
        </Pressable>
      </Animated.View>
      <View style={{ height: 4 }} />
    </View>
  );
}

// ── итоги сессии ────────────────────────────────────────────────────────────
//
// Наградный экран, а не отчёт. Поэтому все поверхности здесь физические: у
// каждой есть цветная нижняя грань, как у клавиш и панели вкладок.
//
// Счётчики считают ПЕРВЫЕ попытки: повторы, вернувшиеся в сессию после ошибки,
// сюда не попадают (см. submit). Иначе точность перестала бы что-либо значить.
//
// ── Плитки выложены рядами, а не потоком ────────────────────────────────────
// Раньше плитки лежали в одном flexWrap-контейнере с шириной 47%. Пока их было
// ровно четыре, сетка держалась случайно: стоило одной пропасть, и последняя
// повисала огрызком в половину ширины. Теперь плитки заранее разбиты на ряды по
// две, и одиночная плитка растягивается на весь ряд.
//
// ── Плитка «очков» показывается не всегда ───────────────────────────────────
// «+0 очков» — не награда, а напоминание, что наградой тут и не пахло. Если за
// сессию очков не начислено, плитки просто нет.
//
// ── Пустая очередь объясняет причину ────────────────────────────────────────
// См. заголовок файла: capped (дневной лимит новых слов исчерпан), waiting
// (следующее слово освободится по расписанию, и когда именно — известно) или
// done (реально нечего показать). Раньше все три причины звучали одинаково
// туманно, и «waiting» — самая частая после короткой сессии — читалась как
// баг: слово возвращалось через пару минут после честного «нечего повторять».
function emptyQueueMessage(info: EmptyInfo): string {
  if (info?.reason === "capped") {
    return "На сегодня открыто максимум новых слов — новые появятся завтра. Можно повторить сложные слова или взять другую колоду.";
  }
  if (info?.reason === "waiting" && info.nextDueAt) {
    const clock = formatClock(info.nextDueAt);
    return clock
      ? `Следующее слово освободится примерно в ${clock} — обычный интервал повторения, а не ошибка.`
      : "Следующее слово освободится совсем скоро — обычный интервал повторения, а не ошибка.";
  }
  return "Все слова повторены — новые появятся, когда придёт время следующего показа. Можно взять новую колоду или потренировать сложные слова.";
}

function SessionSummary({
  colors, insets, background, answered, correctCount, points, learned, progress, emptyQueue, emptyInfo, onExit,
}: {
  colors: any;
  insets: { top: number; bottom: number };
  background: string;
  answered: number;
  correctCount: number;
  points: number;
  learned: number;
  progress: { wordsToday: number; dailyWordGoal: number } | null;
  emptyQueue: boolean;
  emptyInfo: EmptyInfo;
  onExit: () => void;
}) {
  const accuracy = answered > 0 ? Math.round((correctCount / answered) * 100) : 0;
  const goalReached = Boolean(progress && progress.wordsToday >= progress.dailyWordGoal);

  // Итог сессии — наградный момент, поэтому крупный трофей в градиентной
  // плашке вместо эмодзи. Пустая очередь наградой не считается.
  const heroGlyph: GlyphName = emptyQueue ? "clock" : goalReached ? "trophy" : "spark";
  const heroGradient = emptyQueue
    ? (["#a5b4fc", "#818cf8"] as const)
    : goalReached
      ? gradients.medalEasy
      : gradients.action;
  const heroEdge = emptyQueue ? "#6366f1" : goalReached ? "#b45309" : accents.indigoDeep;

  type TileSpec = {
    key: string;
    icon: GlyphName;
    tint: string;
    edge: string;
    value: React.ReactNode;
    label: string;
  };

  const tiles: TileSpec[] = [
    { key: "words", icon: "cards", tint: colors.primary, edge: accents.indigoDeep, value: answered, label: "слов пройдено" },
    { key: "accuracy", icon: "target", tint: accents.amber, edge: "#b45309", value: `${accuracy}%`, label: "с первого раза" },
    // Очки показываем, только если они есть: см. комментарий выше. Это ЕДИНСТВЕННОЕ
    // место, где ученик вообще видит очки за эту сессию — во время самой тренировки
    // они нигде не отображаются (см. шапку файла и шапку экрана тренажёра).
    ...(points > 0
      ? [{ key: "points", icon: "star" as GlyphName, tint: accents.magenta, edge: "#a21caf", value: `+${points}`, label: "очков" }]
      : []),
    { key: "learned", icon: "check", tint: colors.success, edge: accents.violetDeep, value: learned, label: "выучено" },
  ];

  const rows: TileSpec[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        padding: 26,
        paddingTop: insets.top + 20,
        // Запас снизу: кнопка «Готово» не должна липнуть к краю экрана —
        // там жест «домой», и первое касание уходит системе.
        paddingBottom: Math.max(insets.bottom, 16) + BOTTOM_SAFE_SPACE,
      }}
      style={{ backgroundColor: background }}
    >
      <View style={{ alignItems: "center" }}>
        {/* Трофей объёмный: под градиентом лежит грань, как у медали.
            Наклон стоит на КОНТЕЙНЕРЕ, а не на градиенте: иначе грань остаётся
            ровной, корпус едет — и снизу торчит косой хвост. */}
        <View style={{ width: 96, height: 96 + EDGE, transform: [{ rotate: "-4deg" }] }}>
          <View style={{
            position: "absolute", left: 0, top: EDGE, width: 96, height: 96,
            borderRadius: radii.xl, backgroundColor: heroEdge,
          }} />
          <LinearGradient
            colors={heroGradient as unknown as string[]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{
              width: 96, height: 96, borderRadius: radii.xl,
              alignItems: "center", justifyContent: "center",
              borderWidth: 2, borderColor: "rgba(255,255,255,0.65)",
              shadowColor: goalReached ? accents.amber : colors.primary,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.4, shadowRadius: 20, elevation: 9,
            }}
          >
            <Glyph name={heroGlyph} size={46} color="#ffffff" />
          </LinearGradient>
        </View>
        <Text style={{ fontSize: 25, fontWeight: "900", letterSpacing: -0.6, color: colors.foreground, marginTop: 18, textAlign: "center" }}>
          {emptyQueue ? "Пока нечего повторять" : goalReached ? "Цель дня выполнена!" : "Хорошая работа!"}
        </Text>
        {emptyQueue && (
          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 8, textAlign: "center", lineHeight: 20 }}>
            {emptyQueueMessage(emptyInfo)}
          </Text>
        )}
      </View>

      {!emptyQueue && (
        <>
          {rows.map((row, rowIndex) => (
            <View
              key={row.map((t) => t.key).join("-")}
              // alignItems по умолчанию stretch: плитки одного ряда получают
              // одинаковую высоту, даже если подпись переносится на две строки.
              style={{ flexDirection: "row", gap: 12, marginTop: rowIndex === 0 ? 22 : 12 }}
            >
              {row.map((tile) => (
                <SummaryCard
                  key={tile.key}
                  colors={colors}
                  icon={tile.icon}
                  tint={tile.tint}
                  edge={tile.edge}
                  value={tile.value}
                  label={tile.label}
                />
              ))}
              {/* Нечётная плитка не должна растягиваться на весь ряд: сетка
                  держится распоркой, а не шириной в процентах. */}
              {row.length === 1 && <View style={{ flex: 1 }} />}
            </View>
          ))}

          {progress && (
            <ChunkySurface
              colors={colors}
              edge={goalReached ? "#b45309" : accents.violetDeep}
              glow={goalReached ? accents.gold : accents.violetDeep}
              padding={16}
              style={{ marginTop: 20 }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 11 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>Цель дня</Text>
                <Text style={{
                  fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"],
                  color: goalReached ? accents.amber : colors.primary,
                }}>
                  {progress.wordsToday} / {progress.dailyWordGoal}
                </Text>
              </View>
              {/* Та же сегментированная цель, что на «Словах» и в статистике. */}
              <GoalPips value={progress.wordsToday} target={progress.dailyWordGoal} done={goalReached} />
            </ChunkySurface>
          )}
        </>
      )}

      <ChunkyButton label="Готово" icon="check" onPress={onExit} style={{ marginTop: 24 }} />
    </ScrollView>
  );
}

/**
 * Поверхность с физической нижней гранью.
 *
 * В RN у одного View не может быть двух теней, поэтому «толщину» рисуем
 * настоящим прямоугольником под корпусом — тем же приёмом, что в ChunkyButton
 * и MedalTile. Корпус остаётся белым: цвет живёт по краям, под текстом его нет.
 *
 * ГРАБЛИ. Внутренний отступ задаётся параметром padding, а НЕ через style:
 * style приходит на обёртку, отжимает корпус внутрь со всех сторон, и нижний
 * слой начинает торчать рамкой по всему периметру вместо одной грани снизу.
 * Именно так «Цель дня» обзавелась коричневой окантовкой.
 */
function ChunkySurface({
  colors, edge, glow, padding = 14, style, children,
}: {
  colors: any;
  edge: string;
  glow: string;
  padding?: number;
  style?: any;
  children: React.ReactNode;
}) {
  return (
    <View style={style}>
      {/* bottom: 0 при резерве EDGE снизу — грань заканчивается ровно по низу
          обёртки. С bottom: -EDGE она вылезала за её пределы и наезжала на
          соседний блок. */}
      <View style={{
        position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
        borderRadius: radii.md, backgroundColor: edge, opacity: 0.5,
      }} />
      <View style={{
        backgroundColor: colors.card,
        borderRadius: radii.md,
        borderWidth: 1.5, borderColor: "rgba(99,102,241,0.18)",
        padding,
        shadowColor: glow, shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2, shadowRadius: 16, elevation: 4,
      }}>
        {children}
      </View>
      {/* Резерв под грань, чтобы соседний блок на неё не наезжал. */}
      <View style={{ height: EDGE }} />
    </View>
  );
}

/**
 * Плитка результата: значок в градиентной плашке, крупное число, подпись.
 *
 * flex: 1 и на обёртке, и на корпусе — так плитки ряда получают одинаковую
 * ширину и одинаковую высоту. Ширина в процентах этого не давала: подпись из
 * двух строк делала одну плитку выше соседней.
 */
function SummaryCard({
  colors, icon, tint, edge, value, label,
}: {
  colors: any;
  icon: GlyphName;
  tint: string;
  /** Цвет нижней грани — тёмная версия tint. */
  edge: string;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      {/* Нижняя грань. */}
      <View style={{
        position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
        borderRadius: radii.md, backgroundColor: edge, opacity: 0.5,
      }} />
      <View style={{
        flex: 1,
        backgroundColor: colors.card, borderRadius: radii.md,
        borderWidth: 1.5, borderColor: "rgba(99,102,241,0.18)",
        padding: 15,
        shadowColor: tint, shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22, shadowRadius: 16, elevation: 4,
      }}>
        <LinearGradient
          colors={[tint, edge]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={{
            width: 36, height: 36, borderRadius: radii.sm,
            alignItems: "center", justifyContent: "center",
            borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)",
            shadowColor: tint, shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35, shadowRadius: 8, elevation: 3,
          }}
        >
          <Glyph name={icon} size={19} color="#ffffff" />
        </LinearGradient>
        <Text style={{
          fontSize: 28, fontWeight: "900", letterSpacing: -1,
          color: colors.foreground, marginTop: 10, fontVariant: ["tabular-nums"],
        }}>
          {value}
        </Text>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginTop: 1 }}>{label}</Text>
      </View>
      <View style={{ height: EDGE }} />
    </View>
  );
}

function Centered({ children, background }: { children: React.ReactNode; background: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: background }}>
      {children}
    </View>
  );
}

/**
 * Мелкая кнопка действия: «Стереть», «Подсказка», «Послушать», «Не знаю».
 *
 * Раньше это была плоская пилюля с тонкой рамкой — единственное место в
 * тренажёре, где кнопка не ощущалась кнопкой. Теперь у неё та же физика, что у
 * клавиш ответа и ChunkyButton: нижняя грань отдельным слоем, корпус проседает
 * при нажатии и грань схлопывается.
 *
 * Грань светло-фиолетовая, а не в цвет текста: этих кнопок на экране до трёх, и
 * цветными они перетянули бы внимание с самого задания.
 */
function SmallButton({
  icon, label, onPress, colors, disabled,
}: { icon: GlyphName; label: string; onPress: () => void; colors: any; disabled?: boolean }) {
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: chunky.duration, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();

  return (
    <View style={{ opacity: disabled ? 0.45 : 1 }}>
      {/* Нижняя грань: отдельный слой под корпусом — у View в RN не может быть
          двух теней, поэтому толщину рисуем настоящим прямоугольником. */}
      <View style={{
        position: "absolute", left: 0, right: 0, top: 4, bottom: 0,
        borderRadius: radii.pill, backgroundColor: "rgba(160,140,220,0.45)",
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={disabled ? undefined : onPress}
          onPressIn={() => !disabled && set(4)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: !!disabled }}
          style={{
            flexDirection: "row", alignItems: "center", gap: 7,
            borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 11,
            backgroundColor: colors.card,
            borderWidth: 1.5, borderColor: "rgba(99,102,241,0.2)",
          }}
        >
          <Glyph name={icon} size={16} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontWeight: "800", fontSize: 13 }}>{label}</Text>
        </Pressable>
      </Animated.View>
      {/* Резерв под грань, чтобы соседний ряд на неё не наезжал. */}
      <View style={{ height: 4 }} />
    </View>
  );
}
