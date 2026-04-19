import React, { useEffect, useRef } from "react";
import { View, Text, Pressable, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../theme";
import { useAppStore } from "../../store/useAppStore";
import { FIELD_METADATA } from "../../types/intake";

interface Props {
  onGeneratePlan: () => void;
}

export function CompletionBar({ onGeneratePlan }: Props) {
  const insets = useSafeAreaInsets();
  const intake = useAppStore((s) => s.intake);

  const nonEmpty = FIELD_METADATA.filter((m) => intake[m.key].status !== "empty").length;
  const pct = Math.round((nonEmpty / FIELD_METADATA.length) * 100);
  const canGenerate = pct >= 60;

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: pct / 100,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  return (
    <View
      style={{
        backgroundColor: theme.colors.background,
        paddingTop: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        paddingBottom: insets.bottom + theme.spacing.sm,
        ...theme.shadows.elevated,
      }}
    >
      <View
        style={{
          height: 4,
          backgroundColor: theme.colors.fieldEmpty,
          borderRadius: theme.radii.full,
          marginBottom: theme.spacing.sm,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={{
            height: "100%",
            backgroundColor: theme.colors.accent,
            borderRadius: theme.radii.full,
            width: progressAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
          }}
        />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
        <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, flex: 1 }}>
          {pct}% complete
        </Text>

        <Pressable
          onPress={onGeneratePlan}
          disabled={!canGenerate}
          style={{
            paddingVertical: theme.spacing.xs,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radii.sm,
            backgroundColor: canGenerate ? theme.colors.accent : theme.colors.textMuted,
            opacity: canGenerate ? 1 : 0.4,
          }}
        >
          <Text style={{ ...theme.typography.caption, color: theme.colors.background }}>
            Generate Plan
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
