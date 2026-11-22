"use client";

import React, { useState } from "react";

export interface AuthenticatedPlayer {
  name: string;
  email: string;
  phone: string;
  balance?: number;
}

interface LoginScreenProps {
  onAuthenticated: (player: AuthenticatedPlayer) => void;
}

export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "verify">("form");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Preencha seus dados para receber o código por e-mail.");
  const [errorMsg, setErrorMsg] = useState("");

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    if (cleanName.length < 2) {
      setErrorMsg("Digite seu nome completo.");
      return;
    }
    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      setErrorMsg("Digite um e-mail válido.");
      return;
    }
    if (cleanPhone.replace(/\D/g, "").length < 8) {
      setErrorMsg("Digite um telefone válido com DDD.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Não foi possível enviar o código.");
      } else {
        setStep("verify");
        if (data?.devCode) {
          const receivedCode = String(data.devCode);
          setDevCode(receivedCode);
          setCode(receivedCode);
          setMessage(`SMTP indisponível na Vercel — Código de teste: ${receivedCode}`);
        } else {
          setDevCode(null);
          setMessage(`Enviamos um código de confirmação para ${cleanEmail}.`);
        }
      }
    } catch {
      setErrorMsg("Erro de conexão ao solicitar o código.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const cleanCode = code.trim();
    if (cleanCode.length < 4) {
      setErrorMsg("Digite o código de confirmação recebido no e-mail.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          code: cleanCode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Código inválido ou expirado.");
      } else {
        onAuthenticated({
          name: data.user?.name || name.trim(),
          email: data.user?.email || email.trim().toLowerCase(),
          phone: data.user?.phone || phone.trim(),
          balance: typeof data.user?.balance === "number" ? data.user.balance : 1000,
        });
      }
    } catch {
      setErrorMsg("Erro de conexão ao confirmar o código.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-900 via-blue-950 to-emerald-950 text-yellow-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border-2 border-yellow-400/50 bg-gradient-to-b from-emerald-950/95 via-blue-950/95 to-emerald-950/95 p-5 shadow-2xl space-y-4">
        <header className="text-center border-b border-yellow-400/25 pb-3.5 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-yellow-300 font-bold">
            🇧🇷 Acesso do Jogador • Verde • Amarelo • Azul
          </p>
          <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-sky-300">
            🐯 Tigrinho Brasil
          </h1>
          <p className="text-xs text-sky-200">{message}</p>
        </header>

        {errorMsg && (
          <div className="rounded-xl bg-rose-950/90 border border-rose-400/50 px-3 py-2 text-xs font-semibold text-rose-200 text-center">
            {errorMsg}
          </div>
        )}

        {step === "form" ? (
          <form onSubmit={handleRequestCode} className="space-y-3">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-yellow-200">Nome completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Lucas Silva"
                className="w-full rounded-xl bg-blue-950/90 border border-emerald-400/40 px-3.5 py-2.5 text-sm text-white placeholder:text-sky-400/50 focus:outline-none focus:border-yellow-400"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-yellow-200">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="w-full rounded-xl bg-blue-950/90 border border-emerald-400/40 px-3.5 py-2.5 text-sm text-white placeholder:text-sky-400/50 focus:outline-none focus:border-yellow-400"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-yellow-200">Telefone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(21) 99999-9999"
                className="w-full rounded-xl bg-blue-950/90 border border-emerald-400/40 px-3.5 py-2.5 text-sm text-white placeholder:text-sky-400/50 focus:outline-none focus:border-yellow-400"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-yellow-300 via-yellow-400 to-emerald-400 text-blue-950 shadow-lg hover:brightness-105 transition disabled:opacity-50"
            >
              {loading ? "Enviando código..." : "Enviar confirmação por e-mail"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-3">
            <div className="rounded-2xl bg-blue-950/80 border border-sky-400/30 p-3 text-xs text-sky-200 space-y-0.5">
              <p><strong className="text-yellow-300">Nome:</strong> {name}</p>
              <p><strong className="text-yellow-300">E-mail:</strong> {email}</p>
              <p><strong className="text-yellow-300">Telefone:</strong> {phone}</p>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-yellow-200">Código de confirmação</label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Digite o código de 6 dígitos"
                className="w-full rounded-xl bg-blue-950/90 border border-yellow-400/50 px-3.5 py-2.5 text-center text-base font-extrabold tracking-widest text-yellow-300 placeholder:text-sky-400/50 placeholder:tracking-normal placeholder:text-sm placeholder:font-normal focus:outline-none focus:border-emerald-400"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-yellow-300 via-yellow-400 to-emerald-400 text-blue-950 shadow-lg hover:brightness-105 transition disabled:opacity-50"
            >
              {loading ? "Confirmando..." : "Confirmar e entrar no jogo"}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setStep("form");
                setCode("");
                setErrorMsg("");
              }}
              className="w-full py-2 rounded-xl text-xs font-bold text-sky-200 bg-blue-950/70 border border-sky-700/60 hover:bg-blue-900 transition"
            >
              Voltar e editar dados
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
