import type { Metadata } from "next";
import { getToolBySlug } from "@/lib/tools";

export const metadata: Metadata = { title: getToolBySlug("merge-pdf")?.title };

export default function ToolLayout({ children }: { children: React.ReactNode }) {
  return children;
}
