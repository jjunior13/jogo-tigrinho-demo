import { NextRequest, NextResponse } from "next/server";
import { db, ensureAuthTables, pool } from "@/lib/db";
import { ensureInfinitePayDepositsTable } from "@/app/api/deposit/infinitepay/route";

const DEFAULT_HANDLE = "jose-filgueiras-hi7";
const DEFAULT_API_KEY = "inchk_9FZde3PuXnU-rba388Rb4bKkxJAjBYKuIRKyEdWoXKA";

async function verifyInfinitePayPayment(params: {
  orderNsu: string;
  transactionNsu?: string;
  slug?: string;
}) {
  const handle = (process.env.INFINITEPAY_HANDLE || DEFAULT_HANDLE).trim();
  const apiKey = (process.env.INFINITEPAY_API_KEY || DEFAULT_API_KEY).trim();

  const res = await fetch("https://api.checkout.infinitepay.io/payment_check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      handle,
      order_nsu: params.orderNsu,
      ...(params.transactionNsu ? { transaction_nsu: params.transactionNsu } : {}),
      ...(params.slug ? { slug: params.slug } : {}),
    }),
    cache: "no-store",
  });

  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as {
    success?: boolean;
    paid?: boolean;
    amount?: number;
    paid_amount?: number;
    installments?: number;
    capture_method?: string;
  } | null;
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuthTables();
    await ensureInfinitePayDepositsTable();

    const body = await req.json().catch(() => ({}));
    const orderNsu = String(body?.order_nsu ?? "").trim();
    const transactionNsu = body?.transaction_nsu ? String(body.transaction_nsu).trim() : "";
    const invoiceSlug = body?.invoice_slug ? String(body.invoice_slug).trim() : "";
    const receiptUrl = body?.receipt_url ? String(body.receipt_url).trim() : null;

    if (!orderNsu) {
      return NextResponse.json({ ok: false, error: "order_nsu ausente." }, { status: 400 });
    }

    const check = await verifyInfinitePayPayment({
      orderNsu,
      transactionNsu: transactionNsu || undefined,
      slug: invoiceSlug || undefined,
    });

    if (!check?.success || !check?.paid) {
      return NextResponse.json({
        ok: true,
        credited: false,
        status: "not_paid_yet",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const depRes = await client.query<{
        id: number;
        player_id: number;
        amount_cents: string;
        status: string;
      }>(
        `SELECT id, player_id, amount_cents::text, status
         FROM infinitepay_deposits
         WHERE order_nsu = $1
         LIMIT 1
         FOR UPDATE`,
        [orderNsu]
      );

      const deposit = depRes.rows[0];
      if (!deposit) {
        await client.query("COMMIT");
        return NextResponse.json({ ok: true, ignored: "Pedido não encontrado." });
      }

      if (deposit.status === "PAID") {
        await client.query("COMMIT");
        return NextResponse.json({ ok: true, alreadyCredited: true, order_nsu: orderNsu });
      }

      const creditCents = Number(deposit.amount_cents);
      const paidAmountCents =
        typeof check.paid_amount === "number" && Number.isFinite(check.paid_amount)
          ? Math.round(check.paid_amount)
          : creditCents;
      const captureMethod = check.capture_method || (body?.capture_method ? String(body.capture_method) : null);

      await client.query(
        `UPDATE infinitepay_deposits
         SET status = 'PAID',
             paid_amount_cents = $1,
             transaction_nsu = COALESCE(NULLIF($2, ''), transaction_nsu),
             invoice_slug = COALESCE(NULLIF($3, ''), invoice_slug),
             capture_method = COALESCE($4, capture_method),
             receipt_url = COALESCE($5, receipt_url),
             paid_at = NOW()
         WHERE id = $6 AND status = 'PENDING'`,
        [paidAmountCents, transactionNsu, invoiceSlug, captureMethod, receiptUrl, deposit.id]
      );

      await client.query(
        `UPDATE players
         SET balance_cents = balance_cents + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [creditCents, deposit.player_id]
      );

      await client.query("COMMIT");

      const updatedPlayer = await db.query(
        "SELECT id, username, full_name, email, phone, balance_cents::text FROM players WHERE id = $1",
        [deposit.player_id]
      );

      return NextResponse.json({
        ok: true,
        credited: true,
        order_nsu: orderNsu,
        amount_cents: String(creditCents),
        player: updatedPlayer.rows[0] ?? null,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar webhook InfinitePay.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "infinitepay-webhook" });
}
