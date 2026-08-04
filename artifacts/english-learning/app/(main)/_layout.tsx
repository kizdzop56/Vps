import { Redirect, Tabs } from "expo-router";
import { View, Text, TouchableOpacity, Platform, AppState, ActivityIndicator } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import { useEffect, useRef, useCallback, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CalendarBadgeProvider, useCalendarBadge } from "@/contexts/CalendarBadgeContext";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import authStorage from "@/utils/authStorage";
import { TabGuide, TAB_GUIDE_CONTENT, type TabGuideTab } from "@/components/TabGuide";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlacementTest } from "@/components/PlacementTest";
import { fc, apiFetch } from "@/hooks/useFlashcards";
import { Glyph } from "@/components/ui/Glyph";
import { accents } from "@/constants/theme";

export const SESSION_START_KEY = "timer_session_start";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

function StudentTimerManager() {
  const tokenRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionActiveRef = useRef(false);

  const rawPost = useCallback((path: string): Promise<void> => {
    const token = tokenRef.current;
    if (!token) return Promise.resolve();
    return fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      keepalive: true,
    }).then(() => undefined).catch(() => undefined);
  }, []);

  const startNow = useCallback(() => {
    if (sessionActiveRef.current) return;
    sessionActiveRef.current = true;
    AsyncStorage.setItem(SESSION_START_KEY, String(Date.now()));
    void rawPost("/api/time-tracking/start").then(() => rawPost("/api/users/ping"));
  }, [rawPost]);

  const endNow = useCallback(() => {
    if (!sessionActiveRef.current) return;
    sessionActiveRef.current = false;
    AsyncStorage.removeItem(SESSION_START_KEY);
    rawPost("/api/time-tracking/end");
  }, [rawPost]);

  useEffect(() => {
    authStorage.getItem("auth_token").then((t) => {
      tokenRef.current = t;
      startNow();
    });

    heartbeatRef.current = setInterval(() => {
      const token = tokenRef.current;
      if (token && sessionActiveRef.current) {
        fetch(`${BASE_URL}/api/users/ping`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          keepalive: true,
        }).catch(() => {});
      }
    }, 60_000);

    if (Platform.OS === "web" && typeof document !== "undefined") {
      const onVisibilityChange = () => {
        if (document.hidden) endNow();
        else startNow();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      const onBeforeUnload = () => { endNow(); };
      window.addEventListener("beforeunload", onBeforeUnload);
      return () => {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("beforeunload", onBeforeUnload);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        endNow();
      };
    }

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") endNow();
      else if (nextState === "active") startNow();
    });

    return () => {
      appStateSub.remove();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      endNow();
    };
  }, []);

  return null;
}

function CalendarTabIcon({ color }: { color: string }) {
  const { unreadCount } = useCalendarBadge();
  return (
    <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
      <Glyph name="calendar" size={22} color={color} />
      {unreadCount > 0 && (
        <View style={{
          position: "absolute", top: -6, right: -8,
          backgroundColor: "#e11d48", borderRadius: 9,
          minWidth: 18, height: 18, paddingHorizontal: 4,
          alignItems: "center", justifyContent: "center",
          // Белая обводка отделяет счётчик от иконки, иначе на активной
          // вкладке красное пятно сливается с фиолетовой заливкой.
          borderWidth: 2, borderColor: "#ffffff",
        }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900", lineHeight: 13 }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      )}
    </View>
  );
}

const TAB_SEEN_PREFIX = "tab_first_visit_v2_";
const GUIDE_TABS = new Set<string>(Object.keys(TAB_GUIDE_CONTENT));

interface CustomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
  onFirstVisit: (tabName: TabGuideTab, navigateFn: () => void) => void;
  userId: number;
  /** Список вкладок, гайд которых уже показан (загружен с сервера). */
  seenGuides: Set<string>;
  /** true — данные с сервера получены и можно показывать гайды. */
  seenGuidesLoaded: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Нижняя панель вкладок.
//
// Раньше подложка была полупрозрачной (белый на 62%) с размытием. На тёмных
// экранах это выглядело нормально, но основной фон приложения светло-сиреневый,
// и панель на нём растворялась: под ней просвечивал контент, край терялся, и
// было непонятно, где заканчивается страница и начинается навигация.
//
// Теперь подложка плотная белая, с цветной тенью и нижней гранью — тем же
// приёмом, что у ChunkyButton. Панель читается как физический объект, лежащий
// поверх страницы, а не как её часть. Размытие убрано: под непрозрачным белым
// оно всё равно ничего не делало, только грузило композитор в вебе.
// ─────────────────────────────────────────────────────────────────────────────
function CustomTabBar({
  state, descriptors, navigation,
  onFirstVisit, userId, seenGuides, seenGuidesLoaded,
}: CustomTabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const currentRouteName = state.routes[state.index]?.name ?? "";
  const hideTabBar = [
    "assignment/[id]",
    "submission-review/[id]",
    "flashcards/study/[deckId]",
    "flashcards/placement",
    "chat/[userId]",
  ].includes(currentRouteName);
  if (hideTabBar) return null;

  const visibleRoutes = state.routes.filter(
    (route: any) => descriptors[route.key].options.tabBarIcon !== undefined
  );

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: Math.max(insets.bottom, 8) + 8,
        left: 14,
        right: 14,
      }}
    >
      {/* Нижняя грань: тёмный слой, выступающий из-под панели на 5 пикселей.
          Даёт толщину — панель выглядит лежащей на экране, а не нарисованной. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0, right: 0, top: 5, bottom: -5,
          borderRadius: 30,
          backgroundColor: accents.violetDeep,
          opacity: 0.28,
        }}
      />

      <View
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 30,
          paddingVertical: 9,
          paddingHorizontal: 4,
          flexDirection: "row",
          alignItems: "center",
          // Тень в цвете бренда, а не серая: на сиреневом фоне серая читается
          // как грязь, а фиолетовая — как свечение.
          shadowColor: accents.indigoDeep,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.34,
          shadowRadius: 26,
          elevation: 20,
          borderWidth: 1.5,
          borderColor: "rgba(99,102,241,0.22)",
        }}
      >
        {visibleRoutes.map((route: any) => {
          const { options } = descriptors[route.key];
          const isFocused = state.routes[state.index].key === route.key;

          const label =
            typeof options.tabBarLabel === "string"
              ? options.tabBarLabel
              : typeof options.title === "string"
              ? options.title
              : route.name;

          const navigateToTab = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onPress = async () => {
            if (isFocused) return;
            const tabName = route.name as TabGuideTab;

            if (GUIDE_TABS.has(tabName)) {
              // Пока серверные данные ещё грузятся — просто навигируем,
              // не показываем гайд (чтобы не показать его повторно).
              if (!seenGuidesLoaded) {
                navigateToTab();
                return;
              }
              // Основная проверка: видел ли уже этот гайд (сервер)?
              if (!seenGuides.has(tabName)) {
                onFirstVisit(tabName, navigateToTab);
                return;
              }
            }

            navigateToTab();
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={{ flex: 1, alignItems: "center", gap: 3 }}
              onPress={onPress}
              activeOpacity={0.7}
            >
              {isFocused ? (
                <LinearGradient
                  colors={["#7c3aed", "#818cf8"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 18,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 50,
                    // Активная вкладка светится своим цветом — видно, где ты,
                    // даже боковым зрением.
                    shadowColor: "#7c3aed",
                    shadowOffset: { width: 0, height: 5 },
                    shadowOpacity: 0.42,
                    shadowRadius: 12,
                    elevation: 6,
                  }}
                >
                  {options.tabBarIcon?.({ color: "#ffffff", size: 22, focused: true })}
                </LinearGradient>
              ) : (
                <View
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 50,
                  }}
                >
                  {options.tabBarIcon?.({ color: colors.mutedForeground, size: 22, focused: false })}
                </View>
              )}
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: isFocused ? "800" : "600",
                  color: isFocused ? "#7c3aed" : colors.mutedForeground,
                  letterSpacing: 0.1,
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function MainLayoutInner() {
  const { user, isLoading } = useAuth();
  const colors = useColors();
  const qc = useQueryClient();

  const isStudentRole = user?.role === "student";
  const placementSettingsQ = useQuery({
    queryKey: ["fc-settings"],
    queryFn: fc.getSettings,
    enabled: !!user && isStudentRole,
    // Настройки меняются редко (пользователь явно что-то меняет).
    // 10 минут не перезапрашивать при переходах между вкладками.
    staleTime: 10 * 60_000,
  });

  // Список просмотренных гайдов — хранится на сервере, чтобы не сбрасываться
  // при очистке localStorage или входе с другого устройства.
  const onboardingSeenQ = useQuery({
    queryKey: ["onboarding-seen"],
    queryFn: () => apiFetch<{ seen: string[] }>("/api/users/onboarding-seen"),
    enabled: !!user,
    staleTime: Infinity, // меняется только при явном invalidate после закрытия гайда
  });
  const seenGuides = new Set<string>(onboardingSeenQ.data?.seen ?? []);
  const seenGuidesLoaded = onboardingSeenQ.isSuccess;

  const [guideState, setGuideState] = useState<{
    visible: boolean;
    tabName: TabGuideTab | null;
    navigateFn: (() => void) | null;
  }>({ visible: false, tabName: null, navigateFn: null });

  const handleFirstVisit = useCallback((tabName: TabGuideTab, navigateFn: () => void) => {
    setGuideState({ visible: true, tabName, navigateFn });
  }, []);

  const handleGuideClose = useCallback(() => {
    const nav = guideState.navigateFn;
    const tab = guideState.tabName;

    if (tab && user?.id) {
      // Записываем на сервер — основное хранилище.
      apiFetch("/api/users/onboarding-seen", {
        method: "POST",
        body: JSON.stringify({ tab }),
      }).catch(() => {});
      // Локальный кэш — быстрый фолбэк на случай медленного ответа сервера.
      authStorage.setItem(`${TAB_SEEN_PREFIX}${user.id}_${tab}`, "1").catch(() => {});
      // Обновляем кэш React Query, чтобы следующее нажатие на вкладку уже
      // видело актуальный список без лишнего запроса на сервер.
      qc.setQueryData<{ seen: string[] }>(["onboarding-seen"], (old) => ({
        seen: [...(old?.seen ?? []), tab],
      }));
    }

    setGuideState({ visible: false, tabName: null, navigateFn: null });
    if (nav) setTimeout(nav, 150);
  }, [guideState.navigateFn, guideState.tabName, user?.id, qc]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  const isStudent = user.role === "student";
  const isTeacher = isTeacherOrAdmin(user.role);
  const isParent = user.role === "parent";

  const needsPlacement = !!placementSettingsQ.data && !placementSettingsQ.data.placementDone;
  const showPlacement = isStudent && needsPlacement;

  return (
    <>
      {isStudent && <StudentTimerManager />}
      <Tabs
        tabBar={(props) => (
          <CustomTabBar
            {...props}
            onFirstVisit={handleFirstVisit}
            userId={user.id}
            seenGuides={seenGuides}
            seenGuidesLoaded={seenGuidesLoaded}
          />
        )}
        screenOptions={{
          headerShown: false,
          ...({ contentStyle: { backgroundColor: "transparent" } } as object),
        }}
      >
        {/* Иконки вкладок — из собственного набора (components/ui/Glyph.tsx),
            а не Feather: у своих глифов одна толщина штриха и один язык форм
            с иконками внутри экранов. Разнобой был заметнее всего в панели,
            где иконки стоят в ряд. */}
        <Tabs.Screen
          name="assignments"
          options={isParent
            ? { href: null }
            : {
                title: "Задания",
                tabBarIcon: ({ color }) => <Glyph name="book" size={22} color={color} />,
              }
          }
        />

        <Tabs.Screen
          name="progress"
          options={isParent
            ? { title: "Успеваемость", tabBarIcon: ({ color }) => <Glyph name="trendUp" size={22} color={color} /> }
            : { href: null }
          }
        />

        <Tabs.Screen
          name="flashcards"
          options={isStudent
            ? { title: "Слова", tabBarIcon: ({ color }) => <Glyph name="cards" size={22} color={color} /> }
            : { href: null }
          }
        />

        <Tabs.Screen name="history" options={{ href: null }} />

        <Tabs.Screen
          name="leaderboard"
          options={isStudent
            ? { title: "Рейтинг", tabBarIcon: ({ color }) => <Glyph name="trophy" size={22} color={color} /> }
            : { href: null }
          }
        />

        <Tabs.Screen name="timer" options={{ href: null }} />

        <Tabs.Screen
          name="students"
          options={(isTeacher || isParent)
            ? {
                title: isParent ? "Дети" : "Ученики",
                tabBarIcon: ({ color }) => <Glyph name="users" size={22} color={color} />,
              }
            : { href: null }
          }
        />

        <Tabs.Screen
          name="analysis"
          options={isTeacher
            ? { title: "Анализ", tabBarIcon: ({ color }) => <Glyph name="chart" size={22} color={color} /> }
            : { href: null }
          }
        />

        <Tabs.Screen
          name="calendar"
          options={(isTeacher || isStudent)
            ? { title: "Календарь", tabBarIcon: ({ color }) => <CalendarTabIcon color={color} /> }
            : { href: null }
          }
        />

        <Tabs.Screen
          name="friends"
          options={isTeacher
            ? {
                title: "Друзья",
                tabBarIcon: ({ color }) => <Glyph name="chat" size={22} color={color} />,
              }
            : { href: null }
          }
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "Профиль",
            tabBarIcon: ({ color }) => <Glyph name="user" size={22} color={color} />,
          }}
        />

        <Tabs.Screen name="chat/[userId]" options={{ href: null }} />
        <Tabs.Screen name="student/[id]" options={{ href: null }} />
        <Tabs.Screen name="assignment/[id]" options={{ href: null }} />
        <Tabs.Screen name="create-assignment" options={{ href: null }} />
        <Tabs.Screen name="friend/[id]" options={{ href: null }} />
        <Tabs.Screen name="teacher-results/[id]" options={{ href: null }} />
        <Tabs.Screen name="submission-review/[id]" options={{ href: null }} />
        <Tabs.Screen name="flashcards/study/[deckId]" options={{ href: null }} />
        <Tabs.Screen name="flashcards/session" options={{ href: null }} />
        <Tabs.Screen name="flashcards/hard" options={{ href: null }} />
        <Tabs.Screen name="flashcards/marathon" options={{ href: null }} />
        <Tabs.Screen name="flashcards/placement" options={{ href: null }} />
        <Tabs.Screen name="flashcards/stats" options={{ href: null }} />
        <Tabs.Screen name="flashcards/new-deck" options={{ href: null }} />
        <Tabs.Screen name="flashcards/deck/[id]" options={{ href: null }} />
        <Tabs.Screen name="flashcards/preview/[id]" options={{ href: null }} />
      </Tabs>

      {showPlacement && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.background }}>
          <PlacementTest onDone={() => {
            qc.invalidateQueries({ queryKey: ["fc-settings"] });
            placementSettingsQ.refetch();
          }} />
        </View>
      )}

      <ExpoImage
        source={require("@/assets/images/mascot_full.png")}
        style={{ width: 0, height: 0, opacity: 0, position: "absolute" }}
        cachePolicy="memory"
      />

      <TabGuide
        tabName={guideState.tabName}
        visible={guideState.visible}
        mascotName={isStudent ? "Снежа" : undefined}
        onClose={handleGuideClose}
      />
    </>
  );
}

export default function MainLayout() {
  return (
    <CalendarBadgeProvider>
      <MainLayoutInner />
    </CalendarBadgeProvider>
  );
}
