import { Box, LinearProgress, Typography } from "@mui/material";
import { keyframes } from "@emotion/react";

interface BpmDisplayProps {
  bpm: number | null;
  isStable: boolean;
  confidence: number;
  audioLevel: number;
}

const pulse = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
`;

function getStabilityColor(isStable: boolean, confidence: number): string {
  if (isStable) return "#4caf50"; // green
  if (confidence >= 0.1) return "#ff9800"; // orange/yellow
  return "#f44336"; // red
}

function getStabilityLabel(isStable: boolean, confidence: number): string {
  if (isStable) return "Locked";
  if (confidence >= 0.1) return "Settling";
  return "Listening";
}

export default function BpmDisplay({
  bpm,
  isStable,
  confidence,
  audioLevel,
}: BpmDisplayProps) {
  const color = getStabilityColor(isStable, confidence);
  const label = getStabilityLabel(isStable, confidence);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 1,
      }}
    >
      <Typography
        variant="h1"
        sx={{
          fontSize: "4.5rem",
          fontWeight: 700,
          lineHeight: 1,
          color: bpm ? "text.primary" : "text.disabled",
          animation: bpm ? `${pulse} 1s ease-in-out infinite` : "none",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {bpm !== null ? bpm.toFixed(2) : "—"}
      </Typography>
      <Typography
        variant="h6"
        sx={{ color: "text.secondary", letterSpacing: 2, mt: 0.5 }}
      >
        BPM
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mt: 1,
        }}
      >
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: bpm ? color : "grey.700",
            boxShadow: bpm ? `0 0 8px ${color}` : "none",
          }}
        />
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {bpm ? label : "Idle"}
        </Typography>
      </Box>

      {audioLevel > 0 && (
        <Box sx={{ width: "60%", mt: 2 }}>
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
