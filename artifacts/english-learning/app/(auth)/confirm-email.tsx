import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import authStorage from "@/utils/authStorage";

const CODE_LEN = 6;

export default function ConfirmEmailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, token, login, logout } = useAuth();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(""));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const inputs = useRef<Array<TextInput | null>>(Array(CODE_LEN).fill(null));

  // Auto-send code on mount so the user reliably gets one email
  useEffect(() => {
    if (!token) return;
    const baseUrl = process.env["EXPO_PUBLIC_DOMAIN"]
      ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}` : "";
    fetch(`${baseUrl}/api/auth/resend-code`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(() => { setResent(true); setCooldown(60); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const applyCode = (code: string) => {
    const clean = code.replace(/\D/g, "").slice(0, CODE_LEN);
    if (!clean) return;
    const arr = Array(CODE_LEN).fill("").map((_, i) => clean[i] ?? "");
    setDigits(arr);
    setError("");
    const lastFilled = Math.min(clean.length, CODE_LEN) - 1;
    inputs.current[lastFilled]?.focus();
  };

  const handleChange = (text: string, idx: number) => {
    // Full-code paste via onChangeText (native / some web cases)
    if (text.length >= CODE_LEN && /^\d+$/.test(text.replace(/\D/g, ""))) {
      applyCode(text);
      return;
    }

    let char: string;
    if (text.length === 0) {
      char = "";
    } else if (text.length === 1) {
      char = text;
    } else {
      const existing = digits[idx];
      const stripped = existing ? text.replace(existing, "") : text;
      const clean = stripped.replace(/\D/g, "");
      char = clean.slice(0, 1) || text.replace(/\D/g, "").slice(-1);
    }

    if (char && !/\d/.test(char)) return;
    const next = [...digits];
    next[idx] = char;
    setDigits(next);
    setError("");
    if (char && idx < CODE_LEN - 1) inputs.current[idx + 1]?.focus();
  };

  const handleKeyPress = (e: any, idx: number) => {
    if (e.nativeEvent.key === "Backspace" && !digits[idx] && idx > 0) {
      const next = [...digits];
      next[idx - 1] = "";
      setDigits(next);
      inputs.current[idx - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = digits.join("");
    if (code.length < CODE_LEN) { setError("Введите все 6 цифр кода"); return; }

    setLoading(true);
    setError("");
    try {
      const baseUrl = process.env["EXPO_PUBLIC_DOMAIN"]
        ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}` : "";
      const res = await fetch(`${baseUrl}/api/auth/verify-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Неверный код");
        setDigits(Array(CODE_LEN).fill(""));
        inputs.current[0]?.focus();
        return;
      }
      if (user) {
        const updated = { ...user, emailVerified: true };
        await authStorage.setItem("auth_user", JSON.stringify(updated));
        await login(token!, updated);
      }
      router.replace("/(main)/profile");
    } catch {
      setError("Ошибка соединения. Попробуйте снова.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoHome = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  const handleResend = async () => {
    if (cooldown > 0 || !token) return;
    setResending(true);
    setResent(false);
    setError("");
    try {
      const baseUrl = process.env["EXPO_PUBLIC_DOMAIN"]
        ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}` : "";
      await fetch(`${baseUrl}/api/auth/resend-code`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setResent(true);
      setCooldown(60);
      setDigits(Array(CODE_LEN).fill(""));
      inputs.current[0]?.focus();
    } catch {
      setError("Не удалось отправить код. Попробуйте позже.");
    } finally {
      setResending(false);
    }
  };

  const maskedEmail = user?.email
    ? user.email.replace(/(.{2}).+(@.+)/, "$1***$2")
    : "вашу почту";

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      flex: 1, alignItems: "center",
      paddingHorizontal: 28, paddingTop: insets.top + 40,
      paddingBottom: insets.bottom + 32,
    },
    icon: {
      width: 72, height: 72, borderRadius: 22,
      backgroundColor: colors.primary + "15",
      justifyContent: "center", alignItems: "center", marginBottom: 28,
    },
    title: { fontSize: 26, fontWeight: "800", color: colors.foreground, textAlign: "center", marginBottom: 10 },
    sub: { fontSize: 15, color: colors.mutedForeground, textAlign: "center", lineHeight: 22, marginBottom: 36 },
    emailBold: { fontWeight: "700", color: colors.foreground },
    digitRow: { flexDirection: "row", gap: 10, marginBottom: 28 },
    digitBox: {
      width: 46, height: 56, borderRadius: 14,
      borderWidth: 2, borderColor: colors.border,
      backgroundColor: colors.card,
      justifyContent: "center", alignItems: "center",
    },
    digitBoxFilled: { borderColor: colors.primary },
    digitText: { fontSize: 24, fontWeight: "800", color: colors.foreground, textAlign: "center" },
    error: { fontSize: 14, color: colors.destructive, textAlign: "center", marginBottom: 18, lineHeight: 20 },
    btn: {
      width: "100%", backgroundColor: colors.primary,
      borderRadius: 14, paddingVertical: 16, alignItems: "center", marginBottom: 20,
    },
    btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
    resendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    resendText: { fontSize: 14, color: colors.mutedForeground },
    resendLink: { fontSize: 14, fontWeight: "700", color: colors.primary },
    resendDisabled: { fontSize: 14, color: colors.mutedForeground },
    resentBadge: {
      flexDirection: "row", gap: 6, alignItems: "center",
      backgroundColor: "#eef2ff", borderRadius: 10, paddingHorizontal: 12,
      paddingVertical: 6, marginTop: 12,
    },
    resentText: { fontSize: 13, color: "#4338ca", fontWeight: "600" },
    homeLink: { marginTop: 24, flexDirection: "row", alignItems: "center", gap: 6 },
    homeLinkText: { fontSize: 14, fontWeight: "700", color: colors.mutedForeground },
  });

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.content}>
        <View style={s.icon}>
          <Feather name="mail" size={34} color={colors.primary} />
        </View>
        <Text style={s.title}>Введите код</Text>
        <Text style={s.sub}>
          Мы отправили 6-значный код на{"\n"}
          <Text style={s.emailBold}>{maskedEmail}</Text>
        </Text>

        {/* OTP boxes */}
        <View style={s.digitRow}>
          {digits.map((d, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={1}
              style={[s.digitBox, d ? s.digitBoxFilled : null]}
              onPress={() => {
                const firstEmpty = digits.findIndex(v => !v);
                const target = firstEmpty === -1 ? i : Math.min(i, firstEmpty);
                inputs.current[target]?.focus();
              }}
            >
              <TextInput
                ref={r => { inputs.current[i] = r; }}
                style={[
                  s.digitText,
                  Platform.OS === "web" && { outlineStyle: "none" } as any,
                ]}
                value={d}
                onChangeText={t => handleChange(t, i)}
                onKeyPress={e => handleKeyPress(e, i)}
                keyboardType="number-pad"
                maxLength={Platform.OS === "web" ? 1 : CODE_LEN}
                selectTextOnFocus
                caretHidden={Platform.OS !== "web"}
                {...(Platform.OS === "web"
                  ? {
                      onPaste: (e: any) => {
                        const pasted: string = e.clipboardData?.getData("text") ?? "";
                        const clean = pasted.replace(/\D/g, "").slice(0, CODE_LEN);
                        if (clean.length > 0) {
                          e.preventDefault();
                          applyCode(clean);
                        }
                      },
                    }
                  : {})}
              />
            </TouchableOpacity>
          ))}
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity style={s.btn} onPress={handleVerify} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Подтвердить</Text>
          }
        </TouchableOpacity>

        {/* Resend */}
        {resending ? (
          <ActivityIndicator color={colors.primary} />
        ) : cooldown > 0 ? (
          <Text style={s.resendDisabled}>Отправить повторно через {cooldown} с</Text>
        ) : (
          <View style={s.resendRow}>
            <Text style={s.resendText}>Не пришёл код?</Text>
            <TouchableOpacity onPress={handleResend}>
              <Text style={s.resendLink}>Отправить снова</Text>
            </TouchableOpacity>
          </View>
        )}

        {resent && (
          <View style={s.resentBadge}>
            <Feather name="check" size={14} color="#4338ca" />
            <Text style={s.resentText}>Код отправлен на почту</Text>
          </View>
        )}

        <TouchableOpacity style={s.homeLink} onPress={handleGoHome}>
          <Feather name="arrow-left" size={14} color={colors.mutedForeground} />
          <Text style={s.homeLinkText}>На главную</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
