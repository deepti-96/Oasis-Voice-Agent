import React from "react";
import { Pressable, View, StyleSheet, AccessibilityRole } from "react-native";
import { theme } from "../../theme";

interface CaptureButtonProps {
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/**
 * Large circular capture button used on the DocumentScan camera screen.
 *
 * 72x72 white surface with a subtle shadow and a nested dark ring that reads
 * as a camera shutter. Disabled state drops opacity to 0.5 and blocks taps.
 */
export function CaptureButton({
  onPress,
  disabled = false,
  accessibilityLabel = "Capture document",
}: CaptureButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      accessibilityRole={"button" as AccessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={styles.outerRing}>
        <View style={styles.innerDot} />
      </View>
    </Pressable>
  );
}

const SIZE = 72;

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.elevated,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.5,
  },
  outerRing: {
    width: SIZE - 14,
    height: SIZE - 14,
    borderRadius: (SIZE - 14) / 2,
    borderWidth: 2,
    borderColor: theme.colors.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  innerDot: {
    width: SIZE - 28,
    height: SIZE - 28,
    borderRadius: (SIZE - 28) / 2,
    backgroundColor: theme.colors.textPrimary,
  },
});
