"use client";

import React, { useState } from "react";
import { TermsSupportModal } from "@/components/TermsSupportModal";

export function LoginTermsConsent({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (val: boolean) => void;
}) {
  const [openModal, setOpenModal] = useState(false);

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-200">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAcceptedChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded accent-amber-400"
          required
        />
        <span>
          Declaro ser maior de 18 anos e concordo com os{" "}
          <button
            type="button"
            onClick={() => setOpenModal(true)}
            className="font-bold text-amber-300 underline hover:text-amber-200 cursor-pointer"
          >
            Termos de Uso, fase de arrecadação (a partir de R$ 1,00) e apoio à
            casa de reabilitação
          </button>
          .
        </span>
      </label>

      <TermsSupportModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        requireAccept
        onAccept={() => {
          onAcceptedChange(true);
          setOpenModal(false);
        }}
      />
    </div>
  );
}
