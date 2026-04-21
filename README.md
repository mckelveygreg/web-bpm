# Web BPM

[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![Deploy](https://github.com/mckelveygreg/web-bpm/actions/workflows/deploy.yml/badge.svg)](https://github.com/mckelveygreg/web-bpm/actions/workflows/deploy.yml)

A mobile-first progressive web app for tracking beats per minute in realtime. Built for live musicians who want to monitor tempo while performing.

**[Launch App →](https://mckelveygreg.github.io/web-bpm/)**

## Features

- **Realtime BPM detection** — Uses your device microphone and the Web Audio API to detect tempo as you play
- **Live time-series graph** — Rolling chart shows BPM over the last few minutes so you can spot drift
- **Stability indicator** — Visual feedback (red → yellow → green) shows how locked-in the tempo is
- **Target BPM reference** — Set a target tempo and see a reference line on the graph
- **Ambient audio recording** — Optionally capture reference audio for each session (low bitrate, not studio quality)
- **Session history** — Browse past sessions with full BPM graphs and audio playback
- **Offline first** — Works without an internet connection after first load (PWA with service worker)
- **Installable** — Add to your home screen for a native app experience
- **Screen wake lock** — Keeps your screen on during a session so you can glance at tempo hands-free

## Tech Stack

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) + [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
- [MUI (Material UI)](https://mui.com/) + [MUI X Charts](https://mui.com/x/react-charts/)
- [ONNX Runtime Web](https://onnxruntime.ai/) + [BeatNet CRNN](https://github.com/madmom-tools/madmom) — Deep learning tempo detection via particle filtering
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) via [idb](https://github.com/jakearchibald/idb) — Client-side session storage

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Yarn](https://yarnpkg.com/) 1.x+

### Install & Run

```bash
# Clone the repo
git clone https://github.com/mckelveygreg/web-bpm.git
cd web-bpm

# Install dependencies
yarn install

# Start dev server
yarn dev
```

Open [http://localhost:5173/web-bpm/](http://localhost:5173/web-bpm/) in your browser.

### Build

```bash
yarn build
```

Output goes to `dist/`. Preview the production build with `yarn preview`.

### Lint

```bash
yarn lint
```

Uses [oxlint](https://oxc.rs/docs/guide/usage/linter) for fast, Rust-based linting.

## Deployment

The app deploys to GitHub Pages automatically on push to `main` via GitHub Actions. See [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

Live at: **https://mckelveygreg.github.io/web-bpm/**

## Browser Compatibility

| Feature | Chrome/Edge | Firefox | Safari (iOS 16.4+) |
|---|---|---|---|
| Microphone access | ✅ | ✅ | ✅ |
| AudioWorklet (BPM) | ✅ | ✅ | ✅ |
| MediaRecorder | ✅ webm/opus | ✅ webm/opus | ✅ mp4/aac |
| IndexedDB | ✅ | ✅ | ✅ (50MB cap) |
| PWA Install | ✅ auto-prompt | ✅ | ⚠️ manual only |
| Wake Lock | ✅ | ✅ | ✅ (16.4+) |

> **Note:** HTTPS is required for microphone access and service workers. GitHub Pages provides this by default.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[GPL-3.0](LICENSE) — Copyright 2026 Greg McKelvey
