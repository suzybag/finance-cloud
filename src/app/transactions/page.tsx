"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { brl, toNumber } from "@/lib/money";
import { Account, Card, Transaction, TransactionType } from "@/lib/finance";

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

type QuickParsedItem = {
  description: string;
  amount: number;
  type: "expense" | "income";
  category: string;
};

type QuickParseResponse = {
  items: QuickParsedItem[];
  summary: { description: string; total: number; type: "expense" | "income" }[];
  totals: { expense: number; income: number; balance: number };
};

const TYPE_LABELS: Record<TransactionType, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferencia",
  adjustment: "Ajuste",
  card_payment: "Pagamento de fatura",
};

const isIncomeType = (type: TransactionType) => type === "income" || type === "adjustment";
const isExpenseType = (type: TransactionType) => type === "expense" || type === "card_payment";

const formatDateLabel = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
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
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);

  const [monthFilter, setMonthFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");

  const [quickText, setQuickText] = useState("");
  const [quickDate, setQuickDate] = useState(new Date().toISOString().slice(0, 10));
  const [quickAccountId, setQuickAccountId] = useState("");
  const [quickResult, setQuickResult] = useState<QuickParseResponse | null>(null);
  const [quickParsing, setQuickParsing] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);

  const accountById = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]));
  }, [accounts]);

  const cardById = useMemo(() => {
    return new Map(cards.map((card) => [card.id, card]));
  }, [cards]);

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
      setMessage(
        txRes.error?.message ||
          accountsRes.error?.message ||
          cardsRes.error?.message ||
          "Falha ao carregar transacoes.",
      );
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
    const search = searchFilter.trim().toLowerCase();

    return transactions.filter((tx) => {
      const matchesMonth = monthFilter ? tx.occurred_at.startsWith(monthFilter) : true;
      const matchesAccount = accountFilter
        ? tx.account_id === accountFilter || tx.to_account_id === accountFilter
        : true;

      const haystack = `${tx.description} ${tx.category ?? ""} ${tx.note ?? ""}`.toLowerCase();
      const matchesSearch = search ? haystack.includes(search) : true;

      return matchesMonth && matchesAccount && matchesSearch;
    });
  }, [transactions, monthFilter, accountFilter, searchFilter]);

  const incomeTotal = useMemo(
    () =>
      filtered
        .filter((tx) => isIncomeType(tx.type))
        .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0),
    [filtered],
  );

  const expenseTotal = useMemo(
    () =>
      filtered
        .filter((tx) => isExpenseType(tx.type))
        .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0),
    [filtered],
  );

  const balanceTotal = incomeTotal - expenseTotal;

  const updateForm = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowAdvancedFields(false);
  };

  const parseQuickText = async () => {
    const text = quickText.trim();
    if (!text) {
      setMessage("Digite uma frase para analisar. Ex: 11 netflix 12 uber.");
      return;
    }

    setQuickParsing(true);
    setMessage(null);

    const response = await fetch("/api/ai/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message || "Falha ao analisar texto.");
      setQuickParsing(false);
      return;
    }

    setQuickResult(data as QuickParseResponse);
    if ((data.items ?? []).length) {
      setMessage(`${data.items.length} lancamentos identificados.`);
    } else {
      setMessage("Nao identifiquei valores na frase. Tente: 11 netflix 12 uber.");
    }

    setQuickParsing(false);
  };

  const saveQuickItems = async () => {
    if (!userId) {
      setMessage("Sessao nao carregada.");
      return;
    }

    const items = quickResult?.items ?? [];
    if (!items.length) {
      setMessage("Nenhum item para salvar.");
      return;
    }

    setQuickSaving(true);
    setMessage(null);

    const noteText = quickText.trim();
    const note = noteText ? `Texto original: ${noteText.slice(0, 220)}` : null;

    const rows = items.map((item) => ({
      user_id: userId,
      type: item.type,
      occurred_at: quickDate,
      description: item.description,
      category: item.category || null,
      amount: Math.abs(toNumber(item.amount)),
      account_id: quickAccountId || null,
      to_account_id: null,
      card_id: null,
      tags: ["ia_texto"],
      note,
    }));

    const { error } = await supabase.from("transactions").insert(rows);
    if (error) {
      setMessage(error.message);
      setQuickSaving(false);
      return;
    }

    setQuickResult(null);
    setQuickText("");
    setMessage(`${rows.length} lancamentos criados com IA.`);
    await loadData();
    setQuickSaving(false);
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

    if (
      form.type === "transfer" &&
      (!form.account_id || !form.to_account_id || form.account_id === form.to_account_id)
    ) {
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
      to_account_id: form.type === "transfer" ? form.to_account_id || null : null,
      card_id:
        form.type === "card_payment" || form.type === "expense" ? form.card_id || null : null,
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

    if ((tx.tags?.length ?? 0) > 0 || (tx.note ?? "").trim()) {
      setShowAdvancedFields(true);
    }
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
      className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/55"
      onClick={loadData}
    >
      Atualizar
    </button>
  );

  return (
    <AppShell title="Transacoes" subtitle="Receitas, despesas e transferencias" actions={actions}>
      <div className="space-y-5">
        {message ? (
          <div className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100">
            {message}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Receitas</p>
            <p className="mt-2 text-2xl font-extrabold text-emerald-300">+{brl(incomeTotal)}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Despesas</p>
            <p className="mt-2 text-2xl font-extrabold text-rose-300">-{brl(expenseTotal)}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Resultado</p>
            <p className={`mt-2 text-2xl font-extrabold ${balanceTotal >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {brl(balanceTotal)}
            </p>
          </article>
        </section>

        <section className="glass-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">Lancamento rapido por texto (IA)</h2>
              <p className="text-sm text-slate-300">Exemplo: hoje gastei 11 na netflix 12 de uber.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-slate-900/45 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/70 disabled:opacity-60"
                onClick={parseQuickText}
                disabled={quickParsing}
              >
                {quickParsing ? "Analisando..." : "Analisar texto"}
              </button>
              <button
                type="button"
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                onClick={saveQuickItems}
                disabled={quickSaving || !(quickResult?.items?.length)}
              >
                {quickSaving ? "Salvando..." : "Salvar todos"}
              </button>
            </div>
          </div>

          <textarea
            className="mt-3 h-24 w-full rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100 outline-none"
            placeholder="Digite sua frase com varios gastos"
            value={quickText}
            onChange={(event) => setQuickText(event.target.value)}
          />

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              type="date"
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
              value={quickDate}
              onChange={(event) => setQuickDate(event.target.value)}
            />

            <select
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
              value={quickAccountId}
              onChange={(event) => setQuickAccountId(event.target.value)}
            >
              <option value="">Conta padrao (opcional)</option>
              {accounts.map((account) => (
                <option key={`quick-${account.id}`} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          {quickResult ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/35 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-slate-100">{quickResult.items.length} itens identificados</span>
                <span className="text-slate-300">
                  Receita: {brl(quickResult.totals.income)} | Despesa: {brl(quickResult.totals.expense)}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {quickResult.summary.map((item) => (
                  <div
                    key={`${item.type}-${item.description}`}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/45 px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-semibold text-slate-100">{item.description}</span>
                      <span className="ml-2 text-slate-400">({item.type === "income" ? "receita" : "despesa"})</span>
                    </div>
                    <span className={`font-extrabold ${item.type === "income" ? "text-emerald-300" : "text-rose-300"}`}>
                      {item.type === "income" ? "+" : "-"} {brl(item.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="glass-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold tracking-tight">
              {editingId ? "Editar lancamento" : "Novo lancamento"}
            </h2>

            <div className="flex items-center gap-2">
              {editingId ? (
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-slate-900/45 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/70"
                  onClick={resetForm}
                >
                  Cancelar
                </button>
              ) : null}

              <button
                type="button"
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                onClick={saveTransaction}
                disabled={working}
              >
                {working ? "Salvando..." : editingId ? "Salvar" : "Adicionar"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <select
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
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
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
              value={form.occurred_at}
              onChange={(event) => updateForm("occurred_at", event.target.value)}
            />

            <input
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
              placeholder="Valor"
              value={form.amount}
              onChange={(event) => updateForm("amount", event.target.value)}
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
              placeholder="Descricao"
              value={form.description}
              onChange={(event) => updateForm("description", event.target.value)}
            />

            <input
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
              placeholder="Categoria"
              value={form.category}
              onChange={(event) => updateForm("category", event.target.value)}
            />
          </div>

          {form.type === "transfer" ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <select
                className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
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
                className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
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
            </div>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <select
                className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
                value={form.account_id}
                onChange={(event) => updateForm("account_id", event.target.value)}
              >
                <option value="">Conta</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>

              <select
                className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
                value={form.card_id}
                onChange={(event) => updateForm("card_id", event.target.value)}
                disabled={form.type !== "expense" && form.type !== "card_payment"}
              >
                <option value="">Cartao (opcional)</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-3">
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-slate-900/45 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/70"
              onClick={() => setShowAdvancedFields((prev) => !prev)}
            >
              {showAdvancedFields ? "Ocultar campos avancados" : "Mostrar campos avancados"}
            </button>

            {showAdvancedFields ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input
                  className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
                  placeholder="Tags (separadas por virgula)"
                  value={form.tags}
                  onChange={(event) => updateForm("tags", event.target.value)}
                />

                <input
                  className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
                  placeholder="Observacao"
                  value={form.note}
                  onChange={(event) => updateForm("note", event.target.value)}
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="glass-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">Lancamentos</h2>
              <p className="text-sm text-slate-300">{filtered.length} itens encontrados</p>
            </div>

            <button
              type="button"
              className="rounded-xl border border-white/10 bg-slate-900/45 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/70"
              onClick={() => {
                setMonthFilter("");
                setAccountFilter("");
                setSearchFilter("");
              }}
            >
              Limpar filtros
            </button>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[180px_220px_1fr]">
            <input
              type="month"
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
            />

            <select
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
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

            <input
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
              placeholder="Buscar por descricao, categoria ou observacao"
              value={searchFilter}
              onChange={(event) => setSearchFilter(event.target.value)}
            />
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-slate-300">Carregando...</div>
          ) : (
            <div className="mt-4 space-y-2">
              <div className="hidden items-center rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 md:grid md:grid-cols-[120px_1fr_180px_140px_120px]">
                <span>Data</span>
                <span>Lancamento</span>
                <span>Conta / tipo</span>
                <span className="text-right">Valor</span>
                <span className="text-right">Acoes</span>
              </div>

              {filtered.map((tx) => {
                const amount = Math.abs(toNumber(tx.amount));
                const income = isIncomeType(tx.type);
                const expense = isExpenseType(tx.type);

                const tone = income ? "text-emerald-300" : expense ? "text-rose-300" : "text-sky-300";
                const sign = income ? "+" : expense ? "-" : "<->";

                const accountInfo =
                  tx.type === "transfer"
                    ? `${accountById.get(tx.account_id ?? "")?.name ?? "Sem origem"} -> ${
                        accountById.get(tx.to_account_id ?? "")?.name ?? "Sem destino"
                      }`
                    : `${accountById.get(tx.account_id ?? "")?.name ?? "Sem conta"}`;

                const cardName = tx.card_id ? cardById.get(tx.card_id)?.name : null;

                return (
                  <div
                    key={tx.id}
                    className="grid gap-3 rounded-xl border border-white/10 bg-slate-950/35 px-3 py-3 md:grid-cols-[120px_1fr_180px_140px_120px] md:items-center"
                  >
                    <div className="text-sm text-slate-300">{formatDateLabel(tx.occurred_at)}</div>

                    <div>
                      <p className="font-semibold text-slate-100">{tx.description}</p>
                      <p className="text-xs text-slate-400">
                        {tx.category || "Sem categoria"}
                        {tx.note ? ` | ${tx.note}` : ""}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-200">{accountInfo}</p>
                      <p className="text-xs text-slate-400">
                        {TYPE_LABELS[tx.type]}
                        {cardName ? ` | Cartao: ${cardName}` : ""}
                      </p>
                    </div>

                    <div className={`text-right text-lg font-extrabold ${tone}`}>
                      {sign} {brl(amount)}
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-white/10 bg-slate-900/45 px-2 py-1 text-xs font-semibold text-slate-100 transition hover:bg-slate-900/70"
                        onClick={() => editTransaction(tx)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-white/10 bg-slate-900/45 px-2 py-1 text-xs font-semibold text-slate-100 transition hover:bg-slate-900/70"
                        onClick={() => deleteTransaction(tx.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                );
              })}

              {!filtered.length ? (
                <div className="rounded-xl border border-white/10 bg-slate-950/35 px-4 py-4 text-sm text-slate-300">
                  Nenhum lancamento encontrado.
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}