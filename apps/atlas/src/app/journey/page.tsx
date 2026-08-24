import type { Metadata } from "next";
import { JourneyWorkspace } from "../../components/journey/JourneyWorkspace";

export const metadata: Metadata = {
  title: "My Journey | Atlas",
  robots: { index: false, follow: false },
};

export default function JourneyPage() {
  return <JourneyWorkspace />;
}
