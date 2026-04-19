import { newSuite } from "./_harness.mjs";
import { formatPlanForSMS } from "../sms";
import { CloudAnalysis } from "../../types/cloud";

const t = newSuite("formatPlanForSMS");

const basePlan: CloudAnalysis = {
  riskScore: 78,
  riskFactors: ["no income", "eviction in 7 days", "3 children"],
  protectiveFactors: ["veteran status", "enrolled in Medicaid"],
  timeline: [
    { day: 0, action: "Apply for emergency shelter at 123 Main St", category: "housing" },
    { day: 2, action: "File SNAP application online", category: "benefits" },
    { day: 3, action: "Contact legal aid re eviction: 555-0199", category: "legal" },
    { day: 7, action: "Follow up Section 8 waitlist", category: "housing" },
    { day: 14, action: "Check SNAP approval status", category: "benefits" },
  ],
  programMatches: [
    { name: "Section 8 Housing Voucher", likelihood: "likely", reason: "income under 50% AMI" },
    { name: "SNAP", likelihood: "likely", reason: "household income + 3 kids" },
    { name: "VA Housing", likelihood: "possible", reason: "veteran status confirmed" },
    { name: "CalFresh", likelihood: "unlikely", reason: "already on SNAP" },
  ],
};

// ---------- basic structure ----------

await t.test("contains header with risk band HIGH for score >= 67", () => {
  const body = formatPlanForSMS(basePlan);
  t.assertContains(body, "Risk: HIGH (78/100)");
});

await t.test("risk band MEDIUM for score 34-66", () => {
  const body = formatPlanForSMS({ ...basePlan, riskScore: 50 });
  t.assertContains(body, "Risk: MEDIUM (50/100)");
});

await t.test("risk band LOW for score < 34", () => {
  const body = formatPlanForSMS({ ...basePlan, riskScore: 20 });
  t.assertContains(body, "Risk: LOW (20/100)");
});

await t.test("risk band boundary: 67 is HIGH", () => {
  const body = formatPlanForSMS({ ...basePlan, riskScore: 67 });
  t.assertContains(body, "HIGH");
});

await t.test("risk band boundary: 66 is MEDIUM", () => {
  const body = formatPlanForSMS({ ...basePlan, riskScore: 66 });
  t.assertContains(body, "MEDIUM");
});

await t.test("risk band boundary: 34 is MEDIUM", () => {
  const body = formatPlanForSMS({ ...basePlan, riskScore: 34 });
  t.assertContains(body, "MEDIUM");
});

await t.test("risk band boundary: 33 is LOW", () => {
  const body = formatPlanForSMS({ ...basePlan, riskScore: 33 });
  t.assertContains(body, "LOW");
});

await t.test("risk band for 0", () => {
  const body = formatPlanForSMS({ ...basePlan, riskScore: 0 });
  t.assertContains(body, "Risk: LOW (0/100)");
});

await t.test("risk band for 100", () => {
  const body = formatPlanForSMS({ ...basePlan, riskScore: 100 });
  t.assertContains(body, "Risk: HIGH (100/100)");
});

// ---------- timeline rendering ----------

await t.test("timeline entries are sorted by day ascending", () => {
  const scrambled: CloudAnalysis = {
    ...basePlan,
    timeline: [
      { day: 14, action: "late action", category: "housing" },
      { day: 0, action: "immediate action", category: "housing" },
      { day: 3, action: "mid action", category: "legal" },
    ],
  };
  const body = formatPlanForSMS(scrambled);
  const idx0 = body.indexOf("Day 0");
  const idx3 = body.indexOf("Day 3");
  const idx14 = body.indexOf("Day 14");
  t.assertTrue(idx0 < idx3 && idx3 < idx14, "timeline not ordered");
});

await t.test("category labels are human-readable", () => {
  const body = formatPlanForSMS(basePlan);
  t.assertContains(body, "[Housing]");
  t.assertContains(body, "[Benefits]");
  t.assertContains(body, "[Legal]");
});

await t.test("unknown category falls back to raw key", () => {
  const plan: CloudAnalysis = {
    ...basePlan,
    timeline: [{ day: 0, action: "do thing", category: "employment" as any }],
  };
  const body = formatPlanForSMS(plan);
  t.assertContains(body, "[employment]");
});

// ---------- programs rendering ----------

await t.test("programs are sorted: likely, possible, unlikely", () => {
  const body = formatPlanForSMS(basePlan);
  const idxLikely = body.indexOf("Section 8 Housing Voucher");
  const idxPossible = body.indexOf("VA Housing");
  const idxUnlikely = body.indexOf("CalFresh");
  t.assertTrue(idxLikely < idxPossible, "likely should come before possible");
  t.assertTrue(idxPossible < idxUnlikely, "possible should come before unlikely");
});

await t.test("program likelihood labels are capitalized", () => {
  const body = formatPlanForSMS(basePlan);
  t.assertContains(body, "(Likely)");
  t.assertContains(body, "(Possible)");
  t.assertContains(body, "(Unlikely)");
});

// ---------- risk/protective factors ----------

await t.test("risk factors joined with semicolons", () => {
  const body = formatPlanForSMS(basePlan);
  t.assertContains(body, "Risks: no income; eviction in 7 days; 3 children");
});

await t.test("protective factors joined with semicolons", () => {
  const body = formatPlanForSMS(basePlan);
  t.assertContains(body, "Strengths: veteran status; enrolled in Medicaid");
});

// ---------- reply hint ----------

await t.test("reply hint absent by default", () => {
  const body = formatPlanForSMS(basePlan);
  t.assertNotContains(body, "Reply HELP");
});

await t.test("reply hint appears when enabled", () => {
  const body = formatPlanForSMS(basePlan, { includeReplyHint: true });
  t.assertContains(body, "Reply HELP for assistance.");
});

// ---------- determinism ----------

await t.test("deterministic: same input produces same output", () => {
  const a = formatPlanForSMS(basePlan);
  const b = formatPlanForSMS(basePlan);
  t.assertEqual(a, b);
});

await t.test("deterministic: 100 runs produce identical output", () => {
  const first = formatPlanForSMS(basePlan);
  for (let i = 0; i < 100; i++) {
    if (formatPlanForSMS(basePlan) !== first) {
      throw new Error(`iteration ${i} diverged`);
    }
  }
});

// ---------- GSM-7 compliance ----------

await t.test("output contains no emoji", () => {
  const body = formatPlanForSMS(basePlan);
  // Check for common emoji ranges: misc symbols, pictographs, transport
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  t.assertTrue(!emojiRegex.test(body), "found emoji in output");
});

await t.test("output contains no curly quotes", () => {
  const body = formatPlanForSMS(basePlan);
  t.assertNotContains(body, "\u2018");
  t.assertNotContains(body, "\u2019");
  t.assertNotContains(body, "\u201C");
  t.assertNotContains(body, "\u201D");
});

// ---------- default budget ----------

await t.test("default maxChars is 1600 (full body should fit easily)", () => {
  const body = formatPlanForSMS(basePlan);
  t.assertLessOrEqual(body.length, 1600);
});

// ---------- trim behavior ----------

await t.test("trim step 1: drops protective factors when over budget", () => {
  // Engineer a budget that triggers only step 1 trimming.
  // Full body is ~606. Removing protective factors block (~56 chars) brings us under 600.
  const full = formatPlanForSMS(basePlan);
  const budgeted = formatPlanForSMS(basePlan, { maxChars: full.length - 20 });
  t.assertNotContains(budgeted, "Strengths:");
  t.assertContains(budgeted, "Risks:");
  t.assertContains(budgeted, "Section 8 Housing Voucher"); // likely program preserved
  t.assertContains(budgeted, "CalFresh"); // unlikely still present at this budget
});

await t.test("trim step 2: drops unlikely programs under tighter budget", () => {
  const budgeted = formatPlanForSMS(basePlan, { maxChars: 500 });
  t.assertNotContains(budgeted, "CalFresh"); // unlikely dropped
  t.assertContains(budgeted, "Section 8 Housing Voucher"); // likely preserved
  t.assertContains(budgeted, "VA Housing"); // possible preserved
});

await t.test("trim step 3: drops risk factors under tight budget", () => {
  const budgeted = formatPlanForSMS(basePlan, { maxChars: 400 });
  t.assertLessOrEqual(budgeted.length, 400);
});

await t.test("trim step 4: drops timeline days > 7 under very tight budget", () => {
  const budgeted = formatPlanForSMS(basePlan, { maxChars: 300 });
  t.assertLessOrEqual(budgeted.length, 300);
  // Day 14 action should be gone
  t.assertNotContains(budgeted, "Check SNAP approval status");
});

await t.test("hard truncate: respects maxChars absolutely", () => {
  const budgeted = formatPlanForSMS(basePlan, { maxChars: 100 });
  t.assertLessOrEqual(budgeted.length, 100);
  t.assertContains(budgeted, "...");
});

await t.test("trim preserves header in all budget scenarios", () => {
  for (const budget of [1600, 800, 500, 400, 300, 200, 150]) {
    const body = formatPlanForSMS(basePlan, { maxChars: budget });
    t.assertContains(body, "CrisisIntake Plan", `budget=${budget}`);
  }
});

// ---------- empty edge cases ----------

await t.test("handles empty timeline gracefully", () => {
  const plan: CloudAnalysis = { ...basePlan, timeline: [] };
  const body = formatPlanForSMS(plan);
  t.assertNotContains(body, "ACTION PLAN:");
  t.assertContains(body, "CrisisIntake Plan"); // header still present
});

await t.test("handles empty programs gracefully", () => {
  const plan: CloudAnalysis = { ...basePlan, programMatches: [] };
  const body = formatPlanForSMS(plan);
  t.assertNotContains(body, "PROGRAMS:");
});

await t.test("handles empty risk factors", () => {
  const plan: CloudAnalysis = { ...basePlan, riskFactors: [] };
  const body = formatPlanForSMS(plan);
  t.assertNotContains(body, "Risks:");
});

await t.test("handles empty protective factors", () => {
  const plan: CloudAnalysis = { ...basePlan, protectiveFactors: [] };
  const body = formatPlanForSMS(plan);
  t.assertNotContains(body, "Strengths:");
});

await t.test("handles completely empty plan (just risk score)", () => {
  const plan: CloudAnalysis = {
    riskScore: 0,
    riskFactors: [],
    protectiveFactors: [],
    timeline: [],
    programMatches: [],
  };
  const body = formatPlanForSMS(plan);
  t.assertContains(body, "Risk: LOW (0/100)");
});

// ---------- very large input (stress) ----------

await t.test("handles 50-entry timeline without crashing", () => {
  const bigTimeline = Array.from({ length: 50 }, (_, i) => ({
    day: i,
    action: `Action for day ${i} with some reasonable length of text here`,
    category: "housing" as const,
  }));
  const plan: CloudAnalysis = { ...basePlan, timeline: bigTimeline };
  t.assertNoThrow(() => formatPlanForSMS(plan));
});

await t.test("handles 30 program matches without crashing", () => {
  const bigPrograms = Array.from({ length: 30 }, (_, i) => ({
    name: `Program ${i}`,
    likelihood: (i % 3 === 0 ? "likely" : i % 3 === 1 ? "possible" : "unlikely") as
      | "likely"
      | "possible"
      | "unlikely",
    reason: `Reason for program ${i}`,
  }));
  const plan: CloudAnalysis = { ...basePlan, programMatches: bigPrograms };
  t.assertNoThrow(() => formatPlanForSMS(plan));
});

t.report();
export {};
