"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useConfirmDialog } from "@/context/ConfirmDialogContext";
import { InvestmentModal, type InvestmentLaunchPayload } from "@/components/investments/InvestmentModal";
import { InvestmentCategory } from "@/components/investments/InvestmentCategory";
import { InvestmentSummary } from "@/components/investments/InvestmentSummary";
import { type InvestmentCardItem } from "@/components/investments/InvestmentCard";
import {
  INVESTMENT_CATEGORIES,
  calculateCompound,
  mapCategoryKeyToUiCategory,
  mapInvestmentTypeToCategory,
  resolvePriceHistory,
  type InvestmentCategory as InvestmentCategoryType,
} from "@/lib/calculateInvestment";
import { brl, toNumber } from "@/lib/money";
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
  bank_id?: string | null;
  type_id?: string | null;
  asset_id?: string | null;
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
  dividends_received?: number | string | null;
};

type BankRow = {
  id: string;
  name: string;
  logo: string | null;
};

type InvestmentTypeRow = {
  id: string;
  name: string;
  category: string;
};

type AssetRow = {
  id: string;
  name: string;
  category: string | null;
  logo: string | null;
  type_id: string | null;
};

const SECTION_CLASS =
  "rounded-3xl border border-slate-200/12 bg-slate-950/60 shadow-[0_24px_56px_rgba(2,6,23,0.46)] backdrop-blur-xl";

const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-2xl border border-slate-100/60 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_14px_34px_rgba(15,23,42,0.28)] transition hover:bg-white";

const LOW_USAGE_MODE = process.env.NEXT_PUBLIC_SUPABASE_LOW_USAGE_MODE !== "false";

const roundCurrency = (value: number) => Math.round(value * 100) / 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const toUuidOrNull = (value: string | null | undefined) => {
  if (!value) return null;
  return UUID_PATTERN.test(value) ? value : null;
};

const safeRatio = (numerator: number, denominator: number, fallback = 0) => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback;
  }
  return numerator / denominator;
};

const parsePromptQuantity = (value: string) => {
  const raw = (value || "").trim().replace(/\s/g, "");
  if (!raw) return Number.NaN;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  let normalized = raw;
  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    normalized = raw.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (hasComma) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const isMissingInvestmentsExtendedColumnError = (message?: string | null) =>
  /could not find the '(bank_id|type_id|asset_id|operation|costs|category|asset_name|asset_logo_url|quantity|average_price|current_price|price_history|dividends_received)' column of 'investments' in the schema cache/i
    .test(message ?? "");

const normalizeCategory = (
  rawCategory: string | null | undefined,
  typeCategoryKey: string | null | undefined,
  investmentType: string,
): InvestmentCategoryType => {
  if (rawCategory && INVESTMENT_CATEGORIES.includes(rawCategory as InvestmentCategoryType)) {
    return rawCategory as InvestmentCategoryType;
  }
  if (rawCategory && !INVESTMENT_CATEGORIES.includes(rawCategory as InvestmentCategoryType)) {
    return mapCategoryKeyToUiCategory(rawCategory);
  }
  if (typeCategoryKey) {
    const byType = mapInvestmentTypeToCategory(investmentType);
    if (byType !== "Outros") return byType;
    return mapCategoryKeyToUiCategory(typeCategoryKey);
  }
  return mapInvestmentTypeToCategory(investmentType);
};

const normalizeInvestment = (
  row: RawInvestmentRow,
  lookup?: {
    banksById?: Map<string, BankRow>;
    typesById?: Map<string, InvestmentTypeRow>;
    assetsById?: Map<string, AssetRow>;
  },
): InvestmentRow | null => {
  if (!row.id || !row.user_id) return null;

  const bankLookup = row.bank_id ? lookup?.banksById?.get(row.bank_id) : undefined;
  const typeLookup = row.type_id ? lookup?.typesById?.get(row.type_id) : undefined;
  const assetLookup = row.asset_id ? lookup?.assetsById?.get(row.asset_id) : undefined;

  const investmentType = (row.investment_type || typeLookup?.name || "Outros").trim() || "Outros";
  const category = normalizeCategory(row.category || assetLookup?.category, typeLookup?.category, investmentType);
  const annualRate = row.annual_rate === null || typeof row.annual_rate === "undefined"
    ? null
    : toNumber(row.annual_rate);
  const operation = row.operation === "venda" ? "venda" : "compra";
  const costs = Math.max(0, toNumber(row.costs));
  const dividendsReceived = Math.max(0, toNumber(row.dividends_received));

  const startDate = row.start_date || new Date().toISOString().slice(0, 10);
  const broker = (row.broker || bankLookup?.name || "Nao informado").trim() || "Nao informado";
  const assetName = (row.asset_name || assetLookup?.name || investmentType).trim() || investmentType;
  const assetNameLower = assetName.toLowerCase();
  const investmentTypeLower = investmentType.toLowerCase();
  const isCaixinhaAsset = assetNameLower.includes("caixinha")
    || investmentTypeLower.includes("caixinha");
  const isGoldAsset = assetNameLower.includes("ouro")
    || investmentTypeLower.includes("ouro")
    || investmentTypeLower.includes("xau");

  let quantity = Math.abs(toNumber(row.quantity));
  let averagePrice = toNumber(row.average_price);
  let currentPrice = toNumber(row.current_price);
  let investedAmount = toNumber(row.invested_amount);
  let currentAmount = toNumber(row.current_amount);
  const assetKey = `${assetName} ${investmentType}`.toLowerCase();

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

  // Fix legacy BTC entries where "1.000" was interpreted as 1000 and "7.000" as 7.
  if ((assetKey.includes("bitcoin") || assetKey.includes("btc")) && investedAmount > 0) {
    const looksScaled = quantity >= 100 && averagePrice > 0 && averagePrice < 1000;
    if (looksScaled) {
      const fixedQuantity = quantity / 1000;
      const fixedAveragePrice = averagePrice * 1000;
      const fixedCurrentPrice = Math.max(currentPrice * 1000, fixedAveragePrice);
      const fixedTotal = fixedQuantity * fixedAveragePrice;
      const ratio = Math.abs(fixedTotal - investedAmount) / investedAmount;
      if (ratio <= 0.05) {
        quantity = fixedQuantity;
        averagePrice = fixedAveragePrice;
        currentPrice = fixedCurrentPrice;
      }
    }
  }

  investedAmount = roundCurrency((quantity * averagePrice) + costs);
  currentAmount = roundCurrency(quantity * currentPrice);

  const resolvedAssetLogo = isGoldAsset
    ? "/custom/icons/barras-de-ouro.png"
    : isCaixinhaAsset
      ? "/custom/icons/CDB-Caixinha.webp"
      : row.asset_logo_url?.trim() || assetLookup?.logo || bankLookup?.logo || null;

  return {
    id: row.id,
    user_id: row.user_id,
    broker,
    category,
    investment_type: investmentType,
    operation,
    costs,
    dividends_received: dividendsReceived,
    asset_name: assetName,
    asset_logo_url: resolvedAssetLogo,
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
  const confirmDialog = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      INVESTMENT_CATEGORIES.map((category, index) => [category, index === 0]),
    ),
  );

  const ensureUserId = useCallback(async () => {
    if (userId) return userId;

    const sessionRes = await supabase.auth.getSession();
    const fromSession = sessionRes.data.session?.user?.id ?? null;
    if (fromSession) {
      setUserId(fromSession);
      return fromSession;
    }

    const { data, error } = await supabase.auth.getUser();
    if (error) {
      setFeedback(`Sessao nao encontrada: ${error.message}`);
      return null;
    }

    const resolvedUserId = data.user?.id ?? null;
    setUserId(resolvedUserId);
    if (!resolvedUserId) {
      setFeedback("Sessao nao encontrada. Entre novamente.");
      return null;
    }

    return resolvedUserId;
  }, [userId]);

  const syncInvestmentSecuritySnapshot = useCallback(async () => {
    if (LOW_USAGE_MODE) return;
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (!token) return;

    await fetch("/api/investments/security/snapshot", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
  }, []);

  const loadInvestments = useCallback(async () => {
    try {
      setLoading(true);
      setFeedback(null);

      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) {
        setLoading(false);
        return;
      }

      const [investmentsRes, banksRes, typesRes, assetsRes] = await Promise.all([
        supabase
          .from("investments")
          .select("id, user_id, bank_id, type_id, asset_id, broker, category, investment_type, asset_name, asset_logo_url, quantity, average_price, current_price, invested_amount, current_amount, annual_rate, start_date, created_at, price_history, operation, costs, dividends_received")
          .eq("user_id", resolvedUserId)
          .order("created_at", { ascending: false }),
        supabase.from("banks").select("id, name, logo"),
        supabase.from("investment_types").select("id, name, category"),
        supabase.from("assets").select("id, name, logo, category, type_id"),
      ]);

      const { data, error } = investmentsRes;

      if (error) {
        const baseMessage = /relation .*investments/i.test(error.message)
          ? "Tabela investments nao encontrada. Rode o supabase.sql atualizado."
          : error.message;
        setFeedback(`Falha ao carregar investimentos: ${baseMessage}`);
        setLoading(false);
        return;
      }

      const banksById = new Map<string, BankRow>(
        (((banksRes.error ? [] : banksRes.data) || []) as BankRow[]).map((item) => [item.id, item]),
      );
      const typesById = new Map<string, InvestmentTypeRow>(
        (((typesRes.error ? [] : typesRes.data) || []) as InvestmentTypeRow[]).map((item) => [item.id, item]),
      );
      const assetsById = new Map<string, AssetRow>(
        (((assetsRes.error ? [] : assetsRes.data) || []) as AssetRow[]).map((item) => [item.id, item]),
      );

      const normalized = ((data || []) as RawInvestmentRow[])
        .map((row) =>
          normalizeInvestment(row, {
            banksById,
            typesById,
            assetsById,
          }),
        )
        .filter((item): item is InvestmentRow => !!item);

      setInvestments(normalized);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      setFeedback(`Falha inesperada ao carregar investimentos: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  }, [ensureUserId]);

  useEffect(() => {
    void loadInvestments();
  }, [loadInvestments]);

  const handleAddInvestment = async (payload: InvestmentLaunchPayload) => {
    try {
      setSaving(true);
      setFeedback(null);

      const resolvedUserId = await ensureUserId();
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
        seedRef: `${payload.assetName}-${payload.typeName}-${payload.bankName}-${payload.side}`,
      });

      const fullInsertPayload = {
        user_id: resolvedUserId,
        bank_id: toUuidOrNull(payload.bankId),
        type_id: toUuidOrNull(payload.typeId),
        asset_id: toUuidOrNull(payload.assetId),
        broker: payload.bankName,
        operation: payload.side,
        costs: payload.costs,
        dividends_received: 0,
        category: mapCategoryKeyToUiCategory(payload.typeCategory),
        investment_type: payload.typeName,
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
          broker: payload.bankName,
          investment_type: payload.typeName,
          asset_name: payload.assetName,
          asset_logo_url: payload.assetLogoUrl,
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
      void syncInvestmentSecuritySnapshot();
    } catch (error) {
      setSaving(false);
      setFeedback(`Falha inesperada ao salvar investimento: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const handleDelete = async (investmentId: string) => {
    try {
      const confirmed = await confirmDialog({
        title: "Excluir investimento?",
        description: "Este investimento sera removido permanentemente.",
        confirmLabel: "Excluir",
        cancelLabel: "Cancelar",
        tone: "danger",
      });
      if (!confirmed) return;
      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) return;

      setDeletingId(investmentId);
      setFeedback(null);

      const { data, error } = await supabase
        .from("investments")
        .delete()
        .eq("id", investmentId)
        .eq("user_id", resolvedUserId)
        .select("id")
        .maybeSingle();
      setDeletingId(null);

      if (error) {
        setFeedback(`Nao foi possivel excluir: ${error.message}`);
        return;
      }
      if (!data) {
        setFeedback("Investimento nao encontrado para exclusao.");
        return;
      }

      setFeedback("Investimento excluido.");
      await loadInvestments();
      void syncInvestmentSecuritySnapshot();
    } catch (error) {
      setDeletingId(null);
      setFeedback(`Falha inesperada ao excluir investimento: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const handleEdit = async (investmentId: string) => {
    try {
      const item = investments.find((investment) => investment.id === investmentId);
      if (!item) {
        setFeedback("Investimento nao encontrado para edicao.");
        return;
      }

      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) return;

      const quantityRaw = window.prompt(
        "Nova quantidade:",
        item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 6 }),
      );
      if (quantityRaw === null) return;

      const averagePriceRaw = window.prompt(
        "Novo preco medio (R$):",
        item.average_price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      );
      if (averagePriceRaw === null) return;

      const currentPriceRaw = window.prompt(
        "Novo preco atual (R$):",
        item.current_price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      );
      if (currentPriceRaw === null) return;

      const costsRaw = window.prompt(
        "Custos totais (R$, opcional):",
        item.costs.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      );
      if (costsRaw === null) return;

      const quantity = Math.abs(parsePromptQuantity(quantityRaw));
      const averagePrice = toNumber(averagePriceRaw);
      const currentPrice = toNumber(currentPriceRaw);
      const costs = Math.max(0, toNumber(costsRaw));

      if (!Number.isFinite(quantity) || quantity <= 0) {
        setFeedback("Quantidade invalida.");
        return;
      }
      if (!Number.isFinite(averagePrice) || averagePrice <= 0) {
        setFeedback("Preco medio invalido.");
        return;
      }
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        setFeedback("Preco atual invalido.");
        return;
      }

      const investedAmount = roundCurrency((quantity * averagePrice) + costs);
      const currentAmount = roundCurrency(quantity * currentPrice);
      const priceHistory = resolvePriceHistory({
        history: item.price_history,
        averagePrice,
        currentPrice,
        seedRef: `${item.asset_name}-${item.id}-edit`,
      });

      setEditingId(item.id);
      setFeedback(null);

      const { data, error } = await supabase
        .from("investments")
        .update({
          quantity: roundCurrency(quantity),
          average_price: roundCurrency(averagePrice),
          current_price: roundCurrency(currentPrice),
          costs: roundCurrency(costs),
          invested_amount: investedAmount,
          current_amount: currentAmount,
          price_history: priceHistory,
        })
        .eq("id", item.id)
        .eq("user_id", resolvedUserId)
        .select("id")
        .maybeSingle();

      setEditingId(null);

      if (error) {
        setFeedback(`Nao foi possivel editar: ${error.message}`);
        return;
      }
      if (!data) {
        setFeedback("Investimento nao encontrado para edicao.");
        return;
      }

      setFeedback("Investimento atualizado com sucesso.");
      await loadInvestments();
      void syncInvestmentSecuritySnapshot();
    } catch (error) {
      setEditingId(null);
      setFeedback(`Falha inesperada ao editar investimento: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const groupedByCategory = useMemo(() => {
    const map = new Map<InvestmentCategoryType, InvestmentRow[]>();
    INVESTMENT_CATEGORIES.forEach((category) => map.set(category, []));
    investments.forEach((item) => {
      const list = map.get(item.category as InvestmentCategoryType);
      if (list) list.push(item);
    });
    return map;
  }, [investments]);

  const activeCategoriesCount = useMemo(
    () =>
      INVESTMENT_CATEGORIES.reduce((count, category) => {
        const items = groupedByCategory.get(category) || [];
        return count + (items.length ? 1 : 0);
      }, 0),
    [groupedByCategory],
  );

  const portfolioCurrentTotal = useMemo(
    () =>
      investments.reduce(
        (sum, item) => sum + (item.operation === "venda" ? -item.current_amount : item.current_amount),
        0,
      ),
    [investments],
  );
  const portfolioCurrentTone = portfolioCurrentTotal > 0
    ? "text-emerald-200"
    : portfolioCurrentTotal < 0
      ? "text-rose-200"
      : "text-slate-100";

  const isFeedbackError = useMemo(
    () =>
      !!feedback
      && /(falha|nao foi possivel|nao encontrado|nao encontrada|nao carregada|sessao nao)/i.test(feedback),
    [feedback],
  );

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => ({
      ...prev,
      [category]: !(prev[category] ?? false),
    }));
  };

  return (
    <AppShell
      title="Investimentos"
      subtitle="Visao minimalista e informativa para acompanhar sua carteira em segundos"
      contentClassName="investments-ultra-bg"
    >
      <InvestmentModal
        open={showModal}
        saving={saving}
        onClose={() => setShowModal(false)}
        onSave={handleAddInvestment}
      />

      {loading ? (
        <div className={`${SECTION_CLASS} p-6 text-slate-100`}>
          <span className="inline-flex items-center gap-3 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
            Carregando investimentos...
          </span>
        </div>
      ) : (
        <div className="space-y-5">
          {feedback ? (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${
              isFeedbackError
                ? "border-rose-300/35 bg-rose-400/10 text-rose-100"
                : "border-emerald-300/35 bg-emerald-400/10 text-emerald-100"
            }`}>
              {feedback}
            </div>
          ) : null}

          <section className={`${SECTION_CLASS} p-5 sm:p-6`}>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full border border-slate-200/20 bg-slate-800/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-200">
                  Carteira em foco
                </span>
                <h2 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                  Lista de investimentos
                </h2>
                <p className="max-w-2xl text-sm text-slate-300">
                  Design limpo com destaque para os dados mais importantes: patrimonio, variacao e composicao por categoria.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="grid grid-cols-2 gap-2 sm:min-w-[300px]">
                  <div className="rounded-2xl border border-slate-200/12 bg-slate-900/74 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Ativos</p>
                    <p className="mt-1 text-lg font-bold text-slate-100">{investments.length}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/12 bg-slate-900/74 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Categorias</p>
                    <p className="mt-1 text-lg font-bold text-slate-100">{activeCategoriesCount}</p>
                  </div>
                  <div className="col-span-2 rounded-2xl border border-slate-200/12 bg-slate-900/74 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Posicao atual</p>
                    <p className={`mt-1 text-lg font-bold ${portfolioCurrentTone}`}>{brl(portfolioCurrentTotal)}</p>
                  </div>
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
            </div>
          </section>
          <InvestmentSummary investments={investments} />

          <section className={`${SECTION_CLASS} p-4 sm:p-5`}>
            <div className="space-y-3">
              {INVESTMENT_CATEGORIES.map((category) => (
                <InvestmentCategory
                  key={category}
                  category={category}
                  items={groupedByCategory.get(category) || []}
                  open={openCategories[category] ?? false}
                  deletingId={deletingId}
                  editingId={editingId}
                  onToggle={() => toggleCategory(category)}
                  onEdit={(id) => void handleEdit(id)}
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
