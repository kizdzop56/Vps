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

// Типографику включаем до первой отрисовки: Unbounded уходит на заголовки и
// крупные числа, Manrope на текст. Правило разбора и причины см. в самом файле.
applyGlobalFonts();

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
  });

  useFonts({
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
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    const win = window as any;
    const originalFetch = window.fetch.bind(window);
    const updateAssignmentList = () => {
      // Preserve the existing preview affordance while hiding duplicate actions
      // and the draft label from the assignment list.
      document.querySelectorAll<HTMLElement>('[aria-label="Создать задание"]').forEach((element) => {
        if (element.dataset["compactCreateHidden"] === "1") return;
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.width <= 64 && rect.height <= 64) {
          element.style.display = "none";
          element.dataset["compactCreateHidden"] = "1";
        }
      });
      document.querySelectorAll<HTMLElement>('[aria-label^="Начать задание"]').forEach((element) => {
        if (element.dataset["startAssignmentHidden"] === "1") return;
        element.style.display = "none";
        element.dataset["startAssignmentHidden"] = "1";
      });

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let textNode: Node | null;
      while ((textNode = walker.nextNode())) {
        if (textNode.nodeValue?.trim() !== "Черновик") continue;
        textNode.nodeValue = "";
        const previewButton = textNode.parentElement?.closest<HTMLElement>('[role="button"]');
        if (previewButton) {
          previewButton.style.cursor = "pointer";
          previewButton.setAttribute("aria-label", "Предпросмотр задания");
        }
      }

      // Replace the segmented assignment progress bar with a clear start count.
      // The existing line below it continues to show submissions separately.
      if (location.pathname.includes("/assignments")) {
        const rows = Array.isArray(win.__teacherAssignmentRows) ? win.__teacherAssignmentRows : [];
        for (const row of rows) {
          const assigned = Number(row?.assignedCount ?? 0);
          if (!row?.title || assigned < 1) continue;
          const titleWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let titleNode: Node | null;
          while ((titleNode = titleWalker.nextNode())) {
            if (titleNode.nodeValue?.trim() !== String(row.title)) continue;
            let card: HTMLElement | null = titleNode.parentElement;
            for (let depth = 0; card && depth < 12; depth++, card = card.parentElement) {
              const cardText = card.innerText ?? "";
              if (!cardText.includes("сдали") || !cardText.includes("ждём")) continue;
              const noteText = Array.from(card.querySelectorAll<HTMLElement>("*")).find((el) =>
                el.innerText?.includes(`из ${assigned} сдали`) && el.innerText?.includes("ждём"),
              );
              if (!noteText) continue;
              const noteRow = noteText.parentElement;
              const pips = noteRow?.previousElementSibling as HTMLElement | null;
              if (pips && pips.dataset["assignmentPips"] !== "1") {
                pips.style.display = "none";
                pips.dataset["assignmentPips"] = "1";
              }
              if (noteRow) {
                let startedLine = noteRow.nextElementSibling as HTMLElement | null;
                if (startedLine?.dataset["startedCountFor"] !== String(row.id)) {
                  startedLine = document.createElement("div");
                  startedLine.dataset["startedCountFor"] = String(row.id);
                  startedLine.style.cssText = "margin-top:6px;font-size:12px;font-weight:700;color:#6b6387";
                  noteRow.insertAdjacentElement("afterend", startedLine);
                }
                startedLine.textContent = `Приступили: ${Number(row.startedCount ?? 0)} из ${assigned}`;
              }
              break;
            }
          }
        }
      }

      // Assignment media used to be forced into a short, cropped 170px strip.
      // Let it keep its natural ratio, grow up to a sensible viewport height,
      // and the question content below will flow down naturally.
      if (location.pathname.includes("/assignment/")) {
        document.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
          if (!image.style.height || !/^(?:160|170)px$/.test(image.style.height)) return;
          image.style.setProperty("height", "auto", "important");
          image.style.setProperty("max-height", "420px", "important");
          image.style.setProperty("width", "100%", "important");
          image.style.setProperty("object-fit", "contain", "important");
        });

        const scoreWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let scoreNode: Node | null;
        while ((scoreNode = scoreWalker.nextNode())) {
          if (!/^\d{1,3}%$/.test(scoreNode.nodeValue?.trim() ?? "")) continue;
          const scoreText = scoreNode.parentElement as HTMLElement | null;
          if (!scoreText || scoreText.dataset["scoreRingFit"] === "1") continue;
          scoreText.style.setProperty("font-size", "22px", "important");
          scoreText.style.setProperty("line-height", "1.1", "important");
          scoreText.style.setProperty("white-space", "nowrap", "important");
          scoreText.dataset["scoreRingFit"] = "1";
        }
      }
    };

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch(input, init);
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (requestUrl.includes("/api/assignments/my-assignments") && response.ok) {
        void response.clone().json().then((rows) => {
          win.__teacherAssignmentRows = rows;
          updateAssignmentList();
        }).catch(() => {});
      }
      return response;
    };

    updateAssignmentList();
    const observer = new MutationObserver(updateAssignmentList);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label"],
    });
    const onNavigation = () => updateAssignmentList();
    window.addEventListener("popstate", onNavigation);
    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", onNavigation);
      window.fetch = originalFetch;
    };
  }, []);

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
