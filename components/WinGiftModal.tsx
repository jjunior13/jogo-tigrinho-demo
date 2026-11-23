"use client";

import React from "react";

interface WinGiftModalProps {
  open: boolean;
  amountLabel: string;
  linesLabel?: string;
  onClose: () => void;
}

export function WinGiftModal({
  open,
  amountLabel,
  linesLabel,
  onClose,
}: WinGiftModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="win-gift-modal-title"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border-2 border-amber-300 bg-gradient-to-br from-fuchsia-700 via-emerald-700 to-blue-900 p-6 text-amber-50 shadow-2xl">
        <div className="pointer-events-none -right-10 -top-10 h-36 w-36 rounded-full bg-yellow-300/25 blur-2xl absolute" />
        <div className="pointer-events-none -bottom-12 -left-10 h-40 w-40 rounded-full bg-pink-400/25 blur-2xl absolute" />

        <div className="relative flex flex-col items-center text-center space-y-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-yellow-200/80 bg-gradient-to-tr from-amber-400 via-pink-500 to-cyan-300 text-5xl shadow-lg animate-bounce">
            <span aria-hidden="true">🎁</span>
          </div>

          <div className="space-y-1">
            <span className="inline-block rounded-full border border-yellow-200/50 bg-black/25 px-3 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-yellow-200">
              Premiação Demonstrativa Registrada
            </span>
            <h2
              id="win-gift-modal-title"
              className="text-2xl font-black tracking-tight text-yellow-300 drop-shadow"
            >
              Parabéns pela Conquista!
            </h2>
            <p className="text-sm font-extrabold text-white">
              Valor obtido na rodada: <span className="text-yellow-300">{amountLabel}</span>
            </p>
            {linesLabel ? (
              <p className="text-xs text-emerald-100/90">
                Combinação premiada: <span className="font-semibold text-white">{linesLabel}</span>
              </p>
            ) : null}
          </div>

          <div className="w-full rounded-2xl border border-yellow-200/35 bg-slate-950/55 p-4 text-left text-xs leading-relaxed text-amber-50/95 space-y-2">
            <p className="font-semibold text-yellow-200">
              Informação sobre acúmulo e repasses:
            </p>
            <p>
              Informamos formalmente que os valores conquistados nesta etapa serão
              devidamente acumulados assim que o <strong>Tigrinho Brasil</strong> reunir
              fundos suficientes para viabilizar os pagamentos previstos.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl border-2 border-yellow-200 bg-gradient-to-r from-amber-300 via-yellow-400 to-lime-300 px-5 py-3.5 text-sm font-black text-blue-950 shadow-lg hover:brightness-105 active:scale-[0.99] transition cursor-pointer"
          >
            Fechar e continuar no jogo
          </button>
        </div>
      </div>
    </div>
  );
}
