# Crisis Intake — Agent Responsibilities

## Overview
The app is split into 5 sections, each built by one agent. All agents share:
- The Zustand store (`src/store/useAppStore.ts`) — the single source of truth
- Shared types (`src/types/*.ts`) — never duplicate, always import
- Theme constants (`src/theme/index.ts`) — never hardcode colors/spacing

Read `CLAUDE.md` before writing any code.

---

## Agent 1: Audio Pipeline

**Owns:** `src/hooks/useAudioPipeline.ts`, `src/components/audio/`

**Builds:**
- `useAudioPipeline` hook — mic capture, ring buffer, VAD, STT, audio flush
- `RecordingIndicator` component — red dot + waveform when listening
- `TranscriptReviewSheet` component — bottom sheet for transcript review/edit

**Interface contract:**
```typescript
useAudioPipeline(): {
  isListening: boolean;
  speechSeconds: number;
  silenceSeconds: number;
  startListening: () => Promise<void>;
  stopListening: () => void;
  onTranscriptReady: (callback: (transcript: string) => void) => void;
}
```

**Store writes:** `pipelinePhase`, `speechSeconds`, `silenceSeconds`, `currentTranscript`
**Store reads:** `modelsLoaded`

**Critical rules:**
- Audio buffer is in-memory ONLY. Never `fs.writeFile` for audio.
- Flush buffer immediately after STT completes.
- Never run STT while LLM is running. Check `pipelinePhase` before starting STT.
- VAD trigger: `silence >= 2s && speech >= 3s` OR `speech >= 20s`.

---

## Agent 2: Extraction Engine

**Owns:** `src/services/extraction.ts`, `src/services/toolSchema.ts`, `src/services/prompts.ts`, `src/services/parseToolCall.ts`

**Builds:**
- `ExtractionEngine` class — Gemma 4 model lifecycle, tool calling, parsing
- Tool schema definition for `update_intake_fields`
- System prompts (voice + vision)
- JSON fallback parser

**Interface contract:**
```typescript
class ExtractionEngine {
  downloadModels(onProgress: (model: string, progress: number) => void): Promise<void>;
  loadModels(): Promise<void>;
  isReady(): boolean;
  destroy(): Promise<void>;
  extractFromTranscript(transcript: string, currentFields: IntakeSchema): Promise<Partial<Record<keyof IntakeSchema, any>> | null>;
  extractFromImage(imagePath: string, currentFields: IntakeSchema): Promise<Partial<Record<keyof IntakeSchema, any>> | null>;
}
```

**Store writes:** NONE (returns deltas; orchestrator merges)
**Store reads:** NONE (receives current fields as parameter)

**Critical rules:**
- System prompt must be under 120 tokens.
- Tool schema is FLAT — no nested objects. 20 properties, all optional.
- If `functionCalls` is empty, try `JSON.parse(result.response)` as fallback.
- If both fail, return `null`. Never throw — the cycle just gets skipped.
- Include `transcript_summary` in tool schema for UI display.

---

## Agent 3: UI & Form

**Owns:** `src/components/form/`, screen layout in `src/screens/IntakeSessionScreen.tsx`

**Builds:**
- `IntakeForm` — scrollable form grouped by section
- `SectionHeader` — section title with completion count
- `FormField` — single field with grey/amber/green states
- `CompletionBar` — bottom bar with progress + action buttons
- `FieldEditor` — inline editor for confirmed fields

**Interface contract:** React components only. No hooks, no services.

**Props for IntakeSessionScreen composition:**
- `IntakeForm` — reads `intake` from store
- `CompletionBar` — receives `onGeneratePlan` callback prop
- `FormField` — receives `fieldMeta: FieldMeta` and reads field state from store

**Store writes:** `confirmField`, `confirmAllFields`, `editField`, `unlockField`
**Store reads:** `intake`, `pipelinePhase`, `transcriptLog`

**Critical rules:**
- ALL visual styling uses theme tokens. No hardcoded hex values.
- Field state colors: `theme.colors.fieldEmpty`, `theme.colors.fieldInferred`, `theme.colors.fieldConfirmed`.
- Modern iOS design: 12-16px radii, subtle shadows, generous spacing.
- Amber fields have a subtle pulse animation (opacity 0.8 <-> 1.0, 2s loop).
- Tap inferred -> confirm (green). Tap confirmed -> unlock + show editor (amber).
- "Confirm All" sets all inferred -> confirmed. "Generate Plan" is disabled until >= 60% fields non-empty.

---

## Agent 4: Document Scanner

**Owns:** `src/components/scanner/`, `src/screens/DocumentScanScreen.tsx`

**Builds:**
- `DocumentScanScreen` — camera view, capture, preview, accept/retake
- `CaptureButton` — large circular camera button
- `ExtractionPreview` — shows extracted fields as chips before accepting

**Interface contract:**
- Navigated to via `navigation.navigate("DocumentScan")`
- Calls `ExtractionEngine.extractFromImage()` (Agent 2's class)
- On accept: calls `store.mergeFields(delta, "vision")` then navigates back
- On cancel/retake: deletes image, stays on screen or navigates back

**Store writes:** `mergeFields` (via accept), `pipelinePhase` (set to "scanning")
**Store reads:** `intake` (passes to extraction engine)

**Critical rules:**
- Image saved to temp directory ONLY. `fs.unlink()` immediately after extraction or cancel.
- NO image caching, thumbnails, or photo library access.
- Disabled during active audio pipeline (check `pipelinePhase !== "listening"`).

---

## Agent 5: Cloud & Sanitization

**Owns:** `src/services/sanitization.ts`, `src/services/gemini.ts`, `src/screens/ResourcePlanScreen.tsx`, `src/components/cloud/`

**Builds:**
- `sanitizeIntake()` function — strips PII, buckets income
- `generateResourcePlan()` function — Gemini API call
- `ResourcePlanScreen` — displays risk score, timeline, program matches
- `RiskScoreBadge`, `TimelineView`, `ProgramMatchCard` components

**Interface contract:**
```typescript
sanitizeIntake(intake: IntakeSchema): SanitizedPayload;
generateResourcePlan(sanitized: SanitizedPayload, apiKey: string): Promise<CloudAnalysis>;
```

**Store writes:** `cloudStatus`, `cloudResult`
**Store reads:** `intake`, `cloudStatus`, `cloudResult`

**Sanitization rules (MUST follow exactly):**
| Field | Action |
|---|---|
| client_first_name, client_last_name | REDACT (do not include) |
| date_of_birth | Keep year only |
| phone_number | REDACT |
| current_address | REDACT |
| income_amount | Bucket into $500 ranges (e.g., "$1,000-$1,500") |
| All other fields | Keep as-is |

**Critical rules:**
- `sanitizeIntake()` is the ONLY function that prepares data for external APIs.
- If offline, set `cloudStatus` to `"queued"` and save payload to AsyncStorage.
- Gemini prompt must request structured JSON output matching `CloudAnalysis` type.
- Parse Gemini response with try/catch. On failure, show raw text.

---

## Agent 6: SMS Dispatch

**Owns:** `src/services/sms.ts`, `src/components/cloud/SendPlanButton.tsx`, `src/components/cloud/SmsStatusBadge.tsx`, `src/types/sms.ts`

**Builds:**
- `formatPlanForSMS()` — renders a `CloudAnalysis` into a plain-text SMS body (GSM-7 friendly, auto-trims to fit `maxChars`).
- `sendPlanSMS()` — sends the body to the survivor's phone.
- `SendPlanButton` — CTA on `ResourcePlanScreen` that kicks off format + send.
- `SmsStatusBadge` — pill showing formatting / composing / sent / cancelled / failed / queued.
- Store additions: `smsStatus`, `smsError`, `smsSentAt` + `setSmsStatus`, `setSmsError`, `markSmsSent`, `resetSms`.

**Interface contract:**
```typescript
formatPlanForSMS(plan: CloudAnalysis, opts?: FormatPlanOptions): string;
sendPlanSMS(phoneNumber: string, body: string): Promise<SmsResult>;
```

**Store writes:** `smsStatus`, `smsError`, `smsSentAt`
**Store reads:** `cloudResult`, `intake.phone_number`, `intake.client_first_name`

**Why SMS:**
- Survivors may not have a working smartphone / data plan after a disaster — SMS works on any phone.
- Persistent, re-readable, forwardable to family, viewable at shelters.
- No app install, no login, no internet on the receiving end.

**Phase 1 (current):** Native iOS `MFMessageComposeViewController` via [`react-native-sms`](https://www.npmjs.com/package/react-native-sms). The field worker's iPhone opens the Messages app with the body pre-filled and the survivor's number pre-populated. The worker taps Send; the message goes via the worker's carrier. Zero backend. `sendPlanSMS` is currently a throw-at-runtime stub — install the native dep and flip the stub to enable.

**Phase 2 (future):** Backend SMS via Twilio (or similar) from an org-owned long/short code. Enables 2-way reply, delivery receipts, bulk dispatch. `sendPlanSMS` body is the only file that changes; `formatPlanForSMS` and all UI stay identical.

**Critical rules:**
- SMS body is generated from the **unsanitized** local intake — it contains real names, addresses, phone numbers because it's going BACK to the survivor to be useful. This is the mirror of Agent 5's sanitization, which runs only on the OUTBOUND Gemini call.
- Phone numbers are normalized to E.164 (`+14155551234`) before handing off to the native composer.
- If `cloudResult` is null, button is disabled.
- If `intake.phone_number` is empty, button is disabled and a helper message explains why.
- Once `smsStatus === "sent"`, the button shows "Plan sent" and cannot be re-tapped (prevents accidental double-sends). `resetSession()` clears the flag.
- The `maxChars` budget auto-trims the least-critical sections first (protective factors → unlikely programs → risk factors → older timeline days) before hard-truncating. Timeline action items and likely-program matches are never dropped unless the budget is catastrophically low.
- Phase 1 MUST NOT send SMS on behalf of the survivor silently — the native composer always shows the body to the field worker for final review before Send.

---

## Integration Points

All agents connect through 3 shared layers:

1. **Zustand store** — every agent reads/writes state here
2. **Shared types** — `src/types/intake.ts` is the schema contract
3. **Theme** — `src/theme/index.ts` is the visual contract

The orchestrator in `IntakeSessionScreen.tsx` wires:
- Agent 1's `useAudioPipeline` hook
- Agent 2's `ExtractionEngine` class
- Agent 3's form components
- Agent 5's `sanitizeIntake` + `generateResourcePlan`

Agent 4's `DocumentScanScreen` is a separate navigation route that calls Agent 2's extraction engine directly.

Agent 6's `SendPlanButton` lives inside `ResourcePlanScreen` (next to "Start New Case") and fires after Agent 5 has produced a `CloudAnalysis`. It does not interact with the audio pipeline or extraction engine.
