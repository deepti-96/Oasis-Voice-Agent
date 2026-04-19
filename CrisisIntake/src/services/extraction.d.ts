/**
 * Type-only stub for Agent 2's ExtractionEngine.
 *
 * This file declares the shape Agent 4 and the orchestrator depend on so the
 * project typechecks before Agent 2's real implementation lands. When Agent 2
 * ships `src/services/extraction.ts`, this declaration file should be deleted.
 */
import { IntakeSchema } from "../types/intake";

export type IntakeDelta = Partial<Record<keyof IntakeSchema, unknown>>;

export declare class ExtractionEngine {
  constructor();
  downloadModels(
    onProgress?: (model: "vad" | "stt" | "llm", progress: number) => void
  ): Promise<void>;
  extractFromTranscript(
    transcript: string,
    currentIntake: IntakeSchema
  ): Promise<IntakeDelta | null>;
  extractFromImage(
    imagePath: string,
    currentIntake: IntakeSchema
  ): Promise<IntakeDelta | null>;
  destroy(): void;
}
