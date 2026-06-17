"use client";

import React from "react";

interface ControlsProps {
  onClearAll: () => void;
  onGenerate: () => void;
  onGlobalSearch: () => void;
  nickname: string;
  nicknameMaxLength: number;
  onNicknameChange: (nickname: string) => void;
  generating: boolean;
  hasPicks: boolean;
  totalSongs: number;
}

export default function Controls({
  onClearAll,
  onGenerate,
  onGlobalSearch,
  nickname,
  nicknameMaxLength,
  onNicknameChange,
  generating,
  hasPicks,
  totalSongs,
}: ControlsProps) {
  return (
    <div className="relative z-10 mx-auto mb-8 grid w-full max-w-7xl gap-4 px-5 md:mb-12 md:grid-cols-[1fr_auto] md:px-8">
      <div className="official-panel-soft official-stripe grid gap-3 px-4 py-3">
        <Metric label="Songs" value={totalSongs} color="var(--project-primary)" />

        <div className="grid gap-2">
          <label
            htmlFor="export-nickname"
            className="text-[10px] font-bold uppercase tracking-[0.16em] text-black"
          >
            Your name
          </label>
          <div className="flex min-h-11 items-center border border-black bg-white transition-colors focus-within:border-[var(--project-primary)]">
            <input
              id="export-nickname"
              type="text"
              value={nickname}
              maxLength={nicknameMaxLength}
              disabled={generating}
              onChange={(event) => onNicknameChange(event.target.value)}
              placeholder="Your name (optional)"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-bold text-black outline-none placeholder:text-slate-400 disabled:opacity-50"
            />
            <span className="px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
              {nickname.length}/{nicknameMaxLength}
            </span>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Optional - appears as &quot;Selected by ...&quot; in the export.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onGlobalSearch}
          className="official-button"
        >
          <svg
            className="h-3 w-3 stroke-current"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          Search All Songs
        </button>
        <button
          type="button"
          onClick={onClearAll}
          disabled={!hasPicks}
          className="official-button"
        >
          Clear Board
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating || !hasPicks}
          className="official-button official-button-primary min-w-[164px]"
        >
          {generating ? (
            <>
              <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <svg
                className="h-3.5 w-3.5 fill-none stroke-current"
                viewBox="0 0 24 24"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Generate Image
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]">
      <span
        className="inline-block h-2.5 w-2.5"
        style={{ backgroundColor: color }}
      />
      <span className="text-black">{label}</span>
      <span className="text-slate-500">{value}</span>
    </div>
  );
}
