"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  HandCoins,
  Minus,
  LineChart,
  Wallet,
} from "lucide-react";
import { StatCard } from "@/components/investments/StatCard";
import { useInvestmentStats, type InvestmentStatsRow } from "@/components/investments/useInvestmentStats";
import { brl, formatPercent } from "@/lib/money";

type InvestmentSummaryProps = {
  investments: InvestmentStatsRow[];
};

const getTrendAppearance = (value: number) => {
  if (value > 0) {
    return {
      textClass: "text-emerald-200",
      Icon: ArrowUpRight,
    };
  }
  if (value < 0) {
    return {
      textClass: "text-rose-200",
      Icon: ArrowDownRight,
    };
  }
  return {
    textClass: "text-slate-200",
    Icon: Minus,
  };
};

export function InvestmentSummary({ investments }: InvestmentSummaryProps) {
  const stats = useInvestmentStats(investments);
  const resultadoTrend = getTrendAppearance(stats.lucroTotal);
  const variacaoTrend = getTrendAppearance(stats.variacaoValor);
  const rentabilidadeTrend = getTrendAppearance(stats.rentabilidade);

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      <StatCard
        index={0}
        title="Voce aplicou"
        value={brl(stats.valorInvestido)}
        icon={Wallet}
        extra={(
          <p className="text-xs text-slate-400">
            Total dos aportes registrados na carteira.
          </p>
        )}
      />

      <StatCard
        index={1}
        title="Hoje sua carteira vale"
        value={brl(stats.patrimonioTotal)}
        icon={BadgeDollarSign}
        extra={(
          <p className="text-xs text-slate-400">
            Valor atualizado de todos os investimentos.
          </p>
        )}
      />

      <StatCard
        index={2}
        title="Seu resultado"
        value={brl(stats.lucroTotal)}
        valueClassName={resultadoTrend.textClass}
        icon={HandCoins}
        extra={(
          <div className="space-y-1 text-xs">
            <p className={`inline-flex items-center gap-1 font-semibold ${resultadoTrend.textClass}`}>
              <resultadoTrend.Icon className="h-3.5 w-3.5" />
              Rentabilidade: {formatPercent(stats.rentabilidade)}
            </p>
            <p className={`inline-flex items-center gap-1 font-semibold ${variacaoTrend.textClass}`}>
              <variacaoTrend.Icon className="h-3.5 w-3.5" />
              Hoje: {brl(stats.variacaoValor)} ({formatPercent(stats.variacaoPercent)})
            </p>
            <p className={`inline-flex items-center gap-1 font-semibold ${rentabilidadeTrend.textClass}`}>
              <LineChart className="h-3.5 w-3.5" />
              Proventos recebidos: {brl(stats.proventos12m)}
            </p>
          </div>
        )}
      />
    </section>
  );
}
