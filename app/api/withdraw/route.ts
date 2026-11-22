import { NextRequest, NextResponse } from "next/server";
import { db, ensureAuthTables, pool } from "@/lib/db";
import { getOrCreatePlayer } from "@/lib/game-db";
import { ensureWithdrawalsTable } from "@/lib/deposits-db";

export async function GET(req: NextRequest) {
  try {
    const username = String(req.nextUrl.searchParams.get("username") ?? "")
      .trim()
      .toLowerCase();
    if (!username) {
      return NextResponse.json({ ok: false, error: "Jogador obrigatório." }, { status: 400 });
    }

    await ensureAuthTables();
    await ensureWithdrawalsTable();
    const player = await getOrCreatePlayer(username);

    const listRes = await db.query(
      `SELECT id, amount_cents::text, pix_key, status, created_at
       FROM withdrawals
       WHERE player_id = $1
       ORDER BY id DESC
       LIMIT 10`,
      [player.id]
    );

    return NextResponse.json({
      ok: true,
      withdrawals: listRes.rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao buscar saques.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body?.username ?? "").trim().toLowerCase();
    const pixKey = String(body?.pixKey ?? "").trim();
    const amountCents = Number(body?.amountCents);

    if (!username) {
      return NextResponse.json({ ok: false, error: "Jogador inválido." }, { status: 400 });
    }

    if (!pixKey || pixKey.length < 4 || pixKey.length > 140) {
      return NextResponse.json(
        { ok: false, error: "Informe uma chave PIX válida." },
        { status: 400 }
      );
    }

    if (!Number.isInteger(amountCents) || amountCents < 1000 || amountCents > 10000000) {
      return NextResponse.json(
        { ok: false, error: "Informe um valor de saque entre R$ 10,00 e R$ 100.000,00." },
        { status: 400 }
      );
    }

    await ensureAuthTables();
    await ensureWithdrawalsTable();
    const player = await getOrCreatePlayer(username);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const playerLockRes = await client.query(
        `SELECT id, balance_cents::text
         FROM players
         WHERE id = $1
         FOR UPDATE`,
        [player.id]
      );

      const lockedPlayer = playerLockRes.rows[0] as
        | { id: number; balance_cents: string }
        | undefined;

      if (!lockedPlayer) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "Jogador não encontrado." }, { status: 404 });
      }

      const currentBalance = Number(lockedPlayer.balance_cents);
      if (currentBalance < amountCents) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { ok: false, error: "Saldo insuficiente para este saque." },
          { status: 400 }
        );
      }

      const updatedPlayerRes = await client.query(
        `UPDATE players
         SET balance_cents = balance_cents - $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING id, username, full_name, email, phone, balance_cents::text`,
        [amountCents, player.id]
      );

      const insertRes = await client.query(
        `INSERT INTO withdrawals (player_id, amount_cents, pix_key, status)
         VALUES ($1, $2, $3, 'PENDING')
         RETURNING id, amount_cents::text, pix_key, status, created_at`,
        [player.id, amountCents, pixKey]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        ok: true,
        withdrawal: insertRes.rows[0],
        player: updatedPlayerRes.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao solicitar saque.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
