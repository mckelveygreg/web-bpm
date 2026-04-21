import { Audio } from "expo-av";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function estimateBpmFromTapTimes(tapTimes: number[]) {
  if (tapTimes.length < 2) return null;
  const intervals: number[] = [];
  for (let i = 1; i < tapTimes.length; i++) {
    const delta = tapTimes[i]! - tapTimes[i - 1]!;
    // Keep realistic tempo range only (30 - 260 BPM)
    if (delta >= 230 && delta <= 2000) {
      intervals.push(delta);
    }
  }

  const med = median(intervals);
  if (!med) return null;
  return Math.round((60000 / med) * 10) / 10;
}

export default function App() {
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [micStatus, setMicStatus] = useState<
    "unknown" | "granted" | "denied"
  >("unknown");

  const bpm = useMemo(() => estimateBpmFromTapTimes(tapTimes), [tapTimes]);

  const onTap = () => {
    const now = Date.now();
    setTapTimes((prev) => {
      const windowed = prev.filter((t) => now - t <= 10000);
      return [...windowed, now].slice(-10);
    });
  };

  const reset = () => {
    setTapTimes([]);
  };

  const requestMic = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      setMicStatus(perm.granted ? "granted" : "denied");
      if (perm.granted) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }
    } catch {
      setMicStatus("denied");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Web BPM Native</Text>
        <Text style={styles.subtitle}>Tap tempo is live now. Realtime mic BPM is next.</Text>

        <View style={styles.bpmBox}>
          <Text style={styles.bpmLabel}>BPM</Text>
          <Text style={styles.bpmValue}>{bpm ?? "--"}</Text>
        </View>

        <Pressable style={styles.tapButton} onPress={onTap}>
          <Text style={styles.tapButtonText}>Tap</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={reset}>
          <Text style={styles.secondaryButtonText}>Reset taps</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Microphone</Text>
        <Text style={styles.micText}>
          Status: {micStatus}
        </Text>
        <Pressable style={styles.secondaryButton} onPress={requestMic}>
          <Text style={styles.secondaryButtonText}>Request microphone access</Text>
        </Pressable>
      </View>

      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0f14",
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: "#171b24",
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  title: {
    color: "#f2f5ff",
    fontSize: 26,
    fontWeight: "800",
  },
  subtitle: {
    color: "#b3bfd6",
    fontSize: 14,
  },
  bpmBox: {
    alignItems: "center",
    paddingVertical: 8,
  },
  bpmLabel: {
    color: "#9aa7c2",
    fontSize: 14,
    letterSpacing: 1,
  },
  bpmValue: {
    color: "#ffffff",
    fontSize: 64,
    fontWeight: "900",
  },
  tapButton: {
    backgroundColor: "#5e7cff",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  tapButtonText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
  },
  secondaryButton: {
    borderColor: "#4c5872",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#d9e3ff",
    fontSize: 15,
    fontWeight: "600",
  },
  sectionTitle: {
    color: "#f2f5ff",
    fontSize: 18,
    fontWeight: "700",
  },
  micText: {
    color: "#b3bfd6",
    fontSize: 14,
  },
});
