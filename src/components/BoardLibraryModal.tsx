"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as m from "motion/react-m";
import { SONGS_BY_ID } from "../data/songs";
import { useLocale } from "../i18n/LocaleProvider";
import type { PickSlot, StoredPicks } from "../schema/music";
import {
  BOARD_NAME_MAX_LENGTH,
  BOARD_SNAPSHOT_LIMIT_PER_SCOPE,
  type BoardLibraryError,
  type BoardSnapshot,
} from "../utils/boardStorage";
import { sameStoredPicks } from "../utils/boardHistory";
import { DIALOG_RETURN_KEYS, useDialogA11y } from "../utils/useDialogA11y";
import AppIcon from "./AppIcon";
import { APPLE_OPACITY, APPLE_SPRING_GENTLE } from "./AppleMotion";
import JapaneseContent from "./JapaneseContent";
import type { PresenceState } from "./MotionPresence";

export type BoardLibraryActionResult =
  | { ok: true; name: string }
  | { ok: false; error: BoardLibraryError | "storage" };

interface BoardLibraryModalProps {
  snapshots: BoardSnapshot[];
  currentPicks: StoredPicks;
  slots: PickSlot[];
  writable: boolean;
  presenceState: PresenceState;
  onSave: (name: string) => BoardLibraryActionResult;
  onRename: (snapshotId: string, name: string) => BoardLibraryActionResult;
  onDelete: (snapshotId: string) => BoardLibraryActionResult;
  onRestore: (snapshot: BoardSnapshot) => BoardLibraryActionResult;
  onClose: () => void;
}

export default function BoardLibraryModal({
  snapshots,
  currentPicks,
  slots,
  writable,
  presenceState,
  onSave,
  onRename,
  onDelete,
  onRestore,
  onClose,
}: BoardLibraryModalProps) {
  const { locale, t } = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const reviewButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [nameDraft, setNameDraft] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [previewSnapshotId, setPreviewSnapshotId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useDialogA11y({
    dialogRef: panelRef,
    onClose,
    active: presenceState !== "exiting",
    initialFocusRef: closeButtonRef,
    returnFocusKey: DIALOG_RETURN_KEYS.boardLibrary,
  });

  const previewSnapshot = previewSnapshotId
    ? (snapshots.find((snapshot) => snapshot.id === previewSnapshotId) ?? null)
    : null;
  const changedSlots = useMemo(
    () =>
      previewSnapshot
        ? slots.filter(
            (slot) => currentPicks[slot.id] !== previewSnapshot.picks[slot.id],
          )
        : [],
    [currentPicks, previewSnapshot, slots],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  useEffect(() => {
    if (!renamingId) return;
    const timer = window.setTimeout(() => renameInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [renamingId]);

  const showResult = (
    result: BoardLibraryActionResult,
    successMessage: (name: string) => string,
  ) => {
    if (!result.ok) {
      setError(getBoardLibraryErrorMessage(result.error, t));
      setStatus(null);
      return false;
    }
    setError(null);
    setStatus(successMessage(result.name));
    return true;
  };

  const handleSave = () => {
    if (
      showResult(onSave(nameDraft), (name) =>
        t("boardLibrary.saveSuccess", { name }),
      )
    ) {
      setNameDraft("");
    }
  };

  const handleRename = (snapshotId: string) => {
    if (
      showResult(onRename(snapshotId, renameDraft), (name) =>
        t("boardLibrary.renameSuccess", { name }),
      )
    ) {
      setRenamingId(null);
      setRenameDraft("");
      window.requestAnimationFrame(() =>
        reviewButtonRefs.current.get(snapshotId)?.focus(),
      );
    }
  };

  const cancelRename = (snapshotId: string) => {
    setRenamingId(null);
    setRenameDraft("");
    setError(null);
    window.requestAnimationFrame(() =>
      reviewButtonRefs.current.get(snapshotId)?.focus(),
    );
  };

  const handleDelete = (snapshot: BoardSnapshot) => {
    if (
      !window.confirm(t("boardLibrary.deleteConfirm", { name: snapshot.name }))
    ) {
      return;
    }
    const snapshotIndex = snapshots.findIndex(
      (candidate) => candidate.id === snapshot.id,
    );
    const focusAfterDelete =
      snapshots[snapshotIndex + 1]?.id ?? snapshots[snapshotIndex - 1]?.id;
    if (
      showResult(onDelete(snapshot.id), (name) =>
        t("boardLibrary.deleteSuccess", { name }),
      )
    ) {
      window.requestAnimationFrame(() =>
        focusAfterDelete
          ? reviewButtonRefs.current.get(focusAfterDelete)?.focus()
          : closeButtonRef.current?.focus(),
      );
    }
  };

  const handleRestore = (snapshot: BoardSnapshot) => {
    if (
      showResult(onRestore(snapshot), (name) =>
        t("boardLibrary.restoreSuccess", { name }),
      )
    ) {
      onClose();
    }
  };

  return (
    <div
      className="motion-overlay fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      data-presence={presenceState}
    >
      <m.button
        type="button"
        onClick={onClose}
        disabled={presenceState === "exiting"}
        tabIndex={-1}
        aria-hidden={presenceState === "exiting"}
        className="overlay-scrim absolute inset-0 cursor-default bg-black/25 backdrop-blur-[2px]"
        aria-label={t("boardLibrary.closeAria")}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={APPLE_OPACITY}
      />

      <m.div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-hidden={presenceState === "exiting"}
        inert={presenceState === "exiting"}
        aria-labelledby="board-library-title"
        className="apple-sheet relative z-10 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden rounded-none border-x-0 border-b-0 focus:outline-none sm:h-auto sm:max-h-[88dvh] sm:max-w-3xl sm:rounded-[var(--radius-lg)] sm:border"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={{
          opacity: APPLE_OPACITY,
          y: APPLE_SPRING_GENTLE,
          scale: APPLE_SPRING_GENTLE,
        }}
      >
        <div className="flex items-start gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2
              id="board-library-title"
              className="text-[20px] font-semibold tracking-[-0.03em] text-[var(--foreground)]"
            >
              {previewSnapshot
                ? t("boardLibrary.restoreTitle", {
                    name: previewSnapshot.name,
                  })
                : t("boardLibrary.title")}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
              {previewSnapshot
                ? t("boardLibrary.restoreHint")
                : t("boardLibrary.subtitle")}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="icon-button icon-button-compact shrink-0"
            aria-label={t("boardLibrary.closeAria")}
          >
            <AppIcon name="close" size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--background)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
          {previewSnapshot ? (
            <RestorePreview
              snapshot={previewSnapshot}
              changedSlots={changedSlots}
              currentPicks={currentPicks}
              onBack={() => {
                const returnSnapshotId = previewSnapshot.id;
                setPreviewSnapshotId(null);
                setError(null);
                window.requestAnimationFrame(() =>
                  reviewButtonRefs.current.get(returnSnapshotId)?.focus(),
                );
              }}
              onRestore={() => handleRestore(previewSnapshot)}
            />
          ) : (
            <div className="grid gap-5">
              {!writable ? (
                <p
                  role="alert"
                  className="rounded-[var(--radius-sm)] border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-900"
                >
                  {t("boardLibrary.unavailable")}
                </p>
              ) : null}

              <section className="official-panel-soft grid gap-3 p-4">
                <label
                  htmlFor="board-library-name"
                  className="text-xs font-semibold text-[var(--muted)]"
                >
                  {t("boardLibrary.nameLabel")}
                </label>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    id="board-library-name"
                    value={nameDraft}
                    maxLength={BOARD_NAME_MAX_LENGTH}
                    disabled={!writable}
                    onChange={(event) => {
                      setNameDraft(event.target.value);
                      setError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleSave();
                    }}
                    aria-invalid={Boolean(error)}
                    aria-describedby="board-library-name-hint board-library-error"
                    placeholder={t("boardLibrary.namePlaceholder")}
                    className="min-h-11 min-w-0 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 text-[15px] outline-none transition-[border-color,box-shadow] focus:border-[var(--focus-ring)] focus:shadow-[0_0_0_2px_var(--focus-ring)] disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={
                      !writable || Object.keys(currentPicks).length === 0
                    }
                    className="official-button official-button-primary w-full sm:w-auto"
                  >
                    <AppIcon name="plus" />
                    {t("boardLibrary.saveCurrent")}
                  </button>
                </div>
                <p
                  id="board-library-name-hint"
                  className="text-xs text-[var(--muted)]"
                >
                  {t("boardLibrary.nameHint", {
                    max: BOARD_NAME_MAX_LENGTH,
                  })}
                </p>
              </section>

              <section aria-labelledby="saved-boards-heading">
                <h3
                  id="saved-boards-heading"
                  className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"
                >
                  {t("boardLibrary.savedBoards")}
                </h3>
                {snapshots.length === 0 ? (
                  <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--line-strong)] bg-[var(--paper)] px-4 py-8 text-center text-[13px] text-[var(--muted)]">
                    {t("boardLibrary.empty")}
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)]">
                    {snapshots.map((snapshot, index) => {
                      const isRenaming = renamingId === snapshot.id;
                      const available = Object.keys(snapshot.picks).length > 0;
                      return (
                        <div
                          key={snapshot.id}
                          className={`grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${
                            index > 0 ? "border-t border-[var(--line)]" : ""
                          }`}
                        >
                          <div className="min-w-0">
                            {isRenaming ? (
                              <label className="grid gap-1.5">
                                <span className="sr-only">
                                  {t("boardLibrary.renameLabel", {
                                    name: snapshot.name,
                                  })}
                                </span>
                                <input
                                  ref={renameInputRef}
                                  value={renameDraft}
                                  maxLength={BOARD_NAME_MAX_LENGTH}
                                  onChange={(event) => {
                                    setRenameDraft(event.target.value);
                                    setError(null);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      handleRename(snapshot.id);
                                    } else if (event.key === "Escape") {
                                      event.stopPropagation();
                                      cancelRename(snapshot.id);
                                    }
                                  }}
                                  aria-invalid={Boolean(error)}
                                  className="min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] px-3 text-[15px] outline-none focus:border-[var(--focus-ring)] focus:shadow-[0_0_0_2px_var(--focus-ring)]"
                                />
                              </label>
                            ) : (
                              <>
                                <p className="truncate text-[15px] font-semibold text-[var(--foreground)]">
                                  {snapshot.name}
                                </p>
                                <p className="mt-0.5 text-xs text-[var(--muted)]">
                                  {t("boardLibrary.pickCount", {
                                    count: Object.keys(snapshot.picks).length,
                                  })}
                                  {" · "}
                                  {t("boardLibrary.savedAt", {
                                    date: dateFormatter.format(
                                      new Date(snapshot.updatedAt),
                                    ),
                                  })}
                                </p>
                                {!available ? (
                                  <p className="mt-1 text-xs text-amber-700">
                                    {t("boardLibrary.snapshotUnavailable")}
                                  </p>
                                ) : null}
                              </>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            {isRenaming ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleRename(snapshot.id)}
                                  className="official-button"
                                >
                                  {t("boardLibrary.saveRename")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => cancelRename(snapshot.id)}
                                  className="official-button official-button-quiet"
                                >
                                  {t("boardLibrary.cancel")}
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  ref={(element) => {
                                    if (element) {
                                      reviewButtonRefs.current.set(
                                        snapshot.id,
                                        element,
                                      );
                                    } else {
                                      reviewButtonRefs.current.delete(
                                        snapshot.id,
                                      );
                                    }
                                  }}
                                  type="button"
                                  onClick={() => {
                                    setPreviewSnapshotId(snapshot.id);
                                    setError(null);
                                  }}
                                  disabled={!available}
                                  className="official-button"
                                >
                                  {t("boardLibrary.reviewRestore")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRenamingId(snapshot.id);
                                    setRenameDraft(snapshot.name);
                                    setError(null);
                                  }}
                                  disabled={!writable}
                                  className="official-button official-button-quiet"
                                >
                                  {t("boardLibrary.rename")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(snapshot)}
                                  disabled={!writable}
                                  className="official-button official-button-quiet text-red-700"
                                >
                                  {t("boardLibrary.delete")}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          <p
            id="board-library-error"
            className="mt-3 min-h-5 text-[13px] text-red-700"
            role="alert"
          >
            {error}
          </p>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {status}
          </p>
        </div>
      </m.div>
    </div>
  );
}

function RestorePreview({
  snapshot,
  changedSlots,
  currentPicks,
  onBack,
  onRestore,
}: {
  snapshot: BoardSnapshot;
  changedSlots: PickSlot[];
  currentPicks: StoredPicks;
  onBack: () => void;
  onRestore: () => void;
}) {
  const { t } = useLocale();
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const alreadyMatches = sameStoredPicks(currentPicks, snapshot.picks);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      backButtonRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="grid gap-4">
      {changedSlots.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)] px-4 py-6 text-center text-[13px] text-[var(--muted)]">
          {t("boardLibrary.noChanges")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)]">
          {changedSlots.map((slot, index) => (
            <div
              key={slot.id}
              className={`grid gap-2 p-3 sm:grid-cols-[minmax(120px,.45fr)_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center ${
                index > 0 ? "border-t border-[var(--line)]" : ""
              }`}
            >
              <p className="text-xs font-semibold text-[var(--muted)]">
                {slot.label}
              </p>
              <BoardValue
                label={t("boardLibrary.current")}
                songId={currentPicks[slot.id]}
              />
              <AppIcon
                name="chevron-right"
                size={16}
                className="hidden text-[var(--muted-soft)] sm:block"
              />
              <BoardValue
                label={t("boardLibrary.savedValue")}
                songId={snapshot.picks[slot.id]}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          ref={backButtonRef}
          type="button"
          onClick={onBack}
          className="official-button"
        >
          {t("boardLibrary.back")}
        </button>
        <button
          type="button"
          onClick={onRestore}
          disabled={alreadyMatches || Object.keys(snapshot.picks).length === 0}
          className="official-button official-button-primary"
        >
          {t("boardLibrary.restore")}
        </button>
      </div>
    </div>
  );
}

function BoardValue({ label, songId }: { label: string; songId?: string }) {
  const { t } = useLocale();
  const song = songId ? SONGS_BY_ID[songId] : undefined;
  return (
    <div className="min-w-0 rounded-[10px] bg-[var(--background)] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[13px] font-medium text-[var(--foreground)]">
        {song ? (
          <JapaneseContent>{song.title.ja}</JapaneseContent>
        ) : (
          t("boardLibrary.emptySlot")
        )}
      </p>
    </div>
  );
}

function getBoardLibraryErrorMessage(
  error: BoardLibraryError | "storage",
  t: ReturnType<typeof useLocale>["t"],
) {
  switch (error) {
    case "empty-name":
      return t("boardLibrary.error.emptyName");
    case "name-too-long":
      return t("boardLibrary.error.nameTooLong", {
        max: BOARD_NAME_MAX_LENGTH,
      });
    case "duplicate-name":
      return t("boardLibrary.error.duplicateName");
    case "capacity":
      return t("boardLibrary.error.capacity", {
        limit: BOARD_SNAPSHOT_LIMIT_PER_SCOPE,
      });
    case "empty-board":
      return t("boardLibrary.error.emptyBoard");
    case "duplicate-id":
    case "not-found":
    case "storage":
      return t("boardLibrary.error.storage");
  }
}
