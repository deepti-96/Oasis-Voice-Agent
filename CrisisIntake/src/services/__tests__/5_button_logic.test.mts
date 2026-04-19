/**
 * Tests the pure decision logic inside SendPlanButton.
 *
 * Rather than mount React components (heavy), we extract the rules the
 * component encodes and test them directly:
 *
 *  1. `disabled` is derived from: cloudResult presence, phone presence,
 *     inFlight flag, and alreadySent flag.
 *  2. `label` is derived from: alreadySent, inFlight, default case.
 *  3. The dispatch flow: formatPlanForSMS -> sendPlanSMS -> state updates.
 */
import { newSuite } from "./_harness.mjs";
import { formatPlanForSMS, sendPlanSMS } from "../sms";
import { CloudAnalysis } from "../../types/cloud";
import { SmsStatus } from "../../types/sms";

const t = newSuite("SendPlanButton decision logic");

// --- Extracted decision functions (mirror of component) ---

function computeDisabled(params: {
  cloudResult: unknown;
  phoneNumber: string;
  smsStatus: SmsStatus;
}): boolean {
  const hasPhone = params.phoneNumber.trim().length > 0;
  const inFlight =
    params.smsStatus === "formatting" || params.smsStatus === "composing";
  const alreadySent = params.smsStatus === "sent";
  return !params.cloudResult || !hasPhone || inFlight || alreadySent;
}

function computeLabel(smsStatus: SmsStatus): string {
  if (smsStatus === "sent") return "Plan sent";
  if (smsStatus === "formatting" || smsStatus === "composing") return "Sending…";
  return "Send plan via SMS";
}

const mockPlan: CloudAnalysis = {
  riskScore: 50,
  riskFactors: ["a"],
  protectiveFactors: [],
  timeline: [{ day: 0, action: "act", category: "housing" }],
  programMatches: [{ name: "P1", likelihood: "likely", reason: "r" }],
};

// ---------- disabled logic ----------

await t.test("enabled when plan + phone + status=idle", () => {
  const d = computeDisabled({
    cloudResult: mockPlan,
    phoneNumber: "+14155551234",
    smsStatus: "idle",
  });
  t.assertEqual(d, false);
});

await t.test("disabled when cloudResult is null", () => {
  const d = computeDisabled({
    cloudResult: null,
    phoneNumber: "+14155551234",
    smsStatus: "idle",
  });
  t.assertEqual(d, true);
});

await t.test("disabled when phoneNumber is empty", () => {
  const d = computeDisabled({
    cloudResult: mockPlan,
    phoneNumber: "",
    smsStatus: "idle",
  });
  t.assertEqual(d, true);
});

await t.test("disabled when phoneNumber is whitespace", () => {
  const d = computeDisabled({
    cloudResult: mockPlan,
    phoneNumber: "   ",
    smsStatus: "idle",
  });
  t.assertEqual(d, true);
});

await t.test("disabled during formatting", () => {
  const d = computeDisabled({
    cloudResult: mockPlan,
    phoneNumber: "+14155551234",
    smsStatus: "formatting",
  });
  t.assertEqual(d, true);
});

await t.test("disabled during composing", () => {
  const d = computeDisabled({
    cloudResult: mockPlan,
    phoneNumber: "+14155551234",
    smsStatus: "composing",
  });
  t.assertEqual(d, true);
});

await t.test("disabled after sent (double-send prevention)", () => {
  const d = computeDisabled({
    cloudResult: mockPlan,
    phoneNumber: "+14155551234",
    smsStatus: "sent",
  });
  t.assertEqual(d, true);
});

await t.test("enabled after cancelled (allows retry)", () => {
  const d = computeDisabled({
    cloudResult: mockPlan,
    phoneNumber: "+14155551234",
    smsStatus: "cancelled",
  });
  t.assertEqual(d, false);
});

await t.test("enabled after failed (allows retry)", () => {
  const d = computeDisabled({
    cloudResult: mockPlan,
    phoneNumber: "+14155551234",
    smsStatus: "failed",
  });
  t.assertEqual(d, false);
});

// ---------- label logic ----------

await t.test("label 'Send plan via SMS' for idle", () => {
  t.assertEqual(computeLabel("idle"), "Send plan via SMS");
});

await t.test("label 'Sending…' for formatting", () => {
  t.assertEqual(computeLabel("formatting"), "Sending…");
});

await t.test("label 'Sending…' for composing", () => {
  t.assertEqual(computeLabel("composing"), "Sending…");
});

await t.test("label 'Plan sent' for sent", () => {
  t.assertEqual(computeLabel("sent"), "Plan sent");
});

await t.test("label 'Send plan via SMS' for cancelled (re-try available)", () => {
  t.assertEqual(computeLabel("cancelled"), "Send plan via SMS");
});

await t.test("label 'Send plan via SMS' for failed (re-try available)", () => {
  t.assertEqual(computeLabel("failed"), "Send plan via SMS");
});

// ---------- personalization logic ----------

function personalizeBody(body: string, firstName: string): string {
  return firstName ? `Hi ${firstName},\n\n${body}` : body;
}

await t.test("personalizes body with first name when present", () => {
  const body = personalizeBody("Your plan\nDay 0: shelter", "Maria");
  t.assertEqual(body, "Hi Maria,\n\nYour plan\nDay 0: shelter");
});

await t.test("no personalization when first name empty", () => {
  const body = personalizeBody("Your plan", "");
  t.assertEqual(body, "Your plan");
});

// ---------- full flow simulation ----------

await t.test("full flow: format then send (stub throws, caught)", async () => {
  const body = formatPlanForSMS(mockPlan);
  t.assertTrue(body.length > 0);
  let caught: string | null = null;
  try {
    await sendPlanSMS("+14155551234", body);
  } catch (e) {
    caught = e instanceof Error ? e.message : String(e);
  }
  t.assertTrue(caught !== null, "stub should throw");
  t.assertMatches(caught!, /Phase 1 stub|react-native-sms/);
});

await t.test("full flow with personalization works for valid inputs", async () => {
  const body = personalizeBody(formatPlanForSMS(mockPlan), "Alex");
  t.assertContains(body, "Hi Alex,");
  t.assertContains(body, "CrisisIntake Plan");
  // Phase 1: send throws, but validation should pass first
  try {
    await sendPlanSMS("+14155551234", body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    t.assertMatches(msg, /Phase 1 stub/);
  }
});

t.report();
export {};
