/**
 * Runtime stub for Agent 2's ExtractionEngine.
 *
 * Agents 4 and 5 depend on this module's shape so the app typechecks and
 * bundles before Agent 2's real implementation lands. Every method throws at
 * runtime, so any accidental invocation fails loudly instead of silently
 * producing wrong data.
 *
 * When Agent 2 ships the real on-device extraction engine, replace this file
 * with the full implementation. The exported shape (class name, method
 * signatures, `IntakeDelta` type) is the integration contract — do not change
 * it without coordinating with Agents 4 and 5.
 */
import { IntakeSchema } from "../types/intake";

export type IntakeDelta = Partial<Record<keyof IntakeSchema, unknown>>;

const NOT_INTEGRATED =
  "ExtractionEngine: Agent 2 is not yet integrated. " +
  "This is a build-time stub; the real on-device extraction engine has not shipped.";

export class ExtractionEngine {
  constructor() {
    // Intentionally empty — construction is cheap and must not throw so
    // screens can mount and render their UI even when extraction is stubbed.
  }

  async downloadModels(
    _onProgress?: (model: "vad" | "stt" | "llm", progress: number) => void
  ): Promise<void> {
    throw new Error(NOT_INTEGRATED);
  }

  async extractFromTranscript(
    _transcript: string,
    _currentIntake: IntakeSchema
  ): Promise<IntakeDelta | null> {
    throw new Error(NOT_INTEGRATED);
  }

  async extractFromImage(
    _imagePath: string,
    _currentIntake: IntakeSchema
  ): Promise<IntakeDelta | null> {
    throw new Error(NOT_INTEGRATED);
  }

  destroy(): void {
    // No-op — nothing allocated in the stub.
  }
}
