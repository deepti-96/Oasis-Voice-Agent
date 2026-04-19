import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { useAppStore } from "../store/useAppStore";
import {
  AUDIO_PIPELINE_STT_MODEL,
  useAudioPipeline,
} from "../hooks/useAudioPipeline";
import { RecordingIndicator } from "../components/audio/RecordingIndicator";
import { IntakeForm } from "../components/form/IntakeForm";
import { CompletionBar } from "../components/form/CompletionBar";
import { theme } from "../theme";
import { CactusSTT } from "cactus-react-native";
import { IntakeSchema, FIELD_METADATA } from "../types/intake";
import { getExtractionEngine } from "../services/loadExtractionEngine";

let sttPreloadPromise: Promise<void> | null = null;

type Nav = NativeStackNavigationProp<RootStackParamList, "IntakeSession">;

export function IntakeSessionScreen() {
  const navigation = useNavigation<Nav>();
  const pipeline = useAudioPipeline();
  const modelsLoaded = useAppStore(s => s.modelsLoaded);
  const setModelsLoaded = useAppStore(s => s.setModelsLoaded);

  // Register transcript callback — runs extraction silently, no popup
  useEffect(() => {
    pipeline.onTranscriptReady(async (transcript) => {
      useAppStore.getState().setPipelinePhase("extracting");
      let fieldsExtracted: string[] = [];
      try {
        const engine = await getExtractionEngine((model, progress) => {
          if (model === "llm") {
            useAppStore.getState().updateDownloadProgress("llm", progress);
          }
        });

        if (engine) {
          const delta = await engine.extractFromTranscript(
            transcript,
            () => useAppStore.getState().intake as IntakeSchema
          );

          if (delta) {
            const filteredDelta = Object.fromEntries(
              Object.entries(delta).filter(([key, value]) => {
                return Boolean(
                  FIELD_METADATA.find(m => m.key === key) &&
                    value !== null &&
                    value !== undefined &&
                    value !== ""
                );
              })
            ) as Partial<Record<keyof IntakeSchema, unknown>>;

            const extractedFieldKeys = Object.keys(filteredDelta) as Array<keyof IntakeSchema>;
            if (extractedFieldKeys.length > 0) {
              useAppStore.getState().mergeFields(
                filteredDelta as Partial<Record<keyof IntakeSchema, any>>,
                "voice"
              );
            }
            fieldsExtracted = extractedFieldKeys.map(f => f as string);
          }
        }
      } catch (error) {
        console.error("[IntakeSession] Extraction failed:", error);
      } finally {
        useAppStore.getState().commitTranscript({
          id: `${Date.now()}`,
          rawText: transcript,
          editedText: transcript,
          wasEdited: false,
          timestamp: Date.now(),
          fieldsExtracted,
        });
        useAppStore.getState().setPipelinePhase("listening");
      }
    });
  }, [pipeline]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        if (!sttPreloadPromise) {
          sttPreloadPromise = (async () => {
            const stt = new CactusSTT({
              model: AUDIO_PIPELINE_STT_MODEL,
              options: { quantization: "int8", pro: false },
            });
            await stt.download({
              onProgress: (p) => useAppStore.getState().updateDownloadProgress("stt", p),
            });
          })().catch((error) => {
            sttPreloadPromise = null;
            throw error;
          });
        }
        await sttPreloadPromise;
        setModelsLoaded(true);
      } catch (e) {
        console.error("[Startup] Failed to load STT model:", e);
      }
    };
    if (!modelsLoaded) {
      loadModels();
    }
  }, [modelsLoaded, setModelsLoaded]);

  // Preload extraction engine
  useEffect(() => {
    getExtractionEngine((model, progress) => {
      if (model === "llm") {
        useAppStore.getState().updateDownloadProgress("llm", progress);
      }
    }).catch((error) => {
      console.warn("[IntakeSession] Extraction preload skipped:", error);
    });
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={theme.typography.h2}>Crisis Intake</Text>
        <View style={styles.headerRight}>
          <RecordingIndicator />
          <Pressable
            style={[
              styles.micButton,
              { backgroundColor: pipeline.isListening ? theme.colors.danger : theme.colors.accent },
            ]}
            onPress={() => pipeline.isListening ? pipeline.stopListening() : pipeline.startListening()}
          >
            <Text style={styles.micButtonText}>
              {pipeline.isListening ? "Stop" : "\u{1F3A4} Listen"}
            </Text>
          </Pressable>
        </View>
      </View>

      {!modelsLoaded ? (
        <View style={styles.loading}>
          <Text style={theme.typography.body}>Downloading STT Model...</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <IntakeForm />
          <CompletionBar onGeneratePlan={() => navigation.navigate("ResourcePlan")} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  body: {
    flex: 1,
  },
  header: {
    padding: theme.spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  micButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
  },
  micButtonText: {
    ...theme.typography.caption,
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
