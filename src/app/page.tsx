"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PICK_SLOTS, EXPORT_CONFIG, STORAGE_KEYS } from "../config/equalLove";
import {
  MEMBERS,
  RELEASE_TYPES,
  RELEASE_YEARS,
  SONGS,
  SONGS_BY_ID,
  TRACK_TYPES,
} from "../data/songs";
import type { PickSlotId, Picks, Song, StoredPicks } from "../schema/music";
import { convertColorString } from "../utils/colors";
import Controls from "../components/Controls";
import ExportBoard from "../components/ExportBoard";
import Footer from "../components/Footer";
import GitHubLink from "../components/GitHubLink";
import Header from "../components/Header";
import PickBoard from "../components/PickBoard";
import PreviewModal from "../components/PreviewModal";
import ReplacementModal from "../components/ReplacementModal";
import SearchModal from "../components/SearchModal";

const SLOT_IDS = new Set(DEFAULT_PICK_SLOTS.map((slot) => slot.id));
const MAX_NICKNAME_LENGTH = 32;

export default function Home() {
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedPicks = localStorage.getItem(STORAGE_KEYS.picks);
      if (savedPicks) {
        try {
          setStoredPicks(parseStoredPicks(savedPicks));
        } catch (error) {
          console.error("Failed to parse saved picks", error);
        }
      }

      const savedOptions = localStorage.getItem(STORAGE_KEYS.options);
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
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      STORAGE_KEYS.options,
      JSON.stringify({ showTitles, transparentBg }),
    );
  }, [hydrated, showTitles, transparentBg]);

  const saveStoredPicks = useCallback((newPicks: StoredPicks) => {
    setStoredPicks(newPicks);
    localStorage.setItem(STORAGE_KEYS.picks, JSON.stringify(newPicks));
  }, []);

  const handleSlotClick = (slotId: PickSlotId) => {
    setActiveSlotId(slotId);
    setShowModal(true);
  };

  const handleGlobalSearchClick = () => {
    setActiveSlotId(null);
    setShowModal(true);
  };

  const handleNicknameChange = (nickname: string) => {
    setNicknameDraft(nickname.slice(0, MAX_NICKNAME_LENGTH));
  };

  const handleSelectSong = (song: Song) => {
    if (activeSlotId) {
      saveStoredPicks({ ...storedPicks, [activeSlotId]: song.id });
      setShowModal(false);
      setActiveSlotId(null);
      return;
    }

    const emptySlotId = findFirstEmptySlotId(storedPicks);
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
    saveStoredPicks({ ...storedPicks, [slotId]: pendingReplacementSong.id });
    setPendingReplacementSong(null);
  };

  const handleClearSlot = (slotId: PickSlotId, event: React.MouseEvent) => {
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
      const exportElement = document.getElementById(
        "mypick-equal-love-export-canvas",
      );

      if (exportElement) {
        await document.fonts.ready;
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        const canvas = await html2canvas(exportElement, {
          useCORS: true,
          backgroundColor: transparentBg ? null : EXPORT_CONFIG.background,
          scale: EXPORT_CONFIG.scale,
          logging: false,
        });
        setPreviewUrl(canvas.toDataURL("image/png"));
      }
    } catch (error) {
      console.error("Failed to generate image", error);
      window.alert("Failed to generate image. Please try again.");
    } finally {
      window.getComputedStyle = originalGetComputedStyle;
      generatingRef.current = false;
      setGenerating(false);
    }
  }, [transparentBg]);

  useEffect(() => {
    if (!previewUrl) return;
    const timer = window.setTimeout(() => {
      void handleGenerateImage();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [handleGenerateImage, previewUrl, showTitles, transparentBg]);

  return (
    <div className="site-shell relative flex flex-1 flex-col">
      <div className="relative z-10 h-2 w-full bg-black">
        <div className="mx-auto h-full max-w-7xl bg-[var(--equal-love-primary)]" />
      </div>

      <GitHubLink />
      <Header />

      <Controls
        onClearAll={handleClearAllPicks}
        onGenerate={handleGenerateImage}
        onGlobalSearch={handleGlobalSearchClick}
        nickname={nicknameDraft}
        nicknameMaxLength={MAX_NICKNAME_LENGTH}
        onNicknameChange={handleNicknameChange}
        generating={generating}
        hasPicks={Object.keys(picks).length > 0}
        totalSongs={SONGS_COUNT}
      />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-3 sm:px-6">
        <PickBoard
          slots={DEFAULT_PICK_SLOTS}
          picks={picks}
          onSlotClick={handleSlotClick}
          onClearSlot={handleClearSlot}
        />
      </main>

      <Footer />

      {showModal && (
        <SearchModal
          songs={SONGS}
          members={MEMBERS}
          releaseTypes={RELEASE_TYPES}
          trackTypes={TRACK_TYPES}
          years={RELEASE_YEARS}
          autoFocusSearch={activeSlotId === null}
          onClose={() => {
            setShowModal(false);
            setActiveSlotId(null);
          }}
          onSelect={handleSelectSong}
        />
      )}

      {pendingReplacementSong && (
        <ReplacementModal
          song={pendingReplacementSong}
          slots={DEFAULT_PICK_SLOTS}
          picks={picks}
          onReplace={handleReplaceSlot}
          onClose={() => setPendingReplacementSong(null)}
        />
      )}

      {previewUrl && (
        <PreviewModal
          previewUrl={previewUrl}
          onClose={() => setPreviewUrl(null)}
          showTitles={showTitles}
          onToggleShowTitles={setShowTitles}
          transparentBg={transparentBg}
          onToggleTransparentBg={setTransparentBg}
          generating={generating}
        />
      )}

      <div className="pointer-events-none fixed -left-[9999px] -top-[9999px] select-none overflow-hidden">
        <ExportBoard
          slots={DEFAULT_PICK_SLOTS}
          picks={picks}
          showTitles={showTitles}
          transparentBg={transparentBg}
          selectedBy={exportNickname}
        />
      </div>
    </div>
  );
}

const SONGS_COUNT = SONGS.length;

function findFirstEmptySlotId(storedPicks: StoredPicks): PickSlotId | null {
  const slot = DEFAULT_PICK_SLOTS.find((candidate) => !storedPicks[candidate.id]);
  return slot?.id ?? null;
}

function parseStoredPicks(serialized: string): StoredPicks {
  const parsed = JSON.parse(serialized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  const nextPicks: StoredPicks = {};
  for (const [slotId, songId] of Object.entries(parsed)) {
    if (SLOT_IDS.has(slotId) && typeof songId === "string" && SONGS_BY_ID[songId]) {
      nextPicks[slotId] = songId;
    }
  }

  return nextPicks;
}

function normalizeNickname(nickname: string) {
  return nickname.trim().replace(/\s+/g, " ").slice(0, MAX_NICKNAME_LENGTH);
}
