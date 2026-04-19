import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "../../theme";
import { ProgramMatch } from "../../types/cloud";

interface ProgramMatchCardProps {
  match: ProgramMatch;
}

type LikelihoodStyle = {
  label: string;
  background: string;
  border: string;
  text: string;
};

const LIKELIHOOD_STYLES: Record<ProgramMatch["likelihood"], LikelihoodStyle> = {
  likely: {
    label: "Likely",
    background: theme.colors.fieldConfirmed,
    border: theme.colors.fieldConfirmedBorder,
    text: theme.colors.fieldConfirmedAccent,
  },
  possible: {
    label: "Possible",
    background: theme.colors.fieldInferred,
    border: theme.colors.fieldInferredBorder,
    text: theme.colors.fieldInferredAccent,
  },
  unlikely: {
    label: "Unlikely",
    background: theme.colors.surface,
    border: theme.colors.fieldEmptyBorder,
    text: theme.colors.textSecondary,
  },
};

/**
 * Card for a single matched resource program: title, likelihood chip, and
 * a short human-readable reason the client qualifies (or doesn't).
 */
export function ProgramMatchCard({ match }: ProgramMatchCardProps) {
  const style =
    LIKELIHOOD_STYLES[match.likelihood] ?? LIKELIHOOD_STYLES.possible;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.name} numberOfLines={2}>
          {match.name}
        </Text>
        <View
          style={[
            styles.chip,
            { backgroundColor: style.background, borderColor: style.border },
          ]}
        >
          <Text style={[styles.chipText, { color: style.text }]}>
            {style.label}
          </Text>
        </View>
      </View>
      <Text style={styles.reason}>{match.reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.fieldEmptyBorder,
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  name: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
  },
  chipText: {
    ...theme.typography.caption,
  },
  reason: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    lineHeight: 21,
  },
});
