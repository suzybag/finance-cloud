"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import type { Account } from "@/lib/finance";
import { brl, toNumber } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";

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

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function AiPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [quickText, setQuickText] = useState("");
  const [quickDate, setQuickDate] = useState(todayIso());
  const [quickAccountId, setQuickAccountId] = useState("");
  const [quickResult, setQuickResult] = useState<QuickParseResponse | null>(null);
  const [quickParsing, setQuickParsing] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);

  const loadBaseData = async () => {
    setLoading(true);
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

    setAccounts((accountsRes.data as Account[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadBaseData();
  }, []);

  const parsedCount = useMemo(() => quickResult?.items.length ?? 0, [quickResult]);

  const parseQuickText = async () => {
    const text = quickText.trim();
    if (!text) {
      setMessage("Digite sua frase. Ex: hoje gastei 23 em uber e 25 netflix.");
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

    const result = data as QuickParseResponse;
    setQuickResult(result);
    if (result.items.length) {
      setMessage(`${result.items.length} lancamentos identificados.`);
    } else {
      setMessage("Nenhum valor encontrado na frase.");
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
      setMessage("Nao ha itens para salvar.");
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
      tags: ["ai_texto"],
      note,
    }));

    const { error } = await supabase.from("transactions").insert(rows);
    if (error) {
      setMessage(error.message || "Falha ao salvar.");
      setQuickSaving(false);
      return;
    }

    setMessage(`${rows.length} lancamentos salvos em Gastos.`);
    setQuickResult(null);
    setQuickText("");
    setQuickSaving(false);
  };

  const actions = (
    <div className="flex items-center gap-2">
      <Link
        href="/gastos"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/55"
      >
        Abrir Gastos
      </Link>
      <button
        type="button"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/55"
        onClick={loadBaseData}
      >
        Atualizar
      </button>
    </div>
  );

  return (
    <AppShell title="AI" subtitle="Escreva gastos e receitas em texto livre" actions={actions}>
      <div className="space-y-4">
        {message ? (
          <div className="rounded-xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="glass-panel p-6 text-slate-300">Carregando...</div>
        ) : (
          <>
            <section className="glass-panel p-5">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-100">Comando rapido</h2>
              <p className="mt-1 text-sm text-slate-300">
                Exemplo: hoje gastei 23 em uber 25 netflix e recebi 500 salario.
              </p>

              <textarea
                className="mt-3 h-28 w-full rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100 outline-none"
                placeholder="Digite sua frase"
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
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/85 disabled:opacity-60"
                  onClick={parseQuickText}
                  disabled={quickParsing}
                >
                  {quickParsing ? "Analisando..." : "Analisar"}
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                  onClick={saveQuickItems}
                  disabled={quickSaving || parsedCount === 0}
                >
                  {quickSaving ? "Salvando..." : "Salvar em Gastos"}
                </button>
              </div>
            </section>

            {quickResult ? (
              <section className="glass-panel p-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                    <p className="text-xs text-slate-400">Despesa total</p>
                    <p className="text-xl font-extrabold text-rose-300">-{brl(quickResult.totals.expense)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                    <p className="text-xs text-slate-400">Receita total</p>
                    <p className="text-xl font-extrabold text-emerald-300">+{brl(quickResult.totals.income)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                    <p className="text-xs text-slate-400">Resultado</p>
                    <p
                      className={`text-xl font-extrabold ${
                        quickResult.totals.balance >= 0 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {brl(quickResult.totals.balance)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {quickResult.items.map((item, index) => {
                    const isIncome = item.type === "income";
                    return (
                      <div
                        key={`${item.description}-${item.amount}-${index}`}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-extrabold ${
                              isIncome
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-rose-500/15 text-rose-300"
                            }`}
                          >
                            {isIncome ? "↑" : "↓"}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-100">{item.description}</p>
                            <p className="text-xs text-slate-400">{item.category}</p>
                          </div>
                        </div>
                        <p className={`font-extrabold ${isIncome ? "text-emerald-300" : "text-rose-300"}`}>
                          {isIncome ? "+" : "-"}
                          {brl(item.amount)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

