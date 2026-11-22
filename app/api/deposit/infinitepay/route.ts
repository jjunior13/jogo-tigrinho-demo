import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db, ensureAuthTables, pool } from "@/lib/db";
import { getOrCreatePlayer } from "@/lib/game-db";

const DEFAULT_HANDLE = "jose-filgueiras-hi7";
const DEFAULT_API_KEY = "inchk_9FZde3PuXnU-rba388Rb4bKkxJAjBYKuIRKyEdWoXKA";

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

function normalizeBrPhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`;
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = String(body?.username ?? "").trim().toLowerCase();
    const amountCents = Number(body?.amountCents);

    if (!username) {
      return NextResponse.json({ ok: false, error: "Jogador inválido." }, { status: 400 });
    }

    if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 10000000) {
      return NextResponse.json(
        { ok: false, error: "Informe um valor válido entre R$ 1,00 e R$ 100.000,00." },
        { status: 400 }
      );
    }

    await ensureAuthTables();
    await ensureInfinitePayDepositsTable();

    const player = await getOrCreatePlayer(username);
    const orderNsu = `TIG${player.id}${Date.now()}${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      req.nextUrl.origin;

    const handle = (process.env.INFINITEPAY_HANDLE || DEFAULT_HANDLE).trim();
    const apiKey = (process.env.INFINITEPAY_API_KEY || DEFAULT_API_KEY).trim();

    const customerPhone = normalizeBrPhone(player.phone);
    const customer: Record<string, string> = {
      name: (player.full_name || player.username || "Jogador").trim(),
    };
    if (player.email) customer.email = player.email.trim();
    if (customerPhone) customer.phone_number = customerPhone;

    const payload = {
      handle,
      order_nsu: orderNsu,
      items: [
        {
          quantity: 1,
          price: amountCents,
          description: `Recarga de Saldo - ${player.username}`,
        },
      ],
      redirect_url: `${origin}/?pagamento=concluido&order_nsu=${encodeURIComponent(orderNsu)}`,
      webhook_url: `${origin}/api/webhooks/infinitepay`,
      customer,
    };

    const mpRes = await fetch("https://api.checkout.infinitepay.io/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const mpData = await mpRes.json().catch(() => ({}));
    const checkoutUrl = typeof mpData?.checkout_url === "string" ? mpData.checkout_url : "";

    if (!mpRes.ok || !checkoutUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: mpData?.message || mpData?.error || "Não foi possível gerar o link de pagamento InfinitePay.",
        },
        { status: 502 }
      );
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO infinitepay_deposits (player_id, order_nsu, amount_cents, checkout_url, status)
         VALUES ($1, $2, $3, $4, 'PENDING')`,
        [player.id, orderNsu, amountCents, checkoutUrl]
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
      checkout_url: checkoutUrl,
      order_nsu: orderNsu,
      amount_cents: String(amountCents),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar checkout InfinitePay.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
