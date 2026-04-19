import { newSuite } from "./_harness.mjs";
import { normalizePhoneNumber } from "../sms";

const t = newSuite("normalizePhoneNumber");

await t.test("accepts E.164 format as-is", () => {
  t.assertEqual(normalizePhoneNumber("+14155551234"), "+14155551234");
});

await t.test("accepts US 10-digit number, prepends +1", () => {
  t.assertEqual(normalizePhoneNumber("4155551234"), "+14155551234");
});

await t.test("accepts US 11-digit number starting with 1", () => {
  t.assertEqual(normalizePhoneNumber("14155551234"), "+14155551234");
});

await t.test("strips parentheses and dashes", () => {
  t.assertEqual(normalizePhoneNumber("(415) 555-1234"), "+14155551234");
});

await t.test("strips spaces", () => {
  t.assertEqual(normalizePhoneNumber("415 555 1234"), "+14155551234");
});

await t.test("strips dashes alone", () => {
  t.assertEqual(normalizePhoneNumber("415-555-1234"), "+14155551234");
});

await t.test("strips dots", () => {
  t.assertEqual(normalizePhoneNumber("415.555.1234"), "+14155551234");
});

await t.test("handles 1-415-555-1234 format", () => {
  t.assertEqual(normalizePhoneNumber("1-415-555-1234"), "+14155551234");
});

await t.test("accepts international E.164 (UK)", () => {
  t.assertEqual(normalizePhoneNumber("+447700900123"), "+447700900123");
});

await t.test("accepts international E.164 (India)", () => {
  t.assertEqual(normalizePhoneNumber("+919876543210"), "+919876543210");
});

await t.test("rejects too-short number", () => {
  t.assertThrows(() => normalizePhoneNumber("555"), /not a valid/);
});

await t.test("rejects 9-digit number", () => {
  t.assertThrows(() => normalizePhoneNumber("415555123"), /not a valid/);
});

await t.test("rejects 11-digit number NOT starting with 1", () => {
  t.assertThrows(() => normalizePhoneNumber("24155551234"), /not a valid/);
});

await t.test("rejects letters-only input", () => {
  t.assertThrows(() => normalizePhoneNumber("call me maybe"), /not a valid/);
});

await t.test("rejects empty string", () => {
  t.assertThrows(() => normalizePhoneNumber(""), /not a valid/);
});

await t.test("rejects short E.164 (too few digits after +)", () => {
  t.assertThrows(() => normalizePhoneNumber("+1234"), /too few digits/);
});

await t.test("strips embedded letters and normalizes", () => {
  // "(415) 555-CATS" -> "(415) 555-" -> "415555" -> too short -> throws.
  // This documents the current behavior (letters get stripped).
  t.assertThrows(() => normalizePhoneNumber("(415) 555-CATS"), /not a valid/);
});

t.report();
export {};
