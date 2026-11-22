import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreatePlayer, registerSpin } from "@/lib/game-db";

export const runtime = "nodejs";

const SYMBOLS = ["🐯", "🪙", "🧧", "🍊", "🧨", "💎"] as const;

function rollGrid() {
  const grid: string[] = [];
  for (let i = 0; i < 9; i++) {
    const idx = crypto.randomInt(0, SYMBOLS.length);
    grid.push(SYMBOLS[idx]);
  }
  return grid;
}

function evaluateGrid(grid: string[], betCents: number) {
  // Linha do meio (índices 3, 4, 5)
  const middleRow = [grid[3], grid[4], grid[5]];
  const allMatch = middleRow[0] === middleRow[1] && middleRow[1] === middleRow[2];

  if (allMatch) {
    const multiplier = middleRow[0] === "🐯" ? 10 : middleRow[0] === "💎" ? 5 : 2;
    return {
      outcome: `WIN_${multiplier}X_${middleRow[0]}`,
      payoutCents: betCents * multiplier,
    };
  }

  return {
    outcome: "LOSS",
    payoutCents: 0,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = typeof body.username === "string" ? body.username : "jogador_demo";
    const betCents = Number(body.betCents);

    if (!Number.isInteger(betCents) || betCents < 100 || betCents > 100000) {
      return NextResponse.json(
        { ok: false, error: "Aposta inválida. Use um valor inteiro entre 100 e 100000 centavos." },
        { status: 400 }
      );
    }

    const player = await getOrCreatePlayer(username);
    const grid = rollGrid();
    const { outcome, payoutCents } = evaluateGrid(grid, betCents);

    const result = await registerSpin({
      playerId: player.id,
      betCents,
      payoutCents,
      outcome,
    });

    return NextResponse.json({
      ok: true,
      player: {
        id: player.id,
        username: player.username,
        balance_cents: result.balance_cents,
      },
      grid,
      spin: result.spin,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SALDO_INSUFICIENTE") {
      return NextResponse.json(
        { ok: false, error: "Saldo insuficiente para essa aposta." },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "Erro ao processar rodada";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
