import React, { useState } from "react";
import { View, Text, TextInput, Switch, Pressable, ScrollView } from "react-native";
import { theme } from "../../theme";
import { FIELD_METADATA } from "../../types/intake";
import type { IntakeSchema } from "../../types/intake";
import { useAppStore } from "../../store/useAppStore";

interface Props {
  fieldKey: keyof IntakeSchema;
  currentValue: string | number | boolean | null;
  onSave: () => void;
}

export function FieldEditor({ fieldKey, currentValue, onSave }: Props) {
  const meta = FIELD_METADATA.find((m) => m.key === fieldKey)!;
  const editField = useAppStore((s) => s.editField);

  const [textValue, setTextValue] = useState(
    currentValue !== null && currentValue !== undefined ? String(currentValue) : ""
  );
  const [boolValue, setBoolValue] = useState(
    typeof currentValue === "boolean" ? currentValue : false
  );
  const [enumValue, setEnumValue] = useState<string>(
    typeof currentValue === "string" ? currentValue : ""
  );

  function handleSave() {
    if (meta.type === "boolean") {
      editField(fieldKey, boolValue);
    } else if (meta.type === "number") {
      const parsed = parseFloat(textValue);
      editField(fieldKey, isNaN(parsed) ? null : parsed);
    } else if (meta.type === "enum") {
      editField(fieldKey, enumValue || null);
    } else {
      editField(fieldKey, textValue || null);
    }
    onSave();
  }

  return (
    <View style={{ marginTop: theme.spacing.sm }}>
      {meta.type === "text" && (
        <TextInput
          autoFocus
          value={textValue}
          onChangeText={setTextValue}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.fieldInferredBorder,
            borderRadius: theme.radii.sm,
            padding: theme.spacing.sm,
            ...theme.typography.body,
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.background,
          }}
          placeholder={meta.label}
          placeholderTextColor={theme.colors.textMuted}
        />
      )}

      {meta.type === "number" && (
        <TextInput
          autoFocus
          value={textValue}
          onChangeText={setTextValue}
          keyboardType="numeric"
          style={{
            borderWidth: 1,
            borderColor: theme.colors.fieldInferredBorder,
            borderRadius: theme.radii.sm,
            padding: theme.spacing.sm,
            ...theme.typography.body,
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.background,
          }}
          placeholder={meta.label}
          placeholderTextColor={theme.colors.textMuted}
        />
      )}

      {meta.type === "enum" && meta.enumValues && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
            {meta.enumValues.map((val) => {
              const selected = enumValue === val;
              return (
                <Pressable
                  key={val}
                  onPress={() => setEnumValue(val)}
                  style={{
                    paddingHorizontal: theme.spacing.sm,
                    paddingVertical: theme.spacing.xs,
                    borderRadius: theme.radii.full,
                    backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.accent : theme.colors.fieldEmptyBorder,
                  }}
                >
                  <Text
                    style={{
                      ...theme.typography.caption,
                      color: selected ? theme.colors.background : theme.colors.textSecondary,
                    }}
                  >
                    {val.replace(/_/g, " ")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      {meta.type === "boolean" && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
          <Switch
            value={boolValue}
            onValueChange={setBoolValue}
            trackColor={{ false: theme.colors.fieldEmptyBorder, true: theme.colors.fieldConfirmedBorder }}
            thumbColor={theme.colors.background}
          />
          <Text style={{ ...theme.typography.body, color: theme.colors.textSecondary }}>
            {boolValue ? "Yes" : "No"}
          </Text>
        </View>
      )}

      <Pressable
        onPress={handleSave}
        style={{
          marginTop: theme.spacing.sm,
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radii.sm,
          paddingVertical: theme.spacing.xs,
          paddingHorizontal: theme.spacing.md,
          alignSelf: "flex-start",
        }}
      >
        <Text style={{ ...theme.typography.caption, color: theme.colors.background }}>
          Save
        </Text>
      </Pressable>
    </View>
  );
}
