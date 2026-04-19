import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
  Image,
  AccessibilityRole,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  PhotoFile,
} from "react-native-vision-camera";
import RNFS from "react-native-fs";

import { theme } from "../theme";
import { useAppStore } from "../store/useAppStore";
import { CaptureButton } from "../components/scanner/CaptureButton";
import { ExtractionPreview } from "../components/scanner/ExtractionPreview";
import { ExtractionEngine, IntakeDelta } from "../services/extraction";

type Phase = "camera" | "processing" | "preview";

/**
 * Document scan flow.
 *
 * Three states:
 *   1. camera      — live preview + CaptureButton
 *   2. processing  — captured still + spinner while ExtractionEngine runs
 *   3. preview     — ExtractionPreview chips; accept merges into the store
 *
 * The image is always written to the temp directory only and is unlinked
 * immediately after extraction completes or the user cancels/retakes.
 * The screen refuses to mount the camera while the audio pipeline is active.
 */
export function DocumentScanScreen() {
  const navigation = useNavigation();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const cameraRef = useRef<Camera>(null);

  const pipelinePhase = useAppStore((s) => s.pipelinePhase);
  const intake = useAppStore((s) => s.intake);
  const mergeFields = useAppStore((s) => s.mergeFields);
  const setPipelinePhase = useAppStore((s) => s.setPipelinePhase);

  const engineRef = useRef<ExtractionEngine | null>(null);
  const [phase, setPhase] = useState<Phase>("camera");
  const [tempPath, setTempPath] = useState<string | null>(null);
  const [delta, setDelta] = useState<IntakeDelta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioActive = pipelinePhase === "listening" || pipelinePhase === "transcribing";

  // Ensure a temp file is removed exactly once.
  const cleanupFile = useCallback(async (path: string | null) => {
    if (!path) return;
    try {
      if (await RNFS.exists(path)) {
        await RNFS.unlink(path);
      }
    } catch {
      // Swallow unlink errors — temp dir is cleaned by the OS anyway.
    }
  }, []);

  // Lazily create the extraction engine. Agent 2 owns the real implementation;
  // the type stub at src/services/extraction.d.ts lets this typecheck today.
  useEffect(() => {
    if (!engineRef.current) {
      engineRef.current = new ExtractionEngine();
    }
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  // Mark the pipeline as "scanning" while this screen is mounted so the
  // audio pipeline stays paused.
  useEffect(() => {
    const prev = useAppStore.getState().pipelinePhase;
    setPipelinePhase("scanning");
    return () => {
      // Only revert if we still look like the owner.
      if (useAppStore.getState().pipelinePhase === "scanning") {
        setPipelinePhase(prev === "scanning" ? "idle" : prev);
      }
    };
  }, [setPipelinePhase]);

  // Ask for camera permission on mount if needed.
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // Best-effort cleanup when the screen unmounts mid-flow.
  useEffect(() => {
    return () => {
      if (tempPath) {
        void cleanupFile(tempPath);
      }
    };
    // Intentionally only runs once on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    setError(null);

    // Track the working path in a local so the catch block can clean up
    // even if the React state setter hasn't flushed yet.
    let workingPath: string | null = null;

    try {
      const photo: PhotoFile = await cameraRef.current.takePhoto({
        flash: "off",
        enableShutterSound: false,
      });

      const srcPath = photo.path.startsWith("file://")
        ? photo.path.replace("file://", "")
        : photo.path;
      const destPath = `${RNFS.TemporaryDirectoryPath}/scan_${Date.now()}.jpg`;

      // Move (not copy) so no stray file is left behind by the camera pipeline.
      try {
        await RNFS.moveFile(srcPath, destPath);
      } catch {
        // Fallback: copy + unlink if the underlying FS disallows the move
        // (e.g. cross-volume on some simulator setups).
        await RNFS.copyFile(srcPath, destPath);
        await cleanupFile(srcPath);
      }

      workingPath = destPath;
      setTempPath(destPath);
      setPhase("processing");

      const engine = engineRef.current;
      if (!engine) throw new Error("Extraction engine not ready");

      const result = await engine.extractFromImage(destPath, intake);

      // Extraction is done — file has served its purpose. Delete before
      // surfacing any preview so we never persist the image.
      await cleanupFile(destPath);
      workingPath = null;
      setTempPath(null);

      setDelta(result ?? {});
      setPhase("preview");
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(msg);
      // On failure, still clean up whatever temp file we created. Prefer
      // the local workingPath (guaranteed non-stale) over state.
      if (workingPath) {
        await cleanupFile(workingPath);
      } else if (tempPath) {
        await cleanupFile(tempPath);
      }
      setTempPath(null);
      setPhase("camera");
      Alert.alert("Capture failed", msg);
    }
  }, [cleanupFile, intake, tempPath]);

  const handleAccept = useCallback(
    (selected: IntakeDelta) => {
      if (selected && Object.keys(selected).length > 0) {
        mergeFields(selected, "vision");
      }
      setDelta(null);
      goBackSafely();
    },
    [goBackSafely, mergeFields]
  );

  const handleRetake = useCallback(async () => {
    if (tempPath) {
      await cleanupFile(tempPath);
      setTempPath(null);
    }
    setDelta(null);
    setError(null);
    setPhase("camera");
  }, [cleanupFile, tempPath]);

  const handleCancel = useCallback(async () => {
    if (tempPath) {
      await cleanupFile(tempPath);
      setTempPath(null);
    }
    setDelta(null);
    goBackSafely();
  }, [cleanupFile, goBackSafely, tempPath]);

  // --- Guards ---------------------------------------------------------

  if (audioActive) {
    return (
      <SafeAreaView style={styles.guard}>
        <Text style={styles.guardTitle}>Audio capture in progress</Text>
        <Text style={styles.guardBody}>
          Pause the intake conversation before scanning a document.
        </Text>
        <Pressable onPress={handleCancel} style={styles.guardButton}>
          <Text style={styles.guardButtonText}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.guard}>
        <Text style={styles.guardTitle}>Camera permission required</Text>
        <Text style={styles.guardBody}>
          CrisisIntake needs camera access to scan documents. Images are held
          in memory only and deleted immediately after extraction.
        </Text>
        <Pressable onPress={requestPermission} style={styles.guardButton}>
          <Text style={styles.guardButtonText}>Grant permission</Text>
        </Pressable>
        <Pressable onPress={handleCancel} style={styles.guardLink}>
          <Text style={styles.guardLinkText}>Cancel</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.guard}>
        <Text style={styles.guardTitle}>No camera available</Text>
        <Pressable onPress={handleCancel} style={styles.guardButton}>
          <Text style={styles.guardButtonText}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // --- Render ---------------------------------------------------------

  if (phase === "preview" && delta) {
    return (
      <SafeAreaView style={styles.root}>
        <ExtractionPreview
          delta={delta}
          onAccept={handleAccept}
          onRetake={handleRetake}
        />
      </SafeAreaView>
    );
  }

  if (phase === "processing") {
    return (
      <SafeAreaView style={styles.processing}>
        {tempPath ? (
          <Image
            source={{ uri: `file://${tempPath}` }}
            resizeMode="cover"
            style={styles.processingImage}
          />
        ) : null}
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.background} />
          <Text style={styles.processingText}>Extracting…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // phase === "camera"
  return (
    <View style={styles.root}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={phase === "camera"}
        photo
      />

      <SafeAreaView style={styles.cameraChrome} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable
            onPress={handleCancel}
            hitSlop={12}
            accessibilityRole={"button" as AccessibilityRole}
            accessibilityLabel="Cancel scan"
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.topHint}>Center the document and hold steady</Text>
          <View style={styles.cancelButton} />
        </View>

        <View style={styles.captureRow}>
          <CaptureButton onPress={handleCapture} />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  cameraChrome: {
    flex: 1,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  topHint: {
    ...theme.typography.caption,
    color: theme.colors.background,
    opacity: 0.8,
    flex: 1,
    textAlign: "center",
  },
  cancelButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    minWidth: 72,
  },
  cancelText: {
    ...theme.typography.h3,
    color: theme.colors.background,
  },
  captureRow: {
    alignItems: "center",
    paddingBottom: theme.spacing.xl,
  },
  errorText: {
    ...theme.typography.caption,
    color: theme.colors.danger,
    textAlign: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  processing: {
    flex: 1,
    backgroundColor: "#000",
  },
  processingImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
  },
  processingText: {
    ...theme.typography.h3,
    color: theme.colors.background,
  },
  guard: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  guardTitle: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
    textAlign: "center",
  },
  guardBody: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  guardButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    marginTop: theme.spacing.md,
    ...theme.shadows.card,
  },
  guardButtonText: {
    ...theme.typography.h3,
    color: theme.colors.background,
  },
  guardLink: {
    paddingVertical: theme.spacing.sm,
  },
  guardLinkText: {
    ...theme.typography.body,
    color: theme.colors.accent,
  },
});
