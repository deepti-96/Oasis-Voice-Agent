import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  AccessibilityRole,
} from "react-native";
import { theme } from "../../theme";
import { FIELD_METADATA, IntakeSchema } from "../../types/intake";
import { IntakeDelta } from "../../services/extraction";

interface ExtractionPreviewProps {
  /** Fields the ExtractionEngine inferred from the image. */
  delta: IntakeDelta;
  onAccept: (selected: IntakeDelta) => void;
  onRetake: () => void;
}

const LABEL_BY_KEY: Partial<Record<keyof IntakeSchema, string>> = Object.fromEntries(
  FIELD_METADATA.map((m) => [m.key, m.label])
) as Partial<Record<keyof IntakeSchema, string>>;

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/**
 * Preview of the delta returned by the ExtractionEngine after a document
 * scan. Each extracted field is an amber chip with a deselect (×) control.
 * The caller can accept the remaining selection or retake the photo.
 */
export function ExtractionPreview({
  delta,
  onAccept,
  onRetake,
}: ExtractionPreviewProps) {
  const allKeys = useMemo(
    () =>
      (Object.keys(delta) as Array<keyof IntakeSchema>).filter(
        (k) =>
          delta[k] !== null &&
          delta[k] !== undefined &&
          delta[k] !== ""
      ),
    [delta]
  );

  const [selectedKeys, setSelectedKeys] = useState<Set<keyof IntakeSchema>>(
    () => new Set(allKeys)
  );

  const toggle = (k: keyof IntakeSchema) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
  };

  const handleAccept = () => {
    const selected: IntakeDelta = {};
    for (const k of selectedKeys) {
      (selected as any)[k] = delta[k];
    }
    onAccept(selected);
  };

  const hasAny = allKeys.length > 0;
  const hasSelection = selectedKeys.size > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Extracted Fields</Text>

      {hasAny ? (
        <ScrollView
          contentContainerStyle={styles.chipRow}
          showsVerticalScrollIndicator={false}
        >
          {allKeys.map((key) =>
            selectedKeys.has(key) ? (
              <ExtractionChip
                key={key}
                label={LABEL_BY_KEY[key] ?? key}
                value={formatValue(delta[key])}
                onRemove={() => toggle(key)}
              />
            ) : null
          )}
        </ScrollView>
      ) : (
        <Text style={styles.empty}>
          No fields detected. Try retaking the photo with better lighting.
        </Text>
      )}

      <View style={styles.buttonRow}>
        <Pressable
          onPress={onRetake}
          accessibilityRole={"button" as AccessibilityRole}
          accessibilityLabel="Retake photo"
          style={({ pressed }: { pressed: boolean }) => [
            styles.secondaryButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Retake</Text>
        </Pressable>

        <Pressable
          onPress={handleAccept}
          disabled={!hasAny || !hasSelection}
          accessibilityRole={"button" as AccessibilityRole}
          accessibilityLabel="Accept selected fields"
          accessibilityState={{ disabled: !hasAny || !hasSelection }}
          style={({ pressed }: { pressed: boolean }) => [
            styles.primaryButton,
            (!hasAny || !hasSelection) && styles.primaryButtonDisabled,
            pressed && hasAny && hasSelection && styles.buttonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {hasSelection
              ? `Accept (${selectedKeys.size})`
              : "Accept Selected"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

interface ExtractionChipProps {
  label: string;
  value: string;
  onRemove: () => void;
}

const ExtractionChip: React.FC<ExtractionChipProps> = ({ label, value, onRemove }) => {
  return (
    <View style={styles.chip}>
      <View style={styles.chipTextColumn}>
        <Text numberOfLines={1} style={styles.chipLabel}>
          {label}
        </Text>
        <Text numberOfLines={2} style={styles.chipValue}>
          {value}
        </Text>
      </View>
      <Pressable
        onPress={onRemove}
        hitSlop={10}
        accessibilityRole={"button" as AccessibilityRole}
        accessibilityLabel={`Remove ${label}`}
        style={({ pressed }: { pressed: boolean }) => [
          styles.chipRemoveButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.chipRemoveText}>×</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  header: {
    ...theme.typography.sectionHeader,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.fieldInferred,
    borderColor: theme.colors.fieldInferredBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.xs,
    maxWidth: "100%",
  },
  chipTextColumn: {
    flexShrink: 1,
    marginRight: theme.spacing.xs,
  },
  chipLabel: {
    ...theme.typography.caption,
    color: theme.colors.fieldInferredAccent,
    textTransform: "uppercase",
  },
  chipValue: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    marginTop: 2,
  },
  chipRemoveButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  chipRemoveText: {
    fontSize: 20,
    lineHeight: 22,
    color: theme.colors.fieldInferredAccent,
    fontWeight: "600",
  },
  empty: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    textAlign: "center",
    paddingVertical: theme.spacing.xl,
  },
  buttonRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    ...theme.shadows.card,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    ...theme.typography.h3,
    color: theme.colors.background,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.fieldEmptyBorder,
  },
  secondaryButtonText: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
