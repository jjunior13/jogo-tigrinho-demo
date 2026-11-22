import { NextResponse } from "next/server";
import { db, ensureAuthTables } from "@/lib/db";
import { getOrCreatePlayer, registerSpin } from "@/lib/game-db";

const SYMBOLS = ["🐯", "💎", "🧧", "🪙", "🍊", "🧨"] as const;
type GameSymbol = (typeof SYMBOLS)[number];

const LINE_PAYOUT_MULTIPLIER: Record<GameSymbol, number> = {
  "🐯": 10,
  "💎": 5,
  "🧧": 3,
  "🪙": 2,
  "🍊": 1.5,
  "🧨": 1,
};

interface PaylineDef {
  id: string;
  label: string;
  orientation: "horizontal" | "vertical";
  indices: [number, number, number];
}

const PAYLINES: PaylineDef[] = [
  { id: "row-0", label: "Linha Topo", orientation: "horizontal", indices: [0, 1, 2] },
  { id: "row-1", label: "Linha Meio", orientation: "horizontal", indices: [3, 4, 5] },
  { id: "row-2", label: "Linha Base", orientation: "horizontal", indices: [6, 7, 8] },
  { id: "col-0", label: "Coluna Esquerda", orientation: "vertical", indices: [0, 3, 6] },
  { id: "col-1", label: "Coluna Centro", orientation: "vertical", indices: [1, 4, 7] },
  { id: "col-2", label: "Coluna Direita", orientation: "vertical", indices: [2, 5, 8] },
];

export interface WinningLineResult {
  id: string;
  label: string;
  orientation: "horizontal" | "vertical";
  indices: [number, number, number];
  symbol: GameSymbol;
  multiplier: number;
  payoutCents: number;
}

function randomWeightedSymbol(): GameSymbol {
  const r = Math.random();
  if (r < 0.09) return "🐯";
  if (r < 0.2) return "💎";
  if (r < 0.36) return "🧧";
  if (r < 0.56) return "🪙";
  if (r < 0.78) return "🍊";
  return "🧨";
}

function evaluateLine(grid: GameSymbol[], line: PaylineDef, betCents: number): WinningLineResult | null {
  const [a, b, c] = line.indices.map((idx) => grid[idx]);
  const nonWilds = [a, b, c].filter((s) => s !== "🐯");
  let winningSymbol: GameSymbol;
  if (nonWilds.length === 0) {
    winningSymbol = "🐯";
  } else {
    const first = nonWilds[0];
    if (!nonWilds.every((s) => s === first)) return null;
    winningSymbol = first;
  }
  const multiplier = LINE_PAYOUT_MULTIPLIER[winningSymbol];
  const payoutCents = Math.round(betCents * multiplier);
  return {
    id: line.id,
    label: line.label,
    orientation: line.orientation,
    indices: line.indices,
    symbol: winningSymbol,
    multiplier,
    payoutCents,
  };
}

function hasFullGridMatch(grid: GameSymbol[]): GameSymbol | null {
  const nonWilds = grid.filter((s) => s !== "🐯");
  if (nonWilds.length === 0) return "🐯";
  const target = nonWilds[0];
  return nonWilds.every((s) => s === target) ? target : null;
}

function generateGrid(betCents: number) {
  const roll = Math.random();
  if (roll < 0.02) {
    const basePool: GameSymbol[] = ["💎", "🧧", "🪙", "🍊", "🧨"];
    const baseSym = basePool[Math.floor(Math.random() * basePool.length)];
    const grid: GameSymbol[] = Array.from({ length: 9 }, () => (Math.random() < 0.35 ? "🐯" : baseSym));
    const winningLines = PAYLINES.map((line) => evaluateLine(grid, line, betCents)).filter(
      (x): x is WinningLineResult => x !== null
    );
    const linesSum = winningLines.reduce((acc, item) => acc + item.payoutCents, 0);
    const fullGridBonusCents = betCents * 10;
    const payoutCents = linesSum + fullGridBonusCents;
    const labels = winningLines.map((l) => l.label + " (" + l.symbol + ")").join(" + ");
    return {
      grid,
      winningLines,
      payoutCents,
      fullGridBonusCents,
      outcome: "Grade Completa 10x + " + labels,
    };
  }

  if (roll < 0.4) {
    const chosenLine = PAYLINES[Math.floor(Math.random() * PAYLINES.length)];
    const lineSymbol = randomWeightedSymbol();
    const grid: GameSymbol[] = Array.from({ length: 9 }, () => "🧨");
    for (const idx of chosenLine.indices) {
      grid[idx] = lineSymbol;
    }
    const winningLines = PAYLINES.map((line) => evaluateLine(grid, line, betCents)).filter(
      (x): x is WinningLineResult => x !== null
    );
    if (winningLines.length > 0) {
      const payoutCents = winningLines.reduce((acc, item) => acc + item.payoutCents, 0);
      const outcome = winningLines.map((l) => l.label + " " + l.symbol + " (" + l.multiplier + "x)").join(" | ");
      return { grid, winningLines, payoutCents, fullGridBonusCents: 0, outcome };
    }
  }

  const grid: GameSymbol[] = Array.from({ length: 9 }, () => randomWeightedSymbol());
  const winningLines = PAYLINES.map((line) => evaluateLine(grid, line, betCents)).filter(
    (x): x is WinningLineResult => x !== null
  );
  if (winningLines.length > 0) {
    const payoutCents = winningLines.reduce((acc, item) => acc + item.payoutCents, 0);
    const outcome = winningLines.map((l) => l.label + " " + l.symbol + " (" + l.multiplier + "x)").join(" | ");
    return { grid, winningLines, payoutCents, fullGridBonusCents: 0, outcome };
  }

  const fullMatch = hasFullGridMatch(grid);
  if (fullMatch) {
    const fullGridBonusCents = betCents * 10;
    return {
      grid,
      winningLines: [],
      payoutCents: fullGridBonusCents,
      fullGridBonusCents,
      outcome: "Grade Completa " + fullMatch + " (10x)",
    };
  }

  return { grid, winningLines: [], payoutCents: 0, fullGridBonusCents: 0, outcome: "Sem sequencia" };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = String(body?.username ?? "").trim().toLowerCase();
    const betCents = Number(body?.betCents);
    if (!username) {
      return NextResponse.json({ ok: false, error: "Jogador invalido." }, { status: 400 });
    }
    if (!Number.isInteger(betCents) || betCents < 100 || betCents > 100000) {
      return NextResponse.json({ ok: false, error: "Valor de aposta invalido." }, { status: 400 });
    }
    await ensureAuthTables();
    const player = await getOrCreatePlayer(username);
    const generated = generateGrid(betCents);
    const spinResult = await registerSpin({
      playerId: player.id,
      betCents,
      payoutCents: generated.payoutCents,
      outcome: generated.outcome,
    });
    const updatedPlayerRes = await db.query(
      "SELECT id, username, full_name, email, balance_cents::text FROM players WHERE id = $1",
      [player.id]
    );
    const updatedPlayer = updatedPlayerRes.rows[0] ?? {
      ...player,
      balance_cents: spinResult.balance_cents,
    };
    return NextResponse.json({
      ok: true,
      player: updatedPlayer,
      spin: spinResult.spin,
      grid: generated.grid,
      winningLines: generated.winningLines,
      fullGridBonusCents: generated.fullGridBonusCents,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao processar giro.";
    if (message === "SALDO_INSUFICIENTE") {
      return NextResponse.json({ ok: false, error: "Saldo insuficiente." }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
