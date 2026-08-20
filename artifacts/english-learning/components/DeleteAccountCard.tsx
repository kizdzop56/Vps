// ─────────────────────────────────────────────────────────────────────────────
// Удаление аккаунта из приложения.
//
// Это не «приятная возможность», а требование сторов: если в приложении можно
// ЗАВЕСТИ аккаунт, в нём же обязано быть и его удаление (App Store — с 30 июня
// 2022, Google Play — User Data policy). На этом чаще всего и отклоняют первую
// подачу: кнопка «выйти» есть, удаления нет.
//
// ── Почему спрашиваем пароль ───────────────────────────────────────────
// Удаление необратимо и уносит всю учёбу: очки, карточки, сдачи, переписку.
// А телефон часто остаётся разблокированным в чужих руках — особенно у детей.
// Одного тапа для такого мало, поэтому здесь два барьера: окно с честным списком
// того, что пропадёт, и пароль.
//
// При этом само удаление НЕ спрятано: кнопка лежит в профиле рядом с выходом,
// как и требует Apple («легко найти»). Прятать её в подразделы — тоже причина
// отклонения.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { View, Text, TextInput, Modal, Pressable, ActivityIndicator } from "react-native";
import { useColors } from "@/hooks/useColors";
import { ChunkyButton, SectionLabel } from "@/components/ui/GameKit";
import { Glyph } from "@/components/ui/Glyph";
import { radii } from "@/constants/theme";
import authStorage from "@/utils/authStorage";

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

/** Что именно исчезнет. Список намеренно конкретный, а не «все данные». */
const WHAT_GOES = [
  "очки, уровень и серия дней",
  "выученные слова и вся статистика",
  "сданные задания и оценки",
  "переписка и вложения",
  "связи с учителем, родителем и друзьями",
];

export function DeleteAccountCard({ onDeleted }: { onDeleted: () => void }) {
  const colors = useColors();
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPassword("");
    setError(null);
  };

  const submit = async () => {
    if (busy) return;
    if (!password.trim()) {
      setError("Введите пароль");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await authStorage.getItem("auth_token");
      const res = await fetch(`${BASE}/api/auth/account`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({ password, confirm: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Не удалось удалить аккаунт");
        return;
      }
      // Аккаунта больше нет, токен невалиден — выходим и чистим сессию.
      setOpen(false);
      onDeleted();
    } catch {
      setError("Нет связи с сервером");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <SectionLabel>Аккаунт и данные</SectionLabel>
      <ChunkyButton
        label="Удалить аккаунт"
        sublabel="Вместе с аккаунтом удаляются все данные об учёбе"
        icon="trash"
        tone="danger"
        onPress={() => setOpen(true)}
      />

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          onPress={close}
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            backgroundColor: "rgba(20,10,40,0.55)",
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: "100%",
              maxWidth: 380,
              backgroundColor: colors.card,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 20,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <View style={{
                width: 40, height: 40, borderRadius: radii.sm,
                alignItems: "center", justifyContent: "center",
                backgroundColor: colors.destructive + "1f",
              }}>
                <Glyph name="trash" size={20} color={colors.destructive} />
              </View>
              <Text style={{ flex: 1, fontSize: 18, fontWeight: "900", color: colors.foreground }}>
                Удалить аккаунт?
              </Text>
            </View>

            <Text style={{ fontSize: 13, lineHeight: 20, color: colors.mutedForeground }}>
              Действие необратимо. Восстановить ничего не получится. Пропадёт:
            </Text>
            <View style={{ marginTop: 8, gap: 5 }}>
              {WHAT_GOES.map((item) => (
                <View key={item} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{
                    width: 5, height: 5, borderRadius: 5,
                    backgroundColor: colors.destructive,
                  }} />
                  <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.foreground }}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={{
              fontSize: 12, fontWeight: "800", color: colors.mutedForeground,
              marginTop: 16, marginBottom: 6,
            }}>
              Введите пароль, чтобы подтвердить
            </Text>
            <TextInput
              value={password}
              onChangeText={(v) => { setPassword(v); setError(null); }}
              editable={!busy}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Пароль"
              placeholderTextColor="#a99fce"
              style={{
                backgroundColor: colors.background,
                borderRadius: radii.md,
                borderWidth: 2,
                borderColor: error ? colors.destructive : colors.border,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 16,
                fontWeight: "700",
                color: colors.foreground,
              }}
            />
            {!!error && (
              <Text style={{ fontSize: 12.5, color: colors.destructive, marginTop: 7, fontWeight: "700" }}>
                {error}
              </Text>
            )}

            {busy ? (
              <View style={{ paddingVertical: 18, alignItems: "center" }}>
                <ActivityIndicator color={colors.destructive} />
                <Text style={{ fontSize: 12.5, color: colors.mutedForeground, marginTop: 8 }}>
                  Удаляем аккаунт и данные…
                </Text>
              </View>
            ) : (
              <>
                <ChunkyButton
                  label="Удалить навсегда"
                  icon="trash"
                  tone="danger"
                  center
                  onPress={() => { void submit(); }}
                  style={{ marginTop: 16 }}
                />
                <ChunkyButton
                  label="Отмена"
                  tone="dark"
                  center
                  onPress={close}
                  style={{ marginTop: 8 }}
                />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export default DeleteAccountCard;
