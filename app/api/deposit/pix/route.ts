import { NextResponse } from "next/server";
import crypto from "crypto";
import { db, ensureAuthTables, pool } from "@/lib/db";
import { getOrCreatePlayer } from "@/lib/game-db";

const CPF_PIX_KEY = "08391656764";

import { ensurePixDepositsTable } from "@/lib/deposits-db";

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
    const externalReference = `dep_${player.id}_${txid}`;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO pix_deposits (
           player_id, txid, external_reference, amount_cents, pix_key, pix_copy_paste, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')`,
        [player.id, txid, externalReference, amountCents, CPF_PIX_KEY, CPF_PIX_KEY]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({
      ok: true,
      player,
      deposit: {
        txid,
        external_reference: externalReference,
        amount_cents: String(amountCents),
        pix_key: CPF_PIX_KEY,
        status: "PENDING",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao iniciar depósito PIX.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
