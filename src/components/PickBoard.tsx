"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import {
  BOARD_REVEAL_MOTION,
  createBoardRevealSchedule,
  type BoardRevealPhase,
} from "../config/motion";
import type { RelocatePickResult } from "../data/pickExperiences";
import { useLocale } from "../i18n/LocaleProvider";
import type { PickSlot, PickSlotId, Picks } from "../schema/music";
import {
  activateReorderLongPress,
  advanceReorderPointerGesture,
  createSurfaceClickSuppression,
  createReorderPointerGesture,
  shouldSuppressSurfaceClick,
  shouldSuppressReorderClick,
  TOUCH_SURFACE_LONG_PRESS_MS,
  type ReorderPointerGesture,
  type ReorderPointerSource,
} from "../utils/pickReorderGesture";
import PickSlotCard, { type InteractivePickLayout } from "./PickSlotCard";

interface PickBoardProps {
  slots: PickSlot[];
  picks: Picks;
  layout?: InteractivePickLayout;
  showSlotMetadata?: boolean;
  onSlotClick: (slotId: PickSlotId) => void;
  onClearSlot: (slotId: PickSlotId, event: React.MouseEvent) => void;
  previewRelocation: (
    fromSlotId: PickSlotId,
    toSlotId: PickSlotId,
  ) => RelocatePickResult;
  onRelocate: (
    fromSlotId: PickSlotId,
    toSlotId: PickSlotId,
  ) => RelocatePickResult;
  boardReveal?: {
    phase: BoardRevealPhase;
    runId: number;
  } | null;
  posterGenerating?: boolean;
  onRevealComplete?: () => void;
  onRevealSkip?: () => void;
  onRevealDismiss?: () => void;
  onGeneratePoster?: () => void;
}

interface KeyboardReorderSession {
  sourceSlotId: PickSlotId;
  targetSlotId: PickSlotId;
  songId: string;
  valid: boolean;
}

interface PointerReorderSession {
  pointerId: number;
  sourceSlotId: PickSlotId;
  targetSlotId: PickSlotId | null;
  captureTarget: HTMLButtonElement;
  wrapper: HTMLDivElement;
  sourceRect: DOMRect;
  startClientX: number;
  startClientY: number;
  startScrollX: number;
  startScrollY: number;
  gesture: ReorderPointerGesture;
  longPressTimer: number | null;
  removeTouchListeners: (() => void) | null;
}

const EDGE_SCROLL_ZONE = 56;
const EDGE_SCROLL_STEP = 14;

export default function PickBoard({
  slots,
  picks,
  layout = "top10-grid",
  showSlotMetadata = false,
  onSlotClick,
  onClearSlot,
  previewRelocation,
  onRelocate,
  boardReveal = null,
  posterGenerating = false,
  onRevealComplete,
  onRevealSkip,
  onRevealDismiss,
  onGeneratePoster,
}: PickBoardProps) {
  const { t } = useLocale();
  const reducedMotion = useReducedMotion() === true;
  const sortedSlots = useMemo(
    () => slots.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [slots],
  );
  const wrappersRef = useRef(new Map<PickSlotId, HTMLDivElement>());
  const pointerSessionRef = useRef<PointerReorderSession | null>(null);
  const suppressHandleClickUntilRef = useRef(0);
  const suppressSurfaceClickRef = useRef<{
    slotId: PickSlotId;
    expiresAt: number;
  } | null>(null);
  const [keyboardSession, setKeyboardSession] =
    useState<KeyboardReorderSession | null>(null);
  const [dragSourceSlotId, setDragSourceSlotId] = useState<PickSlotId | null>(
    null,
  );
  const [dragTarget, setDragTarget] = useState<{
    slotId: PickSlotId;
    valid: boolean;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [revealSequence, setRevealSequence] = useState({
    revealedCount: 0,
    runId: 0,
  });
  const [instantRevealRunId, setInstantRevealRunId] = useState(0);

  const revealIsActive = boardReveal?.phase === "revealing";
  const revealRunId = boardReveal?.runId ?? 0;
  const revealUsesInstantMotion =
    reducedMotion || instantRevealRunId === revealRunId;
  const revealProgress = revealIsActive
    ? revealSequence.runId === revealRunId
      ? revealSequence.revealedCount
      : 0
    : sortedSlots.length;
  const displayedRevealProgress = Math.max(
    1,
    Math.min(revealProgress, sortedSlots.length),
  );

  const gridClassName =
    layout === "live-memory-grid"
      ? "live-memory-grid grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3"
      : "top10-interactive-grid grid min-w-0 grid-cols-2 gap-3 max-[359px]:grid-cols-1 md:grid-cols-4 xl:grid-cols-5";

  const getSlot = useCallback(
    (slotId: PickSlotId) =>
      sortedSlots.find((candidate) => candidate.id === slotId),
    [sortedSlots],
  );

  const finishRevealForInteraction = useCallback(() => {
    if (!revealIsActive) return;
    setInstantRevealRunId(revealRunId);
    onRevealSkip?.();
  }, [onRevealSkip, revealIsActive, revealRunId]);

  useEffect(() => {
    if (!revealIsActive || revealRunId === 0) return;

    const schedule = createBoardRevealSchedule(
      sortedSlots.length,
      reducedMotion,
    );
    if (schedule.length === 0) {
      onRevealComplete?.();
      return;
    }

    const timerIds = schedule.map((step) =>
      window.setTimeout(() => {
        setRevealSequence({
          revealedCount: step.revealedCount,
          runId: revealRunId,
        });
      }, step.atMs),
    );
    const finalStep = schedule[schedule.length - 1];
    timerIds.push(
      window.setTimeout(
        () => onRevealComplete?.(),
        finalStep.atMs + (reducedMotion ? 0 : BOARD_REVEAL_MOTION.settleMs),
      ),
    );

    return () => timerIds.forEach((timerId) => window.clearTimeout(timerId));
  }, [
    onRevealComplete,
    reducedMotion,
    revealIsActive,
    revealRunId,
    sortedSlots.length,
  ]);

  const focusReorderHandle = useCallback((slotId: PickSlotId) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        wrappersRef.current
          .get(slotId)
          ?.querySelector<HTMLButtonElement>("[data-reorder-handle]")
          ?.focus();
      });
    });
  }, []);

  const focusReorderSurface = useCallback((slotId: PickSlotId) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        wrappersRef.current
          .get(slotId)
          ?.querySelector<HTMLButtonElement>("[data-reorder-surface]")
          ?.focus();
      });
    });
  }, []);

  const announceResult = useCallback(
    (result: RelocatePickResult) => {
      const fromSlot = getSlot(result.fromSlotId);
      const toSlot = getSlot(result.toSlotId);
      if (!toSlot) return;

      if (!result.ok) {
        if (result.reason === "ineligible") {
          setAnnouncement(t("reorder.ineligible", { position: toSlot.label }));
        }
        return;
      }

      const movedTitle = picks[result.fromSlotId]?.title.ja ?? "";
      const displacedTitle = result.displacedSongId
        ? (picks[result.toSlotId]?.title.ja ?? "")
        : "";
      setAnnouncement(
        result.mode === "swap"
          ? t("reorder.swapped", {
              title: movedTitle,
              otherTitle: displacedTitle,
              from: fromSlot?.label ?? result.fromSlotId,
              to: toSlot.label,
            })
          : t("reorder.moved", {
              title: movedTitle,
              from: fromSlot?.label ?? result.fromSlotId,
              to: toSlot.label,
            }),
      );
    },
    [getSlot, picks, t],
  );

  const commitRelocation = useCallback(
    (
      fromSlotId: PickSlotId,
      toSlotId: PickSlotId,
      restoreKeyboardFocus = true,
    ) => {
      const result = onRelocate(fromSlotId, toSlotId);
      announceResult(result);
      if (result.ok && restoreKeyboardFocus) {
        focusReorderHandle(toSlotId);
      }
      return result;
    },
    [announceResult, focusReorderHandle, onRelocate],
  );

  const cancelKeyboardReorder = useCallback(() => {
    if (!keyboardSession) return;
    const sourceSlot = getSlot(keyboardSession.sourceSlotId);
    const title = picks[keyboardSession.sourceSlotId]?.title.ja ?? "";
    setAnnouncement(
      t("reorder.cancelled", {
        title,
        position: sourceSlot?.label ?? keyboardSession.sourceSlotId,
      }),
    );
    setKeyboardSession(null);
    focusReorderHandle(keyboardSession.sourceSlotId);
  }, [focusReorderHandle, getSlot, keyboardSession, picks, t]);

  const finishKeyboardReorder = useCallback(() => {
    if (!keyboardSession) return;
    if (keyboardSession.sourceSlotId === keyboardSession.targetSlotId) {
      cancelKeyboardReorder();
      return;
    }
    const result = commitRelocation(
      keyboardSession.sourceSlotId,
      keyboardSession.targetSlotId,
    );
    if (result.ok) {
      setKeyboardSession(null);
    }
  }, [cancelKeyboardReorder, commitRelocation, keyboardSession]);

  const startKeyboardReorder = useCallback(
    (slotId: PickSlotId) => {
      const song = picks[slotId];
      const slot = getSlot(slotId);
      if (!song || !slot) return;
      setKeyboardSession({
        sourceSlotId: slotId,
        targetSlotId: slotId,
        songId: song.id,
        valid: true,
      });
      setAnnouncement(
        t("reorder.started", {
          title: song.title.ja,
          position: slot.label,
        }),
      );
    },
    [getSlot, picks, t],
  );

  const moveKeyboardTarget = useCallback(
    (direction: -1 | 1) => {
      if (!keyboardSession) return;
      const currentIndex = sortedSlots.findIndex(
        (slot) => slot.id === keyboardSession.targetSlotId,
      );
      const targetSlot = sortedSlots[currentIndex + direction];
      if (!targetSlot) return;
      const result = previewRelocation(
        keyboardSession.sourceSlotId,
        targetSlot.id,
      );
      setKeyboardSession((current) =>
        current
          ? { ...current, targetSlotId: targetSlot.id, valid: result.ok }
          : current,
      );
      if (result.ok) {
        setAnnouncement(
          t("reorder.handleAria", {
            title: picks[keyboardSession.sourceSlotId]?.title.ja ?? "",
            position: targetSlot.label,
          }),
        );
      } else {
        announceResult(result);
      }
    },
    [announceResult, keyboardSession, picks, previewRelocation, sortedSlots, t],
  );

  const resetPointerDomStyles = useCallback(
    (session: PointerReorderSession) => {
      session.wrapper.style.removeProperty("transform");
      session.wrapper.style.removeProperty("z-index");
      delete session.wrapper.dataset.dragging;
      delete session.wrapper.dataset.pressed;
    },
    [],
  );

  const resetPointerStyles = useCallback(
    (session: PointerReorderSession) => {
      resetPointerDomStyles(session);
      setDragSourceSlotId(null);
      setDragTarget(null);
    },
    [resetPointerDomStyles],
  );

  const clearLongPressTimer = useCallback((session: PointerReorderSession) => {
    if (session.longPressTimer === null) return;
    window.clearTimeout(session.longPressTimer);
    session.longPressTimer = null;
  }, []);

  const removeTouchListeners = useCallback((session: PointerReorderSession) => {
    session.removeTouchListeners?.();
    session.removeTouchListeners = null;
  }, []);

  const releasePointerCapture = useCallback(
    (session: PointerReorderSession) => {
      try {
        if (session.captureTarget.hasPointerCapture(session.pointerId)) {
          session.captureTarget.releasePointerCapture(session.pointerId);
        }
      } catch {
        // The browser may already have retired the pointer during cancellation.
      }
    },
    [],
  );

  const cleanPointerSession = useCallback(
    (session: PointerReorderSession, updateReactState = true) => {
      clearLongPressTimer(session);
      removeTouchListeners(session);
      releasePointerCapture(session);
      if (updateReactState) resetPointerStyles(session);
      else resetPointerDomStyles(session);
    },
    [
      clearLongPressTimer,
      releasePointerCapture,
      removeTouchListeners,
      resetPointerDomStyles,
      resetPointerStyles,
    ],
  );

  const suppressPointerClick = useCallback((session: PointerReorderSession) => {
    const now = Date.now();
    if (session.gesture.source === "handle") {
      suppressHandleClickUntilRef.current = createSurfaceClickSuppression(
        session.sourceSlotId,
        now,
      ).expiresAt;
    } else {
      suppressSurfaceClickRef.current = createSurfaceClickSuppression(
        session.sourceSlotId,
        now,
      );
    }
  }, []);

  const beginPointerDrag = useCallback((session: PointerReorderSession) => {
    if (session.gesture.phase !== "dragging") return;
    session.wrapper.dataset.dragging = "true";
    session.wrapper.style.zIndex = "40";
    if (session.gesture.source === "handle") {
      suppressHandleClickUntilRef.current = 0;
    } else {
      suppressSurfaceClickRef.current = createSurfaceClickSuppression(
        session.sourceSlotId,
        Date.now(),
      );
    }
    setDragSourceSlotId(session.sourceSlotId);
  }, []);

  const cancelPointerReorder = useCallback(() => {
    const session = pointerSessionRef.current;
    if (!session) return;
    pointerSessionRef.current = null;
    if (shouldSuppressReorderClick(session.gesture)) {
      suppressPointerClick(session);
    }
    cleanPointerSession(session);
    if (session.gesture.phase === "dragging") {
      const sourceSlot = getSlot(session.sourceSlotId);
      const title = picks[session.sourceSlotId]?.title.ja ?? "";
      setAnnouncement(
        t("reorder.cancelled", {
          title,
          position: sourceSlot?.label ?? session.sourceSlotId,
        }),
      );
    }
  }, [cleanPointerSession, getSlot, picks, suppressPointerClick, t]);

  const findPointerTarget = useCallback(
    (clientX: number, clientY: number, session: PointerReorderSession) => {
      for (const slot of sortedSlots) {
        const wrapper = wrappersRef.current.get(slot.id);
        if (!wrapper) continue;
        const rect =
          slot.id === session.sourceSlotId
            ? session.sourceRect
            : wrapper.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return slot.id;
        }
      }
      return null;
    },
    [sortedSlots],
  );

  const updatePointerDrag = useCallback(
    (session: PointerReorderSession, clientX: number, clientY: number) => {
      const pointerDeltaX = clientX - session.startClientX;
      const pointerDeltaY = clientY - session.startClientY;

      if (clientY < EDGE_SCROLL_ZONE) {
        window.scrollBy({ top: -EDGE_SCROLL_STEP, behavior: "auto" });
      } else if (clientY > window.innerHeight - EDGE_SCROLL_ZONE) {
        window.scrollBy({ top: EDGE_SCROLL_STEP, behavior: "auto" });
      }

      const translateX =
        pointerDeltaX + (window.scrollX - session.startScrollX);
      const translateY =
        pointerDeltaY + (window.scrollY - session.startScrollY);
      session.wrapper.style.transform = `translate3d(${translateX}px, ${translateY}px, 0)`;

      const targetSlotId = findPointerTarget(clientX, clientY, session);
      session.targetSlotId = targetSlotId;
      if (!targetSlotId || targetSlotId === session.sourceSlotId) {
        setDragTarget(null);
        return;
      }
      const result = previewRelocation(session.sourceSlotId, targetSlotId);
      setDragTarget({ slotId: targetSlotId, valid: result.ok });
    },
    [findPointerTarget, previewRelocation],
  );

  const finishPointerReorder = useCallback(
    (session: PointerReorderSession) => {
      if (pointerSessionRef.current !== session) return;
      pointerSessionRef.current = null;
      const restorePointerFocus =
        document.activeElement === session.captureTarget;
      cleanPointerSession(session);
      if (!shouldSuppressReorderClick(session.gesture)) return;

      suppressPointerClick(session);
      if (
        session.targetSlotId &&
        session.targetSlotId !== session.sourceSlotId
      ) {
        let result: RelocatePickResult | undefined;
        flushSync(() => {
          result = commitRelocation(
            session.sourceSlotId,
            session.targetSlotId!,
            false,
          );
        });
        if (result?.ok && restorePointerFocus) {
          if (session.gesture.source === "handle") {
            focusReorderHandle(session.targetSlotId);
          } else {
            focusReorderSurface(session.targetSlotId);
          }
        }
      }
    },
    [
      cleanPointerSession,
      commitRelocation,
      focusReorderHandle,
      focusReorderSurface,
      suppressPointerClick,
    ],
  );

  const handlePointerDown = useCallback(
    (
      slotId: PickSlotId,
      source: ReorderPointerSource,
      event: React.PointerEvent<HTMLButtonElement>,
    ) => {
      if (
        !event.isPrimary ||
        (event.pointerType === "mouse" && event.button !== 0)
      ) {
        return;
      }
      event.stopPropagation();
      finishRevealForInteraction();
      cancelPointerReorder();
      setKeyboardSession(null);
      const wrapper = wrappersRef.current.get(slotId);
      if (!wrapper || !picks[slotId]) return;

      if (source === "handle") event.currentTarget.focus();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        return;
      }
      wrapper.dataset.pressed = "true";
      const session: PointerReorderSession = {
        pointerId: event.pointerId,
        sourceSlotId: slotId,
        targetSlotId: slotId,
        captureTarget: event.currentTarget,
        wrapper,
        sourceRect: wrapper.getBoundingClientRect(),
        startClientX: event.clientX,
        startClientY: event.clientY,
        startScrollX: window.scrollX,
        startScrollY: window.scrollY,
        gesture: createReorderPointerGesture({
          source,
          pointerType: event.pointerType,
        }),
        longPressTimer: null,
        removeTouchListeners: null,
      };
      pointerSessionRef.current = session;

      if (source === "surface" && event.pointerType === "touch") {
        const touchTarget = event.currentTarget;
        const handleTouchMove = (touchEvent: TouchEvent) => {
          if (pointerSessionRef.current !== session) return;
          if (touchEvent.touches.length !== 1) {
            cancelPointerReorder();
            return;
          }
          const touch = touchEvent.touches[0];
          const previousPhase = session.gesture.phase;
          session.gesture = advanceReorderPointerGesture({
            gesture: session.gesture,
            deltaX: touch.clientX - session.startClientX,
            deltaY: touch.clientY - session.startClientY,
          });
          if (session.gesture.phase === "cancelled") {
            cancelPointerReorder();
            return;
          }
          if (session.gesture.phase !== "dragging") return;

          touchEvent.preventDefault();
          if (previousPhase !== "dragging") {
            clearLongPressTimer(session);
            beginPointerDrag(session);
          }
          updatePointerDrag(session, touch.clientX, touch.clientY);
        };
        touchTarget.addEventListener("touchmove", handleTouchMove, {
          passive: false,
        });
        session.removeTouchListeners = () => {
          touchTarget.removeEventListener("touchmove", handleTouchMove);
        };
        session.longPressTimer = window.setTimeout(() => {
          if (pointerSessionRef.current !== session) return;
          session.longPressTimer = null;
          session.gesture = activateReorderLongPress(session.gesture);
          beginPointerDrag(session);
        }, TOUCH_SURFACE_LONG_PRESS_MS);
      }
    },
    [
      beginPointerDrag,
      cancelPointerReorder,
      clearLongPressTimer,
      finishRevealForInteraction,
      picks,
      updatePointerDrag,
    ],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const session = pointerSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      if (
        session.gesture.source === "surface" &&
        session.gesture.pointerType === "touch"
      ) {
        return;
      }

      const pointerDeltaX = event.clientX - session.startClientX;
      const pointerDeltaY = event.clientY - session.startClientY;
      const previousPhase = session.gesture.phase;
      session.gesture = advanceReorderPointerGesture({
        gesture: session.gesture,
        deltaX: pointerDeltaX,
        deltaY: pointerDeltaY,
      });
      if (session.gesture.phase === "cancelled") {
        cancelPointerReorder();
        return;
      }
      if (session.gesture.phase === "pending") {
        return;
      }

      event.preventDefault();
      if (previousPhase !== "dragging") {
        clearLongPressTimer(session);
        beginPointerDrag(session);
      }

      updatePointerDrag(session, event.clientX, event.clientY);
    },
    [
      beginPointerDrag,
      cancelPointerReorder,
      clearLongPressTimer,
      updatePointerDrag,
    ],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const session = pointerSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      if (shouldSuppressReorderClick(session.gesture)) event.preventDefault();
      finishPointerReorder(session);
    },
    [finishPointerReorder],
  );

  const handlePointerCancellation = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const session = pointerSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      cancelPointerReorder();
    },
    [cancelPointerReorder],
  );

  const handleSlotClick = useCallback(
    (slotId: PickSlotId, event: React.MouseEvent<HTMLButtonElement>) => {
      const suppression = suppressSurfaceClickRef.current;
      if (
        shouldSuppressSurfaceClick({
          suppression,
          slotId,
          now: Date.now(),
        })
      ) {
        event.preventDefault();
        event.stopPropagation();
        suppressSurfaceClickRef.current = null;
        return;
      }
      suppressSurfaceClickRef.current = null;
      finishRevealForInteraction();
      onSlotClick(slotId);
    },
    [finishRevealForInteraction, onSlotClick],
  );

  const handleReorderClick = useCallback(
    (slotId: PickSlotId, event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (suppressHandleClickUntilRef.current >= Date.now()) {
        event.preventDefault();
        suppressHandleClickUntilRef.current = 0;
        return;
      }
      suppressHandleClickUntilRef.current = 0;
      finishRevealForInteraction();
      if (keyboardSession?.sourceSlotId === slotId) {
        finishKeyboardReorder();
      } else {
        startKeyboardReorder(slotId);
      }
    },
    [
      finishKeyboardReorder,
      finishRevealForInteraction,
      keyboardSession?.sourceSlotId,
      startKeyboardReorder,
    ],
  );

  const handleReorderKeyDown = useCallback(
    (slotId: PickSlotId, event: React.KeyboardEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (event.key === "Escape" && keyboardSession) {
        event.preventDefault();
        cancelKeyboardReorder();
        return;
      }
      if (!keyboardSession || keyboardSession.sourceSlotId !== slotId) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        moveKeyboardTarget(-1);
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        moveKeyboardTarget(1);
      }
    },
    [cancelKeyboardReorder, keyboardSession, moveKeyboardTarget],
  );

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && pointerSessionRef.current) {
        event.preventDefault();
        pointerSessionRef.current.gesture = {
          ...pointerSessionRef.current.gesture,
          phase: "cancelled",
        };
        cancelPointerReorder();
      }
    };
    const handleVisibility = () => {
      if (document.hidden) cancelPointerReorder();
    };
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("blur", cancelPointerReorder);
    window.addEventListener("resize", cancelPointerReorder);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("blur", cancelPointerReorder);
      window.removeEventListener("resize", cancelPointerReorder);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [cancelPointerReorder]);

  useEffect(
    () => () => {
      const session = pointerSessionRef.current;
      if (!session) return;
      pointerSessionRef.current = null;
      cleanPointerSession(session, false);
    },
    [cleanPointerSession],
  );

  useEffect(() => {
    if (pointerSessionRef.current) cancelPointerReorder();
  }, [cancelPointerReorder, onRelocate, picks, previewRelocation]);

  useEffect(() => {
    if (
      keyboardSession &&
      picks[keyboardSession.sourceSlotId]?.id !== keyboardSession.songId
    ) {
      setKeyboardSession(null);
    }
  }, [keyboardSession, picks]);

  const keyboardTargetIndex = keyboardSession
    ? sortedSlots.findIndex((slot) => slot.id === keyboardSession.targetSlotId)
    : -1;

  return (
    <section
      data-page-reveal
      /* A dragged card lives inside this stacking context, so the board has to
         outrank the controls panel above it for the duration of the gesture.
         The anchored menus in that panel cannot be open at the same time: their
         own outside-pointerdown handler closes them before a drag can begin. */
      className={`relative [--reveal-delay:160ms] ${
        dragSourceSlotId ? "z-30" : "z-10"
      }`}
    >
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 className="section-title">{t("pick.heading")}</h2>
      </div>

      <p id="pick-reorder-instructions" className="sr-only">
        {t("reorder.instructions")}
      </p>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`mb-3 min-h-5 text-[12px] font-medium leading-5 ${
          announcement ? "text-[var(--muted)]" : "sr-only"
        }`}
      >
        {announcement || t("reorder.instructions")}
      </div>

      {boardReveal ? (
        <section
          aria-busy={posterGenerating || revealIsActive}
          aria-labelledby="board-reveal-title"
          data-board-reveal-phase={
            posterGenerating ? "generating" : boardReveal.phase
          }
          className="official-panel-soft mb-4 grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
        >
          <div className="min-w-0">
            <h3
              id="board-reveal-title"
              className="text-sm font-semibold tracking-[-0.01em] text-[var(--foreground)] sm:text-base"
            >
              {posterGenerating
                ? t("boardReveal.generatingTitle")
                : revealIsActive
                  ? t("boardReveal.title")
                  : t("boardReveal.readyTitle")}
            </h3>
            <p
              aria-live="polite"
              aria-atomic="true"
              className="mt-1 text-[12px] font-medium leading-relaxed text-[var(--muted)] sm:text-[13px]"
            >
              {posterGenerating
                ? t("boardReveal.generatingHint")
                : revealIsActive
                  ? t("boardReveal.progress", {
                      current: displayedRevealProgress,
                      total: sortedSlots.length,
                    })
                  : t("boardReveal.readyHint")}
            </p>
            <div
              role="progressbar"
              aria-label={t("boardReveal.progressLabel")}
              aria-valuemin={0}
              aria-valuemax={sortedSlots.length}
              aria-valuenow={
                revealIsActive ? revealProgress : sortedSlots.length
              }
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--line)]"
            >
              <m.div
                className="h-full origin-left rounded-full bg-[var(--project-primary)]"
                initial={false}
                animate={{
                  scaleX:
                    sortedSlots.length === 0
                      ? 1
                      : revealProgress / sortedSlots.length,
                }}
                transition={
                  revealUsesInstantMotion
                    ? { duration: 0 }
                    : BOARD_REVEAL_MOTION.transition
                }
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
            {revealIsActive ? (
              <button
                type="button"
                onClick={finishRevealForInteraction}
                className="official-button official-button-quiet min-h-11"
              >
                {t("boardReveal.skip")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onRevealDismiss}
                  className="official-button official-button-quiet min-h-11"
                >
                  {t("boardReveal.dismiss")}
                </button>
                {!posterGenerating ? (
                  <button
                    type="button"
                    onClick={onGeneratePoster}
                    className="official-button official-button-primary min-h-11"
                  >
                    {t("boardReveal.generate")}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </section>
      ) : null}

      {keyboardSession ? (
        <div
          id="pick-reorder-toolbar"
          role="group"
          aria-label={t("reorder.toolbarLabel", {
            title: picks[keyboardSession.sourceSlotId]?.title.ja ?? "",
          })}
          className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)] p-2 shadow-sm"
        >
          <span className="min-w-0 flex-1 px-2 text-[13px] font-semibold text-[var(--foreground)]">
            {t("search.selectedAt", {
              position:
                getSlot(keyboardSession.targetSlotId)?.label ??
                keyboardSession.targetSlotId,
            })}
          </span>
          <button
            type="button"
            className="official-button official-button-quiet"
            disabled={keyboardTargetIndex <= 0}
            onClick={() => moveKeyboardTarget(-1)}
          >
            {t("reorder.previous")}
          </button>
          <button
            type="button"
            className="official-button official-button-quiet"
            disabled={keyboardTargetIndex >= sortedSlots.length - 1}
            onClick={() => moveKeyboardTarget(1)}
          >
            {t("reorder.next")}
          </button>
          <button
            type="button"
            className="official-button official-button-primary"
            onClick={finishKeyboardReorder}
          >
            {t("reorder.finish")}
          </button>
          <button
            type="button"
            className="official-button official-button-quiet"
            onClick={cancelKeyboardReorder}
          >
            {t("reorder.cancel")}
          </button>
        </div>
      ) : null}

      <div className={gridClassName}>
        {sortedSlots.map((slot, index) => {
          const slotIsRevealed =
            !revealIsActive || index < revealProgress || reducedMotion;

          return (
            <div
              key={slot.id}
              ref={(node) => {
                if (node) wrappersRef.current.set(slot.id, node);
                else wrappersRef.current.delete(slot.id);
              }}
              data-reorder-slot-id={slot.id}
              data-reorder-source={
                keyboardSession?.sourceSlotId === slot.id ||
                dragSourceSlotId === slot.id
                  ? "true"
                  : undefined
              }
              data-reorder-target={
                keyboardSession?.targetSlotId === slot.id &&
                keyboardSession.sourceSlotId !== slot.id
                  ? keyboardSession.valid
                    ? "valid"
                    : "invalid"
                  : dragTarget?.slotId === slot.id
                    ? dragTarget.valid
                      ? "valid"
                      : "invalid"
                    : undefined
              }
              className="pick-reorder-slot relative min-w-0"
            >
              <m.div
                data-board-reveal-motion
                data-board-reveal-state={
                  revealIsActive
                    ? slotIsRevealed
                      ? "revealed"
                      : "waiting"
                    : undefined
                }
                initial={false}
                animate={
                  reducedMotion
                    ? { opacity: 1, scale: 1, y: 0 }
                    : {
                        opacity: slotIsRevealed
                          ? 1
                          : BOARD_REVEAL_MOTION.concealedOpacity,
                        scale: slotIsRevealed
                          ? 1
                          : BOARD_REVEAL_MOTION.concealedScale,
                        y: slotIsRevealed ? 0 : BOARD_REVEAL_MOTION.concealedY,
                      }
                }
                transition={
                  revealUsesInstantMotion
                    ? { duration: 0 }
                    : BOARD_REVEAL_MOTION.transition
                }
              >
                <PickSlotCard
                  slot={slot}
                  song={picks[slot.id]}
                  layout={layout}
                  showSlotMetadata={showSlotMetadata}
                  onClick={(event) => handleSlotClick(slot.id, event)}
                  onClear={(event) => {
                    finishRevealForInteraction();
                    onClearSlot(slot.id, event);
                  }}
                  reorderHandleProps={
                    picks[slot.id]
                      ? {
                          active:
                            keyboardSession?.sourceSlotId === slot.id ||
                            dragSourceSlotId === slot.id,
                          controlsKeyboardToolbar:
                            keyboardSession?.sourceSlotId === slot.id,
                          onClick: (event) =>
                            handleReorderClick(slot.id, event),
                          onKeyDown: (event) =>
                            handleReorderKeyDown(slot.id, event),
                          onPointerDown: (event) =>
                            handlePointerDown(slot.id, "handle", event),
                          onPointerMove: handlePointerMove,
                          onPointerUp: handlePointerUp,
                          onPointerCancel: handlePointerCancellation,
                          onLostPointerCapture: handlePointerCancellation,
                        }
                      : undefined
                  }
                  reorderSurfaceProps={
                    picks[slot.id]
                      ? {
                          onPointerDown: (event) =>
                            handlePointerDown(slot.id, "surface", event),
                          onPointerMove: handlePointerMove,
                          onPointerUp: handlePointerUp,
                          onPointerCancel: handlePointerCancellation,
                          onLostPointerCapture: handlePointerCancellation,
                          onContextMenu: (event) => {
                            const activeSession = pointerSessionRef.current;
                            if (
                              activeSession?.sourceSlotId === slot.id ||
                              shouldSuppressSurfaceClick({
                                suppression: suppressSurfaceClickRef.current,
                                slotId: slot.id,
                                now: Date.now(),
                              })
                            ) {
                              event.preventDefault();
                            }
                          },
                        }
                      : undefined
                  }
                />
              </m.div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
