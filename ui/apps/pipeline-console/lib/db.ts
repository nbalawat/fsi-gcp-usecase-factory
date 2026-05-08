/**
 * Cloud SQL connection — one shared `pg` Pool for the whole Next.js process.
 *
 * Connection precedence (matches the atomic-service convention in
 * services/atomic/<svc>/main.py::_get_engine):
 *
 *   1. DATABASE_URL — preferred. e.g. postgres://fsi_app:***@127.0.0.1:5432/fsi_banking
 *      Works for: local Cloud SQL Auth Proxy, AWS RDS, Azure Postgres, on-prem.
 *   2. DB_USER / DB_PASS / DB_NAME / INSTANCE_CONNECTION_NAME — Cloud SQL via
 *      Unix socket (`/cloudsql/<INSTANCE_CONNECTION_NAME>`) when running on
 *      Cloud Run. The socket path encodes the instance, no proxy needed.
 *   3. Local fallback — postgres://fsi_app@localhost:5432/fsi_banking, useful
 *      when a developer has the proxy running but didn't set DATABASE_URL.
 *
 * The pool is created lazily on first use and reused across requests + the
 * SSE LISTEN client. Routes that fail to connect should return 503 with a
 * helpful message rather than crash the dev server — see `withConnection`.
 */

import { Pool, type PoolConfig } from "pg";

let _pool: Pool | null = null;

function buildPoolConfig(): PoolConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return { connectionString: databaseUrl, max: 10 };
  }
  const instance = process.env.INSTANCE_CONNECTION_NAME;
  if (instance) {
    // Cloud Run + Cloud SQL Unix-socket path. Don't set host; let pg use the
    // Unix socket directory (libpq convention).
    return {
      host: `/cloudsql/${instance}`,
      user: process.env.DB_USER ?? "fsi_app",
      password: process.env.DB_PASS,
      database: process.env.DB_NAME ?? "fsi_banking",
      max: 10,
    };
  }
  // Local-dev fallback: assume the Cloud SQL Auth Proxy is on 127.0.0.1:5432.
  return {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "fsi_app",
    password: process.env.DB_PASS,
    database: process.env.DB_NAME ?? "fsi_banking",
    max: 10,
  };
}

export function getPool(): Pool {
  if (_pool === null) {
    _pool = new Pool(buildPoolConfig());
    // Don't crash the Next.js process on idle-client errors — just log.
    _pool.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[pg pool] idle client error:", err.message);
    });
  }
  return _pool;
}

/**
 * Run a function with a Pool, mapping connection failures to a typed result
 * so route handlers can return 503 instead of throwing.
 */
export async function withConnection<T>(
  fn: (pool: Pool) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    const pool = getPool();
    const value = await fn(pool);
    return { ok: true, value };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("[pg] connection error:", msg);
    return { ok: false, error: msg };
  }
}

/** True if any DB connection config is plausibly configured. */
export function isDbConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL ||
      process.env.INSTANCE_CONNECTION_NAME ||
      process.env.DB_HOST,
  );
}

/** Friendly 503 message used by API routes when the DB is unreachable. */
export const DB_UNAVAILABLE_MESSAGE =
  "Cloud SQL is not reachable. In dev, run the Cloud SQL Auth Proxy " +
  "(`cloud-sql-proxy <project>:<region>:fsi-banking-dev=tcp:5432`) " +
  "and set DATABASE_URL — see ui/apps/pipeline-console/README.md.";
