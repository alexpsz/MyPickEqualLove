import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AtlasShell } from "@/components/shell/atlas-shell";
import { PRODUCT_FAMILY_NAVIGATION } from "@/config/product-family-navigation";
import { SHELL_THEME_BOOTSTRAP_SCRIPT } from "@/i18n/shell/shell-preferences";

import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas | My Journey",
  description:
    "Discover approved real events, keep a local Journey, and make a Memory.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    noimageindex: true,
    nocache: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html data-locale="en" lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: SHELL_THEME_BOOTSTRAP_SCRIPT }}
          id="atlas-theme-bootstrap"
        />
      </head>
      <body>
        <AtlasShell familyNavigation={PRODUCT_FAMILY_NAVIGATION}>
          {children}
        </AtlasShell>
      </body>
    </html>
  );
}
