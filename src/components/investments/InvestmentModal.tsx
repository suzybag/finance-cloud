"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  INVESTMENT_CATEGORIES,
  calculateTotal,
  type InvestmentCategory,
} from "@/lib/calculateInvestment";
import { brl, toNumber } from "@/lib/money";
import { ToggleButton } from "@/components/investments/ToggleButton";

type TradeSide = "compra" | "venda";

type AssetOption = {
  value: string;
  label: string;
  logoUrl: string | null;
};

const CATEGORY_LABEL: Record<InvestmentCategory, string> = {
  Criptomoedas: "Criptomoedas",
  "Tesouro Direto": "Tesouro Direto",
  Acoes: "Acoes",
  FIIs: "FIIs",
  "Renda Fixa": "Renda Fixa",
  Outros: "Outros",
};

const ASSET_OPTIONS_BY_TYPE: Record<InvestmentCategory, AssetOption[]> = {
  Criptomoedas: [
    { value: "btc", label: "BTC - Bitcoin", logoUrl: "https://assets.coincap.io/assets/icons/btc@2x.png" },
    { value: "eth", label: "ETH - Ethereum", logoUrl: "https://assets.coincap.io/assets/icons/eth@2x.png" },
    { value: "sol", label: "SOL - Solana", logoUrl: "https://assets.coincap.io/assets/icons/sol@2x.png" },
    { value: "xrp", label: "XRP - Ripple", logoUrl: "https://assets.coincap.io/assets/icons/xrp@2x.png" },
  ],
  "Tesouro Direto": [
    { value: "selic2029", label: "Tesouro Selic 2029", logoUrl: null },
    { value: "ipca2035", label: "Tesouro IPCA+ 2035", logoUrl: null },
    { value: "prefixado2029", label: "Tesouro Prefixado 2029", logoUrl: null },
  ],
  Acoes: [
    { value: "petr4", label: "PETR4 - Petrobras", logoUrl: "https://logo.clearbit.com/petrobras.com.br" },
    { value: "vale3", label: "VALE3 - Vale", logoUrl: "https://logo.clearbit.com/vale.com" },
    { value: "itub4", label: "ITUB4 - Itau", logoUrl: "https://logo.clearbit.com/itau.com.br" },
    { value: "roxo34", label: "ROXO34 - Nubank", logoUrl: "https://logo.clearbit.com/nubank.com.br" },
  ],
  FIIs: [
    { value: "hglg11", label: "HGLG11", logoUrl: null },
    { value: "mxrf11", label: "MXRF11", logoUrl: null },
    { value: "xplg11", label: "XPLG11", logoUrl: null },
  ],
  "Renda Fixa": [
    { value: "cdb100", label: "CDB 100% CDI", logoUrl: null },
    { value: "cdb110", label: "CDB 110% CDI", logoUrl: null },
    { value: "lci", label: "LCI", logoUrl: null },
    { value: "lca", label: "LCA", logoUrl: null },
  ],
  Outros: [
    { value: "outro", label: "Outro ativo", logoUrl: null },
  ],
};

const INPUT_CLASS =
  "w-full rounded-xl border border-violet-300/25 bg-[#121827] px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30";

const moneyMask = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const amount = Number(digits) / 100;
  return amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const getDefaultAsset = (assetType: InvestmentCategory) => ASSET_OPTIONS_BY_TYPE[assetType][0];

export type InvestmentLaunchPayload = {
  side: TradeSide;
  assetType: InvestmentCategory;
  assetName: string;
  assetLogoUrl: string | null;
  tradeDate: string;
  quantity: number;
  unitPrice: number;
  costs: number;
  totalValue: number;
};

type InvestmentModalProps = {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: InvestmentLaunchPayload) => Promise<void>;
};

export function InvestmentModal({
  open,
  saving,
  onClose,
  onSave,
}: InvestmentModalProps) {
  const [side, setSide] = useState<TradeSide>("compra");
  const [assetType, setAssetType] = useState<InvestmentCategory>("Criptomoedas");
  const [assetValue, setAssetValue] = useState<string>(getDefaultAsset("Criptomoedas").value);
  const [tradeDate, setTradeDate] = useState(todayIso);
  const [quantity, setQuantity] = useState("");
  const [unitPriceMasked, setUnitPriceMasked] = useState("");
  const [costsMasked, setCostsMasked] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSide("compra");
    setAssetType("Criptomoedas");
    setAssetValue(getDefaultAsset("Criptomoedas").value);
    setTradeDate(todayIso());
    setQuantity("");
    setUnitPriceMasked("");
    setCostsMasked("");
    setValidationError(null);
  }, [open]);

  useEffect(() => {
    const first = getDefaultAsset(assetType);
    setAssetValue(first.value);
  }, [assetType]);

  const assetOptions = ASSET_OPTIONS_BY_TYPE[assetType];
  const selectedAsset = useMemo(
    () => assetOptions.find((option) => option.value === assetValue) || assetOptions[0],
    [assetOptions, assetValue],
  );

  const quantityNumber = toNumber(quantity);
  const unitPriceNumber = toNumber(unitPriceMasked);
  const costsNumber = toNumber(costsMasked);
  const totalValue = calculateTotal({
    quantity: quantityNumber,
    unitPrice: unitPriceNumber,
    costs: costsNumber,
  });

  const handleSave = async () => {
    if (quantityNumber <= 0) {
      setValidationError("Quantidade deve ser maior que zero.");
      return;
    }
    if (unitPriceNumber <= 0) {
      setValidationError("Preco unitario deve ser maior que zero.");
      return;
    }
    if (!tradeDate) {
      setValidationError("Informe a data da operacao.");
      return;
    }

    setValidationError(null);
    await onSave({
      side,
      assetType,
      assetName: selectedAsset.label,
      assetLogoUrl: selectedAsset.logoUrl,
      tradeDate,
      quantity: quantityNumber,
      unitPrice: unitPriceNumber,
      costs: costsNumber,
      totalValue,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="investment-modal-enter w-full max-w-3xl rounded-xl border border-violet-300/25 bg-[#0F172A] shadow-[0_28px_80px_rgba(2,6,23,0.65)]">
        <div className="flex items-center justify-between border-b border-violet-300/15 px-5 py-4">
          <h3 className="text-xl font-bold tracking-tight text-white">Adicionar Lancamento</h3>
          <button
            type="button"
            className="rounded-lg border border-violet-300/25 bg-violet-900/25 p-1.5 text-violet-100 transition hover:bg-violet-800/45"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="rounded-xl border border-violet-300/15 bg-[#121a2d] p-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <ToggleButton
                variant="buy"
                active={side === "compra"}
                onClick={() => setSide("compra")}
              />
              <ToggleButton
                variant="sell"
                active={side === "venda"}
                onClick={() => setSide("venda")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-400">Tipo de ativo</span>
              <select
                className={INPUT_CLASS}
                value={assetType}
                onChange={(event) => setAssetType(event.target.value as InvestmentCategory)}
              >
                {INVESTMENT_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {CATEGORY_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-400">Ativo</span>
              <select
                className={INPUT_CLASS}
                value={assetValue}
                onChange={(event) => setAssetValue(event.target.value)}
              >
                {assetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-400">Data da compra</span>
              <input
                type="date"
                className={INPUT_CLASS}
                value={tradeDate}
                onChange={(event) => setTradeDate(event.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-400">Quantidade</span>
              <input
                className={INPUT_CLASS}
                placeholder="0,0000"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-400">Preco unitario</span>
              <input
                className={INPUT_CLASS}
                placeholder="0,00"
                value={unitPriceMasked}
                onChange={(event) => setUnitPriceMasked(moneyMask(event.target.value))}
                inputMode="decimal"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-400">Outros custos (opcional)</span>
              <input
                className={INPUT_CLASS}
                placeholder="0,00"
                value={costsMasked}
                onChange={(event) => setCostsMasked(moneyMask(event.target.value))}
                inputMode="decimal"
              />
            </label>
          </div>

          {validationError ? (
            <div className="rounded-lg border border-rose-300/35 bg-rose-500/15 px-3 py-2 text-sm text-rose-100">
              {validationError}
            </div>
          ) : null}

          <div className="rounded-xl border border-violet-300/15 bg-[#0b1222] px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-base font-bold text-slate-100">Valor total</p>
              <p className="text-2xl font-extrabold text-cyan-200">{brl(totalValue)}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-violet-300/15 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            className="rounded-xl border border-slate-600/60 bg-slate-800/50 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700/60 disabled:opacity-60"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-xl border border-violet-300/30 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(139,92,246,0.4)] transition hover:brightness-110 disabled:opacity-60"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Salvando..." : "Adicionar Lancamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
