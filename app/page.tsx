"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

interface SpinItem {
  id: number;
  bet_cents: string;
  payout_cents: string;
  outcome: string;
  created_at: string;
}

interface PlayerInfo {
  id: number;
  username: string;
  full_name?: string | null;
  email?: string | null;
  balance_cents: string;
}

interface WinningLineOverlay {
  id: string;
  label: string;
  orientation: "horizontal" | "vertical";
  indices: [number, number, number];
  symbol: string;
  multiplier: number;
  payoutCents: number;
}

const SESSION_STORAGE_KEY = "tigrinho_brasil_player_v1";
const PENDING_VERIFY_KEY = "tigrinho_brasil_pending_verify_v1";
const SYMBOLS = ["🐯", "💎", "🧧", "🪙", "🍊", "🧨"];
const INITIAL_GRID = ["🐯", "🪙", "🧧", "🐯", "🐯", "🐯", "🍊", "🧨", "💎"];
const BET_OPTIONS = [100, 500, 1000, 2000];

const LINE_STYLE_MAP: Record<
  string,
  | { kind: "horizontal"; topPercent: number; colorClass: string }
  | { kind: "vertical"; leftPercent: number; colorClass: string }
> = {
  "row-0": { kind: "horizontal", topPercent: 18.5, colorClass: "bg-yellow-300 shadow-[0_0_12px_#fde047]" },
  "row-1": { kind: "horizontal", topPercent: 50, colorClass: "bg-emerald-400 shadow-[0_0_12px_#34d399]" },
  "row-2": { kind: "horizontal", topPercent: 81.5, colorClass: "bg-sky-300 shadow-[0_0_12px_#7dd3fc]" },
  "col-0": { kind: "vertical", leftPercent: 17.5, colorClass: "bg-yellow-300 shadow-[0_0_12px_#fde047]" },
  "col-1": { kind: "vertical", leftPercent: 50, colorClass: "bg-emerald-400 shadow-[0_0_12px_#34d399]" },
  "col-2": { kind: "vertical", leftPercent: 82.5, colorClass: "bg-sky-300 shadow-[0_0_12px_#7dd3fc]" },
};

function formatBRL(centsStr: string | number) {
  const cents = typeof centsStr === "string" ? Number(centsStr) : centsStr;
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function randomSymbol() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

function useSlotSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctxRef.current) {
      ctxRef.current = new AudioCtx();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  const unlockAudio = useCallback(() => {
    getContext();
  }, [getContext]);

  const playReelTick = useCallback(
    (stepIndex: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];
      const freq = notes[stepIndex % notes.length];

      const oscMain = ctx.createOscillator();
      const oscSub = ctx.createOscillator();
      const gain = ctx.createGain();

      oscMain.type = "square";
      oscMain.frequency.setValueAtTime(freq, now);
      oscMain.frequency.exponentialRampToValueAtTime(freq * 1.35, now + 0.055);

      oscSub.type = "triangle";
      oscSub.frequency.setValueAtTime(freq * 0.5, now);
      oscSub.frequency.exponentialRampToValueAtTime(freq * 0.85, now + 0.055);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.002, now + 0.068);

      oscMain.connect(gain);
      oscSub.connect(gain);
      gain.connect(ctx.destination);

      oscMain.start(now);
      oscSub.start(now);
      oscMain.stop(now + 0.072);
      oscSub.stop(now + 0.072);
    },
    [getContext]
  );

  const playReelStop = useCallback(
    (colIndex: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const chords = [523.25, 659.25, 783.99];
      const freq = chords[colIndex % chords.length];

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.2, now + 0.09);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.002, now + 0.11);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    },
    [getContext]
  );

  const playWinFanfare = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [
      { f: 523.25, t: 0.0, d: 0.11 },
      { f: 659.25, t: 0.09, d: 0.11 },
      { f: 783.99, t: 0.18, d: 0.11 },
      { f: 1046.5, t: 0.27, d: 0.16 },
      { f: 880.0, t: 0.43, d: 0.11 },
      { f: 1046.5, t: 0.54, d: 0.13 },
      { f: 1318.51, t: 0.67, d: 0.36 },
    ];

    notes.forEach((n) => {
      const start = now + n.t;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(n.f, start);

      osc2.type = "square";
      osc2.frequency.setValueAtTime(n.f * 1.5, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.28, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.002, start + n.d);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(start);
      osc2.start(start);
      osc1.stop(start + n.d + 0.02);
      osc2.stop(start + n.d + 0.02);
    });
  }, [getContext]);

  const playLossSound = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.16);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }, [getContext]);

  return { unlockAudio, playReelTick, playReelStop, playWinFanfare, playLossSound };
}

interface ReelState {
  symbols: [string, string, string];
  spinning: boolean;
  dropOffset: boolean;
}

function gridToColumns(grid: string[]): [string, string, string][] {
  return [0, 1, 2].map((col) => [
    grid[col] ?? INITIAL_GRID[col],
    grid[col + 3] ?? INITIAL_GRID[col + 3],
    grid[col + 6] ?? INITIAL_GRID[col + 6],
  ]) as [string, string, string][];
}

function columnsToGrid(cols: [string, string, string][]): string[] {
  const out = new Array<string>(9);
  for (let col = 0; col < 3; col++) {
    out[col] = cols[col][0];
    out[col + 3] = cols[col][1];
    out[col + 6] = cols[col][2];
  }
  return out;
}

export default function HomePage() {
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [checkingSession, setCheckingSession] = useState<boolean>(true);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [step, setStep] = useState<"form" | "code">("form");
  const [fullName, setFullName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");
  const [authNotice, setAuthNotice] = useState<string>("");
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  const [reels, setReels] = useState<ReelState[]>(() =>
    gridToColumns(INITIAL_GRID).map((symbols) => ({
      symbols,
      spinning: false,
      dropOffset: false,
    }))
  );
  const [winningLines, setWinningLines] = useState<WinningLineOverlay[]>([]);
  const [excellentBanner, setExcellentBanner] = useState<string>("");
  const [betCents, setBetCents] = useState<number>(500);
  const [recentSpins, setRecentSpins] = useState<SpinItem[]>([]);
  const [lastMessage, setLastMessage] = useState<string>("Pronto para girar.");
  const [spinning, setSpinning] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);

  const { unlockAudio, playReelTick, playReelStop, playWinFanfare, playLossSound } = useSlotSound();

  const syncPlayerFromServer = useCallback(async (uname: string) => {
    const res = await fetch(`/api/player?username=${encodeURIComponent(uname)}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok || !data?.ok || !data?.player) {
      throw new Error(data?.error || "Não foi possível sincronizar o jogador.");
    }
    setPlayer(data.player);
    setRecentSpins(data.recentSpins || []);
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data.player));
  }, []);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) {
          if (active) setCheckingSession(false);
          return;
        }
        const saved = JSON.parse(raw) as PlayerInfo;
        if (!saved?.username) {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          if (active) setCheckingSession(false);
          return;
        }
        await syncPlayerFromServer(saved.username);
      } catch {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      } finally {
        if (active) setCheckingSession(false);
      }
    }
    restoreSession();
    try {
      const pendingRaw =
        window.sessionStorage.getItem(PENDING_VERIFY_KEY) ||
        window.localStorage.getItem(PENDING_VERIFY_KEY);
      if (pendingRaw) {
        const pending = JSON.parse(pendingRaw) as {
          mode?: "login" | "register";
          step?: "form" | "code";
          email?: string;
          notice?: string;
        };
        if (pending?.mode === "register" && pending?.step === "code" && pending?.email) {
          if (active) {
            setMode("register");
            setStep("code");
            setEmail(pending.email);
            if (pending.notice) {
              setAuthNotice(pending.notice);
            }
          }
        }
      }
    } catch {
      // ignora erro de leitura de storage
    }
    return () => {
      active = false;
    };
  }, [syncPlayerFromServer]);

  useEffect(() => {
    try {
      if (!player && mode === "register" && step === "code" && email) {
        const payload = JSON.stringify({
          mode,
          step,
          email,
          notice:
            authNotice ||
            "Enviamos uma mensagem de boas-vindas com o código de 6 dígitos para o seu e-mail.",
        });
        window.sessionStorage.setItem(PENDING_VERIFY_KEY, payload);
        window.localStorage.setItem(PENDING_VERIFY_KEY, payload);
      } else if (player || step === "form") {
        window.sessionStorage.removeItem(PENDING_VERIFY_KEY);
        window.localStorage.removeItem(PENDING_VERIFY_KEY);
      }
    } catch {
      // ignora erro de escrita de storage
    }
  }, [player, mode, step, email, authNotice]);

  function handleLogout() {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setPlayer(null);
    setRecentSpins([]);
    setPassword("");
    setCode("");
    setStep("form");
    setAuthError("");
    setAuthNotice("");
  }

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.player) {
        setAuthError(data?.error || "Falha ao entrar.");
        return;
      }
      setPassword("");
      await syncPlayerFromServer(data.player.username);
    } catch {
      setAuthError("Erro de rede ao tentar fazer login.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRequestCode(e: FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName,
          email,
          phone,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setAuthError(data?.error || "Não foi possível enviar o código.");
        return;
      }
      setStep("code");
      setAuthNotice(
        "Enviamos uma mensagem de boas-vindas com o código de 6 dígitos para o seu e-mail."
      );
    } catch {
      setAuthError("Erro de rede ao solicitar código.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.player) {
        setAuthError(data?.error || "Código inválido.");
        return;
      }
      setPassword("");
      setCode("");
      setStep("form");
      try {
        window.sessionStorage.removeItem(PENDING_VERIFY_KEY);
        window.localStorage.removeItem(PENDING_VERIFY_KEY);
      } catch {
        // ignora erro de storage
      }
      await syncPlayerFromServer(data.player.username);
    } catch {
      setAuthError("Erro de rede ao validar código.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSpin() {
    if (!player || spinning) return;
    if (!muted) {
      unlockAudio();
    }
    setSpinning(true);
    setWinningLines([]);
    setExcellentBanner("");
    setLastMessage("Girando as bobinas...");

    setReels((prev) =>
      prev.map((r) => ({
        ...r,
        spinning: true,
        dropOffset: true,
      }))
    );

    let tickCount = 0;
    const tickInterval = window.setInterval(() => {
      tickCount += 1;
      if (!muted) {
        playReelTick(tickCount);
      }

      setReels((prev) =>
        prev.map((r) => {
          if (!r.spinning) return r;
          const nextTop = randomSymbol();
          return {
            ...r,
            symbols: [nextTop, r.symbols[0], r.symbols[1]],
            dropOffset: !r.dropOffset,
          };
        })
      );
    }, 80);

    try {
      const minSpinPromise = new Promise((resolve) => setTimeout(resolve, 720));
      const fetchPromise = fetch("/api/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: player.username, betCents }),
      }).then((r) => r.json());

      const [, data] = await Promise.all([minSpinPromise, fetchPromise]);

      if (!data?.ok) {
        clearInterval(tickInterval);
        setReels((prev) => prev.map((r) => ({ ...r, spinning: false, dropOffset: false })));
        setLastMessage(data?.error || "Não foi possível concluir o giro.");
        return;
      }

      const finalGrid =
        Array.isArray(data.grid) && data.grid.length === 9
          ? data.grid
          : columnsToGrid(reels.map((r) => r.symbols));
      const finalCols = gridToColumns(finalGrid);

      for (let col = 0; col < 3; col++) {
        await new Promise((resolve) => setTimeout(resolve, col === 0 ? 0 : 250));
        setReels((prev) =>
          prev.map((r, idx) =>
            idx === col
              ? {
                  symbols: finalCols[col],
                  spinning: false,
                  dropOffset: false,
                }
              : r
          )
        );
        if (!muted) {
          playReelStop(col);
        }
      }

      clearInterval(tickInterval);
      if (data.player) {
        setPlayer(data.player);
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data.player));
      }

      const lines: WinningLineOverlay[] = Array.isArray(data.winningLines) ? data.winningLines : [];
      setWinningLines(lines);

      if (data.spin) {
        setRecentSpins((prev) => [data.spin, ...prev].slice(0, 10));
        const payout = Number(data.spin.payout_cents);
        if (payout > 0) {
          setExcellentBanner(`Excelente! Ganhou ${formatBRL(payout)}`);
          setLastMessage(`Excelente! Prêmio de ${formatBRL(payout)} (${data.spin.outcome}).`);
          if (!muted) playWinFanfare();
        } else {
          setExcellentBanner("");
          setLastMessage(`Sem sequência na horizontal ou vertical (${data.spin.outcome}).`);
          if (!muted) playLossSound();
        }
      }
    } catch {
      clearInterval(tickInterval);
      setReels((prev) => prev.map((r) => ({ ...r, spinning: false, dropOffset: false })));
      setLastMessage("Falha de rede ao chamar /api/spin.");
    } finally {
      setSpinning(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-emerald-950 via-green-950 to-blue-950 text-yellow-200 flex items-center justify-center p-6">
        <div className="rounded-2xl border-2 border-yellow-400/50 bg-emerald-950/90 px-6 py-4 text-sm font-semibold">
          🇧🇷 Verificando acesso ao Tigrinho do Brasil...
        </div>
      </main>
    );
  }

  if (!player) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-emerald-950 via-green-950 to-blue-950 text-amber-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border-2 border-yellow-400/60 bg-emerald-950/95 p-6 shadow-2xl shadow-blue-950/80 space-y-5">
          <div className="text-center space-y-1 border-b border-yellow-400/25 pb-4">
            <h1 className="text-2xl font-extrabold tracking-wide text-yellow-300">
              🇧🇷 Tigrinho do Brasil
            </h1>
            <p className="text-xs text-emerald-200/85">
              Faça login com e-mail e senha ou cadastre-se para liberar o jogo
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-blue-950/85 p-1 border border-yellow-400/30">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setStep("form");
                setAuthError("");
                setAuthNotice("");
              }}
              className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                mode === "login"
                  ? "bg-yellow-400 text-blue-950"
                  : "text-emerald-100 hover:text-yellow-200"
              }`}
            >
              Entrar (Login e Senha)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setStep("form");
                setAuthError("");
                setAuthNotice("");
              }}
              className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                mode === "register"
                  ? "bg-yellow-400 text-blue-950"
                  : "text-emerald-100 hover:text-yellow-200"
              }`}
            >
              Cadastrar e Confirmar
            </button>
          </div>

          {authError && (
            <div className="rounded-lg border border-red-400/60 bg-red-950/80 px-3 py-2 text-xs font-medium text-red-200">
              {authError}
            </div>
          )}

          {authNotice && (
            <div className="rounded-lg border border-yellow-400/60 bg-blue-950/90 px-3 py-2 text-xs font-medium text-yellow-200">
              {authNotice}
            </div>
          )}

          {mode === "login" ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-yellow-200">E-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full rounded-lg border border-emerald-700/80 bg-blue-950/85 px-3 py-2.5 text-sm text-amber-50 placeholder:text-emerald-300/45 focus:border-yellow-400 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-yellow-200">Senha</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  className="w-full rounded-lg border border-emerald-700/80 bg-blue-950/85 px-3 py-2.5 text-sm text-amber-50 placeholder:text-emerald-300/45 focus:border-yellow-400 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 rounded-xl font-extrabold text-blue-950 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-300 hover:from-yellow-200 hover:to-yellow-300 disabled:opacity-50 transition cursor-pointer shadow-lg"
              >
                {authLoading ? "Entrando..." : "Entrar no Tigrinho do Brasil"}
              </button>
            </form>
          ) : step === "form" ? (
            <form onSubmit={handleRequestCode} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-yellow-200">Nome completo</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex.: José Carneiro"
                  className="w-full rounded-lg border border-emerald-700/80 bg-blue-950/85 px-3 py-2 text-sm text-amber-50 placeholder:text-emerald-300/45 focus:border-yellow-400 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-yellow-200">E-mail (único)</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full rounded-lg border border-emerald-700/80 bg-blue-950/85 px-3 py-2 text-sm text-amber-50 placeholder:text-emerald-300/45 focus:border-yellow-400 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-yellow-200">
                  Telefone com DDD (único)
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(22) 99999-9999"
                  className="w-full rounded-lg border border-emerald-700/80 bg-blue-950/85 px-3 py-2 text-sm text-amber-50 placeholder:text-emerald-300/45 focus:border-yellow-400 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-yellow-200">
                  Senha (mínimo 6 caracteres)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Crie uma senha"
                  className="w-full rounded-lg border border-emerald-700/80 bg-blue-950/85 px-3 py-2 text-sm text-amber-50 placeholder:text-emerald-300/45 focus:border-yellow-400 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 rounded-xl font-extrabold text-blue-950 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-300 hover:from-yellow-200 hover:to-yellow-300 disabled:opacity-50 transition cursor-pointer shadow-lg"
              >
                {authLoading ? "Enviando código..." : "Enviar código de confirmação"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-yellow-200">
                  Código de 6 dígitos enviado para {email}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full rounded-lg border border-yellow-400/70 bg-blue-950/85 px-3 py-2.5 text-center text-lg font-mono tracking-widest text-yellow-300 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 rounded-xl font-extrabold text-blue-950 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-300 hover:from-yellow-200 hover:to-yellow-300 disabled:opacity-50 transition cursor-pointer shadow-lg"
              >
                {authLoading ? "Confirmando..." : "Confirmar e-mail e entrar"}
              </button>

              <button
                type="button"
                onClick={() => setStep("form")}
                className="w-full py-2 text-xs text-emerald-200 hover:text-yellow-200 cursor-pointer"
              >
                Voltar e alterar dados
              </button>
            </form>
          )}
        </div>
      </main>
    );
  }

  const highlightedIndices = new Set<number>();
  for (const line of winningLines) {
    for (const idx of line.indices) {
      highlightedIndices.add(idx);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-950 via-green-950 to-blue-950 text-amber-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border-2 border-yellow-400/60 bg-emerald-950/90 p-6 shadow-2xl shadow-blue-950/70 space-y-5">
        <div className="flex items-center justify-between border-b border-yellow-400/25 pb-4">
          <div>
            <h1 className="text-xl font-extrabold tracking-wide text-yellow-300">
              🇧🇷 Tigrinho do Brasil
            </h1>
            <p className="text-xs text-emerald-200/80">
              Jogador: {player.full_name || player.username}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="rounded-lg border border-blue-400/50 bg-blue-900/70 px-2.5 py-1.5 text-xs font-medium text-yellow-200 hover:bg-blue-800/80 cursor-pointer"
              title={muted ? "Ativar som" : "Silenciar som"}
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-yellow-400/40 bg-blue-950/80 px-2.5 py-1.5 text-xs font-semibold text-yellow-200 hover:border-yellow-300 cursor-pointer"
            >
              Sair
            </button>
            <div className="text-right pl-1">
              <span className="block text-xs text-yellow-200/80">Saldo</span>
              <strong className="text-lg font-mono text-yellow-300">
                {formatBRL(player.balance_cents)}
              </strong>
            </div>
          </div>
        </div>

        {excellentBanner && (
          <div className="rounded-xl border-2 border-yellow-300 bg-gradient-to-r from-emerald-800 via-green-700 to-blue-900 px-4 py-3 text-center shadow-lg">
            <span className="block text-xl font-black tracking-wider text-yellow-300 uppercase">
              🎉 Excelente 🎉
            </span>
            <span className="block text-xs font-bold text-amber-100 mt-0.5">{excellentBanner}</span>
          </div>
        )}

        <div className="relative grid grid-cols-3 gap-2 rounded-xl bg-blue-950/85 p-4 border-2 border-yellow-400/50 overflow-hidden">
          {reels.map((reel, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-2 overflow-hidden">
              {reel.symbols.map((symbol, rowIdx) => {
                const cellIndex = rowIdx * 3 + colIdx;
                const isWinningCell = !spinning && highlightedIndices.has(cellIndex);
                const isMiddleRow = rowIdx === 1;
                return (
                  <div
                    key={`${colIdx}-${rowIdx}`}
                    style={{
                      transform: reel.spinning
                        ? `translateY(${reel.dropOffset ? "10px" : "-10px"})`
                        : "translateY(0px)",
                      transition: reel.spinning
                        ? "transform 80ms linear"
                        : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                    className={`h-20 flex items-center justify-center rounded-lg text-3xl border select-none ${
                      isWinningCell
                        ? "border-yellow-300 bg-yellow-400/35 ring-2 ring-yellow-300 shadow-lg"
                        : isMiddleRow
                        ? "border-yellow-400/70 bg-yellow-400/15 shadow-inner"
                        : "border-emerald-700/60 bg-emerald-900/65"
                    }`}
                  >
                    {symbol}
                  </div>
                );
              })}
            </div>
          ))}

          {!spinning && winningLines.length > 0 && (
            <div className="pointer-events-none absolute inset-4 z-10">
              {winningLines.map((line) => {
                const styleCfg = LINE_STYLE_MAP[line.id];
                if (!styleCfg) return null;
                if (styleCfg.kind === "horizontal") {
                  return (
                    <div
                      key={line.id}
                      style={{ top: `${styleCfg.topPercent}%` }}
                      className={`absolute left-2 right-2 h-1.5 -translate-y-1/2 rounded-full ${styleCfg.colorClass}`}
                    />
                  );
                }
                return (
                  <div
                    key={line.id}
                    style={{ left: `${styleCfg.leftPercent}%` }}
                    className={`absolute top-2 bottom-2 w-1.5 -translate-x-1/2 rounded-full ${styleCfg.colorClass}`}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-medium text-yellow-200/90">Valor da aposta</span>
          <div className="grid grid-cols-4 gap-2">
            {BET_OPTIONS.map((amount) => {
              const active = betCents === amount;
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setBetCents(amount)}
                  disabled={spinning}
                  className={`py-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
                    active
                      ? "bg-yellow-400 text-blue-950 border-yellow-300 shadow"
                      : "bg-blue-950/75 text-emerald-100 border-emerald-700/70 hover:border-yellow-400/60"
                  }`}
                >
                  {formatBRL(amount)}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSpin}
          disabled={spinning}
          className="w-full py-3 rounded-xl font-extrabold text-blue-950 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-300 hover:from-yellow-200 hover:to-yellow-300 disabled:opacity-50 transition cursor-pointer shadow-lg"
        >
          {spinning ? "Girando..." : `Girar (${formatBRL(betCents)})`}
        </button>

        <p className="text-sm text-center text-yellow-100 bg-blue-950/80 border border-yellow-400/35 rounded-lg py-2 px-3">
          {lastMessage}
        </p>

        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-yellow-300/90">
            Últimas rodadas
          </h2>
          {recentSpins.length === 0 ? (
            <p className="text-xs text-emerald-200/70">Nenhuma rodada registrada ainda.</p>
          ) : (
            <ul className="space-y-1.5 max-h-44 overflow-y-auto text-xs">
              {recentSpins.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-lg bg-blue-950/75 border border-emerald-700/60 px-3 py-2"
                >
                  <span className="font-mono text-emerald-100">
                    Aposta {formatBRL(s.bet_cents)} → Prêmio {formatBRL(s.payout_cents)}
                  </span>
                  <span
                    className={`font-bold ${
                      Number(s.payout_cents) > 0 ? "text-yellow-300" : "text-emerald-300/65"
                    }`}
                  >
                    {s.outcome}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
