import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AtlasShell } from "@/components/shell/atlas-shell";
import { PRODUCT_FAMILY_NAVIGATION } from "@/config/product-family-navigation";
import { SHELL_THEME_BOOTSTRAP_SCRIPT } from "@/i18n/shell/shell-preferences";

import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas | My Journey",
  description: "A private, local-first home for your personal Journey.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
