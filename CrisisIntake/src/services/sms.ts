/**
 * Agent 6 — SMS Dispatch service.
 *
 * Responsible for taking the generated `CloudAnalysis` from Agent 5 and
 * delivering a plain-text action plan to the survivor's phone via SMS.
 *
 * Why SMS:
 *   - Works on any phone (flip phones, no data plan, low signal)
 *   - Survivor can re-read it at a shelter, show it to another case worker,
 *     forward to family, or refer to it days later
 *   - No app install, login, or internet required on the receiving end
 *
 * Phase 1 (current) — iOS native composer via react-native-sms:
 *   - The field worker's iPhone opens the Messages app with the body
 *     pre-filled and the survivor's number pre-populated
 *   - Worker taps Send; message goes out via the worker's carrier
 *   - Zero backend cost, zero auth, works immediately
 *
 * Phase 2 (future) — Twilio (or similar) backend:
 *   - Backend sends from a long-code / short-code owned by the org
 *   - Enables 2-way SMS, delivery receipts, bulk dispatch
 *   - Replace the body of `sendPlanSMS` only. The public API is identical.
 *
 * Privacy note: the SMS is sent from the on-device intake (unsanitized) —
 * it's going BACK to the survivor, so it must contain concrete names,
 * addresses, and phone numbers to be useful. This is intentionally the
 * mirror of Agent 5's sanitization, which strips PII for the OUTBOUND
 * Gemini call. Nothing in this file should ever send data to a third-party
 * API without going through `sanitizeIntake` first.
 */

import { CloudAnalysis, TimelineEntry, ProgramMatch } from "../types/cloud";
import { FormatPlanOptions, SmsResult } from "../types/sms";

const DEFAULT_MAX_CHARS = 1600;

/** Category emoji-less labels for plain SMS rendering. */
const CATEGORY_LABEL: Record<string, string> = {
  housing: "Housing",
  benefits: "Benefits",
  legal: "Legal",
  medical: "Medical",
};

/** Human label for risk likelihood keys. */
const LIKELIHOOD_LABEL: Record<ProgramMatch["likelihood"], string> = {
  likely: "Likely",
  possible: "Possible",
  unlikely: "Unlikely",
};

/**
 * Render a `CloudAnalysis` into a single plain-text SMS body.
 *
 * The body is deterministic given the same input — useful for testing.
 * Output is GSM-7 friendly (no emoji, no curly quotes) so every segment
 * stays at 160 chars instead of dropping to 70 (UCS-2 fallback).
 *
 * If the rendered body would exceed `maxChars`, the least-critical
 * sections are trimmed in this order: protective factors → unlikely
 * programs → risk factors → older timeline entries.
 */
export function formatPlanForSMS(
  plan: CloudAnalysis,
  opts: FormatPlanOptions = {}
): string {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const header = buildHeader(plan.riskScore);
  const timeline = buildTimeline(plan.timeline);
  const programs = buildPrograms(plan.programMatches);
  const riskFactors = buildRiskFactors(plan.riskFactors);
  const protective = buildProtectiveFactors(plan.protectiveFactors);
  const footer = opts.includeReplyHint
    ? "\n\nReply HELP for assistance."
    : "";

  // Priority order: header, timeline, and likely-programs are non-negotiable.
  // Everything else is trimmed if we blow past the budget.
  const sections = [header, timeline, programs, riskFactors, protective];
  let body = sections.filter(Boolean).join("\n\n") + footer;

  if (body.length <= maxChars) {
    return body;
  }

  // Trim strategy 1: drop protective factors.
  body = [header, timeline, programs, riskFactors].filter(Boolean).join("\n\n") + footer;
  if (body.length <= maxChars) return body;

  // Trim strategy 2: drop unlikely programs.
  const trimmedPrograms = buildPrograms(
    plan.programMatches.filter((p) => p.likelihood !== "unlikely")
  );
  body = [header, timeline, trimmedPrograms, riskFactors].filter(Boolean).join("\n\n") + footer;
  if (body.length <= maxChars) return body;

  // Trim strategy 3: drop risk factors.
  body = [header, timeline, trimmedPrograms].filter(Boolean).join("\n\n") + footer;
  if (body.length <= maxChars) return body;

  // Trim strategy 4: keep only the next 7 days of timeline.
  const shortTimeline = buildTimeline(
    plan.timeline.filter((e) => e.day <= 7)
  );
  body = [header, shortTimeline, trimmedPrograms].filter(Boolean).join("\n\n") + footer;
  if (body.length <= maxChars) return body;

  // Last resort: hard truncate.
  return body.slice(0, maxChars - 3) + "...";
}

function buildHeader(riskScore: number): string {
  const band =
    riskScore >= 67 ? "HIGH" : riskScore >= 34 ? "MEDIUM" : "LOW";
  return `CrisisIntake Plan\nRisk: ${band} (${riskScore}/100)`;
}

function buildTimeline(entries: TimelineEntry[]): string {
  if (entries.length === 0) return "";
  const sorted = [...entries].sort((a, b) => a.day - b.day);
  const lines = sorted.map((e) => {
    const label = CATEGORY_LABEL[e.category] ?? e.category;
    return `Day ${e.day} [${label}]: ${e.action}`;
  });
  return `ACTION PLAN:\n${lines.join("\n")}`;
}

function buildPrograms(matches: ProgramMatch[]): string {
  if (matches.length === 0) return "";
  const sorted = [...matches].sort((a, b) => {
    const rank = { likely: 0, possible: 1, unlikely: 2 };
    return rank[a.likelihood] - rank[b.likelihood];
  });
  const lines = sorted.map(
    (m) => `- ${m.name} (${LIKELIHOOD_LABEL[m.likelihood]}): ${m.reason}`
  );
  return `PROGRAMS:\n${lines.join("\n")}`;
}

function buildRiskFactors(factors: string[]): string {
  if (factors.length === 0) return "";
  return `Risks: ${factors.join("; ")}`;
}

function buildProtectiveFactors(factors: string[]): string {
  if (factors.length === 0) return "";
  return `Strengths: ${factors.join("; ")}`;
}

/**
 * Send the formatted plan to the given phone number.
 *
 * PHASE 1 IMPLEMENTATION — STUB
 * ==============================
 * The real Phase 1 impl uses react-native-sms to open the iOS Messages app
 * with the body pre-filled. react-native-sms has not been installed yet:
 *
 *   npm install react-native-sms
 *   cd ios && pod install
 *
 * Until the dep is installed, this function throws a clear error at runtime
 * so screens can mount + render but SMS cannot actually be sent. Matches
 * the "stub class that throws" pattern used by `src/services/extraction.ts`.
 *
 * When ready to enable, replace the stub body with:
 *
 *   import SendSMS from "react-native-sms";
 *   return new Promise<SmsResult>((resolve) => {
 *     SendSMS.send(
 *       {
 *         body: segments.join(""),
 *         recipients: [phoneNumber],
 *         successTypes: ["sent", "queued"],
 *         allowAndroidSendWithoutReadPermission: true,
 *       },
 *       (completed, cancelled, error) => {
 *         if (completed) resolve({ status: "sent", completedAt: Date.now() });
 *         else if (cancelled) resolve({ status: "cancelled", completedAt: Date.now() });
 *         else resolve({ status: "failed", error: String(error) });
 *       }
 *     );
 *   });
 */
export async function sendPlanSMS(
  phoneNumber: string,
  body: string
): Promise<SmsResult> {
  validatePhoneNumber(phoneNumber);
  if (!body || body.trim().length === 0) {
    throw new Error("sendPlanSMS: empty body");
  }

  // --- PHASE 1 STUB -----------------------------------------------------
  throw new Error(
    "sendPlanSMS: Agent 6 Phase 1 stub — install react-native-sms + run pod install, then uncomment the real implementation in src/services/sms.ts"
  );
}

/**
 * Normalize a phone number string for the SMS composer. Very permissive —
 * the native composer does its own final validation. Accepts:
 *   +14155551234    → "+14155551234"
 *   (415) 555-1234  → "+14155551234"
 *   4155551234      → "+14155551234"  (assumes US)
 *
 * Throws if fewer than 10 digits remain after stripping formatting.
 */
export function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    if (digits.length < 11) {
      throw new Error(`normalizePhoneNumber: "${raw}" has too few digits`);
    }
    return digits;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  throw new Error(`normalizePhoneNumber: "${raw}" is not a valid US number`);
}

function validatePhoneNumber(phoneNumber: string): void {
  if (!phoneNumber || typeof phoneNumber !== "string") {
    throw new Error("sendPlanSMS: phoneNumber is required");
  }
  // Accept anything the normalizer can handle. Let it throw on bad input.
  normalizePhoneNumber(phoneNumber);
}
