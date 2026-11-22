import { NextResponse } from "next/server";
import { db, ensureAuthTables } from "@/lib/db";
import { normalizeEmail } from "@/lib/auth";

interface VerificationRow {
  id: number;
  expires_at: string;
  used: boolean;
}

interface VerifiedPlayerRow {
  id: number;
  username: string;
  full_name: string | null;
  email: string;
  balance_cents: string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = normalizeEmail(String(body?.email ?? ""));
    const code = String(body?.code ?? "").trim();

    if (!email || code.length !== 6) {
      return NextResponse.json(
        { error: "Informe o e-mail e o código de 6 dígitos." },
        { status: 400 }
      );
    }

    await ensureAuthTables();

    const verification = await db.query(
      `SELECT id, expires_at, used
       FROM email_verifications
       WHERE LOWER(email) = $1 AND code = $2
       ORDER BY id DESC
       LIMIT 1`,
      [email, code]
    );

    const row = (verification.rows as VerificationRow[])[0];
    if (!row || row.used) {
      return NextResponse.json(
        { error: "Código inválido ou já utilizado." },
        { status: 400 }
      );
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Este código expirou. Solicite um novo código." },
        { status: 400 }
      );
    }

    await db.query(`UPDATE email_verifications SET used = TRUE WHERE id = $1`, [row.id]);

    const playerRes = await db.query(
      `UPDATE players
       SET email_verified = TRUE, updated_at = NOW()
       WHERE LOWER(email) = $1
       RETURNING id, username, full_name, email, balance_cents::text`,
      [email]
    );

    const player = (playerRes.rows as VerifiedPlayerRow[])[0];
    if (!player) {
      return NextResponse.json(
        { error: "Cadastro não encontrado para este e-mail." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      player,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao confirmar código.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
