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
import { localizeExperienceUi } from "../../../i18n/content";

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
  const metadataCopy = localizeExperienceUi(experience, "en");
  const publishedLiveImage = {
    url: `/og/${PROJECT_CONFIG.id}/live/${experience.slug}.png`,
    width: 1200,
    height: 630,
    alt: `${experience.title} | ${PROJECT_CONFIG.displayName} Live Pick social card`,
  };
  const existingLogoImage = {
    url: PROJECT_CONFIG.iconPath,
    width: 512,
    height: 512,
    alt: `${PROJECT_CONFIG.displayName} Logo`,
  };
  const socialImage =
    experience.status === "published" ? publishedLiveImage : existingLogoImage;
  const twitterCard =
    experience.status === "published" ? "summary_large_image" : "summary";

  return {
    metadataBase: new URL(PROJECT_CONFIG.siteUrl),
    title: `${metadataCopy.title} | ${PROJECT_CONFIG.displayName}`,
    description: metadataCopy.description,
    keywords: PROJECT_CONFIG.keywords,
    alternates: {
      canonical: experience.canonicalPath,
    },
    openGraph: {
      title: metadataCopy.title,
      description: metadataCopy.description,
      url: pageUrl,
      siteName: PROJECT_CONFIG.displayName,
      locale: "en_US",
      type: "website",
      images: [socialImage],
    },
    twitter: {
      card: twitterCard,
      title: metadataCopy.title,
      description: metadataCopy.description,
      images: [socialImage],
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
