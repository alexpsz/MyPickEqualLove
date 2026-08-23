import React from "react";

export type AppIconName =
  | "archive"
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "close"
  | "download"
  | "external"
  | "filter"
  | "globe"
  | "grip"
  | "image"
  | "info"
  | "keyboard"
  | "menu"
  | "monitor"
  | "moon"
  | "music"
  | "pause"
  | "play"
  | "plus"
  | "reset"
  | "redo"
  | "search"
  | "share"
  | "sparkles"
  | "sun"
  | "undo";

interface AppIconProps {
  name: AppIconName;
  className?: string;
  size?: 14 | 16 | 18 | 32;
  strokeWidth?: number;
}

export default function AppIcon({
  name,
  className = "",
  size = 18,
  strokeWidth = 1.75,
}: AppIconProps) {
  return (
    <svg
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {getIconPaths(name)}
    </svg>
  );
}

function getIconPaths(name: AppIconName) {
  switch (name) {
    case "archive":
      return (
        <>
          <path d="M4.5 7.75h15v11.5h-15z" />
          <path d="M3.5 4.75h17v3h-17z" />
          <path d="M9 12h6" />
        </>
      );
    case "check":
      return <path d="m5.5 12.25 4.1 4.1L18.75 7.2" />;
    case "chevron-down":
      return <path d="m6.75 9.25 5.25 5 5.25-5" />;
    case "chevron-right":
      return <path d="m9.25 6.5 5.5 5.5-5.5 5.5" />;
    case "close":
      return <path d="m6.75 6.75 10.5 10.5m0-10.5-10.5 10.5" />;
    case "download":
      return (
        <>
          <path d="M12 3.5v11" />
          <path d="m7.75 10.5 4.25 4.25 4.25-4.25" />
          <path d="M5 20h14" />
        </>
      );
    case "external":
      return (
        <>
          <path d="M8.25 15.75 16.5 7.5" />
          <path d="M10.25 7.5h6.25v6.25" />
        </>
      );
    case "filter":
      return <path d="M4 6h16l-6.25 7.15V18l-3.5 1.75v-6.6L4 6Z" />;
    case "globe":
      return (
        <>
          <circle cx="12" cy="12" r="8.25" />
          <path d="M3.75 12h16.5" />
          <path d="M12 3.75c2.2 2.25 3.25 5 3.25 8.25S14.2 18 12 20.25C9.8 18 8.75 15.25 8.75 12S9.8 6 12 3.75Z" />
        </>
      );
    case "grip":
      return (
        <>
          <circle cx="8" cy="7" r="1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="7" r="1" fill="currentColor" stroke="none" />
          <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="8" cy="17" r="1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="17" r="1" fill="currentColor" stroke="none" />
        </>
      );
    case "image":
      return (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
          <circle cx="8.5" cy="9" r="1.25" />
          <path d="m5.75 17 4.4-4.4 2.7 2.7 2.1-2.1 3.3 3.3" />
        </>
      );
    case "info":
      return (
        <>
          <circle cx="12" cy="12" r="8.25" />
          <path d="M12 10.5v5" />
          <path d="M12 7.4h.01" />
        </>
      );
    case "keyboard":
      return (
        <>
          <rect x="3.5" y="6.25" width="17" height="11.5" rx="2" />
          <path d="M6.75 10h.01M9.75 10h.01M12.75 10h.01M15.75 10h.01M6.75 13h.01M9.75 13h.01M12.75 13h.01M15.75 13h.01" />
          <path d="M8.5 15.5h7" />
        </>
      );
    case "menu":
      return (
        <>
          <path d="M5 7.25h14" />
          <path d="M5 12h14" />
          <path d="M5 16.75h14" />
        </>
      );
    case "monitor":
      return (
        <>
          <rect x="4.25" y="5" width="15.5" height="11.5" rx="1.75" />
          <path d="M8.5 19h7M12 16.5V19" />
        </>
      );
    case "moon":
      return (
        <path d="M18.25 15.45A7.75 7.75 0 0 1 8.55 5.75a7.75 7.75 0 1 0 9.7 9.7Z" />
      );
    case "music":
      return (
        <>
          <path d="M9.5 17.25V6.5l8-1.75v10.5" />
          <ellipse cx="6.75" cy="17.5" rx="2.75" ry="2.1" />
          <ellipse cx="14.75" cy="15.5" rx="2.75" ry="2.1" />
        </>
      );
    case "pause":
      return (
        <>
          <path d="M7 4h3.5v16H7z" fill="currentColor" stroke="none" />
          <path d="M13.5 4H17v16h-3.5z" fill="currentColor" stroke="none" />
        </>
      );
    case "play":
      return (
        <path
          d="M6.25 2v20L23.5 12 6.25 2Z"
          fill="currentColor"
          stroke="none"
        />
      );
    case "plus":
      return <path d="M12 5.5v13M5.5 12h13" />;
    case "reset":
      return (
        <>
          <path d="M5.25 8.5H9V4.75" />
          <path d="M5.8 8.15a7.5 7.5 0 1 1-.55 6.7" />
        </>
      );
    case "search":
      return (
        <>
          <circle cx="10.75" cy="10.75" r="6.25" />
          <path d="m15.5 15.5 4 4" />
        </>
      );
    case "share":
      return (
        <>
          <circle cx="18" cy="5.75" r="2.25" />
          <circle cx="6" cy="12" r="2.25" />
          <circle cx="18" cy="18.25" r="2.25" />
          <path d="m7.9 10.95 8.2-4.15M7.9 13.05l8.2 4.15" />
        </>
      );
    case "sparkles":
      return (
        <>
          <path d="m12 3 1.2 4.1L17.25 8.3l-4.05 1.2L12 13.5l-1.2-4-4.05-1.2L10.8 7.1 12 3Z" />
          <path d="m18.25 14.75.65 2.1 2.1.65-2.1.65-.65 2.1-.65-2.1-2.1-.65 2.1-.65.65-2.1Z" />
          <path d="m5.75 14.5.5 1.6 1.6.5-1.6.5-.5 1.6-.5-1.6-1.6-.5 1.6-.5.5-1.6Z" />
        </>
      );
    case "sun":
      return (
        <>
          <circle cx="12" cy="12" r="3.75" />
          <path d="M12 2.75v2M12 19.25v2M2.75 12h2M19.25 12h2M5.46 5.46l1.42 1.42M17.12 17.12l1.42 1.42M18.54 5.46l-1.42 1.42M6.88 17.12l-1.42 1.42" />
        </>
      );
    case "redo":
      return (
        <>
          <path d="M15.75 8.25h3.75v-3.5" />
          <path d="M19.15 8a8 8 0 1 0 .2 7.7" />
        </>
      );
    case "undo":
      return (
        <>
          <path d="M8.25 8.25H4.5v-3.5" />
          <path d="M4.85 8a8 8 0 1 1-.2 7.7" />
        </>
      );
  }
}
