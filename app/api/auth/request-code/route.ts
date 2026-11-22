import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
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
  const host = (process.env.SMTP_HOST || "mail.plmx.com.br").trim();
  const port = Number((process.env.SMTP_PORT || "465").trim());
  const user = (process.env.SMTP_USER || "noreply@plmx.com.br").trim();
  const pass = (process.env.SMTP_PASS || "Ledzep13@@##").trim();
  const fromAddress =
    (process.env.SMTP_FROM || process.env.EMAIL_FROM || "").trim() ||
    `"Tigrinho Brasil" <${user}>`;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  await transporter.sendMail({
    from: fromAddress,
    to: toEmail,
    subject: "Bem-vindo ao Tigrinho Brasil! Seu código de confirmação",
    text: `Olá, ${playerName}! Seja muito bem-vindo ao Tigrinho Brasil.\nSeu código de confirmação de 6 dígitos é: ${code}\nEste código expira em 15 minutos.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 440px; margin: 0 auto; padding: 24px; background: #064e3b; color: #fefce8; border-radius: 14px; border: 2px solid #facc15;">
        <h2 style="margin-top: 0; color: #facc15; text-align: center;">🇧🇷 Bem-vindo ao Tigrinho Brasil!</h2>
        <p style="font-size: 15px; line-height: 1.5;">Olá, <strong>${playerName}</strong>! Seja muito bem-vindo.</p>
        <p style="font-size: 14px; line-height: 1.5;">Digite o código de confirmação abaixo na tela do jogo para liberar seu acesso:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 16px; margin: 20px 0; background: #172554; color: #facc15; border-radius: 10px; border: 1px solid #facc15;">
          ${code}
        </div>
        <p style="font-size: 12px; color: #fde047; text-align: center; margin-bottom: 0;">Este código expira em 15 minutos.</p>
      </div>
    `,
  });
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

    try {
      await sendVerificationEmail(email, name, code);
      return NextResponse.json({
        ok: true,
        emailSent: true,
      });
    } catch (mailErr) {
      const m = mailErr as { message?: string; code?: string };
      return NextResponse.json({
        ok: true,
        emailSent: false,
        smtpWarning: m?.message || m?.code || "Connection timeout",
        devCode: code,
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
