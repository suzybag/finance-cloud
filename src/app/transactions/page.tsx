"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useConfirmDialog } from "@/context/ConfirmDialogContext";
import { Account, Transaction } from "@/lib/finance";
import { brl, toNumber } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";

type PixDirection = "in" | "out";

type PixAiItem = {
  amount: number;
  direction: PixDirection;
  counterparty: string;
  note: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const formatDateLabel = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const normalize = (value: string) => value.trim().toLowerCase();

const isPixTransaction = (tx: Transaction) => {
  if (tx.transaction_type) return tx.transaction_type === "pix";

  const tags = tx.tags ?? [];
  if (tags.some((tag) => normalize(tag) === "pix")) return true;
  if (/^pix\b/i.test(tx.description ?? "")) return true;
  return tx.type === "transfer";
};

const getPixDirection = (tx: Transaction): PixDirection => {
  if (tx.type === "income" || tx.type === "adjustment") return "in";
  if (tx.type === "transfer") {
    const note = normalize(tx.note ?? "");
    if (note.includes("receb")) return "in";
    return "out";
  }
  return "out";
};

const getCounterpartyFromDescription = (description: string) => {
  const match = description.match(/^pix\s+(?:para|de)\s+(.+)$/i);
  if (match?.[1]) return match[1].trim();
  return description.trim() || "Nao informado";
};

const emptyForm = {
  direction: "out" as PixDirection,
  occurred_at: todayIso(),
  amount: "",
  counterparty: "",
  account_id: "",
  note: "",
};

const LIGHT_SELECT_CLASS =
  "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-black outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-300/40";

export default function TransactionsPage() {
  const confirmDialog = useConfirmDialog();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasTransactionTypeColumn, setHasTransactionTypeColumn] = useState(true);

  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);

  const [monthFilter, setMonthFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");

  const [pixAiText, setPixAiText] = useState("");
  const [pixAiLoading, setPixAiLoading] = useState(false);
  const [pixAiResult, setPixAiResult] = useState<PixAiItem | null>(null);

  const accountById = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]));
  }, [accounts]);

  const loadData = async () => {
    setLoading(true);
    setMessage(null);

    const [accountsRes, userRes] = await Promise.all([
      supabase.from("accounts").select("*").order("created_at"),
      supabase.auth.getUser(),
    ]);

    setUserId(userRes.data.user?.id ?? null);

    if (accountsRes.error) {
      setMessage(accountsRes.error.message || "Falha ao carregar contas.");
      setLoading(false);
      return;
    }

    let pixRows: Transaction[] = [];
    let supportsTransactionType = true;

    const pixRes = await supabase
      .from("transactions")
      .select("*")
      .eq("transaction_type", "pix")
      .order("occurred_at", { ascending: false })
      .limit(2000);

    if (pixRes.error) {
      const errorText = normalize(pixRes.error.message || "");
      const missingColumn =
        errorText.includes("transaction_type") &&
        (errorText.includes("column") || errorText.includes("schema cache"));

      if (!missingColumn) {
        setMessage(pixRes.error.message || "Falha ao carregar transacoes PIX.");
        setLoading(false);
        return;
      }

      supportsTransactionType = false;
      const fallbackRes = await supabase
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(2000);

      if (fallbackRes.error) {
        setMessage(fallbackRes.error.message || "Falha ao carregar transacoes PIX.");
        setLoading(false);
        return;
      }

      pixRows = ((fallbackRes.data as Transaction[]) ?? []).filter(isPixTransaction);
    } else {
      pixRows = (pixRes.data as Transaction[]) ?? [];
    }

    setHasTransactionTypeColumn(supportsTransactionType);
    setAccounts((accountsRes.data as Account[]) ?? []);
    setTransactions(pixRows);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    const search = searchFilter.trim().toLowerCase();

    return transactions.filter((tx) => {
      const matchesMonth = monthFilter ? tx.occurred_at.startsWith(monthFilter) : true;
      const matchesAccount = accountFilter ? tx.account_id === accountFilter : true;

      const counterparty = getCounterpartyFromDescription(tx.description);
      const haystack = `${tx.description} ${counterparty} ${tx.note ?? ""} ${tx.category ?? ""}`.toLowerCase();
      const matchesSearch = search ? haystack.includes(search) : true;

      return matchesMonth && matchesAccount && matchesSearch;
    });
  }, [transactions, monthFilter, accountFilter, searchFilter]);

  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, tx) => {
        const amount = Math.abs(toNumber(tx.amount));
        const direction = getPixDirection(tx);
        if (direction === "in") acc.in += amount;
        else acc.out += amount;
        return acc;
      },
      { in: 0, out: 0 },
    );
  }, [filtered]);

  const net = summary.in - summary.out;

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setPixAiResult(null);
  };

  const fillFormFromAi = (item: PixAiItem) => {
    setForm((prev) => ({
      ...prev,
      direction: item.direction,
      amount: String(item.amount).replace(".", ","),
      counterparty: item.counterparty,
      note: item.note,
    }));
  };

  const parsePixText = async () => {
    const text = pixAiText.trim();
    if (!text) {
      setMessage("Digite uma frase PIX. Ex: pix 50 para Joao aluguel.");
      return;
    }

    setPixAiLoading(true);
    setMessage(null);

    const response = await fetch("/api/ai/pix-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message || "Falha ao analisar frase PIX.");
      setPixAiLoading(false);
      return;
    }

    if (!data.item) {
      setPixAiResult(null);
      setMessage(data.message || "Nao consegui extrair um PIX dessa frase.");
      setPixAiLoading(false);
      return;
    }

    const item = data.item as PixAiItem;
    setPixAiResult(item);
    fillFormFromAi(item);
    setMessage("PIX identificado. Confira os campos e salve.");
    setPixAiLoading(false);
  };

  const savePix = async () => {
    if (!userId) {
      setMessage("Sessao nao carregada.");
      return;
    }

    const amount = Math.abs(toNumber(form.amount));
    if (amount <= 0) {
      setMessage("Informe um valor de PIX maior que zero.");
      return;
    }

    if (!form.counterparty.trim()) {
      setMessage("Informe quem enviou/recebeu o PIX.");
      return;
    }

    if (!form.account_id) {
      setMessage("Selecione a conta do PIX.");
      return;
    }

    setWorking(true);

    const payload: Record<string, unknown> = {
      user_id: userId,
      type: form.direction === "in" ? "income" : "expense",
      occurred_at: form.occurred_at,
      description: `PIX ${form.direction === "in" ? "de" : "para"} ${form.counterparty.trim()}`,
      category: "Transferencia PIX",
      amount,
      account_id: form.account_id,
      to_account_id: null,
      card_id: null,
      tags: ["pix"],
      note: form.note.trim() || null,
    };

    if (hasTransactionTypeColumn) {
      payload.transaction_type = "pix";
    }

    const response = editingId
      ? await supabase.from("transactions").update(payload).eq("id", editingId)
      : await supabase.from("transactions").insert(payload);

    if (response.error) {
      setMessage(response.error.message || "Falha ao salvar PIX.");
      setWorking(false);
      return;
    }

    setMessage(editingId ? "PIX atualizado." : "PIX salvo.");
    resetForm();
    await loadData();
    setWorking(false);
  };

  const editPix = (tx: Transaction) => {
    setEditingId(tx.id);
    setForm({
      direction: getPixDirection(tx),
      occurred_at: tx.occurred_at,
      amount: String(tx.amount),
      counterparty: getCounterpartyFromDescription(tx.description),
      account_id: tx.account_id ?? "",
      note: tx.note ?? "",
    });
  };

  const deletePix = async (id: string) => {
    const confirmed = await confirmDialog({
      title: "Excluir PIX?",
      description: "Este lancamento PIX sera removido permanentemente.",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      tone: "danger",
    });
    if (!confirmed) return;

    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      setMessage(error.message || "Falha ao excluir PIX.");
      return;
    }

    setMessage("PIX excluido.");
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
    <AppShell title="Transacoes" subtitle="Apenas PIX enviado e recebido" actions={actions}>
      <div className="space-y-5">
        {message ? (
          <div className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100">
            {message}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-400">PIX recebido</p>
            <p className="mt-2 text-2xl font-extrabold text-emerald-300">+{brl(summary.in)}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-400">PIX enviado</p>
            <p className="mt-2 text-2xl font-extrabold text-rose-300">-{brl(summary.out)}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Saldo PIX</p>
            <p className={`mt-2 text-2xl font-extrabold ${net >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {brl(net)}
            </p>
          </article>
        </section>

        <section className="glass-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">Assistente PIX (IA)</h2>
              <p className="text-sm text-slate-300">Ex: pix 50 para Joao aluguel</p>
            </div>

            <button
              type="button"
              className="rounded-xl border border-white/10 bg-slate-900/45 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/70 disabled:opacity-60"
              onClick={parsePixText}
              disabled={pixAiLoading}
            >
              {pixAiLoading ? "Analisando..." : "Analisar PIX"}
            </button>
          </div>

          <input
            className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
            placeholder="Digite o PIX em texto"
            value={pixAiText}
            onChange={(event) => setPixAiText(event.target.value)}
          />

          {pixAiResult ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/35 p-3 text-sm text-slate-200">
              <p>
                Direcao: <strong>{pixAiResult.direction === "in" ? "Recebido" : "Enviado"}</strong>
              </p>
              <p>
                Valor: <strong>{brl(pixAiResult.amount)}</strong>
              </p>
              <p>
                Pessoa: <strong>{pixAiResult.counterparty}</strong>
              </p>
              <p>
                Observacao: <strong>{pixAiResult.note || "-"}</strong>
              </p>
            </div>
          ) : null}
        </section>

        <section className="glass-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold tracking-tight">
              {editingId ? "Editar PIX" : "Novo PIX"}
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
                onClick={savePix}
                disabled={working}
              >
                {working ? "Salvando..." : editingId ? "Salvar" : "Salvar PIX"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <select
              className={LIGHT_SELECT_CLASS}
              value={form.direction}
              onChange={(event) => setForm((prev) => ({ ...prev, direction: event.target.value as PixDirection }))}
            >
              <option className="bg-white text-black" value="out">PIX enviado</option>
              <option className="bg-white text-black" value="in">PIX recebido</option>
            </select>

            <input
              type="date"
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
              value={form.occurred_at}
              onChange={(event) => setForm((prev) => ({ ...prev, occurred_at: event.target.value }))}
            />

            <input
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
              placeholder="Valor"
              value={form.amount}
              onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
              placeholder={form.direction === "in" ? "Quem enviou" : "Para quem foi"}
              value={form.counterparty}
              onChange={(event) => setForm((prev) => ({ ...prev, counterparty: event.target.value }))}
            />

            <select
              className={LIGHT_SELECT_CLASS}
              value={form.account_id}
              onChange={(event) => setForm((prev) => ({ ...prev, account_id: event.target.value }))}
            >
              <option className="bg-white text-black" value="">Conta</option>
              {accounts.map((account) => (
                <option className="bg-white text-black" key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          <input
            className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
            placeholder="Observacao (opcional)"
            value={form.note}
            onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
          />
        </section>

        <section className="glass-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">Movimentos PIX</h2>
              <p className="text-sm text-slate-300">{filtered.length} itens</p>
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
              className={LIGHT_SELECT_CLASS}
              value={accountFilter}
              onChange={(event) => setAccountFilter(event.target.value)}
            >
              <option className="bg-white text-black" value="">Todas as contas</option>
              {accounts.map((account) => (
                <option className="bg-white text-black" key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>

            <input
              className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
              placeholder="Buscar por pessoa, descricao ou observacao"
              value={searchFilter}
              onChange={(event) => setSearchFilter(event.target.value)}
            />
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-slate-300">Carregando...</div>
          ) : (
            <div className="mt-4 space-y-2">
              {filtered.map((tx) => {
                const direction = getPixDirection(tx);
                const amount = Math.abs(toNumber(tx.amount));
                const counterparty = getCounterpartyFromDescription(tx.description);
                const amountClass = direction === "in" ? "text-emerald-300" : "text-rose-300";

                return (
                  <div
                    key={tx.id}
                    className="grid gap-3 rounded-xl border border-white/10 bg-slate-950/35 px-3 py-3 md:grid-cols-[130px_1fr_170px_140px_120px] md:items-center"
                  >
                    <div className="text-sm text-slate-300">{formatDateLabel(tx.occurred_at)}</div>

                    <div>
                      <p className="font-semibold text-slate-100">{counterparty}</p>
                      <p className="text-xs text-slate-400">{tx.note || "Sem observacao"}</p>
                    </div>

                    <div>
                      <p className="inline-flex rounded-full bg-white px-2 py-1 text-xs font-semibold text-black">
                        {direction === "in" ? "PIX recebido" : "PIX enviado"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {accountById.get(tx.account_id ?? "")?.name || "Sem conta"}
                      </p>
                    </div>

                    <div className={`text-right text-lg font-extrabold ${amountClass}`}>
                      {direction === "in" ? "+" : "-"} {brl(amount)}
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-white/10 bg-slate-900/45 px-2 py-1 text-xs font-semibold text-slate-100 transition hover:bg-slate-900/70"
                        onClick={() => editPix(tx)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-white/10 bg-slate-900/45 px-2 py-1 text-xs font-semibold text-slate-100 transition hover:bg-slate-900/70"
                        onClick={() => deletePix(tx.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                );
              })}

              {!filtered.length ? (
                <div className="rounded-xl border border-white/10 bg-slate-950/35 px-4 py-4 text-sm text-slate-300">
                  Nenhum PIX encontrado para o filtro atual.
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
