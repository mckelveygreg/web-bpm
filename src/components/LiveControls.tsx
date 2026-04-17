import { useEffect, useState } from "react";
import {
  Box,
  Button,
  FormControlLabel,
  Switch,
  TextField,
  Stack,
  Chip,
  Collapse,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import MicIcon from "@mui/icons-material/Mic";
import MetronomeIcon from "@mui/icons-material/Timer";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import PictureInPictureAltIcon from "@mui/icons-material/PictureInPictureAlt";
import type { SessionMetadata } from "../hooks/useSession";

interface LiveControlsProps {
  isActive: boolean;
  elapsed: number;
  isRecordingAudio: boolean;
  targetBpm: number | null;
  onTargetBpmChange: (bpm: number | null) => void;
  metronomeActive: boolean;
  metronomeBeat: number;
  onMetronomeToggle: () => void;
  metadata: SessionMetadata;
  onMetadataChange: (metadata: SessionMetadata) => void;
  onStart: (recordAudio: boolean) => void;
  onStop: () => void;
  pipSupported?: boolean;
  pipActive?: boolean;
  onPipToggle?: () => void;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function LiveControls({
  isActive,
  elapsed,
  isRecordingAudio,
  targetBpm,
  onTargetBpmChange,
  metronomeActive,
  metronomeBeat,
  onMetronomeToggle,
  metadata,
  onMetadataChange,
  onStart,
  onStop,
  pipSupported,
  pipActive,
  onPipToggle,
}: LiveControlsProps) {
  const [recordAudio, setRecordAudio] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [targetBpmInput, setTargetBpmInput] = useState(
    targetBpm?.toString() ?? "",
  );

  const commitTargetBpm = () => {
    if (!targetBpmInput) {
      onTargetBpmChange(null);
      return;
    }
    const num = parseInt(targetBpmInput, 10);
    if (!isNaN(num) && num >= 30 && num <= 300) {
      onTargetBpmChange(num);
    } else {
      // Revert invalid input
      setTargetBpmInput(targetBpm?.toString() ?? "");
    }
  };

  return (
    <Box sx={{ px: 1 }}>
      {!isActive && (
        <Stack spacing={2} sx={{ mb: 2 }}>
          <MetronomeFlash beat={metronomeBeat} active={metronomeActive} />

          <TextField
            label="Target BPM (optional)"
            type="number"
            size="small"
            slotProps={{
              htmlInput: { min: 30, max: 300 },
            }}
            value={targetBpmInput}
            onChange={(e) => {
              const val = e.target.value;
              setTargetBpmInput(val);
              if (!val) {
                onTargetBpmChange(null);
                return;
              }
              const num = parseInt(val, 10);
              if (!isNaN(num) && num >= 30 && num <= 300) {
                onTargetBpmChange(num);
              }
            }}
            onBlur={commitTargetBpm}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTargetBpm();
            }}
            fullWidth
          />

          <Button
            variant={metronomeActive ? "contained" : "outlined"}
            color="secondary"
            startIcon={<MetronomeIcon />}
            onClick={onMetronomeToggle}
            disabled={!targetBpm}
          >
            {metronomeActive ? "Stop Metronome" : "Metronome"}
          </Button>

          <FormControlLabel
            control={
              <Switch
                checked={recordAudio}
                onChange={(e) => setRecordAudio(e.target.checked)}
                color="secondary"
              />
            }
            label="Record ambient audio"
          />

          <Button
            variant="text"
            size="small"
            onClick={() => setShowDetails(!showDetails)}
            endIcon={showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            sx={{ alignSelf: "flex-start" }}
          >
            Session details
          </Button>

          <Collapse in={showDetails}>
            <Stack spacing={1.5}>
              <TextField
                label="Session name"
                size="small"
                value={metadata.name}
                onChange={(e) =>
                  onMetadataChange({ ...metadata, name: e.target.value })
                }
                fullWidth
              />
              <TextField
                label="Venue"
                size="small"
                value={metadata.venue}
                onChange={(e) =>
                  onMetadataChange({ ...metadata, venue: e.target.value })
                }
                fullWidth
              />
              <TextField
                label="Genre"
                size="small"
                value={metadata.genre}
                onChange={(e) =>
                  onMetadataChange({ ...metadata, genre: e.target.value })
                }
                fullWidth
              />
              <TextField
                label="Notes"
                size="small"
                multiline
                rows={2}
                value={metadata.notes}
                onChange={(e) =>
                  onMetadataChange({ ...metadata, notes: e.target.value })
                }
                fullWidth
              />
            </Stack>
          </Collapse>
        </Stack>
      )}

      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        {!isActive ? (
          <Button
            variant="contained"
            color="primary"
            size="large"
            startIcon={<PlayArrowIcon />}
            onClick={() => onStart(recordAudio)}
            fullWidth
          >
            Start Session
          </Button>
        ) : (
          <>
            <Chip
              label={formatElapsed(elapsed)}
              variant="outlined"
              sx={{ fontVariantNumeric: "tabular-nums" }}
            />
            {isRecordingAudio && (
              <Chip
                icon={<MicIcon />}
                label="REC"
                color="error"
                size="small"
              />
            )}
            <Box sx={{ flex: 1 }} />
            {pipSupported && (
              <Button
                variant={pipActive ? "contained" : "outlined"}
                color="secondary"
                size="small"
                onClick={onPipToggle}
                sx={{ minWidth: 0, px: 1.5 }}
                title={pipActive ? "Exit floating BPM" : "Float BPM"}
              >
                <PictureInPictureAltIcon fontSize="small" />
              </Button>
            )}
            <Button
              variant="contained"
              color="error"
              startIcon={<StopIcon />}
              onClick={onStop}
            >
              Stop
            </Button>
          </>
        )}
      </Stack>
    </Box>
  );
}

function MetronomeFlash({ beat, active }: { beat: number; active: boolean }) {
  const [lit, setLit] = useState(false);

  useEffect(() => {
    if (beat === 0) return;
    setLit(true);
    const id = setTimeout(() => setLit(false), 120);
    return () => clearTimeout(id);
  }, [beat]);

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: 28,
        visibility: active ? "visible" : "hidden",
      }}
    >
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          backgroundColor: lit ? "secondary.main" : "grey.800",
          boxShadow: lit ? "0 0 16px 4px rgba(156,39,176,0.6)" : "none",
          transition: "all 0.08s ease-out",
        }}
      />
    </Box>
  );
}
