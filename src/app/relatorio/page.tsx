"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
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

type PieDatum = {
  name: string;
  value: number;
  percent: number;
  iconName: string;
  iconColor: string;
};

const PIE_COLORS = [
  "#38bdf8",
  "#22d3ee",
  "#14b8a6",
  "#34d399",
  "#f59e0b",
  "#f97316",
  "#60a5fa",
  "#84cc16",
];

const CARD_CLASS = "rounded-2xl border border-white/10 bg-zinc-900/70 p-5 backdrop-blur-xl";

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
  if (value === null) return "text-zinc-200";
  if (value < 0) return "text-emerald-300";
  if (value > 0) return "text-rose-300";
  return "text-zinc-200";
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
  const parsed = new Date(`${isoDate}-01T00:00:00`);
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
  return "border-zinc-400/35 bg-zinc-500/15 text-zinc-200";
};

const statusLabel = (status: MonthlyReportDelivery["status"]) => {
  if (status === "sent") return "Enviado";
  if (status === "error") return "Erro";
  if (status === "skipped") return "Ignorado";
  return "Pendente";
};

type ReportHeaderProps = {
  monthFilter: string;
  exporting: boolean;
  loading: boolean;
  onMonthChange: (value: string) => void;
  onRefresh: () => void;
  onExport: () => void;
};

function ReportHeader({
  monthFilter,
  exporting,
  loading,
  onMonthChange,
  onRefresh,
  onExport,
}: ReportHeaderProps) {
  return (
    <section className={CARD_CLASS}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-50">Relatorios</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Visao mensal clara para acompanhar gastos e tendencias.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="month"
            className="h-10 rounded-xl border border-white/10 bg-zinc-950/70 px-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-300/40"
            value={monthFilter}
            onChange={(event) => onMonthChange(event.target.value)}
          />

          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/65 px-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800/80"
            onClick={onRefresh}
          >
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </button>

          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-500/20 px-3.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/30 disabled:opacity-60"
            onClick={onExport}
            disabled={exporting || loading}
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exportando..." : "Exportar Excel"}
          </button>
        </div>
      </div>
    </section>
  );
}

type ReportKpisProps = {
  summary: MonthlyReportSummary;
  averagePerDay: number;
  daysInReferenceMonth: number;
  topCategoryItem: MonthlyCategoryTotal | null;
};

function ReportKpis({
  summary,
  averagePerDay,
  daysInReferenceMonth,
  topCategoryItem,
}: ReportKpisProps) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4 backdrop-blur-xl">
        <p className="text-xs text-zinc-400">Total gasto</p>
        <p className="mt-2 text-2xl font-extrabold text-zinc-50">{formatCurrency(summary.total)}</p>
        <p className="mt-1 text-xs text-zinc-500">{summary.monthLabel}</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4 backdrop-blur-xl">
        <p className="text-xs text-zinc-400">Media por dia</p>
        <p className="mt-2 text-2xl font-extrabold text-cyan-200">{formatCurrency(averagePerDay)}</p>
        <p className="mt-1 text-xs text-zinc-500">{daysInReferenceMonth} dias no periodo</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4 backdrop-blur-xl">
        <p className="text-xs text-zinc-400">Categoria lider</p>
        <div className="mt-2 flex items-center gap-2">
          <CategoryIcon
            categoryName={topCategoryItem?.category || summary.topCategory || "Sem categoria"}
            iconName={topCategoryItem?.categoryIconName}
            iconColor={topCategoryItem?.categoryIconColor}
            size={13}
            circleSize={28}
          />
          <p className="line-clamp-1 text-lg font-bold text-zinc-100">{summary.topCategory || "Sem categoria"}</p>
        </div>
        <p className="mt-1 text-xs text-zinc-500">{formatCurrency(summary.topCategoryTotal)}</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4 backdrop-blur-xl">
        <p className="text-xs text-zinc-400">Variacao vs mes anterior</p>
        <p className={`mt-2 text-2xl font-extrabold ${getDeltaColor(summary.deltaPercent)}`}>
          {getDeltaLabel(summary.deltaPercent)}
        </p>
        {summary.deltaPercent === null ? (
          <p className="mt-1 text-xs text-zinc-500">Sem base comparativa no mes anterior</p>
        ) : (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-500">
            {summary.delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            Delta {summary.delta >= 0 ? "+" : "-"}{formatCurrency(Math.abs(summary.delta))}
          </p>
        )}
      </div>
    </section>
  );
}

type CategoryChartCardProps = {
  pieData: PieDatum[];
  summary: MonthlyReportSummary;
  topCategories: MonthlyCategoryTotal[];
};

function CategoryChartCard({ pieData, summary, topCategories }: CategoryChartCardProps) {
  return (
    <div className={CARD_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-zinc-950/65 text-zinc-100">
            <PieChartIcon className="h-4.5 w-4.5" />
          </span>
          <div>
          <h2 className="text-xl font-bold text-zinc-50">Categorias</h2>
          <p className="text-sm text-zinc-400">Distribuicao dos gastos do mes por categoria.</p>
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-zinc-950/60 px-2.5 py-1 text-xs text-zinc-300">
          {pieData.length} categorias
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="relative h-[290px] rounded-2xl border border-white/10 bg-zinc-950/45 p-2">
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
                    outerRadius={105}
                    innerRadius={62}
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
                      background: "rgba(24,24,27,0.92)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-2xl border border-white/10 bg-zinc-900/85 px-3 py-2 text-center">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Total</p>
                  <p className="text-sm font-extrabold text-zinc-100">{formatCurrency(summary.total)}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-white/10 bg-zinc-900/60 text-sm text-zinc-300">
              Sem gastos para plotar no grafico.
            </div>
          )}
        </div>

        <div className="space-y-2.5">
          {topCategories.length ? (
            topCategories.map((item, index) => (
              <div key={`${item.category}-${index}`} className="rounded-xl border border-white/10 bg-zinc-950/55 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                    />
                    <CategoryIcon
                      categoryName={item.category}
                      iconName={item.categoryIconName}
                      iconColor={item.categoryIconColor}
                      size={12}
                      circleSize={24}
                    />
                    <p className="truncate text-sm font-semibold text-zinc-100">{item.category}</p>
                  </div>
                  <p className="text-xs font-semibold text-cyan-200">
                    {item.percent.toFixed(1).replace(".", ",")}%
                  </p>
                </div>
                <p className="mt-1 text-xs text-zinc-400">{formatCurrency(item.total)}</p>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300">
              Nenhuma categoria para mostrar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type RankingCardProps = {
  rankingData: MonthlyExpenseRow[];
};

function RankingCard({ rankingData }: RankingCardProps) {
  return (
    <div className={CARD_CLASS}>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-zinc-950/65 text-zinc-100">
          <Medal className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="text-xl font-bold text-zinc-50">Top 5 gastos</h2>
          <p className="text-sm text-zinc-400">Ranking simplificado dos maiores valores.</p>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {rankingData.length ? (
          rankingData.slice(0, 5).map((row, index) => (
            <div key={`${row.id}-${index}`} className="rounded-xl border border-white/10 bg-zinc-950/55 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="inline-flex rounded-full border border-white/10 bg-zinc-900/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">
                      #{index + 1}
                    </span>
                    <p className="truncate text-sm font-semibold text-zinc-100">{row.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                    <Tag className="h-3 w-3" />
                    <span>{row.category}</span>
                    <span>|</span>
                    <span>{formatDateLabel(row.date)}</span>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-extrabold text-rose-300">{formatCurrency(row.amount)}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300">
            Nenhum gasto encontrado.
          </div>
        )}
      </div>
    </div>
  );
}

type TransactionsTableCardProps = {
  rows: MonthlyExpenseRow[];
  totalRows: number;
  hasMoreRows: boolean;
  showAllRows: boolean;
  onToggleRows: () => void;
};

function TransactionsTableCard({
  rows,
  totalRows,
  hasMoreRows,
  showAllRows,
  onToggleRows,
}: TransactionsTableCardProps) {
  return (
    <div className={CARD_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-zinc-950/65 text-zinc-100">
            <ClipboardList className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="text-xl font-bold text-zinc-50">Lancamentos</h2>
            <p className="text-sm text-zinc-400">Mostrando {rows.length} de {totalRows} itens do periodo.</p>
          </div>
        </div>

        {hasMoreRows ? (
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-zinc-900/65 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800/80"
            onClick={onToggleRows}
          >
            {showAllRows ? "Mostrar menos" : "Ver tudo"}
          </button>
        ) : null}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/45">
        <div className="max-h-[470px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur">
              <tr className="text-left text-zinc-400">
                <th className="px-4 py-3 font-semibold">Data</th>
                <th className="px-4 py-3 font-semibold">Item</th>
                <th className="px-4 py-3 font-semibold">Categoria</th>
                <th className="px-4 py-3 text-right font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-white/5">
                  <td className="px-4 py-3 text-zinc-300">{formatDateLabel(row.date)}</td>
                  <td className="px-4 py-3">
                    <p className="max-w-[360px] truncate text-zinc-100">{row.description}</p>
                    <p className="text-xs text-zinc-500">{row.expenseType}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
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
                  <td className="px-4 py-3 text-right font-semibold text-rose-300">{formatCurrency(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!rows.length ? (
          <div className="px-4 py-3 text-sm text-zinc-300">
            Nenhum item para mostrar neste periodo.
          </div>
        ) : null}
      </div>
    </div>
  );
}

type InsightsCardProps = {
  insights: string[];
};

function InsightsCard({ insights }: InsightsCardProps) {
  const [showAllInsights, setShowAllInsights] = useState(false);

  const visibleInsights = showAllInsights ? insights : insights.slice(0, 3);
  const hasMoreInsights = insights.length > 3;

  return (
    <section className={CARD_CLASS}>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-zinc-950/65 text-zinc-100">
          <Sparkles className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="text-xl font-bold text-zinc-50">Insights</h2>
          <p className="text-sm text-zinc-400">Resumo rapido com foco no que importa.</p>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {visibleInsights.length ? (
          visibleInsights.map((insight, index) => (
            <div key={`${index + 1}-${insight.slice(0, 24)}`} className="rounded-xl border border-white/10 bg-zinc-950/55 px-3 py-2.5">
              <p className="text-sm text-zinc-200">
                <span className="mr-2 text-xs font-semibold text-cyan-200">{index + 1}.</span>
                {insight}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300">
            Sem insights disponiveis no momento.
          </div>
        )}
      </div>

      {hasMoreInsights ? (
        <button
          type="button"
          className="mt-3 rounded-xl border border-white/10 bg-zinc-900/65 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800/80"
          onClick={() => setShowAllInsights((prev) => !prev)}
        >
          {showAllInsights ? "Mostrar menos insights" : "Ver mais insights"}
        </button>
      ) : null}
    </section>
  );
}

type EmailReportCardProps = {
  emailTo: string;
  onEmailChange: (value: string) => void;
  onSendEmail: () => void;
  sendingEmail: boolean;
  loading: boolean;
  historyItems: MonthlyReportDelivery[];
  historyLoading: boolean;
  historyWarning: string | null;
  onRefreshHistory: () => void;
};

function EmailReportCard({
  emailTo,
  onEmailChange,
  onSendEmail,
  sendingEmail,
  loading,
  historyItems,
  historyLoading,
  historyWarning,
  onRefreshHistory,
}: EmailReportCardProps) {
  return (
    <section className={CARD_CLASS}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-50">Enviar relatorio por email</h2>
          <p className="text-xs text-zinc-400">Resumo + planilha em anexo.</p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-white/10 bg-zinc-900/65 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800/80 disabled:opacity-60"
          onClick={onRefreshHistory}
          disabled={historyLoading}
        >
          Atualizar
        </button>
      </div>

      <input
        type="email"
        className="mt-3 w-full rounded-xl border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-300/40"
        placeholder="Opcional: outro email de destino"
        value={emailTo}
        onChange={(event) => onEmailChange(event.target.value)}
      />

      <button
        type="button"
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-500/20 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/30 disabled:opacity-60"
        onClick={onSendEmail}
        disabled={sendingEmail || loading}
      >
        <Mail className="h-4 w-4" />
        {sendingEmail ? "Enviando..." : "Enviar relatorio por email"}
      </button>

      {historyWarning ? (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {historyWarning}
        </div>
      ) : null}

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <History className="h-4 w-4 text-zinc-300" />
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Historico de envio</p>
        </div>

        <div className="space-y-2">
          {historyLoading ? (
            <div className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300">
              Carregando historico...
            </div>
          ) : historyItems.length ? (
            historyItems.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-zinc-950/55 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-zinc-100">{formatMonthReference(item.reference_month)}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusPillClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  {item.recipient_email || "-"} | {formatCurrency(Number(item.total_amount || 0))}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {item.sent_at ? `Enviado em ${formatDateLabel(item.sent_at.slice(0, 10))}` : "Sem data de envio"}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300">
              Nenhum envio registrado ainda.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

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
    () => (summary?.categoryTotals || []).slice(0, 5),
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

  const averagePerDay = useMemo(
    () => (summary ? summary.total / Math.max(daysInReferenceMonth, 1) : 0),
    [daysInReferenceMonth, summary],
  );

  const displayRows = useMemo(
    () => (showAllRows ? reportRows : reportRows.slice(0, 12)),
    [reportRows, showAllRows],
  );

  const hasMoreRows = reportRows.length > 12;

  return (
    <AppShell
      title="Relatorios"
      subtitle="Dashboard mensal com analise de gastos, insights e exportacao Excel"
      hideHeader
    >
      <div className="min-h-[calc(100vh-8rem)] rounded-3xl bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-4 md:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <ReportHeader
            monthFilter={monthFilter}
            exporting={exporting}
            loading={loading}
            onMonthChange={setMonthFilter}
            onRefresh={() => void loadReport()}
            onExport={() => void handleExport()}
          />

          {feedback ? (
            <div className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100">
              {feedback}
            </div>
          ) : null}

          {summary?.warnings?.length ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {summary.warnings.join(" | ")}
            </div>
          ) : null}

          {loading || !summary ? (
            <div className={`${CARD_CLASS} text-zinc-300`}>
              Carregando relatorio...
            </div>
          ) : (
            <>
              <ReportKpis
                summary={summary}
                averagePerDay={averagePerDay}
                daysInReferenceMonth={daysInReferenceMonth}
                topCategoryItem={topCategoryItem}
              />

              <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <CategoryChartCard
                  pieData={pieData}
                  summary={summary}
                  topCategories={topCategories}
                />
                <RankingCard rankingData={rankingData} />
              </section>

              <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <TransactionsTableCard
                    rows={displayRows}
                    totalRows={reportRows.length}
                    hasMoreRows={hasMoreRows}
                    showAllRows={showAllRows}
                    onToggleRows={() => setShowAllRows((prev) => !prev)}
                  />
                </div>

                <div className="space-y-5">
                  <InsightsCard insights={insights} />
                  <EmailReportCard
                    emailTo={emailTo}
                    onEmailChange={setEmailTo}
                    onSendEmail={() => void handleSendEmail()}
                    sendingEmail={sendingEmail}
                    loading={loading}
                    historyItems={historyItems}
                    historyLoading={historyLoading}
                    historyWarning={historyWarning}
                    onRefreshHistory={() => void loadHistory()}
                  />
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
