"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  EXPORT_CONFIG,
  PROJECT_CONFIG,
  PROJECT_THEME_COLOR,
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
  getExperiencePreviewLabel,
  getReplacementSlotStates,
  getSongBadgesBySongId,
  getSortedExperienceSlots,
  getStorageKeysForExperience,
  isSongEligibleForSlot,
  parseStoredPicksForExperience,
  type ExperienceContext,
} from "../data/pickExperiences";
import type { PickExperience } from "../schema/pick-experience";
import type { PickSlotId, Picks, Song, StoredPicks } from "../schema/music";
import { centerExportYearInk } from "../utils/centerExportYearInk";
import { convertColorString } from "../utils/colors";
import { getMemberColorGradient } from "../utils/memberColors";
import {
  DIALOG_RETURN_KEYS,
  getPickSlotReturnKey,
} from "../utils/useDialogA11y";
import AppTopBar from "./AppTopBar";
import AppleMotion from "./AppleMotion";
import Controls from "./Controls";
import ExperienceNavigation from "./ExperienceNavigation";
import ExportBoard from "./ExportBoard";
import Footer from "./Footer";
import Header from "./Header";
import MotionPresence from "./MotionPresence";
import PickBoard from "./PickBoard";
import PreviewModal from "./PreviewModal";
import ReplacementModal from "./ReplacementModal";
import SearchModal from "./SearchModal";

interface PickExperienceClientProps {
  experience: PickExperience;
}

const MAX_NICKNAME_LENGTH = 32;

const getPreviewOptionsKey = (showTitles: boolean, transparentBg: boolean) =>
  `${showTitles ? "titles" : "no-titles"}:${transparentBg ? "transparent" : "opaque"}`;

export default function PickExperienceClient({
  experience,
}: PickExperienceClientProps) {
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
  const slots = useMemo(
    () => getSortedExperienceSlots(experience),
    [experience],
  );
  const [storedPicks, setStoredPicks] = useState<StoredPicks>({});
  const [activeSlotId, setActiveSlotId] = useState<PickSlotId | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingReplacementSong, setPendingReplacementSong] =
    useState<Song | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showTitles, setShowTitles] = useState(true);
  const [transparentBg, setTransparentBg] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const generatingRef = useRef(false);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const searchReturnFocusKeyRef = useRef<string>(
    DIALOG_RETURN_KEYS.globalSearch,
  );
  const previewGenerationIdRef = useRef(0);
  const lastGeneratedPreviewOptionsRef = useRef<string | null>(null);

  const picks = useMemo<Picks>(() => {
    const entries = Object.entries(storedPicks)
      .map(([slotId, songId]) => [slotId, SONGS_BY_ID[songId]] as const)
      .filter((entry): entry is readonly [string, Song] => Boolean(entry[1]));

    return Object.fromEntries(entries);
  }, [storedPicks]);

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
    () => getSongBadgesBySongId(experience),
    [experience],
  );
  const replacementSlotStates = useMemo(
    () =>
      pendingReplacementSong
        ? getReplacementSlotStates({
            experience,
            songId: pendingReplacementSong.id,
            contextId: effectiveContextId,
          })
        : [],
    [effectiveContextId, experience, pendingReplacementSong],
  );
  const previewLabel = getExperiencePreviewLabel(experience, activeContext);
  const imageFileName = getExperienceImageFileName(experience, activeContext);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let initialContextId = defaultContextId;
      const defaultStorageKeys = getStorageKeysForExperience(
        experience,
        defaultContextId,
      );

      if (defaultStorageKeys.context) {
        const savedContextId = localStorage.getItem(defaultStorageKeys.context);
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
      setStoredPicks(
        loadStoredPicks(experience, initialStorageKeys.picks, initialContextId),
      );

      const savedOptions = localStorage.getItem(initialStorageKeys.options);
      if (savedOptions) {
        try {
          const options = JSON.parse(savedOptions) as {
            showTitles?: unknown;
            transparentBg?: unknown;
          };
          if (typeof options.showTitles === "boolean") {
            setShowTitles(options.showTitles);
          }
          if (typeof options.transparentBg === "boolean") {
            setTransparentBg(options.transparentBg);
          }
        } catch (error) {
          console.error("Failed to parse saved options", error);
        }
      }

      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [contextOptions, defaultContextId, experience]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      storageKeys.options,
      JSON.stringify({ showTitles, transparentBg }),
    );
  }, [hydrated, showTitles, storageKeys.options, transparentBg]);

  const saveStoredPicks = useCallback(
    (newPicks: StoredPicks) => {
      const filteredPicks = filterStoredPicksForExperience({
        experience,
        storedPicks: newPicks,
        contextId: effectiveContextId,
      });

      setStoredPicks(filteredPicks);
      localStorage.setItem(storageKeys.picks, JSON.stringify(filteredPicks));
    },
    [effectiveContextId, experience, storageKeys.picks],
  );

  const handleContextChange = (nextContextId: string) => {
    const nextStorageKeys = getStorageKeysForExperience(
      experience,
      nextContextId,
    );
    setContextId(nextContextId);
    setActiveSlotId(null);
    setShowModal(false);
    setPendingReplacementSong(null);
    setPreviewUrl(null);

    if (nextStorageKeys.context) {
      localStorage.setItem(nextStorageKeys.context, nextContextId);
    }

    setStoredPicks(
      loadStoredPicks(experience, nextStorageKeys.picks, nextContextId),
    );
  };

  const handleSlotClick = (slotId: PickSlotId) => {
    searchReturnFocusKeyRef.current = getPickSlotReturnKey(slotId);
    setActiveSlotId(slotId);
    setShowModal(true);
  };

  const handleGlobalSearchClick = () => {
    searchReturnFocusKeyRef.current = DIALOG_RETURN_KEYS.globalSearch;
    setActiveSlotId(null);
    setShowModal(true);
  };

  const handleNicknameChange = (nickname: string) => {
    setNicknameDraft(nickname.slice(0, MAX_NICKNAME_LENGTH));
  };

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
        window.alert("This song cannot be placed in that slot.");
        return;
      }

      saveStoredPicks({ ...storedPicks, [activeSlotId]: song.id });
      setShowModal(false);
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
      saveStoredPicks({ ...storedPicks, [emptySlotId]: song.id });
      setShowModal(false);
      return;
    }

    setShowModal(false);
    setPendingReplacementSong(song);
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

    saveStoredPicks({ ...storedPicks, [slotId]: pendingReplacementSong.id });
    setPendingReplacementSong(null);
  };

  const handleClearSlot = (slotId: PickSlotId, event: MouseEvent) => {
    event.stopPropagation();
    const newPicks = { ...storedPicks };
    delete newPicks[slotId];
    saveStoredPicks(newPicks);
  };

  const handleClearAllPicks = () => {
    if (window.confirm("Are you sure you want to clear all your picks?")) {
      saveStoredPicks({});
    }
  };

  const handleGenerateImage = useCallback(async () => {
    if (generatingRef.current) return;

    const filteredPicks = filterStoredPicksForExperience({
      experience,
      storedPicks,
      contextId: effectiveContextId,
    });
    if (Object.keys(filteredPicks).length === 0) {
      window.alert("Please select at least one song first.");
      return;
    }
    if (!sameStoredPicks(filteredPicks, storedPicks)) {
      saveStoredPicks(filteredPicks);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    const generationId = ++previewGenerationIdRef.current;
    const previewOptionsKey = getPreviewOptionsKey(showTitles, transparentBg);
    generatingRef.current = true;
    setGenerating(true);

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

      const html2canvas = (await import("html2canvas")).default;
      const exportElement = document.getElementById(exportCanvasId);

      if (exportElement) {
        await document.fonts.ready;
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        const canvas = await html2canvas(exportElement, {
          useCORS: true,
          backgroundColor: transparentBg ? null : EXPORT_CONFIG.background,
          scale: EXPORT_CONFIG.scale,
          logging: false,
        });
        centerExportYearInk(canvas, exportElement);
        if (generationId === previewGenerationIdRef.current) {
          lastGeneratedPreviewOptionsRef.current = previewOptionsKey;
          setPreviewUrl(canvas.toDataURL("image/png"));
        }
      }
    } catch (error) {
      console.error("Failed to generate image", error);
      if (generationId === previewGenerationIdRef.current) {
        window.alert("Failed to generate image. Please try again.");
      }
    } finally {
      window.getComputedStyle = originalGetComputedStyle;
      generatingRef.current = false;
      setGenerating(false);
    }
  }, [
    effectiveContextId,
    experience,
    exportCanvasId,
    saveStoredPicks,
    showTitles,
    storedPicks,
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
    setPreviewUrl(null);
  };

  const isStandard = experience.kind === "standard";
  const headerMeta = [
    experience.eventName,
    activeContext?.exportLabel,
    experience.venue,
  ]
    .filter(Boolean)
    .join(" / ");

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
          titlePrefix={isStandard ? undefined : experience.title}
          titleAccent={isStandard ? undefined : PROJECT_CONFIG.groupName}
          subtitle={isStandard ? undefined : experience.subtitle}
          description={isStandard ? undefined : experience.description}
          meta={isStandard ? undefined : headerMeta}
          showTitle={!isStandard}
        />

        <ExperienceNavigation activeExperienceId={experience.id} />

        <Controls
          onClearAll={handleClearAllPicks}
          onGenerate={handleGenerateImage}
          onGlobalSearch={handleGlobalSearchClick}
          nickname={nicknameDraft}
          nicknameMaxLength={MAX_NICKNAME_LENGTH}
          onNicknameChange={handleNicknameChange}
          generating={generating}
          hasPicks={Object.keys(picks).length > 0}
          totalSongs={eligibleSongsCount}
          selectedCount={Object.keys(picks).length}
          slotCount={slots.length}
          metricLabel={isStandard ? "Songs" : "Eligible Songs"}
          generateButtonRef={previewTriggerRef}
        >
          {contextOptions.length > 0 ? (
            <ContextSelector
              contexts={contextOptions}
              activeContextId={activeContext?.id}
              onChange={handleContextChange}
            />
          ) : null}
          {experience.id === "kokuritsu_2026" ? (
            <p className="text-[11px] font-medium leading-relaxed text-slate-500">
              「帰り道に聴いた曲」は全楽曲から選べます。FREE
              PICKは国立で披露された楽曲から選べます。
            </p>
          ) : null}
        </Controls>

        <main className="app-content-shell flex flex-1 flex-col px-4 sm:px-6 md:px-8">
          <PickBoard
            slots={slots}
            picks={picks}
            layout={isStandard ? "top10-grid" : "live-memory-grid"}
            showSlotMetadata={!isStandard}
            onSlotClick={handleSlotClick}
            onClearSlot={handleClearSlot}
          />
        </main>

        <Footer />

        <MotionPresence
          value={
            showModal
              ? {
                  songs: searchSongs,
                  autoFocusSearch: activeSlotId === null,
                  returnFocusKey: searchReturnFocusKeyRef.current,
                  contextLabel: selectedSlot
                    ? selectedSlot.label
                    : (activeContext?.exportLabel ?? experience.title),
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
              emptyMessage="No songs are eligible for this slot with the current filters."
              presenceState={presenceState}
              returnFocusKey={searchPresentation.returnFocusKey}
              onClose={() => {
                setShowModal(false);
                setActiveSlotId(null);
              }}
              onSelect={handleSelectSong}
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
              slots={slots}
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
              onToggleShowTitles={setShowTitles}
              transparentBg={transparentBg}
              onToggleTransparentBg={setTransparentBg}
              generating={generating}
              pageUrl={pageUrl}
              previewLabel={previewLabel}
              imageFileName={imageFileName}
              shareText={experience.share.text}
              shareHashtags={experience.share.hashtags}
              shareTitle={experience.export.title}
              presenceState={presenceState}
              returnFocusRef={previewTriggerRef}
              returnFocusKey={DIALOG_RETURN_KEYS.generateImage}
              returnFocusFallbackKey={DIALOG_RETURN_KEYS.globalSearch}
            />
          )}
        </MotionPresence>
      </AppleMotion>

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
          pageUrl={pageUrl}
        />
      </div>
    </div>
  );
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
  return (
    <div className="grid gap-2">
      <div className="text-xs font-semibold text-[var(--muted)]">
        振り返る公演
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

function loadStoredPicks(
  experience: PickExperience,
  storageKey: string,
  contextId?: string,
) {
  const savedPicks = localStorage.getItem(storageKey);
  if (!savedPicks) {
    return {};
  }

  try {
    return parseStoredPicksForExperience({
      experience,
      serialized: savedPicks,
      contextId,
    });
  } catch (error) {
    console.error("Failed to parse saved picks", error);
    return {};
  }
}

function sameStoredPicks(left: StoredPicks, right: StoredPicks) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([slotId, songId]) => right[slotId] === songId);
}

function normalizeNickname(nickname: string) {
  return nickname.trim().replace(/\s+/g, " ").slice(0, MAX_NICKNAME_LENGTH);
}
