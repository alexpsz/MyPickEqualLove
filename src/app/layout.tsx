import type { Metadata } from "next";
import "./globals.css";
import { APP_BRAND } from "../config/equalLove";
import { SITE_URL } from "../utils/constants";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "MY PICK =LOVE | ＝LOVEのお気に入り楽曲を選ぼう！",
  description:
    "＝LOVEのお気に入り楽曲を選び、オリジナルのピック画像を作成して共有できるファンツールです。",
  keywords: [
    "＝LOVE",
    "イコラブ",
    "Equal Love",
    "My Pick",
    "お気に入り楽曲",
    "アイドル",
    "ファンツール",
  ],
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "MY PICK =LOVE",
    description:
      "＝LOVEのお気に入り楽曲を選び、オリジナルのピック画像を作成して共有できるファンツールです。",
    url: SITE_URL,
    siteName: APP_BRAND.displayName,
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: "/icon.svg",
        width: 512,
        height: 512,
        alt: "MY PICK =LOVE Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "MY PICK =LOVE",
    description:
      "＝LOVEのお気に入り楽曲を選び、オリジナルのピック画像を作成して共有できるファンツールです。",
    images: ["/icon.svg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
