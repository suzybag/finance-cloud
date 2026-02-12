"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  BROKER_OPTIONS,
  INVESTMENT_CATEGORIES,
  INVESTMENT_TYPE_GROUPS,
  mapInvestmentTypeToCategory,
  type InvestmentCategory,
} from "@/lib/calculateInvestment";
import { toNumber } from "@/lib/money";

export type AddInvestmentPayload = {
  broker: string;
  category: InvestmentCategory;
  investmentType: string;
  assetName: string;
  assetLogoUrl: string | null;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  annualRate: number;
  startDate: string;
};

type AddInvestmentModalProps = {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: AddInvestmentPayload) => Promise<void>;
};

const INPUT_CLASS =
  "w-full rounded-xl border border-[#7C3AED40] bg-[#0f1323] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30";

const todayIso = () => new Date().toISOString().slice(0, 10);

const firstInvestmentType = INVESTMENT_TYPE_GROUPS[0].options[0];

export function AddInvestmentModal({
  open,
  saving,
  onClose,
  onSave,
}: AddInvestmentModalProps) {
  const [broker, setBroker] = useState<string>(BROKER_OPTIONS[0]);
  const [category, setCategory] = useState<InvestmentCategory>(mapInvestmentTypeToCategory(firstInvestmentType));
  const [investmentType, setInvestmentType] = useState<string>(firstInvestmentType);
  const [assetName, setAssetName] = useState("");
  const [assetLogoUrl, setAssetLogoUrl] = useState("");
  const [quantity, setQuantity] = useState("");
  const [averagePrice, setAveragePrice] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [annualRate, setAnnualRate] = useState("");
  const [startDate, setStartDate] = useState(todayIso);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBroker(BROKER_OPTIONS[0]);
    setCategory(mapInvestmentTypeToCategory(firstInvestmentType));
    setInvestmentType(firstInvestmentType);
    setAssetName("");
    setAssetLogoUrl("");
    setQuantity("");
    setAveragePrice("");
    setCurrentPrice("");
    setAnnualRate("");
    setStartDate(todayIso());
    setValidationError(null);
  }, [open]);

  const handleSave = async () => {
    const qty = toNumber(quantity);
    const avgPrice = toNumber(averagePrice);
    const curPrice = toNumber(currentPrice);
    const rate = toNumber(annualRate);

    if (!broker.trim()) {
      setValidationError("Selecione a corretora/banco.");
      return;
    }
    if (!assetName.trim()) {
      setValidationError("Informe o nome do ativo.");
      return;
    }
    if (qty <= 0) {
      setValidationError("Quantidade deve ser maior que zero.");
      return;
    }
    if (avgPrice <= 0) {
      setValidationError("Preco medio deve ser maior que zero.");
      return;
    }
    if (curPrice <= 0) {
      setValidationError("Preco atual deve ser maior que zero.");
      return;
    }
    if (!startDate) {
      setValidationError("Informe a data da aplicacao.");
      return;
    }
    if (rate < 0) {
      setValidationError("Taxa anual nao pode ser negativa.");
      return;
    }

    setValidationError(null);
    await onSave({
      broker: broker.trim(),
      category,
      investmentType: investmentType.trim(),
      assetName: assetName.trim(),
      assetLogoUrl: assetLogoUrl.trim() ? assetLogoUrl.trim() : null,
      quantity: qty,
      averagePrice: avgPrice,
      currentPrice: curPrice,
      annualRate: rate,
      startDate,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-[#7C3AED66] bg-[#101523] p-5 shadow-[0_24px_70px_rgba(124,58,237,0.35)]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-extrabold text-white">Adicionar investimento</h3>
          <button
            type="button"
            className="rounded-lg border border-violet-300/25 bg-violet-900/30 p-1.5 text-violet-100 hover:bg-violet-800/45"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
              Banco / Corretora
            </span>
            <select
              className={INPUT_CLASS}
              value={broker}
              onChange={(event) => setBroker(event.target.value)}
            >
              {BROKER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
              Categoria
            </span>
            <select
              className={INPUT_CLASS}
              value={category}
              onChange={(event) => setCategory(event.target.value as InvestmentCategory)}
            >
              {INVESTMENT_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
              Tipo de investimento
            </span>
            <select
              className={INPUT_CLASS}
              value={investmentType}
              onChange={(event) => setInvestmentType(event.target.value)}
            >
              {INVESTMENT_TYPE_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
              Nome do ativo
            </span>
            <input
              className={INPUT_CLASS}
              placeholder="Ex: Bitcoin, ITUB4, Tesouro IPCA 2035"
              value={assetName}
              onChange={(event) => setAssetName(event.target.value)}
            />
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
              URL da foto/logo (opcional)
            </span>
            <input
              className={INPUT_CLASS}
              placeholder="https://..."
              value={assetLogoUrl}
              onChange={(event) => setAssetLogoUrl(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
              Quantidade
            </span>
            <input
              className={INPUT_CLASS}
              placeholder="Ex: 2"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
              Preco medio
            </span>
            <input
              className={INPUT_CLASS}
              placeholder="Ex: 100"
              value={averagePrice}
              onChange={(event) => setAveragePrice(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
              Preco atual
            </span>
            <input
              className={INPUT_CLASS}
              placeholder="Ex: 115"
              value={currentPrice}
              onChange={(event) => setCurrentPrice(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
              Taxa anual (%) - opcional
            </span>
            <input
              className={INPUT_CLASS}
              placeholder="Ex: 11"
              value={annualRate}
              onChange={(event) => setAnnualRate(event.target.value)}
            />
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
              Data da aplicacao
            </span>
            <input
              type="date"
              className={INPUT_CLASS}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
        </div>

        {validationError ? (
          <div className="mt-3 rounded-lg border border-rose-300/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {validationError}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-violet-300/25 bg-violet-950/30 px-4 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-900/45 disabled:opacity-60"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(124,58,237,0.45)] hover:brightness-110 disabled:opacity-60"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
