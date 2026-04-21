import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";

const commitSha = execSync("git rev-parse --short HEAD").toString().trim();

export default defineConfig(({ mode }) => {
  const isCapacitor = mode === "capacitor";

  return {
    base: isCapacitor ? "./" : "/web-bpm/",
    define: {
      __COMMIT_SHA__: JSON.stringify(commitSha),
      __APP_VERSION__: JSON.stringify(
        process.env.npm_package_version ?? "0.0.0",
      ),
    },
    plugins: [
      react(),
      VitePWA({
        disable: isCapacitor,
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: ["favicon.svg"],
        manifest: {
          name: "Web BPM — Realtime Beat Tracker",
          short_name: "Web BPM",
          description:
            "Track beats per minute in realtime from your microphone. Built for live musicians.",
          theme_color: "#121212",
          background_color: "#121212",
          display: "standalone",
          orientation: "portrait",
          start_url: "/web-bpm/",
          scope: "/web-bpm/",
          icons: [
            {
              src: "pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          // Keep large ML assets out of precache to reduce install/update
          // memory pressure on mobile Safari.
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "gstatic-fonts-cache",
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    optimizeDeps: {
      exclude: ["onnxruntime-web"],
    },
    worker: {
      format: "es",
    },
  };
});
