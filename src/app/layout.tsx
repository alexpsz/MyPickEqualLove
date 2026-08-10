import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import "./globals.css";
import { PROJECT_CONFIG } from "../config/project";
import { localizeProjectCopy } from "../i18n/content";
import LocaleProvider from "../i18n/LocaleProvider";
import { SITE_URL } from "../utils/constants";

const metadataCopy = localizeProjectCopy(PROJECT_CONFIG.id, "en");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${PROJECT_CONFIG.displayName} | ${metadataCopy.subtitle}`,
  description: metadataCopy.description,
  keywords: PROJECT_CONFIG.keywords,
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [{ url: PROJECT_CONFIG.iconPath, type: "image/svg+xml" }],
  },
  openGraph: {
    title: PROJECT_CONFIG.displayName,
    description: metadataCopy.description,
    url: SITE_URL,
    siteName: PROJECT_CONFIG.displayName,
    locale: "en_US",
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
    description: metadataCopy.description,
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
    <html
      lang="en"
      data-locale="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body
        className="flex min-h-full flex-col"
        style={projectThemeStyle}
        suppressHydrationWarning
      >
        <LocaleProvider>{children}</LocaleProvider>
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
