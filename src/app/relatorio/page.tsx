/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { brl, toNumber } from "@/lib/money";
import type { Transaction } from "@/lib/finance";

const CHIP_STYLES = [
  "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  "border-sky-500/30 bg-sky-500/10 text-sky-300",
  "border-amber-500/30 bg-amber-500/10 text-amber-300",
  "border-rose-500/30 bg-rose-500/10 text-rose-300",
  "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  "border-teal-500/30 bg-teal-500/10 text-teal-300",
];

const pickChipStyle = (label: string) => {
  const seed = label.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return CHIP_STYLES[Math.abs(seed) % CHIP_STYLES.length];
};

const formatDate = (value: string) => {
  try {
    return format(parseISO(value), "dd/MM");
  } catch {
    return value;
  }
};

const TYPE_STYLES: Record<
  string,
  { icon: string; badge: string; amount: string }
> = {
  income: {
    icon: "+",
    badge: "bg-emerald-500/15 text-emerald-300",
    amount: "text-emerald-400",
  },
  expense: {
    icon: "-",
    badge: "bg-rose-500/15 text-rose-300",
    amount: "text-rose-400",
  },
  card_payment: {
    icon: "-",
    badge: "bg-rose-500/15 text-rose-300",
    amount: "text-rose-400",
  },
  transfer: {
    icon: ">",
    badge: "bg-sky-500/15 text-sky-300",
    amount: "text-sky-300",
  },
  adjustment: {
    icon: "*",
    badge: "bg-amber-500/15 text-amber-300",
    amount: "text-amber-300",
  },
};

export default function RelatorioPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadTransactions = async () => {
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(200);

    if (error) {
      setMessage(error.message || "Falha ao carregar movimentacoes.");
      setLoading(false);
      return;
    }

    setTransactions((data as Transaction[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const totalLabel = useMemo(() => `${transactions.length} itens`, [transactions.length]);

  return (
    <AppShell title="Relatorio" subtitle="Movimentacoes adicionadas recentemente">
      {message ? (
        <div className="mb-4 rounded-xl border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl2 bg-card border border-stroke shadow-soft p-6 text-muted">
          Carregando...
        </div>
      ) : (
        <section className="rounded-xl2 bg-card border border-stroke shadow-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-extrabold">Historico</h2>
              <p className="text-xs text-muted">Lista de entradas e saidas.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">{totalLabel}</span>
              <button
                type="button"
                className="rounded-xl border border-stroke bg-card px-3 py-2 text-xs font-semibold hover:bg-appbg transition"
                onClick={loadTransactions}
              >
                Atualizar
              </button>
            </div>
          </div>

          <div className="mt-4 divide-y divide-stroke">
            {transactions.length ? (
              transactions.map((tx) => {
                const typeStyle = TYPE_STYLES[tx.type] ?? TYPE_STYLES.expense;
                const amountValue = toNumber(tx.amount);
                const isExpense = tx.type === "expense" || tx.type === "card_payment";
                const isIncome = tx.type === "income";
                const amountLabel = isIncome
                  ? `+${brl(Math.abs(amountValue))}`
                  : isExpense
                    ? `-${brl(Math.abs(amountValue))}`
                    : brl(amountValue);
                const categoryLabel = tx.category || "Sem categoria";
                const tags = tx.tags?.filter(Boolean) ?? [];

                return (
                  <div key={tx.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`h-12 w-12 rounded-2xl border border-stroke bg-appbg flex items-center justify-center ${typeStyle.badge}`}>
                        <span className="text-lg font-bold">{typeStyle.icon}</span>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">{tx.description}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`inline-flex items-center rounded-full border px-3 py-1 ${pickChipStyle(categoryLabel)}`}
                          >
                            {categoryLabel}
                          </span>
                          {tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-full border border-stroke bg-appbg px-3 py-1 text-slate-300"
                            >
                              {tag}
                            </span>
                          ))}
                          <span className="text-muted">{formatDate(tx.occurred_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className={`text-sm font-extrabold ${typeStyle.amount}`}>
                        {amountLabel}
                      </span>
                      <button
                        type="button"
                        className="h-8 w-8 rounded-full border border-stroke bg-appbg text-slate-300"
                        aria-label="Mais opcoes"
                      >
                        ...
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-6 text-sm text-muted">Nenhuma movimentacao encontrada.</div>
            )}
          </div>
        </section>
      )}
    </AppShell>
  );
}
