// ─────────────────────────────────────────────────────────────────────────────
// Вылетающие цифры урона.
//
// Живёт в раскладке вкладок, поэтому цифра появляется на ЛЮБОМ экране: ученик
// отвечает в тренажёре слов, а урон улетает поверх карточки, как в RPG. Экраны
// об этом ничего не знают, данные приходят из шины (utils/raidBus.ts).
//
// Слой абсолютный и pointerEvents="none": он не должен перехватывать ни одного
// нажатия — иначе кнопка «Дальше» под ним начнёт промахиваться.
//
// Анимируются только opacity и transform. Одновременно держим не больше пяти
// цифр: на слабом телефоне десяток анимаций подряд заметно роняет отклик.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { Animated, Easing, Platform, Text, View } from "react-native";
import { accents } from "@/constants/theme";
import { installRaidFetchHook, onRaidHit, type RaidHitEvent } from "@/utils/raidBus";

const NATIVE_DRIVER = Platform.OS !== "web";
const MAX_ON_SCREEN = 5;

interface Flying {
  id: number;
  hit: RaidHitEvent;
  /** Смещение по горизонтали, чтобы цифры не ложились друг на друга. */
  dx: number;
}

let counter = 0;

export function RaidHitOverlay() {
  const [items, setItems] = React.useState<Flying[]>([]);

  React.useEffect(() => {
    installRaidFetchHook();
    return onRaidHit((hit) => {
      // Промах и заблокированный урон цифру не показывают: ноль поверх экрана
      // читается как ошибка приложения, а не как «комбо сброшено».
      if (hit.damage <= 0 && !hit.blocked) return;
      const id = ++counter;
      const dx = (id % 3 - 1) * 46;
      setItems((cur) => [...cur.slice(-(MAX_ON_SCREEN - 1)), { id, hit, dx }]);
    });
  }, []);

  const drop = React.useCallback((id: number) => {
    setItems((cur) => cur.filter((i) => i.id !== id));
  }, []);

  if (items.length === 0) return null;

  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
    >
      {items.map((item) => (
        <FlyingNumber key={item.id} item={item} onDone={drop} />
      ))}
    </View>
  );
}

function FlyingNumber({ item, onDone }: { item: Flying; onDone: (id: number) => void }) {
  const progress = React.useRef(new Animated.Value(0)).current;
  const { hit } = item;

  React.useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: hit.killed ? 1600 : 1050,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE_DRIVER,
    }).start(() => onDone(item.id));
  }, [progress, hit.killed, item.id, onDone]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [10, -120] });
  const scale = progress.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0.6, 1.15, 0.95] });
  const opacity = progress.interpolate({ inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 1, 1, 0] });

  if (hit.blocked === "stamina") {
    return (
      <Animated.View style={{ position: "absolute", transform: [{ translateY }], opacity }}>
        <Text style={{ fontSize: 13, fontWeight: "800", color: "#5b4f8e" }}>Энергия кончилась</Text>
      </Animated.View>
    );
  }

  const color = hit.crit ? accents.gold : hit.superEffective ? accents.magenta : "#ffffff";
  const size = hit.crit ? 44 : hit.superEffective ? 36 : 30;

  return (
    <Animated.View
      style={{
        position: "absolute",
        alignItems: "center",
        transform: [{ translateY }, { translateX: item.dx }, { scale }],
        opacity,
      }}
    >
      <Text
        style={{
          fontSize: size,
          fontWeight: "900",
          letterSpacing: -1,
          color,
          textShadowColor: "rgba(30,10,60,0.55)",
          textShadowOffset: { width: 0, height: 3 },
          textShadowRadius: 8,
        }}
      >
        −{hit.damage}
      </Text>

      {hit.crit && (
        <Text style={{ fontSize: 12, fontWeight: "900", color: accents.gold, letterSpacing: 1.2 }}>
          КРИТ ×3
        </Text>
      )}
      {!hit.crit && hit.superEffective && (
        <Text style={{ fontSize: 11, fontWeight: "900", color: accents.magenta, letterSpacing: 1.1 }}>
          СВЕРХЭФФЕКТИВНО
        </Text>
      )}
      {hit.combo >= 3 && (
        <Text style={{ fontSize: 11, fontWeight: "800", color: "#ffffff", opacity: 0.9 }}>
          комбо {hit.combo} · ×{hit.comboMult}
        </Text>
      )}
      {hit.killed && (
        <Text style={{ fontSize: 15, fontWeight: "900", color: accents.gold, marginTop: 6, letterSpacing: 0.6 }}>
          {hit.bossName} повержен
        </Text>
      )}
    </Animated.View>
  );
}

export default RaidHitOverlay;
