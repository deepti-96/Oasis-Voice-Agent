import React, { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAppStore } from "../../store/useAppStore";
import { theme } from "../../theme";
import { IntakeFormField } from "./IntakeFormField";
import { FIELD_METADATA } from "../../types/intake";

const SECTION_LABELS: Record<string, string> = {
  demographics: "Demographics",
  family: "Family & Dependents",
  housing: "Housing History",
  income: "Income & Employment",
  benefits: "Benefits",
  health: "Health",
  safety: "Safety",
  needs: "Preferences & Needs",
};

const SECTION_ICONS: Record<string, string> = {
  demographics: "\u{1F464}",
  family: "\u{1F46A}",
  housing: "\u{1F3E0}",
  income: "\u{1F4B0}",
  benefits: "\u{1F4CB}",
  health: "\u{2695}\u{FE0F}",
  safety: "\u{1F6E1}\u{FE0F}",
  needs: "\u{1F4CC}",
};

const SECTION_FIELDS = FIELD_METADATA.reduce((acc, meta) => {
  if (!acc[meta.section]) acc[meta.section] = [];
  acc[meta.section].push(meta);
  return acc;
}, {} as Record<string, typeof FIELD_METADATA>);

interface Props {
  section: string;
}

export function IntakeSection({ section }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const intake = useAppStore((s) => s.intake);
  const sectionMetas = SECTION_FIELDS[section] || [];
  const fields = useMemo(
    () => sectionMetas.map((meta) => ({ meta, field: intake[meta.key] })),
    [intake, sectionMetas]
  );

  const filledCount = fields.filter((f) => f.field.status !== "empty").length;
  const confirmedCount = fields.filter((f) => f.field.status === "confirmed").length;
  const total = fields.length;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setCollapsed(!collapsed)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.icon}>{SECTION_ICONS[section] || "\u{1F4C4}"}</Text>
          <Text style={styles.title}>{SECTION_LABELS[section] || section}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.countPill}>
            <Text style={[
              styles.countText,
              filledCount === total && styles.countComplete,
            ]}>
              {confirmedCount > 0
                ? `${confirmedCount}/${total}`
                : `${filledCount}/${total}`}
            </Text>
          </View>
          <Text style={styles.chevron}>{collapsed ? "\u{25B8}" : "\u{25BE}"}</Text>
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <View style={styles.fields}>
          {fields.map(({ meta, field }) => (
            <IntakeFormField key={meta.key} meta={meta} field={field} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    fontSize: 16,
    marginRight: theme.spacing.sm,
  },
  title: {
    ...theme.typography.sectionHeader,
    color: theme.colors.textSecondary,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  countPill: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.full,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginRight: theme.spacing.sm,
  },
  countText: {
    ...theme.typography.caption,
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  countComplete: {
    color: theme.colors.fieldConfirmedAccent,
  },
  chevron: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  fields: {
    paddingLeft: theme.spacing.xs,
  },
});
