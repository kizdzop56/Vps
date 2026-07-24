import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  visible, title, message, confirmText = "Подтвердить", cancelText = "Отмена",
  destructive = false, onConfirm, onCancel,
}: Props) {
  const colors = useColors();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[s.iconWrap, { backgroundColor: destructive ? "#fff1f2" : colors.primary + "15" }]}>
            <Feather
              name={destructive ? "trash-2" : "help-circle"}
              size={26}
              color={destructive ? "#be123c" : colors.primary}
            />
          </View>
          <Text style={[s.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[s.message, { color: colors.mutedForeground }]}>{message}</Text>
          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.btn, s.cancelBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}
              onPress={onCancel}
            >
              <Text style={[s.btnText, { color: colors.mutedForeground }]}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.confirmBtn, { backgroundColor: destructive ? "#be123c" : colors.primary }]}
              onPress={onConfirm}
            >
              <Text style={[s.btnText, { color: "#fff" }]}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "#00000070",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  card: {
    width: "100%", maxWidth: 360, borderRadius: 20, padding: 24,
    borderWidth: 1, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16,
    justifyContent: "center", alignItems: "center", marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  message: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  btnRow: { flexDirection: "row", alignItems: "stretch", gap: 10, width: "100%" },
  btn: { flex: 1, paddingVertical: 14, paddingHorizontal: 6, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cancelBtn: { borderWidth: 1.5 },
  confirmBtn: {},
  btnText: { fontSize: 15, fontWeight: "700", textAlign: "center" },
});
