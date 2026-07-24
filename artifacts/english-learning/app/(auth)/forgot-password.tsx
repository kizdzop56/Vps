import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async () => {
    if (!email.trim() || !email.includes("@")) {
      setError("Введите корректный email-адрес");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const baseUrl = process.env["EXPO_PUBLIC_DOMAIN"]
        ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
        : "";
      await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
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
    back: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 36 },
    backText: { fontSize: 15, color: colors.primary, fontWeight: "600" },
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
      paddingHorizontal: 14, marginBottom: 20,
    },
    input: { flex: 1, fontSize: 15, color: colors.foreground, paddingVertical: 14 },
    btn: {
      backgroundColor: colors.primary, borderRadius: 14,
      paddingVertical: 16, alignItems: "center",
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
          <TouchableOpacity style={s.back} onPress={() => router.back()}>
            <Feather name="arrow-left" size={18} color={colors.primary} />
            <Text style={s.backText}>Назад</Text>
          </TouchableOpacity>

          {!sent ? (
            <>
              <View style={s.icon}>
                <Feather name="mail" size={30} color={colors.primary} />
              </View>
              <Text style={s.title}>Забыли пароль?</Text>
              <Text style={s.sub}>
                Введите ваш email-адрес — мы отправим ссылку для создания нового пароля.
              </Text>

              <Text style={s.label}>Email</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Ваш email"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {error ? <Text style={s.error}>{error}</Text> : null}

              <TouchableOpacity style={s.btn} onPress={handleSend} disabled={loading}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Отправить ссылку</Text>
                }
              </TouchableOpacity>
            </>
          ) : (
            <View style={s.successBox}>
              <Feather name="check-circle" size={48} color="#4f46e5" />
              <Text style={s.successTitle}>Письмо отправлено!</Text>
              <Text style={s.successText}>
                Если этот email зарегистрирован, вы получите письмо со ссылкой для сброса пароля.{"\n\n"}
                Проверьте папку «Спам», если письмо не пришло в течение нескольких минут.
              </Text>
              <TouchableOpacity onPress={() => router.push("/(auth)/login")} style={{ marginTop: 24 }}>
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 15 }}>
                  Вернуться к входу
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
