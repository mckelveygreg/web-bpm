import { useEffect, useState } from "react";
import { Alert, Button, Snackbar } from "@mui/material";
import IosShareIcon from "@mui/icons-material/IosShare";
import AddToHomeScreenIcon from "@mui/icons-material/AddToHomeScreen";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window)
  );
}

function isInStandaloneMode(): boolean {
  return (
    "standalone" in window.navigator &&
    (window.navigator as unknown as { standalone: boolean }).standalone
  );
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosPrompt, setShowIosPrompt] = useState(false);

  useEffect(() => {
    // Android/Chrome install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS: show manual instructions if not installed
    if (isIos() && !isInStandaloneMode()) {
      // Delay to avoid showing immediately on first visit
      const timer = setTimeout(() => setShowIosPrompt(true), 5000);
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        clearTimeout(timer);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    setDeferredPrompt(null);
  };

  // Android/Chrome native prompt
  if (deferredPrompt) {
    return (
      <Snackbar open anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert
          severity="info"
          icon={<AddToHomeScreenIcon />}
          action={
            <Button color="inherit" size="small" onClick={handleInstall}>
              Install
            </Button>
          }
        >
          Install Web BPM for offline use
        </Alert>
      </Snackbar>
    );
  }

  // iOS manual instructions
  if (showIosPrompt) {
    return (
      <Snackbar
        open
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        autoHideDuration={12000}
        onClose={() => setShowIosPrompt(false)}
      >
        <Alert
          severity="info"
          icon={<IosShareIcon />}
          onClose={() => setShowIosPrompt(false)}
        >
          Tap the Share button, then &quot;Add to Home Screen&quot; to install
        </Alert>
      </Snackbar>
    );
  }

  return null;
}
