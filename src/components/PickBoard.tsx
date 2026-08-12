"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import type { RelocatePickResult } from "../data/pickExperiences";
import { useLocale } from "../i18n/LocaleProvider";
import type { PickSlot, PickSlotId, Picks } from "../schema/music";
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
  button: HTMLButtonElement;
  wrapper: HTMLDivElement;
  sourceRect: DOMRect;
  startClientX: number;
  startClientY: number;
  startScrollX: number;
  startScrollY: number;
  dragging: boolean;
}

const POINTER_DRAG_THRESHOLD = 10;
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
}: PickBoardProps) {
  const { t } = useLocale();
  const sortedSlots = useMemo(
    () => slots.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [slots],
  );
  const wrappersRef = useRef(new Map<PickSlotId, HTMLDivElement>());
  const pointerSessionRef = useRef<PointerReorderSession | null>(null);
  const suppressHandleClickRef = useRef(false);
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

  const gridClassName =
    layout === "live-memory-grid"
      ? "live-memory-grid grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3"
      : "top10-interactive-grid grid min-w-0 grid-cols-2 gap-3 max-[359px]:grid-cols-1 md:grid-cols-4 xl:grid-cols-5";

  const getSlot = useCallback(
    (slotId: PickSlotId) =>
      sortedSlots.find((candidate) => candidate.id === slotId),
    [sortedSlots],
  );

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
    (fromSlotId: PickSlotId, toSlotId: PickSlotId) => {
      const result = onRelocate(fromSlotId, toSlotId);
      announceResult(result);
      if (result.ok) {
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

  const resetPointerStyles = useCallback((session: PointerReorderSession) => {
    session.wrapper.style.removeProperty("transform");
    session.wrapper.style.removeProperty("z-index");
    session.wrapper.style.removeProperty("pointer-events");
    delete session.wrapper.dataset.dragging;
    delete session.wrapper.dataset.pressed;
    setDragSourceSlotId(null);
    setDragTarget(null);
  }, []);

  const cancelPointerReorder = useCallback(() => {
    const session = pointerSessionRef.current;
    if (!session) return;
    pointerSessionRef.current = null;
    suppressHandleClickRef.current = false;
    resetPointerStyles(session);
    if (session.dragging) {
      const sourceSlot = getSlot(session.sourceSlotId);
      const title = picks[session.sourceSlotId]?.title.ja ?? "";
      setAnnouncement(
        t("reorder.cancelled", {
          title,
          position: sourceSlot?.label ?? session.sourceSlotId,
        }),
      );
    }
  }, [getSlot, picks, resetPointerStyles, t]);

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

  const handlePointerDown = useCallback(
    (slotId: PickSlotId, event: React.PointerEvent<HTMLButtonElement>) => {
      if (
        !event.isPrimary ||
        (event.pointerType === "mouse" && event.button !== 0)
      ) {
        return;
      }
      event.stopPropagation();
      cancelPointerReorder();
      setKeyboardSession(null);
      const wrapper = wrappersRef.current.get(slotId);
      if (!wrapper || !picks[slotId]) return;

      event.currentTarget.focus();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        return;
      }
      wrapper.dataset.pressed = "true";
      pointerSessionRef.current = {
        pointerId: event.pointerId,
        sourceSlotId: slotId,
        targetSlotId: slotId,
        button: event.currentTarget,
        wrapper,
        sourceRect: wrapper.getBoundingClientRect(),
        startClientX: event.clientX,
        startClientY: event.clientY,
        startScrollX: window.scrollX,
        startScrollY: window.scrollY,
        dragging: false,
      };
    },
    [cancelPointerReorder, picks],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const session = pointerSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      const pointerDeltaX = event.clientX - session.startClientX;
      const pointerDeltaY = event.clientY - session.startClientY;
      if (
        !session.dragging &&
        Math.hypot(pointerDeltaX, pointerDeltaY) < POINTER_DRAG_THRESHOLD
      ) {
        return;
      }

      event.preventDefault();
      if (!session.dragging) {
        session.dragging = true;
        suppressHandleClickRef.current = true;
        session.wrapper.dataset.dragging = "true";
        session.wrapper.style.pointerEvents = "none";
        session.wrapper.style.zIndex = "40";
        setDragSourceSlotId(session.sourceSlotId);
      }

      if (event.clientY < EDGE_SCROLL_ZONE) {
        window.scrollBy({ top: -EDGE_SCROLL_STEP, behavior: "auto" });
      } else if (event.clientY > window.innerHeight - EDGE_SCROLL_ZONE) {
        window.scrollBy({ top: EDGE_SCROLL_STEP, behavior: "auto" });
      }

      const translateX =
        pointerDeltaX + (window.scrollX - session.startScrollX);
      const translateY =
        pointerDeltaY + (window.scrollY - session.startScrollY);
      session.wrapper.style.transform = `translate3d(${translateX}px, ${translateY}px, 0)`;

      const targetSlotId = findPointerTarget(
        event.clientX,
        event.clientY,
        session,
      );
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

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const session = pointerSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      pointerSessionRef.current = null;
      if (session.button.hasPointerCapture(event.pointerId)) {
        session.button.releasePointerCapture(event.pointerId);
      }
      resetPointerStyles(session);
      if (!session.dragging) return;

      event.preventDefault();
      window.setTimeout(() => {
        suppressHandleClickRef.current = false;
      }, 0);
      if (
        session.targetSlotId &&
        session.targetSlotId !== session.sourceSlotId
      ) {
        flushSync(() => {
          commitRelocation(session.sourceSlotId, session.targetSlotId!);
        });
      }
    },
    [commitRelocation, resetPointerStyles],
  );

  const handleReorderClick = useCallback(
    (slotId: PickSlotId, event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (suppressHandleClickRef.current) {
        suppressHandleClickRef.current = false;
        return;
      }
      if (keyboardSession?.sourceSlotId === slotId) {
        finishKeyboardReorder();
      } else {
        startKeyboardReorder(slotId);
      }
    },
    [
      finishKeyboardReorder,
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
      if (event.key === "Escape" && pointerSessionRef.current?.dragging) {
        event.preventDefault();
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
    <section data-page-reveal className="relative z-10 [--reveal-delay:160ms]">
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

      {keyboardSession ? (
        <div
          id="pick-reorder-toolbar"
          role="group"
          aria-label={t("reorder.toolbarLabel", {
            title: picks[keyboardSession.sourceSlotId]?.title.ja ?? "",
          })}
          className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-white p-2 shadow-sm"
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
        {sortedSlots.map((slot) => (
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
            <PickSlotCard
              slot={slot}
              song={picks[slot.id]}
              layout={layout}
              showSlotMetadata={showSlotMetadata}
              onClick={() => onSlotClick(slot.id)}
              onClear={(event) => onClearSlot(slot.id, event)}
              reorderHandleProps={
                picks[slot.id]
                  ? {
                      active:
                        keyboardSession?.sourceSlotId === slot.id ||
                        dragSourceSlotId === slot.id,
                      controlsKeyboardToolbar:
                        keyboardSession?.sourceSlotId === slot.id,
                      onClick: (event) => handleReorderClick(slot.id, event),
                      onKeyDown: (event) =>
                        handleReorderKeyDown(slot.id, event),
                      onPointerDown: (event) =>
                        handlePointerDown(slot.id, event),
                      onPointerMove: handlePointerMove,
                      onPointerUp: handlePointerUp,
                      onPointerCancel: cancelPointerReorder,
                      onLostPointerCapture: cancelPointerReorder,
                    }
                  : undefined
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
}
