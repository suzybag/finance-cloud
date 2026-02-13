import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

type BcbCdiRow = {
  data?: string;
  valor?: string;
};

type CoinGeckoSimpleResponse = {
  bitcoin?: {
    brl?: number;
    brl_24h_change?: number;
  };
  ethereum?: {
    brl?: number;
    brl_24h_change?: number;
  };
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
  currentPrice: number;
  changePct24h: number;
  sparkline: number[];
  updatedAt: string;
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

  const yahoo = await fetchJson<YahooChartResponse>(
    "https://query1.finance.yahoo.com/v8/finance/chart/USDBRL=X?range=2d&interval=1d",
  );
  const meta = yahoo.chart?.result?.[0]?.meta;
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

  const yahoo = await fetchJson<YahooChartResponse>(
    "https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=2d&interval=1d",
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

const fetchCryptos = async () => {
  let btcPrice = 0;
  let ethPrice = 0;
  let btcChange = 0;
  let ethChange = 0;

  try {
    const data = await fetchJson<CoinGeckoSimpleResponse>(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=brl&include_24hr_change=true",
    );
    btcPrice = toNumber(data.bitcoin?.brl);
    ethPrice = toNumber(data.ethereum?.brl);
    btcChange = toNumber(data.bitcoin?.brl_24h_change);
    ethChange = toNumber(data.ethereum?.brl_24h_change);
  } catch {
    // fallback below
  }

  if (btcPrice <= 0 || ethPrice <= 0) {
    try {
      const [coinCapData, usdBrlData] = await Promise.all([
        fetchJson<CoinCapAssetsResponse>("https://api.coincap.io/v2/assets?ids=bitcoin,ethereum"),
        fetchJson<AwesomeDollarResponse>("https://economia.awesomeapi.com.br/json/last/USD-BRL"),
      ]);
      const usdBrl = toNumber(usdBrlData.USDBRL?.bid);
      if (usdBrl > 0) {
        const btcCoinCap = (coinCapData.data || []).find((asset) => asset.id === "bitcoin");
        const ethCoinCap = (coinCapData.data || []).find((asset) => asset.id === "ethereum");

        if (btcPrice <= 0) {
          btcPrice = toNumber(btcCoinCap?.priceUsd) * usdBrl;
        }
        if (ethPrice <= 0) {
          ethPrice = toNumber(ethCoinCap?.priceUsd) * usdBrl;
        }
        if ((!Number.isFinite(btcChange) || btcChange === 0) && btcCoinCap?.changePercent24Hr) {
          btcChange = toNumber(btcCoinCap.changePercent24Hr);
        }
        if ((!Number.isFinite(ethChange) || ethChange === 0) && ethCoinCap?.changePercent24Hr) {
          ethChange = toNumber(ethCoinCap.changePercent24Hr);
        }
      }
    } catch {
      // fallback below
    }
  }

  if (btcPrice <= 0 || ethPrice <= 0) {
    const [btcTickerResult, ethTickerResult] = await Promise.allSettled([
      fetchJson<BinanceTickerResponse>("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCBRL"),
      fetchJson<BinanceTickerResponse>("https://api.binance.com/api/v3/ticker/24hr?symbol=ETHBRL"),
    ]);

    const btcTicker =
      btcTickerResult.status === "fulfilled" ? btcTickerResult.value : ({} as BinanceTickerResponse);
    const ethTicker =
      ethTickerResult.status === "fulfilled" ? ethTickerResult.value : ({} as BinanceTickerResponse);

    if (btcPrice <= 0) {
      btcPrice = toNumber(btcTicker.lastPrice);
    }
    if (ethPrice <= 0) {
      ethPrice = toNumber(ethTicker.lastPrice);
    }
    if ((!Number.isFinite(btcChange) || btcChange === 0) && btcTicker.priceChangePercent) {
      btcChange = toNumber(btcTicker.priceChangePercent);
    }
    if ((!Number.isFinite(ethChange) || ethChange === 0) && ethTicker.priceChangePercent) {
      ethChange = toNumber(ethTicker.priceChangePercent);
    }
  }

  if (btcPrice <= 0 && ethPrice <= 0) throw new Error("Falha ao atualizar criptomoedas.");

  const [btcSparkRaw, ethSparkRaw] = await Promise.all([
    fetchCoinSparkline("BTCBRL"),
    fetchCoinSparkline("ETHBRL"),
  ]);

  const now = new Date().toISOString();
  const btcSpark = btcSparkRaw.length ? btcSparkRaw : buildSyntheticSparkline(btcPrice, btcChange);
  const ethSpark = ethSparkRaw.length ? ethSparkRaw : buildSyntheticSparkline(ethPrice, ethChange);

  const list: CryptoItem[] = [
    {
      id: "bitcoin",
      symbol: "BTC",
      name: "Bitcoin",
      image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
      currentPrice: btcPrice,
      changePct24h: btcChange,
      sparkline: btcSpark,
      updatedAt: now,
    },
    {
      id: "ethereum",
      symbol: "ETH",
      name: "Ethereum",
      image: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
      currentPrice: ethPrice,
      changePct24h: ethChange,
      sparkline: ethSpark,
      updatedAt: now,
    },
  ].filter((coin) => coin.currentPrice > 0);

  const basketTotal = list.reduce((sum, coin) => sum + coin.currentPrice, 0);
  const basketPrevious = list.reduce((sum, coin) => {
    const ratio = 1 + coin.changePct24h / 100;
    const previous = ratio > 0 ? coin.currentPrice / ratio : coin.currentPrice;
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

export async function GET() {
  const now = new Date().toISOString();
  const warnings: string[] = [];

  const [dollarResult, ibovespaResult, cdiResult, cryptoResult] = await Promise.allSettled([
    fetchDollar(),
    fetchIbovespa(),
    fetchCdi(),
    fetchCryptos(),
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
