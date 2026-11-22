import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "mail.plmx.com.br";
const SMTP_PORT = Number(process.env.SMTP_PORT || "465");
const SMTP_USER = process.env.SMTP_USER || "noreply@plmx.com.br";
const SMTP_PASS = process.env.SMTP_PASS || "Ledzep13@@##";
const SMTP_FROM = process.env.SMTP_FROM || `"Tigrinho do Brasil" <${SMTP_USER}>`;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

export async function sendVerificationEmail(params: {
  to: string;
  name?: string;
  code: string;
}) {
  const greeting = params.name ? `Olá, ${params.name}!` : "Olá!";
  await transporter.sendMail({
    from: SMTP_FROM,
    to: params.to,
    subject: "Seu código de confirmação - Tigrinho do Brasil",
    text: `${greeting}

Bem-vindo ao Tigrinho do Brasil!
Seu código de verificação de 6 dígitos é: ${params.code}

Se você não solicitou este cadastro, ignore esta mensagem.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px; border-radius: 12px; background: #064e3b; color: #fefce8;">
        <h2 style="margin-top: 0; color: #fde047;">🇧🇷 Tigrinho do Brasil</h2>
        <p>${greeting}</p>
        <p>Bem-vindo ao <strong>Tigrinho do Brasil</strong>! Use o código abaixo para confirmar seu cadastro:</p>
        <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; padding: 14px; margin: 16px 0; border-radius: 8px; background: #172554; color: #fde047; border: 1px solid #facc15;">
          ${params.code}
        </div>
        <p style="font-size: 12px; color: #a7f3d0;">Se você não solicitou este cadastro, desconsidere este e-mail.</p>
      </div>
    `,
  });
}
