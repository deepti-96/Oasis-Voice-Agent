import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  AccessibilityRole,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { theme } from "../theme";
import { useAppStore } from "../store/useAppStore";
import { RiskScoreBadge } from "../components/cloud/RiskScoreBadge";
import { TimelineView } from "../components/cloud/TimelineView";
import { ProgramMatchCard } from "../components/cloud/ProgramMatchCard";

/**
 * Final screen of the intake flow. Reads cloudResult from the store and
 * renders:
 *
 *   1. RiskScoreBadge (centered, top)
 *   2. Risk factors (red chips)
 *   3. Protective factors (green chips)
 *   4. 30-day action plan (TimelineView)
 *   5. Eligible programs (ProgramMatchCard list)
 *   6. "New Case" button → resetSession() + navigate back to IntakeSession
 *
 * Also handles the "sending" and "queued" / "error" cloudStatus states so
 * the caseworker always sees *something* meaningful on this route.
 */
export function ResourcePlanScreen() {
  const navigation = useNavigation();
  const cloudStatus = useAppStore((s) => s.cloudStatus);
  const cloudResult = useAppStore((s) => s.cloudResult);
  const resetSession = useAppStore((s) => s.resetSession);

  const handleNewCase = () => {
    resetSession();
    // Jump back to the intake session (may be in history, or a reset).
    navigation.reset({
      index: 0,
      routes: [{ name: "IntakeSession" as never }],
    });
  };

  // --- Non-ready states ---------------------------------------------------

  if (cloudStatus === "sending" || cloudStatus === "sanitizing") {
    return (
      <SafeAreaView style={styles.statusScreen}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.statusTitle}>Generating resource plan…</Text>
        <Text style={styles.statusBody}>
          Sending the anonymized intake to the analyst. This usually takes a
          few seconds.
        </Text>
      </SafeAreaView>
    );
  }

  if (cloudStatus === "queued") {
    return (
      <SafeAreaView style={styles.statusScreen}>
        <Text style={styles.statusTitle}>Offline — plan queued</Text>
        <Text style={styles.statusBody}>
          We couldn't reach the analyst service. The anonymized intake has
          been saved locally and will be sent the next time you're online.
        </Text>
        <PrimaryButton label="Start New Case" onPress={handleNewCase} />
      </SafeAreaView>
    );
  }

  if (cloudStatus === "error" && !cloudResult) {
    return (
      <SafeAreaView style={styles.statusScreen}>
        <Text style={[styles.statusTitle, { color: theme.colors.danger }]}>
          Something went wrong
        </Text>
        <Text style={styles.statusBody}>
          The analyst service returned an error. Check your connection and
          try generating the plan again.
        </Text>
        <PrimaryButton label="Start New Case" onPress={handleNewCase} />
      </SafeAreaView>
    );
  }

  if (!cloudResult) {
    return (
      <SafeAreaView style={styles.statusScreen}>
        <Text style={styles.statusTitle}>No plan yet</Text>
        <Text style={styles.statusBody}>
          Complete the intake form and tap "Generate Plan" to produce a risk
          score and action timeline.
        </Text>
        <PrimaryButton label="Back to Intake" onPress={handleNewCase} />
      </SafeAreaView>
    );
  }

  // --- Ready ---------------------------------------------------------------

  const {
    riskScore,
    riskFactors,
    protectiveFactors,
    timeline,
    programMatches,
  } = cloudResult;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.badgeRow}>
          <RiskScoreBadge score={riskScore} />
        </View>

        <Section title="Risk Factors">
          {riskFactors.length > 0 ? (
            <ChipGroup items={riskFactors} tone="danger" />
          ) : (
            <EmptyText>No risk factors identified.</EmptyText>
          )}
        </Section>

        <Section title="Protective Factors">
          {protectiveFactors.length > 0 ? (
            <ChipGroup items={protectiveFactors} tone="confirmed" />
          ) : (
            <EmptyText>No protective factors identified.</EmptyText>
          )}
        </Section>

        <Section title="30-Day Action Plan">
          <TimelineView entries={timeline} />
        </Section>

        <Section title="Eligible Programs">
          {programMatches.length > 0 ? (
            <View style={styles.programList}>
              {programMatches.map((match, i) => (
                <ProgramMatchCard key={`${match.name}-${i}`} match={match} />
              ))}
            </View>
          ) : (
            <EmptyText>No matching programs found.</EmptyText>
          )}
        </Section>

        <View style={styles.footer}>
          <PrimaryButton label="Start New Case" onPress={handleNewCase} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Small local components ---------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeader}>{title}</Text>
      {children}
    </View>
  );
}

function ChipGroup({
  items,
  tone,
}: {
  items: string[];
  tone: "danger" | "confirmed";
}) {
  const toneStyles =
    tone === "danger"
      ? {
          background: theme.colors.dangerLight,
          border: theme.colors.danger,
          text: theme.colors.danger,
        }
      : {
          background: theme.colors.fieldConfirmed,
          border: theme.colors.fieldConfirmedBorder,
          text: theme.colors.fieldConfirmedAccent,
        };

  return (
    <View style={styles.chipRow}>
      {items.map((item, i) => (
        <View
          key={`${item}-${i}`}
          style={[
            styles.chip,
            { backgroundColor: toneStyles.background, borderColor: toneStyles.border },
          ]}
        >
          <Text style={[styles.chipText, { color: toneStyles.text }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <Text style={styles.emptyText}>{children}</Text>;
}

function PrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={"button" as AccessibilityRole}
      accessibilityLabel={label}
      style={({ pressed }: { pressed: boolean }) => [
        styles.primaryButton,
        pressed && styles.primaryButtonPressed,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

// --- Styles -------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.lg,
  },
  badgeRow: {
    alignItems: "center",
    paddingVertical: theme.spacing.md,
  },
  section: {
    gap: theme.spacing.sm,
  },
  sectionHeader: {
    ...theme.typography.sectionHeader,
    color: theme.colors.textSecondary,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.full,
    borderWidth: 1,
  },
  chipText: {
    ...theme.typography.body,
  },
  programList: {
    gap: theme.spacing.md,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    fontStyle: "italic",
  },
  footer: {
    paddingTop: theme.spacing.lg,
  },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    ...theme.shadows.card,
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    ...theme.typography.h3,
    color: theme.colors.background,
  },
  statusScreen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  statusTitle: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
    textAlign: "center",
  },
  statusBody: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: theme.spacing.md,
  },
});
