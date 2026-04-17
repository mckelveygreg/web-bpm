import { useCallback, useRef, useState } from "react";

const AUDIO_BITRATE = 32000; // ~32kbps — reference quality, not studio

function getPreferredMimeType(): string {
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  if (MediaRecorder.isTypeSupported("audio/mp4")) {
    return "audio/mp4";
  }
  if (MediaRecorder.isTypeSupported("audio/webm")) {
    return "audio/webm";
  }
  return "";
}

export interface AudioRecorderState {
  isRecording: boolean;
}

export interface AudioRecorderActions {
  startRecording: (stream: MediaStream) => void;
  stopRecording: () => Promise<Blob | null>;
}

export function useAudioRecorder(): AudioRecorderState & AudioRecorderActions {
  const [isRecording, setIsRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef("");
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  const startRecording = useCallback((stream: MediaStream) => {
    chunksRef.current = [];

    const mimeType = getPreferredMimeType();
    mimeTypeRef.current = mimeType;
    const options: MediaRecorderOptions = {
      audioBitsPerSecond: AUDIO_BITRATE,
    };
    if (mimeType) {
      options.mimeType = mimeType;
    }

    const recorder = new MediaRecorder(stream, options);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mimeTypeRef.current || "audio/webm",
      });
      chunksRef.current = [];
      if (stopResolveRef.current) {
        stopResolveRef.current(blob);
        stopResolveRef.current = null;
      }
    };

    recorder.start(1000); // collect chunks every second
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      setIsRecording(false);
      return new Promise((resolve) => {
        stopResolveRef.current = resolve;
        recorderRef.current!.stop();
        recorderRef.current = null;
      });
    }
    setIsRecording(false);
    return Promise.resolve(null);
  }, []);

  return { isRecording, startRecording, stopRecording };
}
