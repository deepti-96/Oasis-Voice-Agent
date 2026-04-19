import { extractionEngine, ExtractionEngine } from "./extraction";
import { IntakeSchema } from "../types/intake";

type ExtractionDelta = Partial<Record<keyof IntakeSchema, unknown>>;

export interface ExtractionEngineLike {
  loadModels?: (onProgress?: (progress: number) => void) => Promise<void>;
  isReady?: () => boolean;
  extractFromTranscript: (
    transcript: string,
    currentFields: IntakeSchema | (() => IntakeSchema)
  ) => Promise<ExtractionDelta | null>;
}

let enginePromise: Promise<ExtractionEngineLike | null> | null = null;

export async function getExtractionEngine(
  onProgress?: (model: string, progress: number) => void
): Promise<ExtractionEngineLike | null> {
  console.log("[ExtractionBridge] getExtractionEngine called");
  if (!enginePromise) {
    enginePromise = (async () => {
      try {
        console.log("[ExtractionBridge] Creating extraction engine promise");
        const engine =
          extractionEngine ?? new ExtractionEngine();
        console.log(
          `[ExtractionBridge] Using engine instance. ready=${engine.isReady?.() ?? "unknown"}`
        );

        if (!engine.isReady?.()) {
          console.log("[ExtractionBridge] Engine not ready. Calling loadModels()");
          await engine.loadModels?.((progress) => {
            console.log(`[ExtractionBridge] LLM preload progress=${progress}`);
            (onProgress ?? (() => undefined))("llm", progress);
          });
          console.log(
            `[ExtractionBridge] loadModels() complete. ready=${engine.isReady?.() ?? "unknown"}`
          );
        }

        console.log("[ExtractionBridge] Returning extraction engine");
        return engine;
      } catch (error) {
        console.warn(
          "[ExtractionBridge] Agent 2 extraction engine unavailable:",
          error
        );
        enginePromise = null;
        return null;
      }
    })();
  } else {
    console.log("[ExtractionBridge] Reusing existing extraction engine promise");
  }

  return enginePromise;
}
