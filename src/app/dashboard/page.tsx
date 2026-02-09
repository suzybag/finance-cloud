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

const COLORS = ["#22c55e", "#0ea5e9", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6"];

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

  const donutData = useMemo(
    () => [
      { name: "Receitas", value: monthIncome, color: "#22c55e" },
      { name: "Despesas", value: monthExpense, color: "#ef4444" },
    ],
    [monthIncome, monthExpense],
  );

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
        className="rounded-xl border border-stroke bg-card px-3 py-2 text-sm font-semibold hover:bg-appbg transition"
        onClick={() => setPeriod(monthInputValue())}
      >
        Limpar filtro
      </button>
      <button
        type="button"
        className="rounded-xl border border-stroke bg-card px-3 py-2 text-sm font-semibold hover:bg-appbg transition"
        onClick={loadData}
      >
        Atualizar
      </button>
      <input
        type="month"
        className="rounded-xl border border-stroke bg-card px-3 py-2 text-sm"
        value={period}
        onChange={(event) => setPeriod(event.target.value)}
      />
    </div>
  );

  return (
    <AppShell title="Dashboard" subtitle="Resumo financeiro" actions={actions}>
      {message ? (
        <div className="mb-4 rounded-xl border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl2 bg-card border border-stroke shadow-soft p-6 text-muted">Carregando...</div>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl2 bg-card border border-stroke shadow-soft p-4">
              <p className="text-sm text-muted">Saldo disponivel</p>
              <p className="mt-1 text-3xl font-extrabold">{brl(availableBalance)}</p>
              <p className="mt-1 text-xs text-muted">Saldo bancario total</p>
            </div>
            <div className="rounded-xl2 bg-card border border-stroke shadow-soft p-4">
              <p className="text-sm text-muted">Saldo previsto</p>
              <p className="mt-1 text-3xl font-extrabold">{brl(forecastBalance)}</p>
              <p className="mt-1 text-xs text-muted">Com base em movimentos futuros</p>
            </div>
            <div className="rounded-xl2 bg-card border border-stroke shadow-soft p-4">
              <p className="text-sm text-muted">Receitas ({period})</p>
              <p className="mt-1 text-3xl font-extrabold text-emerald-400">{brl(monthIncome)}</p>
              <p className="mt-1 text-xs text-muted">Entradas do periodo</p>
            </div>
            <div className="rounded-xl2 bg-card border border-stroke shadow-soft p-4">
              <p className="text-sm text-muted">Despesas ({period})</p>
              <p className="mt-1 text-3xl font-extrabold text-rose-400">{brl(monthExpense)}</p>
              <p className="mt-1 text-xs text-muted">Resultado: {brl(monthIncome - monthExpense)}</p>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-xl2 bg-card border border-stroke shadow-soft p-4 xl:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold">Receitas x despesas</h2>
                <span className="text-xs text-muted">Periodo selecionado</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={65}
                        outerRadius={100}
                        paddingAngle={4}
                      >
                        {donutData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col justify-center gap-3 text-sm">
                  {donutData.map((entry) => (
                    <div
                      key={entry.name}
                      className="flex items-center justify-between rounded-xl border border-stroke bg-appbg px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: entry.color }} />
                        <span className="font-semibold">{entry.name}</span>
                      </div>
                      <span className="font-extrabold">{brl(entry.value)}</span>
                    </div>
                  ))}
                  <div className="rounded-xl border border-stroke bg-card px-3 py-2">
                    <div className="text-xs text-muted">Resultado</div>
                    <div className="text-lg font-extrabold">{brl(monthIncome - monthExpense)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl2 bg-card border border-stroke shadow-soft p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold">Categorias</h2>
                <span className="text-xs text-muted">{period}</span>
              </div>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85}>
                      {categoryData.map((_, index) => (
                        <Cell key={`cat-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-xl2 bg-card border border-stroke shadow-soft p-4">
              <h2 className="text-xl font-extrabold">Insights</h2>
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  Top categoria: <strong>{insights.topCategory?.name ?? "Sem dados"}</strong>
                </p>
                <p>
                  Valor top: <strong>{insights.topCategory ? brl(insights.topCategory.value) : "-"}</strong>
                </p>
                <p>
                  Variacao vs mes anterior: <strong>{formatPercent(insights.deltaPct)}</strong>
                </p>
                <p>
                  Total de lancamentos no periodo: <strong>{periodTransactions.length}</strong>
                </p>
              </div>
            </div>

            <div className="rounded-xl2 bg-card border border-stroke shadow-soft p-4 xl:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold">Cartoes</h2>
                <span className="text-xs text-muted">Faturas e limites</span>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {cardSummaries.map(({ card, summary }) => (
                  <div key={card.id} className="rounded-xl border border-stroke bg-appbg p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-muted">{card.issuer || "Titular"}</p>
                        <p className="font-bold">{card.name}</p>
                        <p className="text-xs text-muted mt-1">
                          Fecha dia {card.closing_day} | Vence dia {card.due_day}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted">Fatura atual</p>
                        <p className="text-lg font-extrabold">{brl(summary.currentTotal)}</p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <p className="text-xs text-muted">Limite usado</p>
                      <div className="mt-2 h-2 rounded-full bg-card border border-stroke overflow-hidden">
                        <div
                          className="h-full bg-sky-400"
                          style={{
                            width: `${card.limit_total ? Math.min((summary.limitUsed / card.limit_total) * 100, 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-3 text-sm">
                      <div>
                        <p className="text-xs text-muted">Limite usado</p>
                        <p className="font-extrabold text-rose-400">{brl(summary.limitUsed)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Limite disponivel</p>
                        <p className="font-extrabold text-emerald-400">{brl(summary.limitAvailable)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Limite total</p>
                        <p className="font-extrabold">{brl(card.limit_total)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Fechamento</p>
                        <p className="font-semibold">Todo dia {card.closing_day}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Vencimento</p>
                        <p className="font-semibold">Todo dia {card.due_day}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Fatura prevista</p>
                        <p className="font-extrabold">{brl(summary.forecastTotal)}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {!cardSummaries.length ? <div className="text-sm text-muted">Nenhum cartao cadastrado.</div> : null}
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl2 bg-card border border-stroke shadow-soft p-4">
              <h2 className="text-xl font-extrabold">Alertas</h2>
              <div className="mt-3 space-y-2">
                {alerts.length ? (
                  alerts.map((alert) => (
                    <div key={alert.id} className="rounded-xl border border-stroke bg-appbg p-3">
                      <div className="font-semibold">{alert.title}</div>
                      <div className="text-sm text-muted mt-1">{alert.body}</div>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted">
                        <span>{alert.due_at ?? "Sem data"}</span>
                        {!alert.is_read ? (
                          <button
                            type="button"
                            className="rounded-lg border border-stroke bg-card px-2 py-1 text-xs font-semibold"
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
                  <div className="text-sm text-muted">Sem alertas no momento.</div>
                )}
              </div>
            </div>

            <div className="rounded-xl2 bg-card border border-stroke shadow-soft p-4">
              <h2 className="text-xl font-extrabold">ChatGPT</h2>
              <p className="text-sm text-muted mt-1">
                Pergunte sobre seus dados: onde estou gastando mais? como reduzir custos?
              </p>
              <textarea
                className="mt-3 w-full h-28 rounded-xl border border-stroke bg-appbg px-3 py-2 text-sm outline-none"
                placeholder="Digite sua pergunta"
                value={aiQuestion}
                onChange={(event) => setAiQuestion(event.target.value)}
              />
              <button
                type="button"
                className="mt-3 rounded-xl bg-greenbar text-white px-4 py-2 text-sm font-bold shadow-softer disabled:opacity-60"
                onClick={askAi}
                disabled={aiLoading}
              >
                {aiLoading ? "Analisando..." : "Gerar insight"}
              </button>
              {aiAnswer ? (
                <div className="mt-3 rounded-xl border border-stroke bg-appbg p-3 text-sm">{aiAnswer}</div>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl2 bg-card border border-stroke shadow-soft p-4">
            <h2 className="text-xl font-extrabold">Despesas por categoria</h2>
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData}>
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Bar dataKey="value" fill="#22c55e" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
