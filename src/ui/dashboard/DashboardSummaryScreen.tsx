"use client";

import { AppShell } from "@/components/AppShell";
import { brl } from "@/lib/money";
import { monthInputValue, normalizePeriod } from "@/core/finance/dashboardSummary";
import { SummaryMetricCard } from "./SummaryMetricCard";
import { useDashboardSummary } from "./useDashboardSummary";

export const DashboardSummaryScreen = () => {
  const { loading, message, period, summary, setPeriod, refresh } = useDashboardSummary();
  const resultTone = summary.net >= 0 ? "text-emerald-300" : "text-rose-300";

  const actions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/55"
        onClick={() => setPeriod(monthInputValue())}
      >
        Mes atual
      </button>
      <button
        type="button"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/55"
        onClick={refresh}
      >
        Atualizar
      </button>
      <input
        type="month"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
        value={normalizePeriod(period)}
        onChange={(event) => setPeriod(event.target.value)}
      />
    </div>
  );

  return (
    <AppShell title="Dashboard" subtitle="Saldo, receitas e despesas" actions={actions}>
      {message ? (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="glass-panel p-6 text-slate-300">Carregando...</div>
      ) : (
        <div className="space-y-4">
          <section className="rounded-[20px] border border-white/10 bg-[#1c1c1e] p-6 shadow-[0_12px_28px_rgba(0,0,0,0.2)]">
            <p className="text-sm font-medium text-slate-400">Saldo atual em contas</p>
            <h2 className="mt-2 text-5xl font-bold tracking-tight text-slate-100">
              {brl(summary.availableBalance)}
            </h2>
            <p className="mt-2 text-sm text-slate-400">Periodo selecionado: {normalizePeriod(period)}</p>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <SummaryMetricCard
              label="Receitas"
              value={brl(summary.monthIncome)}
              caption="Entradas do periodo"
              tone="income"
            />
            <SummaryMetricCard
              label="Despesas"
              value={brl(summary.monthExpense)}
              caption="Saidas do periodo"
              tone="expense"
            />
          </section>

          <section className="rounded-[18px] border border-white/10 bg-[#1c1c1e] px-5 py-4">
            <p className="text-sm text-slate-400">Resultado do periodo</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${resultTone}`}>
              {brl(summary.net)}
            </p>
          </section>
        </div>
      )}
    </AppShell>
  );
};

