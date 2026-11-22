import { NextResponse } from "next/server";
import { db, ensureAuthTables } from "@/lib/db";
import { hashPassword, normalizeEmail, normalizePhone } from "@/lib/auth";

interface CreatedPlayerRow {
  id: number;
  username: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  balance_cents: string;
}

function buildBaseUsername(name: string, email: string): string {
  const source = name.trim() || email.split("@")[0] || "jogador";
  const slug = source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 18);
  return slug || "jogador";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const fullName = String(body?.fullName ?? body?.name ?? "").trim();
    const email = normalizeEmail(String(body?.email ?? ""));
    const phone = normalizePhone(String(body?.phone ?? ""));
    const password = String(body?.password ?? "");

    if (fullName.length < 2) {
      return NextResponse.json(
        { error: "Informe seu nome completo." },
        { status: 400 }
      );
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Informe um e-mail válido." },
        { status: 400 }
      );
    }

    if (phone.length < 10) {
      return NextResponse.json(
        { error: "Informe um telefone válido com DDD." },
        { status: 400 }
      );
    }

    if (password.length < 4) {
      return NextResponse.json(
        { error: "A senha deve ter pelo menos 4 caracteres." },
        { status: 400 }
      );
    }

    await ensureAuthTables();

    const emailCheck = await db.query(
      `SELECT id FROM players WHERE LOWER(email) = $1 LIMIT 1`,
      [email]
    );
    if (emailCheck.rows.length > 0) {
      return NextResponse.json(
        { error: "Este e-mail já está cadastrado." },
        { status: 409 }
      );
    }

    const phoneCheck = await db.query(
      `SELECT id FROM players WHERE phone = $1 LIMIT 1`,
      [phone]
    );
    if (phoneCheck.rows.length > 0) {
      return NextResponse.json(
        { error: "Este telefone já está cadastrado." },
        { status: 409 }
      );
    }

    const passwordHash = hashPassword(password);
    const baseUsername = buildBaseUsername(fullName, email);

    let inserted: CreatedPlayerRow | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix =
        attempt === 0 ? "" : `_${Math.floor(100 + Math.random() * 900)}`;
      const candidateUsername = `${baseUsername.slice(0, 22 - suffix.length)}${suffix}`;

      try {
        const result = await db.query(
          `INSERT INTO players (
             username,
             full_name,
             email,
             phone,
             password_hash,
             email_verified,
             balance_cents
           )
           VALUES ($1, $2, $3, $4, $5, TRUE, 10000)
           RETURNING id, username, full_name, email, phone, balance_cents::text`,
          [candidateUsername, fullName, email, phone, passwordHash]
        );
        inserted = (result.rows as CreatedPlayerRow[])[0] ?? null;
        break;
      } catch (err) {
        const pgErr = err as { code?: string; constraint?: string };
        if (pgErr?.code === "23505") {
          const msg = `${pgErr?.constraint ?? ""}`.toLowerCase();
          if (msg.includes("email")) {
            return NextResponse.json(
              { error: "Este e-mail já está cadastrado." },
              { status: 409 }
            );
          }
          if (msg.includes("phone")) {
            return NextResponse.json(
              { error: "Este telefone já está cadastrado." },
              { status: 409 }
            );
          }
          continue;
        }
        throw err;
      }
    }

    if (!inserted) {
      return NextResponse.json(
        { error: "Não foi possível gerar um nome de usuário único. Tente novamente." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      player: {
        id: inserted.id,
        username: inserted.username,
        full_name: inserted.full_name,
        email: inserted.email,
        phone: inserted.phone,
        balance_cents: inserted.balance_cents,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao realizar cadastro.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
