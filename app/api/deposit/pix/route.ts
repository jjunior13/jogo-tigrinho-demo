import { NextResponse } from "next/server";
import crypto from "crypto";
import { db, ensureAuthTables, pool } from "@/lib/db";
import { getOrCreatePlayer } from "@/lib/game-db";

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

function buildPixPayload(params: { txid: string; amountCents: number; pixKey: string; merchantName: string }) {
  const reais = (params.amountCents / 100).toFixed(2);
  return `00020126580014BR.GOV.BCB.PIX0136${params.pixKey}520400005303986540${reais.length.toString().padStart(2, "0")}${reais}5802BR5913${params.merchantName.slice(0, 13).padEnd(13, " ")}6009SAO PAULO62140510${params.txid.slice(0, 10).padEnd(10, "0")}6304`;
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
    const pixKey = process.env.PIX_KEY || "08391656764";
    const merchantName = process.env.PIX_MERCHANT_NAME || "TIGRINHO PIX";
    const pixCopyPaste = buildPixPayload({ txid, amountCents, pixKey, merchantName });

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
        [player.id, txid, amountCents, pixKey, pixCopyPaste]
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
        pix_copy_paste: pixCopyPaste,
        status: "PAID",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar depósito PIX.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
