"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  balance_cents: string;
}

const SYMBOLS = ["🐯", "🪙", "🧧", "🍊", "🧨", "💎"];
const INITIAL_GRID = ["🐯", "🪙", "🧧", "🐯", "🐯", "🐯", "🍊", "🧨", "💎"];
const BET_OPTIONS = [100, 500, 1000, 2000];

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

  const playReelTick = useCallback(
    (pitchMultiplier = 1) => {
      const ctx = getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(520 * pitchMultiplier, now);
      osc.frequency.exponentialRampToValueAtTime(160 * pitchMultiplier, now + 0.035);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.042);
    },
    [getContext]
  );

  const playReelStop = useCallback(
    (colIndex: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(210 + colIndex * 45, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.09);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    },
    [getContext]
  );

  const playWinFanfare = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const start = now + i * 0.085;
      const dur = i === notes.length - 1 ? 0.28 : 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
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
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }, [getContext]);

  return { playReelTick, playReelStop, playWinFanfare, playLossSound };
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
  const [username] = useState("jogador_demo");
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [reels, setReels] = useState<ReelState[]>(() =>
    gridToColumns(INITIAL_GRID).map((symbols) => ({
      symbols,
      spinning: false,
      dropOffset: false,
    }))
  );
  const [betCents, setBetCents] = useState<number>(500);
  const [recentSpins, setRecentSpins] = useState<SpinItem[]>([]);
  const [lastMessage, setLastMessage] = useState<string>("Carregando saldo...");
  const [loadingPlayer, setLoadingPlayer] = useState<boolean>(true);
  const [spinning, setSpinning] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);

  const { playReelTick, playReelStop, playWinFanfare, playLossSound } = useSlotSound();

  const loadPlayerData = useCallback(async () => {
    setLoadingPlayer(true);
    try {
      const res = await fetch(`/api/player?username=${encodeURIComponent(username)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setLastMessage(data.error || "Erro ao carregar dados do jogador.");
        return;
      }
      setPlayer(data.player);
      setRecentSpins(data.recentSpins || []);
      setLastMessage("Pronto para girar.");
    } catch {
      setLastMessage("Falha de rede ao consultar /api/player.");
    } finally {
      setLoadingPlayer(false);
    }
  }, [username]);

  useEffect(() => {
    loadPlayerData();
  }, [loadPlayerData]);

  async function handleSpin() {
    if (spinning) return;
    setSpinning(true);
    setLastMessage("Girando...");

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
        playReelTick(0.9 + (tickCount % 5) * 0.06);
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
    }, 75);

    try {
      const minSpinPromise = new Promise((resolve) => setTimeout(resolve, 650));
      const fetchPromise = fetch("/api/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, betCents }),
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
        if (!muted) {
          playReelStop(col);
        }
      }

      clearInterval(tickInterval);
      setPlayer(data.player);

      if (data.spin) {
        setRecentSpins((prev) => [data.spin, ...prev].slice(0, 10));
        const payout = Number(data.spin.payout_cents);
        if (payout > 0) {
          setLastMessage(`Vitória! Prêmio de ${formatBRL(payout)} (${data.spin.outcome}).`);
          if (!muted) playWinFanfare();
        } else {
          setLastMessage(`Sem prêmio na linha do meio (${data.spin.outcome}).`);
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

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-amber-400">Jogo do Tigrinho (Demo)</h1>
            <p className="text-xs text-zinc-400">Jogador: {username}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-amber-500/60 cursor-pointer"
              title={muted ? "Ativar som" : "Silenciar som"}
            >
              {muted ? "🔇 Som Off" : "🔊 Som On"}
            </button>
            <div className="text-right">
              <span className="block text-xs text-zinc-400">Saldo</span>
              <strong className="text-lg font-mono text-emerald-400">
                {loadingPlayer || !player ? "..." : formatBRL(player.balance_cents)}
              </strong>
            </div>
          </div>
        </div>

        <div className="relative grid grid-cols-3 gap-2 rounded-xl bg-zinc-950 p-4 border border-zinc-800 overflow-hidden">
          {reels.map((reel, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-2 overflow-hidden">
              {reel.symbols.map((symbol, rowIdx) => {
                const isMiddleRow = rowIdx === 1;
                return (
                  <div
                    key={`${colIdx}-${rowIdx}`}
                    style={{
                      transform: reel.spinning
                        ? `translateY(${reel.dropOffset ? "10px" : "-10px"})`
                        : "translateY(0px)",
                      transition: reel.spinning
                        ? "transform 75ms linear"
                        : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                    className={`h-20 flex items-center justify-center rounded-lg text-3xl border select-none ${
                      isMiddleRow
                        ? "border-amber-500/70 bg-amber-500/10"
                        : "border-zinc-800 bg-zinc-900/70"
                    }`}
                  >
                    {symbol}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <span className="block text-xs text-zinc-400">Valor da aposta</span>
          <div className="grid grid-cols-4 gap-2">
            {BET_OPTIONS.map((amount) => {
              const active = betCents === amount;
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setBetCents(amount)}
                  disabled={spinning}
                  className={`py-2 rounded-lg text-xs font-semibold border transition ${
                    active
                      ? "bg-amber-500 text-zinc-950 border-amber-400"
                      : "bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700"
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
          disabled={spinning || loadingPlayer}
          className="w-full py-3 rounded-xl font-bold text-zinc-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition cursor-pointer"
        >
          {spinning ? "Girando..." : `Girar (${formatBRL(betCents)})`}
        </button>

        <p className="text-sm text-center text-zinc-300 bg-zinc-950/80 border border-zinc-800/80 rounded-lg py-2 px-3">
          {lastMessage}
        </p>

        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Últimas rodadas
          </h2>
          {recentSpins.length === 0 ? (
            <p className="text-xs text-zinc-500">Nenhuma rodada registrada ainda.</p>
          ) : (
            <ul className="space-y-1.5 max-h-44 overflow-y-auto text-xs">
              {recentSpins.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-lg bg-zinc-950 border border-zinc-800/70 px-3 py-2"
                >
                  <span className="font-mono text-zinc-300">
                    Aposta {formatBRL(s.bet_cents)} → Prêmio {formatBRL(s.payout_cents)}
                  </span>
                  <span
                    className={`font-semibold ${
                      Number(s.payout_cents) > 0 ? "text-emerald-400" : "text-zinc-500"
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
