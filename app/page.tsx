"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { LoginTermsConsent } from "@/components/LoginTermsConsent";
import { TermsSupportModal } from "@/components/TermsSupportModal";

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
  phone?: string | null;
  balance_cents: string;
}

interface WinningLineOverlay {
  id: string;
  label: string;
  orientation: "horizontal" | "vertical" | "diagonal";
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

const ALL_PAYLINES: {
  id: string;
  label: string;
  orientation: "horizontal" | "vertical" | "diagonal";
  indices: [number, number, number];
}[] = [
  { id: "row-0", label: "Linha Topo", orientation: "horizontal", indices: [0, 1, 2] },
  { id: "row-1", label: "Linha Meio", orientation: "horizontal", indices: [3, 4, 5] },
  { id: "row-2", label: "Linha Base", orientation: "horizontal", indices: [6, 7, 8] },
  { id: "col-0", label: "Coluna Esquerda", orientation: "vertical", indices: [0, 3, 6] },
  { id: "col-1", label: "Coluna Centro", orientation: "vertical", indices: [1, 4, 7] },
  { id: "col-2", label: "Coluna Direita", orientation: "vertical", indices: [2, 5, 8] },
  { id: "diag-0", label: "Diagonal Principal", orientation: "diagonal", indices: [0, 4, 8] },
  { id: "diag-1", label: "Diagonal Secundária", orientation: "diagonal", indices: [2, 4, 6] },
];

const LINE_STYLE_MAP: Record<
  string,
  | { kind: "horizontal"; topPercent: number; colorClass: string }
  | { kind: "vertical"; leftPercent: number; colorClass: string }
  | { kind: "diagonal"; angleDeg: number; colorClass: string }
> = {
  "row-0": { kind: "horizontal", topPercent: 18, colorClass: "bg-yellow-300 shadow-[0_0_16px_#fde047]" },
  "row-1": { kind: "horizontal", topPercent: 50, colorClass: "bg-emerald-300 shadow-[0_0_16px_#6ee7b7]" },
  "row-2": { kind: "horizontal", topPercent: 82, colorClass: "bg-sky-300 shadow-[0_0_16px_#7dd3fc]" },
  "col-0": { kind: "vertical", leftPercent: 17, colorClass: "bg-yellow-300 shadow-[0_0_16px_#fde047]" },
  "col-1": { kind: "vertical", leftPercent: 50, colorClass: "bg-emerald-300 shadow-[0_0_16px_#6ee7b7]" },
  "col-2": { kind: "vertical", leftPercent: 83, colorClass: "bg-sky-300 shadow-[0_0_16px_#7dd3fc]" },
  "diag-0": { kind: "diagonal", angleDeg: 45, colorClass: "bg-amber-300 shadow-[0_0_18px_#fcd34d]" },
  "diag-1": { kind: "diagonal", angleDeg: -45, colorClass: "bg-fuchsia-300 shadow-[0_0_18px_#f0abfc]" },
};

function detectWinningLinesFromGrid(grid: string[], betCents: number): WinningLineOverlay[] {
  const found: WinningLineOverlay[] = [];
  for (const line of ALL_PAYLINES) {
    const [a, b, c] = line.indices.map((idx) => grid[idx]);
    if (!a || !b || !c) continue;
    const nonWilds = [a, b, c].filter((s) => s !== "🐯");
    let sym = "🐯";
    if (nonWilds.length > 0) {
      const first = nonWilds[0];
      if (!nonWilds.every((s) => s === first)) continue;
      sym = first;
    }
    const mult = sym === "🐯" ? 10 : sym === "💎" ? 5 : sym === "🧧" ? 3 : sym === "🪙" ? 2 : sym === "🍊" ? 1.5 : 1;
    found.push({
      id: line.id,
      label: line.label,
      orientation: line.orientation,
      indices: line.indices,
      symbol: sym,
      multiplier: mult,
      payoutCents: Math.max(1, Math.round(Math.round(betCents * mult) * 0.3)),
    });
  }
  return found;
}

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
    const ctx = getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(660, now);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }, [getContext]);

  const playReelTick = useCallback(
    (stepIndex: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
      const freq = notes[stepIndex % notes.length];

      const oscMain = ctx.createOscillator();
      const oscSub = ctx.createOscillator();
      const gain = ctx.createGain();

      oscMain.type = "square";
      oscMain.frequency.setValueAtTime(freq, now);
      oscMain.frequency.exponentialRampToValueAtTime(freq * 1.4, now + 0.06);

      oscSub.type = "triangle";
      oscSub.frequency.setValueAtTime(freq * 0.5, now);
      oscSub.frequency.exponentialRampToValueAtTime(freq * 0.9, now + 0.06);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.42, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.003, now + 0.075);

      oscMain.connect(gain);
      oscSub.connect(gain);
      gain.connect(ctx.destination);

      oscMain.start(now);
      oscSub.start(now);
      oscMain.stop(now + 0.08);
      oscSub.stop(now + 0.08);
    },
    [getContext]
  );

  const playReelStop = useCallback(
    (colIndex: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const chords = [587.33, 783.99, 1046.5];
      const freq = chords[colIndex % chords.length];

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, now + 0.1);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.003, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    },
    [getContext]
  );

  const playWinFanfare = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [
      { f: 523.25, t: 0.0, d: 0.12 },
      { f: 659.25, t: 0.1, d: 0.12 },
      { f: 783.99, t: 0.2, d: 0.12 },
      { f: 1046.5, t: 0.3, d: 0.18 },
      { f: 880.0, t: 0.48, d: 0.12 },
      { f: 1046.5, t: 0.6, d: 0.14 },
      { f: 1318.51, t: 0.74, d: 0.42 },
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

      gain.gain.setValueAtTime(0.01, start);
      gain.gain.linearRampToValueAtTime(0.42, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.003, start + n.d);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(start);
      osc2.start(start);
      osc1.stop(start + n.d + 0.02);
      osc2.stop(start + n.d + 0.02);
    });

    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance("Excelente!");
        utter.lang = "pt-BR";
        utter.rate = 1.1;
        utter.volume = 1;
        window.speechSynthesis.speak(utter);
      }
    } catch {
      // ignora speechSynthesis se indisponivel
    }
  }, [getContext]);

  const playLossSound = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.16);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.17);
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
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const [showSupportModal, setShowSupportModal] = useState<boolean>(false);
  const [showDepositModal, setShowDepositModal] = useState<boolean>(false);
  const [depositAmountReais, setDepositAmountReais] = useState<string>("20");
  const [depositLoading, setDepositLoading] = useState<boolean>(false);
  const [depositError, setDepositError] = useState<string>("");
  const [pixReceipt, setPixReceipt] = useState<{
    txid: string;
    amount_cents: string;
    pix_key: string;
    pix_copy_paste: string;
    status: string;
  } | null>(null);
  const [copiedPix, setCopiedPix] = useState<boolean>(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  const [withdrawAmountReais, setWithdrawAmountReais] = useState<string>("20");
  const [withdrawPixKey, setWithdrawPixKey] = useState<string>("");
  const [withdrawLoading, setWithdrawLoading] = useState<boolean>(false);
  const [withdrawError, setWithdrawError] = useState<string>("");
  const [withdrawSuccess, setWithdrawSuccess] = useState<string>("");
  const [withdrawHistory, setWithdrawHistory] = useState<
    Array<{ id: number; amount_cents: string; pix_key: string; status: string; created_at: string }>
  >([]);
  const [infiniteCheckoutUrl, setInfiniteCheckoutUrl] = useState<string>("");
  const [activeOrderNsu, setActiveOrderNsu] = useState<string>("");

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
            "Cadastro direto sem confirmação por e-mail.",
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
    if (!termsAccepted) {
      setAuthError("Aceite os Termos de Uso e a fase inicial de arrecadação para continuar.");
      return;
    }
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

    async function handleRegisterSubmit(e: FormEvent) {
    e.preventDefault();
    if (!termsAccepted) {
      setAuthError("Aceite os Termos de Uso e a fase inicial de arrecadação para continuar.");
      return;
    }
    setAuthError("");
    setAuthNotice("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.player) {
        setAuthError(data?.error || "Não foi possível concluir o cadastro.");
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
      setAuthError("Erro de rede ao tentar cadastrar.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSpin() {
    if (!player || spinning) return;
    setMuted(false);
    unlockAudio();
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
      playReelTick(tickCount);

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
    }, 85);

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
        await new Promise((resolve) => setTimeout(resolve, col === 0 ? 0 : 240));
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
        playReelStop(col);
      }

      clearInterval(tickInterval);
      if (data.player) {
        setPlayer(data.player);
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data.player));
      }

      const detectedLines = detectWinningLinesFromGrid(finalGrid, betCents);
      const apiLines: WinningLineOverlay[] = Array.isArray(data.winningLines) ? data.winningLines : [];
      const activeLines = detectedLines.length > 0 ? detectedLines : apiLines;
      setWinningLines(activeLines);

      const payout = data.spin ? Number(data.spin.payout_cents) : 0;
      const computedPayout =
        payout > 0
          ? payout
          : activeLines.reduce((acc, item) => acc + Number(item.payoutCents || 0), 0);

      if (computedPayout > 0 || activeLines.length > 0) {
        const displayAmount = computedPayout > 0 ? computedPayout : betCents;
        const lineNames = activeLines.map((l) => l.label).join(", ");
        setExcellentBanner(`Excelente! Ganhou ${formatBRL(displayAmount)}`);
        setLastMessage(
          `Excelente! Sequência em ${lineNames || "grade"} — Prêmio de ${formatBRL(displayAmount)}.`
        );
        playWinFanfare();
      } else {
        setExcellentBanner("");
        setLastMessage(
          `Sem sequência na horizontal ou vertical (${data.spin?.outcome || "Sem sequencia"}).`,
        );
        playLossSound();
      }

      if (data.spin) {
        setRecentSpins((prev) => [data.spin, ...prev].slice(0, 10));
      }
    } catch {
      clearInterval(tickInterval);
      setReels((prev) => prev.map((r) => ({ ...r, spinning: false, dropOffset: false })));
      setLastMessage("Falha de rede ao chamar /api/spin.");
    } finally {
      setSpinning(false);
    }
  }



  useEffect(() => {
    if (!player?.username) return;
    const params = new URLSearchParams(window.location.search);
    const urlOrderNsu = params.get("order_nsu") || "";
    let storedOrderNsu = "";
    try {
      storedOrderNsu = window.localStorage.getItem("pending_infinitepay_order_nsu") || "";
    } catch {}
    const orderToCheck = (activeOrderNsu || urlOrderNsu || storedOrderNsu).trim();
    if (!orderToCheck) return;

    let active = true;
    async function checkPaymentStatus() {
      try {
        const res = await fetch("/api/deposit/infinitepay/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_nsu: orderToCheck }),
        });
        const data = await res.json();
        if (active && data?.ok && data?.paid && data?.player) {
          setPlayer(data.player);
          setInfiniteCheckoutUrl("");
          setActiveOrderNsu("");
          setLastMessage("Depósito confirmado na InfinitePay! Saldo creditado automaticamente.");
          try {
            window.localStorage.removeItem("pending_infinitepay_order_nsu");
          } catch {}
          if (urlOrderNsu) {
            window.history.replaceState({}, "", window.location.pathname);
          }
        }
      } catch {}
    }

    checkPaymentStatus();
    const timer = window.setInterval(checkPaymentStatus, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [player?.username, activeOrderNsu]);


  async function loadWithdrawHistory(targetUsername: string) {
    try {
      const res = await fetch(`/api/withdraw?username=${encodeURIComponent(targetUsername)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data?.ok && Array.isArray(data?.withdrawals)) {
        setWithdrawHistory(data.withdrawals);
      }
    } catch {}
  }


  function handleWithdrawAll() {
    const currentCents = Number(player?.balance_cents ?? 0);
    if (!Number.isFinite(currentCents) || currentCents <= 0) {
      setWithdrawError("Você não possui saldo disponível para sacar.");
      return;
    }
    setWithdrawError("");
    setWithdrawAmountReais((currentCents / 100).toFixed(2));
  }

  async function handleWithdrawSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!player) return;
    const normalized = withdrawAmountReais.replace(",", ".").trim();
    const parsedReais = Number(normalized);
    const amountCents = Math.round(parsedReais * 100);
    if (!Number.isFinite(parsedReais) || !Number.isInteger(amountCents) || amountCents < 1000 || amountCents > 10000000) {
      setWithdrawError("Informe um valor entre R$ 10,00 e R$ 100.000,00.");
      return;
    }
    if (!withdrawPixKey.trim() || withdrawPixKey.trim().length < 4) {
      setWithdrawError("Digite sua chave PIX (CPF, e-mail, celular ou chave aleatória).");
      return;
    }

    setWithdrawLoading(true);
    setWithdrawError("");
    setWithdrawSuccess("");
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: player.username,
          amountCents,
          pixKey: withdrawPixKey.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setWithdrawError(data?.error || "Não foi possível solicitar o saque.");
        return;
      }
      if (data?.player) {
        setPlayer(data.player);
      }
      setWithdrawSuccess(`Saque de ${formatBRL(amountCents)} registrado para a chave ${withdrawPixKey.trim()}!`);
      setLastMessage(`Solicitação de saque de ${formatBRL(amountCents)} enviada.`);
      void loadWithdrawHistory(player.username);
    } catch {
      setWithdrawError("Erro de rede ao solicitar saque.");
    } finally {
      setWithdrawLoading(false);
    }
  }

  async function handlePixDeposit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!player) return;
    const normalized = depositAmountReais.replace(",", ".").trim();
    const parsedReais = Number(normalized);
    const amountCents = Math.round(parsedReais * 100);
    if (!Number.isFinite(parsedReais) || !Number.isInteger(amountCents) || amountCents < 100 || amountCents > 10000000) {
      setDepositError("Informe um valor válido entre R$ 1,00 e R$ 100.000,00.");
      return;
    }

    setDepositLoading(true);
    setDepositError("");
    setCopiedPix(false);
    setInfiniteCheckoutUrl("");
    try {
      const res = await fetch("/api/deposit/infinitepay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: player.username,
          amountCents,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.checkout_url) {
        setDepositError(data?.error || "Não foi possível gerar o link de pagamento InfinitePay.");
        return;
      }
      setInfiniteCheckoutUrl(data.checkout_url);
      setActiveOrderNsu(data.order_nsu || "");
      if (data.order_nsu) {
        try {
          window.localStorage.setItem("pending_infinitepay_order_nsu", data.order_nsu);
        } catch {}
      }
      setLastMessage(`Checkout InfinitePay de ${formatBRL(amountCents)} gerado!`);
      window.location.href = data.checkout_url;
    } catch {
      setDepositError("Erro de rede ao conectar com o checkout InfinitePay.");
    } finally {
      setDepositLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-emerald-950 via-green-950 to-blue-950 text-yellow-200 flex items-center justify-center p-6 overflow-x-hidden max-w-full">
        <div className="rounded-2xl border-2 border-yellow-400/50 bg-emerald-950/90 px-6 py-4 text-sm font-semibold">
          🇧🇷 Verificando acesso ao Tigrinho do Brasil...
        </div>
      </main>
    );
  }

  if (player && typeof window !== "undefined") {
    const seenWelcome = window.localStorage.getItem("tigrinho_support_welcome_seen_v1");
    if (!seenWelcome) {
      window.localStorage.setItem("tigrinho_support_welcome_seen_v1", "1");
      queueMicrotask(() => setShowSupportModal(true));
    }
  }

  if (!player) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-emerald-950 via-green-950 to-blue-950 text-amber-50 flex flex-col items-center justify-center p-6 overflow-x-hidden max-w-full">
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
            
              <LoginTermsConsent accepted={termsAccepted} onAcceptedChange={setTermsAccepted} />
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
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
                {authLoading ? "Cadastrando..." : "Cadastrar e entrar"}
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
    <main className="min-h-screen bg-gradient-to-b from-emerald-950 via-green-950 to-blue-950 text-amber-50 flex flex-col items-center justify-center p-6 overflow-x-hidden max-w-full">
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
              onClick={() => {
                const next = !muted;
                setMuted(next);
                if (!next) unlockAudio();
              }}
              className="rounded-lg border border-blue-400/50 bg-blue-900/70 px-2.5 py-1.5 text-xs font-medium text-yellow-200 hover:bg-blue-800/80 cursor-pointer"
              title={muted ? "Ativar som" : "Silenciar som"}
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDepositError("");
                setPixReceipt(null);
                setShowDepositModal(true);
              }}
              className="rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-2.5 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30 cursor-pointer"
            >
              Depósitos
            </button>
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              className="rounded-lg border border-yellow-400/50 bg-yellow-400/15 px-2.5 py-1.5 text-xs font-bold text-yellow-200 hover:bg-yellow-400/25 cursor-pointer"
            >
              Meu Painel
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
            <span className="block text-2xl font-black tracking-wider text-yellow-300 uppercase">
              🎉 Excelente! 🎉
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
                        ? "transform 85ms linear"
                        : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                    className={`h-20 flex items-center justify-center rounded-lg text-3xl border select-none ${
                      isWinningCell
                        ? "border-yellow-300 bg-yellow-400/40 ring-2 ring-yellow-300 shadow-lg"
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
            <div className="pointer-events-none absolute inset-4 z-20">
              {winningLines.map((line) => {
                const styleCfg = LINE_STYLE_MAP[line.id];
                if (!styleCfg) return null;
                if (styleCfg.kind === "horizontal") {
                  return (
                    <div
                      key={line.id}
                      style={{ top: `${styleCfg.topPercent}%` }}
                      className={`absolute left-1 right-1 h-2 -translate-y-1/2 rounded-full ${styleCfg.colorClass}`}
                    />
                  );
                }
                return (
                  <div
                    key={line.id}
                    style={{ left: `${("leftPercent" in styleCfg ? styleCfg.leftPercent : 50)}%` }}
                    className={`absolute top-1 bottom-1 w-2 -translate-x-1/2 rounded-full ${styleCfg.colorClass}`}
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
      
              <div className="pt-3 border-t border-yellow-400/20 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold text-yellow-300">Saque via PIX</div>
                  <div className="text-[11px] text-emerald-200/80">
                    Saldo disponível: <span className="font-bold text-white">{formatBRL(Number(player?.balance_cents ?? 0))}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileModal(false);
                    setWithdrawError("");
                    setWithdrawSuccess("");
                    setShowWithdrawModal(true);
                    if (player?.username) {
                      void loadWithdrawHistory(player.username);
                    }
                  }}
                  className="shrink-0 rounded-xl bg-amber-400 hover:bg-amber-300 px-4 py-2 text-xs font-black text-blue-950 transition cursor-pointer"
                >
                  Sacar
                </button>
              </div>
            </div>
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-md rounded-2xl border border-yellow-400/40 bg-blue-950 p-5 text-yellow-100 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-yellow-400/20 pb-3">
                <div>
                  <h2 className="text-base font-extrabold text-yellow-300">Painel do Usuário</h2>
                  <p className="text-xs text-emerald-200/80">@{player.username}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="rounded-lg border border-yellow-400/30 px-2.5 py-1 text-xs font-bold text-yellow-200 hover:bg-blue-900 cursor-pointer"
                >
                  Fechar
                </button>
              </div>

              <div className="space-y-2.5 rounded-xl bg-blue-900/40 border border-emerald-700/50 p-3.5 text-xs">
                <div>
                  <span className="block text-emerald-200/70">Nome</span>
                  <strong className="text-sm text-white">{player.full_name || player.username}</strong>
                </div>
                <div>
                  <span className="block text-emerald-200/70">E-mail</span>
                  <strong className="text-sm text-white">{player.email || "Não informado"}</strong>
                </div>
                <div>
                  <span className="block text-emerald-200/70">Telefone</span>
                  <strong className="text-sm text-white">{player.phone || "Não informado"}</strong>
                </div>
                <div className="pt-1 border-t border-emerald-700/40 flex items-center justify-between">
                  <span className="text-emerald-200/80">Saldo disponível</span>
                  <strong className="text-base font-mono text-yellow-300">{formatBRL(player.balance_cents)}</strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowProfileModal(false);
                  setDepositError("");
                  setPixReceipt(null);
                  setShowDepositModal(true);
                }}
                className="w-full py-3 rounded-xl font-extrabold text-blue-950 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-300 hover:from-yellow-200 hover:to-yellow-300 transition cursor-pointer shadow-lg"
              >
                Depositar (InfinitePay)
              </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileModal(false);
                    setWithdrawError("");
                    setWithdrawSuccess("");
                    setShowWithdrawModal(true);
                    if (player?.username) {
                      void loadWithdrawHistory(player.username);
                    }
                  }}
                  className="w-full rounded-xl bg-amber-400 hover:bg-amber-300 px-4 py-2.5 text-xs font-black text-blue-950 transition cursor-pointer"
                >
                  Sacar Saldo via PIX
                </button>
            </div>
          </div>
        )}

        {showDepositModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-md rounded-2xl border border-emerald-400/40 bg-blue-950 p-5 text-yellow-100 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-emerald-400/20 pb-3">
                <div>
                  <h2 className="text-base font-extrabold text-emerald-300">Depósito InfinitePay (PIX ou Cartão)</h2>
                  <p className="text-xs text-emerald-200/80">Saldo atual: {formatBRL(player.balance_cents)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDepositModal(false)}
                  className="rounded-lg border border-yellow-400/30 px-2.5 py-1 text-xs font-bold text-yellow-200 hover:bg-blue-900 cursor-pointer"
                >
                  Fechar
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {["10", "20", "50", "100"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setDepositAmountReais(preset);
                      setDepositError("");
                    }}
                    className={`py-2 rounded-lg text-xs font-bold border cursor-pointer ${
                      depositAmountReais === preset
                        ? "bg-emerald-400 text-blue-950 border-emerald-300"
                        : "bg-blue-900/50 text-emerald-100 border-emerald-700/60 hover:border-emerald-400"
                    }`}
                  >
                    R$ {preset}
                  </button>
                ))}
              </div>

              <form onSubmit={handlePixDeposit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-emerald-200 mb-1">
                    Valor do depósito (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={depositAmountReais}
                    onChange={(e) => setDepositAmountReais(e.target.value)}
                    placeholder="Ex.: 20.00"
                    className="w-full rounded-xl border border-emerald-600/60 bg-blue-900/50 px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-emerald-300"
                  />
                </div>

                {depositError && (
                  <p className="text-xs font-semibold text-rose-300 bg-rose-950/60 border border-rose-500/40 rounded-lg px-3 py-2">
                    {depositError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={depositLoading}
                  className="w-full py-3 rounded-xl font-extrabold text-blue-950 bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-300 hover:from-emerald-200 hover:to-emerald-300 disabled:opacity-50 transition cursor-pointer shadow-lg"
                >
                  {depositLoading ? "Abrindo Checkout InfinitePay..." : "Pagar com InfinitePay"}
                </button>
              </form>

              {infiniteCheckoutUrl && (
                <div className="space-y-2.5 rounded-xl border border-emerald-400/40 bg-emerald-950/40 p-3 text-center">
                  <span className="block text-xs text-emerald-200/90">
                    Checkout InfinitePay pronto (PIX ou Cartão)
                  </span>
                  {activeOrderNsu && (
                    <span className="block text-[11px] font-mono text-emerald-300/80">
                      Pedido: {activeOrderNsu}
                    </span>
                  )}
                  <a
                    href={infiniteCheckoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-2.5 rounded-lg font-extrabold bg-emerald-400 hover:bg-emerald-300 text-blue-950 transition text-xs"
                  >
                    Abrir Checkout InfinitePay
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

    
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-amber-400/30 bg-blue-950 p-5 text-amber-50 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-black text-amber-300">Solicitar Saque PIX</h2>
                <p className="text-xs text-emerald-200/80">
                  Saldo disponível: <span className="font-bold text-white">{formatBRL(Number(player?.balance_cents ?? 0))}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWithdrawModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleWithdrawSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-emerald-100 mb-1">
                  Chave PIX (CPF, e-mail, celular ou aleatória)
                </label>
                <input
                  type="text"
                  value={withdrawPixKey}
                  onChange={(e) => setWithdrawPixKey(e.target.value)}
                  placeholder="Ex.: 000.000.000-00 ou seu@email.com"
                  className="w-full rounded-xl border border-white/15 bg-blue-900/60 px-3.5 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-emerald-100 mb-1">
                  Valor do saque (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={withdrawAmountReais}
                  onChange={(e) => setWithdrawAmountReais(e.target.value)}
                  placeholder="20"
                  className="w-full rounded-xl border border-white/15 bg-blue-900/60 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                />
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawError("");
                      setWithdrawAmountReais("20");
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/10 hover:bg-white/20 text-amber-100 transition cursor-pointer"
                  >
                    R$ 20
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawError("");
                      setWithdrawAmountReais("50");
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/10 hover:bg-white/20 text-amber-100 transition cursor-pointer"
                  >
                    R$ 50
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawError("");
                      setWithdrawAmountReais("100");
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/10 hover:bg-white/20 text-amber-100 transition cursor-pointer"
                  >
                    R$ 100
                  </button>
                  <button
                    type="button"
                    onClick={handleWithdrawAll}
                    className="ml-auto px-3 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-400 hover:bg-emerald-300 text-blue-950 transition cursor-pointer"
                  >
                    Sacar tudo
                  </button>
                </div>
              </div>

              {withdrawError && (
                <div className="rounded-xl border border-rose-400/40 bg-rose-950/60 px-3 py-2 text-xs text-rose-200">
                  {withdrawError}
                </div>
              )}

              {withdrawSuccess && (
                <div className="rounded-xl border border-emerald-400/40 bg-emerald-950/60 px-3 py-2 text-xs text-emerald-200">
                  {withdrawSuccess}
                </div>
              )}

              {withdrawHistory.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-emerald-200/75">
                    Seus últimos saques
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {withdrawHistory.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-blue-900/50 border border-white/10 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-amber-200 truncate">
                            {formatBRL(Number(item.amount_cents))}
                          </div>
                          <div className="text-[11px] text-white/70 truncate">{item.pix_key}</div>
                        </div>
                        <span className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-extrabold bg-amber-400/20 text-amber-200 border border-amber-300/30">
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={withdrawLoading}
                className="w-full py-3 rounded-xl font-black text-sm bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-blue-950 transition cursor-pointer"
              >
                {withdrawLoading ? "Processando saque..." : "Confirmar Saque PIX"}
              </button>
            </form>
          </div>
        </div>
      )}

    
        <TermsSupportModal open={showSupportModal} onClose={() => setShowSupportModal(false)} />
      </main>
  );
}
