"use client";

import { useCallback, useEffect, useState } from "react";

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

const INITIAL_GRID = ["🐯", "🪙", "🧧", "🐯", "🐯", "🐯", "🍊", "🧨", "💎"];
const BET_OPTIONS = [100, 500, 1000, 2000]; // em centavos

function formatBRL(centsStr: string | number) {
  const cents = typeof centsStr === "string" ? Number(centsStr) : centsStr;
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function HomePage() {
  const [username] = useState("jogador_demo");
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [grid, setGrid] = useState<string[]>(INITIAL_GRID);
  const [betCents, setBetCents] = useState<number>(500);
  const [recentSpins, setRecentSpins] = useState<SpinItem[]>([]);
  const [lastMessage, setLastMessage] = useState<string>("Carregando saldo...");
  const [loadingPlayer, setLoadingPlayer] = useState<boolean>(true);
  const [spinning, setSpinning] = useState<boolean>(false);

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

    try {
      const res = await fetch("/api/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, betCents }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setLastMessage(data.error || "Não foi possível concluir o giro.");
        return;
      }

      if (Array.isArray(data.grid) && data.grid.length === 9) {
        setGrid(data.grid);
      }
      setPlayer(data.player);

      if (data.spin) {
        setRecentSpins((prev) => [data.spin, ...prev].slice(0, 10));
        const payout = Number(data.spin.payout_cents);
        if (payout > 0) {
          setLastMessage(`Vitória! Prêmio de ${formatBRL(payout)} (${data.spin.outcome}).`);
        } else {
          setLastMessage(`Sem prêmio na linha do meio (${data.spin.outcome}).`);
        }
      }
    } catch {
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
          <div className="text-right">
            <span className="block text-xs text-zinc-400">Saldo</span>
            <strong className="text-lg font-mono text-emerald-400">
              {loadingPlayer || !player ? "..." : formatBRL(player.balance_cents)}
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-xl bg-zinc-950 p-4 border border-zinc-800">
          {grid.map((symbol, idx) => {
            const isMiddleRow = idx >= 3 && idx <= 5;
            return (
              <div
                key={idx}
                className={`h-20 flex items-center justify-center rounded-lg text-3xl border ${
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
