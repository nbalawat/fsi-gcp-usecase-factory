import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Live system status endpoint — confirms whether the underwriting
 * pipeline's services are deployed/reachable.
 *
 * Service URL discovery — two paths:
 *
 *   1. Production (Cloud Run UI):  per-service env var FSI_<NAME>_URL,
 *      injected at deploy time. e.g. FSI_FINANCIAL_SPREADER_URL=https://...
 *      Set up by ui/apps/pipeline-console/cloudbuild.yaml + the
 *      `gcloud run deploy --set-env-vars=...` invocation.
 *
 *   2. Local dev:  reads .fsi-state/<service>.url files written by
 *      scripts/deploy_service.sh. The dev server has these on disk;
 *      the deployed image does not (.fsi-state is gitignored AND
 *      dockerignored).
 *
 * Either path produces "up" if the URL is known; "unknown" otherwise.
 * The UI shows this as a header strip: green = healthy, amber =
 * degraded, red = down.
 *
 * NOTE: returns PUBLIC metadata only (resolved URL + when we last
 * saw it deployed). Never proxies service responses — they require
 * IAM auth and that's a different surface.
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

/** Convert "financial-spreader" → "FSI_FINANCIAL_SPREADER_URL". */
function envVarName(serviceName: string): string {
  return "FSI_" + serviceName.toUpperCase().replace(/-/g, "_") + "_URL";
}

function resolveServiceUrl(serviceName: string): {
  url: string | null;
  source: "env" | "file" | null;
  last_seen: string | null;
} {
  // 1. Env var (production)
  const envUrl = process.env[envVarName(serviceName)];
  if (envUrl) {
    return { url: envUrl, source: "env", last_seen: null };
  }
  // 2. .fsi-state file (local dev)
  const urlFile = join(REPO_ROOT, ".fsi-state", `${serviceName}.url`);
  if (existsSync(urlFile)) {
    try {
      return {
        url: readFileSync(urlFile, "utf-8").trim(),
        source: "file",
        last_seen: statSync(urlFile).mtime.toISOString(),
      };
    } catch {
      /* fallthrough */
    }
  }
  return { url: null, source: null, last_seen: null };
}

export async function GET(): Promise<Response> {
  const statuses: ServiceStatus[] = SERVICES.map((s) => {
    const r = resolveServiceUrl(s.name);
    if (!r.url) {
      return { name: s.name, role: s.role, state: "unknown" };
    }
    return {
      name: s.name,
      role: s.role,
      state: "up",
      url: r.url,
      last_deployed: r.last_seen ?? undefined,
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
