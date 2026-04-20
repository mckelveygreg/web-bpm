import { useCallback, useState } from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import theme from "./theme";
import Layout, { type Tab } from "./components/Layout";
import LivePage from "./pages/LivePage";
import SessionsPage from "./pages/SessionsPage";
import SessionDetailPage from "./pages/SessionDetailPage";
import TunerPage from "./pages/TunerPage";
import AiBpmPage from "./pages/AiBpmPage";
import InstallPrompt from "./components/InstallPrompt";

export default function App() {
  const [tab, setTab] = useState<Tab>("live");
  const [viewSessionId, setViewSessionId] = useState<string | null>(null);

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

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Layout tab={tab} onTabChange={handleTabChange}>
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
        {tab === "ai-bpm" && <AiBpmPage />}
      </Layout>
      <InstallPrompt />
    </ThemeProvider>
  );
}
