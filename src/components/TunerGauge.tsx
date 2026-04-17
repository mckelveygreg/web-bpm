import { Box, LinearProgress, Typography } from "@mui/material";

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

export default function TunerGauge({
  note,
  octave,
  frequency,
  cents,
  audioLevel,
}: TunerGaugeProps) {
  const color = note ? centsColor(cents) : "grey.700";
  const inTune = note !== null && Math.abs(cents) <= 5;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 3,
      }}
    >
      {/* Note name + octave */}
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
        <Typography
          variant="h1"
          sx={{
            fontSize: "7rem",
            fontWeight: 700,
            lineHeight: 1,
            color: note ? "text.primary" : "text.disabled",
          }}
        >
          {note ?? "—"}
        </Typography>
        {octave !== null && (
          <Typography
            variant="h3"
            sx={{
              fontSize: "2.5rem",
              fontWeight: 400,
              color: "text.secondary",
              lineHeight: 1,
            }}
          >
            {octave}
          </Typography>
        )}
      </Box>

      {/* Frequency readout */}
      <Typography
        variant="body1"
        sx={{
          color: "text.secondary",
          mt: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {frequency !== null ? `${frequency} Hz` : "—"}
      </Typography>

      {/* In-tune indicator */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2 }}>
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: color,
            boxShadow: note ? `0 0 8px ${typeof color === "string" ? color : ""}` : "none",
          }}
        />
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {!note ? "Listening" : inTune ? "In Tune" : `${cents > 0 ? "+" : ""}${cents}¢`}
        </Typography>
      </Box>

      {/* Cents gauge */}
      <Box sx={{ width: "80%", mt: 3, position: "relative" }}>
        {/* Background bar with colored zones */}
        <Box
          sx={{
            height: 12,
            borderRadius: 6,
            overflow: "hidden",
            display: "flex",
            bgcolor: "grey.800",
          }}
        >
          {/* Red left */}
          <Box sx={{ flex: 35, bgcolor: "rgba(244,67,54,0.15)" }} />
          {/* Yellow left */}
          <Box sx={{ flex: 10, bgcolor: "rgba(255,152,0,0.2)" }} />
          {/* Green center */}
          <Box sx={{ flex: 10, bgcolor: "rgba(76,175,80,0.25)" }} />
          {/* Yellow right */}
          <Box sx={{ flex: 10, bgcolor: "rgba(255,152,0,0.2)" }} />
          {/* Red right */}
          <Box sx={{ flex: 35, bgcolor: "rgba(244,67,54,0.15)" }} />
        </Box>

        {/* Center tick mark */}
        <Box
          sx={{
            position: "absolute",
            left: "50%",
            top: -2,
            transform: "translateX(-50%)",
            width: 2,
            height: 16,
            bgcolor: "grey.500",
            borderRadius: 1,
          }}
        />

        {/* Needle */}
        <Box
          sx={{
            position: "absolute",
            top: -4,
            // Map cents (-50..+50) to 0%..100%
            left: `${50 + (note ? cents : 0)}%`,
            transform: "translateX(-50%)",
            width: 8,
            height: 20,
            borderRadius: 4,
            bgcolor: note ? centsColor(cents) : "grey.600",
            boxShadow: note ? `0 0 6px ${centsColor(cents)}` : "none",
            transition: "left 0.08s linear, background-color 0.15s ease",
          }}
        />

        {/* Scale labels */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mt: 0.5,
          }}
        >
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            −50¢
          </Typography>
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            0
          </Typography>
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            +50¢
          </Typography>
        </Box>
      </Box>

      {/* Audio level */}
      {audioLevel > 0 && (
        <Box sx={{ width: "60%", mt: 3 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              mb: 0.5,
            }}
          >
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Mic Level
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {Math.round(audioLevel * 100)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={audioLevel * 100}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: "grey.800",
              "& .MuiLinearProgress-bar": {
                borderRadius: 4,
                backgroundColor:
                  audioLevel > 0.7
                    ? "#4caf50"
                    : audioLevel > 0.3
                      ? "#ff9800"
                      : "#f44336",
                transition: "transform 0.1s linear",
              },
            }}
          />
        </Box>
      )}
    </Box>
  );
}
