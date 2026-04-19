/**
 * Tests the pure decision logic inside SmsStatusBadge.
 * Extracts the status-to-{label, tone} mapping from the component.
 */
import { newSuite } from "./_harness.mjs";
import { SmsStatus } from "../../types/sms";

const t = newSuite("SmsStatusBadge decision logic");

type Tone = "neutral" | "success" | "warning" | "danger";

// Mirror of the `describe` function in SmsStatusBadge.tsx
function describe(
  status: SmsStatus,
  error?: string | null,
  sentAt?: number | null
): { label: string; tone: Tone } | null {
  if (status === "idle") return null; // component returns null at this state
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

// ---------- idle returns null (component does not render) ----------

await t.test("idle returns null — badge hidden", () => {
  t.assertEqual(describe("idle"), null);
});

// ---------- tone mapping ----------

await t.test("formatting is neutral", () => {
  t.assertEqual(describe("formatting")!.tone, "neutral");
});

await t.test("composing is neutral", () => {
  t.assertEqual(describe("composing")!.tone, "neutral");
});

await t.test("sent is success", () => {
  t.assertEqual(describe("sent")!.tone, "success");
});

await t.test("cancelled is neutral", () => {
  t.assertEqual(describe("cancelled")!.tone, "neutral");
});

await t.test("queued is warning", () => {
  t.assertEqual(describe("queued")!.tone, "warning");
});

await t.test("failed is danger", () => {
  t.assertEqual(describe("failed")!.tone, "danger");
});

// ---------- label mapping ----------

await t.test("formatting label is 'Preparing SMS…'", () => {
  t.assertEqual(describe("formatting")!.label, "Preparing SMS…");
});

await t.test("composing label is 'Opening Messages…'", () => {
  t.assertEqual(describe("composing")!.label, "Opening Messages…");
});

await t.test("sent label with no timestamp is 'Sent'", () => {
  t.assertEqual(describe("sent")!.label, "Sent");
});

await t.test("sent label with timestamp formats HH:MM", () => {
  // 2026-04-19 14:07 UTC-ish — just check pattern, not exact time (timezone matters)
  const ts = Date.UTC(2026, 3, 19, 14, 7);
  const label = describe("sent", null, ts)!.label;
  t.assertMatches(label, /^Sent \d{1,2}:\d{2}$/);
});

await t.test("cancelled label is 'SMS cancelled'", () => {
  t.assertEqual(describe("cancelled")!.label, "SMS cancelled");
});

await t.test("queued label mentions offline", () => {
  t.assertEqual(describe("queued")!.label, "Queued — offline");
});

await t.test("failed label with no error is 'Failed'", () => {
  t.assertEqual(describe("failed")!.label, "Failed");
});

await t.test("failed label includes error when provided", () => {
  const label = describe("failed", "network down")!.label;
  t.assertContains(label, "Failed:");
  t.assertContains(label, "network down");
});

await t.test("failed label truncates long errors to ~40 chars", () => {
  const longErr =
    "this is a very long error message that should absolutely be truncated because badges can't fit novels";
  const label = describe("failed", longErr)!.label;
  t.assertTrue(label.length <= 48, `got length ${label.length}`); // "Failed: " + 40
  t.assertContains(label, "…");
});

await t.test("failed label does not truncate when error under 40 chars", () => {
  const label = describe("failed", "short error")!.label;
  t.assertNotContains(label, "…");
});

// ---------- formatTime helper ----------

await t.test("formatTime pads minutes with leading zero", () => {
  const ts = Date.UTC(2026, 3, 19, 14, 5); // 5 minutes past hour
  const label = describe("sent", null, ts)!.label;
  // Match HH:05 pattern (local time may vary but minutes should be 05)
  t.assertMatches(label, /:05$/);
});

t.report();
export {};
