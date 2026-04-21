import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { setPwaRegistration, setPwaUpdateService } from "./services/pwaUpdate";

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true);
  },
  onRegisteredSW(_swUrl, registration) {
    setPwaRegistration(registration);
    if (registration) {
      void registration.update();
    }
  },
});

setPwaUpdateService(updateSW);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
