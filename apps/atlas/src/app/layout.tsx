import type { Metadata } from "next";
import Script from "next/script";
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
        <Script id="atlas-theme-bootstrap" strategy="beforeInteractive">
          {SHELL_THEME_BOOTSTRAP_SCRIPT}
        </Script>
      </head>
      <body>
        <AtlasShell familyNavigation={PRODUCT_FAMILY_NAVIGATION}>
          {children}
        </AtlasShell>
      </body>
    </html>
  );
}
