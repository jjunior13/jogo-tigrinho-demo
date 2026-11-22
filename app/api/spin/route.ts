import { NextResponse } from "next/server";
import { db, ensureAuthTables } from "@/lib/db";
import { getOrCreatePlayer, registerSpin } from "@/lib/game-db";

const SYMBOLS = ["🐯", "💎", "🧧", "🪙", "🍊", "🧨"] as const;
type GameSymbol = (typeof SYMBOLS)[number];

const LINE_PAYOUT_MULTIPLIER: Record<GameSymbol, number> = {
  "🐯": 3,
  "💎": 2.2,
  "🧧": 1.8,
  "🪙": 1.5,
  "🍊": 1.2,
  "🧨": 1,
};

interface PaylineDef {
  id: string;
  label: string;
  orientation: "horizontal" | "vertical" | "diagonal" | "diagonal" | "diagonal";
  indices: [number, number, number];
}

const PAYLINES: PaylineDef[] = [
  { id: "row-0", label: "Linha Topo", orientation: "horizontal", indices: [0, 1, 2] },
  { id: "row-1", label: "Linha Meio", orientation: "horizontal", indices: [3, 4, 5] },
  { id: "row-2", label: "Linha Base", orientation: "horizontal", indices: [6, 7, 8] },
  { id: "col-0", label: "Coluna Esquerda", orientation: "vertical", indices: [0, 3, 6] },
  { id: "col-1", label: "Coluna Centro", orientation: "vertical", indices: [1, 4, 7] },
  { id: "col-2", label: "Coluna Direita", orientation: "vertical", indices: [2, 5, 8] },
  { id: "diag-0", label: "Diagonal Principal", orientation: "diagonal", indices: [0, 4, 8] },
  { id: "diag-1", label: "Diagonal Secundária", orientation: "diagonal", indices: [2, 4, 6] },
];

export interface WinningLineResult {
  id: string;
  label: string;
  orientation: "horizontal" | "vertical" | "diagonal" | "diagonal" | "diagonal";
  indices: [number, number, number];
  symbol: GameSymbol;
  multiplier: number;
  payoutCents: number;
}

const WIN_CHANCE = Number(process.env.SPIN_WIN_CHANCE ?? "0.12");
const FULL_GRID_CHANCE = Number(process.env.SPIN_FULL_GRID_CHANCE ?? "0.003");
const MIN_SPINS_BETWEEN_WINS = Number(process.env.SPIN_MIN_SPINS_BETWEEN_WINS ?? "6");
const MIN_SECONDS_BETWEEN_WINS = Number(process.env.SPIN_MIN_SECONDS_BETWEEN_WINS ?? "20");

function randomWeightedSymbol(): GameSymbol {
  const r = Math.random();
  if (r < 0.05) return "🐯";
  if (r < 0.14) return "💎";
  if (r < 0.28) return "🧧";
  if (r < 0.48) return "🪙";
  if (r < 0.72) return "🍊";
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
  const grossLineCents = Math.round(betCents * multiplier);
  const payoutCents = Math.max(1, Math.round(grossLineCents * 0.3));
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

function hasAnyWin(grid: GameSymbol[]): boolean {
  const lineWin = PAYLINES.some((line) => {
    const [a, b, c] = line.indices.map((idx) => grid[idx]);
    const nonWilds = [a, b, c].filter((s) => s !== "🐯");
    if (nonWilds.length === 0) return true;
    return nonWilds.every((s) => s === nonWilds[0]);
  });
  return lineWin || hasFullGridMatch(grid) !== null;
}

function generateNonWinningGrid(): GameSymbol[] {
  // Garante que nenhuma linha horizontal/vertical feche par/trinca e não feche grade cheia
  const safePatterns: GameSymbol[][] = [
    ["🧨", "🍊", "🪙", "🧧", "💎", "🍊", "🪙", "🧨", "🧧"],
    ["🍊", "🪙", "🧨", "💎", "🧧", "🪙", "🧨", "🍊", "💎"],
    ["🪙", "🧨", "🍊", "🧧", "🪙", "💎", "🍊", "🧧", "🧨"],
    ["🧧", "🍊", "🪙", "🧨", "💎", "🍊", "🪙", "🧨", "🍊"],
    ["💎", "🪙", "🧧", "🍊", "🧨", "🪙", "🧧", "🍊", "🧨"],
    ["🧨", "🧧", "🍊", "🪙", "🧨", "💎", "🍊", "🪙", "🧧"],
  ];

  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = Array.from({ length: 9 }, () => randomWeightedSymbol());
    // Evita múltiplos coringas (🐯) para não fechar linha por wild
    const tigerCount = candidate.filter((s) => s === "🐯").length;
    if (tigerCount <= 1 && !hasAnyWin(candidate)) {
      return candidate;
    }
  }

  return safePatterns[Math.floor(Math.random() * safePatterns.length)];
}

async function isPlayerInWinCooldown(playerId: number): Promise<boolean> {
  if (MIN_SPINS_BETWEEN_WINS <= 0 && MIN_SECONDS_BETWEEN_WINS <= 0) {
    return false;
  }

  const recentWinsRes = await db.query(
    `SELECT id, created_at
     FROM spins
     WHERE player_id = $1 AND payout_cents > 0
     ORDER BY id DESC
     LIMIT 1`,
    [playerId]
  );

  const lastWin = recentWinsRes.rows[0];
  if (!lastWin) {
    return false;
  }

  if (MIN_SECONDS_BETWEEN_WINS > 0) {
    const elapsedSec = (Date.now() - new Date(lastWin.created_at).getTime()) / 1000;
    if (elapsedSec < MIN_SECONDS_BETWEEN_WINS) {
      return true;
    }
  }

  if (MIN_SPINS_BETWEEN_WINS > 0) {
    const spinsAfterWinRes = await db.query(
      `SELECT COUNT(*)::text AS count
       FROM spins
       WHERE player_id = $1 AND id > $2`,
      [playerId, lastWin.id]
    );
    const spinsSinceWin = Number(spinsAfterWinRes.rows[0]?.count ?? "0");
    if (spinsSinceWin < MIN_SPINS_BETWEEN_WINS) {
      return true;
    }
  }

  return false;
}

async function generateGrid(betCents: number, playerId: number) {
  const inCooldown = await isPlayerInWinCooldown(playerId);
  const effectiveWinChance = inCooldown ? 0 : Math.max(0, Math.min(1, WIN_CHANCE));
  const roll = Math.random();

  if (!inCooldown && roll < Math.max(0, Math.min(1, FULL_GRID_CHANCE))) {
    const basePool: GameSymbol[] = ["💎", "🧧", "🪙", "🍊", "🧨"];
    const baseSym = basePool[Math.floor(Math.random() * basePool.length)];
    const grid: GameSymbol[] = Array.from({ length: 9 }, () => (Math.random() < 0.25 ? "🐯" : baseSym));
    const winningLines = PAYLINES.map((line) => evaluateLine(grid, line, betCents)).filter(
      (x): x is WinningLineResult => x !== null
    );
    const linesSum = winningLines.reduce((acc, item) => acc + item.payoutCents, 0);
    const fullGridBonusCents = Math.round(betCents * 5 * 0.3);
    const payoutCents = linesSum + fullGridBonusCents;
    const labels = winningLines.map((l) => l.label + " (" + l.symbol + ")").join(" + ");
    return {
      grid,
      winningLines,
      payoutCents,
      fullGridBonusCents,
      outcome: labels ? "Grade Completa 5x + " + labels : "Grade Completa " + baseSym + " (5x)",
    };
  }

  if (roll < effectiveWinChance) {
    const chosenLine = PAYLINES[Math.floor(Math.random() * PAYLINES.length)];
    const lineSymbol = randomWeightedSymbol();
    const grid = generateNonWinningGrid();
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

  const grid = generateNonWinningGrid();
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
    const generated = await generateGrid(betCents, player.id);
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
