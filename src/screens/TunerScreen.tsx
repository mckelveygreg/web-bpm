import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TunerGauge from "../components/TunerGauge";
import { usePitchDetector } from "../hooks/usePitchDetector";

// Natural notes in octave 4
const NATURAL_NOTES = [
  { note: "C", freq: 261.63 },
  { note: "D", freq: 293.66 },
  { note: "E", freq: 329.63 },
  { note: "F", freq: 349.23 },
  { note: "G", freq: 392.0 },
  { note: "A", freq: 440.0 },
  { note: "B", freq: 493.88 },
] as const;

const SEMITONE = Math.pow(2, 1 / 12);

type Modifier = "♮" | "♯" | "♭";

function applyModifier(freq: number, mod: Modifier): number {
  if (mod === "♯") return freq * SEMITONE;
  if (mod === "♭") return freq / SEMITONE;
  return freq;
}

export default function TunerScreen() {
  const detector = usePitchDetector();
  const [modifier, setModifier] = useState<Modifier>("♮");
  // Reference tone playback is not implemented in this MVP
  // (would require expo-av Audio.Sound)

  const handleToggle = useCallback(async () => {
    if (detector.isActive) {
      await detector.stop();
    } else {
      try {
        await detector.start();
      } catch (err) {
        Alert.alert(
          "Error",
          err instanceof Error ? err.message : "Microphone access is required",
        );
      }
    }
  }, [detector]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <TunerGauge
          note={detector.note}
          octave={detector.octave}
          frequency={detector.frequency}
          cents={detector.cents}
          audioLevel={detector.audioLevel}
        />

        <View style={styles.controls}>
          {/* Modifier selector (♭ ♮ ♯) */}
          <View style={styles.modifierRow}>
            {(["♭", "♮", "♯"] as Modifier[]).map((mod) => (
              <TouchableOpacity
                key={mod}
                style={[
                  styles.modButton,
                  modifier === mod && styles.modButtonSelected,
                ]}
                onPress={() => setModifier(mod)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.modButtonText,
                    modifier === mod && styles.modButtonTextSelected,
                  ]}
                >
                  {mod}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Reference note buttons */}
          <View style={styles.noteRow}>
            {NATURAL_NOTES.map((t) => {
              const freq = applyModifier(t.freq, modifier);
              return (
                <TouchableOpacity
                  key={t.note}
                  style={styles.noteButton}
                  onPress={() => {
                    // Reference tone playback placeholder
                    console.log(`Play ${t.note} at ${freq.toFixed(1)} Hz`);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.noteButtonText}>{t.note}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Start / Stop */}
          <TouchableOpacity
            style={[
              styles.button,
              detector.isActive ? styles.buttonStop : styles.buttonStart,
            ]}
            onPress={handleToggle}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {detector.isActive ? "Stop" : "Start Tuner"}
            </Text>
          </TouchableOpacity>
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
  controls: {
    paddingHorizontal: 16,
    gap: 16,
    marginTop: 8,
  },
  modifierRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  modButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#424242",
    backgroundColor: "#1e1e1e",
  },
  modButtonSelected: {
    backgroundColor: "#7c4dff",
    borderColor: "#7c4dff",
  },
  modButtonText: {
    color: "#9e9e9e",
    fontSize: 18,
    fontWeight: "600",
  },
  modButtonTextSelected: {
    color: "#ffffff",
  },
  noteRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
  },
  noteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#1e1e1e",
    borderWidth: 1,
    borderColor: "#424242",
    alignItems: "center",
  },
  noteButtonText: {
    color: "#e0e0e0",
    fontSize: 15,
    fontWeight: "600",
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
  buttonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
});
