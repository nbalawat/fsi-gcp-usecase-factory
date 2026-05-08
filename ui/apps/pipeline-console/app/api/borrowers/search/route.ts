import { NextResponse } from "next/server";
import { searchBorrowers } from "@uc/lib/rm-data";
import { isDbConfigured, DB_UNAVAILABLE_MESSAGE } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Borrower autocomplete for the RM origination form. Searches `borrower_master`
 * by name, DBA, EIN suffix, or borrower_id. Returns an empty array on empty
 * query so the input handles its own debouncing.
 */
export async function GET(req: Request): Promise<Response> {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: DB_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  if (q.trim().length === 0) {
    return NextResponse.json(
      { ok: true, hits: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const hits = await searchBorrowers(q, 8);
    return NextResponse.json(
      { ok: true, hits },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: DB_UNAVAILABLE_MESSAGE, detail: msg },
      { status: 503 },
    );
  }
}
