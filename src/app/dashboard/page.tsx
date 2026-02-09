"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { brl, formatPercent, toNumber } from "@/lib/money";
import {
  Account,
  Alert,
  Card,
  Transaction,
  buildCardAlerts,
  buildMonthlySeries,
  calculateInsights,
  computeAvailableBalance,
  computeCardSummary,
  computeForecastBalance,
  groupByCategory,
  getMonthKey,
} from "@/lib/finance";

const COLORS = ["#38bdf8", "#818cf8", "#f472b6", "#f59e0b", "#22c55e"];

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertsSynced, setAlertsSynced] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [accountsRes, cardsRes, txRes, alertRes] = await Promise.all([
      supabase.from("accounts").select("*").order("created_at"),
      supabase.from("cards").select("*").order("created_at"),
      supabase
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(500),
      supabase.from("alerts").select("*").order("created_at", { ascending: false }),
    ]);

    setAccounts((accountsRes.data as Account[]) || []);
    setCards((cardsRes.data as Card[]) || []);
    setTransactions((txRes.data as Transaction[]) || []);
    setAlerts((alertRes.data as Alert[]) || []);
    setLoading(false);
  };

  const syncAlerts = useCallback(
    async (currentCards: Card[], existing: Alert[]) => {
      if (!currentCards.length || !userId) return;
      const generated = buildCardAlerts(currentCards.filter((c) => !c.archived));
      if (!generated.length) return;

      const existingKeys = new Set(
        existing.map((alert) => `${alert.type}-${alert.card_id}-${alert.due_at}`),
      );

      const toInsert = generated
        .filter(
          (alert) => !existingKeys.has(`${alert.type}-${alert.card_id}-${alert.due_at}`),
        )
        .map((alert) => ({
          user_id: userId,
          ...alert,
          is_read: false,
        }));

      if (!toInsert.length) return;
      const { data } = await supabase.from("alerts").insert(toInsert).select();
      if (data?.length) {
        setAlerts((prev) => [...data, ...prev]);
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

  const monthKey = getMonthKey(new Date());
  const monthTxs = useMemo(
    () => transactions.filter((tx) => getMonthKey(new Date(tx.occurred_at)) === monthKey),
    [transactions, monthKey],
  );

  const monthIncome = monthTxs
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + toNumber(tx.amount), 0);
  const monthExpense = monthTxs
    .filter((tx) => tx.type === "expense" || tx.type === "card_payment")
    .reduce((sum, tx) => sum + toNumber(tx.amount), 0);

  const availableBalance = computeAvailableBalance(accounts, transactions);
  const forecastBalance = computeForecastBalance(accounts, transactions);

  const monthlySeries = useMemo(
    () => buildMonthlySeries(transactions),
    [transactions],
  );

  const categoryData = useMemo(
    () => groupByCategory(transactions),
    [transactions],
  );

  const insights = useMemo(
    () => calculateInsights(transactions),
    [transactions],
  );

  const cardSummaries = useMemo(
    () =>
      cards
        .filter((card) => !card.archived)
        .map((card) => ({ card, summary: computeCardSummary(card, transactions) })),
    [cards, transactions],
  );

  const handleAskAi = async () => {
    setAiLoading(true);
    setAiAnswer(null);

    const payload = {
      month: monthKey,
      question: aiQuestion,
      summary: {
        income: monthIncome,
        expense: monthExpense,
        categories: categoryData.slice(0, 6),
      },
    };

    const res = await fetch("/api/ai/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setAiAnswer(data.answer || data.message || "Sem resposta agora.");
    setAiLoading(false);
  };

  return (
    <AppShell title="Dashboard" subtitle="Resumo geral do seu dinheiro">
      {loading ? (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-6 text-slate-300">
          Carregando dados...
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <section className="grid gap-4 lg:grid-cols-4">
            <div className="glass rounded-2xl p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Saldo disponivel
              </p>
              <p className="mt-3 text-2xl font-semibold text-white">
                {brl(availableBalance)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Previsto: {brl(forecastBalance)}
              </p>
            </div>
            <div className="glass rounded-2xl p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Receitas do mes
              </p>
              <p className="mt-3 text-2xl font-semibold text-emerald-300">
                {brl(monthIncome)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Base: {format(new Date(), "MMMM yyyy")}
              </p>
            </div>
            <div className="glass rounded-2xl p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Despesas do mes
              </p>
              <p className="mt-3 text-2xl font-semibold text-rose-300">
                {brl(monthExpense)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Variacao: {formatPercent(insights.deltaPct)}
              </p>
            </div>
            <div className="glass rounded-2xl p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Resultado do mes
              </p>
              <p className="mt-3 text-2xl font-semibold text-white">
                {brl(monthIncome - monthExpense)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Top categoria: {insights.topCategory?.name ?? "--"}
              </p>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <div className="glass rounded-2xl p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Receitas x Despesas</h2>
                <span className="text-xs text-slate-400">Ultimos 12 meses</span>
              </div>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlySeries}>
                    <XAxis dataKey="month" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #1e293b",
                      }}
                    />
                    <Line type="monotone" dataKey="income" stroke="#34d399" strokeWidth={2} />
                    <Line type="monotone" dataKey="expense" stroke="#fb7185" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Categorias</h2>
                <span className="text-xs text-slate-400">Mes atual</span>
              </div>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #1e293b",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                {categoryData.slice(0, 4).map((cat) => (
                  <div key={cat.name} className="flex justify-between text-slate-300">
                    <span>{cat.name}</span>
                    <span>{brl(cat.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <div className="glass rounded-2xl p-5">
              <h2 className="text-lg font-semibold">Insights rapidos</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                <li>
                  Top categoria: <strong>{insights.topCategory?.name ?? "Sem dados"}</strong> com
                  {" "}
                  <strong>{insights.topCategory ? brl(insights.topCategory.value) : "--"}</strong>.
                </li>
                <li>
                  Variacao vs mes anterior: <strong>{formatPercent(insights.deltaPct)}</strong>.
                </li>
                <li>
                  Total de transacoes neste mes: <strong>{monthTxs.length}</strong>.
                </li>
              </ul>
            </div>

            <div className="glass rounded-2xl p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Cartoes</h2>
                <span className="text-xs text-slate-400">Limites e faturas</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {cardSummaries.map(({ card, summary }) => (
                  <div key={card.id} className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white">{card.name}</p>
                        <p className="text-xs text-slate-400">Fecha dia {card.closing_day} • Vence dia {card.due_day}</p>
                      </div>
                      <span className="text-xs text-slate-400">{card.issuer ?? ""}</span>
                    </div>
                    <div className="mt-3 text-sm text-slate-300">
                      <div className="flex justify-between">
                        <span>Fatura atual</span>
                        <span>{brl(summary.currentTotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Prevista</span>
                        <span>{brl(summary.forecastTotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Limite disponivel</span>
                        <span>{brl(summary.limitAvailable)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {!cardSummaries.length && (
                  <div className="text-sm text-slate-500">Nenhum cartao cadastrado.</div>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="glass rounded-2xl p-5">
              <h2 className="text-lg font-semibold">Alertas</h2>
              <div className="mt-4 space-y-3">
                {alerts.length ? (
                  alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-2xl border border-slate-800/80 p-4 text-sm ${
                        alert.is_read ? "bg-slate-900/40" : "bg-slate-900/70"
                      }`}
                    >
                      <div className="font-semibold text-white">{alert.title}</div>
                      <div className="mt-2 text-slate-400">{alert.body}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">Sem alertas no momento.</div>
                )}
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <h2 className="text-lg font-semibold">ChatGPT Insights</h2>
              <p className="mt-2 text-sm text-slate-400">
                Pergunte algo sobre seus gastos e receitas. Ex: onde estou exagerando?
              </p>
              <textarea
                className="mt-4 h-28 w-full rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-sm text-white"
                placeholder="Digite sua pergunta"
                value={aiQuestion}
                onChange={(event) => setAiQuestion(event.target.value)}
              />
              <button
                className="mt-3 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
                onClick={handleAskAi}
                disabled={aiLoading}
              >
                {aiLoading ? "Analisando..." : "Gerar insight"}
              </button>
              {aiAnswer && (
                <div className="mt-4 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 text-sm text-slate-200">
                  {aiAnswer}
                </div>
              )}
            </div>
          </section>

          <section className="glass rounded-2xl p-5">
            <h2 className="text-lg font-semibold">Fluxo por categoria</h2>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData}>
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #1e293b",
                    }}
                  />
                  <Bar dataKey="value" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
