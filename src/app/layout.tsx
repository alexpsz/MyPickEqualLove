import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import "./globals.css";
import { PROJECT_CONFIG } from "../config/project";
import { SITE_URL } from "../utils/constants";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${PROJECT_CONFIG.displayName} | ${PROJECT_CONFIG.subtitle}`,
  description: PROJECT_CONFIG.description,
  keywords: PROJECT_CONFIG.keywords,
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [{ url: PROJECT_CONFIG.iconPath, type: "image/svg+xml" }],
  },
  openGraph: {
    title: PROJECT_CONFIG.displayName,
    description: PROJECT_CONFIG.description,
    url: SITE_URL,
    siteName: PROJECT_CONFIG.displayName,
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: PROJECT_CONFIG.iconPath,
        width: 512,
        height: 512,
        alt: `${PROJECT_CONFIG.displayName} Logo`,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: PROJECT_CONFIG.displayName,
    description: PROJECT_CONFIG.description,
    images: [PROJECT_CONFIG.iconPath],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body
        className="flex min-h-full flex-col"
        style={projectThemeStyle}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}

const projectThemeStyle = {
  "--project-primary": PROJECT_CONFIG.themeColor,
  "--project-accent": PROJECT_CONFIG.logoAccentColor,
  "--project-primary-wash": hexToRgba(PROJECT_CONFIG.themeColor, 0.08),
} as CSSProperties;

function hexToRgba(hexColor: string, alpha: number) {
  const normalized = hexColor.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return `rgba(234, 108, 129, ${alpha})`;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
