import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PROJECT_CONFIG } from "../../../config/project";
import PickExperienceClient from "../../../components/PickExperienceClient";
import {
  EMPTY_LIVE_EXPERIENCE_SLUG,
  findLiveExperienceBySlug,
  getExperiencePageUrl,
  getLiveExperienceStaticParams,
} from "../../../data/pickExperiences";

export const dynamicParams = false;

interface LiveExperiencePageProps {
  params: Promise<{
    eventSlug: string;
  }>;
}

export function generateStaticParams() {
  return getLiveExperienceStaticParams();
}

export async function generateMetadata({
  params,
}: LiveExperiencePageProps): Promise<Metadata> {
  const { eventSlug } = await params;
  if (eventSlug === EMPTY_LIVE_EXPERIENCE_SLUG) {
    return {
      metadataBase: new URL(PROJECT_CONFIG.siteUrl),
      title: PROJECT_CONFIG.displayName,
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const experience = findLiveExperienceBySlug(eventSlug);
  if (!experience) {
    notFound();
  }

  const pageUrl = getExperiencePageUrl(experience);

  return {
    metadataBase: new URL(PROJECT_CONFIG.siteUrl),
    title: `${experience.title} | ${PROJECT_CONFIG.displayName}`,
    description: experience.description,
    keywords: PROJECT_CONFIG.keywords,
    alternates: {
      canonical: experience.canonicalPath,
    },
    openGraph: {
      title: experience.title,
      description: experience.description,
      url: pageUrl,
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
      title: experience.title,
      description: experience.description,
      images: [PROJECT_CONFIG.iconPath],
    },
    robots: {
      index: experience.status !== "draft",
      follow: true,
    },
  };
}

export default async function LiveExperiencePage({
  params,
}: LiveExperiencePageProps) {
  const { eventSlug } = await params;
  if (eventSlug === EMPTY_LIVE_EXPERIENCE_SLUG) {
    return null;
  }

  const experience = findLiveExperienceBySlug(eventSlug);
  if (!experience) {
    notFound();
  }

  return <PickExperienceClient experience={experience} />;
}
