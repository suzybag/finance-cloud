"use client";

import { useMemo } from "react";

export type InvestmentStatsRow = {
  quantity: number;
  average_price: number;
  current_price: number;
  dividends_received?: number | null;
  price_history?: number[];
  operation?: "compra" | "venda" | string;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export function useInvestmentStats(investments: InvestmentStatsRow[]) {
  return useMemo(() => {
    const patrimonioTotal = investments.reduce((sum, item) => {
      const quantity = Math.abs(safeNumber(item.quantity));
      const signal = item.operation === "venda" ? -1 : 1;
      const currentPrice = safeNumber(item.current_price);
      return sum + (quantity * currentPrice * signal);
    }, 0);

    const valorInvestido = investments.reduce((sum, item) => {
      const quantity = Math.abs(safeNumber(item.quantity));
      const signal = item.operation === "venda" ? -1 : 1;
      const averagePrice = safeNumber(item.average_price);
      return sum + (quantity * averagePrice * signal);
    }, 0);

    const ganhoCapital = patrimonioTotal - valorInvestido;
    const proventos12m = investments.reduce(
      (sum, item) => sum + safeNumber(item.dividends_received),
      0,
    );
    const lucroTotal = ganhoCapital + proventos12m;

    const rentabilidade = valorInvestido > 0
      ? (lucroTotal / valorInvestido) * 100
      : 0;

    const dailyVariationValue = investments.reduce((sum, item) => {
      const history = Array.isArray(item.price_history) ? item.price_history : [];
      const last = safeNumber(history[history.length - 1]);
      const prev = safeNumber(history[history.length - 2]);
      const quantity = Math.abs(safeNumber(item.quantity));
      const signal = item.operation === "venda" ? -1 : 1;
      if (last <= 0 || prev <= 0) return sum;
      return sum + ((last - prev) * quantity * signal);
    }, 0);

    const dailyBase = investments.reduce((sum, item) => {
      const history = Array.isArray(item.price_history) ? item.price_history : [];
      const prev = safeNumber(history[history.length - 2]);
      const quantity = Math.abs(safeNumber(item.quantity));
      const signal = item.operation === "venda" ? -1 : 1;
      if (prev <= 0) return sum;
      return sum + (prev * quantity * signal);
    }, 0);

    const variacaoPercent = dailyBase > 0
      ? (dailyVariationValue / dailyBase) * 100
      : 0;

    return {
      patrimonioTotal: roundCurrency(patrimonioTotal),
      valorInvestido: roundCurrency(valorInvestido),
      ganhoCapital: roundCurrency(ganhoCapital),
      lucroTotal: roundCurrency(lucroTotal),
      proventos12m: roundCurrency(proventos12m),
      rentabilidade,
      variacaoValor: roundCurrency(dailyVariationValue),
      variacaoPercent,
    };
  }, [investments]);
}
