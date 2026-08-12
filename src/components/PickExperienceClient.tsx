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
import {
  EXPORT_CONFIG,
  PROJECT_CONFIG,
  PROJECT_ID,
  PROJECT_THEME_COLOR,
  SONG_DISCOVERY_CONFIG,
  STORAGE_KEYS,
} from "../config/project";
import {
  MEMBERS,
  RELEASE_TYPES,
  RELEASE_YEARS,
  SONGS_BY_ID,
  TRACK_TYPES,
} from "../data/songs";
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
  type ExperienceContext,
} from "../data/pickExperiences";
import { localizeExperienceUi } from "../i18n/content";
import { useLocale } from "../i18n/LocaleProvider";
import type { PickExperience } from "../schema/pick-experience";
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
  loadBoardLibrary,
  loadStoredBoard,
  loadStoredOptions,
  renameBoardSnapshot,
  saveBoardLibrary,
  saveStoredBoard,
  saveStoredOptions,
  type BoardLibraryDocument,
  type BoardScope,
  type BoardSnapshot,
  type StorageLoadStatus,
} from "../utils/boardStorage";
import { centerExportYearInk } from "../utils/centerExportYearInk";
import { convertColorString } from "../utils/colors";
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
import {
  createEmptySongDiscoveryState,
  loadSongDiscoveryState,
  recordRecentSongId,
  saveSongDiscoveryState,
  toggleFavoriteSongId,
  type SongDiscoveryState,
} from "../utils/songDiscoveryStorage";
import {
  DIALOG_RETURN_KEYS,
  getPickSlotReturnKey,
} from "../utils/useDialogA11y";
import AppTopBar from "./AppTopBar";
import AppleMotion from "./AppleMotion";
import BoardLibraryModal, {
  type BoardLibraryActionResult,
} from "./BoardLibraryModal";
import Controls from "./Controls";
import ExperienceNavigation from "./ExperienceNavigation";
import ExportBoard from "./ExportBoard";
import Footer from "./Footer";
import Header from "./Header";
import JapaneseContent, {
  LocalizedTextWithJapaneseValue,
} from "./JapaneseContent";
import MotionPresence from "./MotionPresence";
import PickBoard from "./PickBoard";
import PreviewModal from "./PreviewModal";
import ReplacementModal from "./ReplacementModal";
import SearchModal from "./SearchModal";
import SongDetailModal from "./SongDetailModal";

interface PickExperienceClientProps {
  experience: PickExperience;
}

const MAX_NICKNAME_LENGTH = 32;

const getPreviewOptionsKey = (showTitles: boolean, transparentBg: boolean) =>
  `${showTitles ? "titles" : "no-titles"}:${transparentBg ? "transparent" : "opaque"}`;

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showTitles, setShowTitles] = useState(true);
  const [transparentBg, setTransparentBg] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [frameCaptureRequest, setFrameCaptureRequest] =
    useState<ExportRenderRequest | null>(null);
  const [framePageUrl, setFramePageUrl] = useState<string | null>(null);
  const [isExportRealm, setIsExportRealm] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [boardLibrary, setBoardLibrary] = useState<BoardLibraryDocument>(() =>
    createEmptyBoardLibrary(),
  );
  const [boardLibraryStatus, setBoardLibraryStatus] =
    useState<StorageLoadStatus>("empty");
  const [boardLibraryLoaded, setBoardLibraryLoaded] = useState(false);
  const [boardStatusMessage, setBoardStatusMessage] = useState("");
  const generatingRef = useRef(false);
  const activeFrameRequestIdRef = useRef<string | null>(null);
  const capturedFrameRequestIdRef = useRef<string | null>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const searchReturnFocusKeyRef = useRef<string>(
    DIALOG_RETURN_KEYS.globalSearch,
  );
  const detailTriggerRef = useRef<HTMLElement>(null);
  const previewGenerationIdRef = useRef(0);
  const activePreviewCaptureAbortRef = useRef<AbortController | null>(null);
  const lastGeneratedPreviewOptionsRef = useRef<string | null>(null);

  const picks = useMemo<Picks>(() => {
    const entries = Object.entries(storedPicks)
      .map(([slotId, songId]) => [slotId, SONGS_BY_ID[songId]] as const)
      .filter((entry): entry is readonly [string, Song] => Boolean(entry[1]));

    return Object.fromEntries(entries);
  }, [storedPicks]);
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
  const previewLabel = isStandard
    ? t("context.standardPreview", { group: PROJECT_CONFIG.groupName })
    : activeUiContextDescription
      ? t("context.livePreview", {
          title: uiCopy.title,
          context: activeUiContextDescription,
        })
      : uiCopy.title;
  const imageFileName = getExperienceImageFileName(experience, activeContext);
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
      dispatchBoardHistory({ type: "reset", picks: boardResult.picks });

      const optionsResult = loadStoredOptions({
        storage: localStorage,
        versionedKey: initialStorageKeys.optionsV2,
        legacyKey: initialStorageKeys.options,
      });
      if (optionsResult.options) {
        setShowTitles(optionsResult.options.showTitles);
        setTransparentBg(optionsResult.options.transparentBg);
      }

      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [contextOptions, defaultContextId, experience]);

  useEffect(() => {
    if (!hydrated || isExportRealm) return;
    const result = loadBoardLibrary(
      localStorage,
      storageKeys.boardLibrary,
      PROJECT_ID,
    );
    setBoardLibrary(result.document);
    setBoardLibraryStatus(result.status);
    setBoardLibraryLoaded(true);
  }, [hydrated, isExportRealm, storageKeys.boardLibrary]);

  useEffect(() => {
    if (!hydrated || isExportRealm) return;
    setSongDiscoveryState(
      loadSongDiscoveryState(
        STORAGE_KEYS.songDiscovery,
        new Set(Object.keys(SONGS_BY_ID)),
      ),
    );
  }, [hydrated, isExportRealm]);

  useEffect(
    () => () => {
      activePreviewCaptureAbortRef.current?.abort();
      activePreviewCaptureAbortRef.current = null;
    },
    [],
  );

  const cancelStalePreview = useCallback(() => {
    previewGenerationIdRef.current += 1;
    activePreviewCaptureAbortRef.current?.abort();
    activePreviewCaptureAbortRef.current = null;
    setPreviewUrl(null);
  }, []);

  const resetBoardWithoutHistory = useCallback(
    (newPicks: StoredPicks, storageKey = storageKeys.picksV2) => {
      const filteredPicks = sanitizeBoardPicks(newPicks);
      if (!saveStoredBoard(localStorage, storageKey, filteredPicks)) {
        return false;
      }
      dispatchBoardHistory({ type: "reset", picks: filteredPicks });
      return true;
    },
    [sanitizeBoardPicks, storageKeys.picksV2],
  );

  const commitUserMutation = useCallback(
    (kind: BoardMutationKind, newPicks: StoredPicks) => {
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
      dispatchBoardHistory(action);
      return true;
    },
    [
      boardHistory,
      cancelStalePreview,
      sanitizeBoardPicks,
      storageKeys.picksV2,
      t,
    ],
  );

  const applyHistoryAction = useCallback(
    (type: "undo" | "redo") => {
      const action = { type } as const;
      const nextHistory = boardHistoryReducer(boardHistory, action);
      if (nextHistory === boardHistory) return;
      const filteredPicks = sanitizeBoardPicks(nextHistory.present);
      if (!saveStoredBoard(localStorage, storageKeys.picksV2, filteredPicks)) {
        window.alert(t("boardLibrary.error.storage"));
        return;
      }
      cancelStalePreview();
      dispatchBoardHistory(action);
      setBoardStatusMessage(
        t(type === "undo" ? "history.undoDone" : "history.redoDone"),
      );
    },
    [
      boardHistory,
      cancelStalePreview,
      sanitizeBoardPicks,
      storageKeys.picksV2,
      t,
    ],
  );

  const handleContextChange = (nextContextId: string) => {
    previewGenerationIdRef.current += 1;
    activePreviewCaptureAbortRef.current?.abort();
    activePreviewCaptureAbortRef.current = null;
    const nextStorageKeys = getStorageKeysForExperience(
      experience,
      nextContextId,
    );
    setContextId(nextContextId);
    setActiveSlotId(null);
    setShowModal(false);
    setShowBoardLibrary(false);
    setDetailSongId(null);
    setPendingReplacementSong(null);
    setPreviewUrl(null);

    if (nextStorageKeys.context) {
      try {
        localStorage.setItem(nextStorageKeys.context, nextContextId);
      } catch {
        // Context still changes in memory when storage is unavailable.
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
    dispatchBoardHistory({ type: "reset", picks: boardResult.picks });
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
      setSongDiscoveryState((current) => {
        const next = update(current);
        saveSongDiscoveryState(STORAGE_KEYS.songDiscovery, next);
        return next;
      });
    },
    [],
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

  const handleSelectSong = (song: Song) => {
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
          ...storedPicks,
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
      storedPicks,
      songId: song.id,
      contextId: effectiveContextId,
    });
    if (emptySlotId) {
      if (
        !commitUserMutation("pick", {
          ...storedPicks,
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

    if (
      !commitUserMutation("replace", {
        ...storedPicks,
        [slotId]: pendingReplacementSong.id,
      })
    ) {
      return;
    }
    setPendingReplacementSong(null);
  };

  const handleClearSlot = (slotId: PickSlotId, event: MouseEvent) => {
    event.stopPropagation();
    const newPicks = { ...storedPicks };
    delete newPicks[slotId];
    commitUserMutation("clear", newPicks);
  };

  const handleClearAllPicks = () => {
    if (window.confirm(t("errors.clearAllConfirm"))) {
      commitUserMutation("clear", {});
    }
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
      if (Object.keys(nextPicks).length === 0) {
        postResult(
          createExportRenderResult(
            request.requestId,
            undefined,
            "Export request does not contain any eligible picks",
          ),
        );
        return;
      }

      activeFrameRequestIdRef.current = request.requestId;
      setContextId(nextContextId);
      dispatchBoardHistory({ type: "reset", picks: nextPicks });
      setNicknameDraft(request.selectedBy.slice(0, MAX_NICKNAME_LENGTH));
      setShowTitles(request.showTitles);
      setTransparentBg(request.transparentBg);
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
  }, [contextOptions, defaultContextId, experience, hydrated, isExportRealm]);

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
      const canvas = await html2canvas(exportElement, {
        useCORS: true,
        backgroundColor: transparentBg ? null : EXPORT_CONFIG.background,
        scale: EXPORT_CONFIG.scale,
        logging: false,
      });
      centerExportYearInk(canvas, exportElement);
      return canvas.toDataURL("image/png");
    } finally {
      window.getComputedStyle = originalGetComputedStyle;
    }
  }, [exportCanvasId, transparentBg]);

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

  const handleGenerateImage = useCallback(async () => {
    if (generatingRef.current) return;

    const filteredPicks = filterStoredPicksForExperience({
      experience,
      storedPicks,
      contextId: effectiveContextId,
    });
    if (Object.keys(filteredPicks).length === 0) {
      window.alert(t("errors.selectSongFirst"));
      return;
    }
    if (!sameStoredPicks(filteredPicks, storedPicks)) {
      if (!resetBoardWithoutHistory(filteredPicks)) {
        window.alert(t("boardLibrary.error.storage"));
        return;
      }
    }

    const generationId = ++previewGenerationIdRef.current;
    const previewOptionsKey = getPreviewOptionsKey(showTitles, transparentBg);
    const captureController = new AbortController();
    activePreviewCaptureAbortRef.current = captureController;
    generatingRef.current = true;
    setGenerating(true);

    try {
      const dataUrl = await captureExportImageInFrame(
        {
          experienceId: experience.id,
          contextId: effectiveContextId,
          picks: filteredPicks,
          showTitles,
          transparentBg,
          selectedBy: exportNickname,
          pageUrl,
        },
        { signal: captureController.signal },
      );
      if (generationId === previewGenerationIdRef.current) {
        lastGeneratedPreviewOptionsRef.current = previewOptionsKey;
        setPreviewUrl(dataUrl);
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
  }, [
    effectiveContextId,
    experience,
    exportNickname,
    pageUrl,
    resetBoardWithoutHistory,
    showTitles,
    storedPicks,
    t,
    transparentBg,
  ]);

  const previewOptionsKey = getPreviewOptionsKey(showTitles, transparentBg);

  useEffect(() => {
    if (
      !previewUrl ||
      lastGeneratedPreviewOptionsRef.current === previewOptionsKey
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      void handleGenerateImage();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [handleGenerateImage, previewOptionsKey, previewUrl]);

  const handleClosePreview = () => {
    previewGenerationIdRef.current += 1;
    activePreviewCaptureAbortRef.current?.abort();
    activePreviewCaptureAbortRef.current = null;
    setPreviewUrl(null);
  };

  const handleShowTitlesChange = (value: boolean) => {
    setShowTitles(value);
    if (
      !saveStoredOptions(localStorage, storageKeys.optionsV2, {
        showTitles: value,
        transparentBg,
      })
    ) {
      setBoardStatusMessage(t("boardLibrary.error.storage"));
    }
  };

  const handleTransparentBackgroundChange = (value: boolean) => {
    setTransparentBg(value);
    if (
      !saveStoredOptions(localStorage, storageKeys.optionsV2, {
        showTitles,
        transparentBg: value,
      })
    ) {
      setBoardStatusMessage(t("boardLibrary.error.storage"));
    }
  };

  const handleSaveBoard = (name: string): BoardLibraryActionResult => {
    if (!boardLibraryWritable) return { ok: false, error: "storage" };
    const result = addBoardSnapshot(boardLibrary, {
      id: window.crypto.randomUUID(),
      name,
      now: new Date().toISOString(),
      scope: boardScope,
      picks: sanitizeBoardPicks(storedPicks),
    });
    if (!result.ok) return result;
    if (
      !saveBoardLibrary(localStorage, storageKeys.boardLibrary, result.document)
    ) {
      return { ok: false, error: "storage" };
    }
    setBoardLibrary(result.document);
    setBoardLibraryStatus("loaded");
    return { ok: true, name: result.snapshot.name };
  };

  const handleRenameBoard = (
    snapshotId: string,
    name: string,
  ): BoardLibraryActionResult => {
    if (!boardLibraryWritable) return { ok: false, error: "storage" };
    const result = renameBoardSnapshot(boardLibrary, {
      snapshotId,
      name,
      now: new Date().toISOString(),
    });
    if (!result.ok) return result;
    if (
      !saveBoardLibrary(localStorage, storageKeys.boardLibrary, result.document)
    ) {
      return { ok: false, error: "storage" };
    }
    setBoardLibrary(result.document);
    return { ok: true, name: result.snapshot.name };
  };

  const handleDeleteBoard = (snapshotId: string): BoardLibraryActionResult => {
    if (!boardLibraryWritable) return { ok: false, error: "storage" };
    const result = deleteBoardSnapshot(boardLibrary, snapshotId);
    if (!result.ok) return result;
    if (
      !saveBoardLibrary(localStorage, storageKeys.boardLibrary, result.document)
    ) {
      return { ok: false, error: "storage" };
    }
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
          onGenerate={handleGenerateImage}
          onGlobalSearch={handleGlobalSearchClick}
          onUndo={() => applyHistoryAction("undo")}
          onRedo={() => applyHistoryAction("redo")}
          onOpenBoardLibrary={() => {
            if (hydrated && !isExportRealm) setShowBoardLibrary(true);
          }}
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
          slotCount={slots.length}
          metricLabel={
            isStandard ? t("controls.songs") : t("controls.eligibleSongs")
          }
          generateButtonRef={previewTriggerRef}
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
          <PickBoard
            slots={uiSlots}
            picks={picks}
            layout={isStandard ? "top10-grid" : "live-memory-grid"}
            showSlotMetadata={!isStandard}
            onSlotClick={handleSlotClick}
            onClearSlot={handleClearSlot}
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
              emptyMessage={t("search.noEligibleMatches")}
              selectedRanksBySongId={selectedRanksBySongId}
              favoriteSongIds={songDiscoveryState.favoriteSongIds}
              recentSongIds={songDiscoveryState.recentSongIds}
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
              presenceState={presenceState}
              onClose={() => setDetailSongId(null)}
              onSelect={handleSelectSongFromDetail}
              onToggleFavorite={handleToggleFavorite}
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

        <MotionPresence value={previewUrl}>
          {(renderedPreviewUrl, presenceState) => (
            <PreviewModal
              previewUrl={renderedPreviewUrl}
              onClose={handleClosePreview}
              showTitles={showTitles}
              onToggleShowTitles={handleShowTitlesChange}
              transparentBg={transparentBg}
              onToggleTransparentBg={handleTransparentBackgroundChange}
              generating={generating}
              pageUrl={pageUrl}
              previewLabel={previewLabel}
              imageFileName={imageFileName}
              shareText={uiCopy.shareText}
              shareHashtags={experience.share.hashtags}
              shareTitle={uiCopy.title}
              presenceState={presenceState}
              returnFocusRef={previewTriggerRef}
              returnFocusKey={DIALOG_RETURN_KEYS.generateImage}
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
            selectedBy={exportNickname}
            pageUrl={framePageUrl ?? pageUrl}
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

function normalizeNickname(nickname: string) {
  return nickname.trim().replace(/\s+/g, " ").slice(0, MAX_NICKNAME_LENGTH);
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
