"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MarketOverviewPayload = {
  updatedAt: string;
  indicators: {
    dollar: {
      price: number;
      changePct: number;
      updatedAt: string;
    };
    ibovespa: {
      points: number;
      changePct: number;
      updatedAt: string;
    };
    cdi: {
      rate: number;
      changePct: number;
      updatedAt: string;
    };
  };
  cryptos: {
    list: Array<{
      id: string;
      symbol: string;
      name: string;
      image: string;
      currentPrice: number;
      changePct24h: number;
      sparkline: number[];
      updatedAt: string;
    }>;
    summary: {
      basketTotal: number;
      basketChangeValue: number;
      basketChangePct: number;
    };
  };
  warnings?: string[];
};

const EMPTY_MARKET: MarketOverviewPayload = {
  updatedAt: "",
  indicators: {
    dollar: { price: 0, changePct: 0, updatedAt: "" },
    ibovespa: { points: 0, changePct: 0, updatedAt: "" },
    cdi: { rate: 0, changePct: 0, updatedAt: "" },
  },
  cryptos: {
    list: [],
    summary: {
      basketTotal: 0,
      basketChangeValue: 0,
      basketChangePct: 0,
    },
  },
  warnings: [],
};

const MARKET_POLL_INTERVAL_MS = 2000;

export const useMarketOverview = () => {
  const [market, setMarket] = useState<MarketOverviewPayload>(EMPTY_MARKET);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const hasDataRef = useRef(false);

  const fetchMarket = useCallback(async (silent = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      if (!silent) setLoading(true);
      const response = await fetch("/api/market/overview", {
        method: "GET",
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json?.message || "Erro ao atualizar dados. Tentando novamente.");
      }
      const payload = json as MarketOverviewPayload;
      const warnings = new Set(payload.warnings ?? []);
      let hasPayloadData = false;

      setMarket((prev) => {
        const next: MarketOverviewPayload = {
          ...payload,
          indicators: {
            ...payload.indicators,
          },
          cryptos: payload.cryptos,
        };

        if (warnings.has("dolar") && prev.indicators.dollar.price > 0) {
          next.indicators.dollar = prev.indicators.dollar;
        }
        if (warnings.has("ibovespa") && prev.indicators.ibovespa.points > 0) {
          next.indicators.ibovespa = prev.indicators.ibovespa;
        }
        if (warnings.has("cdi") && prev.indicators.cdi.rate > 0) {
          next.indicators.cdi = prev.indicators.cdi;
        }
        if (warnings.has("criptos") && prev.cryptos.list.length > 0) {
          next.cryptos = prev.cryptos;
        }

        hasPayloadData =
          next.indicators.dollar.price > 0 ||
          next.indicators.ibovespa.points > 0 ||
          next.indicators.cdi.rate > 0 ||
          next.cryptos.list.length > 0;

        return next;
      });

      hasDataRef.current = hasPayloadData;
      setError(null);
    } catch {
      if (!hasDataRef.current) {
        setError("Erro ao atualizar dados. Tentando novamente.");
      } else {
        setError(null);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarket(false);
    const interval = window.setInterval(() => fetchMarket(true), MARKET_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchMarket]);

  return {
    market,
    loading,
    error,
    refreshMarket: () => fetchMarket(false),
  };
};
