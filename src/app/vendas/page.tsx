"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CircleDollarSign,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useConfirmDialog } from "@/context/ConfirmDialogContext";
import { brl, toNumber } from "@/lib/money";
import { sanitizeFreeText } from "@/lib/security/input";
import { supabase } from "@/lib/supabaseClient";

type ResaleItemRow = {
  id: string;
  user_id: string;
  category: string;
  item_name: string;
  purchase_amount: number;
  purchase_date: string;
  description: string | null;
  sale_amount: number | null;
  sold_at: string | null;
  created_at: string;
  updated_at: string;
};

type ResaleFormState = {
  category: string;
  item_name: string;
  purchase_amount: string;
  purchase_date: string;
  description: string;
};

type ProductChartDatum = {
  name: string;
  shortName: string;
  category: string;
  profit: number;
  chartValue: number;
  purchaseAmount: number;
  saleAmount: number;
  soldAt: string;
  resultLabel: string;
  tone: "profit" | "loss" | "neutral";
};

const SECTION_CLASS =
  "rounded-3xl border border-cyan-500/12 bg-[linear-gradient(160deg,rgba(14,14,18,0.96),rgba(5,8,15,0.98))] shadow-[0_22px_52px_rgba(0,0,0,0.38)] backdrop-blur-xl";

const INPUT_CLASS =
  "w-full rounded-2xl border border-zinc-800 bg-zinc-950/90 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-500/15";

const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_14px_32px_rgba(6,182,212,0.25)] transition hover:brightness-110 disabled:opacity-60";

const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/85 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-500/30 hover:bg-zinc-900 disabled:opacity-60";

const SOLD_CARD_CLASS =
  "rounded-2xl border border-emerald-500/20 bg-[linear-gradient(180deg,rgba(14,28,24,0.98),rgba(8,18,16,0.98))] p-5 shadow-[0_20px_40px_rgba(0,0,0,0.24)]";

const GREEN_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-teal-400 px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60";

const todayIso = () => new Date().toISOString().slice(0, 10);
const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const emptyForm = (): ResaleFormState => ({
  category: "PC",
  item_name: "",
  purchase_amount: "",
  purchase_date: todayIso(),
  description: "",
});

const formatDateLabel = (value?: string | null) => {
  if (!value) return "--";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const normalizeText = (value?: string | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const isMissingResaleTableError = (message?: string | null) =>
  /relation .*resale_items/i.test(message || "")
  || /schema cache/i.test((message || "").toLowerCase());

const isSoldItem = (row: ResaleItemRow) => row.sale_amount !== null && !!row.sold_at;

const getResultTone = (profit: number) => {
  if (profit > 0) return "text-emerald-300";
  if (profit < 0) return "text-rose-300";
  return "text-slate-300";
};

const formatSignedBrl = (value: number) => {
  if (value < 0) return `- ${brl(Math.abs(value))}`;
  if (value > 0) return `+ ${brl(value)}`;
  return brl(0);
};

const shortMoney = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${value < 0 ? "-" : ""}R$ ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${value < 0 ? "-" : ""}R$ ${(abs / 1_000).toFixed(0)}k`;
  return brl(value);
};

const getReferenceDate = (row: ResaleItemRow) => row.sold_at || row.purchase_date || row.created_at.slice(0, 10);

const truncateChartName = (value: string, max = 12) => {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
};

const getChartTone = (profit: number): ProductChartDatum["tone"] => {
  if (profit > 0) return "profit";
  if (profit < 0) return "loss";
  return "neutral";
};

const getChartFill = (tone: ProductChartDatum["tone"]) => {
  if (tone === "loss") return "url(#salesLossGradient)";
  if (tone === "neutral") return "#94a3b8";
  return "url(#salesProfitGradient)";
};

const ProductChartTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ProductChartDatum }>;
}) => {
  if (!active || !payload?.length) return null;

  const item = payload[0]?.payload;
  if (!item) return null;

  const toneClass = item.tone === "profit" ? "text-cyan-300" : item.tone === "loss" ? "text-rose-300" : "text-slate-300";

  return (
    <div className="min-w-[180px] rounded-xl border border-cyan-400/40 bg-[#020617] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
      <p className="text-base font-bold text-white">{item.name}</p>
      <p className="mt-2 text-sm text-slate-300">{item.category}</p>
      <p className={`mt-2 text-base font-semibold ${toneClass}`}>
        {item.resultLabel}: {formatSignedBrl(item.profit)}
      </p>
      <div className="mt-2 space-y-1 text-xs text-slate-400">
        <p>Compra: {brl(item.purchaseAmount)}</p>
        <p>Venda: {brl(item.saleAmount)}</p>
      </div>
    </div>
  );
};

const ProductChartLabel = ({
  x,
  y,
  width,
  payload,
}: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  payload?: ProductChartDatum;
}) => {
  if (!payload) return null;

  const resolvedX = Number(x ?? 0);
  const resolvedY = Number(y ?? 0);
  const resolvedWidth = Number(width ?? 0);
  const fill = payload.tone === "profit" ? "#22d3ee" : payload.tone === "loss" ? "#fb7185" : "#cbd5e1";

  return (
    <text
      x={resolvedX + resolvedWidth / 2}
      y={Math.max(18, resolvedY - 10)}
      fill={fill}
      fontSize={12}
      fontWeight={700}
      textAnchor="middle"
    >
      {formatSignedBrl(payload.profit)}
    </text>
  );
};

export default function VendasPage() {
  const confirmDialog = useConfirmDialog();
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<ResaleItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState<ResaleFormState>(emptyForm());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [sellTarget, setSellTarget] = useState<ResaleItemRow | null>(null);
  const [sellAmount, setSellAmount] = useState("");
  const [sellDate, setSellDate] = useState(todayIso());
  const [sellError, setSellError] = useState<string | null>(null);
  const [selling, setSelling] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const ensureUserId = async () => {
    if (userId) return userId;

    const sessionRes = await supabase.auth.getSession();
    const fromSession = sessionRes.data.session?.user?.id ?? null;
    if (fromSession) {
      setUserId(fromSession);
      return fromSession;
    }

    const { data, error } = await supabase.auth.getUser();
    if (error) {
      setFeedback(`Nao foi possivel validar sua sessao: ${error.message}`);
      return null;
    }

    const resolved = data.user?.id ?? null;
    setUserId(resolved);
    if (!resolved) {
      setFeedback("Sessao nao carregada. Entre novamente.");
      return null;
    }
    return resolved;
  };

  const loadRows = async (resolvedUserId?: string | null) => {
    try {
      setLoading(true);
      const effectiveUserId = resolvedUserId || (await ensureUserId());
      if (!effectiveUserId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("resale_items")
        .select("*")
        .eq("user_id", effectiveUserId)
        .order("purchase_date", { ascending: false });

      if (error) {
        if (isMissingResaleTableError(error.message)) {
          setFeedback("Tabela resale_items nao encontrada. Rode o supabase.sql atualizado.");
        } else {
          setFeedback(`Falha ao carregar revendas: ${error.message}`);
        }
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((data as ResaleItemRow[]) || []);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      setFeedback(`Falha inesperada ao carregar: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  useEffect(() => {
    void (async () => {
      const resolvedUserId = await ensureUserId();
      await loadRows(resolvedUserId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => sanitizeFreeText(row.category, 60))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const search = normalizeText(searchFilter);

    return rows.filter((row) => {
      const referenceDate = getReferenceDate(row);
      const haystack = normalizeText(`${row.item_name} ${row.category} ${row.description || ""}`);
      const matchesSearch = search ? haystack.includes(search) : true;
      const matchesCategory = categoryFilter === "todas" ? true : row.category === categoryFilter;
      const matchesStart = dateStart ? referenceDate >= dateStart : true;
      const matchesEnd = dateEnd ? referenceDate <= dateEnd : true;
      return matchesSearch && matchesCategory && matchesStart && matchesEnd;
    });
  }, [categoryFilter, dateEnd, dateStart, rows, searchFilter]);

  const filteredInStock = useMemo(
    () =>
      filteredRows
        .filter((row) => !isSoldItem(row))
        .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date)),
    [filteredRows],
  );

  const filteredSold = useMemo(
    () =>
      filteredRows
        .filter((row) => isSoldItem(row))
        .sort((a, b) => (b.sold_at || "").localeCompare(a.sold_at || "")),
    [filteredRows],
  );

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        const purchaseAmount = Math.abs(toNumber(row.purchase_amount));
        const saleAmount = Math.abs(toNumber(row.sale_amount ?? 0));
        acc.invested += purchaseAmount;
        if (isSoldItem(row)) {
          acc.sold += saleAmount;
          acc.profit += saleAmount - purchaseAmount;
        }
        return acc;
      },
      { invested: 0, sold: 0, profit: 0 },
    );
  }, [filteredRows]);

  const productProfitData = useMemo(() => {
    const map = new Map<
      string,
      ProductChartDatum
    >();

    filteredSold.forEach((row) => {
      const key = `${row.category}::${row.item_name}`;
      const purchaseAmount = Math.abs(toNumber(row.purchase_amount));
      const saleAmount = Math.abs(toNumber(row.sale_amount ?? 0));
      const profit = round2(saleAmount - purchaseAmount);
      const current = map.get(key);

      if (current) {
        current.profit = round2(current.profit + profit);
        current.purchaseAmount = round2(current.purchaseAmount + purchaseAmount);
        current.saleAmount = round2(current.saleAmount + saleAmount);
        current.chartValue = Math.abs(current.profit);
        current.resultLabel = current.profit > 0 ? "Lucro" : current.profit < 0 ? "Prejuizo" : "Empate";
        current.tone = getChartTone(current.profit);
        if ((row.sold_at || row.purchase_date) > current.soldAt) {
          current.soldAt = row.sold_at || row.purchase_date;
        }
        return;
      }

      map.set(key, {
        name: row.item_name,
        shortName: truncateChartName(row.item_name),
        category: row.category,
        profit,
        chartValue: Math.abs(profit),
        purchaseAmount,
        saleAmount,
        soldAt: row.sold_at || row.purchase_date,
        resultLabel: profit > 0 ? "Lucro" : profit < 0 ? "Prejuizo" : "Empate",
        tone: getChartTone(profit),
      });
    });

    return Array.from(map.values()).sort((a, b) => b.chartValue - a.chartValue);
  }, [filteredSold]);

  const resetForm = () => {
    setForm(emptyForm());
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    resetForm();
  };

  const clearFilters = () => {
    setSearchFilter("");
    setCategoryFilter("todas");
    setDateStart("");
    setDateEnd("");
  };

  const closeSellModal = () => {
    setSellTarget(null);
    setSellAmount("");
    setSellDate(todayIso());
    setSellError(null);
    setSelling(false);
  };

  const handleCreate = async () => {
    const resolvedUserId = await ensureUserId();
    if (!resolvedUserId) return;

    const itemName = sanitizeFreeText(form.item_name, 120);
    const category = sanitizeFreeText(form.category, 60) || "Compra";
    const description = sanitizeFreeText(form.description, 500);
    const purchaseAmount = Math.abs(toNumber(form.purchase_amount));

    if (!itemName) {
      setFeedback("Informe o nome do produto. Ex: PC Gamer.");
      return;
    }
    if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0) {
      setFeedback("Informe um valor de compra valido maior que zero.");
      return;
    }
    if (!form.purchase_date) {
      setFeedback("Informe a data da compra.");
      return;
    }

    try {
      setSaving(true);
      setFeedback(null);

      const { error } = await supabase.from("resale_items").insert({
        user_id: resolvedUserId,
        category,
        item_name: itemName,
        purchase_amount: round2(purchaseAmount),
        purchase_date: form.purchase_date,
        description: description || null,
      });

      if (error) {
        if (isMissingResaleTableError(error.message)) {
          setFeedback("Tabela resale_items nao encontrada. Rode o supabase.sql atualizado.");
        } else {
          setFeedback(`Nao foi possivel salvar a compra: ${error.message}`);
        }
        setSaving(false);
        return;
      }

      setSaving(false);
      closeCreateModal();
      setFeedback("Compra de revenda adicionada com sucesso.");
      await loadRows(resolvedUserId);
    } catch (error) {
      setSaving(false);
      setFeedback(`Falha inesperada ao salvar: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const openSellModal = (row: ResaleItemRow) => {
    setSellTarget(row);
    setSellAmount("");
    setSellDate(todayIso());
    setSellError(null);
  };

  const handleSellSave = async () => {
    if (!sellTarget) return;

    const resolvedUserId = await ensureUserId();
    if (!resolvedUserId) return;

    const parsedSaleAmount = Math.abs(toNumber(sellAmount));
    if (!Number.isFinite(parsedSaleAmount) || parsedSaleAmount <= 0) {
      setSellError("Informe um valor de venda valido maior que zero.");
      return;
    }
    if (!sellDate) {
      setSellError("Informe a data da venda.");
      return;
    }

    try {
      setSelling(true);
      setSellError(null);
      setFeedback(null);

      const { data, error } = await supabase
        .from("resale_items")
        .update({
          sale_amount: round2(parsedSaleAmount),
          sold_at: sellDate,
        })
        .eq("id", sellTarget.id)
        .eq("user_id", resolvedUserId)
        .select("id")
        .maybeSingle();

      if (error) {
        if (isMissingResaleTableError(error.message)) {
          setSellError("Tabela resale_items nao encontrada. Rode o supabase.sql atualizado.");
        } else {
          setSellError(`Nao foi possivel salvar a venda: ${error.message}`);
        }
        setSelling(false);
        return;
      }

      if (!data) {
        setSellError("Produto nao encontrado para registrar a venda.");
        setSelling(false);
        return;
      }

      const profit = round2(parsedSaleAmount - Math.abs(toNumber(sellTarget.purchase_amount)));
      closeSellModal();
      setFeedback(
        profit >= 0
          ? `Venda registrada. Lucro de ${brl(profit)} em ${sellTarget.item_name}.`
          : `Venda registrada. Prejuizo de ${brl(Math.abs(profit))} em ${sellTarget.item_name}.`,
      );
      await loadRows(resolvedUserId);
    } catch (error) {
      setSelling(false);
      setSellError(`Falha inesperada ao salvar venda: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const handleDelete = async (row: ResaleItemRow) => {
    const confirmed = await confirmDialog({
      title: "Excluir produto?",
      description: `O item "${row.item_name}" sera removido permanentemente da revenda.`,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      tone: "danger",
    });
    if (!confirmed) return;

    const resolvedUserId = await ensureUserId();
    if (!resolvedUserId) return;

    try {
      setBusyId(row.id);
      setFeedback(null);

      const { data, error } = await supabase
        .from("resale_items")
        .delete()
        .eq("id", row.id)
        .eq("user_id", resolvedUserId)
        .select("id")
        .maybeSingle();

      if (error) {
        if (isMissingResaleTableError(error.message)) {
          setFeedback("Tabela resale_items nao encontrada. Rode o supabase.sql atualizado.");
        } else {
          setFeedback(`Nao foi possivel excluir o produto: ${error.message}`);
        }
        setBusyId(null);
        return;
      }

      if (!data) {
        setFeedback("Produto nao encontrado para exclusao.");
        setBusyId(null);
        return;
      }

      setBusyId(null);
      setFeedback("Produto removido da aba de vendas.");
      await loadRows(resolvedUserId);
    } catch (error) {
      setBusyId(null);
      setFeedback(`Falha inesperada ao excluir: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const actions = (
    <button
      type="button"
      className={SECONDARY_BUTTON_CLASS}
      onClick={() => void loadRows()}
      disabled={loading}
    >
      Atualizar
    </button>
  );

  return (
    <AppShell
      title="Vendas"
      subtitle="Compras, revenda, estoque e lucro no mesmo painel"
      actions={actions}
    >
      <div className="space-y-6">
        {isCreateModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-[28px] border border-cyan-500/20 bg-[linear-gradient(180deg,rgba(6,9,18,0.98),rgba(2,6,23,0.98))] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.52)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-white">Adicionar produto</h2>
                  <p className="mt-1 text-sm text-slate-400">Cadastre uma nova compra para revenda.</p>
                </div>
                <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={closeCreateModal}>
                  Fechar
                </button>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Nome
                  </label>
                  <input
                    className={INPUT_CLASS}
                    placeholder="Ex: PC Gamer"
                    value={form.item_name}
                    onChange={(event) => setForm((prev) => ({ ...prev, item_name: event.target.value }))}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Categoria
                  </label>
                  <input
                    className={INPUT_CLASS}
                    placeholder="Ex: PC"
                    value={form.category}
                    onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Valor comprado
                  </label>
                  <input
                    className={INPUT_CLASS}
                    placeholder="Ex: 2000"
                    value={form.purchase_amount}
                    onChange={(event) => setForm((prev) => ({ ...prev, purchase_amount: event.target.value }))}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Data da compra
                  </label>
                  <input
                    type="date"
                    className={INPUT_CLASS}
                    value={form.purchase_date}
                    onChange={(event) => setForm((prev) => ({ ...prev, purchase_date: event.target.value }))}
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Descricao
                </label>
                <textarea
                  className={`${INPUT_CLASS} min-h-[110px] resize-y`}
                  placeholder="Ex: i5, 16GB RAM, GTX 1660"
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={closeCreateModal}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => void handleCreate()}
                  disabled={saving}
                >
                  <Plus className="h-4 w-4" />
                  {saving ? "Salvando..." : "Adicionar"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {sellTarget ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
              <h2 className="mb-1 text-lg font-bold text-white">Valor de venda</h2>
              <p className="mb-4 text-sm text-slate-300">
                {sellTarget.item_name} | Compra: {brl(Math.abs(toNumber(sellTarget.purchase_amount)))}
              </p>

              <div className="space-y-3">
                <div>
                  <input
                    className="w-full rounded-lg border border-slate-600 bg-white px-3 py-2 text-black outline-none transition focus:border-emerald-500"
                    placeholder="Ex: 3000"
                    value={sellAmount}
                    onChange={(event) => setSellAmount(event.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-emerald-500"
                    value={sellDate}
                    onChange={(event) => setSellDate(event.target.value)}
                  />
                </div>
              </div>

              {sellError ? (
                <div className="mt-4 rounded-2xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {sellError}
                </div>
              ) : null}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:opacity-60"
                  onClick={closeSellModal}
                  disabled={selling}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={GREEN_BUTTON_CLASS}
                  onClick={() => void handleSellSave()}
                  disabled={selling}
                >
                  {selling ? "Salvando..." : "Salvar venda"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className={`${SECTION_CLASS} overflow-hidden px-6 py-6`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">
                <ShoppingBag className="h-3.5 w-3.5" />
                Revenda
              </span>
              <h2 className="mt-4 bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 bg-clip-text text-3xl font-black text-transparent sm:text-4xl">
                Vendas Futuristicas
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-slate-300">
                Cadastre produtos, marque como vendido e acompanhe seu lucro em tempo real.
              </p>
            </div>

            <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Adicionar produto
            </button>
          </div>

          {feedback ? (
            <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
              {feedback}
            </div>
          ) : null}
        </section>

        <section className="hidden">
          <h2 className="text-2xl font-bold text-white">💰 Vendas / Revenda</h2>
          <p className="mt-1 text-sm text-slate-300">
            Cadastre produtos, marque como vendido e acompanhe seu lucro em tempo real.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className={`${SECTION_CLASS} border-yellow-500/18 p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Total investido</p>
                <p className="mt-2 text-2xl font-extrabold text-yellow-400">{brl(totals.invested)}</p>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-yellow-400/25 bg-yellow-500/12">
                <CircleDollarSign className="h-5 w-5 text-yellow-300" />
              </span>
            </div>
          </article>

          <article className={`${SECTION_CLASS} border-cyan-500/18 p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Total vendido</p>
                <p className="mt-2 text-2xl font-extrabold text-cyan-400">{brl(totals.sold)}</p>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-400/25 bg-cyan-500/12">
                <TrendingUp className="h-5 w-5 text-cyan-200" />
              </span>
            </div>
          </article>

          <article className={`${SECTION_CLASS} border-emerald-500/18 p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Lucro total</p>
                <p className={`mt-2 text-2xl font-extrabold ${getResultTone(totals.profit)}`}>
                  {formatSignedBrl(totals.profit)}
                </p>
              </div>
              <span
                className={`grid h-12 w-12 place-items-center rounded-2xl border ${
                  totals.profit >= 0
                    ? "border-emerald-400/25 bg-emerald-500/12"
                    : "border-rose-400/25 bg-rose-500/12"
                }`}
              >
                {totals.profit >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-emerald-200" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-rose-200" />
                )}
              </span>
            </div>
          </article>

          <article className={`${SECTION_CLASS} border-violet-500/18 p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Produtos em estoque</p>
                <p className="mt-2 text-2xl font-extrabold text-violet-300">{filteredInStock.length}</p>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-violet-400/20 bg-violet-500/10">
                <Package className="h-5 w-5 text-violet-200" />
              </span>
            </div>
          </article>
        </section>

        <section className="hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/70">Filtros</p>
              <h2 className="mt-1 text-xl font-extrabold text-white">Busca, categoria e periodo</h2>
            </div>
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={clearFilters}>
              Limpar filtros
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              <input
                className={`${INPUT_CLASS} pl-10`}
                placeholder="Buscar produto..."
                value={searchFilter}
                onChange={(event) => setSearchFilter(event.target.value)}
              />
            </div>

            <select
              className={INPUT_CLASS}
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option className="bg-slate-950 text-white" value="todas">Todas as categorias</option>
              {categories.map((category) => (
                <option className="bg-slate-950 text-white" key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <input
              type="date"
              className={INPUT_CLASS}
              value={dateStart}
              onChange={(event) => setDateStart(event.target.value)}
            />

            <input
              type="date"
              className={INPUT_CLASS}
              value={dateEnd}
              onChange={(event) => setDateEnd(event.target.value)}
            />
          </div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={`${SECTION_CLASS} p-5`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/70">Grafico</p>
              <h2 className="mt-1 bg-gradient-to-r from-cyan-300 via-sky-300 to-fuchsia-300 bg-clip-text text-xl font-extrabold text-transparent">
                Resultado por produto
              </h2>
            </div>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-100">
              {productProfitData.length} venda(s) no grafico
            </span>
          </div>

          {productProfitData.length ? (
            <div className="mt-5 rounded-[28px] border border-cyan-500/20 bg-[#05060a] p-4 shadow-[0_24px_70px_rgba(34,211,238,0.08)]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-cyan-300">Resultado por Produto</p>
                  <p className="text-xs text-slate-500">Todas as barras sobem para facilitar a leitura. Prejuizo aparece em vermelho.</p>
                </div>
                <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-fuchsia-200">
                  Revenda
                </span>
              </div>

              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={productProfitData}
                    barCategoryGap={36}
                    margin={{ top: 22, right: 12, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="salesProfitGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00f5ff" />
                        <stop offset="100%" stopColor="#7c3aed" />
                      </linearGradient>
                      <linearGradient id="salesLossGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fb7185" />
                        <stop offset="100%" stopColor="#ef4444" />
                      </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.6)" vertical={false} />
                    <XAxis
                      dataKey="shortName"
                      stroke="#ffffff"
                      tick={{ fill: "#ffffff", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickMargin={10}
                    />
                    <YAxis
                      stroke="#ffffff"
                      tick={{ fill: "#ffffff", fontSize: 12 }}
                      tickFormatter={(value) => shortMoney(Number(value))}
                      axisLine={false}
                      tickLine={false}
                      width={72}
                      domain={[0, (dataMax: number) => Math.max(100, Math.ceil(dataMax * 1.15))]}
                    />
                    <Tooltip cursor={false} content={<ProductChartTooltip />} />
                    <Bar dataKey="chartValue" radius={[8, 8, 0, 0]} barSize={42} minPointSize={8}>
                      {productProfitData.map((item) => (
                        <Cell key={`chart-cell-${item.category}-${item.name}`} fill={getChartFill(item.tone)} />
                      ))}
                      <LabelList dataKey="chartValue" content={ProductChartLabel} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {productProfitData.map((item) => {
                  const resultClass =
                    item.profit > 0 ? "text-green-400" : item.profit < 0 ? "text-rose-400" : "text-slate-300";

                  return (
                    <motion.div
                      key={`card-${item.category}-${item.name}`}
                      whileHover={{ scale: 1.02 }}
                      className="rounded-2xl border border-fuchsia-500/20 bg-zinc-900/90 shadow-[0_18px_32px_rgba(0,0,0,0.24)]"
                    >
                      <div className="p-4">
                        <h3 className="text-lg font-bold text-white">{item.name}</h3>
                        <p className="text-white">{item.category}</p>

                        <div className="mt-3 space-y-1 text-sm text-white">
                          <p className="text-yellow-400">Compra: {brl(item.purchaseAmount)}</p>
                          <p className="text-cyan-400">Venda: {brl(item.saleAmount)}</p>
                          <p className={`font-semibold ${resultClass}`}>
                            {item.resultLabel}: {formatSignedBrl(item.profit)}
                          </p>
                          <p className="text-xs text-white/60">{formatDateLabel(item.soldAt)}</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-white/8 bg-black/15 px-4 py-5 text-sm text-slate-300">
              Nenhum produto encontrado para montar o grafico com o filtro atual.
            </div>
          )}
        </motion.section>

        <section className="hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/70">Nova compra</p>
              <h2 className="mt-1 text-xl font-extrabold text-white">Cadastrar item para revenda</h2>
            </div>
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASS}
              onClick={() => void handleCreate()}
              disabled={saving}
            >
              <Plus className="h-4 w-4" />
              {saving ? "Salvando..." : "Adicionar compra"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Categoria
              </label>
              <input
                className={INPUT_CLASS}
                placeholder="Ex: PC"
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Nome do produto
              </label>
              <input
                className={INPUT_CLASS}
                placeholder="Ex: PC Gamer"
                value={form.item_name}
                onChange={(event) => setForm((prev) => ({ ...prev, item_name: event.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Valor comprado
              </label>
              <input
                className={INPUT_CLASS}
                placeholder="Ex: 2000"
                value={form.purchase_amount}
                onChange={(event) => setForm((prev) => ({ ...prev, purchase_amount: event.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Data da compra
              </label>
              <input
                type="date"
                className={INPUT_CLASS}
                value={form.purchase_date}
                onChange={(event) => setForm((prev) => ({ ...prev, purchase_date: event.target.value }))}
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Descricao
            </label>
            <textarea
              className={`${INPUT_CLASS} min-h-24 resize-y`}
              placeholder="Ex: PC gamer i5, 16GB RAM, GTX 1660"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </div>
        </section>
        <section className={`${SECTION_CLASS} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Produtos</p>
              <h2 className="mt-1 text-xl font-extrabold text-white">Compras e revendas</h2>
            </div>
            <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-200">
              {filteredRows.length} item(ns)
            </span>
          </div>

          {loading ? (
            <div className="mt-4 rounded-3xl border border-white/8 bg-black/15 px-4 py-5 text-sm text-slate-300">
              Carregando produtos...
            </div>
          ) : filteredRows.length ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredRows.map((row) => {
                const sold = isSoldItem(row);
                const purchaseAmount = Math.abs(toNumber(row.purchase_amount));
                const saleAmount = Math.abs(toNumber(row.sale_amount ?? 0));
                const profit = round2(saleAmount - purchaseAmount);

                return (
                  <motion.article
                    key={row.id}
                    whileHover={{ scale: 1.02 }}
                    className={`rounded-[26px] border p-5 shadow-[0_18px_44px_rgba(0,0,0,0.28)] ${
                      sold
                        ? "border-emerald-500/22 bg-[linear-gradient(180deg,rgba(7,24,20,0.98),rgba(3,13,12,0.98))]"
                        : "border-zinc-800 bg-[linear-gradient(180deg,rgba(17,24,39,0.98),rgba(8,12,20,0.98))]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-bold text-white">{row.item_name}</h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                              sold ? "bg-emerald-500/20 text-emerald-200" : "bg-zinc-700 text-zinc-100"
                            }`}
                          >
                            {sold ? "Vendido" : "Em estoque"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-300">{row.category}</p>
                      </div>

                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/18 disabled:opacity-60"
                        onClick={() => void handleDelete(row)}
                        disabled={busyId === row.id}
                        aria-label={`Excluir ${row.item_name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-white">
                      <p className="text-yellow-400">Compra: {brl(purchaseAmount)}</p>
                      {sold ? <p className="text-cyan-400">Venda: {brl(saleAmount)}</p> : null}
                      {sold ? (
                        <p className={`font-semibold ${getResultTone(profit)}`}>
                          Lucro: {formatSignedBrl(profit)}
                        </p>
                      ) : null}
                      <p className="text-slate-300">{row.description || "Sem descricao cadastrada."}</p>
                      <p className="text-xs text-slate-500">
                        {sold ? formatDateLabel(row.sold_at) : formatDateLabel(row.purchase_date)}
                      </p>
                    </div>

                    {!sold ? (
                      <button
                        type="button"
                        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                        onClick={() => openSellModal(row)}
                      >
                        Marcar como vendido
                      </button>
                    ) : null}
                  </motion.article>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-white/8 bg-black/15 px-4 py-5 text-sm text-slate-300">
              Nenhum produto encontrado com o filtro atual.
            </div>
          )}
        </section>
        <section className={`${SECTION_CLASS} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-emerald-200/70">Historico</p>
              <h2 className="mt-1 text-xl font-extrabold text-white">Vendas realizadas</h2>
            </div>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
              {filteredSold.length} venda(s) registradas
            </span>
          </div>

          {loading ? (
            <p className="mt-4 text-sm text-slate-300">Carregando historico...</p>
          ) : filteredSold.length ? (
            <div className="mt-4 space-y-3">
              {filteredSold.map((row) => {
                const purchaseAmount = Math.abs(toNumber(row.purchase_amount));
                const saleAmount = Math.abs(toNumber(row.sale_amount ?? 0));
                const profit = round2(saleAmount - purchaseAmount);
                const resultLabel = profit > 0 ? "Lucro" : profit < 0 ? "Prejuizo" : "Empate";

                return (
                  <article
                    key={row.id}
                    className={SOLD_CARD_CLASS}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-bold text-white">{row.item_name}</h3>
                            <span className="rounded-full bg-emerald-600/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                              Vendido
                            </span>
                            <span className="rounded-full bg-emerald-950/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                              {row.category}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-emerald-50">{row.description || "Sem descricao cadastrada."}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="rounded-lg bg-emerald-950/80 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:opacity-60"
                        onClick={() => void handleDelete(row)}
                        disabled={busyId === row.id}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-xl bg-emerald-950/45 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-emerald-200/70">Compra</p>
                        <p className="mt-2 text-lg font-extrabold text-white">{brl(purchaseAmount)}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-950/45 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-emerald-200/70">Venda</p>
                        <p className="mt-2 text-lg font-extrabold text-cyan-300">{brl(saleAmount)}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-950/45 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-emerald-200/70">{resultLabel}</p>
                        <p className={`mt-2 text-lg font-extrabold ${getResultTone(profit)}`}>
                          {formatSignedBrl(profit)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-emerald-950/45 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-emerald-200/70">Data compra</p>
                        <p className="mt-2 text-sm font-semibold text-emerald-50">{formatDateLabel(row.purchase_date)}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-950/45 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-emerald-200/70">Data venda</p>
                        <p className="mt-2 text-sm font-semibold text-emerald-50">{formatDateLabel(row.sold_at)}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-emerald-400/15 bg-emerald-500/6 px-4 py-5 text-sm text-slate-300">
              Nenhuma venda registrada ainda. Quando voce clicar em &quot;Marcar como vendido&quot;, o historico aparece aqui.
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
