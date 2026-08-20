export const SONG_CATALOG_PATH = "/songs/";

export function getSongPagePath(songId: string) {
  return `${SONG_CATALOG_PATH}${encodeURIComponent(songId)}/`;
}
