import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import authStorage from "@/utils/authStorage";
import WheelDatePicker, { DateOfBirth } from "@/components/WheelDatePicker";

type Role = "student" | "parent" | "teacher";
type Step = "role" | "details" | "age";

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_BIRTH_YEAR = CURRENT_YEAR - 12;
const MIN_BIRTH_YEAR = CURRENT_YEAR - 80;
const MAX_BIRTH_YEAR = CURRENT_YEAR - 5;

function calcAge(dob: DateOfBirth): number {
  const today = new Date();
  let age = today.getFullYear() - dob.year;
  const hasHadBirthdayThisYear =
    today.getMonth() + 1 > dob.month ||
    (today.getMonth() + 1 === dob.month && today.getDate() >= dob.day);
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function ageSuffix(age: number): string {
  const mod10 = age % 10;
  const mod100 = age % 100;
  if (mod100 >= 11 && mod100 <= 14) return "лет";
  if (mod10 === 1) return "год";
  if (mod10 >= 2 && mod10 <= 4) return "года";
  return "лет";
}

export default function RegisterScreen() {
  const colors = useColors();
  const { login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [teacherCode, setTeacherCode] = useState("");
  const [showTeacherCode, setShowTeacherCode] = useState(false);
  const [birthDate, setBirthDate] = useState<DateOfBirth>({ day: 1, month: 1, year: DEFAULT_BIRTH_YEAR });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ROLES: Array<{
    key: Role;
    iconName: "book-open" | "users" | "star";
    label: string;
    desc: string;
    bgColor: string;
    iconColor: string;
  }> = [
    {
      key: "student",
      iconName: "book-open",
      label: "Ученик",
      desc: "Выполняю задания и изучаю английский",
      bgColor: "#ede9fe",
      iconColor: "#7c3aed",
    },
    {
      key: "parent",
      iconName: "users",
      label: "Родитель",
      desc: "Слежу за прогрессом своего ребёнка",
      bgColor: "#e0e7ff",
      iconColor: "#4338ca",
    },
    {
      key: "teacher",
      iconName: "star",
      label: "Учитель",
      desc: "Создаю задания и управляю учениками",
      bgColor: "#fce7f3",
      iconColor: "#9d174d",
    },
  ];

  const handleRoleSelect = (r: Role) => {
    setRole(r);
    setError("");
    setStep("details");
  };

  const isFormValid =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    username.trim().length > 0 &&
    password.length >= 6 &&
    (role !== "teacher" || teacherCode.trim().length > 0);

  const handleDetailsNext = () => {
    if (!name.trim()) { setError("Введите ваше имя"); return; }
    if (!email.trim()) { setError("Введите ваш email"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Некорректный формат email"); return; }
    if (!username.trim()) { setError("Введите ваш псевдоним"); return; }
    if (password.length < 6) { setError("Пароль должен содержать не менее 6 символов"); return; }
    if (role === "teacher") {
      if (!teacherCode.trim()) { setError("Введите код учителя"); return; }
      if (teacherCode.trim() !== "422668") { setError("Неверный код учителя"); return; }
    }
    setError("");
    if (role === "student") {
      setStep("age");
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async (selectedBirthDate?: DateOfBirth) => {
    setLoading(true);
    setError("");

    const baseUrl = process.env["EXPO_PUBLIC_DOMAIN"]
      ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
      : "";

    const dobToUse = selectedBirthDate ?? (role === "student" ? birthDate : undefined);

    try {
      const body: Record<string, unknown> = {
        username: username.trim(),
        password,
        name: name.trim(),
        surname: surname.trim() || undefined,
        email: email.trim(),
        role,
        teacherCode: role === "teacher" ? teacherCode.trim() : undefined,
        dateOfBirth: dobToUse ? `${dobToUse.year}-${pad(dobToUse.month)}-${pad(dobToUse.day)}` : undefined,
        age: dobToUse ? calcAge(dobToUse) : undefined,
      };

      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Ошибка при регистрации");
        if (role === "student") setStep("details");
        return;
      }
      await login(data.token, data.user);
      router.replace("/(auth)/confirm-email");
    } catch {
      setError("Ошибка соединения. Попробуйте снова.");
      if (role === "student") setStep("details");
    } finally {
      setLoading(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { flexGrow: 1 },
    content: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: insets.top + 24,
      paddingBottom: insets.bottom + 36,
    },

    backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 28 },
    backText: { fontSize: 15, color: colors.primary, fontWeight: "600" },

    pageTitle: { fontSize: 26, fontWeight: "800", color: colors.foreground, marginBottom: 6 },
    pageSub: { fontSize: 15, color: colors.mutedForeground, marginBottom: 28, lineHeight: 22 },

    roleCard: {
      borderWidth: 2, borderColor: colors.border, borderRadius: 18,
      padding: 18, marginBottom: 12,
      flexDirection: "row", alignItems: "center", gap: 16,
      backgroundColor: colors.card,
    },
    roleIconBox: { width: 52, height: 52, borderRadius: 15, justifyContent: "center", alignItems: "center" },
    roleLabel: { fontSize: 17, fontWeight: "800", color: colors.foreground, marginBottom: 2 },
    roleDesc: { fontSize: 13, color: colors.mutedForeground, lineHeight: 18 },

    fieldLabel: { fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 6 },
    inputRow: {
      backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
      borderRadius: 13, flexDirection: "row", alignItems: "center",
      paddingHorizontal: 14, marginBottom: 14,
    },
    input: { flex: 1, fontSize: 15, color: colors.foreground, paddingVertical: 14 },
    eyeBtn: { padding: 6 },

    primaryBtn: {
      borderRadius: 14,
      paddingVertical: 16, alignItems: "center", marginTop: 10,
    },
    primaryBtnText: { fontSize: 16, fontWeight: "700", color: "#fff", letterSpacing: 0.2 },

    error: { fontSize: 14, color: colors.destructive, textAlign: "center", marginBottom: 12, lineHeight: 20 },

    footer: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 28, gap: 4 },
    footerText: { fontSize: 14, color: colors.mutedForeground },
    footerLink: { fontSize: 14, fontWeight: "700", color: colors.primary },

    teacherCodeHint: {
      fontSize: 12, color: colors.mutedForeground, marginTop: -8, marginBottom: 14, lineHeight: 17,
    },

    wheelWrap: { alignItems: "center", marginBottom: 28 },
  });

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={s.content}>

          {step !== "role" && (
            <TouchableOpacity
              style={s.backRow}
              onPress={() => {
                setError("");
                if (step === "age") setStep("details");
                else setStep("role");
              }}
            >
              <Feather name="arrow-left" size={18} color={colors.primary} />
              <Text style={s.backText}>Назад</Text>
            </TouchableOpacity>
          )}

          {/* ── ШАГ 1: Выбор роли ── */}
          {step === "role" && (
            <>
              <Text style={s.pageTitle}>Создать аккаунт</Text>
              <Text style={s.pageSub}>Выберите вашу роль для начала работы</Text>

              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r.key}
                  style={s.roleCard}
                  onPress={() => handleRoleSelect(r.key)}
                  activeOpacity={0.75}
                >
                  <View style={[s.roleIconBox, { backgroundColor: r.bgColor }]}>
                    <Feather name={r.iconName} size={26} color={r.iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.roleLabel}>{r.label}</Text>
                    <Text style={s.roleDesc}>{r.desc}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}

              <View style={s.footer}>
                <Text style={s.footerText}>Уже есть аккаунт?</Text>
                <TouchableOpacity onPress={() => router.push("/(auth)/login")}>
                  <Text style={[s.footerLink, { marginLeft: 4 }]}>Войти</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── ШАГ 2: Данные пользователя ── */}
          {step === "details" && role && (
            <>
              <Text style={s.pageTitle}>
                {role === "student" ? "Данные ученика"
                  : role === "parent" ? "Данные родителя"
                  : "Данные учителя"}
              </Text>
              <Text style={s.pageSub}>
                {role === "student"
                  ? "Введите ваши данные для создания аккаунта"
                  : role === "parent"
                  ? "Контролируйте успехи вашего ребёнка"
                  : "Управляйте заданиями и учениками"}
              </Text>

              <Text style={s.fieldLabel}>Имя</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.input}
                  value={name}
                  onChangeText={(t) => setName(t.replace(/[^а-яёА-ЯЁ\s\-]/g, ""))}
                  placeholder="Введите имя"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>

              <Text style={s.fieldLabel}>Фамилия</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.input}
                  value={surname}
                  onChangeText={(t) => setSurname(t.replace(/[^а-яёА-ЯЁ\s\-]/g, ""))}
                  placeholder="Введите фамилию"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              {role === "student" && (
                <Text style={s.teacherCodeHint}>
                  Имя и фамилия видны только учителю — другие ученики их не увидят.
                </Text>
              )}

              <Text style={s.fieldLabel}>Псевдоним</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder={role === "student" ? "Придумайте псевдоним" : "Придумайте уникальный логин"}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {role === "student" && (
                <Text style={s.teacherCodeHint}>
                  Псевдоним виден всем ученикам. Должен быть уникальным.
                </Text>
              )}

              <Text style={s.fieldLabel}>Email</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Введите email"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              </View>
              <Text style={s.teacherCodeHint}>
                На этот адрес придёт код подтверждения.
              </Text>

              <Text style={s.fieldLabel}>Пароль</Text>
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

              {role === "teacher" && (
                <>
                  <Text style={s.fieldLabel}>Код учителя</Text>
                  <View style={s.inputRow}>
                    <TextInput
                      style={s.input}
                      value={teacherCode}
                      onChangeText={setTeacherCode}
                      placeholder="Введите секретный код"
                      placeholderTextColor={colors.mutedForeground}
                      secureTextEntry={!showTeacherCode}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity style={s.eyeBtn} onPress={() => setShowTeacherCode(!showTeacherCode)}>
                      <Feather name={showTeacherCode ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                  <Text style={s.teacherCodeHint}>
                    Код выдаётся администратором. Без него создать аккаунт учителя невозможно.
                  </Text>
                </>
              )}

              {error ? <Text style={s.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: isFormValid && !loading ? colors.primary : colors.border }]}
                onPress={handleDetailsNext}
                disabled={!isFormValid || loading}
                activeOpacity={isFormValid ? 0.75 : 1}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={[s.primaryBtnText, { color: isFormValid ? "#fff" : colors.mutedForeground }]}>
                      {role === "student" ? "Далее" : "Создать аккаунт"}
                    </Text>
                }
              </TouchableOpacity>
            </>
          )}

          {/* ── ШАГ 3 (только ученик): Выбор возраста ── */}
          {step === "age" && role === "student" && (
            <>
              <Text style={s.pageTitle}>Когда у вас день рождения?</Text>
              <Text style={s.pageSub}>
                Это поможет подобрать подходящие задания. Вам {calcAge(birthDate)} {ageSuffix(calcAge(birthDate))}
              </Text>

              <View style={s.wheelWrap}>
                <WheelDatePicker
                  value={birthDate}
                  onChange={setBirthDate}
                  minYear={MIN_BIRTH_YEAR}
                  maxYear={MAX_BIRTH_YEAR}
                />
              </View>

              {error ? <Text style={s.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: !loading ? colors.primary : colors.border }]}
                onPress={() => handleSubmit(birthDate)}
                disabled={loading}
                activeOpacity={0.75}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>Создать аккаунт</Text>
                }
              </TouchableOpacity>
            </>
          )}

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
