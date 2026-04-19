/**
 * SmsStatusBadge — Agent 6
 *
 * Compact pill shown near the Send button on ResourcePlanScreen reflecting
 * the current `smsStatus` in the store. Silent when status === "idle".
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "../../theme";
import { SmsStatus } from "../../types/sms";

interface Props {
  status: SmsStatus;
  error?: string | null;
  sentAt?: number | null;
}

export function SmsStatusBadge({ status, error, sentAt }: Props) {
  if (status === "idle") return null;

  const { label, tone } = describe(status, error, sentAt);

  return (
    <View style={[styles.pill, toneStyles[tone]]}>
      <Text style={[styles.text, toneTextStyles[tone]]}>{label}</Text>
    </View>
  );
}

function describe(
  status: SmsStatus,
  error?: string | null,
  sentAt?: number | null
): { label: string; tone: Tone } {
  switch (status) {
    case "formatting":
      return { label: "Preparing SMS…", tone: "neutral" };
    case "composing":
      return { label: "Opening Messages…", tone: "neutral" };
    case "sent":
      return {
        label: sentAt ? `Sent ${formatTime(sentAt)}` : "Sent",
        tone: "success",
      };
    case "cancelled":
      return { label: "SMS cancelled", tone: "neutral" };
    case "queued":
      return { label: "Queued — offline", tone: "warning" };
    case "failed":
      return {
        label: error ? `Failed: ${truncate(error, 40)}` : "Failed",
        tone: "danger",
      };
    default:
      return { label: "", tone: "neutral" };
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours();
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

type Tone = "neutral" | "success" | "warning" | "danger";

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radii.full,
    borderWidth: 1,
  },
  text: {
    ...theme.typography.caption,
  },
});

const toneStyles: Record<Tone, object> = {
  neutral: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.fieldEmptyBorder,
  },
  success: {
    backgroundColor: theme.colors.fieldConfirmed,
    borderColor: theme.colors.fieldConfirmedBorder,
  },
  warning: {
    backgroundColor: theme.colors.fieldInferred,
    borderColor: theme.colors.fieldInferredBorder,
  },
  danger: {
    backgroundColor: theme.colors.dangerLight,
    borderColor: theme.colors.danger,
  },
};

const toneTextStyles: Record<Tone, object> = {
  neutral: { color: theme.colors.textSecondary },
  success: { color: theme.colors.fieldConfirmedAccent },
  warning: { color: theme.colors.fieldInferredAccent },
  danger: { color: theme.colors.danger },
};
