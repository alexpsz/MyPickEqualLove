"use client";

import React from "react";
import Link from "next/link";
import { useLocale } from "../i18n/LocaleProvider";
import { SONG_CATALOG_PATH } from "../utils/songRoutes";
import AppIcon from "./AppIcon";

export default function SongCatalogLink({
  current = false,
  className = "",
}: {
  current?: boolean;
  className?: string;
}) {
  const { t } = useLocale();

  return (
    <Link
      href={SONG_CATALOG_PATH}
      prefetch={false}
      aria-current={current ? "page" : undefined}
      className={`${className} icon-button h-11 w-11`}
      title={t("songCatalog.openCatalogTitle")}
      aria-label={t("songCatalog.openCatalogAria")}
    >
      <AppIcon name="list" className="relative z-10" size={18} />
    </Link>
  );
}
