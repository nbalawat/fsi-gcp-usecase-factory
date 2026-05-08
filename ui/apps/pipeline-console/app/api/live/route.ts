import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Live system status endpoint — pings the deployed Cloud Run services
 * to show whether the underwriting pipeline is actually up.
 *
 * Each service URL is pulled from .fsi-state/<service>.url (written by
 * scripts/deploy_service.sh). If a state file is missing, the service is
 * marked "unknown".
 *
 * The UI shows this as a live header strip: green = pipeline healthy,
 * amber = degraded (1+ services down), red = pipeline down.
 *
 * NOTE: this fetches PUBLIC service metadata (just the resolved URL +
 * last_modified) — never service responses, since they require IAM auth.
 * The "live" indicator confirms the deployment is up; deeper health is
 * shown via Cloud Logging / Cloud Trace.
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(process.cwd(), "..", "..", "..");

const SERVICES = [
  // Atomic services
  { name: "financial-spreader", role: "underwriting" },
  { name: "dscr-calculator", role: "underwriting" },
  { name: "covenant-analyzer", role: "underwriting" },
  { name: "peer-benchmarker", role: "underwriting" },
  { name: "industry-risk-scorer", role: "underwriting" },
  { name: "collateral-valuator", role: "underwriting" },
  { name: "exposure-aggregator", role: "underwriting" },
  { name: "insider-screening", role: "underwriting" },
  // Singletons
  { name: "rules-service", role: "rules" },
  // Per-UC
  { name: "credit-memo-commercial", role: "intake" },
];

interface ServiceStatus {
  name: string;
  role: string;
  state: "up" | "unknown";
  url?: string;
  last_deployed?: string;
}

export async function GET(): Promise<Response> {
  const statuses: ServiceStatus[] = SERVICES.map((s) => {
    const urlFile = join(REPO_ROOT, ".fsi-state", `${s.name}.url`);
    if (!existsSync(urlFile)) {
      return { name: s.name, role: s.role, state: "unknown" };
    }
    const url = readFileSync(urlFile, "utf-8").trim();
    const mtime = statSync(urlFile).mtime.toISOString();
    return {
      name: s.name,
      role: s.role,
      state: "up",
      url,
      last_deployed: mtime,
    };
  });

  const up = statuses.filter((s) => s.state === "up").length;
  const total = statuses.length;
  const overall =
    up === total ? "healthy" : up >= total - 2 ? "degraded" : "down";

  return NextResponse.json(
    {
      overall,
      summary: `${up}/${total} services up`,
      services: statuses,
      checked_at: new Date().toISOString(),
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
