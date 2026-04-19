/**
 * Tiny test harness. No external deps, no framework overhead.
 * Usage:
 *   const t = newSuite("normalizePhoneNumber");
 *   t.test("basic", () => { t.assertEqual(foo(), "bar"); });
 *   t.report();
 */
import { strict as assert } from "node:assert";

export interface Suite {
  name: string;
  passed: number;
  failed: number;
  failures: Array<{ test: string; error: string }>;
  test: (name: string, fn: () => void | Promise<void>) => Promise<void>;
  assertEqual: <T>(actual: T, expected: T, msg?: string) => void;
  assertDeepEqual: <T>(actual: T, expected: T, msg?: string) => void;
  assertTrue: (cond: boolean, msg?: string) => void;
  assertThrows: (fn: () => unknown, match?: RegExp | string, msg?: string) => void;
  assertThrowsAsync: (fn: () => Promise<unknown>, match?: RegExp | string, msg?: string) => Promise<void>;
  assertNoThrow: (fn: () => unknown, msg?: string) => void;
  assertMatches: (actual: string, pattern: RegExp, msg?: string) => void;
  assertContains: (actual: string, needle: string, msg?: string) => void;
  assertNotContains: (actual: string, needle: string, msg?: string) => void;
  assertLength: (actual: { length: number }, n: number, msg?: string) => void;
  assertLessOrEqual: (actual: number, n: number, msg?: string) => void;
  report: () => boolean;
}

export function newSuite(name: string): Suite {
  const s: Suite = {
    name,
    passed: 0,
    failed: 0,
    failures: [],
    async test(testName, fn) {
      try {
        await fn();
        s.passed++;
        console.log(`  \x1b[32m✓\x1b[0m ${testName}`);
      } catch (err) {
        s.failed++;
        const msg = err instanceof Error ? err.message : String(err);
        s.failures.push({ test: testName, error: msg });
        console.log(`  \x1b[31m✗\x1b[0m ${testName}`);
        console.log(`      \x1b[31m${msg}\x1b[0m`);
      }
    },
    assertEqual(actual, expected, msg) {
      assert.equal(actual, expected, msg);
    },
    assertDeepEqual(actual, expected, msg) {
      assert.deepEqual(actual, expected, msg);
    },
    assertTrue(cond, msg) {
      assert.ok(cond, msg ?? "expected true");
    },
    assertThrows(fn, match, msg) {
      let threw = false;
      let err: unknown;
      try {
        fn();
      } catch (e) {
        threw = true;
        err = e;
      }
      if (!threw) throw new Error(msg ?? "expected function to throw");
      if (match) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (match instanceof RegExp) {
          if (!match.test(errMsg)) {
            throw new Error(
              `error message "${errMsg}" did not match pattern ${match}`
            );
          }
        } else {
          if (!errMsg.includes(match)) {
            throw new Error(
              `error message "${errMsg}" did not contain "${match}"`
            );
          }
        }
      }
    },
    async assertThrowsAsync(fn, match, msg) {
      let threw = false;
      let err: unknown;
      try {
        await fn();
      } catch (e) {
        threw = true;
        err = e;
      }
      if (!threw) throw new Error(msg ?? "expected async function to throw");
      if (match) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (match instanceof RegExp) {
          if (!match.test(errMsg)) {
            throw new Error(
              `error message "${errMsg}" did not match pattern ${match}`
            );
          }
        } else {
          if (!errMsg.includes(match)) {
            throw new Error(
              `error message "${errMsg}" did not contain "${match}"`
            );
          }
        }
      }
    },
    assertNoThrow(fn, msg) {
      try {
        fn();
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        throw new Error(
          (msg ?? "expected function not to throw") + `: got ${errMsg}`
        );
      }
    },
    assertMatches(actual, pattern, msg) {
      if (!pattern.test(actual)) {
        throw new Error(
          (msg ?? "pattern mismatch") +
            `\n  actual: ${JSON.stringify(actual)}\n  pattern: ${pattern}`
        );
      }
    },
    assertContains(actual, needle, msg) {
      if (!actual.includes(needle)) {
        throw new Error(
          (msg ?? "missing substring") +
            `\n  actual: ${JSON.stringify(actual.slice(0, 200))}\n  needle: ${JSON.stringify(needle)}`
        );
      }
    },
    assertNotContains(actual, needle, msg) {
      if (actual.includes(needle)) {
        throw new Error(
          (msg ?? "unexpected substring present") +
            `\n  actual: ${JSON.stringify(actual.slice(0, 200))}\n  needle: ${JSON.stringify(needle)}`
        );
      }
    },
    assertLength(actual, n, msg) {
      if (actual.length !== n) {
        throw new Error(
          (msg ?? "length mismatch") +
            `\n  actual: ${actual.length}\n  expected: ${n}`
        );
      }
    },
    assertLessOrEqual(actual, n, msg) {
      if (actual > n) {
        throw new Error(
          (msg ?? "value exceeds max") +
            `\n  actual: ${actual}\n  max: ${n}`
        );
      }
    },
    report() {
      const total = s.passed + s.failed;
      const color = s.failed === 0 ? "\x1b[32m" : "\x1b[31m";
      console.log(
        `${color}[${s.name}] ${s.passed}/${total} passed\x1b[0m${
          s.failed > 0 ? ` (${s.failed} failed)` : ""
        }\n`
      );
      return s.failed === 0;
    },
  };
  console.log(`\n\x1b[1m▶ ${name}\x1b[0m`);
  return s;
}
