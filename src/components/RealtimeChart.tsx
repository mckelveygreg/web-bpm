import { useMemo } from "react";
import { LineChart } from "@mui/x-charts/LineChart";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { useTheme, useMediaQuery, Box } from "@mui/material";
import type { BpmDataPoint } from "../types";

interface RealtimeChartProps {
  data: BpmDataPoint[];
  targetBpm: number | null;
  windowMs?: number;
}

const DEFAULT_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

export default function RealtimeChart({
  data,
  targetBpm,
  windowMs = DEFAULT_WINDOW_MS,
}: RealtimeChartProps) {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));

  const { xData, yData, yMin, yMax } = useMemo(() => {
    if (data.length === 0) {
      const bpmCenter = targetBpm ?? 120;
      return { xData: [0], yData: [null as unknown as number], yMin: bpmCenter - 20, yMax: bpmCenter + 20 };
    }

    const now = data[data.length - 1]!.timestamp;
    const cutoff = now - windowMs;
    const visible = data.filter((d) => d.timestamp >= cutoff);

    const x = visible.map((d) => Math.round(d.timestamp / 1000));
    const y = visible.map((d) => d.bpm);

    const allBpm = [...y];
    if (targetBpm) allBpm.push(targetBpm);

    const min = Math.min(...allBpm);
    const max = Math.max(...allBpm);
    const padding = Math.max(5, (max - min) * 0.15);

    return {
      xData: x.length > 0 ? x : [0],
      yData: y.length > 0 ? y : [null as unknown as number],
      yMin: Math.floor(min - padding),
      yMax: Math.ceil(max + padding),
    };
  }, [data, targetBpm, windowMs]);

  return (
    <Box sx={{ width: "100%", height: "100%", minHeight: isSmall ? 120 : 280 }}>
      <LineChart
        xAxis={[
          {
            data: xData,
            scaleType: "linear",
            valueFormatter: (v: number) => `${v}s`,
          },
        ]}
        yAxis={[
          {
            min: yMin,
            max: yMax,
          },
        ]}
        series={[
          {
            data: yData,
            showMark: false,
            color: theme.palette.primary.main,
            curve: "monotoneX",
          },
        ]}
        skipAnimation
        margin={isSmall ? { top: 10, right: 10, bottom: 24, left: 36 } : { top: 20, right: 20, bottom: 40, left: 50 }}
      >
        {targetBpm && (
          <ChartsReferenceLine
            y={targetBpm}
            lineStyle={{
              stroke: theme.palette.secondary.main,
              strokeDasharray: "6 4",
              strokeWidth: 2,
            }}
            labelStyle={{
              fill: theme.palette.secondary.main,
              fontSize: 12,
            }}
            label={`Target: ${targetBpm}`}
          />
        )}
      </LineChart>
    </Box>
  );
}
