/**
 * Concentration BFF.
 *
 *   GET  → returns the current heatmap + top-5 single-borrower exposures
 *          + Tier 1 capital. Used by the CCO portfolio + concentration pages.
 *   POST → accepts { borrower_id, proposed_amount_usd }, returns a what-if
 *          preview (heatmap + delta) WITHOUT writing anything.
 *
 * Both responses are wrapped in `{ ok: true, ... }` so the client can branch
 * on a single shape.
 */

import { NextResponse } from "next/server";
import {
  buildConcentrationView,
  findBorrower,
  getBorrowerExposures,
  type ConcentrationView,
} from "@uc/lib/portfolio-data";
import { TIER1_CAPITAL_USD } from "../../../lib/bank-config";
import { isDbConfigured, DB_UNAVAILABLE_MESSAGE } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PostBody {
  borrower_id?: string;
  proposed_amount_usd?: number;
}

const fmtError = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

export async function GET(): Promise<Response> {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: DB_UNAVAILABLE_MESSAGE },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const borrowers = await getBorrowerExposures();
    const view = buildConcentrationView(borrowers);
    return NextResponse.json(
      {
        ok: true,
        view,
        topBorrowers: view.topBorrowers,
        tier1Capital: TIER1_CAPITAL_USD,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: DB_UNAVAILABLE_MESSAGE, detail: fmtError(e) },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: DB_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body must be JSON" },
      { status: 400 },
    );
  }
  if (!body.borrower_id) {
    return NextResponse.json(
      { ok: false, error: "borrower_id required" },
      { status: 400 },
    );
  }
  const amount = Number(body.proposed_amount_usd ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { ok: false, error: "proposed_amount_usd must be a positive number" },
      { status: 400 },
    );
  }

  try {
    const borrowers = await getBorrowerExposures();
    const borrower = findBorrower(borrowers, body.borrower_id);
    if (!borrower) {
      return NextResponse.json(
        { ok: false, error: `Unknown borrower ${body.borrower_id}` },
        { status: 404 },
      );
    }
    const view: ConcentrationView = buildConcentrationView(borrowers, {
      borrower,
      amount,
    });
    const newCommitted = borrower.committed_usd + amount;
    const borrowerPct = (newCommitted / TIER1_CAPITAL_USD) * 100;
    const sectorCell = view.cells.find(
      (c) => c.sector === borrower.sector && c.region === borrower.region,
    );
    const sectorPct = sectorCell ? sectorCell.pctTier1 : 0;
    return NextResponse.json({
      ok: true,
      borrower,
      view,
      delta: { borrowerPct, sectorPct },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: DB_UNAVAILABLE_MESSAGE, detail: fmtError(e) },
      { status: 503 },
    );
  }
}
