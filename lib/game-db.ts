import { pool } from "@/lib/db";

export interface PlayerRecord {
  id: number;
  username: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  balance_cents: string;
}

export async function getOrCreatePlayer(username: string): Promise<PlayerRecord> {
  const cleanUsername = username.trim().toLowerCase();
  const existing = await pool.query<PlayerRecord>(
    `SELECT id, username, full_name, email, phone, balance_cents::text
     FROM players
     WHERE username = $1`,
    [cleanUsername]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const inserted = await pool.query<PlayerRecord>(
    `INSERT INTO players (username, balance_cents)
     VALUES ($1, 10000)
     ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
     RETURNING id, username, full_name, email, phone, balance_cents::text`,
    [cleanUsername]
  );

  return inserted.rows[0];
}

export async function registerSpin(params: {
  playerId: number;
  betCents: number;
  payoutCents: number;
  outcome: string;
}) {
  const { playerId, betCents, payoutCents, outcome } = params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const updated = await client.query<{ balance_cents: string }>(
      `UPDATE players
       SET balance_cents = balance_cents - $1 + $2,
           updated_at = NOW()
       WHERE id = $3 AND balance_cents >= $1
       RETURNING balance_cents::text`,
      [betCents, payoutCents, playerId]
    );

    if (!updated.rows[0]) {
      throw new Error("SALDO_INSUFICIENTE");
    }

    const spin = await client.query<{
      id: number;
      bet_cents: string;
      payout_cents: string;
      outcome: string;
      created_at: string;
    }>(
      `INSERT INTO spins (player_id, bet_cents, payout_cents, outcome)
       VALUES ($1, $2, $3, $4)
       RETURNING id, bet_cents::text, payout_cents::text, outcome, created_at`,
      [playerId, betCents, payoutCents, outcome]
    );

    await client.query("COMMIT");

    return {
      balance_cents: updated.rows[0].balance_cents,
      spin: spin.rows[0],
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
