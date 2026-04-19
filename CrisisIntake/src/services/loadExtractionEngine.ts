import { IntakeSchema } from "../types/intake";

type ExtractionDelta = Partial<Record<keyof IntakeSchema, unknown>>;

export interface ExtractionEngineLike {
  downloadModels?: (
    onProgress: (model: string, progress: number) => void
  ) => Promise<void>;
  loadModels?: () => Promise<void>;
  isReady?: () => boolean;
  extractFromTranscript: (
    transcript: string,
    currentFields: IntakeSchema
  ) => Promise<ExtractionDelta | null>;
}

type ExtractionModule = {
  ExtractionEngine?: new () => ExtractionEngineLike;
};

let enginePromise: Promise<ExtractionEngineLike | null> | null = null;

async function importExtractionModule(): Promise<ExtractionModule> {
  // Deliberately indirect so this app can run before Agent 2's file exists.
  // eslint-disable-next-line no-eval
  const dynamicImport = eval("(specifier) => import(specifier)") as (
    specifier: string
  ) => Promise<ExtractionModule>;

  return dynamicImport("../services/extraction");
}

export async function getExtractionEngine(
  onProgress?: (model: string, progress: number) => void
): Promise<ExtractionEngineLike | null> {
  if (!enginePromise) {
    enginePromise = (async () => {
      try {
        const module = await importExtractionModule();
        if (!module.ExtractionEngine) {
          console.warn(
            "[ExtractionBridge] Agent 2 module loaded without ExtractionEngine export"
          );
          return null;
        }

        const engine = new module.ExtractionEngine();
        if (!engine.isReady?.()) {
          await engine.downloadModels?.(
            onProgress ?? (() => undefined)
          );
          await engine.loadModels?.();
        }

        return engine;
      } catch (error) {
        console.warn(
          "[ExtractionBridge] Agent 2 extraction engine unavailable:",
          error
        );
        return null;
      }
    })();
  }

  return enginePromise;
}
