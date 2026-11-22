import { NextRequest, NextResponse } from "next/server";
import { db, ensureAuthTables, pool } from "@/lib/db";
import { ensureInfinitePayDepositsTable } from "@/lib/deposits-db";

const DEFAULT_HANDLE = "jose-filgueiras-hi7";
const DEFAULT_API_KEY = "inchk_9FZde3PuXnU-rba388Rb4bKkxJAjBYKuIRKyEdWoXKA";

export async function POST(req: NextRequest) {
  try {
    await ensureAuthTables();
    await ensureInfinitePayDepositsTable();

    const body = await req.json().catch(() => ({}));
    const orderNsu = String(body?.order_nsu ?? "").trim();
    if (!orderNsu) {
      return NextResponse.json({ ok: false, error: "order_nsu obrigatório." }, { status: 400 });
    }

    const depQuery = await db.query(`SELECT id, player_id, amount_cents::text, status, transaction_nsu, invoice_slug
       FROM infinitepay_deposits
       WHERE order_nsu = $1
       LIMIT 1`, [orderNsu]);

    const dep = depQuery.rows[0] as
      | {
          id: number;
          player_id: number;
          amount_cents: string;
          status: string;
          transaction_nsu: string | null;
          invoice_slug: string | null;
        }
      | undefined;
    if (!dep) {
      return NextResponse.json({ ok: false, error: "Pedido não encontrado." }, { status: 404 });
    }

    if (dep.status === "PAID") {
      const playerRes = await db.query(
        "SELECT id, username, full_name, email, phone, balance_cents::text FROM players WHERE id = $1",
        [dep.player_id]
      );
      return NextResponse.json({ ok: true, paid: true, player: playerRes.rows[0] ?? null });
    }

    const handle = (process.env.INFINITEPAY_HANDLE || DEFAULT_HANDLE).trim();
    const apiKey = (process.env.INFINITEPAY_API_KEY || DEFAULT_API_KEY).trim();

    const checkRes = await fetch("https://api.checkout.infinitepay.io/payment_check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        handle,
        order_nsu: orderNsu,
        ...(dep.transaction_nsu ? { transaction_nsu: dep.transaction_nsu } : {}),
        ...(dep.invoice_slug ? { slug: dep.invoice_slug } : {}),
      }),
      cache: "no-store",
    });

    const checkData = await checkRes.json().catch(() => null);
    if (!checkRes.ok || !checkData?.success || !checkData?.paid) {
      return NextResponse.json({ ok: true, paid: false });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<{ status: string; amount_cents: string }>(
        `SELECT status, amount_cents::text FROM infinitepay_deposits WHERE id = $1 FOR UPDATE`,
        [dep.id]
      );
      if (locked.rows[0]?.status === "PENDING") {
        const creditCents = Number(locked.rows[0].amount_cents);
        const paidAmountCents =
          typeof checkData.paid_amount === "number" ? Math.round(checkData.paid_amount) : creditCents;
        await client.query(
          `UPDATE infinitepay_deposits
           SET status = 'PAID',
               paid_amount_cents = $1,
               capture_method = COALESCE($2, capture_method),
               paid_at = NOW()
           WHERE id = $3`,
          [paidAmountCents, checkData.capture_method ?? null, dep.id]
        );
        await client.query(
          `UPDATE players
           SET balance_cents = balance_cents + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [creditCents, dep.player_id]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const playerRes = await db.query(
      "SELECT id, username, full_name, email, phone, balance_cents::text FROM players WHERE id = $1",
      [dep.player_id]
    );

    return NextResponse.json({ ok: true, paid: true, player: playerRes.rows[0] ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao verificar pagamento.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
