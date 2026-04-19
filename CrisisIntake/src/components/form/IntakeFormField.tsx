import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from "react-native";
import { useAppStore } from "../../store/useAppStore";
import { theme } from "../../theme";
import type { FieldMeta, IntakeField } from "../../types/intake";

interface Props {
  meta: FieldMeta;
  field: IntakeField;
}

const STATUS_COLORS = {
  empty: {
    bg: theme.colors.fieldEmpty,
    border: theme.colors.fieldEmptyBorder,
    accent: theme.colors.textMuted,
  },
  inferred: {
    bg: theme.colors.fieldInferred,
    border: theme.colors.fieldInferredBorder,
    accent: theme.colors.fieldInferredAccent,
  },
  confirmed: {
    bg: theme.colors.fieldConfirmed,
    border: theme.colors.fieldConfirmedBorder,
    accent: theme.colors.fieldConfirmedAccent,
  },
};

function formatValue(field: IntakeField, meta: FieldMeta): string {
  if (field.value === null || field.value === undefined) return "";
  if (meta.type === "boolean") return field.value ? "Yes" : "No";
  if (meta.type === "number") return String(field.value);
  if (meta.type === "enum") {
    return String(field.value)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return String(field.value);
}

function sourceIcon(source: IntakeField["source"]): string {
  if (source === "voice") return "\u{1F399}";
  if (source === "vision") return "\u{1F4F7}";
  if (source === "manual") return "\u{270F}\u{FE0F}";
  return "";
}

export function IntakeFormField({ meta, field }: Props) {
  const confirmField = useAppStore((s) => s.confirmField);
  const unlockField = useAppStore((s) => s.unlockField);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (field.status === "inferred") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: false,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0);
    }
  }, [field.status, pulseAnim]);

  const colors = STATUS_COLORS[field.status];

  const animatedBorderColor =
    field.status === "inferred"
      ? pulseAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [theme.colors.fieldInferredBorder, "#FCD34D"],
        })
      : colors.border;

  const animatedShadowOpacity =
    field.status === "inferred"
      ? pulseAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.05, 0.15],
        })
      : 0.05;

  const handlePress = () => {
    if (field.status === "inferred") {
      confirmField(meta.key);
    } else if (field.status === "confirmed") {
      unlockField(meta.key);
    }
  };

  const isEmpty = field.status === "empty";

  return (
    <TouchableOpacity
      activeOpacity={isEmpty ? 1 : 0.7}
      onPress={isEmpty ? undefined : handlePress}
      disabled={isEmpty}
    >
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: colors.bg,
            borderColor: animatedBorderColor,
            shadowOpacity: animatedShadowOpacity,
          },
        ]}
      >
        <View style={styles.labelRow}>
          <Text
            style={[
              styles.label,
              { color: isEmpty ? theme.colors.textMuted : theme.colors.textSecondary },
            ]}
          >
            {meta.label}
          </Text>
          {field.source && (
            <Text style={styles.sourceIcon}>{sourceIcon(field.source)}</Text>
          )}
          {field.status === "confirmed" && (
            <View style={styles.checkBadge}>
              <Text style={styles.checkMark}>{"\u2713"}</Text>
            </View>
          )}
        </View>

        {isEmpty ? (
          <Text style={styles.placeholder}>{"\u2014"}</Text>
        ) : (
          <Text
            style={[
              styles.value,
              field.status === "confirmed" && styles.valueConfirmed,
            ]}
            numberOfLines={2}
          >
            {formatValue(field, meta)}
          </Text>
        )}

        {field.status === "inferred" && (
          <Text style={styles.tapHint}>Tap to confirm</Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1.5,
    borderRadius: theme.radii.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: theme.spacing.sm,
    shadowColor: theme.colors.fieldInferredBorder,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  label: {
    ...theme.typography.caption,
    flex: 1,
  },
  sourceIcon: {
    fontSize: 12,
    marginLeft: theme.spacing.xs,
  },
  checkBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.fieldConfirmedAccent,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: theme.spacing.xs,
  },
  checkMark: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  placeholder: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
  },
  value: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontWeight: "500",
  },
  valueConfirmed: {
    color: theme.colors.fieldConfirmedAccent,
  },
  tapHint: {
    ...theme.typography.caption,
    fontSize: 10,
    color: theme.colors.fieldInferredAccent,
    marginTop: 2,
  },
});
