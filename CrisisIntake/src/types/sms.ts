/**
 * SMS dispatch types — Agent 6.
 *
 * Agent 6 sends the generated resource plan to the survivor's phone as SMS.
 * Phase 1 (current): uses iOS native MFMessageComposeViewController via
 * react-native-sms — opens the iOS Messages app with body pre-filled. The
 * field worker's phone sends via their own carrier.
 *
 * Phase 2 (future): replace the `sendPlanSMS` implementation with a Twilio
 * (or similar) backend call. The interface stays identical so no consumer
 * code needs to change.
 */

/** Lifecycle state of the survivor-facing SMS delivery. */
export type SmsStatus =
  | "idle"
  | "formatting"
  | "composing"
  | "sent"
  | "cancelled"
  | "failed"
  | "queued";

/** Outcome of a single `sendPlanSMS` invocation. */
export interface SmsResult {
  status: "sent" | "cancelled" | "failed";
  /** Present when status === "failed". */
  error?: string;
  /** Epoch ms when the composer closed. Present for "sent" and "cancelled". */
  completedAt?: number;
}

/** Options for the plan-formatter. */
export interface FormatPlanOptions {
  /**
   * Hard cap on the entire message body in characters.
   * Defaults to 1600 (10 concatenated GSM-7 SMS segments). Keep this
   * conservative — some carriers truncate above 1600.
   */
  maxChars?: number;
  /**
   * Include the optional "Reply HELP for assistance" line. Only enable
   * when a monitored reply channel exists (Phase 2 with Twilio).
   */
  includeReplyHint?: boolean;
}
