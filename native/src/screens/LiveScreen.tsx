import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BpmDisplay from "../components/BpmDisplay";
import RealtimeChart from "../components/RealtimeChart";
import { useBeatNetAnalyzer } from "../hooks/useBeatNetAnalyzer";

export default function LiveScreen() {
  const analyzer = useBeatNetAnalyzer();
  const [targetBpm, setTargetBpm] = useState<number | null>(null);
  const [targetInput, setTargetInput] = useState("");

  const handleStart = useCallback(async () => {
    try {
      await analyzer.start();
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Microphone access is required",
      );
    }
  }, [analyzer]);

  const handleStop = useCallback(async () => {
    await analyzer.stop();
  }, [analyzer]);

  const handleSetTarget = useCallback(() => {
    const bpm = parseInt(targetInput, 10);
    if (!isNaN(bpm) && bpm > 0 && bpm < 400) {
      setTargetBpm(bpm);
      analyzer.setTempoPrior(bpm);
    } else {
      setTargetBpm(null);
      analyzer.setTempoPrior(null);
    }
  }, [targetInput, analyzer]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <BpmDisplay
          bpm={analyzer.currentBpm}
          isStable={analyzer.isStable}
          confidence={analyzer.confidence}
          audioLevel={analyzer.audioLevel}
        />

        <View style={styles.chartContainer}>
          <RealtimeChart
            data={analyzer.timeSeries}
            targetBpm={targetBpm}
          />
        </View>

        <View style={styles.controls}>
          {/* Start / Stop button */}
          {analyzer.isActive ? (
            <TouchableOpacity
              style={[styles.button, styles.buttonStop]}
              onPress={handleStop}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Stop</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.button,
                styles.buttonStart,
                analyzer.modelLoading && styles.buttonDisabled,
              ]}
              onPress={handleStart}
              disabled={analyzer.modelLoading}
              activeOpacity={0.8}
            >
              {analyzer.modelLoading ? (
                <View style={styles.buttonInner}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.buttonText}>Loading Model…</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>Start Listening</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Confidence indicator */}
          {analyzer.isActive && (
            <View style={styles.confidenceRow}>
              <Text style={styles.metaLabel}>Confidence</Text>
              <View style={styles.progressBg}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${analyzer.confidence * 100}%`,
                      backgroundColor:
                        analyzer.confidence > 0.5
                          ? "#4caf50"
                          : analyzer.confidence > 0.1
                            ? "#ff9800"
                            : "#f44336",
                    },
                  ]}
                />
              </View>
              <Text style={styles.metaValue}>{Math.round(analyzer.confidence * 100)}%</Text>
            </View>
          )}

          {/* Status text */}
          {!analyzer.isActive && !analyzer.modelLoading && (
            <Text style={styles.hint}>
              Tap "Start Listening" to detect BPM in real time using AI beat tracking.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  chartContainer: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  controls: {
    paddingHorizontal: 16,
    marginTop: 24,
    gap: 16,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonStart: {
    backgroundColor: "#7c4dff",
  },
  buttonStop: {
    backgroundColor: "#f44336",
  },
  buttonDisabled: {
    backgroundColor: "#424242",
  },
  buttonInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  confidenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaLabel: {
    color: "#9e9e9e",
    fontSize: 13,
    width: 80,
  },
  metaValue: {
    color: "#9e9e9e",
    fontSize: 13,
    width: 36,
    textAlign: "right",
  },
  progressBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#424242",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  hint: {
    color: "#757575",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
});
