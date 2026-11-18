import type { Metadata } from "next";
import { getToolBySlug } from "@/lib/tools";

export const metadata: Metadata = { title: getToolBySlug("extract-images")?.title };

export default function ToolLayout({ children }: { children: React.ReactNode }) {
  return children;
}
