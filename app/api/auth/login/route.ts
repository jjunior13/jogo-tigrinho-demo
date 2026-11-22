import { NextResponse } from "next/server";
import { db, ensureAuthTables } from "@/lib/db";
import { normalizeEmail, verifyPassword } from "@/lib/auth";

interface LoginPlayerRow {
  id: number;
  username: string;
  full_name: string | null;
  email: string | null;
  password_hash: string | null;
  email_verified: boolean;
  balance_cents: string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = normalizeEmail(String(body?.email ?? ""));
    const password = String(body?.password ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "Informe seu e-mail e sua senha." },
        { status: 400 }
      );
    }

    await ensureAuthTables();

    const result = await db.query(
      `SELECT id, username, full_name, email, password_hash, email_verified, balance_cents::text
       FROM players
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [email]
    );

    const player = (result.rows as LoginPlayerRow[])[0];
    if (!player || !verifyPassword(password, player.password_hash)) {
      return NextResponse.json(
        { error: "E-mail ou senha inválidos." },
        { status: 401 }
      );
    }

    if (!player.email_verified) {
      return NextResponse.json(
        {
          error: "Seu e-mail ainda não foi confirmado. Confirme o código na aba Cadastrar.",
          needsVerification: true,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      player: {
        id: player.id,
        username: player.username,
        full_name: player.full_name,
        email: player.email,
        balance_cents: player.balance_cents,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao realizar login.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
