import { NextResponse } from "next/server";
import { detectLibreOfficeCapability } from "@/lib/libreoffice";
import { detectGhostscriptCapability } from "@/lib/ghostscript";
import { detectWordCapability } from "@/lib/word";
import type { Capabilities } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  // This route MUST NOT throw (PRD 9.1): any failure just means unavailable.
  try {
    const [libreoffice, ghostscript, word] = await Promise.all([
      detectLibreOfficeCapability(),
      detectGhostscriptCapability(),
      detectWordCapability(),
    ]);
    return NextResponse.json({ libreoffice, ghostscript, word } satisfies Capabilities);
  } catch {
    return NextResponse.json({
      libreoffice: { available: false, version: null, path: null },
      ghostscript: { available: false, version: null, path: null },
      word: { available: false, version: null, path: null },
    } satisfies Capabilities);
  }
}
