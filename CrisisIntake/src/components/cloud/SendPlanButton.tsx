/**
 * SendPlanButton — Agent 6
 *
 * Wires the "Send plan to survivor via SMS" action on ResourcePlanScreen.
 * Formats the plan, invokes the SMS service, and updates store status.
 *
 * Disabled when:
 *   - There is no survivor phone number in the intake
 *   - An SMS is already in flight (status === "formatting" | "composing")
 *   - The plan has already been sent (status === "sent")
 *
 * This component reads from the store directly so it stays drop-in for
 * ResourcePlanScreen without prop drilling.
 */
import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { theme } from "../../theme";
import { useAppStore } from "../../store/useAppStore";
import { formatPlanForSMS, sendPlanSMS } from "../../services/sms";
import { SmsStatusBadge } from "./SmsStatusBadge";

export function SendPlanButton() {
  const cloudResult = useAppStore((s) => s.cloudResult);
  const phoneField = useAppStore((s) => s.intake.phone_number);
  const firstNameField = useAppStore((s) => s.intake.client_first_name);
  const smsStatus = useAppStore((s) => s.smsStatus);
  const smsError = useAppStore((s) => s.smsError);
  const smsSentAt = useAppStore((s) => s.smsSentAt);

  const setSmsStatus = useAppStore((s) => s.setSmsStatus);
  const setSmsError = useAppStore((s) => s.setSmsError);
  const markSmsSent = useAppStore((s) => s.markSmsSent);

  const phoneNumber =
    typeof phoneField.value === "string" ? phoneField.value : "";
  const firstName =
    typeof firstNameField.value === "string" ? firstNameField.value : "";
  const hasPhone = phoneNumber.trim().length > 0;

  const inFlight = smsStatus === "formatting" || smsStatus === "composing";
  const alreadySent = smsStatus === "sent";
  const disabled = !cloudResult || !hasPhone || inFlight || alreadySent;

  const handleSend = useCallback(async () => {
    if (!cloudResult) {
      Alert.alert("No plan", "Generate a resource plan before sending.");
      return;
    }
    if (!hasPhone) {
      Alert.alert(
        "Missing phone",
        "Capture the survivor's phone number in the intake form first."
      );
      return;
    }

    try {
      setSmsStatus("formatting");
      setSmsError(null);

      const body = formatPlanForSMS(cloudResult, {
        // Phase 1: no reply channel, so omit the reply hint.
        includeReplyHint: false,
      });

      // Optional personalization — only prepended if we have a first name.
      const finalBody = firstName
        ? `Hi ${firstName},\n\n${body}`
        : body;

      setSmsStatus("composing");
      const result = await sendPlanSMS(phoneNumber, finalBody);

      if (result.status === "sent") {
        markSmsSent();
      } else if (result.status === "cancelled") {
        setSmsStatus("cancelled");
      } else {
        setSmsStatus("failed");
        setSmsError(result.error ?? "unknown error");
      }
    } catch (err) {
      setSmsStatus("failed");
      setSmsError(err instanceof Error ? err.message : String(err));
    }
  }, [
    cloudResult,
    hasPhone,
    phoneNumber,
    firstName,
    setSmsStatus,
    setSmsError,
    markSmsSent,
  ]);

  const label = alreadySent
    ? "Plan sent"
    : inFlight
    ? "Sending…"
    : "Send plan via SMS";

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handleSend}
        disabled={disabled}
        style={({ pressed }) => [
          styles.button,
          disabled && styles.buttonDisabled,
          pressed && !disabled && styles.buttonPressed,
        ]}
      >
        {inFlight && (
          <ActivityIndicator
            size="small"
            color={theme.colors.background}
            style={styles.spinner}
          />
        )}
        <Text
          style={[styles.label, disabled && styles.labelDisabled]}
        >
          {label}
        </Text>
      </Pressable>

      {!hasPhone && (
        <Text style={styles.helperText}>
          Add the survivor's phone number to the intake form to enable SMS.
        </Text>
      )}

      <SmsStatusBadge
        status={smsStatus}
        error={smsError}
        sentAt={smsSentAt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.sm,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.fieldConfirmedAccent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    backgroundColor: theme.colors.fieldEmpty,
  },
  label: {
    ...theme.typography.h3,
    color: theme.colors.background,
  },
  labelDisabled: {
    color: theme.colors.textMuted,
  },
  spinner: {
    marginRight: theme.spacing.xs,
  },
  helperText: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
});
