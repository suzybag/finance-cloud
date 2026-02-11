"use client";

import Image from "next/image";
import { AppShell } from "@/components/AppShell";
import { BankLogo } from "@/components/BankLogo";
import { getBankIconPath } from "@/lib/bankIcons";
import { brl } from "@/lib/money";
import { computeAccountBalances, computeCardSummary } from "@/lib/finance";
import { monthInputValue, normalizePeriod } from "@/core/finance/dashboardSummary";
import { useDashboardSummary } from "./useDashboardSummary";
import { ArrowDownRight, ArrowUpRight, Circle, RefreshCcw } from "lucide-react";

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
  <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-900/80 p-5 shadow-lg shadow-black/40">
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

export const DashboardSummaryScreen = () => {
  const {
    loading,
    message,
    period,
    accounts,
    cards,
    transactions,
    summary,
    setPeriod,
    refresh,
  } = useDashboardSummary();

  const accountBalances = computeAccountBalances(accounts, transactions);
  const visibleAccounts = accounts.filter((account) => !account.archived);
  const visibleCards = cards.filter((card) => !card.archived);

  const periodLabel = normalizePeriod(period);
  const monthName = new Date(`${periodLabel}-01T00:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
  });

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
        onClick={refresh}
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
        <div className="space-y-8">
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
              <div className="relative h-[110px] w-[170px] shrink-0 self-end md:self-auto">
                <Image
                  src="/assets/3d/money-stack.svg"
                  alt="Icone 3D de dinheiro"
                  fill
                  className="object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.55)]"
                  sizes="170px"
                />
              </div>
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

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-5 shadow-lg shadow-black/40">
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

            <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-5 shadow-lg shadow-black/40">
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
                            Fecha dia {card.closing_day} · Vence dia {card.due_day}
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
