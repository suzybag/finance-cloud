"use client";

import { useMemo } from "react";
import { brl } from "@/lib/money";

export type InvestmentOverviewPanelItem = {
  id: string;
  nome: string;
  investido: number;
  atual: number;
  inicio: string;
  fim: string;
};

type InvestmentOverviewPanelProps = {
  investments: InvestmentOverviewPanelItem[];
};

const FALLBACK_INVESTMENTS: InvestmentOverviewPanelItem[] = [
  {
    id: "fallback-bitcoin",
    nome: "Bitcoin",
    investido: 2000,
    atual: 2350,
    inicio: "2026-03-10",
    fim: "2026-03-20",
  },
  {
    id: "fallback-cdb115",
    nome: "CDB 115% CDI",
    investido: 5000,
    atual: 5120,
    inicio: "2026-03-10",
    fim: "2026-03-20",
  },
  {
    id: "fallback-selic",
    nome: "Tesouro Selic",
    investido: 3000,
    atual: 3010,
    inicio: "2026-03-10",
    fim: "2026-03-20",
  },
];

const formatSignedCurrency = (value: number) => {
  const prefix = value >= 0 ? "+" : "-";
  return `${prefix}${brl(Math.abs(value))}`;
};

const formatSignedPercent = (value: number) => {
  const prefix = value >= 0 ? "+" : "-";
  return `${prefix}${Math.abs(value).toFixed(2).replace(".", ",")}%`;
};

export function InvestmentOverviewPanel({ investments }: InvestmentOverviewPanelProps) {
  const panelInvestments = investments.length ? investments : FALLBACK_INVESTMENTS;

  const total = useMemo(() => {
    const investido = panelInvestments.reduce((sum, item) => sum + item.investido, 0);
    const atual = panelInvestments.reduce((sum, item) => sum + item.atual, 0);
    const lucro = atual - investido;
    const percentual = investido > 0 ? ((atual - investido) / investido) * 100 : 0;

    return {
      investido,
      atual,
      lucro,
      percentual,
    };
  }, [panelInvestments]);

  return (
    <section className="rounded-[30px] border border-zinc-800/90 bg-zinc-950 p-6 text-white shadow-[0_28px_70px_rgba(0,0,0,0.4)] sm:p-7">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Carteira Total</h2>
          <div className="mt-4 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="text-3xl font-bold sm:text-4xl">
              {brl(total.atual)}
            </div>
            <div className={`mt-2 text-sm font-medium ${
              total.lucro >= 0 ? "text-green-400" : "text-red-400"
            }`}>
              {formatSignedCurrency(total.lucro)} ({formatSignedPercent(total.percentual)})
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {panelInvestments.map((investment) => {
            const lucro = investment.atual - investment.investido;
            const percent = investment.investido > 0 ? (lucro / investment.investido) * 100 : 0;

            return (
              <article key={investment.id} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
                <h3 className="mb-2 font-semibold text-white">
                  {investment.nome}
                </h3>

                <div className="text-xl font-bold">
                  {brl(investment.atual)}
                </div>

                <div className={`mt-1 text-sm ${
                  lucro >= 0 ? "text-green-400" : "text-red-400"
                }`}>
                  {formatSignedCurrency(lucro)} ({formatSignedPercent(percent)})
                </div>

                <div className="mt-2 text-xs text-zinc-400">
                  {investment.inicio} {"->"} {investment.fim}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
