import { NextResponse } from "next/server";
import { db, ensureAuthTables } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const phone = String(body?.phone ?? "").trim();
    const code = String(body?.code ?? "").trim();

    if (!email || !code) {
      return NextResponse.json({ error: "E-mail e código são obrigatórios." }, { status: 400 });
    }

    await ensureAuthTables();

    const verificationRes = await db.query(
      `
      SELECT id, expires_at
      FROM email_verifications
      WHERE email = $1 AND code = $2 AND used = FALSE
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [email, code]
    );

    if (verificationRes.rows.length === 0) {
      return NextResponse.json({ error: "Código inválido ou já utilizado." }, { status: 400 });
    }

    const verification = verificationRes.rows[0];
    if (new Date(verification.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Este código expirou. Solicite um novo." }, { status: 400 });
    }

    await db.query(`UPDATE email_verifications SET used = TRUE WHERE id = $1`, [verification.id]);

    const userRes = await db.query(
      `
      INSERT INTO users (full_name, email, phone, email_verified, balance)
      VALUES ($1, $2, $3, TRUE, 1000)
      ON CONFLICT (email)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        email_verified = TRUE,
        updated_at = NOW()
      RETURNING id, full_name, email, phone, balance
      `,
      [name || "Jogador", email, phone || ""]
    );

    const user = userRes.rows[0];

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        phone: user.phone,
        balance: user.balance,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao confirmar código.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
