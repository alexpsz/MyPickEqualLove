"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
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
  EXPORT_BACKGROUND,
  EXPORT_SCALE,
  getExportSizePreset,
} from "../config/exportPresets";
import {
  MEMBERS,
  MEMBERS_BY_ID,
  RELEASE_TYPES,
  RELEASE_YEARS,
  SONGS_BY_ID,
  TRACK_TYPES,
} from "../data/songs";
import {
  createBoardSharePayload,
  resolveBoardSharePayload,
} from "../data/boardShare";
import {
  filterStoredPicksForExperience,
  findFirstEligibleEmptySlot,
  getDefaultExperienceContextId,
  getEligibleSongsForExperience,
  getEligibleSongsForSlot,
  getExperienceContext,
  getExperienceContexts,
  getExperienceExportCanvasIdFor,
  getExperienceImageFileName,
  getExperiencePageUrl,
  getReplacementSlotStates,
  getSongBadgesBySongId,
  getSortedExperienceSlots,
  getStorageKeysForExperience,
  isSongEligibleForSlot,
  relocateStoredPick,
  type ExperienceContext,
  type RelocatePickResult,
} from "../data/pickExperiences";
import { localizeExperienceUi } from "../i18n/content";
import { useLocale } from "../i18n/LocaleProvider";
import type { PickExperience } from "../schema/pick-experience";
import type {
  ExportCardType,
  ExportOptions,
  ExportSizePresetId,
  ExportTemplateId,
} from "../schema/export";
import type { PickSlotId, Picks, Song, StoredPicks } from "../schema/music";
import {
  boardHistoryReducer,
  createBoardHistoryState,
  sameStoredPicks,
  type BoardMutationKind,
} from "../utils/boardHistory";
import {
  addBoardSnapshot,
  createEmptyBoardLibrary,
  deleteBoardSnapshot,
  getSnapshotsForScope,
  importStoredBoard,
  loadBoardLibrary,
  loadStoredBoard,
  loadStoredOptions,
  mutateStoredBoardLibrary,
  mutateStoredOptions,
  renameBoardSnapshot,
  saveStoredBoard,
  type BoardLibraryDocument,
  type BoardScope,
  type BoardSnapshot,
  type StorageLoadStatus,
} from "../utils/boardStorage";
import { centerExportYearInk } from "../utils/centerExportYearInk";
import { convertColorString } from "../utils/colors";
import { assertExportLayoutFits } from "../utils/assertExportLayoutFits";
import {
  buildBoardShareUrl,
  createBoardSharePreviewDiff,
  isBoardShareHash,
  parseBoardShareUrl,
  type BoardSharePayload,
} from "../utils/boardShareProtocol.mjs";
import {
  EXPORT_CAPTURE_PROTOCOL_VERSION,
  EXPORT_REALM_READY_TYPE,
  EXPORT_REALM_RESULT_TYPE,
  captureExportImageInFrame,
  isExportRealmHash,
  isExportRenderRequest,
  type ExportRenderRequest,
  type ExportRenderResult,
} from "../utils/exportCapture";
import { getMemberColorGradient } from "../utils/memberColors";
import { derivePickInsights } from "../utils/pickInsights";
import {
  createPickAssistantSession,
  deriveTournament,
  parsePickAssistantSnapshot,
  planRankedPicks,
  recordComparison,
  samePickAssistantApplicationInputs,
  samePickAssistantSnapshots,
  skipComparison,
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
  loadSongDiscoveryState,
  recordRecentSongId,
  toggleFavoriteSongId,
  updateStoredSongDiscoveryState,
  type SongDiscoveryState,
} from "../utils/songDiscoveryStorage";
import {
  DIALOG_RETURN_KEYS,
  getPickSlotReturnKey,
  setActiveDialogReturnFocusKey,
} from "../utils/useDialogA11y";
import AppTopBar from "./AppTopBar";
import AppleMotion from "./AppleMotion";
import BoardLibraryModal, {
  type BoardLibraryActionResult,
} from "./BoardLibraryModal";
import BoardShareImportModal, {
  type BoardShareDialogState,
} from "./BoardShareImportModal";
import Controls from "./Controls";
import ExperienceNavigation from "./ExperienceNavigation";
import ExportBoard from "./ExportBoard";
import InsightsExportBoard from "./InsightsExportBoard";
import Footer from "./Footer";
import Header from "./Header";
import JapaneseContent, {
  LocalizedTextWithJapaneseValue,
} from "./JapaneseContent";
import MotionPresence from "./MotionPresence";
import PickBoard from "./PickBoard";
import PickInsightsPanel from "./PickInsightsPanel";
import PreviewModal from "./PreviewModal";
import ReplacementModal from "./ReplacementModal";
import SearchModal, { type SelectedSongPresentation } from "./SearchModal";
import SongDetailModal from "./SongDetailModal";

const PickAssistantModal = dynamic(() => import("./PickAssistantModal"), {
  ssr: false,
});

type PickAssistantStorageIssue =
  import("./PickAssistantModal").PickAssistantStorageIssue;

interface PickExperienceClientProps {
  experience: PickExperience;
}

const MAX_NICKNAME_LENGTH = 32;
const VALID_SONG_IDS = new Set(Object.keys(SONGS_BY_ID));
const BOARD_LINK_COPIED_DURATION_MS = 2_000;
const PICK_ASSISTANT_STORAGE_OPTIONS = {
  ...PICK_ASSISTANT_CONFIG,
  validSongIds: VALID_SONG_IDS,
};

interface PendingBoardShareImport {
  payload: BoardSharePayload;
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
  dataUrl: string;
  cardType: ExportCardType;
  optionsKey: string;
  imageFileName: string;
  opener: "poster" | "insights";
  pageUrl: string;
  previewLabel: string;
  shareText: string;
  shareHashtags: string[];
  shareTitle: string;
}

const getPreviewOptionsKey = (
  cardType: ExportCardType,
  showTitles: boolean,
  transparentBg: boolean,
  showQrCode: boolean,
  templateId: ExportTemplateId,
  sizePresetId: ExportSizePresetId,
) => {
  if (cardType === "insights") {
    return `insights:${sizePresetId}:${showQrCode ? "qr" : "no-qr"}`;
  }
  return [
    showTitles ? "titles" : "no-titles",
    transparentBg ? "transparent" : "opaque",
    showQrCode ? "qr" : "no-qr",
    templateId,
    sizePresetId,
  ].join(":");
};

export default function PickExperienceClient({
  experience,
}: PickExperienceClientProps) {
  const { locale, t } = useLocale();
  const isStandard = experience.kind === "standard";
  const uiCopy = useMemo(
    () => localizeExperienceUi(experience, locale),
    [experience, locale],
  );
  const contextOptions = useMemo(
    () => getExperienceContexts(experience),
    [experience],
  );
  const uiContextOptions = useMemo(
    () =>
      contextOptions.map((context) => ({
        ...context,
        label: uiCopy.contextLabels?.[context.id] ?? context.label,
      })),
    [contextOptions, uiCopy.contextLabels],
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
  const activeUiContextDescription = activeContext
    ? `${uiCopy.contextLabels?.[activeContext.id] ?? activeContext.label} · ${activeContext.dateLabel}`
    : undefined;
  const effectiveContextId = activeContext?.id;
  const storageKeys = useMemo(
    () => getStorageKeysForExperience(experience, effectiveContextId),
    [effectiveContextId, experience],
  );
  const slots = useMemo(
    () => getSortedExperienceSlots(experience),
    [experience],
  );
  const uiSlots = useMemo(
    () => uiCopy.slots.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [uiCopy.slots],
  );
  const [boardHistory, dispatchBoardHistory] = useReducer(
    boardHistoryReducer,
    undefined,
    () => createBoardHistoryState(),
  );
  const storedPicks = boardHistory.present;
  const [activeSlotId, setActiveSlotId] = useState<PickSlotId | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showBoardLibrary, setShowBoardLibrary] = useState(false);
  const [detailSongId, setDetailSongId] = useState<string | null>(null);
  const [detailLayerActive, setDetailLayerActive] = useState(false);
  const [songDiscoveryState, setSongDiscoveryState] =
    useState<SongDiscoveryState>(createEmptySongDiscoveryState);
  const [pendingReplacementSong, setPendingReplacementSong] =
    useState<Song | null>(null);
  const [preview, setPreview] = useState<PreviewSnapshot | null>(null);
  const [requestedCardType, setRequestedCardType] =
    useState<ExportCardType>("poster");
  const [showInsights, setShowInsights] = useState(false);
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
  const [sizePresetId, setSizePresetId] = useState<ExportSizePresetId>(
    DEFAULT_EXPORT_OPTIONS.sizePresetId,
  );
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [frameCaptureRequest, setFrameCaptureRequest] =
    useState<ExportRenderRequest | null>(null);
  const [framePageUrl, setFramePageUrl] = useState<string | null>(null);
  const [isExportRealm, setIsExportRealm] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [showPickAssistant, setShowPickAssistant] = useState(false);
  const [pickAssistantSnapshot, setPickAssistantSnapshot] =
    useState<PickAssistantSnapshot>(() =>
      createEmptyPickAssistantSnapshot(PICK_ASSISTANT_CONFIG.schemaVersion),
    );
  const [pickAssistantStorageIssue, setPickAssistantStorageIssue] =
    useState<PickAssistantStorageIssue | null>(null);
  const [assistantNeedsReview, setAssistantNeedsReview] = useState(false);
  const [assistantReviewNotice, setAssistantReviewNotice] = useState(false);
  const [boardLibrary, setBoardLibrary] = useState<BoardLibraryDocument>(() =>
    createEmptyBoardLibrary(),
  );
  const [boardLibraryStatus, setBoardLibraryStatus] =
    useState<StorageLoadStatus>("empty");
  const [boardLibraryLoaded, setBoardLibraryLoaded] = useState(false);
  const [boardStatusMessage, setBoardStatusMessage] = useState("");
  const [boardStorageWritable, setBoardStorageWritable] = useState(false);
  const [optionsStorageWritable, setOptionsStorageWritable] = useState(false);
  const storedPicksRef = useRef<StoredPicks>({});
  const [boardLinkCopied, setBoardLinkCopied] = useState(false);
  const [boardShareDialog, setBoardShareDialog] =
    useState<BoardShareDialogState | null>(null);
  const [pendingBoardShareImport, setPendingBoardShareImport] =
    useState<PendingBoardShareImport | null>(null);
  const generatingRef = useRef(false);
  const activeFrameRequestIdRef = useRef<string | null>(null);
  const capturedFrameRequestIdRef = useRef<string | null>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const insightsTriggerRef = useRef<HTMLButtonElement>(null);
  const pickAssistantTriggerRef = useRef<HTMLButtonElement>(null);
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
  const insights = useMemo(
    () => derivePickInsights(picks, MEMBERS_BY_ID),
    [picks],
  );
  const pickedSongIds = useMemo(
    () => new Set(Object.values(storedPicks)),
    [storedPicks],
  );
  const assistantShortlistIds = useMemo(
    () =>
      pickAssistantSnapshot.shortlistIds.filter(
        (songId) => !pickedSongIds.has(songId),
      ),
    [pickAssistantSnapshot.shortlistIds, pickedSongIds],
  );
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
      selectedSlot
        ? getEligibleSongsForSlot(experience, selectedSlot, effectiveContextId)
        : getEligibleSongsForExperience(experience, effectiveContextId),
    [effectiveContextId, experience, selectedSlot],
  );
  const eligibleSongsCount = useMemo(
    () => getEligibleSongsForExperience(experience, effectiveContextId).length,
    [effectiveContextId, experience],
  );
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
    templateId,
    sizePresetId,
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
    const exportRealm =
      window.parent !== window && isExportRealmHash(window.location.hash);
    setIsExportRealm(exportRealm);
    if (exportRealm) {
      setContextId(defaultContextId);
      storedPicksRef.current = {};
      dispatchBoardHistory({ type: "reset", picks: {} });
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
          filterStoredPicksForExperience({
            experience,
            storedPicks: candidatePicks,
            contextId: initialContextId,
          }),
      });
      storedPicksRef.current = boardResult.picks;
      dispatchBoardHistory({ type: "reset", picks: boardResult.picks });
      setBoardStorageWritable(isWritableStorageStatus(boardResult.status));

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
        setSizePresetId(optionsResult.options.sizePresetId);
      }
      setOptionsStorageWritable(isWritableStorageStatus(optionsResult.status));

      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [contextOptions, defaultContextId, experience]);

  useEffect(() => {
    storedPicksRef.current = storedPicks;
  }, [storedPicks]);

  useEffect(() => {
    if (!hydrated || isExportRealm) return;

    assistantApplyBaselineRef.current = null;
    setAssistantNeedsReview(false);
    setAssistantReviewNotice(false);
    const result = loadPickAssistantSnapshot(
      localStorage,
      storageKeys.assistant,
      PICK_ASSISTANT_STORAGE_OPTIONS,
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
    setCurrentPickAssistantSnapshot,
    storageKeys.assistant,
  ]);

  useEffect(() => {
    if (!hydrated || isExportRealm) return;

    const handleAssistantStorage = (event: StorageEvent) => {
      if (
        event.storageArea !== localStorage ||
        (event.key !== storageKeys.assistant && event.key !== null)
      ) {
        return;
      }

      const incoming =
        event.key === storageKeys.assistant
          ? parsePickAssistantSnapshot(event.newValue, {
              ...PICK_ASSISTANT_STORAGE_OPTIONS,
              now: Date.now(),
            })
          : loadPickAssistantSnapshot(
              localStorage,
              storageKeys.assistant,
              PICK_ASSISTANT_STORAGE_OPTIONS,
            );

      assistantApplyBaselineRef.current = null;
      if (incoming.status === "missing") {
        setCurrentPickAssistantSnapshot(
          createEmptyPickAssistantSnapshot(PICK_ASSISTANT_CONFIG.schemaVersion),
        );
        setPickAssistantStorageIssue(null);
        if (assistantResultVisibleRef.current) {
          setAssistantNeedsReview(true);
          setAssistantReviewNotice(true);
          setBoardStatusMessage(t("assistant.previewRefreshed"));
        }
        return;
      }
      if (incoming.status !== "valid") {
        setCurrentPickAssistantSnapshot(
          createEmptyPickAssistantSnapshot(PICK_ASSISTANT_CONFIG.schemaVersion),
        );
        setPickAssistantStorageIssue(incoming.status);
        return;
      }

      const current = pickAssistantSnapshotRef.current;
      if (samePickAssistantSnapshots(incoming.snapshot, current)) return;
      setCurrentPickAssistantSnapshot(incoming.snapshot);
      const conflictingRevision =
        incoming.snapshot.revision <= current.revision;
      setPickAssistantStorageIssue(conflictingRevision ? "conflict" : null);
      if (assistantResultVisibleRef.current) {
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
    setRequestedCardType("poster");
  }, []);

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

      cancelStalePreview();
      setContextId(nextContextId);
      setActiveSlotId(null);
      setShowModal(false);
      setShowBoardLibrary(false);
      setShowPickAssistant(false);
      setShowInsights(false);
      setAssistantNeedsReview(false);
      setAssistantReviewNotice(false);
      assistantApplyBaselineRef.current = null;
      setDetailSongId(null);
      setDetailLayerActive(false);
      setPendingReplacementSong(null);
      setPendingBoardShareImport(null);
      setBoardShareDialog(null);

      if (persist && nextStorageKeys.context && nextContextId) {
        try {
          localStorage.setItem(nextStorageKeys.context, nextContextId);
        } catch {
          // The context can still change in memory when storage is unavailable.
        }
      }

      const boardResult = loadStoredBoard({
        storage: localStorage,
        versionedKey: nextStorageKeys.picksV2,
        legacyKey: nextStorageKeys.picks,
        sanitize: (candidatePicks) =>
          filterStoredPicksForExperience({
            experience,
            storedPicks: candidatePicks,
            contextId: nextContextId,
          }),
      });
      const writable = isWritableStorageStatus(boardResult.status);
      setBoardStorageWritable(writable);
      storedPicksRef.current = boardResult.picks;
      dispatchBoardHistory({ type: "reset", picks: boardResult.picks });
      if (!writable) {
        setBoardStatusMessage(t("boardLibrary.error.storage"));
      }
    },
    [cancelStalePreview, contextOptions, defaultContextId, experience, t],
  );

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
        event.storageArea === localStorage &&
        (event.key === storageKeys.boardLibrary || event.key === null)
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
    const syncSongDiscovery = () =>
      setSongDiscoveryState(
        loadSongDiscoveryState(STORAGE_KEYS.songDiscovery, VALID_SONG_IDS),
      );
    const handleStorage = (event: StorageEvent) => {
      if (
        event.storageArea === localStorage &&
        (event.key === STORAGE_KEYS.songDiscovery || event.key === null)
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

    const syncActiveBoard = () => {
      const result = loadStoredBoard({
        storage: localStorage,
        versionedKey: storageKeys.picksV2,
        legacyKey: storageKeys.picks,
        sanitize: sanitizeBoardPicks,
      });
      setBoardStorageWritable(isWritableStorageStatus(result.status));
      if (!isWritableStorageStatus(result.status)) {
        setBoardStatusMessage(t("boardLibrary.error.storage"));
        return;
      }
      cancelStalePreview();
      storedPicksRef.current = result.picks;
      dispatchBoardHistory({ type: "reset", picks: result.picks });
      if (assistantResultVisibleRef.current) {
        assistantApplyBaselineRef.current = null;
        setAssistantNeedsReview(true);
        setAssistantReviewNotice(true);
        setBoardStatusMessage(t("assistant.previewRefreshed"));
      }
    };
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
      setSizePresetId(options.sizePresetId);
    };
    const syncStoredContext = () => {
      if (!storageKeys.context) return false;
      let nextContextId: string | null = null;
      try {
        nextContextId = localStorage.getItem(storageKeys.context);
      } catch {
        setBoardStatusMessage(t("boardLibrary.error.storage"));
        return true;
      }
      activateExperienceContext(nextContextId, false);
      return true;
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      if (event.key === storageKeys.context) {
        syncStoredContext();
        return;
      }
      if (event.key === null) {
        if (!syncStoredContext()) syncActiveBoard();
        syncExportOptions();
        return;
      }
      if (event.key === storageKeys.picksV2) {
        syncActiveBoard();
      }
      if (event.key === storageKeys.optionsV2) {
        syncExportOptions();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [
    activateExperienceContext,
    cancelStalePreview,
    hydrated,
    isExportRealm,
    sanitizeBoardPicks,
    storageKeys.options,
    storageKeys.optionsV2,
    storageKeys.picks,
    storageKeys.picksV2,
    storageKeys.context,
    t,
  ]);

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
    (newPicks: StoredPicks, storageKey = storageKeys.picksV2) => {
      if (!boardStorageWritable) return false;
      const current = loadStoredBoard({
        storage: localStorage,
        versionedKey: storageKey,
        legacyKey: storageKeys.picks,
        sanitize: sanitizeBoardPicks,
      });
      if (!isWritableStorageStatus(current.status)) {
        setBoardStorageWritable(false);
        return false;
      }
      if (!sameStoredPicks(current.picks, storedPicksRef.current)) {
        cancelStalePreview();
        storedPicksRef.current = current.picks;
        dispatchBoardHistory({ type: "reset", picks: current.picks });
        return false;
      }
      const filteredPicks = sanitizeBoardPicks(newPicks);
      if (!saveStoredBoard(localStorage, storageKey, filteredPicks)) {
        return false;
      }
      storedPicksRef.current = filteredPicks;
      dispatchBoardHistory({ type: "reset", picks: filteredPicks });
      return true;
    },
    [
      boardStorageWritable,
      cancelStalePreview,
      sanitizeBoardPicks,
      storageKeys.picks,
      storageKeys.picksV2,
    ],
  );

  const commitUserMutation = useCallback(
    (kind: BoardMutationKind, newPicks: StoredPicks) => {
      if (!boardStorageWritable) {
        window.alert(t("boardLibrary.error.storage"));
        return false;
      }
      const latest = loadStoredBoard({
        storage: localStorage,
        versionedKey: storageKeys.picksV2,
        legacyKey: storageKeys.picks,
        sanitize: sanitizeBoardPicks,
      });
      if (
        !isWritableStorageStatus(latest.status) ||
        !sameStoredPicks(latest.picks, storedPicksRef.current)
      ) {
        setBoardStorageWritable(isWritableStorageStatus(latest.status));
        if (isWritableStorageStatus(latest.status)) {
          cancelStalePreview();
          storedPicksRef.current = latest.picks;
          dispatchBoardHistory({ type: "reset", picks: latest.picks });
        }
        window.alert(t("boardLibrary.error.storage"));
        return false;
      }
      const filteredPicks = sanitizeBoardPicks(newPicks);
      const action = {
        type: "commit" as const,
        mutation: { kind, nextPicks: filteredPicks },
      };
      const nextHistory = boardHistoryReducer(boardHistory, action);
      if (nextHistory === boardHistory) return true;
      if (!saveStoredBoard(localStorage, storageKeys.picksV2, filteredPicks)) {
        window.alert(t("boardLibrary.error.storage"));
        return false;
      }
      cancelStalePreview();
      storedPicksRef.current = filteredPicks;
      dispatchBoardHistory(action);
      return true;
    },
    [
      boardHistory,
      boardStorageWritable,
      cancelStalePreview,
      sanitizeBoardPicks,
      storageKeys.picks,
      storageKeys.picksV2,
      t,
    ],
  );

  const applyHistoryAction = useCallback(
    (type: "undo" | "redo") => {
      if (!boardStorageWritable) {
        window.alert(t("boardLibrary.error.storage"));
        return;
      }
      const latest = loadStoredBoard({
        storage: localStorage,
        versionedKey: storageKeys.picksV2,
        legacyKey: storageKeys.picks,
        sanitize: sanitizeBoardPicks,
      });
      if (
        !isWritableStorageStatus(latest.status) ||
        !sameStoredPicks(latest.picks, storedPicksRef.current)
      ) {
        setBoardStorageWritable(isWritableStorageStatus(latest.status));
        if (isWritableStorageStatus(latest.status)) {
          cancelStalePreview();
          storedPicksRef.current = latest.picks;
          dispatchBoardHistory({ type: "reset", picks: latest.picks });
        }
        window.alert(t("boardLibrary.error.storage"));
        return;
      }
      const action = { type } as const;
      const nextHistory = boardHistoryReducer(boardHistory, action);
      if (nextHistory === boardHistory) return;
      const filteredPicks = sanitizeBoardPicks(nextHistory.present);
      if (!saveStoredBoard(localStorage, storageKeys.picksV2, filteredPicks)) {
        window.alert(t("boardLibrary.error.storage"));
        return;
      }
      cancelStalePreview();
      storedPicksRef.current = filteredPicks;
      dispatchBoardHistory(action);
      setBoardStatusMessage(
        t(type === "undo" ? "history.undoDone" : "history.redoDone"),
      );
    },
    [
      boardHistory,
      boardStorageWritable,
      cancelStalePreview,
      sanitizeBoardPicks,
      storageKeys.picks,
      storageKeys.picksV2,
      t,
    ],
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
      if (resolved.status === "invalid") {
        presentBoardShareDialog({
          kind: "invalid",
          unsupportedVersion: resolved.reason === "unsupported-version",
        });
        return;
      }

      if (resolved.status === "mismatch") {
        const targetUrl = new URL(resolved.canonicalUrl);
        targetUrl.hash = originalHash.slice(1);
        presentBoardShareDialog({
          kind: "mismatch",
          targetName: resolved.displayName,
          targetUrl: targetUrl.toString(),
        });
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
      const previewDiff = createBoardSharePreviewDiff({
        slotIds: snapshot.slots.map((slot) => slot.id),
        currentPicks: currentTargetPicks,
        importedPicks: resolved.picks,
        currentContextId: snapshot.effectiveContextId ?? null,
        importedContextId: resolved.contextId ?? null,
      });
      const uiSlotsById = new Map(
        snapshot.uiSlots.map((slot) => [slot.id, slot]),
      );
      const slotsById = new Map(snapshot.slots.map((slot) => [slot.id, slot]));
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
      const contextLabel =
        resolved.contextId && previewDiff.contextChanged
          ? snapshot.uiContextOptions.find(
              (context) => context.id === resolved.contextId,
            )?.label
          : undefined;

      presentBoardShareDialog(
        { kind: "import", changes, contextLabel },
        { payload: parsed.payload, baselinePicks: currentTargetPicks },
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
    detailTriggerRef.current = null;
    setDetailSongId(null);
    setActiveSlotId(slotId);
    setShowModal(true);
  };

  const handleGlobalSearchClick = () => {
    searchReturnFocusKeyRef.current = DIALOG_RETURN_KEYS.globalSearch;
    detailTriggerRef.current = null;
    setDetailSongId(null);
    setActiveSlotId(null);
    setShowModal(true);
  };

  const handleNicknameChange = (nickname: string) => {
    setNicknameDraft(nickname.slice(0, MAX_NICKNAME_LENGTH));
  };

  const updateSongDiscoveryState = useCallback(
    (update: (current: SongDiscoveryState) => SongDiscoveryState) => {
      const result = updateStoredSongDiscoveryState(
        STORAGE_KEYS.songDiscovery,
        VALID_SONG_IDS,
        update,
      );
      if (!result.ok) {
        setBoardStatusMessage(t("boardLibrary.error.storage"));
        return false;
      }

      setSongDiscoveryState(result.state);
      setBoardStatusMessage("");
      return true;
    },
    [t],
  );

  const handleToggleFavorite = useCallback(
    (songId: string) => {
      updateSongDiscoveryState((current) =>
        toggleFavoriteSongId(current, songId),
      );
    },
    [updateSongDiscoveryState],
  );

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
      try {
        const result = await savePickAssistantSnapshotSafely(
          localStorage,
          storageKey,
          expected,
          next,
          PICK_ASSISTANT_STORAGE_OPTIONS,
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
      }
    },
    [
      pickAssistantStorageIssue,
      setCurrentPickAssistantSnapshot,
      storageKeys.assistant,
    ],
  );

  const handleToggleCandidate = useCallback(
    (song: Song) => {
      if (pickedSongIds.has(song.id) || pickAssistantStorageIssue) return;
      const alreadyCandidate = candidateSongIds.has(song.id);
      if (
        !alreadyCandidate &&
        assistantShortlistIds.length >= PICK_ASSISTANT_CONFIG.maximumCandidates
      ) {
        window.alert(
          t("assistant.maxReached", {
            count: PICK_ASSISTANT_CONFIG.maximumCandidates,
          }),
        );
        return;
      }
      const nextShortlistIds = alreadyCandidate
        ? assistantShortlistIds.filter((songId) => songId !== song.id)
        : [...assistantShortlistIds, song.id];
      void commitPickAssistantUpdate(nextShortlistIds, null);
    },
    [
      assistantShortlistIds,
      candidateSongIds,
      commitPickAssistantUpdate,
      pickedSongIds,
      pickAssistantStorageIssue,
      t,
    ],
  );

  const removePickedSongFromAssistant = useCallback(
    (songId: string) => {
      if (!candidateSongIds.has(songId) || pickAssistantStorageIssue) return;
      void commitPickAssistantUpdate(
        assistantShortlistIds.filter((candidateId) => candidateId !== songId),
        null,
      );
    },
    [
      assistantShortlistIds,
      candidateSongIds,
      commitPickAssistantUpdate,
      pickAssistantStorageIssue,
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
      PICK_ASSISTANT_STORAGE_OPTIONS,
    );
    if (!isWritableStorageStatus(latestBoard.status)) {
      setBoardStorageWritable(false);
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
      storedPicksRef.current = latestBoard.picks;
      dispatchBoardHistory({ type: "reset", picks: latestBoard.picks });
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
      PICK_ASSISTANT_STORAGE_OPTIONS,
    );
    if (!isWritableStorageStatus(confirmedBoard.status)) {
      setBoardStorageWritable(false);
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
      storedPicksRef.current = confirmedBoard.picks;
      dispatchBoardHistory({ type: "reset", picks: confirmedBoard.picks });
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
      removePickedSongFromAssistant(song.id);
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
      removePickedSongFromAssistant(song.id);
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
    removePickedSongFromAssistant(pendingReplacementSong.id);
    setPendingReplacementSong(null);
  };

  const handleClearSlot = (slotId: PickSlotId, event: MouseEvent) => {
    event.stopPropagation();
    const newPicks = { ...storedPicksRef.current };
    delete newPicks[slotId];
    commitUserMutation("clear", newPicks);
  };

  const handleClearAllPicks = () => {
    if (window.confirm(t("errors.clearAllConfirm"))) {
      commitUserMutation("clear", {});
    }
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
    [effectiveContextId, experience],
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
        baselinePicks: targetBoard.picks,
      });
      setBoardShareDialog((current) =>
        current?.kind === "import"
          ? { ...current, changes, previewRefreshed: true }
          : current,
      );
      return;
    }
    const importResult = importStoredBoard({
      storage: localStorage,
      versionedKey: targetStorageKeys.picksV2,
      picks: resolved.picks,
      context:
        targetStorageKeys.context && resolved.contextId
          ? { key: targetStorageKeys.context, value: resolved.contextId }
          : undefined,
    });
    if (!importResult.ok) {
      console.error("Failed to import shared board", importResult);
      window.alert(t("boardShare.importFailed"));
      return;
    }

    cancelStalePreview();
    setContextId(resolved.contextId);
    setBoardStorageWritable(true);
    storedPicksRef.current = resolved.picks;
    dispatchBoardHistory({ type: "reset", picks: resolved.picks });
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
      if (activeFrameRequestIdRef.current) {
        if (activeFrameRequestIdRef.current !== request.requestId) {
          postResult(
            createExportRenderResult(
              request.requestId,
              undefined,
              "Export frame is already rendering",
            ),
          );
        }
        return;
      }

      if (request.experienceId !== experience.id) {
        postResult(
          createExportRenderResult(
            request.requestId,
            undefined,
            "Export experience does not match the current route",
          ),
        );
        return;
      }

      if (request.pageUrl !== pageUrl) {
        postResult(
          createExportRenderResult(
            request.requestId,
            undefined,
            "Export page URL does not match the current route",
          ),
        );
        return;
      }

      if (
        request.contextId !== undefined &&
        !contextOptions.some((context) => context.id === request.contextId)
      ) {
        postResult(
          createExportRenderResult(
            request.requestId,
            undefined,
            "Export context does not match the current experience",
          ),
        );
        return;
      }

      const nextContextId =
        request.contextId !== undefined ? request.contextId : defaultContextId;
      const nextPicks = filterStoredPicksForExperience({
        experience,
        storedPicks: request.picks,
        contextId: nextContextId,
      });
      activeFrameRequestIdRef.current = request.requestId;
      setContextId(nextContextId);
      storedPicksRef.current = nextPicks;
      dispatchBoardHistory({ type: "reset", picks: nextPicks });
      setNicknameDraft(request.selectedBy.slice(0, MAX_NICKNAME_LENGTH));
      setShowTitles(request.showTitles);
      setTransparentBg(request.transparentBg);
      setShowQrCode(request.showQrCode);
      setTemplateId(request.templateId);
      setSizePresetId(request.sizePresetId);
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
    isExportRealm,
    pageUrl,
  ]);

  const captureExportCanvas = useCallback(async () => {
    const originalGetComputedStyle = window.getComputedStyle;
    try {
      window.getComputedStyle = ((element, pseudoElement) => {
        const styleDecl = originalGetComputedStyle.call(
          window,
          element,
          pseudoElement,
        );
        return new Proxy(styleDecl, {
          get(target, prop) {
            if (prop === "getPropertyValue") {
              return (propertyName: string) =>
                convertColorString(target.getPropertyValue(propertyName));
            }
            const value = Reflect.get(target, prop) as unknown;
            if (typeof value === "function") {
              return value.bind(target);
            }
            if (typeof value === "string") {
              return convertColorString(value);
            }
            return value;
          },
        });
      }) as typeof window.getComputedStyle;

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
      const sizePreset = getExportSizePreset(sizePresetId);
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
      if (frameCaptureRequest?.cardType === "poster") {
        centerExportYearInk(canvas, exportElement);
      }
      return canvas.toDataURL("image/png");
    } finally {
      window.getComputedStyle = originalGetComputedStyle;
    }
  }, [
    exportCanvasId,
    frameCaptureRequest?.cardType,
    sizePresetId,
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

  const handleGenerateImage = useCallback(
    async (cardType: ExportCardType, opener: PreviewSnapshot["opener"]) => {
      if (generatingRef.current) return;
      const fallbackCardType = preview?.cardType ?? "poster";
      if (!boardStorageWritable || !optionsStorageWritable) {
        setRequestedCardType(fallbackCardType);
        setBoardStatusMessage(t("boardLibrary.error.storage"));
        return;
      }

      const filteredPicks = filterStoredPicksForExperience({
        experience,
        storedPicks,
        contextId: effectiveContextId,
      });
      if (Object.keys(filteredPicks).length === 0) {
        setRequestedCardType(fallbackCardType);
        return;
      }
      if (!sameStoredPicks(filteredPicks, storedPicks)) {
        if (!resetBoardWithoutHistory(filteredPicks)) {
          setRequestedCardType(fallbackCardType);
          window.alert(t("boardLibrary.error.storage"));
          return;
        }
      }

      const effectiveShowTitles = cardType === "poster" ? showTitles : false;
      const effectiveTransparentBg =
        cardType === "poster" ? transparentBg : false;
      const effectiveTemplateId =
        cardType === "poster" ? templateId : DEFAULT_EXPORT_OPTIONS.templateId;
      const generationId = ++previewGenerationIdRef.current;
      const optionsKey = getPreviewOptionsKey(
        cardType,
        effectiveShowTitles,
        effectiveTransparentBg,
        showQrCode,
        effectiveTemplateId,
        sizePresetId,
      );
      const nextImageFileName =
        cardType === "poster"
          ? posterImageFileName
          : getExperienceImageFileName(
              experience,
              activeContext,
              effectiveTemplateId,
              sizePresetId,
              cardType,
            );
      const captureController = new AbortController();
      activePreviewCaptureAbortRef.current = captureController;
      generatingRef.current = true;
      setRequestedCardType(cardType);
      setGenerating(true);

      try {
        const dataUrl = await captureExportImageInFrame(
          {
            experienceId: experience.id,
            contextId: effectiveContextId,
            picks: filteredPicks,
            cardType,
            showTitles: effectiveShowTitles,
            transparentBg: effectiveTransparentBg,
            showQrCode,
            templateId: effectiveTemplateId,
            sizePresetId,
            selectedBy: exportNickname,
            pageUrl,
          },
          { signal: captureController.signal },
        );
        if (generationId === previewGenerationIdRef.current) {
          setPreview({
            dataUrl,
            cardType,
            optionsKey,
            imageFileName: nextImageFileName,
            opener,
            pageUrl,
            previewLabel,
            shareText: uiCopy.shareText,
            shareHashtags: experience.share.hashtags.slice(),
            shareTitle: uiCopy.title,
          });
          if (cardType === "insights") {
            setBoardStatusMessage(t("insights.cardReady"));
          }
        }
      } catch (error) {
        if (!isAbortError(error)) {
          console.error("Failed to generate image", error);
          if (generationId === previewGenerationIdRef.current) {
            setRequestedCardType(fallbackCardType);
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
      activeContext,
      boardStorageWritable,
      effectiveContextId,
      experience,
      exportNickname,
      optionsStorageWritable,
      pageUrl,
      posterImageFileName,
      preview,
      previewLabel,
      resetBoardWithoutHistory,
      showTitles,
      showQrCode,
      sizePresetId,
      storedPicks,
      t,
      templateId,
      transparentBg,
      uiCopy.shareText,
      uiCopy.title,
    ],
  );

  const previewOptionsKey = getPreviewOptionsKey(
    requestedCardType,
    showTitles,
    transparentBg,
    showQrCode,
    templateId,
    sizePresetId,
  );

  useEffect(() => {
    if (!preview || preview.optionsKey === previewOptionsKey) {
      return;
    }
    const timer = window.setTimeout(() => {
      void handleGenerateImage(requestedCardType, preview.opener);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [handleGenerateImage, preview, previewOptionsKey, requestedCardType]);

  const handleClosePreview = () => {
    previewGenerationIdRef.current += 1;
    activePreviewCaptureAbortRef.current?.abort();
    activePreviewCaptureAbortRef.current = null;
    setPreview(null);
    setRequestedCardType("poster");
  };

  const handlePreviewCardTypeChange = (cardType: ExportCardType) => {
    if (!preview || generating || cardType === requestedCardType) return;
    setRequestedCardType(cardType);
    void handleGenerateImage(cardType, preview.opener);
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
        setSizePresetId(result.options.sizePresetId);
        setBoardStatusMessage("");
      } catch {
        setOptionsStorageWritable(false);
        setBoardStatusMessage(t("boardLibrary.error.storage"));
      }
    },
    [optionsStorageWritable, storageKeys.options, storageKeys.optionsV2, t],
  );

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
    void updateExportOptions((current) => ({
      ...current,
      templateId: value,
    }));
  };

  const handleSizePresetChange = (value: ExportSizePresetId) => {
    void updateExportOptions((current) => ({
      ...current,
      sizePresetId: value,
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
        />

        <ExperienceNavigation activeExperienceId={experience.id} />

        <Controls
          onClearAll={handleClearAllPicks}
          onGenerate={() => {
            void handleGenerateImage("poster", "poster");
          }}
          onGlobalSearch={handleGlobalSearchClick}
          onOpenPickAssistant={() => {
            if (!hydrated || isExportRealm) return;
            setShowBoardLibrary(false);
            setShowModal(false);
            setDetailSongId(null);
            setPendingReplacementSong(null);
            setShowPickAssistant(true);
          }}
          onUndo={() => applyHistoryAction("undo")}
          onRedo={() => applyHistoryAction("redo")}
          onOpenBoardLibrary={() => {
            if (hydrated && !isExportRealm) setShowBoardLibrary(true);
          }}
          onCopyBoardLink={handleCopyBoardLink}
          nickname={nicknameDraft}
          nicknameMaxLength={MAX_NICKNAME_LENGTH}
          onNicknameChange={handleNicknameChange}
          generating={generating}
          hasPicks={Object.keys(picks).length > 0}
          canUndo={boardHistory.past.length > 0}
          canRedo={boardHistory.future.length > 0}
          savedBoardCount={scopedSnapshots.length}
          totalSongs={eligibleSongsCount}
          selectedCount={Object.keys(picks).length}
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
            <p className="text-[11px] font-medium leading-relaxed text-slate-500">
              {uiCopy.hint}
            </p>
          ) : null}
        </Controls>

        <main className="app-content-shell flex flex-1 flex-col px-4 sm:px-6 md:px-8">
          <div className="mb-4">
            <button
              type="button"
              aria-expanded={showInsights}
              aria-controls={showInsights ? "pick-insights-panel" : undefined}
              onClick={() => setShowInsights((open) => !open)}
              className="official-button official-button-quiet"
            >
              {showInsights ? t("insights.close") : t("insights.open")}
            </button>
            {showInsights ? (
              <div className="mt-3">
                <PickInsightsPanel
                  insights={insights}
                  membersById={MEMBERS_BY_ID}
                  slotCount={slots.length}
                  onGenerateInsights={() => {
                    void handleGenerateImage("insights", "insights");
                  }}
                  generating={generating}
                  generateButtonRef={insightsTriggerRef}
                />
              </div>
            ) : null}
          </div>
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
        </main>

        <Footer />

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
              favoriteSongIds={songDiscoveryState.favoriteSongIds}
              recentSongIds={songDiscoveryState.recentSongIds}
              candidateSongIds={candidateSongIds}
              candidateLimitReached={
                assistantShortlistIds.length >=
                PICK_ASSISTANT_CONFIG.maximumCandidates
              }
              suspended={detailLayerActive}
              resumeFocusRef={detailTriggerRef}
              presenceState={presenceState}
              returnFocusKey={searchPresentation.returnFocusKey}
              onClose={() => {
                setShowModal(false);
                setDetailSongId(null);
                detailTriggerRef.current = null;
                setActiveSlotId(null);
              }}
              onSelect={handleSelectSong}
              onToggleFavorite={handleToggleFavorite}
              onToggleCandidate={handleToggleCandidate}
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
              isFavorite={songDiscoveryState.favoriteSongIds.includes(song.id)}
              isRecentlyViewed={songDiscoveryState.recentSongIds.includes(
                song.id,
              )}
              isCandidate={candidateSongIds.has(song.id)}
              candidateDisabled={
                pickedSongIds.has(song.id) ||
                (!candidateSongIds.has(song.id) &&
                  assistantShortlistIds.length >=
                    PICK_ASSISTANT_CONFIG.maximumCandidates) ||
                Boolean(pickAssistantStorageIssue)
              }
              presenceState={presenceState}
              onClose={() => setDetailSongId(null)}
              onSelect={handleSelectSongFromDetail}
              onToggleFavorite={handleToggleFavorite}
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
              onClose={handleCloseBoardShareDialog}
              onConfirm={handleConfirmBoardShareImport}
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
              minimumCandidates={PICK_ASSISTANT_CONFIG.minimumCandidates}
              maximumCandidates={PICK_ASSISTANT_CONFIG.maximumCandidates}
              storageIssue={assistant.storageIssue}
              reviewNotice={assistantReviewNotice}
              presenceState={presenceState}
              returnFocusKey={DIALOG_RETURN_KEYS.pickAssistant}
              onClose={() => setShowPickAssistant(false)}
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
              templateId={templateId}
              onTemplateChange={handleTemplateChange}
              sizePresetId={sizePresetId}
              onSizePresetChange={handleSizePresetChange}
              actualCardType={renderedPreview.cardType}
              requestedCardType={requestedCardType}
              onCardTypeChange={handlePreviewCardTypeChange}
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
                renderedPreview.opener === "insights"
                  ? insightsTriggerRef
                  : previewTriggerRef
              }
              returnFocusKey={
                renderedPreview.opener === "insights"
                  ? DIALOG_RETURN_KEYS.insights
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
          {frameCaptureRequest?.cardType === "insights" ? (
            <InsightsExportBoard
              exportCanvasId={exportCanvasId}
              picks={picks}
              selectedBy={exportNickname}
              pageUrl={framePageUrl ?? pageUrl}
              sizePresetId={sizePresetId}
              showQrCode={showQrCode}
            />
          ) : (
            <ExportBoard
              experience={experience}
              context={activeContext}
              exportCanvasId={exportCanvasId}
              slots={slots}
              picks={picks}
              showTitles={showTitles}
              transparentBg={transparentBg}
              showQrCode={showQrCode}
              templateId={templateId}
              sizePresetId={sizePresetId}
              selectedBy={exportNickname}
              pageUrl={framePageUrl ?? pageUrl}
            />
          )}
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

function ContextSelector({
  contexts,
  activeContextId,
  onChange,
}: {
  contexts: ExperienceContext[];
  activeContextId?: string;
  onChange: (contextId: string) => void;
}) {
  const { t } = useLocale();

  return (
    <div className="grid gap-2">
      <div className="text-xs font-semibold text-[var(--muted)]">
        {t("context.selectorLabel")}
      </div>
      <div className="inline-flex w-fit max-w-full flex-wrap rounded-[var(--radius-sm)] bg-[var(--background)] p-1">
        {contexts.map((context) => (
          <button
            key={context.id}
            type="button"
            onClick={() => onChange(context.id)}
            aria-pressed={activeContextId === context.id}
            className={`min-h-9 rounded-[9px] border px-3 py-2 text-[13px] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] ${
              activeContextId === context.id
                ? "border-[var(--line)] bg-white text-[var(--foreground)] shadow-sm"
                : "border-transparent bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {context.label}
            {context.shortDateLabel ? ` · ${context.shortDateLabel}` : ""}
          </button>
        ))}
      </div>
    </div>
  );
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
    Array.from(exportElement.querySelectorAll("img")).map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          const finish = () => {
            image.removeEventListener("load", finish);
            image.removeEventListener("error", finish);
            resolve();
          };
          image.addEventListener("load", finish);
          image.addEventListener("error", finish);
          if (image.complete) finish();
        });
      }

      if (typeof image.decode === "function") {
        await image.decode().catch(() => undefined);
      }
    }),
  );
}
