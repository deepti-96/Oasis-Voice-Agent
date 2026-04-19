import React from "react";
import { View, Text } from "react-native";
import { theme } from "../../theme";

interface Props {
  title: string;
  filled: number;
  total: number;
}

export function SectionHeader({ title, filled, total }: Props) {
  return (
    <View style={{ marginBottom: theme.spacing.sm, marginTop: theme.spacing.lg }}>
      <Text
        style={{
          ...theme.typography.sectionHeader,
          color: theme.colors.textMuted,
        }}
      >
        {title.toUpperCase()}{"  "}{filled}/{total}
      </Text>
    </View>
  );
}
