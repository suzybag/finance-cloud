"use client";

import {
  Building2,
  CalendarDays,
  Coins,
  Percent,
  PiggyBank,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { brl, formatPercent } from "@/lib/money";
import { calculateReturnPercent } from "@/lib/calculateInvestment";

export type InvestmentCardItem = {
  id: string;
  broker: string;
  investment_type: string;
  invested_amount: number;
  current_amount: number;
  annual_rate: number | null;
  start_date: string;
};

type InvestmentCardProps = {
  item: InvestmentCardItem;
  deleting: boolean;
  onDelete: (id: string) => void;
};

const resolveTypeIcon = (investmentType: string) => {
  const normalized = investmentType.toLowerCase();
  if (normalized.includes("acao") || normalized.includes("fii") || normalized.includes("etf")) {
    return <TrendingUp className="h-4 w-4 text-cyan-300" />;
  }
  if (normalized.includes("tesouro") || normalized.includes("cdb") || normalized.includes("lci") || normalized.includes("lca") || normalized.includes("caixinha") || normalized.includes("poup")) {
    return <PiggyBank className="h-4 w-4 text-cyan-300" />;
  }
  return <Coins className="h-4 w-4 text-cyan-300" />;
};

const formatStartDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export function InvestmentCard({ item, deleting, onDelete }: InvestmentCardProps) {
  const typeIcon = resolveTypeIcon(item.investment_type);
  const profit = item.current_amount - item.invested_amount;
  const returnPct = calculateReturnPercent(item.invested_amount, item.current_amount);
  const isPositive = profit >= 0;

  return (
    <article className="rounded-2xl border border-[#7C3AED66] bg-[linear-gradient(160deg,rgba(17,24,39,0.96),rgba(8,12,24,0.95))] p-4 shadow-[0_14px_36px_rgba(17,24,39,0.56)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_44px_rgba(124,58,237,0.26)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs text-slate-300">
            <Building2 className="h-3.5 w-3.5 text-violet-300" />
            {item.broker}
          </p>
          <h3 className="mt-1 inline-flex items-center gap-2 text-lg font-bold text-white">
            {typeIcon}
            {item.investment_type}
          </h3>
        </div>
        <button
          type="button"
          className="rounded-lg border border-rose-300/35 bg-rose-500/10 p-1.5 text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
          onClick={() => onDelete(item.id)}
          disabled={deleting}
          aria-label="Excluir investimento"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-violet-300/20 bg-violet-950/20 p-3">
          <p className="text-xs text-slate-400">Valor investido</p>
          <p className="mt-1 font-extrabold text-slate-100">{brl(item.invested_amount)}</p>
        </div>
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-950/20 p-3">
          <p className="text-xs text-slate-400">Valor atual</p>
          <p className="mt-1 font-extrabold text-cyan-200">{brl(item.current_amount)}</p>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-3">
          <p className="text-xs text-slate-400">Retorno (%)</p>
          <p className={`mt-1 font-extrabold ${isPositive ? "text-emerald-300" : "text-rose-300"}`}>
            {formatPercent(returnPct)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-3">
          <p className="text-xs text-slate-400">Lucro / prejuizo</p>
          <p className={`mt-1 font-extrabold ${isPositive ? "text-emerald-300" : "text-rose-300"}`}>
            {brl(profit)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <Percent className="h-3.5 w-3.5 text-violet-300" />
          Taxa anual: {formatPercent(item.annual_rate ?? 0)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-violet-300" />
          Inicio: {formatStartDate(item.start_date)}
        </span>
      </div>
    </article>
  );
}
