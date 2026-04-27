import React, { useMemo } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Polyline, Line, Defs, LinearGradient, Stop, Rect } from "react-native-svg";

export interface BpmDataPoint {
  timestamp: number;
  bpm: number | null;
  confidence: number;
}

interface RealtimeChartProps {
  data: BpmDataPoint[];
  targetBpm: number | null;
  windowMs?: number;
}

const DEFAULT_WINDOW_MS = 3 * 60 * 1000; // 3 minutes
const CHART_HEIGHT = 200;
const PADDING = { top: 12, right: 12, bottom: 28, left: 40 };

export default function RealtimeChart({
  data,
  targetBpm,
  windowMs = DEFAULT_WINDOW_MS,
}: RealtimeChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 32; // subtract horizontal padding

  const { points, targetY, yMin, yMax, xLabels, yLabels } = useMemo(() => {
    const innerW = chartWidth - PADDING.left - PADDING.right;
    const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

    if (data.length === 0) {
      const center = targetBpm ?? 120;
      const min = center - 20;
      const max = center + 20;
      return {
        points: "",
        targetY: targetBpm ? PADDING.top + innerH / 2 : null,
        yMin: min,
        yMax: max,
        xLabels: [] as string[],
        yLabels: [String(min), String(Math.round((min + max) / 2)), String(max)],
      };
    }

    const now = data[data.length - 1]!.timestamp;
    const cutoff = now - windowMs;
    const visible = data.filter((d) => d.timestamp >= cutoff);
    if (visible.length === 0) {
      return {
        points: "",
        targetY: null,
        yMin: targetBpm ? targetBpm - 20 : 100,
        yMax: targetBpm ? targetBpm + 20 : 140,
        xLabels: [],
        yLabels: [],
      };
    }

    const validBpm = visible.map((d) => d.bpm).filter((v): v is number => v !== null);
    if (targetBpm) validBpm.push(targetBpm);

    const rawMin = validBpm.length > 0 ? Math.min(...validBpm) : (targetBpm ?? 100);
    const rawMax = validBpm.length > 0 ? Math.max(...validBpm) : (targetBpm ?? 140);
    const padding = Math.max(5, (rawMax - rawMin) * 0.15);
    const yMinVal = Math.floor(rawMin - padding);
    const yMaxVal = Math.ceil(rawMax + padding);
    const yRange = yMaxVal - yMinVal || 1;

    const xRange = visible[visible.length - 1]!.timestamp - visible[0]!.timestamp || 1;

    const toX = (ts: number) => PADDING.left + ((ts - visible[0]!.timestamp) / xRange) * innerW;
    const toY = (bpm: number) => PADDING.top + (1 - (bpm - yMinVal) / yRange) * innerH;

    // Build polyline points (skip null bpm)
    const ptParts: string[] = [];
    visible.forEach((d) => {
      if (d.bpm !== null) {
        ptParts.push(`${toX(d.timestamp).toFixed(1)},${toY(d.bpm).toFixed(1)}`);
      }
    });

    const targetYVal = targetBpm ? toY(targetBpm) : null;

    // X axis labels (start and end in seconds)
    const startSec = Math.round(visible[0]!.timestamp / 1000);
    const endSec = Math.round(visible[visible.length - 1]!.timestamp / 1000);
    const xLbls = [`${startSec}s`, `${endSec}s`];

    // Y axis labels
    const yLbls = [String(yMaxVal), String(Math.round((yMinVal + yMaxVal) / 2)), String(yMinVal)];

    return {
      points: ptParts.join(" "),
      targetY: targetYVal,
      yMin: yMinVal,
      yMax: yMaxVal,
      xLabels: xLbls,
      yLabels: yLbls,
    };
  }, [data, targetBpm, windowMs, chartWidth]);

  const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  return (
    <View style={[styles.container, { width: chartWidth, height: CHART_HEIGHT + 20 }]}>
      <Svg width={chartWidth} height={CHART_HEIGHT}>
        <Defs>
          <LinearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#7c4dff" stopOpacity="1" />
            <Stop offset="100%" stopColor="#7c4dff" stopOpacity="0.3" />
          </LinearGradient>
        </Defs>

        {/* Chart background */}
        <Rect
          x={PADDING.left}
          y={PADDING.top}
          width={chartWidth - PADDING.left - PADDING.right}
          height={innerH}
          fill="#1a1a2e"
          rx={4}
        />

        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((frac) => (
          <Line
            key={frac}
            x1={PADDING.left}
            y1={PADDING.top + frac * innerH}
            x2={chartWidth - PADDING.right}
            y2={PADDING.top + frac * innerH}
            stroke="#333355"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        ))}

        {/* Target BPM reference line */}
        {targetY !== null && (
          <Line
            x1={PADDING.left}
            y1={targetY}
            x2={chartWidth - PADDING.right}
            y2={targetY}
            stroke="#ff4081"
            strokeWidth={1.5}
            strokeDasharray="6,4"
          />
        )}

        {/* BPM line */}
        {points.length > 0 && (
          <Polyline
            points={points}
            fill="none"
            stroke="#7c4dff"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </Svg>

      {/* Y-axis labels */}
      <View style={[styles.yLabels, { height: CHART_HEIGHT }]}>
        {yLabels.map((label, i) => (
          <Text
            key={i}
            style={[
              styles.axisLabel,
              { position: "absolute", top: PADDING.top + (i / 2) * innerH - 8, right: 0 },
            ]}
          >
            {label}
          </Text>
        ))}
      </View>

      {/* X-axis labels */}
      {xLabels.length >= 2 && (
        <View
          style={[
            styles.xLabels,
            { width: chartWidth - PADDING.left - PADDING.right, marginLeft: PADDING.left },
          ]}
        >
          <Text style={styles.axisLabel}>{xLabels[0]}</Text>
          <Text style={styles.axisLabel}>{xLabels[1]}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  yLabels: {
    position: "absolute",
    left: 0,
    top: 0,
    width: PADDING.left - 2,
  },
  xLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  axisLabel: {
    color: "#616161",
    fontSize: 10,
    textAlign: "right",
  },
});
