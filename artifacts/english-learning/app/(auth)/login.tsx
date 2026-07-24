import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import PrismaticBurst from "@/components/PrismaticBurst";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function LoginScreen() {
  const colors = useColors();
  const { login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError("Введите псевдоним и пароль");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const baseUrl = process.env["EXPO_PUBLIC_DOMAIN"]
        ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
        : "";
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(
          response.status === 401
            ? "Неверный псевдоним или пароль"
            : data.error || "Ошибка входа. Попробуйте снова."
        );
        return;
      }
      await login(data.token, data.user);
      router.replace("/(main)/profile");
    } catch {
      setError("Ошибка соединения. Попробуйте снова.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* ── Верхняя брендинговая зона с анимацией Prismatic Burst ── */}
      <View style={[styles.brand, { paddingTop: insets.top + 40 }]}>
        <PrismaticBurst
          intensity={2}
          speed={0.5}
          animationType="rotate3d"
          colors={["#6d28d9", "#d946ef", "#8b5cf6"]}
        />

        <Text style={styles.appName}>ENGLISH</Text>
        <Text style={styles.appNameSub}>LEARNING</Text>
        <Text style={styles.tagline}>Платформа для изучения английского</Text>
      </View>

      {/* ── Нижняя белая форма ── */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.form}
        >
          <Text style={styles.formTitle}>Войти в аккаунт</Text>

          <Text style={styles.label}>Псевдоним</Text>
          <View style={styles.inputRow}>
            <Feather name="user" size={16} color="#9b8cc4" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Введите ваш псевдоним"
              placeholderTextColor="#b3a8d0"
              autoCapitalize="none"
              autoCorrect={false}
              testID="username-input"
            />
          </View>

          <Text style={styles.label}>Пароль</Text>
          <View style={styles.inputRow}>
            <Feather name="lock" size={16} color="#9b8cc4" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Введите пароль"
              placeholderTextColor="#b3a8d0"
              secureTextEntry={!showPass}
              testID="password-input"
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass(!showPass)}>
              <Feather name={showPass ? "eye-off" : "eye"} size={18} color="#9b8cc4" />
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={loading}
            testID="login-button"
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Войти</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={{ alignItems: "center", marginTop: 4, marginBottom: 4 }}
            onPress={() => router.push("/(auth)/forgot-password")}
          >
            <Text style={[styles.footerLink, { fontSize: 14 }]}>Забыли пароль?</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Нет аккаунта?</Text>
            <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
              <Text style={styles.footerLink}> Зарегистрироваться</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const PURPLE = "#7c3aed";

const styles = StyleSheet.create({
  brand: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 40,
    overflow: "hidden",
    backgroundColor: "#0a0118",
  },

  appName: {
    fontSize: 38,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 8,
    lineHeight: 42,
  },
  appNameSub: {
    fontSize: 38,
    fontWeight: "800",
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 8,
    lineHeight: 42,
    marginBottom: 14,
  },
  tagline: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    letterSpacing: 0.3,
  },

  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: "hidden",
  },
  form: {
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 8,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 22,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5b4f8e",
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  inputRow: {
    backgroundColor: "#f8f5ff",
    borderWidth: 1.5,
    borderColor: "rgba(160,140,220,0.3)",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 16,
    ...(Platform.OS === "web" ? { outlineWidth: 0 } as any : {}),
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#0f172a",
    paddingVertical: 14,
    ...(Platform.OS === "web" ? { outlineWidth: 0, outlineStyle: "none" } as any : {}),
  },
  eyeBtn: { padding: 6 },
  error: {
    fontSize: 13,
    color: "#e11d48",
    textAlign: "center",
    marginBottom: 12,
  },
  button: {
    backgroundColor: PURPLE,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
    marginTop: 4,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 4,
  },
  footerText: { fontSize: 14, color: "#5b4f8e" },
  footerLink: { fontSize: 14, fontWeight: "700", color: PURPLE },
});
