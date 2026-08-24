import React from "react";
import { PROJECT_CONFIG } from "../config/project";
import GitHubLink from "./GitHubLink";
import LanguageMenu from "./LanguageMenu";
import SisterProjectsMenu from "./SisterProjectsMenu";
import SongCatalogLink from "./SongCatalogLink";
import ThemeMenu from "./ThemeMenu";

export default function AppTopBar({
  memberColorBackground,
  asHeading = false,
  songCatalogCurrent = false,
}: {
  memberColorBackground: string;
  asHeading?: boolean;
  songCatalogCurrent?: boolean;
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
          {/* 顶栏在 420px 以下放不下 5 个 44px 控件 + 完整标题，收起弱化的
              「MY PICK」前缀，保证团名不被截断；它仍留在无障碍名称里。 */}
          <span className="sr-only min-[420px]:not-sr-only">MY PICK</span>
          <span className="font-semibold text-[var(--foreground)] min-[420px]:ml-3">
            {PROJECT_CONFIG.groupName}
          </span>
        </TitleElement>
        <div className="flex shrink-0 items-center">
          <SongCatalogLink current={songCatalogCurrent} />
          <ThemeMenu />
          <LanguageMenu />
          <GitHubLink />
        </div>
      </div>
    </div>
  );
}
