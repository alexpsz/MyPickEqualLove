"use client";

import { useRef } from "react";
import * as m from "motion/react-m";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages";
import type {
  AvailableBoardComparison,
  BoardComparisonResult as BoardComparisonResultValue,
  BoardComparisonUnavailableReason,
} from "../utils/boardComparison";
import { DIALOG_RETURN_KEYS, useDialogA11y } from "../utils/useDialogA11y";
import AppIcon from "./AppIcon";
import { APPLE_OPACITY, APPLE_SPRING_GENTLE } from "./AppleMotion";
import BoardComparisonResult from "./BoardComparisonResult";
import JapaneseContent from "./JapaneseContent";
import type { PresenceState } from "./MotionPresence";

export interface BoardShareChange {
  slotId: string;
  slotLabel: string;
  currentTitle?: string;
  importedTitle?: string;
}

export type BoardShareDialogState =
  | {
      kind: "import";
      changes: BoardShareChange[];
      contextLabel?: string;
      previewRefreshed?: boolean;
      comparison?: AvailableBoardComparison;
    }
  | {
      kind: "mismatch";
      targetName: string;
      targetUrl: string;
    }
  | {
      kind: "invalid";
      unsupportedVersion: boolean;
    };

interface BoardShareImportModalProps {
  state: BoardShareDialogState;
  presenceState: PresenceState;
  comparisonAvailability: BoardComparisonResultValue | null;
  comparisonExporting: boolean;
  returnFocusKey: string;
  onClose: () => void;
  onConfirm: () => void;
  onCompare: () => void;
  onExportComparison: () => void;
}

const COMPARISON_UNAVAILABLE_KEYS = {
  "project-mismatch": "boardComparison.unavailable.projectMismatch",
  "experience-mismatch": "boardComparison.unavailable.experienceMismatch",
  "context-mismatch": "boardComparison.unavailable.contextMismatch",
  "no-slots": "boardComparison.unavailable.noSlots",
  "current-incomplete": "boardComparison.unavailable.currentIncomplete",
  "shared-incomplete": "boardComparison.unavailable.sharedIncomplete",
  "current-duplicate-song": "boardComparison.unavailable.currentDuplicate",
  "shared-duplicate-song": "boardComparison.unavailable.sharedDuplicate",
} as const satisfies Record<BoardComparisonUnavailableReason, MessageKey>;

export default function BoardShareImportModal({
  state,
  presenceState,
  comparisonAvailability,
  comparisonExporting,
  returnFocusKey,
  onClose,
  onConfirm,
  onCompare,
  onExportComparison,
}: BoardShareImportModalProps) {
  const { t } = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const isImport = state.kind === "import";
  const comparisonAvailable =
    comparisonAvailability?.availability === "available";
  const comparisonUnavailableMessage =
    comparisonAvailability?.availability === "unavailable"
      ? t(COMPARISON_UNAVAILABLE_KEYS[comparisonAvailability.reason])
      : null;
  const handleClose = () => {
    if (!comparisonExporting) onClose();
  };

  useDialogA11y({
    dialogRef: panelRef,
    onClose: handleClose,
    active: presenceState !== "exiting",
    initialFocusRef: cancelButtonRef,
    returnFocusKey,
    returnFocusFallbackKey: DIALOG_RETURN_KEYS.globalSearch,
  });

  const title =
    state.kind === "import"
      ? t("boardShare.previewTitle")
      : state.kind === "mismatch"
        ? t("boardShare.wrongTargetTitle")
        : t("boardShare.invalidTitle");

  return (
    <div
      className="motion-overlay fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
      data-presence={presenceState}
    >
      <m.button
        type="button"
        onClick={handleClose}
        disabled={presenceState === "exiting" || comparisonExporting}
        tabIndex={-1}
        aria-hidden={presenceState === "exiting"}
        className="overlay-scrim absolute inset-0 cursor-default bg-black/25 backdrop-blur-[2px]"
        aria-label={t("boardShare.closeAria")}
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
        aria-busy={comparisonExporting}
        aria-hidden={presenceState === "exiting"}
        inert={presenceState === "exiting"}
        aria-labelledby="board-share-dialog-title"
        className="apple-sheet relative z-10 flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none border-x-0 border-b-0 focus:outline-none sm:rounded-[var(--radius-lg)] sm:border"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={{
          opacity: APPLE_OPACITY,
          y: APPLE_SPRING_GENTLE,
          scale: APPLE_SPRING_GENTLE,
        }}
      >
        <header className="flex items-start gap-3 border-b border-[var(--line)] bg-[var(--paper)] px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2
              id="board-share-dialog-title"
              className="text-[20px] font-semibold tracking-[-0.03em] text-[var(--foreground)]"
            >
              {title}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
              {state.kind === "import"
                ? t("boardShare.previewBody")
                : state.kind === "mismatch"
                  ? t("boardShare.wrongTargetBody", {
                      target: state.targetName,
                    })
                  : state.unsupportedVersion
                    ? t("boardShare.unsupportedVersionBody")
                    : t("boardShare.invalidBody")}
            </p>
            {state.kind === "import" && state.contextLabel ? (
              <p className="mt-2 text-[13px] font-semibold text-[var(--foreground)]">
                {t("boardShare.contextChange", {
                  context: state.contextLabel,
                })}
              </p>
            ) : null}
            {state.kind === "import" && state.previewRefreshed ? (
              <p
                role="status"
                aria-live="polite"
                className="mt-3 rounded-[var(--radius-sm)] border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-medium leading-relaxed text-amber-950"
              >
                {t("boardShare.previewRefreshed")}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={comparisonExporting}
            className="icon-button icon-button-compact shrink-0"
            aria-label={t("boardShare.closeAria")}
          >
            <AppIcon name="close" size={16} />
          </button>
        </header>

        {state.kind === "import" ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--background)] p-4 sm:p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              {t("boardShare.changesHeading")}
            </h3>
            {state.changes.length === 0 ? (
              <p className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)] px-4 py-5 text-[13px] leading-relaxed text-[var(--muted)]">
                {t("boardShare.noChanges")}
              </p>
            ) : (
              <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)]">
                {state.changes.map((change, index) => (
                  <div
                    key={change.slotId}
                    className={`grid gap-2 px-3 py-3 sm:grid-cols-[minmax(120px,0.65fr)_minmax(0,1fr)] sm:items-center sm:px-4 ${
                      index > 0 ? "border-t border-[var(--line)]" : ""
                    }`}
                  >
                    <p className="text-[13px] font-semibold text-[var(--foreground)]">
                      {change.slotLabel}
                    </p>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[12px]">
                      <BoardValue
                        label={t("boardShare.current")}
                        title={change.currentTitle}
                        emptyLabel={t("boardShare.empty")}
                      />
                      <AppIcon
                        name="chevron-right"
                        size={14}
                        className="text-[var(--muted-soft)]"
                      />
                      <BoardValue
                        label={t("boardShare.imported")}
                        title={change.importedTitle}
                        emptyLabel={t("boardShare.empty")}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <section
              aria-labelledby="board-comparison-heading"
              className="mt-5 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)] p-4 sm:p-5"
            >
              <h3
                id="board-comparison-heading"
                className="text-sm font-semibold text-[var(--foreground)]"
              >
                {t("boardComparison.heading")}
              </h3>
              {comparisonUnavailableMessage ? (
                <p
                  id="board-comparison-unavailable"
                  role="status"
                  className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]"
                >
                  {comparisonUnavailableMessage}
                </p>
              ) : state.comparison ? (
                <BoardComparisonResult
                  result={state.comparison}
                  exporting={comparisonExporting}
                  onExport={onExportComparison}
                />
              ) : (
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
                  {t("boardComparison.ready")}
                </p>
              )}
            </section>
          </div>
        ) : null}

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] bg-[var(--paper)] p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-5">
          {state.kind === "mismatch" ? (
            <a
              href={state.targetUrl}
              className="official-button official-button-primary"
            >
              {t("boardShare.openCorrectPage")}
              <AppIcon name="external" size={16} />
            </a>
          ) : null}
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={handleClose}
            disabled={comparisonExporting}
            className={
              isImport
                ? "official-button official-button-quiet"
                : "official-button"
            }
          >
            {isImport ? t("boardShare.cancel") : t("boardShare.dismiss")}
          </button>
          {isImport ? (
            <button
              type="button"
              onClick={onCompare}
              disabled={!comparisonAvailable || comparisonExporting}
              aria-describedby={
                comparisonAvailable ? undefined : "board-comparison-unavailable"
              }
              className="official-button"
            >
              {t("boardComparison.compare")}
            </button>
          ) : null}
          {isImport ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={comparisonExporting}
              className="official-button official-button-primary"
            >
              {t("boardShare.confirm")}
            </button>
          ) : null}
        </footer>
      </m.div>
    </div>
  );
}

function BoardValue({
  label,
  title,
  emptyLabel,
}: {
  label: string;
  title?: string;
  emptyLabel: string;
}) {
  return (
    <div className="min-w-0">
      <p className="font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 break-words text-[13px] font-semibold leading-snug text-[var(--foreground)]">
        {title ? <JapaneseContent>{title}</JapaneseContent> : emptyLabel}
      </p>
    </div>
  );
}
