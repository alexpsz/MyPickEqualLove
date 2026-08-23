export const MOTION_DURATION_MS = {
  press: 100,
  fast: 140,
  overlayOpacity: 180,
  base: 220,
  slow: 360,
} as const;

export const MOTION_DURATION_SECONDS = {
  press: MOTION_DURATION_MS.press / 1_000,
  fast: MOTION_DURATION_MS.fast / 1_000,
  overlayOpacity: MOTION_DURATION_MS.overlayOpacity / 1_000,
  base: MOTION_DURATION_MS.base / 1_000,
  slow: MOTION_DURATION_MS.slow / 1_000,
} as const;

export const MOTION_EASING = {
  out: [0.2, 0.8, 0.2, 1] as const,
  standard: [0.4, 0, 0.2, 1] as const,
  opacityExit: [0.32, 0, 0.67, 0] as const,
} as const;

export const APPLE_SPRING = {
  type: "spring",
  stiffness: 520,
  damping: 42,
  mass: 0.82,
} as const;

export const APPLE_SPRING_GENTLE = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.9,
} as const;

export const APPLE_OPACITY = {
  duration: MOTION_DURATION_SECONDS.overlayOpacity,
  ease: MOTION_EASING.opacityExit,
} as const;

export const BOARD_REVEAL_MOTION = {
  stepIntervalMs: 90,
  settleMs: MOTION_DURATION_MS.base,
  concealedOpacity: 0.34,
  concealedScale: 0.985,
  concealedY: 8,
  transition: {
    duration: MOTION_DURATION_SECONDS.base,
    ease: MOTION_EASING.out,
  },
} as const;

export type BoardRevealPhase = "revealing" | "ready";

export interface BoardRevealEdgeInput {
  enabled: boolean;
  hydrated: boolean;
  isExportRealm: boolean;
  previousCount: number | null;
  currentCount: number;
  slotCount: number;
}

export interface BoardRevealScheduleStep {
  atMs: number;
  revealedCount: number;
}

export function shouldStartBoardReveal({
  enabled,
  hydrated,
  isExportRealm,
  previousCount,
  currentCount,
  slotCount,
}: BoardRevealEdgeInput) {
  return (
    enabled &&
    hydrated &&
    !isExportRealm &&
    previousCount !== null &&
    previousCount < slotCount &&
    currentCount === slotCount
  );
}

export function createBoardRevealSchedule(
  slotCount: number,
  reducedMotion: boolean,
): BoardRevealScheduleStep[] {
  if (!Number.isInteger(slotCount) || slotCount <= 0) return [];

  if (reducedMotion) {
    return [{ atMs: 0, revealedCount: slotCount }];
  }

  return Array.from({ length: slotCount }, (_, index) => ({
    atMs: index * BOARD_REVEAL_MOTION.stepIntervalMs,
    revealedCount: index + 1,
  }));
}
