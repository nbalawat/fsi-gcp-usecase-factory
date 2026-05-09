-- fsi_banking database schema
-- Apply with: psql $DATABASE_URL -f schema.sql

-- Policy threshold table (all atomic services read from here)
CREATE TABLE IF NOT EXISTS thresholds (
    id              SERIAL PRIMARY KEY,
    service_name    VARCHAR(100) NOT NULL,
    threshold_name  VARCHAR(100) NOT NULL,
    threshold_value DECIMAL(18, 6) NOT NULL,
    effective_date  DATE NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (service_name, threshold_name, effective_date)
);
CREATE INDEX IF NOT EXISTS idx_thresholds_svc_date ON thresholds (service_name, effective_date DESC);

-- Audit event table (all services write here)
CREATE TABLE IF NOT EXISTS audit_events (
    id              BIGSERIAL PRIMARY KEY,
    service_name    VARCHAR(100) NOT NULL,
    context_id      VARCHAR(200) NOT NULL,
    inputs_summary  TEXT,
    outputs_summary TEXT,
    error           TEXT,
    invoked_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_context_id ON audit_events (context_id);
CREATE INDEX IF NOT EXISTS idx_audit_service ON audit_events (service_name, invoked_at DESC);

-- GL ledger for approved credit memos
CREATE TABLE IF NOT EXISTS gl_postings (
    id            BIGSERIAL PRIMARY KEY,
    context_id    VARCHAR(200) NOT NULL UNIQUE,
    borrower_id   VARCHAR(200) NOT NULL,
    loan_amount   DECIMAL(18, 2) NOT NULL,
    approver_id   VARCHAR(200),
    gl_account    VARCHAR(50) NOT NULL,
    posted_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    memo_ref      VARCHAR(200)
);

-- Existing bank loan exposures (queried by exposure-aggregator)
CREATE TABLE IF NOT EXISTS loan_exposures (
    id                  BIGSERIAL PRIMARY KEY,
    borrower_id         VARCHAR(200) NOT NULL,
    facility_id         VARCHAR(200) NOT NULL UNIQUE,
    committed_amount    DECIMAL(18, 2) NOT NULL DEFAULT 0,
    outstanding_amount  DECIMAL(18, 2) NOT NULL DEFAULT 0,
    as_of_date          DATE NOT NULL,
    status              VARCHAR(50) NOT NULL DEFAULT 'active',  -- active, committed, matured, closed
    facility_type       VARCHAR(100),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loan_exposures_borrower ON loan_exposures (borrower_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_loan_exposures_status ON loan_exposures (status);

-- Reg O insider registry (queried by insider-screening)
CREATE TABLE IF NOT EXISTS officers_directors (
    id              BIGSERIAL PRIMARY KEY,
    subject_id      VARCHAR(200) NOT NULL,
    role            VARCHAR(100) NOT NULL,           -- "Chief Executive Officer", "Director", "President", etc.
    effective_from  DATE NOT NULL,
    effective_to    DATE                              -- NULL = currently active
);
CREATE INDEX IF NOT EXISTS idx_officers_subject ON officers_directors (subject_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS principal_shareholders (
    id              BIGSERIAL PRIMARY KEY,
    subject_id      VARCHAR(200) NOT NULL,
    ownership_pct   DECIMAL(6, 4) NOT NULL,           -- e.g. 15.0 means 15.0%
    effective_from  DATE NOT NULL,
    effective_to    DATE
);
CREATE INDEX IF NOT EXISTS idx_principal_subject ON principal_shareholders (subject_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS related_interests (
    id                BIGSERIAL PRIMARY KEY,
    subject_id        VARCHAR(200) NOT NULL,          -- the entity being checked
    related_to_id     VARCHAR(200) NOT NULL,          -- the upstream insider
    relationship_type VARCHAR(100) NOT NULL,          -- controlled_by | family_member_of | partnership_with | has_subsidiary
    effective_from    DATE NOT NULL,
    effective_to      DATE
);
CREATE INDEX IF NOT EXISTS idx_related_subject ON related_interests (subject_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_related_to ON related_interests (related_to_id);

-- Seed insider-screening thresholds
INSERT INTO thresholds (service_name, threshold_name, threshold_value, effective_date) VALUES
    ('insider-screening', 'confidence_floor', 0.85, '2024-01-01')
ON CONFLICT DO NOTHING;

-- Per-service threshold tables (services with structured config)

CREATE TABLE IF NOT EXISTS industry_risk_scorer_thresholds (
    id              BIGSERIAL PRIMARY KEY,
    record_type     VARCHAR(50) NOT NULL,    -- sector_risk | vintage_adj | geography_adj | scalar
    lookup_key      VARCHAR(100) NOT NULL,
    numeric_value   DECIMAL(10, 4),
    secondary_value DECIMAL(10, 4),
    label_text      TEXT,
    effective_date  DATE NOT NULL,
    UNIQUE (record_type, lookup_key, effective_date)
);
CREATE INDEX IF NOT EXISTS idx_industry_risk_lookup ON industry_risk_scorer_thresholds (record_type, lookup_key, effective_date DESC);

INSERT INTO industry_risk_scorer_thresholds (record_type, lookup_key, numeric_value, secondary_value, label_text, effective_date) VALUES
    ('sector_risk', '23',  3.5,  NULL, 'Construction',                 '2024-01-01'),
    ('sector_risk', '31',  2.5,  NULL, 'Manufacturing',                '2024-01-01'),
    ('sector_risk', '32',  2.5,  NULL, 'Manufacturing',                '2024-01-01'),
    ('sector_risk', '33',  2.5,  NULL, 'Manufacturing',                '2024-01-01'),
    ('sector_risk', '44',  3.0,  NULL, 'Retail Trade',                 '2024-01-01'),
    ('sector_risk', '45',  3.0,  NULL, 'Retail Trade',                 '2024-01-01'),
    ('sector_risk', '52',  2.0,  NULL, 'Finance & Insurance',          '2024-01-01'),
    ('sector_risk', '54',  2.0,  NULL, 'Professional Services',        '2024-01-01'),
    ('sector_risk', '62',  2.0,  NULL, 'Health Care',                  '2024-01-01'),
    ('sector_risk', '72',  3.5,  NULL, 'Accommodation & Food Services','2024-01-01'),
    ('vintage_adj',     '2025',  -0.2, NULL, 'fresh',                  '2024-01-01'),
    ('vintage_adj',     '2024',  -0.1, NULL, 'recent',                 '2024-01-01'),
    ('vintage_adj',     '2023',   0.0, NULL, 'current-ish',            '2024-01-01'),
    ('vintage_adj',     '2022',   0.1, NULL, 'aging',                  '2024-01-01'),
    ('geography_adj',   'us-stable',     -0.1, NULL, 'stable region', '2024-01-01'),
    ('geography_adj',   'us-distressed',  0.4, NULL, 'distressed',    '2024-01-01'),
    ('scalar',          'default_sector_score', 3.0, NULL, NULL, '2024-01-01'),
    ('scalar',          'pre_2007_adjustment',  0.3, NULL, NULL, '2024-01-01')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS peer_profiles (
    id              BIGSERIAL PRIMARY KEY,
    naics_prefix    VARCHAR(20) NOT NULL,        -- e.g. "31" or "fallback"
    size_band       VARCHAR(50) NOT NULL,        -- e.g. "small" | "mid" | "large"
    dscr            DECIMAL(8, 4),
    leverage        DECIMAL(8, 4),
    current_ratio   DECIMAL(8, 4),
    ebitda_margin   DECIMAL(8, 4),
    sample_size     INT,
    effective_date  DATE NOT NULL,
    UNIQUE (naics_prefix, size_band, effective_date)
);
CREATE INDEX IF NOT EXISTS idx_peer_lookup ON peer_profiles (naics_prefix, size_band);

INSERT INTO peer_profiles (naics_prefix, size_band, dscr, leverage, current_ratio, ebitda_margin, sample_size, effective_date) VALUES
    ('31',       'small', 1.45, 3.20, 1.80, 0.12, 24, '2024-01-01'),
    ('31',       'mid',   1.50, 2.80, 1.95, 0.15, 38, '2024-01-01'),
    ('31',       'large', 1.65, 2.40, 2.10, 0.18, 52, '2024-01-01'),
    ('44',       'small', 1.30, 3.50, 1.50, 0.08, 31, '2024-01-01'),
    ('44',       'mid',   1.40, 3.10, 1.70, 0.10, 47, '2024-01-01'),
    ('52',       'small', 1.80, 2.20, 2.30, 0.22, 18, '2024-01-01'),
    ('72',       'small', 1.20, 4.10, 1.30, 0.06, 28, '2024-01-01'),
    ('fallback', 'small', 1.35, 3.30, 1.65, 0.10, 50, '2024-01-01'),
    ('fallback', 'mid',   1.45, 2.90, 1.80, 0.13, 80, '2024-01-01'),
    ('fallback', 'large', 1.60, 2.50, 2.00, 0.16, 100, '2024-01-01')
ON CONFLICT DO NOTHING;

-- Per-service threshold tables for services with structured config beyond a single
-- threshold_name → threshold_value mapping (e.g. collateral haircut tables).
CREATE TABLE IF NOT EXISTS collateral_valuator_thresholds (
    id                   BIGSERIAL PRIMARY KEY,
    row_type             VARCHAR(50) NOT NULL,   -- haircut_config | condition_multiplier
    key_name             VARCHAR(100) NOT NULL,
    base_haircut         DECIMAL(10, 6),
    age_decay_per_year   DECIMAL(10, 6),
    max_haircut          DECIMAL(10, 6),
    multiplier_value     DECIMAL(10, 6),
    effective_date       DATE NOT NULL,
    created_at           TIMESTAMP DEFAULT NOW(),
    UNIQUE (row_type, key_name, effective_date)
);
CREATE INDEX IF NOT EXISTS idx_cv_thresholds_lookup ON collateral_valuator_thresholds (row_type, key_name, effective_date DESC);

-- Seed collateral-valuator thresholds. The 'unknown' condition_multiplier row is
-- mandatory; without it, the service refuses to value collateral whose condition
-- isn't recognised (no silent hardcoded fallback).
INSERT INTO collateral_valuator_thresholds (row_type, key_name, base_haircut, age_decay_per_year, max_haircut, multiplier_value, effective_date) VALUES
    ('haircut_config',        'real_estate',     0.10, 0.005, 0.30, NULL, '2024-01-01'),
    ('haircut_config',        'equipment',       0.20, 0.020, 0.60, NULL, '2024-01-01'),
    ('haircut_config',        'inventory',       0.30, 0.000, 0.50, NULL, '2024-01-01'),
    ('haircut_config',        'receivables',     0.15, 0.000, 0.30, NULL, '2024-01-01'),
    ('haircut_config',        'cash',            0.00, 0.000, 0.05, NULL, '2024-01-01'),
    ('condition_multiplier',  'new',             NULL, NULL,  NULL, 1.00, '2024-01-01'),
    ('condition_multiplier',  'good',            NULL, NULL,  NULL, 0.95, '2024-01-01'),
    ('condition_multiplier',  'fair',            NULL, NULL,  NULL, 0.85, '2024-01-01'),
    ('condition_multiplier',  'poor',            NULL, NULL,  NULL, 0.70, '2024-01-01'),
    ('condition_multiplier',  'unknown',         NULL, NULL,  NULL, 0.85, '2024-01-01')
ON CONFLICT DO NOTHING;

-- Seed thresholds for credit-memo-commercial
INSERT INTO thresholds (service_name, threshold_name, threshold_value, effective_date) VALUES
    ('dscr-calculator',       'dscr_pass_min',                    1.25,          '2024-01-01'),
    ('dscr-calculator',       'dscr_special_mention_min',         1.10,          '2024-01-01'),
    ('dscr-calculator',       'dscr_substandard_min',             1.00,          '2024-01-01'),
    ('peer-benchmarker',      'peer_set_min_size',                5,             '2024-01-01'),
    ('peer-benchmarker',      'pass_percentile_min',              60,            '2024-01-01'),
    ('industry-risk-scorer',  'max_band_for_pass',                2,             '2024-01-01'),
    ('collateral-valuator',   'ltv_pass_min',                     1.50,          '2024-01-01'),
    ('collateral-valuator',   'ltv_special_mention_min',          1.25,          '2024-01-01'),
    ('exposure-aggregator',   'occ_single_borrower_hard_limit_pct', 25.0,        '2024-01-01'),
    ('exposure-aggregator',   'single_borrower_watch_pct',        15.0,          '2024-01-01'),
    ('exposure-aggregator',   'single_borrower_elevated_pct',     10.0,          '2024-01-01'),
    ('exposure-aggregator',   'tier1_capital_dollars',            100000000.0,   '2024-01-01'),
    ('covenant-analyzer',     'warn_headroom_pct',                5.0,           '2024-01-01'),
    ('financial-spreader',    'debt_to_ebitda_strong',            3.0,           '2024-01-01'),
    ('financial-spreader',    'debt_to_ebitda_weak',              6.0,           '2024-01-01'),
    ('financial-spreader',    'return_on_assets_strong',          0.05,          '2024-01-01'),
    ('financial-spreader',    'return_on_assets_weak',            0.01,          '2024-01-01')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- LIVE EXECUTION STATE — populated by orchestrator + sinks; read by UI via SSE
-- ============================================================================
-- Every loan application that flows through the credit-memo pipeline gets one
-- row in application_state and many rows in application_events (one per
-- atomic-service / rules / agent invocation). The UI subscribes to the
-- pubsub `application_state_changed` topic and streams updates to clients.
-- These tables are the live data layer; demo JSON files no longer feed UIs.

CREATE TABLE IF NOT EXISTS application_state (
    application_id        UUID PRIMARY KEY,
    borrower_id           VARCHAR(100) NOT NULL,
    borrower_name         VARCHAR(200) NOT NULL,
    naics_code            VARCHAR(10),
    loan_amount_usd       NUMERIC(18, 2) NOT NULL,
    scenario_tag          VARCHAR(80),                  -- happy-path | concentration-near-limit | …
    current_stage         VARCHAR(40) NOT NULL,         -- intake|spreading|policy|drafting|approval|posting|done
    decision              VARCHAR(40),                  -- APPROVE|DECLINE|RETURN_FOR_REVISION|STALLED|null
    risk_band             VARCHAR(40),                  -- 1-pass|2-special-mention|3-substandard|4-doubtful|5-loss
    dscr_base             NUMERIC(10, 4),
    dscr_stressed         NUMERIC(10, 4),
    leverage_base         NUMERIC(10, 4),
    single_borrower_pct   NUMERIC(10, 6),
    agent_confidence      NUMERIC(5, 4),                -- 0.0000 to 1.0000
    citation_density      NUMERIC(5, 4),
    regulatory_deadline   TIMESTAMPTZ,
    clock_started_at      TIMESTAMPTZ,
    stuck                 BOOLEAN DEFAULT FALSE,
    alert                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_event_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_state_stage     ON application_state (current_stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_state_borrower  ON application_state (borrower_id);
CREATE INDEX IF NOT EXISTS idx_app_state_decision  ON application_state (decision, updated_at DESC);

-- application_events is the audit trail. ONE ROW per atomic-service call,
-- per rules-service rule_set evaluation, per agent invocation, per stage
-- transition, per sink write. Append-only. JSONB payload carries everything
-- needed to render the audit-trail UI (model, tokens, cost, latency,
-- reasoning_trace, citations, output_summary, output_full, etc.).

CREATE TABLE IF NOT EXISTS application_events (
    id                BIGSERIAL PRIMARY KEY,
    application_id    UUID NOT NULL REFERENCES application_state(application_id) ON DELETE CASCADE,
    event_type        VARCHAR(50) NOT NULL,    -- stage_entered | service_invoked | rule_evaluated | agent_action | decision_made | sink_completed
    service_name      VARCHAR(100),            -- atomic service / rule_set / agent_role (null for stage events)
    payload           JSONB NOT NULL,          -- shape depends on event_type
    occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latency_ms        INTEGER,
    cost_usd          NUMERIC(10, 6)           -- non-null for agent_action rows
);
CREATE INDEX IF NOT EXISTS idx_app_events_app_time   ON application_events (application_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_type       ON application_events (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_service    ON application_events (service_name, occurred_at DESC);

-- Drafted credit memo (and its revisions). The agent writes the canonical
-- draft; the underwriter may edit; both are preserved with revision_number.
-- memo_body conforms to usecases/credit-memo-commercial/schemas/credit_memo.schema.json.

CREATE TABLE IF NOT EXISTS application_artifacts (
    id                BIGSERIAL PRIMARY KEY,
    application_id    UUID NOT NULL REFERENCES application_state(application_id) ON DELETE CASCADE,
    artifact_type     VARCHAR(40) NOT NULL,    -- credit_memo | source_doc_extract | regulator_export
    revision_number   INTEGER NOT NULL DEFAULT 1,
    author            VARCHAR(40) NOT NULL,    -- agent | underwriter | system
    body              JSONB NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (application_id, artifact_type, revision_number)
);
CREATE INDEX IF NOT EXISTS idx_app_artifacts_app ON application_artifacts (application_id, artifact_type, revision_number DESC);

-- application_documents — one row per uploaded document per application.
-- Multi-doc applications (a 10-K + 10-Q + AR aging + board minutes for a
-- $200M+ loan, say) put one row each here; the document-extractor service
-- processes each one in parallel and updates extraction_status per row.
--
-- Lifecycle:
--   1. UI uploads PDF → /api/applications writes one row with
--      extraction_status='pending' + gcs_uri pointing at the stored bytes.
--   2. Cloud Workflows fans out: per doc → document-extractor service.
--   3. document-extractor writes one application_events row
--      (event_type='document_extracted') AND updates this row's
--      extraction_status to 'extracted'/'failed' + extraction_event_id.
--   4. Validation gate reads missing_required_fields[] across all rows;
--      if any required doc is in 'failed' status OR if missing-fields
--      coverage violates application_completeness, the workflow routes
--      to return_for_revision.
--
-- The UI's per-document panel reads this table to render the per-doc
-- card stack with extraction status badges + missing-fields chips.

CREATE TABLE IF NOT EXISTS application_documents (
    doc_id              UUID PRIMARY KEY,
    application_id      UUID NOT NULL REFERENCES application_state(application_id) ON DELETE CASCADE,
    doc_type            VARCHAR(50) NOT NULL,         -- 10-K | 10-Q | audited_financials | AR_aging | board_minutes | appraisal | business_plan
    original_filename   VARCHAR(500) NOT NULL,        -- as uploaded; for the UI doc-card label
    gcs_uri             VARCHAR(1000) NOT NULL,       -- gs://<bucket>/applications/<app_id>/documents/<doc_id>.pdf
    file_size_bytes     BIGINT NOT NULL CHECK (file_size_bytes > 0),
    sha256_hex          VARCHAR(64) NOT NULL,         -- content fingerprint; used for idempotent re-uploads
    extraction_status   VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (extraction_status IN ('pending', 'extracting', 'extracted', 'failed', 'returned_for_revision')),
    extraction_event_id BIGINT REFERENCES application_events(id) ON DELETE SET NULL,
    page_count          INTEGER,
    confidence          NUMERIC(5, 4),
    missing_required_fields JSONB,                    -- written by document-extractor: list of dotted paths
    error_code          VARCHAR(80),                  -- when extraction_status='failed'
    error_message       TEXT,
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    extracted_at        TIMESTAMPTZ,
    UNIQUE (application_id, sha256_hex)               -- idempotent re-uploads of the same content
);
CREATE INDEX IF NOT EXISTS idx_app_docs_app           ON application_documents (application_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_docs_status        ON application_documents (extraction_status, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_docs_type          ON application_documents (doc_type, application_id);

-- Borrower master + existing loan facilities. Reference data; populated by
-- a one-time seed script. Used by exposure-aggregator + the CCO portfolio
-- view to compute concentration ratios in real time.

CREATE TABLE IF NOT EXISTS borrower_master (
    borrower_id           VARCHAR(100) PRIMARY KEY,
    legal_name            VARCHAR(200) NOT NULL,
    dba_name              VARCHAR(200),
    ein                   VARCHAR(20),                  -- redacted at write time except last 4
    naics_code            VARCHAR(10),
    primary_state         VARCHAR(2),
    relationship_since    DATE,
    risk_rating           VARCHAR(40),                  -- current OCC band
    is_public             BOOLEAN DEFAULT FALSE,
    sec_cik               VARCHAR(20),                  -- if is_public
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loan_facilities (
    facility_id           UUID PRIMARY KEY,
    borrower_id           VARCHAR(100) NOT NULL REFERENCES borrower_master(borrower_id) ON DELETE CASCADE,
    facility_type         VARCHAR(40) NOT NULL,         -- term_loan | revolver | line_of_credit | construction | mortgage
    committed_usd         NUMERIC(18, 2) NOT NULL,
    outstanding_usd       NUMERIC(18, 2) NOT NULL DEFAULT 0,
    origination_date      DATE NOT NULL,
    maturity_date         DATE,
    interest_rate         NUMERIC(8, 6),
    risk_rating           VARCHAR(40),
    status                VARCHAR(30) NOT NULL DEFAULT 'active',  -- active | paid | charged_off | restructured
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loan_facilities_borrower ON loan_facilities (borrower_id, status);
CREATE INDEX IF NOT EXISTS idx_loan_facilities_status   ON loan_facilities (status, maturity_date);

-- Rules-service evaluation audit. Already exists implicitly via audit_events
-- in some services, but for the live demo we want a clean count of rule-set
-- evaluations per application. This is a view; no new physical table.

CREATE OR REPLACE VIEW v_rule_evaluations AS
SELECT
    application_id,
    payload ->> 'rule_set'             AS rule_set,
    payload ->> 'decision'             AS decision,
    payload ->> 'reason'               AS reason,
    occurred_at,
    latency_ms
FROM application_events
WHERE event_type = 'rule_evaluated';

-- ============================================================================
-- Borrower fixtures for the live demo (12 borrowers across 5 sectors).
-- The hero scenario uses LECO (Lincoln Electric, real public 10-K).
-- The other 11 are synthetic but internally consistent.
-- ============================================================================
INSERT INTO borrower_master (borrower_id, legal_name, dba_name, ein, naics_code, primary_state, relationship_since, risk_rating, is_public, sec_cik, notes) VALUES
    -- HERO (real public company, real 10-K)
    ('BRW-LECO',     'Lincoln Electric Holdings, Inc.', 'Lincoln Electric',   '***-3445', '333992', 'OH', '2018-03-12', '1-pass',            TRUE,  '0000059527', 'Hero scenario · NYSE LECO · welding/cutting equipment global leader'),
    -- 4 healthy / approve cases
    ('BRW-APEX-MFG', 'Apex Precision Components LLC',   'Apex Precision',     '***-2201', '332710', 'MI', '2014-07-01', '1-pass',            FALSE, NULL,         'Family-owned precision machining; multi-year relationship'),
    ('BRW-RIDGE-HC', 'Ridgecrest Health Holdings Inc.', 'Ridgecrest Health',  '***-7712', '622110', 'TX', '2019-11-22', '1-pass',            FALSE, NULL,         'Regional hospital network; growing'),
    ('BRW-NRTH-MTL', 'Northbridge Metals Corp',         'Northbridge Metals', '***-3387', '331110', 'PA', '2012-02-14', '2-special-mention', FALSE, NULL,         'Steel fabrication; cyclical exposure'),
    ('BRW-SUMMIT-RT','Summit Outfitters Inc.',          'Summit Outfitters',  '***-4451', '451110', 'CO', '2016-05-30', '1-pass',            FALSE, NULL,         'Outdoor retail chain; healthy cash flow'),
    -- 4 borderline / conditional cases
    ('BRW-LIGHT-HC', 'Lighthouse Health Group LLC',     'Lighthouse Health',  '***-1188', '622110', 'FL', '2020-08-04', '2-special-mention', FALSE, NULL,         'Regional hospital; thin DSCR headroom'),
    ('BRW-DELTA-CN', 'Delta Construction Holdings',     'Delta Construction', '***-9933', '237310', 'GA', '2017-04-18', '2-special-mention', FALSE, NULL,         'Highway/bridge contractor; CRE-heavy'),
    ('BRW-PEAK-LOG', 'Peak Logistics Group Inc.',       'Peak Logistics',     '***-2244', '484121', 'IL', '2013-10-09', '2-special-mention', FALSE, NULL,         'Trucking; rate-sensitive'),
    ('BRW-VINEYARD', 'Vineyard Foods Co.',              'Vineyard Foods',     '***-5566', '311422', 'CA', '2015-06-25', '1-pass',            FALSE, NULL,         'Specialty food producer; acquisition pending'),
    -- 3 stress / decline cases
    ('BRW-IRONFOR',  'Ironfork Restaurants Group',      'Ironfork',           '***-8821', '722511', 'TN', '2021-03-30', '3-substandard',     FALSE, NULL,         'Casual dining chain; covenant breach risk'),
    ('BRW-COASTER',  'Coaster Real Estate LLC',         'Coaster RE',         '***-1199', '531110', 'NY', '2014-01-15', '2-special-mention', FALSE, NULL,         'CRE concentration alert'),
    ('BRW-INSIDER',  'Magnolia Holdings Trust',         'Magnolia Holdings',  '***-7700', '525990', 'AL', '2022-09-12', '2-special-mention', FALSE, NULL,         'Reg O insider — board member is principal')
ON CONFLICT (borrower_id) DO NOTHING;

INSERT INTO loan_facilities (facility_id, borrower_id, facility_type, committed_usd, outstanding_usd, origination_date, maturity_date, interest_rate, risk_rating, status) VALUES
    -- LECO: large existing relationship (revolver + term)
    ('11111111-0000-0000-0000-000000000001', 'BRW-LECO',     'revolver',           50000000.00, 12000000.00, '2022-06-01', '2027-06-01', 0.0625, '1-pass',            'active'),
    ('11111111-0000-0000-0000-000000000002', 'BRW-LECO',     'term_loan',          75000000.00, 60000000.00, '2023-09-15', '2030-09-15', 0.0575, '1-pass',            'active'),
    -- Apex
    ('11111111-0000-0000-0000-000000000003', 'BRW-APEX-MFG', 'term_loan',          12000000.00,  8500000.00, '2022-04-10', '2027-04-10', 0.0700, '1-pass',            'active'),
    ('11111111-0000-0000-0000-000000000004', 'BRW-APEX-MFG', 'line_of_credit',      3000000.00,   500000.00, '2023-01-15', '2026-01-15', 0.0825, '1-pass',            'active'),
    -- Ridgecrest
    ('11111111-0000-0000-0000-000000000005', 'BRW-RIDGE-HC', 'term_loan',          18000000.00, 14200000.00, '2021-08-22', '2028-08-22', 0.0610, '1-pass',            'active'),
    -- Northbridge
    ('11111111-0000-0000-0000-000000000006', 'BRW-NRTH-MTL', 'term_loan',           9500000.00,  7800000.00, '2022-10-01', '2027-10-01', 0.0750, '2-special-mention', 'active'),
    -- Summit
    ('11111111-0000-0000-0000-000000000007', 'BRW-SUMMIT-RT','revolver',           15000000.00,  4500000.00, '2023-02-12', '2028-02-12', 0.0680, '1-pass',            'active'),
    -- Lighthouse
    ('11111111-0000-0000-0000-000000000008', 'BRW-LIGHT-HC', 'term_loan',          12000000.00,  9800000.00, '2022-11-05', '2027-11-05', 0.0720, '2-special-mention', 'active'),
    -- Delta
    ('11111111-0000-0000-0000-000000000009', 'BRW-DELTA-CN', 'construction',       22000000.00, 16500000.00, '2023-06-20', '2026-06-20', 0.0780, '2-special-mention', 'active'),
    -- Peak
    ('11111111-0000-0000-0000-000000000010', 'BRW-PEAK-LOG', 'term_loan',           8500000.00,  6800000.00, '2022-03-30', '2027-03-30', 0.0710, '2-special-mention', 'active'),
    -- Vineyard
    ('11111111-0000-0000-0000-000000000011', 'BRW-VINEYARD', 'term_loan',          14000000.00, 11000000.00, '2023-04-01', '2028-04-01', 0.0670, '1-pass',            'active'),
    -- Ironfork
    ('11111111-0000-0000-0000-000000000012', 'BRW-IRONFOR',  'term_loan',           7500000.00,  6400000.00, '2022-08-15', '2027-08-15', 0.0810, '3-substandard',     'active'),
    -- Coaster RE (large existing)
    ('11111111-0000-0000-0000-000000000013', 'BRW-COASTER',  'mortgage',           30000000.00, 26500000.00, '2021-12-01', '2031-12-01', 0.0590, '2-special-mention', 'active'),
    -- Magnolia (insider)
    ('11111111-0000-0000-0000-000000000014', 'BRW-INSIDER',  'term_loan',           5000000.00,  4200000.00, '2023-01-30', '2028-01-30', 0.0750, '2-special-mention', 'active')
ON CONFLICT (facility_id) DO NOTHING;

-- ============================================================================
-- LISTEN/NOTIFY plumbing for the live SSE feed.
-- The pipeline-console subscribes via `LISTEN application_state_changed` and
-- pushes the new row to all connected browser tabs whenever the orchestrator
-- (or any service) writes to application_state. The trigger fires on both
-- INSERT and UPDATE; the payload is just the application_id (the SSE handler
-- re-queries the row + recent events to build the push frame).
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_application_state_changed() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('application_state_changed', NEW.application_id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_app_state_changed'
  ) THEN
    CREATE TRIGGER trg_app_state_changed
    AFTER INSERT OR UPDATE ON application_state
    FOR EACH ROW EXECUTE FUNCTION notify_application_state_changed();
  END IF;
END $$;
