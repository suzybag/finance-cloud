"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { resolveCoinGeckoId } from "@/lib/coinGecko";

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
      quantity: number;
      currentPrice: number;
      positionValue: number;
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

type InvestmentPositionRow = {
  category?: string | null;
  investment_type?: string | null;
  asset_name?: string | null;
  quantity?: number | string | null;
  operation?: string | null;
};

type CryptoPosition = {
  coinId: string;
  quantity: number;
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isCryptoHint = (value?: string | null) =>
  (value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("cripto");

const loadCryptoPositions = async (): Promise<CryptoPosition[]> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (userError || !userId) return [];

  const { data, error } = await supabase
    .from("investments")
    .select("category, investment_type, asset_name, quantity, operation")
    .eq("user_id", userId);

  if (error) return [];

  const grouped = new Map<string, number>();
  ((data || []) as InvestmentPositionRow[]).forEach((row) => {
    const inferredCoinId = resolveCoinGeckoId({
      symbol: row.asset_name || row.investment_type,
      name: row.asset_name || row.investment_type,
      category: row.category,
    });

    const explicitCrypto =
      isCryptoHint(row.category) || isCryptoHint(row.investment_type) || isCryptoHint(row.asset_name);

    if (!inferredCoinId && !explicitCrypto) return;
    if (!inferredCoinId) return;

    const quantity = Math.abs(toNumber(row.quantity));
    if (quantity <= 0) return;
    const signal = row.operation === "venda" ? -1 : 1;
    grouped.set(inferredCoinId, (grouped.get(inferredCoinId) || 0) + quantity * signal);
  });

  return Array.from(grouped.entries())
    .filter(([, quantity]) => quantity > 0)
    .map(([coinId, quantity]) => ({ coinId, quantity }));
};

export const useMarketOverview = () => {
  const [market, setMarket] = useState<MarketOverviewPayload>(EMPTY_MARKET);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<CryptoPosition[]>([]);
  const loadingRef = useRef(false);
  const hasDataRef = useRef(false);

  const fetchMarket = useCallback(async (silent = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      if (!silent) setLoading(true);
      const params = new URLSearchParams();
      if (positions.length) {
        const encoded = positions.map((item) => `${item.coinId}:${item.quantity}`).join(",");
        params.set("positions", encoded);
      }
      params.set("_ts", String(Date.now()));
      const response = await fetch(`/api/market/overview${params.toString() ? `?${params.toString()}` : ""}`, {
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
  }, [positions]);

  const refreshPositions = useCallback(async () => {
    const loaded = await loadCryptoPositions();
    setPositions(loaded);
  }, []);

  useEffect(() => {
    refreshPositions();
  }, [refreshPositions]);

  useEffect(() => {
    fetchMarket(false);
    const interval = window.setInterval(() => fetchMarket(true), MARKET_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchMarket]);

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const initRealtime = async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!mounted || !userId) return;

      channel = supabase
        .channel(`dashboard-investments-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "investments", filter: `user_id=eq.${userId}` },
          () => {
            void refreshPositions();
          },
        )
        .subscribe();
    };

    void initRealtime();

    return () => {
      mounted = false;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [refreshPositions]);

  return {
    market,
    loading,
    error,
    refreshMarket: () => fetchMarket(false),
  };
};
