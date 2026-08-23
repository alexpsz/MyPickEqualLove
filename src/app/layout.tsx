import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import "./globals.css";
import InstallPrompt from "../components/InstallPrompt";
import ServiceWorkerRegistration from "../components/ServiceWorkerRegistration";
import ThemeProvider from "../components/ThemeProvider";
import { PROJECT_CONFIG, STORAGE_KEYS } from "../config/project";
import { localizeProjectCopy } from "../i18n/content";
import LocaleProvider from "../i18n/LocaleProvider";
import { SITE_URL } from "../utils/constants";
import { EXPORT_REALM_HASH } from "../utils/exportCapture";
import {
  THEME_COLORS,
  createThemeBootstrapScript,
} from "../utils/themePreference";

const metadataCopy = localizeProjectCopy(PROJECT_CONFIG.id, "en");
const homeOgImage = {
  url: `/og/${PROJECT_CONFIG.id}/home.png`,
  width: 1200,
  height: 630,
  alt: `${PROJECT_CONFIG.displayName} My Pick social card`,
};

function installIconPath(size: 180 | 192 | 512) {
  return `/icons/install/${PROJECT_CONFIG.id}-${size}.png`;
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${PROJECT_CONFIG.displayName} | ${metadataCopy.subtitle}`,
  description: metadataCopy.description,
  keywords: PROJECT_CONFIG.keywords,
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: PROJECT_CONFIG.iconPath, type: "image/svg+xml" },
      {
        url: installIconPath(192),
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: installIconPath(512),
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: installIconPath(180),
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  openGraph: {
    title: PROJECT_CONFIG.displayName,
    description: metadataCopy.description,
    url: SITE_URL,
    siteName: PROJECT_CONFIG.displayName,
    locale: "en_US",
    type: "website",
    images: [homeOgImage],
  },
  twitter: {
    card: "summary_large_image",
    title: PROJECT_CONFIG.displayName,
    description: metadataCopy.description,
    images: [homeOgImage],
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
      data-theme="light"
      data-theme-preference="auto"
      className="h-full antialiased"
      style={{ colorScheme: "light" }}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content={THEME_COLORS.light} />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body
        className="flex min-h-full flex-col"
        style={projectThemeStyle}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <LocaleProvider>
            {children}
            <InstallPrompt />
            <ServiceWorkerRegistration />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

const projectThemeStyle = {
  "--project-primary": PROJECT_CONFIG.themeColor,
  "--project-accent": PROJECT_CONFIG.logoAccentColor,
  "--project-primary-wash": hexToRgba(PROJECT_CONFIG.themeColor, 0.08),
} as CSSProperties;

const themeBootstrapScript = createThemeBootstrapScript(
  EXPORT_REALM_HASH,
  STORAGE_KEYS.theme,
);

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
