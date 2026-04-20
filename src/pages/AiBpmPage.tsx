import { useCallback, useState } from "react";
import { Box, Button, Snackbar, Alert, CircularProgress, TextField, InputAdornment } from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import BpmDisplay from "../components/BpmDisplay";
import RealtimeChart from "../components/RealtimeChart";
import { useBeatNetAnalyzer } from "../hooks/useBeatNetAnalyzer";

export default function AiBpmPage() {
  const analyzer = useBeatNetAnalyzer();
  const [targetBpmInput, setTargetBpmInput] = useState("");

  const handleTargetBpmChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setTargetBpmInput(val);
      const num = parseInt(val, 10);
      if (val === "" || isNaN(num)) {
        analyzer.setTempoPrior(null);
      } else if (num >= 40 && num <= 240) {
        analyzer.setTempoPrior(num);
      }
    },
    [analyzer],
  );

  const [snack, setSnack] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const handleToggle = useCallback(async () => {
    if (analyzer.isActive) {
      await analyzer.stop();
    } else {
      try {
        await analyzer.start();
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
  }, [analyzer]);

  const handleLoadModel = useCallback(async () => {
    try {
      await analyzer.initModel();
      setSnack({
        open: true,
        message: "BeatNet model loaded",
        severity: "success",
      });
    } catch (err) {
      setSnack({
        open: true,
        message:
          err instanceof Error ? err.message : "Failed to load model",
        severity: "error",
      });
    }
  }, [analyzer]);

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
        bpm={analyzer.currentBpm}
        isStable={analyzer.isStable}
        confidence={analyzer.confidence}
        audioLevel={analyzer.audioLevel}
      />

      <Box sx={{ px: 2, flex: 1, minHeight: 0 }}>
        <RealtimeChart data={analyzer.timeSeries} targetBpm={targetBpmInput ? parseInt(targetBpmInput, 10) || null : null} />
      </Box>

      <Box sx={{ px: 2, mt: 2, display: "flex", gap: 2, justifyContent: "center", alignItems: "center" }}>
        <TextField
          label="Target BPM"
          type="number"
          size="small"
          value={targetBpmInput}
          onChange={handleTargetBpmChange}
          slotProps={{
            input: {
              endAdornment: <InputAdornment position="end">bpm</InputAdornment>,
            },
            htmlInput: { min: 40, max: 240, step: 1 },
          }}
          sx={{ width: 140 }}
          helperText="Helps resolve half/double time"
        />
        {!analyzer.modelReady && !analyzer.modelLoading && (
          <Button
            variant="outlined"
            startIcon={<SmartToyIcon />}
            onClick={handleLoadModel}
          >
            Load AI Model
          </Button>
        )}

        {analyzer.modelLoading && (
          <Button variant="outlined" disabled startIcon={<CircularProgress size={20} />}>
            Loading Model…
          </Button>
        )}

        {analyzer.modelReady && (
          <Button
            variant="contained"
            color={analyzer.isActive ? "error" : "primary"}
            onClick={handleToggle}
            startIcon={<SmartToyIcon />}
          >
            {analyzer.isActive ? "Stop" : "Start AI BPM"}
          </Button>
        )}
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
