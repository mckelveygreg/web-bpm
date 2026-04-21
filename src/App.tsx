import { useCallback, useState } from "react";
import { ThemeProvider, CssBaseline, Snackbar, Alert } from "@mui/material";
import theme from "./theme";
import Layout, { type Tab } from "./components/Layout";
import LivePage from "./pages/LivePage";
import SessionsPage from "./pages/SessionsPage";
import SessionDetailPage from "./pages/SessionDetailPage";
import TunerPage from "./pages/TunerPage";
import InstallPrompt from "./components/InstallPrompt";
import { hardRefreshApp, refreshToLatestVersion } from "./services/pwaUpdate";

type RefreshNotice = {
  severity: "success" | "info";
  message: string;
} | null;

export default function App() {
  const [tab, setTab] = useState<Tab>("live");
  const [viewSessionId, setViewSessionId] = useState<string | null>(null);
  const [refreshNotice, setRefreshNotice] = useState<RefreshNotice>(null);

  const handleViewSession = useCallback((id: string) => {
    setViewSessionId(id);
  }, []);

  const handleBackToSessions = useCallback(() => {
    setViewSessionId(null);
  }, []);

  const handleTabChange = useCallback((newTab: Tab) => {
    setTab(newTab);
    setViewSessionId(null);
  }, []);

  const handleRefreshApp = useCallback(async () => {
    try {
      const usingServiceWorker = await refreshToLatestVersion();

      if (!usingServiceWorker) {
        setRefreshNotice({
          severity: "info",
          message: "Refreshing page…",
        });
        await hardRefreshApp();
        return;
      }

      setRefreshNotice({
        severity: "success",
        message: "Checking for update…",
      });
    } catch {
      setRefreshNotice({
        severity: "info",
        message: "Forcing hard refresh…",
      });
      await hardRefreshApp();
    }
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Layout
        tab={tab}
        onTabChange={handleTabChange}
        onRefreshApp={() => {
          void handleRefreshApp();
        }}
      >
        {tab === "live" && <LivePage />}
        {tab === "sessions" && !viewSessionId && (
          <SessionsPage onViewSession={handleViewSession} />
        )}
        {tab === "sessions" && viewSessionId && (
          <SessionDetailPage
            sessionId={viewSessionId}
            onBack={handleBackToSessions}
          />
        )}
        {tab === "tuner" && <TunerPage />}
      </Layout>
      <Snackbar
        open={refreshNotice !== null}
        autoHideDuration={2500}
        onClose={() => setRefreshNotice(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          severity={refreshNotice?.severity ?? "info"}
          variant="filled"
          onClose={() => setRefreshNotice(null)}
        >
          {refreshNotice?.message ?? ""}
        </Alert>
      </Snackbar>
      <InstallPrompt />
    </ThemeProvider>
  );
}
