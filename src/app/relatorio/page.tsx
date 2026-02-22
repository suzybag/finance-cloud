"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ClipboardList,
  Download,
  History,
  Mail,
  Medal,
  PieChart as PieChartIcon,
  RefreshCcw,
  Sparkles,
  Tag,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { CategoryIcon } from "@/components/CategoryIcon";
import { supabase } from "@/lib/supabaseClient";

type MonthlyExpenseRow = {
  id: string;
  date: string;
  description: string;
  category: string;
  categoryIconName: string;
  categoryIconColor: string;
  amount: number;
  expenseType: string;
  source: "transacao" | "investimento";
};

type MonthlyCategoryTotal = {
  category: string;
  categoryIconName: string;
  categoryIconColor: string;
  total: number;
  percent: number;
};

type MonthlyReportSummary = {
  month: string;
  monthLabel: string;
  total: number;
  previousTotal: number;
  delta: number;
  deltaPercent: number | null;
  topCategory: string | null;
  topCategoryTotal: number;
  categoryTotals: MonthlyCategoryTotal[];
  topExpenses: MonthlyExpenseRow[];
  rowCount: number;
  insights: string[];
  aiInsights: string[];
  heuristicInsights: string[];
  warnings: string[];
};

type MonthlyReportResponse = {
  ok: boolean;
  report?: {
    rows: MonthlyExpenseRow[];
    summary: MonthlyReportSummary;
  };
  message?: string;
};

type MonthlyReportDelivery = {
  id: string;
  reference_month: string;
  recipient_email: string | null;
  total_amount: number;
  status: "pending" | "sent" | "error" | "skipped";
  details: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type MonthlyHistoryResponse = {
  ok: boolean;
  history?: MonthlyReportDelivery[];
  warning?: string;
  message?: string;
};

const PIE_COLORS = [
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#22c55e",
  "#f59e0b",
  "#f43f5e",
  "#3b82f6",
  "#14b8a6",
];

const currentMonth = () => new Date().toISOString().slice(0, 7);

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);

const formatDateLabel = (isoDate: string) => {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

const getDeltaLabel = (value: number | null) => {
  if (value === null) return "Sem base";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2).replace(".", ",")}%`;
};

const getDeltaColor = (value: number | null) => {
  if (value === null) return "text-slate-300";
  if (value < 0) return "text-emerald-300";
  if (value > 0) return "text-rose-300";
  return "text-slate-300";
};

const parseFilename = (header: string | null, fallback: string) => {
  if (!header) return fallback;
  const utf = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf?.[1]) return decodeURIComponent(utf[1]);
  const plain = header.match(/filename="?([^"]+)"?/i);
  if (plain?.[1]) return plain[1];
  return fallback;
};

const formatMonthReference = (isoDate: string) => {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(parsed);
};

const statusPillClass = (status: MonthlyReportDelivery["status"]) => {
  if (status === "sent") return "border-emerald-400/35 bg-emerald-500/15 text-emerald-200";
  if (status === "error") return "border-rose-400/35 bg-rose-500/15 text-rose-200";
  if (status === "skipped") return "border-amber-400/35 bg-amber-500/15 text-amber-200";
  return "border-slate-400/35 bg-slate-500/15 text-slate-200";
};

const statusLabel = (status: MonthlyReportDelivery["status"]) => {
  if (status === "sent") return "Enviado";
  if (status === "error") return "Erro";
  if (status === "skipped") return "Ignorado";
  return "Pendente";
};

export default function RelatorioPage() {
  const [monthFilter, setMonthFilter] = useState(currentMonth());
  const [emailTo, setEmailTo] = useState("");
  const [showAllRows, setShowAllRows] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reportRows, setReportRows] = useState<MonthlyExpenseRow[]>([]);
  const [summary, setSummary] = useState<MonthlyReportSummary | null>(null);
  const [historyItems, setHistoryItems] = useState<MonthlyReportDelivery[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyWarning, setHistoryWarning] = useState<string | null>(null);

  const getSessionToken = useCallback(async () => {
    const sessionRes = await supabase.auth.getSession();
    return sessionRes.data.session?.access_token || null;
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setFeedback(null);

    const token = await getSessionToken();
    if (!token) {
      setFeedback("Sessao nao encontrada. Faca login novamente.");
      setLoading(false);
      return;
    }

    const response = await fetch(`/api/reports/monthly/summary?month=${encodeURIComponent(monthFilter)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const data = (await response.json().catch(() => ({}))) as MonthlyReportResponse;
    if (!response.ok || !data.ok || !data.report) {
      setFeedback(data.message || "Falha ao carregar relatorio.");
      setLoading(false);
      return;
    }

    setReportRows(data.report.rows || []);
    setSummary(data.report.summary || null);
    setShowAllRows(false);
    setLoading(false);
  }, [getSessionToken, monthFilter]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryWarning(null);

    const token = await getSessionToken();
    if (!token) {
      setHistoryWarning("Sessao nao encontrada para carregar historico.");
      setHistoryLoading(false);
      return;
    }

    const response = await fetch("/api/reports/monthly/history?limit=12", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const data = (await response.json().catch(() => ({}))) as MonthlyHistoryResponse;
    if (!response.ok || !data.ok) {
      setHistoryWarning(data.message || "Falha ao carregar historico.");
      setHistoryItems([]);
      setHistoryLoading(false);
      return;
    }

    setHistoryItems(data.history || []);
    setHistoryWarning(data.warning || null);
    setHistoryLoading(false);
  }, [getSessionToken]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleExport = async () => {
    setExporting(true);
    setFeedback(null);

    const token = await getSessionToken();
    if (!token) {
      setFeedback("Sessao nao encontrada. Faca login novamente.");
      setExporting(false);
      return;
    }

    const response = await fetch(`/api/reports/monthly/excel?month=${encodeURIComponent(monthFilter)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({} as { message?: string }));
      setFeedback(errorBody.message || "Falha ao exportar Excel.");
      setExporting(false);
      return;
    }

    const blob = await response.blob();
    const filename = parseFilename(
      response.headers.get("content-disposition"),
      `relatorio-gastos-${monthFilter}.xlsx`,
    );

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    setExporting(false);
  };

  const handleSendEmail = async () => {
    setSendingEmail(true);
    setFeedback(null);

    const token = await getSessionToken();
    if (!token) {
      setFeedback("Sessao nao encontrada. Faca login novamente.");
      setSendingEmail(false);
      return;
    }

    const response = await fetch("/api/reports/monthly/email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        month: monthFilter,
        to: emailTo.trim() || undefined,
      }),
    });

    const data = (await response.json().catch(() => ({} as { ok?: boolean; message?: string; to?: string }))) || {};
    if (!response.ok || !data.ok) {
      setFeedback(data.message || "Falha ao enviar email.");
      setSendingEmail(false);
      return;
    }

    setFeedback(`Relatorio enviado por email para ${data.to || "seu endereco cadastrado"}.`);
    await loadHistory();
    setSendingEmail(false);
  };

  const pieData = useMemo(
    () =>
      (summary?.categoryTotals || []).map((item) => ({
        name: item.category,
        value: item.total,
        percent: item.percent,
        iconName: item.categoryIconName,
        iconColor: item.categoryIconColor,
      })),
    [summary],
  );

  const rankingData = useMemo(
    () => summary?.topExpenses || [],
    [summary],
  );

  const insights = useMemo(
    () => summary?.insights || [],
    [summary],
  );

  const topCategoryItem = useMemo(
    () => summary?.categoryTotals?.[0] || null,
    [summary],
  );

  const topCategories = useMemo(
    () => (summary?.categoryTotals || []).slice(0, 6),
    [summary],
  );

  const daysInReferenceMonth = useMemo(() => {
    const ref = summary?.month || monthFilter;
    const [yearRaw, monthRaw] = ref.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month) || year <= 0 || month <= 0) return 30;
    return new Date(year, month, 0).getDate();
  }, [monthFilter, summary?.month]);

  const averagePerItem = useMemo(
    () => (summary?.rowCount ? summary.total / summary.rowCount : 0),
    [summary],
  );

  const averagePerDay = useMemo(
    () => (summary ? summary.total / Math.max(daysInReferenceMonth, 1) : 0),
    [daysInReferenceMonth, summary],
  );

  const displayRows = useMemo(
    () => (showAllRows ? reportRows : reportRows.slice(0, 12)),
    [reportRows, showAllRows],
  );

  const hasMoreRows = reportRows.length > 12;

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="month"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
        value={monthFilter}
        onChange={(event) => setMonthFilter(event.target.value)}
      />
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/55"
        onClick={() => void loadReport()}
      >
        <RefreshCcw className="h-4 w-4" />
        Atualizar
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-xl border border-violet-300/30 bg-violet-500/20 px-3 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:opacity-60"
        onClick={() => void handleExport()}
        disabled={exporting || loading}
      >
        <Download className="h-4 w-4" />
        {exporting ? "Exportando..." : "Exportar Excel"}
      </button>
    </div>
  );

  return (
    <AppShell
      title="Relatorios"
      subtitle="Dashboard mensal com analise de gastos, insights e exportacao Excel"
      actions={actions}
    >
      <div className="space-y-4">
        {feedback ? (
          <div className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100">
            {feedback}
          </div>
        ) : null}

        {summary?.warnings?.length ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {summary.warnings.join(" | ")}
          </div>
        ) : null}

        {loading || !summary ? (
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-6 text-slate-300">
            Carregando relatorio...
          </div>
        ) : (
          <>
            <section className="rounded-3xl border border-violet-300/20 bg-[linear-gradient(165deg,rgba(21,14,41,0.92),rgba(8,10,19,0.94))] p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-violet-300/30 bg-violet-500/15 text-violet-100">
                  <BarChart3 className="h-4.5 w-4.5" />
                </span>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-100">Resumo rapido do mes</h2>
                  <p className="text-xs text-slate-400">Informacoes principais organizadas em blocos simples.</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-violet-300/20 bg-slate-950/35 p-3">
                  <p className="text-xs text-slate-400">Total gasto</p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-100">{formatCurrency(summary.total)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{summary.monthLabel}</p>
                </div>

                <div className="rounded-2xl border border-violet-300/20 bg-slate-950/35 p-3">
                  <p className="text-xs text-slate-400">Media por item</p>
                  <p className="mt-1 text-xl font-extrabold text-cyan-200">{formatCurrency(averagePerItem)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{summary.rowCount} lancamentos</p>
                </div>

                <div className="rounded-2xl border border-violet-300/20 bg-slate-950/35 p-3">
                  <p className="text-xs text-slate-400">Media por dia</p>
                  <p className="mt-1 text-xl font-extrabold text-emerald-200">{formatCurrency(averagePerDay)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{daysInReferenceMonth} dias no periodo</p>
                </div>

                <div className="rounded-2xl border border-violet-300/20 bg-slate-950/35 p-3">
                  <p className="text-xs text-slate-400">Categoria lider</p>
                  <div className="mt-1 flex items-center gap-2">
                    <CategoryIcon
                      categoryName={topCategoryItem?.category || summary.topCategory || "Sem categoria"}
                      iconName={topCategoryItem?.categoryIconName}
                      iconColor={topCategoryItem?.categoryIconColor}
                      size={13}
                      circleSize={28}
                    />
                    <p className="line-clamp-1 text-base font-extrabold text-violet-200">
                      {summary.topCategory || "Sem categoria"}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{formatCurrency(summary.topCategoryTotal)}</p>
                </div>

                <div className="rounded-2xl border border-violet-300/20 bg-slate-950/35 p-3">
                  <p className="text-xs text-slate-400">Vs mes anterior</p>
                  <p className={`mt-1 text-xl font-extrabold ${getDeltaColor(summary.deltaPercent)}`}>
                    {getDeltaLabel(summary.deltaPercent)}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
                    {summary.delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    Delta {summary.delta >= 0 ? "+" : "-"}{formatCurrency(Math.abs(summary.delta))}
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-500/10 text-cyan-100">
                    <PieChartIcon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-100">Categorias do mes</h2>
                    <p className="text-xs text-slate-400">Visual simples da distribuicao por categoria.</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
                  <div className="relative h-[290px] rounded-2xl border border-white/10 bg-slate-900/30 p-2">
                    {pieData.length ? (
                      <>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={102}
                              innerRadius={63}
                              label={false}
                              labelLine={false}
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value) => formatCurrency(Number(value ?? 0))}
                              contentStyle={{
                                background: "#0f172acc",
                                border: "1px solid rgba(148,163,184,0.3)",
                                borderRadius: "12px",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>

                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="rounded-2xl border border-violet-300/20 bg-slate-950/80 px-3 py-2 text-center">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Total</p>
                            <p className="text-sm font-extrabold text-slate-100">{formatCurrency(summary.total)}</p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-xl border border-white/10 bg-slate-900/40 text-sm text-slate-300">
                        Sem gastos para plotar no grafico.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {topCategories.length ? (
                      topCategories.map((item, index) => (
                        <div key={`${item.category}-${index}`} className="rounded-xl border border-white/10 bg-slate-900/45 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <CategoryIcon
                                categoryName={item.category}
                                iconName={item.categoryIconName}
                                iconColor={item.categoryIconColor}
                                size={12}
                                circleSize={24}
                              />
                              <p className="truncate text-sm font-semibold text-slate-100">{item.category}</p>
                            </div>
                            <p className="text-xs font-semibold text-cyan-200">{item.percent.toFixed(1).replace(".", ",")}%</p>
                          </div>

                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cyan-400/80 to-violet-400/80"
                              style={{ width: `${Math.max(Math.min(item.percent, 100), 2)}%` }}
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-slate-400">{formatCurrency(item.total)}</p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-sm text-slate-300">
                        Nenhuma categoria para mostrar.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-500/10 text-amber-100">
                    <Medal className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-100">Ranking simplificado</h2>
                    <p className="text-xs text-slate-400">Top gastos com maior impacto no resultado.</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {rankingData.length ? (
                    rankingData.slice(0, 6).map((row, index) => {
                      const badgeClass =
                        index === 0
                          ? "border-amber-300/40 bg-amber-500/15 text-amber-200"
                          : index === 1
                            ? "border-slate-300/35 bg-slate-500/15 text-slate-200"
                            : index === 2
                              ? "border-orange-300/40 bg-orange-500/15 text-orange-200"
                              : "border-slate-500/30 bg-slate-800/50 text-slate-300";

                      return (
                        <div key={`${row.id}-${index}`} className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="mb-1 flex items-center gap-2">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
                                  #{index + 1}
                                </span>
                                <p className="truncate text-sm font-semibold text-slate-100">{row.description}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                                <Tag className="h-3 w-3" />
                                <span>{row.category}</span>
                                <span>|</span>
                                <span>{formatDateLabel(row.date)}</span>
                                <span>|</span>
                                <span>{row.expenseType}</span>
                              </div>
                            </div>
                            <p className="shrink-0 text-sm font-extrabold text-rose-300">{formatCurrency(row.amount)}</p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-sm text-slate-300">
                      Nenhum gasto encontrado.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-500/10 text-cyan-100">
                      <ClipboardList className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <h2 className="text-lg font-extrabold text-slate-100">Detalhamento simplificado</h2>
                      <p className="text-xs text-slate-400">
                        Mostrando {displayRows.length} de {reportRows.length} lancamentos.
                      </p>
                    </div>
                  </div>

                  {hasMoreRows ? (
                    <button
                      type="button"
                      className="rounded-xl border border-white/10 bg-slate-900/45 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-900/70"
                      onClick={() => setShowAllRows((prev) => !prev)}
                    >
                      {showAllRows ? "Mostrar menos" : "Ver tudo"}
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-slate-400">
                        <th className="px-3 py-2 font-semibold">Data</th>
                        <th className="px-3 py-2 font-semibold">Item</th>
                        <th className="px-3 py-2 font-semibold">Categoria</th>
                        <th className="px-3 py-2 font-semibold text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row) => (
                        <tr key={row.id} className="border-b border-white/5">
                          <td className="px-3 py-2 text-slate-300">{formatDateLabel(row.date)}</td>
                          <td className="px-3 py-2">
                            <p className="max-w-[340px] truncate text-slate-100">{row.description}</p>
                            <p className="text-[11px] text-slate-500">{row.expenseType}</p>
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            <div className="flex items-center gap-2">
                              <CategoryIcon
                                categoryName={row.category}
                                iconName={row.categoryIconName}
                                iconColor={row.categoryIconColor}
                                size={11}
                                circleSize={22}
                              />
                              <span>{row.category}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-rose-300">{formatCurrency(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {!displayRows.length ? (
                    <div className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-sm text-slate-300">
                      Nenhum item para mostrar neste periodo.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4">
                <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-violet-300/30 bg-violet-500/12 text-violet-100">
                      <Sparkles className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <h2 className="text-lg font-extrabold text-slate-100">Insights resumidos</h2>
                      <p className="text-xs text-slate-400">Pontos de atencao em linguagem simples.</p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {insights.length ? (
                      insights.slice(0, 5).map((insight, index) => (
                        <div
                          key={`${index + 1}-${insight.slice(0, 20)}`}
                          className="rounded-xl border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-sm text-violet-100"
                        >
                          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-violet-300/30 bg-violet-500/20 text-[11px] font-semibold">
                            {index + 1}
                          </span>
                          {insight}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-sm text-slate-300">
                        Sem insights disponiveis no momento.
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                  <h2 className="text-lg font-extrabold text-slate-100">Enviar por email</h2>
                  <p className="text-xs text-slate-400">Envia resumo + planilha Excel em anexo.</p>
                  <input
                    type="email"
                    className="mt-3 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-slate-100"
                    placeholder="Opcional: outro email de destino"
                    value={emailTo}
                    onChange={(event) => setEmailTo(event.target.value)}
                  />
                  <button
                    type="button"
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300/30 bg-violet-500/20 px-3 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:opacity-60"
                    onClick={() => void handleSendEmail()}
                    disabled={sendingEmail || loading}
                  >
                    <Mail className="h-4 w-4" />
                    {sendingEmail ? "Enviando..." : "Enviar relatorio por email"}
                  </button>
                </section>

                <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-500/10 text-cyan-100">
                        <History className="h-4.5 w-4.5" />
                      </span>
                      <div>
                        <h2 className="text-lg font-extrabold text-slate-100">Historico de envio</h2>
                        <p className="text-xs text-slate-400">Ultimos relatorios gerados e enviados.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-xl border border-white/10 bg-slate-900/45 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-900/70 disabled:opacity-60"
                      onClick={() => void loadHistory()}
                      disabled={historyLoading}
                    >
                      Atualizar
                    </button>
                  </div>

                  {historyWarning ? (
                    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                      {historyWarning}
                    </div>
                  ) : null}

                  <div className="mt-3 space-y-2">
                    {historyLoading ? (
                      <div className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-sm text-slate-300">
                        Carregando historico...
                      </div>
                    ) : historyItems.length ? (
                      historyItems.map((item) => (
                        <div key={item.id} className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-100">
                              {formatMonthReference(item.reference_month)}
                            </p>
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusPillClass(item.status)}`}>
                              {statusLabel(item.status)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-300">
                            Total: {formatCurrency(Number(item.total_amount || 0))}
                          </p>
                          <p className="text-xs text-slate-400">
                            Destino: {item.recipient_email || "-"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.sent_at ? `Enviado em ${formatDateLabel(item.sent_at.slice(0, 10))}` : "Sem data de envio"}
                          </p>
                          {item.details ? (
                            <p className="mt-1 text-[11px] text-slate-400">{item.details}</p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-sm text-slate-300">
                        Nenhum envio registrado ainda.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
