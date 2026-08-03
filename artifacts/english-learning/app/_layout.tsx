import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useLayoutEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/contexts/AuthContext";
import { setBaseUrl } from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleSheet } from "react-native";
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

if (Platform.OS === "web" && typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = "input, textarea { outline: none !important; }";
  document.head.appendChild(style);

  if (!document.querySelector('meta[name="format-detection"]')) {
    const meta = document.createElement("meta");
    meta.name = "format-detection";
    meta.content = "telephone=no, address=no, email=no, date=no, url=no";
    document.head.appendChild(meta);
  }

  try {
    const featherUrl = require("../assets/fonts/Feather.ttf");

    // font-display: swap — сразу показываем fallback-символ, меняем на иконку
    // когда шрифт загружен. Раньше было block: браузер держал невидимый текст
    // до 3 секунд — отсюда «пустые квадраты» при первой загрузке.
    const iconStyle = document.createElement("style");
    iconStyle.textContent = `@font-face { font-family: 'Feather'; src: url('${featherUrl}') format('truetype'); font-display: swap; }`;
    document.head.appendChild(iconStyle);

    // Preload: браузер начинает скачивать шрифт ещё до разбора CSS/JS,
    // поэтому к моменту первой отрисовки он уже в кэше.
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

// SplashScreen is native-only — on web it creates a persistent overlay that
// never gets removed because useFonts does not resolve for CSS-loaded fonts,
// so hideAsync() is never called and the overlay blocks the React tree forever.
if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync();
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // 5 минут: при переходах между вкладками данные не перезапрашиваются
      // без необходимости. Экраны, которым нужна свежая выдача, делают явный
      // refetch через useFocusEffect с проверкой isStale.
      staleTime: 5 * 60_000,
    },
  },
});

const domain = process.env["EXPO_PUBLIC_DOMAIN"];
setBaseUrl(domain ? `https://${domain}` : null);

export default function RootLayout() {
  // Feather — иконочный шрифт, без него интерфейс ломается, поэтому на нативе
  // ждём именно его (см. проверку ниже).
  const [fontsLoaded, fontError] = useFonts({
    Feather: require("../assets/fonts/Feather.ttf"),
  });

  // Шрифты оформления грузим ОТДЕЛЬНЫМ хуком и намеренно не блокируем ими
  // запуск: пока Unbounded и Manrope едут, текст рисуется системным шрифтом,
  // а затем подменяется. Если объединить их с Feather, первый запуск на
  // медленной сети даст лишнюю задержку белого экрана ради косметики.
  // Имена ключей совпадают с fonts.* в constants/theme.ts.
  useFonts({
    Unbounded_700Bold,
    Unbounded_800ExtraBold,
    Unbounded_900Black,
    Manrope_500Medium,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  // On web: directly remove the HTML loading screen as soon as React renders.
  // We manipulate the DOM directly so this works even when Telegram/WKWebView
  // CSP blocks inline scripts (which would prevent window.__hideSplash from loading).
  useLayoutEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const splash = document.getElementById("_splash-screen");
      if (splash) {
        splash.classList.add("hidden");
        setTimeout(() => {
          if (splash.parentNode) splash.parentNode.removeChild(splash);
        }, 500);
      }
      // Also call helper if it was loaded (belt-and-suspenders)
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LinearGradient
        colors={["#F8F5FF", "#E8DFFF", "#D0C2FF"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({});
