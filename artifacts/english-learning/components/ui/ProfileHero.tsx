// ─────────────────────────────────────────────────────────────────────────────
// Шапка профиля: аватар, имя, метки и полоса опыта.
//
// Раньше блок был собран прямо в profile.tsx и выглядел иначе, чем задумано:
// аватар рисовал AnimatedAvatar, а он резервирует под себя контейнер в 1.7
// раза больше самого аватара (место под пульсирующие кольца). При size={96}
// это 163 пикселя пустоты, из-за чего аватар уезжал вверх, обрезался краем
// градиента и занимал пол-экрана, а имя с метками уходили под сгиб.
//
// Здесь аватар рисуется напрямую и стоит слева, а имя, метки и уровень —
// справа. Горизонтальная раскладка компактнее: видно и кто ты, и сколько до
// следующего уровня, без прокрутки.
//
// Аватар — скруглённый квадрат в золотой оправе, как медальон: тот же приём,
// что у медалей и уровня в разделе «Слова». Круг тут читался бы как «фото
// профиля из соцсети», а не как награда.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Glyph, type GlyphName } from "./Glyph";
import { accents, gradients, radii } from "@/constants/theme";

/** Метка на «стекле»: на градиенте цветная плашка не читается. */
function GlassPill({ text, icon }: { text: string; icon?: GlyphName }) {
  return (
    <View style={s.glassPill}>
      {icon && <Glyph name={icon} size={12} color="#ffffff" />}
      <Text style={s.glassPillText}>{text}</Text>
    </View>
  );
}

export interface ProfileHeroProps {
  name: string;
  username: string;
  avatarEmoji: string;
  avatarColor: string;
  avatarUrl?: string | null;
  /** Идёт ли сохранение аватара — тогда на кнопке правки крутится спиннер. */
  saving?: boolean;
  onEditAvatar: () => void;
  /** Роль словом: «Ученик», «Учитель», «Родитель». */
  roleLabel: string;
  /** Возраст словом: «12 лет». Пусто — метки не будет. */
  ageLabel?: string | null;
  /**
   * Уровень и его название. Показывается только ученику.
   * На шильде выводится один номер: названия уровней («Ученик», «Старатель»)
   * повторяли роль в соседней метке — на скриншоте под аватаром стояло
   * «4 · Ученик», а справа ещё раз «Ученик». Название уровня целиком видно
   * в строке под полосой опыта.
   */
  level?: { number: number; title: string } | null;
  /** Полоса опыта. null — блок не рисуется (учитель, родитель). */
  xp?: {
    current: number;
    /** Порог следующего уровня. null — уровень максимальный. */
    nextAt: number | null;
    nextTitle: string | null;
    nextLevel: number | null;
    percent: number;
  } | null;
  /** Верхний отступ под статус-бар. */
  paddingTop: number;
}

export function ProfileHero({
  name, username, avatarEmoji, avatarColor, avatarUrl, saving,
  onEditAvatar, roleLabel, ageLabel, level, xp, paddingTop,
}: ProfileHeroProps) {
  // Ссылка на фото может вести в никуда: объектное хранилище не настроено, и
  // файлы лежат на диске контейнера, который на Render стирается при каждом
  // деплое. В базе ссылка при этом остаётся — и вместо аватара получался
  // пустой цветной квадрат без единого намёка на причину.
  //
  // При ошибке загрузки откатываемся на эмодзи: он хранится в той же записи
  // пользователя и всегда доступен. Сбрасываем флаг при смене ссылки, иначе
  // после загрузки нового фото остался бы старый эмодзи.
  const [imageFailed, setImageFailed] = React.useState(false);
  React.useEffect(() => { setImageFailed(false); }, [avatarUrl]);

  const showPhoto = !!avatarUrl && !imageFailed;

  return (
    <LinearGradient
      colors={HERO_GRADIENT as unknown as string[]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[s.hero, { paddingTop }]}
    >
      <View style={s.row}>
        {/* Аватар в золотой оправе. Оправа — отдельный слой градиента, а не
            рамка: у рамки один цвет, а металл должен переливаться. */}
        <View style={s.avatarWrap}>
          <LinearGradient
            colors={[accents.gold, accents.amber]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={s.avatarRing}
          >
            <View style={[s.avatarInner, { backgroundColor: avatarColor }]}>
              {showPhoto ? (
                <Image
                  source={{ uri: avatarUrl! }}
                  style={s.avatarImage}
                  resizeMode="cover"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                // Эмодзи-аватар выбирает сам ученик — это его лицо в приложении,
                // а не наша иконка, поэтому здесь эмодзи остаётся.
                <Text style={s.avatarEmoji}>{avatarEmoji}</Text>
              )}
            </View>
          </LinearGradient>

          <TouchableOpacity
            style={s.editBtn}
            onPress={onEditAvatar}
            accessibilityRole="button"
            accessibilityLabel="Сменить аватар"
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator size={12} color="#fff" />
              : <Glyph name="pen" size={13} color="#fff" />}
          </TouchableOpacity>

          {/* Уровень шильдом внизу аватара: награда, поэтому золото.
              Только номер — название уровня стоит под полосой опыта. */}
          {level && (
            <LinearGradient
              colors={[accents.gold, accents.amber]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.levelBadge}
            >
              <Text style={s.levelCap}>УР.</Text>
              <Text style={s.levelNum}>{level.number}</Text>
            </LinearGradient>
          )}
        </View>

        <View style={s.who}>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          <Text style={s.username} numberOfLines={1}>@{username}</Text>
          <View style={s.badgeRow}>
            <GlassPill text={roleLabel} />
            {!!ageLabel && <GlassPill text={ageLabel} icon="calendar" />}
          </View>
        </View>
      </View>

      {/* ── Полоса опыта ──
          Уровень раньше был просто числом в пилюле: сколько до следующего и
          что для этого сделать, ученик не знал.

          Дорожка тёмная, а не белая полупрозрачная: белый на 18% поверх
          фиолетового давал светло-сиреневый, почти неотличимый от самого
          фона — было не видно ни где полоса начинается, ни где кончается.
          Тёмная утопленная канавка со светлым кантом читается как желобок,
          в котором лежит цветная заливка. */}
      {xp && (
        <View style={s.xpBlock}>
          <View style={s.xpHead}>
            <Text style={s.xpTitle}>Опыт</Text>
            <Text style={s.xpNum}>
              {xp.nextAt !== null ? `${xp.current} / ${xp.nextAt} XP` : `${xp.current} XP · максимум`}
            </Text>
          </View>
          <View style={s.xpTrack}>
            <LinearGradient
              colors={gradients.progress as unknown as string[]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[s.xpFill, { width: `${Math.max(xp.percent, 2)}%` }]}
            />
          </View>
          <Text style={s.xpNext}>
            {xp.nextAt !== null && xp.nextLevel !== null
              ? `До уровня ${xp.nextLevel} «${xp.nextTitle}» осталось ${xp.nextAt - xp.current} XP`
              : "Максимальный уровень достигнут"}
          </Text>
        </View>
      )}
    </LinearGradient>
  );
}

/** Градиент шапки — тот же, что в «Рейтинге»: экраны выглядят одной семьёй. */
const HERO_GRADIENT = ["#2e1065", "#5b21b6", "#7c3aed"] as const;

const AVATAR = 84;

const s = StyleSheet.create({
  hero: {
    paddingHorizontal: 20, paddingBottom: 22,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    marginBottom: 18,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 16 },

  // Место под шильд уровня, который свисает ниже аватара.
  avatarWrap: { width: AVATAR + 8, paddingBottom: 14 },
  avatarRing: {
    width: AVATAR + 8, height: AVATAR + 8, borderRadius: 30, padding: 4,
    shadowColor: accents.gold, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 18, elevation: 8,
  },
  avatarInner: {
    flex: 1, borderRadius: 26,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarEmoji: { fontSize: Math.round(AVATAR * 0.46) },
  editBtn: {
    position: "absolute", right: -6, top: -6,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "#6366f1",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2.5, borderColor: "#ffffff",
  },
  // Шильд узкий и по центру аватара: в нём теперь только «УР. N».
  levelBadge: {
    position: "absolute", alignSelf: "center", bottom: 0,
    flexDirection: "row", alignItems: "baseline", gap: 4,
    paddingVertical: 4, paddingHorizontal: 12, borderRadius: radii.pill,
    borderWidth: 2, borderColor: "#ffffff",
  },
  levelCap: { fontSize: 9, fontWeight: "900", color: "#7a4a06", letterSpacing: 0.6 },
  levelNum: { fontSize: 14, fontWeight: "900", color: "#42200a", fontVariant: ["tabular-nums"] },

  who: { flex: 1, paddingTop: 6 },
  name: { fontSize: 23, fontWeight: "900", letterSpacing: -0.6, color: "#ffffff" },
  username: { fontSize: 13.5, color: "rgba(255,255,255,0.72)", marginTop: 3 },
  badgeRow: { flexDirection: "row", gap: 7, flexWrap: "wrap", marginTop: 11 },
  glassPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.28)",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill,
  },
  glassPillText: { fontSize: 11.5, fontWeight: "800", color: "#ffffff" },

  xpBlock: { marginTop: 20 },
  xpHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 },
  xpTitle: { fontSize: 13, fontWeight: "800", color: "#ffffff" },
  xpNum: { fontSize: 12, fontWeight: "800", color: "rgba(255,255,255,0.8)", fontVariant: ["tabular-nums"] },
  xpTrack: {
    height: 15, borderRadius: radii.pill,
    // Почти чёрно-фиолетовый: темнее любой точки градиента шапки, поэтому
    // канавка видна и вверху, и внизу блока.
    backgroundColor: "rgba(23,8,56,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
    overflow: "hidden", padding: 2,
  },
  xpFill: {
    height: "100%", borderRadius: radii.pill,
    // Свечение заливки в цвете бренда: полоса выглядит подсвеченной изнутри.
    shadowColor: accents.magenta,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75, shadowRadius: 8, elevation: 4,
  },
  xpNext: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 8, lineHeight: 17 },
});

export default ProfileHero;
