import { useCallback, useEffect, useRef, useState } from "react";

interface PipState {
  bpm: number | null;
  isStable: boolean;
  confidence: number;
  audioLevel: number;
}

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 270;
const BG_COLOR = "#121212";
const TEXT_COLOR = "#ffffff";
const SECONDARY_COLOR = "#aaaaaa";
const PURPLE = "#863bff";

function getStabilityColor(isStable: boolean, confidence: number): string {
  if (isStable) return "#4caf50";
  if (confidence >= 10) return "#ff9800";
  return "#f44336";
}

function getStabilityLabel(isStable: boolean, confidence: number): string {
  if (isStable) return "Locked";
  if (confidence >= 10) return "Settling";
  return "Listening";
}

function drawFrame(ctx: CanvasRenderingContext2D, state: PipState) {
  const { bpm, isStable, confidence, audioLevel } = state;
  const w = CANVAS_WIDTH;
  const h = CANVAS_HEIGHT;

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, w, h);

  // Subtle border
  ctx.strokeStyle = PURPLE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 16);
  ctx.stroke();

  // BPM number
  const bpmText = bpm ? String(bpm) : "—";
  ctx.fillStyle = bpm ? TEXT_COLOR : "#666666";
  ctx.font = "bold 120px Roboto, Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(bpmText, w / 2, h / 2 - 20);

  // "BPM" label
  ctx.fillStyle = SECONDARY_COLOR;
  ctx.font = "32px Roboto, Helvetica, Arial, sans-serif";
  ctx.fillText("BPM", w / 2, h / 2 + 50);

  // Stability indicator dot + label
  const statusColor = bpm
    ? getStabilityColor(isStable, confidence)
    : "#555555";
  const statusLabel = bpm ? getStabilityLabel(isStable, confidence) : "Idle";

  ctx.beginPath();
  ctx.arc(w / 2 - 50, h / 2 + 90, 8, 0, Math.PI * 2);
  ctx.fillStyle = statusColor;
  ctx.fill();

  // Glow effect on dot
  if (bpm) {
    ctx.beginPath();
    ctx.arc(w / 2 - 50, h / 2 + 90, 12, 0, Math.PI * 2);
    ctx.fillStyle = statusColor + "44";
    ctx.fill();
  }

  ctx.fillStyle = SECONDARY_COLOR;
  ctx.font = "24px Roboto, Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(statusLabel, w / 2 - 34, h / 2 + 97);

  // Audio level bar at bottom
  if (audioLevel > 0) {
    const barWidth = w - 60;
    const barHeight = 8;
    const barX = 30;
    const barY = h - 25;

    // Background track
    ctx.fillStyle = "#333333";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 4);
    ctx.fill();

    // Fill
    const fillColor =
      audioLevel > 0.7 ? "#4caf50" : audioLevel > 0.3 ? "#ff9800" : "#f44336";
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth * audioLevel, barHeight, 4);
    ctx.fill();
  }
}

export function usePictureInPicture() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stateRef = useRef<PipState>({
    bpm: null,
    isStable: false,
    confidence: 0,
    audioLevel: 0,
  });
  const rafRef = useRef<number>(0);
  const [isActive, setIsActive] = useState(false);

  const isSupported =
    typeof document !== "undefined" &&
    "pictureInPictureEnabled" in document &&
    document.pictureInPictureEnabled;

  // Set up hidden canvas + video on mount
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvasRef.current = canvas;

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    videoRef.current = video;

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }
    };
  }, []);

  // Render loop
  const startRenderLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      drawFrame(ctx, stateRef.current);
      rafRef.current = requestAnimationFrame(render);
    };
    render();
  }, []);

  const stopRenderLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
  }, []);

  const toggle = useCallback(async () => {
    if (!isSupported) return;

    // Exit PiP
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      stopRenderLoop();
      setIsActive(false);
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    // Start render loop before capturing
    startRenderLoop();

    // Capture canvas as a video stream
    const stream = canvas.captureStream(30);
    video.srcObject = stream;
    await video.play();

    // Enter PiP
    try {
      const pipWindow = await video.requestPictureInPicture();
      setIsActive(true);

      pipWindow.addEventListener("resize", () => {
        // Could adapt rendering here if needed
      });

      video.addEventListener(
        "leavepictureinpicture",
        () => {
          stopRenderLoop();
          setIsActive(false);
          video.pause();
          video.srcObject = null;
        },
        { once: true },
      );
    } catch {
      stopRenderLoop();
      setIsActive(false);
    }
  }, [isSupported, startRenderLoop, stopRenderLoop]);

  const update = useCallback((state: PipState) => {
    stateRef.current = state;
  }, []);

  return { isSupported, isActive, toggle, update };
}
