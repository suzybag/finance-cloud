"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  INVESTMENT_TYPE_CATEGORY_KEYS,
  calculateTotal,
  mapCategoryKeyToLabel,
} from "@/lib/calculateInvestment";
import { brl, toNumber } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";
import { ToggleButton } from "@/components/investments/ToggleButton";

type TradeSide = "compra" | "venda";

type BankOption = {
  id: string;
  name: string;
  logo: string | null;
};

type InvestmentTypeOption = {
  id: string;
  name: string;
  category: string;
};

type AssetOption = {
  id: string;
  name: string;
  logo: string | null;
  category: string | null;
  type_id: string | null;
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

export type InvestmentLaunchPayload = {
  side: TradeSide;
  bankId: string;
  bankName: string;
  typeId: string;
  typeName: string;
  typeCategory: string;
  assetId: string | null;
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
  const [bankId, setBankId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [tradeDate, setTradeDate] = useState(todayIso);
  const [quantity, setQuantity] = useState("");
  const [unitPriceMasked, setUnitPriceMasked] = useState("");
  const [costsMasked, setCostsMasked] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [banks, setBanks] = useState<BankOption[]>([]);
  const [investmentTypes, setInvestmentTypes] = useState<InvestmentTypeOption[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);

  useEffect(() => {
    if (!open) return;
    setSide("compra");
    setTradeDate(todayIso());
    setQuantity("");
    setUnitPriceMasked("");
    setCostsMasked("");
    setValidationError(null);
    setOptionsError(null);

    const loadOptions = async () => {
      setLoadingOptions(true);

      const [banksRes, typesRes, assetsRes] = await Promise.all([
        supabase.from("banks").select("id, name, logo").order("name"),
        supabase.from("investment_types").select("id, name, category").order("category").order("name"),
        supabase.from("assets").select("id, name, logo, category, type_id").order("name"),
      ]);

      if (banksRes.error || typesRes.error || assetsRes.error) {
        const baseMessage = banksRes.error?.message || typesRes.error?.message || assetsRes.error?.message || "erro desconhecido";
        const guided = /relation .* (banks|investment_types|assets)/i.test(baseMessage)
          ? "Tabelas de catalogo nao encontradas. Rode o supabase.sql atualizado."
          : baseMessage;
        setOptionsError(guided);
        setBanks([]);
        setInvestmentTypes([]);
        setAssets([]);
        setLoadingOptions(false);
        return;
      }

      const loadedBanks = (banksRes.data as BankOption[]) || [];
      const loadedTypes = (typesRes.data as InvestmentTypeOption[]) || [];
      const loadedAssets = (assetsRes.data as AssetOption[]) || [];

      setBanks(loadedBanks);
      setInvestmentTypes(loadedTypes);
      setAssets(loadedAssets);

      setBankId(loadedBanks[0]?.id ?? "");
      setTypeId(loadedTypes[0]?.id ?? "");
      setAssetId("");
      setLoadingOptions(false);
    };

    void loadOptions();
  }, [open]);

  const selectedType = useMemo(
    () => investmentTypes.find((item) => item.id === typeId) || null,
    [investmentTypes, typeId],
  );

  const filteredAssets = useMemo(() => {
    if (!selectedType) return [] as AssetOption[];
    const direct = assets.filter((item) => item.type_id === selectedType.id);
    if (direct.length) return direct;
    return assets.filter((item) => item.category?.toLowerCase() === selectedType.category.toLowerCase());
  }, [assets, selectedType]);

  useEffect(() => {
    if (!selectedType) {
      setAssetId("");
      return;
    }
    if (!filteredAssets.length) {
      setAssetId("");
      return;
    }
    const exists = filteredAssets.some((item) => item.id === assetId);
    if (!exists) {
      setAssetId(filteredAssets[0].id);
    }
  }, [selectedType, filteredAssets, assetId]);

  const selectedBank = useMemo(
    () => banks.find((item) => item.id === bankId) || null,
    [banks, bankId],
  );

  const selectedAsset = useMemo(
    () => filteredAssets.find((item) => item.id === assetId) || null,
    [filteredAssets, assetId],
  );

  const groupedTypes = useMemo(() => {
    const fixedGroups = INVESTMENT_TYPE_CATEGORY_KEYS
      .map((key) => ({
        key,
        label: mapCategoryKeyToLabel(key),
        items: investmentTypes.filter((item) => item.category.toLowerCase() === key),
      }))
      .filter((group) => group.items.length > 0);

    const known = new Set(INVESTMENT_TYPE_CATEGORY_KEYS.map((item) => item.toLowerCase()));
    const extras = investmentTypes
      .filter((item) => !known.has(item.category.toLowerCase()))
      .reduce<Record<string, InvestmentTypeOption[]>>((acc, item) => {
        const key = item.category || "outros";
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {});

    const extraGroups = Object.entries(extras).map(([key, items]) => ({
      key,
      label: mapCategoryKeyToLabel(key),
      items,
    }));

    return [...fixedGroups, ...extraGroups];
  }, [investmentTypes]);

  const quantityNumber = toNumber(quantity);
  const unitPriceNumber = toNumber(unitPriceMasked);
  const costsNumber = toNumber(costsMasked);
  const totalValue = calculateTotal({
    quantity: quantityNumber,
    unitPrice: unitPriceNumber,
    costs: costsNumber,
  });

  const handleSave = async () => {
    if (!bankId || !selectedBank) {
      setValidationError("Selecione o banco/corretora.");
      return;
    }
    if (!typeId || !selectedType) {
      setValidationError("Selecione o tipo de investimento.");
      return;
    }
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

    const assetName = selectedAsset?.name || selectedType.name;
    const assetLogoUrl = selectedAsset?.logo || null;

    setValidationError(null);
    await onSave({
      side,
      bankId: selectedBank.id,
      bankName: selectedBank.name,
      typeId: selectedType.id,
      typeName: selectedType.name,
      typeCategory: selectedType.category,
      assetId: selectedAsset?.id || null,
      assetName,
      assetLogoUrl,
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

          {optionsError ? (
            <div className="rounded-lg border border-rose-300/35 bg-rose-500/15 px-3 py-2 text-sm text-rose-100">
              {optionsError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-400">Banco / Corretora</span>
              <select
                className={INPUT_CLASS}
                value={bankId}
                onChange={(event) => setBankId(event.target.value)}
                disabled={loadingOptions || !!optionsError}
              >
                <option value="">Selecione</option>
                {banks.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-400">Tipo de investimento</span>
              <select
                className={INPUT_CLASS}
                value={typeId}
                onChange={(event) => setTypeId(event.target.value)}
                disabled={loadingOptions || !!optionsError}
              >
                <option value="">Selecione</option>
                {groupedTypes.map((group) => (
                  <optgroup key={group.key} label={group.label}>
                    {group.items.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-400">Ativo</span>
              <select
                className={INPUT_CLASS}
                value={assetId}
                onChange={(event) => setAssetId(event.target.value)}
                disabled={loadingOptions || !!optionsError || !typeId}
              >
                {!filteredAssets.length ? (
                  <option value="">
                    {selectedType ? selectedType.name : "Sem ativos cadastrados"}
                  </option>
                ) : (
                  filteredAssets.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-400">
                {side === "compra" ? "Data da compra" : "Data da venda"}
              </span>
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

            <label className="block md:col-span-2">
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
            disabled={saving || loadingOptions || !!optionsError}
          >
            {saving ? "Salvando..." : "Adicionar Lancamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
