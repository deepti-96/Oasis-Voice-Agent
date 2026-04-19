import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "../../theme";
import { TimelineEntry } from "../../types/cloud";

interface TimelineViewProps {
  entries: TimelineEntry[];
}

const CATEGORY_STYLES: Record<
  string,
  { background: string; text: string; border: string; label: string }
> = {
  housing: {
    background: "#EEF2FF",
    border: "#C7D2FE",
    text: "#4338CA",
    label: "Housing",
  },
  benefits: {
    background: theme.colors.fieldConfirmed,
    border: theme.colors.fieldConfirmedBorder,
    text: theme.colors.fieldConfirmedAccent,
    label: "Benefits",
  },
  legal: {
    background: theme.colors.fieldInferred,
    border: theme.colors.fieldInferredBorder,
    text: theme.colors.fieldInferredAccent,
    label: "Legal",
  },
  medical: {
    background: theme.colors.dangerLight,
    border: theme.colors.danger,
    text: theme.colors.danger,
    label: "Medical",
  },
};

function categoryStyle(category: string) {
  return (
    CATEGORY_STYLES[category?.toLowerCase?.() ?? ""] ?? {
      background: theme.colors.surface,
      border: theme.colors.fieldEmptyBorder,
      text: theme.colors.textSecondary,
      label: category ? category.charAt(0).toUpperCase() + category.slice(1) : "General",
    }
  );
}

/**
 * Vertical timeline: day marker circles connected by a line, action text,
 * and a category chip per entry.
 */
export function TimelineView({ entries }: TimelineViewProps) {
  if (!entries || entries.length === 0) {
    return (
      <Text style={styles.empty}>No actions recommended at this time.</Text>
    );
  }

  const sorted = [...entries].sort((a, b) => (a.day ?? 0) - (b.day ?? 0));

  return (
    <View style={styles.container}>
      {sorted.map((entry, idx) => {
        const isLast = idx === sorted.length - 1;
        const cat = categoryStyle(entry.category);

        return (
          <View key={`${entry.day}-${idx}`} style={styles.row}>
            <View style={styles.markerColumn}>
              <View style={styles.marker}>
                <Text style={styles.markerText}>{entry.day}</Text>
              </View>
              {!isLast && <View style={styles.connector} />}
            </View>

            <View style={styles.body}>
              <Text style={styles.dayLabel}>Day {entry.day}</Text>
              <Text style={styles.action}>{entry.action}</Text>
              <View
                style={[
                  styles.categoryChip,
                  { backgroundColor: cat.background, borderColor: cat.border },
                ]}
              >
                <Text style={[styles.categoryText, { color: cat.text }]}>
                  {cat.label}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const MARKER_SIZE = 32;

const styles = StyleSheet.create({
  container: {
    gap: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: theme.spacing.md,
  },
  markerColumn: {
    alignItems: "center",
    width: MARKER_SIZE,
  },
  marker: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.card,
  },
  markerText: {
    color: theme.colors.background,
    fontWeight: "700",
    fontSize: 13,
  },
  connector: {
    flex: 1,
    width: 2,
    backgroundColor: theme.colors.fieldEmptyBorder,
    marginTop: 2,
    marginBottom: 2,
  },
  body: {
    flex: 1,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  dayLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
  },
  action: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    lineHeight: 22,
  },
  categoryChip: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    marginTop: theme.spacing.xs,
  },
  categoryText: {
    ...theme.typography.caption,
  },
  empty: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    fontStyle: "italic",
    paddingVertical: theme.spacing.md,
  },
});
