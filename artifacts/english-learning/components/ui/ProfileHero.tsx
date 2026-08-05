// ─────────────────────────────────────────────────────────────────────────────
// Шапка профиля: аватар, имя, метки, счётчики и полоса опыта.
//
// Раньше блок был собран прямо в profile.tsx и выглядел иначе, чем задумано:
// аватар рисовал AnimatedAvatar, а он резервирует под себя контейнер в 1.7
// раза больше самого аватара (место под пульсирующие кольца). При size={96}
// это 163 пикселя пустоты, из-за чего аватар уезжал вверх, обрезался краем
// градиента и занимал пол-экрана, а имя с метками уходили под сгиб.
//
// Аватар — скруглённый квадрат в золотой оправе, как медальон: тот же приём,
// что у медалей и уровня в разделе «Слова». Круг тут читался бы как «фото
// профиля из соцсети», а не как награда.
//
// ── Про счётчики ────────────────────────────────────────────────────────────
// Их два, а не три. Три узкие карточки не помещались рядом с аватаром, и
// сетка съезжала вниз, оставляя над собой пустой тёмный прямоугольник —
// именно ту «дырку», которая бросалась в глаза на скриншотах. Две карточки
// шире, встают вровень с нижним краем аватара и закрывают пустоту целиком.
//
// Что осталось: «слов выучено» (знание языка) и «дней подряд» (привычка).
// Что убрано: «очков» — это то же число, что на полосе опыта строкой ниже;
// «заданий» — их разбивка целиком есть в блоке «Мои задания» ниже по экрану.
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

/** Счётчик в шапке: значок, крупное число и подпись в одну строку. */
function MiniStat({ value, label, icon }: { value: number | string; label: string; icon: GlyphName }) {
  return (
    <View style={s.mini}>
      <View style={s.miniIcon}>
        <Glyph name={icon} size={15} color="#ffffff" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.miniValue} numberOfLines={1}>{value}</Text>
        <Text style={s.miniLabel} numberOfLines={1}>{label}</Text>
      </View>
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
  /** Уровень: на шильде только номер, название — под полосой опыта. */
  level?: { number: number; title: string } | null;
  /** Два счётчика под именем. null — блок не рисуется. */
  stats?: { wordsLearned: number; streak: number } | null;
  /** Полоса опыта. null — блок не рисуется. */
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

/** Русское склонение по числу. */
function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

export function ProfileHero({
  name, username, avatarEmoji, avatarColor, avatarUrl, saving,
  onEditAvatar, roleLabel, ageLabel, level, stats, xp, paddingTop,
}: ProfileHeroProps) {
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

          {stats && (
            <View style={s.miniRow}>
              <MiniStat
                icon="cards"
                value={stats.wordsLearned}
                label={`${plural(stats.wordsLearned, ["слово", "слова", "слов"])} выучено`}
              />
              <MiniStat
                icon="flame"
                value={stats.streak}
                label={`${plural(stats.streak, ["день", "дня", "дней"])} подряд`}
              />
            </View>
          )}
        </View>
      </View>

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

const HERO_GRADIENT = ["#2e1065", "#5b21b6", "#7c3aed"] as const;

const AVATAR = 84;

const s = StyleSheet.create({
  hero: {
    paddingHorizontal: 18, paddingBottom: 18,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    marginBottom: 14,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 14 },

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
  levelBadge: {
    position: "absolute", alignSelf: "center", bottom: 0,
    flexDirection: "row", alignItems: "baseline", gap: 4,
    paddingVertical: 4, paddingHorizontal: 12, borderRadius: radii.pill,
    borderWidth: 2, borderColor: "#ffffff",
  },
  levelCap: { fontSize: 9, fontWeight: "900", color: "#7a4a06", letterSpacing: 0.6 },
  levelNum: { fontSize: 14, fontWeight: "900", color: "#42200a", fontVariant: ["tabular-nums"] },

  who: { flex: 1, minWidth: 0, paddingTop: 2 },
  name: { fontSize: 22, fontWeight: "900", letterSpacing: -0.6, color: "#ffffff" },
  username: { fontSize: 13, color: "rgba(255,255,255,0.72)", marginTop: 2 },
  badgeRow: { flexDirection: "row", gap: 7, flexWrap: "wrap", marginTop: 8 },
  glassPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.28)",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill,
  },
  glassPillText: { fontSize: 11.5, fontWeight: "800", color: "#ffffff" },

  // Две карточки: значок слева, число и подпись справа — так строка
  // заполняется по горизонтали и не оставляет воздуха над сеткой.
  miniRow: { flexDirection: "row", gap: 7, marginTop: 9 },
  mini: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 8, paddingHorizontal: 9, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  miniIcon: {
    width: 28, height: 28, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  miniValue: {
    fontSize: 17, fontWeight: "900", color: "#ffffff",
    letterSpacing: -0.5, fontVariant: ["tabular-nums"],
  },
  miniLabel: {
    fontSize: 9.5, fontWeight: "700", color: "rgba(255,255,255,0.72)",
    marginTop: 1, letterSpacing: 0.1,
  },

  xpBlock: { marginTop: 14 },
  xpHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 },
  xpTitle: { fontSize: 13, fontWeight: "800", color: "#ffffff" },
  xpNum: { fontSize: 12, fontWeight: "800", color: "rgba(255,255,255,0.8)", fontVariant: ["tabular-nums"] },
  xpTrack: {
    height: 15, borderRadius: radii.pill,
    backgroundColor: "rgba(23,8,56,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
    overflow: "hidden", padding: 2,
  },
  xpFill: {
    height: "100%", borderRadius: radii.pill,
    shadowColor: accents.magenta,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75, shadowRadius: 8, elevation: 4,
  },
  xpNext: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 7, lineHeight: 17 },
});

export default ProfileHero;
