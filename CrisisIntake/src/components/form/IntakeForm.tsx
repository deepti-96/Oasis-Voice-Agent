import React from "react";
import { ScrollView, View } from "react-native";
import { theme } from "../../theme";
import { FIELD_METADATA } from "../../types/intake";
import { useAppStore } from "../../store/useAppStore";
import { SectionHeader } from "./SectionHeader";
import { FormField } from "./FormField";

const SECTION_ORDER = [
  "demographics",
  "family",
  "housing",
  "income",
  "benefits",
  "health",
  "safety",
  "needs",
] as const;

export function IntakeForm() {
  const intake = useAppStore((s) => s.intake);

  const sections = SECTION_ORDER.map((section) => {
    const fields = FIELD_METADATA.filter((m) => m.section === section);
    const filled = fields.filter((m) => intake[m.key].status !== "empty").length;
    return { section, fields, filled };
  });

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.md,
        paddingBottom: 120,
      }}
showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      decelerationRate="normal"
    >
      {sections.map(({ section, fields, filled }) => (
        <View key={section}>
          <SectionHeader
            title={section}
            filled={filled}
            total={fields.length}
          />
          {fields.map((meta) => (
            <FormField key={meta.key} fieldKey={meta.key} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
