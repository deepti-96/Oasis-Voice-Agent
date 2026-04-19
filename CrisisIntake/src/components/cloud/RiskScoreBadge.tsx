import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "../../theme";

interface RiskScoreBadgeProps {
  /** Integer 0-100. Values outside the range are clamped. */
  score: number;
}

type Band = {
  label: string;
  background: string;
  text: string;
};

function bandFor(score: number): Band {
  if (score <= 33) {
    return {
      label: "LOW RISK",
      background: theme.colors.riskLow,
      text: theme.colors.background,
    };
  }
  if (score <= 66) {
    return {
      label: "MODERATE RISK",
      background: theme.colors.riskMedium,
      text: theme.colors.background,
    };
  }
  return {
    label: "HIGH RISK",
    background: theme.colors.riskHigh,
    text: theme.colors.background,
  };
}

/**
 * 120×120 circular badge summarising the Gemini-generated risk score.
 * Bands: 0-33 green, 34-66 amber, 67-100 red.
 */
export function RiskScoreBadge({ score }: RiskScoreBadgeProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const band = bandFor(clamped);

  return (
    <View style={styles.container}>
      <View
        style={[styles.circle, { backgroundColor: band.background }]}
        accessibilityRole="image"
        accessibilityLabel={`Risk score ${clamped} out of 100, ${band.label.toLowerCase()}`}
      >
        <Text style={[styles.score, { color: band.text }]}>{clamped}</Text>
        <Text style={[styles.scoreSuffix, { color: band.text }]}>/ 100</Text>
      </View>
      <Text style={[styles.label, { color: band.background }]}>{band.label}</Text>
    </View>
  );
}

const SIZE = 120;

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.elevated,
  },
  score: {
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: -1,
    lineHeight: 44,
  },
  scoreSuffix: {
    fontSize: 12,
    fontWeight: "500",
    opacity: 0.9,
    marginTop: 2,
  },
  label: {
    ...theme.typography.sectionHeader,
    marginTop: theme.spacing.xs,
  },
});
