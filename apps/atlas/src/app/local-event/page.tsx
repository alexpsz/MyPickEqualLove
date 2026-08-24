import type { Metadata } from "next";
import { LocalEventCreator } from "../../components/journey/LocalEventCreator";

export const metadata: Metadata = {
  title: "Local Custom Event | Atlas",
  robots: { index: false, follow: false },
};

export default function LocalEventPage() {
  return <LocalEventCreator />;
}
