import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SongCatalogDetail } from "../../../components/SongCatalogPages";
import { PROJECT_CONFIG } from "../../../config/project";
import { SONGS, SONGS_BY_ID } from "../../../data/songs";
import { getSongPagePath } from "../../../utils/songRoutes";
import {
  createMusicRecordingStructuredData,
  serializeStructuredData,
} from "../../../utils/structuredData";

export const dynamic = "force-static";
export const dynamicParams = false;

interface SongPageProps {
  params: Promise<{
    songId: string;
  }>;
}

export function generateStaticParams() {
  return SONGS.map(({ id: songId }) => ({ songId }));
}

export async function generateMetadata({
  params,
}: SongPageProps): Promise<Metadata> {
  const { songId } = await params;
  const song = SONGS_BY_ID[songId];

  if (!song) {
    notFound();
  }

  return {
    title: `${song.title.ja} | ${PROJECT_CONFIG.displayName}`,
    description: `${song.title.ja} (${song.title.romaji}) release information and confirmed credits.`,
    alternates: {
      canonical: getSongPagePath(song.id),
    },
  };
}

export default async function SongPage({ params }: SongPageProps) {
  const { songId } = await params;
  const song = SONGS_BY_ID[songId];

  if (!song) {
    notFound();
  }

  const structuredData = createMusicRecordingStructuredData({
    song,
    groupName: PROJECT_CONFIG.groupName,
  });

  return (
    <>
      {structuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeStructuredData(structuredData),
          }}
        />
      ) : null}
      <SongCatalogDetail song={song} />
    </>
  );
}
