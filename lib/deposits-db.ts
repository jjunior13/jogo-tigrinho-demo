import { db } from "@/lib/db";

export async function ensureInfinitePayDepositsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS infinitepay_deposits (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      order_nsu VARCHAR(64) NOT NULL UNIQUE,
      amount_cents BIGINT NOT NULL,
      paid_amount_cents BIGINT,
      checkout_url TEXT,
      transaction_nsu VARCHAR(120),
      invoice_slug VARCHAR(120),
      capture_method VARCHAR(32),
      receipt_url TEXT,
      status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function ensurePixDepositsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pix_deposits (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      txid VARCHAR(64) NOT NULL UNIQUE,
      external_reference VARCHAR(120),
      mp_payment_id VARCHAR(120) UNIQUE,
      amount_cents BIGINT NOT NULL,
      pix_key VARCHAR(120) NOT NULL,
      pix_copy_paste TEXT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE pix_deposits
    ADD COLUMN IF NOT EXISTS external_reference VARCHAR(120),
    ADD COLUMN IF NOT EXISTS mp_payment_id VARCHAR(120),
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS pix_deposits_mp_payment_id_idx
    ON pix_deposits (mp_payment_id)
    WHERE mp_payment_id IS NOT NULL
  `);
}

export async function ensureWithdrawalsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      amount_cents BIGINT NOT NULL,
      pix_key VARCHAR(140) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    )
  `);
}
