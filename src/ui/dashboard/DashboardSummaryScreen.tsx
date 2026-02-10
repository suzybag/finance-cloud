"use client";

import { AppShell } from "@/components/AppShell";
import { BankLogo } from "@/components/BankLogo";
import { getBankIconPath } from "@/lib/bankIcons";
import {
  brl,
} from "@/lib/money";
import {
  computeAccountBalances,
  computeCardSummary,
} from "@/lib/finance";
import { monthInputValue, normalizePeriod } from "@/core/finance/dashboardSummary";
import { SummaryMetricCard } from "./SummaryMetricCard";
import { useDashboardSummary } from "./useDashboardSummary";

const IconFallback = ({ label }: { label: string }) => (
  <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800 text-xs font-bold text-slate-200">
    {label.slice(0, 1).toUpperCase() || "B"}
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
  const resultTone = summary.net >= 0 ? "text-emerald-300" : "text-rose-300";

  const accountBalances = computeAccountBalances(accounts, transactions);
  const visibleAccounts = accounts.filter((account) => !account.archived);
  const visibleCards = cards.filter((card) => !card.archived);

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

          <section className="rounded-[18px] border border-white/10 bg-[#1c1c1e]">
            <div className="border-b border-white/10 px-5 py-3">
              <h3 className="text-base font-bold text-slate-100">Contas</h3>
            </div>
            {visibleAccounts.length ? (
              <ul>
                {visibleAccounts.map((account) => {
                  const bankLabel = account.institution?.trim() || account.name;
                  const iconPath = getBankIconPath(bankLabel);
                  const balance = accountBalances.get(account.id) ?? 0;
                  return (
                    <li
                      key={account.id}
                      className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3 first:border-t-0"
                    >
                      <div className="flex items-center gap-3">
                        {iconPath ? <BankLogo bankName={bankLabel} size={30} /> : <IconFallback label={bankLabel} />}
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{account.name}</p>
                          <p className="text-xs text-slate-400">{bankLabel}</p>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-emerald-300">{brl(balance)}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-slate-400">Nenhuma conta cadastrada.</p>
            )}
          </section>

          <section className="rounded-[18px] border border-white/10 bg-[#1c1c1e]">
            <div className="border-b border-white/10 px-5 py-3">
              <h3 className="text-base font-bold text-slate-100">Cartoes de credito</h3>
            </div>
            {visibleCards.length ? (
              <ul>
                {visibleCards.map((card) => {
                  const bankLabel = card.issuer?.trim() || card.name;
                  const iconPath = getBankIconPath(bankLabel);
                  const summaryCard = computeCardSummary(card, transactions);
                  return (
                    <li
                      key={card.id}
                      className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3 first:border-t-0"
                    >
                      <div className="flex items-center gap-3">
                        {iconPath ? <BankLogo bankName={bankLabel} size={30} /> : <IconFallback label={bankLabel} />}
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{card.name}</p>
                          <p className="text-xs text-slate-400">
                            Fatura: {brl(summaryCard.currentTotal)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">Disponivel</p>
                        <p className="text-sm font-bold text-emerald-300">{brl(summaryCard.limitAvailable)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-slate-400">Nenhum cartao cadastrado.</p>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
};

