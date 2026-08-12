export type ReorderPointerSource = "surface" | "handle";

export type ReorderPointerPhase = "pending" | "dragging" | "cancelled";

export interface ReorderPointerGesture {
  source: ReorderPointerSource;
  pointerType: string;
  phase: ReorderPointerPhase;
}

export const POINTER_DRAG_THRESHOLD = 10;
export const TOUCH_SURFACE_LONG_PRESS_MS = 320;
export const SURFACE_CLICK_SUPPRESSION_MS = 700;

export interface SurfaceClickSuppression {
  slotId: string;
  expiresAt: number;
}

export function createSurfaceClickSuppression(
  slotId: string,
  now: number,
): SurfaceClickSuppression {
  return { slotId, expiresAt: now + SURFACE_CLICK_SUPPRESSION_MS };
}

export function shouldSuppressSurfaceClick({
  suppression,
  slotId,
  now,
}: {
  suppression: SurfaceClickSuppression | null;
  slotId: string;
  now: number;
}): boolean {
  return suppression?.slotId === slotId && suppression.expiresAt >= now;
}

export function createReorderPointerGesture({
  source,
  pointerType,
}: {
  source: ReorderPointerSource;
  pointerType: string;
}): ReorderPointerGesture {
  return { source, pointerType, phase: "pending" };
}

export function advanceReorderPointerGesture({
  gesture,
  deltaX,
  deltaY,
}: {
  gesture: ReorderPointerGesture;
  deltaX: number;
  deltaY: number;
}): ReorderPointerGesture {
  if (gesture.phase !== "pending") return gesture;
  if (Math.hypot(deltaX, deltaY) < POINTER_DRAG_THRESHOLD) return gesture;

  if (gesture.source === "surface" && gesture.pointerType === "touch") {
    return { ...gesture, phase: "cancelled" };
  }

  return { ...gesture, phase: "dragging" };
}

export function activateReorderLongPress(
  gesture: ReorderPointerGesture,
): ReorderPointerGesture {
  if (
    gesture.phase !== "pending" ||
    gesture.source !== "surface" ||
    gesture.pointerType !== "touch"
  ) {
    return gesture;
  }

  return { ...gesture, phase: "dragging" };
}

export function shouldSuppressReorderClick(
  gesture: ReorderPointerGesture,
): boolean {
  return gesture.phase !== "pending";
}
