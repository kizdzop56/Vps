// Подсказка «что означает эта цифра».
//
// Зачем отдельный компонент: TabGuide показывается один раз при первом входе на
// вкладку и больше никогда. Для нюансов анализа этого мало — учитель открывает
// вкладку раз в неделю и не помнит, считается ли процент по всем работам или
// только по проверенным. Здесь подсказка живёт рядом с самой цифрой и
// открывается сколько угодно раз.
//
// Используется двумя способами:
//   <InfoHint title="…" points={[…]} />            — круглая кнопка «i»
//   <InfoHint title="…" points={[…]} label="Как читать" />  — кнопка с текстом
import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal, ScrollView, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export type InfoHintProps = {
  /** Заголовок подсказки — о чём именно речь. */
  title: string;
  /** Пункты-нюансы. Каждый — одна законченная мысль. */
  points: string[];
  /** Короткая строка над пунктами: главное в одну фразу. */
  summary?: string;
  /** Если задан — вместо круглой «i» рисуется кнопка с этим текстом. */
  label?: string;
  /** Иконка кнопки (по умолчанию info). */
  icon?: keyof typeof Feather.glyphMap;
  /** Размер круглой кнопки. */
  size?: number;
};

export function InfoHint({ title, points, summary, label, icon = "info", size = 18 }: InfoHintProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <>
      {label ? (
        <TouchableOpacity
          onPress={() => setOpen(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            flexDirection: "row", alignItems: "center", gap: 5,
            paddingHorizontal: 10, paddingVertical: 6,
            borderRadius: 10, backgroundColor: colors.primary + "14",
          }}
        >
          <Feather name={icon} size={13} color={colors.primary} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>{label}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => setOpen(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={`Подсказка: ${title}`}
          style={{
            width: size + 8, height: size + 8, borderRadius: (size + 8) / 2,
            alignItems: "center", justifyContent: "center",
            backgroundColor: colors.primary + "14",
          }}
        >
          <Feather name={icon} size={size - 5} color={colors.primary} />
        </TouchableOpacity>
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          {/* Тап по затемнению закрывает — привычное поведение шторки. */}
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setOpen(false)} />
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingHorizontal: 20, paddingTop: 18,
              paddingBottom: Math.max(insets.bottom, 16) + 12,
              maxHeight: "78%",
              ...(Platform.OS === "web" ? { boxShadow: "0 -8px 32px rgba(0,0,0,0.18)" } : {}),
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
              <View style={{
                width: 32, height: 32, borderRadius: 16, marginTop: 1,
                alignItems: "center", justifyContent: "center",
                backgroundColor: colors.primary + "18",
              }}>
                <Feather name="info" size={17} color={colors.primary} />
              </View>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "800", color: colors.foreground, lineHeight: 23 }}>
                {title}
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
              {summary ? (
                <View style={{
                  backgroundColor: colors.primary + "10",
                  borderRadius: 14, padding: 14, marginBottom: 14,
                  borderLeftWidth: 3, borderLeftColor: colors.primary,
                }}>
                  <Text style={{ fontSize: 14, lineHeight: 21, color: colors.foreground, fontWeight: "600" }}>
                    {summary}
                  </Text>
                </View>
              ) : null}

              <View style={{ gap: 12 }}>
                {points.map((point, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{
                      width: 20, height: 20, borderRadius: 10, marginTop: 1,
                      alignItems: "center", justifyContent: "center",
                      backgroundColor: colors.muted,
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: colors.mutedForeground }}>{i + 1}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, lineHeight: 21, color: colors.foreground }}>
                      {point}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={() => setOpen(false)}
              activeOpacity={0.85}
              style={{
                marginTop: 16, backgroundColor: colors.primary,
                borderRadius: 14, paddingVertical: 14, alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>Понятно</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

/**
 * Тексты подсказок для вкладки «Анализ» — вынесены сюда, чтобы экран не
 * распухал и чтобы формулировки можно было править в одном месте.
 *
 * Пороги в текстах совпадают с константами правил на сервере
 * (artifacts/api-server/src/lib/studentAnalysis.ts). Если меняете там — правьте
 * и здесь, иначе подсказка начнёт врать.
 */
export const ANALYSIS_HINTS = {
  focus: {
    title: "Фокус на следующий урок",
    summary:
      "Приложение само сопоставляет баллы, динамику, лексику и активность и оставляет то, что реально стоит внимания. Это не оценка ученика, а список тем для урока.",
    points: [
      "Красные пункты — срочные: без них урок пройдёт вслепую. Оранжевые — важные, но терпят. Зелёные значат, что можно усложнять программу.",
      "Порядок не случаен: сверху то, что сильнее мешает прогрессу именно сейчас.",
      "Пункты пересчитываются при каждом открытии вкладки. Проверили работы — список сразу станет другим.",
      "Больше пяти пунктов не показываем: если внимания требует всё, начинать надо с верхнего.",
    ],
  },
  freshness: {
    title: "Насколько свежие данные",
    summary:
      "Главный нюанс всей вкладки: проценты ниже описывают прошлое. Если ученик не заходил неделю, они не говорят о его сегодняшнем уровне.",
    points: [
      "«Активен» — заходил в последние дни, цифрам можно верить.",
      "«Активность просела» — время за неделю упало больше чем вдвое против прошлой. Часто первый признак потери мотивации, ещё до падения баллов.",
      "«Давно не заходил» — 5 дней и больше. Сначала выясните причину, только потом разбирайте ошибки.",
      "Последняя активность — это максимум из входа в приложение, учебной сессии и сдачи работы.",
    ],
  },
  skills: {
    title: "Навыки и динамика",
    summary:
      "Процент — средний балл по проверенным работам этого типа. Стрелка рядом показывает не уровень, а направление движения.",
    points: [
      "В расчёт идут только проверенные работы. Пока работа ждёт вашей проверки, она на процент не влияет — поэтому непроверенные вынесены в фокус отдельным пунктом.",
      "Динамика считается как последние пять работ против пяти предыдущих. Календарные месяцы не используются: при неровном графике сдачи они дают ложные провалы.",
      "Значимым считаем сдвиг от 10 пунктов. Колебания в пределах десяти — это обычный разброс, а не тренд.",
      "Меньше трёх работ — процент случаен, поэтому такой навык не попадает в «слабые». Серая пометка «мало данных» означает именно это.",
      "«Свободный ответ» проверяете вы вручную, поэтому его процент зависит от вашей же шкалы оценки.",
    ],
  },
  vocabulary: {
    title: "Словарный запас",
    summary:
      "Слова живут по интервальному повторению: каждое верное «знаю» отодвигает карточку дальше, «не знаю» возвращает в начало.",
    points: [
      "«Просрочено» — срок повторения прошёл, а ученик карточку не открыл. Это не домашка с дедлайном, а именно память: чем дольше ждёт, тем вернее слово забудется.",
      "«Выучено» — слово поднялось на четвёртый уровень из пяти и всплывёт снова только через неделю-месяц.",
      "«Забыто» — слово откатилось в ноль после «не знаю», хотя ученик его уже видел. Такие слова карточками уже не берутся, нужен контекст и проговаривание.",
      "Точность — доля верных ответов за всё время повторений, а не за последнюю неделю.",
      "Считаются только слова из колод, доступных ученику: системные, свои и выданные вами.",
    ],
  },
  assignments: {
    title: "Задания",
    summary:
      "Здесь видно не успеваемость, а движение: сколько выдано, сколько ученик не тронул и сколько ждёт вашей проверки.",
    points: [
      "«Ждут проверки» — ваша задача. Пока работа не проверена, её балл не попадает ни в один процент на этой вкладке.",
      "«Не начато» — задание выдано, но ученик не открывал. Срок считается от даты выдачи: дедлайнов в заданиях нет.",
      "Задание, висящее больше недели, попадает в фокус: причина «не понял формулировку» и «не хватило времени» лечатся по-разному, поэтому лучше спросить.",
      "Средний балл за две недели показывает текущую форму — он реагирует быстрее, чем средний за всё время.",
    ],
  },
  mistakes: {
    title: "Повторяющиеся ошибки",
    summary:
      "Неверные ответы сгруппированы по тексту вопроса. Одна ошибка, сделанная трижды, важнее трёх разных одиночных промахов.",
    points: [
      "Счётчик показывает, сколько раз ученик ошибся именно в этом вопросе. От трёх раз это уже не описка, а пробел в правиле.",
      "Ответ ученика — самый последний: по нему видно, ушла ошибка или повторяется в той же форме.",
      "Готовый материал для урока: возьмите вопрос, объясните правило заново и дайте два-три однотипных примера.",
      "Учитываются только вопросы с автоматической проверкой — свободные ответы сюда не попадают.",
    ],
  },
} as const;
