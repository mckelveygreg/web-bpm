import { useCallback, useState } from "react";
import { Box, Snackbar, Alert } from "@mui/material";
import BpmDisplay from "../components/BpmDisplay";
import RealtimeChart from "../components/RealtimeChart";
import LiveControls from "../components/LiveControls";
import { useSession } from "../hooks/useSession";
import { useMetronome } from "../hooks/useMetronome";
import { usePictureInPicture } from "../hooks/usePictureInPicture";

export default function LivePage() {
  const session = useSession();
  const metronome = useMetronome();
  const pip = usePictureInPicture();

  // Keep PiP canvas in sync with live BPM state
  pip.update({
    bpm: session.currentBpm,
    isStable: session.isStable,
    confidence: session.confidence,
    audioLevel: session.audioLevel,
  });
  const [targetBpm, setTargetBpmLocal] = useState<number | null>(() => {
    const stored = localStorage.getItem("targetBpm");
    return stored ? parseInt(stored, 10) : null;
  });

  const setTargetBpm = useCallback(
    (bpm: number | null) => {
      setTargetBpmLocal(bpm);
      session.setTargetBpm(bpm);
      if (bpm !== null) {
        localStorage.setItem("targetBpm", String(bpm));
      } else {
        localStorage.removeItem("targetBpm");
      }
      if (bpm && metronome.isPlaying) {
        metronome.setBpm(bpm);
      }
    },
    [session.setTargetBpm, metronome.isPlaying, metronome.setBpm],
  );
  const [snack, setSnack] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const handleStart = useCallback(
    async (recordAudio: boolean) => {
      try {
        await session.start(recordAudio);
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
    },
    [session],
  );

  const handleStop = useCallback(async () => {
    try {
      const saved = await session.stop();
      setSnack({
        open: true,
        message: `Session "${saved.name}" saved`,
        severity: "success",
      });
    } catch {
      setSnack({
        open: true,
        message: "Failed to save session",
        severity: "error",
      });
    }
  }, [session]);

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
      <BpmDisplay
        bpm={session.currentBpm}
        isStable={session.isStable}
        confidence={session.confidence}
        audioLevel={session.audioLevel}
      />

      <Box sx={{ px: 2, flex: 1, minHeight: 0 }}>
        <RealtimeChart data={session.timeSeries} targetBpm={targetBpm} />
      </Box>

      <Box sx={{ px: 2, mt: 2 }}>
        <LiveControls
          isActive={session.isActive}
          elapsed={session.elapsed}
          isRecordingAudio={session.isRecordingAudio}
          targetBpm={targetBpm}
          onTargetBpmChange={setTargetBpm}
          metronomeActive={metronome.isPlaying}
          metronomeBeat={metronome.beat}
          onMetronomeToggle={() => {
            if (metronome.isPlaying) {
              metronome.stop();
            } else if (targetBpm) {
              metronome.start(targetBpm);
            }
          }}
          metadata={session.metadata}
          onMetadataChange={session.setMetadata}
          onStart={handleStart}
          onStop={handleStop}
          pipSupported={pip.isSupported}
          pipActive={pip.isActive}
          onPipToggle={pip.toggle}
        />
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
      >
        <Alert
          severity={snack.severity}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          variant="filled"
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
