/**
 * Audit-trail JSON for one application_id. Returns the chronological
 * `application_events` list plus aggregate roll-ups (total latency, total
 * cost, and counts of agent / rule / service invocations).
 *
 * Used by `useLiveAuditTrail` for initial hydrate before SSE takes over.
 */

import { NextResponse } from "next/server";
import { getAuditTotals, getEventsForCase } from "@uc/lib/live-data";
import { isDbConfigured, DB_UNAVAILABLE_MESSAGE } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: { id: string };
}

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: DB_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }
  const id = decodeURIComponent(params.id);
  try {
    const [events, totals] = await Promise.all([
      getEventsForCase(id),
      getAuditTotals(id),
    ]);
    return NextResponse.json(
      { application_id: id, events, totals },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: DB_UNAVAILABLE_MESSAGE, detail: msg },
      { status: 503 },
    );
  }
}
