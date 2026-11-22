import { NextRequest, NextResponse } from "next/server";
import { ensureAuthTables, pool } from "@/lib/db";
import { ensureWithdrawalsTable } from "@/lib/deposits-db";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const withdrawalId = Number(rawId);
    if (!Number.isInteger(withdrawalId) || withdrawalId <= 0) {
      return NextResponse.json({ ok: false, error: "ID de saque inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "").trim().toUpperCase();
    if (action !== "PAID" && action !== "REJECTED") {
      return NextResponse.json(
        { ok: false, error: "Ação inválida. Use PAID ou REJECTED." },
        { status: 400 }
      );
    }

    await ensureAuthTables();
    await ensureWithdrawalsTable();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const res = await client.query(
        `SELECT id, player_id, amount_cents::text, status
         FROM withdrawals
         WHERE id = $1
         FOR UPDATE`,
        [withdrawalId]
      );

      const row = res.rows[0] as
        | { id: number; player_id: number; amount_cents: string; status: string }
        | undefined;

      if (!row) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "Saque não encontrado." }, { status: 404 });
      }

      if (row.status !== "PENDING") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { ok: false, error: `Saque já está como ${row.status}.` },
          { status: 409 }
        );
      }

      if (action === "REJECTED") {
        await client.query(
          `UPDATE players
           SET balance_cents = balance_cents + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [Number(row.amount_cents), row.player_id]
        );
      }

      const updatedRes = await client.query(
        `UPDATE withdrawals
         SET status = $1,
             processed_at = NOW()
         WHERE id = $2
         RETURNING id, player_id, amount_cents::text, pix_key, status, created_at, processed_at`,
        [action, withdrawalId]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        ok: true,
        withdrawal: updatedRes.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar saque.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
