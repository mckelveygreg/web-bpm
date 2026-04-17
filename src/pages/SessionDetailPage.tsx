import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import { LineChart } from "@mui/x-charts/LineChart";
import { useTheme, useMediaQuery } from "@mui/material";
import { getSession } from "../services/db";
import type { Session } from "../types";

interface SessionDetailPageProps {
  sessionId: string;
  onBack: () => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export default function SessionDetailPage({
  sessionId,
  onBack,
}: SessionDetailPageProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));

  useEffect(() => {
    void getSession(sessionId).then((s) => setSession(s ?? null));
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, [sessionId]);

  const { xData, yData, avgBpm, minBpm, maxBpm } = useMemo(() => {
    if (!session || session.bpmTimeSeries.length === 0) {
      return { xData: [0], yData: [0], avgBpm: 0, minBpm: 0, maxBpm: 0 };
    }
    const x = session.bpmTimeSeries.map((d) => Math.round(d.timestamp / 1000));
    const y: (number | null)[] = session.bpmTimeSeries.map((d) => d.bpm ?? null);
    const valid = y.filter((v): v is number => v !== null);
    if (valid.length === 0) {
      return { xData: x, yData: y, avgBpm: 0, minBpm: 0, maxBpm: 0 };
    }
    const avg = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
    return {
      xData: x,
      yData: y,
      avgBpm: avg,
      minBpm: Math.min(...valid),
      maxBpm: Math.max(...valid),
    };
  }, [session]);

  const handlePlayPause = useCallback(() => {
    if (!session?.audioBlob) return;

    if (!audioRef.current) {
      const url = URL.createObjectURL(session.audioBlob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audio.onended = () => setIsPlaying(false);
      audioRef.current = audio;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      void audioRef.current.play();
      setIsPlaying(true);
    }
  }, [session, isPlaying]);

  if (!session) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="text.secondary">Loading…</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ px: 2, py: 1, overflow: "auto", height: "100%" }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
        <IconButton onClick={onBack} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" noWrap sx={{ flex: 1 }}>
          {session.name}
        </Typography>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mb: 2 }}>
        <Chip label={`Avg ${avgBpm} BPM`} color="primary" />
        {session.targetBpm && (
          <Chip label={`Target ${session.targetBpm}`} color="secondary" />
        )}
        <Chip label={`${minBpm}–${maxBpm}`} variant="outlined" />
        <Chip label={formatDuration(session.duration)} variant="outlined" />
        {session.genre && <Chip label={session.genre} variant="outlined" />}
        {session.venue && <Chip label={session.venue} variant="outlined" />}
      </Stack>

      {session.bpmTimeSeries.length > 0 && (
        <Box sx={{ width: "100%", height: isSmall ? 200 : 280, mb: 2 }}>
          <LineChart
            xAxis={[
              {
                data: xData,
                label: "Time (s)",
                scaleType: "linear",
                valueFormatter: (v: number) => `${v}s`,
              },
            ]}
            yAxis={[
              {
                min: minBpm - 5,
                max: maxBpm + 5,
                label: "BPM",
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
            margin={{ top: 20, right: 20, bottom: 40, left: 50 }}
          />
        </Box>
      )}

      {session.audioBlob && (
        <Button
          variant="outlined"
          startIcon={isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
          onClick={handlePlayPause}
          fullWidth
          sx={{ mb: 2 }}
        >
          {isPlaying ? "Pause Audio" : "Play Audio"}
        </Button>
      )}

      {session.notes && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Notes
          </Typography>
          <Typography variant="body2">{session.notes}</Typography>
        </Box>
      )}

      <Typography variant="caption" color="text.disabled">
        {new Date(session.createdAt).toLocaleString()}
      </Typography>
    </Box>
  );
}
