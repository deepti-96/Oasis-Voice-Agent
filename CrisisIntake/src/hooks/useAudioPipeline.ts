import { useRef, useCallback, useState, useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { CactusSTT } from "cactus-react-native";
import {
  AudioRecorder,
  AudioManager,
  BitDepth,
  FileDirectory,
  FileFormat,
  FlacCompressionLevel,
  IOSAudioQuality,
  decodeAudioData,
} from "react-native-audio-api";

export const AUDIO_PIPELINE_STT_MODEL = "moonshine-base";

const VAD_SPEECH_START_RMS_THRESHOLD = 0.018;
const VAD_SPEECH_END_RMS_THRESHOLD = 0.009;
const TARGET_SAMPLE_RATE = 16000;
const CALLBACK_CHUNK_SECONDS = 0.1;
const MAX_BUFFER_SECONDS = 24;
const PRE_SPEECH_BUFFER_SECONDS = 0.5;
const MIN_SPEECH_SECONDS_TO_TRIGGER = 2.0;
const SILENCE_SECONDS_TO_TRIGGER = 2.0;
const MAX_SPEECH_SECONDS_TO_TRIGGER = 20.0;
const SPEECH_REENTRY_CONSECUTIVE_CHUNKS = 1;
const SILENCE_RESET_CONSECUTIVE_SPEECH_CHUNKS = 4;
const STT_CLOUD_HANDOFF_THRESHOLD = 999;

export function useAudioPipeline() {
  const [isListening, setIsListening] = useState(false);
  const ringBuffer = useRef<number[]>([]);
  const callbackRef = useRef<((transcript: string) => void) | null>(null);
  const isListeningRef = useRef(false);
  const captureSampleRateRef = useRef(TARGET_SAMPLE_RATE);
  const speechActiveRef = useRef(false);
  const speechCandidateChunksRef = useRef(0);
  const silenceResetCandidateChunksRef = useRef(0);
  const recorderPausedRef = useRef(false);
  const currentRecordingPathRef = useRef<string | null>(null);

  const speechSeconds = useAppStore((s) => s.speechSeconds);
  const silenceSeconds = useAppStore((s) => s.silenceSeconds);
  const modelsLoaded = useAppStore((s) => s.modelsLoaded);

  const stt = useRef(
    new CactusSTT({
      model: AUDIO_PIPELINE_STT_MODEL,
      options: { quantization: "int8", pro: false },
    })
  );
  const sttReady = useRef(false);
  const recorder = useRef<AudioRecorder | null>(null);
  const processingRef = useRef(false);

  const resetDetectionState = useCallback(() => {
    ringBuffer.current = [];
    captureSampleRateRef.current = TARGET_SAMPLE_RATE;
    processingRef.current = false;
    speechActiveRef.current = false;
    speechCandidateChunksRef.current = 0;
    silenceResetCandidateChunksRef.current = 0;
    recorderPausedRef.current = false;
    currentRecordingPathRef.current = null;
    useAppStore.getState().resetAudioCounters();
  }, []);

  const stopCapture = useCallback((nextPhase: "idle" | "reviewing" = "idle") => {
    const currentRecorder = recorder.current;
    if (currentRecorder) {
      currentRecorder.clearOnAudioReady();

      if (currentRecorder.isRecording() || recorderPausedRef.current) {
        const result = currentRecorder.stop();
        if (result.status === "error") {
          console.warn("[AudioPipeline] Recorder stop failed:", result.message);
        }
      }
    }

    isListeningRef.current = false;
    setIsListening(false);
    resetDetectionState();
    useAppStore.getState().setPipelinePhase(nextPhase);

    AudioManager.setAudioSessionActivity(false).catch((error) => {
      console.warn("[AudioPipeline] Failed to deactivate audio session:", error);
    });
  }, [resetDetectionState]);

  const startRecorderCapture = useCallback(() => {
    const currentRecorder = recorder.current;
    if (!currentRecorder) {
      throw new Error("Recorder is not initialized");
    }

    // Guard: don't start if already recording
    if (currentRecorder.isRecording()) {
      console.warn("[AudioPipeline] Recorder already recording, skipping start");
      isListeningRef.current = true;
      setIsListening(true);
      useAppStore.getState().setPipelinePhase("listening");
      return;
    }

    const result = currentRecorder.start({
      fileNameOverride: `intake-${Date.now()}`,
    });
    if (result.status === "error") {
      console.warn("[AudioPipeline] Recorder start failed:", result.message);
      return;
    }

    currentRecordingPathRef.current = result.path || null;
    recorderPausedRef.current = false;
    isListeningRef.current = true;
    setIsListening(true);
    useAppStore.getState().setPipelinePhase("listening");
  }, []);

  const processTranscript = useCallback(async () => {
    if (ringBuffer.current.length === 0 || processingRef.current || !recorder.current) {
      return;
    }

    processingRef.current = true;
    const sourceSampleRate = captureSampleRateRef.current;
    const bufferedSamples = ringBuffer.current.length;
    const durationSecs = (bufferedSamples / sourceSampleRate).toFixed(1);

    ringBuffer.current = [];
    useAppStore.getState().resetAudioCounters();
    useAppStore.getState().setPipelinePhase("transcribing");

    const stopResult = recorder.current.stop();
    recorderPausedRef.current = false;
    isListeningRef.current = false;
    setIsListening(false);

    console.log(
      `[AudioPipeline] Processing transcript from ${bufferedSamples} samples (${durationSecs}s @ ${sourceSampleRate}Hz)`
    );

    let audioPath =
      stopResult.status === "success" ? stopResult.path : currentRecordingPathRef.current;
    currentRecordingPathRef.current = null;

    try {
      if (stopResult.status === "error") {
        throw new Error(stopResult.message);
      }

      console.log(
        `[AudioPipeline] Finalized recording path=${stopResult.path} size=${stopResult.size} duration=${stopResult.duration}`
      );

      useAppStore.getState().setLastDebugAudio({
        path: stopResult.path,
        sizeBytes: Math.round(stopResult.size * 1024 * 1024),
        durationSeconds: stopResult.duration,
        sampleRate: sourceSampleRate,
        createdAt: Date.now(),
      });

      if (!sttReady.current) {
        await stt.current.init();
        sttReady.current = true;
      }

      if (!audioPath) {
        throw new Error("Missing finalized recording path");
      }

      const decodedAudio = await decodeAudioData(audioPath, TARGET_SAMPLE_RATE);
      const decodedSampleRate = decodedAudio.sampleRate || TARGET_SAMPLE_RATE;
      const decodedChannelCount = decodedAudio.numberOfChannels || 1;
      const channelData = decodedAudio.getChannelData(0);

      console.log(
        `[AudioPipeline] Decoded WAV sampleRate=${decodedSampleRate} channels=${decodedChannelCount} frames=${channelData.length}`
      );

      let peak = 0;
      for (let i = 0; i < channelData.length; i += 1) {
        const absValue = Math.abs(channelData[i] ?? 0);
        if (absValue > peak) {
          peak = absValue;
        }
      }

      if (peak > 0.001) {
        const gain = 0.9 / peak;
        for (let i = 0; i < channelData.length; i += 1) {
          channelData[i] *= gain;
        }
        console.log(
          `[AudioPipeline] Normalized decoded audio with peak=${peak.toFixed(4)} gain=${gain.toFixed(1)}x`
        );
      }

      const pcmBytes = new Uint8Array(channelData.length * 2);
      const pcmView = new DataView(pcmBytes.buffer);
      for (let i = 0; i < channelData.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, channelData[i] ?? 0));
        const int16Val = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        pcmView.setInt16(i * 2, int16Val, true);
      }

      const audioBytes = Array.from(pcmBytes);
      console.log(
        `[AudioPipeline] Sending decoded PCM bytes to STT: ${audioBytes.length} bytes (${channelData.length} samples)`
      );

      const result = await stt.current.transcribe({
        audio: audioBytes,
        options: {
          useVad: false,
          temperature: 0,
          cloudHandoffThreshold: STT_CLOUD_HANDOFF_THRESHOLD,
        },
        onToken: (token) => {
          console.log(`[AudioPipeline] Token: "${token}"`);
        },
      });

      console.log("[AudioPipeline] STT result:", JSON.stringify(result).slice(0, 400));

      if (result.success && result.response.trim().length > 0) {
        console.log("[AudioPipeline] Transcript:", result.response);
        useAppStore.getState().setCurrentTranscript(result.response);
        if (callbackRef.current) {
          callbackRef.current(result.response);
        }

        processingRef.current = false;
        resetDetectionState();
        startRecorderCapture();
      } else {
        console.warn("[AudioPipeline] STT returned empty/failed result");
        resetDetectionState();
        startRecorderCapture();
      }
    } catch (error) {
      console.error("[AudioPipeline] STT failed:", error);
      resetDetectionState();
      startRecorderCapture();
    } finally {
      processingRef.current = false;
    }
  }, [resetDetectionState, startRecorderCapture, stopCapture]);

  const setupAudioProcess = useCallback(() => {
    if (!recorder.current) {
      return;
    }

    console.log("[AudioPipeline] Setting up onAudioReady callback");
    const result = recorder.current.onAudioReady(
      {
        sampleRate: TARGET_SAMPLE_RATE,
        bufferLength: Math.round(TARGET_SAMPLE_RATE * CALLBACK_CHUNK_SECONDS),
        channelCount: 1,
      },
      (event) => {
        const inputData = event.buffer.getChannelData(0);
        const sampleRate = event.buffer.sampleRate || TARGET_SAMPLE_RATE;
        captureSampleRateRef.current = sampleRate;

        if (ringBuffer.current.length === 0) {
          console.log(
            `[AudioPipeline] Audio callback sampleRate=${sampleRate}, frames=${inputData.length}`
          );
        }

        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i += 1) {
          const sample = inputData[i] ?? 0;
          sumSquares += sample * sample;
        }
        const rms = Math.sqrt(sumSquares / inputData.length);
        let hasSpeech: boolean;
        if (speechActiveRef.current) {
          hasSpeech = rms > VAD_SPEECH_END_RMS_THRESHOLD;
          if (!hasSpeech) {
            speechCandidateChunksRef.current = 0;
          }
        } else if (rms > VAD_SPEECH_START_RMS_THRESHOLD) {
          speechCandidateChunksRef.current += 1;
          hasSpeech =
            speechCandidateChunksRef.current >=
            SPEECH_REENTRY_CONSECUTIVE_CHUNKS;
        } else {
          speechCandidateChunksRef.current = 0;
          hasSpeech = false;
        }
        speechActiveRef.current = hasSpeech;
        const chunkDuration = inputData.length / sampleRate;
        const { speechSeconds: prevSp, silenceSeconds: prevSl } = useAppStore.getState();

        for (let i = 0; i < inputData.length; i += 1) {
          ringBuffer.current.push(inputData[i] ?? 0);
        }

        const maxSamples = Math.round(sampleRate * MAX_BUFFER_SECONDS);
        if (ringBuffer.current.length > maxSamples) {
          ringBuffer.current.splice(0, ringBuffer.current.length - maxSamples);
        }

        if (prevSp === 0 && !hasSpeech) {
          const preSpeechSamples = Math.round(sampleRate * PRE_SPEECH_BUFFER_SECONDS);
          if (ringBuffer.current.length > preSpeechSamples) {
            ringBuffer.current.splice(0, ringBuffer.current.length - preSpeechSamples);
          }
        }

        if (rms > 0.005) {
          console.log(
            `[AudioPipeline] RMS=${rms.toFixed(4)} speech=${hasSpeech} sp=${prevSp.toFixed(1)}s sl=${prevSl.toFixed(1)}s thresholds=${VAD_SPEECH_START_RMS_THRESHOLD}/${VAD_SPEECH_END_RMS_THRESHOLD} speechCandidate=${speechCandidateChunksRef.current}/${SPEECH_REENTRY_CONSECUTIVE_CHUNKS} silenceResetCandidate=${silenceResetCandidateChunksRef.current}/${SILENCE_RESET_CONSECUTIVE_SPEECH_CHUNKS}`
          );
        }

        const currentStore = useAppStore.getState();
        let nextSpeechSeconds = currentStore.speechSeconds;
        let nextSilenceSeconds = currentStore.silenceSeconds;

        if (hasSpeech) {
          if (currentStore.silenceSeconds > 0) {
            silenceResetCandidateChunksRef.current += 1;

            if (
              silenceResetCandidateChunksRef.current >=
              SILENCE_RESET_CONSECUTIVE_SPEECH_CHUNKS
            ) {
              nextSpeechSeconds = currentStore.speechSeconds + chunkDuration;
              nextSilenceSeconds = 0;
            }
          } else {
            silenceResetCandidateChunksRef.current = 0;
            nextSpeechSeconds = currentStore.speechSeconds + chunkDuration;
            nextSilenceSeconds = 0;
          }
        } else if (currentStore.speechSeconds > 0) {
          silenceResetCandidateChunksRef.current = 0;
          nextSilenceSeconds = currentStore.silenceSeconds + chunkDuration;
        }

        useAppStore
          .getState()
          .updateAudioCounters(nextSpeechSeconds, nextSilenceSeconds);

        const { speechSeconds: sp, silenceSeconds: sl } = useAppStore.getState();
        const shouldTrigger =
          (sl >= SILENCE_SECONDS_TO_TRIGGER && sp >= MIN_SPEECH_SECONDS_TO_TRIGGER) ||
          sp >= MAX_SPEECH_SECONDS_TO_TRIGGER;
        if (shouldTrigger) {
          console.log(
            `[AudioPipeline] TRIGGER: speech=${sp.toFixed(1)}s, silence=${sl.toFixed(1)}s trigger=${MIN_SPEECH_SECONDS_TO_TRIGGER}/${SILENCE_SECONDS_TO_TRIGGER}/${MAX_SPEECH_SECONDS_TO_TRIGGER} silenceResetCandidate=${silenceResetCandidateChunksRef.current}/${SILENCE_RESET_CONSECUTIVE_SPEECH_CHUNKS}`
          );
          processTranscript().catch((error) => {
            console.error("[AudioPipeline] Transcript processing failed:", error);
          });
        }
      }
    );

    if (result.status === "error") {
      throw new Error(result.message);
    }
  }, [processTranscript]);

  const startListening = useCallback(async () => {
    console.log("[AudioPipeline] startListening requested. modelsLoaded:", modelsLoaded);
    if (!modelsLoaded || isListeningRef.current) {
      if (!modelsLoaded) {
        console.warn("[AudioPipeline] Models not loaded yet");
      }
      return;
    }

    try {
      if (!sttReady.current) {
        console.log("[AudioPipeline] Initializing STT model...");
        await stt.current.init();
        sttReady.current = true;
      }

      const permission = await AudioManager.requestRecordingPermissions();
      if (permission !== "Granted") {
        console.error("[AudioPipeline] Microphone permission not granted");
        return;
      }

      AudioManager.setAudioSessionOptions({
        iosCategory: "playAndRecord",
        iosOptions: ["defaultToSpeaker", "allowBluetoothHFP"],
        iosMode: "default",
      });

      const audioSessionReady = await AudioManager.setAudioSessionActivity(true);
      if (!audioSessionReady) {
        console.error("[AudioPipeline] Could not activate audio session");
        return;
      }

      if (!recorder.current) {
        recorder.current = new AudioRecorder();
        const fileOutputResult = recorder.current.enableFileOutput({
          directory: FileDirectory.Cache,
          subDirectory: "CrisisIntake",
          fileNamePrefix: "intake",
          format: FileFormat.Wav,
          channelCount: 1,
          preset: {
            sampleRate: TARGET_SAMPLE_RATE,
            bitRate: 256000,
            bitDepth: BitDepth.Bit16,
            iosQuality: IOSAudioQuality.High,
            flacCompressionLevel: FlacCompressionLevel.L0,
          },
        });

        if (fileOutputResult.status === "error") {
          throw new Error(fileOutputResult.message);
        }
      }

      recorder.current.clearOnAudioReady();
      resetDetectionState();

      setupAudioProcess();
      startRecorderCapture();
    } catch (error) {
      console.error("[AudioPipeline] Failed to start audio pipeline:", error);
      stopCapture("idle");
    }
  }, [modelsLoaded, resetDetectionState, setupAudioProcess, startRecorderCapture, stopCapture]);

  const stopListening = useCallback(() => {
    console.log("[AudioPipeline] stopListening called");
    stopCapture("idle");
  }, [stopCapture]);

  const onTranscriptReady = useCallback((cb: (transcript: string) => void) => {
    callbackRef.current = cb;
  }, []);

  useEffect(() => {
    const sttInstance = stt.current;
    return () => {
      console.log("[AudioPipeline] Hook unmounting, cleaning up...");
      stopListening();
      sttInstance.destroy().catch((error) => {
        console.warn("[AudioPipeline] Failed to destroy STT instance:", error);
      });
    };
  }, [stopListening]);

  return {
    isListening,
    speechSeconds,
    silenceSeconds,
    startListening,
    stopListening,
    onTranscriptReady,
  };
}
