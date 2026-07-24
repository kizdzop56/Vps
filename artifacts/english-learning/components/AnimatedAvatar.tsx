import React, { useEffect, useRef } from "react";
import { View, Text, Image, Animated } from "react-native";

type Props = {
  size?: number;
  avatarColor: string;
  avatarEmoji?: string | null;
  avatarUrl?: string | null;
  animated?: boolean;
  onlineDot?: boolean | null;
};

export function AnimatedAvatar({
  size = 80,
  avatarColor,
  avatarEmoji,
  avatarUrl,
  animated = false,
  onlineDot,
}: Props) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) {
      ring1.setValue(0);
      ring2.setValue(0);
      ring3.setValue(0);
      return;
    }

    const makePulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );

    const a1 = makePulse(ring1, 0);
    const a2 = makePulse(ring2, 550);
    const a3 = makePulse(ring3, 1100);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [animated, ring1, ring2, ring3]);

  const ringStyle = (anim: Animated.Value, maxScale: number, maxOpacity: number) => ({
    position: "absolute" as const,
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 2.5,
    borderColor: avatarColor,
    opacity: anim.interpolate({
      inputRange: [0, 0.15, 0.7, 1],
      outputRange: [0, maxOpacity, maxOpacity * 0.4, 0],
    }),
    transform: [
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, maxScale],
        }),
      },
    ],
  });

  const dotSize = Math.max(10, size * 0.15);

  return (
    <View
      style={{
        width: size * 1.7,
        height: size * 1.7,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {animated && (
        <>
          <Animated.View style={ringStyle(ring1, 1.38, 0.7)} />
          <Animated.View style={ringStyle(ring2, 1.62, 0.5)} />
          <Animated.View style={ringStyle(ring3, 1.9, 0.3)} />
        </>
      )}

      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: avatarColor,
          overflow: "hidden",
          justifyContent: "center",
          alignItems: "center",
          borderWidth: animated ? 2.5 : 0,
          borderColor: animated ? avatarColor + "60" : "transparent",
        }}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            resizeMode="cover"
          />
        ) : (
          <Text style={{ fontSize: size * 0.46 }}>{avatarEmoji ?? "🦁"}</Text>
        )}
      </View>

      {onlineDot === true && (
        <View
          style={{
            position: "absolute",
            bottom: size * 0.35 - dotSize / 2,
            right: size * 0.35 - dotSize / 2,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: onlineDot ? "#22c55e" : "#94a3b8",
            borderWidth: 2,
            borderColor: "#fff",
          }}
        />
      )}
    </View>
  );
}
