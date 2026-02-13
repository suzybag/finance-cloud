"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Coins,
  HandCoins,
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
      textClass: "text-emerald-300",
      Icon: ArrowUpRight,
    };
  }
  if (value < 0) {
    return {
      textClass: "text-rose-300",
      Icon: ArrowDownRight,
    };
  }
  return {
    textClass: "text-amber-300",
    Icon: Minus,
  };
};

export function InvestmentSummary({ investments }: InvestmentSummaryProps) {
  const stats = useInvestmentStats(investments);
  const lucroTrend = getTrendAppearance(stats.lucroTotal);
  const variacaoTrend = getTrendAppearance(stats.variacaoPercent);
  const rentabilidadeTrend = getTrendAppearance(stats.rentabilidade);

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        index={0}
        title="Patrimonio total"
        value={brl(stats.patrimonioTotal)}
        icon={Wallet}
        extra={(
          <p className="text-xs text-slate-400">
            Valor investido: <span className="font-semibold text-slate-200">{brl(stats.valorInvestido)}</span>
          </p>
        )}
      />

      <StatCard
        index={1}
        title="Lucro total"
        value={brl(stats.lucroTotal)}
        valueClassName={lucroTrend.textClass}
        icon={HandCoins}
        extra={(
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
            <p>
              Ganho capital
              <span className="ml-1 font-semibold text-slate-200">{brl(stats.ganhoCapital)}</span>
            </p>
            <p>
              Dividendos
              <span className="ml-1 font-semibold text-slate-200">{brl(stats.proventos12m)}</span>
            </p>
          </div>
        )}
      />

      <StatCard
        index={2}
        title="Proventos recebidos (12M)"
        value={brl(stats.proventos12m)}
        icon={Coins}
        extra={(
          <p className="text-xs text-slate-400">
            Total em 12 meses: <span className="font-semibold text-slate-200">{brl(stats.proventos12m)}</span>
          </p>
        )}
      />

      <StatCard
        index={3}
        title="Variacao + Rentabilidade"
        value={formatPercent(stats.variacaoPercent)}
        valueClassName={variacaoTrend.textClass}
        icon={LineChart}
        extra={(
          <div className="space-y-1 text-xs">
            <p className={`inline-flex items-center gap-1 font-semibold ${variacaoTrend.textClass}`}>
              <variacaoTrend.Icon className="h-3.5 w-3.5" />
              Variacao: {formatPercent(stats.variacaoPercent)} ({brl(stats.variacaoValor)})
            </p>
            <p className={`inline-flex items-center gap-1 font-semibold ${rentabilidadeTrend.textClass}`}>
              <rentabilidadeTrend.Icon className="h-3.5 w-3.5" />
              Rentabilidade: {formatPercent(stats.rentabilidade)}
            </p>
          </div>
        )}
      />
    </section>
  );
}
