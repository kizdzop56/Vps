import React, { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import authStorage from "@/utils/authStorage";

export default function VerifyEmailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { login } = useAuth();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Ссылка недействительна");
      return;
    }
    const verify = async () => {
      try {
        const baseUrl = process.env["EXPO_PUBLIC_DOMAIN"]
          ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
          : "";
        const res = await fetch(`${baseUrl}/api/auth/verify-email?token=${token}`);
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || "Ошибка подтверждения");
          setStatus("error");
          return;
        }
        // Auto-login after verification
        await login(data.token, data.user);
        await authStorage.setItem("onboarding_tour_pending", "1");
        setStatus("success");
        setTimeout(() => router.replace("/(main)/profile"), 2000);
      } catch {
        setErrorMsg("Ошибка соединения");
        setStatus("error");
      }
    };
    verify();
  }, [token]);

  const s = StyleSheet.create({
    container: {
      flex: 1, backgroundColor: colors.background,
      justifyContent: "center", alignItems: "center",
      paddingHorizontal: 32, paddingTop: insets.top, paddingBottom: insets.bottom,
    },
    icon: {
      width: 80, height: 80, borderRadius: 24,
      backgroundColor: colors.primary + "15",
      justifyContent: "center", alignItems: "center", marginBottom: 28,
    },
    title: { fontSize: 24, fontWeight: "800", color: colors.foreground, textAlign: "center", marginBottom: 12 },
    sub: { fontSize: 15, color: colors.mutedForeground, textAlign: "center", lineHeight: 22, marginBottom: 32 },
    btn: {
      backgroundColor: colors.primary, borderRadius: 14,
      paddingVertical: 14, paddingHorizontal: 32, alignItems: "center",
    },
    btnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  });

  if (status === "loading") {
    return (
      <View style={s.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[s.sub, { marginTop: 20 }]}>Подтверждаем ваш email...</Text>
      </View>
    );
  }

  if (status === "success") {
    return (
      <View style={s.container}>
        <View style={[s.icon, { backgroundColor: "#eef2ff" }]}>
          <Feather name="check-circle" size={40} color="#4f46e5" />
        </View>
        <Text style={s.title}>Email подтверждён!</Text>
        <Text style={s.sub}>Вы успешно подтвердили ваш email. Перенаправляем в приложение...</Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={[s.icon, { backgroundColor: "#fff1f2" }]}>
        <Feather name="x-circle" size={40} color="#be123c" />
      </View>
      <Text style={s.title}>Ссылка недействительна</Text>
      <Text style={s.sub}>{errorMsg || "Ссылка истекла или уже была использована."}</Text>
      <TouchableOpacity style={s.btn} onPress={() => router.replace("/(auth)/login")}>
        <Text style={s.btnText}>Перейти к входу</Text>
      </TouchableOpacity>
    </View>
  );
}
