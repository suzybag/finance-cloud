import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type AwesomeDollarResponse = {
  USDBRL?: {
    bid?: string;
    pctChange?: string;
    timestamp?: string;
  };
};

type AwesomeIbovRow = {
  bid?: string;
  value?: string;
  points?: string;
  pctChange?: string;
  varBid?: string;
  timestamp?: string;
};

type AwesomeIbovResponse = Record<string, AwesomeIbovRow>;

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        regularMarketTime?: number;
      };
    }>;
  };
};

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: Array<{
      regularMarketPrice?: number;
      regularMarketChangePercent?: number;
      regularMarketTime?: number;
      regularMarketPreviousClose?: number;
    }>;
  };
};

type BcbCdiRow = {
  data?: string;
  valor?: string;
};

type CoinGeckoSimpleResponse = {
  [coinId: string]: {
    brl?: number;
    brl_24h_change?: number;
  };
};

type CoinGeckoMarketRow = {
  id?: string;
  symbol?: string;
  name?: string;
  image?: string;
  current_price?: number;
  price_change_percentage_24h?: number;
};

type CoinCapAssetsResponse = {
  data?: Array<{
    id?: string;
    symbol?: string;
    priceUsd?: string;
    changePercent24Hr?: string;
  }>;
};

type BinanceTickerResponse = {
  lastPrice?: string;
  priceChangePercent?: string;
};

type BinanceKlineRow = [number, string, string, string, string, string, number];

type CryptoItem = {
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
};

type CryptoPosition = {
  coinId: string;
  quantity: number;
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const jsonNoStore = (body: unknown, init?: { status?: number }) =>
  NextResponse.json(body, {
    status: init?.status,
    headers: NO_STORE_HEADERS,
  });

const toNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const normalized =
      value.includes(",") && value.includes(".")
        ? value.replace(/\./g, "").replace(",", ".")
        : value.includes(",")
          ? value.replace(",", ".")
          : value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const parseBcbDate = (value?: string) => {
  if (!value) return null;
  const [day, month, year] = value.split("/");
  if (!day || !month || !year) return null;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const sampleSeries = (values: number[], points = 18) => {
  const filtered = values.filter((value) => Number.isFinite(value) && value > 0);
  if (filtered.length <= points) return filtered;
  const step = (filtered.length - 1) / (points - 1);
  return Array.from({ length: points }, (_value, index) => {
    const sourceIndex = Math.round(index * step);
    return filtered[sourceIndex] ?? filtered[filtered.length - 1];
  });
};

const buildSyntheticSparkline = (price: number, changePct: number) => {
  if (!Number.isFinite(price) || price <= 0) return [];
  const factor = 1 + changePct / 100;
  const base = factor > 0 ? price / factor : price;
  const mid = (base + price) / 2;
  return [base, base * 1.002, mid * 0.999, mid * 1.001, price];
};

const normalizeCoinId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");

const parseCryptoPositions = (request: Request) => {
  const url = new URL(request.url);
  const raw = url.searchParams.get("positions");
  if (!raw) return [] as CryptoPosition[];

  const grouped = new Map<string, number>();
  raw.split(",").forEach((item) => {
    const [coinRaw, quantityRaw] = item.split(":");
    const coinId = normalizeCoinId(coinRaw || "");
    const quantity = toNumber(quantityRaw);
    if (!coinId || !Number.isFinite(quantity) || quantity <= 0) return;
    grouped.set(coinId, (grouped.get(coinId) || 0) + quantity);
  });

  return Array.from(grouped.entries()).map(([coinId, quantity]) => ({ coinId, quantity }));
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`${url} -> ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchYahooQuote = async (symbol: string) => {
  const data = await fetchJson<YahooQuoteResponse>(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`,
  );
  const quote = data.quoteResponse?.result?.[0];
  const price = toNumber(quote?.regularMarketPrice);
  const quoteChange = toNumber(quote?.regularMarketChangePercent);
  const previousClose = toNumber(quote?.regularMarketPreviousClose);
  const changePct =
    Number.isFinite(quoteChange) && quoteChange !== 0
      ? quoteChange
      : previousClose > 0
        ? ((price - previousClose) / previousClose) * 100
        : 0;

  return {
    price,
    changePct,
    updatedAt: quote?.regularMarketTime
      ? new Date(quote.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
  };
};

const fetchDollar = async () => {
  try {
    const data = await fetchJson<AwesomeDollarResponse>(
      "https://economia.awesomeapi.com.br/json/last/USD-BRL",
    );
    const row = data.USDBRL;
    const price = toNumber(row?.bid);
    const changePct = toNumber(row?.pctChange);
    if (price > 0) {
      return {
        price,
        changePct,
        updatedAt:
          row?.timestamp && Number.isFinite(Number(row.timestamp))
            ? new Date(Number(row.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
      };
    }
  } catch {
    // fallback below
  }

  try {
    const quote = await fetchYahooQuote("USDBRL=X");
    if (quote.price > 0) {
      return quote;
    }
  } catch {
    // fallback below
  }

  const yahoo = await fetchJson<YahooChartResponse>(
    "https://query1.finance.yahoo.com/v8/finance/chart/USDBRL=X?range=1d&interval=1m",
  );
  const result = yahoo.chart?.result?.[0];
  const meta = result?.meta;
  const price = toNumber(meta?.regularMarketPrice);
  const previous = toNumber(meta?.chartPreviousClose);
  const changePct = previous > 0 ? ((price - previous) / previous) * 100 : 0;
  return {
    price,
    changePct,
    updatedAt: meta?.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
  };
};

const fetchIbovespa = async () => {
  try {
    const data = await fetchJson<AwesomeIbovResponse>(
      "https://economia.awesomeapi.com.br/json/last/IBOV",
    );
    const row = Object.values(data || {})[0];
    const points = toNumber(row?.bid ?? row?.value ?? row?.points);
    const changePct = toNumber(row?.pctChange ?? row?.varBid);
    if (points > 0) {
      return {
        points,
        changePct,
        updatedAt:
          row?.timestamp && Number.isFinite(Number(row.timestamp))
            ? new Date(Number(row.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
      };
    }
  } catch {
    // Fallback Yahoo because AwesomeAPI IBOV endpoint is unstable/404.
  }

  try {
    const quote = await fetchYahooQuote("^BVSP");
    if (quote.price > 0) {
      return {
        points: quote.price,
        changePct: quote.changePct,
        updatedAt: quote.updatedAt,
      };
    }
  } catch {
    // fallback below
  }

  const yahoo = await fetchJson<YahooChartResponse>(
    "https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=1d&interval=1m",
  );
  const meta = yahoo.chart?.result?.[0]?.meta;
  const points = toNumber(meta?.regularMarketPrice);
  const previous = toNumber(meta?.chartPreviousClose);
  const changePct = previous > 0 ? ((points - previous) / previous) * 100 : 0;
  return {
    points,
    changePct,
    updatedAt: meta?.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
  };
};

const fetchCdi = async () => {
  const rows = await fetchJson<BcbCdiRow[]>(
    "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/5?formato=json",
  );
  const parsed = rows
    .map((row) => ({ rate: toNumber(row.valor), date: parseBcbDate(row.data) }))
    .filter((row) => row.rate > 0 && row.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const latest = parsed[parsed.length - 1];
  const previous = parsed[parsed.length - 2] ?? latest;
  const rate = latest?.rate ?? 0;
  const previousRate = previous?.rate ?? rate;
  const changePct = previousRate > 0 ? ((rate - previousRate) / previousRate) * 100 : 0;

  return {
    rate,
    changePct,
    updatedAt: latest?.date ?? new Date().toISOString(),
  };
};

const fetchCoinSparkline = async (symbol: "BTCBRL" | "ETHBRL") => {
  try {
    const data = await fetchJson<BinanceKlineRow[]>(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=24`,
    );
    const values = (data || []).map((item) => toNumber(item[4]));
    return sampleSeries(values);
  } catch {
    return [] as number[];
  }
};

const coinIdToBinancePair = (coinId: string): "BTCBRL" | "ETHBRL" | null => {
  if (coinId === "bitcoin") return "BTCBRL";
  if (coinId === "ethereum") return "ETHBRL";
  return null;
};

const fetchCoinGeckoMarkets = async (coinIds: string[]) => {
  if (!coinIds.length) return [] as CoinGeckoMarketRow[];
  const ids = coinIds.join(",");
  const data = await fetchJson<CoinGeckoMarketRow[]>(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=brl&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=${coinIds.length}&page=1&sparkline=false&price_change_percentage=24h`,
  );
  return Array.isArray(data) ? data : [];
};

const fetchCryptos = async (positions: CryptoPosition[]) => {
  const activePositions = positions.filter((position) => position.quantity > 0);
  if (!activePositions.length) {
    return {
      list: [] as CryptoItem[],
      summary: {
        basketTotal: 0,
        basketChangeValue: 0,
        basketChangePct: 0,
      },
    };
  }

  const coinIds = Array.from(new Set(activePositions.map((position) => position.coinId)));
  const now = new Date().toISOString();
  let marketRows: CoinGeckoMarketRow[] = [];

  try {
    marketRows = await fetchCoinGeckoMarkets(coinIds);
  } catch {
    // fallback below with simple endpoint
  }

  if (!marketRows.length) {
    try {
      const data = await fetchJson<CoinGeckoSimpleResponse>(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinIds.join(","))}&vs_currencies=brl&include_24hr_change=true`,
      );
      marketRows = coinIds.map((coinId) => ({
        id: coinId,
        symbol: coinId.slice(0, 3).toUpperCase(),
        name: coinId,
        image: "",
        current_price: toNumber(data[coinId]?.brl),
        price_change_percentage_24h: toNumber(data[coinId]?.brl_24h_change),
      }));
    } catch {
      // fallback below
    }
  }

  if (!marketRows.length) {
    try {
      const [coinCapData, usdBrlData] = await Promise.all([
        fetchJson<CoinCapAssetsResponse>(`https://api.coincap.io/v2/assets?ids=${coinIds.join(",")}`),
        fetchJson<AwesomeDollarResponse>("https://economia.awesomeapi.com.br/json/last/USD-BRL"),
      ]);
      const usdBrl = toNumber(usdBrlData.USDBRL?.bid);
      if (usdBrl > 0) {
        marketRows = coinIds.map((coinId) => {
          const asset = (coinCapData.data || []).find((entry) => entry.id === coinId);
          return {
            id: coinId,
            symbol: asset?.symbol || coinId.slice(0, 3).toUpperCase(),
            name: asset?.id || coinId,
            image: "",
            current_price: toNumber(asset?.priceUsd) * usdBrl,
            price_change_percentage_24h: toNumber(asset?.changePercent24Hr),
          };
        });
      }
    } catch {
      // fallback below
    }
  }

  if (!marketRows.length) {
    const fallbackPairs = await Promise.all(
      activePositions.map(async (position) => {
        const pair = coinIdToBinancePair(position.coinId);
        if (!pair) return null;
        try {
          const ticker = await fetchJson<BinanceTickerResponse>(
            `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`,
          );
          return {
            id: position.coinId,
            symbol: pair.replace("BRL", ""),
            name: position.coinId,
            image: "",
            current_price: toNumber(ticker.lastPrice),
            price_change_percentage_24h: toNumber(ticker.priceChangePercent),
          } as CoinGeckoMarketRow;
        } catch {
          return null;
        }
      }),
    );
    marketRows = fallbackPairs.filter((item): item is CoinGeckoMarketRow => !!item);
  }

  if (!marketRows.length) throw new Error("Falha ao atualizar criptomoedas.");

  const marketById = new Map<string, CoinGeckoMarketRow>(
    marketRows.map((row) => [String(row.id || "").toLowerCase(), row]),
  );

  const listWithNulls = await Promise.all(
    activePositions.map(async (position) => {
      const market = marketById.get(position.coinId);
      if (!market) return null;
      const currentPrice = toNumber(market.current_price);
      if (currentPrice <= 0) return null;

      const changePct24h = toNumber(market.price_change_percentage_24h);
      const pair = coinIdToBinancePair(position.coinId);
      const sparkRaw = pair ? await fetchCoinSparkline(pair) : [];
      const sparkline = sparkRaw.length
        ? sparkRaw
        : buildSyntheticSparkline(currentPrice, changePct24h);

      return {
        id: position.coinId,
        symbol: (market.symbol || position.coinId.slice(0, 3)).toUpperCase(),
        name: market.name || position.coinId,
        image: market.image || "",
        quantity: position.quantity,
        currentPrice,
        positionValue: currentPrice * position.quantity,
        changePct24h,
        sparkline,
        updatedAt: now,
      } as CryptoItem;
    }),
  );

  const list = listWithNulls
    .filter((coin): coin is CryptoItem => !!coin)
    .sort((a, b) => b.positionValue - a.positionValue);

  const basketTotal = list.reduce((sum, coin) => sum + coin.positionValue, 0);
  const basketPrevious = list.reduce((sum, coin) => {
    const ratio = 1 + coin.changePct24h / 100;
    const previous = ratio > 0 ? coin.positionValue / ratio : coin.positionValue;
    return sum + previous;
  }, 0);
  const basketChangeValue = basketTotal - basketPrevious;
  const basketChangePct = basketPrevious > 0 ? (basketChangeValue / basketPrevious) * 100 : 0;

  return {
    list,
    summary: {
      basketTotal,
      basketChangeValue,
      basketChangePct,
    },
  };
};

export async function GET(request: Request) {
  const now = new Date().toISOString();
  const warnings: string[] = [];
  const positions = parseCryptoPositions(request);

  const [dollarResult, ibovespaResult, cdiResult, cryptoResult] = await Promise.allSettled([
    fetchDollar(),
    fetchIbovespa(),
    fetchCdi(),
    fetchCryptos(positions),
  ]);

  const dollar =
    dollarResult.status === "fulfilled"
      ? dollarResult.value
      : (() => {
          warnings.push("dolar");
          return { price: 0, changePct: 0, updatedAt: now };
        })();

  const ibovespa =
    ibovespaResult.status === "fulfilled"
      ? ibovespaResult.value
      : (() => {
          warnings.push("ibovespa");
          return { points: 0, changePct: 0, updatedAt: now };
        })();

  const cdi =
    cdiResult.status === "fulfilled"
      ? cdiResult.value
      : (() => {
          warnings.push("cdi");
          return { rate: 0, changePct: 0, updatedAt: now };
        })();

  const cryptos =
    cryptoResult.status === "fulfilled"
      ? cryptoResult.value
      : (() => {
          warnings.push("criptos");
          return {
            list: [] as CryptoItem[],
            summary: {
              basketTotal: 0,
              basketChangeValue: 0,
              basketChangePct: 0,
            },
          };
        })();

  const hasAnyData =
    dollar.price > 0 || ibovespa.points > 0 || cdi.rate > 0 || cryptos.list.length > 0;

  if (!hasAnyData) {
    return jsonNoStore(
      { message: "Erro ao atualizar dados. Tentando novamente." },
      { status: 503 },
    );
  }

  return jsonNoStore({
    updatedAt: now,
    indicators: {
      dollar,
      ibovespa,
      cdi,
    },
    cryptos,
    warnings,
  });
}
