import { NextResponse } from "next/server";
import { db, ensureAuthTables } from "@/lib/db";
import { hashPassword, normalizeEmail, normalizePhone } from "@/lib/auth";

interface EmailConflictRow {
  id: number;
  email_verified: boolean;
}

interface PhoneConflictRow {
  id: number;
  email: string | null;
}

function generateSixDigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function buildBaseUsername(name: string, email: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 18);
  const prefix = slug || email.split("@")[0].replace(/[^a-z0-9_]/g, "_").slice(0, 14) || "jogador";
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${prefix}_${suffix}`;
}

async function sendVerificationEmail(toEmail: string, playerName: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false as const };
  }

  const fromAddress = process.env.EMAIL_FROM || "Tigrinho do Brasil <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [toEmail],
      subject: "Seu código de confirmação — Tigrinho do Brasil",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 20px; background: #064e3b; color: #fefce8; border-radius: 12px; border: 2px solid #facc15;">
          <h2 style="margin-top: 0; color: #facc15;">🇧🇷 Tigrinho do Brasil</h2>
          <p>Olá, <strong>${playerName}</strong>!</p>
          <p>Use o código abaixo para confirmar seu e-mail e liberar seu acesso:</p>
          <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; padding: 14px; margin: 16px 0; background: #172554; color: #facc15; border-radius: 8px;">
            ${code}
          </div>
          <p style="font-size: 12px; color: #fde047;">Este código expira em 15 minutos.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Falha ao enviar e-mail: ${errText}`);
  }

  return { sent: true as const };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const email = normalizeEmail(String(body?.email ?? ""));
    const phone = normalizePhone(String(body?.phone ?? ""));
    const password = String(body?.password ?? "");

    if (name.length < 2) {
      return NextResponse.json({ error: "Informe seu nome completo." }, { status: 400 });
    }
    if (!email.includes("@") || !email.includes(".")) {
      return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
    }
    if (phone.length < 8) {
      return NextResponse.json({ error: "Informe um telefone válido com DDD." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    await ensureAuthTables();

    const emailConflict = await db.query(
      `SELECT id, email_verified FROM players WHERE LOWER(email) = $1 LIMIT 1`,
      [email]
    );
    const existingEmail = (emailConflict.rows as EmailConflictRow[])[0];

    if (existingEmail?.email_verified) {
      return NextResponse.json(
        { error: "Este e-mail já está cadastrado. Use a aba Entrar com E-mail e Senha." },
        { status: 409 }
      );
    }

    const phoneConflict = await db.query(
      `SELECT id, email FROM players WHERE phone = $1 AND LOWER(COALESCE(email, '')) <> $2 LIMIT 1`,
      [phone, email]
    );

    if ((phoneConflict.rows as PhoneConflictRow[])[0]) {
      return NextResponse.json(
        { error: "Este telefone já está cadastrado em outra conta." },
        { status: 409 }
      );
    }

    const passwordHash = hashPassword(password);

    if (existingEmail) {
      await db.query(
        `UPDATE players
         SET full_name = $1,
             phone = $2,
             password_hash = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [name, phone, passwordHash, existingEmail.id]
      );
    } else {
      const username = buildBaseUsername(name, email);
      await db.query(
        `INSERT INTO players (username, full_name, email, phone, password_hash, balance_cents, email_verified)
         VALUES ($1, $2, $3, $4, $5, 10000, FALSE)`,
        [username, name, email, phone, passwordHash]
      );
    }

    await db.query(
      `UPDATE email_verifications SET used = TRUE WHERE LOWER(email) = $1 AND used = FALSE`,
      [email]
    );

    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await db.query(
      `INSERT INTO email_verifications (email, code, expires_at, used)
       VALUES ($1, $2, $3, FALSE)`,
      [email, code, expiresAt]
    );

    const mailResult = await sendVerificationEmail(email, name, code);

    return NextResponse.json({
      ok: true,
      emailSent: mailResult.sent,
      devCode: mailResult.sent ? undefined : code,
    });
  } catch (err) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr?.code === "23505") {
      return NextResponse.json(
        { error: "E-mail ou telefone já cadastrado no sistema." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: pgErr?.message || "Erro interno ao enviar código de confirmação." },
      { status: 500 }
    );
  }
}
