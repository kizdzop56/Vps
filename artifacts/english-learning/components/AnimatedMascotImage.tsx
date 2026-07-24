import React from "react";
import { View } from "react-native";
import { Image } from "expo-image";

export type MascotPose =
  | "wave" | "celebrate" | "think" | "happy" | "excited"
  | "curious" | "point" | "laugh" | "sit" | "lie";

const RATIO: Record<MascotPose, number> = {
  wave: 9/16, celebrate: 9/16, think: 9/16, happy: 9/16, excited: 9/16,
  curious: 9/16, point: 9/16, laugh: 9/16, sit: 9/16, lie: 16/9,
};

const SRC: Record<MascotPose, any> = {
  wave:      require("../assets/images/mascot_full.png"),
  celebrate: require("../assets/images/mascot_full_celebrate.png"),
  think:     require("../assets/images/mascot_full_think.png"),
  happy:     require("../assets/images/mascot_happy.png"),
  excited:   require("../assets/images/mascot_excited.png"),
  curious:   require("../assets/images/mascot_curious.png"),
  point:     require("../assets/images/mascot_point.png"),
  laugh:     require("../assets/images/mascot_laugh.png"),
  sit:       require("../assets/images/mascot_sit.png"),
  lie:       require("../assets/images/mascot_lie.png"),
};

interface Props {
  pose?:   MascotPose;
  width?:  number;
  height?: number;
  style?:  any;
}

export function AnimatedMascotImage({ pose = "wave", width = 200, height, style }: Props) {
  const imgW = width;
  const imgH = height ?? Math.round(width / RATIO[pose]);

  return (
    <View style={[{ width: imgW, height: imgH }, style]}>
      <Image
        source={SRC[pose]}
        style={{ width: imgW, height: imgH }}
        contentFit="contain"
        cachePolicy="memory"
      />
    </View>
  );
}
