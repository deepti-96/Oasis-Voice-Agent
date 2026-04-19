import Config from "react-native-config";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SanitizedPayload } from "../types/sanitized";
import { CloudAnalysis } from "../types/cloud";

/**
 * Gemini REST endpoint used for resource-plan generation. The model is
 * pinned to gemini-2.5-flash per the design spec — cheap, fast, and
 * sufficient for a single structured JSON completion.
 */
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/** AsyncStorage key used to queue sanitized payloads while offline. */
export const QUEUED_PAYLOAD_STORAGE_KEY = "crisisintake/queuedSanitizedPayload";

const ANALYSIS_PROMPT = `You are a housing resource analyst. Analyze this anonymized intake data and respond with a JSON object containing:
{
  "riskScore": <0-100 integer, higher = more urgent>,
  "riskFactors": [<list of risk factor strings>],
  "protectiveFactors": [<list of protective factor strings>],
  "timeline": [{"day": <number>, "action": <string>, "category": <"housing"|"benefits"|"legal"|"medical">}],
  "programMatches": [{"name": <string>, "likelihood": <"likely"|"possible"|"unlikely">, "reason": <string>}]
}

Risk scoring guidance:
  - homelessness >30 days                => high
  - safety_concern_flag = true           => automatic high
  - children present                     => elevated
  - no income and no benefits            => elevated
  - eviction_status = "judgment"         => high

Respond ONLY with the JSON object, no other text, no markdown fences.`;

/**
 * Resolve the Gemini API key at call time.
 *
 * Precedence:
 *   1. Explicit apiKey argument (tests, prod, or user-supplied override)
 *   2. react-native-config's GEMINI_API_KEY (from .env at build time)
 *
 * We never hardcode a key in source. If nothing is available we throw so
 * the caller can surface a clear error instead of making a 400 round-trip.
 */
function resolveApiKey(apiKey?: string): string {
  if (apiKey && apiKey.trim().length > 0) return apiKey.trim();
  const fromConfig = (Config.GEMINI_API_KEY ?? "").trim();
  if (fromConfig.length > 0) return fromConfig;
  throw new Error(
    "Missing GEMINI_API_KEY. Create CrisisIntake/.env from .env.example and set GEMINI_API_KEY."
  );
}

/**
 * Extract the first top-level JSON object from a text blob. Gemini usually
 * returns a bare JSON object, but occasionally wraps it in markdown fences
 * or prepends a short preamble. We scan for the first `{` and walk the
 * string tracking brace depth so we stop at the matching close brace.
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

/**
 * Basic sanity check on the shape of Gemini's response. We don't want a
 * malformed payload to crash the UI three screens deep.
 */
function assertCloudAnalysis(candidate: unknown): asserts candidate is CloudAnalysis {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Gemini response is not an object");
  }
  const c = candidate as Partial<CloudAnalysis>;
  if (typeof c.riskScore !== "number") {
    throw new Error("Gemini response missing numeric riskScore");
  }
  if (!Array.isArray(c.riskFactors)) {
    throw new Error("Gemini response missing riskFactors array");
  }
  if (!Array.isArray(c.protectiveFactors)) {
    throw new Error("Gemini response missing protectiveFactors array");
  }
  if (!Array.isArray(c.timeline)) {
    throw new Error("Gemini response missing timeline array");
  }
  if (!Array.isArray(c.programMatches)) {
    throw new Error("Gemini response missing programMatches array");
  }
}

/**
 * Call Gemini to generate a resource plan from a sanitized intake payload.
 *
 * @param sanitized  PII-free payload produced by sanitizeIntake()
 * @param apiKey     Optional override; falls back to Config.GEMINI_API_KEY
 * @param fetchImpl  Optional fetch override for tests
 */
export async function generateResourcePlan(
  sanitized: SanitizedPayload,
  apiKey?: string,
  fetchImpl: typeof fetch = fetch
): Promise<CloudAnalysis> {
  const key = resolveApiKey(apiKey);

  const response = await fetchImpl(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `${ANALYSIS_PROMPT}\n\nIntake data:\n${JSON.stringify(sanitized, null, 2)}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Gemini API error: ${response.status}${errorBody ? ` — ${errorBody.slice(0, 200)}` : ""}`
    );
  }

  const data = await response.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");

  const json = extractJsonObject(text) ?? text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e: any) {
    throw new Error(`Failed to parse Gemini JSON: ${e?.message ?? e}`);
  }

  assertCloudAnalysis(parsed);
  return parsed;
}

/**
 * Persist a sanitized payload so it can be retried when the device is
 * back online. Called by the orchestrator when cloudStatus transitions
 * to "queued".
 */
export async function enqueueSanitizedPayload(payload: SanitizedPayload): Promise<void> {
  await AsyncStorage.setItem(QUEUED_PAYLOAD_STORAGE_KEY, JSON.stringify(payload));
}

/** Load a previously queued payload, or null if none is pending. */
export async function loadQueuedSanitizedPayload(): Promise<SanitizedPayload | null> {
  const raw = await AsyncStorage.getItem(QUEUED_PAYLOAD_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SanitizedPayload;
  } catch {
    // Corrupt queue entry — drop it.
    await AsyncStorage.removeItem(QUEUED_PAYLOAD_STORAGE_KEY);
    return null;
  }
}

/** Clear the queued payload (call after a successful send). */
export async function clearQueuedSanitizedPayload(): Promise<void> {
  await AsyncStorage.removeItem(QUEUED_PAYLOAD_STORAGE_KEY);
}
