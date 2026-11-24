import { NextResponse } from "next/server";
import { checkForUpdate, parseVersion, type UpdateCheckResponse } from "@/lib/update-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Never throws: an update check must not be able to break the page it sits on.
  const current = process.env.LFT_APP_VERSION ?? "";
  if (!parseVersion(current)) {
    return NextResponse.json({ desktop: false, current: null, result: null } satisfies UpdateCheckResponse);
  }
  const wantsCheck = new URL(request.url).searchParams.get("check") === "1";
  const result = wantsCheck ? await checkForUpdate(current) : null;
  return NextResponse.json(
    { desktop: true, current, result } satisfies UpdateCheckResponse,
    { headers: { "Cache-Control": "no-store" } },
  );
}
