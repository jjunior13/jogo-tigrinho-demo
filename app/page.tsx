"use client";
import { useState } from "react";

const ICONS = ["🪙", "🧨", "🧧", "🏆", "🐯"];

export default function Home() {
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(10);
  const [grid, setGrid] = useState(Array(9).fill("🐯"));
  const [status, setStatus] = useState("Modo recreativo • Moedas virtuais");

  function spin() {
    if (bet > balance) return setStatus("Saldo virtual insuficiente!");
    setBalance((b) => b - bet);
    const next = Array.from({ length: 9 }, () => ICONS[Math.floor(Math.random() * ICONS.length)]);
    setGrid(next);
    const win = next[3] === next[4] && next[4] === next[5];
    if (win) {
      const prize = bet * 10;
      setBalance((b) => b + prize);
      setStatus(`Linha do meio premiada! +${prize} moedas`);
    } else {
      setStatus("Sem combinação na linha do meio. Tente de novo!");
    }
  }

  return (
    <main className="min-h-screen bg-stone-950 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-stone-900 border border-amber-500/50 rounded-2xl p-5 text-center">
        <h1 className="text-2xl font-bold text-amber-400">🐯 Fortune Demo</h1>
        <p className="text-xs text-stone-400 mt-1">{status}</p>

        <div className="flex justify-around bg-stone-950 rounded-xl p-3 my-4">
          <div><div className="text-xs text-stone-400">SALDO</div><div className="font-bold text-emerald-400">{balance}</div></div>
          <div><div className="text-xs text-stone-400">APOSTA</div><div className="font-bold text-amber-400">{bet}</div></div>
        </div>

        <div className="grid grid-cols-3 gap-2 bg-red-950/50 p-3 rounded-xl mb-4">
          {grid.map((item, i) => (
            <div key={i} className="h-20 flex items-center justify-center text-4xl bg-stone-900 rounded-lg">{item}</div>
          ))}
        </div>

        <div className="flex justify-center gap-2 mb-3">
          {[10, 50, 100].map((v) => (
            <button key={v} onClick={() => setBet(v)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${bet === v ? "bg-amber-500 text-stone-950" : "bg-stone-800"}`}>
              {v}
            </button>
          ))}
        </div>

        <button onClick={spin} className="w-full py-3 rounded-xl font-bold bg-amber-500 text-stone-950">
          🎰 Girar
        </button>
      </div>
    </main>
  );
}
