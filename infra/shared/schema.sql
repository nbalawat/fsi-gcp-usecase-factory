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
