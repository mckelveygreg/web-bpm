import { type ReactNode, useCallback } from "react";
import {
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  IconButton,
  Toolbar,
  Typography,
} from "@mui/material";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import HistoryIcon from "@mui/icons-material/History";
import TuneIcon from "@mui/icons-material/Tune";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import GitHubIcon from "@mui/icons-material/GitHub";

export type Tab = "live" | "sessions" | "tuner" | "ai-bpm";

interface LayoutProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  children: ReactNode;
}

const REPO_URL = "https://github.com/mckelveygreg/web-bpm";

export default function Layout({ tab, onTabChange, children }: LayoutProps) {
  const handleTabChange = useCallback(
    (_: unknown, value: string) => {
      onTabChange(value as Tab);
    },
    [onTabChange],
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "background.default",
      }}
    >
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar variant="dense">
          <GraphicEqIcon sx={{ mr: 1, color: "primary.main" }} />
          <Typography
            variant="h6"
            sx={{ flex: 1, fontWeight: 700, letterSpacing: 1 }}
          >
            Web BPM
          </Typography>
          <Typography
            variant="caption"
            sx={{ mr: 1, color: "text.secondary", fontFamily: "monospace" }}
          >
            {__APP_VERSION__} ({__COMMIT_SHA__})
          </Typography>
          <IconButton
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            color="inherit"
            aria-label="View source on GitHub"
          >
            <GitHubIcon fontSize="small" />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, overflow: "hidden" }}>{children}</Box>

      <BottomNavigation
        value={tab}
        onChange={handleTabChange}
        showLabels
        sx={{
          bgcolor: "background.paper",
          borderTop: 1,
          borderColor: "divider",
          pb: "env(safe-area-inset-bottom)",
        }}
      >
        <BottomNavigationAction
          label="Live"
          value="live"
          icon={<GraphicEqIcon />}
        />
        <BottomNavigationAction
          label="Sessions"
          value="sessions"
          icon={<HistoryIcon />}
        />
        <BottomNavigationAction
          label="Tuner"
          value="tuner"
          icon={<TuneIcon />}
        />
        <BottomNavigationAction
          label="AI BPM"
          value="ai-bpm"
          icon={<SmartToyIcon />}
        />
      </BottomNavigation>
    </Box>
  );
}
