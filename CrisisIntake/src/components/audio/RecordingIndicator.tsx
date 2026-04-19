import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import { useAppStore } from "../../store/useAppStore";
import { theme } from "../../theme";

export function RecordingIndicator() {
  const phase = useAppStore(s => s.pipelinePhase);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (phase === "listening") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [phase, pulseAnim]);

  if (phase === "idle") return null;

  return (
    <View style={styles.container}>
      {phase === "listening" && (
        <>
          <Animated.View style={[
            styles.dot,
            { opacity: pulseAnim }
          ]} />
          <Text style={styles.text}>
            Listening...
          </Text>
        </>
      )}
      {phase === "transcribing" && (
        <Text style={[styles.text, { color: theme.colors.accent }]}>
          Transcribing...
        </Text>
      )}
      {phase === "extracting" && (
        <Text style={[styles.text, { color: theme.colors.fieldInferredBorder }]}>
          Extracting fields...
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    ...theme.shadows.card,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.danger,
    marginRight: theme.spacing.sm,
  },
  text: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
});
