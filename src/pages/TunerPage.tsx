import { useCallback, useMemo, useRef, useState } from "react";
import { Box, Button, Snackbar, Alert, Typography, Stack, ToggleButton, ToggleButtonGroup } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import TunerGauge from "../components/TunerGauge";
import { usePitchDetector } from "../hooks/usePitchDetector";

// Natural note frequencies in octave 4
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

function noteLabel(note: string, mod: Modifier): string {
  if (mod === "♮") return note;
  return `${note}${mod}`;
}

export default function TunerPage() {
  const detector = usePitchDetector();
  const [playingNote, setPlayingNote] = useState<string | null>(null);
  const [modifier, setModifier] = useState<Modifier>("♮");
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const toneCtxRef = useRef<AudioContext | null>(null);
  const playingFreqRef = useRef<number>(0);
  const [snack, setSnack] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const stopTone = useCallback(() => {
    if (gainRef.current && oscRef.current) {
      const now = toneCtxRef.current!.currentTime;
      gainRef.current.gain.cancelScheduledValues(now);
      gainRef.current.gain.setValueAtTime(gainRef.current.gain.value, now);
      gainRef.current.gain.linearRampToValueAtTime(0, now + 0.05);
      oscRef.current.stop(now + 0.05);
    }
    oscRef.current = null;
    gainRef.current = null;
    setPlayingNote(null);
  }, []);

  const playTone = useCallback(
    (note: string, baseFreq: number) => {
      // Toggle off if same note
      if (playingNote === note) {
        stopTone();
        return;
      }

      // Stop any existing tone
      if (oscRef.current) {
        stopTone();
      }

      if (!toneCtxRef.current) {
        toneCtxRef.current = new AudioContext();
      }
      const ctx = toneCtxRef.current;

      const freq = applyModifier(baseFreq, modifier);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);

      osc.connect(gain).connect(ctx.destination);
      osc.start();

      oscRef.current = osc;
      gainRef.current = gain;
      playingFreqRef.current = baseFreq;
      setPlayingNote(note);
    },
    [playingNote, modifier, stopTone],
  );

  // Update oscillator frequency when modifier changes while a tone is playing
  const handleModifierChange = useCallback(
    (_: unknown, value: Modifier | null) => {
      if (value === null) return;
      setModifier(value);
      if (oscRef.current && playingFreqRef.current) {
        oscRef.current.frequency.value = applyModifier(
          playingFreqRef.current,
          value,
        );
      }
    },
    [],
  );

  // Label for the currently playing tone
  const playingLabel = useMemo(() => {
    if (!playingNote) return null;
    return noteLabel(playingNote, modifier);
  }, [playingNote, modifier]);

  const handleToggle = useCallback(async () => {
    if (detector.isActive) {
      await detector.stop();
    } else {
      try {
        await detector.start();
      } catch (err) {
        setSnack({
          open: true,
          message:
            err instanceof Error
              ? err.message
              : "Microphone access is required",
          severity: "error",
        });
      }
    }
  }, [detector]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "auto",
        pb: 2,
      }}
    >
      <TunerGauge
        note={detector.note}
        octave={detector.octave}
        frequency={detector.frequency}
        cents={detector.cents}
        audioLevel={detector.audioLevel}
      />

      <Box sx={{ px: 3, mt: 2 }}>
        <Stack spacing={3}>
          {/* Reference tones */}
          <Box>
            <Typography
              variant="caption"
              sx={{ color: "text.secondary", mb: 1, display: "flex", alignItems: "center", gap: 0.5 }}
            >
              {playingLabel ? <VolumeUpIcon sx={{ fontSize: 14 }} /> : <VolumeOffIcon sx={{ fontSize: 14 }} />}
              {playingLabel ? `Playing ${playingLabel}` : "Reference tones"}
            </Typography>
            <Stack spacing={1}>
              <ToggleButtonGroup
                value={modifier}
                exclusive
                onChange={handleModifierChange}
                size="small"
                sx={{
                  alignSelf: "center",
                  "& .MuiToggleButton-root": {
                    px: 2.5,
                    fontWeight: 600,
                  },
                  "& .Mui-selected": {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    "&:hover": { bgcolor: "primary.dark" },
                  },
                }}
              >
                <ToggleButton value="♭">♭</ToggleButton>
                <ToggleButton value="♮">♮</ToggleButton>
                <ToggleButton value="♯">♯</ToggleButton>
              </ToggleButtonGroup>
              <ToggleButtonGroup
                value={playingNote}
                exclusive
                fullWidth
                size="small"
                sx={{
                  "& .MuiToggleButton-root": {
                    flex: 1,
                    fontWeight: 600,
                    fontSize: "0.95rem",
                    py: 1,
                  },
                  "& .Mui-selected": {
                    bgcolor: "secondary.main",
                    color: "secondary.contrastText",
                    "&:hover": { bgcolor: "secondary.dark" },
                  },
                }}
              >
                {NATURAL_NOTES.map((t) => (
                  <ToggleButton
                    key={t.note}
                    value={t.note}
                    onClick={() => playTone(t.note, t.freq)}
                  >
                    {t.note}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Stack>
          </Box>

          {/* Start / Stop */}
          <Button
            variant="contained"
            color={detector.isActive ? "error" : "primary"}
            size="large"
            startIcon={detector.isActive ? <MicOffIcon /> : <MicIcon />}
            onClick={handleToggle}
            fullWidth
          >
            {detector.isActive ? "Stop" : "Start Tuner"}
          </Button>
        </Stack>
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
      >
        <Alert
          severity={snack.severity}
          variant="filled"
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
