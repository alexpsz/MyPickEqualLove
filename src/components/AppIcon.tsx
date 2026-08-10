import React from "react";

export type AppIconName =
  | "chevron-down"
  | "chevron-right"
  | "close"
  | "download"
  | "external"
  | "filter"
  | "image"
  | "menu"
  | "music"
  | "plus"
  | "reset"
  | "search";

interface AppIconProps {
  name: AppIconName;
  className?: string;
  size?: 14 | 16 | 18;
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
    case "image":
      return (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
          <circle cx="8.5" cy="9" r="1.25" />
          <path d="m5.75 17 4.4-4.4 2.7 2.7 2.1-2.1 3.3 3.3" />
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
    case "music":
      return (
        <>
          <path d="M9.5 17.25V6.5l8-1.75v10.5" />
          <ellipse cx="6.75" cy="17.5" rx="2.75" ry="2.1" />
          <ellipse cx="14.75" cy="15.5" rx="2.75" ry="2.1" />
        </>
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
  }
}
