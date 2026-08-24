import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AtlasShell } from "@/components/shell/atlas-shell";
import { PRODUCT_FAMILY_NAVIGATION } from "@/config/product-family-navigation";

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
      <body>
        <AtlasShell familyNavigation={PRODUCT_FAMILY_NAVIGATION}>
          {children}
        </AtlasShell>
      </body>
    </html>
  );
}
