import { newSuite } from "./_harness.mjs";
import { useAppStore } from "../../store/useAppStore";

const t = newSuite("useAppStore SMS state");

// Reset the store to a known state at the beginning of each test via
// a small helper. zustand stores are global in a module, so we just call
// resetSession() before each scenario.

function reset() {
  useAppStore.getState().resetSession();
}

// ---------- initial state ----------

await t.test("smsStatus defaults to idle", () => {
  reset();
  t.assertEqual(useAppStore.getState().smsStatus, "idle");
});

await t.test("smsError defaults to null", () => {
  reset();
  t.assertEqual(useAppStore.getState().smsError, null);
});

await t.test("smsSentAt defaults to null", () => {
  reset();
  t.assertEqual(useAppStore.getState().smsSentAt, null);
});

// ---------- setSmsStatus ----------

await t.test("setSmsStatus updates status", () => {
  reset();
  useAppStore.getState().setSmsStatus("formatting");
  t.assertEqual(useAppStore.getState().smsStatus, "formatting");
});

await t.test("setSmsStatus accepts all valid statuses", () => {
  reset();
  const states = ["idle", "formatting", "composing", "sent", "cancelled", "failed", "queued"] as const;
  for (const s of states) {
    useAppStore.getState().setSmsStatus(s);
    t.assertEqual(useAppStore.getState().smsStatus, s);
  }
});

// ---------- setSmsError ----------

await t.test("setSmsError stores error string", () => {
  reset();
  useAppStore.getState().setSmsError("network down");
  t.assertEqual(useAppStore.getState().smsError, "network down");
});

await t.test("setSmsError(null) clears error", () => {
  reset();
  useAppStore.getState().setSmsError("something");
  useAppStore.getState().setSmsError(null);
  t.assertEqual(useAppStore.getState().smsError, null);
});

// ---------- markSmsSent ----------

await t.test("markSmsSent sets status to sent", () => {
  reset();
  useAppStore.getState().markSmsSent();
  t.assertEqual(useAppStore.getState().smsStatus, "sent");
});

await t.test("markSmsSent clears error", () => {
  reset();
  useAppStore.getState().setSmsError("previous error");
  useAppStore.getState().markSmsSent();
  t.assertEqual(useAppStore.getState().smsError, null);
});

await t.test("markSmsSent sets smsSentAt to a recent timestamp", () => {
  reset();
  const before = Date.now();
  useAppStore.getState().markSmsSent();
  const after = Date.now();
  const ts = useAppStore.getState().smsSentAt;
  t.assertTrue(ts !== null, "smsSentAt should be set");
  t.assertTrue(ts! >= before && ts! <= after, "timestamp out of range");
});

// ---------- resetSms ----------

await t.test("resetSms clears all SMS fields", () => {
  reset();
  useAppStore.getState().markSmsSent();
  useAppStore.getState().setSmsError("stale");
  useAppStore.getState().resetSms();
  const s = useAppStore.getState();
  t.assertEqual(s.smsStatus, "idle");
  t.assertEqual(s.smsError, null);
  t.assertEqual(s.smsSentAt, null);
});

// ---------- resetSession clears SMS state ----------

await t.test("resetSession clears smsStatus", () => {
  useAppStore.getState().markSmsSent();
  useAppStore.getState().resetSession();
  t.assertEqual(useAppStore.getState().smsStatus, "idle");
});

await t.test("resetSession clears smsError", () => {
  useAppStore.getState().setSmsError("will be gone");
  useAppStore.getState().resetSession();
  t.assertEqual(useAppStore.getState().smsError, null);
});

await t.test("resetSession clears smsSentAt", () => {
  useAppStore.getState().markSmsSent();
  useAppStore.getState().resetSession();
  t.assertEqual(useAppStore.getState().smsSentAt, null);
});

// ---------- state transitions (realistic flow) ----------

await t.test("happy path: idle -> formatting -> composing -> sent", () => {
  reset();
  const s = useAppStore.getState();
  t.assertEqual(s.smsStatus, "idle");
  s.setSmsStatus("formatting");
  t.assertEqual(useAppStore.getState().smsStatus, "formatting");
  s.setSmsStatus("composing");
  t.assertEqual(useAppStore.getState().smsStatus, "composing");
  s.markSmsSent();
  t.assertEqual(useAppStore.getState().smsStatus, "sent");
  t.assertTrue(useAppStore.getState().smsSentAt !== null);
});

await t.test("cancel path: idle -> formatting -> composing -> cancelled", () => {
  reset();
  const s = useAppStore.getState();
  s.setSmsStatus("formatting");
  s.setSmsStatus("composing");
  s.setSmsStatus("cancelled");
  t.assertEqual(useAppStore.getState().smsStatus, "cancelled");
  t.assertEqual(useAppStore.getState().smsSentAt, null); // not sent -> no timestamp
});

await t.test("fail path: sets status AND error together", () => {
  reset();
  const s = useAppStore.getState();
  s.setSmsStatus("failed");
  s.setSmsError("Messages app not available");
  const st = useAppStore.getState();
  t.assertEqual(st.smsStatus, "failed");
  t.assertEqual(st.smsError, "Messages app not available");
});

await t.test("retry after failure: resetSms then proceed", () => {
  reset();
  const s = useAppStore.getState();
  s.setSmsStatus("failed");
  s.setSmsError("transient");
  s.resetSms();
  t.assertEqual(useAppStore.getState().smsStatus, "idle");
  t.assertEqual(useAppStore.getState().smsError, null);
  // Now retry
  s.setSmsStatus("formatting");
  s.markSmsSent();
  t.assertEqual(useAppStore.getState().smsStatus, "sent");
});

// ---------- does NOT interfere with other store fields ----------

await t.test("SMS actions do not clobber cloudResult", () => {
  reset();
  const s = useAppStore.getState();
  s.setCloudResult({
    riskScore: 50,
    riskFactors: [],
    protectiveFactors: [],
    timeline: [],
    programMatches: [],
  } as any);
  s.setSmsStatus("composing");
  s.markSmsSent();
  t.assertTrue(useAppStore.getState().cloudResult !== null);
});

await t.test("SMS actions do not clobber pipelinePhase", () => {
  reset();
  const s = useAppStore.getState();
  s.setPipelinePhase("reviewing");
  s.setSmsStatus("composing");
  s.markSmsSent();
  t.assertEqual(useAppStore.getState().pipelinePhase, "reviewing");
});

t.report();
export {};
