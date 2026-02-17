"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Filter,
  PlusCircle,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { CategoryIcon } from "@/components/CategoryIcon";
import { FintechGlassCard } from "@/components/fintech/FintechGlassCard";
import type { Transaction } from "@/lib/finance";
import { normalizeCategoryKey } from "@/lib/categoryVisuals";
import { brl, toNumber } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";
import { useCategoryMetadata } from "@/lib/useCategoryMetadata";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const currentMonth = () => new Date().toISOString().slice(0, 7);

const formatDateLabel = (dateString: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(date);
};

const formatLongDateLabel = (dateString: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const formatMonthLabel = (monthKey: string) => {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!year || !month) return monthKey;
  const date = new Date(year, Math.max(0, month - 1), 1);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
};

const isIncomeType = (type: Transaction["type"]) => type === "income" || type === "adjustment";
const isExpenseType = (type: Transaction["type"]) => type === "expense" || type === "card_payment";

const isPixTransaction = (tx: Transaction) => {
  if (tx.transaction_type) return tx.transaction_type === "pix";
  const tags = tx.tags ?? [];
  if (tags.some((tag) => tag.trim().toLowerCase() === "pix")) return true;
  return /^pix\b/i.test(tx.description ?? "");
};

type GroupedTransactionsSection = {
  key: string;
  label: string;
  order: number;
  anchor: number;
  rows: Transaction[];
};

const INPUT_CLASS =
  "w-full rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition duration-200 focus:border-cyan-300/60 focus:bg-white/[0.06] focus:ring-2 focus:ring-cyan-500/20";

export default function GastosPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState(currentMonth());
  const [searchFilter, setSearchFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [newExpenseName, setNewExpenseName] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [addingExpense, setAddingExpense] = useState(false);
  const categoryLookup = useCategoryMetadata(transactions.map((tx) => tx.category));

  const loadData = async () => {
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(1000);

    if (error) {
      setMessage(error.message || "Falha ao carregar gastos.");
      setLoading(false);
      return;
    }

    setTransactions((data as Transaction[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const addExpense = async () => {
    const description = newExpenseName.trim();
    const amount = Math.abs(toNumber(newExpenseAmount));

    if (!description) {
      setMessage("Informe o nome do gasto.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Informe um valor valido maior que zero.");
      return;
    }

    const userRes = await supabase.auth.getUser();
    const userId = userRes.data.user?.id;
    if (!userId) {
      setMessage("Sessao expirada. Faca login novamente.");
      return;
    }

    setAddingExpense(true);
    setMessage(null);

    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      type: "expense",
      occurred_at: today,
      description,
      category: "Outros",
      amount,
      account_id: null,
      to_account_id: null,
      card_id: null,
      tags: ["manual"],
      note: null,
    });

    if (error) {
      setMessage(error.message || "Falha ao adicionar gasto.");
      setAddingExpense(false);
      return;
    }

    setNewExpenseName("");
    setNewExpenseAmount("");
    await loadData();
    setMessage("Gasto adicionado com sucesso.");
    setAddingExpense(false);
  };

  const monthScopedTransactions = useMemo(
    () =>
      transactions
        .filter((tx) => tx.type !== "transfer")
        .filter((tx) => !isPixTransaction(tx))
        .filter((tx) => (monthFilter ? tx.occurred_at.startsWith(monthFilter) : true)),
    [transactions, monthFilter],
  );

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    monthScopedTransactions
      .filter((tx) => isExpenseType(tx.type))
      .forEach((tx) => {
        const label = (tx.category || "Sem categoria").trim() || "Sem categoria";
        map.set(normalizeCategoryKey(label), label);
      });
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [monthScopedTransactions]);

  const filtered = useMemo(() => {
    const search = searchFilter.trim().toLowerCase();
    const normalizedCategory = normalizeCategoryKey(categoryFilter);

    return [...monthScopedTransactions]
      .filter((tx) => {
        if (normalizedCategory === "all") return true;
        return normalizeCategoryKey(tx.category || "Sem categoria") === normalizedCategory;
      })
      .filter((tx) => {
        if (!search) return true;
        const haystack = `${tx.description} ${tx.category ?? ""} ${tx.note ?? ""}`.toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  }, [monthScopedTransactions, searchFilter, categoryFilter]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, tx) => {
          const amount = Math.abs(toNumber(tx.amount));
          if (isIncomeType(tx.type)) acc.income += amount;
          if (isExpenseType(tx.type)) acc.expense += amount;
          return acc;
        },
        { income: 0, expense: 0 },
      ),
    [filtered],
  );

  const monthlyCategoryProgress = useMemo(() => {
    const map = new Map<string, number>();
    monthScopedTransactions
      .filter((tx) => isExpenseType(tx.type))
      .forEach((tx) => {
        const category = (tx.category || "Sem categoria").trim() || "Sem categoria";
        const amount = Math.abs(toNumber(tx.amount));
        if (amount <= 0) return;
        map.set(category, (map.get(category) || 0) + amount);
      });

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [monthScopedTransactions]);

  const monthlyCategoryTotal = useMemo(
    () => monthlyCategoryProgress.reduce((sum, item) => sum + item.value, 0),
    [monthlyCategoryProgress],
  );

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, GroupedTransactionsSection>();
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(now.getDate() - 1);
    const yesterdayKey = yesterdayDate.toISOString().slice(0, 10);
    const thisMonthKey = now.toISOString().slice(0, 7);

    filtered.forEach((tx) => {
      const dateKey = tx.occurred_at.slice(0, 10);
      const monthKey = tx.occurred_at.slice(0, 7);
      let key = monthKey;
      let label = formatMonthLabel(monthKey);
      let order = 30;

      if (dateKey === todayKey) {
        key = "today";
        label = "Hoje";
        order = 0;
      } else if (dateKey === yesterdayKey) {
        key = "yesterday";
        label = "Ontem";
        order = 1;
      } else if (monthKey === thisMonthKey) {
        key = "this-month";
        label = "Este mes";
        order = 2;
      }

      const anchor = new Date(tx.occurred_at).getTime() || 0;
      if (!groups.has(key)) {
        groups.set(key, { key, label, order, anchor, rows: [tx] });
      } else {
        const current = groups.get(key);
        if (!current) return;
        current.rows.push(tx);
        current.anchor = Math.max(current.anchor, anchor);
      }
    });

    return Array.from(groups.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return b.anchor - a.anchor;
    });
  }, [filtered]);

  const actions = (
    <div className="flex items-center gap-2">
      <input
        type="month"
        className={`${INPUT_CLASS} w-auto min-w-[150px]`}
        value={monthFilter}
        onChange={(event) => setMonthFilter(event.target.value)}
      />
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-900/60"
        onClick={() => setMonthFilter("")}
      >
        Todos
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-900/60"
        onClick={() => void loadData()}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Atualizar
      </button>
    </div>
  );

  return (
    <AppShell
      title="Gastos"
      subtitle="Controle visual de lancamentos com leitura rapida e premium"
      actions={actions}
      contentClassName="gastos-premium-bg"
    >
      <div className={`${inter.className} space-y-5`}>
        {message ? (
          <div className="rounded-2xl border border-cyan-300/25 bg-cyan-900/20 px-4 py-3 text-sm text-cyan-100">
            {message}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <FintechGlassCard className="p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/65">Receitas</p>
            <p className="mt-2 inline-flex items-center gap-2 text-2xl font-semibold text-emerald-300">
              <TrendingUp className="h-5 w-5" />
              +{brl(totals.income)}
            </p>
          </FintechGlassCard>
          <FintechGlassCard className="p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/65">Gastos</p>
            <p className="mt-2 inline-flex items-center gap-2 text-2xl font-semibold text-rose-300">
              <TrendingDown className="h-5 w-5" />
              -{brl(totals.expense)}
            </p>
          </FintechGlassCard>
          <FintechGlassCard className="p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/65">Saldo</p>
            <p
              className={`mt-2 inline-flex items-center gap-2 text-2xl font-semibold ${
                totals.income - totals.expense >= 0 ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              <Wallet className="h-5 w-5" />
              {brl(totals.income - totals.expense)}
            </p>
          </FintechGlassCard>
        </section>

        <FintechGlassCard className="p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_150px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className={`${INPUT_CLASS} pl-9`}
                placeholder="Buscar por nome, categoria ou observacao"
                value={searchFilter}
                onChange={(event) => setSearchFilter(event.target.value)}
              />
            </label>

            <label className="relative block">
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                className={`${INPUT_CLASS} pl-9`}
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">Todas categorias</option>
                {categoryOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-900/60"
              onClick={() => {
                setSearchFilter("");
                setCategoryFilter("all");
              }}
            >
              Limpar filtros
            </button>
          </div>
        </FintechGlassCard>

        <FintechGlassCard className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">Progresso mensal por categoria</h2>
            <span className="text-xs text-slate-400">{monthlyCategoryProgress.length} categorias</span>
          </div>

          {!monthlyCategoryProgress.length ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-4 text-sm text-slate-300">
              Sem categorias no periodo selecionado.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {monthlyCategoryProgress.slice(0, 8).map((item) => {
                const percentage = monthlyCategoryTotal > 0 ? (item.value / monthlyCategoryTotal) * 100 : 0;
                const metadata = categoryLookup.get(normalizeCategoryKey(item.name));
                const iconHint = `${item.name} categoria`;
                return (
                  <article key={item.name} className="rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <CategoryIcon
                          categoryName={iconHint}
                          iconName={metadata?.icon_name}
                          iconColor={metadata?.icon_color}
                          size={17}
                          circleSize={36}
                        />
                        <p className="truncate text-sm font-medium text-slate-100">{item.name}</p>
                      </div>
                      <p className="text-sm font-semibold text-cyan-100">{brl(item.value)}</p>
                    </div>
                    <div className="mt-2.5 h-2 fintech-progress-track">
                      <div className="fintech-progress-fill" style={{ width: `${Math.max(3, percentage)}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{percentage.toFixed(1).replace(".", ",")}% do mes</p>
                  </article>
                );
              })}
            </div>
          )}
        </FintechGlassCard>

        <FintechGlassCard className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">Adicionar gasto</h2>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300/35 bg-rose-500/12 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/22 disabled:opacity-60"
              onClick={() => void addExpense()}
              disabled={addingExpense}
            >
              <PlusCircle className="h-4 w-4" />
              {addingExpense ? "Salvando..." : "Salvar gasto"}
            </button>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_180px]">
            <input
              className={INPUT_CLASS}
              placeholder="Nome do gasto (ex: Supermercado)"
              value={newExpenseName}
              onChange={(event) => setNewExpenseName(event.target.value)}
            />
            <input
              className={INPUT_CLASS}
              placeholder="Valor (ex: 120,50)"
              value={newExpenseAmount}
              onChange={(event) => setNewExpenseAmount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (!addingExpense) void addExpense();
                }
              }}
            />
          </div>
        </FintechGlassCard>

        <FintechGlassCard className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">Lancamentos</h2>
            <span className="text-xs text-slate-400">{filtered.length} itens</span>
          </div>

          {loading ? (
            <div className="text-sm text-slate-300">Carregando...</div>
          ) : !groupedTransactions.length ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-4 text-sm text-slate-300">
              Nenhum lancamento encontrado para o filtro atual.
            </div>
          ) : (
            <div className="space-y-4">
              {groupedTransactions.map((group) => (
                <section key={group.key}>
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-cyan-200/70">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {group.label}
                  </div>
                  <div className="space-y-2">
                    {group.rows.map((tx) => {
                      const income = isIncomeType(tx.type);
                      const expense = isExpenseType(tx.type);
                      const amount = Math.abs(toNumber(tx.amount));
                      const categoryLabel = (tx.category || "Sem categoria").trim() || "Sem categoria";
                      const categoryMetadata = categoryLookup.get(normalizeCategoryKey(categoryLabel));
                      const iconHint = `${tx.description || ""} ${categoryLabel}`;
                      const amountClass = income
                        ? "text-emerald-300"
                        : expense
                          ? "text-rose-300"
                          : "text-slate-300";

                      return (
                        <article key={tx.id} className="fintech-transaction-row px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <CategoryIcon
                                categoryName={iconHint}
                                iconName={categoryMetadata?.icon_name}
                                iconColor={categoryMetadata?.icon_color}
                                size={20}
                                circleSize={44}
                              />

                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-100">{tx.description}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5">
                                    {categoryLabel}
                                  </span>
                                  <span>{formatDateLabel(tx.occurred_at)}</span>
                                  <span className="text-slate-500">({formatLongDateLabel(tx.occurred_at)})</span>
                                </div>
                              </div>
                            </div>

                            <p className={`text-lg font-semibold ${amountClass}`}>
                              {income ? "+" : "-"}
                              {brl(amount)}
                            </p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </FintechGlassCard>
      </div>
    </AppShell>
  );
}

