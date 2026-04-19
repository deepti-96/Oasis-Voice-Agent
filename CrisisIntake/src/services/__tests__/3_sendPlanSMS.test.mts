import { newSuite } from "./_harness.mjs";
import { sendPlanSMS } from "../sms";

const t = newSuite("sendPlanSMS (Phase 1 stub)");

// These tests document and verify the intentional Phase 1 stub behavior.
// When Phase 1 is flipped on (real react-native-sms), the last test will
// need to be revisited — but the VALIDATION tests should still pass.

await t.test("throws clearly when phone number is empty", async () => {
  await t.assertThrowsAsync(
    () => sendPlanSMS("", "hello"),
    /phoneNumber is required|not a valid/
  );
});

await t.test("throws when phone number is invalid", async () => {
  await t.assertThrowsAsync(
    () => sendPlanSMS("abc", "hello"),
    /not a valid/
  );
});

await t.test("throws when body is empty string", async () => {
  await t.assertThrowsAsync(
    () => sendPlanSMS("+14155551234", ""),
    /empty body/
  );
});

await t.test("throws when body is whitespace only", async () => {
  await t.assertThrowsAsync(
    () => sendPlanSMS("+14155551234", "   \n  "),
    /empty body/
  );
});

await t.test("Phase 1 stub: throws 'not yet integrated' with valid inputs", async () => {
  await t.assertThrowsAsync(
    () => sendPlanSMS("+14155551234", "Your housing plan\nDay 0: ..."),
    /Phase 1 stub|react-native-sms/
  );
});

await t.test("validation runs BEFORE stub throw (bad phone hits validator first)", async () => {
  // This ensures the validation contract holds even when the underlying
  // impl is a stub — Phase 2 swap won't break input validation.
  let errMsg = "";
  try {
    await sendPlanSMS("555", "valid body");
  } catch (e) {
    errMsg = e instanceof Error ? e.message : String(e);
  }
  // Should fail on phone validation, NOT on the "Phase 1 stub" message
  t.assertContains(errMsg, "not a valid");
  t.assertNotContains(errMsg, "Phase 1 stub");
});

await t.test("validation runs BEFORE stub throw (bad body hits validator first)", async () => {
  let errMsg = "";
  try {
    await sendPlanSMS("+14155551234", "");
  } catch (e) {
    errMsg = e instanceof Error ? e.message : String(e);
  }
  t.assertContains(errMsg, "empty body");
  t.assertNotContains(errMsg, "Phase 1 stub");
});

t.report();
export {};
