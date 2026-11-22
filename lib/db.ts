import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}

export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),
  connect: () => pool.connect(),
};

let authTablesEnsured = false;

export async function ensureAuthTables() {
  if (authTablesEnsured) return;

  await pool.query(`
    ALTER TABLE players
      ADD COLUMN IF NOT EXISTS full_name TEXT,
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS password_hash TEXT,
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await pool.query(`
    UPDATE players
    SET phone = NULL
    WHERE phone IS NOT NULL AND btrim(phone) = '';
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS players_email_unique_idx
      ON players (LOWER(email))
      WHERE email IS NOT NULL;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS players_phone_unique_idx
      ON players (phone)
      WHERE phone IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS email_verifications_email_idx
      ON email_verifications (LOWER(email), created_at DESC);
  `);

  authTablesEnsured = true;
}
