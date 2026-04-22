import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Rect, Line, Circle } from "react-native-svg";

interface TunerGaugeProps {
  note: string | null;
  octave: number | null;
  frequency: number | null;
  cents: number;
  audioLevel: number;
}

function centsColor(c: number): string {
  const abs = Math.abs(c);
  if (abs <= 5) return "#4caf50";
  if (abs <= 15) return "#ff9800";
  return "#f44336";
}

const GAUGE_WIDTH = 280;
const GAUGE_HEIGHT = 20;

export default function TunerGauge({
  note,
  octave,
  frequency,
  cents,
  audioLevel,
}: TunerGaugeProps) {
  const dotColor = note ? centsColor(cents) : "#616161";
  const inTune = note !== null && Math.abs(cents) <= 5;

  // Map cents (-50..+50) to 0..GAUGE_WIDTH
  const needleX = Math.max(0, Math.min(GAUGE_WIDTH, (0.5 + (note ? cents : 0) / 100) * GAUGE_WIDTH));

  return (
    <View style={styles.container}>
      {/* Note name + octave */}
      <View style={styles.noteRow}>
        <Text style={[styles.noteText, !note && styles.noteTextDisabled]}>
          {note ?? "—"}
        </Text>
        {octave !== null && (
          <Text style={styles.octaveText}>{octave}</Text>
        )}
      </View>

      {/* Frequency readout */}
      <Text style={styles.freqText}>
        {frequency !== null ? `${frequency} Hz` : "—"}
      </Text>

      {/* In-tune indicator */}
      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: dotColor },
            note ? { shadowColor: dotColor, shadowOpacity: 0.8, shadowRadius: 4 } : undefined,
          ]}
        />
        <Text style={styles.statusLabel}>
          {!note ? "Listening" : inTune ? "In Tune" : `${cents > 0 ? "+" : ""}${cents}¢`}
        </Text>
      </View>

      {/* Cents gauge */}
      <View style={styles.gaugeContainer}>
        <Svg width={GAUGE_WIDTH} height={GAUGE_HEIGHT + 8}>
          {/* Background zones */}
          <Rect x={0} y={4} width={GAUGE_WIDTH * 0.35} height={GAUGE_HEIGHT} fill="rgba(244,67,54,0.15)" rx={0} />
          <Rect x={GAUGE_WIDTH * 0.35} y={4} width={GAUGE_WIDTH * 0.1} height={GAUGE_HEIGHT} fill="rgba(255,152,0,0.2)" />
          <Rect x={GAUGE_WIDTH * 0.45} y={4} width={GAUGE_WIDTH * 0.1} height={GAUGE_HEIGHT} fill="rgba(76,175,80,0.25)" />
          <Rect x={GAUGE_WIDTH * 0.55} y={4} width={GAUGE_WIDTH * 0.1} height={GAUGE_HEIGHT} fill="rgba(255,152,0,0.2)" />
          <Rect x={GAUGE_WIDTH * 0.65} y={4} width={GAUGE_WIDTH * 0.35} height={GAUGE_HEIGHT} fill="rgba(244,67,54,0.15)" rx={0} />

          {/* Center tick */}
          <Line
            x1={GAUGE_WIDTH / 2}
            y1={0}
            x2={GAUGE_WIDTH / 2}
            y2={GAUGE_HEIGHT + 8}
            stroke="#757575"
            strokeWidth={2}
          />

          {/* Needle */}
          <Circle
            cx={needleX}
            cy={4 + GAUGE_HEIGHT / 2}
            r={6}
            fill={note ? centsColor(cents) : "#616161"}
          />
        </Svg>

        {/* Scale labels */}
        <View style={styles.scaleLabels}>
          <Text style={styles.scaleLabel}>−50¢</Text>
          <Text style={styles.scaleLabel}>0</Text>
          <Text style={styles.scaleLabel}>+50¢</Text>
        </View>
      </View>

      {/* Audio level */}
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
    paddingVertical: 24,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  noteText: {
    fontSize: 80,
    fontWeight: "700",
    lineHeight: 88,
    color: "#ffffff",
  },
  noteTextDisabled: {
    color: "#616161",
  },
  octaveText: {
    fontSize: 36,
    fontWeight: "400",
    color: "#9e9e9e",
    lineHeight: 56,
    paddingBottom: 8,
  },
  freqText: {
    color: "#9e9e9e",
    fontSize: 16,
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
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
  gaugeContainer: {
    marginTop: 24,
    alignItems: "center",
    width: GAUGE_WIDTH,
  },
  scaleLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: GAUGE_WIDTH,
    marginTop: 2,
  },
  scaleLabel: {
    color: "#616161",
    fontSize: 11,
  },
  levelContainer: {
    width: "60%",
    marginTop: 24,
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
