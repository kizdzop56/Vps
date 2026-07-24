import React from "react";
import {
  Modal, View, Image, TouchableOpacity,
  ScrollView, Platform, Dimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  uri: string | null;
  onClose: () => void;
};

export function ImageZoomModal({ uri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get("window");

  if (!uri) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.96)" }}>
        <TouchableOpacity
          onPress={onClose}
          style={{
            position: "absolute",
            top: insets.top + (Platform.OS === "web" ? 12 : 16),
            right: 16,
            zIndex: 20,
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: "rgba(255,255,255,0.18)",
            justifyContent: "center", alignItems: "center",
          }}
        >
          <Feather name="x" size={22} color="#fff" />
        </TouchableOpacity>

        {Platform.OS !== "web" ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flex: 1, justifyContent: "center", alignItems: "center" }}
            minimumZoomScale={1}
            maximumZoomScale={6}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            bouncesZoom
            centerContent
          >
            <Image
              source={{ uri }}
              style={{ width, height: height * 0.88 }}
              resizeMode="contain"
            />
          </ScrollView>
        ) : (
          <TouchableOpacity
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
            onPress={onClose}
            activeOpacity={1}
          >
            {/* @ts-ignore — web-only style */}
            <img
              src={uri}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                userSelect: "none",
                cursor: "zoom-in",
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}
