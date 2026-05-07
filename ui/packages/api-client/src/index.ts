/**
 * Typed BFF / atomic-service client for the agentic banking platform.
 *
 * Per the platform's hard rules (CLAUDE.md, console-pipeline SKILL.md),
 * UIs do NOT call atomic services directly. They call the BFF, which:
 *   - Aggregates Cloud Workflows execution state
 *   - Reads BigQuery audit tables for history / metrics
 *   - Subscribes to Pub/Sub for live activity (delivered as SSE/WebSocket)
 *
 * In dev / demo mode the client is pointed at the Next.js mock route under
 * /api/cases. In production it points at the BFF Cloud Run service.
 */

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface CaseSummary {
  loan_id: string;
  borrower_id: string;
  borrower_name: string;
  loan_amount_usd: number;
  naics_code?: string;
  stage: string;
  risk_band?: string;
  industry_risk_band?: string;
  dscr_base?: number;
  dscr_stressed?: number;
  single_borrower_pct?: number;
  stage_entered_at: string;
  regulatory_deadline_ts: string;
  alert?: string;
  confidence?: number;
}

export interface StageCount {
  stage_id: string;
  count: number;
}

export interface StageTransition {
  loan_id: string;
  borrower_name: string;
  from_stage: string;
  to_stage: string;
  transitioned_at: string;
}

export interface ApprovalRequest {
  loan_id: string;
  disposition: "accept" | "return" | "escalate";
  comment?: string;
  officer_id: string;
}

export interface ApprovalResponse {
  ok: boolean;
  audit_log_id: string;
  workflow_callback_invoked: boolean;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async listCases(): Promise<CaseSummary[]> {
    const r = await this.fetchImpl(`${this.baseUrl}/api/cases`);
    if (!r.ok) throw new Error(`listCases failed: ${r.status}`);
    return (await r.json()) as CaseSummary[];
  }

  async getCase(loanId: string): Promise<CaseSummary | null> {
    const r = await this.fetchImpl(
      `${this.baseUrl}/api/cases/${encodeURIComponent(loanId)}`,
    );
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`getCase failed: ${r.status}`);
    return (await r.json()) as CaseSummary;
  }

  async stageCounts(): Promise<StageCount[]> {
    const r = await this.fetchImpl(`${this.baseUrl}/api/stage-counts`);
    if (!r.ok) throw new Error(`stageCounts failed: ${r.status}`);
    return (await r.json()) as StageCount[];
  }

  async submitApproval(req: ApprovalRequest): Promise<ApprovalResponse> {
    const r = await this.fetchImpl(`${this.baseUrl}/api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!r.ok) throw new Error(`submitApproval failed: ${r.status}`);
    return (await r.json()) as ApprovalResponse;
  }
}

export const createApiClient = (opts: ApiClientOptions): ApiClient =>
  new ApiClient(opts);
