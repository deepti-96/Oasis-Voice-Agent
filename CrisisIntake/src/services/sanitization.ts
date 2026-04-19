import { IntakeSchema, FIELD_METADATA } from "../types/intake";
import { SanitizedPayload } from "../types/sanitized";

/**
 * Bucket an income amount into a $500 range label, e.g. 1723 → "$1,500-$2,000".
 * Any non-finite, negative, or null input returns null so downstream prompts
 * don't fabricate an income bucket the caseworker never provided.
 */
export function bucketIncome(amount: number | null | undefined): string | null {
  if (amount === null || amount === undefined) return null;
  if (!Number.isFinite(amount)) return null;
  if (amount < 0) return null;

  const lower = Math.floor(amount / 500) * 500;
  const upper = lower + 500;
  return `$${lower.toLocaleString("en-US")}-$${upper.toLocaleString("en-US")}`;
}

/**
 * Extract the 4-digit year from a date_of_birth string. The caseworker may
 * enter freeform strings like "07/14/1987", "1987-07-14", or "July 14 1987",
 * so we parse defensively and only return the year when we're confident.
 */
export function yearFromDate(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const match = dob.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const year = Number(match[0]);
  if (!Number.isFinite(year)) return null;
  return year;
}

/**
 * Build the PII-stripped payload that is safe to send to the Gemini API.
 *
 * Redaction rules (from design spec §9):
 *   - client_first_name, client_last_name   → REDACTED (omitted entirely)
 *   - date_of_birth                         → year only
 *   - phone_number                          → REDACTED
 *   - current_address                       → REDACTED
 *   - income_amount                         → bucketed into $500 ranges
 *   - everything else                       → passed through as-is
 *
 * This function is the ONLY place in the codebase that prepares data for
 * an external API. Anything that leaves the device goes through here first.
 */
export function sanitizeIntake(intake: IntakeSchema): SanitizedPayload {
  const totalFields = FIELD_METADATA.length;
  const confirmed = FIELD_METADATA.filter(
    (m) => intake[m.key].status === "confirmed"
  ).length;
  const nonEmpty = FIELD_METADATA.filter(
    (m) => intake[m.key].status !== "empty"
  ).length;

  return {
    // client_first_name, client_last_name, phone_number, current_address
    // are intentionally omitted — they are PII and must never be sent.
    //
    // date_of_birth is also omitted; the year is derived below if needed by
    // future prompts. Keeping the field out of SanitizedPayload matches the
    // shared type and keeps this function side-effect free on the schema.

    gender: intake.gender.value ?? null,
    primary_language: intake.primary_language.value ?? null,
    family_size_adults: intake.family_size_adults.value ?? null,
    family_size_children: intake.family_size_children.value ?? null,
    children_ages: intake.children_ages.value ?? null,
    housing_status: intake.housing_status.value ?? null,
    homelessness_duration_days: intake.homelessness_duration_days.value ?? null,
    eviction_status: intake.eviction_status.value ?? null,
    employment_status: intake.employment_status.value ?? null,
    income_bucket: bucketIncome(intake.income_amount.value),
    income_frequency: intake.income_frequency.value ?? null,
    benefits_receiving: intake.benefits_receiving.value ?? null,
    has_disability: intake.has_disability.value ?? null,
    safety_concern_flag: intake.safety_concern_flag.value ?? null,
    timeline_urgency: intake.timeline_urgency.value ?? null,

    fields_confirmed: confirmed,
    fields_total: totalFields,
    completion_percentage: Math.round((nonEmpty / totalFields) * 100),
  };
}
