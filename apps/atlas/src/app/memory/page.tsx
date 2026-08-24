import type { Metadata } from "next";

import { MemoryPage } from "@/components/memory/MemoryPage";

export const metadata: Metadata = {
  title: "Memory | Atlas",
  description: "Create one private, local-first Atlas Memory PNG.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function MemoryRoute() {
  return <MemoryPage />;
}
