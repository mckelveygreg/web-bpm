import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Chip,
  IconButton,
  Stack,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Paper,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StorageIcon from "@mui/icons-material/Storage";
import {
  getAllSessions,
  deleteSession,
  toggleSessionStarred,
  deleteUnstarredSessions,
  getSessionsStorageBreakdown,
} from "../services/db";
import type { Session } from "../types";

interface SessionsPageProps {
  onViewSession: (id: string) => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function averageBpm(session: Session): number | null {
  if (session.bpmTimeSeries.length === 0) return null;
  const sum = session.bpmTimeSeries.reduce((acc, d) => acc + d.bpm, 0);
  return Math.round(sum / session.bpmTimeSeries.length);
}

function estimateSessionSize(session: Session): number {
  const metaSize = new Blob([JSON.stringify({ ...session, audioBlob: undefined })]).size;
  return metaSize + (session.audioBlob?.size ?? 0);
}

interface StorageInfo {
  totalBytes: number;
  sessionCount: number;
  audioBytes: number;
  audioCount: number;
}

export default function SessionsPage({ onViewSession }: SessionsPageProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

  const loadSessions = useCallback(async () => {
    const [all, storage] = await Promise.all([
      getAllSessions(),
      getSessionsStorageBreakdown(),
    ]);
    setSessions(all);
    setStorageInfo(storage);
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteSession(deleteTarget);
    setDeleteTarget(null);
    await loadSessions();
  }, [deleteTarget, loadSessions]);

  const handleToggleStar = useCallback(
    async (id: string) => {
      await toggleSessionStarred(id);
      await loadSessions();
    },
    [loadSessions],
  );

  const unstarredCount = useMemo(
    () => sessions.filter((s) => !s.starred).length,
    [sessions],
  );

  const handleBulkDelete = useCallback(async () => {
    await deleteUnstarredSessions();
    setBulkDeleteOpen(false);
    await loadSessions();
  }, [loadSessions]);

  const sessionCards = useMemo(
    () =>
      sessions.map((s) => {
        const avg = averageBpm(s);
        return (
          <Card key={s.id} variant="outlined">
            <CardActionArea onClick={() => onViewSession(s.id)}>
              <CardContent>
                <Stack
                  direction="row"
                  sx={{ justifyContent: "space-between", alignItems: "flex-start" }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" noWrap>
                      {s.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(s.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      {avg && <Chip label={`${avg} BPM`} size="small" />}
                      <Chip label={formatDuration(s.duration)} size="small" variant="outlined" />
                      {s.genre && (
                        <Chip
                          icon={<MusicNoteIcon />}
                          label={s.genre}
                          size="small"
                          variant="outlined"
                        />
                      )}
                      {s.audioBlob && (
                        <Chip label="Audio" size="small" color="secondary" variant="outlined" />
                      )}
                      <Chip
                        label={formatBytes(estimateSessionSize(s))}
                        size="small"
                        variant="outlined"
                      />
                    </Stack>
                  </Box>
                  <Stack direction="row" sx={{ ml: 1 }}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleToggleStar(s.id);
                      }}
                      color={s.starred ? "warning" : "default"}
                    >
                      {s.starred ? (
                        <StarIcon fontSize="small" />
                      ) : (
                        <StarBorderIcon fontSize="small" />
                      )}
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(s.id);
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        );
      }),
    [sessions, onViewSession, handleToggleStar],
  );

  return (
    <Box sx={{ px: 2, py: 2, overflow: "auto", height: "100%" }}>
      {sessions.length === 0 ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "60%",
            gap: 1,
          }}
        >
          <MusicNoteIcon sx={{ fontSize: 48, color: "text.disabled" }} />
          <Typography color="text.secondary">No sessions yet</Typography>
          <Typography variant="body2" color="text.disabled">
            Start a session from the Live tab
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {storageInfo && (
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <StorageIcon fontSize="small" color="action" />
                  <Box>
                    <Typography variant="body2">
                      {formatBytes(storageInfo.totalBytes)} used
                      {storageInfo.audioCount > 0 &&
                        ` (${formatBytes(storageInfo.audioBytes)} audio)`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {storageInfo.sessionCount} session{storageInfo.sessionCount !== 1 && "s"}
                    </Typography>
                  </Box>
                </Stack>
                {unstarredCount > 0 && (
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteSweepIcon />}
                    onClick={() => setBulkDeleteOpen(true)}
                  >
                    Delete unstarred
                  </Button>
                )}
              </Stack>
            </Paper>
          )}
          {sessionCards}
        </Stack>
      )}

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete this session?</DialogTitle>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)}>
        <DialogTitle>Delete unstarred sessions?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete {unstarredCount} unstarred
            session{unstarredCount !== 1 && "s"}. Starred sessions will be kept.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
          <Button color="error" onClick={handleBulkDelete}>
            Delete {unstarredCount}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
