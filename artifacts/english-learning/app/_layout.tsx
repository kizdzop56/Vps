import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useLayoutEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/contexts/AuthContext";
import { setBaseUrl } from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleSheet, View } from "react-native";
import { useFonts } from "expo-font";
import {
  Unbounded_700Bold,
  Unbounded_800ExtraBold,
  Unbounded_900Black,
} from "@expo-google-fonts/unbounded";
import {
  Manrope_500Medium,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import { applyGlobalFonts } from "@/components/ui/applyFonts";
import { ErrorScreen } from "@/components/ErrorScreen";

// Keep typography and the existing browser font setup, but let React Native Web
// own its DOM. Manually rewriting React-managed nodes breaks event handling and
// can leave controls on a route looking enabled while no longer responding.
applyGlobalFonts();

if (Platform.OS === "web" && typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    input, textarea { outline: none !important; }
    /* Assignment prompt images were capped at 170px, leaving most of the
       viewport blank. Enlarge only those fixed-height inline media images. */
    img[style*="170px"] {
      height: min(42vh, 420px) !important;
      max-height: min(42vh, 420px) !important;
      object-fit: contain !important;
    }
  `;
  document.head.appendChild(style);

  if (!document.querySelector('meta[name="format-detection"]')) {
    const meta = document.createElement("meta");
    meta.name = "format-detection";
    meta.content = "telephone=no, address=no, email=no, date=no, url=no";
    document.head.appendChild(meta);
  }

  try {
    const featherUrl = require("../assets/fonts/Feather.ttf");
    const iconStyle = document.createElement("style");
    iconStyle.textContent = `@font-face { font-family: 'Feather'; src: url('${featherUrl}') format('truetype'); font-display: swap; }`;
    document.head.appendChild(iconStyle);
    if (!document.querySelector('link[data-feather-preload]')) {
      const preload = document.createElement("link");
      preload.rel = "preload";
      preload.as = "font";
      preload.type = "font/ttf";
      preload.crossOrigin = "anonymous";
      preload.href = featherUrl;
      preload.dataset["featherPreload"] = "1";
      document.head.insertBefore(preload, document.head.firstChild);
    }
  } catch (_) {}
}

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync();
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60_000,
    },
  },
});

const domain = process.env["EXPO_PUBLIC_DOMAIN"];
setBaseUrl(domain ? `https://${domain}` : null);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Feather: require("../assets/fonts/Feather.ttf"),
    Unbounded_700Bold,
    Unbounded_800ExtraBold,
    Unbounded_900Black,
    Manrope_500Medium,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useLayoutEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const splash = document.getElementById("_splash-screen");
      if (splash) {
        splash.classList.add("hidden");
        setTimeout(() => {
          if (splash.parentNode) splash.parentNode.removeChild(splash);
        }, 500);
      }
      const hide = (window as any).__hideSplash;
      if (typeof hide === "function") hide();
    }
  });

  useEffect(() => {
    if (Platform.OS !== "web" && (fontsLoaded || fontError)) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (Platform.OS !== "web" && !fontsLoaded && !fontError) return null;

  return (
    <ErrorScreen>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <LinearGradient
          colors={["#F8F5FF", "#E8DFFF", "#D0C2FF"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={{
            flex: 1,
            width: "100%",
            maxWidth: Platform.OS === "web" ? 1200 : undefined,
            alignSelf: "center",
          }}
        >
          <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: "transparent" },
                    animation: "fade",
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(main)" />
                  <Stack.Screen name="+not-found" />
                </Stack>
              </AuthProvider>
            </QueryClientProvider>
          </SafeAreaProvider>
        </View>
      </GestureHandlerRootView>
    </ErrorScreen>
  );
}

const styles = StyleSheet.create({});
