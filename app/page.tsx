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
  { id: "tiger", name: "Tigre Brasil", glyph: "🐯", payout3: 25, weight: 8, accent: "from-yellow-300 via-amber-400 to-emerald-500" },
  { id: "ingot", name: "Ouro Verde", glyph: "🪙", payout3: 10, weight: 14, accent: "from-yellow-300 to-amber-500" },
  { id: "bag", name: "Bolsa da Sorte", glyph: "💰", payout3: 8, weight: 18, accent: "from-emerald-400 to-green-600" },
  { id: "lantern", name: "Estrela Azul", glyph: "🌟", payout3: 5, weight: 22, accent: "from-sky-400 to-blue-700" },
  { id: "envelope", name: "Cofre Azul", glyph: "💎", payout3: 3, weight: 26, accent: "from-cyan-300 to-blue-600" },
  { id: "orange", name: "Fruta Tropical", glyph: "🍍", payout3: 2, weight: 30, accent: "from-yellow-300 to-lime-500" },
];

const SYMBOL_MAP: Record<SymbolId, SymbolConfig> = SYMBOLS.reduce(
  (acc, item) => ({ ...acc, [item.id]: item }),
  {} as Record<SymbolId, SymbolConfig>
);

const BET_STEPS = [5, 10, 20, 50, 100, 200, 500];
const AUTO_OPTIONS = [5, 10, 25, 50];

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
      matchedLines: [`GRADE COMPLETA 10× (${SYMBOL_MAP[firstNonWild].name} ×${fullMultiplier})`],
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

function createToneWavDataUri(freqHz: number, durationSec: number, volume = 0.35): string {
  const sampleRate = 8000;
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = 1 - i / numSamples;
    const sample = Math.sin(2 * Math.PI * freqHz * t) * env * volume;
    const byte = Math.max(0, Math.min(255, Math.floor(128 + sample * 127)));
    view.setUint8(44 + i, byte);
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

interface ReelColumnState {
  strip: [SymbolId, SymbolId, SymbolId, SymbolId];
  spinning: boolean;
  stepping: boolean;
  landed: boolean;
}

function createInitialColumns(): [ReelColumnState, ReelColumnState, ReelColumnState] {
  return [
    { strip: ["bag", "lantern", "orange", "ingot"], spinning: false, stepping: false, landed: false },
    { strip: ["ingot", "tiger", "tiger", "tiger"], spinning: false, stepping: false, landed: false },
    { strip: ["lantern", "envelope", "bag", "orange"], spinning: false, stepping: false, landed: false },
  ];
}

export default function TigrinhoBrasilPage() {
  const [balance, setBalance] = useState<number>(1000);
  const [betIndex, setBetIndex] = useState<number>(2);
  const [columns, setColumns] = useState<[ReelColumnState, ReelColumnState, ReelColumnState]>(createInitialColumns);
  const [turbo, setTurbo] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [autoSpinsLeft, setAutoSpinsLeft] = useState<number>(0);
  const [showBetMenu, setShowBetMenu] = useState<boolean>(false);
  const [lastWin, setLastWin] = useState<number>(0);
  const [winningCells, setWinningCells] = useState<Set<number>>(new Set());
  const [statusBanner, setStatusBanner] = useState<string>("Bem-vindo ao Tigrinho Brasil! Toque em GIRAR");
  const [isBonusFlash, setIsBonusFlash] = useState<boolean>(false);

  const bet = BET_STEPS[betIndex];
  const isSpinning = columns[0].spinning || columns[1].spinning || columns[2].spinning;

  const intervalsRef = useRef<number[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  const autoSpinsRef = useRef<number>(autoSpinsLeft);
  const balanceRef = useRef<number>(balance);
  const betRef = useRef<number>(bet);
  const turboRef = useRef<boolean>(turbo);

  const tickAudioRef = useRef<HTMLAudioElement | null>(null);
  const stopAudioRef = useRef<HTMLAudioElement | null>(null);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { autoSpinsRef.current = autoSpinsLeft; }, [autoSpinsLeft]);
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => { betRef.current = bet; }, [bet]);
  useEffect(() => { turboRef.current = turbo; }, [turbo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    tickAudioRef.current = new Audio(createToneWavDataUri(340, 0.03, 0.28));
    stopAudioRef.current = new Audio(createToneWavDataUri(160, 0.08, 0.42));
    winAudioRef.current = new Audio(createToneWavDataUri(660, 0.22, 0.45));
  }, []);

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
        // Ignora bloqueio temporário
      }
    }
    return audioCtxRef.current;
  }, []);

  const playFallbackAudio = (el: HTMLAudioElement | null) => {
    if (!soundEnabledRef.current || !el) return;
    try {
      el.currentTime = 0;
      const promise = el.play();
      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {});
      }
    } catch {
      // Ignora erro
    }
  };

  const playReelTick = useCallback((colIndex: number) => {
    if (!soundEnabledRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === "running") {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(290 + colIndex * 45 + Math.random() * 40, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.032);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.036);
    } else {
      playFallbackAudio(tickAudioRef.current);
    }
  }, []);

  const playReelStop = useCallback((colIndex: number) => {
    if (!soundEnabledRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === "running") {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(185 + colIndex * 25, now);
      osc.frequency.exponentialRampToValueAtTime(68, now + 0.085);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.095);
    } else {
      playFallbackAudio(stopAudioRef.current);
    }
  }, []);

  const playWinSound = useCallback((isBonus: boolean) => {
    if (!soundEnabledRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === "running") {
      const notes = isBonus ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const now = ctx.currentTime + idx * 0.095;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      });
    } else {
      playFallbackAudio(winAudioRef.current);
    }
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
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else {
        playFallbackAudio(winAudioRef.current);
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
    const forceHit = Math.random() < 0.24;

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

  const startSingleSpin = useCallback(
    async (isAutoStep = false) => {
      const currentBet = betRef.current;
      const currentBalance = balanceRef.current;

      if (currentBalance < currentBet) {
        setAutoSpinsLeft(0);
        autoSpinsRef.current = 0;
        setStatusBanner("Saldo insuficiente! Recarregue ou reduza a aposta.");
        return;
      }

      await unlockAudio();
      clearTimers();
      setShowBetMenu(false);
      setLastWin(0);
      setWinningCells(new Set());
      setIsBonusFlash(false);

      const nextBalance = currentBalance - currentBet;
      balanceRef.current = nextBalance;
      setBalance(nextBalance);
      setStatusBanner(isAutoStep ? `Giros automáticos (${autoSpinsRef.current} restantes)...` : "Rolos descendo...");

      const finalCols = generateOutcomeColumns();
      const stepMs = turboRef.current ? 70 : 110;
      const stopDelays = turboRef.current ? [420, 740, 1060] : [880, 1430, 1980];

      setColumns((prev) => [
        { ...prev[0], spinning: true, stepping: false, landed: false },
        { ...prev[1], spinning: true, stepping: false, landed: false },
        { ...prev[2], spinning: true, stepping: false, landed: false },
      ]);

      ([0, 1, 2] as const).forEach((colIdx) => {
        const intervalId = window.setInterval(() => {
          playReelTick(colIdx);

          setColumns((prev) => {
            const next = [...prev] as [ReelColumnState, ReelColumnState, ReelColumnState];
            if (!next[colIdx].spinning) return prev;
            next[colIdx] = { ...next[colIdx], stepping: true };
            return next;
          });

          const settleId = window.setTimeout(() => {
            setColumns((prev) => {
              const next = [...prev] as [ReelColumnState, ReelColumnState, ReelColumnState];
              if (!next[colIdx].spinning) return prev;
              const incoming = pickWeightedSymbol();
              const [, s0, s1] = next[colIdx].strip;
              next[colIdx] = {
                ...next[colIdx],
                strip: [incoming, incoming, s0, s1],
                stepping: false,
              };
              return next;
            });
          }, Math.max(35, stepMs - 25));

          timeoutsRef.current.push(settleId);
        }, stepMs);

        intervalsRef.current.push(intervalId);

        const timeoutId = window.setTimeout(() => {
          window.clearInterval(intervalId);
          playReelStop(colIdx);

          setColumns((prev) => {
            const next = [...prev] as [ReelColumnState, ReelColumnState, ReelColumnState];
            const [f0, f1, f2] = finalCols[colIdx];
            next[colIdx] = {
              strip: [pickWeightedSymbol(), f0, f1, f2],
              spinning: false,
              stepping: false,
              landed: true,
            };

            if (!next[0].spinning && !next[1].spinning && !next[2].spinning) {
              const flatGrid: SymbolId[] = [
                next[0].strip[1], next[1].strip[1], next[2].strip[1],
                next[0].strip[2], next[1].strip[2], next[2].strip[2],
                next[0].strip[3], next[1].strip[3], next[2].strip[3],
              ];

              const result = evaluateGrid(flatGrid, currentBet);
              if (result.winAmount > 0) {
                const updatedBal = balanceRef.current + result.winAmount;
                balanceRef.current = updatedBal;
                setBalance(updatedBal);
                setLastWin(result.winAmount);
                setWinningCells(result.winningCells);
                setIsBonusFlash(result.isFullGridBonus);
                setStatusBanner(result.matchedLines.join(" • "));
                playWinSound(result.isFullGridBonus);
              } else {
                setStatusBanner("Sem combinação nesta rodada — tente novamente!");
              }

              if (autoSpinsRef.current > 0) {
                const remaining = autoSpinsRef.current - 1;
                autoSpinsRef.current = remaining;
                setAutoSpinsLeft(remaining);

                if (remaining > 0 && balanceRef.current >= betRef.current) {
                  const autoNextId = window.setTimeout(() => {
                    startSingleSpin(true);
                  }, turboRef.current ? 450 : 850);
                  timeoutsRef.current.push(autoNextId);
                } else {
                  setAutoSpinsLeft(0);
                  autoSpinsRef.current = 0;
                }
              }
            }

            return next;
          });
        }, stopDelays[colIdx]);

        timeoutsRef.current.push(timeoutId);
      });
    },
    [playReelStop, playReelTick, playWinSound, unlockAudio]
  );

  const handleManualSpin = () => {
    if (isSpinning) return;
    if (autoSpinsLeft > 0) {
      setAutoSpinsLeft(0);
      autoSpinsRef.current = 0;
      clearTimers();
      setColumns((prev) => [
        { ...prev[0], spinning: false, stepping: false },
        { ...prev[1], spinning: false, stepping: false },
        { ...prev[2], spinning: false, stepping: false },
      ]);
      setStatusBanner("Modo AUTO pausado.");
      return;
    }
    startSingleSpin(false);
  };

  const handleStartAuto = (count: number) => {
    if (isSpinning || autoSpinsLeft > 0) return;
    if (balance < bet) {
      setStatusBanner("Saldo insuficiente para iniciar o AUTO.");
      return;
    }
    autoSpinsRef.current = count;
    setAutoSpinsLeft(count);
    startSingleSpin(true);
  };

  const handleChangeBet = (delta: number) => {
    if (isSpinning || autoSpinsLeft > 0) return;
    setBetIndex((prev) => Math.max(0, Math.min(BET_STEPS.length - 1, prev + delta)));
  };

  const handleMaxBet = () => {
    if (isSpinning || autoSpinsLeft > 0) return;
    setBetIndex(BET_STEPS.length - 1);
  };

  const handleRefill = () => {
    if (isSpinning || autoSpinsLeft > 0) return;
    balanceRef.current = 1000;
    setBalance(1000);
    setLastWin(0);
    setWinningCells(new Set());
    setStatusBanner("Saldo demo recarregado para 1.000!");
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-900 via-blue-950 to-emerald-950 text-yellow-50 flex flex-col items-center justify-center p-4 select-none">
      <style jsx global>{`
        @keyframes landBounce {
          0% { transform: translateY(-12px) scale(0.98); }
          60% { transform: translateY(5px) scale(1.02); }
          100% { transform: translateY(0px) scale(1); }
        }
        .reel-land-bounce {
          animation: landBounce 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        }
      `}</style>

      <div
        className={`w-full max-w-md rounded-3xl border-2 ${
          isBonusFlash
            ? "border-yellow-300 shadow-[0_0_40px_rgba(253,224,71,0.65)]"
            : "border-yellow-400/50 shadow-2xl"
        } bg-gradient-to-b from-emerald-950/95 via-blue-950/95 to-emerald-950/95 p-4 space-y-3.5`}
      >
        <header className="flex items-center justify-between gap-2 border-b border-yellow-400/25 pb-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-yellow-300 font-bold">
              🇧🇷 Verde • Amarelo • Azul
            </p>
            <h1 className="text-xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-sky-300">
              🐯 Tigrinho Brasil
            </h1>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleSound}
              disabled={isSpinning || autoSpinsLeft > 0}
              className={`px-2.5 py-1.5 rounded-full text-xs font-bold border transition ${
                soundEnabled
                  ? "bg-emerald-500/25 text-yellow-200 border-yellow-400/45"
                  : "bg-blue-950 text-sky-300/70 border-sky-700"
              }`}
            >
              {soundEnabled ? "🔊 SOM" : "🔇 MUDO"}
            </button>

            <button
              type="button"
              onClick={() => setTurbo((t) => !t)}
              disabled={isSpinning || autoSpinsLeft > 0}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                turbo
                  ? "bg-yellow-400 text-blue-950 border-yellow-200"
                  : "bg-blue-900/80 text-yellow-300 border-yellow-400/35 hover:bg-blue-800"
              }`}
            >
              ⚡ TURBO
            </button>
          </div>
        </header>

        <section className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-blue-950/85 border border-emerald-400/35 p-2.5">
            <span className="block text-[10px] uppercase tracking-wider text-sky-200">Saldo</span>
            <span className="text-base font-extrabold text-emerald-300">{balance}</span>
          </div>

          <div className="rounded-2xl bg-blue-950/85 border border-yellow-400/35 p-2.5">
            <span className="block text-[10px] uppercase tracking-wider text-sky-200">Aposta Total</span>
            <span className="text-base font-extrabold text-yellow-300">{bet}</span>
          </div>

          <div className="rounded-2xl bg-blue-950/85 border border-sky-400/35 p-2.5">
            <span className="block text-[10px] uppercase tracking-wider text-sky-200">Ganho</span>
            <span className={`text-base font-extrabold ${lastWin > 0 ? "text-yellow-300 animate-pulse" : "text-sky-400/60"}`}>
              {lastWin > 0 ? `+${lastWin}` : "0"}
            </span>
          </div>
        </section>

        <section className="rounded-2xl bg-gradient-to-b from-emerald-800/45 via-blue-950/80 to-emerald-950 border-2 border-yellow-400/45 p-3">
          <div className="grid grid-cols-3 gap-2.5">
            {columns.map((col, colIndex) => {
              const visibleSymbols = col.spinning ? col.strip : col.strip.slice(1, 4);

              return (
                <div
                  key={colIndex}
                  className={`h-[296px] overflow-hidden rounded-2xl bg-blue-950/85 p-1 border border-yellow-400/20 ${
                    !col.spinning && col.landed ? "reel-land-bounce" : ""
                  }`}
                >
                  <div
                    className={`flex flex-col gap-2 ${
                      col.spinning
                        ? "-mt-[96px] transition-transform duration-75 ease-linear " +
                          (col.stepping ? "translate-y-[96px]" : "translate-y-0")
                        : "translate-y-0"
                    }`}
                  >
                    {visibleSymbols.map((symbolId, idx) => {
                      const rowIndex = col.spinning ? Math.max(0, idx - 1) : idx;
                      const cellIndex = rowIndex * 3 + colIndex;
                      const isWinner = !col.spinning && winningCells.has(cellIndex);
                      const sym = SYMBOL_MAP[symbolId];

                      return (
                        <div
                          key={`${colIndex}-${idx}`}
                          className={`h-[88px] shrink-0 rounded-xl flex flex-col items-center justify-center border transition-all duration-150 ${
                            isWinner
                              ? `bg-gradient-to-br ${sym.accent} border-yellow-200 scale-105 shadow-lg shadow-yellow-400/30 text-blue-950`
                              : "bg-emerald-950/90 border-sky-400/25 text-white"
                          } ${col.spinning ? "blur-[0.5px]" : ""}`}
                        >
                          <span className="text-4xl leading-none" role="img" aria-label={sym.name}>
                            {sym.glyph}
                          </span>
                          <span
                            className={`mt-1.5 text-[10px] font-bold tracking-tight ${
                              isWinner ? "text-blue-950" : "text-yellow-300/85"
                            }`}
                          >
                            {sym.id === "tiger" ? "WILD ×25" : `×${sym.payout3}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="min-h-10 rounded-xl bg-blue-950/90 border border-yellow-400/25 px-3 py-2 flex items-center justify-center text-center">
          <p className="text-xs font-semibold text-yellow-200">{statusBanner}</p>
        </div>

        <section className="rounded-2xl bg-blue-950/85 border border-emerald-400/30 p-3 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-sky-200 font-medium">Aposta ({PAYLINES.length} linhas)</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowBetMenu((v) => !v)}
                disabled={isSpinning || autoSpinsLeft > 0}
                className="text-yellow-300 font-semibold hover:underline disabled:opacity-40"
              >
                {showBetMenu ? "Fechar tabela" : "Ver valores"}
              </button>
              <button
                type="button"
                onClick={handleRefill}
                disabled={isSpinning || autoSpinsLeft > 0}
                className="text-emerald-300 font-semibold hover:underline disabled:opacity-40"
              >
                +1.000 Saldo
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleChangeBet(-1)}
              disabled={isSpinning || autoSpinsLeft > 0 || betIndex === 0}
              className="w-11 h-11 rounded-xl bg-emerald-900 border border-yellow-400/35 text-xl font-black text-yellow-300 hover:bg-emerald-800 disabled:opacity-35"
            >
              −
            </button>

            <div className="flex-1 h-11 rounded-xl bg-blue-900/80 border border-yellow-400/45 flex flex-col items-center justify-center">
              <span className="text-[10px] uppercase text-sky-200 leading-none">Por Giro</span>
              <span className="text-base font-extrabold text-yellow-300 leading-tight">{bet}</span>
            </div>

            <button
              type="button"
              onClick={() => handleChangeBet(1)}
              disabled={isSpinning || autoSpinsLeft > 0 || betIndex === BET_STEPS.length - 1}
              className="w-11 h-11 rounded-xl bg-emerald-900 border border-yellow-400/35 text-xl font-black text-yellow-300 hover:bg-emerald-800 disabled:opacity-35"
            >
              +
            </button>

            <button
              type="button"
              onClick={handleMaxBet}
              disabled={isSpinning || autoSpinsLeft > 0}
              className="px-3 h-11 rounded-xl bg-yellow-400/20 border border-yellow-300/45 text-xs font-extrabold text-yellow-300 hover:bg-yellow-400/30 disabled:opacity-35"
            >
              MÁX
            </button>
          </div>

          {showBetMenu && (
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {BET_STEPS.map((val, idx) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setBetIndex(idx);
                    setShowBetMenu(false);
                  }}
                  className={`py-1.5 rounded-lg text-xs font-bold border ${
                    idx === betIndex
                      ? "bg-yellow-400 text-blue-950 border-yellow-200"
                      : "bg-emerald-950 text-sky-200 border-sky-700"
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-1.5 pt-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-200">AUTO:</span>
            <div className="flex items-center gap-1.5">
              {AUTO_OPTIONS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => handleStartAuto(count)}
                  disabled={isSpinning || autoSpinsLeft > 0}
                  className="px-2.5 py-1 rounded-lg bg-emerald-900/90 border border-emerald-500/35 text-xs font-bold text-yellow-200 hover:border-yellow-300 disabled:opacity-35"
                >
                  {count}×
                </button>
              ))}
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={handleManualSpin}
          className={`w-full py-4 rounded-2xl font-black text-lg tracking-wider uppercase shadow-lg active:scale-[0.99] transition ${
            autoSpinsLeft > 0
              ? "bg-gradient-to-r from-sky-500 to-blue-700 text-yellow-200 shadow-blue-900/40"
              : "bg-gradient-to-r from-yellow-300 via-yellow-400 to-emerald-400 text-blue-950 shadow-yellow-400/25 hover:brightness-105 disabled:opacity-50"
          }`}
          disabled={isSpinning && autoSpinsLeft === 0}
        >
          {autoSpinsLeft > 0
            ? `Parar AUTO (${autoSpinsLeft})`
            : isSpinning
            ? "Girando..."
            : `Girar (${bet})`}
        </button>

        <footer className="pt-2 border-t border-yellow-400/20 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-sky-200">
          {SYMBOLS.map((s) => (
            <span key={s.id}>
              {s.glyph} 3x = <strong className="text-yellow-300">{s.payout3}x</strong>
            </span>
          ))}
          <span className="text-emerald-300 font-semibold">• Grade 9x = 10x bônus</span>
        </footer>
      </div>
    </main>
  );
}
