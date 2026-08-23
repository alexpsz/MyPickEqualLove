export const EXPORT_IMAGE_READY_TIMEOUT_MS = 10_000;
export const EXPORT_ANIMATION_READY_TIMEOUT_MS = 2_000;

type ExportImageEventType = "load" | "error";
type ExportImageEventListener = () => void;

export interface ExportImageReadinessTarget {
  readonly complete: boolean;
  readonly naturalWidth: number;
  decode?: () => Promise<void>;
  addEventListener(
    type: ExportImageEventType,
    listener: ExportImageEventListener,
  ): void;
  removeEventListener(
    type: ExportImageEventType,
    listener: ExportImageEventListener,
  ): void;
}

export interface ExportImageReadinessTimers {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(timerId: unknown): void;
}

export interface ExportAnimationReadinessAnimation {
  readonly finished: Promise<unknown>;
  readonly pending?: boolean;
  readonly playState: "idle" | "running" | "paused" | "finished";
}

export interface ExportAnimationReadinessTarget {
  getAnimations?(options?: {
    subtree?: boolean;
  }): readonly ExportAnimationReadinessAnimation[];
}

const DEFAULT_TIMERS: ExportImageReadinessTimers = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (timerId) =>
    globalThis.clearTimeout(
      timerId as ReturnType<typeof globalThis.setTimeout>,
    ),
};

export async function waitForExportImageReady(
  image: ExportImageReadinessTarget,
  timeoutMs = EXPORT_IMAGE_READY_TIMEOUT_MS,
  timers: ExportImageReadinessTimers = DEFAULT_TIMERS,
) {
  if (!image.complete) {
    await waitForImageLoad(image, timeoutMs, timers);
  }

  assertImageHasPixels(image);

  if (typeof image.decode === "function") {
    await waitForImageDecode(image, timeoutMs, timers);
    assertImageHasPixels(image);
  }
}

export async function waitForExportAnimationsReady(
  target: ExportAnimationReadinessTarget,
  timeoutMs = EXPORT_ANIMATION_READY_TIMEOUT_MS,
  timers: ExportImageReadinessTimers = DEFAULT_TIMERS,
) {
  const activeAnimations = getActiveExportAnimations(target);
  if (activeAnimations.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      timers.clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = timers.setTimeout(
      () =>
        finish(() =>
          reject(new Error("Export canvas animation settle timed out")),
        ),
      timeoutMs,
    );

    try {
      void Promise.all(
        activeAnimations.map((animation) =>
          animation.finished.catch(() => undefined),
        ),
      ).then(
        () => finish(resolve),
        () =>
          finish(() =>
            reject(new Error("Export canvas animation failed to settle")),
          ),
      );
    } catch {
      finish(() =>
        reject(new Error("Export canvas animation failed to settle")),
      );
    }
  });

  assertNoActiveExportAnimations(target);
}

export function assertNoActiveExportAnimations(
  target: ExportAnimationReadinessTarget,
) {
  const activeAnimations = getActiveExportAnimations(target);
  if (activeAnimations.length > 0) {
    throw new Error(
      `Export canvas still has ${activeAnimations.length} active animation${
        activeAnimations.length === 1 ? "" : "s"
      }`,
    );
  }
}

function waitForImageLoad(
  image: ExportImageReadinessTarget,
  timeoutMs: number,
  timers: ExportImageReadinessTimers,
) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      timers.clearTimeout(timeoutId);
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
      callback();
    };
    const handleLoad = () => {
      if (image.naturalWidth > 0) {
        finish(resolve);
      } else {
        finish(() =>
          reject(new Error("Export cover image has no decoded pixels")),
        );
      }
    };
    const handleError = () =>
      finish(() => reject(new Error("Export cover image failed to load")));
    const timeoutId = timers.setTimeout(
      () =>
        finish(() => reject(new Error("Export cover image load timed out"))),
      timeoutMs,
    );

    image.addEventListener("load", handleLoad);
    image.addEventListener("error", handleError);
    if (image.complete) handleLoad();
  });
}

function waitForImageDecode(
  image: ExportImageReadinessTarget,
  timeoutMs: number,
  timers: ExportImageReadinessTimers,
) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      timers.clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = timers.setTimeout(
      () =>
        finish(() => reject(new Error("Export cover image decode timed out"))),
      timeoutMs,
    );

    try {
      void image.decode?.().then(
        () => finish(resolve),
        () =>
          finish(() => reject(new Error("Export cover image decode failed"))),
      );
    } catch {
      finish(() => reject(new Error("Export cover image decode failed")));
    }
  });
}

function assertImageHasPixels(image: ExportImageReadinessTarget) {
  if (image.naturalWidth <= 0) {
    throw new Error("Export cover image has no decoded pixels");
  }
}

function getActiveExportAnimations(target: ExportAnimationReadinessTarget) {
  if (typeof target.getAnimations !== "function") return [];

  return target
    .getAnimations({ subtree: true })
    .filter(
      (animation) =>
        animation.pending === true ||
        animation.playState === "running" ||
        animation.playState === "paused",
    );
}
