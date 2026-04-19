# Agent 6 — Sandbox Test Suite

Pure-TypeScript test suite for Agent 6 (SMS Dispatch). Runs in Node via `tsx`
with **no React Native dependencies** — intended as a fast, lightweight
sandbox that verifies the service + store + component decision logic before
touching a real device.

## What's covered (110 tests, 7 suites)

| Suite | Tests | Covers |
|---|---|---|
| `1_normalizePhoneNumber` | 17 | All accepted phone formats + rejection cases (E.164, US 10-digit, international, malformed) |
| `2_formatPlanForSMS` | 36 | Risk band logic, sorting, budget trimming (4 levels), GSM-7 compliance, determinism, stress tests |
| `3_sendPlanSMS` | 7 | Phase 1 stub behavior, input validation order, clear error messages |
| `4_store` | 20 | `smsStatus`/`smsError`/`smsSentAt` fields, actions (`setSmsStatus`, `markSmsSent`, `resetSms`, `resetSession`), state transitions |
| `5_button_logic` | 19 | SendPlanButton `disabled` derivation, label derivation, personalization, full flow |
| `6_badge_logic` | 18 | SmsStatusBadge tone mapping, label mapping, error truncation, timestamp formatting |
| `7_integration` | 10 | End-to-end flow simulating worker taps button, cancel path, failure path, size budgets |

## Running the suite

This test suite is standalone — it does NOT use Jest or any RN test setup.
It runs against the actual `src/services/sms.ts`, `src/store/useAppStore.ts`,
and types directly via `tsx`.

### From scratch (e.g., in a fresh checkout)

```bash
cd CrisisIntake
npm install --save-dev tsx               # one-time: only tsx needs to be added
npx tsx src/services/__tests__/run-all.mts
```

All test files use the `.mts` extension so Node treats them as ES modules
without needing `"type": "module"` in the CrisisIntake `package.json`
(which would break React Native's CommonJS expectations).

The harness prints a per-suite summary with colored pass/fail counts.

## Design rationale

**Why not Jest?** Jest + React Native adds ~30s of boot overhead for a
handful of pure-logic assertions. The harness here boots in <1s.

**Why extract component logic?** `SendPlanButton` and `SmsStatusBadge`
mount RN primitives (`Pressable`, `Text`, etc.) that can't run in Node
without `react-native-testing-library` + JSDOM shim stack. Instead, the
pure decision functions inside each component (`computeDisabled`,
`computeLabel`, `describe`) are mirrored verbatim in the test files and
tested directly. If those mirrors ever drift from the components, the
tests will still pass but in a misleading way — so whenever you change
the component's decision logic, update the test file too.

**Why no mocks for Phase 1?** The Phase 1 stub intentionally throws. We
test the throw is clear and that validation runs before the stub. When
Phase 1 is enabled for real (react-native-sms installed + pod install +
stub replaced), the last test in `3_sendPlanSMS.test.ts` will need to
either be skipped or replaced with a mock — see comments in that file.

## Expanding the suite

Add new `*.test.mts` files in this directory. They are auto-discovered by
`run-all.mts`. Each file is a self-contained suite — create one with
`newSuite("suite name")` from `_harness.mjs`, then `await t.test(...)` for
each case and `t.report()` at the bottom.
