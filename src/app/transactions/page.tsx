"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { brl, toNumber } from "@/lib/money";
import { Account, Card, Transaction, monthLabel } from "@/lib/finance";

const emptyTx = {
  type: "expense",
  occurred_at: new Date().toISOString().slice(0, 10),
  description: "",
  category: "",
  amount: "",
  account_id: "",
  to_account_id: "",
  card_id: "",
  tags: "",
  note: "",
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [form, setForm] = useState({ ...emptyTx });
  const [editingId, setEditingId] = useState<string | null>(null);

  const [monthFilter, setMonthFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");

  const loadData = async () => {
    setLoading(true);
    const [txRes, accountsRes, cardsRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(500),
      supabase.from("accounts").select("*").order("created_at"),
      supabase.from("cards").select("*").order("created_at"),
    ]);

    setTransactions((txRes.data as Transaction[]) || []);
    setAccounts((accountsRes.data as Account[]) || []);
    setCards((cardsRes.data as Card[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    loadData();
  }, []);

  const filteredTxs = useMemo(() => {
    return transactions.filter((tx) => {
      const matchesMonth = monthFilter
        ? tx.occurred_at.startsWith(monthFilter)
        : true;
      const matchesAccount = accountFilter
        ? tx.account_id === accountFilter || tx.to_account_id === accountFilter
        : true;
      return matchesMonth && matchesAccount;
    });
  }, [transactions, monthFilter, accountFilter]);

  const totalIncome = filteredTxs
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + toNumber(tx.amount), 0);
  const totalExpense = filteredTxs
    .filter((tx) => tx.type === "expense" || tx.type === "card_payment")
    .reduce((sum, tx) => sum + toNumber(tx.amount), 0);

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!userId || !form.description || !form.amount) return;
    const payload = {
      user_id: userId,
      type: form.type,
      occurred_at: form.occurred_at,
      description: form.description,
      category: form.category || null,
      amount: toNumber(form.amount),
      account_id: form.account_id || null,
      to_account_id: form.to_account_id || null,
      card_id: form.card_id || null,
      tags: form.tags ? form.tags.split(",").map((tag) => tag.trim()) : null,
      note: form.note || null,
    };

    if (editingId) {
      await supabase.from("transactions").update(payload).eq("id", editingId);
    } else {
      await supabase.from("transactions").insert(payload);
    }

    setForm({ ...emptyTx });
    setEditingId(null);
    loadData();
  };

  const handleEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setForm({
      type: tx.type,
      occurred_at: tx.occurred_at,
      description: tx.description,
      category: tx.category ?? "",
      amount: String(tx.amount),
      account_id: tx.account_id ?? "",
      to_account_id: tx.to_account_id ?? "",
      card_id: tx.card_id ?? "",
      tags: tx.tags?.join(", ") ?? "",
      note: tx.note ?? "",
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este lancamento?")) return;
    await supabase.from("transactions").delete().eq("id", id);
    loadData();
  };

  return (
    <AppShell title="Transacoes" subtitle="Receitas, despesas e transferencias">
      {loading ? (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-6 text-slate-300">
          Carregando...
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <section className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold">Novo lancamento</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <select
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                value={form.type}
                onChange={(event) => handleChange("type", event.target.value)}
              >
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
                <option value="transfer">Transferencia</option>
                <option value="card_payment">Pagamento de fatura</option>
                <option value="adjustment">Ajuste</option>
              </select>
              <input
                type="date"
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                value={form.occurred_at}
                onChange={(event) => handleChange("occurred_at", event.target.value)}
              />
              <input
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                placeholder="Descricao"
                value={form.description}
                onChange={(event) => handleChange("description", event.target.value)}
              />
              <input
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                placeholder="Categoria"
                value={form.category}
                onChange={(event) => handleChange("category", event.target.value)}
              />
              <input
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                placeholder="Valor"
                value={form.amount}
                onChange={(event) => handleChange("amount", event.target.value)}
              />
              <select
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                value={form.account_id}
                onChange={(event) => handleChange("account_id", event.target.value)}
              >
                <option value="">Conta (opcional)</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              {form.type === "transfer" && (
                <select
                  className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                  value={form.to_account_id}
                  onChange={(event) => handleChange("to_account_id", event.target.value)}
                >
                  <option value="">Conta destino</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                value={form.card_id}
                onChange={(event) => handleChange("card_id", event.target.value)}
              >
                <option value="">Cartao (opcional)</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
              <input
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                placeholder="Tags (separadas por virgula)"
                value={form.tags}
                onChange={(event) => handleChange("tags", event.target.value)}
              />
              <input
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm md:col-span-2"
                placeholder="Observacao"
                value={form.note}
                onChange={(event) => handleChange("note", event.target.value)}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className="rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-2 text-sm font-semibold text-slate-950"
                onClick={handleSubmit}
              >
                {editingId ? "Salvar alteracoes" : "Adicionar"}
              </button>
              {editingId && (
                <button
                  className="rounded-xl border border-slate-700 px-3 py-2 text-sm"
                  onClick={() => {
                    setEditingId(null);
                    setForm({ ...emptyTx });
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </section>

          <section className="glass rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Lancamentos</h2>
                <p className="text-sm text-slate-400">
                  Receita: {brl(totalIncome)} • Despesa: {brl(totalExpense)}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <input
                  type="month"
                  className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                  value={monthFilter}
                  onChange={(event) => setMonthFilter(event.target.value)}
                />
                <select
                  className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                  value={accountFilter}
                  onChange={(event) => setAccountFilter(event.target.value)}
                >
                  <option value="">Todas as contas</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {filteredTxs.map((tx) => (
                <div key={tx.id} className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{tx.description}</p>
                      <p className="text-xs text-slate-400">
                        {monthLabel(tx.occurred_at)} • {tx.category ?? "Sem categoria"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${tx.type === "income" ? "text-emerald-300" : "text-rose-300"}`}>
                        {tx.type === "income" ? "+" : "-"} {brl(toNumber(tx.amount))}
                      </p>
                      <p className="text-xs text-slate-500">{tx.type}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded-xl border border-slate-700 px-3 py-2 text-xs"
                      onClick={() => handleEdit(tx)}
                    >
                      Editar
                    </button>
                    <button
                      className="rounded-xl border border-slate-700 px-3 py-2 text-xs"
                      onClick={() => handleDelete(tx.id)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
              {!filteredTxs.length && (
                <div className="text-sm text-slate-500">Nenhum lancamento encontrado.</div>
              )}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
