"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarDays,
  CircleDollarSign,
  Monitor,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Smartphone,
  Tag,
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

const SECTION_CLASS =
  "rounded-3xl border border-emerald-400/18 bg-[linear-gradient(160deg,rgba(10,28,33,0.92),rgba(9,12,24,0.96))] shadow-[0_18px_46px_rgba(0,0,0,0.34)] backdrop-blur-xl";

const INPUT_CLASS =
  "w-full rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/20";

const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 via-cyan-500 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_14px_32px_rgba(6,182,212,0.25)] transition hover:brightness-110 disabled:opacity-60";

const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900/50 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/75 disabled:opacity-60";

const todayIso = () => new Date().toISOString().slice(0, 10);
const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const emptyForm = (): ResaleFormState => ({
  category: "",
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

const formatMonthLabel = (value: string) => {
  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
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

const getItemIcon = (row: Pick<ResaleItemRow, "category" | "item_name" | "description">) => {
  const text = normalizeText(`${row.category} ${row.item_name} ${row.description || ""}`);
  if (text.includes("pc") || text.includes("gamer") || text.includes("notebook") || text.includes("monitor")) {
    return Monitor;
  }
  if (text.includes("iphone") || text.includes("celular") || text.includes("smartphone")) {
    return Smartphone;
  }
  return ShoppingBag;
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
    const search = searchFilter.trim().toLowerCase();

    return rows.filter((row) => {
      const referenceDate = getReferenceDate(row);
      const haystack = `${row.item_name} ${row.category} ${row.description || ""}`.toLowerCase();
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

  const monthlyProfitData = useMemo(() => {
    const map = new Map<string, { monthKey: string; monthLabel: string; profit: number }>();

    filteredSold.forEach((row) => {
      const soldAt = row.sold_at || row.purchase_date;
      const monthKey = soldAt.slice(0, 7);
      const profit = round2(Math.abs(toNumber(row.sale_amount ?? 0)) - Math.abs(toNumber(row.purchase_amount)));
      const current = map.get(monthKey);

      if (current) {
        current.profit = round2(current.profit + profit);
      } else {
        map.set(monthKey, {
          monthKey,
          monthLabel: formatMonthLabel(monthKey),
          profit,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [filteredSold]);

  const resetForm = () => {
    setForm(emptyForm());
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
      resetForm();
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
      <div className="space-y-5">
        {sellTarget ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm">
            <div className={`${SECTION_CLASS} w-full max-w-md p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-emerald-200/70">Marcar como vendido</p>
                  <h2 className="mt-1 text-xl font-extrabold text-white">{sellTarget.item_name}</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    Comprado por {brl(Math.abs(toNumber(sellTarget.purchase_amount)))} em {formatDateLabel(sellTarget.purchase_date)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeSellModal}
                  className="rounded-xl border border-white/10 bg-slate-900/45 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-900/70"
                  disabled={selling}
                >
                  Fechar
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Valor vendido
                  </label>
                  <input
                    className={INPUT_CLASS}
                    placeholder="Ex: 3000"
                    value={sellAmount}
                    onChange={(event) => setSellAmount(event.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Data da venda
                  </label>
                  <input
                    type="date"
                    className={INPUT_CLASS}
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

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className={SECONDARY_BUTTON_CLASS}
                  onClick={closeSellModal}
                  disabled={selling}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => void handleSellSave()}
                  disabled={selling}
                >
                  {selling ? "Salvando..." : "Salvar venda"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {feedback ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-slate-100">
            {feedback}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className={`${SECTION_CLASS} p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Total investido</p>
                <p className="mt-2 text-2xl font-extrabold text-white">{brl(totals.invested)}</p>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-400/25 bg-cyan-500/12">
                <CircleDollarSign className="h-5 w-5 text-cyan-200" />
              </span>
            </div>
          </article>

          <article className={`${SECTION_CLASS} p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Total vendido</p>
                <p className="mt-2 text-2xl font-extrabold text-emerald-300">{brl(totals.sold)}</p>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald-400/25 bg-emerald-500/12">
                <TrendingUp className="h-5 w-5 text-emerald-200" />
              </span>
            </div>
          </article>

          <article className={`${SECTION_CLASS} p-4`}>
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

          <article className={`${SECTION_CLASS} p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Produtos em estoque</p>
                <p className="mt-2 text-2xl font-extrabold text-slate-100">{filteredInStock.length}</p>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-slate-400/20 bg-slate-500/10">
                <Package className="h-5 w-5 text-slate-200" />
              </span>
            </div>
          </article>
        </section>

        <section className={`${SECTION_CLASS} p-5`}>
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
              <h2 className="mt-1 text-xl font-extrabold text-white">Lucro por mes</h2>
            </div>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-100">
              {filteredSold.length} venda(s) no filtro
            </span>
          </div>

          {monthlyProfitData.length ? (
            <div className="mt-5 h-[320px] rounded-3xl border border-white/8 bg-black/15 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyProfitData} barCategoryGap={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
                  <XAxis
                    dataKey="monthLabel"
                    stroke="#94a3b8"
                    tick={{ fill: "#cbd5e1", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fill: "#cbd5e1", fontSize: 12 }}
                    tickFormatter={(value) => shortMoney(Number(value))}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(148,163,184,0.05)" }}
                    formatter={(value) => [brl(Number(value ?? 0)), "Lucro"]}
                    contentStyle={{
                      background: "rgba(2, 6, 23, 0.95)",
                      border: "1px solid rgba(34,197,94,0.25)",
                      borderRadius: "16px",
                      color: "#fff",
                    }}
                    labelStyle={{ color: "#e2e8f0" }}
                  />
                  <Bar dataKey="profit" radius={[12, 12, 0, 0]} barSize={36}>
                    {monthlyProfitData.map((entry) => (
                      <Cell
                        key={entry.monthKey}
                        fill={entry.profit >= 0 ? "rgba(16,185,129,0.95)" : "rgba(244,63,94,0.95)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-white/8 bg-black/15 px-4 py-5 text-sm text-slate-300">
              Ainda nao existe lucro suficiente para montar o grafico com o filtro atual.
            </div>
          )}
        </motion.section>

        <section className={`${SECTION_CLASS} p-5`}>
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
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Estoque</p>
              <h2 className="mt-1 text-xl font-extrabold text-white">Produtos comprados</h2>
            </div>
            <span className="rounded-full border border-slate-400/20 bg-slate-500/10 px-3 py-1 text-xs font-semibold text-slate-300">
              {filteredInStock.length} item(ns) em estoque
            </span>
          </div>

          {loading ? (
            <p className="mt-4 text-sm text-slate-300">Carregando produtos...</p>
          ) : filteredInStock.length ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {filteredInStock.map((row) => {
                const Icon = getItemIcon(row);

                return (
                  <article
                    key={row.id}
                    className="rounded-3xl border border-slate-500/20 bg-[linear-gradient(160deg,rgba(54,65,83,0.25),rgba(15,23,42,0.5))] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-slate-400/20 bg-slate-500/10">
                          <Icon className="h-5 w-5 text-slate-100" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-bold text-white">{row.item_name}</h3>
                            <span className="rounded-full border border-slate-400/20 bg-slate-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                              Em estoque
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-black/15 px-2.5 py-1">
                              <Tag className="h-3.5 w-3.5" />
                              {row.category}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-black/15 px-2.5 py-1">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {formatDateLabel(row.purchase_date)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={SECONDARY_BUTTON_CLASS}
                        onClick={() => void handleDelete(row)}
                        disabled={busyId === row.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Comprado</p>
                        <p className="mt-2 text-xl font-extrabold text-slate-100">{brl(Math.abs(toNumber(row.purchase_amount)))}</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Descricao</p>
                        <p className="mt-2 text-sm text-slate-300">{row.description || "Sem descricao cadastrada."}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        className={PRIMARY_BUTTON_CLASS}
                        onClick={() => openSellModal(row)}
                      >
                        Marcar como vendido
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-slate-400/15 bg-slate-900/35 px-4 py-5 text-sm text-slate-300">
              Nenhum produto em estoque encontrado no filtro atual.
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
                const Icon = getItemIcon(row);
                const purchaseAmount = Math.abs(toNumber(row.purchase_amount));
                const saleAmount = Math.abs(toNumber(row.sale_amount ?? 0));
                const profit = round2(saleAmount - purchaseAmount);
                const resultLabel = profit > 0 ? "Lucro" : profit < 0 ? "Prejuizo" : "Empate";

                return (
                  <article
                    key={row.id}
                    className="rounded-3xl border border-emerald-400/20 bg-[linear-gradient(160deg,rgba(16,76,56,0.18),rgba(9,18,24,0.72))] p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10">
                          <Icon className="h-5 w-5 text-emerald-100" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-bold text-white">{row.item_name}</h3>
                            <span className="rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                              Vendido
                            </span>
                            <span className="rounded-full border border-cyan-400/25 bg-cyan-500/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
                              {row.category}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-300">{row.description || "Sem descricao cadastrada."}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={SECONDARY_BUTTON_CLASS}
                        onClick={() => void handleDelete(row)}
                        disabled={busyId === row.id}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Comprado</p>
                        <p className="mt-2 text-lg font-extrabold text-slate-100">{brl(purchaseAmount)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Vendido</p>
                        <p className="mt-2 text-lg font-extrabold text-emerald-300">{brl(saleAmount)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{resultLabel}</p>
                        <p className={`mt-2 text-lg font-extrabold ${getResultTone(profit)}`}>
                          {formatSignedBrl(profit)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Data compra</p>
                        <p className="mt-2 text-sm font-semibold text-slate-200">{formatDateLabel(row.purchase_date)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Data venda</p>
                        <p className="mt-2 text-sm font-semibold text-slate-200">{formatDateLabel(row.sold_at)}</p>
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
