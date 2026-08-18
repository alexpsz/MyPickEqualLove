"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_EXPORT_OPTIONS } from "../config/exportPresets";
import type { ExportOptions } from "../schema/export";
import {
  loadStoredOptions,
  mutateStoredOptions,
  type StorageLoadStatus,
} from "../utils/boardStorage";
import { shouldResyncStorage } from "../utils/storageSyncPolicy";

/**
 * React wiring for the persisted export options.
 *
 * Parsing, migration and the read-before-write mutation live in
 * `exportOptions.ts` and `boardStorage.ts`. The four options are held as one
 * object because they are always read, written and persisted together; four
 * separate state slots meant the same block of setters appeared at every site
 * that adopted a new set.
 */

export interface ExportOptionsStorageKeys {
  options: string;
  optionsV2: string;
}

export type ExportOptionsUpdateResult =
  | { ok: true }
  | { ok: false; reason: "not-writable" | "storage" };

export interface UseExportOptionsResult {
  options: ExportOptions;
  writable: boolean;
  /** Loads from a specific key pair, for the initial board hydration. */
  hydrateFrom: (keys: ExportOptionsStorageKeys) => void;
  /** Adopts options handed over by the parent frame, bypassing storage. */
  adopt: (options: ExportOptions) => void;
  update: (
    apply: (current: ExportOptions) => ExportOptions,
  ) => Promise<ExportOptionsUpdateResult>;
}

function isWritable(status: StorageLoadStatus) {
  return status === "empty" || status === "loaded" || status === "migrated";
}

export function useExportOptions({
  storageKeys,
  active,
  onStorageUnavailable,
}: {
  storageKeys: ExportOptionsStorageKeys;
  active: boolean;
  /** Called when a cross-tab sync finds storage it cannot write back to. */
  onStorageUnavailable?: () => void;
}): UseExportOptionsResult {
  const [options, setOptions] = useState<ExportOptions>({
    ...DEFAULT_EXPORT_OPTIONS,
  });
  const [writable, setWritable] = useState(false);
  // Kept in a ref so a caller passing an inline callback does not re-register
  // the storage listener on every render.
  const onStorageUnavailableRef = useRef(onStorageUnavailable);
  onStorageUnavailableRef.current = onStorageUnavailable;

  const load = useCallback((keys: ExportOptionsStorageKeys) => {
    const result = loadStoredOptions({
      storage: localStorage,
      versionedKey: keys.optionsV2,
      legacyKey: keys.options,
    });
    if (result.options) setOptions(result.options);
    setWritable(isWritable(result.status));
    return result.status;
  }, []);

  useEffect(() => {
    if (!active) return;

    const handleStorage = (event: StorageEvent) => {
      if (
        shouldResyncStorage(event, {
          storage: localStorage,
          watchedKey: storageKeys.optionsV2,
        })
      ) {
        if (!isWritable(load(storageKeys))) onStorageUnavailableRef.current?.();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [active, load, storageKeys]);

  const update = useCallback(
    async (
      apply: (current: ExportOptions) => ExportOptions,
    ): Promise<ExportOptionsUpdateResult> => {
      if (!writable) return { ok: false, reason: "not-writable" };

      const runMutation = () =>
        mutateStoredOptions({
          storage: localStorage,
          versionedKey: storageKeys.optionsV2,
          legacyKey: storageKeys.options,
          update: apply,
        });

      try {
        // Web Locks serializes writes across tabs; without it two tabs can
        // read the same document and clobber each other's toggle.
        const result = navigator.locks
          ? await navigator.locks.request(
              `mypick-options:${storageKeys.optionsV2}`,
              runMutation,
            )
          : runMutation();

        if (!result.ok) {
          setWritable(isWritable(result.status));
          return { ok: false, reason: "storage" };
        }

        setWritable(true);
        setOptions(result.options);
        return { ok: true };
      } catch {
        setWritable(false);
        return { ok: false, reason: "storage" };
      }
    },
    [storageKeys, writable],
  );

  const hydrateFrom = useCallback(
    (keys: ExportOptionsStorageKeys) => {
      load(keys);
    },
    [load],
  );

  const adopt = useCallback((next: ExportOptions) => setOptions(next), []);

  return { options, writable, hydrateFrom, adopt, update };
}
