# Crisis Intake Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a React Native iOS app that turns natural conversation into structured housing intake data on-device using Gemma 4 on Cactus.

**Architecture:** Pure on-device. iPhone 15 Pro+. Cactus runs Silero VAD + Moonshine STT + Gemma 4 E2B sequentially. Zustand global store. React Navigation stack. Optional Gemini cloud for sanitized analytics.

**Tech Stack:** React Native (TypeScript), Cactus React Native SDK, Zustand, React Navigation, Gemini 2.5 Flash REST API

**Design Spec:** `docs/superpowers/specs/2026-04-18-crisis-intake-design.md`

---

## Build Order

```
Task 1: CLAUDE.md + AGENTS.md
Task 2: React Native project init + dependencies
Task 3: Shared types (intake, transcript, cloud, sanitized)
Task 4: Theme constants
Task 5: Utility functions (mergeFields, createEmptyIntake)
Task 6: Zustand store
Task 7: Navigation + screen shells
Task 8: Verify skeleton builds on iOS simulator
Task 9: Commit skeleton
─── SKELETON COMPLETE ───
─── Agents 1-5 can work in parallel from here ───
Task 10-13: Agent 1 — Audio Pipeline
Task 14-18: Agent 2 — Extraction Engine
Task 19-24: Agent 3 — UI & Form
Task 25-28: Agent 4 — Document Scanner
Task 29-33: Agent 5 — Cloud & Sanitization
Task 34: Orchestrator — wire everything in IntakeSessionScreen
Task 35: End-to-end verification
```

---

## Task 1: Create CLAUDE.md and AGENTS.md

**Files:**
- Create: `CrisisIntake/CLAUDE.md`
- Create: `CrisisIntake/AGENTS.md`

**Step 1: Write CLAUDE.md**

```markdown
# Crisis Intake — Project Standards

## What This Is
A React Native iOS app for voice-driven housing intake. Field workers have a natural conversation with displaced individuals; the app extracts structured data on-device via Gemma 4 on Cactus.

## Tech Stack
- React Native (TypeScript), iOS only (iPhone 15 Pro+)
- Cactus React Native SDK (`cactus-react-native` + `react-native-nitro-modules`)
- Zustand for state management
- React Navigation (stack navigator)
- Gemini 2.5 Flash REST API (cloud, optional)

## Architecture Rules
1. **Single Zustand store** — all state lives in `src/store/useAppStore.ts`. No local component state for shared data. Import `useAppStore` and use selectors.
2. **STT and LLM never run simultaneously** — they share device compute. Enforce sequential execution. Pipeline phases: idle → listening → transcribing → reviewing → extracting → listening.
3. **Audio never persists to disk** — ring buffer is in-memory only. Flushed after every STT pass. No `fs.writeFile` for audio. No temp audio files.
4. **Images are ephemeral** — temp file only during vision processing. `fs.unlink()` immediately after extraction or cancel.
5. **Confirmed fields are sacred** — LLM extraction NEVER overwrites a field with status `"confirmed"`. Only human action can unlock it.
6. **Sanitization is the only path to cloud** — `sanitizeIntake()` is the ONLY function that prepares data for Gemini. No other code sends data externally.

## Coding Standards
- TypeScript strict mode. No `any` except in delta merge (extraction output is dynamic).
- All components use the theme from `src/theme/index.ts`. No hardcoded colors, spacing, or font sizes.
- Use `theme.colors.fieldEmpty`, `theme.colors.fieldInferred`, `theme.colors.fieldConfirmed` for field states. Never raw hex values.
- Components go in `src/components/<section>/`. Screens go in `src/screens/`.
- Services (non-React, pure logic) go in `src/services/`. Hooks go in `src/hooks/`.
- Shared types go in `src/types/`. Do NOT duplicate type definitions — import from there.
- Modern iOS design: cards with 12-16px radii, subtle shadows, SF Pro system font, generous spacing, smooth animations. Not a government form from 2008.

## Store Convention
- Read state with selectors: `const phase = useAppStore(s => s.pipelinePhase)`
- Call actions directly: `useAppStore.getState().confirmField("client_first_name")`
- Never destructure the entire store. Use granular selectors to prevent unnecessary re-renders.

## File Ownership
- `src/hooks/useAudioPipeline.ts`, `src/components/audio/` — Agent 1 (Audio Pipeline)
- `src/services/extraction.ts`, `src/services/toolSchema.ts`, `src/services/prompts.ts`, `src/services/parseToolCall.ts` — Agent 2 (Extraction Engine)
- `src/components/form/`, `src/screens/IntakeSessionScreen.tsx` — Agent 3 (UI & Form)
- `src/components/scanner/`, `src/screens/DocumentScanScreen.tsx` — Agent 4 (Document Scanner)
- `src/services/sanitization.ts`, `src/services/gemini.ts`, `src/screens/ResourcePlanScreen.tsx`, `src/components/cloud/` — Agent 5 (Cloud & Sanitization)

## Do NOT
- Add analytics, telemetry, or crash reporting
- Write audio to disk for any reason
- Send unsanitized data to any external service
- Use Context API or Redux — Zustand only
- Create new type files — use existing ones in `src/types/`
- Hardcode colors or spacing — use theme
- Add features not in the design spec
```

**Step 2: Write AGENTS.md**

```markdown
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
- Amber fields have a subtle pulse animation (opacity 0.8 ↔ 1.0, 2s loop).
- Tap inferred → confirm (green). Tap confirmed → unlock + show editor (amber).
- "Confirm All" sets all inferred → confirmed. "Generate Plan" is disabled until >= 60% fields non-empty.

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
```

**Step 3: Commit**

```bash
git add CrisisIntake/CLAUDE.md CrisisIntake/AGENTS.md
git commit -m "docs: add CLAUDE.md and AGENTS.md for agent coordination"
```

---

## Task 2: Initialize React Native Project + Dependencies

**Files:**
- Create: `CrisisIntake/` (entire RN project)

**Step 1: Create the React Native project**

```bash
cd /Users/sachin/Desktop/Codes/yc-hackathon
npx @react-native-community/cli init CrisisIntake --template react-native-template-typescript
```

**Step 2: Install core dependencies**

```bash
cd CrisisIntake
npm install cactus-react-native react-native-nitro-modules
npm install zustand
npm install @react-navigation/native @react-navigation/stack
npm install react-native-screens react-native-safe-area-context react-native-gesture-handler
```

**Step 3: Install iOS pods**

```bash
cd ios && pod install && cd ..
```

**Step 4: Verify it builds**

```bash
npx react-native run-ios --simulator="iPhone 15 Pro"
```

Expected: Default RN welcome screen on simulator.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: initialize React Native project with core dependencies"
```

---

## Task 3: Shared Types

**Files:**
- Create: `CrisisIntake/src/types/intake.ts`
- Create: `CrisisIntake/src/types/transcript.ts`
- Create: `CrisisIntake/src/types/cloud.ts`
- Create: `CrisisIntake/src/types/sanitized.ts`

**Step 1: Write all type files**

Copy the exact type definitions from the design spec sections 4.1 through 4.6:
- `intake.ts` — `FieldStatus`, `IntakeField<T>`, `IntakeSchema`, `FieldMeta`, `FIELD_METADATA`
- `transcript.ts` — `TranscriptEntry`
- `cloud.ts` — `CloudAnalysis`, `TimelineEntry`, `ProgramMatch`
- `sanitized.ts` — `SanitizedPayload`

All types are defined in the design spec verbatim. Copy them exactly.

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/types/
git commit -m "feat: add shared type definitions for intake, transcript, cloud, sanitized"
```

---

## Task 4: Theme Constants

**Files:**
- Create: `CrisisIntake/src/theme/index.ts`

**Step 1: Write theme file**

Copy the exact theme object from design spec section 6 (Section 3: UI & Form, design tokens). Includes:
- `colors` — field states (empty/inferred/confirmed), UI colors, risk score colors
- `spacing` — xs through xxl
- `radii` — sm through full
- `typography` — h1 through sectionHeader
- `shadows` — card, elevated

**Step 2: Commit**

```bash
git add src/theme/
git commit -m "feat: add theme constants for consistent styling"
```

---

## Task 5: Utility Functions

**Files:**
- Create: `CrisisIntake/src/utils/mergeFields.ts`
- Create: `CrisisIntake/src/utils/createEmptyIntake.ts`

**Step 1: Write mergeFields.ts**

Copy from design spec section 4.3. The `mergeExtractedFields` function that:
- Iterates delta entries
- Skips null/undefined/empty values
- NEVER overwrites confirmed fields
- Sets new values to status `"inferred"`

**Step 2: Write createEmptyIntake.ts**

```typescript
import { IntakeSchema, IntakeField, FIELD_METADATA } from "../types/intake";

function emptyField<T>(): IntakeField<T> {
  return { value: null, status: "empty", lastUpdatedAt: 0, source: null };
}

export function createEmptyIntake(): IntakeSchema {
  const intake = {} as IntakeSchema;
  for (const meta of FIELD_METADATA) {
    (intake as any)[meta.key] = emptyField();
  }
  return intake;
}
```

**Step 3: Commit**

```bash
git add src/utils/
git commit -m "feat: add mergeFields and createEmptyIntake utilities"
```

---

## Task 6: Zustand Store

**Files:**
- Create: `CrisisIntake/src/store/useAppStore.ts`

**Step 1: Write the store**

Implement the full `AppState` interface from design spec section 5. All actions must be implemented (not stubbed). Key implementations:

- `mergeFields` — calls `mergeExtractedFields` from utils
- `confirmField` — sets field status to `"confirmed"`
- `confirmAllFields` — iterates all fields, sets any `"inferred"` to `"confirmed"`
- `editField` — sets value and status to `"inferred"`, source to `"manual"`
- `unlockField` — sets status from `"confirmed"` back to `"inferred"`
- `getCompletionPercentage` — count non-empty fields / total fields * 100
- `getFieldsBySection` — filter FIELD_METADATA by section, pair with current field values
- `resetSession` — generate new sessionId, reset intake to `createEmptyIntake()`, clear transcript log, reset cloud state

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/store/
git commit -m "feat: add Zustand store with all state and actions"
```

---

## Task 7: Navigation + Screen Shells

**Files:**
- Create: `CrisisIntake/src/screens/IntakeSessionScreen.tsx`
- Create: `CrisisIntake/src/screens/DocumentScanScreen.tsx`
- Create: `CrisisIntake/src/screens/ResourcePlanScreen.tsx`
- Modify: `CrisisIntake/src/App.tsx`

**Step 1: Write screen shells**

Each screen is a minimal placeholder:

```typescript
// IntakeSessionScreen.tsx
import React from "react";
import { View, Text, SafeAreaView } from "react-native";
import { theme } from "../theme";

export function IntakeSessionScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={theme.typography.h2}>Intake Session</Text>
      </View>
    </SafeAreaView>
  );
}
```

Same pattern for DocumentScanScreen and ResourcePlanScreen.

**Step 2: Write App.tsx with navigation**

```typescript
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { IntakeSessionScreen } from "./screens/IntakeSessionScreen";
import { DocumentScanScreen } from "./screens/DocumentScanScreen";
import { ResourcePlanScreen } from "./screens/ResourcePlanScreen";

export type RootStackParamList = {
  IntakeSession: undefined;
  DocumentScan: undefined;
  ResourcePlan: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="IntakeSession"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="IntakeSession" component={IntakeSessionScreen} />
        <Stack.Screen name="DocumentScan" component={DocumentScanScreen} />
        <Stack.Screen name="ResourcePlan" component={ResourcePlanScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

**Step 3: Commit**

```bash
git add src/screens/ src/App.tsx
git commit -m "feat: add navigation and screen shells"
```

---

## Task 8: Create Directory Structure + Verify Build

**Files:**
- Create: `CrisisIntake/src/services/.gitkeep`
- Create: `CrisisIntake/src/hooks/.gitkeep`
- Create: `CrisisIntake/src/components/audio/.gitkeep`
- Create: `CrisisIntake/src/components/form/.gitkeep`
- Create: `CrisisIntake/src/components/scanner/.gitkeep`
- Create: `CrisisIntake/src/components/cloud/.gitkeep`

**Step 1: Create empty directories**

```bash
mkdir -p src/services src/hooks src/components/audio src/components/form src/components/scanner src/components/cloud
touch src/services/.gitkeep src/hooks/.gitkeep src/components/audio/.gitkeep src/components/form/.gitkeep src/components/scanner/.gitkeep src/components/cloud/.gitkeep
```

**Step 2: Verify full build on iOS simulator**

```bash
npx react-native run-ios --simulator="iPhone 15 Pro"
```

Expected: App launches showing "Intake Session" text centered on screen. Navigation works (no crashes).

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: add directory structure for agent sections"
```

---

## Task 9: Final Skeleton Commit

**Step 1: Verify all files exist**

```bash
ls -R src/
```

Expected structure matches the design spec section 6 (Section 0: Skeleton).

**Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Tag the skeleton**

```bash
git tag skeleton-complete
```

---

## ─── SKELETON COMPLETE ───

From here, Agents 1-5 work in parallel on separate branches. Each agent should:
1. Create a branch: `git checkout -b agent-N-section-name`
2. Read `CLAUDE.md` and `AGENTS.md` before writing any code
3. Only modify files in their owned directories
4. Import shared types from `src/types/`
5. Use theme from `src/theme/`
6. Read/write store via `useAppStore`
7. Open a PR when done

---

## Tasks 10-13: Agent 1 — Audio Pipeline

**Branch:** `agent-1-audio-pipeline`

### Task 10: useAudioPipeline Hook — Core Structure

**Files:**
- Create: `src/hooks/useAudioPipeline.ts`

**Step 1: Write the hook shell**

```typescript
import { useRef, useCallback, useState } from "react";
import { useAppStore } from "../store/useAppStore";

export function useAudioPipeline() {
  const [isListening, setIsListening] = useState(false);
  const ringBuffer = useRef<Int16Array>(new Int16Array(0));
  const callbackRef = useRef<((transcript: string) => void) | null>(null);
  const speechSeconds = useAppStore(s => s.speechSeconds);
  const silenceSeconds = useAppStore(s => s.silenceSeconds);

  const startListening = useCallback(async () => {
    // TODO: Request mic permission
    // TODO: Initialize Cactus STT + VAD models
    // TODO: Start recording PCM 16kHz mono
    // TODO: On each 1s chunk: run VAD, update counters
    // TODO: On trigger condition: run STT, flush buffer, call callback
    setIsListening(true);
    useAppStore.getState().setPipelinePhase("listening");
  }, []);

  const stopListening = useCallback(() => {
    // TODO: Stop recording, release mic
    setIsListening(false);
    useAppStore.getState().setPipelinePhase("idle");
  }, []);

  const onTranscriptReady = useCallback((cb: (transcript: string) => void) => {
    callbackRef.current = cb;
  }, []);

  return { isListening, speechSeconds, silenceSeconds, startListening, stopListening, onTranscriptReady };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useAudioPipeline.ts
git commit -m "feat(audio): add useAudioPipeline hook shell"
```

### Task 11: Implement Audio Capture + Ring Buffer + VAD

**Files:**
- Modify: `src/hooks/useAudioPipeline.ts`

**Step 1: Implement mic capture**

Use `cactus-react-native` audio APIs (or `react-native-audio-api` if Cactus doesn't expose raw mic capture). Record PCM 16kHz mono. Append chunks to ring buffer (max 320,000 samples = 20 seconds).

**Step 2: Implement VAD processing**

On each ~1s chunk:
- Run Silero VAD via Cactus
- If speech detected: reset silence counter, increment speech counter
- If silence detected: increment silence counter

**Step 3: Implement trigger condition**

```typescript
const shouldProcess = (silenceSeconds >= 2.0 && speechSeconds >= 3.0) || speechSeconds >= 20.0;
```

When triggered:
- Set phase to `"transcribing"`
- Run Moonshine STT on accumulated buffer
- Set `currentTranscript` in store
- Flush buffer: `ringBuffer.current = new Int16Array(0)`
- Reset counters
- Call `callbackRef.current(transcript)`
- Set phase to `"reviewing"`

**Step 4: Commit**

```bash
git commit -am "feat(audio): implement mic capture, ring buffer, VAD, and STT trigger"
```

### Task 12: RecordingIndicator Component

**Files:**
- Create: `src/components/audio/RecordingIndicator.tsx`

**Step 1: Write component**

```typescript
import React from "react";
import { View, Text, Animated } from "react-native";
import { useAppStore } from "../../store/useAppStore";
import { theme } from "../../theme";

export function RecordingIndicator() {
  const phase = useAppStore(s => s.pipelinePhase);

  // Red dot with pulse animation when listening
  // "Transcribing..." text when transcribing
  // "Extracting..." text when extracting
  // Hidden when idle

  if (phase === "idle") return null;

  return (
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      padding: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      ...theme.shadows.card,
    }}>
      {phase === "listening" && (
        <>
          <View style={{
            width: 10, height: 10,
            borderRadius: theme.radii.full,
            backgroundColor: theme.colors.danger,
            marginRight: theme.spacing.sm,
          }} />
          <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary }}>
            Listening...
          </Text>
        </>
      )}
      {phase === "transcribing" && (
        <Text style={{ ...theme.typography.caption, color: theme.colors.accent }}>
          Transcribing...
        </Text>
      )}
      {phase === "extracting" && (
        <Text style={{ ...theme.typography.caption, color: theme.colors.fieldInferredAccent }}>
          Extracting fields...
        </Text>
      )}
    </View>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/audio/RecordingIndicator.tsx
git commit -m "feat(audio): add RecordingIndicator component"
```

### Task 13: TranscriptReviewSheet Component

**Files:**
- Create: `src/components/audio/TranscriptReviewSheet.tsx`

**Step 1: Write component**

Bottom sheet that appears when `currentTranscript` is non-null. Features:
- Shows transcript text in an editable `TextInput`
- "Confirm" button to proceed
- Auto-proceed countdown (5 seconds) — shows visual countdown
- If user taps into TextInput, cancel auto-proceed
- Calls `onConfirm(editedText)` when confirmed

```typescript
import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, Animated } from "react-native";
import { useAppStore } from "../../store/useAppStore";
import { theme } from "../../theme";

interface Props {
  onConfirm: (editedText: string) => void;
}

export function TranscriptReviewSheet({ onConfirm }: Props) {
  const currentTranscript = useAppStore(s => s.currentTranscript);
  const [editedText, setEditedText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (currentTranscript) {
      setEditedText(currentTranscript);
      setIsEditing(false);
      setCountdown(5);
    }
  }, [currentTranscript]);

  useEffect(() => {
    if (!currentTranscript || isEditing) return;
    if (countdown <= 0) {
      onConfirm(editedText);
      return;
    }
    timerRef.current = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [countdown, currentTranscript, isEditing, editedText, onConfirm]);

  if (!currentTranscript) return null;

  return (
    <View style={{
      padding: theme.spacing.lg,
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.radii.xl,
      borderTopRightRadius: theme.radii.xl,
      ...theme.shadows.elevated,
    }}>
      <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted, marginBottom: theme.spacing.sm }}>
        TRANSCRIPT
      </Text>
      <TextInput
        value={editedText}
        onChangeText={setEditedText}
        onFocus={() => setIsEditing(true)}
        multiline
        style={{
          ...theme.typography.body,
          color: theme.colors.textPrimary,
          backgroundColor: theme.colors.background,
          borderRadius: theme.radii.md,
          padding: theme.spacing.md,
          minHeight: 60,
          marginBottom: theme.spacing.md,
        }}
      />
      <TouchableOpacity
        onPress={() => onConfirm(editedText)}
        style={{
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radii.md,
          padding: theme.spacing.md,
          alignItems: "center",
        }}
      >
        <Text style={{ ...theme.typography.h3, color: "#FFFFFF" }}>
          {isEditing ? "Confirm Edit" : `Confirm (${countdown}s)`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/audio/TranscriptReviewSheet.tsx
git commit -m "feat(audio): add TranscriptReviewSheet with auto-proceed and editing"
```

---

## Tasks 14-18: Agent 2 — Extraction Engine

**Branch:** `agent-2-extraction-engine`

### Task 14: Tool Schema Definition

**Files:**
- Create: `src/services/toolSchema.ts`

**Step 1: Write tool schema**

```typescript
import { CactusLMTool } from "cactus-react-native";

export const INTAKE_TOOL: CactusLMTool = {
  name: "update_intake_fields",
  description: "Update intake form fields with extracted data from conversation",
  parameters: {
    type: "object",
    properties: {
      client_first_name: { type: "string", description: "Client first name" },
      client_last_name: { type: "string", description: "Client last name" },
      date_of_birth: { type: "string", description: "Date of birth YYYY-MM-DD" },
      gender: { type: "string", description: "male|female|nonbinary|other" },
      primary_language: { type: "string", description: "Primary language spoken" },
      phone_number: { type: "string", description: "Phone number" },
      family_size_adults: { type: "number", description: "Number of adults in household" },
      family_size_children: { type: "number", description: "Number of children" },
      children_ages: { type: "string", description: "Children ages comma-separated" },
      current_address: { type: "string", description: "Current or last known address" },
      housing_status: { type: "string", description: "housed|at_risk|homeless|shelter|doubled_up|fleeing_dv" },
      homelessness_duration_days: { type: "number", description: "Days experiencing homelessness" },
      eviction_status: { type: "string", description: "none|notice|filed|judgment" },
      employment_status: { type: "string", description: "full_time|part_time|unemployed|disabled|retired" },
      income_amount: { type: "number", description: "Income amount as number" },
      income_frequency: { type: "string", description: "weekly|biweekly|monthly|annual" },
      benefits_receiving: { type: "string", description: "Benefits comma-separated: SNAP,TANF,SSI,Medicaid,Section8,WIC" },
      has_disability: { type: "boolean", description: "Has a disability" },
      safety_concern_flag: { type: "boolean", description: "Safety concern present (DV, trafficking, danger)" },
      timeline_urgency: { type: "string", description: "immediate|within_week|within_month|flexible" },
      transcript_summary: { type: "string", description: "One sentence summary of what was discussed" },
    },
    required: [],
  },
};
```

**Step 2: Commit**

```bash
git add src/services/toolSchema.ts
git commit -m "feat(extraction): add intake tool schema for Gemma 4 function calling"
```

### Task 15: System Prompts

**Files:**
- Create: `src/services/prompts.ts`

**Step 1: Write prompts**

```typescript
import { IntakeSchema } from "../types/intake";

export const VOICE_SYSTEM_PROMPT = `You are a housing intake extraction engine. Extract structured data from the transcript of a conversation between a field worker and a displaced individual seeking housing assistance.

Output ONLY a tool call to update_intake_fields with fields you can extract. If you cannot extract a field, omit it. Never fabricate data. If the speaker corrects themselves, use the correction.`;

export const VISION_SYSTEM_PROMPT = `You are a document data extraction engine for housing intake. Extract all visible fields from this document and map them to intake fields.
For IDs: extract name, DOB, address, gender.
For insurance cards: extract benefits type.
For eviction notices: extract address, eviction status, dates.
For benefit letters: extract program type (SNAP, SSI, TANF, etc).`;

export function buildExtractionMessages(
  transcript: string,
  currentFields: IntakeSchema
): Array<{ role: "user"; content: string }> {
  const populated: Record<string, any> = {};
  for (const [key, field] of Object.entries(currentFields)) {
    if (field.value !== null && field.value !== undefined && field.value !== "") {
      populated[key] = field.value;
    }
  }

  const context = `Already extracted (do not re-extract unless corrected):
${Object.keys(populated).length > 0 ? JSON.stringify(populated) : "Nothing yet."}

New transcript segment:
"${transcript}"

Extract any NEW fields or CORRECTIONS from this segment.`;

  return [{ role: "user", content: context }];
}
```

**Step 2: Commit**

```bash
git add src/services/prompts.ts
git commit -m "feat(extraction): add system prompts and message builder"
```

### Task 16: Tool Call Parser

**Files:**
- Create: `src/services/parseToolCall.ts`

**Step 1: Write parser with 2-stage fallback**

```typescript
import { IntakeSchema } from "../types/intake";

interface CompleteResult {
  response: string;
  functionCalls?: Array<{ name: string; arguments: Record<string, any> }>;
}

export function tryParseToolCall(
  result: CompleteResult
): Partial<Record<keyof IntakeSchema, any>> | null {
  // Stage 1: Check functionCalls
  if (result.functionCalls && result.functionCalls.length > 0) {
    for (const call of result.functionCalls) {
      if (call.name === "update_intake_fields") {
        return call.arguments as Partial<Record<keyof IntakeSchema, any>>;
      }
    }
  }

  // Stage 2: Try parsing response text as JSON
  try {
    const parsed = JSON.parse(result.response);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Partial<Record<keyof IntakeSchema, any>>;
    }
  } catch {
    // Not valid JSON
  }

  // Both stages failed — skip this cycle
  return null;
}
```

**Step 2: Commit**

```bash
git add src/services/parseToolCall.ts
git commit -m "feat(extraction): add 2-stage tool call parser with JSON fallback"
```

### Task 17: ExtractionEngine Class

**Files:**
- Create: `src/services/extraction.ts`

**Step 1: Write the class**

```typescript
import { CactusLM } from "cactus-react-native";
import { IntakeSchema } from "../types/intake";
import { INTAKE_TOOL } from "./toolSchema";
import { VOICE_SYSTEM_PROMPT, VISION_SYSTEM_PROMPT, buildExtractionMessages } from "./prompts";
import { tryParseToolCall } from "./parseToolCall";

export class ExtractionEngine {
  private llm: CactusLM | null = null;

  async downloadModels(onProgress: (model: string, progress: number) => void): Promise<void> {
    this.llm = new CactusLM({ model: "gemma-4-e2b", options: { quantization: "int4" } });
    await this.llm.download({
      onProgress: (p) => onProgress("llm", p),
    });
  }

  async loadModels(): Promise<void> {
    if (!this.llm) {
      this.llm = new CactusLM({ model: "gemma-4-e2b", options: { quantization: "int4" } });
    }
    // Model loaded on first complete() call or via download()
  }

  isReady(): boolean {
    return this.llm?.isDownloaded ?? false;
  }

  async destroy(): Promise<void> {
    await this.llm?.destroy();
    this.llm = null;
  }

  async extractFromTranscript(
    transcript: string,
    currentFields: IntakeSchema
  ): Promise<Partial<Record<keyof IntakeSchema, any>> | null> {
    if (!this.llm) return null;

    try {
      const messages = [
        { role: "user" as const, content: VOICE_SYSTEM_PROMPT },
        ...buildExtractionMessages(transcript, currentFields),
      ];

      const result = await this.llm.complete({
        messages,
        tools: [INTAKE_TOOL],
      });

      return tryParseToolCall(result);
    } catch (e) {
      console.warn("Extraction failed, skipping cycle:", e);
      return null;
    }
  }

  async extractFromImage(
    imagePath: string,
    currentFields: IntakeSchema
  ): Promise<Partial<Record<keyof IntakeSchema, any>> | null> {
    if (!this.llm) return null;

    try {
      const result = await this.llm.complete({
        messages: [
          {
            role: "user",
            content: VISION_SYSTEM_PROMPT,
            images: [imagePath],
          },
        ],
        tools: [INTAKE_TOOL],
      });

      return tryParseToolCall(result);
    } catch (e) {
      console.warn("Vision extraction failed:", e);
      return null;
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/services/extraction.ts
git commit -m "feat(extraction): add ExtractionEngine class with transcript and vision extraction"
```

### Task 18: Verify extraction module compiles

**Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors in services/ files.

**Step 2: Commit any fixes**

---

## Tasks 19-24: Agent 3 — UI & Form

**Branch:** `agent-3-ui-form`

### Task 19: SectionHeader Component

**Files:**
- Create: `src/components/form/SectionHeader.tsx`

**Step 1: Write component**

Renders section title in uppercase, muted color, with completion count (e.g., "DEMOGRAPHICS 3/6"). Uses `theme.typography.sectionHeader`.

**Step 2: Commit**

```bash
git add src/components/form/SectionHeader.tsx
git commit -m "feat(form): add SectionHeader component"
```

### Task 20: FormField Component

**Files:**
- Create: `src/components/form/FormField.tsx`

**Step 1: Write component**

Single field row with three visual states:
- **Empty**: `theme.colors.fieldEmpty` background, placeholder text
- **Inferred**: `theme.colors.fieldInferred` background, `theme.colors.fieldInferredBorder` left border (3px), subtle pulse animation (Animated.loop, opacity 0.85 ↔ 1.0, 2000ms)
- **Confirmed**: `theme.colors.fieldConfirmed` background, `theme.colors.fieldConfirmedBorder` left border, check icon

Tap behavior:
- Inferred → call `store.confirmField(key)` (turns green)
- Confirmed → call `store.unlockField(key)` (turns amber, shows inline editor)

Card style: `theme.radii.md` border radius, `theme.shadows.card`, `theme.spacing.md` padding.

**Step 2: Commit**

```bash
git add src/components/form/FormField.tsx
git commit -m "feat(form): add FormField with grey/amber/green states and pulse animation"
```

### Task 21: FieldEditor Component

**Files:**
- Create: `src/components/form/FieldEditor.tsx`

**Step 1: Write component**

Inline editor shown when a confirmed field is tapped to edit:
- Text fields: `TextInput`
- Number fields: `TextInput` with numeric keyboard
- Enum fields: horizontal chip selector (map `enumValues` from `FieldMeta`)
- Boolean fields: toggle switch
- "Save" button calls `store.editField(key, newValue)`

**Step 2: Commit**

```bash
git add src/components/form/FieldEditor.tsx
git commit -m "feat(form): add FieldEditor for inline field editing"
```

### Task 22: IntakeForm Component

**Files:**
- Create: `src/components/form/IntakeForm.tsx`

**Step 1: Write component**

ScrollView that:
- Groups fields by section using `FIELD_METADATA`
- Renders `SectionHeader` for each unique section
- Renders `FormField` for each field in the section
- Reads `intake` from store

```typescript
import React from "react";
import { ScrollView, View } from "react-native";
import { useAppStore } from "../../store/useAppStore";
import { FIELD_METADATA } from "../../types/intake";
import { SectionHeader } from "./SectionHeader";
import { FormField } from "./FormField";
import { theme } from "../../theme";

export function IntakeForm() {
  const intake = useAppStore(s => s.intake);
  const sections = [...new Set(FIELD_METADATA.map(m => m.section))];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: theme.spacing.lg }}
    >
      {sections.map(section => {
        const sectionFields = FIELD_METADATA.filter(m => m.section === section);
        const filled = sectionFields.filter(m => intake[m.key].status !== "empty").length;
        return (
          <View key={section} style={{ marginBottom: theme.spacing.lg }}>
            <SectionHeader title={section} filled={filled} total={sectionFields.length} />
            {sectionFields.map(meta => (
              <FormField key={meta.key} meta={meta} field={intake[meta.key]} />
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/form/IntakeForm.tsx
git commit -m "feat(form): add IntakeForm with section grouping"
```

### Task 23: CompletionBar Component

**Files:**
- Create: `src/components/form/CompletionBar.tsx`

**Step 1: Write component**

Fixed bottom bar:
- Animated progress bar showing completion percentage
- "Confirm All" button (calls `store.confirmAllFields()`)
- "Generate Plan" button (disabled until >= 60%, calls `onGeneratePlan` prop)
- Uses `theme.shadows.elevated` for lift effect

**Step 2: Commit**

```bash
git add src/components/form/CompletionBar.tsx
git commit -m "feat(form): add CompletionBar with progress and action buttons"
```

### Task 24: Verify form renders with mock data

**Step 1: Temporarily add mock data to IntakeSessionScreen**

Import `IntakeForm`, `CompletionBar`. Set a few fields to inferred state in the store manually for visual testing.

**Step 2: Run on simulator**

```bash
npx react-native run-ios --simulator="iPhone 15 Pro"
```

Expected: Form renders with sections, grey empty fields, amber inferred fields with pulse animation.

**Step 3: Remove mock data, commit**

```bash
git commit -am "test(form): verify form renders correctly, remove mock data"
```

---

## Tasks 25-28: Agent 4 — Document Scanner

**Branch:** `agent-4-document-scanner`

### Task 25: Install Camera Library

**Step 1: Install**

```bash
npm install react-native-vision-camera
cd ios && pod install && cd ..
```

**Step 2: Add camera permission to Info.plist**

Add `NSCameraUsageDescription` key.

**Step 3: Commit**

```bash
git commit -am "chore(scanner): install react-native-vision-camera"
```

### Task 26: CaptureButton Component

**Files:**
- Create: `src/components/scanner/CaptureButton.tsx`

Large circular button (72x72), white with subtle shadow, camera icon centered. Disabled state: opacity 0.5.

**Step 1: Write and commit**

```bash
git add src/components/scanner/CaptureButton.tsx
git commit -m "feat(scanner): add CaptureButton component"
```

### Task 27: ExtractionPreview Component

**Files:**
- Create: `src/components/scanner/ExtractionPreview.tsx`

Shows extracted fields as amber chips with field label + value. Each chip has a deselect (X) button. "Accept Selected" and "Retake" buttons.

**Step 1: Write and commit**

```bash
git add src/components/scanner/ExtractionPreview.tsx
git commit -m "feat(scanner): add ExtractionPreview component"
```

### Task 28: DocumentScanScreen

**Files:**
- Modify: `src/screens/DocumentScanScreen.tsx`

**Step 1: Implement full screen**

Three states:
1. **Camera active**: Full-screen camera preview + CaptureButton
2. **Processing**: Captured image preview + loading spinner + "Extracting..."
3. **Preview**: Captured image (small) + ExtractionPreview chips + Accept/Retake buttons

On capture:
- Save to temp: `RNFS.TemporaryDirectoryPath + '/scan_' + Date.now() + '.jpg'`
- Call `extractionEngine.extractFromImage(tempPath, currentIntake)`
- Show ExtractionPreview

On accept:
- `store.mergeFields(selectedDelta, "vision")`
- `RNFS.unlink(tempPath)`
- `navigation.goBack()`

On retake/cancel:
- `RNFS.unlink(tempPath)`
- Reset to camera state / navigate back

**Step 2: Commit**

```bash
git commit -am "feat(scanner): implement DocumentScanScreen with camera, preview, and cleanup"
```

---

## Tasks 29-33: Agent 5 — Cloud & Sanitization

**Branch:** `agent-5-cloud-sanitization`

### Task 29: Sanitization Function

**Files:**
- Create: `src/services/sanitization.ts`

**Step 1: Write sanitizeIntake**

```typescript
import { IntakeSchema } from "../types/intake";
import { SanitizedPayload } from "../types/sanitized";
import { FIELD_METADATA } from "../types/intake";

function bucketIncome(amount: number | null): string | null {
  if (amount === null) return null;
  const lower = Math.floor(amount / 500) * 500;
  return `$${lower.toLocaleString()}-$${(lower + 500).toLocaleString()}`;
}

export function sanitizeIntake(intake: IntakeSchema): SanitizedPayload {
  const totalFields = FIELD_METADATA.length;
  const confirmed = FIELD_METADATA.filter(m => intake[m.key].status === "confirmed").length;
  const nonEmpty = FIELD_METADATA.filter(m => intake[m.key].status !== "empty").length;

  return {
    // REDACTED: client_first_name, client_last_name, phone_number, current_address
    // date_of_birth: year only
    gender: intake.gender.value,
    primary_language: intake.primary_language.value,
    family_size_adults: intake.family_size_adults.value,
    family_size_children: intake.family_size_children.value,
    children_ages: intake.children_ages.value,
    housing_status: intake.housing_status.value,
    homelessness_duration_days: intake.homelessness_duration_days.value,
    eviction_status: intake.eviction_status.value,
    employment_status: intake.employment_status.value,
    income_bucket: bucketIncome(intake.income_amount.value),
    income_frequency: intake.income_frequency.value,
    benefits_receiving: intake.benefits_receiving.value,
    has_disability: intake.has_disability.value,
    safety_concern_flag: intake.safety_concern_flag.value,
    timeline_urgency: intake.timeline_urgency.value,
    fields_confirmed: confirmed,
    fields_total: totalFields,
    completion_percentage: Math.round((nonEmpty / totalFields) * 100),
  };
}
```

**Step 2: Commit**

```bash
git add src/services/sanitization.ts
git commit -m "feat(cloud): add sanitization function with PII stripping and income bucketing"
```

### Task 30: Gemini API Client

**Files:**
- Create: `src/services/gemini.ts`

**Step 1: Write generateResourcePlan**

```typescript
import { SanitizedPayload } from "../types/sanitized";
import { CloudAnalysis } from "../types/cloud";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const ANALYSIS_PROMPT = `You are a housing resource analyst. Analyze this anonymized intake data and respond with a JSON object containing:
{
  "riskScore": <0-100 integer, higher = more urgent>,
  "riskFactors": [<list of risk factor strings>],
  "protectiveFactors": [<list of protective factor strings>],
  "timeline": [{"day": <number>, "action": <string>, "category": <"housing"|"benefits"|"legal"|"medical">}],
  "programMatches": [{"name": <string>, "likelihood": <"likely"|"possible"|"unlikely">, "reason": <string>}]
}

Risk scoring: homelessness >30 days = high; safety concern = automatic high; children present = elevated; no income/benefits = elevated; eviction judgment = high.

Respond ONLY with the JSON object, no other text.`;

export async function generateResourcePlan(
  sanitized: SanitizedPayload,
  apiKey: string
): Promise<CloudAnalysis> {
  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${ANALYSIS_PROMPT}\n\nIntake data:\n${JSON.stringify(sanitized, null, 2)}`
        }]
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) throw new Error("Empty Gemini response");

  // Parse JSON from response (may be wrapped in markdown fences)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in Gemini response");

  return JSON.parse(jsonMatch[0]) as CloudAnalysis;
}
```

**Step 2: Commit**

```bash
git add src/services/gemini.ts
git commit -m "feat(cloud): add Gemini API client for resource plan generation"
```

### Task 31: RiskScoreBadge Component

**Files:**
- Create: `src/components/cloud/RiskScoreBadge.tsx`

Large circular badge (120x120), centered number, color-coded:
- 0-33: `theme.colors.riskLow` (green)
- 34-66: `theme.colors.riskMedium` (amber)
- 67-100: `theme.colors.riskHigh` (red)

Label below: "LOW RISK" / "MODERATE RISK" / "HIGH RISK"

**Step 1: Write and commit**

```bash
git add src/components/cloud/RiskScoreBadge.tsx
git commit -m "feat(cloud): add RiskScoreBadge component"
```

### Task 32: TimelineView and ProgramMatchCard Components

**Files:**
- Create: `src/components/cloud/TimelineView.tsx`
- Create: `src/components/cloud/ProgramMatchCard.tsx`

**TimelineView**: Vertical timeline with day markers (circles), connecting lines, action text, category chip.

**ProgramMatchCard**: Card with program name, likelihood badge (green/amber/grey chip), reason text.

**Step 1: Write both and commit**

```bash
git add src/components/cloud/
git commit -m "feat(cloud): add TimelineView and ProgramMatchCard components"
```

### Task 33: ResourcePlanScreen

**Files:**
- Modify: `src/screens/ResourcePlanScreen.tsx`

**Step 1: Implement full screen**

ScrollView layout:
1. RiskScoreBadge (centered, top)
2. "Risk Factors" section with red chips
3. "Protective Factors" section with green chips
4. "30-Day Action Plan" with TimelineView
5. "Eligible Programs" with ProgramMatchCard list
6. "New Case" button at bottom → calls `store.resetSession()`, navigates to IntakeSession

Reads `cloudResult` from store.

**Step 2: Commit**

```bash
git commit -am "feat(cloud): implement ResourcePlanScreen with risk score, timeline, programs"
```

---

## Task 34: Orchestrator — Wire IntakeSessionScreen

**Branch:** `main` (after merging all agent branches)

**Files:**
- Modify: `src/screens/IntakeSessionScreen.tsx`

**Step 1: Merge all agent branches**

```bash
git checkout main
git merge agent-1-audio-pipeline
git merge agent-2-extraction-engine
git merge agent-3-ui-form
git merge agent-4-document-scanner
git merge agent-5-cloud-sanitization
```

**Step 2: Implement orchestrator**

Wire the full pipeline as specified in design spec section 7:

```typescript
import React, { useRef, useEffect } from "react";
import { SafeAreaView, View, TouchableOpacity, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAppStore } from "../store/useAppStore";
import { useAudioPipeline } from "../hooks/useAudioPipeline";
import { ExtractionEngine } from "../services/extraction";
import { sanitizeIntake } from "../services/sanitization";
import { generateResourcePlan } from "../services/gemini";
import { RecordingIndicator } from "../components/audio/RecordingIndicator";
import { TranscriptReviewSheet } from "../components/audio/TranscriptReviewSheet";
import { IntakeForm } from "../components/form/IntakeForm";
import { CompletionBar } from "../components/form/CompletionBar";
import { theme } from "../theme";

const GEMINI_API_KEY = "YOUR_KEY_HERE"; // from env or config

export function IntakeSessionScreen() {
  const navigation = useNavigation();
  const pipeline = useAudioPipeline();
  const engine = useRef(new ExtractionEngine());
  const store = useAppStore;

  useEffect(() => {
    // Download and load models on mount
    engine.current.downloadModels((model, progress) => {
      useAppStore.getState().updateDownloadProgress(
        model as "vad" | "stt" | "llm",
        progress
      );
    }).then(() => {
      useAppStore.getState().setModelsLoaded(true);
      pipeline.startListening();
    });

    return () => {
      pipeline.stopListening();
      engine.current.destroy();
    };
  }, []);

  // Register transcript callback
  useEffect(() => {
    pipeline.onTranscriptReady((transcript) => {
      useAppStore.getState().setCurrentTranscript(transcript);
    });
  }, []);

  const handleTranscriptConfirmed = async (editedText: string) => {
    useAppStore.getState().setPipelinePhase("extracting");

    const delta = await engine.current.extractFromTranscript(
      editedText,
      useAppStore.getState().intake
    );

    if (delta) {
      useAppStore.getState().mergeFields(delta, "voice");
    }

    const currentTranscript = useAppStore.getState().currentTranscript;
    useAppStore.getState().commitTranscript({
      id: Date.now().toString(),
      rawText: currentTranscript || editedText,
      editedText,
      wasEdited: editedText !== currentTranscript,
      timestamp: Date.now(),
      fieldsExtracted: delta ? Object.keys(delta) : [],
    });

    useAppStore.getState().clearCurrentTranscript();
    useAppStore.getState().setPipelinePhase("listening");
  };

  const handleGeneratePlan = async () => {
    const intake = useAppStore.getState().intake;
    const sanitized = sanitizeIntake(intake);
    useAppStore.getState().setCloudStatus("sending");

    try {
      const result = await generateResourcePlan(sanitized, GEMINI_API_KEY);
      useAppStore.getState().setCloudResult(result);
      useAppStore.getState().setCloudStatus("complete");
      navigation.navigate("ResourcePlan" as never);
    } catch (e) {
      useAppStore.getState().setCloudStatus("error");
    }
  };

  const handleScanDoc = () => {
    pipeline.stopListening();
    navigation.navigate("DocumentScan" as never);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
      }}>
        <RecordingIndicator />
        <TouchableOpacity onPress={handleScanDoc} style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.md,
          padding: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          ...theme.shadows.card,
        }}>
          <Text style={{ ...theme.typography.caption, color: theme.colors.accent }}>
            Scan Doc
          </Text>
        </TouchableOpacity>
      </View>

      <IntakeForm />

      <TranscriptReviewSheet onConfirm={handleTranscriptConfirmed} />
      <CompletionBar onGeneratePlan={handleGeneratePlan} />
    </SafeAreaView>
  );
}
```

**Step 3: Commit**

```bash
git commit -am "feat: wire orchestrator in IntakeSessionScreen connecting all agents"
```

---

## Task 35: End-to-End Verification

**Step 1: Build and run**

```bash
npx react-native run-ios --simulator="iPhone 15 Pro"
```

**Step 2: Walk through verification checklist**

From design spec section 12:

1. Speak → transcript appears → verify text
2. Edit transcript → verify corrected text goes to extraction
3. Verify fields populate as amber after extraction
4. Tap amber field → verify turns green
5. Tap green field → verify editor appears
6. "Confirm All" → all amber → green
7. "Scan Doc" → camera opens → capture → fields extracted → image deleted
8. "Generate Plan" → verify sanitized payload has no PII → risk score appears
9. Toggle airplane mode → verify form works, cloud shows queued
10. Check file system: no audio files, no images after processing

**Step 3: Fix any issues found**

**Step 4: Final commit**

```bash
git commit -am "fix: address issues found during end-to-end verification"
git tag v0.1.0-hackathon
```

---

## Summary

| Task | Section | Description |
|------|---------|-------------|
| 1 | Skeleton | CLAUDE.md + AGENTS.md |
| 2 | Skeleton | RN project init + dependencies |
| 3 | Skeleton | Shared types |
| 4 | Skeleton | Theme constants |
| 5 | Skeleton | Utility functions |
| 6 | Skeleton | Zustand store |
| 7 | Skeleton | Navigation + screen shells |
| 8 | Skeleton | Directory structure + verify build |
| 9 | Skeleton | Tag skeleton-complete |
| 10-13 | Agent 1 | Audio Pipeline (hook, VAD, STT, components) |
| 14-18 | Agent 2 | Extraction Engine (schema, prompts, parser, engine) |
| 19-24 | Agent 3 | UI & Form (fields, sections, editor, completion bar) |
| 25-28 | Agent 4 | Document Scanner (camera, preview, screen) |
| 29-33 | Agent 5 | Cloud & Sanitization (sanitize, Gemini, risk score, timeline) |
| 36-40 | Agent 6 | SMS Dispatch (format plan, native composer, send button, status badge) |
| 34 | Integration | Orchestrator wiring |
| 35 | Integration | End-to-end verification |

---

## Tasks 36-40: Agent 6 — SMS Dispatch

**Branch:** `agent-6-sms-dispatch`

**Goal:** After Agent 5 produces a `CloudAnalysis`, send the survivor a plain-text SMS containing their action plan. Survivors after a disaster often have no smartphone / data / app access — SMS is the universal fallback channel.

**Phase 1 (Current):** iOS native `MFMessageComposeViewController` via [`react-native-sms`](https://www.npmjs.com/package/react-native-sms). The field worker's iPhone opens the Messages app with the body pre-filled. The worker reviews + taps Send; SMS goes out via the worker's carrier. Zero backend.

**Phase 2 (Future):** Twilio backend from an org-owned long/short code. Enables 2-way reply, delivery receipts, bulk dispatch. Swap `sendPlanSMS` body only; interface + UI unchanged.

### Task 36: SMS types

- Create: `src/types/sms.ts`
- Exports: `SmsStatus`, `SmsResult`, `FormatPlanOptions`

```typescript
export type SmsStatus =
  | "idle" | "formatting" | "composing"
  | "sent" | "cancelled" | "failed" | "queued";
```

### Task 37: SMS service

- Create: `src/services/sms.ts`
- Exports: `formatPlanForSMS()`, `sendPlanSMS()`, `normalizePhoneNumber()`
- `formatPlanForSMS` must:
  - Render GSM-7 friendly (no emoji / curly quotes) so segments stay 160 chars
  - Be deterministic given same input (pure function — easy to unit test)
  - Auto-trim to fit `maxChars`: drop protective factors → unlikely programs → risk factors → older timeline days before hard-truncating
  - Never drop action items (Day N / housing, benefits, legal, medical) or likely-program matches unless the budget is catastrophically low

### Task 38: Store additions

- Modify: `src/store/useAppStore.ts`
- Add fields: `smsStatus: SmsStatus`, `smsError: string | null`, `smsSentAt: number | null`
- Add actions: `setSmsStatus`, `setSmsError`, `markSmsSent`, `resetSms`
- `resetSession()` must reset all three SMS fields to their initial values.

### Task 39: UI components

- Create: `src/components/cloud/SendPlanButton.tsx` — green CTA button, reads `cloudResult` + `intake.phone_number` from the store, disables when either is missing or when SMS is in flight / already sent.
- Create: `src/components/cloud/SmsStatusBadge.tsx` — compact pill rendering the current `smsStatus` (silent when `idle`).

### Task 40: Wire into ResourcePlanScreen

- Modify: `src/screens/ResourcePlanScreen.tsx`
- Import `SendPlanButton` and place it inside the footer `<View>` above the existing `PrimaryButton label="Start New Case"`.
- Add `gap: theme.spacing.md` to the footer styles so the two buttons breathe.

### Enabling Phase 1 for real on a physical device

The service ships as a throw-at-runtime stub so the app typechecks and bundles. To flip it on:

```bash
cd CrisisIntake
npm install react-native-sms
cd ios && pod install && cd ..
```

Then in `src/services/sms.ts`, replace the body of `sendPlanSMS` with:

```typescript
import SendSMS from "react-native-sms";
export async function sendPlanSMS(phoneNumber: string, body: string): Promise<SmsResult> {
  validatePhoneNumber(phoneNumber);
  const to = normalizePhoneNumber(phoneNumber);
  return new Promise<SmsResult>((resolve) => {
    SendSMS.send(
      { body, recipients: [to], successTypes: ["sent", "queued"], allowAndroidSendWithoutReadPermission: true },
      (completed, cancelled, error) => {
        if (completed) resolve({ status: "sent", completedAt: Date.now() });
        else if (cancelled) resolve({ status: "cancelled", completedAt: Date.now() });
        else resolve({ status: "failed", error: String(error) });
      }
    );
  });
}
```

### Critical rules

- SMS body uses the **unsanitized** local intake (real names, addresses, numbers) because it's going BACK to the survivor. Mirror of Agent 5's sanitize-for-outbound-Gemini rule.
- No silent sends in Phase 1 — always show the composer to the worker for final review.
- Phone numbers normalized to E.164 (`+14155551234`) before handing off.
- Once `smsStatus === "sent"`, button becomes "Plan sent" and is disabled until `resetSession()`.
