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
      changeValue24h: number;
      sparkline: number[];
    }>;
    summary: {
      basketTotal: number;
      basketChangeValue: number;
      basketChangePct: number;
    };
  };
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
};

export const useMarketOverview = () => {
  const [market, setMarket] = useState<MarketOverviewPayload>(EMPTY_MARKET);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

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
        throw new Error(json?.message || "Falha ao carregar dados de mercado.");
      }
      setMarket(json as MarketOverviewPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dados de mercado.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarket(false);
    const interval = window.setInterval(() => fetchMarket(true), 20000);
    return () => window.clearInterval(interval);
  }, [fetchMarket]);

  return {
    market,
    loading,
    error,
    refreshMarket: () => fetchMarket(false),
  };
};
