import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveCoinGeckoId } from "@/lib/coinGecko";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DollarApiResponse = {
  USDBRL?: {
    bid?: string;
    pctChange?: string;
    create_date?: string;
    timestamp?: string;
  };
};

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

type CoinGeckoMarketRow = {
  id?: string;
  symbol?: string;
  name?: string;
  image?: string;
  current_price?: number;
  price_change_24h?: number;
  price_change_percentage_24h?: number;
  sparkline_in_7d?: {
    price?: number[];
  };
};

type InvestmentRow = {
  id: string;
  user_id: string;
  type_id: string | null;
  asset_id: string | null;
  investment_type: string | null;
  category: string | null;
  asset_name: string | null;
};

type InvestmentTypeRow = {
  id: string;
  name: string;
  category: string;
  symbol: string | null;
};

type AssetRow = {
  id: string;
  name: string;
  category: string | null;
  symbol: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
};

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

const sampleSeries = (values: number[], points = 18) => {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length <= points) return filtered;
  const step = (filtered.length - 1) / (points - 1);
  return Array.from({ length: points }, (_value, index) => {
    const sourceIndex = Math.round(index * step);
    return filtered[sourceIndex] ?? filtered[filtered.length - 1];
  });
};

const parseBcbDate = (value?: string) => {
  if (!value) return null;
  const [day, month, year] = value.split("/");
  if (!day || !month || !year) return null;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
    if (!response.ok) {
      throw new Error(`${url} -> ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
};

const jsonNoStore = (body: unknown, init?: { status?: number }) =>
  NextResponse.json(body, {
    status: init?.status,
    headers: NO_STORE_HEADERS,
  });

const getAuthToken = (request: Request) => {
  const authHeader = request.headers.get("authorization") || "";
  return authHeader.replace("Bearer ", "").trim();
};

const getClientForToken = (token: string) => {
  if (!supabaseUrl) {
    return { client: null, error: "NEXT_PUBLIC_SUPABASE_URL nao configurada." };
  }
  if (!token) {
    return { client: null, error: "Token ausente." };
  }

  const keyToUse = serviceRole || supabaseAnonKey;
  if (!keyToUse) {
    return { client: null, error: "SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY nao configurada." };
  }

  const client = createClient(supabaseUrl, keyToUse, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  return { client, error: null };
};

const resolveRowCoinId = (
  row: InvestmentRow,
  typesById: Map<string, InvestmentTypeRow>,
  assetsById: Map<string, AssetRow>,
) => {
  const type = row.type_id ? typesById.get(row.type_id) : undefined;
  const asset = row.asset_id ? assetsById.get(row.asset_id) : undefined;
  return resolveCoinGeckoId({
    symbol: asset?.symbol || type?.symbol,
    name: asset?.name || row.asset_name || type?.name || row.investment_type,
    category: asset?.category || type?.category || row.category,
  });
};

const fetchDollar = async () => {
  try {
    const data = await fetchJson<DollarApiResponse>(
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
  const data = await fetchJson<YahooChartResponse>(
    "https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=2d&interval=1d",
  );
  const meta = data.chart?.result?.[0]?.meta;
  const price = toNumber(meta?.regularMarketPrice);
  const previous = toNumber(meta?.chartPreviousClose);
  const changePct = previous > 0 ? ((price - previous) / previous) * 100 : 0;

  return {
    points: price,
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
    .map((row) => ({
      rate: toNumber(row.valor),
      date: parseBcbDate(row.data),
    }))
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

const fetchCryptos = async (coinIds: string[]) => {
  if (!coinIds.length) {
    return {
      list: [] as Array<{
        id: string;
        symbol: string;
        name: string;
        image: string;
        currentPrice: number;
        changePct24h: number;
        changeValue24h: number;
        sparkline: number[];
      }>,
      summary: {
        basketTotal: 0,
        basketChangeValue: 0,
        basketChangePct: 0,
      },
    };
  }

  const url =
    "https://api.coingecko.com/api/v3/coins/markets" +
    `?vs_currency=brl&ids=${encodeURIComponent(coinIds.join(","))}` +
    "&price_change_percentage=24h&sparkline=true&per_page=10&page=1";

  const rows = await fetchJson<CoinGeckoMarketRow[]>(url);
  const cryptos = rows
    .map((row) => ({
      id: row.id || "",
      symbol: (row.symbol || "").toUpperCase(),
      name: row.name || "",
      image: row.image || "",
      currentPrice: toNumber(row.current_price),
      changePct24h: toNumber(row.price_change_percentage_24h),
      changeValue24h: toNumber(row.price_change_24h),
      sparkline: sampleSeries(row.sparkline_in_7d?.price || []),
    }))
    .filter((row) => row.id && row.currentPrice > 0)
    .slice(0, 12);

  const basketCurrent = cryptos.reduce((sum, coin) => sum + coin.currentPrice, 0);
  const basketPrevious = cryptos.reduce(
    (sum, coin) => sum + Math.max(coin.currentPrice - coin.changeValue24h, 0),
    0,
  );
  const basketChangeValue = basketCurrent - basketPrevious;
  const basketChangePct = basketPrevious > 0 ? (basketChangeValue / basketPrevious) * 100 : 0;

  return {
    list: cryptos,
    summary: {
      basketTotal: basketCurrent,
      basketChangeValue,
      basketChangePct,
    },
  };
};

export async function GET(request: Request) {
  let coinIds: string[] = [];
  const token = getAuthToken(request);
  const { client } = getClientForToken(token);

  if (client && token) {
    const { data: userData, error: userError } = await client.auth.getUser(token);
    if (!userError && userData.user) {
      const userId = userData.user.id;
      const [investmentsRes, typesRes, assetsRes] = await Promise.all([
        client
          .from("investments")
          .select("id, user_id, type_id, asset_id, investment_type, category, asset_name")
          .eq("user_id", userId)
          .gt("current_amount", 0),
        client
          .from("investment_types")
          .select("id, name, category, symbol"),
        client
          .from("assets")
          .select("id, name, category, symbol"),
      ]);

      if (!investmentsRes.error && !typesRes.error && !assetsRes.error) {
        const investments = (investmentsRes.data || []) as InvestmentRow[];
        const typesById = new Map<string, InvestmentTypeRow>(
          (((typesRes.data || []) as InvestmentTypeRow[]).map((item) => [item.id, item])),
        );
        const assetsById = new Map<string, AssetRow>(
          (((assetsRes.data || []) as AssetRow[]).map((item) => [item.id, item])),
        );

        coinIds = Array.from(
          new Set(
            investments
              .map((row) => resolveRowCoinId(row, typesById, assetsById))
              .filter((coinId): coinId is string => !!coinId),
          ),
        );
      }
    }
  }

  const now = new Date().toISOString();
  const [dollarResult, ibovespaResult, cdiResult, cryptoResult] = await Promise.allSettled([
    fetchDollar(),
    fetchIbovespa(),
    fetchCdi(),
    fetchCryptos(coinIds),
  ]);

  const dollar =
    dollarResult.status === "fulfilled"
      ? dollarResult.value
      : { price: 0, changePct: 0, updatedAt: now };
  const ibovespa =
    ibovespaResult.status === "fulfilled"
      ? ibovespaResult.value
      : { points: 0, changePct: 0, updatedAt: now };
  const cdi =
    cdiResult.status === "fulfilled"
      ? cdiResult.value
      : { rate: 0, changePct: 0, updatedAt: now };
  const cryptos =
    cryptoResult.status === "fulfilled"
      ? cryptoResult.value
      : {
          list: [] as Array<{
            id: string;
            symbol: string;
            name: string;
            image: string;
            currentPrice: number;
            changePct24h: number;
            changeValue24h: number;
            sparkline: number[];
          }>,
          summary: {
            basketTotal: 0,
            basketChangeValue: 0,
            basketChangePct: 0,
          },
        };

  const hasAnyData =
    dollar.price > 0 || ibovespa.points > 0 || cdi.rate > 0 || cryptos.list.length > 0;

  if (!hasAnyData) {
    return jsonNoStore(
      { message: "Nao foi possivel carregar dados de mercado agora." },
      { status: 503 },
    );
  }

  return jsonNoStore({
    updatedAt: now,
    indicators: {
      dollar: {
        ...dollar,
        updatedAt: now,
      },
      ibovespa: {
        ...ibovespa,
        updatedAt: now,
      },
      cdi: {
        ...cdi,
        updatedAt: now,
      },
    },
    cryptos,
  });
}
