"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getPreviewMedia } from "../utils/previewMedia";

export type PreviewAudioStatus = "idle" | "loading" | "playing" | "error";

interface PreviewAudioContextValue {
  playingSongId: string | null;
  status: PreviewAudioStatus;
  progress: number;
  failedSongIds: ReadonlySet<string>;
  toggle: (songId: string) => void;
  stop: () => void;
}

interface ActivePreview {
  songId: string;
  generation: number;
}

const PreviewAudioContext = createContext<PreviewAudioContextValue | null>(
  null,
);

export default function PreviewAudioProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activePreviewRef = useRef<ActivePreview | null>(null);
  const removeListenersRef = useRef<(() => void) | null>(null);
  const generationRef = useRef(0);
  const failedSongIdsRef = useRef<ReadonlySet<string>>(new Set());
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [status, setStatus] = useState<PreviewAudioStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [failedSongIds, setFailedSongIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const stop = useCallback(() => {
    generationRef.current += 1;
    activePreviewRef.current = null;
    removeListenersRef.current?.();
    removeListenersRef.current = null;

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    setPlayingSongId(null);
    setStatus("idle");
    setProgress(0);
  }, []);

  const toggle = useCallback(
    (songId: string) => {
      const media = getPreviewMedia(songId);
      if (!media || failedSongIdsRef.current.has(songId)) return;

      if (activePreviewRef.current?.songId === songId) {
        stop();
        return;
      }

      const generation = generationRef.current + 1;
      generationRef.current = generation;
      activePreviewRef.current = { songId, generation };
      removeListenersRef.current?.();
      removeListenersRef.current = null;

      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.preload = "none";
      audio.pause();
      audio.removeAttribute("src");
      audio.load();

      const isCurrent = () =>
        activePreviewRef.current?.songId === songId &&
        activePreviewRef.current.generation === generation;
      const removeListeners = () => {
        audio.removeEventListener("playing", handlePlaying);
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("error", handleError);
        audio.removeEventListener("timeupdate", handleTimeUpdate);
      };
      const clearCurrentSource = () => {
        removeListeners();
        if (removeListenersRef.current === removeListeners) {
          removeListenersRef.current = null;
        }
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        activePreviewRef.current = null;
        setPlayingSongId(null);
        setProgress(0);
      };
      const markFailed = () => {
        if (!isCurrent()) return;
        clearCurrentSource();
        const nextFailedSongIds = new Set(failedSongIdsRef.current);
        nextFailedSongIds.add(songId);
        failedSongIdsRef.current = nextFailedSongIds;
        setFailedSongIds(nextFailedSongIds);
        setStatus("error");
      };
      function handlePlaying() {
        if (isCurrent()) setStatus("playing");
      }
      function handleEnded() {
        if (!isCurrent()) return;
        clearCurrentSource();
        setStatus("idle");
      }
      function handleError() {
        markFailed();
      }
      function handleTimeUpdate() {
        if (!isCurrent()) return;
        const nextProgress =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.currentTime / audio.duration
            : 0;
        setProgress(Math.min(1, Math.max(0, nextProgress)));
      }

      audio.addEventListener("playing", handlePlaying);
      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("error", handleError);
      audio.addEventListener("timeupdate", handleTimeUpdate);
      removeListenersRef.current = removeListeners;
      audio.src = media.previewUrl;

      setPlayingSongId(songId);
      setStatus("loading");
      setProgress(0);

      try {
        const playResult = audio.play();
        void playResult.catch(() => {
          if (!isCurrent()) return;
          markFailed();
        });
      } catch {
        markFailed();
      }
    },
    [stop],
  );

  useEffect(() => () => stop(), [pathname, stop]);

  const contextValue = useMemo<PreviewAudioContextValue>(
    () => ({
      playingSongId,
      status,
      progress,
      failedSongIds,
      toggle,
      stop,
    }),
    [failedSongIds, playingSongId, progress, status, stop, toggle],
  );

  return (
    <PreviewAudioContext.Provider value={contextValue}>
      {children}
    </PreviewAudioContext.Provider>
  );
}

export function usePreviewAudio() {
  const context = useContext(PreviewAudioContext);
  if (!context) {
    throw new Error("usePreviewAudio must be used within PreviewAudioProvider");
  }
  return context;
}
