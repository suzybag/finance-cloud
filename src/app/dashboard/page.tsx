"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/AppShell";
import { KpiCard3D } from "@/components/KpiCard3D";
import { ReceitasDespesasDonut } from "@/components/ReceitasDespesasDonut";
import { brl, formatPercent, toNumber } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";
import {
  Account,
  Alert,
  Card,
  Transaction,
  buildCardAlerts,
  calculateInsights,
  computeAvailableBalance,
  computeCardSummary,
  computeForecastBalance,
  getMonthKey,
  groupByCategory,
} from "@/lib/finance";

const CATEGORY_COLORS = ["#334155", "#3b82f6", "#22c55e", "#0ea5e9", "#64748b", "#94a3b8"];
const CHART_TOOLTIP_STYLE = {
  background: "rgba(10, 14, 29, 0.88)",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: 12,
  color: "#e2e8f0",
};

const monthInputValue = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const toFriendlyDbError = (raw?: string) => {
  const msg = raw || "";
  const lower = msg.toLowerCase();

  if (lower.includes("schema cache") || lower.includes("could not find the table")) {
    return "Banco nao inicializado no Supabase. Rode o arquivo supabase.sql no SQL Editor e atualize a pagina.";
  }

  if (lower.includes("permission") || lower.includes("rls")) {
    return "Sem permissao para ler os dados. Verifique RLS/policies no Supabase.";
  }

  return msg || "Falha ao carregar dados.";
};

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [alertsSynced, setAlertsSynced] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [period, setPeriod] = useState(monthInputValue());
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setMessage(null);

    const [accountsRes, cardsRes, txRes, alertsRes] = await Promise.all([
      supabase.from("accounts").select("*").order("created_at"),
      supabase.from("cards").select("*").order("created_at"),
      supabase
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(1000),
      supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(50),
    ]);

    if (accountsRes.error || cardsRes.error || txRes.error || alertsRes.error) {
      setMessage(
        toFriendlyDbError(
          accountsRes.error?.message ||
            cardsRes.error?.message ||
            txRes.error?.message ||
            alertsRes.error?.message,
        ),
      );
      setLoading(false);
      return;
    }

    setAccounts((accountsRes.data as Account[]) ?? []);
    setCards((cardsRes.data as Card[]) ?? []);
    setTransactions((txRes.data as Transaction[]) ?? []);
    setAlerts((alertsRes.data as Alert[]) ?? []);
    setLoading(false);
  };

  const syncAlerts = useCallback(
    async (currentCards: Card[], currentAlerts: Alert[]) => {
      if (!userId) return;

      const generated = buildCardAlerts(currentCards.filter((card) => !card.archived));
      if (!generated.length) return;

      const existingKeys = new Set(
        currentAlerts.map((alert) => `${alert.type}-${alert.card_id}-${alert.due_at}`),
      );

      const toInsert = generated
        .filter((alert) => !existingKeys.has(`${alert.type}-${alert.card_id}-${alert.due_at}`))
        .map((alert) => ({ user_id: userId, ...alert, is_read: false }));

      if (!toInsert.length) return;
      const { data, error } = await supabase.from("alerts").insert(toInsert).select();
      if (!error && data?.length) {
        setAlerts((prev) => [...(data as Alert[]), ...prev]);
      }
    },
    [userId],
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    loadData();
  }, []);

  useEffect(() => {
    if (!loading && !alertsSynced) {
      syncAlerts(cards, alerts).finally(() => setAlertsSynced(true));
    }
  }, [loading, alertsSynced, cards, alerts, syncAlerts]);

  const periodDate = useMemo(() => {
    const [year, month] = period.split("-");
    const y = Number(year);
    const m = Number(month);
    if (!y || !m) return new Date();
    return new Date(y, m - 1, 1);
  }, [period]);

  const periodKey = useMemo(() => getMonthKey(periodDate), [periodDate]);

  const periodTransactions = useMemo(
    () => transactions.filter((tx) => getMonthKey(new Date(tx.occurred_at)) === periodKey),
    [transactions, periodKey],
  );

  const monthIncome = useMemo(
    () =>
      periodTransactions
        .filter((tx) => tx.type === "income")
        .reduce((sum, tx) => sum + toNumber(tx.amount), 0),
    [periodTransactions],
  );

  const monthExpense = useMemo(
    () =>
      periodTransactions
        .filter((tx) => tx.type === "expense" || tx.type === "card_payment")
        .reduce((sum, tx) => sum + toNumber(tx.amount), 0),
    [periodTransactions],
  );

  const availableBalance = useMemo(
    () => computeAvailableBalance(accounts, transactions),
    [accounts, transactions],
  );

  const forecastBalance = useMemo(
    () => computeForecastBalance(accounts, transactions),
    [accounts, transactions],
  );

  const categoryData = useMemo(
    () => groupByCategory(transactions, periodDate),
    [transactions, periodDate],
  );
  const insights = useMemo(() => calculateInsights(transactions, periodDate), [transactions, periodDate]);

  const cardSummaries = useMemo(
    () =>
      cards
        .filter((card) => !card.archived)
        .map((card) => ({ card, summary: computeCardSummary(card, transactions, periodDate) })),
    [cards, transactions, periodDate],
  );

  const markAlertRead = async (id: string) => {
    const { error } = await supabase.from("alerts").update({ is_read: true }).eq("id", id);
    if (error) {
      setMessage(toFriendlyDbError(error.message));
      return;
    }
    setAlerts((prev) => prev.map((alert) => (alert.id === id ? { ...alert, is_read: true } : alert)));
  };

  const askAi = async () => {
    setAiLoading(true);
    setAiAnswer(null);

    const response = await fetch("/api/ai/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month: period,
        question: aiQuestion,
        summary: {
          income: monthIncome,
          expense: monthExpense,
          categories: categoryData.slice(0, 6),
        },
      }),
    });

    const data = await response.json();
    setAiAnswer(data.answer || "Sem resposta no momento.");
    setAiLoading(false);
  };

  const actions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-900/55 transition"
        onClick={() => setPeriod(monthInputValue())}
      >
        Limpar filtro
      </button>
      <button
        type="button"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-900/55 transition"
        onClick={loadData}
      >
        Atualizar
      </button>
      <input
        type="month"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
        value={period}
        onChange={(event) => setPeriod(event.target.value)}
      />
    </div>
  );

  return (
    <AppShell title="Dashboard" subtitle="Resumo financeiro" actions={actions}>
      <div className="dashboard-cosmic">
        {message ? (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="glass-panel p-6 text-slate-300">Carregando...</div>
        ) : (
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard3D
                title="Saldo disponivel"
                value={brl(availableBalance)}
                subtitle="Saldo bancario total"
                iconSrc="/assets/3d/wallet.png"
                tone="violet"
              />
              <KpiCard3D
                title="Saldo previsto"
                value={brl(forecastBalance)}
                subtitle="Com base em movimentos futuros"
                iconSrc="/assets/3d/forecast.png"
                tone="neutral"
              />
              <KpiCard3D
                title={`Receitas (${period})`}
                value={brl(monthIncome)}
                subtitle="Entradas do periodo"
                iconSrc="/assets/3d/income.png"
                tone="emerald"
              />
              <KpiCard3D
                title={`Despesas (${period})`}
                value={brl(monthExpense)}
                subtitle={`Resultado: ${brl(monthIncome - monthExpense)}`}
                iconSrc="/assets/3d/expense.png"
                tone="blue"
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <div className="glass-panel p-5 xl:col-span-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-extrabold tracking-tight">Receitas x Despesas</h2>
                  <span className="text-xs text-slate-400">Periodo selecionado</span>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr] md:items-center">
                  <ReceitasDespesasDonut receitas={monthIncome} despesas={monthExpense} />

                  <div className="grid gap-3">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Total movimentado</p>
                      <p className="mt-1 text-2xl font-extrabold text-slate-100">{brl(monthIncome + monthExpense)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Resultado liquido</p>
                      <p className={`mt-1 text-2xl font-extrabold ${monthIncome - monthExpense >= 0 ? "text-emerald-300" : "text-blue-300"}`}>
                        {brl(monthIncome - monthExpense)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass-panel p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-extrabold tracking-tight">Categorias</h2>
                  <span className="text-xs text-slate-400">{period}</span>
                </div>
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={86} paddingAngle={1}>
                        {categoryData.map((_, index) => (
                          <Cell key={`cat-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <div className="glass-panel p-5">
                <h2 className="text-xl font-extrabold tracking-tight">Insights</h2>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  <p>
                    Top categoria: <strong className="text-slate-100">{insights.topCategory?.name ?? "Sem dados"}</strong>
                  </p>
                  <p>
                    Valor top: <strong className="text-slate-100">{insights.topCategory ? brl(insights.topCategory.value) : "-"}</strong>
                  </p>
                  <p>
                    Variacao vs mes anterior: <strong className="text-slate-100">{formatPercent(insights.deltaPct)}</strong>
                  </p>
                  <p>
                    Total de lancamentos no periodo: <strong className="text-slate-100">{periodTransactions.length}</strong>
                  </p>
                </div>
              </div>

              <div className="glass-panel p-5 xl:col-span-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-extrabold tracking-tight">Cartoes</h2>
                  <span className="text-xs text-slate-400">Faturas e limites</span>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {cardSummaries.map(({ card, summary }) => (
                    <div key={card.id} className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-slate-400">{card.issuer || "Titular"}</p>
                          <p className="font-bold">{card.name}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            Fecha dia {card.closing_day} | Vence dia {card.due_day}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-400">Fatura atual</p>
                          <p className="text-lg font-extrabold">{brl(summary.currentTotal)}</p>
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="text-xs text-slate-400">Limite usado</p>
                        <div className="mt-2 h-2 rounded-full border border-white/10 bg-slate-900/45 overflow-hidden">
                          <div
                            className="h-full bg-blue-400"
                            style={{
                              width: `${card.limit_total ? Math.min((summary.limitUsed / card.limit_total) * 100, 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-3 text-sm">
                        <div>
                          <p className="text-xs text-slate-400">Limite usado</p>
                          <p className="font-extrabold text-blue-300">{brl(summary.limitUsed)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Limite disponivel</p>
                          <p className="font-extrabold text-emerald-300">{brl(summary.limitAvailable)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Limite total</p>
                          <p className="font-extrabold">{brl(card.limit_total)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Fechamento</p>
                          <p className="font-semibold">Todo dia {card.closing_day}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Vencimento</p>
                          <p className="font-semibold">Todo dia {card.due_day}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Fatura prevista</p>
                          <p className="font-extrabold">{brl(summary.forecastTotal)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!cardSummaries.length ? <div className="text-sm text-slate-300">Nenhum cartao cadastrado.</div> : null}
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <div className="glass-panel p-5">
                <h2 className="text-xl font-extrabold tracking-tight">Alertas</h2>
                <div className="mt-3 space-y-2">
                  {alerts.length ? (
                    alerts.map((alert) => (
                      <div key={alert.id} className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                        <div className="font-semibold">{alert.title}</div>
                        <div className="text-sm text-slate-300 mt-1">{alert.body}</div>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                          <span>{alert.due_at ?? "Sem data"}</span>
                          {!alert.is_read ? (
                            <button
                              type="button"
                              className="rounded-lg border border-white/10 bg-slate-900/45 px-2 py-1 text-xs font-semibold"
                              onClick={() => markAlertRead(alert.id)}
                            >
                              Marcar como lido
                            </button>
                          ) : (
                            <span>Lido</span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-300">Sem alertas no momento.</div>
                  )}
                </div>
              </div>

              <div className="glass-panel p-5">
                <h2 className="text-xl font-extrabold tracking-tight">ChatGPT</h2>
                <p className="text-sm text-slate-300 mt-1">
                  Pergunte sobre seus dados: onde estou gastando mais? como reduzir custos?
                </p>
                <textarea
                  className="mt-3 w-full h-28 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100 outline-none"
                  placeholder="Digite sua pergunta"
                  value={aiQuestion}
                  onChange={(event) => setAiQuestion(event.target.value)}
                />
                <button
                  type="button"
                  className="mt-3 rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-bold shadow-softer disabled:opacity-60"
                  onClick={askAi}
                  disabled={aiLoading}
                >
                  {aiLoading ? "Analisando..." : "Gerar insight"}
                </button>
                {aiAnswer ? (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-sm text-slate-200">{aiAnswer}</div>
                ) : null}
              </div>
            </section>

            <section className="glass-panel p-5">
              <h2 className="text-xl font-extrabold tracking-tight">Despesas por categoria</h2>
              <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData}>
                    <XAxis dataKey="name" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
