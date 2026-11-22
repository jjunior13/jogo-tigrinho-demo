import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getOrCreatePlayer } from "@/lib/game-db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const username = req.nextUrl.searchParams.get("username") || "jogador_demo";
    const player = await getOrCreatePlayer(username);

    const history = await pool.query(
      `SELECT id, bet_cents::text, payout_cents::text, outcome, created_at
       FROM spins
       WHERE player_id = $1
       ORDER BY id DESC
       LIMIT 10`,
      [player.id]
    );

    return NextResponse.json({
      ok: true,
      player,
      recentSpins: history.rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar jogador";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
