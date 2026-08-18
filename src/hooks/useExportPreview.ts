"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureExportImageInFrame,
  type ExportRenderPayload,
} from "../utils/exportCapture";

/**
 * Capture lifecycle for the export preview.
 *
 * Owns the three things that make this path racy: a generation token so a
 * superseded capture cannot install its result, an AbortController so an
 * abandoned capture stops occupying a frame, and a re-entrancy flag so a second
 * click cannot start a parallel capture.
 *
 * Composition of the preview snapshot stays with the caller — it branches on
 * archetype versus ordinary posters and needs localized copy, neither of which
 * belongs in a lifecycle hook.
 */

export interface RunCaptureOptions<TSnapshot> {
  payload: ExportRenderPayload;
  /** Builds the snapshot to install; only called if this capture is still current. */
  buildSnapshot: (dataUrl: string) => TSnapshot;
  /** Called for a genuine failure that is still current, never for an abort. */
  onError?: (error: unknown) => void;
}

export interface UseExportPreviewResult<TSnapshot> {
  preview: TSnapshot | null;
  generating: boolean;
  runCapture: (options: RunCaptureOptions<TSnapshot>) => Promise<void>;
  /**
   * Invalidates any in-flight capture and drops the current preview. Used when
   * context, picks or options change underneath a rendered preview.
   */
  cancel: () => void;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useExportPreview<
  TSnapshot,
>(): UseExportPreviewResult<TSnapshot> {
  const [preview, setPreview] = useState<TSnapshot | null>(null);
  const [generating, setGenerating] = useState(false);

  // Monotonic token: only the capture holding the newest value may install a
  // result or surface an error.
  const generationIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Mirrors `generating` for the re-entrancy guard, which has to read the
  // current value synchronously inside the click handler.
  const generatingRef = useRef(false);

  const cancel = useCallback(() => {
    generationIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setPreview(null);
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  const runCapture = useCallback(
    async ({
      payload,
      buildSnapshot,
      onError,
    }: RunCaptureOptions<TSnapshot>) => {
      if (generatingRef.current) return;

      const generationId = ++generationIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      generatingRef.current = true;
      setGenerating(true);

      try {
        const dataUrl = await captureExportImageInFrame(payload, {
          signal: controller.signal,
        });
        if (generationId === generationIdRef.current) {
          setPreview(buildSnapshot(dataUrl));
        }
      } catch (error) {
        // An abort is the expected outcome of superseding a capture, not a
        // failure worth reporting.
        if (!isAbortError(error) && generationId === generationIdRef.current) {
          onError?.(error);
        }
      } finally {
        // Only clear the controller if a newer capture has not already
        // replaced it.
        if (abortRef.current === controller) abortRef.current = null;
        generatingRef.current = false;
        setGenerating(false);
      }
    },
    [],
  );

  return { preview, generating, runCapture, cancel };
}
