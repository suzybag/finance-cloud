"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BankLogo } from "@/components/BankLogo";
import { CategoryIcon } from "@/components/CategoryIcon";
import { getBankIconPath } from "@/lib/bankIcons";
import { normalizeCategoryKey } from "@/lib/categoryVisuals";
import { summarizeInstallments } from "@/lib/installments";
import { summarizeRecurringSubscriptions } from "@/lib/recurringSubscriptions";
import { brl, formatPercent } from "@/lib/money";
import { computeAccountBalances, computeCardSummary, groupByCategory } from "@/lib/finance";
import { useCategoryMetadata } from "@/lib/useCategoryMetadata";
import { resolveSubscriptionIconPath } from "@/lib/customMedia";
import { monthInputValue, normalizePeriod } from "@/core/finance/dashboardSummary";
import { useDashboardSummary } from "./useDashboardSummary";
import { useMarketOverview } from "./useMarketOverview";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Clapperboard,
  ChevronRight,
  Circle,
  Cloud,
  CreditCard,
  Dumbbell,
  ExternalLink,
  Laptop,
  Layers,
  Music2,
  PlayCircle,
  Repeat2,
  RefreshCcw,
} from "lucide-react";

const IconFallback = ({ label }: { label: string }) => (
  <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800 text-xs font-bold text-slate-200">
    {label.slice(0, 1).toUpperCase() || "B"}
  </div>
);

const MetricCard = ({
  title,
  value,
  accent,
  icon,
  footer,
}: {
  title: string;
  value: string;
  accent: "green" | "red" | "purple";
  icon: React.ReactNode;
  footer?: string;
}) => (
  <div className="relative overflow-hidden rounded-2xl border border-violet-300/20 bg-[linear-gradient(160deg,rgba(31,18,56,0.82),rgba(12,9,30,0.88))] p-5 shadow-[0_16px_36px_rgba(30,12,58,0.35)]">
    <div className="mb-6 flex items-center justify-between">
      <div>
        <p className="text-xs text-slate-400">{title}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </div>
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${
          accent === "green"
            ? "bg-emerald-500/15 text-emerald-400"
            : accent === "red"
              ? "bg-rose-500/10 text-rose-400"
              : "bg-violet-500/15 text-violet-300"
        }`}
      >
        {icon}
      </div>
    </div>
    {footer ? <p className="text-xs text-slate-500">{footer}</p> : null}
    <div className="pointer-events-none absolute -bottom-10 -right-6 h-24 w-24 rounded-full bg-gradient-to-tr from-white/5 via-white/0 to-white/10 blur-2xl" />
  </div>
);

const formatSignedPercent = (value: number) => {
  if (!Number.isFinite(value) || value === 0) return "0,0%";
  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${formatPercent(Math.abs(value))}`;
};

const formatPoints = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const formatUpdatedTime = (value?: string) => {
  if (!value) return "--:--:--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--:--:--";
  return parsed.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatShortDate = (value?: Date | null) => {
  if (!value) return "--";
  if (Number.isNaN(value.getTime())) return "--";
  return value.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
};

const formatBillingCycleLabel = (cycle?: string | null) => {
  const normalized = String(cycle || "").toLowerCase();
  if (normalized === "annual") return "anual";
  if (normalized === "weekly") return "semanal";
  return "mensal";
};

const normalizeServiceName = (value?: string | null) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const getServiceVisual = (name?: string | null, iconPath?: string | null) => {
  const normalized = normalizeServiceName(name);
  const logoSrc = resolveSubscriptionIconPath(name, iconPath);
  if (
    normalized.includes("netflix")
    || normalized.includes("netlix")
    || normalized.includes("netflx")
    || normalized.includes("disney")
    || normalized.includes("hbo")
    || normalized.includes("htbo")
    || normalized.includes("prime video")
  ) {
    return { icon: Clapperboard, tone: "border-rose-300/30 bg-rose-500/10 text-rose-100", logoSrc };
  }
  if (
    normalized.includes("spotify")
    || normalized.includes("deezer")
    || normalized.includes("apple music")
  ) {
    return { icon: Music2, tone: "border-emerald-300/30 bg-emerald-500/10 text-emerald-100", logoSrc };
  }
  if (
    normalized.includes("google drive")
    || normalized.includes("drive")
    || normalized.includes("icloud")
    || normalized.includes("dropbox")
  ) {
    return { icon: Cloud, tone: "border-indigo-300/35 bg-indigo-500/15 text-indigo-100", logoSrc };
  }
  if (normalized.includes("academia") || normalized.includes("gym")) {
    return { icon: Dumbbell, tone: "border-amber-300/30 bg-amber-500/10 text-amber-100", logoSrc };
  }
  if (normalized.includes("youtube")) {
    return { icon: PlayCircle, tone: "border-red-300/30 bg-red-500/10 text-red-100", logoSrc };
  }
  if (normalized.includes("adobe") || normalized.includes("figma") || normalized.includes("notion")) {
    return { icon: Laptop, tone: "border-violet-300/30 bg-violet-500/10 text-violet-100", logoSrc };
  }
  return { icon: CreditCard, tone: "border-violet-300/35 bg-violet-500/15 text-violet-100", logoSrc };
};

const MarketIndicatorCard = ({
  title,
  value,
  variation,
  updatedAt,
}: {
  title: string;
  value: string;
  variation: number;
  updatedAt?: string;
}) => {
  const positive = variation >= 0;
  return (
    <article className="h-[136px] w-full rounded-xl border border-white/10 bg-[#06080d] px-3.5 py-3 text-slate-100 shadow-[0_14px_30px_rgba(0,0,0,0.45)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(0,0,0,0.55)] sm:w-[212px]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] font-medium text-slate-300">{title}</p>
        <span
          className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${
            positive ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
          }`}
        >
          {formatSignedPercent(variation)}
        </span>
      </div>
      <p className="mt-3 text-[28px] leading-none font-bold tracking-tight text-white">
        {value}
      </p>
      <div className="mt-2 flex items-end justify-between">
        <p className="text-[11px] text-slate-500">Atualizado as {formatUpdatedTime(updatedAt)}</p>
        <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
      </div>
    </article>
  );
};

const CryptoSparkline = ({ values, positive }: { values: number[]; positive: boolean }) => {
  const safe = values.filter((value) => Number.isFinite(value));
  if (safe.length < 2) {
    return <div className="h-full w-full rounded bg-slate-800/80" />;
  }

  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = max - min || 1;
  const width = 100;
  const height = 30;

  const points = safe
    .map((value, index) => {
      const x = (index / (safe.length - 1)) * width;
      const normalized = (value - min) / range;
      const y = height - normalized * (height - 4) - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "#16a34a" : "#dc2626"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const DashboardSummaryScreen = () => {
  const {
    loading,
    message,
    period,
    accounts,
    cards,
    transactions,
    installments,
    recurringSubscriptions,
    summary,
    setPeriod,
    refresh,
  } = useDashboardSummary();
  const { market, loading: loadingMarket, error: marketError, refreshMarket } = useMarketOverview();

  const accountBalances = computeAccountBalances(accounts, transactions);
  const visibleAccounts = accounts.filter((account) => !account.archived);
  const visibleCards = cards.filter((card) => !card.archived);

  const periodLabel = normalizePeriod(period);
  const periodDate = new Date(`${periodLabel}-01T00:00:00`);
  const topCategories = groupByCategory(transactions, periodDate).slice(0, 6);
  const topCategoryTotal = topCategories.reduce((sum, item) => sum + item.value, 0);
  const categoryLookup = useCategoryMetadata(topCategories.map((item) => item.name));
  const monthName = new Date(`${periodLabel}-01T00:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
  });
  const installmentSummary = useMemo(
    () => summarizeInstallments(installments, new Date(), 10),
    [installments],
  );
  const installmentAlerts = useMemo(
    () => [
      ...installmentSummary.overdue,
      ...installmentSummary.dueSoon.filter((item) => (item.metrics.daysUntilDue ?? 99) <= 3),
    ],
    [installmentSummary.dueSoon, installmentSummary.overdue],
  );
  const upcomingInstallments = useMemo(
    () =>
      installmentSummary.active
        .filter((item) => !!item.metrics.nextDueDate)
        .sort((a, b) => {
          const left = a.metrics.nextDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const right = b.metrics.nextDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
          return left - right;
        })
        .slice(0, 4),
    [installmentSummary.active],
  );
  const recurringSummary = useMemo(
    () => summarizeRecurringSubscriptions(recurringSubscriptions, new Date(), 10),
    [recurringSubscriptions],
  );
  const recurringUpcoming = useMemo(
    () => recurringSummary.upcoming.slice(0, 4),
    [recurringSummary.upcoming],
  );
  const recurringTopSubscriptions = useMemo(
    () =>
      [...recurringSummary.active]
        .sort((a, b) => b.metrics.monthlyEquivalent - a.metrics.monthlyEquivalent)
        .slice(0, 4),
    [recurringSummary.active],
  );
  const marketTimeLabel = market.updatedAt
    ? new Date(market.updatedAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

  const handleRefreshAll = () => {
    refresh();
    refreshMarket();
  };

  const actions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-900/55"
        onClick={() => setPeriod(monthInputValue())}
      >
        Mes atual
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-900/55"
        onClick={handleRefreshAll}
      >
        <RefreshCcw className="h-3.5 w-3.5" />
        Atualizar
      </button>
      <input
        type="month"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-xs text-slate-100"
        value={normalizePeriod(period)}
        onChange={(event) => setPeriod(event.target.value)}
      />
    </div>
  );

  return (
    <AppShell
      title="Dashboard"
      subtitle="Saldo, receitas e despesas"
      actions={actions}
      hideHeader
      contentClassName="pt-2"
    >
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-[#14003b] via-[#070013] to-black" />
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-40 bg-[radial-gradient(circle_at_top,_#a855f7_0,_transparent_55%)]" />
      {message ? (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="glass-panel p-6 text-slate-300">Carregando...</div>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-wrap gap-3">
              <MarketIndicatorCard
                title="Dolar"
                value={brl(market.indicators.dollar.price)}
                variation={market.indicators.dollar.changePct}
                updatedAt={market.indicators.dollar.updatedAt}
              />
              <MarketIndicatorCard
                title="Ibovespa"
                value={`${formatPoints(market.indicators.ibovespa.points)} pts`}
                variation={market.indicators.ibovespa.changePct}
                updatedAt={market.indicators.ibovespa.updatedAt}
              />
              <MarketIndicatorCard
                title="CDI (Ult. 12m)"
                value={`${market.indicators.cdi.rate.toFixed(2).replace(".", ",")} %`}
                variation={market.indicators.cdi.changePct}
                updatedAt={market.indicators.cdi.updatedAt}
              />
            </div>

            <aside className="rounded-3xl border border-white/10 bg-[#06080d] p-4 text-slate-100 shadow-[0_18px_36px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {market.cryptos.list.slice(0, 2).map((coin) => (
                      <div
                        key={coin.id}
                        className="h-10 w-10 rounded-full border-2 border-[#0c1017] bg-[#111722] p-1 shadow-sm"
                      >
                        {coin.image ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={coin.image}
                              alt={coin.name}
                              className="h-full w-full rounded-full object-cover"
                            />
                          </>
                        ) : (
                          <div className="grid h-full w-full place-items-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-200">
                            {coin.symbol.slice(0, 3)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {market.cryptos.list.length > 2 ? (
                    <span className="text-sm font-semibold text-slate-400">
                      +{market.cryptos.list.length - 2}
                    </span>
                  ) : null}
                </div>
                <Link
                  href="/investments"
                  className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/40 text-slate-300 hover:bg-white/10"
                  aria-label="Abrir investimentos"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              <p className="mt-4 text-3xl font-semibold tracking-tight text-white">Total em criptos</p>
              <p className="mt-1 text-4xl font-bold tracking-tight text-white">
                {brl(market.cryptos.summary.basketTotal)}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                <span
                  className={
                    market.cryptos.summary.basketChangeValue >= 0
                      ? "font-semibold text-emerald-400"
                      : "font-semibold text-rose-400"
                  }
                >
                  {market.cryptos.summary.basketChangeValue >= 0 ? "+ " : "- "}
                  {brl(Math.abs(market.cryptos.summary.basketChangeValue))}
                </span>{" "}
                de rendimento (24h)
              </p>

              {market.cryptos.list.length ? (
                <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                  {market.cryptos.list.slice(0, 5).map((coin) => {
                    const positive = coin.changePct24h >= 0;
                    return (
                      <div
                        key={coin.id}
                        className="min-w-[140px] rounded-xl border border-white/10 bg-[#0e141d] px-3 py-2"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-300">{coin.symbol}</span>
                          <span className={positive ? "text-emerald-400" : "text-rose-400"}>
                            {formatSignedPercent(coin.changePct24h)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-200">
                          {brl(coin.positionValue || coin.currentPrice)}
                        </p>
                        <div className="mt-2 h-8">
                          <CryptoSparkline values={coin.sparkline} positive={positive} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-white/10 bg-[#0e141d] px-3 py-4 text-sm text-slate-400">
                  Nenhuma cripto investida ainda. Adicione em Investimentos para aparecer aqui.
                </div>
              )}

              <p className="mt-3 text-[11px] text-slate-400">
                {loadingMarket ? "Atualizando mercado..." : `Atualizado as ${marketTimeLabel}`}
              </p>
            </aside>
          </section>

          {marketError ? (
            <div className="rounded-xl border border-amber-300/60 bg-amber-100 px-4 py-3 text-sm text-amber-800">
              {marketError}
            </div>
          ) : null}

          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60 px-6 py-6 shadow-lg shadow-black/50 sm:px-8 sm:py-8">
            <div className="absolute inset-0">
              <video
                className="h-full w-full object-cover opacity-60"
                autoPlay
                muted
                loop
                playsInline
              >
                <source src="/intro/intro-3d.mp4" type="video/mp4" />
              </video>
              <div className="absolute inset-0 bg-gradient-to-br from-[#120026]/85 via-[#070013]/70 to-black/80" />
            </div>
            <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-200/80">
                  Saldo atual em contas
                </p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    {brl(summary.availableBalance)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-300">
                  mes de <span className="font-medium text-white/90">{monthName}</span>
                </p>
              </div>
              <Link
                href="/cards"
                aria-label="Abrir aba Cartoes"
                className="dash-flip-card shrink-0 self-end md:self-auto"
              >
                <div className="dash-flip-card-inner">
                  <div className="dash-flip-card-front">
                    <p className="dash-heading">MASTERCAD</p>
                    <div className="dash-chip" />
                    <div className="dash-contactless" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                    <p className="dash-number">9759 2484 5269 6576</p>
                    <p className="dash-valid-thru">VALID THRU</p>
                    <p className="dash-date">12/24</p>
                    <p className="dash-name">FINANCE CLOUD</p>
                    <div className="dash-logo" aria-hidden="true">
                      <span className="dash-logo-left" />
                      <span className="dash-logo-right" />
                    </div>
                  </div>
                  <div className="dash-flip-card-back">
                    <div className="dash-strip" />
                    <div className="dash-mstrip" />
                    <div className="dash-sstrip">
                      <p className="dash-code">***</p>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </section>

          <div className="flex flex-wrap justify-end">{actions}</div>

          <section className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Receitas"
              value={brl(summary.monthIncome)}
              accent="green"
              icon={<ArrowUpRight className="h-5 w-5" />}
              footer="Entradas somadas no periodo."
            />
            <MetricCard
              title="Despesas"
              value={brl(summary.monthExpense)}
              accent="red"
              icon={<ArrowDownRight className="h-5 w-5" />}
              footer="Saidas somadas no periodo."
            />
            <MetricCard
              title="Saldo"
              value={brl(summary.net)}
              accent="purple"
              icon={<Circle className="h-5 w-5" />}
              footer="Saldo considerando o periodo."
            />
          </section>

          <section className="rounded-2xl border border-violet-300/20 bg-[linear-gradient(160deg,rgba(29,16,54,0.72),rgba(12,9,30,0.84))] p-5 shadow-[0_18px_42px_rgba(30,12,58,0.4)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Parcelas ativas</h2>
                <p className="text-xs text-slate-400">Resumo de compras parceladas e vencimentos</p>
              </div>
              <Link
                href="/parcelas"
                className="inline-flex items-center gap-2 rounded-lg border border-violet-300/25 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-500/25"
              >
                <Layers className="h-3.5 w-3.5" />
                Abrir Parcelas
              </Link>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-violet-300/20 bg-violet-500/12 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-violet-100/72">Total ativo</p>
                <p className="mt-1 text-lg font-semibold text-violet-50">
                  {brl(installmentSummary.activeTotalRemaining)}
                </p>
              </div>
              <div className="rounded-xl border border-violet-300/20 bg-violet-500/12 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-violet-100/72">Proximos 10 dias</p>
                <p className="mt-1 text-lg font-semibold text-violet-50">{installmentSummary.dueSoon.length}</p>
              </div>
              <div className="rounded-xl border border-violet-300/20 bg-violet-500/12 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-violet-100/72">Alertas</p>
                <p className="mt-1 text-lg font-semibold text-violet-50">{installmentAlerts.length}</p>
              </div>
            </div>

            {!upcomingInstallments.length ? (
              <p className="text-sm text-slate-400">Sem parcelamentos ativos no momento.</p>
            ) : (
              <div className="grid gap-2 lg:grid-cols-2">
                {upcomingInstallments.map((item) => {
                  const urgency = item.metrics.daysUntilDue ?? 999;
                  const badgeClass = urgency < 0
                    ? "border-rose-300/35 bg-rose-500/15 text-rose-100"
                    : urgency <= 3
                      ? "border-amber-300/35 bg-amber-500/15 text-amber-100"
                      : "border-violet-300/35 bg-violet-500/15 text-violet-100";

                  return (
                    <div
                      key={item.row.id}
                      className="rounded-xl border border-white/10 bg-slate-900/70 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <CategoryIcon
                            categoryName={`${item.row.name} ${item.row.category || ""}`}
                            size={13}
                            circleSize={30}
                          />
                          <p className="truncate text-sm font-semibold text-slate-100">{item.row.name}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${badgeClass}`}>
                          {urgency < 0 ? `${Math.abs(urgency)} dia(s) atrasado` : `${urgency} dia(s)`}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {item.metrics.paidInstallments}/{item.metrics.installmentCount} parcelas
                      </p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/10 bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400 transition-[width] duration-700"
                          style={{ width: `${item.metrics.percentagePaid.toFixed(2)}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                        <span>{brl(item.metrics.installmentValue)} por parcela</span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatShortDate(item.metrics.nextDueDate)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </section>

          <section className="rounded-2xl border border-violet-300/20 bg-[linear-gradient(160deg,rgba(29,16,54,0.72),rgba(12,9,30,0.84))] p-5 shadow-[0_18px_42px_rgba(30,12,58,0.4)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Assinaturas recorrentes</h2>
                <p className="text-xs text-slate-400">Resumo visual de gastos recorrentes</p>
              </div>
              <Link
                href="/assinaturas"
                className="inline-flex items-center gap-2 rounded-lg border border-violet-300/25 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-500/25"
              >
                <Repeat2 className="h-3.5 w-3.5" />
                Abrir Assinaturas
              </Link>
            </div>

            <div className="mb-4 rounded-2xl border border-violet-300/30 bg-[linear-gradient(145deg,rgba(35,16,66,0.86),rgba(16,10,38,0.92))] p-4 shadow-[0_18px_36px_rgba(25,12,58,0.46)]">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-violet-300/35 bg-[linear-gradient(150deg,#7c3aed,#c026d3)] text-violet-100 shadow-[0_10px_24px_rgba(124,58,237,0.35)]">
                  <CalendarDays className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tracking-tight text-slate-50">Assinaturas</p>
                  <p className="text-sm text-violet-200/85">Gastos recorrentes</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                {!recurringTopSubscriptions.length ? (
                  <p className="text-sm text-slate-300">Sem assinaturas ativas no momento.</p>
                ) : (
                  <div className="space-y-2">
                    {recurringTopSubscriptions.map((item) => {
                      const visual = getServiceVisual(item.row.name, item.row.icon_path);
                      const Icon = visual.icon;
                      return (
                        <div key={item.row.id} className="flex items-center justify-between gap-2 rounded-lg px-1 py-0.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${visual.tone}`}>
                              {visual.logoSrc ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={visual.logoSrc}
                                  alt=""
                                  className="h-5 w-5 rounded object-contain"
                                  loading="lazy"
                                />
                              ) : (
                                <Icon className="h-4 w-4" />
                              )}
                            </div>
                            <p className="truncate text-sm text-slate-100">{item.row.name}</p>
                          </div>
                          <p className="text-sm font-semibold text-violet-100">{brl(item.metrics.monthlyEquivalent)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="my-3 border-t border-white/10" />
                <div className="flex items-center justify-between text-sm">
                  <p className="text-slate-400">Total/mes</p>
                  <p className="text-2xl font-semibold tracking-tight text-violet-100">{brl(recurringSummary.monthlyTotal)}</p>
                </div>
              </div>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-violet-300/20 bg-violet-500/12 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-violet-100/72">Total mensal</p>
                <p className="mt-1 text-lg font-semibold text-violet-50">{brl(recurringSummary.monthlyTotal)}</p>
              </div>
              <div className="rounded-xl border border-violet-300/20 bg-violet-500/12 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-violet-100/72">Proximas</p>
                <p className="mt-1 text-lg font-semibold text-violet-50">{recurringSummary.upcoming.length}</p>
              </div>
              <div className="rounded-xl border border-violet-300/20 bg-violet-500/12 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-violet-100/72">Esquecidas</p>
                <p className="mt-1 text-lg font-semibold text-violet-50">{recurringSummary.underused.length}</p>
              </div>
              <div className="rounded-xl border border-violet-300/20 bg-violet-500/12 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-violet-100/72">Previsao 12m</p>
                <p className="mt-1 text-lg font-semibold text-violet-50">{brl(recurringSummary.forecast12Months)}</p>
              </div>
            </div>

            {!recurringUpcoming.length ? (
              <p className="text-sm text-slate-400">Sem assinaturas ativas no momento.</p>
            ) : (
              <div className="grid gap-2 lg:grid-cols-2">
                {recurringUpcoming.map((item) => {
                  const urgency = item.metrics.daysUntilCharge;
                  const badgeClass = urgency < 0
                    ? "border-rose-300/35 bg-rose-500/15 text-rose-100"
                    : urgency <= 3
                      ? "border-amber-300/35 bg-amber-500/15 text-amber-100"
                      : "border-violet-300/35 bg-violet-500/15 text-violet-100";
                  const visual = getServiceVisual(item.row.name, item.row.icon_path);
                  const Icon = visual.icon;

                  return (
                    <div
                      key={item.row.id}
                      className="rounded-xl border border-white/10 bg-slate-900/70 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${visual.tone}`}>
                            {visual.logoSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={visual.logoSrc}
                                alt=""
                                className="h-5 w-5 rounded object-contain"
                                loading="lazy"
                              />
                            ) : (
                              <Icon className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-100">{item.row.name}</p>
                            <p className="truncate text-xs text-slate-400">
                              {brl(item.row.price)} / {formatBillingCycleLabel(item.row.billing_cycle)}
                            </p>
                          </div>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${badgeClass}`}>
                          {urgency < 0 ? `${Math.abs(urgency)} dia(s) atrasado` : `${urgency} dia(s)`}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/10 bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400 transition-[width] duration-700"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(
                                100,
                                recurringSummary.monthlyTotal > 0
                                  ? (item.metrics.monthlyEquivalent / recurringSummary.monthlyTotal) * 100
                                  : 0,
                              ),
                            ).toFixed(2)}%`,
                          }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                        <span>{brl(item.metrics.monthlyEquivalent)} / mes</span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatShortDate(item.metrics.nextChargeDate)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-violet-300/20 bg-[linear-gradient(160deg,rgba(29,16,54,0.72),rgba(12,9,30,0.84))] p-5 shadow-[0_18px_42px_rgba(30,12,58,0.4)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Categorias do mes</h2>
                <p className="text-xs text-slate-400">Distribuicao das despesas por categoria</p>
              </div>
              <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
                {topCategories.length} categorias
              </span>
            </div>

            {topCategories.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {topCategories.map((item) => {
                  const metadata = categoryLookup.get(normalizeCategoryKey(item.name));
                  const share = topCategoryTotal > 0 ? (item.value / topCategoryTotal) * 100 : 0;
                  return (
                    <div
                      key={item.name}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <CategoryIcon
                          categoryName={item.name}
                          iconName={metadata?.icon_name}
                          iconColor={metadata?.icon_color}
                          size={12}
                          circleSize={24}
                        />
                        <p className="truncate text-sm text-slate-100">{item.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-200">{brl(item.value)}</p>
                        <p className="text-[11px] text-slate-400">{share.toFixed(1).replace(".", ",")}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Sem despesas categorizadas no periodo.</p>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-violet-300/20 bg-[linear-gradient(160deg,rgba(29,16,54,0.72),rgba(12,9,30,0.84))] p-5 shadow-[0_18px_42px_rgba(30,12,58,0.4)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100">Contas</h2>
                <button className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700">
                  Nova conta
                </button>
              </div>
              <div className="space-y-3">
                {visibleAccounts.length ? (
                  visibleAccounts.map((account) => {
                    const bankLabel = account.institution?.trim() || account.name;
                    const iconPath = getBankIconPath(bankLabel);
                    const balance = accountBalances.get(account.id) ?? 0;
                    return (
                      <div
                        key={account.id}
                        className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-900/80 px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
                            {iconPath ? <BankLogo bankName={bankLabel} size={26} /> : <IconFallback label={bankLabel} />}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{account.name}</p>
                            <p className="text-[11px] text-slate-400">{bankLabel}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-400">Saldo</p>
                          <p className="text-sm font-semibold text-emerald-400">
                            {brl(balance)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-400">Nenhuma conta cadastrada.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-violet-300/20 bg-[linear-gradient(160deg,rgba(29,16,54,0.72),rgba(12,9,30,0.84))] p-5 shadow-[0_18px_42px_rgba(30,12,58,0.4)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100">Cartoes de credito</h2>
                <button className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700">
                  Novo cartao
                </button>
              </div>
              <div className="space-y-3">
                {visibleCards.length ? (
                  visibleCards.map((card) => {
                    const bankLabel = card.issuer?.trim() || card.name;
                    const iconPath = getBankIconPath(bankLabel);
                    const summaryCard = computeCardSummary(card, transactions);
                    return (
                      <div
                        key={card.id}
                        className="space-y-3 rounded-xl border border-white/5 bg-gradient-to-r from-slate-900 to-slate-900/60 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
                              {iconPath ? <BankLogo bankName={bankLabel} size={26} /> : <IconFallback label={bankLabel} />}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{card.name}</p>
                              <p className="text-[11px] text-slate-400">{bankLabel}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] text-slate-400">Disponivel</p>
                            <p className="text-sm font-semibold text-emerald-400">
                              {brl(summaryCard.limitAvailable)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                          <span>Limite: {brl(card.limit_total)}</span>
                          <span>Fatura: {brl(summaryCard.currentTotal)}</span>
                          <span>
                            Fecha dia {card.closing_day} - Vence dia {card.due_day}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-400">Nenhum cartao cadastrado.</p>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
};

