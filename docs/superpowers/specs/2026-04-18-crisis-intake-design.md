# Crisis Intake — Design Specification

> Voice-driven, on-device data extraction for housing & resource intake. Audio never persists. Only structured JSON survives.

## 1. Product Overview

A React Native iOS app for field workers conducting housing intake interviews with displaced individuals. Instead of rigid form-based Q&A, the field worker has a natural conversation. The app listens, transcribes on-device, shows an editable transcript, extracts structured data via Gemma 4 tool calling, and fills a visual intake form in real-time (grey → amber → green). Audio is flushed every processing cycle. When ready, sanitized (PII-stripped) data goes to Gemini cloud for risk scoring and a 30-day resource timeline.

### Target Users

- Outreach workers walking encampments
- Intake specialists at shelters and housing offices
- Disaster case managers deployed after hurricanes, fires, floods
- Social workers in hospitals, schools, community centers

### Key Differentiators

- **Privacy-by-architecture**: Audio never persists, PII never leaves device
- **On-device extraction**: Gemma 4 on Cactus, no cloud dependency for core loop
- **Human-in-the-loop**: Editable transcript before extraction, confirm/reject on every field
- **Hybrid routing**: Only sanitized, anonymized data goes to cloud for heavy reasoning

---

## 2. Technical Stack

| Layer | Technology |
|---|---|
| Platform | React Native (iOS, iPhone 15 Pro+ / 8GB RAM) |
| Language | TypeScript |
| AI Runtime | Cactus React Native SDK (`cactus-react-native` + `react-native-nitro-modules`) |
| VAD Model | Silero VAD (~10MB) via Cactus |
| STT Model | Moonshine Base (61M params, ~70MB) via Cactus |
| LLM Model | Gemma 4 E2B INT4 (~400MB, mmap) via Cactus |
| Cloud API | Gemini 2.5 Flash via Google AI Studio REST API |
| State Management | Zustand (lightweight, works well with RN) |
| Navigation | React Navigation (stack navigator) |
| Version Control | GitHub |

### RAM Budget (iPhone 15 Pro, 8GB)

| Component | Memory |
|---|---|
| Gemma 4 E2B INT4 | ~400MB (mmap, not all resident) |
| Moonshine STT | ~70MB |
| Silero VAD | ~10MB |
| App + OS overhead | ~2GB |
| **Total** | **~2.5GB** — comfortable headroom |

### Critical Constraint

STT and LLM share device compute. They must NEVER run simultaneously — strict sequential execution enforced by an async mutex/queue. Pipeline: listen → transcribe → flush audio → extract → resume listening.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    iPhone (everything on-device)          │
│                                                           │
│   ┌──────────────┐   ┌──────────────┐   ┌─────────────┐ │
│   │ Mic Capture   │   │ Silero VAD   │   │ Moonshine   │ │
│   │ (RN Audio API)│──>│ (via Cactus) │──>│ STT         │ │
│   │ PCM 16kHz     │   │ speech/silence│   │ (via Cactus)│ │
│   └──────────────┘   └──────────────┘   └──────┬──────┘ │
│                                                  │        │
│                              ┌───────────────────▼──────┐ │
│                              │ Editable Transcript      │ │
│                              │ (human review/correction) │ │
│                              └───────────────────┬──────┘ │
│                                                  │        │
│   ┌──────────────┐                    ┌──────────▼──────┐ │
│   │ Ring Buffer   │   FLUSH           │ Gemma 4 E2B     │ │
│   │ (in-memory)   │◄──────────────────│ Tool Calling    │ │
│   │ max 20s       │   after STT       │ (via Cactus)    │ │
│   └──────────────┘                    └──────────┬──────┘ │
│                                                  │        │
│                              ┌───────────────────▼──────┐ │
│                              │ Form State Store         │ │
│                              │ (Zustand)                │ │
│                              │ 20 fields × 3 states     │ │
│                              └───────────────────┬──────┘ │
│                                                  │        │
│                              ┌───────────────────▼──────┐ │
│                              │ React Native UI          │ │
│                              │ Intake Form              │ │
│                              │ Grey → Amber → Green     │ │
│                              └──────────────────────────┘ │
│                                                           │
│   OPTIONAL CLOUD PATH (on-demand only):                   │
│   Form State → Sanitize PII → Gemini 2.5 Flash API       │
│   → Risk Score + 30-day Timeline + Program Matches        │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Data Model

### 4.1 Intake Schema (20 fields)

```typescript
// src/types/intake.ts

export type FieldStatus = "empty" | "inferred" | "confirmed";

export interface IntakeField<T = string | number | boolean> {
  value: T | null;
  status: FieldStatus;
  lastUpdatedAt: number; // Date.now() timestamp
  source: "voice" | "vision" | "manual" | null;
}

export interface IntakeSchema {
  // Demographics (6 fields)
  client_first_name: IntakeField<string>;
  client_last_name: IntakeField<string>;
  date_of_birth: IntakeField<string>;       // YYYY-MM-DD
  gender: IntakeField<string>;              // male | female | nonbinary | other
  primary_language: IntakeField<string>;
  phone_number: IntakeField<string>;

  // Family (3 fields)
  family_size_adults: IntakeField<number>;
  family_size_children: IntakeField<number>;
  children_ages: IntakeField<string>;       // comma-separated

  // Housing (4 fields)
  current_address: IntakeField<string>;
  housing_status: IntakeField<string>;      // housed | at_risk | homeless | shelter | doubled_up | fleeing_dv
  homelessness_duration_days: IntakeField<number>;
  eviction_status: IntakeField<string>;     // none | notice | filed | judgment

  // Income (3 fields)
  employment_status: IntakeField<string>;   // full_time | part_time | unemployed | disabled | retired
  income_amount: IntakeField<number>;
  income_frequency: IntakeField<string>;    // weekly | biweekly | monthly | annual

  // Benefits (1 field)
  benefits_receiving: IntakeField<string>;  // comma-separated: SNAP, TANF, SSI, Medicaid, Section8, WIC

  // Health (1 field)
  has_disability: IntakeField<boolean>;

  // Safety (1 field)
  safety_concern_flag: IntakeField<boolean>;

  // Needs (1 field)
  timeline_urgency: IntakeField<string>;    // immediate | within_week | within_month | flexible
}

// Field metadata for UI rendering
export interface FieldMeta {
  key: keyof IntakeSchema;
  label: string;
  section: "demographics" | "family" | "housing" | "income" | "benefits" | "health" | "safety" | "needs";
  type: "text" | "number" | "enum" | "boolean";
  enumValues?: string[];
}

export const FIELD_METADATA: FieldMeta[] = [
  { key: "client_first_name", label: "First Name", section: "demographics", type: "text" },
  { key: "client_last_name", label: "Last Name", section: "demographics", type: "text" },
  { key: "date_of_birth", label: "Date of Birth", section: "demographics", type: "text" },
  { key: "gender", label: "Gender", section: "demographics", type: "enum", enumValues: ["male", "female", "nonbinary", "other"] },
  { key: "primary_language", label: "Primary Language", section: "demographics", type: "text" },
  { key: "phone_number", label: "Phone Number", section: "demographics", type: "text" },
  { key: "family_size_adults", label: "Adults in Household", section: "family", type: "number" },
  { key: "family_size_children", label: "Children in Household", section: "family", type: "number" },
  { key: "children_ages", label: "Children's Ages", section: "family", type: "text" },
  { key: "current_address", label: "Current Address", section: "housing", type: "text" },
  { key: "housing_status", label: "Housing Status", section: "housing", type: "enum", enumValues: ["housed", "at_risk", "homeless", "shelter", "doubled_up", "fleeing_dv"] },
  { key: "homelessness_duration_days", label: "Days Homeless", section: "housing", type: "number" },
  { key: "eviction_status", label: "Eviction Status", section: "housing", type: "enum", enumValues: ["none", "notice", "filed", "judgment"] },
  { key: "employment_status", label: "Employment", section: "income", type: "enum", enumValues: ["full_time", "part_time", "unemployed", "disabled", "retired"] },
  { key: "income_amount", label: "Income Amount", section: "income", type: "number" },
  { key: "income_frequency", label: "Income Frequency", section: "income", type: "enum", enumValues: ["weekly", "biweekly", "monthly", "annual"] },
  { key: "benefits_receiving", label: "Benefits", section: "benefits", type: "text" },
  { key: "has_disability", label: "Disability", section: "health", type: "boolean" },
  { key: "safety_concern_flag", label: "Safety Concern", section: "safety", type: "boolean" },
  { key: "timeline_urgency", label: "Urgency", section: "needs", type: "enum", enumValues: ["immediate", "within_week", "within_month", "flexible"] },
];
```

### 4.2 Field State Machine

```
EMPTY (grey)
  │
  ├─ LLM extracts value ──► INFERRED (amber, pulsing)
  │                              │
  │                              ├─ Field worker taps confirm ──► CONFIRMED (green, locked)
  │                              │                                    │
  │                              ├─ LLM extracts different value ──► INFERRED (updated, stays amber)
  │                              │                                    │
  │                              └─ Field worker edits manually ──► INFERRED (manual edit, amber)
  │                                                                   │
  │                                                              Field worker taps to edit
  │                                                                   │
  │                                                              ──► INFERRED (unlocked, amber)
  │
  └─ Field worker types manually ──► INFERRED (amber)

RULE: LLM NEVER overwrites a CONFIRMED field. Only human action can unlock it.
```

### 4.3 Delta Merge Logic

```typescript
// src/utils/mergeFields.ts

export function mergeExtractedFields(
  currentState: IntakeSchema,
  delta: Partial<Record<keyof IntakeSchema, any>>,
  source: "voice" | "vision"
): IntakeSchema {
  const newState = { ...currentState };

  for (const [key, value] of Object.entries(delta)) {
    const fieldKey = key as keyof IntakeSchema;
    const currentField = newState[fieldKey];

    if (!currentField) continue;
    if (value === null || value === undefined || value === "") continue;

    // NEVER overwrite confirmed fields
    if (currentField.status === "confirmed") continue;

    newState[fieldKey] = {
      value,
      status: "inferred",
      lastUpdatedAt: Date.now(),
      source,
    };
  }

  return newState;
}
```

### 4.4 Transcript Log

```typescript
// src/types/transcript.ts

export interface TranscriptEntry {
  id: string;
  rawText: string;        // original STT output
  editedText: string;     // after human correction (same as raw if no edit)
  wasEdited: boolean;
  timestamp: number;
  fieldsExtracted: string[]; // which field keys were updated from this segment
}
```

### 4.5 Cloud Response Types

```typescript
// src/types/cloud.ts

export interface CloudAnalysis {
  riskScore: number;              // 0-100
  riskFactors: string[];          // e.g., ["children present", "no income"]
  protectiveFactors: string[];    // e.g., ["has SNAP benefits", "family support"]
  timeline: TimelineEntry[];
  programMatches: ProgramMatch[];
}

export interface TimelineEntry {
  day: number;                    // day 1, 3, 7, 14, 30
  action: string;                 // e.g., "Apply for emergency shelter"
  category: string;               // housing | benefits | legal | medical
}

export interface ProgramMatch {
  name: string;                   // e.g., "Emergency Housing Voucher"
  likelihood: "likely" | "possible" | "unlikely";
  reason: string;                 // why they may qualify
}
```

### 4.6 Sanitized Payload

```typescript
// src/types/sanitized.ts

export interface SanitizedPayload {
  // REDACTED fields (never sent)
  // client_first_name, client_last_name, date_of_birth, phone_number, current_address

  // Kept as-is (categorical, non-identifying)
  gender: string | null;
  primary_language: string | null;
  family_size_adults: number | null;
  family_size_children: number | null;
  children_ages: string | null;
  housing_status: string | null;
  homelessness_duration_days: number | null;
  eviction_status: string | null;
  employment_status: string | null;
  income_bucket: string | null;       // bucketed: "$1,000-$1,500"
  income_frequency: string | null;
  benefits_receiving: string | null;
  has_disability: boolean | null;
  safety_concern_flag: boolean | null;
  timeline_urgency: string | null;

  // Metadata
  fields_confirmed: number;
  fields_total: number;
  completion_percentage: number;
}
```

---

## 5. Zustand Store Design

Single global store for the entire app state. All sections read from and write to this store.

```typescript
// src/store/useAppStore.ts

import { create } from "zustand";

interface AppState {
  // --- Session ---
  sessionId: string;
  sessionStartedAt: number;

  // --- Pipeline Status ---
  pipelinePhase: "idle" | "listening" | "transcribing" | "reviewing" | "extracting" | "scanning";
  modelsLoaded: boolean;
  modelDownloadProgress: { vad: number; stt: number; llm: number };

  // --- Audio ---
  speechSeconds: number;
  silenceSeconds: number;

  // --- Transcript ---
  currentTranscript: string | null;       // latest STT output, pending review
  transcriptLog: TranscriptEntry[];

  // --- Intake Form ---
  intake: IntakeSchema;

  // --- Cloud ---
  cloudStatus: "idle" | "sanitizing" | "sending" | "complete" | "error" | "queued";
  cloudResult: CloudAnalysis | null;

  // --- Actions ---
  // Pipeline
  setPipelinePhase: (phase: AppState["pipelinePhase"]) => void;
  setModelsLoaded: (loaded: boolean) => void;
  updateDownloadProgress: (model: "vad" | "stt" | "llm", progress: number) => void;

  // Audio
  updateAudioCounters: (speech: number, silence: number) => void;
  resetAudioCounters: () => void;

  // Transcript
  setCurrentTranscript: (text: string) => void;
  editCurrentTranscript: (text: string) => void;
  commitTranscript: (entry: TranscriptEntry) => void;
  clearCurrentTranscript: () => void;

  // Intake
  mergeFields: (delta: Partial<Record<keyof IntakeSchema, any>>, source: "voice" | "vision") => void;
  confirmField: (key: keyof IntakeSchema) => void;
  confirmAllFields: () => void;
  editField: (key: keyof IntakeSchema, value: any) => void;
  unlockField: (key: keyof IntakeSchema) => void;

  // Cloud
  setCloudStatus: (status: AppState["cloudStatus"]) => void;
  setCloudResult: (result: CloudAnalysis) => void;

  // Computed
  getCompletionPercentage: () => number;
  getFieldsBySection: (section: string) => Array<{ meta: FieldMeta; field: IntakeField }>;

  // Session
  resetSession: () => void;
}
```

### Why a Single Store

- All 5 agents write components that read/write the same state
- No prop drilling, no context spaghetti
- Zustand is tiny (~1KB), no boilerplate, works outside React components too
- Each agent's components import `useAppStore` and access only the slices they need

---

## 6. Five Agent Sections

The app is divided into 5 sections. Each section is built by one agent/builder. The skeleton (Section 0) is built first, then all 5 sections are built in parallel and integrated.

### Section 0: Skeleton (built first, before agents)

**Owner:** Main developer (you, here)
**Purpose:** Project scaffolding that all agents build on top of.

**Delivers:**
- React Native project initialized with TypeScript
- `cactus-react-native` and `react-native-nitro-modules` installed
- React Navigation stack navigator with 3 empty screen shells
- Zustand store with full type definitions and all actions stubbed
- All shared types (`src/types/*.ts`) written
- Theme constants (`src/theme/index.ts`)
- Utility functions (`src/utils/mergeFields.ts`)
- `CLAUDE.md` and `AGENTS.md` in repo root
- Builds and runs on iPhone simulator (blank screens, no functionality)

**File structure after skeleton:**

```
CrisisIntake/
├── CLAUDE.md                          # project-wide coding standards
├── AGENTS.md                          # agent responsibilities & interfaces
├── src/
│   ├── App.tsx                        # navigation setup
│   ├── types/
│   │   ├── intake.ts                  # IntakeSchema, IntakeField, FieldMeta, FIELD_METADATA
│   │   ├── transcript.ts             # TranscriptEntry
│   │   ├── cloud.ts                  # CloudAnalysis, TimelineEntry, ProgramMatch
│   │   └── sanitized.ts             # SanitizedPayload
│   ├── store/
│   │   └── useAppStore.ts            # Zustand store, fully typed, actions stubbed
│   ├── theme/
│   │   └── index.ts                  # colors, spacing, typography, radii, shadows
│   ├── services/                      # empty — agents create services here
│   │   └── .gitkeep
│   ├── hooks/                         # empty — agents create hooks here
│   │   └── .gitkeep
│   ├── utils/
│   │   ├── mergeFields.ts            # delta merge logic
│   │   └── createEmptyIntake.ts      # factory for blank IntakeSchema
│   ├── screens/
│   │   ├── IntakeSessionScreen.tsx   # shell — agents fill this in
│   │   ├── DocumentScanScreen.tsx    # shell
│   │   └── ResourcePlanScreen.tsx    # shell
│   └── components/                   # empty — agents create components here
│       ├── audio/                    # Agent 1's components
│       ├── form/                     # Agent 3's components
│       ├── scanner/                  # Agent 4's components
│       └── cloud/                    # Agent 5's components
├── ios/                               # Xcode project (auto-generated)
├── package.json
├── tsconfig.json
└── .gitignore
```

---

### Section 1: Audio Pipeline

**Owner:** Agent 1
**Directory:** `src/hooks/useAudioPipeline.ts`, `src/components/audio/`

**Responsibility:** Microphone capture, ring buffer, VAD, silence detection, STT transcription, audio flush.

**Exposes:**

```typescript
// src/hooks/useAudioPipeline.ts

export function useAudioPipeline(): {
  // State
  isListening: boolean;
  speechSeconds: number;
  silenceSeconds: number;

  // Controls
  startListening: () => Promise<void>;
  stopListening: () => void;

  // Callback registration
  onTranscriptReady: (callback: (transcript: string) => void) => void;
}
```

**Behavior:**
1. `startListening()` — requests mic permission, starts recording PCM 16kHz mono, begins VAD processing
2. On each ~1s audio chunk: run Silero VAD via Cactus, update speech/silence counters in store
3. When trigger condition met (`silence >= 2s && speech >= 3s` OR `speech >= 20s`):
   - Set pipeline phase to `"transcribing"`
   - Run Moonshine STT via Cactus on accumulated audio buffer
   - Flush audio buffer (zero bytes, drop reference)
   - Call `onTranscriptReady` callback with transcript text
   - Set pipeline phase to `"reviewing"`
4. `stopListening()` — stops recording, releases mic

**Does NOT do:**
- Extraction (that's Agent 2)
- UI rendering (that's Agent 3)
- Decide what to do with the transcript (orchestrator handles routing)

**Store interactions:**
- Writes: `pipelinePhase`, `speechSeconds`, `silenceSeconds`, `currentTranscript`
- Reads: `modelsLoaded`

**Components:**

```typescript
// src/components/audio/RecordingIndicator.tsx
// Red dot + animated waveform when listening
// Shows "Transcribing..." during STT
// Reads pipelinePhase from store

// src/components/audio/TranscriptReviewSheet.tsx
// Bottom sheet that slides up when transcript is ready
// Shows raw transcript text, editable TextInput
// "Confirm" button to proceed with current/edited text
// Auto-proceeds after 5 seconds if no edit (show countdown)
// Calls store.editCurrentTranscript() on edit
// Calls provided onConfirm(editedText) callback when confirmed
```

---

### Section 2: Extraction Engine

**Owner:** Agent 2
**Directory:** `src/services/extraction.ts`, `src/services/toolSchema.ts`

**Responsibility:** Gemma 4 model lifecycle, tool calling for entity extraction, JSON fallback parsing, delta merge coordination.

**Exposes:**

```typescript
// src/services/extraction.ts

export class ExtractionEngine {
  constructor();

  // Model lifecycle
  downloadModels(onProgress: (model: string, progress: number) => void): Promise<void>;
  loadModels(): Promise<void>;
  isReady(): boolean;
  destroy(): Promise<void>;

  // Extraction
  extractFromTranscript(
    transcript: string,
    currentFields: IntakeSchema
  ): Promise<Partial<Record<keyof IntakeSchema, any>> | null>;

  // Vision extraction
  extractFromImage(
    imagePath: string,
    currentFields: IntakeSchema
  ): Promise<Partial<Record<keyof IntakeSchema, any>> | null>;
}
```

**Behavior:**

`extractFromTranscript`:
1. Build messages array with system prompt + already-extracted fields + new transcript
2. Call `cactusLM.complete()` with messages and tool schema
3. Parse response:
   - Stage 1: Check `result.functionCalls` for `update_intake_fields`
   - Stage 2: Try `JSON.parse(result.response)` as fallback
   - If both fail: return `null` (cycle skipped, no harm)
4. Return delta object (only newly extracted fields)

`extractFromImage`:
1. Call `cactusLM.complete()` with vision system prompt, image path, and same tool schema
2. Same parsing logic as transcript extraction
3. Return delta object

**Does NOT do:**
- Audio capture (that's Agent 1)
- Merge delta into store (orchestrator calls `store.mergeFields()`)
- UI rendering (that's Agent 3)

**Key files:**

```typescript
// src/services/toolSchema.ts
// The CactusLMTool definition for update_intake_fields
// 20 properties, all optional, flat structure

// src/services/prompts.ts
// SYSTEM_PROMPT for voice extraction (~100 tokens)
// VISION_SYSTEM_PROMPT for document extraction
// buildExtractionMessages() helper

// src/services/parseToolCall.ts
// tryParseToolCall(result: CompleteResult): delta | null
// 2-stage fallback (functionCalls → JSON.parse)
```

---

### Section 3: UI & Form

**Owner:** Agent 3
**Directory:** `src/components/form/`, `src/screens/IntakeSessionScreen.tsx`

**Responsibility:** Intake form rendering, field state visualization (grey/amber/green), section grouping, field interactions (confirm, edit, unlock), completion bar.

**Exposes:** React components only (no hooks, no services).

**Components:**

```typescript
// src/components/form/IntakeForm.tsx
// Main scrollable form component
// Groups fields by section using FIELD_METADATA
// Renders SectionHeader + FormField for each

// src/components/form/SectionHeader.tsx
// Section title (e.g., "Demographics", "Housing")
// Small caps, muted color, generous top margin
// Shows section completion (e.g., "3/6")

// src/components/form/FormField.tsx
// Single field row
// Props: fieldMeta, fieldState (IntakeField)
// Visual states:
//   empty:     grey background, placeholder text, muted
//   inferred:  amber left border, subtle pulse animation, value shown
//   confirmed: green left border, check icon, value shown, slightly muted
// Tap behavior:
//   inferred → calls store.confirmField(key)
//   confirmed → calls store.unlockField(key), shows edit input

// src/components/form/CompletionBar.tsx
// Bottom bar showing overall progress
// Animated fill bar (percentage of non-empty fields)
// "Confirm All" button (confirms all inferred → confirmed)
// "Generate Plan" button (disabled until >= 60% or manual override)

// src/components/form/FieldEditor.tsx
// Inline editor that appears when a confirmed field is tapped
// Text input for text/number fields
// Picker for enum fields
// Toggle for boolean fields
// "Save" confirms edit, field goes back to inferred (amber)
```

**Design tokens** (reads from `src/theme/index.ts`):

```typescript
// src/theme/index.ts

export const theme = {
  colors: {
    // Field states
    fieldEmpty: "#F3F4F6",          // soft grey background
    fieldEmptyBorder: "#E5E7EB",
    fieldInferred: "#FFFBEB",       // warm amber background
    fieldInferredBorder: "#F59E0B",
    fieldInferredAccent: "#D97706",
    fieldConfirmed: "#ECFDF5",      // soft green background
    fieldConfirmedBorder: "#10B981",
    fieldConfirmedAccent: "#059669",

    // UI
    background: "#FFFFFF",
    surface: "#F9FAFB",
    textPrimary: "#111827",
    textSecondary: "#6B7280",
    textMuted: "#9CA3AF",
    accent: "#3B82F6",
    danger: "#EF4444",
    dangerLight: "#FEE2E2",

    // Risk score
    riskLow: "#10B981",
    riskMedium: "#F59E0B",
    riskHigh: "#EF4444",
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  radii: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },

  typography: {
    // Uses system font (SF Pro on iOS)
    h1: { fontSize: 28, fontWeight: "700" as const, letterSpacing: -0.5 },
    h2: { fontSize: 22, fontWeight: "600" as const, letterSpacing: -0.3 },
    h3: { fontSize: 17, fontWeight: "600" as const },
    body: { fontSize: 15, fontWeight: "400" as const },
    caption: { fontSize: 13, fontWeight: "500" as const, letterSpacing: 0.5 },
    sectionHeader: { fontSize: 12, fontWeight: "600" as const, letterSpacing: 1, textTransform: "uppercase" as const },
  },

  shadows: {
    card: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    elevated: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 4,
    },
  },
};
```

**Does NOT do:**
- Audio capture or STT (Agent 1)
- LLM extraction (Agent 2)
- Cloud API calls (Agent 5)

**Store interactions:**
- Reads: `intake`, `pipelinePhase`, `transcriptLog`
- Writes: `confirmField`, `confirmAllFields`, `editField`, `unlockField`

---

### Section 4: Document Scanner

**Owner:** Agent 4
**Directory:** `src/components/scanner/`, `src/screens/DocumentScanScreen.tsx`

**Responsibility:** Camera capture, image handling, vision extraction trigger, image cleanup.

**Exposes:**

```typescript
// src/screens/DocumentScanScreen.tsx
// Full-screen camera view
// Capture button
// After capture:
//   - Show captured image preview
//   - Call ExtractionEngine.extractFromImage()
//   - Show extracted fields preview
//   - "Accept" → merge into store, delete image, navigate back
//   - "Retake" → delete image, reopen camera
//   - "Cancel" → delete image, navigate back

// src/components/scanner/CaptureButton.tsx
// Large circular button with camera icon
// Disabled during processing

// src/components/scanner/ExtractionPreview.tsx
// Shows which fields were extracted from the document
// Each field shown as a chip: "First Name: Maria" with amber styling
// Allows deselecting fields before accepting
```

**Behavior:**
1. Open camera via RN camera library
2. User taps capture → save image to temp directory
3. Pass temp image path to `ExtractionEngine.extractFromImage()`
4. Show extracted fields in preview
5. On accept: call `store.mergeFields(delta, "vision")`, then `fs.unlink(tempImagePath)`
6. On retake/cancel: `fs.unlink(tempImagePath)`, no merge

**Privacy guarantee:** Image exists only as a temp file during processing. Deleted immediately after extraction completes or user cancels. No thumbnails, no cache.

**Does NOT do:**
- Run the extraction model (calls Agent 2's ExtractionEngine)
- Render the intake form (Agent 3)
- Cloud handoff (Agent 5)

**Store interactions:**
- Reads: `intake` (passes to extraction engine for context)
- Writes: `mergeFields` (via accept action), `pipelinePhase` (set to "scanning" during processing)

---

### Section 5: Cloud & Sanitization

**Owner:** Agent 5
**Directory:** `src/services/sanitization.ts`, `src/services/gemini.ts`, `src/screens/ResourcePlanScreen.tsx`, `src/components/cloud/`

**Responsibility:** PII stripping, Gemini API integration, resource plan display.

**Exposes:**

```typescript
// src/services/sanitization.ts

export function sanitizeIntake(intake: IntakeSchema): SanitizedPayload;
// Strips: names, DOB (keep year only), phone, address
// Buckets: income into $500 ranges
// Keeps: all categorical/enum fields, booleans, counts

// src/services/gemini.ts

export async function generateResourcePlan(
  sanitized: SanitizedPayload,
  apiKey: string
): Promise<CloudAnalysis>;
// POST to Gemini 2.5 Flash API
// Returns parsed CloudAnalysis
// Throws on network error or parse failure
```

**Screen:**

```typescript
// src/screens/ResourcePlanScreen.tsx
// Receives CloudAnalysis via navigation params or reads from store
//
// Layout:
// - Risk Score badge (large number, color-coded circle)
// - Risk Factors list (red chips)
// - Protective Factors list (green chips)
// - 30-Day Timeline (vertical timeline with day markers)
// - Program Matches (cards with likelihood badges)
// - "New Case" button → resets session, navigates to IntakeSession
```

**Components:**

```typescript
// src/components/cloud/RiskScoreBadge.tsx
// Large circular badge: number 0-100
// Color: green (0-33), amber (34-66), red (67-100)

// src/components/cloud/TimelineView.tsx
// Vertical timeline with day markers and action items
// Each entry: day number, action text, category icon

// src/components/cloud/ProgramMatchCard.tsx
// Card with program name, likelihood badge, reason text
```

**Offline handling:**
- Check connectivity before API call
- If offline: set `cloudStatus` to `"queued"`, save sanitized payload to AsyncStorage
- Show "Will generate when connected"
- On app foreground + connectivity restored: retry queued payload

**Does NOT do:**
- Audio (Agent 1)
- Extraction (Agent 2)
- Form UI (Agent 3)
- Camera (Agent 4)

**Store interactions:**
- Reads: `intake` (to sanitize), `cloudStatus`
- Writes: `cloudStatus`, `cloudResult`

---

## 7. Orchestration

The orchestrator ties all sections together. It lives in `IntakeSessionScreen.tsx` and coordinates the pipeline.

```typescript
// src/screens/IntakeSessionScreen.tsx (orchestration logic)

// This is the main screen that composes Agent 1-3-5 components
// and coordinates the pipeline flow.

function IntakeSessionScreen() {
  const audioPipeline = useAudioPipeline();
  const extractionEngine = useRef(new ExtractionEngine());
  const store = useAppStore();

  // Pipeline orchestration
  const handleTranscriptConfirmed = async (editedText: string) => {
    store.setPipelinePhase("extracting");

    const delta = await extractionEngine.current.extractFromTranscript(
      editedText,
      store.intake
    );

    if (delta) {
      store.mergeFields(delta, "voice");
    }

    store.commitTranscript({
      id: uuid(),
      rawText: store.currentTranscript!,
      editedText,
      wasEdited: editedText !== store.currentTranscript,
      timestamp: Date.now(),
      fieldsExtracted: delta ? Object.keys(delta) : [],
    });

    store.clearCurrentTranscript();
    store.setPipelinePhase("listening");
    // Audio pipeline auto-resumes
  };

  const handleGeneratePlan = async () => {
    const sanitized = sanitizeIntake(store.intake);
    store.setCloudStatus("sending");

    try {
      const result = await generateResourcePlan(sanitized, GEMINI_API_KEY);
      store.setCloudResult(result);
      store.setCloudStatus("complete");
      navigation.navigate("ResourcePlan");
    } catch (e) {
      store.setCloudStatus("error");
    }
  };

  // Render: compose components from agents 1, 3, 5
  return (
    <SafeAreaView>
      <RecordingIndicator />
      <TranscriptReviewSheet onConfirm={handleTranscriptConfirmed} />
      <IntakeForm />
      <CompletionBar onGeneratePlan={handleGeneratePlan} />
    </SafeAreaView>
  );
}
```

---

## 8. Screen Flow

```
App Launch
  │
  ├─ Models not downloaded → Download Screen (progress bars for VAD, STT, LLM)
  │                              │
  │                              └─ All downloaded → Intake Session
  │
  └─ Models already cached → Intake Session
                                │
                                ├─ Voice loop runs (listen → transcribe → review → extract → repeat)
                                │
                                ├─ "Scan Doc" tapped → Document Scan Screen
                                │     │
                                │     └─ Accept/Cancel → back to Intake Session
                                │
                                └─ "Generate Plan" tapped → Sanitize → Gemini API → Resource Plan Screen
                                      │
                                      └─ "New Case" → Reset session → Intake Session
```

---

## 9. Error Handling

| Scenario | Response |
|---|---|
| Mic permission denied | Show permission request modal. Cannot proceed without mic. |
| STT produces garbage | Transcript shown to user — they edit or skip. |
| VAD misses speech end | Force-trigger at 20s catches it. |
| Gemma 4 returns no tool call | Try JSON parse fallback. If both fail, skip cycle. Previous state persists. |
| Gemma 4 hallucinates a value | Appears as amber. User sees it, doesn't confirm. Stays amber or gets corrected. |
| Gemma 4 contradicts prior extraction | If amber: update. If green (confirmed): ignore — human takes priority. |
| Model fails to load (memory) | Show error: "Close other apps and try again." |
| Camera permission denied | Show permission request. Scan Doc disabled. |
| Gemini API unreachable | Status: "queued". Payload saved. Retry when online. |
| Gemini returns malformed data | Show raw text: "Could not parse plan." |
| App backgrounded during recording | Stop recording, save state. Resume on foreground. |
| Demo catastrophe | Form is manually fillable by tapping fields. AI is accelerator, not gate. |

---

## 10. Privacy Guarantees

| Data Type | On Device | Sent to Cloud |
|---|---|---|
| Raw audio | In-memory ring buffer only. Flushed every cycle. Never written to disk. | Never |
| Document images | Temp file during processing. Deleted immediately after. | Never |
| Transcript text | Kept in-memory as text log. | Never |
| Extracted fields (with PII) | In-memory Zustand store. | Never |
| Sanitized fields (no PII) | Created on-demand for cloud handoff. | Yes — to Gemini only, on user action |
| Cloud analysis results | Stored in-memory for display. | Received from Gemini |

**Architectural enforcement:**
- No `fs.writeFile` for audio anywhere in codebase
- Image paths use temp directory + immediate `fs.unlink`
- No analytics, no telemetry, no crash reporting that captures state
- Sanitization function is the ONLY path to cloud — enforced by code structure

---

## 11. Demo Script (90 seconds)

**Setup:** iPhone on table or hand-held, screen-mirrored to projector.

```
[0:00-0:10] THE HOOK
"Intake for a displaced family takes 45 minutes of rigid forms.
The caseworker types while the person talks. What if the form
just listened?"
→ Show empty form, all fields grey

[0:10-0:30] ROUND 1
Person speaks: "We got evicted about six weeks ago from our apartment.
It's me and my two kids, they're 4 and 7. We've been staying with my
sister but she says we gotta go by Friday."
→ Transcript appears, auto-confirms after 5s
→ Fields animate to amber: housing_status, homelessness_duration, family_size,
  children_ages, eviction_status, timeline_urgency
→ Worker taps to confirm — fields go green

[0:30-0:45] ROUND 2
"I was doing part-time at the grocery store, about twelve hundred a month.
I'm on SNAP and the kids have Medicaid."
→ More fields fill: employment, income, benefits

[0:45-0:55] DOCUMENT SCAN
"Let me scan your ID." → Camera → snap → fields fill → "Image deleted."

[0:55-1:05] CONFIRMATION
Tap "Confirm All" → all amber → green. 75% complete.

[1:05-1:20] CLOUD HANDOFF
Tap "Generate Plan" → "Sanitizing... Names redacted, address redacted..."
→ Risk Score: 82 (HIGH)
→ 30-day timeline appears
→ Program matches: TANF, SNAP, EHV

[1:20-1:30] CLOSE
"45 minutes of forms, done in 90 seconds. Audio never persisted.
No cloud saw a name or address. Built on Gemma 4 and Cactus."
```

---

## 12. Verification Plan

1. **Audio pipeline**: Speak → see transcript appear → verify text matches speech
2. **Transcript editing**: Intentionally garbled STT → edit → verify corrected text goes to extraction
3. **Extraction accuracy**: Compare extracted fields vs. spoken content for 5 sample dialogues
4. **Field state machine**: Verify grey→amber→green transitions, confirm/unlock/edit flows
5. **Document scanning**: Snap a mock ID card → verify name/DOB extracted → verify image deleted (`ls` temp dir)
6. **Sanitization**: Print sanitized payload → verify no names, no phone, no address, income bucketed
7. **Cloud handoff**: Trigger generate plan → verify risk score + timeline appear
8. **Offline**: Toggle airplane mode → verify form works, cloud shows "queued"
9. **Privacy**: After full session, verify: no audio files on disk, no images on disk, no PII in logs
10. **Demo rehearsal**: Run full 90-second script 3 times → fix any crashes or timing issues
