import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface BpmDisplayProps {
  bpm: number | null;
  isStable: boolean;
  confidence: number;
  audioLevel: number;
}

function getStabilityColor(isStable: boolean, confidence: number): string {
  if (isStable) return "#4caf50";
  if (confidence >= 0.1) return "#ff9800";
  return "#f44336";
}

function getStabilityLabel(isStable: boolean, confidence: number): string {
  if (isStable) return "Locked";
  if (confidence >= 0.1) return "Settling";
  return "Listening";
}

export default function BpmDisplay({ bpm, isStable, confidence, audioLevel }: BpmDisplayProps) {
  const color = getStabilityColor(isStable, confidence);
  const label = getStabilityLabel(isStable, confidence);

  return (
    <View style={styles.container}>
      <Text style={[styles.bpmText, !bpm && styles.bpmTextDisabled]}>
        {bpm !== null ? bpm.toFixed(2) : "—"}
      </Text>
      <Text style={styles.bpmLabel}>BPM</Text>

      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: bpm ? color : "#616161" },
            bpm ? { shadowColor: color, shadowOpacity: 0.8, shadowRadius: 4 } : undefined,
          ]}
        />
        <Text style={styles.statusLabel}>{bpm ? label : "Idle"}</Text>
      </View>

      {audioLevel > 0 && (
        <View style={styles.levelContainer}>
          <View style={styles.levelHeader}>
            <Text style={styles.levelLabel}>Mic Level</Text>
            <Text style={styles.levelLabel}>{Math.round(audioLevel * 100)}%</Text>
          </View>
          <View style={styles.levelBarBg}>
            <View
              style={[
                styles.levelBarFill,
                {
                  width: `${audioLevel * 100}%`,
                  backgroundColor:
                    audioLevel > 0.7 ? "#4caf50" : audioLevel > 0.3 ? "#ff9800" : "#f44336",
                },
              ]}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  bpmText: {
    fontSize: 72,
    fontWeight: "700",
    lineHeight: 80,
    color: "#ffffff",
    fontVariant: ["tabular-nums"],
  },
  bpmTextDisabled: {
    color: "#616161",
  },
  bpmLabel: {
    fontSize: 18,
    fontWeight: "400",
    color: "#9e9e9e",
    letterSpacing: 4,
    marginTop: 4,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusLabel: {
    color: "#9e9e9e",
    fontSize: 14,
  },
  levelContainer: {
    width: "60%",
    marginTop: 16,
  },
  levelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  levelLabel: {
    color: "#9e9e9e",
    fontSize: 12,
  },
  levelBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#424242",
    overflow: "hidden",
  },
  levelBarFill: {
    height: "100%",
    borderRadius: 4,
  },
});
