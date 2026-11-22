import { NextResponse } from "next/server";
import crypto from "crypto";
import { db, ensureAuthTables, pool } from "@/lib/db";
import { getOrCreatePlayer } from "@/lib/game-db";

const RANDOM_PIX_KEY = "2cc770b8-cc13-46f2-a57f-7e840b1d1f33";

async function ensurePixDepositsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pix_deposits (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      txid VARCHAR(64) NOT NULL UNIQUE,
      amount_cents BIGINT NOT NULL,
      pix_key VARCHAR(120) NOT NULL,
      pix_copy_paste TEXT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'PAID',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = String(body?.username ?? "").trim().toLowerCase();
    const amountCents = Number(body?.amountCents);

    if (!username) {
      return NextResponse.json({ ok: false, error: "Jogador inválido." }, { status: 400 });
    }

    if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 10000000) {
      return NextResponse.json(
        { ok: false, error: "Valor de depósito inválido. Informe entre R$ 1,00 e R$ 100.000,00." },
        { status: 400 }
      );
    }

    await ensureAuthTables();
    await ensurePixDepositsTable();

    const player = await getOrCreatePlayer(username);
    const txid = "PIX" + crypto.randomBytes(6).toString("hex").toUpperCase();
    const pixKey = RANDOM_PIX_KEY;

    const client = await pool.connect();
    let updatedBalanceCents = player.balance_cents;

    try {
      await client.query("BEGIN");

      const balanceRes = await client.query<{ balance_cents: string }>(
        `UPDATE players
         SET balance_cents = balance_cents + $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING balance_cents::text`,
        [amountCents, player.id]
      );

      updatedBalanceCents = balanceRes.rows[0]?.balance_cents ?? player.balance_cents;

      await client.query(
        `INSERT INTO pix_deposits (player_id, txid, amount_cents, pix_key, pix_copy_paste, status)
         VALUES ($1, $2, $3, $4, $5, 'PAID')`,
        [player.id, txid, amountCents, pixKey, pixKey]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const updatedPlayerRes = await db.query(
      "SELECT id, username, full_name, email, phone, balance_cents::text FROM players WHERE id = $1",
      [player.id]
    );

    return NextResponse.json({
      ok: true,
      player: updatedPlayerRes.rows[0] ?? {
        ...player,
        balance_cents: updatedBalanceCents,
      },
      deposit: {
        txid,
        amount_cents: String(amountCents),
        pix_key: pixKey,
        pix_copy_paste: pixKey,
        status: "PAID",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar depósito PIX.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
