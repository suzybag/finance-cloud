const COIN_ID_BY_SYMBOL: Record<string, string> = {
  BTC: "bitcoin",
  BITCOIN: "bitcoin",
  ETH: "ethereum",
  ETHEREUM: "ethereum",
  XRP: "ripple",
  USDC: "usd-coin",
  SOL: "solana",
  ADA: "cardano",
};

const normalizeSymbol = (value?: string | null) =>
  (value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const normalizeText = (value?: string | null) =>
  (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const resolveCoinGeckoId = ({
  symbol,
  name,
  category,
}: {
  symbol?: string | null;
  name?: string | null;
  category?: string | null;
}) => {
  const categoryKey = normalizeText(category);
  const symbolKey = normalizeSymbol(symbol);
  const nameKey = normalizeText(name);

  if (symbolKey && COIN_ID_BY_SYMBOL[symbolKey]) {
    return COIN_ID_BY_SYMBOL[symbolKey];
  }

  if (nameKey.includes("bitcoin")) return "bitcoin";
  if (nameKey.includes("ethereum")) return "ethereum";
  if (nameKey === "xrp" || nameKey.includes("ripple")) return "ripple";
  if (nameKey.includes("usdc") || nameKey.includes("usd coin")) return "usd-coin";
  if (nameKey.includes("solana") || nameKey === "sol") return "solana";

  if (categoryKey === "cripto" || categoryKey === "criptomoedas") {
    if (nameKey.includes("btc")) return "bitcoin";
    if (nameKey.includes("eth")) return "ethereum";
    if (nameKey.includes("xrp")) return "ripple";
    if (nameKey.includes("usdc")) return "usd-coin";
  }

  return null;
};

type CoinGeckoSimplePriceRow = {
  brl?: number;
};

export const fetchCoinGeckoSimplePrices = async (ids: string[]) => {
  if (!ids.length) return {} as Record<string, CoinGeckoSimplePriceRow>;

  const unique = Array.from(new Set(ids)).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(unique)}&vs_currencies=brl`;
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`CoinGecko simple price falhou (${response.status})`);
  }
  const parsed = await response.json();
  return parsed as Record<string, CoinGeckoSimplePriceRow>;
};

export const fetchCoinGeckoHistory = async (coinId: string, days = 7) => {
  const safeDays = Math.max(1, Math.min(days, 30));
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=brl&days=${safeDays}`;
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`CoinGecko history falhou (${response.status})`);
  }
  const parsed = await response.json() as { prices?: Array<[number, number]> };
  const values = (parsed.prices || [])
    .map((item) => Number(item[1]))
    .filter((item) => Number.isFinite(item) && item > 0);

  if (!values.length) return [] as number[];

  const step = Math.max(1, Math.floor(values.length / safeDays));
  const sampled = values.filter((_value, index) => index % step === 0).slice(-safeDays);
  return sampled.length ? sampled : values.slice(-safeDays);
};
