"use client";

import React from "react";

interface TermsSupportModalProps {
  open: boolean;
  onClose: () => void;
  onAccept?: () => void;
  requireAccept?: boolean;
}

export function TermsSupportModal({
  open,
  onClose,
  onAccept,
  requireAccept = false,
}: TermsSupportModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-support-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-amber-400/40 bg-slate-950 p-6 text-slate-100 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3">
          <div>
            <span className="inline-block rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
              Boas-Vindas • Apoio a partir de R$ 1,00
            </span>
            <h2
              id="terms-support-title"
              className="mt-1 text-base font-extrabold text-white"
            >
              Regras de Uso e Fase Inicial de Arrecadação
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-white/10 cursor-pointer"
          >
            Fechar
          </button>
        </div>

        <div className="space-y-3 text-xs leading-relaxed text-slate-200 max-h-[60vh] overflow-y-auto pr-1">
          <p>
            Bem-vindo ao aplicativo. Informamos que o projeto encontra-se em{" "}
            <strong className="text-white">
              fase inicial de estruturação e arrecadação de fundos
            </strong>{" "}
            para viabilizar sua operação completa antes do lançamento oficial ao
            público.
          </p>

          <p>
            <strong className="text-amber-300">
              1. Apoio a Partir de R$ 1,00 e Finalidade:
            </strong>{" "}
            O valor de apoio é livre e pode ser de{" "}
            <strong className="text-white">
              qualquer quantia a partir de R$ 1,00
            </strong>
            . Os recursos arrecadados nesta etapa destinam-se à estruturação
            técnica e operacional do aplicativo, bem como ao{" "}
            <strong className="text-white">
              apoio financeiro a uma casa de reabilitação de dependência química
            </strong>
            .
          </p>

          <p>
            <strong className="text-amber-300">
              2. Caráter Participativo e Sem Retorno Financeiro:
            </strong>{" "}
            O acesso e o apoio nesta fase têm caráter colaborativo e
            recreativo/demonstrativo,{" "}
            <strong className="text-white">
              não configurando investimento financeiro, promessa de lucro,
              rendimento garantido ou obrigação de resgate em dinheiro
            </strong>
            .
          </p>

          <p>
            <strong className="text-amber-300">3. Condições de Uso:</strong> O
            usuário compromete-se a utilizar a plataforma de forma lícita,
            respeitosa e consciente, sendo o acesso restrito a maiores de 18
            anos. As regras e funcionalidades poderão ser atualizadas conforme o
            avanço do projeto.
          </p>

          <p>
            <strong className="text-amber-300">4. Transparência:</strong> Ao
            prosseguir, você declara estar ciente de que o aplicativo está em
            fase de formação e arrecadação inicial, com apoio a partir de R$
            1,00, e concorda com estes Termos de Uso.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-4">
          {requireAccept && onAccept ? (
            <button
              type="button"
              onClick={onAccept}
              className="w-full rounded-xl bg-amber-400 hover:bg-amber-300 px-4 py-2.5 text-xs font-black text-slate-950 transition cursor-pointer"
            >
              Li e Concordo com os Termos de Uso
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-amber-400 hover:bg-amber-300 px-4 py-2 text-xs font-black text-slate-950 transition cursor-pointer"
            >
              Entendi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
