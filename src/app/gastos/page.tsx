"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CategoryIcon } from "@/components/CategoryIcon";
import type { Transaction } from "@/lib/finance";
import { getCategoryFallbackVisual, normalizeCategoryKey } from "@/lib/categoryVisuals";
import { getCategoryImageIconPath } from "@/lib/customMedia";
import { brl, toNumber } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";
import { useCategoryMetadata } from "@/lib/useCategoryMetadata";

const currentMonth = () => new Date().toISOString().slice(0, 7);

const formatDateLabel = (dateString: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
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

const normalizeText = (value?: string | null) => normalizeCategoryKey(value);

const getTransactionImageIcon = (tx: Transaction) => {
  const categoryLabel = (tx.category || "Sem categoria").trim() || "Sem categoria";
  const context = `${tx.description || ""} ${categoryLabel}`;
  const normalized = normalizeText(context);

  if (normalized.includes("netflix") || normalized.includes("netlix") || normalized.includes("netflx")) {
    return "/icons/Netflix.png";
  }
  if (normalized.includes("hbo") || normalized.includes("hbomax") || normalized.includes("hbo max") || normalized.includes("htbo")) {
    return "/icons/hbo-max.png";
  }
  if (normalized.includes("mercadopago") || normalized.includes("mercado pago") || normalized.includes("mercadolivre") || normalized.includes("mercado livre")) {
    return "/icons/Mercado-Pago.png";
  }
  if (normalized.includes("spotify")) return "/icons/spotify.png";
  if (normalized.includes("amazon") || normalized.includes("prime")) return "/icons/Prime-video.png";
  if (normalized.includes("disney")) return "/icons/disney.png";

  const guessed = getCategoryFallbackVisual(context);
  const guessedImage = getCategoryImageIconPath(guessed.iconName);
  return guessedImage || "/icons/Prime-video.png";
};

export default function GastosPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState(currentMonth());
  const [searchFilter, setSearchFilter] = useState("");
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
    loadData();
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

  const filtered = useMemo(() => {
    const search = searchFilter.trim().toLowerCase();

    return transactions
      .filter((tx) => tx.type !== "transfer")
      .filter((tx) => !isPixTransaction(tx))
      .filter((tx) => (monthFilter ? tx.occurred_at.startsWith(monthFilter) : true))
      .filter((tx) => {
        if (!search) return true;
        const haystack = `${tx.description} ${tx.category ?? ""} ${tx.note ?? ""}`.toLowerCase();
        return haystack.includes(search);
      });
  }, [transactions, monthFilter, searchFilter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, tx) => {
        const amount = Math.abs(toNumber(tx.amount));
        if (isIncomeType(tx.type)) acc.income += amount;
        if (isExpenseType(tx.type)) acc.expense += amount;
        return acc;
      },
      { income: 0, expense: 0 },
    );
  }, [filtered]);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    filtered
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
  }, [filtered]);

  const actions = (
    <div className="flex items-center gap-2">
      <input
        type="month"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
        value={monthFilter}
        onChange={(event) => setMonthFilter(event.target.value)}
      />
      <button
        type="button"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/55"
        onClick={() => setMonthFilter("")}
      >
        Todos
      </button>
      <button
        type="button"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/55"
        onClick={loadData}
      >
        Atualizar
      </button>
    </div>
  );

  return (
    <AppShell title="Gastos" subtitle="Lista de lancamentos salvos pela IA e manualmente" actions={actions}>
      <div className="space-y-4">
        {message ? (
          <div className="rounded-xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
            {message}
          </div>
        ) : null}

        <section className="glass-panel p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
              <p className="text-xs text-slate-400">Depositos</p>
              <p className="text-xl font-extrabold text-emerald-300">+{brl(totals.income)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
              <p className="text-xs text-slate-400">Gastos</p>
              <p className="text-xl font-extrabold text-rose-300">-{brl(totals.expense)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
              <p className="text-xs text-slate-400">Resultado</p>
              <p
                className={`text-xl font-extrabold ${
                  totals.income - totals.expense >= 0 ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {brl(totals.income - totals.expense)}
              </p>
            </div>
          </div>
        </section>

        <section className="glass-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-100">Adicionar gasto</h2>
            <button
              type="button"
              className="rounded-xl border border-rose-300/30 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/30 disabled:opacity-60"
              onClick={addExpense}
              disabled={addingExpense}
            >
              {addingExpense ? "Adicionando..." : "Adicionar gasto"}
            </button>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_180px]">
            <input
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
              placeholder="Nome do gasto (ex: Mercado)"
              value={newExpenseName}
              onChange={(event) => setNewExpenseName(event.target.value)}
            />
            <input
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
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
        </section>

        <section className="glass-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-100">Categorias</h2>
            <span className="text-xs text-slate-400">{categoryTotals.length} categorias</span>
          </div>

          {categoryTotals.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {categoryTotals.slice(0, 12).map((item) => {
                const metadata = categoryLookup.get(normalizeCategoryKey(item.name));
                return (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <CategoryIcon
                        categoryName={item.name}
                        iconName={metadata?.icon_name}
                        iconColor={metadata?.icon_color}
                        size={16}
                        circleSize={34}
                      />
                      <p className="truncate text-sm text-slate-100">{item.name}</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-300">{brl(item.value)}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/35 px-4 py-4 text-sm text-slate-300">
              Nenhuma categoria de gasto encontrada no filtro atual.
            </div>
          )}
        </section>

        <section className="glass-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-100">Ultimos lancamentos</h2>
            <span className="text-xs text-slate-400">{filtered.length} itens</span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              className="w-full rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
              placeholder="Busca rapida por descricao, categoria ou observacao"
              value={searchFilter}
              onChange={(event) => setSearchFilter(event.target.value)}
            />
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-slate-900/45 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/70"
              onClick={() => setSearchFilter("")}
            >
              Limpar
            </button>
          </div>

          {loading ? (
            <div className="mt-3 text-sm text-slate-300">Carregando...</div>
          ) : (
            <div className="mt-3 space-y-2">
              {filtered.map((tx) => {
                const income = isIncomeType(tx.type);
                const expense = isExpenseType(tx.type);
                const amount = Math.abs(toNumber(tx.amount));
                const categoryLabel = (tx.category || "Sem categoria").trim() || "Sem categoria";
                const categoryMetadata = categoryLookup.get(normalizeCategoryKey(categoryLabel));

                const rowIcon = getTransactionImageIcon(tx);

                const amountClass = income
                  ? "text-emerald-300"
                  : expense
                    ? "text-rose-300"
                    : "text-slate-300";

                return (
                  <div
                    key={tx.id}
                    className="gastos-row-card flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/35 px-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="expense-icon-orb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={rowIcon}
                          alt={`Icone ${tx.description}`}
                          className="expense-icon-img"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.src = "/icons/Prime-video.png";
                          }}
                        />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-100">{tx.description}</p>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <span>{formatDateLabel(tx.occurred_at)}</span>
                          <span>|</span>
                          <CategoryIcon
                            categoryName={`${tx.description} ${categoryLabel}`}
                            iconName={categoryMetadata?.icon_name}
                            iconColor={categoryMetadata?.icon_color}
                            size={11}
                            circleSize={22}
                          />
                          <span>{categoryLabel}</span>
                        </div>
                      </div>
                    </div>

                    <p className={`text-lg font-extrabold ${amountClass}`}>
                      {income ? "+" : "-"}
                      {brl(amount)}
                    </p>
                  </div>
                );
              })}

              {!filtered.length ? (
                <div className="rounded-xl border border-white/10 bg-slate-950/35 px-4 py-4 text-sm text-slate-300">
                  Nenhum lancamento encontrado para o filtro atual.
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
