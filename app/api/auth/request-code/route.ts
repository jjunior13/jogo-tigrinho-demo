import { NextResponse } from "next/server";
import { db, ensureAuthTables } from "@/lib/db";

function generateSixDigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(toEmail: string, playerName: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, reason: "no_provider" as const };
  }

  const fromAddress = process.env.EMAIL_FROM || "Tigrinho Brasil <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [toEmail],
      subject: "Seu código de acesso — Tigrinho Brasil",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 20px; background: #06281e; color: #fefce8; border-radius: 12px;">
          <h2 style="margin-top: 0; color: #facc15;">🐯 Tigrinho Brasil</h2>
          <p>Olá, <strong>${playerName}</strong>!</p>
          <p>Use o código abaixo para confirmar seu e-mail e entrar no jogo:</p>
          <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; padding: 14px; margin: 16px 0; background: #081c3a; color: #facc15; border-radius: 8px;">
            ${code}
          </div>
          <p style="font-size: 12px; color: #bae6fd;">Este código expira em 15 minutos.</p>
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
    const email = String(body?.email ?? "").trim().toLowerCase();
    const phone = String(body?.phone ?? "").trim();

    if (name.length < 2) {
      return NextResponse.json({ error: "Informe um nome válido." }, { status: 400 });
    }
    if (!email.includes("@") || !email.includes(".")) {
      return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
    }
    if (phone.replace(/\D/g, "").length < 8) {
      return NextResponse.json({ error: "Informe um telefone válido." }, { status: 400 });
    }

    await ensureAuthTables();

    // Invalida códigos anteriores não usados desse e-mail
    await db.query(
      `UPDATE email_verifications SET used = TRUE WHERE email = $1 AND used = FALSE`,
      [email]
    );

    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await db.query(
      `INSERT INTO email_verifications (email, code, expires_at, used) VALUES ($1, $2, $3, FALSE)`,
      [email, code, expiresAt]
    );

    const mailResult = await sendVerificationEmail(email, name, code);

    return NextResponse.json({
      ok: true,
      emailSent: mailResult.sent,
      devCode: mailResult.sent ? undefined : code,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
