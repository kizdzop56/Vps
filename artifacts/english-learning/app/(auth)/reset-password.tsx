import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ResetPasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token: string }>();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleReset = async () => {
    if (password.length < 6) { setError("Пароль должен содержать не менее 6 символов"); return; }
    if (password !== confirm) { setError("Пароли не совпадают"); return; }
    if (!token) { setError("Ссылка недействительна"); return; }

    setLoading(true);
    setError("");
    try {
      const baseUrl = process.env["EXPO_PUBLIC_DOMAIN"]
        ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
        : "";
      const res = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Ошибка. Попробуйте снова."); return; }
      setDone(true);
    } catch {
      setError("Ошибка соединения. Попробуйте снова.");
    } finally {
      setLoading(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      flex: 1, paddingHorizontal: 24,
      paddingTop: insets.top + 32, paddingBottom: insets.bottom + 36,
    },
    icon: {
      width: 64, height: 64, borderRadius: 20,
      backgroundColor: colors.primary + "15",
      justifyContent: "center", alignItems: "center", marginBottom: 24,
    },
    title: { fontSize: 26, fontWeight: "800", color: colors.foreground, marginBottom: 8 },
    sub: { fontSize: 15, color: colors.mutedForeground, lineHeight: 22, marginBottom: 32 },
    label: { fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 6 },
    inputRow: {
      backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
      borderRadius: 13, flexDirection: "row", alignItems: "center",
      paddingHorizontal: 14, marginBottom: 14,
    },
    input: { flex: 1, fontSize: 15, color: colors.foreground, paddingVertical: 14 },
    eyeBtn: { padding: 6 },
    btn: {
      backgroundColor: colors.primary, borderRadius: 14,
      paddingVertical: 16, alignItems: "center", marginTop: 6,
    },
    btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
    error: { fontSize: 14, color: colors.destructive, textAlign: "center", marginBottom: 14 },
    successBox: {
      backgroundColor: "#eef2ff", borderRadius: 16, padding: 24,
      borderWidth: 1.5, borderColor: "#a5b4fc", alignItems: "center",
    },
    successTitle: { fontSize: 20, fontWeight: "800", color: "#4338ca", marginTop: 12, marginBottom: 8 },
    successText: { fontSize: 15, color: "#312e81", textAlign: "center", lineHeight: 22 },
  });

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={s.content}>

          {!done ? (
            <>
              <View style={s.icon}>
                <Feather name="lock" size={30} color={colors.primary} />
              </View>
              <Text style={s.title}>Новый пароль</Text>
              <Text style={s.sub}>Придумайте надёжный пароль для вашего аккаунта.</Text>

              <Text style={s.label}>Новый пароль</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Не менее 6 символов"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPass}
                />
                <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPass(!showPass)}>
                  <Feather name={showPass ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              <Text style={s.label}>Повторите пароль</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.input}
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Повторите пароль"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPass}
                />
              </View>

              {error ? <Text style={s.error}>{error}</Text> : null}

              <TouchableOpacity style={s.btn} onPress={handleReset} disabled={loading}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Сохранить пароль</Text>
                }
              </TouchableOpacity>
            </>
          ) : (
            <View style={s.successBox}>
              <Feather name="check-circle" size={48} color="#4f46e5" />
              <Text style={s.successTitle}>Пароль изменён!</Text>
              <Text style={s.successText}>
                Ваш пароль успешно обновлён. Теперь войдите с новым паролем.
              </Text>
              <TouchableOpacity
                onPress={() => router.replace("/(auth)/login")}
                style={{ marginTop: 24 }}
              >
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 15 }}>
                  Войти в аккаунт
                </Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
