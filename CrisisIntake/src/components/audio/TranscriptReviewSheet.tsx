import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useAppStore } from "../../store/useAppStore";
import { theme } from "../../theme";

interface Props {
  onConfirm: (editedText: string) => void;
}

export function TranscriptReviewSheet({ onConfirm }: Props) {
  const currentTranscript = useAppStore(s => s.currentTranscript);
  const lastDebugAudio = useAppStore(s => s.lastDebugAudio);
  const [editedText, setEditedText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (currentTranscript) {
      setEditedText(currentTranscript);
      setIsEditing(false);
      setCountdown(5);
    }
  }, [currentTranscript]);

  useEffect(() => {
    if (!currentTranscript || isEditing) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    
    if (countdown <= 0) {
      onConfirm(editedText);
      return;
    }

    timerRef.current = setTimeout(() => {
      setCountdown(c => c - 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [countdown, currentTranscript, isEditing, editedText, onConfirm]);

  if (!currentTranscript) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        TRANSCRIPT
      </Text>
      <TextInput
        value={editedText}
        onChangeText={(text) => {
          setEditedText(text);
          setIsEditing(true);
        }}
        onFocus={() => setIsEditing(true)}
        multiline
        style={styles.input}
      />
      <TouchableOpacity
        onPress={() => onConfirm(editedText)}
        style={styles.button}
      >
        <Text style={styles.buttonText}>
          {isEditing ? "Confirm Edit" : `Confirm (${countdown}s)`}
        </Text>
      </TouchableOpacity>
      {lastDebugAudio && (
        <View style={styles.debugCard}>
          <Text style={styles.debugLabel}>DEBUG AUDIO</Text>
          <Text style={styles.debugMeta}>
            {`${lastDebugAudio.durationSeconds.toFixed(1)}s • ${Math.round(lastDebugAudio.sizeBytes / 1024)} KB • ${lastDebugAudio.sampleRate} Hz`}
          </Text>
          <Text selectable style={styles.debugPath}>
            {lastDebugAudio.path}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    ...theme.shadows.elevated,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  label: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  input: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    minHeight: 80,
    maxHeight: 200,
    marginBottom: theme.spacing.md,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    alignItems: "center",
  },
  buttonText: {
    ...theme.typography.h3,
    color: "#FFFFFF",
  },
  debugCard: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.background,
  },
  debugLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  debugMeta: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  debugPath: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
});
