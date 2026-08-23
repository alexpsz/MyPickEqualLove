import { CURRENT_PROJECT_RUNTIME } from "@current-project/runtime";
import type { PreviewMediaRuntimeEntry } from "../projects/runtimeTypes";

export type PreviewMedia = PreviewMediaRuntimeEntry;

const PREVIEW_HOST = "audio-ssl.itunes.apple.com";
const TRACK_HOST = "music.apple.com";

export function buildPreviewMediaIndex(
  entries: readonly PreviewMediaRuntimeEntry[],
): ReadonlyMap<string, PreviewMedia> {
  const index = new Map<string, PreviewMedia>();
  const duplicateSongIds = new Set<string>();

  for (const entry of entries) {
    if (
      typeof entry.songId !== "string" ||
      entry.songId.trim() === "" ||
      !isExactHttpsHost(entry.previewUrl, PREVIEW_HOST) ||
      !isExactHttpsHost(entry.trackViewUrl, TRACK_HOST) ||
      duplicateSongIds.has(entry.songId)
    ) {
      continue;
    }

    if (index.has(entry.songId)) {
      index.delete(entry.songId);
      duplicateSongIds.add(entry.songId);
      continue;
    }

    index.set(entry.songId, entry);
  }

  return index;
}

const PREVIEW_MEDIA_BY_SONG_ID = buildPreviewMediaIndex(
  CURRENT_PROJECT_RUNTIME.previewMedia,
);

export function getPreviewMedia(songId: string): PreviewMedia | undefined {
  return PREVIEW_MEDIA_BY_SONG_ID.get(songId);
}

export function hasPreviewMedia(songId: string): boolean {
  return PREVIEW_MEDIA_BY_SONG_ID.has(songId);
}

function isExactHttpsHost(value: string, hostname: string): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === hostname;
  } catch {
    return false;
  }
}
