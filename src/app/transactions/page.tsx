"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { brl, toNumber } from "@/lib/money";
import { Account, Card, Transaction } from "@/lib/finance";

const emptyForm = {
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
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);

  const [monthFilter, setMonthFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");

  const loadData = async () => {
    setLoading(true);
    const [txRes, accountsRes, cardsRes, userRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(2000),
      supabase.from("accounts").select("*").order("created_at"),
      supabase.from("cards").select("*").order("created_at"),
      supabase.auth.getUser(),
    ]);

    setUserId(userRes.data.user?.id ?? null);

    if (txRes.error || accountsRes.error || cardsRes.error) {
      setMessage(txRes.error?.message || accountsRes.error?.message || cardsRes.error?.message || "Falha ao carregar transacoes.");
      setLoading(false);
      return;
    }

    setTransactions((txRes.data as Transaction[]) ?? []);
    setAccounts((accountsRes.data as Account[]) ?? []);
    setCards((cardsRes.data as Card[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const matchesMonth = monthFilter ? tx.occurred_at.startsWith(monthFilter) : true;
      const matchesAccount = accountFilter
        ? tx.account_id === accountFilter || tx.to_account_id === accountFilter
        : true;
      return matchesMonth && matchesAccount;
    });
  }, [transactions, monthFilter, accountFilter]);

  const incomeTotal = useMemo(
    () => filtered.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0),
    [filtered],
  );

  const expenseTotal = useMemo(
    () =>
      filtered
        .filter((tx) => tx.type === "expense" || tx.type === "card_payment")
        .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0),
    [filtered],
  );

  const updateForm = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
  };

  const saveTransaction = async () => {
    if (!userId) {
      setMessage("Sessao nao carregada.");
      return;
    }
    if (!form.description.trim()) {
      setMessage("Informe uma descricao.");
      return;
    }

    const amount = Math.abs(toNumber(form.amount));
    if (amount <= 0) {
      setMessage("Informe um valor maior que zero.");
      return;
    }

    if (form.type === "transfer" && (!form.account_id || !form.to_account_id || form.account_id === form.to_account_id)) {
      setMessage("Para transferencia, selecione contas de origem e destino diferentes.");
      return;
    }

    setWorking(true);

    const payload = {
      user_id: userId,
      type: form.type,
      occurred_at: form.occurred_at,
      description: form.description.trim(),
      category: form.category.trim() || null,
      amount,
      account_id: form.account_id || null,
      to_account_id: form.to_account_id || null,
      card_id: form.card_id || null,
      tags: form.tags.trim() ? form.tags.split(",").map((tag) => tag.trim()) : null,
      note: form.note.trim() || null,
    };

    const response = editingId
      ? await supabase.from("transactions").update(payload).eq("id", editingId)
      : await supabase.from("transactions").insert(payload);

    if (response.error) {
      setMessage(response.error.message);
      setWorking(false);
      return;
    }

    setMessage(editingId ? "Lancamento atualizado." : "Lancamento criado.");
    resetForm();
    await loadData();
    setWorking(false);
  };

  const editTransaction = (tx: Transaction) => {
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
      tags: tx.tags?.join(",") ?? "",
      note: tx.note ?? "",
    });
  };

  const deleteTransaction = async (id: string) => {
    if (!window.confirm("Excluir este lancamento?")) return;

    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Lancamento excluido.");
    loadData();
  };

  const actions = (
    <button
      type="button"
      className="rounded-xl border border-stroke bg-card px-3 py-2 text-sm font-semibold hover:bg-appbg transition"
      onClick={loadData}
    >
      Atualizar
    </button>
  );

  return (
    <AppShell title="Transacoes" subtitle="Receitas, despesas e transferencias" actions={actions}>
      <div className="space-y-6">
        {message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
        ) : null}

        <section className="rounded-xl2 bg-card border border-stroke shadow-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold">{editingId ? "Editar lancamento" : "Novo lancamento"}</h2>
            <button
              type="button"
              className="rounded-xl bg-greenbar2 text-white px-4 py-2 text-sm font-bold shadow-softer disabled:opacity-60"
              onClick={saveTransaction}
              disabled={working}
            >
              {editingId ? "Salvar" : "Adicionar"}
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <select
              className="rounded-xl border border-stroke bg-appbg px-3 py-2 text-sm"
              value={form.type}
              onChange={(event) => updateForm("type", event.target.value)}
            >
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
              <option value="transfer">Transferencia</option>
              <option value="card_payment">Pagamento de fatura</option>
              <option value="adjustment">Ajuste</option>
            </select>

            <input
              type="date"
              className="rounded-xl border border-stroke bg-appbg px-3 py-2 text-sm"
              value={form.occurred_at}
              onChange={(event) => updateForm("occurred_at", event.target.value)}
            />

            <input
              className="rounded-xl border border-stroke bg-appbg px-3 py-2 text-sm"
              placeholder="Descricao"
              value={form.description}
              onChange={(event) => updateForm("description", event.target.value)}
            />

            <input
              className="rounded-xl border border-stroke bg-appbg px-3 py-2 text-sm"
              placeholder="Categoria"
              value={form.category}
              onChange={(event) => updateForm("category", event.target.value)}
            />

            <input
              className="rounded-xl border border-stroke bg-appbg px-3 py-2 text-sm"
              placeholder="Valor"
              value={form.amount}
              onChange={(event) => updateForm("amount", event.target.value)}
            />

            <select
              className="rounded-xl border border-stroke bg-appbg px-3 py-2 text-sm"
              value={form.account_id}
              onChange={(event) => updateForm("account_id", event.target.value)}
            >
              <option value="">Conta origem</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>

            <select
              className="rounded-xl border border-stroke bg-appbg px-3 py-2 text-sm"
              value={form.to_account_id}
              onChange={(event) => updateForm("to_account_id", event.target.value)}
            >
              <option value="">Conta destino</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>

            <select
              className="rounded-xl border border-stroke bg-appbg px-3 py-2 text-sm"
              value={form.card_id}
              onChange={(event) => updateForm("card_id", event.target.value)}
            >
              <option value="">Cartao (opcional)</option>
              {cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </select>

            <input
              className="rounded-xl border border-stroke bg-appbg px-3 py-2 text-sm md:col-span-2"
              placeholder="Tags (separadas por virgula)"
              value={form.tags}
              onChange={(event) => updateForm("tags", event.target.value)}
            />

            <input
              className="rounded-xl border border-stroke bg-appbg px-3 py-2 text-sm md:col-span-2"
              placeholder="Observacao"
              value={form.note}
              onChange={(event) => updateForm("note", event.target.value)}
            />
          </div>

          {editingId ? (
            <button
              type="button"
              className="mt-3 rounded-xl border border-stroke bg-card px-3 py-2 text-sm font-semibold"
              onClick={resetForm}
            >
              Cancelar edicao
            </button>
          ) : null}
        </section>

        <section className="rounded-xl2 bg-card border border-stroke shadow-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold">Lancamentos</h2>
              <p className="text-sm text-muted">Receita: {brl(incomeTotal)} | Despesa: {brl(expenseTotal)}</p>
            </div>

            <div className="flex gap-2">
              <input
                type="month"
                className="rounded-xl border border-stroke bg-appbg px-3 py-2 text-sm"
                value={monthFilter}
                onChange={(event) => setMonthFilter(event.target.value)}
              />
              <select
                className="rounded-xl border border-stroke bg-appbg px-3 py-2 text-sm"
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

          {loading ? (
            <div className="mt-3 text-sm text-muted">Carregando...</div>
          ) : (
            <div className="mt-3 space-y-2">
              {filtered.map((tx) => {
                const isIncome = tx.type === "income";
                const amount = Math.abs(toNumber(tx.amount));

                return (
                  <div key={tx.id} className="rounded-xl border border-stroke bg-appbg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{tx.description}</div>
                        <div className="text-xs text-muted mt-1">
                          {tx.occurred_at} | {tx.type} | {tx.category ?? "Sem categoria"}
                        </div>
                      </div>
                      <div className={`font-extrabold ${isIncome ? "text-emerald-700" : "text-rose-700"}`}>
                        {isIncome ? "+" : "-"} {brl(amount)}
                      </div>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-stroke bg-card px-3 py-2 text-sm font-semibold"
                        onClick={() => editTransaction(tx)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-stroke bg-card px-3 py-2 text-sm font-semibold"
                        onClick={() => deleteTransaction(tx.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                );
              })}

              {!filtered.length ? <div className="text-sm text-muted">Nenhum lancamento encontrado.</div> : null}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
