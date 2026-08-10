import React from "react";
import { PROJECT_CONFIG } from "../config/project";
import GitHubLink from "./GitHubLink";
import SisterProjectsMenu from "./SisterProjectsMenu";

export default function AppTopBar({
  memberColorBackground,
  asHeading = false,
}: {
  memberColorBackground: string;
  asHeading?: boolean;
}) {
  const TitleElement = asHeading ? "h1" : "div";

  return (
    <div className="apple-material sticky top-0 z-40 border-x-0 border-t-0">
      <div
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ background: memberColorBackground }}
        aria-hidden="true"
      />
      <div className="app-content-shell flex h-14 items-center gap-3 px-4 sm:h-16 sm:px-6 md:px-8">
        <SisterProjectsMenu triggerClassName="shrink-0" />
        <TitleElement className="min-w-0 flex-1 truncate px-1 text-[17px] font-medium tracking-[-0.02em] text-[var(--muted)] sm:text-lg">
          MY PICK
          <span className="ml-3 font-semibold text-[var(--foreground)]">
            {PROJECT_CONFIG.groupName}
          </span>
        </TitleElement>
        <GitHubLink className="shrink-0" />
      </div>
    </div>
  );
}
