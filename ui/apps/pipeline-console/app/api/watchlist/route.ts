import { NextResponse } from "next/server";
import { getWatchlist } from "@uc/lib/watchlist-data";
import { isDbConfigured, DB_UNAVAILABLE_MESSAGE } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Watchlist BFF — returns the auto-detected concerns the CCO sees on
 * `/watchlist`. Aggregates from `borrower_master`, `application_state`, and
 * `application_events`. With an empty DB the response is `{ ok: true, rows: [] }`.
 */
export async function GET(): Promise<Response> {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: DB_UNAVAILABLE_MESSAGE },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const rows = await getWatchlist();
    return NextResponse.json(
      { ok: true, rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: DB_UNAVAILABLE_MESSAGE, detail: msg },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
