/**
 * Live single-case endpoint. Returns the application_state row, the full
 * (chronologically ordered) audit trail, and the latest credit-memo body.
 *
 * Used both by `useLiveCase` (initial hydrate before SSE picks up) and by
 * the case-detail RSC page when it pre-loads server-side.
 */

import { NextResponse } from "next/server";
import {
  getCase,
  getEventsForCase,
  getMemoArtifact,
} from "@uc/lib/live-data";
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
    const state = await getCase(id);
    if (!state) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const [events, memo] = await Promise.all([
      getEventsForCase(id),
      getMemoArtifact(id),
    ]);
    return NextResponse.json(
      { case: state, events, memo },
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
