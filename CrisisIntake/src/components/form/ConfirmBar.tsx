import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAppStore } from "../../store/useAppStore";
import { theme } from "../../theme";
import { FIELD_METADATA } from "../../types/intake";

interface Props {
  onGeneratePlan: () => void;
}

export function ConfirmBar({ onGeneratePlan }: Props) {
  const intake = useAppStore((s) => s.intake);
  const confirmAllFields = useAppStore((s) => s.confirmAllFields);
  const percentage = useAppStore((s) => s.getCompletionPercentage());

  const inferredCount = FIELD_METADATA.filter(
    (m) => intake[m.key].status === "inferred"
  ).length;

  const canGeneratePlan = percentage >= 30;

  if (inferredCount === 0 && !canGeneratePlan) return null;

  return (
    <View style={styles.container}>
      {inferredCount > 0 && (
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={confirmAllFields}
          activeOpacity={0.8}
        >
          <Text style={styles.confirmText}>
            Confirm All ({inferredCount})
          </Text>
        </TouchableOpacity>
      )}
      {canGeneratePlan && (
        <TouchableOpacity
          style={[
            styles.planButton,
            inferredCount > 0 && { marginLeft: theme.spacing.sm },
          ]}
          onPress={onGeneratePlan}
          activeOpacity={0.8}
        >
          <Text style={styles.planText}>Generate Plan</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.fieldEmptyBorder,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: theme.colors.fieldConfirmedAccent,
    borderRadius: theme.radii.md,
    paddingVertical: 14,
    alignItems: "center",
    ...theme.shadows.card,
  },
  confirmText: {
    ...theme.typography.h3,
    color: "#FFFFFF",
  },
  planButton: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: 14,
    alignItems: "center",
    ...theme.shadows.card,
  },
  planText: {
    ...theme.typography.h3,
    color: "#FFFFFF",
  },
});
