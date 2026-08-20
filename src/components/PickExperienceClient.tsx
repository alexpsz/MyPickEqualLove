"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import {
  PICK_ASSISTANT_CONFIG,
  PROJECT_CONFIG,
  PROJECT_ID,
  PROJECT_THEME_COLOR,
  SONG_DISCOVERY_CONFIG,
  STORAGE_KEYS,
} from "../config/project";
import {
  DEFAULT_EXPORT_OPTIONS,
  DEFAULT_EXPORT_SIZE_PRESET_ID,
  EXPORT_BACKGROUND,
  EXPORT_SCALE,
  EXPORT_TEMPLATE_ORDER,
  getExportSizePreset,
} from "../config/exportPresets";
import {
  MEMBERS,
  RELEASE_TYPES,
  RELEASE_YEARS,
  SONGS,
  SONGS_BY_ID,
  TRACK_TYPES,
} from "../data/songs";
import {
  formatArchetypeTemplate,
  getEqualLoveArchetypeUiCopy,
  resolveEqualLoveArchetype,
} from "../data/equalLoveArchetype";
import {
  getCoverToneAvailability,
  isExportTemplateAvailable,
  resolveAvailableExportTemplateId,
} from "../data/coverTonePilot";
import equalLoveArchetypeAffinitiesData from "../projects/equal-love/archetype-21/song-affinities.json";
import {
  createBoardSharePayload,
  resolveBoardSharePayload,
} from "../data/boardShare";
import {
  filterStoredPicksForExperience,
  getDefaultExperienceContextId,
  getExperienceContext,
  getExperienceContexts,
  findFirstEligibleEmptySlot,
  getAssistantEligibleSongsForExperience,
  getEligibleSongsForExperience,
  getEligibleSongsForSlot,
  getExperienceExportCanvasIdFor,
  getExperienceImageFileName,
  getExperiencePageUrl,
  getReplacementSlotStates,
  getSongBadgesBySongId,
  getSortedExperienceSlots,
  getStorageKeysForExperience,
  isSongEligibleForSlot,
  relocateStoredPick,
  type RelocatePickResult,
} from "../data/pickExperiences";
import { localizeExperienceUi } from "../i18n/content";
import ContextSelector from "./ContextSelector";
import { useLocale } from "../i18n/LocaleProvider";
import type { PickExperience } from "../schema/pick-experience";
import type {
  ExportContentKind,
  ExportHeaderPresentation,
  ExportOptions,
  ExportSizePresetId,
  ExportTemplateId,
} from "../schema/export";
import type { PickSlotId, Picks, Song, StoredPicks } from "../schema/music";
import {
  createBoardHistoryState,
  sameStoredPicks,
  type BoardHistoryState,
  type BoardMutationKind,
} from "../utils/boardHistory";
import {
  addBoardSnapshot,
  createEmptyBoardLibrary,
  deleteBoardSnapshot,
  getSnapshotsForScope,
  loadBoardLibrary,
  loadStoredBoard,
  loadStoredOptions,
  mutateStoredBoardLibrary,
  mutateStoredOptions,
  renameBoardSnapshot,
  type BoardLibraryDocument,
  type BoardScope,
  type BoardSnapshot,
  type StorageLoadStatus,
} from "../utils/boardStorage";
import {
  applyBoardHistoryTransaction,
  commitBoardTransaction,
  createEphemeralBoardReset,
  getBoardStorageEventAction,
  importBoardTransaction,
  isSuccessfulBoardMutation,
  isWritableBoardStorageStatus,
  publishBoardTransactionResult,
  resetStoredBoardTransaction,
  type BoardTransactionResult,
  type ImportedBoardInput,
} from "../utils/boardTransaction";
import { centerExportYearInk } from "../utils/centerExportYearInk";
import { deriveBoardInsights } from "../utils/boardInsights";
import {
  installExportStyleAdapter,
  type ExportStyleWindowLike,
} from "../utils/exportStyleProxy";
import { assertExportLayoutFits } from "../utils/assertExportLayoutFits";
import {
  buildBoardShareUrl,
  createBoardSharePreviewDiff,
  isBoardShareHash,
  parseBoardShareUrl,
  type BoardSharePayload,
} from "../utils/boardShareProtocol.mjs";
import {
  planBoardShareDialog,
  type BoardShareDialogPlan,
} from "../utils/boardShareImport";
import { compareBoardPicks } from "../utils/boardComparison";
import { resolveExportRealmRequest } from "../utils/exportRealmRequest";
import {
  planAssistantSnapshotSync,
  resolveStorageSyncAction,
  shouldResyncStorage,
} from "../utils/storageSyncPolicy";
import {
  EXPORT_CAPTURE_PROTOCOL_VERSION,
  isExportRealmHash,
  EXPORT_REALM_READY_TYPE,
  EXPORT_REALM_RESULT_TYPE,
  captureExportImageInFrame,
  isExportRenderRequest,
  type ExportRenderRequest,
  type ExportRenderResult,
} from "../utils/exportCapture";
import { waitForExportImageReady } from "../utils/exportImageReadiness";
import { getMemberColorGradient } from "../utils/memberColors";
import {
  createPickAssistantSession,
  deriveTournament,
  getBoardCandidateIds,
  parsePickAssistantSnapshot,
  planRankedPicks,
  recordComparison,
  samePickAssistantApplicationInputs,
  samePickAssistantSnapshots,
  skipComparison,
  togglePickAssistantShortlistSong,
  undoComparison,
  updatePickAssistantSnapshot,
  type ComparisonOutcome,
  type PickAssistantSession,
  type PickAssistantSnapshot,
} from "../utils/pickAssistant";
import {
  createEmptyPickAssistantSnapshot,
  createMutationId,
  loadPickAssistantSnapshot,
  resetPickAssistantStorageSafely,
  savePickAssistantSnapshotSafely,
} from "../utils/pickAssistantStorage";
import {
  createEmptySongDiscoveryState,
  getNewSongIds,
  loadSongDiscoveryState,
  markSongDiscoverySongsSeen,
  recordRecentSongId,
  updateStoredSongDiscoveryState,
  type SongDiscoveryState,
} from "../utils/songDiscoveryStorage";
import {
  DIALOG_RETURN_KEYS,
  getPickSlotReturnKey,
  setActiveDialogReturnFocusKey,
} from "../utils/useDialogA11y";
import {
  isShortcutEditableTarget,
  resolveKeyboardShortcut,
} from "../utils/keyboardShortcuts";
import AppTopBar from "./AppTopBar";
import AppleMotion from "./AppleMotion";
import BoardLibraryModal, {
  type BoardLibraryActionResult,
} from "./BoardLibraryModal";
import BoardInsightsPanel from "./BoardInsightsPanel";
import BoardShareImportModal, {
  type BoardShareDialogState,
} from "./BoardShareImportModal";
import CommandPalette, {
  type CommandPaletteAction,
  type CommandPaletteCommand,
  type CommandPaletteView,
} from "./CommandPalette";
import Controls from "./Controls";
import ExperienceNavigation from "./ExperienceNavigation";
import ExportBoard from "./ExportBoard";
import Footer from "./Footer";
import Header from "./Header";
import JapaneseContent, {
  LocalizedTextWithJapaneseValue,
} from "./JapaneseContent";
import MotionPresence from "./MotionPresence";
import NewSongsBanner from "./NewSongsBanner";
import PickBoard from "./PickBoard";
import PreviewModal from "./PreviewModal";
import ReplacementModal from "./ReplacementModal";
import SearchModal, {
  type SearchSelectionMode,
  type SelectedSongPresentation,
} from "./SearchModal";
import SongDetailModal from "./SongDetailModal";

const PickAssistantModal = dynamic(() => import("./PickAssistantModal"), {
  ssr: false,
});

const ArchetypeResultModal = dynamic(() => import("./ArchetypeResultModal"), {
  ssr: false,
});

type PickAssistantStorageIssue =
  import("./PickAssistantModal").PickAssistantStorageIssue;

interface PickExperienceClientProps {
  experience: PickExperience;
}

const MAX_NICKNAME_LENGTH = 32;
const CATALOG_SONG_IDS = SONGS.map((song) => song.id);
const BOARD_LINK_COPIED_DURATION_MS = 2_000;
interface PendingBoardShareImport {
  payload: BoardSharePayload;
  picks: StoredPicks;
  baselinePicks: StoredPicks;
}

interface AssistantApplyBaseline {
  storageKey: string;
  contextId?: string;
  boardPicks: StoredPicks;
  revision: number;
  mutationId: string;
}

interface PreviewSnapshot {
  kind: ExportContentKind;
  archetypeInputKey?: string;
  dataUrl: string;
  optionsKey: string;
  imageFileName: string;
  pageUrl: string;
  previewLabel: string;
  shareText: string;
  shareHashtags: string[];
  shareTitle: string;
}

const getPreviewOptionsKey = (
  showTitles: boolean,
  transparentBg: boolean,
  showQrCode: boolean,
  templateId: ExportTemplateId,
  kind: ExportContentKind = "picks",
  archetypeInputKey = "",
) =>
  [
    showTitles ? "titles" : "no-titles",
    transparentBg ? "transparent" : "opaque",
    showQrCode ? "qr" : "no-qr",
    templateId,
    DEFAULT_EXPORT_SIZE_PRESET_ID,
    kind,
    archetypeInputKey,
  ].join(":");

export default function PickExperienceClient({
  experience,
}: PickExperienceClientProps) {
  const { locale, t } = useLocale();
  const isStandard = experience.kind === "standard";
  const uiCopy = useMemo(
    () => localizeExperienceUi(experience, locale),
    [experience, locale],
  );
  const boardSessionCallbacksRef = useRef<{
    onBeforeHydrated: (
      storageKeys: ReturnType<typeof getStorageKeysForExperience>,
    ) => void;
    onContextWillActivate: () => void;
    onInvalidatePreview: () => void;
    onStorageUnavailable: () => void;
    onExternalBoardReset: () => void;
  }>({
    onBeforeHydrated: () => {},
    onContextWillActivate: () => {},
    onInvalidatePreview: () => {},
    onStorageUnavailable: () => {},
    onExternalBoardReset: () => {},
  });
  // ── Board session ────────────────────────────────────────────────────────
  // Context selection, the undo/redo history and every localStorage read and
  // write for the board. The decisions live in boardTransaction.ts; what stays
  // here is the React wiring, which has exactly one consumer.
  //
  // The callbacks below are read through boardSessionCallbacksRef because they
  // close over state declared later in this component. The ref is assigned
  // during render, so effects always see the current implementations.
  const contextOptions = useMemo(
    () => getExperienceContexts(experience),
    [experience],
  );
  const defaultContextId = useMemo(
    () => getDefaultExperienceContextId(experience),
    [experience],
  );
  const [contextId, setContextId] = useState<string | undefined>(
    defaultContextId,
  );
  const activeContext = useMemo(
    () => getExperienceContext(experience, contextId),
    [contextId, experience],
  );
  const effectiveContextId = activeContext?.id;
  const storageKeys = useMemo(
    () => getStorageKeysForExperience(experience, effectiveContextId),
    [effectiveContextId, experience],
  );
  const [boardHistory, setBoardHistory] = useState<BoardHistoryState>(() =>
    createBoardHistoryState(),
  );
  const [boardStorageWritable, setBoardStorageWritable] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isExportRealm, setIsExportRealm] = useState(false);
  const storedPicks = boardHistory.present;
  const storedPicksRef = useRef<StoredPicks>({});
  const historyRef = useRef(boardHistory);

  const publishHistory = useCallback((nextHistory: BoardHistoryState) => {
    historyRef.current = nextHistory;
    storedPicksRef.current = nextHistory.present;
    setBoardHistory(nextHistory);
  }, []);

  const resetHistory = useCallback(
    (picks: StoredPicks) => publishHistory(createBoardHistoryState(picks)),
    [publishHistory],
  );

  const sanitizeForContext = useCallback(
    (candidatePicks: StoredPicks, targetContextId?: string) =>
      filterStoredPicksForExperience({
        experience,
        storedPicks: candidatePicks,
        contextId: targetContextId,
      }),
    [experience],
  );

  useEffect(() => {
    const exportRealm =
      window.parent !== window && isExportRealmHash(window.location.hash);
    setIsExportRealm(exportRealm);
    if (exportRealm) {
      setContextId(defaultContextId);
      resetHistory({});
      setHydrated(true);
      return;
    }

    const timer = window.setTimeout(() => {
      let initialContextId = defaultContextId;
      const defaultStorageKeys = getStorageKeysForExperience(
        experience,
        defaultContextId,
      );

      if (defaultStorageKeys.context) {
        let savedContextId: string | null = null;
        try {
          savedContextId = localStorage.getItem(defaultStorageKeys.context);
        } catch {
          savedContextId = null;
        }
        if (
          savedContextId &&
          contextOptions.some((context) => context.id === savedContextId)
        ) {
          initialContextId = savedContextId;
        }
      }

      const initialStorageKeys = getStorageKeysForExperience(
        experience,
        initialContextId,
      );
      setContextId(initialContextId);
      const boardResult = loadStoredBoard({
        storage: localStorage,
        versionedKey: initialStorageKeys.picksV2,
        legacyKey: initialStorageKeys.picks,
        sanitize: (candidatePicks) =>
          sanitizeForContext(candidatePicks, initialContextId),
      });
      resetHistory(boardResult.picks);
      const writable = isWritableBoardStorageStatus(boardResult.status);
      setBoardStorageWritable(writable);
      boardSessionCallbacksRef.current.onBeforeHydrated(initialStorageKeys);
      setHydrated(true);
      if (!writable) boardSessionCallbacksRef.current.onStorageUnavailable();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    contextOptions,
    defaultContextId,
    experience,
    resetHistory,
    sanitizeForContext,
  ]);

  const activateExperienceContext = useCallback(
    (requestedContextId: string | null | undefined, persist: boolean) => {
      const nextContextId = contextOptions.some(
        (context) => context.id === requestedContextId,
      )
        ? (requestedContextId ?? defaultContextId)
        : defaultContextId;
      const nextStorageKeys = getStorageKeysForExperience(
        experience,
        nextContextId,
      );

      boardSessionCallbacksRef.current.onInvalidatePreview();
      boardSessionCallbacksRef.current.onContextWillActivate();
      setContextId(nextContextId);

      if (persist && nextStorageKeys.context && nextContextId) {
        try {
          localStorage.setItem(nextStorageKeys.context, nextContextId);
        } catch {
          // Preserve the existing best-effort context preference behavior.
        }
      }

      const boardResult = loadStoredBoard({
        storage: localStorage,
        versionedKey: nextStorageKeys.picksV2,
        legacyKey: nextStorageKeys.picks,
        sanitize: (candidatePicks) =>
          sanitizeForContext(candidatePicks, nextContextId),
      });
      const writable = isWritableBoardStorageStatus(boardResult.status);
      setBoardStorageWritable(writable);
      resetHistory(boardResult.picks);
      if (!writable) boardSessionCallbacksRef.current.onStorageUnavailable();
    },
    [
      contextOptions,
      defaultContextId,
      experience,
      resetHistory,
      sanitizeForContext,
    ],
  );

  useEffect(() => {
    if (!hydrated || isExportRealm) return;

    const syncActiveBoard = () => {
      const result = loadStoredBoard({
        storage: localStorage,
        versionedKey: storageKeys.picksV2,
        legacyKey: storageKeys.picks,
        sanitize: (candidatePicks) =>
          sanitizeForContext(candidatePicks, effectiveContextId),
      });
      const writable = isWritableBoardStorageStatus(result.status);
      setBoardStorageWritable(writable);
      if (!writable) {
        boardSessionCallbacksRef.current.onStorageUnavailable();
        return;
      }
      boardSessionCallbacksRef.current.onInvalidatePreview();
      resetHistory(result.picks);
      boardSessionCallbacksRef.current.onExternalBoardReset();
    };
    const syncStoredContext = () => {
      if (!storageKeys.context) return false;
      let nextContextId: string | null = null;
      try {
        nextContextId = localStorage.getItem(storageKeys.context);
      } catch {
        boardSessionCallbacksRef.current.onStorageUnavailable();
        return true;
      }
      activateExperienceContext(nextContextId, false);
      return true;
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      switch (getBoardStorageEventAction(event.key, storageKeys)) {
        case "context":
          syncStoredContext();
          return;
        case "clear":
          if (!syncStoredContext()) syncActiveBoard();
          return;
        case "board":
          syncActiveBoard();
          return;
        case "ignore":
          return;
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [
    activateExperienceContext,
    effectiveContextId,
    hydrated,
    isExportRealm,
    resetHistory,
    sanitizeForContext,
    storageKeys,
  ]);

  const createTransactionTarget = useCallback(
    () => ({
      storage: localStorage,
      versionedKey: storageKeys.picksV2,
      legacyKey: storageKeys.picks,
      sanitize: (candidatePicks: StoredPicks) =>
        sanitizeForContext(candidatePicks, effectiveContextId),
    }),
    [
      effectiveContextId,
      sanitizeForContext,
      storageKeys.picks,
      storageKeys.picksV2,
    ],
  );

  const publishTransaction = useCallback(
    (result: BoardTransactionResult) =>
      publishBoardTransactionResult(result, {
        invalidatePreview: () =>
          boardSessionCallbacksRef.current.onInvalidatePreview(),
        publishHistory,
        resetHistory,
        setStorageWritable: setBoardStorageWritable,
        onExternalBoardReset: () =>
          boardSessionCallbacksRef.current.onExternalBoardReset(),
      }),
    [publishHistory, resetHistory],
  );

  const commitBoardSessionMutation = useCallback(
    (kind: BoardMutationKind, nextPicks: StoredPicks) => {
      if (!boardStorageWritable) return "blocked" as const;
      return publishTransaction(
        commitBoardTransaction({
          target: createTransactionTarget(),
          expectedPicks: storedPicksRef.current,
          history: historyRef.current,
          mutation: { kind, nextPicks },
        }),
      );
    },
    [boardStorageWritable, createTransactionTarget, publishTransaction],
  );

  const applyBoardSessionHistoryAction = useCallback(
    (type: "undo" | "redo") => {
      if (!boardStorageWritable) return "blocked" as const;
      return publishTransaction(
        applyBoardHistoryTransaction({
          target: createTransactionTarget(),
          expectedPicks: storedPicksRef.current,
          history: historyRef.current,
          action: { type },
        }),
      );
    },
    [boardStorageWritable, createTransactionTarget, publishTransaction],
  );

  const resetBoardSessionWithoutHistory = useCallback(
    (nextPicks: StoredPicks) => {
      if (!boardStorageWritable) return "blocked" as const;
      return publishTransaction(
        resetStoredBoardTransaction({
          target: createTransactionTarget(),
          expectedPicks: storedPicksRef.current,
          history: historyRef.current,
          nextPicks,
        }),
      );
    },
    [boardStorageWritable, createTransactionTarget, publishTransaction],
  );

  const importBoard = useCallback(
    ({
      contextId: nextContextId,
      expectedPicks,
      picks,
    }: ImportedBoardInput) => {
      const targetStorageKeys = getStorageKeysForExperience(
        experience,
        nextContextId,
      );
      const result = importBoardTransaction({
        storage: localStorage,
        versionedKey: targetStorageKeys.picksV2,
        legacyKey: targetStorageKeys.picks,
        sanitize: (candidatePicks) =>
          sanitizeForContext(candidatePicks, nextContextId),
        expectedPicks,
        picks,
        context:
          targetStorageKeys.context && nextContextId
            ? { key: targetStorageKeys.context, value: nextContextId }
            : undefined,
      });
      if (result.status === "committed") {
        boardSessionCallbacksRef.current.onInvalidatePreview();
        setContextId(nextContextId);
        setBoardStorageWritable(true);
        publishHistory(result.history);
      } else if (result.status === "blocked") {
        setBoardStorageWritable(false);
      }
      return result;
    },
    [experience, publishHistory, sanitizeForContext],
  );

  const resetFromFreshness = useCallback(
    (picks: StoredPicks) => {
      boardSessionCallbacksRef.current.onInvalidatePreview();
      resetHistory(sanitizeForContext(picks, effectiveContextId));
    },
    [effectiveContextId, resetHistory, sanitizeForContext],
  );

  const injectEphemeralBoard = useCallback(
    (nextContextId: string | undefined, picks: StoredPicks) => {
      const reset = createEphemeralBoardReset(picks, (candidatePicks) =>
        sanitizeForContext(candidatePicks, nextContextId),
      );
      setContextId(nextContextId);
      publishHistory(reset.history);
    },
    [publishHistory, sanitizeForContext],
  );

  const markBoardStorageUnavailable = useCallback(
    () => setBoardStorageWritable(false),
    [],
  );
  // ── End board session ────────────────────────────────────────────────────
  const uiContextOptions = useMemo(
    () =>
      contextOptions.map((context) => ({
        ...context,
        label: uiCopy.contextLabels?.[context.id] ?? context.label,
      })),
    [contextOptions, uiCopy.contextLabels],
  );
  const activeUiContextDescription = activeContext
    ? `${uiCopy.contextLabels?.[activeContext.id] ?? activeContext.label} · ${activeContext.dateLabel}`
    : undefined;
  const slots = useMemo(
    () => getSortedExperienceSlots(experience),
    [experience],
  );
  const assistantEligibleSongs = useMemo(
    () =>
      getAssistantEligibleSongsForExperience(experience, effectiveContextId),
    [effectiveContextId, experience],
  );
  const assistantEligibleSongIds = useMemo(
    () => new Set(assistantEligibleSongs.map((song) => song.id)),
    [assistantEligibleSongs],
  );
  const pickAssistantStorageOptions = useMemo(
    () => ({
      ...PICK_ASSISTANT_CONFIG,
      validSongIds: assistantEligibleSongIds,
    }),
    [assistantEligibleSongIds],
  );
  const uiSlots = useMemo(
    () => uiCopy.slots.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [uiCopy.slots],
  );
  const [activeSlotId, setActiveSlotId] = useState<PickSlotId | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [searchSelectionMode, setSearchSelectionMode] =
    useState<SearchSelectionMode>("board");
  const [showBoardLibrary, setShowBoardLibrary] = useState(false);
  const [detailSongId, setDetailSongId] = useState<string | null>(null);
  const [detailLayerActive, setDetailLayerActive] = useState(false);
  const [songDiscoveryState, setSongDiscoveryState] =
    useState<SongDiscoveryState>(createEmptySongDiscoveryState);
  const [songDiscoveryNewSongIds, setSongDiscoveryNewSongIds] = useState<
    string[]
  >([]);
  const [pendingReplacementSong, setPendingReplacementSong] =
    useState<Song | null>(null);
  const [preview, setPreview] = useState<PreviewSnapshot | null>(null);
  const [openArchetypeInputKey, setOpenArchetypeInputKey] = useState<
    string | null
  >(null);
  const [generating, setGenerating] = useState(false);
  const [showTitles, setShowTitles] = useState(
    DEFAULT_EXPORT_OPTIONS.showTitles,
  );
  const [transparentBg, setTransparentBg] = useState(
    DEFAULT_EXPORT_OPTIONS.transparentBg,
  );
  const [showQrCode, setShowQrCode] = useState(
    DEFAULT_EXPORT_OPTIONS.showQrCode,
  );
  const [templateId, setTemplateId] = useState<ExportTemplateId>(
    DEFAULT_EXPORT_OPTIONS.templateId,
  );
  const [frameSizePresetId, setFrameSizePresetId] =
    useState<ExportSizePresetId>(DEFAULT_EXPORT_SIZE_PRESET_ID);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [frameCaptureRequest, setFrameCaptureRequest] =
    useState<ExportRenderRequest | null>(null);
  const [framePageUrl, setFramePageUrl] = useState<string | null>(null);
  const [showPickAssistant, setShowPickAssistant] = useState(false);
  const [pickAssistantSnapshot, setPickAssistantSnapshot] =
    useState<PickAssistantSnapshot>(() =>
      createEmptyPickAssistantSnapshot(PICK_ASSISTANT_CONFIG.schemaVersion),
    );
  const [pickAssistantStorageIssue, setPickAssistantStorageIssue] =
    useState<PickAssistantStorageIssue | null>(null);
  const [assistantNeedsReview, setAssistantNeedsReview] = useState(false);
  const [assistantReviewNotice, setAssistantReviewNotice] = useState(false);
  const [assistantMutationPending, setAssistantMutationPending] =
    useState(false);
  const [boardLibrary, setBoardLibrary] = useState<BoardLibraryDocument>(() =>
    createEmptyBoardLibrary(),
  );
  const [boardLibraryStatus, setBoardLibraryStatus] =
    useState<StorageLoadStatus>("empty");
  const [boardLibraryLoaded, setBoardLibraryLoaded] = useState(false);
  const [boardStatusMessage, setBoardStatusMessage] = useState("");
  const [optionsStorageWritable, setOptionsStorageWritable] = useState(false);
  const [boardLinkCopied, setBoardLinkCopied] = useState(false);
  const [boardShareDialog, setBoardShareDialog] =
    useState<BoardShareDialogState | null>(null);
  const [pendingBoardShareImport, setPendingBoardShareImport] =
    useState<PendingBoardShareImport | null>(null);
  const [commandPaletteView, setCommandPaletteView] =
    useState<CommandPaletteView | null>(null);
  const generatingRef = useRef(false);
  const activeFrameRequestIdRef = useRef<string | null>(null);
  const capturedFrameRequestIdRef = useRef<string | null>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const pickAssistantTriggerRef = useRef<HTMLButtonElement>(null);
  const archetypeTriggerRef = useRef<HTMLButtonElement>(null);
  const pickAssistantSnapshotRef = useRef(pickAssistantSnapshot);
  const pickAssistantStorageKeyRef = useRef(storageKeys.assistant);
  const assistantMutationPendingRef = useRef(false);
  const assistantApplyBaselineRef = useRef<AssistantApplyBaseline | null>(null);
  const assistantResultVisibleRef = useRef(false);
  const searchReturnFocusKeyRef = useRef<string>(
    DIALOG_RETURN_KEYS.globalSearch,
  );
  const detailTriggerRef = useRef<HTMLElement>(null);
  const previewGenerationIdRef = useRef(0);
  const activePreviewCaptureAbortRef = useRef<AbortController | null>(null);
  const boardShareConsumedRef = useRef(false);
  const boardLinkCopiedTimerRef = useRef<number | null>(null);
  const pendingCommandPaletteActionRef = useRef<CommandPaletteAction | null>(
    null,
  );
  const shortcutActionHandlersRef = useRef<{
    openCommandPalette: (view: CommandPaletteView) => void;
    openSearch: () => void;
  }>({
    openCommandPalette: () => {},
    openSearch: () => {},
  });
  const boardSharePreviewSnapshotRef = useRef({
    experience,
    effectiveContextId,
    storedPicks,
    slots,
    uiSlots,
    uiContextOptions,
  });
  boardSharePreviewSnapshotRef.current = {
    experience,
    effectiveContextId,
    storedPicks,
    slots,
    uiSlots,
    uiContextOptions,
  };
  pickAssistantStorageKeyRef.current = storageKeys.assistant;

  const boardShareComparisonAvailability = useMemo(() => {
    if (boardShareDialog?.kind !== "import" || !pendingBoardShareImport) {
      return null;
    }

    return compareBoardPicks({
      slots,
      current: {
        scope: {
          projectId: experience.projectId,
          experienceId: experience.id,
          contextId: effectiveContextId,
        },
        picks: storedPicks,
      },
      shared: {
        scope: {
          projectId: pendingBoardShareImport.payload.p,
          experienceId: pendingBoardShareImport.payload.e,
          contextId: pendingBoardShareImport.payload.c,
        },
        picks: pendingBoardShareImport.picks,
      },
    });
  }, [
    boardShareDialog?.kind,
    effectiveContextId,
    experience.id,
    experience.projectId,
    pendingBoardShareImport,
    slots,
    storedPicks,
  ]);

  const setCurrentPickAssistantSnapshot = useCallback(
    (snapshot: PickAssistantSnapshot) => {
      pickAssistantSnapshotRef.current = snapshot;
      setPickAssistantSnapshot(snapshot);
    },
    [],
  );

  const picks = useMemo<Picks>(() => {
    const entries = Object.entries(storedPicks)
      .map(([slotId, songId]) => [slotId, SONGS_BY_ID[songId]] as const)
      .filter((entry): entry is readonly [string, Song] => Boolean(entry[1]));

    return Object.fromEntries(entries);
  }, [storedPicks]);
  const coverToneAvailability = useMemo(
    () =>
      getCoverToneAvailability({
        projectId: PROJECT_ID,
        slots,
        picks,
      }),
    [picks, slots],
  );
  const availableTemplateIds = useMemo(
    () =>
      EXPORT_TEMPLATE_ORDER.filter((candidate) =>
        isExportTemplateAvailable(candidate, coverToneAvailability),
      ),
    [coverToneAvailability],
  );
  const activeTemplateId = hydrated
    ? resolveAvailableExportTemplateId(templateId, coverToneAvailability)
    : templateId;
  const boardInsights = useMemo(() => {
    if (!hydrated || isExportRealm || !isStandard || slots.length !== 10) {
      return null;
    }

    const topTen: Song[] = [];
    const songIds = new Set<string>();

    for (const slot of slots) {
      const song = picks[slot.id];
      if (!song || songIds.has(song.id)) return null;

      topTen.push(song);
      songIds.add(song.id);
    }

    return deriveBoardInsights(topTen);
  }, [hydrated, isExportRealm, isStandard, picks, slots]);
  const showArchetypeEntry =
    hydrated &&
    !isExportRealm &&
    PROJECT_ID === "equal-love" &&
    isStandard &&
    slots.length === 10;
  const newSongIdSet = useMemo(
    () => new Set(songDiscoveryNewSongIds),
    [songDiscoveryNewSongIds],
  );
  const isStandardTopTen = isStandard && slots.length === 10;
  const showNewSongsBanner =
    hydrated &&
    !isExportRealm &&
    isStandardTopTen &&
    songDiscoveryNewSongIds.length > 0;
  const archetypeEntryUi = useMemo(
    () => (showArchetypeEntry ? getEqualLoveArchetypeUiCopy(locale) : null),
    [locale, showArchetypeEntry],
  );
  const archetypeSelectedSongIds = showArchetypeEntry
    ? slots.flatMap((slot) => {
        const songId = picks[slot.id]?.id;
        return songId ? [songId] : [];
      })
    : [];
  const archetypeSelectedCount = new Set(archetypeSelectedSongIds).size;
  const archetypeRemainingCount = slots.length - archetypeSelectedCount;
  const archetypeFirstEmptySlotId = showArchetypeEntry
    ? slots.find((slot) => !picks[slot.id])?.id
    : undefined;
  const archetypeTopTenSongIds = useMemo(() => {
    if (
      !hydrated ||
      (isExportRealm && frameCaptureRequest?.kind !== "archetype") ||
      PROJECT_ID !== "equal-love" ||
      !isStandard ||
      slots.length !== 10
    ) {
      return null;
    }
    const songIds = slots.map((slot) => picks[slot.id]?.id);
    if (
      songIds.some((songId) => !songId) ||
      new Set(songIds).size !== slots.length
    ) {
      return null;
    }
    return songIds as string[];
  }, [
    frameCaptureRequest?.kind,
    hydrated,
    isExportRealm,
    isStandard,
    picks,
    slots,
  ]);
  const archetypeResult = useMemo(
    () =>
      archetypeTopTenSongIds
        ? resolveEqualLoveArchetype(
            archetypeTopTenSongIds,
            locale,
            equalLoveArchetypeAffinitiesData,
          )
        : null,
    [archetypeTopTenSongIds, locale],
  );
  const archetypeExportPresentation = useMemo<
    ExportHeaderPresentation | undefined
  >(() => {
    if (frameCaptureRequest?.kind !== "archetype" || !archetypeResult) {
      return undefined;
    }

    const names = archetypeResult.characters
      .map((character) => character.displayName)
      .join(" / ");
    const character = archetypeResult.characters[0];
    return {
      title: "MY ADVENTURE PARTNER",
      subtitle:
        !archetypeResult.isTie && character
          ? `${names} · ${character.title}`
          : names,
      highlights:
        !archetypeResult.isTie && character
          ? character.overlapTraitIds.map(
              (traitId) => archetypeResult.ui.traits[traitId],
            )
          : ["TIED PARTNERS", "21ST SINGLE MV"],
      footerLabel: "MY PICK ARCHETYPE",
    };
  }, [archetypeResult, frameCaptureRequest?.kind]);

  useEffect(() => {
    setOpenArchetypeInputKey((current) =>
      current && current !== archetypeResult?.inputKey ? null : current,
    );
  }, [archetypeResult?.inputKey]);
  const assistantShortlistIds = pickAssistantSnapshot.shortlistIds;
  const candidateSongIds = useMemo(
    () => new Set(assistantShortlistIds),
    [assistantShortlistIds],
  );
  const shortlistSongs = useMemo(
    () =>
      assistantShortlistIds
        .map((songId) => SONGS_BY_ID[songId])
        .filter((song): song is Song => Boolean(song)),
    [assistantShortlistIds],
  );
  const assistantSession = useMemo(() => {
    const session = pickAssistantSnapshot.session;
    if (
      !session ||
      session.candidateIds.length !== assistantShortlistIds.length ||
      session.candidateIds.some(
        (songId, index) => songId !== assistantShortlistIds[index],
      )
    ) {
      return null;
    }
    return session;
  }, [assistantShortlistIds, pickAssistantSnapshot.session]);
  const assistantTournament = useMemo(
    () => (assistantSession ? deriveTournament(assistantSession) : null),
    [assistantSession],
  );
  assistantResultVisibleRef.current =
    showPickAssistant && assistantTournament?.status === "complete";
  const slotsById = useMemo(
    () => Object.fromEntries(slots.map((slot) => [slot.id, slot])),
    [slots],
  );
  const assistantApplicationPlan = useMemo(
    () =>
      assistantTournament?.status === "complete"
        ? planRankedPicks({
            orderedSongIds: assistantTournament.orderedIds,
            slotIds: slots.map((slot) => slot.id),
            isEligible: (songId, slotId) => {
              const slot = slotsById[slotId];
              return Boolean(
                slot &&
                isSongEligibleForSlot({
                  experience,
                  slot,
                  songId,
                  contextId: effectiveContextId,
                }),
              );
            },
          })
        : null,
    [assistantTournament, effectiveContextId, experience, slots, slotsById],
  );
  const assistantSlotLabels = useMemo(
    () => Object.fromEntries(uiSlots.map((slot) => [slot.id, slot.label])),
    [uiSlots],
  );
  const currentBoardCandidateIds = useMemo(
    () =>
      getBoardCandidateIds(
        storedPicks,
        slots.map((slot) => slot.id),
      ).filter((songId) => assistantEligibleSongIds.has(songId)),
    [assistantEligibleSongIds, slots, storedPicks],
  );
  const selectedRanksBySongId = useMemo(() => {
    const ranks: Record<string, number> = {};
    for (const slot of slots) {
      const songId = storedPicks[slot.id];
      if (songId && ranks[songId] === undefined) {
        ranks[songId] = slot.sortOrder;
      }
    }
    return ranks;
  }, [slots, storedPicks]);
  const detailSong = detailSongId ? SONGS_BY_ID[detailSongId] : undefined;

  const exportNickname = useMemo(
    () => normalizeNickname(nicknameDraft),
    [nicknameDraft],
  );
  const exportCanvasId = useMemo(
    () => getExperienceExportCanvasIdFor(experience),
    [experience],
  );
  const pageUrl = useMemo(() => getExperiencePageUrl(experience), [experience]);
  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.id === activeSlotId),
    [activeSlotId, slots],
  );
  const selectedUiSlot = useMemo(
    () => uiSlots.find((slot) => slot.id === activeSlotId),
    [activeSlotId, uiSlots],
  );
  const searchSongs = useMemo(
    () =>
      searchSelectionMode === "assistant-shortlist"
        ? assistantEligibleSongs
        : selectedSlot
          ? getEligibleSongsForSlot(
              experience,
              selectedSlot,
              effectiveContextId,
            )
          : getEligibleSongsForExperience(experience, effectiveContextId),
    [
      assistantEligibleSongs,
      effectiveContextId,
      experience,
      searchSelectionMode,
      selectedSlot,
    ],
  );
  const eligibleSongsCount = assistantEligibleSongs.length;
  const songBadgesBySongId = useMemo(
    () =>
      getSongBadgesBySongId(
        experience,
        uiCopy.catalogOnlyBadge,
        uiCopy.contextLabels,
      ),
    [experience, uiCopy.catalogOnlyBadge, uiCopy.contextLabels],
  );
  const replacementSlotStates = useMemo(
    () =>
      pendingReplacementSong
        ? getReplacementSlotStates({
            experience,
            songId: pendingReplacementSong.id,
            contextId: effectiveContextId,
            disabledReason: t("errors.songIneligible"),
          })
        : [],
    [effectiveContextId, experience, pendingReplacementSong, t],
  );
  const selectedSongsById = useMemo(() => {
    const result: Record<string, SelectedSongPresentation> = {};
    for (const slot of slots) {
      const songId = storedPicks[slot.id];
      const uiSlot = uiSlots.find((candidate) => candidate.id === slot.id);
      if (!songId || !uiSlot) continue;

      let action: SelectedSongPresentation["action"] = "focus";
      if (activeSlotId === slot.id) {
        action = "here";
      } else if (activeSlotId) {
        const relocation = relocateStoredPick({
          experience,
          storedPicks,
          fromSlotId: slot.id,
          toSlotId: activeSlotId,
          contextId: effectiveContextId,
        });
        if (relocation.ok) {
          action = storedPicks[activeSlotId] ? "swap" : "move";
        }
      }

      result[songId] = { position: uiSlot.label, action };
    }
    return result;
  }, [
    activeSlotId,
    effectiveContextId,
    experience,
    slots,
    storedPicks,
    uiSlots,
  ]);
  const previewLabel = isStandard
    ? t("context.standardPreview", { group: PROJECT_CONFIG.groupName })
    : activeUiContextDescription
      ? t("context.livePreview", {
          title: uiCopy.title,
          context: activeUiContextDescription,
        })
      : uiCopy.title;
  const posterImageFileName = getExperienceImageFileName(
    experience,
    activeContext,
    activeTemplateId,
    DEFAULT_EXPORT_SIZE_PRESET_ID,
  );
  const boardScope = useMemo<BoardScope>(
    () => ({
      projectId: PROJECT_ID,
      experienceId: experience.id,
      contextId: effectiveContextId ?? null,
    }),
    [effectiveContextId, experience.id],
  );
  const sanitizeBoardPicks = useCallback(
    (candidatePicks: StoredPicks) =>
      filterStoredPicksForExperience({
        experience,
        storedPicks: candidatePicks,
        contextId: effectiveContextId,
      }),
    [effectiveContextId, experience],
  );
  const scopedSnapshots = useMemo(
    () => getSnapshotsForScope(boardLibrary, boardScope, sanitizeBoardPicks),
    [boardLibrary, boardScope, sanitizeBoardPicks],
  );
  const boardLibraryWritable =
    boardLibraryLoaded &&
    (boardLibraryStatus === "empty" || boardLibraryStatus === "loaded");

  useEffect(() => {
    if (!hydrated || isExportRealm) return;

    assistantApplyBaselineRef.current = null;
    setAssistantNeedsReview(false);
    setAssistantReviewNotice(false);
    const result = loadPickAssistantSnapshot(
      localStorage,
      storageKeys.assistant,
      pickAssistantStorageOptions,
    );
    if (result.status === "valid") {
      setCurrentPickAssistantSnapshot(result.snapshot);
      setPickAssistantStorageIssue(null);
      return;
    }

    setCurrentPickAssistantSnapshot(
      createEmptyPickAssistantSnapshot(PICK_ASSISTANT_CONFIG.schemaVersion),
    );
    setPickAssistantStorageIssue(
      result.status === "missing" ? null : result.status,
    );
  }, [
    hydrated,
    isExportRealm,
    pickAssistantStorageOptions,
    setCurrentPickAssistantSnapshot,
    storageKeys.assistant,
  ]);

  useEffect(() => {
    if (!hydrated || isExportRealm) return;

    const handleAssistantStorage = (event: StorageEvent) => {
      const sync = resolveStorageSyncAction(event, {
        storage: localStorage,
        watchedKey: storageKeys.assistant,
      });
      if (sync.kind === "ignore") return;

      // A cleared area carries no per-key value, so re-read storage instead of
      // trusting the event payload.
      const incoming =
        sync.kind === "apply"
          ? parsePickAssistantSnapshot(sync.value, {
              ...pickAssistantStorageOptions,
              now: Date.now(),
            })
          : loadPickAssistantSnapshot(
              localStorage,
              storageKeys.assistant,
              pickAssistantStorageOptions,
            );

      // Another tab touched the document, so any pending apply baseline is
      // stale regardless of what the plan decides below.
      assistantApplyBaselineRef.current = null;

      const plan = planAssistantSnapshotSync({
        incoming,
        current: pickAssistantSnapshotRef.current,
        resultVisible: assistantResultVisibleRef.current,
        isSameSnapshot: samePickAssistantSnapshots,
      });
      if (plan.action === "none") return;

      setCurrentPickAssistantSnapshot(
        plan.action === "adopt"
          ? plan.snapshot
          : createEmptyPickAssistantSnapshot(
              PICK_ASSISTANT_CONFIG.schemaVersion,
            ),
      );
      setPickAssistantStorageIssue(plan.storageIssue);
      if (plan.flagReview) {
        setAssistantNeedsReview(true);
        setAssistantReviewNotice(true);
        setBoardStatusMessage(t("assistant.previewRefreshed"));
      }
    };

    window.addEventListener("storage", handleAssistantStorage);
    return () => window.removeEventListener("storage", handleAssistantStorage);
  }, [
    hydrated,
    isExportRealm,
    pickAssistantStorageOptions,
    setCurrentPickAssistantSnapshot,
    storageKeys.assistant,
    t,
  ]);

  useEffect(() => {
    if (
      hydrated &&
      !isExportRealm &&
      (!boardStorageWritable || !optionsStorageWritable)
    ) {
      setBoardStatusMessage(t("boardLibrary.error.storage"));
    }
  }, [
    boardStorageWritable,
    hydrated,
    isExportRealm,
    optionsStorageWritable,
    t,
  ]);

  const cancelStalePreview = useCallback(() => {
    previewGenerationIdRef.current += 1;
    activePreviewCaptureAbortRef.current?.abort();
    activePreviewCaptureAbortRef.current = null;
    setPreview(null);
  }, []);

  boardSessionCallbacksRef.current = {
    onBeforeHydrated: (initialStorageKeys) => {
      const optionsResult = loadStoredOptions({
        storage: localStorage,
        versionedKey: initialStorageKeys.optionsV2,
        legacyKey: initialStorageKeys.options,
      });
      if (optionsResult.options) {
        setShowTitles(optionsResult.options.showTitles);
        setTransparentBg(optionsResult.options.transparentBg);
        setShowQrCode(optionsResult.options.showQrCode);
        setTemplateId(optionsResult.options.templateId);
      }
      setOptionsStorageWritable(isWritableStorageStatus(optionsResult.status));
    },
    onContextWillActivate: () => {
      setActiveSlotId(null);
      setShowModal(false);
      setSearchSelectionMode("board");
      setShowBoardLibrary(false);
      setCommandPaletteView(null);
      pendingCommandPaletteActionRef.current = null;
      setShowPickAssistant(false);
      setAssistantNeedsReview(false);
      setAssistantReviewNotice(false);
      assistantApplyBaselineRef.current = null;
      setDetailSongId(null);
      setDetailLayerActive(false);
      setPendingReplacementSong(null);
      setPendingBoardShareImport(null);
      setBoardShareDialog(null);
    },
    onInvalidatePreview: cancelStalePreview,
    onStorageUnavailable: () => {
      setBoardStatusMessage(t("boardLibrary.error.storage"));
    },
    onExternalBoardReset: () => {
      if (assistantResultVisibleRef.current) {
        assistantApplyBaselineRef.current = null;
        setAssistantNeedsReview(true);
        setAssistantReviewNotice(true);
        setBoardStatusMessage(t("assistant.previewRefreshed"));
      }
    },
  };

  useEffect(() => {
    if (!hydrated || isExportRealm) return;
    const syncBoardLibrary = () => {
      const result = loadBoardLibrary(
        localStorage,
        storageKeys.boardLibrary,
        PROJECT_ID,
      );
      setBoardLibrary(result.document);
      setBoardLibraryStatus(result.status);
      setBoardLibraryLoaded(true);
    };
    const handleStorage = (event: StorageEvent) => {
      if (
        shouldResyncStorage(event, {
          storage: localStorage,
          watchedKey: storageKeys.boardLibrary,
        })
      ) {
        syncBoardLibrary();
      }
    };

    syncBoardLibrary();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [hydrated, isExportRealm, storageKeys.boardLibrary]);

  useEffect(() => {
    if (!hydrated || isExportRealm) return;
    const syncSongDiscovery = () => {
      const result = loadSongDiscoveryState(
        STORAGE_KEYS.songDiscoveryV2,
        STORAGE_KEYS.songDiscovery,
        CATALOG_SONG_IDS,
      );
      if (!result.ok) {
        setSongDiscoveryState(createEmptySongDiscoveryState());
        setSongDiscoveryNewSongIds([]);
        return;
      }
      setSongDiscoveryState(result.state);
      setSongDiscoveryNewSongIds(result.newSongIds);
    };
    const handleStorage = (event: StorageEvent) => {
      if (
        shouldResyncStorage(event, {
          storage: localStorage,
          watchedKey: STORAGE_KEYS.songDiscoveryV2,
        })
      ) {
        syncSongDiscovery();
      }
    };

    syncSongDiscovery();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [hydrated, isExportRealm]);

  useEffect(() => {
    if (!hydrated || isExportRealm) return;
    const syncExportOptions = () => {
      const result = loadStoredOptions({
        storage: localStorage,
        versionedKey: storageKeys.optionsV2,
        legacyKey: storageKeys.options,
      });
      setOptionsStorageWritable(isWritableStorageStatus(result.status));
      if (!isWritableStorageStatus(result.status)) {
        setBoardStatusMessage(t("boardLibrary.error.storage"));
        return;
      }
      const options = result.options ?? DEFAULT_EXPORT_OPTIONS;
      setShowTitles(options.showTitles);
      setTransparentBg(options.transparentBg);
      setShowQrCode(options.showQrCode);
      setTemplateId(options.templateId);
    };
    const handleStorage = (event: StorageEvent) => {
      if (
        shouldResyncStorage(event, {
          storage: localStorage,
          watchedKey: storageKeys.optionsV2,
        })
      ) {
        syncExportOptions();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [hydrated, isExportRealm, storageKeys.options, storageKeys.optionsV2, t]);

  useEffect(
    () => () => {
      activePreviewCaptureAbortRef.current?.abort();
      activePreviewCaptureAbortRef.current = null;
      if (boardLinkCopiedTimerRef.current !== null) {
        window.clearTimeout(boardLinkCopiedTimerRef.current);
      }
    },
    [],
  );

  const presentBoardShareDialog = useCallback(
    (
      dialog: BoardShareDialogState,
      pendingImport: PendingBoardShareImport | null = null,
    ) => {
      cancelStalePreview();
      setShowBoardLibrary(false);
      setShowPickAssistant(false);
      setAssistantNeedsReview(false);
      setAssistantReviewNotice(false);
      assistantApplyBaselineRef.current = null;
      setShowModal(false);
      setDetailSongId(null);
      setActiveSlotId(null);
      setPendingReplacementSong(null);
      setPendingBoardShareImport(pendingImport);
      setBoardShareDialog(dialog);
    },
    [cancelStalePreview],
  );

  const resetBoardWithoutHistory = useCallback(
    (newPicks: StoredPicks) =>
      isSuccessfulBoardMutation(resetBoardSessionWithoutHistory(newPicks)),
    [resetBoardSessionWithoutHistory],
  );

  const commitUserMutation = useCallback(
    (kind: BoardMutationKind, newPicks: StoredPicks) => {
      const status = commitBoardSessionMutation(kind, newPicks);
      if (!isSuccessfulBoardMutation(status)) {
        window.alert(t("boardLibrary.error.storage"));
        return false;
      }
      return true;
    },
    [commitBoardSessionMutation, t],
  );

  const applyHistoryAction = useCallback(
    (type: "undo" | "redo") => {
      const status = applyBoardSessionHistoryAction(type);
      if (!isSuccessfulBoardMutation(status)) {
        window.alert(t("boardLibrary.error.storage"));
        return;
      }
      if (status === "noop") return;
      setBoardStatusMessage(
        t(type === "undo" ? "history.undoDone" : "history.redoDone"),
      );
    },
    [applyBoardSessionHistoryAction, t],
  );

  useEffect(() => {
    if (
      !hydrated ||
      isExportRealm ||
      boardShareConsumedRef.current ||
      !isBoardShareHash(window.location.hash)
    ) {
      return;
    }

    boardShareConsumedRef.current = true;
    const originalUrl = window.location.href;
    const originalHash = window.location.hash;
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    let cancelled = false;

    const prepareImport = async () => {
      const parsed = await parseBoardShareUrl(originalUrl);
      if (cancelled || parsed.status === "not-share") return;

      if (parsed.status === "invalid") {
        presentBoardShareDialog({
          kind: "invalid",
          unsupportedVersion: parsed.reason === "unsupported-version",
        });
        return;
      }

      const snapshot = boardSharePreviewSnapshotRef.current;
      const resolved = resolveBoardSharePayload({
        payload: parsed.payload,
        currentExperience: snapshot.experience,
      });

      // Invalid and mismatch need no stored board, so decide them before the
      // localStorage read below.
      if (resolved.status !== "import") {
        presentBoardShareDialog(
          planBoardShareDialog({
            resolved,
            originalHash,
            slots: snapshot.slots,
            uiSlots: snapshot.uiSlots,
            uiContextOptions: snapshot.uiContextOptions,
            currentPicks: {},
            effectiveContextId: snapshot.effectiveContextId,
            getSongTitle: (songId) => SONGS_BY_ID[songId]?.title.ja,
            createPreviewDiff: createBoardSharePreviewDiff,
          }) as Exclude<BoardShareDialogPlan, { kind: "import" }>,
        );
        return;
      }

      const targetStorageKeys = getStorageKeysForExperience(
        snapshot.experience,
        resolved.contextId,
      );
      const currentTargetPicks =
        resolved.contextId === snapshot.effectiveContextId
          ? snapshot.storedPicks
          : loadStoredBoard({
              storage: localStorage,
              versionedKey: targetStorageKeys.picksV2,
              legacyKey: targetStorageKeys.picks,
              sanitize: (candidatePicks) =>
                filterStoredPicksForExperience({
                  experience: snapshot.experience,
                  storedPicks: candidatePicks,
                  contextId: resolved.contextId,
                }),
            }).picks;
      presentBoardShareDialog(
        planBoardShareDialog({
          resolved,
          originalHash,
          slots: snapshot.slots,
          uiSlots: snapshot.uiSlots,
          uiContextOptions: snapshot.uiContextOptions,
          currentPicks: currentTargetPicks,
          effectiveContextId: snapshot.effectiveContextId,
          getSongTitle: (songId) => SONGS_BY_ID[songId]?.title.ja,
          createPreviewDiff: createBoardSharePreviewDiff,
        }),
        {
          payload: parsed.payload,
          picks: resolved.picks,
          baselinePicks: currentTargetPicks,
        },
      );
    };

    void prepareImport();
    return () => {
      cancelled = true;
    };
  }, [
    experience.id,
    experience.projectId,
    hydrated,
    isExportRealm,
    presentBoardShareDialog,
  ]);

  const handleContextChange = (nextContextId: string) => {
    activateExperienceContext(nextContextId, true);
  };

  const handleSlotClick = (slotId: PickSlotId) => {
    searchReturnFocusKeyRef.current = getPickSlotReturnKey(slotId);
    setSearchSelectionMode("board");
    detailTriggerRef.current = null;
    setDetailSongId(null);
    setActiveSlotId(slotId);
    setShowModal(true);
  };

  const handleGlobalSearchClick = () => {
    searchReturnFocusKeyRef.current = DIALOG_RETURN_KEYS.globalSearch;
    setSearchSelectionMode("board");
    detailTriggerRef.current = null;
    setDetailSongId(null);
    setActiveSlotId(null);
    setShowModal(true);
  };

  const handleOpenPickAssistant = () => {
    if (!hydrated || isExportRealm) return;
    setShowBoardLibrary(false);
    setShowModal(false);
    setSearchSelectionMode("board");
    setDetailSongId(null);
    setPendingReplacementSong(null);
    setShowPickAssistant(true);
  };

  const handleOpenBoardLibrary = () => {
    if (hydrated && !isExportRealm) setShowBoardLibrary(true);
  };

  const handleOpenCommandPalette = (view: CommandPaletteView = "commands") => {
    if (!hydrated || isExportRealm) return;
    pendingCommandPaletteActionRef.current = null;
    setCommandPaletteView(view);
  };

  const handleArchetypeEntryClick = () => {
    if (archetypeResult && archetypeRemainingCount === 0) {
      setOpenArchetypeInputKey(archetypeResult.inputKey);
      return;
    }
    if (archetypeFirstEmptySlotId) {
      handleSlotClick(archetypeFirstEmptySlotId);
      return;
    }
    handleGlobalSearchClick();
  };

  const handleNicknameChange = (nickname: string) => {
    setNicknameDraft(nickname.slice(0, MAX_NICKNAME_LENGTH));
  };

  const updateSongDiscoveryState = useCallback(
    (update: (current: SongDiscoveryState) => SongDiscoveryState) => {
      const result = updateStoredSongDiscoveryState(
        STORAGE_KEYS.songDiscoveryV2,
        CATALOG_SONG_IDS,
        update,
      );
      if (!result.ok) {
        setBoardStatusMessage(t("boardLibrary.error.storage"));
        return false;
      }

      setSongDiscoveryState(result.state);
      setSongDiscoveryNewSongIds(getNewSongIds(result.state, CATALOG_SONG_IDS));
      setBoardStatusMessage("");
      return true;
    },
    [t],
  );

  const handleMarkSongDiscoverySongsSeen = useCallback(() => {
    const result = markSongDiscoverySongsSeen(
      STORAGE_KEYS.songDiscoveryV2,
      CATALOG_SONG_IDS,
      songDiscoveryState,
    );
    if (!result.ok) {
      setBoardStatusMessage(t("boardLibrary.error.storage"));
      return;
    }

    setSongDiscoveryState(result.state);
    setSongDiscoveryNewSongIds(getNewSongIds(result.state, CATALOG_SONG_IDS));
    setBoardStatusMessage("");
  }, [songDiscoveryState, t]);

  const handleOpenSongDetail = useCallback(
    (song: Song, trigger: HTMLButtonElement) => {
      detailTriggerRef.current = trigger;
      updateSongDiscoveryState((current) =>
        recordRecentSongId(current, song.id, SONG_DISCOVERY_CONFIG.recentLimit),
      );
      setDetailLayerActive(true);
      setDetailSongId(song.id);
    },
    [updateSongDiscoveryState],
  );

  const commitPickAssistantUpdate = useCallback(
    async (shortlistIds: string[], session: PickAssistantSession | null) => {
      if (pickAssistantStorageIssue || assistantMutationPendingRef.current) {
        return false;
      }

      const storageKey = storageKeys.assistant;
      const expected = pickAssistantSnapshotRef.current;
      const next = updatePickAssistantSnapshot(
        expected,
        { shortlistIds, session },
        Date.now(),
        createMutationId(),
      );
      assistantMutationPendingRef.current = true;
      setAssistantMutationPending(true);
      try {
        const result = await savePickAssistantSnapshotSafely(
          localStorage,
          storageKey,
          expected,
          next,
          pickAssistantStorageOptions,
          navigator.locks,
        );
        if (pickAssistantStorageKeyRef.current !== storageKey) return false;
        if (result.status === "saved") {
          setCurrentPickAssistantSnapshot(next);
          setPickAssistantStorageIssue(null);
          setAssistantReviewNotice(false);
          return true;
        }
        setPickAssistantStorageIssue(
          result.status === "blocked" ? result.reason : result.status,
        );
        return false;
      } finally {
        assistantMutationPendingRef.current = false;
        setAssistantMutationPending(false);
      }
    },
    [
      pickAssistantStorageIssue,
      pickAssistantStorageOptions,
      setCurrentPickAssistantSnapshot,
      storageKeys.assistant,
    ],
  );

  const handleToggleCandidate = useCallback(
    (song: Song) => {
      if (pickAssistantStorageIssue) return;
      if (
        !candidateSongIds.has(song.id) &&
        !assistantEligibleSongIds.has(song.id)
      ) {
        window.alert(t("errors.songIneligible"));
        return;
      }
      const update = togglePickAssistantShortlistSong(
        assistantShortlistIds,
        song.id,
        PICK_ASSISTANT_CONFIG.maximumCandidates,
      );
      if (update.status === "limit") {
        window.alert(
          t("assistant.maxReached", {
            count: PICK_ASSISTANT_CONFIG.maximumCandidates,
          }),
        );
        return;
      }
      void commitPickAssistantUpdate(update.shortlistIds, null);
    },
    [
      assistantShortlistIds,
      assistantEligibleSongIds,
      candidateSongIds,
      commitPickAssistantUpdate,
      pickAssistantStorageIssue,
      t,
    ],
  );

  const handleRemoveCandidate = (songId: string) => {
    void commitPickAssistantUpdate(
      assistantShortlistIds.filter((candidateId) => candidateId !== songId),
      null,
    );
  };

  const handleClearPickAssistant = () => {
    void commitPickAssistantUpdate([], null);
  };

  const handleBrowseAssistantCandidates = () => {
    searchReturnFocusKeyRef.current = DIALOG_RETURN_KEYS.pickAssistant;
    setShowPickAssistant(false);
    setSearchSelectionMode("assistant-shortlist");
    setActiveSlotId(null);
    setDetailSongId(null);
    detailTriggerRef.current = null;
    setShowModal(true);
  };

  const handleReturnToPickAssistant = () => {
    setShowModal(false);
    setSearchSelectionMode("board");
    setDetailSongId(null);
    detailTriggerRef.current = null;
    setActiveSlotId(null);
    setShowPickAssistant(true);
  };

  const handleUseCurrentBoardForAssistant = () => {
    if (
      currentBoardCandidateIds.length <
        PICK_ASSISTANT_CONFIG.minimumCandidates ||
      currentBoardCandidateIds.length > PICK_ASSISTANT_CONFIG.maximumCandidates
    ) {
      return;
    }
    void commitPickAssistantUpdate(currentBoardCandidateIds, null);
  };

  const handleStartPickAssistant = () => {
    if (
      assistantShortlistIds.length < PICK_ASSISTANT_CONFIG.minimumCandidates
    ) {
      return;
    }
    void commitPickAssistantUpdate(
      assistantShortlistIds,
      createPickAssistantSession(assistantShortlistIds),
    );
  };

  const commitAssistantSession = (session: PickAssistantSession) => {
    void commitPickAssistantUpdate(assistantShortlistIds, session);
  };

  const handleAssistantComparison = (outcome: ComparisonOutcome) => {
    if (assistantSession) {
      commitAssistantSession(recordComparison(assistantSession, outcome));
    }
  };

  const handleSkipAssistantComparison = () => {
    if (!assistantSession) return;
    const next = skipComparison(assistantSession);
    if (next === assistantSession) {
      setShowPickAssistant(false);
      return;
    }
    commitAssistantSession(next);
  };

  const handleUndoAssistantComparison = () => {
    if (assistantSession) {
      commitAssistantSession(undoComparison(assistantSession));
    }
  };

  const handleRestartPickAssistant = () => {
    if (assistantShortlistIds.length < 2) return;
    void commitPickAssistantUpdate(
      assistantShortlistIds,
      createPickAssistantSession(assistantShortlistIds),
    );
  };

  const handleResetPickAssistantStorage = () => {
    const storageKey = storageKeys.assistant;
    void resetPickAssistantStorageSafely(
      localStorage,
      storageKey,
      navigator.locks,
    ).then((result) => {
      if (pickAssistantStorageKeyRef.current !== storageKey) return;
      if (result !== "reset") {
        setPickAssistantStorageIssue(
          result === "conflict" ? "conflict" : "unavailable",
        );
        return;
      }
      setCurrentPickAssistantSnapshot(
        createEmptyPickAssistantSnapshot(PICK_ASSISTANT_CONFIG.schemaVersion),
      );
      setPickAssistantStorageIssue(null);
      setAssistantNeedsReview(false);
      setAssistantReviewNotice(false);
      assistantApplyBaselineRef.current = null;
    });
  };

  useEffect(() => {
    if (!showPickAssistant || assistantTournament?.status !== "complete") {
      assistantApplyBaselineRef.current = null;
      setAssistantNeedsReview(false);
      return;
    }
    if (!assistantApplyBaselineRef.current) {
      assistantApplyBaselineRef.current = {
        storageKey: storageKeys.assistant,
        contextId: effectiveContextId,
        boardPicks: { ...storedPicksRef.current },
        revision: pickAssistantSnapshot.revision,
        mutationId: pickAssistantSnapshot.mutationId,
      };
    }
  }, [
    assistantTournament?.status,
    effectiveContextId,
    pickAssistantSnapshot.mutationId,
    pickAssistantSnapshot.revision,
    showPickAssistant,
    storedPicksRef,
    storageKeys.assistant,
  ]);

  const handleApplyAssistantResult = async () => {
    if (!assistantApplicationPlan || !assistantSession) return;
    if (assistantNeedsReview) {
      const currentAssistant = pickAssistantSnapshotRef.current;
      assistantApplyBaselineRef.current = {
        storageKey: storageKeys.assistant,
        contextId: effectiveContextId,
        boardPicks: { ...storedPicksRef.current },
        revision: currentAssistant.revision,
        mutationId: currentAssistant.mutationId,
      };
      setAssistantNeedsReview(false);
      setAssistantReviewNotice(true);
      setBoardStatusMessage(t("assistant.previewRefreshed"));
      return;
    }

    let persistedContextId = effectiveContextId;
    if (storageKeys.context) {
      try {
        persistedContextId =
          localStorage.getItem(storageKeys.context) ?? defaultContextId;
      } catch {
        setBoardStatusMessage(t("boardLibrary.error.storage"));
        return;
      }
    }
    if (persistedContextId !== effectiveContextId) {
      activateExperienceContext(persistedContextId, false);
      setBoardStatusMessage(t("assistant.previewRefreshed"));
      return;
    }

    const latestBoard = loadStoredBoard({
      storage: localStorage,
      versionedKey: storageKeys.picksV2,
      legacyKey: storageKeys.picks,
      sanitize: sanitizeBoardPicks,
    });
    const latestAssistant = loadPickAssistantSnapshot(
      localStorage,
      storageKeys.assistant,
      pickAssistantStorageOptions,
    );
    if (!isWritableStorageStatus(latestBoard.status)) {
      markBoardStorageUnavailable();
      setBoardStatusMessage(t("boardLibrary.error.storage"));
      return;
    }
    if (latestAssistant.status !== "valid") {
      setCurrentPickAssistantSnapshot(
        createEmptyPickAssistantSnapshot(PICK_ASSISTANT_CONFIG.schemaVersion),
      );
      setPickAssistantStorageIssue(
        latestAssistant.status === "missing"
          ? "conflict"
          : latestAssistant.status,
      );
      return;
    }

    const baseline = assistantApplyBaselineRef.current;
    const assistantMatches = samePickAssistantSnapshots(
      latestAssistant.snapshot,
      pickAssistantSnapshotRef.current,
    );
    const boardMatches = sameStoredPicks(
      latestBoard.picks,
      storedPicksRef.current,
    );
    const baselineMatches = Boolean(
      baseline &&
      baseline.storageKey === storageKeys.assistant &&
      baseline.contextId === effectiveContextId &&
      baseline.revision === latestAssistant.snapshot.revision &&
      baseline.mutationId === latestAssistant.snapshot.mutationId &&
      sameStoredPicks(baseline.boardPicks, latestBoard.picks),
    );
    if (!assistantMatches || !boardMatches || !baselineMatches) {
      setCurrentPickAssistantSnapshot(latestAssistant.snapshot);
      resetFromFreshness(latestBoard.picks);
      assistantApplyBaselineRef.current = {
        storageKey: storageKeys.assistant,
        contextId: effectiveContextId,
        boardPicks: { ...latestBoard.picks },
        revision: latestAssistant.snapshot.revision,
        mutationId: latestAssistant.snapshot.mutationId,
      };
      setAssistantNeedsReview(false);
      setAssistantReviewNotice(true);
      setBoardStatusMessage(t("assistant.previewRefreshed"));
      return;
    }

    const currentPickCount = Object.keys(latestBoard.picks).length;
    const preConfirmInputs = {
      contextId: persistedContextId,
      boardPicks: latestBoard.picks,
      assistantSnapshot: latestAssistant.snapshot,
    };
    if (
      currentPickCount > 0 &&
      !window.confirm(
        t("assistant.confirmReplace", { count: currentPickCount }),
      )
    ) {
      return;
    }

    let confirmedContextId = effectiveContextId;
    if (storageKeys.context) {
      try {
        confirmedContextId =
          localStorage.getItem(storageKeys.context) ?? defaultContextId;
      } catch {
        setBoardStatusMessage(t("boardLibrary.error.storage"));
        return;
      }
    }
    if (confirmedContextId !== effectiveContextId) {
      activateExperienceContext(confirmedContextId, false);
      setBoardStatusMessage(t("assistant.previewRefreshed"));
      return;
    }

    const confirmedBoard = loadStoredBoard({
      storage: localStorage,
      versionedKey: storageKeys.picksV2,
      legacyKey: storageKeys.picks,
      sanitize: sanitizeBoardPicks,
    });
    const confirmedAssistant = loadPickAssistantSnapshot(
      localStorage,
      storageKeys.assistant,
      pickAssistantStorageOptions,
    );
    if (!isWritableStorageStatus(confirmedBoard.status)) {
      markBoardStorageUnavailable();
      setBoardStatusMessage(t("boardLibrary.error.storage"));
      return;
    }
    if (confirmedAssistant.status !== "valid") {
      setCurrentPickAssistantSnapshot(
        createEmptyPickAssistantSnapshot(PICK_ASSISTANT_CONFIG.schemaVersion),
      );
      setPickAssistantStorageIssue(
        confirmedAssistant.status === "missing"
          ? "conflict"
          : confirmedAssistant.status,
      );
      return;
    }

    const confirmedInputs = {
      contextId: confirmedContextId,
      boardPicks: confirmedBoard.picks,
      assistantSnapshot: confirmedAssistant.snapshot,
    };
    if (
      !samePickAssistantApplicationInputs(preConfirmInputs, confirmedInputs)
    ) {
      setCurrentPickAssistantSnapshot(confirmedAssistant.snapshot);
      resetFromFreshness(confirmedBoard.picks);
      assistantApplyBaselineRef.current = {
        storageKey: storageKeys.assistant,
        contextId: effectiveContextId,
        boardPicks: { ...confirmedBoard.picks },
        revision: confirmedAssistant.snapshot.revision,
        mutationId: confirmedAssistant.snapshot.mutationId,
      };
      setAssistantNeedsReview(false);
      setAssistantReviewNotice(true);
      setBoardStatusMessage(t("assistant.previewRefreshed"));
      return;
    }

    if (!commitUserMutation("assistant", assistantApplicationPlan.nextPicks)) {
      window.alert(t("assistant.applyFailed"));
      return;
    }

    const placedSongIds = new Set(
      Object.values(assistantApplicationPlan.nextPicks),
    );
    const remainingShortlist = assistantShortlistIds.filter(
      (songId) => !placedSongIds.has(songId),
    );
    const cleaned = await commitPickAssistantUpdate(remainingShortlist, null);
    if (!cleaned) {
      setBoardStatusMessage(t("assistant.applyCleanupFailed"));
      return;
    }
    setShowPickAssistant(false);
    setAssistantReviewNotice(false);
    setBoardStatusMessage(t("assistant.applied"));
  };

  const handleSelectSong = (song: Song) => {
    const currentPicks = storedPicksRef.current;
    const existingSlotId = slots.find(
      (slot) => currentPicks[slot.id] === song.id,
    )?.id;
    if (existingSlotId) {
      if (activeSlotId && activeSlotId !== existingSlotId) {
        const relocation = relocateStoredPick({
          experience,
          storedPicks: currentPicks,
          fromSlotId: existingSlotId,
          toSlotId: activeSlotId,
          contextId: effectiveContextId,
        });
        if (!relocation.ok) {
          setActiveDialogReturnFocusKey(getPickSlotReturnKey(existingSlotId));
        } else {
          if (!commitUserMutation("sort", relocation.nextPicks)) {
            return;
          }
          setActiveDialogReturnFocusKey(getPickSlotReturnKey(activeSlotId));
        }
      } else {
        setActiveDialogReturnFocusKey(getPickSlotReturnKey(existingSlotId));
      }
      setShowModal(false);
      setActiveSlotId(null);
      return;
    }

    if (activeSlotId) {
      const slot = slots.find((candidate) => candidate.id === activeSlotId);
      if (
        !slot ||
        !isSongEligibleForSlot({
          experience,
          slot,
          songId: song.id,
          contextId: effectiveContextId,
        })
      ) {
        window.alert(t("errors.songIneligible"));
        return;
      }

      if (
        !commitUserMutation("pick", {
          ...currentPicks,
          [activeSlotId]: song.id,
        })
      ) {
        return;
      }
      setShowModal(false);
      setDetailSongId(null);
      setActiveSlotId(null);
      return;
    }

    const emptySlotId = findFirstEligibleEmptySlot({
      experience,
      storedPicks: currentPicks,
      songId: song.id,
      contextId: effectiveContextId,
    });
    if (emptySlotId) {
      if (
        !commitUserMutation("pick", {
          ...currentPicks,
          [emptySlotId]: song.id,
        })
      ) {
        return;
      }
      setShowModal(false);
      setDetailSongId(null);
      return;
    }

    setShowModal(false);
    setDetailSongId(null);
    setPendingReplacementSong(song);
  };

  const handleSelectSongFromDetail = (song: Song) => {
    setDetailSongId(null);
    handleSelectSong(song);
  };

  const handleReplaceSlot = (slotId: PickSlotId) => {
    if (!pendingReplacementSong) return;
    const slot = slots.find((candidate) => candidate.id === slotId);
    if (
      !slot ||
      !isSongEligibleForSlot({
        experience,
        slot,
        songId: pendingReplacementSong.id,
        contextId: effectiveContextId,
      })
    ) {
      return;
    }

    const currentPicks = storedPicksRef.current;
    const existingSlotId = slots.find(
      (slot) => currentPicks[slot.id] === pendingReplacementSong.id,
    )?.id;
    if (existingSlotId && existingSlotId !== slotId) {
      const relocation = relocateStoredPick({
        experience,
        storedPicks: currentPicks,
        fromSlotId: existingSlotId,
        toSlotId: slotId,
        contextId: effectiveContextId,
      });
      if (!relocation.ok) return;
      if (!commitUserMutation("sort", relocation.nextPicks)) return;
    } else {
      if (
        !commitUserMutation("replace", {
          ...currentPicks,
          [slotId]: pendingReplacementSong.id,
        })
      ) {
        return;
      }
    }
    setPendingReplacementSong(null);
  };

  const handleClearSlot = (slotId: PickSlotId, event: MouseEvent) => {
    event.stopPropagation();
    const newPicks = { ...storedPicksRef.current };
    delete newPicks[slotId];
    commitUserMutation("clear", newPicks);
  };

  const handleClearAllPicks = () => {
    if (!window.confirm(t("errors.clearAllConfirm"))) return false;
    return commitUserMutation("clear", {});
  };

  const previewRelocation = useCallback(
    (fromSlotId: PickSlotId, toSlotId: PickSlotId): RelocatePickResult =>
      relocateStoredPick({
        experience,
        storedPicks: storedPicksRef.current,
        fromSlotId,
        toSlotId,
        contextId: effectiveContextId,
      }),
    [effectiveContextId, experience, storedPicksRef],
  );

  const handleRelocate = useCallback(
    (fromSlotId: PickSlotId, toSlotId: PickSlotId): RelocatePickResult => {
      const result = previewRelocation(fromSlotId, toSlotId);
      if (!result.ok) return result;

      if (!commitUserMutation("sort", result.nextPicks)) {
        return {
          ok: false,
          reason: "storage",
          fromSlotId,
          toSlotId,
        };
      }
      return result;
    },
    [commitUserMutation, previewRelocation],
  );

  const handleCopyBoardLink = async () => {
    const filteredPicks = filterStoredPicksForExperience({
      experience,
      storedPicks: storedPicksRef.current,
      contextId: effectiveContextId,
    });
    if (Object.keys(filteredPicks).length === 0) return;

    try {
      const payload = createBoardSharePayload({
        experience,
        contextId: effectiveContextId,
        storedPicks: filteredPicks,
      });
      const shareUrl = await buildBoardShareUrl(pageUrl, payload);
      await copyTextToClipboard(shareUrl);
      if (boardLinkCopiedTimerRef.current !== null) {
        window.clearTimeout(boardLinkCopiedTimerRef.current);
      }
      setBoardLinkCopied(true);
      boardLinkCopiedTimerRef.current = window.setTimeout(() => {
        boardLinkCopiedTimerRef.current = null;
        setBoardLinkCopied(false);
      }, BOARD_LINK_COPIED_DURATION_MS);
    } catch (error) {
      console.error("Failed to copy board link", error);
      window.alert(t("boardShare.copyFailed"));
    }
  };

  const handleCompareBoardShare = () => {
    if (!pendingBoardShareImport) return;

    // Comparison intentionally stays in memory. It neither re-reads another
    // context nor invokes the import transaction, so it cannot overwrite the
    // current board or any saved board.
    const comparison = compareBoardPicks({
      slots,
      current: {
        scope: {
          projectId: experience.projectId,
          experienceId: experience.id,
          contextId: effectiveContextId,
        },
        picks: storedPicksRef.current,
      },
      shared: {
        scope: {
          projectId: pendingBoardShareImport.payload.p,
          experienceId: pendingBoardShareImport.payload.e,
          contextId: pendingBoardShareImport.payload.c,
        },
        picks: pendingBoardShareImport.picks,
      },
    });

    setBoardShareDialog((current) =>
      current?.kind === "import"
        ? {
            ...current,
            comparison:
              comparison.availability === "available" ? comparison : undefined,
          }
        : current,
    );
  };

  const handleConfirmBoardShareImport = () => {
    if (!pendingBoardShareImport) return;
    const resolved = resolveBoardSharePayload({
      payload: pendingBoardShareImport.payload,
      currentExperience: experience,
    });
    if (resolved.status !== "import") {
      setPendingBoardShareImport(null);
      setBoardShareDialog({
        kind: "invalid",
        unsupportedVersion: false,
      });
      return;
    }

    const targetStorageKeys = getStorageKeysForExperience(
      experience,
      resolved.contextId,
    );
    const targetBoard = loadStoredBoard({
      storage: localStorage,
      versionedKey: targetStorageKeys.picksV2,
      legacyKey: targetStorageKeys.picks,
      sanitize: (candidatePicks) =>
        filterStoredPicksForExperience({
          experience,
          storedPicks: candidatePicks,
          contextId: resolved.contextId,
        }),
    });
    if (
      targetBoard.status !== "empty" &&
      targetBoard.status !== "loaded" &&
      targetBoard.status !== "migrated"
    ) {
      window.alert(t("boardShare.importFailed"));
      return;
    }
    if (
      !sameStoredPicks(targetBoard.picks, pendingBoardShareImport.baselinePicks)
    ) {
      const previewDiff = createBoardSharePreviewDiff({
        slotIds: slots.map((slot) => slot.id),
        currentPicks: targetBoard.picks,
        importedPicks: resolved.picks,
        currentContextId: effectiveContextId ?? null,
        importedContextId: resolved.contextId ?? null,
      });
      const uiSlotsById = new Map(uiSlots.map((slot) => [slot.id, slot]));
      const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
      const changes = previewDiff.changes.map(
        ({ slotId, currentSongId, importedSongId }) => ({
          slotId,
          slotLabel:
            uiSlotsById.get(slotId)?.label ??
            slotsById.get(slotId)?.label ??
            slotId,
          currentTitle: currentSongId
            ? SONGS_BY_ID[currentSongId]?.title.ja
            : undefined,
          importedTitle: importedSongId
            ? SONGS_BY_ID[importedSongId]?.title.ja
            : undefined,
        }),
      );
      setPendingBoardShareImport({
        payload: pendingBoardShareImport.payload,
        picks: pendingBoardShareImport.picks,
        baselinePicks: targetBoard.picks,
      });
      setBoardShareDialog((current) =>
        current?.kind === "import"
          ? {
              ...current,
              changes,
              comparison: undefined,
              previewRefreshed: true,
            }
          : current,
      );
      return;
    }
    const importResult = importBoard({
      contextId: resolved.contextId,
      expectedPicks: targetBoard.picks,
      picks: resolved.picks,
    });
    if (importResult.status !== "committed") {
      console.error("Failed to import shared board", importResult);
      window.alert(t("boardShare.importFailed"));
      return;
    }

    setActiveSlotId(null);
    setShowModal(false);
    setShowBoardLibrary(false);
    setDetailSongId(null);
    setPendingReplacementSong(null);
    setPendingBoardShareImport(null);
    setBoardShareDialog(null);
  };

  const handleCloseBoardShareDialog = () => {
    setPendingBoardShareImport(null);
    setBoardShareDialog(null);
  };

  useEffect(() => {
    if (!hydrated || !isExportRealm) return;

    const expectedOrigin = window.location.origin;
    const parentWindow = window.parent;
    const postResult = (result: ExportRenderResult) => {
      parentWindow.postMessage(result, expectedOrigin);
    };
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== expectedOrigin ||
        event.source !== parentWindow ||
        !isExportRenderRequest(event.data)
      ) {
        return;
      }

      const request = event.data;
      const verdict = resolveExportRealmRequest({
        request,
        activeRequestId: activeFrameRequestIdRef.current,
        experienceId: experience.id,
        pageUrl,
        contextIds: contextOptions.map((context) => context.id),
        defaultContextId,
      });

      if (verdict.status === "ignore") return;
      if (verdict.status === "reject") {
        postResult(
          createExportRenderResult(
            request.requestId,
            undefined,
            verdict.reason,
          ),
        );
        return;
      }

      const nextContextId = verdict.contextId;
      const nextPicks = filterStoredPicksForExperience({
        experience,
        storedPicks: request.picks,
        contextId: nextContextId,
      });
      const requestPicks: Picks = Object.fromEntries(
        Object.entries(nextPicks)
          .map(([slotId, songId]) => [slotId, SONGS_BY_ID[songId]] as const)
          .filter((entry): entry is readonly [string, Song] =>
            Boolean(entry[1]),
          ),
      );
      const requestCoverToneAvailability = getCoverToneAvailability({
        projectId: PROJECT_ID,
        slots,
        picks: requestPicks,
      });
      if (
        request.kind !== "archetype" &&
        !isExportTemplateAvailable(
          request.templateId,
          requestCoverToneAvailability,
        )
      ) {
        postResult(
          createExportRenderResult(
            request.requestId,
            undefined,
            "Cover-tone is unavailable for the highest-ranked selected song",
          ),
        );
        return;
      }
      activeFrameRequestIdRef.current = request.requestId;
      injectEphemeralBoard(nextContextId, nextPicks);
      setNicknameDraft(request.selectedBy.slice(0, MAX_NICKNAME_LENGTH));
      setShowTitles(request.showTitles);
      setTransparentBg(request.transparentBg);
      setShowQrCode(request.showQrCode);
      setTemplateId(request.templateId);
      setFrameSizePresetId(request.sizePresetId);
      setFramePageUrl(request.pageUrl);
      setFrameCaptureRequest(request);
    };

    window.addEventListener("message", handleMessage);
    parentWindow.postMessage(
      {
        type: EXPORT_REALM_READY_TYPE,
        version: EXPORT_CAPTURE_PROTOCOL_VERSION,
      },
      expectedOrigin,
    );

    return () => window.removeEventListener("message", handleMessage);
  }, [
    contextOptions,
    defaultContextId,
    experience,
    hydrated,
    injectEphemeralBoard,
    isExportRealm,
    pageUrl,
    slots,
  ]);

  const captureExportCanvas = useCallback(async () => {
    const restoreExportStyles = installExportStyleAdapter(
      window as unknown as ExportStyleWindowLike,
    );
    try {
      if (
        frameCaptureRequest?.kind === "archetype" &&
        !archetypeExportPresentation
      ) {
        throw new Error("Archetype export result is unavailable");
      }

      const exportElement = document.getElementById(exportCanvasId);
      if (!exportElement) {
        throw new Error("Export canvas element was not found");
      }

      const html2canvas = (await import("html2canvas")).default;
      await Promise.all([
        document.fonts.ready,
        waitForExportImages(exportElement),
      ]);
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      assertExportLayoutFits(exportElement);
      const sizePreset = getExportSizePreset(frameSizePresetId);
      const canvas = await html2canvas(exportElement, {
        useCORS: true,
        backgroundColor: transparentBg ? null : EXPORT_BACKGROUND,
        scale: EXPORT_SCALE,
        logging: false,
      });
      const expectedWidth = sizePreset.width * EXPORT_SCALE;
      const expectedHeight = sizePreset.height * EXPORT_SCALE;
      if (canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
        throw new Error(
          `Export canvas size mismatch: expected ${expectedWidth}x${expectedHeight}, received ${canvas.width}x${canvas.height}`,
        );
      }
      centerExportYearInk(canvas, exportElement);
      return canvas.toDataURL("image/png");
    } finally {
      restoreExportStyles();
    }
  }, [
    archetypeExportPresentation,
    exportCanvasId,
    frameCaptureRequest?.kind,
    frameSizePresetId,
    transparentBg,
  ]);

  useEffect(() => {
    if (
      !hydrated ||
      !isExportRealm ||
      !frameCaptureRequest ||
      capturedFrameRequestIdRef.current === frameCaptureRequest.requestId
    ) {
      return;
    }

    capturedFrameRequestIdRef.current = frameCaptureRequest.requestId;
    let cancelled = false;

    const capture = async () => {
      let result: ExportRenderResult;
      try {
        const dataUrl = await captureExportCanvas();
        result = createExportRenderResult(
          frameCaptureRequest.requestId,
          dataUrl,
        );
      } catch (error) {
        result = createExportRenderResult(
          frameCaptureRequest.requestId,
          undefined,
          error instanceof Error ? error.message : "Image generation failed",
        );
      }

      if (!cancelled) {
        window.parent.postMessage(result, window.location.origin);
      }
    };

    void capture();
    return () => {
      cancelled = true;
    };
  }, [captureExportCanvas, frameCaptureRequest, hydrated, isExportRealm]);

  const generateImage = useCallback(
    async (kind: ExportContentKind) => {
      if (generatingRef.current) return;
      if (!boardStorageWritable || !optionsStorageWritable) {
        setBoardStatusMessage(t("boardLibrary.error.storage"));
        return;
      }

      const archetypeForExport = kind === "archetype" ? archetypeResult : null;
      if (kind === "archetype" && !archetypeForExport) return;

      const filteredPicks = filterStoredPicksForExperience({
        experience,
        storedPicks,
        contextId: effectiveContextId,
      });
      if (Object.keys(filteredPicks).length === 0) {
        return;
      }
      if (!sameStoredPicks(filteredPicks, storedPicks)) {
        if (!resetBoardWithoutHistory(filteredPicks)) {
          window.alert(t("boardLibrary.error.storage"));
          return;
        }
      }

      const generationId = ++previewGenerationIdRef.current;
      const optionsKey = getPreviewOptionsKey(
        showTitles,
        transparentBg,
        showQrCode,
        activeTemplateId,
        kind,
        archetypeForExport?.inputKey,
      );
      const captureController = new AbortController();
      activePreviewCaptureAbortRef.current = captureController;
      generatingRef.current = true;
      setGenerating(true);
      if (kind === "archetype") setOpenArchetypeInputKey(null);

      try {
        const characterNames = archetypeForExport
          ? archetypeForExport.characters
              .map((character) => character.displayName)
              .join(" / ")
          : "";
        const sharePageUrl = pageUrl;
        const dataUrl = await captureExportImageInFrame(
          {
            kind,
            experienceId: experience.id,
            contextId: effectiveContextId,
            picks: filteredPicks,
            showTitles,
            transparentBg,
            showQrCode,
            templateId: activeTemplateId,
            sizePresetId: DEFAULT_EXPORT_SIZE_PRESET_ID,
            selectedBy: exportNickname,
            pageUrl,
          },
          { signal: captureController.signal },
        );
        if (generationId === previewGenerationIdRef.current) {
          setPreview({
            kind,
            archetypeInputKey: archetypeForExport?.inputKey,
            dataUrl,
            optionsKey,
            imageFileName: archetypeForExport
              ? getArchetypeImageFileName(archetypeForExport.characters)
              : posterImageFileName,
            pageUrl: sharePageUrl,
            previewLabel: archetypeForExport
              ? formatArchetypeTemplate(
                  archetypeForExport.ui.export.previewLabel,
                  { characterNames },
                )
              : previewLabel,
            shareText: archetypeForExport
              ? formatArchetypeTemplate(
                  archetypeForExport.ui.export.shareText,
                  {
                    characterNames,
                  },
                )
              : uiCopy.shareText,
            shareHashtags: archetypeForExport
              ? [...experience.share.hashtags, "#恋はじめました"]
              : experience.share.hashtags.slice(),
            shareTitle: archetypeForExport
              ? archetypeForExport.ui.title
              : uiCopy.title,
          });
        }
      } catch (error) {
        if (!isAbortError(error)) {
          console.error("Failed to generate image", error);
          if (generationId === previewGenerationIdRef.current) {
            window.alert(t("errors.imageGenerationFailed"));
          }
        }
      } finally {
        if (activePreviewCaptureAbortRef.current === captureController) {
          activePreviewCaptureAbortRef.current = null;
        }
        generatingRef.current = false;
        setGenerating(false);
      }
    },
    [
      archetypeResult,
      activeTemplateId,
      boardStorageWritable,
      effectiveContextId,
      experience,
      exportNickname,
      optionsStorageWritable,
      pageUrl,
      posterImageFileName,
      previewLabel,
      resetBoardWithoutHistory,
      showTitles,
      showQrCode,
      storedPicks,
      t,
      transparentBg,
      uiCopy.shareText,
      uiCopy.title,
    ],
  );

  const handleGenerateImage = useCallback(
    () => generateImage("picks"),
    [generateImage],
  );
  const handleGenerateArchetypeImage = useCallback(
    () => generateImage("archetype"),
    [generateImage],
  );

  const previewOptionsKey = getPreviewOptionsKey(
    showTitles,
    transparentBg,
    showQrCode,
    activeTemplateId,
    preview?.kind ?? "picks",
    preview?.kind === "archetype"
      ? (archetypeResult?.inputKey ?? preview.archetypeInputKey)
      : undefined,
  );

  useEffect(() => {
    if (!preview || preview.optionsKey === previewOptionsKey) {
      return;
    }
    const timer = window.setTimeout(() => {
      void generateImage(preview.kind);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [generateImage, preview, previewOptionsKey]);

  const handleClosePreview = () => {
    previewGenerationIdRef.current += 1;
    activePreviewCaptureAbortRef.current?.abort();
    activePreviewCaptureAbortRef.current = null;
    setPreview(null);
  };

  const updateExportOptions = useCallback(
    async (update: (current: ExportOptions) => ExportOptions) => {
      if (!optionsStorageWritable) {
        setBoardStatusMessage(t("boardLibrary.error.storage"));
        return;
      }

      const runMutation = () =>
        mutateStoredOptions({
          storage: localStorage,
          versionedKey: storageKeys.optionsV2,
          legacyKey: storageKeys.options,
          update,
        });

      try {
        const result = navigator.locks
          ? await navigator.locks.request(
              `mypick-options:${storageKeys.optionsV2}`,
              runMutation,
            )
          : runMutation();
        if (!result.ok) {
          setOptionsStorageWritable(isWritableStorageStatus(result.status));
          setBoardStatusMessage(t("boardLibrary.error.storage"));
          return;
        }

        setOptionsStorageWritable(true);
        setShowTitles(result.options.showTitles);
        setTransparentBg(result.options.transparentBg);
        setShowQrCode(result.options.showQrCode);
        setTemplateId(result.options.templateId);
        setBoardStatusMessage("");
      } catch {
        setOptionsStorageWritable(false);
        setBoardStatusMessage(t("boardLibrary.error.storage"));
      }
    },
    [optionsStorageWritable, storageKeys.options, storageKeys.optionsV2, t],
  );

  useEffect(() => {
    if (
      !hydrated ||
      isExportRealm ||
      templateId !== "cover-tone" ||
      coverToneAvailability.isSupported
    ) {
      return;
    }

    setTemplateId("midnight");
    void updateExportOptions((current) => ({
      ...current,
      templateId: "midnight",
    }));
  }, [
    coverToneAvailability.isSupported,
    hydrated,
    isExportRealm,
    templateId,
    updateExportOptions,
  ]);

  const handleShowTitlesChange = (value: boolean) => {
    void updateExportOptions((current) => ({
      ...current,
      showTitles: value,
    }));
  };

  const handleTransparentBackgroundChange = (value: boolean) => {
    void updateExportOptions((current) => ({
      ...current,
      transparentBg: value,
    }));
  };

  const handleShowQrCodeChange = (value: boolean) => {
    void updateExportOptions((current) => ({
      ...current,
      showQrCode: value,
    }));
  };

  const handleTemplateChange = (value: ExportTemplateId) => {
    if (!isExportTemplateAvailable(value, coverToneAvailability)) return;

    void updateExportOptions((current) => ({
      ...current,
      templateId: value,
    }));
  };

  const handleSaveBoard = (name: string): BoardLibraryActionResult => {
    if (!boardLibraryWritable) return { ok: false, error: "storage" };
    const result = mutateStoredBoardLibrary(
      localStorage,
      storageKeys.boardLibrary,
      PROJECT_ID,
      (latestDocument) =>
        addBoardSnapshot(latestDocument, {
          id: window.crypto.randomUUID(),
          name,
          now: new Date().toISOString(),
          scope: boardScope,
          picks: sanitizeBoardPicks(storedPicks),
        }),
    );
    if (!result.ok) return result;
    setBoardLibrary(result.document);
    setBoardLibraryStatus("loaded");
    return { ok: true, name: result.snapshot.name };
  };

  const handleRenameBoard = (
    snapshotId: string,
    name: string,
  ): BoardLibraryActionResult => {
    if (!boardLibraryWritable) return { ok: false, error: "storage" };
    const result = mutateStoredBoardLibrary(
      localStorage,
      storageKeys.boardLibrary,
      PROJECT_ID,
      (latestDocument) =>
        renameBoardSnapshot(latestDocument, {
          snapshotId,
          name,
          now: new Date().toISOString(),
        }),
    );
    if (!result.ok) return result;
    setBoardLibrary(result.document);
    return { ok: true, name: result.snapshot.name };
  };

  const handleDeleteBoard = (snapshotId: string): BoardLibraryActionResult => {
    if (!boardLibraryWritable) return { ok: false, error: "storage" };
    const result = mutateStoredBoardLibrary(
      localStorage,
      storageKeys.boardLibrary,
      PROJECT_ID,
      (latestDocument) => deleteBoardSnapshot(latestDocument, snapshotId),
    );
    if (!result.ok) return result;
    setBoardLibrary(result.document);
    return { ok: true, name: result.snapshot.name };
  };

  const handleRestoreBoard = (
    snapshot: BoardSnapshot,
  ): BoardLibraryActionResult => {
    const restoredPicks = sanitizeBoardPicks(snapshot.picks);
    if (Object.keys(restoredPicks).length === 0) {
      return { ok: false, error: "empty-board" };
    }
    if (!commitUserMutation("restore", restoredPicks)) {
      return { ok: false, error: "storage" };
    }
    setBoardStatusMessage(
      t("boardLibrary.restoreSuccess", { name: snapshot.name }),
    );
    return { ok: true, name: snapshot.name };
  };

  const selectedPickCount = Object.keys(picks).length;
  const canGenerateImage = !generating && selectedPickCount > 0;
  const commandPaletteCommands = useMemo<CommandPaletteCommand[]>(() => {
    const commands: CommandPaletteCommand[] = [
      {
        action: "search",
        icon: "search",
        label: t("controls.searchSongs"),
      },
      {
        action: "pick-assistant",
        icon: "music",
        label: t("controls.pickAssistant"),
      },
      {
        action: "board-library",
        icon: "archive",
        label: t("controls.myBoards", { count: scopedSnapshots.length }),
      },
      {
        action: "undo",
        disabled: boardHistory.past.length === 0,
        icon: "undo",
        label: t("controls.undo"),
      },
      {
        action: "redo",
        disabled: boardHistory.future.length === 0,
        icon: "redo",
        label: t("controls.redo"),
      },
      {
        action: "preview",
        disabled: !canGenerateImage,
        icon: "image",
        label: t("controls.generateImage"),
      },
    ];

    if (showArchetypeEntry) {
      commands.push({
        action: "archetype",
        icon: "sparkles",
        label: t("commands.archetype"),
      });
    }

    return commands;
  }, [
    boardHistory.future.length,
    boardHistory.past.length,
    canGenerateImage,
    scopedSnapshots.length,
    showArchetypeEntry,
    t,
  ]);

  const runCommandPaletteAction = (action: CommandPaletteAction) => {
    switch (action) {
      case "search":
        handleGlobalSearchClick();
        return;
      case "pick-assistant":
        handleOpenPickAssistant();
        return;
      case "board-library":
        handleOpenBoardLibrary();
        return;
      case "undo":
        applyHistoryAction("undo");
        return;
      case "redo":
        applyHistoryAction("redo");
        return;
      case "preview":
        void handleGenerateImage();
        return;
      case "archetype":
        handleArchetypeEntryClick();
    }
  };

  const handleCommandPaletteActionRequest = (action: CommandPaletteAction) => {
    pendingCommandPaletteActionRef.current = action;
    setCommandPaletteView(null);
  };

  const handleCommandPaletteExitComplete = () => {
    const action = pendingCommandPaletteActionRef.current;
    if (!action) return;

    pendingCommandPaletteActionRef.current = null;
    window.requestAnimationFrame(() => runCommandPaletteAction(action));
  };

  shortcutActionHandlersRef.current = {
    openCommandPalette: handleOpenCommandPalette,
    openSearch: handleGlobalSearchClick,
  };

  useEffect(() => {
    if (!hydrated || isExportRealm) return;

    const isPopoverOpen = (element: HTMLElement) => {
      try {
        return element.matches(":popover-open");
      } catch {
        return !element.hidden && element.getClientRects().length > 0;
      }
    };

    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      const action = resolveKeyboardShortcut(event, {
        hasActiveDialog: Boolean(
          document.querySelector('[aria-modal="true"], dialog[open]'),
        ),
        hasOpenMenu:
          Boolean(
            document.querySelector(
              '[role="menu"], [role="listbox"], [aria-expanded="true"]',
            ),
          ) ||
          Array.from(document.querySelectorAll<HTMLElement>("[popover]")).some(
            isPopoverOpen,
          ),
        isEditableTarget: isShortcutEditableTarget(event.target),
        isExportRealm,
        isHydrated: hydrated,
        isReordering: Boolean(
          document.querySelector(
            '[data-reorder-source="true"], [data-dragging="true"]',
          ),
        ),
        slotCount: slots.length,
      });
      if (!action) return;

      if (action.type === "focus-slot") {
        const slot = document.querySelectorAll<HTMLElement>(
          "[data-reorder-slot-id]",
        )[action.slotIndex];
        const slotAction = slot?.querySelector<HTMLButtonElement>(
          "[data-dialog-return-key]",
        );
        if (!slot || !slotAction) return;

        event.preventDefault();
        slot.scrollIntoView({ block: "nearest", inline: "nearest" });
        slotAction.focus({ preventScroll: true });
        return;
      }

      event.preventDefault();
      if (action.type === "open-search") {
        shortcutActionHandlersRef.current.openSearch();
        return;
      }
      shortcutActionHandlersRef.current.openCommandPalette(
        action.type === "open-shortcuts" ? "shortcuts" : "commands",
      );
    };

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [hydrated, isExportRealm, slots.length]);

  const headerMeta = buildHeaderMeta(
    uiCopy.eventName,
    activeUiContextDescription,
    uiCopy.venue,
  );

  return (
    <div
      className="site-shell relative flex flex-1 flex-col"
      data-ready={hydrated}
      aria-busy={!hydrated}
    >
      <AppleMotion>
        <AppTopBar
          memberColorBackground={MEMBER_COLOR_BAR_BACKGROUND}
          asHeading={isStandard}
        />
        <Header
          titlePrefix={isStandard ? undefined : uiCopy.title}
          titleAccent={isStandard ? undefined : PROJECT_CONFIG.groupName}
          subtitle={isStandard ? undefined : uiCopy.subtitle}
          description={
            isStandard ? undefined : experience.venue ? (
              <LocalizedTextWithJapaneseValue
                text={uiCopy.description}
                value={experience.venue}
              />
            ) : (
              uiCopy.description
            )
          }
          meta={isStandard ? undefined : headerMeta}
          showTitle={!isStandard}
          collapseDetailsOnMobile={!isStandard}
        />

        <ExperienceNavigation activeExperienceId={experience.id} />

        <Controls
          onClearAll={handleClearAllPicks}
          onGenerate={() => {
            void handleGenerateImage();
          }}
          onGlobalSearch={handleGlobalSearchClick}
          onOpenCommandPalette={handleOpenCommandPalette}
          onOpenPickAssistant={handleOpenPickAssistant}
          onUndo={() => applyHistoryAction("undo")}
          onRedo={() => applyHistoryAction("redo")}
          onOpenBoardLibrary={handleOpenBoardLibrary}
          onCopyBoardLink={handleCopyBoardLink}
          nickname={nicknameDraft}
          nicknameMaxLength={MAX_NICKNAME_LENGTH}
          onNicknameChange={handleNicknameChange}
          generating={generating}
          hasPicks={selectedPickCount > 0}
          canUndo={boardHistory.past.length > 0}
          canRedo={boardHistory.future.length > 0}
          savedBoardCount={scopedSnapshots.length}
          totalSongs={eligibleSongsCount}
          selectedCount={selectedPickCount}
          shortlistCount={assistantShortlistIds.length}
          slotCount={slots.length}
          metricLabel={
            isStandard ? t("controls.songs") : t("controls.eligibleSongs")
          }
          generateButtonRef={previewTriggerRef}
          pickAssistantButtonRef={pickAssistantTriggerRef}
          boardLinkCopied={boardLinkCopied}
        >
          {contextOptions.length > 0 ? (
            <ContextSelector
              contexts={uiContextOptions}
              activeContextId={activeContext?.id}
              onChange={handleContextChange}
            />
          ) : null}
          {experience.id === "kokuritsu_2026" ? (
            <p className="text-[11px] font-medium leading-relaxed text-[var(--muted)]">
              {uiCopy.hint}
            </p>
          ) : null}
        </Controls>

        {showNewSongsBanner ? (
          <NewSongsBanner
            count={songDiscoveryNewSongIds.length}
            onViewNewSongs={handleGlobalSearchClick}
            onMarkSeen={handleMarkSongDiscoverySongsSeen}
          />
        ) : null}

        {archetypeEntryUi ? (
          <div
            data-page-reveal
            className="app-content-shell relative z-10 mb-4 px-4 [--reveal-delay:140ms] sm:mb-5 sm:px-6 md:px-8"
          >
            <section
              aria-labelledby="archetype-entry-title"
              data-archetype-entry-state={
                archetypeResult && archetypeRemainingCount === 0
                  ? "ready"
                  : archetypeSelectedCount === 0
                    ? "empty"
                    : "incomplete"
              }
              className="official-panel-soft flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-[var(--project-primary)] uppercase">
                  {archetypeEntryUi.entry.campaignLabel}
                </p>
                <h2
                  id="archetype-entry-title"
                  className="mt-1 text-base font-semibold tracking-[-0.01em] text-[var(--foreground)] sm:text-lg"
                >
                  {archetypeResult && archetypeRemainingCount === 0
                    ? archetypeEntryUi.entry.readyTitle
                    : archetypeSelectedCount === 0
                      ? archetypeEntryUi.entry.emptyTitle
                      : archetypeEntryUi.entry.incompleteTitle}
                </h2>
                {archetypeResult && archetypeRemainingCount === 0 ? null : (
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)] sm:text-sm">
                    {archetypeSelectedCount === 0
                      ? archetypeEntryUi.entry.emptyDescription
                      : formatArchetypeTemplate(
                          archetypeEntryUi.entry.incompleteRemaining,
                          { remaining: String(archetypeRemainingCount) },
                        )}
                  </p>
                )}
              </div>
              <button
                ref={archetypeTriggerRef}
                type="button"
                data-dialog-return-key={DIALOG_RETURN_KEYS.archetype}
                onClick={handleArchetypeEntryClick}
                className="official-button official-button-primary min-h-11 w-full shrink-0 sm:w-auto sm:min-w-[220px]"
              >
                {archetypeResult && archetypeRemainingCount === 0
                  ? archetypeEntryUi.entry.readyCta
                  : archetypeSelectedCount === 0
                    ? archetypeEntryUi.entry.startCta
                    : archetypeEntryUi.entry.continueCta}
              </button>
            </section>
          </div>
        ) : null}

        <main className="app-content-shell flex flex-1 flex-col px-4 sm:px-6 md:px-8">
          <PickBoard
            slots={uiSlots}
            picks={picks}
            layout={isStandard ? "top10-grid" : "live-memory-grid"}
            showSlotMetadata={!isStandard}
            onSlotClick={handleSlotClick}
            onClearSlot={handleClearSlot}
            previewRelocation={previewRelocation}
            onRelocate={handleRelocate}
          />
          {boardInsights ? (
            <BoardInsightsPanel insights={boardInsights} />
          ) : null}
        </main>

        <Footer />

        <MotionPresence
          value={commandPaletteView}
          onExitComplete={handleCommandPaletteExitComplete}
        >
          {(view, presenceState) => (
            <CommandPalette
              commands={commandPaletteCommands}
              presenceState={presenceState}
              view={view}
              onClose={() => {
                pendingCommandPaletteActionRef.current = null;
                setCommandPaletteView(null);
              }}
              onSelect={handleCommandPaletteActionRequest}
              onViewChange={setCommandPaletteView}
            />
          )}
        </MotionPresence>

        <MotionPresence value={showBoardLibrary ? true : null}>
          {(_boardLibraryPresentation, presenceState) => (
            <BoardLibraryModal
              snapshots={scopedSnapshots}
              currentPicks={storedPicks}
              slots={uiSlots}
              writable={boardLibraryWritable}
              presenceState={presenceState}
              onSave={handleSaveBoard}
              onRename={handleRenameBoard}
              onDelete={handleDeleteBoard}
              onRestore={handleRestoreBoard}
              onClose={() => setShowBoardLibrary(false)}
            />
          )}
        </MotionPresence>

        <MotionPresence
          value={
            showModal
              ? {
                  songs: searchSongs,
                  selectionMode: searchSelectionMode,
                  autoFocusSearch: activeSlotId === null,
                  returnFocusKey: searchReturnFocusKeyRef.current,
                  contextLabel: selectedUiSlot
                    ? selectedUiSlot.label
                    : (activeUiContextDescription ?? uiCopy.title),
                }
              : null
          }
        >
          {(searchPresentation, presenceState) => (
            <SearchModal
              songs={searchPresentation.songs}
              members={MEMBERS}
              releaseTypes={RELEASE_TYPES}
              trackTypes={TRACK_TYPES}
              years={RELEASE_YEARS}
              autoFocusSearch={searchPresentation.autoFocusSearch}
              contextLabel={searchPresentation.contextLabel}
              resultBadgesBySongId={songBadgesBySongId}
              selectedSongsById={selectedSongsById}
              emptyMessage={t("search.noEligibleMatches")}
              selectedRanksBySongId={selectedRanksBySongId}
              recentSongIds={songDiscoveryState.recentSongIds}
              newSongIds={isStandardTopTen ? newSongIdSet : undefined}
              candidateSongIds={candidateSongIds}
              candidateEligibleSongIds={assistantEligibleSongIds}
              selectionMode={searchPresentation.selectionMode}
              candidateLimitReached={
                assistantShortlistIds.length >=
                PICK_ASSISTANT_CONFIG.maximumCandidates
              }
              candidateChangesBlocked={Boolean(pickAssistantStorageIssue)}
              candidateMutationPending={assistantMutationPending}
              maximumCandidates={PICK_ASSISTANT_CONFIG.maximumCandidates}
              suspended={detailLayerActive}
              resumeFocusRef={detailTriggerRef}
              presenceState={presenceState}
              returnFocusKey={searchPresentation.returnFocusKey}
              onClose={() => {
                setShowModal(false);
                setSearchSelectionMode("board");
                setDetailSongId(null);
                detailTriggerRef.current = null;
                setActiveSlotId(null);
              }}
              onSelect={handleSelectSong}
              onToggleCandidate={handleToggleCandidate}
              onReturnToAssistant={handleReturnToPickAssistant}
              onOpenDetail={handleOpenSongDetail}
            />
          )}
        </MotionPresence>

        <MotionPresence
          value={showModal ? detailSong : null}
          onExitComplete={() => setDetailLayerActive(false)}
        >
          {(song, presenceState) => (
            <SongDetailModal
              song={song}
              members={MEMBERS}
              isRecentlyViewed={songDiscoveryState.recentSongIds.includes(
                song.id,
              )}
              selectionMode={searchSelectionMode}
              isCandidate={candidateSongIds.has(song.id)}
              candidateDisabled={
                (!candidateSongIds.has(song.id) &&
                  (assistantShortlistIds.length >=
                    PICK_ASSISTANT_CONFIG.maximumCandidates ||
                    !assistantEligibleSongIds.has(song.id))) ||
                assistantMutationPending ||
                Boolean(pickAssistantStorageIssue)
              }
              presenceState={presenceState}
              onClose={() => setDetailSongId(null)}
              onSelect={handleSelectSongFromDetail}
              onToggleCandidate={handleToggleCandidate}
            />
          )}
        </MotionPresence>

        <MotionPresence
          value={
            pendingReplacementSong
              ? {
                  song: pendingReplacementSong,
                  slotStates: replacementSlotStates,
                }
              : null
          }
        >
          {(replacement, presenceState) => (
            <ReplacementModal
              song={replacement.song}
              slots={uiSlots}
              picks={picks}
              slotStates={replacement.slotStates}
              showSlotLabels={!isStandard}
              presenceState={presenceState}
              onReplace={handleReplaceSlot}
              onClose={() => setPendingReplacementSong(null)}
            />
          )}
        </MotionPresence>

        <MotionPresence value={boardShareDialog}>
          {(dialogState, presenceState) => (
            <BoardShareImportModal
              state={dialogState}
              presenceState={presenceState}
              comparisonAvailability={boardShareComparisonAvailability}
              onClose={handleCloseBoardShareDialog}
              onConfirm={handleConfirmBoardShareImport}
              onCompare={handleCompareBoardShare}
            />
          )}
        </MotionPresence>

        <MotionPresence
          value={
            showPickAssistant
              ? {
                  shortlist: shortlistSongs,
                  session: assistantSession,
                  applicationPlan: assistantApplicationPlan,
                  storageIssue: pickAssistantStorageIssue,
                }
              : null
          }
        >
          {(assistant, presenceState) => (
            <PickAssistantModal
              shortlist={assistant.shortlist}
              session={assistant.session}
              applicationPlan={assistant.applicationPlan}
              slotLabels={assistantSlotLabels}
              currentPickCount={Object.keys(storedPicks).length}
              currentBoardCandidateCount={currentBoardCandidateIds.length}
              minimumCandidates={PICK_ASSISTANT_CONFIG.minimumCandidates}
              maximumCandidates={PICK_ASSISTANT_CONFIG.maximumCandidates}
              storageIssue={assistant.storageIssue}
              mutationsBlocked={assistantMutationPending}
              reviewNotice={assistantReviewNotice}
              presenceState={presenceState}
              returnFocusKey={DIALOG_RETURN_KEYS.pickAssistant}
              onClose={() => setShowPickAssistant(false)}
              onBrowseCandidates={handleBrowseAssistantCandidates}
              onUseCurrentBoard={handleUseCurrentBoardForAssistant}
              onRemoveCandidate={handleRemoveCandidate}
              onClear={handleClearPickAssistant}
              onStart={handleStartPickAssistant}
              onCompare={handleAssistantComparison}
              onSkip={handleSkipAssistantComparison}
              onUndo={handleUndoAssistantComparison}
              onRestart={handleRestartPickAssistant}
              onApply={() => {
                void handleApplyAssistantResult();
              }}
              onResetStorage={handleResetPickAssistantStorage}
            />
          )}
        </MotionPresence>

        <MotionPresence
          value={
            openArchetypeInputKey === archetypeResult?.inputKey
              ? archetypeResult
              : null
          }
        >
          {(result, presenceState) => (
            <ArchetypeResultModal
              result={result}
              presenceState={presenceState}
              returnFocusRef={archetypeTriggerRef}
              returnFocusFallbackKey={DIALOG_RETURN_KEYS.globalSearch}
              generatingImage={generating}
              onGenerateImage={() => {
                void handleGenerateArchetypeImage();
              }}
              onClose={() => setOpenArchetypeInputKey(null)}
            />
          )}
        </MotionPresence>

        <MotionPresence value={preview}>
          {(renderedPreview, presenceState) => (
            <PreviewModal
              previewUrl={renderedPreview.dataUrl}
              onClose={handleClosePreview}
              showTitles={showTitles}
              onToggleShowTitles={handleShowTitlesChange}
              transparentBg={transparentBg}
              onToggleTransparentBg={handleTransparentBackgroundChange}
              showQrCode={showQrCode}
              onToggleShowQrCode={handleShowQrCodeChange}
              templateId={activeTemplateId}
              availableTemplateIds={availableTemplateIds}
              onTemplateChange={handleTemplateChange}
              generating={generating}
              actionsDisabled={
                generating || renderedPreview.optionsKey !== previewOptionsKey
              }
              pageUrl={renderedPreview.pageUrl}
              previewLabel={renderedPreview.previewLabel}
              imageFileName={renderedPreview.imageFileName}
              shareText={renderedPreview.shareText}
              shareHashtags={renderedPreview.shareHashtags}
              shareTitle={renderedPreview.shareTitle}
              presenceState={presenceState}
              returnFocusRef={
                renderedPreview.kind === "archetype"
                  ? archetypeTriggerRef
                  : previewTriggerRef
              }
              returnFocusKey={
                renderedPreview.kind === "archetype"
                  ? DIALOG_RETURN_KEYS.archetype
                  : DIALOG_RETURN_KEYS.generateImage
              }
              returnFocusFallbackKey={DIALOG_RETURN_KEYS.globalSearch}
            />
          )}
        </MotionPresence>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {boardStatusMessage}
        </span>
      </AppleMotion>

      {isExportRealm ? (
        <div
          className="pointer-events-none fixed -left-[9999px] -top-[9999px] select-none overflow-hidden"
          aria-hidden="true"
          inert
        >
          <ExportBoard
            experience={experience}
            context={activeContext}
            exportCanvasId={exportCanvasId}
            slots={slots}
            picks={picks}
            showTitles={showTitles}
            transparentBg={transparentBg}
            showQrCode={showQrCode}
            templateId={activeTemplateId}
            sizePresetId={frameSizePresetId}
            selectedBy={exportNickname}
            pageUrl={framePageUrl ?? pageUrl}
            headerPresentation={archetypeExportPresentation}
          />
        </div>
      ) : null}
    </div>
  );
}

function buildHeaderMeta(
  eventName?: string,
  contextDescription?: string,
  venue?: string,
) {
  const parts: Array<{ key: string; content: ReactNode }> = [];

  if (eventName) {
    parts.push({
      key: "event",
      content: <JapaneseContent>{eventName}</JapaneseContent>,
    });
  }
  if (contextDescription) {
    parts.push({ key: "context", content: contextDescription });
  }
  if (venue) {
    parts.push({
      key: "venue",
      content: <JapaneseContent>{venue}</JapaneseContent>,
    });
  }

  if (parts.length === 0) return undefined;

  return parts.map(({ key, content }, index) => (
    <Fragment key={key}>
      {index > 0 ? " / " : null}
      {content}
    </Fragment>
  ));
}

const ACTIVE_MEMBERS_BY_SORT_ORDER = MEMBERS.filter(
  (member) => member.active !== false,
).sort((a, b) => a.sortOrder - b.sortOrder);
const MEMBER_COLOR_BAR_BACKGROUND = getMemberColorGradient(
  ACTIVE_MEMBERS_BY_SORT_ORDER,
  PROJECT_THEME_COLOR,
);

async function copyTextToClipboard(value: string) {
  if (typeof navigator.clipboard?.writeText === "function") {
    await navigator.clipboard.writeText(value);
    return;
  }

  const previousFocus = document.activeElement as HTMLElement | null;
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  Object.assign(textarea.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    opacity: "0",
  });
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  previousFocus?.focus();
  if (!copied) {
    throw new Error("Clipboard API is unavailable");
  }
}
function normalizeNickname(nickname: string) {
  return nickname.trim().replace(/\s+/g, " ").slice(0, MAX_NICKNAME_LENGTH);
}

function getArchetypeImageFileName(
  characters: readonly { displayName: string }[],
) {
  const names = characters
    .map((character) => character.displayName.replace(/[^A-Za-z0-9]+/g, "_"))
    .filter(Boolean)
    .join("_");
  return `EqualLove_AdventurePartner_${names || "Result"}.png`;
}

function isWritableStorageStatus(status: StorageLoadStatus) {
  return status === "empty" || status === "loaded" || status === "migrated";
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function createExportRenderResult(
  requestId: string,
  dataUrl?: string,
  error?: string,
): ExportRenderResult {
  return {
    type: EXPORT_REALM_RESULT_TYPE,
    version: EXPORT_CAPTURE_PROTOCOL_VERSION,
    requestId,
    dataUrl,
    error,
  };
}

async function waitForExportImages(exportElement: HTMLElement) {
  await Promise.all(
    Array.from(exportElement.querySelectorAll("img")).map((image) =>
      waitForExportImageReady(image),
    ),
  );
}
