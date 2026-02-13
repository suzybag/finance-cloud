"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CircleDollarSign,
  Loader2,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { InvestmentModal, type InvestmentLaunchPayload } from "@/components/investments/InvestmentModal";
import { InvestmentCategory } from "@/components/investments/InvestmentCategory";
import { type InvestmentCardItem } from "@/components/investments/InvestmentCard";
import {
  INVESTMENT_CATEGORIES,
  calculateCompound,
  mapInvestmentTypeToCategory,
  resolvePriceHistory,
  type InvestmentCategory as InvestmentCategoryType,
} from "@/lib/calculateInvestment";
import { brl, formatPercent, toNumber } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";

type InvestmentRow = InvestmentCardItem & {
  user_id: string;
  annual_rate: number | null;
  start_date: string;
  created_at: string;
};

type RawInvestmentRow = {
  id?: string | null;
  user_id?: string | null;
  broker?: string | null;
  category?: string | null;
  investment_type?: string | null;
  asset_name?: string | null;
  asset_logo_url?: string | null;
  quantity?: number | string | null;
  average_price?: number | string | null;
  current_price?: number | string | null;
  invested_amount?: number | string | null;
  current_amount?: number | string | null;
  annual_rate?: number | string | null;
  start_date?: string | null;
  created_at?: string | null;
  price_history?: unknown;
  operation?: string | null;
  costs?: number | string | null;
};

const SECTION_CLASS =
  "rounded-2xl border border-[#7C3AED40] bg-[linear-gradient(165deg,rgba(17,24,39,0.94),rgba(7,11,23,0.95))] shadow-[0_16px_42px_rgba(15,23,42,0.55)] backdrop-blur-xl";

const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(124,58,237,0.4)] transition hover:brightness-110";

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const safeRatio = (numerator: number, denominator: number, fallback = 0) => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback;
  }
  return numerator / denominator;
};

const isMissingInvestmentsExtendedColumnError = (message?: string | null) =>
  /could not find the '(operation|costs|category|asset_name|asset_logo_url|quantity|average_price|current_price|price_history)' column of 'investments' in the schema cache/i
    .test(message ?? "");

const normalizeCategory = (
  rawCategory: string | null | undefined,
  investmentType: string,
): InvestmentCategoryType => {
  if (rawCategory && INVESTMENT_CATEGORIES.includes(rawCategory as InvestmentCategoryType)) {
    return rawCategory as InvestmentCategoryType;
  }
  return mapInvestmentTypeToCategory(investmentType);
};

const normalizeInvestment = (row: RawInvestmentRow): InvestmentRow | null => {
  if (!row.id || !row.user_id) return null;

  const investmentType = (row.investment_type || "Outros").trim() || "Outros";
  const category = normalizeCategory(row.category, investmentType);
  const annualRate = row.annual_rate === null || typeof row.annual_rate === "undefined"
    ? null
    : toNumber(row.annual_rate);
  const operation = row.operation === "venda" ? "venda" : "compra";
  const costs = Math.max(0, toNumber(row.costs));

  const startDate = row.start_date || new Date().toISOString().slice(0, 10);
  const broker = (row.broker || "Nao informado").trim() || "Nao informado";
  const assetName = (row.asset_name || investmentType).trim() || investmentType;

  let quantity = Math.abs(toNumber(row.quantity));
  let averagePrice = toNumber(row.average_price);
  let currentPrice = toNumber(row.current_price);
  let investedAmount = toNumber(row.invested_amount);
  let currentAmount = toNumber(row.current_amount);

  if (quantity <= 0) {
    quantity = investedAmount > 0 && averagePrice > 0
      ? safeRatio(investedAmount, averagePrice, 1)
      : 1;
  }

  if (averagePrice <= 0) {
    averagePrice = investedAmount > 0 ? safeRatio(investedAmount, quantity, 0) : 0;
  }

  if (currentPrice <= 0) {
    currentPrice = currentAmount > 0 ? safeRatio(currentAmount, quantity, 0) : 0;
  }

  if (currentPrice <= 0 && annualRate && annualRate > 0) {
    currentPrice = calculateCompound({
      principal: averagePrice > 0 ? averagePrice : 1,
      annualRate,
      startDate,
    });
  }

  if (averagePrice <= 0) averagePrice = currentPrice > 0 ? currentPrice : 1;
  if (currentPrice <= 0) currentPrice = averagePrice;

  investedAmount = roundCurrency((quantity * averagePrice) + costs);
  currentAmount = roundCurrency(quantity * currentPrice);

  return {
    id: row.id,
    user_id: row.user_id,
    broker,
    category,
    investment_type: investmentType,
    operation,
    costs,
    asset_name: assetName,
    asset_logo_url: row.asset_logo_url?.trim() || null,
    quantity: roundCurrency(quantity),
    average_price: roundCurrency(averagePrice),
    current_price: roundCurrency(currentPrice),
    invested_amount: investedAmount,
    current_amount: currentAmount,
    annual_rate: annualRate,
    start_date: startDate,
    created_at: row.created_at || new Date().toISOString(),
    price_history: resolvePriceHistory({
      history: row.price_history,
      averagePrice,
      currentPrice,
      seedRef: `${assetName}-${broker}-${row.id}`,
    }),
  };
};

export default function InvestmentsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      INVESTMENT_CATEGORIES.map((category, index) => [category, index === 0]),
    ),
  );

  const loadInvestments = useCallback(async () => {
    setLoading(true);
    setFeedback(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const resolvedUserId = userData.user?.id ?? null;

    if (userError || !resolvedUserId) {
      setFeedback("Sessao nao encontrada. Entre novamente.");
      setLoading(false);
      return;
    }

    setUserId(resolvedUserId);

    const { data, error } = await supabase
      .from("investments")
      .select("*")
      .eq("user_id", resolvedUserId)
      .order("created_at", { ascending: false });

    if (error) {
      const baseMessage = /relation .*investments/i.test(error.message)
        ? "Tabela investments nao encontrada. Rode o supabase.sql atualizado."
        : error.message;
      setFeedback(`Falha ao carregar investimentos: ${baseMessage}`);
      setLoading(false);
      return;
    }

    const normalized = ((data || []) as RawInvestmentRow[])
      .map(normalizeInvestment)
      .filter((item): item is InvestmentRow => !!item);

    setInvestments(normalized);
    setLoading(false);

    await Promise.allSettled(
      normalized.map((item) =>
        supabase
          .from("investments")
          .update({
            operation: item.operation,
            costs: item.costs,
            category: item.category,
            asset_name: item.asset_name,
            asset_logo_url: item.asset_logo_url,
            quantity: item.quantity,
            average_price: item.average_price,
            current_price: item.current_price,
            invested_amount: item.invested_amount,
            current_amount: item.current_amount,
            price_history: item.price_history,
          })
          .eq("id", item.id),
      ),
    );
  }, []);

  useEffect(() => {
    void loadInvestments();
  }, [loadInvestments]);

  const handleAddInvestment = async (payload: InvestmentLaunchPayload) => {
    setSaving(true);
    setFeedback(null);

    const resolvedUserId = userId || (await supabase.auth.getUser()).data.user?.id || null;
    if (!resolvedUserId) {
      setSaving(false);
      setFeedback("Sessao nao carregada. Faca login novamente.");
      return;
    }

    const investedAmount = roundCurrency(payload.totalValue);
    const currentAmount = roundCurrency(payload.quantity * payload.unitPrice);
    const initialHistory = resolvePriceHistory({
      history: [],
      averagePrice: payload.unitPrice,
      currentPrice: payload.unitPrice,
      seedRef: `${payload.assetName}-${payload.assetType}-${payload.side}`,
    });

    const fullInsertPayload = {
      user_id: resolvedUserId,
      broker: "Manual",
      operation: payload.side,
      costs: payload.costs,
      category: payload.assetType,
      investment_type: payload.assetType,
      asset_name: payload.assetName,
      asset_logo_url: payload.assetLogoUrl,
      quantity: payload.quantity,
      average_price: payload.unitPrice,
      current_price: payload.unitPrice,
      invested_amount: investedAmount,
      current_amount: currentAmount,
      annual_rate: null,
      start_date: payload.tradeDate,
      price_history: initialHistory,
    };

    const initialInsert = await supabase.from("investments").insert(fullInsertPayload);
    let error = initialInsert.error;
    let usedFallback = false;

    if (error && isMissingInvestmentsExtendedColumnError(error.message)) {
      usedFallback = true;
      const fallbackInsert = await supabase.from("investments").insert({
        user_id: resolvedUserId,
        broker: "Manual",
        investment_type: payload.assetType,
        invested_amount: investedAmount,
        current_amount: currentAmount,
        annual_rate: null,
        start_date: payload.tradeDate,
      });
      error = fallbackInsert.error;
    }

    if (error) {
      setSaving(false);
      setFeedback(`Nao foi possivel salvar investimento: ${error.message}`);
      return;
    }

    setSaving(false);
    setShowModal(false);
    setFeedback(
      usedFallback
        ? "Lancamento salvo, mas alguns campos visuais exigem atualizacao do banco."
        : "Lancamento salvo com sucesso.",
    );
    await loadInvestments();
  };

  const handleDelete = async (investmentId: string) => {
    const confirmed = window.confirm("Excluir este investimento?");
    if (!confirmed) return;

    setDeletingId(investmentId);
    setFeedback(null);

    const { error } = await supabase.from("investments").delete().eq("id", investmentId);
    setDeletingId(null);

    if (error) {
      setFeedback(`Nao foi possivel excluir: ${error.message}`);
      return;
    }

    setFeedback("Investimento excluido.");
    await loadInvestments();
  };

  const summary = useMemo(() => {
    const totalInvested = investments.reduce(
      (sum, item) => sum + (item.operation === "venda" ? -item.invested_amount : item.invested_amount),
      0,
    );
    const totalCurrent = investments.reduce(
      (sum, item) => sum + (item.operation === "venda" ? -item.current_amount : item.current_amount),
      0,
    );
    const profit = totalCurrent - totalInvested;
    const profitability = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    return {
      totalInvested: roundCurrency(totalInvested),
      totalCurrent: roundCurrency(totalCurrent),
      profit: roundCurrency(profit),
      profitability,
    };
  }, [investments]);

  const groupedByCategory = useMemo(() => {
    const map = new Map<InvestmentCategoryType, InvestmentRow[]>();
    INVESTMENT_CATEGORIES.forEach((category) => map.set(category, []));
    investments.forEach((item) => {
      const list = map.get(item.category as InvestmentCategoryType);
      if (list) list.push(item);
    });
    return map;
  }, [investments]);

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => ({
      ...prev,
      [category]: !(prev[category] ?? false),
    }));
  };

  return (
    <AppShell
      title="Investimentos"
      subtitle="Lista profissional por categoria com lancamentos de compra e venda"
      contentClassName="investments-ultra-bg"
    >
      <InvestmentModal
        open={showModal}
        saving={saving}
        onClose={() => setShowModal(false)}
        onSave={handleAddInvestment}
      />

      {loading ? (
        <div className={`${SECTION_CLASS} p-6 text-slate-200`}>
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando investimentos...
          </span>
        </div>
      ) : (
        <div className="space-y-5">
          {feedback ? (
            <div className="rounded-xl border border-violet-300/30 bg-violet-950/35 px-4 py-3 text-sm text-violet-100">
              {feedback}
            </div>
          ) : null}

          <section className={`${SECTION_CLASS} p-5`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-white">Lista de investimentos</h2>
                <p className="mt-1 text-sm text-slate-300">
                  Visual minimalista por categoria com foco em decisao rapida.
                </p>
              </div>
              <button
                type="button"
                className={PRIMARY_BUTTON_CLASS}
                onClick={() => setShowModal(true)}
              >
                <Plus className="h-4 w-4" />
                Adicionar lancamento
              </button>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className={`${SECTION_CLASS} p-4`}>
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-slate-400">
                <Wallet className="h-4 w-4 text-violet-300" />
                Total investido
              </p>
              <p className="mt-2 text-2xl font-extrabold text-white">{brl(summary.totalInvested)}</p>
            </div>
            <div className={`${SECTION_CLASS} p-4`}>
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-slate-400">
                <CircleDollarSign className="h-4 w-4 text-cyan-300" />
                Total atual
              </p>
              <p className="mt-2 text-2xl font-extrabold text-cyan-200">{brl(summary.totalCurrent)}</p>
            </div>
            <div className={`${SECTION_CLASS} p-4`}>
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-slate-400">
                <TrendingUp className="h-4 w-4 text-emerald-300" />
                Rentabilidade total
              </p>
              <p className={`mt-2 text-2xl font-extrabold ${summary.profitability >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {formatPercent(summary.profitability)}
              </p>
            </div>
            <div className={`${SECTION_CLASS} p-4`}>
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-slate-400">
                <Activity className="h-4 w-4 text-violet-300" />
                Lucro / prejuizo
              </p>
              <p className={`mt-2 text-2xl font-extrabold ${summary.profit >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {brl(summary.profit)}
              </p>
            </div>
          </section>

          <section className={`${SECTION_CLASS} p-4`}>
            <div className="space-y-3">
              {INVESTMENT_CATEGORIES.map((category) => (
                <InvestmentCategory
                  key={category}
                  category={category}
                  items={groupedByCategory.get(category) || []}
                  open={openCategories[category] ?? false}
                  deletingId={deletingId}
                  onToggle={() => toggleCategory(category)}
                  onDelete={(id) => void handleDelete(id)}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
