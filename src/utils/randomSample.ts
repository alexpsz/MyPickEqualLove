export const RANDOM_SAMPLE_MIN_SIZE = 3;
export const RANDOM_SAMPLE_MAX_SIZE = 24;

interface RandomSampleCandidate {
  id: string;
}

/**
 * Plans a unique, without-replacement sample while leaving the source intact.
 * The RNG is injected so callers can use Math.random and tests can stay exact.
 */
export function planRandomSample<T extends RandomSampleCandidate>(
  songs: readonly T[],
  size: number,
  rng: () => number,
): T[] {
  if (
    !Number.isInteger(size) ||
    size < RANDOM_SAMPLE_MIN_SIZE ||
    size > RANDOM_SAMPLE_MAX_SIZE
  ) {
    throw new RangeError(
      `Random sample size must be an integer from ${RANDOM_SAMPLE_MIN_SIZE} to ${RANDOM_SAMPLE_MAX_SIZE}.`,
    );
  }

  const seenSongIds = new Set<string>();
  const pool = songs.filter((song) => {
    if (seenSongIds.has(song.id)) return false;
    seenSongIds.add(song.id);
    return true;
  });
  const sampleSize = Math.min(size, pool.length);

  for (let index = 0; index < sampleSize; index += 1) {
    const remaining = pool.length - index;
    if (remaining === 1) break;

    const randomValue = rng();
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      throw new RangeError("Random sample RNG must return a value in [0, 1).");
    }

    const selectedIndex = index + Math.floor(randomValue * remaining);
    [pool[index], pool[selectedIndex]] = [pool[selectedIndex], pool[index]];
  }

  return pool.slice(0, sampleSize);
}
