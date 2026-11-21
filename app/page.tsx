"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

type SymbolId = "tiger" | "ingot" | "bag" | "lantern" | "envelope" | "orange";

interface SymbolConfig {
  id: SymbolId;
  name: string;
  glyph: string;
  payout3: number;
  weight: number;
  accent: string;
}

const SYMBOLS: SymbolConfig[] = [
  { id: "tiger", name: "Tigre Dourado", glyph: "🐯", payout3: 25, weight: 8, accent: "from-amber-400 to-orange-600" },
  { id: "ingot", name: "Lingote", glyph: "🪙", payout3: 10, weight: 14, accent: "from-yellow-300 to-amber-500" },
  { id: "bag", name: "Bolsa da Sorte", glyph: "💰", payout3: 8, weight: 18, accent: "from-emerald-400 to-teal-600" },
  { id: "lantern", name: "Lanterna", glyph: "🏮", payout3: 5, weight: 22, accent: "from-rose-500 to-red-700" },
  { id: "envelope", name: "Envelope", glyph: "🧧", payout3: 3, weight: 26, accent: "from-red-400 to-rose-600" },
  { id: "orange", name: "Tangerina", glyph: "🍊", payout3: 2, weight: 30, accent: "from-orange-300 to-amber-500" },
];

const SYMBOL_MAP: Record<SymbolId, SymbolConfig> = SYMBOLS.reduce(
  (acc, item) => ({ ...acc, [item.id]: item }),
  {} as Record<SymbolId, SymbolConfig>
);

const BET_OPTIONS = [10, 20, 50, 100, 200];

const PAYLINES: { name: string; cells: [number, number, number] }[] = [
  { name: "Linha Superior", cells: [0, 1, 2] },
  { name: "Linha Central", cells: [3, 4, 5] },
  { name: "Linha Inferior", cells: [6, 7, 8] },
  { name: "Diagonal Principal", cells: [0, 4, 8] },
  { name: "Diagonal Secundária", cells: [2, 4, 6] },
];

function pickWeightedSymbol(): SymbolId {
  const totalWeight = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const sym of SYMBOLS) {
    roll -= sym.weight;
    if (roll <= 0) return sym.id;
  }
  return SYMBOLS[SYMBOLS.length - 1].id;
}

function evaluateGrid(grid: SymbolId[], bet: number) {
  const winningCells = new Set<number>();
  const matchedLines: string[] = [];
  let baseMultiplier = 0;

  const firstNonWild = grid.find((s) => s !== "tiger") ?? "tiger";
  const allSameOrWild = grid.every((s) => s === firstNonWild || s === "tiger");

  if (allSameOrWild) {
    const fullMultiplier = SYMBOL_MAP[firstNonWild].payout3 * 10;
    grid.forEach((_, idx) => winningCells.add(idx));
    return {
      winAmount: bet * fullMultiplier,
      winningCells,
      matchedLines: [`GRADE COMPLETA (${SYMBOL_MAP[firstNonWild].name} ×${fullMultiplier})`],
      isFullGridBonus: true,
    };
  }

  for (const line of PAYLINES) {
    const [a, b, c] = line.cells;
    const sA = grid[a];
    const sB = grid[b];
    const sC = grid[c];
    const candidates = [sA, sB, sC].filter((s) => s !== "tiger");
    const targetSymbol: SymbolId = candidates.length > 0 ? candidates[0] : "tiger";

    const matches =
      (sA === targetSymbol || sA === "tiger") &&
      (sB === targetSymbol || sB === "tiger") &&
      (sC === targetSymbol || sC === "tiger");

    if (matches) {
      baseMultiplier += SYMBOL_MAP[targetSymbol].payout3;
      matchedLines.push(`${line.name}: ${SYMBOL_MAP[targetSymbol].glyph} ×${SYMBOL_MAP[targetSymbol].payout3}`);
      winningCells.add(a);
      winningCells.add(b);
      winningCells.add(c);
    }
  }

  return {
    winAmount: bet * baseMultiplier,
    winningCells,
    matchedLines,
    isFullGridBonus: false,
  };
}

interface ReelColumnState {
  symbols: SymbolId[];
  spinning: boolean;
  landed: boolean;
}

function createInitialColumns(): [ReelColumnState, ReelColumnState, ReelColumnState] {
  return [
    { symbols: ["lantern", "orange", "ingot"], spinning: false, landed: false },
    { symbols: ["tiger", "tiger", "tiger"], spinning: false, landed: false },
    { symbols: ["envelope", "bag", "orange"], spinning: false, landed: false },
  ];
}

export default function FortuneTigerDemoPage() {
  const [balance, setBalance] = useState<number>(1000);
  const [bet, setBet] = useState<number>(20);
  const [columns, setColumns] = useState<[ReelColumnState, ReelColumnState, ReelColumnState]>(createInitialColumns);
  const [turbo, setTurbo] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [lastWin, setLastWin] = useState<number>(0);
  const [winningCells, setWinningCells] = useState<Set<number>>(new Set());
  const [statusBanner, setStatusBanner] = useState<string>("Toque em GIRAR para testar sua sorte");
  const [isBonusFlash, setIsBonusFlash] = useState<boolean>(false);

  const intervalsRef = useRef<number[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef<boolean>(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const isSpinning = columns[0].spinning || columns[1].spinning || columns[2].spinning;

  const unlockAudio = useCallback(async () => {
    if (!soundEnabledRef.current || typeof window === "undefined") return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === "suspended") {
      try {
        await audioCtxRef.current.resume();
      } catch {
        // Ignora bloqueio temporário do navegador
      }
    }
    return audioCtxRef.current;
  }, []);

  const playReelTick = useCallback((colIndex: number) => {
    if (!soundEnabledRef.current) return;
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state !== "running") return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    const startFreq = 280 + colIndex * 50 + Math.random() * 45;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(105, now + 0.035);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  }, []);

  const playReelStop = useCallback((colIndex: number) => {
    if (!soundEnabledRef.current) return;
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state !== "running") return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(190 + colIndex * 30, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.09);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }, []);

  const playWinSound = useCallback((isBonus: boolean) => {
    if (!soundEnabledRef.current) return;
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state !== "running") return;

    const notes = isBonus ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const now = ctx.currentTime + idx * 0.095;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    });
  }, []);

  const handleToggleSound = async () => {
    if (isSpinning) return;
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEnabledRef.current = next;

    if (next) {
      const ctx = await unlockAudio();
      if (ctx && ctx.state === "running") {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
      }
    }
  };

  const clearTimers = () => {
    intervalsRef.current.forEach((id) => window.clearInterval(id));
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    intervalsRef.current = [];
    timeoutsRef.current = [];
  };

  useEffect(() => {
    return () => {
      clearTimers();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const generateOutcomeColumns = (): [
    [SymbolId, SymbolId, SymbolId],
    [SymbolId, SymbolId, SymbolId],
    [SymbolId, SymbolId, SymbolId]
  ] => {
    const grid: SymbolId[] = Array.from({ length: 9 }, () => pickWeightedSymbol());
    const forceHit = Math.random() < 0.22;

    if (forceHit) {
      const chosenLine = PAYLINES[Math.floor(Math.random() * PAYLINES.length)];
      const chosenSymbol = pickWeightedSymbol();
      chosenLine.cells.forEach((cellIndex) => {
        grid[cellIndex] = chosenSymbol;
      });
    }

    const col0: [SymbolId, SymbolId, SymbolId] = [grid[0], grid[3], grid[6]];
    const col1: [SymbolId, SymbolId, SymbolId] = [grid[1], grid[4], grid[7]];
    const col2: [SymbolId, SymbolId, SymbolId] = [grid[2], grid[5], grid[8]];
    return [col0, col1, col2];
  };

  const handleSpin = async () => {
    if (isSpinning) return;

    if (balance < bet) {
      setStatusBanner("Saldo insuficiente! Recarregue ou diminua a aposta.");
      return;
    }

    await unlockAudio();
    clearTimers();
    setLastWin(0);
    setWinningCells(new Set());
    setIsBonusFlash(false);
    setBalance((prev) => prev - bet);
    setStatusBanner("Rolos descendo...");

    const finalCols = generateOutcomeColumns();
    const stepMs = turbo ? 55 : 90;
    const stopDelays = turbo ? [320, 560, 800] : [700, 1150, 1600];

    setColumns((prev) => [
      { ...prev[0], spinning: true, landed: false },
      { ...prev[1], spinning: true, landed: false },
      { ...prev[2], spinning: true, landed: false },
    ]);

    ([0, 1, 2] as const).forEach((colIdx) => {
      const intervalId = window.setInterval(() => {
        playReelTick(colIdx);
        setColumns((prev) => {
          const next = [...prev] as [ReelColumnState, ReelColumnState, ReelColumnState];
          if (!next[colIdx].spinning) return prev;
          const newTop = pickWeightedSymbol();
          next[colIdx] = {
            ...next[colIdx],
            symbols: [newTop, next[colIdx].symbols[0], next[colIdx].symbols[1]],
          };
          return next;
        });
      }, stepMs);

      intervalsRef.current.push(intervalId);

      const timeoutId = window.setTimeout(() => {
        window.clearInterval(intervalId);
        playReelStop(colIdx);

        setColumns((prev) => {
          const next = [...prev] as [ReelColumnState, ReelColumnState, ReelColumnState];
          next[colIdx] = {
            symbols: [...finalCols[colIdx]],
            spinning: false,
            landed: true,
          };

          if (!next[0].spinning && !next[1].spinning && !next[2].spinning) {
            const flatGrid: SymbolId[] = [
              next[0].symbols[0], next[1].symbols[0], next[2].symbols[0],
              next[0].symbols[1], next[1].symbols[1], next[2].symbols[1],
              next[0].symbols[2], next[1].symbols[2], next[2].symbols[2],
            ];

            const result = evaluateGrid(flatGrid, bet);
            if (result.winAmount > 0) {
              setBalance((b) => b + result.winAmount);
              setLastWin(result.winAmount);
              setWinningCells(result.winningCells);
              setIsBonusFlash(result.isFullGridBonus);
              setStatusBanner(result.matchedLines.join(" • "));
              playWinSound(result.isFullGridBonus);
            } else {
              setStatusBanner("Sem combinação nesta rodada — tente novamente!");
            }
          }

          return next;
        });
      }, stopDelays[colIdx]);

      timeoutsRef.current.push(timeoutId);
    });
  };

  const handleRefill = () => {
    if (isSpinning) return;
    setBalance(1000);
    setLastWin(0);
    setWinningCells(new Set());
    setStatusBanner("Saldo demo recarregado para 1.000!");
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-red-950 via-zinc-950 to-black text-amber-50 flex flex-col items-center justify-center p-4 select-none">
      <style jsx global>{`
        @keyframes dropDownReel {
          0% {
            transform: translateY(-28px);
          }
          100% {
            transform: translateY(0px);
          }
        }
        @keyframes landBounce {
          0% {
            transform: translateY(-10px) scale(0.98);
          }
          65% {
            transform: translateY(4px) scale(1.02);
          }
          100% {
            transform: translateY(0px) scale(1);
          }
        }
        .reel-drop-spin {
          animation: dropDownReel 0.09s linear infinite;
        }
        .reel-land-bounce {
          animation: landBounce 0.2s cubic-bezier(0.22, 1, 0.36, 1);
        }
      `}</style>

      <div
        className={`w-full max-w-md rounded-3xl border-2 ${
          isBonusFlash ? "border-yellow-300 shadow-[0_0_40px_rgba(250,204,21,0.55)]" : "border-amber-500/50 shadow-2xl"
        } bg-zinc-900/95 p-4 space-y-4`}
      >
        <header className="flex items-center justify-between gap-2 border-b border-amber-500/20 pb-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-amber-400 font-semibold">
              Protótipo Educativo • Sem Valor Real
            </p>
            <h1 className="text-xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500">
              🐯 Fortune Tiger Demo
            </h1>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleSound}
              disabled={isSpinning}
              className={`px-2.5 py-1.5 rounded-full text-xs font-bold border transition ${
                soundEnabled
                  ? "bg-emerald-400/20 text-emerald-300 border-emerald-400/40"
                  : "bg-zinc-800 text-zinc-400 border-zinc-700"
              }`}
            >
              {soundEnabled ? "🔊 SOM" : "🔇 MUDO"}
            </button>

            <button
              type="button"
              onClick={() => setTurbo((t) => !t)}
              disabled={isSpinning}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                turbo
                  ? "bg-amber-400 text-zinc-950 border-amber-300"
                  : "bg-zinc-800 text-amber-300 border-amber-500/30 hover:bg-zinc-700"
              }`}
            >
              ⚡ TURBO {turbo ? "ON" : "OFF"}
            </button>
          </div>
        </header>

        <section className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-zinc-950/90 border border-amber-500/20 p-2.5">
            <span className="block text-[10px] uppercase tracking-wider text-zinc-400">Saldo</span>
            <span className="text-base font-bold text-emerald-400">{balance}</span>
          </div>

          <div className="rounded-2xl bg-zinc-950/90 border border-amber-500/20 p-2.5">
            <span className="block text-[10px] uppercase tracking-wider text-zinc-400">Aposta</span>
            <span className="text-base font-bold text-amber-300">{bet}</span>
          </div>

          <div className="rounded-2xl bg-zinc-950/90 border border-amber-500/20 p-2.5">
            <span className="block text-[10px] uppercase tracking-wider text-zinc-400">Ganho</span>
            <span className={`text-base font-bold ${lastWin > 0 ? "text-yellow-300 animate-pulse" : "text-zinc-500"}`}>
              {lastWin > 0 ? `+${lastWin}` : "0"}
            </span>
          </div>
        </section>

        <section className="rounded-2xl bg-gradient-to-b from-red-900/40 to-zinc-950 border-2 border-amber-500/40 p-3 overflow-hidden">
          <div className="grid grid-cols-3 gap-2.5">
            {columns.map((col, colIndex) => (
              <div
                key={colIndex}
                className={`overflow-hidden rounded-2xl bg-zinc-950/60 p-1 border border-amber-500/15 ${
                  col.spinning ? "reel-drop-spin" : col.landed ? "reel-land-bounce" : ""
                }`}
              >
                <div className="flex flex-col gap-2">
                  {col.symbols.map((symbolId, rowIndex) => {
                    const cellIndex = rowIndex * 3 + colIndex;
                    const isWinner = winningCells.has(cellIndex);
                    const sym = SYMBOL_MAP[symbolId];

                    return (
                      <div
                        key={`${colIndex}-${rowIndex}`}
                        className={`h-22 rounded-xl flex flex-col items-center justify-center border transition-all duration-150 ${
                          isWinner
                            ? `bg-gradient-to-br ${sym.accent} border-yellow-200 scale-105 shadow-lg shadow-amber-500/30 text-zinc-950`
                            : "bg-zinc-900/95 border-amber-500/20 text-white"
                        } ${col.spinning ? "blur-[0.6px]" : ""}`}
                      >
                        <span className="text-4xl leading-none" role="img" aria-label={sym.name}>
                          {sym.glyph}
                        </span>
                        <span
                          className={`mt-1.5 text-[10px] font-semibold tracking-tight ${
                            isWinner ? "text-zinc-950" : "text-amber-200/75"
                          }`}
                        >
                          {sym.id === "tiger" ? "WILD ×25" : `×${sym.payout3}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="min-h-10 rounded-xl bg-zinc-950/80 border border-amber-500/15 px-3 py-2 flex items-center justify-center text-center">
          <p className="text-xs font-medium text-amber-200">{statusBanner}</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
            <span>Valor da aposta</span>
            <button
              type="button"
              onClick={handleRefill}
              disabled={isSpinning}
              className="text-amber-400 hover:underline disabled:opacity-40"
            >
              Recarregar 1.000
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {BET_OPTIONS.map((amount) => {
              const active = bet === amount;
              return (
                <button
                  key={amount}
                  type="button"
                  disabled={isSpinning}
                  onClick={() => setBet(amount)}
                  className={`py-2 rounded-xl text-xs font-bold border transition ${
                    active
                      ? "bg-amber-500 text-zinc-950 border-amber-300"
                      : "bg-zinc-800/90 text-zinc-300 border-zinc-700 hover:bg-zinc-700"
                  } disabled:opacity-40`}
                >
                  {amount}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSpin}
          disabled={isSpinning}
          className="w-full py-4 rounded-2xl font-black text-lg tracking-wider uppercase bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500 text-zinc-950 shadow-lg shadow-amber-500/25 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50"
        >
          {isSpinning ? "Girando..." : "Girar"}
        </button>

        <footer className="pt-2 border-t border-zinc-800 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
          {SYMBOLS.map((s) => (
            <span key={s.id}>
              {s.glyph} 3x = <strong className="text-amber-300">{s.payout3}x</strong>
            </span>
          ))}
          <span className="text-yellow-300 font-semibold">• Grade 9x = 10x bônus</span>
        </footer>
      </div>
    </main>
  );
}
