import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated } from "react-native";
import { theme } from "../../theme";
import { FIELD_METADATA } from "../../types/intake";
import type { IntakeSchema } from "../../types/intake";
import { useAppStore } from "../../store/useAppStore";
import { FieldEditor } from "./FieldEditor";

interface Props {
  fieldKey: keyof IntakeSchema;
}

export function FormField({ fieldKey }: Props) {
  const field = useAppStore((s) => s.intake[fieldKey]);
  const confirmField = useAppStore((s) => s.confirmField);
  const unlockField = useAppStore((s) => s.unlockField);
  const meta = FIELD_METADATA.find((m) => m.key === fieldKey)!;

  const [editing, setEditing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (field.status === "inferred") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.8, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 1000, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [field.status]);

  function handlePress() {
    if (field.status === "inferred") {
      confirmField(fieldKey);
      setEditing(false);
    } else if (field.status === "confirmed") {
      unlockField(fieldKey);
      setEditing(true);
    }
  }

  const backgroundColor =
    field.status === "confirmed"
      ? theme.colors.fieldConfirmed
      : field.status === "inferred"
      ? theme.colors.fieldInferred
      : theme.colors.fieldEmpty;

  const borderColor =
    field.status === "confirmed"
      ? theme.colors.fieldConfirmedBorder
      : field.status === "inferred"
      ? theme.colors.fieldInferredBorder
      : theme.colors.fieldEmptyBorder;

  const displayValue =
    field.value !== null && field.value !== undefined
      ? typeof field.value === "boolean"
        ? field.value ? "Yes" : "No"
        : String(field.value).replace(/_/g, " ")
      : null;

  return (
    <Animated.View
      style={{ opacity: field.status === "inferred" ? pulseAnim : 1, marginBottom: theme.spacing.sm }}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={handlePress}
        unstable_pressDelay={50}
        style={{
          backgroundColor,
          borderRadius: theme.radii.md,
          padding: theme.spacing.md,
          borderLeftWidth: field.status !== "empty" ? 3 : 0,
          borderLeftColor: borderColor,
          borderWidth: field.status === "empty" ? 1 : 0,
          borderColor: field.status === "empty" ? borderColor : undefined,
          ...theme.shadows.card,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginBottom: theme.spacing.xs }}>
              {meta.label}
            </Text>
            {displayValue ? (
              <Text style={{ ...theme.typography.body, color: theme.colors.textPrimary }}>
                {displayValue}
              </Text>
            ) : (
              <Text style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
                —
              </Text>
            )}
          </View>
          {field.status === "confirmed" && (
            <Text style={{ ...theme.typography.body, color: theme.colors.fieldConfirmedBorder, marginLeft: theme.spacing.sm }}>
              ✓
            </Text>
          )}
        </View>

        {editing && field.status === "inferred" && (
          <FieldEditor
            fieldKey={fieldKey}
            currentValue={field.value}
            onSave={() => setEditing(false)}
          />
        )}
      </Pressable>
    </Animated.View>
  );
}
