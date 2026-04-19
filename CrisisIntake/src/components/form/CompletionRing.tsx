import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useAppStore } from "../../store/useAppStore";
import { theme } from "../../theme";

export function CompletionRing() {
  const percentage = useAppStore((s) => s.getCompletionPercentage());

  const ringColor =
    percentage >= 80
      ? theme.colors.fieldConfirmedAccent
      : percentage >= 40
        ? theme.colors.fieldInferredBorder
        : theme.colors.textMuted;

  return (
    <View style={styles.container}>
      <View style={[styles.ring, { borderColor: theme.colors.fieldEmptyBorder }]}>
        <View
          style={[
            styles.ringFill,
            {
              borderColor: ringColor,
              borderTopColor: percentage >= 25 ? ringColor : "transparent",
              borderRightColor: percentage >= 50 ? ringColor : "transparent",
              borderBottomColor: percentage >= 75 ? ringColor : "transparent",
              borderLeftColor: percentage >= 100 ? ringColor : "transparent",
              transform: [{ rotate: `${(percentage / 100) * 360}deg` }],
            },
          ]}
        />
        <Text style={[styles.percentText, { color: ringColor }]}>
          {percentage}%
        </Text>
      </View>
      <Text style={styles.label}>Complete</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  ring: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  ringFill: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
  },
  percentText: {
    fontSize: 14,
    fontWeight: "700",
  },
  label: {
    ...theme.typography.caption,
    fontSize: 10,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
});
